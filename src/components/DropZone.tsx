import React, { useState } from 'react';
import {
  Database,
  Upload,
  Sparkles,
  ShieldCheck,
  Cpu,
  Code2,
  AlertCircle,
  Sun,
  Moon,
  Radio,
} from 'lucide-react';

interface DropZoneProps {
  onOpenPicker: () => void;
  onDrop: (e: React.DragEvent) => void;
  onLoadSample: () => void;
  error: string | null;
  loading: boolean;
  dark: boolean;
  onToggleTheme: () => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onOpenPicker,
  onDrop,
  onLoadSample,
  error,
  loading,
  dark,
  onToggleTheme,
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
    onDrop(e);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors"
    >
      {/* Top Header Navigation */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight">Isar Viewer</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700/60">
                v1.0 • MDBX
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Offline Flutter database inspector
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 shadow-xs flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
          >
            {dark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
            <span>{dark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Drop Area Content */}
      <main className="w-full max-w-3xl mx-auto my-auto py-8">
        <div
          onClick={onOpenPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpenPicker()}
          className={`relative group cursor-pointer rounded-2xl border transition-all duration-200 p-8 sm:p-12 text-center bg-white dark:bg-slate-900/90 shadow-sm ${
            dragging
              ? 'border-emerald-500 ring-4 ring-emerald-500/10 bg-emerald-50/20 dark:bg-emerald-950/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
          }`}
        >
          {/* Subtle indicator badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium mb-6">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Pure Client-Side Parser</span>
          </div>

          <div className="mx-auto w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center mb-5 group-hover:border-emerald-500/40 group-hover:text-emerald-500 transition-colors">
            <Upload className={`w-6 h-6 transition-colors ${dragging ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`} />
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-2">
            {loading ? 'Reading & parsing .isar database...' : 'Drop your .isar file here'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
            Drag any raw Flutter Isar Database file here, or browse from your disk to start exploring collections and records immediately.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Select .isar File</span>
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Load Sample Database</span>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
            <span>Supports Isar v3 (libmdbx storage)</span>
            <span>•</span>
            <span>Zero server upload</span>
            <span>•</span>
            <span>Realtime hot reload</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="font-semibold">Unable to load database</p>
              <p className="text-xs opacity-90 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Technical Architecture Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-6">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Offline & Sandbox Safe</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Binary data is decoded 100% inside your browser environment. No telemetries, no server roundtrips.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
              <Cpu className="w-4 h-4 text-cyan-500" />
              <span>Native MDBX Parser</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Inspects lower-level B-tree pages, schema metadata, and IsarObject binary layouts directly.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
              <Code2 className="w-4 h-4 text-emerald-500" />
              <span>Reverse Engineering</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Auto-discovers collection structures, relations, and reverse-engineers production-ready Dart models.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto text-center text-xs text-slate-400 dark:text-slate-500 py-2">
        <p>Built for Flutter developers & QA engineers • MIT License</p>
      </footer>
    </div>
  );
};
