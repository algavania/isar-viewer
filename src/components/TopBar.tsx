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
  ArrowLeft,
  Archive,
  Save,
  RotateCcw,
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
  onToggleAutoWatch?: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onBackToLanding: () => void;
  watchedPath?: string | null;
  onOpenExportZip?: () => void;
  pendingMutationsCount?: number;
  onOpenSaveIsar?: () => void;
  onDiscardChanges?: () => void;
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
  dark,
  onToggleTheme,
  onBackToLanding,
  watchedPath,
  onOpenExportZip,
  pendingMutationsCount = 0,
  onOpenSaveIsar,
  onDiscardChanges,
}) => {
  const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'data', label: 'Data Explorer', icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: 'schema', label: 'Schema & ER', icon: <Network className="w-3.5 h-3.5" /> },
    { id: 'internals', label: 'MDBX Internals', icon: <Cpu className="w-3.5 h-3.5" /> },
  ];

  const isLiveWatching = Boolean(watchedPath || autoWatch);

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 flex items-center justify-between gap-4 select-none">
      {/* Left: Branding & Database Info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBackToLanding}
          title="Back to home (Switch Database)"
          className="flex items-center gap-2 group cursor-pointer text-slate-800 dark:text-slate-100 hover:opacity-80 transition-opacity shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Database className="w-4 h-4" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="font-semibold text-xs tracking-tight">Isar Viewer</span>
            <ArrowLeft className="w-3 h-3 text-slate-400 group-hover:-translate-x-0.5 transition-transform" />
          </div>
        </button>

        <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>

        {/* Database File Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 min-w-0">
          {isLiveWatching && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
              title={watchedPath ? `Live watching: ${watchedPath}` : 'Auto-watch active'}
            />
          )}
          <span className="font-mono text-xs font-medium truncate max-w-[170px]" title={watchedPath || db.fileName}>
            {db.fileName}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
            {formatBytes(db.mdbx.fileSize)}
          </span>
        </div>
      </div>

      {/* Center: Segmented View Switcher */}
      <nav className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Consolidated Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Pending Edits Indicator & Save Button */}
        {pendingMutationsCount > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSaveIsar}
              title="Save modified database as new .isar file"
              className="h-8 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs animate-pulse"
            >
              <Save className="w-3.5 h-3.5 text-amber-500" />
              <span>Save ({pendingMutationsCount})</span>
            </button>
            {onDiscardChanges && (
              <button
                type="button"
                onClick={onDiscardChanges}
                title="Discard all pending edits"
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Reload disk button (if handle / file is watchable) */}
        {canReload && (
          <button
            type="button"
            onClick={onReload}
            title="Reload database from disk"
            className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Export ZIP Modal Trigger */}
        {onOpenExportZip && (
          <button
            type="button"
            onClick={onOpenExportZip}
            title="Export collections to JSON ZIP"
            className="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Export ZIP</span>
          </button>
        )}

        {/* Open Another .isar File */}
        <button
          type="button"
          onClick={onOpenPicker}
          title="Open a different .isar file from disk"
          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Open File</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
        >
          {dark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
