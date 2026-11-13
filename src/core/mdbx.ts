/**
 * Pure TypeScript read-only MDBX v0.13.x parser for Isar v3 (.isar) database files.
 *
 * Supports arbitrary page sizes (4KB, 8KB, 16KB, 64KB), multi-level B-trees
 * (P_BRANCH / P_LEAF), overflow/large values (N_BIG), sub-databases (N_SUB),
 * and dup-sorted link tables (N_DUP inline sub-pages & P_DUPFIX sub-trees).
 */

export const MDBX_INVALID_PGNO = 0xffffffff;
const MDBX_MAGIC_PREFIX = 0x59659dbdef4c11n;

export const PAGE_FLAGS = {
  P_BRANCH: 0x01,
  P_LEAF: 0x02,
  P_LARGE: 0x04,
  P_META: 0x08,
  P_DUPFIX: 0x20,
  P_SUBP: 0x40,
} as const;

export const NODE_FLAGS = {
  N_BIG: 0x01,
  N_SUB: 0x02,
  N_DUP: 0x04,
} as const;

export interface MdbxTreeInfo {
  flags: number;
  height: number;
  dupfixSize: number;
  root: number;
  branchPages: number;
  leafPages: number;
  largePages: number;
  sequence: bigint;
  items: bigint;
  modTxnid: bigint;
}

export interface MdbxMetaInfo {
  index: number;
  txnid: bigint;
  pagesize: number;
  gc: MdbxTreeInfo;
  main: MdbxTreeInfo;
  valid: boolean;
}

export interface MdbxRawEntry {
  key: Uint8Array;
  value: Uint8Array;
  nflags: number;
  /** For N_DUP entries, all duplicate values decoded from subpage or subtree. */
  dups?: Uint8Array[];
}

export interface MdbxSubDb {
  name: string;
  tree: MdbxTreeInfo;
  entries: MdbxRawEntry[];
}

export interface MdbxDatabase {
  fileSize: number;
  pagesize: number;
  activeMeta: MdbxMetaInfo;
  metas: MdbxMetaInfo[];
  subDbs: Map<string, MdbxSubDb>;
}

const textDecoder = new TextDecoder('utf-8');

function readTree(view: DataView, offset: number): MdbxTreeInfo {
  return {
    flags: view.getUint16(offset, true),
    height: view.getUint16(offset + 2, true),
    dupfixSize: view.getUint32(offset + 4, true),
    root: view.getUint32(offset + 8, true),
    branchPages: view.getUint32(offset + 12, true),
    leafPages: view.getUint32(offset + 16, true),
    largePages: view.getUint32(offset + 20, true),
    sequence: view.getBigUint64(offset + 24, true),
    items: view.getBigUint64(offset + 32, true),
    modTxnid: view.getBigUint64(offset + 40, true),
  };
}

function readMeta(bytes: Uint8Array, view: DataView, index: number, pagesize: number): MdbxMetaInfo | null {
  const off = index * pagesize;
  if (off + 0xd0 > bytes.length) return null;

  const pflags = view.getUint16(off + 0x0a, true);
  if ((pflags & PAGE_FLAGS.P_META) === 0) return null;

  const magicAndVer = view.getBigUint64(off + 0x14, true);
  if (magicAndVer >> 8n !== MDBX_MAGIC_PREFIX) return null;

  const txnidA = view.getBigUint64(off + 0x1c, true);
  const txnidB = view.getBigUint64(off + 0xc4, true);
  const metaPagesize = view.getUint32(off + 0x40, true);
  const gc = readTree(view, off + 0x3c);
  const main = readTree(view, off + 0x6c);

  return {
    index,
    txnid: txnidA,
    pagesize: metaPagesize,
    gc,
    main,
    valid: txnidA > 0n && txnidA === txnidB,
  };
}

/**
 * Parses an MDBX buffer into its active metadata and named sub-databases.
 */
export function parseMdbx(buffer: ArrayBuffer): MdbxDatabase {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4096) {
    throw new Error('File is too small to be a valid .isar (MDBX) database.');
  }

  // Detect SQLite header (Isar v4 SQLite engine) to give an actionable message.
  const headerAscii = textDecoder.decode(bytes.subarray(0, 15));
  if (headerAscii === 'SQLite format 3') {
    throw new Error(
      'This .isar file uses SQLite format (Isar v4 SQLite engine), not MDBX (Isar v3). You can open it directly with any SQLite viewer.'
    );
  }

  const view = new DataView(buffer);
  const magic0 = view.getBigUint64(0x14, true);
  if (magic0 >> 8n !== MDBX_MAGIC_PREFIX) {
    throw new Error('Invalid file signature: not an Isar v3 / MDBX database.');
  }

  const pagesize = view.getUint32(0x40, true);
  if (pagesize < 256 || pagesize > 65536 || (pagesize & (pagesize - 1)) !== 0) {
    throw new Error(`Unsupported MDBX page size: ${pagesize}`);
  }

  const metas: MdbxMetaInfo[] = [];
  for (let i = 0; i < 3; i++) {
    const m = readMeta(bytes, view, i, pagesize);
    if (m) metas.push(m);
  }

  const validMetas = metas.filter((m) => m.valid);
  if (validMetas.length === 0) {
    throw new Error('No valid committed MDBX meta page found (database may be empty or corrupted).');
  }

  validMetas.sort((a, b) => (a.txnid > b.txnid ? -1 : a.txnid < b.txnid ? 1 : 0));
  const activeMeta = validMetas[0];

  const readDupPageOrTree = (tree: MdbxTreeInfo): Uint8Array[] => {
    const out: Uint8Array[] = [];
    const walkDup = (pgno: number) => {
      if (pgno === MDBX_INVALID_PGNO) return;
      const off = pgno * pagesize;
      if (off + 20 > bytes.length) return;
      const dupfixKsize = view.getUint16(off + 8, true);
      const flags = view.getUint16(off + 10, true);
      const lower = view.getUint16(off + 12, true);

      if (flags & PAGE_FLAGS.P_DUPFIX) {
        const count = lower >> 1;
        const step = dupfixKsize || tree.dupfixSize;
        for (let i = 0; i < count; i++) {
          const start = off + 20 + i * step;
          out.push(bytes.subarray(start, start + step));
        }
        return;
      }

      const n = lower >> 1;
      if (flags & PAGE_FLAGS.P_BRANCH) {
        for (let i = 0; i < n; i++) {
          const e = view.getUint16(off + 20 + i * 2, true);
          const childPgno = view.getUint32(off + 20 + e, true);
          walkDup(childPgno);
        }
      } else if (flags & PAGE_FLAGS.P_LEAF) {
        for (let i = 0; i < n; i++) {
          const e = view.getUint16(off + 20 + i * 2, true);
          const pos = off + 20 + e;
          const ksize = view.getUint16(pos + 6, true);
          out.push(bytes.subarray(pos + 8, pos + 8 + ksize));
        }
      }
    };
    walkDup(tree.root);
    return out;
  };

  const readSubPageDups = (subBytes: Uint8Array, dupfixSize: number): Uint8Array[] => {
    if (subBytes.length < 20) return [];
    const sv = new DataView(subBytes.buffer, subBytes.byteOffset, subBytes.byteLength);
    const sDupfix = sv.getUint16(8, true);
    const sFlags = sv.getUint16(10, true);
    const sLower = sv.getUint16(12, true);
    const count = sLower >> 1;
    const out: Uint8Array[] = [];

    if (sFlags & PAGE_FLAGS.P_DUPFIX) {
      const step = sDupfix || dupfixSize;
      for (let i = 0; i < count; i++) {
        const start = 20 + i * step;
        out.push(subBytes.subarray(start, start + step));
      }
    } else if (sFlags & PAGE_FLAGS.P_LEAF) {
      for (let i = 0; i < count; i++) {
        const e = sv.getUint16(20 + i * 2, true);
        const pos = 20 + e;
        const ksize = sv.getUint16(pos + 6, true);
        out.push(subBytes.subarray(pos + 8, pos + 8 + ksize));
      }
    }
    return out;
  };

  const walkTree = (rootPgno: number, dupfixSize = 0): MdbxRawEntry[] => {
    if (rootPgno === MDBX_INVALID_PGNO) return [];
    const entries: MdbxRawEntry[] = [];

    const visit = (pgno: number) => {
      if (pgno === MDBX_INVALID_PGNO) return;
      const off = pgno * pagesize;
      if (off + 20 > bytes.length) {
        throw new Error(`Page ${pgno} exceeds file bounds.`);
      }

      const flags = view.getUint16(off + 10, true);
      const lower = view.getUint16(off + 12, true);
      const count = lower >> 1;

      if (flags & PAGE_FLAGS.P_BRANCH) {
        for (let i = 0; i < count; i++) {
          const e = view.getUint16(off + 20 + i * 2, true);
          const childPgno = view.getUint32(off + 20 + e, true);
          visit(childPgno);
        }
      } else if (flags & PAGE_FLAGS.P_LEAF) {
        for (let i = 0; i < count; i++) {
          const e = view.getUint16(off + 20 + i * 2, true);
          const pos = off + 20 + e;
          const dsize = view.getUint32(pos, true);
          const nflags = bytes[pos + 4];
          const ksize = view.getUint16(pos + 6, true);
          const key = bytes.subarray(pos + 8, pos + 8 + ksize);
          const dataStart = pos + 8 + ksize;

          let value: Uint8Array;
          if (nflags & NODE_FLAGS.N_BIG) {
            const bigPgno = view.getUint32(dataStart, true);
            const bigStart = bigPgno * pagesize + 20;
            value = bytes.subarray(bigStart, bigStart + dsize);
          } else {
            value = bytes.subarray(dataStart, dataStart + dsize);
          }

          let dups: Uint8Array[] | undefined;
          if (nflags & NODE_FLAGS.N_DUP) {
            if (nflags & NODE_FLAGS.N_SUB) {
              const dv = new DataView(value.buffer, value.byteOffset, value.byteLength);
              const subTree = readTree(dv, 0);
              dups = readDupPageOrTree(subTree);
            } else {
              dups = readSubPageDups(value, dupfixSize);
            }
          }

          entries.push({ key, value, nflags, dups });
        }
      }
    };

    visit(rootPgno);
    return entries;
  };

  const mainEntries = walkTree(activeMeta.main.root);
  const subDbs = new Map<string, MdbxSubDb>();

  for (const entry of mainEntries) {
    if ((entry.nflags & NODE_FLAGS.N_SUB) === 0 || entry.value.length < 48) continue;
    const name = textDecoder.decode(entry.key);
    const tv = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);
    const tree = readTree(tv, 0);
    const isDupTree = (tree.flags & 0x04) !== 0; // MDBX_DUPSORT
    const entries = walkTree(tree.root, isDupTree ? tree.dupfixSize : 0);
    subDbs.set(name, { name, tree, entries });
  }

  return {
    fileSize: bytes.length,
    pagesize,
    activeMeta,
    metas,
    subDbs,
  };
}
