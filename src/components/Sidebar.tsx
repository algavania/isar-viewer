import React, { useState } from 'react';
import { Table, Box, Search, Link2, KeyRound, Archive } from 'lucide-react';
import { IsarDatabaseModel } from '../core/isarDatabase';

interface SidebarProps {
  db: IsarDatabaseModel;
  selectedCollection: string;
  onSelectCollection: (name: string) => void;
  onSelectEmbedded: (name: string) => void;
  onOpenExportZip?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  db,
  selectedCollection,
  onSelectCollection,
  onSelectEmbedded,
  onOpenExportZip,
}) => {
  const [filter, setFilter] = useState('');

  const filteredCols = db.collections.filter((c) =>
    c.schema.name.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const filteredEmb = db.embeddedSchemas.filter((s) =>
    s.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col select-none">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800/80">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter collections..."
            className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500/60 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-5">
        {/* Collections */}
        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Collections ({filteredCols.length})
            </span>
          </div>
          <div className="space-y-0.5">
            {filteredCols.map((col) => {
              const active = col.schema.name === selectedCollection;
              return (
                <button
                  key={col.schema.name}
                  type="button"
                  onClick={() => onSelectCollection(col.schema.name)}
                  className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors cursor-pointer group ${
                    active
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Table
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-emerald-500' : 'text-slate-400 group-hover:text-slate-500'
                      }`}
                    />
                    <span className="text-xs font-medium truncate">{col.schema.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {col.schema.links.length > 0 && (
                      <span title={`${col.schema.links.length} links`} className="text-slate-400">
                        <Link2 className="w-3 h-3" />
                      </span>
                    )}
                    {col.schema.indexes.length > 0 && (
                      <span title={`${col.schema.indexes.length} indexes`} className="text-slate-400">
                        <KeyRound className="w-3 h-3" />
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {col.rows.length}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredCols.length === 0 && (
              <p className="px-2 py-2 text-xs text-slate-400 italic">No matching collections</p>
            )}
          </div>
        </div>

        {/* Embedded Objects */}
        {filteredEmb.length > 0 && (
          <div>
            <div className="px-2 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Embedded Types ({filteredEmb.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {filteredEmb.map((emb) => (
                <button
                  key={emb.name}
                  type="button"
                  onClick={() => onSelectEmbedded(emb.name)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Box className="w-3.5 h-3.5 shrink-0 text-violet-400" />
                    <span className="text-xs truncate">{emb.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {emb.properties.filter((p) => p.name !== null).length}f
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-2">
        <div className="flex items-center justify-between font-mono">
          <span>{db.collections.length} collections</span>
          <span>{db.totalRows.toLocaleString()} rows</span>
        </div>
        {onOpenExportZip && (
          <button
            type="button"
            onClick={onOpenExportZip}
            className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export to JSON (.zip)</span>
          </button>
        )}
      </div>
    </aside>
  );
};
