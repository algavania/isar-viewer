import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIsarFile } from './isarDatabase';
import { saveMutatedIsarDatabase } from './mdbxModifier';

function loadBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('MDBX Database Modifier & Repacker', () => {
  it('successfully deletes a row and produces a valid .isar database', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const origBuf = loadBuffer(samplePath);
    const db = parseIsarFile(origBuf, 'sample.isar');

    const usersBefore = db.collectionMap.get('User')!;
    expect(usersBefore.rows).toHaveLength(4);
    expect(usersBefore.rowById.has('4')).toBe(true);

    // Apply deletion of user with ID 4 (sinta)
    const modifiedBuf = saveMutatedIsarDatabase(db, [
      {
        collection: 'User',
        id: 4n,
        action: 'delete',
      },
    ]);

    // Parse the newly generated .isar buffer
    const newDb = parseIsarFile(modifiedBuf, 'sample-modified.isar');

    const usersAfter = newDb.collectionMap.get('User')!;
    expect(usersAfter.rows).toHaveLength(3);
    expect(usersAfter.rowById.has('4')).toBe(false);
    expect(usersAfter.rowById.has('1')).toBe(true);
    expect(usersAfter.rowById.has('2')).toBe(true);
    expect(usersAfter.rowById.has('3')).toBe(true);

    // Verify other collections are completely untouched
    const tasks = newDb.collectionMap.get('Task')!;
    expect(tasks.rows).toHaveLength(48);

    // Verify transaction ID was incremented
    expect(newDb.mdbx.activeMeta.txnid).toBe(db.mdbx.activeMeta.txnid + 1n);
  });

  it('successfully edits a row and produces a valid .isar database with updated values', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const origBuf = loadBuffer(samplePath);
    const db = parseIsarFile(origBuf, 'sample.isar');

    const users = db.collectionMap.get('User')!;
    const user1 = users.rowById.get('1')!;

    // Edit user 1
    const modifiedFields = {
      ...user1.fields,
      username: 'alga_dev',
      age: 30,
      rating: 5.0,
      skills: ['Flutter', 'TypeScript', 'Rust'],
    };

    const modifiedBuf = saveMutatedIsarDatabase(db, [
      {
        collection: 'User',
        id: 1n,
        action: 'edit',
        fields: modifiedFields,
      },
    ]);

    const newDb = parseIsarFile(modifiedBuf, 'sample-modified.isar');
    const updatedUsers = newDb.collectionMap.get('User')!;
    const updatedUser1 = updatedUsers.rowById.get('1')!;

    expect(updatedUser1.fields.username).toBe('alga_dev');
    expect(updatedUser1.fields.age).toBe(30);
    expect(updatedUser1.fields.rating).toBeCloseTo(5.0);
    expect(updatedUser1.fields.skills).toEqual(['Flutter', 'TypeScript', 'Rust']);
    expect(updatedUser1.fields.location).toEqual(user1.fields.location);
  });

  it('handles multiple combined mutations across multiple collections', () => {
    const samplePath = fileURLToPath(new URL('../../public/sample.isar', import.meta.url));
    const origBuf = loadBuffer(samplePath);
    const db = parseIsarFile(origBuf, 'sample.isar');

    const tasksBefore = db.collectionMap.get('Task')!;
    const usersBefore = db.collectionMap.get('User')!;
    const user2Before = usersBefore.rowById.get('2')!;

    const modifiedBuf = saveMutatedIsarDatabase(db, [
      {
        collection: 'Task',
        id: 1n,
        action: 'delete',
      },
      {
        collection: 'User',
        id: 2n,
        action: 'edit',
        fields: {
          ...user2Before.fields,
          username: 'nadia_edited',
          age: 29,
          isActive: true,
        },
      },
      {
        collection: 'User',
        id: 4n,
        action: 'delete',
      },
    ]);

    const newDb = parseIsarFile(modifiedBuf, 'sample-modified.isar');

    // 1 task deleted
    const tasksAfter = newDb.collectionMap.get('Task')!;
    expect(tasksAfter.rows).toHaveLength(tasksBefore.rows.length - 1);
    expect(tasksAfter.rowById.has('1')).toBe(false);

    // 1 user deleted, 1 user edited
    const usersAfter = newDb.collectionMap.get('User')!;
    expect(usersAfter.rows).toHaveLength(usersBefore.rows.length - 1);
    expect(usersAfter.rowById.has('4')).toBe(false);

    const user2After = usersAfter.rowById.get('2')!;
    expect(user2After.fields.username).toBe('nadia_edited');
    expect(user2After.fields.age).toBe(29);
    expect(user2After.fields.isActive).toBe(true);

    // Other collections untouched
    expect(newDb.collectionMap.get('Project')!.rows).toHaveLength(3);
    expect(newDb.collectionMap.get('Tag')!.rows).toHaveLength(5);
  });
});
