/**
 * IndexedDB を使った録音データの永続化
 * - scriptId + sentenceIndex で管理
 * - 未対応環境では全関数が安全に失敗する
 */

const DB_NAME = 'pres-practice-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

/** IndexedDB が利用可能か */
export function hasIndexedDB(): boolean {
  try { return typeof indexedDB !== 'undefined'; } catch { return false; }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeKey(scriptId: string, index: number): string {
  return `${scriptId}__${index}`;
}

/** 録音を保存 */
export async function saveRecording(scriptId: string, index: number, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, makeKey(scriptId, index));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

/** 録音を取得 */
export async function loadRecording(scriptId: string, index: number): Promise<Blob | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(makeKey(scriptId, index));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

/** 録音を削除 */
export async function deleteRecording(scriptId: string, index: number): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(makeKey(scriptId, index));
    return new Promise((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  } catch { /* ignore */ }
}

/** 指定scriptIdの全録音キーを取得（録音有無の一括チェック用） */
export async function listRecordingKeys(scriptId: string): Promise<number[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const prefix = `${scriptId}__`;
        const indices = (req.result as string[])
          .filter((k) => typeof k === 'string' && k.startsWith(prefix))
          .map((k) => parseInt(k.slice(prefix.length), 10))
          .filter((n) => Number.isFinite(n));
        resolve(indices);
      };
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}
