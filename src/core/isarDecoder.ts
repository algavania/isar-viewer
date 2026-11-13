/**
 * Pure TypeScript decoder for Isar v3 binary objects (IsarObject v2) and MDBX Id keys.
 */

export type IsarPropertyType =
  | 'Bool'
  | 'Byte'
  | 'Int'
  | 'Float'
  | 'Long'
  | 'Double'
  | 'DateTime'
  | 'String'
  | 'Object'
  | 'BoolList'
  | 'ByteList'
  | 'IntList'
  | 'FloatList'
  | 'LongList'
  | 'DoubleList'
  | 'DateTimeList'
  | 'StringList'
  | 'ObjectList';

export interface IsarPropertySchema {
  name: string | null;
  type: IsarPropertyType;
  target: string | null;
}

export interface IsarIndexPropertySchema {
  name: string;
  type: 'Value' | 'Hash' | 'HashElements';
  caseSensitive: boolean;
}

export interface IsarIndexSchema {
  name: string;
  properties: IsarIndexPropertySchema[];
  unique: boolean;
  replace: boolean;
}

export interface IsarLinkSchema {
  name: string;
  target: string;
}

export interface IsarCollectionSchema {
  name: string;
  embedded: boolean;
  properties: IsarPropertySchema[];
  indexes: IsarIndexSchema[];
  links: IsarLinkSchema[];
  version?: number;
}

export type IsarValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | IsarRecord
  | IsarValue[];

export interface IsarRecord {
  [key: string]: IsarValue;
}

export interface PropertyLayout {
  name: string | null;
  type: IsarPropertyType;
  target: string | null;
  offset: number;
  size: number;
}

const NULL_INT = -2147483648;
const NULL_LONG = -9223372036854775808n;
const SIGN_BIT = 0x8000000000000000n;
const utf8Decoder = new TextDecoder('utf-8');

export function getPropertyStaticSize(type: IsarPropertyType): number {
  switch (type) {
    case 'Bool':
    case 'Byte':
      return 1;
    case 'Int':
    case 'Float':
      return 4;
    case 'Long':
    case 'Double':
    case 'DateTime':
      return 8;
    default:
      return 3; // uint24 offset into dynamic region
  }
}

export function computeLayout(schema: IsarCollectionSchema): PropertyLayout[] {
  let offset = 2; // first 2 bytes are uint16 staticSize
  const layouts: PropertyLayout[] = [];
  for (const prop of schema.properties) {
    const size = getPropertyStaticSize(prop.type);
    layouts.push({
      name: prop.name,
      type: prop.type,
      target: prop.target ?? null,
      offset,
      size,
    });
    offset += size;
  }
  return layouts;
}

/**
 * Decodes an 8-byte Isar MDBX key back to a signed 64-bit integer ID.
 * Isar stores signed int64 XORed with 0x8000000000000000n so unsigned byte order matches signed order.
 */
export function decodeIsarId(keyBytes: Uint8Array): bigint {
  if (keyBytes.length !== 8) {
    throw new Error(`Expected 8-byte Isar ID key, got ${keyBytes.length} bytes.`);
  }
  const view = new DataView(keyBytes.buffer, keyBytes.byteOffset, 8);
  const raw = view.getBigUint64(0, true);
  return BigInt.asIntN(64, raw ^ SIGN_BIT);
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readBoolByte(b: number): boolean | null {
  if (b === 2) return true;
  if (b === 1) return false;
  return null;
}

function decodeLongValue(val: bigint): number | bigint | null {
  if (val === NULL_LONG) return null;
  if (val >= BigInt(Number.MIN_SAFE_INTEGER) && val <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(val);
  }
  return val;
}

export function decodeIsarObject(
  bytes: Uint8Array,
  schemaName: string,
  layoutsBySchema: Map<string, PropertyLayout[]>
): IsarRecord {
  const layout = layoutsBySchema.get(schemaName);
  if (!layout) {
    throw new Error(`Missing schema layout for "${schemaName}"`);
  }
  if (bytes.length < 2) return {};

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const staticSize = view.getUint16(0, true);
  const record: IsarRecord = {};

  for (const prop of layout) {
    if (!prop.name) continue; // deleted field tombstone
    const { offset, type, target } = prop;

    if (offset >= staticSize || offset + prop.size > bytes.length) {
      record[prop.name] = null;
      continue;
    }

    switch (type) {
      case 'Bool':
        record[prop.name] = readBoolByte(bytes[offset]);
        break;
      case 'Byte':
        record[prop.name] = bytes[offset];
        break;
      case 'Int': {
        const v = view.getInt32(offset, true);
        record[prop.name] = v === NULL_INT ? null : v;
        break;
      }
      case 'Float': {
        const v = view.getFloat32(offset, true);
        record[prop.name] = Number.isNaN(v) ? null : v;
        break;
      }
      case 'Long':
      case 'DateTime': {
        const v = view.getBigInt64(offset, true);
        record[prop.name] = decodeLongValue(v);
        break;
      }
      case 'Double': {
        const v = view.getFloat64(offset, true);
        record[prop.name] = Number.isNaN(v) ? null : v;
        break;
      }
      case 'String': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          record[prop.name] = utf8Decoder.decode(bytes.subarray(start, start + len));
        }
        break;
      }
      case 'Object': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length || !target) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          record[prop.name] = decodeIsarObject(
            bytes.subarray(start, start + len),
            target,
            layoutsBySchema
          );
        }
        break;
      }
      case 'BoolList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          const arr: (boolean | null)[] = new Array(len);
          for (let i = 0; i < len; i++) arr[i] = readBoolByte(bytes[start + i]);
          record[prop.name] = arr;
        }
        break;
      }
      case 'ByteList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          record[prop.name] = bytes.slice(start, start + len);
        }
        break;
      }
      case 'IntList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          const arr: (number | null)[] = new Array(len);
          for (let i = 0; i < len; i++) {
            const v = view.getInt32(start + i * 4, true);
            arr[i] = v === NULL_INT ? null : v;
          }
          record[prop.name] = arr;
        }
        break;
      }
      case 'FloatList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          const arr: (number | null)[] = new Array(len);
          for (let i = 0; i < len; i++) {
            const v = view.getFloat32(start + i * 4, true);
            arr[i] = Number.isNaN(v) ? null : v;
          }
          record[prop.name] = arr;
        }
        break;
      }
      case 'LongList':
      case 'DateTimeList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          const arr: (number | bigint | null)[] = new Array(len);
          for (let i = 0; i < len; i++) {
            const v = view.getBigInt64(start + i * 8, true);
            arr[i] = decodeLongValue(v);
          }
          record[prop.name] = arr;
        }
        break;
      }
      case 'DoubleList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const start = ptr + 3;
          const arr: (number | null)[] = new Array(len);
          for (let i = 0; i < len; i++) {
            const v = view.getFloat64(start + i * 8, true);
            arr[i] = Number.isNaN(v) ? null : v;
          }
          record[prop.name] = arr;
        }
        break;
      }
      case 'StringList':
      case 'ObjectList': {
        const ptr = readUint24(bytes, offset);
        if (ptr === 0 || ptr + 3 > bytes.length) {
          record[prop.name] = null;
        } else {
          const len = readUint24(bytes, ptr);
          const sizesStart = ptr + 3;
          let contentOffset = sizesStart + len * 3;
          const arr: IsarValue[] = new Array(len);
          for (let i = 0; i < len; i++) {
            const itemSize = readUint24(bytes, sizesStart + i * 3);
            if (itemSize === 0) {
              arr[i] = null;
            } else {
              const byteLen = itemSize - 1;
              const slice = bytes.subarray(contentOffset, contentOffset + byteLen);
              contentOffset += byteLen;
              if (type === 'StringList') {
                arr[i] = utf8Decoder.decode(slice);
              } else if (target) {
                arr[i] = decodeIsarObject(slice, target, layoutsBySchema);
              } else {
                arr[i] = null;
              }
            }
          }
          record[prop.name] = arr;
        }
        break;
      }
    }
  }

  return record;
}
