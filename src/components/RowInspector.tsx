import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Link2,
  ExternalLink,
  Clock,
  FileJson,
  Binary,
  ListTree,
} from 'lucide-react';
import {
  CollectionData,
  DecodedRow,
  formatMicrosToDate,
  IsarDatabaseModel,
  isLikelyMicrosTimestamp,
  rowToPlainJson,
  serializeValueForJson,
} from '../core/isarDatabase';
import { IsarValue } from '../core/isarDecoder';

interface RowInspectorProps {
  db: IsarDatabaseModel;
  collection: CollectionData;
  row: DecodedRow;
  onClose: () => void;
  onNavigateToRecord: (collectionName: string, rowId: string) => void;
}

type InspectorTab = 'tree' | 'json' | 'binary';

function formatHexDump(bytes: Uint8Array, limit = 4096): string {
  const slice = bytes.subarray(0, limit);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, i + 16);
    const addr = i.toString(16).padStart(4, '0');
    const hexParts: string[] = [];
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        const b = chunk[j];
        hexParts.push(b.toString(16).padStart(2, '0'));
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
    }
    lines.push(`${addr}  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${ascii}|`);
  }
  if (bytes.length > limit) {
    lines.push(`... (${bytes.length - limit} more bytes truncated)`);
  }
  return lines.join('\n');
}

const TreeNode: React.FC<{
  label: string;
  value: IsarValue;
  typeHint?: string;
  depth?: number;
}> = ({ label, value, typeHint, depth = 0 }) => {
  const [open, setOpen] = useState(depth < 2);
  const [copied, setCopied] = useState(false);

  const isComplex =
    (Array.isArray(value) && value.length > 0) ||
    (typeof value === 'object' && value !== null && !(value instanceof Uint8Array) && Object.keys(value).length > 0);

  const copyVal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const raw =
      typeof value === 'string'
        ? value
        : JSON.stringify(serializeValueForJson(value), null, 2);
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={depth > 0 ? 'pl-3 border-l border-slate-200 dark:border-slate-800' : ''}>
      <div
        onClick={() => isComplex && setOpen((o) => !o)}
        className={`group flex items-start justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-900/70 ${
          isComplex ? 'cursor-pointer' : ''
        }`}
      >
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          <span className="mt-0.5 w-3.5 shrink-0 text-slate-400">
            {isComplex ? (
              open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">{label}</span>
              {typeHint && (
                <span className="text-[10px] font-mono px-1 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-500">
                  {typeHint}
                </span>
              )}
              {!isComplex && (
                <span className="font-mono text-xs break-all">
                  {value === null || value === undefined ? (
                    <span className="text-slate-400 italic">null</span>
                  ) : typeof value === 'boolean' ? (
                    <span className={value ? 'text-emerald-500' : 'text-rose-500'}>{String(value)}</span>
                  ) : value instanceof Uint8Array ? (
                    <span className="text-amber-500">
                      Uint8Array({value.length}) [{Array.from(value.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join(' ')}
                      {value.length > 16 ? '…' : ''}]
                    </span>
                  ) : Array.isArray(value) ? (
                    <span className="text-slate-400">[]</span>
                  ) : typeof value === 'object' ? (
                    <span className="text-slate-400">{'{}'}</span>
                  ) : typeof value === 'number' || typeof value === 'bigint' ? (
                    <span className="text-sky-600 dark:text-sky-300">{value.toString()}</span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-300">"{String(value)}"</span>
                  )}
                </span>
              )}
              {isComplex && (
                <span className="text-[11px] font-mono text-slate-400">
                  {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} fields}`}
                </span>
              )}
            </div>

            {(typeof value === 'number' || typeof value === 'bigint') && isLikelyMicrosTimestamp(value) && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                <Clock className="w-3 h-3" />
                <span>{formatMicrosToDate(value)}</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={copyVal}
          title="Copy value"
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-opacity cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {isComplex && open && (
        <div className="mt-0.5">
          {Array.isArray(value)
            ? value.map((item, idx) => (
                <TreeNode key={idx} label={`[${idx}]`} value={item} depth={depth + 1} />
              ))
            : Object.entries(value as Record<string, IsarValue>).map(([k, v]) => (
                <TreeNode key={k} label={k} value={v} depth={depth + 1} />
              ))}
        </div>
      )}
    </div>
  );
};

export const RowInspector: React.FC<RowInspectorProps> = ({
  db,
  collection,
  row,
  onClose,
  onNavigateToRecord,
}) => {
  const [tab, setTab] = useState<InspectorTab>('tree');
  const [copiedJson, setCopiedJson] = useState(false);

  const plainJson = JSON.stringify(rowToPlainJson(row, true), null, 2);
  const staticSize =
    row.rawBytes.length >= 2 ? row.rawBytes[0] | (row.rawBytes[1] << 8) : 0;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(plainJson);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  return (
    <aside className="w-96 xl:w-[440px] shrink-0 border-l border-slate-200 dark:border-slate-800/90 bg-white dark:bg-slate-950 flex flex-col overflow-hidden shadow-xl z-20">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {collection.schema.name}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-semibold">
              #{row.idLabel}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            {row.rawBytes.length} bytes · staticSize={staticSize}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyJson}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedJson ? 'Copied' : 'JSON'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 bg-slate-50/70 dark:bg-slate-900/40">
        {[
          { id: 'tree' as const, label: 'Inspector', icon: <ListTree className="w-3.5 h-3.5" /> },
          { id: 'json' as const, label: 'Raw JSON', icon: <FileJson className="w-3.5 h-3.5" /> },
          { id: 'binary' as const, label: 'Hex Dump', icon: <Binary className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'tree' && (
          <div className="space-y-4">
            <div className="space-y-0.5">
              <TreeNode label="id" value={row.id} typeHint="Id" />
              {collection.schema.properties
                .filter((p) => p.name !== null)
                .map((prop) => (
                  <TreeNode
                    key={prop.name!}
                    label={prop.name!}
                    value={row.fields[prop.name!] ?? null}
                    typeHint={prop.target ?? prop.type}
                  />
                ))}
            </div>

            {collection.schema.links.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 px-1">
                  <Link2 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Links & Relations</span>
                </div>

                {collection.schema.links.map((link) => {
                  const targetIds = row.links[link.name] ?? [];
                  const targetCol = db.collectionMap.get(link.target);
                  return (
                    <div
                      key={link.name}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 p-2.5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                          {link.name} → {link.target}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                          {targetIds.length}
                        </span>
                      </div>

                      {targetIds.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No linked records</p>
                      ) : (
                        <div className="space-y-1 max-h-56 overflow-y-auto">
                          {targetIds.slice(0, 50).map((tid) => {
                            const tidStr = tid.toString();
                            const targetRow = targetCol?.rowById.get(tidStr);
                            const previewField = targetRow
                              ? Object.entries(targetRow.fields).find(([, v]) => typeof v === 'string' && v.length > 0)
                              : null;
                            return (
                              <button
                                key={tidStr}
                                type="button"
                                onClick={() => onNavigateToRecord(link.target, tidStr)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-cyan-500/50 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                    #{tidStr}
                                  </span>
                                  {previewField && (
                                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                      {String(previewField[1])}
                                    </span>
                                  )}
                                </div>
                                <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                              </button>
                            );
                          })}
                          {targetIds.length > 50 && (
                            <p className="text-[11px] font-mono text-slate-400 text-center pt-1">
                              +{targetIds.length - 50} more linked records
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'json' && (
          <pre className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs leading-relaxed overflow-x-auto text-slate-800 dark:text-slate-200">
            {plainJson}
          </pre>
        )}

        {tab === 'binary' && (
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-slate-500 px-1">
              IsarObject v2 binary payload ({row.rawBytes.length} bytes, staticSize = {staticSize})
            </div>
            <pre className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] leading-relaxed overflow-x-auto text-slate-700 dark:text-slate-300">
              {formatHexDump(row.rawBytes)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
