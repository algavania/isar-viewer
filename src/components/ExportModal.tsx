import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Archive,
  Download,
  Check,
  Table,
  Search,
  Sliders,
  Loader2,
  CheckCircle2,
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
  const [baseFilename, setBaseFilename] = useState(`${defaultBaseName}-export`);
  const [pretty, setPretty] = useState(() => db.totalRows < 5000);
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

  // Track previous isOpen so state only resets on fresh open transition, never while typing
  const prevIsOpenRef = React.useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setBaseFilename(`${defaultBaseName}-export`);
      setSelectedColNames(new Set(db.collections.map((c) => c.schema.name)));
      setPretty(db.totalRows < 5000);
      setIsExporting(false);
      setProgress(null);
      setSuccessInfo(null);
      setFilterSearch('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, defaultBaseName, db]);

  // Handle ESC key
  useEffect(() => {
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

    const finalFilename = `${(baseFilename.trim() || defaultBaseName).replace(/\.zip$/i, '')}.zip`;

    try {
      const result = await exportDatabaseToJsonZip(
        db,
        {
          filename: finalFilename,
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
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Export to JSON Archive (.zip)
              </h2>
              <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {db.fileName} • {db.collections.length} collections • {db.totalRows.toLocaleString()} rows
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

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* File Name Field */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Archive Name
            </label>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/20">
              <input
                type="text"
                value={baseFilename}
                onChange={(e) => setBaseFilename(e.target.value)}
                disabled={isExporting}
                placeholder="database-export"
                className="flex-1 px-3 py-1.5 bg-transparent font-mono text-xs focus:outline-none text-slate-800 dark:text-slate-200"
              />
              <span className="px-2.5 py-1.5 bg-slate-200/60 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 select-none">
                .zip
              </span>
            </div>
          </div>

          {/* Collection Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200 text-xs">
                  Collections to Export
                </span>
                <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {selectedCount} of {db.collections.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={isExporting}
                  className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={isExporting}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Filter Search (shown if > 4 collections) */}
            {db.collections.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Filter collections..."
                  className="w-full pl-8 pr-7 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500/60 text-slate-800 dark:text-slate-200"
                />
                {filterSearch && (
                  <button
                    type="button"
                    onClick={() => setFilterSearch('')}
                    title="Clear filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Collection Items Checklist */}
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40">
              {filteredCollections.map((col) => {
                const isChecked = selectedColNames.has(col.schema.name);
                return (
                  <div
                    key={col.schema.name}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    onClick={() => !isExporting && toggleCollection(col.schema.name)}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !isExporting) {
                        e.preventDefault();
                        toggleCollection(col.schema.name);
                      }
                    }}
                    className={`group px-3 py-2 flex items-center justify-between transition-colors cursor-pointer select-none ${
                      isChecked
                        ? 'bg-emerald-500/5 dark:bg-emerald-500/10 hover:bg-emerald-500/10'
                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <Table className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {col.schema.name}.json
                      </span>
                    </div>

                    <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      {col.rows.length.toLocaleString()} rows
                    </span>
                  </div>
                );
              })}

              {filteredCollections.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">No matching collections found</div>
              )}
            </div>
          </div>

          {/* Options Strip */}
          <div className="pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-2">
              <Sliders className="w-3 h-3" />
              <span>Formatting Options</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pretty}
                  onChange={(e) => setPretty(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span>Pretty JSON</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLinks}
                  onChange={(e) => setIncludeLinks(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span>Include Links</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSchema}
                  onChange={(e) => setIncludeSchema(e.target.checked)}
                  disabled={isExporting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span>Include Schema</span>
              </label>
            </div>
          </div>

          {/* Export Progress Notification */}
          {progress && isExporting && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    {progress.phase === 'serializing' && `Bundling ${progress.collectionName || ''}...`}
                    {progress.phase === 'compressing' && 'Compressing into ZIP...'}
                    {progress.phase === 'done' && 'Finalizing download...'}
                  </span>
                </span>
                <span className="font-mono tabular-nums">{progress.percent}%</span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200/50 dark:bg-emerald-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Export Success Notification */}
          {successInfo && !isExporting && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs">
                  Downloaded <strong>{successInfo.filename}</strong> ({formatBytes(successInfo.size)})
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {selectedCount > 0
              ? `${totalRowsSelected.toLocaleString()} rows in ${selectedCount} files`
              : 'No collection selected'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer text-xs disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={selectedCount === 0 || isExporting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download ZIP</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
