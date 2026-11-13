import React, { useState } from 'react';
import { Database, Upload, Sparkles, ShieldCheck, Layers, GitFork, AlertCircle } from 'lucide-react';

interface DropZoneProps {
  onOpenPicker: () => void;
  onDropFile: (file: File) => void;
  onLoadSample: () => void;
  error: string | null;
  loading: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onOpenPicker,
  onDropFile,
  onLoadSample,
  error,
  loading,
}) => {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden"
    >
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 w-[520px] h-[360px] rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="w-full max-w-2xl relative z-10">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Isar Viewer</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Standalone offline inspector for <code className="text-emerald-600 dark:text-emerald-400">.isar</code> databases
            </p>
          </div>
        </div>

        <div
          onClick={onOpenPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpenPicker()}
          className={`group cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-xl ${
            dragging
              ? 'border-emerald-500 bg-emerald-500/5 scale-[1.01] shadow-emerald-500/15'
              : 'border-slate-300 dark:border-slate-700/80 hover:border-emerald-500/70 hover:bg-white dark:hover:bg-slate-900'
          }`}
        >
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:border-emerald-500/50 transition-transform">
            <Upload className={`w-6 h-6 ${dragging ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-300'}`} />
          </div>

          <h2 className="text-lg font-semibold mb-1.5">
            {loading ? 'Parsing .isar database...' : 'Drop your .isar file here'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            or click to browse from your computer — works without Dart schemas
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium shadow-md shadow-emerald-600/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              Open .isar File
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              Load Sample Database
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Could not open file</p>
              <p className="text-xs opacity-90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className="p-4 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              100% Local & Read-Only
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Parsed directly in your browser. Your database never leaves your machine and is never modified.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400 mb-1">
              <Layers className="w-4 h-4" />
              Auto Schema Discovery
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Reads embedded <code className="text-[11px]">_info</code> schemas, tombstones, and binary payloads automatically.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400 mb-1">
              <GitFork className="w-4 h-4" />
              Links, Filter & Export
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Inspect <code className="text-[11px]">IsarLink</code> relations, filter/sort rows, view ER graph, and export JSON/CSV.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
