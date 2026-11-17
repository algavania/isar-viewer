/**
 * Pure TypeScript encoder for Isar v3 binary objects (IsarObject v2) and MDBX Id keys.
 */

import {
  PropertyLayout,
  IsarRecord,
} from './isarDecoder';

const NULL_INT = -2147483648;
const NULL_LONG = -9223372036854775808n;
const SIGN_BIT = 0x8000000000000000n;
const utf8Encoder = new TextEncoder();

/**
 * Encodes a signed 64-bit integer ID into an 8-byte Isar MDBX key.
 * Isar XORs signed int64 with 0x8000000000000000n so unsigned byte order matches signed order.
 */
export function encodeIsarId(id: bigint | number): Uint8Array {
  const bigId = typeof id === 'number' ? BigInt(id) : id;
  const raw = BigInt.asUintN(64, bigId) ^ SIGN_BIT;
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, raw, true);
  return out;
}

function writeUint24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}

function encodeBoolByte(val: unknown): number {
  if (val === true) return 2;
  if (val === false) return 1;
  return 0; // null
}

function encodeLongValue(val: unknown): bigint {
  if (val === null || val === undefined) return NULL_LONG;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return NULL_LONG;
    return BigInt(Math.trunc(val));
  }
  if (val instanceof Date) {
    return BigInt(val.getTime()) * 1000n;
  }
  if (typeof val === 'string') {
    try {
      return BigInt(val);
    } catch {
      return NULL_LONG;
    }
  }
  return NULL_LONG;
}

/**
 * Encodes an Isar record object into an IsarObject v2 byte array.
 */
export function encodeIsarObject(
  record: IsarRecord,
  schemaName: string,
  layoutsBySchema: Map<string, PropertyLayout[]>
): Uint8Array {
  const layout = layoutsBySchema.get(schemaName);
  if (!layout) {
    throw new Error(`Missing schema layout for "${schemaName}"`);
  }

  // Calculate static size (first 2 bytes + sum of property static sizes)
  let staticSize = 2;
  for (const prop of layout) {
    staticSize += prop.size;
  }

  // Dynamic buffer builder
  const dynamicChunks: { offsetInStatic: number; bytes: Uint8Array }[] = [];
  let dynamicLength = 0;

  const pushDynamic = (offsetInStatic: number, chunk: Uint8Array) => {
    dynamicChunks.push({ offsetInStatic, bytes: chunk });
    dynamicLength += chunk.length;
  };

  // Pre-allocate static buffer
  const staticBuf = new Uint8Array(staticSize);
  const staticView = new DataView(staticBuf.buffer);
  staticView.setUint16(0, staticSize, true);

  for (const prop of layout) {
    if (!prop.name) continue; // Deleted field tombstone: left as zero/default
    const val = record[prop.name];
    const { offset, type, target } = prop;

    switch (type) {
      case 'Bool': {
        staticBuf[offset] = encodeBoolByte(val);
        break;
      }
      case 'Byte': {
        if (typeof val === 'number') {
          staticBuf[offset] = val & 0xff;
        } else {
          staticBuf[offset] = 0;
        }
        break;
      }
      case 'Int': {
        if (val === null || val === undefined || typeof val !== 'number' || Number.isNaN(val)) {
          staticView.setInt32(offset, NULL_INT, true);
        } else {
          staticView.setInt32(offset, Math.trunc(val), true);
        }
        break;
      }
      case 'Float': {
        if (val === null || val === undefined || typeof val !== 'number') {
          staticView.setFloat32(offset, NaN, true);
        } else {
          staticView.setFloat32(offset, val, true);
        }
        break;
      }
      case 'Long': {
        staticView.setBigInt64(offset, encodeLongValue(val), true);
        break;
      }
      case 'DateTime': {
        staticView.setBigInt64(offset, encodeLongValue(val), true);
        break;
      }
      case 'Double': {
        if (val === null || val === undefined || typeof val !== 'number') {
          staticView.setFloat64(offset, NaN, true);
        } else {
          staticView.setFloat64(offset, val, true);
        }
        break;
      }
      case 'String': {
        if (val === null || val === undefined) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const str = String(val);
          const payload = utf8Encoder.encode(str);
          const chunk = new Uint8Array(3 + payload.length);
          writeUint24(chunk, 0, payload.length);
          chunk.set(payload, 3);
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'Object': {
        if (val === null || val === undefined || typeof val !== 'object' || Array.isArray(val) || !target) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const nestedBytes = encodeIsarObject(val as IsarRecord, target, layoutsBySchema);
          const chunk = new Uint8Array(3 + nestedBytes.length);
          writeUint24(chunk, 0, nestedBytes.length);
          chunk.set(nestedBytes, 3);
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'BoolList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const chunk = new Uint8Array(3 + len);
          writeUint24(chunk, 0, len);
          for (let i = 0; i < len; i++) {
            chunk[3 + i] = encodeBoolByte(val[i]);
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'ByteList': {
        if (val === null || val === undefined) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const bytes =
            val instanceof Uint8Array
              ? val
              : new Uint8Array(Array.isArray(val) ? (val as number[]) : []);
          const chunk = new Uint8Array(3 + bytes.length);
          writeUint24(chunk, 0, bytes.length);
          chunk.set(bytes, 3);
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'IntList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const chunk = new Uint8Array(3 + len * 4);
          const dv = new DataView(chunk.buffer);
          writeUint24(chunk, 0, len);
          for (let i = 0; i < len; i++) {
            const v = val[i];
            if (v === null || v === undefined || typeof v !== 'number' || Number.isNaN(v)) {
              dv.setInt32(3 + i * 4, NULL_INT, true);
            } else {
              dv.setInt32(3 + i * 4, Math.trunc(v), true);
            }
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'FloatList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const chunk = new Uint8Array(3 + len * 4);
          const dv = new DataView(chunk.buffer);
          writeUint24(chunk, 0, len);
          for (let i = 0; i < len; i++) {
            const v = val[i];
            dv.setFloat32(3 + i * 4, typeof v === 'number' ? v : NaN, true);
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'LongList':
      case 'DateTimeList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const chunk = new Uint8Array(3 + len * 8);
          const dv = new DataView(chunk.buffer);
          writeUint24(chunk, 0, len);
          for (let i = 0; i < len; i++) {
            dv.setBigInt64(3 + i * 8, encodeLongValue(val[i]), true);
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'DoubleList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const chunk = new Uint8Array(3 + len * 8);
          const dv = new DataView(chunk.buffer);
          writeUint24(chunk, 0, len);
          for (let i = 0; i < len; i++) {
            const v = val[i];
            dv.setFloat64(3 + i * 8, typeof v === 'number' ? v : NaN, true);
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'StringList': {
        if (!Array.isArray(val)) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const encodedItems: (Uint8Array | null)[] = val.map((item) =>
            item === null || item === undefined ? null : utf8Encoder.encode(String(item))
          );
          let payloadsLength = 0;
          for (const it of encodedItems) {
            if (it !== null) payloadsLength += it.length;
          }
          const chunk = new Uint8Array(3 + len * 3 + payloadsLength);
          writeUint24(chunk, 0, len);

          const sizesStart = 3;
          let contentOffset = sizesStart + len * 3;
          for (let i = 0; i < len; i++) {
            const it = encodedItems[i];
            if (it === null) {
              writeUint24(chunk, sizesStart + i * 3, 0);
            } else {
              writeUint24(chunk, sizesStart + i * 3, it.length + 1);
              chunk.set(it, contentOffset);
              contentOffset += it.length;
            }
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
      case 'ObjectList': {
        if (!Array.isArray(val) || !target) {
          writeUint24(staticBuf, offset, 0);
        } else {
          const len = val.length;
          const encodedItems: (Uint8Array | null)[] = val.map((item) =>
            item === null || item === undefined || typeof item !== 'object'
              ? null
              : encodeIsarObject(item as IsarRecord, target, layoutsBySchema)
          );
          let payloadsLength = 0;
          for (const it of encodedItems) {
            if (it !== null) payloadsLength += it.length;
          }
          const chunk = new Uint8Array(3 + len * 3 + payloadsLength);
          writeUint24(chunk, 0, len);

          const sizesStart = 3;
          let contentOffset = sizesStart + len * 3;
          for (let i = 0; i < len; i++) {
            const it = encodedItems[i];
            if (it === null) {
              writeUint24(chunk, sizesStart + i * 3, 0);
            } else {
              writeUint24(chunk, sizesStart + i * 3, it.length + 1);
              chunk.set(it, contentOffset);
              contentOffset += it.length;
            }
          }
          pushDynamic(offset, chunk);
        }
        break;
      }
    }
  }

  // Combine static buffer and dynamic chunks
  const totalLength = staticSize + dynamicLength;
  const result = new Uint8Array(totalLength);
  result.set(staticBuf, 0);

  let currentDynamicOffset = staticSize;
  for (const chunk of dynamicChunks) {
    writeUint24(result, chunk.offsetInStatic, currentDynamicOffset);
    result.set(chunk.bytes, currentDynamicOffset);
    currentDynamicOffset += chunk.bytes.length;
  }

  return result;
}
