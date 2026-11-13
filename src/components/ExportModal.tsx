import React, { useState, useMemo } from 'react';
import {
  X,
  Archive,
  Download,
  Check,
  Table,
  CheckSquare,
  Square,
  Search,
  Sliders,
  Loader2,
  FileArchive,
} from 'lucide-react';
import { IsarDatabaseModel } from '../core/isarDatabase';
import { exportDatabaseToJsonZip, downloadBlob, ExportProgress } from '../core/exportDatabase';
import { formatBytes } from './TopBar';

interface ExportModalProps {
  db: IsarDatabaseModel;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ db, isOpen, onClose }) => {
  const defaultBaseName = db.fileName.replace(/\.isar$/i, '') || 'isar_database';
  const [filename, setFilename] = useState(`${defaultBaseName}-export.zip`);
  const [pretty, setPretty] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeSchema, setIncludeSchema] = useState(true);

  // Selected collections state (default: all)
  const [selectedColNames, setSelectedColNames] = useState<Set<string>>(() => {
    return new Set(db.collections.map((c) => c.schema.name));
  });

  const [filterSearch, setFilterSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ size: number; filename: string } | null>(null);

  // Reset when opened
  React.useEffect(() => {
    if (isOpen) {
      setFilename(`${defaultBaseName}-export.zip`);
      setSelectedColNames(new Set(db.collections.map((c) => c.schema.name)));
      setIsExporting(false);
      setProgress(null);
      setSuccessInfo(null);
      setFilterSearch('');
    }
  }, [isOpen, defaultBaseName, db.collections]);

  // Handle ESC key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  const filteredCollections = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return db.collections;
    return db.collections.filter((c) => c.schema.name.toLowerCase().includes(q));
  }, [db.collections, filterSearch]);

  const selectedCount = selectedColNames.size;
  const totalRowsSelected = useMemo(() => {
    return db.collections
      .filter((c) => selectedColNames.has(c.schema.name))
      .reduce((sum, c) => sum + c.rows.length, 0);
  }, [db.collections, selectedColNames]);

  const toggleCollection = (name: string) => {
    setSelectedColNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedColNames(new Set(db.collections.map((c) => c.schema.name)));
  };

  const handleDeselectAll = () => {
    setSelectedColNames(new Set());
  };

  const handleExport = async () => {
    if (selectedCount === 0 || isExporting) return;
    setIsExporting(true);
    setSuccessInfo(null);

    try {
      const result = await exportDatabaseToJsonZip(
        db,
        {
          filename,
          pretty,
          includeLinks,
          includeSchema,
          selectedCollections: Array.from(selectedColNames),
        },
        (prog) => setProgress(prog)
      );

      downloadBlob(result.blob, result.filename);
      setSuccessInfo({ size: result.byteSize, filename: result.filename });
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none">
      <div
        className="w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Convert Isar to JSON (.zip)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Export all collections as individual JSON files bundled into a single ZIP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Summary Banner */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileArchive className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="font-mono font-medium truncate max-w-[200px]" title={db.fileName}>
                {db.fileName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {db.collections.length} collections
              </span>
              <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {db.totalRows.toLocaleString()} rows
              </span>
            </div>
          </div>

          {/* Filename Input */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
              ZIP Archive File Name
            </label>
            <div className="flex items-center">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={isExporting}
                placeholder="database-export.zip"
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          {/* Options */}
          <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Sliders className="w-3 h-3" />
              <span>Export Options</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pretty}
                  onChange={(e) => setPretty(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-slate-700 dark:text-slate-300">Pretty-format JSON (2 spaces)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLinks}
                  onChange={(e) => setIncludeLinks(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-slate-700 dark:text-slate-300">Include link relations (@link:*)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={includeSchema}
                  onChange={(e) => setIncludeSchema(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Include <code className="font-mono text-emerald-600 dark:text-emerald-400">_schema.json</code>{' '}
                  metadata
                </span>
              </label>
            </div>
          </div>

          {/* Collections Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Collections ({selectedCount} of {db.collections.length} selected,{' '}
                {totalRowsSelected.toLocaleString()} rows)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={isExporting}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={isExporting}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {db.collections.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Filter collections..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            )}

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30">
              {filteredCollections.map((col) => {
                const isChecked = selectedColNames.has(col.schema.name);
                return (
                  <div
                    key={col.schema.name}
                    onClick={() => !isExporting && toggleCollection(col.schema.name)}
                    className="px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-900/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <Table className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate font-mono">
                        {col.schema.name}.json
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                      {col.rows.length.toLocaleString()} rows
                    </span>
                  </div>
                );
              })}
              {filteredCollections.length === 0 && (
                <div className="p-4 text-center text-slate-400 italic">No collections found</div>
              )}
            </div>
          </div>

          {/* Progress / Success Info */}
          {progress && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="flex items-center gap-1.5">
                  {isExporting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3 text-emerald-500" />
                  )}
                  {progress.phase === 'serializing' &&
                    `Serializing ${progress.collectionName || ''} (${progress.processedCollections + 1}/${progress.totalCollections})...`}
                  {progress.phase === 'compressing' && 'Compressing into ZIP archive...'}
                  {progress.phase === 'done' && 'Export completed and downloaded!'}
                </span>
                <span className="font-mono">{progress.percent}%</span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200/50 dark:bg-emerald-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {successInfo && !isExporting && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Downloaded <strong>{successInfo.filename}</strong> ({formatBytes(successInfo.size)})
                </span>
              </div>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20">
                Ready
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {selectedCount > 0
              ? `${selectedCount} JSON files will be in ${filename}`
              : 'Select at least 1 collection'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer text-xs disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={selectedCount === 0 || isExporting}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting ZIP...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export ZIP ({totalRowsSelected.toLocaleString()} rows)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
