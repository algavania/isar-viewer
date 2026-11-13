import React from 'react';
import { Cpu, CheckCircle2, Layers } from 'lucide-react';
import { IsarDatabaseModel } from '../core/isarDatabase';
import { formatBytes } from './TopBar';

interface MdbxInternalsViewProps {
  db: IsarDatabaseModel;
}

function classifySubDb(name: string): { label: string; badgeClass: string } {
  if (name === '_info') {
    return {
      label: 'Schema Metadata',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (name.startsWith('_i_')) {
    return {
      label: 'Index',
      badgeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
    };
  }
  if (name.startsWith('_l_')) {
    return {
      label: 'Forward Link',
      badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    };
  }
  if (name.startsWith('_b_')) {
    return {
      label: 'Backlink',
      badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    };
  }
  return {
    label: 'Collection',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  };
}

export const MdbxInternalsView: React.FC<MdbxInternalsViewProps> = ({ db }) => {
  const { mdbx } = db;
  const subDbList = Array.from(mdbx.subDbs.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-500" />
            MDBX Storage Internals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Low-level MVCC meta pages and B-tree statistics from <code className="font-mono">{db.fileName}</code>.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">File Size</div>
            <div className="text-lg font-mono font-bold mt-1">{formatBytes(mdbx.fileSize)}</div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Page Size</div>
            <div className="text-lg font-mono font-bold mt-1">{mdbx.pagesize.toLocaleString()} B</div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Active Txn ID</div>
            <div className="text-lg font-mono font-bold mt-1 text-emerald-500">
              #{mdbx.activeMeta.txnid.toString()}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Sub-Databases</div>
            <div className="text-lg font-mono font-bold mt-1">{subDbList.length}</div>
          </div>
        </div>

        {/* Meta Pages */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
            MVCC Ring Meta Pages (0 / 1 / 2)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {mdbx.metas.map((meta) => {
              const isActive = meta.index === mdbx.activeMeta.index;
              return (
                <div
                  key={meta.index}
                  className={`p-4 rounded-xl border bg-white dark:bg-slate-900 ${
                    isActive
                      ? 'border-emerald-500/60 ring-1 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold">Meta Page #{meta.index}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 font-mono text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">txnid:</span>
                      <span>{meta.txnid.toString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">main.root:</span>
                      <span>page {meta.main.root}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">main.items:</span>
                      <span>{meta.main.items.toString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">gc.leafPages:</span>
                      <span>{meta.gc.leafPages}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sub-DB table */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold">Named B-Tree Sub-Databases</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Kind</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Height</th>
                  <th className="px-4 py-2.5 text-right">Branch</th>
                  <th className="px-4 py-2.5 text-right">Leaf</th>
                  <th className="px-4 py-2.5 text-right">Large</th>
                  <th className="px-4 py-2.5 text-right">Mod Txn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono text-xs">
                {subDbList.map((sdb) => {
                  const kind = classifySubDb(sdb.name);
                  return (
                    <tr key={sdb.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {sdb.name}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-sans font-medium border ${kind.badgeClass}`}
                        >
                          {kind.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">{sdb.tree.items.toString()}</td>
                      <td className="px-4 py-2 text-right">{sdb.tree.height}</td>
                      <td className="px-4 py-2 text-right">{sdb.tree.branchPages}</td>
                      <td className="px-4 py-2 text-right">{sdb.tree.leafPages}</td>
                      <td className="px-4 py-2 text-right">{sdb.tree.largePages}</td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        #{sdb.tree.modTxnid.toString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
