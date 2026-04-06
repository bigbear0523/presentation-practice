/**
 * 一括バックアップ / 復元
 * localStorage の全アプリデータ + dailyLog + IndexedDB 録音を
 * 1つの JSON にまとめてエクスポート/インポートする。
 */

import { exportRecordings, importRecordings, listRecordingKeys, type RecordingExportEntry } from './recordingDb';

const APP_PREFIX = 'pres-practice';
const DAILY_KEY = 'pres-practice-daily-log';
const BACKUP_FORMAT_VERSION = 2;

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

/** バックアップファイルの内容サマリーを取得する（復元前確認用） */
export async function getBackupSummary(file: File): Promise<string> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return '不正なファイル形式';
    const parts: string[] = [];
    parts.push(`フォーマット: v${data.formatVersion ?? '?'}`);
    if (data.createdAt) {
      const d = new Date(data.createdAt);
      parts.push(`作成日時: ${d.toLocaleDateString('ja-JP')} ${d.toLocaleTimeString('ja-JP')}`);
    }
    if (data.localStorage && typeof data.localStorage === 'object') {
      const count = Object.keys(data.localStorage).length;
      parts.push(`設定項目: ${count}件`);
      // 台本数カウント
      const scriptsRaw = data.localStorage['pres-practice-scripts'];
      if (scriptsRaw) {
        try {
          const scripts = JSON.parse(scriptsRaw);
          if (Array.isArray(scripts)) parts.push(`台本: ${scripts.length}件`);
        } catch { /* ignore */ }
      }
    }
    if (data.dailyLog) parts.push('日別ログ: あり');
    if (Array.isArray(data.recordings)) parts.push(`録音データ: ${data.recordings.length}件`);
    return parts.join('\n');
  } catch {
    return 'ファイルを読み取れませんでした';
  }
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

  return `復元完了（置換）: ${results.join(' / ')}`;
}

/**
 * マージ復元: 既存データと取り込みデータを安全にマージする。
 * - localStorage: 既存キーは保持し、新規キーだけ追加。台本はIDベースでマージ。
 * - 日別ログ: 日付ごとに大きい方を採用。
 * - 録音: 既存があればスキップ、新規のみ追加。
 */
export async function mergeBackup(file: File): Promise<string> {
  const text = await file.text();
  let data: BackupData;
  try {
    data = JSON.parse(text);
  } catch {
    return 'JSONの読み込みに失敗しました。';
  }
  if (typeof data !== 'object' || data === null) return '不正なバックアップ形式です。';

  const results: string[] = [];

  // localStorage マージ（台本は特別処理）
  if (data.localStorage && typeof data.localStorage === 'object') {
    try {
      let added = 0;
      let merged = 0;
      // 台本のマージ
      const scriptsKey = `${APP_PREFIX}-scripts`;
      const incomingScriptsRaw = data.localStorage[scriptsKey];
      if (incomingScriptsRaw) {
        try {
          const incoming = JSON.parse(incomingScriptsRaw);
          const existingRaw = localStorage.getItem(scriptsKey);
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          if (Array.isArray(incoming) && Array.isArray(existing)) {
            const existingIds = new Set(existing.map((s: { id?: string }) => s.id));
            let addedScripts = 0;
            for (const s of incoming) {
              if (s && typeof s === 'object' && s.id) {
                if (existingIds.has(s.id)) {
                  // 同一ID: updatedAtが新しければ更新
                  const idx = existing.findIndex((e: { id?: string }) => e.id === s.id);
                  if (idx >= 0 && s.updatedAt > (existing[idx].updatedAt ?? 0)) {
                    existing[idx] = s;
                    merged++;
                  }
                } else {
                  existing.push(s);
                  addedScripts++;
                }
              }
            }
            localStorage.setItem(scriptsKey, JSON.stringify(existing));
            if (addedScripts > 0) results.push(`台本: ${addedScripts}件追加`);
            if (merged > 0) results.push(`台本: ${merged}件更新`);
          }
        } catch { /* skip script merge */ }
      }
      // タイマー結果のマージ（単純追加、日時で重複排除）
      const timerKey = `${APP_PREFIX}-timer-results`;
      const incomingTimerRaw = data.localStorage[timerKey];
      if (incomingTimerRaw) {
        try {
          const incoming = JSON.parse(incomingTimerRaw);
          const existingRaw = localStorage.getItem(timerKey);
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          if (Array.isArray(incoming) && Array.isArray(existing)) {
            const existingDates = new Set(existing.map((r: { date?: number }) => r.date));
            const newResults = incoming.filter((r: { date?: number }) => r.date && !existingDates.has(r.date));
            if (newResults.length > 0) {
              const merged = [...existing, ...newResults].sort((a: { date: number }, b: { date: number }) => b.date - a.date).slice(0, 50);
              localStorage.setItem(timerKey, JSON.stringify(merged));
              results.push(`本番履歴: ${newResults.length}件追加`);
            }
          }
        } catch { /* skip timer merge */ }
      }
      // その他のキー: 既存になければ追加
      for (const [key, val] of Object.entries(data.localStorage)) {
        if (key === scriptsKey || key === timerKey) continue;
        if (typeof key === 'string' && key.startsWith(APP_PREFIX) && typeof val === 'string') {
          if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, val);
            added++;
          }
        }
      }
      if (added > 0) results.push(`設定: ${added}件追加`);
    } catch {
      results.push('設定のマージに失敗');
    }
  }

  // dailyLog マージ（日付ごとに大きい値を採用）
  if (typeof data.dailyLog === 'string') {
    try {
      const incoming = JSON.parse(data.dailyLog);
      const existingRaw = localStorage.getItem(DAILY_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      if (Array.isArray(incoming) && Array.isArray(existing)) {
        const map = new Map<string, Record<string, number>>();
        for (const e of existing) { if (e.date) map.set(e.date, e); }
        let mergedCount = 0;
        for (const e of incoming) {
          if (!e.date) continue;
          const cur = map.get(e.date);
          if (!cur) {
            map.set(e.date, e);
            mergedCount++;
          } else {
            // 各フィールドで大きい値を採用
            for (const k of ['practiceCount', 'speakCount', 'recordCount', 'timerCount', 'manualWeakCount', 'autoWeakCount']) {
              if (typeof e[k] === 'number' && e[k] > (cur[k] ?? 0)) cur[k] = e[k];
            }
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 30);
        localStorage.setItem(DAILY_KEY, JSON.stringify(merged));
        if (mergedCount > 0) results.push(`日別ログ: ${mergedCount}日分追加`);
        else results.push('日別ログ: マージ済み');
      }
    } catch {
      results.push('日別ログのマージに失敗');
    }
  }

  // 録音マージ（既存があればスキップ）
  if (Array.isArray(data.recordings) && data.recordings.length > 0) {
    try {
      // 既存キーを除外して新規のみインポート
      const allExisting = new Set<string>();
      for (const rec of data.recordings) {
        if (rec.scriptId) {
          const keys = await listRecordingKeys(rec.scriptId);
          keys.forEach((k) => allExisting.add(`${rec.scriptId}__${k}`));
        }
      }
      const newOnly = data.recordings.filter((r) => !allExisting.has(`${r.scriptId}__${r.sentenceIndex}`));
      if (newOnly.length > 0) {
        const count = await importRecordings(newOnly);
        results.push(`録音: ${count}件追加`);
      } else {
        results.push('録音: 新規なし');
      }
    } catch {
      results.push('録音のマージに失敗');
    }
  }

  if (results.length === 0) return 'マージ可能なデータがありませんでした。';
  return `マージ復元完了: ${results.join(' / ')}`;
}
