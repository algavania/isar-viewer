import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIsarFile, queryRows, exportRowsToCsv } from './isarDatabase';
import {
  computeLayout,
  decodeIsarId,
  decodeIsarObject,
  IsarCollectionSchema,
} from './isarDecoder';

function loadBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Isar MDBX + IsarObject v2 parser', () => {
  it('parses public/sample.isar with all collections, embedded objects, and links', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const db = parseIsarFile(loadBuffer(samplePath), 'sample.isar');

    expect(db.collections.map((c) => c.schema.name)).toEqual([
      'Project',
      'Tag',
      'Task',
      'User',
    ]);
    expect(db.embeddedSchemas.map((s) => s.name)).toEqual(['Attachment', 'GeoPoint']);

    const users = db.collectionMap.get('User')!;
    expect(users.rows).toHaveLength(4);
    const rafi = users.rowById.get('1')!;
    expect(rafi.fields.username).toBe('rafi');
    expect(rafi.fields.isActive).toBe(true);
    expect(rafi.fields.age).toBe(27);
    expect(rafi.fields.rating).toBeCloseTo(4.95);
    expect(rafi.fields.skills).toEqual(['Flutter', 'Dart', 'Rust', 'TypeScript']);
    expect(rafi.fields.avatarHash).toBeInstanceOf(Uint8Array);
    expect((rafi.fields.avatarHash as Uint8Array).length).toBe(12);
    expect(rafi.fields.location).toEqual({
      lat: -6.2088,
      lng: 106.8456,
      city: 'Jakarta',
    });

    const sinta = users.rowById.get('4')!;
    expect(sinta.fields.isActive).toBe(false);
    expect(sinta.fields.location).toBeNull();
    expect(sinta.fields.avatarHash).toBeNull();

    const tasks = db.collectionMap.get('Task')!;
    expect(tasks.rows).toHaveLength(48);
    const task1 = tasks.rowById.get('1')!;
    expect(task1.links.project).toEqual([1n]);
    expect(task1.links.assignee).toEqual([1n]);
    expect(task1.links.tags).toEqual([1n]);
    expect(task1.fields.attachments).toEqual([
      { filename: 'spec_1.pdf', sizeBytes: 246024, mime: 'application/pdf' },
      { filename: 'preview_1.png', sizeBytes: 84120, mime: 'image/png' },
    ]);

    const filtered = queryRows(tasks.rows, 'done', [], { field: '__id__', direction: 'desc' });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].id).toBeGreaterThan(filtered[filtered.length - 1].id);

    const csv = exportRowsToCsv(users.schema, users.rows);
    expect(csv.split('\n')).toHaveLength(5);
  });

  it('decodes signed 64-bit Isar ID keys including negative IDs', () => {
    // -42 ^ 0x8000000000000000n -> little-endian bytes d6ffffffffffff7f
    const negBytes = new Uint8Array([0xd6, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]);
    expect(decodeIsarId(negBytes)).toBe(-42n);

    const posBytes = new Uint8Array([0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80]);
    expect(decodeIsarId(posBytes)).toBe(10n);
  });

  it('handles deleted property tombstones and older record staticSize during schema migration', () => {
    const schema: IsarCollectionSchema = {
      name: 'Migrated',
      embedded: false,
      properties: [
        { name: 'flag', type: 'Bool', target: null },
        { name: null, type: 'Int', target: null }, // deleted tombstone (4 bytes)
        { name: 'score', type: 'Int', target: null },
        { name: 'addedLater', type: 'String', target: null }, // beyond staticSize of old record
      ],
      indexes: [],
      links: [],
    };

    const layouts = new Map([[schema.name, computeLayout(schema)]]);
    // Old record: staticSize = 2 + 1 (flag) + 4 (deleted) + 4 (score) = 11
    const buf = new Uint8Array(11);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, 11, true);
    buf[2] = 2; // true
    dv.setInt32(3, 999, true); // deleted tombstone slot
    dv.setInt32(7, 42, true); // score

    const decoded = decodeIsarObject(buf, 'Migrated', layouts);
    expect(decoded.flag).toBe(true);
    expect(decoded.score).toBe(42);
    expect(decoded.addedLater).toBeNull();
    expect(Object.keys(decoded)).toEqual(['flag', 'score', 'addedLater']);
  });
});
