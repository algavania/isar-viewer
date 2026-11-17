import React, { useState } from 'react';
import {
  X,
  Download,
  HardDrive,
  Smartphone,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { IsarDatabaseModel } from '../core/isarDatabase';
import { RowMutation, saveMutatedIsarDatabase } from '../core/mdbxModifier';
import { downloadBlob } from '../core/exportDatabase';

interface SaveIsarModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: IsarDatabaseModel;
  mutations: RowMutation[];
  watchedPath?: string | null;
  onClearMutations: () => void;
  onReloadDatabase?: () => void;
}

export const SaveIsarModal: React.FC<SaveIsarModalProps> = ({
  isOpen,
  onClose,
  db,
  mutations,
  watchedPath,
  onClearMutations,
  onReloadDatabase,
}) => {
  const defaultBaseName = db.fileName.replace(/\.isar$/i, '');
  const [filename, setFilename] = useState(`${defaultBaseName}-modified.isar`);
  const [savingDisk, setSavingDisk] = useState(false);
  const [diskSuccess, setDiskSuccess] = useState<string | null>(null);
  const [diskError, setDiskError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!isOpen) return null;

  const editsCount = mutations.filter((m) => m.action === 'edit').length;
  const deletesCount = mutations.filter((m) => m.action === 'delete').length;

  const handleDownload = () => {
    try {
      const newBuffer = saveMutatedIsarDatabase(db, mutations);
      const blob = new Blob([newBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, filename.endsWith('.isar') ? filename : `${filename}.isar`);
      onClearMutations();
      onClose();
    } catch (err) {
      alert(`Error saving .isar file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveToDisk = async () => {
    if (!watchedPath) return;
    setSavingDisk(true);
    setDiskError(null);
    setDiskSuccess(null);

    try {
      const newBuffer = saveMutatedIsarDatabase(db, mutations);
      const res = await fetch(`/api/save?path=${encodeURIComponent(watchedPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: newBuffer,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to save to disk');
      }

      setDiskSuccess(json.backupPath ? `Saved successfully! (Backup: ${json.backupPath})` : 'Saved successfully!');
      onClearMutations();
      setTimeout(() => {
        onReloadDatabase?.();
        onClose();
      }, 1200);
    } catch (err) {
      setDiskError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDisk(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const outName = filename.endsWith('.isar') ? filename : `${filename}.isar`;

  const adbCmd = `adb push ${outName} /data/local/tmp/${outName}\nadb shell run-as <your.package.name> cp /data/local/tmp/${outName} /data/data/<your.package.name>/app_flutter/default.isar`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">Save Modified .isar Database</h2>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-xs font-semibold">
              {mutations.length} change{mutations.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Change Summary Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Pending Changes Summary</h3>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400">
                ✏️ {editsCount} record{editsCount === 1 ? '' : 's'} edited
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                🗑️ {deletesCount} record{deletesCount === 1 ? '' : 's'} deleted
              </span>
            </div>
          </div>

          {/* Action 1: Download new .isar file */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Download as New .isar File
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="output.isar"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .isar</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Produces a 100% valid Isar v3 / MDBX database file ready to be copied into your app.
            </p>
          </div>

          {/* Action 2: Save to Disk directly if watchedPath is active */}
          {watchedPath && (
            <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    Direct Local Disk Overwrite
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate" title={watchedPath}>
                {watchedPath}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400">
                  Automatically creates a backup (<code className="font-mono text-slate-500">.bak</code>) before saving.
                </span>
                <button
                  type="button"
                  disabled={savingDisk}
                  onClick={handleSaveToDisk}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingDisk ? 'Saving...' : 'Overwrite on Disk'}</span>
                </button>
              </div>

              {diskSuccess && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{diskSuccess}</span>
                </div>
              )}
              {diskError && (
                <div className="text-xs text-rose-500 flex items-center gap-1.5 pt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{diskError}</span>
                </div>
              )}
            </div>
          )}

          {/* Guide: Push to Flutter Phone / Emulator */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Push Back to Flutter Phone / Emulator
              </h3>
            </div>

            {/* Android ADB */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Android Emulator / Device (via ADB):
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(adbCmd, 'adb')}
                  className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedCmd === 'adb' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd === 'adb' ? 'Copied' : 'Copy ADB'}</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto p-2 rounded bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60">
                {adbCmd}
              </pre>
            </div>

            {/* iOS Simulator */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                iOS Simulator:
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Simply replace the <code className="font-mono text-slate-700 dark:text-slate-300">default.isar</code> inside your app's Simulator container Documents directory, then hot-restart Flutter (<kbd className="font-mono">R</kbd>).
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClearMutations}
            className="text-xs text-rose-500 hover:text-rose-600 cursor-pointer font-medium"
          >
            Discard All Changes
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
