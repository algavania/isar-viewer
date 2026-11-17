/**
 * MDBX binary repacker and modifier for Isar v3 (.isar) database files.
 *
 * Allows mutating (editing or deleting) rows in collections while preserving
 * MDBX ACID invariants, B-tree leaf structures, and metadata.
 */

import {
  MdbxDatabase,
  PAGE_FLAGS,
  MdbxRawEntry,
} from './mdbx';
import { encodeIsarObject, encodeIsarId } from './isarEncoder';
import {
  IsarRecord,
  PropertyLayout,
  decodeIsarId,
  computeLayout,
} from './isarDecoder';
import type { IsarDatabaseModel } from './isarDatabase';

export function getLayoutsMapFromDb(db: IsarDatabaseModel): Map<string, PropertyLayout[]> {
  const layouts = new Map<string, PropertyLayout[]>();
  for (const col of db.collections) {
    layouts.set(col.schema.name, computeLayout(col.schema));
  }
  for (const emb of db.embeddedSchemas) {
    layouts.set(emb.name, computeLayout(emb));
  }
  return layouts;
}

export function saveMutatedIsarDatabase(
  db: IsarDatabaseModel,
  mutations: RowMutation[]
): ArrayBuffer {
  if (!db.rawBuffer) {
    throw new Error('Database rawBuffer is missing.');
  }
  const layouts = getLayoutsMapFromDb(db);
  return applyDatabaseMutations(db.rawBuffer, db.mdbx, layouts, mutations);
}

export interface RowMutation {
  collection: string;
  id: bigint;
  action: 'edit' | 'delete';
  fields?: IsarRecord;
}

function compareKeys(a: Uint8Array, b: Uint8Array): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * Re-packs a single leaf page with the given entries.
 */
export function packLeafPage(
  pgno: number,
  txnid: bigint,
  entries: MdbxRawEntry[],
  pagesize: number,
  dupfixKsize = 0,
  flags: number = PAGE_FLAGS.P_LEAF
): Uint8Array {
  const page = new Uint8Array(pagesize);
  const view = new DataView(page.buffer);

  // Sort entries strictly in ascending order by key
  const sorted = [...entries].sort((a, b) => compareKeys(a.key, b.key));

  let curUpper = pagesize;
  const offsets: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const ksize = entry.key.length;
    const dsize = entry.value.length;
    const rawNodeSize = 8 + ksize + dsize;
    const nodeSize = rawNodeSize + (rawNodeSize % 2 !== 0 ? 1 : 0); // 2-byte alignment

    curUpper -= nodeSize;
    if (curUpper < 20 + sorted.length * 2) {
      throw new Error(`Leaf page ${pgno} overflow: entries exceed pagesize ${pagesize}`);
    }

    const pos = curUpper;
    view.setUint32(pos, dsize, true);
    page[pos + 4] = entry.nflags;
    page[pos + 5] = 0; // padding
    view.setUint16(pos + 6, ksize, true);
    page.set(entry.key, pos + 8);
    page.set(entry.value, pos + 8 + ksize);

    offsets.push(curUpper - 20); // relative to offset 20
  }

  // Header (20 bytes)
  view.setBigUint64(0, txnid, true);
  view.setUint16(8, dupfixKsize, true);
  view.setUint16(10, flags, true);
  view.setUint16(12, sorted.length * 2, true); // lower
  view.setUint16(14, curUpper, true); // upper
  view.setUint32(16, pgno, true);

  // Offset array
  for (let i = 0; i < offsets.length; i++) {
    view.setUint16(20 + i * 2, offsets[i], true);
  }

  return page;
}

/**
 * Applies mutations (edits and deletions) to an existing Isar MDBX database
 * and generates a new, valid .isar ArrayBuffer.
 */
export function applyDatabaseMutations(
  originalBuffer: ArrayBuffer,
  mdbx: MdbxDatabase,
  layoutsBySchema: Map<string, PropertyLayout[]>,
  mutations: RowMutation[]
): ArrayBuffer {
  if (mutations.length === 0) {
    return originalBuffer.slice(0);
  }

  const newBuffer = originalBuffer.slice(0);
  const bytes = new Uint8Array(newBuffer);
  const view = new DataView(newBuffer);
  const pagesize = mdbx.pagesize;
  const newTxnId = mdbx.activeMeta.txnid + 1n;

  // Track modified sub-databases
  const modifiedSubDbs = new Set<string>();

  for (const mut of mutations) {
    const colDb = mdbx.subDbs.get(mut.collection);
    if (!colDb) continue;

    const idKey = encodeIsarId(mut.id);

    if (mut.action === 'delete') {
      // 1. Remove from collection subDb
      const prevCount = colDb.entries.length;
      colDb.entries = colDb.entries.filter((e) => decodeIsarId(e.key) !== mut.id);
      if (colDb.entries.length !== prevCount) {
        modifiedSubDbs.add(mut.collection);
      }

      // 2. Remove from secondary index tables (_i_<Collection>_*)
      for (const [subDbName, subDb] of mdbx.subDbs.entries()) {
        if (subDbName.startsWith(`_i_${mut.collection}_`)) {
          const before = subDb.entries.length;
          // In index tables, entry.value is the 8-byte XORed ID (or contains it)
          subDb.entries = subDb.entries.filter((e) => {
            if (e.value.length === 8) {
              return decodeIsarId(e.value) !== mut.id;
            }
            return true;
          });
          if (subDb.entries.length !== before) {
            modifiedSubDbs.add(subDbName);
          }
        }
      }

      // 3. Remove from forward links (_l_<Collection>_*)
      for (const [subDbName, subDb] of mdbx.subDbs.entries()) {
        if (subDbName.startsWith(`_l_${mut.collection}_`)) {
          const before = subDb.entries.length;
          subDb.entries = subDb.entries.filter((e) => decodeIsarId(e.key) !== mut.id);
          if (subDb.entries.length !== before) {
            modifiedSubDbs.add(subDbName);
          }
        }
      }
    } else if (mut.action === 'edit' && mut.fields) {
      // Encode new IsarObject v2 buffer
      const newRawBytes = encodeIsarObject(mut.fields, mut.collection, layoutsBySchema);
      const existingIdx = colDb.entries.findIndex((e) => decodeIsarId(e.key) === mut.id);

      if (existingIdx >= 0) {
        colDb.entries[existingIdx].value = newRawBytes;
        modifiedSubDbs.add(mut.collection);
      } else {
        // New record insert if ID did not exist
        colDb.entries.push({
          key: idKey,
          value: newRawBytes,
          nflags: 0,
        });
        modifiedSubDbs.add(mut.collection);
      }
    }
  }

  // Re-pack leaf pages for all modified sub-databases
  for (const subDbName of modifiedSubDbs) {
    const subDb = mdbx.subDbs.get(subDbName);
    if (!subDb || subDb.tree.root === 0xffffffff) continue;

    const rootPgno = subDb.tree.root;
    const packedPage = packLeafPage(
      rootPgno,
      newTxnId,
      subDb.entries,
      pagesize,
      subDb.tree.dupfixSize,
      subDb.tree.flags & 0x04 ? (PAGE_FLAGS.P_LEAF | PAGE_FLAGS.P_DUPFIX) : PAGE_FLAGS.P_LEAF
    );

    // Overwrite the page in buffer
    bytes.set(packedPage, rootPgno * pagesize);

    // Update the subDb entry in the main B-tree page
    const mainRootPgno = mdbx.activeMeta.main.root;
    const mainOff = mainRootPgno * pagesize;
    const mainCount = view.getUint16(mainOff + 12, true) >> 1;
    const textDecoder = new TextDecoder('utf-8');

    for (let i = 0; i < mainCount; i++) {
      const e = view.getUint16(mainOff + 20 + i * 2, true);
      const pos = mainOff + 20 + e;
      const ksize = view.getUint16(pos + 6, true);
      const name = textDecoder.decode(bytes.subarray(pos + 8, pos + 8 + ksize));

      if (name === subDbName) {
        const valPos = pos + 8 + ksize;
        // Update items (uint64 at valPos + 32)
        view.setBigUint64(valPos + 32, BigInt(subDb.entries.length), true);
        // Update modTxnid (uint64 at valPos + 40)
        view.setBigUint64(valPos + 40, newTxnId, true);
        break;
      }
    }
  }

  // Update main root page header txnid
  const mainOff = mdbx.activeMeta.main.root * pagesize;
  view.setBigUint64(mainOff, newTxnId, true);

  // Commit to next meta page slot in 3-page meta ring
  const nextMetaIndex = (mdbx.activeMeta.index + 1) % 3;
  const activeMetaOff = mdbx.activeMeta.index * pagesize;
  const nextMetaOff = nextMetaIndex * pagesize;

  // Copy active meta page to next meta slot
  bytes.set(bytes.subarray(activeMetaOff, activeMetaOff + pagesize), nextMetaOff);

  // Re-sign transaction IDs in the new meta page
  view.setBigUint64(nextMetaOff, newTxnId, true); // page header txnid
  view.setBigUint64(nextMetaOff + 0x1c, newTxnId, true); // txnidA
  view.setBigUint64(nextMetaOff + 0xc4, newTxnId, true); // txnidB
  view.setBigUint64(nextMetaOff + 0x6c + 40, newTxnId, true); // main.modTxnid

  return newBuffer;
}
