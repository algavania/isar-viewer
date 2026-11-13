import React, { useState } from 'react';
import {
  Table,
  Box,
  Link2,
  KeyRound,
  Code2,
  LayoutGrid,
  Copy,
  Check,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { generateDartModelCode, IsarDatabaseModel } from '../core/isarDatabase';
import { IsarCollectionSchema } from '../core/isarDecoder';

interface SchemaViewProps {
  db: IsarDatabaseModel;
  focusedSchema: string | null;
  onBrowseCollection: (name: string) => void;
}

export const SchemaView: React.FC<SchemaViewProps> = ({
  db,
  focusedSchema,
  onBrowseCollection,
}) => {
  const [mode, setMode] = useState<'cards' | 'dart'>('cards');
  const [hovered, setHovered] = useState<string | null>(focusedSchema);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const allSchemas: IsarCollectionSchema[] = [
    ...db.collections.map((c) => c.schema),
    ...db.embeddedSchemas,
  ];

  // Build relation lookup for hover highlighting
  const relatedTo = (target: string): Set<string> => {
    const rel = new Set<string>();
    for (const s of allSchemas) {
      const linksTo = s.links.some((l) => l.target === target);
      const embeds = s.properties.some((p) => p.target === target);
      if (s.name === target) {
        s.links.forEach((l) => rel.add(l.target));
        s.properties.forEach((p) => p.target && rel.add(p.target));
      } else if (linksTo || embeds) {
        rel.add(s.name);
      }
    }
    return rel;
  };

  const activeRelated = hovered ? relatedTo(hovered) : new Set<string>();

  const copyDart = (schema: IsarCollectionSchema) => {
    navigator.clipboard.writeText(generateDartModelCode(schema));
    setCopiedName(schema.name);
    setTimeout(() => setCopiedName(null), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Schema & Relationships</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hover any card to highlight linked collections and embedded types. Extracted directly from <code className="text-emerald-600 dark:text-emerald-400">_info</code>.
            </p>
          </div>

          <div className="flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('cards')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                mode === 'cards'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Schema Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('dart')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                mode === 'dart'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Dart Models</span>
            </button>
          </div>
        </div>

        {mode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {allSchemas.map((schema) => {
              const colData = db.collectionMap.get(schema.name);
              const isSelf = hovered === schema.name;
              const isRelated = activeRelated.has(schema.name);
              const dimmed = hovered !== null && !isSelf && !isRelated;

              return (
                <div
                  key={schema.name}
                  onMouseEnter={() => setHovered(schema.name)}
                  onMouseLeave={() => setHovered(null)}
                  className={`rounded-2xl border bg-white dark:bg-slate-900/80 overflow-hidden transition-all duration-150 ${
                    isSelf
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                      : isRelated
                      ? 'border-cyan-500/70 shadow-md shadow-cyan-500/10'
                      : dimmed
                      ? 'border-slate-200 dark:border-slate-800 opacity-50'
                      : 'border-slate-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900">
                    <div className="flex items-center gap-2 min-w-0">
                      {schema.embedded ? (
                        <Box className="w-4 h-4 text-violet-500 shrink-0" />
                      ) : (
                        <Table className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      <span className="font-semibold text-sm truncate">{schema.name}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          schema.embedded
                            ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        }`}
                      >
                        {schema.embedded ? '@embedded' : '@collection'}
                      </span>
                    </div>

                    {colData && (
                      <button
                        type="button"
                        onClick={() => onBrowseCollection(schema.name)}
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/60 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{colData.rows.length} rows</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Properties */}
                  <div className="p-3 space-y-1">
                    {!schema.embedded && (
                      <div className="flex items-center justify-between px-2 py-1 rounded text-xs font-mono bg-emerald-500/5">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">id</span>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Id (primary)</span>
                      </div>
                    )}

                    {schema.properties.map((prop, idx) => {
                      if (prop.name === null) {
                        return (
                          <div
                            key={`tomb_${idx}`}
                            className="flex items-center justify-between px-2 py-1 rounded text-xs font-mono text-slate-400 line-through opacity-60"
                          >
                            <span className="flex items-center gap-1">
                              <Trash2 className="w-3 h-3" />
                              (deleted slot)
                            </span>
                            <span className="text-[11px]">{prop.type}</span>
                          </div>
                        );
                      }

                      const hasIndex = schema.indexes.find((ix) =>
                        ix.properties.some((ip) => ip.name === prop.name)
                      );

                      return (
                        <div
                          key={prop.name}
                          className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                              {prop.name}
                            </span>
                            {hasIndex && (
                              <span
                                title={`Index: ${hasIndex.name}${hasIndex.unique ? ' (unique)' : ''}`}
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[9px] font-mono"
                              >
                                <KeyRound className="w-2.5 h-2.5" />
                                {hasIndex.unique ? 'UQ' : 'IDX'}
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-mono text-[11px] shrink-0 ${
                              prop.target
                                ? 'text-violet-600 dark:text-violet-300 font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {prop.target ? `${prop.type}<${prop.target}>` : prop.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Links & Indexes Footer */}
                  {(schema.links.length > 0 || schema.indexes.length > 0) && (
                    <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
                      {schema.links.map((link) => (
                        <div key={link.name} className="flex items-center justify-between text-xs font-mono">
                          <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                            <Link2 className="w-3 h-3" />
                            {link.name}
                          </span>
                          <span className="text-slate-500">→ {link.target}</span>
                        </div>
                      ))}
                      {schema.indexes.map((idx) => (
                        <div key={idx.name} className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>idx:{idx.name}</span>
                          <span>
                            [{idx.properties.map((p) => `${p.name}:${p.type}`).join(', ')}]
                            {idx.unique ? ' · unique' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {allSchemas.map((schema) => {
              const code = generateDartModelCode(schema);
              return (
                <div
                  key={schema.name}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
                    <span className="font-mono text-xs font-semibold">{schema.name}.dart</span>
                    <button
                      type="button"
                      onClick={() => copyDart(schema)}
                      className="px-2.5 py-1 rounded-md text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedName === schema.name ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedName === schema.name ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto text-slate-800 dark:text-slate-200">
                    {code}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
