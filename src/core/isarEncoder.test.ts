import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIsarFile } from './isarDatabase';
import { encodeIsarObject, encodeIsarId } from './isarEncoder';
import { decodeIsarObject, decodeIsarId, computeLayout, PropertyLayout } from './isarDecoder';

function loadBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('IsarObject v2 Encoder', () => {
  it('correctly roundtrips encodeIsarId and decodeIsarId', () => {
    expect(decodeIsarId(encodeIsarId(0n))).toBe(0n);
    expect(decodeIsarId(encodeIsarId(1n))).toBe(1n);
    expect(decodeIsarId(encodeIsarId(123456789012345n))).toBe(123456789012345n);
    expect(decodeIsarId(encodeIsarId(-1n))).toBe(-1n);
    expect(decodeIsarId(encodeIsarId(-42n))).toBe(-42n);
    expect(decodeIsarId(encodeIsarId(-9223372036854775807n))).toBe(-9223372036854775807n);
  });

  it('encodes and decodes every row in sample.isar with 100% fidelity', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const db = parseIsarFile(loadBuffer(samplePath), 'sample.isar');

    const layoutsBySchema = new Map<string, PropertyLayout[]>();
    for (const col of db.collections) {
      layoutsBySchema.set(col.schema.name, computeLayout(col.schema));
    }
    for (const emb of db.embeddedSchemas) {
      layoutsBySchema.set(emb.name, computeLayout(emb));
    }

    for (const col of db.collections) {
      for (const row of col.rows) {
        // Re-encode row.fields
        const encoded = encodeIsarObject(row.fields, col.schema.name, layoutsBySchema);
        expect(encoded.length).toBeGreaterThan(0);

        // Decode back
        const decoded = decodeIsarObject(encoded, col.schema.name, layoutsBySchema);

        // Verify keys match
        expect(Object.keys(decoded).sort()).toEqual(Object.keys(row.fields).sort());

        // Verify values match
        for (const [k, v] of Object.entries(row.fields)) {
          if (v instanceof Uint8Array) {
            expect(Array.from(decoded[k] as Uint8Array)).toEqual(Array.from(v));
          } else if (typeof v === 'number' && typeof decoded[k] === 'number') {
            expect(decoded[k]).toBeCloseTo(v, 4);
          } else {
            expect(decoded[k]).toEqual(v);
          }
        }
      }
    }
  });

  it('handles modifications: updating fields and re-decoding', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const db = parseIsarFile(loadBuffer(samplePath), 'sample.isar');

    const layoutsBySchema = new Map<string, PropertyLayout[]>();
    for (const col of db.collections) {
      layoutsBySchema.set(col.schema.name, computeLayout(col.schema));
    }
    for (const emb of db.embeddedSchemas) {
      layoutsBySchema.set(emb.name, computeLayout(emb));
    }

    const users = db.collectionMap.get('User')!;
    const user1 = users.rowById.get('1')!;

    const modified = {
      ...user1.fields,
      username: 'super_flutter_dev',
      age: 35,
      rating: 5.0,
      isActive: false,
      skills: ['Flutter', 'Rust', 'AI'],
    };

    const encoded = encodeIsarObject(modified, 'User', layoutsBySchema);
    const decoded = decodeIsarObject(encoded, 'User', layoutsBySchema);

    expect(decoded.username).toBe('super_flutter_dev');
    expect(decoded.age).toBe(35);
    expect(decoded.rating).toBeCloseTo(5.0);
    expect(decoded.isActive).toBe(false);
    expect(decoded.skills).toEqual(['Flutter', 'Rust', 'AI']);
    expect(decoded.location).toEqual(user1.fields.location);
  });
});
