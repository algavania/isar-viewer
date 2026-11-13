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
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('isar-viewer-theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
    } catch {
      return true;
    }
  });
  const [autoWatch, setAutoWatch] = useState(false);
  const [watchedPath, setWatchedPath] = useState<string | null>(null);
  const [draggingOverApp, setDraggingOverApp] = useState(false);

  const fileHandleRef = useRef<FileSystemFileHandleLike | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const lastSizeRef = useRef<number>(0);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      try {
        localStorage.setItem('isar-viewer-theme', 'dark');
      } catch {}
    } else {
      root.classList.remove('dark');
      try {
        localStorage.setItem('isar-viewer-theme', 'light');
      } catch {}
    }
  }, [dark]);

  // Clean up SSE watcher on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  const loadFromFile = useCallback(
    async (file: File, keepSelection = false) => {
      setLoading(true);
      setError(null);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setWatchedPath(null);

      try {
        const buf = await file.arrayBuffer();
        if (buf.byteLength < 12288) {
          throw new Error('File is too small to be a valid .isar (MDBX) database.');
        }
        const parsed = parseIsarFile(buf, file.name);
        lastModifiedRef.current = file.lastModified;
        lastSizeRef.current = file.size;
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
    },
    [selectedCollection, selectedRow]
  );

  const handleInspectPath = useCallback(async (pathInput: string) => {
    const trimmed = pathInput.trim().replace(/^["']|["']$/g, '');
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    fileHandleRef.current = null;
    setAutoWatch(false);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(trimmed)}`);
      const contentType = res.headers.get('content-type') || '';

      // If running on a remote static website, /api/file returns index.html or 404
      if (!res.ok || contentType.includes('text/html')) {
        throw new Error(
          `Direct local path input requires running Isar Viewer locally (via npm run dev or npm run inspect). ` +
          `Due to web browser sandbox security, public websites cannot read files directly from your hard drive (${trimmed}). ` +
          `Please click "Open .isar File (Live Watch)" to select your file — it will auto-reload in realtime!`
        );
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength < 12288) {
        throw new Error(`File is too small to be a valid .isar (MDBX) database (${buf.byteLength} bytes).`);
      }

      const fileName = res.headers.get('X-File-Name') || trimmed.split(/[/\\]/).pop() || 'database.isar';
      const resolvedPath = res.headers.get('X-Resolved-Path') || trimmed;

      const parsed = parseIsarFile(buf, fileName);
      setDb(parsed);
      setSelectedCollection(parsed.collections[0]?.schema.name ?? '');
      setSelectedRow(null);
      setWatchedPath(resolvedPath);

      // Save to recent paths in localStorage
      try {
        const recents: string[] = JSON.parse(localStorage.getItem('isar-viewer-recent-paths') || '[]');
        const updated = [resolvedPath, ...recents.filter((p) => p !== resolvedPath)].slice(0, 5);
        localStorage.setItem('isar-viewer-recent-paths', JSON.stringify(updated));
      } catch {}

      // Setup Server-Sent Events (SSE) watcher for realtime updates
      const sse = new EventSource(`/api/watch?path=${encodeURIComponent(resolvedPath)}`);
      sseRef.current = sse;

      sse.addEventListener('change', async () => {
        try {
          const reloadRes = await fetch(`/api/file?path=${encodeURIComponent(resolvedPath)}`);
          if (!reloadRes.ok) return;
          const freshBuf = await reloadRes.arrayBuffer();
          const freshParsed = parseIsarFile(freshBuf, fileName);
          setDb(freshParsed);

          setSelectedCollection((prevCol) => {
            if (prevCol && freshParsed.collectionMap.has(prevCol)) return prevCol;
            return freshParsed.collections[0]?.schema.name ?? '';
          });

          setSelectedRow((prevRow) => {
            if (!prevRow) return null;
            for (const col of freshParsed.collections) {
              const found = col.rowById.get(prevRow.idLabel);
              if (found) return found;
            }
            return null;
          });
        } catch (e) {
          console.error('Failed to hot-reload database:', e);
        }
      });

      sse.onerror = () => {};
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Support ?path=... or ?inspect=... URL parameter on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPath = params.get('path') || params.get('inspect');
    if (targetPath) {
      handleInspectPath(targetPath);
    }
  }, [handleInspectPath]);

  const handleBackToLanding = useCallback(() => {
    setDb(null);
    setSelectedCollection('');
    setSelectedRow(null);
    setError(null);
    setWatchedPath(null);
    setAutoWatch(false);
    fileHandleRef.current = null;
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  const handleOpenPicker = async (enableWatch = true) => {
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
          if (enableWatch) {
            setAutoWatch(true);
          }
        }
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
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

  // Live watch polling when File System Access handle is active (1s interval)
  useEffect(() => {
    if (!autoWatch || !fileHandleRef.current) return;
    const timer = setInterval(async () => {
      try {
        const file = await fileHandleRef.current!.getFile();
        if (file.lastModified !== lastModifiedRef.current || file.size !== lastSizeRef.current) {
          lastSizeRef.current = file.size;
          await loadFromFile(file, true);
        }
      } catch {
        setAutoWatch(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [autoWatch, loadFromFile]);

  const handleLoadSample = async () => {
    setLoading(true);
    setError(null);
    fileHandleRef.current = null;
    setAutoWatch(false);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setWatchedPath(null);

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

  const handleDropEvent = async (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOverApp(false);

    // Try modern File System Access API from drag-and-drop items (Chrome, Edge, Arc)
    const item = e.dataTransfer.items?.[0];
    if (item && typeof (item as any).getAsFileSystemHandle === 'function') {
      try {
        const handle = await (item as any).getAsFileSystemHandle();
        if (handle && handle.kind === 'file') {
          fileHandleRef.current = handle;
          const file = await handle.getFile();
          await loadFromFile(file, false);
          setAutoWatch(true);
          return;
        }
      } catch (err) {
        console.warn('Could not get FileSystemHandle from drop event:', err);
      }
    }

    // Fallback for browsers without getAsFileSystemHandle (e.g. Firefox/Safari)
    const file = e.dataTransfer.files?.[0];
    if (file) {
      fileHandleRef.current = null;
      setAutoWatch(false);
      await loadFromFile(file, false);
    }
  };

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
          onOpenPicker={() => handleOpenPicker(true)}
          onDrop={handleDropEvent}
          onLoadSample={handleLoadSample}
          error={error}
          loading={loading}
          dark={dark}
          onToggleTheme={() => setDark((d) => !d)}
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
      onDrop={handleDropEvent}
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
        onOpenPicker={() => handleOpenPicker(true)}
        onReload={handleReload}
        canReload={Boolean(fileHandleRef.current)}
        autoWatch={autoWatch}
        onToggleAutoWatch={() => setAutoWatch((w) => !w)}
        dark={dark}
        onToggleTheme={() => setDark((d) => !d)}
        onBackToLanding={handleBackToLanding}
        watchedPath={watchedPath}
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
