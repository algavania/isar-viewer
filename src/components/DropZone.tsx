import React, { useState, useEffect } from 'react';
import {
  Database,
  Upload,
  Sparkles,
  ShieldCheck,
  Layers,
  GitFork,
  AlertCircle,
  Sun,
  Moon,
  Radio,
  Terminal,
  FolderOpen,
  Info,
} from 'lucide-react';

interface DropZoneProps {
  onOpenPicker: () => void;
  onDropFile: (file: File) => void;
  onLoadSample: () => void;
  onInspectPath: (path: string) => Promise<void>;
  error: string | null;
  loading: boolean;
  dark: boolean;
  onToggleTheme: () => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onOpenPicker,
  onDropFile,
  onLoadSample,
  onInspectPath,
  error,
  loading,
  dark,
  onToggleTheme,
}) => {
  const [dragging, setDragging] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [isServerReady, setIsServerReady] = useState<boolean>(false);

  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]');

  // Load recent paths from localStorage and check dev server status
  useEffect(() => {
    try {
      const stored = localStorage.getItem('isar-viewer-recent-paths');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentPaths(parsed.slice(0, 4));
          if (parsed[0]) setPathInput(parsed[0]);
        }
      }
    } catch {}

    // Check if local dev/preview server is responding with actual JSON
    fetch('/api/status')
      .then((r) => {
        const contentType = r.headers.get('content-type') || '';
        if (r.ok && contentType.includes('application/json')) {
          return r.json();
        }
        return null;
      })
      .then((data) => setIsServerReady(Boolean(data?.ok)))
      .catch(() => setIsServerReady(false));
  }, []);

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

  const handlePathSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInput.trim() || loading) return;

    if (!isLocalHost && !isServerReady) {
      // On remote web, direct local path reading is blocked by browser sandbox
      // Guide user to the native file picker which enables direct disk Live Watch
      onOpenPicker();
      return;
    }

    await onInspectPath(pathInput.trim());
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden"
    >
      {/* Light / Dark Mode Toggle in Landing Page */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm backdrop-blur-md flex items-center gap-2 text-xs font-medium transition-all cursor-pointer"
        >
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

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

        {/* Realtime Path Inspector Card */}
        <div className="mb-5 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 p-5 shadow-xl backdrop-blur-xl transition-all">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Realtime Path Inspector
              </h3>
            </div>
            {isServerReady ? (
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Node Engine Active
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                Web Sandbox Mode
              </span>
            )}
          </div>

          {!isLocalHost && !isServerReady ? (
            <div className="mb-3.5 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200 text-xs leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
              <div>
                <p className="font-semibold mb-0.5">Running on Hosted Web ({window.location.hostname})</p>
                <p className="text-[11px] opacity-90">
                  Browser security sandbox strictly forbids web pages from reading hard drive path strings (e.g.{' '}
                  <code className="font-mono bg-sky-100 dark:bg-sky-900/60 px-1 py-0.2 rounded">/Users/...</code> or{' '}
                  <code className="font-mono bg-sky-100 dark:bg-sky-900/60 px-1 py-0.2 rounded">C:\...</code>) directly.
                </p>
                <p className="text-[11px] mt-1 text-emerald-700 dark:text-emerald-400 font-medium">
                  👉 To inspect and auto-watch your local file in realtime here, click{' '}
                  <strong className="underline cursor-pointer" onClick={onOpenPicker}>
                    "Open .isar File (Live Watch)"
                  </strong>{' '}
                  below.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Specify your local <code className="text-emerald-600 dark:text-emerald-400 font-mono">.isar</code> file path.
              The viewer will inspect it and automatically re-render in realtime as your Flutter app writes changes.
            </p>
          )}

          <form onSubmit={handlePathSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Terminal className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="/path/to/your/flutter_app/default.isar or ./public/sample.isar"
                className="w-full pl-9 pr-3 py-2.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !pathInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
            >
              {isServerReady ? (
                <>
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>{loading ? 'Inspecting...' : 'Inspect Realtime'}</span>
                </>
              ) : (
                <>
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Select & Live Watch</span>
                </>
              )}
            </button>
          </form>

          {/* Quick suggestions / recent paths */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 text-[10px] uppercase font-semibold">Quick Test:</span>
            <button
              type="button"
              onClick={() => {
                if (isServerReady) {
                  setPathInput('./public/sample.isar');
                  onInspectPath('./public/sample.isar');
                } else {
                  onLoadSample();
                }
              }}
              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-500/10 hover:text-emerald-500 text-slate-600 dark:text-slate-300 font-mono transition-colors cursor-pointer"
            >
              ./public/sample.isar
            </button>
            {recentPaths
              .filter((p) => p !== './public/sample.isar')
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPathInput(p);
                    if (isServerReady) {
                      onInspectPath(p);
                    } else {
                      onOpenPicker();
                    }
                  }}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-500/10 hover:text-emerald-500 text-slate-600 dark:text-slate-300 font-mono truncate max-w-[200px] transition-colors cursor-pointer"
                  title={p}
                >
                  {p.split(/[/\\]/).pop()}
                </button>
              ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative flex py-2 items-center mb-5">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800/90"></div>
          <span className="flex-shrink mx-4 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Native Browser File System (Direct Disk Access)
          </span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800/90"></div>
        </div>

        {/* Drag & Drop Area */}
        <div
          onClick={onOpenPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpenPicker()}
          className={`group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-xl ${
            dragging
              ? 'border-emerald-500 bg-emerald-500/5 scale-[1.01] shadow-emerald-500/15'
              : 'border-slate-300 dark:border-slate-700/80 hover:border-emerald-500/70 hover:bg-white dark:hover:bg-slate-900'
          }`}
        >
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-3 group-hover:scale-105 group-hover:border-emerald-500/50 transition-transform">
            <Upload className={`w-5 h-5 ${dragging ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-300'}`} />
          </div>

          <h2 className="text-base font-semibold mb-1">
            {loading ? 'Parsing .isar database...' : 'Drop your .isar file here'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            or click to select from your computer — automatically activates Live Watch mode!
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md shadow-emerald-600/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-200" />
              <span>Open .isar File (Live Watch)</span>
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Load Sample Database
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Notice</p>
              <p className="opacity-90 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              100% Local & Safe
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Parsed directly in memory. Your database never leaves your machine.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400 mb-1">
              <Layers className="w-4 h-4" />
              Auto Schema Discovery
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Reads embedded <code className="text-[10px]">_info</code> schemas, tombstones, and binary records.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400 mb-1">
              <GitFork className="w-4 h-4" />
              Realtime Live Watch
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Hot-reloads grid and schemas whenever Flutter updates the <code className="text-[10px]">.isar</code> file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
