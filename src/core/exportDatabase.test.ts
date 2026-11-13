import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportDatabaseToJsonZip } from './exportDatabase';
import { IsarDatabaseModel, CollectionData, DecodedRow } from './isarDatabase';
import { MdbxDatabase } from './mdbx';

function createMockDb(): IsarDatabaseModel {
  const usersRows: DecodedRow[] = [
    {
      id: 1n,
      idLabel: '1',
      fields: { name: 'Alice', age: 30, active: true },
      links: { teams: [10n, 20n] },
      rawBytes: new Uint8Array([1, 2, 3]),
    },
    {
      id: 2n,
      idLabel: '2',
      fields: { name: 'Bob', age: 25, active: false },
      links: {},
      rawBytes: new Uint8Array([4, 5, 6]),
    },
  ];

  const productsRows: DecodedRow[] = [
    {
      id: 101n,
      idLabel: '101',
      fields: { title: 'Laptop', price: 1299.99 },
      links: {},
      rawBytes: new Uint8Array([7, 8, 9]),
    },
  ];

  const usersCol: CollectionData = {
    schema: {
      name: 'Users',
      embedded: false,
      properties: [
        { name: 'name', type: 'String', target: null },
        { name: 'age', type: 'Long', target: null },
        { name: 'active', type: 'Bool', target: null },
      ],
      indexes: [],
      links: [{ name: 'teams', target: 'Teams' }],
    },
    rows: usersRows,
    rowById: new Map(usersRows.map((r) => [r.idLabel, r])),
    treeStats: null,
  };

  const productsCol: CollectionData = {
    schema: {
      name: 'Products',
      embedded: false,
      properties: [
        { name: 'title', type: 'String', target: null },
        { name: 'price', type: 'Double', target: null },
      ],
      indexes: [],
      links: [],
    },
    rows: productsRows,
    rowById: new Map(productsRows.map((r) => [r.idLabel, r])),
    treeStats: null,
  };

  return {
    fileName: 'test_database.isar',
    loadedAt: new Date('2026-01-01T00:00:00Z'),
    mdbx: {
      pagesize: 4096,
      fileSize: 32768,
      geometry: { size: 32768, minSize: 32768, maxSize: 1048576, growthStep: 65536, shrinkThreshold: 0 },
      activeMeta: { txnid: 42n, geometry: {} as any, dbs: [] },
      subDbs: new Map(),
    } as unknown as MdbxDatabase,
    collections: [usersCol, productsCol],
    embeddedSchemas: [],
    collectionMap: new Map([
      ['Users', usersCol],
      ['Products', productsCol],
    ]),
    totalRows: 3,
  };
}

describe('exportDatabaseToJsonZip', () => {
  it('exports all collections and _schema.json into a valid zip file', async () => {
    const db = createMockDb();
    const progressSpy = vi.fn();

    const result = await exportDatabaseToJsonZip(db, { pretty: true, includeSchema: true }, progressSpy);

    expect(result.filename).toBe('test_database-export.zip');
    expect(result.filesCount).toBe(3); // Users.json, Products.json, _schema.json
    expect(result.totalRows).toBe(3);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.blob.type).toBe('application/zip');

    // Verify progress callback was called
    expect(progressSpy).toHaveBeenCalled();

    // Verify unzipping and inspect files
    const arrayBuffer = await result.blob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(arrayBuffer));

    expect(Object.keys(unzipped).sort()).toEqual(['Products.json', 'Users.json', '_schema.json']);

    // Check Users.json content
    const usersJsonStr = strFromU8(unzipped['Users.json']);
    const usersData = JSON.parse(usersJsonStr);
    expect(usersData).toHaveLength(2);
    expect(usersData[0]).toEqual({
      id: 1,
      name: 'Alice',
      age: 30,
      active: true,
      '@link:teams': [10, 20],
    });
    expect(usersData[1]).toEqual({
      id: 2,
      name: 'Bob',
      age: 25,
      active: false,
    });

    // Check Products.json content
    const productsJsonStr = strFromU8(unzipped['Products.json']);
    const productsData = JSON.parse(productsJsonStr);
    expect(productsData).toHaveLength(1);
    expect(productsData[0]).toEqual({
      id: 101,
      title: 'Laptop',
      price: 1299.99,
    });

    // Check _schema.json content
    const schemaJsonStr = strFromU8(unzipped['_schema.json']);
    const schemaData = JSON.parse(schemaJsonStr);
    expect(schemaData.databaseName).toBe('test_database.isar');
    expect(schemaData.totalCollections).toBe(2);
    expect(schemaData.totalRows).toBe(3);
    expect(schemaData.collections).toHaveLength(2);
  });

  it('filters by selectedCollections and respects includeSchema: false', async () => {
    const db = createMockDb();
    const result = await exportDatabaseToJsonZip(db, {
      selectedCollections: ['Users'],
      includeSchema: false,
      filename: 'custom_users_only.zip',
    });

    expect(result.filename).toBe('custom_users_only.zip');
    expect(result.filesCount).toBe(1);
    expect(result.totalRows).toBe(2);

    const arrayBuffer = await result.blob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(arrayBuffer));

    expect(Object.keys(unzipped)).toEqual(['Users.json']);
    expect(unzipped['_schema.json']).toBeUndefined();
    expect(unzipped['Products.json']).toBeUndefined();
  });

  it('respects includeLinks: false option', async () => {
    const db = createMockDb();
    const result = await exportDatabaseToJsonZip(db, {
      selectedCollections: ['Users'],
      includeLinks: false,
      includeSchema: false,
    });

    const arrayBuffer = await result.blob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(arrayBuffer));
    const usersData = JSON.parse(strFromU8(unzipped['Users.json']));

    expect(usersData[0]['@link:teams']).toBeUndefined();
    expect(usersData[0].name).toBe('Alice');
  });
});
