// IndexedDB setup — single database, single object store for MVP

const DB_NAME = "graph-designer";
const DB_VERSION = 1;

export const STORE_GRAPHS = "graphs";

let _db: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_GRAPHS)) {
        db.createObjectStore(STORE_GRAPHS, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export function getStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}
