/**
 * High-level Isar Database loader, query/filter/sort engine, and export helpers.
 */

import { parseMdbx, MdbxDatabase, MdbxSubDb } from './mdbx';
import {
  computeLayout,
  decodeIsarId,
  decodeIsarObject,
  IsarCollectionSchema,
  IsarRecord,
  IsarValue,
  PropertyLayout,
} from './isarDecoder';

export interface DecodedRow {
  id: bigint;
  idLabel: string;
  fields: IsarRecord;
  links: Record<string, bigint[]>;
  rawBytes: Uint8Array;
}

export interface CollectionData {
  schema: IsarCollectionSchema;
  rows: DecodedRow[];
  rowById: Map<string, DecodedRow>;
  treeStats: MdbxSubDb['tree'] | null;
}

export interface IsarDatabaseModel {
  fileName: string;
  loadedAt: Date;
  mdbx: MdbxDatabase;
  collections: CollectionData[];
  embeddedSchemas: IsarCollectionSchema[];
  collectionMap: Map<string, CollectionData>;
  totalRows: number;
}

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_null'
  | 'not_null';

export interface ColumnFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

const utf8Decoder = new TextDecoder('utf-8');

export function formatId(id: bigint): string {
  return id.toString();
}

export function isLikelyMicrosTimestamp(val: IsarValue): boolean {
  if (typeof val === 'number') {
    // 2000-01-01 to 2100-01-01 in microseconds
    return Number.isInteger(val) && val >= 946684800_000_000 && val <= 4102444800_000_000;
  }
  if (typeof val === 'bigint') {
    return val >= 946684800_000_000n && val <= 4102444800_000_000n;
  }
  return false;
}

export function formatMicrosToDate(val: number | bigint): string {
  const ms = typeof val === 'bigint' ? Number(val / 1000n) : Math.floor(val / 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export function parseIsarFile(buffer: ArrayBuffer, fileName: string): IsarDatabaseModel {
  const mdbx = parseMdbx(buffer);
  const infoDb = mdbx.subDbs.get('_info');
  if (!infoDb) {
    throw new Error('Missing "_info" metadata table in MDBX file. Is this a valid Isar v3 file?');
  }

  const schemas: IsarCollectionSchema[] = [];
  const layoutsBySchema = new Map<string, PropertyLayout[]>();

  for (const entry of infoDb.entries) {
    const jsonText = utf8Decoder.decode(entry.value);
    const schema = JSON.parse(jsonText) as IsarCollectionSchema;
    schemas.push(schema);
    layoutsBySchema.set(schema.name, computeLayout(schema));
  }

  const collections: CollectionData[] = [];
  const embeddedSchemas: IsarCollectionSchema[] = [];
  const collectionMap = new Map<string, CollectionData>();
  let totalRows = 0;

  for (const schema of schemas) {
    if (schema.embedded) {
      embeddedSchemas.push(schema);
      continue;
    }

    const colDb = mdbx.subDbs.get(schema.name);
    const linkMaps: Record<string, Map<string, bigint[]>> = {};

    for (const link of schema.links) {
      const lMap = new Map<string, bigint[]>();
      const linkDb = mdbx.subDbs.get(`_l_${schema.name}_${link.name}`);
      if (linkDb) {
        for (const le of linkDb.entries) {
          const srcId = decodeIsarId(le.key).toString();
          const targets = le.dups
            ? le.dups.map((d) => decodeIsarId(d))
            : [decodeIsarId(le.value)];
          lMap.set(srcId, targets);
        }
      }
      linkMaps[link.name] = lMap;
    }

    const rows: DecodedRow[] = [];
    const rowById = new Map<string, DecodedRow>();

    if (colDb) {
      for (const entry of colDb.entries) {
        const id = decodeIsarId(entry.key);
        const idStr = id.toString();
        const fields = decodeIsarObject(entry.value, schema.name, layoutsBySchema);
        const links: Record<string, bigint[]> = {};
        for (const link of schema.links) {
          links[link.name] = linkMaps[link.name]?.get(idStr) ?? [];
        }
        const row: DecodedRow = {
          id,
          idLabel: idStr,
          fields,
          links,
          rawBytes: entry.value,
        };
        rows.push(row);
        rowById.set(idStr, row);
      }
    }

    totalRows += rows.length;
    const colData: CollectionData = {
      schema,
      rows,
      rowById,
      treeStats: colDb?.tree ?? null,
    };
    collections.push(colData);
    collectionMap.set(schema.name, colData);
  }

  collections.sort((a, b) => a.schema.name.localeCompare(b.schema.name));
  embeddedSchemas.sort((a, b) => a.name.localeCompare(b.name));

  return {
    fileName,
    loadedAt: new Date(),
    mdbx,
    collections,
    embeddedSchemas,
    collectionMap,
    totalRows,
  };
}

export function serializeValueForJson(val: IsarValue): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') {
    return val >= BigInt(Number.MIN_SAFE_INTEGER) && val <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(val)
      : val.toString();
  }
  if (val instanceof Uint8Array) {
    return Array.from(val);
  }
  if (Array.isArray(val)) {
    return val.map(serializeValueForJson);
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeValueForJson(v);
    }
    return out;
  }
  return val;
}

export function rowToPlainJson(row: DecodedRow, includeLinks = true): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: serializeValueForJson(row.id),
  };
  for (const [k, v] of Object.entries(row.fields)) {
    out[k] = serializeValueForJson(v);
  }
  if (includeLinks && Object.keys(row.links).length > 0) {
    for (const [linkName, ids] of Object.entries(row.links)) {
      out[`@link:${linkName}`] = ids.map((id) => serializeValueForJson(id));
    }
  }
  return out;
}

function valueToSearchText(val: IsarValue): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Uint8Array) return `bytes(${val.length})`;
  if (Array.isArray(val)) return val.map(valueToSearchText).join(' ');
  if (typeof val === 'object') return Object.values(val).map(valueToSearchText).join(' ');
  return String(val);
}

function getRowFieldValue(row: DecodedRow, field: string): IsarValue {
  if (field === '__id__') return row.id;
  if (field.startsWith('__link__:')) {
    const linkName = field.slice('__link__:'.length);
    return row.links[linkName] ?? [];
  }
  return row.fields[field] ?? null;
}

function compareValues(a: IsarValue, b: IsarValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length;
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length - b.length;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function matchesFilter(row: DecodedRow, filter: ColumnFilter): boolean {
  const val = getRowFieldValue(row, filter.field);
  if (filter.operator === 'is_null') return val === null || val === undefined;
  if (filter.operator === 'not_null') return val !== null && val !== undefined;

  if (val === null || val === undefined) return false;
  const query = filter.value.trim();

  if (filter.operator === 'contains') {
    return valueToSearchText(val).toLowerCase().includes(query.toLowerCase());
  }

  if (typeof val === 'number' || typeof val === 'bigint') {
    const numQ = Number(query);
    if (Number.isNaN(numQ)) return false;
    const numVal = typeof val === 'bigint' ? Number(val) : val;
    switch (filter.operator) {
      case 'equals':
        return typeof val === 'bigint' ? val.toString() === query : val === numQ;
      case 'not_equals':
        return typeof val === 'bigint' ? val.toString() !== query : val !== numQ;
      case 'gt':
        return numVal > numQ;
      case 'gte':
        return numVal >= numQ;
      case 'lt':
        return numVal < numQ;
      case 'lte':
        return numVal <= numQ;
    }
  }

  const strVal = valueToSearchText(val);
  const cmp = strVal.localeCompare(query, undefined, { sensitivity: 'base' });
  switch (filter.operator) {
    case 'equals':
      return strVal.toLowerCase() === query.toLowerCase();
    case 'not_equals':
      return strVal.toLowerCase() !== query.toLowerCase();
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    default:
      return false;
  }
}

export function queryRows(
  rows: DecodedRow[],
  globalSearch: string,
  filters: ColumnFilter[],
  sort: SortConfig | null
): DecodedRow[] {
  const searchLower = globalSearch.trim().toLowerCase();

  let result = rows.filter((row) => {
    for (const f of filters) {
      if (!matchesFilter(row, f)) return false;
    }
    if (!searchLower) return true;
    if (row.idLabel.toLowerCase().includes(searchLower)) return true;
    for (const v of Object.values(row.fields)) {
      if (valueToSearchText(v).toLowerCase().includes(searchLower)) return true;
    }
    for (const ids of Object.values(row.links)) {
      if (ids.some((id) => id.toString().includes(searchLower))) return true;
    }
    return false;
  });

  if (sort && sort.direction) {
    const dir = sort.direction === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      const va = getRowFieldValue(a, sort.field);
      const vb = getRowFieldValue(b, sort.field);
      return compareValues(va, vb) * dir;
    });
  }

  return result;
}

export function exportRowsToCsv(schema: IsarCollectionSchema, rows: DecodedRow[]): string {
  const headers = [
    'id',
    ...schema.properties.filter((p) => p.name !== null).map((p) => p.name as string),
    ...schema.links.map((l) => `link:${l.name}`),
  ];

  const escapeCsv = (s: string) => {
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    const cells: string[] = [row.idLabel];
    for (const prop of schema.properties) {
      if (!prop.name) continue;
      const v = row.fields[prop.name];
      if (v === null || v === undefined) {
        cells.push('');
      } else if (v instanceof Uint8Array) {
        cells.push(Array.from(v, (b) => b.toString(16).padStart(2, '0')).join(' '));
      } else if (typeof v === 'object') {
        cells.push(JSON.stringify(serializeValueForJson(v)));
      } else {
        cells.push(String(v));
      }
    }
    for (const link of schema.links) {
      cells.push((row.links[link.name] ?? []).map((id) => id.toString()).join(';'));
    }
    lines.push(cells.map(escapeCsv).join(','));
  }

  return lines.join('\n');
}

export function generateDartModelCode(schema: IsarCollectionSchema): string {
  const mapType = (type: string, target: string | null): string => {
    switch (type) {
      case 'Bool':
        return 'bool?';
      case 'Byte':
        return 'byte';
      case 'Int':
        return 'int?';
      case 'Float':
        return 'float?';
      case 'Long':
        return 'int?';
      case 'Double':
        return 'double?';
      case 'DateTime':
        return 'DateTime?';
      case 'String':
        return 'String?';
      case 'Object':
        return `${target ?? 'dynamic'}?`;
      case 'BoolList':
        return 'List<bool>?';
      case 'ByteList':
        return 'List<byte>?';
      case 'IntList':
        return 'List<int>?';
      case 'FloatList':
        return 'List<float>?';
      case 'LongList':
        return 'List<int>?';
      case 'DoubleList':
        return 'List<double>?';
      case 'DateTimeList':
        return 'List<DateTime>?';
      case 'StringList':
        return 'List<String>?';
      case 'ObjectList':
        return `List<${target ?? 'dynamic'}>?`;
      default:
        return 'dynamic';
    }
  };

  const lines: string[] = [];
  lines.push(schema.embedded ? '@embedded' : '@collection');
  lines.push(`class ${schema.name} {`);
  if (!schema.embedded) {
    lines.push('  Id id = Isar.autoIncrement;');
    lines.push('');
  }
  for (const prop of schema.properties) {
    if (!prop.name) continue;
    const idx = schema.indexes.find((i) => i.properties[0]?.name === prop.name);
    if (idx) {
      const opts: string[] = [];
      if (idx.unique) opts.push('unique: true');
      if (idx.replace) opts.push('replace: true');
      lines.push(`  @Index(${opts.join(', ')})`);
    }
    lines.push(`  ${mapType(prop.type, prop.target)} ${prop.name};`);
  }
  if (schema.links.length > 0) {
    lines.push('');
    for (const link of schema.links) {
      lines.push(`  final ${link.name} = IsarLinks<${link.target}>();`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}
