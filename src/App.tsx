import { useState, useRef, useEffect, useCallback } from 'react';
import { parseIsarFile, IsarDatabaseModel, DecodedRow } from './core/isarDatabase';
import { DropZone } from './components/DropZone';
import { TopBar, AppView } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { DataTable } from './components/DataTable';
import { RowInspector } from './components/RowInspector';
import { SchemaView } from './components/SchemaView';
import { MdbxInternalsView } from './components/MdbxInternalsView';

interface FileSystemFileHandleLike {
  getFile: () => Promise<File>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike[]>;
  }
}

export function App() {
  const [db, setDb] = useState<IsarDatabaseModel | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [selectedRow, setSelectedRow] = useState<DecodedRow | null>(null);
  const [activeView, setActiveView] = useState<AppView>('data');
  const [focusedSchema, setFocusedSchema] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(true);
  const [autoWatch, setAutoWatch] = useState(false);
  const [draggingOverApp, setDraggingOverApp] = useState(false);

  const fileHandleRef = useRef<FileSystemFileHandleLike | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  const loadFromFile = useCallback(async (file: File, keepSelection = false) => {
    setLoading(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseIsarFile(buf, file.name);
      lastModifiedRef.current = file.lastModified;
      setDb(parsed);

      if (!keepSelection || !parsed.collectionMap.has(selectedCollection)) {
        setSelectedCollection(parsed.collections[0]?.schema.name ?? '');
        setSelectedRow(null);
      } else if (selectedRow) {
        const refreshedCol = parsed.collectionMap.get(selectedCollection);
        setSelectedRow(refreshedCol?.rowById.get(selectedRow.idLabel) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedCollection, selectedRow]);

  const handleOpenPicker = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Isar Database Files',
              accept: { 'application/octet-stream': ['.isar'] },
            },
          ],
          multiple: false,
        });
        if (handle) {
          fileHandleRef.current = handle;
          const file = await handle.getFile();
          await loadFromFile(file, false);
        }
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        // Fall back to standard file input
      }
    }
    hiddenInputRef.current?.click();
  };

  const handleReload = useCallback(async () => {
    if (!fileHandleRef.current) return;
    try {
      const file = await fileHandleRef.current.getFile();
      await loadFromFile(file, true);
    } catch {
      setAutoWatch(false);
    }
  }, [loadFromFile]);

  // Live watch polling when File System Access handle is active
  useEffect(() => {
    if (!autoWatch || !fileHandleRef.current) return;
    const timer = setInterval(async () => {
      try {
        const file = await fileHandleRef.current!.getFile();
        if (file.lastModified !== lastModifiedRef.current) {
          await loadFromFile(file, true);
        }
      } catch {
        setAutoWatch(false);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [autoWatch, loadFromFile]);

  const handleLoadSample = async () => {
    setLoading(true);
    setError(null);
    fileHandleRef.current = null;
    setAutoWatch(false);
    try {
      const res = await fetch('/sample.isar');
      if (!res.ok) throw new Error('Failed to fetch sample.isar');
      const buf = await res.arrayBuffer();
      const parsed = parseIsarFile(buf, 'sample.isar');
      setDb(parsed);
      setSelectedCollection(parsed.collections[0]?.schema.name ?? '');
      setSelectedRow(null);
      setActiveView('data');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToRecord = (collectionName: string, rowId: string) => {
    if (!db) return;
    const col = db.collectionMap.get(collectionName);
    if (!col) return;
    setSelectedCollection(collectionName);
    setActiveView('data');
    const row = col.rowById.get(rowId) ?? null;
    setSelectedRow(row);
  };

  const currentCol = db?.collectionMap.get(selectedCollection) ?? null;

  // Keyboard navigation (Escape closes drawer, Up/Down steps rows)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!db || activeView !== 'data' || !currentCol) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' && selectedRow) {
        setSelectedRow(null);
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selectedRow) {
        e.preventDefault();
        const idx = currentCol.rows.findIndex((r) => r.idLabel === selectedRow.idLabel);
        if (idx >= 0) {
          const nextIdx =
            e.key === 'ArrowDown'
              ? Math.min(currentCol.rows.length - 1, idx + 1)
              : Math.max(0, idx - 1);
          setSelectedRow(currentCol.rows[nextIdx]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [db, activeView, currentCol, selectedRow]);

  const hiddenInput = (
    <input
      ref={hiddenInputRef}
      type="file"
      accept=".isar,application/octet-stream"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) {
          fileHandleRef.current = null;
          setAutoWatch(false);
          loadFromFile(f, false);
        }
        e.target.value = '';
      }}
    />
  );

  if (!db) {
    return (
      <>
        {hiddenInput}
        <DropZone
          onOpenPicker={handleOpenPicker}
          onDropFile={(f) => {
            fileHandleRef.current = null;
            setAutoWatch(false);
            loadFromFile(f, false);
          }}
          onLoadSample={handleLoadSample}
          error={error}
          loading={loading}
        />
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDraggingOverApp(true);
      }}
      onDragLeave={() => setDraggingOverApp(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingOverApp(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
          fileHandleRef.current = null;
          setAutoWatch(false);
          loadFromFile(f, false);
        }
      }}
      className="h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden relative"
    >
      {hiddenInput}

      {draggingOverApp && (
        <div className="absolute inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-emerald-500 m-2 rounded-2xl pointer-events-none">
          <div className="px-6 py-4 rounded-2xl bg-slate-900 border border-emerald-500/50 text-emerald-300 font-semibold text-base shadow-2xl">
            Drop .isar file to switch database
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-rose-600 text-white text-xs flex items-center justify-between">
          <span>Error: {error}</span>
          <button type="button" onClick={() => setError(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <TopBar
        db={db}
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenPicker={handleOpenPicker}
        onReload={handleReload}
        canReload={Boolean(fileHandleRef.current)}
        autoWatch={autoWatch}
        onToggleAutoWatch={() => setAutoWatch((w) => !w)}
        dark={dark}
        onToggleTheme={() => setDark((d) => !d)}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar
          db={db}
          selectedCollection={selectedCollection}
          onSelectCollection={(name) => {
            setSelectedCollection(name);
            setSelectedRow(null);
            setActiveView('data');
          }}
          onSelectEmbedded={(name) => {
            setFocusedSchema(name);
            setActiveView('schema');
          }}
        />

        {activeView === 'data' && currentCol && (
          <>
            <DataTable
              collection={currentCol}
              selectedRowId={selectedRow?.idLabel ?? null}
              onSelectRow={setSelectedRow}
            />
            {selectedRow && (
              <RowInspector
                db={db}
                collection={currentCol}
                row={selectedRow}
                onClose={() => setSelectedRow(null)}
                onNavigateToRecord={handleNavigateToRecord}
              />
            )}
          </>
        )}

        {activeView === 'schema' && (
          <SchemaView
            db={db}
            focusedSchema={focusedSchema}
            onBrowseCollection={(name) => {
              setSelectedCollection(name);
              setSelectedRow(null);
              setActiveView('data');
            }}
          />
        )}

        {activeView === 'internals' && <MdbxInternalsView db={db} />}
      </div>
    </div>
  );
}

export default App;
