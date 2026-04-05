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

// --- エクスポート / インポート ---

/** Blob → Base64 文字列 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Failed to read blob'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Base64 文字列 → Blob */
function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'audio/webm';
  const bytes = atob(data ?? '');
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** エクスポート用データ型 */
export interface RecordingExportEntry {
  scriptId: string;
  sentenceIndex: number;
  mimeType: string;
  dataUrl: string; // Base64
}

/**
 * 指定 scriptId の全録音を Base64 JSON としてエクスポートする。
 * scriptId を省略するとDB全体をエクスポートする。
 */
export async function exportRecordings(scriptId?: string): Promise<RecordingExportEntry[]> {
  if (!hasIndexedDB()) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allKeys = await new Promise<IDBValidKey[]>((resolve) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });

    const entries: RecordingExportEntry[] = [];
    for (const key of allKeys) {
      if (typeof key !== 'string') continue;
      const parts = key.split('__');
      if (parts.length !== 2) continue;
      const sid = parts[0];
      const idx = parseInt(parts[1], 10);
      if (!Number.isFinite(idx)) continue;
      if (scriptId && sid !== scriptId) continue;

      const blob = await new Promise<Blob | null>((resolve) => {
        const tx2 = db.transaction(STORE_NAME, 'readonly');
        const req = tx2.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
        req.onerror = () => resolve(null);
      });
      if (!blob) continue;
      const dataUrl = await blobToBase64(blob);
      entries.push({ scriptId: sid, sentenceIndex: idx, mimeType: blob.type, dataUrl });
    }
    return entries;
  } catch { return []; }
}

/**
 * エクスポートデータを IndexedDB にインポートする。
 * 既存のキーは上書きされる。
 * @returns インポートした件数
 */
export async function importRecordings(entries: RecordingExportEntry[]): Promise<number> {
  if (!hasIndexedDB()) return 0;
  let count = 0;
  try {
    const db = await openDb();
    for (const entry of entries) {
      if (!entry.scriptId || !Number.isFinite(entry.sentenceIndex) || !entry.dataUrl) continue;
      try {
        const blob = base64ToBlob(entry.dataUrl);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, makeKey(entry.scriptId, entry.sentenceIndex));
        await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
        count++;
      } catch { /* skip invalid entry */ }
    }
  } catch { /* ignore */ }
  return count;
}
