/**
 * 一括バックアップ / 復元
 * localStorage の全アプリデータ + dailyLog + IndexedDB 録音を
 * 1つの JSON にまとめてエクスポート/インポートする。
 */

import { exportRecordings, importRecordings, type RecordingExportEntry } from './recordingDb';

const APP_PREFIX = 'pres-practice';
const DAILY_KEY = 'pres-practice-daily-log';
const BACKUP_FORMAT_VERSION = 1;

export interface BackupData {
  formatVersion: number;
  createdAt: number;
  localStorage: Record<string, string>;
  dailyLog: string | null;
  recordings: RecordingExportEntry[];
}

/** localStorage からアプリ関連のキーだけ抽出する */
function getAppLocalStorage(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(APP_PREFIX)) {
        const val = localStorage.getItem(key);
        if (val !== null) result[key] = val;
      }
    }
  } catch { /* ignore */ }
  return result;
}

/**
 * 全データをエクスポートする。
 * 録音データの取得は非同期なので Promise を返す。
 */
export async function createBackup(): Promise<BackupData> {
  const lsData = getAppLocalStorage();

  let dailyLog: string | null = null;
  try { dailyLog = localStorage.getItem(DAILY_KEY); } catch { /* ignore */ }

  let recordings: RecordingExportEntry[] = [];
  try { recordings = await exportRecordings(); } catch { /* ignore */ }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: Date.now(),
    localStorage: lsData,
    dailyLog,
    recordings,
  };
}

/** バックアップ JSON をダウンロードする */
export async function downloadBackup(): Promise<void> {
  const data = await createBackup();
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `pres-practice-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * バックアップ JSON から復元する。
 * 復元できるデータだけ復元し、不正部分はスキップする。
 * @returns 復元結果のサマリー
 */
export async function restoreBackup(file: File): Promise<string> {
  const text = await file.text();
  let data: BackupData;
  try {
    data = JSON.parse(text);
  } catch {
    return 'JSONの読み込みに失敗しました。ファイル形式を確認してください。';
  }

  if (typeof data !== 'object' || data === null) {
    return '不正なバックアップ形式です。';
  }

  const results: string[] = [];

  // localStorage 復元
  if (data.localStorage && typeof data.localStorage === 'object') {
    try {
      let count = 0;
      for (const [key, val] of Object.entries(data.localStorage)) {
        if (typeof key === 'string' && key.startsWith(APP_PREFIX) && typeof val === 'string') {
          localStorage.setItem(key, val);
          count++;
        }
      }
      results.push(`設定・台本: ${count}項目`);
    } catch {
      results.push('設定の復元に失敗');
    }
  }

  // dailyLog 復元
  if (typeof data.dailyLog === 'string') {
    try {
      localStorage.setItem(DAILY_KEY, data.dailyLog);
      results.push('日別ログ: 復元済み');
    } catch {
      results.push('日別ログの復元に失敗');
    }
  }

  // 録音データ復元
  if (Array.isArray(data.recordings) && data.recordings.length > 0) {
    try {
      const count = await importRecordings(data.recordings);
      results.push(`録音データ: ${count}件`);
    } catch {
      results.push('録音データの復元に失敗');
    }
  }

  if (results.length === 0) {
    return '復元可能なデータが見つかりませんでした。';
  }

  return `復元完了: ${results.join(' / ')}`;
}
