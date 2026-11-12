/** IndexedDB mini (tanpa dependensi) untuk menyimpan file audio unduhan */
const DB = 'sb-offline';
const STORE = 'audio';
const PARTIAL_STORE = 'partial';
const DB_VERSION = 2;  // v2: partial download chunks untuk resume

export interface PartialDownload {
  videoId: string;
  chunks: Blob[];
  /** Bytes already persisted */
  size: number;
  /** Full stream size when known */
  total?: number;
  /** Prevent combining chunks obtained from different download paths */
  source?: 'device' | 'server';
  mime: string;
  updatedAt: number;
}
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(PARTIAL_STORE)) req.result.createObjectStore(PARTIAL_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error || r.error);
    t.onabort = () => reject(t.error || new Error('Transaksi dibatalkan'));
  });
}

export const audioDb = {
  get: (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id)),
  put: (id: string, blob: Blob) => tx<IDBValidKey>('readwrite', (s) => s.put(blob, id)),
  del: (id: string) => tx<undefined>('readwrite', (s) => s.delete(id)),
  keys: () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
  clear: () => tx<undefined>('readwrite', (s) => s.clear()),
  getPartial: (id: string) => tx<PartialDownload | undefined>('readonly', (s) => s.get(id), PARTIAL_STORE),
  putPartial: (id: string, value: PartialDownload) => tx<IDBValidKey>('readwrite', (s) => s.put(value, id), PARTIAL_STORE),
  delPartial: (id: string) => tx<undefined>('readwrite', (s) => s.delete(id), PARTIAL_STORE),
};
