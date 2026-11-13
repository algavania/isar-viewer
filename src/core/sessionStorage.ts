import type { AppView } from '../components/TopBar';

const DB_NAME = 'isar-viewer-cache';
const STORE_NAME = 'active_session';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface ActiveSessionData {
  fileName: string;
  buffer: ArrayBuffer;
  handle?: any | null;
  selectedCollection?: string;
  activeView?: AppView;
  lastModified?: number;
}

export async function saveActiveSession(data: ActiveSessionData): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.put(data.buffer, 'buffer');
      store.put(
        {
          fileName: data.fileName,
          selectedCollection: data.selectedCollection,
          activeView: data.activeView,
          lastModified: data.lastModified,
        },
        'metadata'
      );

      if (data.handle) {
        try {
          store.put(data.handle, 'handle');
        } catch {
          // If handle cannot be serialized, skip storing handle
        }
      } else {
        store.delete('handle');
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function restoreActiveSession(): Promise<ActiveSessionData | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const bufferReq = store.get('buffer');
      const metaReq = store.get('metadata');
      const handleReq = store.get('handle');

      tx.oncomplete = () => {
        const buffer = bufferReq.result as ArrayBuffer | undefined;
        const meta = metaReq.result as
          | {
              fileName: string;
              selectedCollection?: string;
              activeView?: AppView;
              lastModified?: number;
            }
          | undefined;
        const handle = handleReq.result;

        if (!buffer || !meta) {
          resolve(null);
          return;
        }

        resolve({
          fileName: meta.fileName,
          buffer,
          handle: handle || null,
          selectedCollection: meta.selectedCollection,
          activeView: meta.activeView,
          lastModified: meta.lastModified,
        });
      };

      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function updateSessionMetadata(update: {
  selectedCollection?: string;
  activeView?: AppView;
}): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const metaReq = store.get('metadata');

      metaReq.onsuccess = () => {
        if (metaReq.result) {
          const newMeta = {
            ...metaReq.result,
            ...update,
          };
          store.put(newMeta, 'metadata');
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearActiveSession(): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
