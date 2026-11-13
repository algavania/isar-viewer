import React from 'react';
import {
  Database,
  Table2,
  Network,
  Cpu,
  RefreshCw,
  FolderOpen,
  Sun,
  Moon,
  Radio,
  ArrowLeft,
  Archive,
} from 'lucide-react';
import { IsarDatabaseModel } from '../core/isarDatabase';

export type AppView = 'data' | 'schema' | 'internals';

interface TopBarProps {
  db: IsarDatabaseModel;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onOpenPicker: () => void;
  onReload: () => void;
  canReload: boolean;
  autoWatch: boolean;
  onToggleAutoWatch: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onBackToLanding: () => void;
  watchedPath?: string | null;
  onOpenExportZip?: () => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const TopBar: React.FC<TopBarProps> = ({
  db,
  activeView,
  onChangeView,
  onOpenPicker,
  onReload,
  canReload,
  autoWatch,
  onToggleAutoWatch,
  dark,
  onToggleTheme,
  onBackToLanding,
  watchedPath,
  onOpenExportZip,
}) => {
  const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'data', label: 'Data Explorer', icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: 'schema', label: 'Schema & ER', icon: <Network className="w-3.5 h-3.5" /> },
    { id: 'internals', label: 'MDBX Internals', icon: <Cpu className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-13 shrink-0 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-slate-950/95 px-4 flex items-center justify-between gap-3 select-none">
      {/* Left: Back / Switch DB & File Info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onBackToLanding}
          title="Back to Landing Page (Switch Database)"
          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Switch Database</span>
        </button>

        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
          <Database className="w-4 h-4 text-white" />
        </div>

        <div className="min-w-0 flex items-center gap-2">
          <span className="font-semibold text-sm tracking-tight hidden lg:inline">Isar Viewer</span>
          <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">/</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 min-w-0">
            <span className="font-mono text-xs font-medium truncate max-w-[160px]" title={watchedPath || db.fileName}>
              {db.fileName}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
              {formatBytes(db.mdbx.fileSize)}
            </span>
          </div>

          {watchedPath && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono shrink-0"
              title={`Watching: ${watchedPath}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Realtime Watch</span>
            </div>
          )}

          {autoWatch && !watchedPath && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono shrink-0"
              title="Live disk watch active — Auto-refreshes on save"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Watching</span>
            </div>
          )}

          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {db.mdbx.pagesize / 1024}KB pages
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              txn #{db.mdbx.activeMeta.txnid.toString()}
            </span>
          </div>
        </div>
      </div>

      {/* Center: View Switcher */}
      <nav className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {canReload && (
          <>
            <button
              type="button"
              onClick={onToggleAutoWatch}
              title="Auto-refresh from disk every 2s"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                autoWatch
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${autoWatch ? 'animate-pulse' : ''}`} />
              <span className="hidden xl:inline">{autoWatch ? 'Watching' : 'Watch'}</span>
            </button>
            <button
              type="button"
              onClick={onReload}
              title="Reload file from disk"
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {onOpenExportZip && (
          <button
            type="button"
            onClick={onOpenExportZip}
            title="Export entire database as JSON (.zip)"
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Export ZIP</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPicker}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Open .isar</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
