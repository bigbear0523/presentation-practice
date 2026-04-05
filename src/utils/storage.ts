/**
 * localStorageを使った状態保存ユーティリティ
 * キー名は分かりやすいプレフィックスを付ける
 *
 * バージョン管理:
 *   STORAGE_VERSION が変わると保存データを自動クリアする。
 *   壊れた JSON や未知のキーも安全にフォールバックする。
 */

const PREFIX = 'pres-practice';

/** データ構造を変更したらインクリメントする */
const STORAGE_VERSION = '2';

const KEYS = {
  version: `${PREFIX}-version`,
  script: `${PREFIX}-script`,
  checkedItems: `${PREFIX}-checked`,
  weakItems: `${PREFIX}-weak`,
  currentIndex: `${PREFIX}-index`,
  mode: `${PREFIX}-mode`,
  splitMode: `${PREFIX}-split-mode`,
  speechRate: `${PREFIX}-speech-rate`,
  darkMode: `${PREFIX}-dark-mode`,
  hintLength: `${PREFIX}-hint-length`,
  autoInterval: `${PREFIX}-auto-interval`,
  autoWeakStats: `${PREFIX}-auto-weak-stats`,
} as const;

// --- 苦手自動判定の統計型 ---
export interface SentenceStats {
  fastReveals: number;  // 素早く表示を押した回数
  replays: number;      // 読み上げ回数
  reRecords: number;    // 録り直し回数
}
export type SentenceStatsMap = Record<string, SentenceStats>;

// --- 低レベルヘルパー ---

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    console.warn('localStorageへの保存に失敗しました');
  }
}

// --- バージョンチェック（モジュール読み込み時に1回だけ実行） ---

function migrateIfNeeded(): void {
  try {
    const saved = safeGet(KEYS.version);
    if (saved === STORAGE_VERSION) return; // 一致 → 何もしない

    // バージョンが古い or 存在しない → 全データをクリアして新バージョンを書き込む
    clearAllData();
    safeSet(KEYS.version, STORAGE_VERSION);
  } catch {
    // localStorage 自体にアクセスできない環境では何もしない
  }
}

// モジュール初期化時にマイグレーション実行
migrateIfNeeded();

// --- 公開API ---

/** アプリが保存した全データをクリアする */
export function clearAllData(): void {
  try {
    const allKeys = Object.values(KEYS);
    for (const key of allKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    // 無視
  }
}

// --- 台本テキスト ---
export function saveScript(text: string): void {
  safeSet(KEYS.script, text);
}
export function loadScript(): string | null {
  return safeGet(KEYS.script);
}

// --- チェック済みインデックス ---
export function saveCheckedItems(items: number[]): void {
  safeSet(KEYS.checkedItems, JSON.stringify(items));
}
export function loadCheckedItems(): number[] {
  const raw = safeGet(KEYS.checkedItems);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --- 苦手マーク ---
export function saveWeakItems(items: number[]): void {
  safeSet(KEYS.weakItems, JSON.stringify(items));
}
export function loadWeakItems(): number[] {
  const raw = safeGet(KEYS.weakItems);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --- 現在インデックス ---
export function saveCurrentIndex(index: number): void {
  safeSet(KEYS.currentIndex, String(index));
}
export function loadCurrentIndex(): number {
  const raw = safeGet(KEYS.currentIndex);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// --- 練習モード ---
const VALID_PRACTICE_MODES = ['normal', 'blanked', 'hint', 'auto'];
export function savePracticeMode(mode: string): void {
  safeSet(KEYS.mode, mode);
}
export function loadPracticeMode(): string {
  const raw = safeGet(KEYS.mode);
  return raw && VALID_PRACTICE_MODES.includes(raw) ? raw : 'normal';
}

// --- 分割モード ---
const VALID_SPLIT_MODES = ['sentence', 'paragraph'];
export function saveSplitMode(mode: string): void {
  safeSet(KEYS.splitMode, mode);
}
export function loadSplitMode(): string {
  const raw = safeGet(KEYS.splitMode);
  return raw && VALID_SPLIT_MODES.includes(raw) ? raw : 'sentence';
}

// --- 読み上げ速度 ---
export function saveSpeechRate(rate: number): void {
  safeSet(KEYS.speechRate, String(rate));
}
export function loadSpeechRate(): number {
  const raw = safeGet(KEYS.speechRate);
  if (!raw) return 1.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n <= 3 ? n : 1.0;
}

// --- ダークモード ---
export function saveDarkMode(dark: boolean): void {
  safeSet(KEYS.darkMode, dark ? '1' : '0');
}
export function loadDarkMode(): boolean {
  const raw = safeGet(KEYS.darkMode);
  if (raw === null) {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  }
  return raw === '1';
}

// --- ヒント文字数 ---
export function saveHintLength(len: number): void {
  safeSet(KEYS.hintLength, String(len));
}
export function loadHintLength(): number {
  const raw = safeGet(KEYS.hintLength);
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 5;
}

// --- 自動送り間隔 ---
export function saveAutoInterval(sec: number): void {
  safeSet(KEYS.autoInterval, String(sec));
}
export function loadAutoInterval(): number {
  const raw = safeGet(KEYS.autoInterval);
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : 5;
}

// --- 苦手自動判定の統計 ---
export function saveAutoWeakStats(stats: SentenceStatsMap): void {
  safeSet(KEYS.autoWeakStats, JSON.stringify(stats));
}
export function loadAutoWeakStats(): SentenceStatsMap {
  const raw = safeGet(KEYS.autoWeakStats);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/** 統計から苦手と判定するか */
export function isAutoWeak(s: SentenceStats): boolean {
  return s.fastReveals >= 2 || s.replays >= 3 || s.reRecords >= 2;
}
