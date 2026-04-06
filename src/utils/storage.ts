/**
 * localStorageを使った状態保存ユーティリティ
 */

const PREFIX = 'pres-practice';
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
  rangeMode: `${PREFIX}-range-mode`,
  rangeStart: `${PREFIX}-range-start`,
  rangeEnd: `${PREFIX}-range-end`,
  // 複数台本管理
  scripts: `${PREFIX}-scripts`,
  activeScriptId: `${PREFIX}-active-script-id`,
  // 学習ダッシュボード
  dashboardStats: `${PREFIX}-dashboard-stats`,
  timerResults: `${PREFIX}-timer-results`,
  // プロンプター設定
  prompterSettings: `${PREFIX}-prompter-settings`,
} as const;

// --- 型定義 ---
export type RangeMode = 'all' | 'from-current' | 'around' | 'custom';
const VALID_RANGE_MODES: string[] = ['all', 'from-current', 'around', 'custom'];

export interface SentenceStats {
  fastReveals: number;
  replays: number;
  reRecords: number;
}
export type SentenceStatsMap = Record<string, SentenceStats>;

/** 台本の過去版 */
export interface ScriptVersion {
  text: string;
  savedAt: number;
}

/** 複数台本管理（history はオプショナルで後方互換） */
export interface SavedScript {
  id: string;
  title: string;
  text: string;
  updatedAt: number;
  history?: ScriptVersion[];
}

const MAX_HISTORY = 10;

/** 学習ダッシュボード統計 */
export interface DashboardStats {
  totalPracticeCount: number;
  totalSpeakCount: number;
  totalRecordCount: number;
}

/** 本番タイマー結果 */
export interface TimerResult {
  date: number;         // Date.now()
  limitSec: number;     // 制限時間（秒）
  elapsed: number;      // 経過時間（秒）
  completed: boolean;   // 制限時間まで到達したか
  reachedIndex: number; // 到達した文番号
  totalSentences: number;
  reachRate: number;    // 到達率（0〜1）
  scriptTitle: string;
  chapterName: string;
  /** 台本ID（後方互換: 旧データでは undefined） */
  scriptId?: string;
  /** 台本版の保存日時（updatedAt）。版の識別に使う */
  scriptVersionAt?: number;
  /** 本番時点で録音済みだった文のインデックス一覧 */
  recordedIndices?: number[];
}

// --- 低レベルヘルパー ---
function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// --- バージョンチェック ---
function migrateIfNeeded(): void {
  try {
    const saved = safeGet(KEYS.version);
    if (saved === STORAGE_VERSION) return;
    clearAllData();
    safeSet(KEYS.version, STORAGE_VERSION);
  } catch { /* ignore */ }
}
migrateIfNeeded();

// --- 公開API ---
export function clearAllData(): void {
  try {
    for (const key of Object.values(KEYS)) localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// --- 台本 ---
export function saveScript(text: string): void { safeSet(KEYS.script, text); }
export function loadScript(): string | null { return safeGet(KEYS.script); }

// --- チェック済み ---
export function saveCheckedItems(items: number[]): void { safeSet(KEYS.checkedItems, JSON.stringify(items)); }
export function loadCheckedItems(): number[] {
  const raw = safeGet(KEYS.checkedItems);
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

// --- 苦手マーク ---
export function saveWeakItems(items: number[]): void { safeSet(KEYS.weakItems, JSON.stringify(items)); }
export function loadWeakItems(): number[] {
  const raw = safeGet(KEYS.weakItems);
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

// --- 現在インデックス ---
export function saveCurrentIndex(index: number): void { safeSet(KEYS.currentIndex, String(index)); }
export function loadCurrentIndex(): number {
  const raw = safeGet(KEYS.currentIndex);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// --- 練習モード ---
const VALID_PRACTICE_MODES = ['normal', 'blanked', 'hint', 'auto'];
export function savePracticeMode(mode: string): void { safeSet(KEYS.mode, mode); }
export function loadPracticeMode(): string {
  const raw = safeGet(KEYS.mode);
  return raw && VALID_PRACTICE_MODES.includes(raw) ? raw : 'normal';
}

// --- 分割モード ---
const VALID_SPLIT_MODES = ['sentence', 'paragraph'];
export function saveSplitMode(mode: string): void { safeSet(KEYS.splitMode, mode); }
export function loadSplitMode(): string {
  const raw = safeGet(KEYS.splitMode);
  return raw && VALID_SPLIT_MODES.includes(raw) ? raw : 'sentence';
}

// --- 読み上げ速度 ---
export function saveSpeechRate(rate: number): void { safeSet(KEYS.speechRate, String(rate)); }
export function loadSpeechRate(): number {
  const raw = safeGet(KEYS.speechRate);
  if (!raw) return 1.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n <= 3 ? n : 1.0;
}

// --- ダークモード ---
export function saveDarkMode(dark: boolean): void { safeSet(KEYS.darkMode, dark ? '1' : '0'); }
export function loadDarkMode(): boolean {
  const raw = safeGet(KEYS.darkMode);
  if (raw === null) { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } }
  return raw === '1';
}

// --- ヒント文字数 ---
export function saveHintLength(len: number): void { safeSet(KEYS.hintLength, String(len)); }
export function loadHintLength(): number {
  const raw = safeGet(KEYS.hintLength);
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 5;
}

// --- 自動送り間隔 ---
export function saveAutoInterval(sec: number): void { safeSet(KEYS.autoInterval, String(sec)); }
export function loadAutoInterval(): number {
  const raw = safeGet(KEYS.autoInterval);
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : 5;
}

// --- 苦手自動判定の統計 ---
export function saveAutoWeakStats(stats: SentenceStatsMap): void { safeSet(KEYS.autoWeakStats, JSON.stringify(stats)); }
export function loadAutoWeakStats(): SentenceStatsMap {
  const raw = safeGet(KEYS.autoWeakStats);
  if (!raw) return {};
  try { const p = JSON.parse(raw); return typeof p === 'object' && p !== null && !Array.isArray(p) ? p : {}; } catch { return {}; }
}
export function isAutoWeak(s: SentenceStats): boolean {
  return s.fastReveals >= 2 || s.replays >= 3 || s.reRecords >= 2;
}

// --- 部分練習の範囲 ---
export function saveRangeMode(mode: string): void { safeSet(KEYS.rangeMode, mode); }
export function loadRangeMode(): RangeMode {
  const raw = safeGet(KEYS.rangeMode);
  return raw && VALID_RANGE_MODES.includes(raw) ? (raw as RangeMode) : 'all';
}
export function saveRangeStart(n: number): void { safeSet(KEYS.rangeStart, String(n)); }
export function loadRangeStart(): number {
  const raw = safeGet(KEYS.rangeStart);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export function saveRangeEnd(n: number): void { safeSet(KEYS.rangeEnd, String(n)); }
export function loadRangeEnd(): number {
  const raw = safeGet(KEYS.rangeEnd);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// --- 複数台本管理 ---
export function saveScripts(scripts: SavedScript[]): void { safeSet(KEYS.scripts, JSON.stringify(scripts)); }
export function loadScripts(): SavedScript[] {
  const raw = safeGet(KEYS.scripts);
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}
export function saveActiveScriptId(id: string): void { safeSet(KEYS.activeScriptId, id); }
export function loadActiveScriptId(): string { return safeGet(KEYS.activeScriptId) ?? ''; }

// --- 学習ダッシュボード ---
export function saveDashboardStats(stats: DashboardStats): void { safeSet(KEYS.dashboardStats, JSON.stringify(stats)); }
export function loadDashboardStats(): DashboardStats {
  const raw = safeGet(KEYS.dashboardStats);
  if (!raw) return { totalPracticeCount: 0, totalSpeakCount: 0, totalRecordCount: 0 };
  try {
    const p = JSON.parse(raw);
    return {
      totalPracticeCount: p?.totalPracticeCount ?? 0,
      totalSpeakCount: p?.totalSpeakCount ?? 0,
      totalRecordCount: p?.totalRecordCount ?? 0,
    };
  } catch { return { totalPracticeCount: 0, totalSpeakCount: 0, totalRecordCount: 0 }; }
}

// --- 本番タイマー結果 ---
export function saveTimerResults(results: TimerResult[]): void { safeSet(KEYS.timerResults, JSON.stringify(results)); }
export function loadTimerResults(): TimerResult[] {
  const raw = safeGet(KEYS.timerResults);
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}
/** 結果を追加（最大50件保持） */
export function appendTimerResult(result: TimerResult): TimerResult[] {
  const prev = loadTimerResults();
  const next = [result, ...prev].slice(0, 50);
  saveTimerResults(next);
  return next;
}

// --- プロンプター設定 ---
export interface PrompterSettings {
  fontSize: number;
  lineHeight: number;
  maxWidthPct: number;
  bgMode: string;
  toolbarCollapsed: boolean;
  tapNavEnabled: boolean;
  autoMode: string;
  autoSec: number;
  autoCoeff: number;
  autoMinSec: number;
  autoMaxSec: number;
}

const PROMPTER_DEFAULTS: PrompterSettings = {
  fontSize: 48, lineHeight: 1.6, maxWidthPct: 90, bgMode: 'dark',
  toolbarCollapsed: false, tapNavEnabled: true,
  autoMode: 'fixed', autoSec: 5, autoCoeff: 120, autoMinSec: 3, autoMaxSec: 15,
};

export function savePrompterSettings(s: PrompterSettings): void {
  safeSet(KEYS.prompterSettings, JSON.stringify(s));
}

export function loadPrompterSettings(): PrompterSettings {
  const raw = safeGet(KEYS.prompterSettings);
  if (!raw) return { ...PROMPTER_DEFAULTS };
  try {
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || p === null) return { ...PROMPTER_DEFAULTS };
    return {
      fontSize: typeof p.fontSize === 'number' ? p.fontSize : PROMPTER_DEFAULTS.fontSize,
      lineHeight: typeof p.lineHeight === 'number' ? p.lineHeight : PROMPTER_DEFAULTS.lineHeight,
      maxWidthPct: typeof p.maxWidthPct === 'number' ? p.maxWidthPct : PROMPTER_DEFAULTS.maxWidthPct,
      bgMode: typeof p.bgMode === 'string' ? p.bgMode : PROMPTER_DEFAULTS.bgMode,
      toolbarCollapsed: typeof p.toolbarCollapsed === 'boolean' ? p.toolbarCollapsed : PROMPTER_DEFAULTS.toolbarCollapsed,
      tapNavEnabled: typeof p.tapNavEnabled === 'boolean' ? p.tapNavEnabled : PROMPTER_DEFAULTS.tapNavEnabled,
      autoMode: typeof p.autoMode === 'string' ? p.autoMode : PROMPTER_DEFAULTS.autoMode,
      autoSec: typeof p.autoSec === 'number' ? p.autoSec : PROMPTER_DEFAULTS.autoSec,
      autoCoeff: typeof p.autoCoeff === 'number' ? p.autoCoeff : PROMPTER_DEFAULTS.autoCoeff,
      autoMinSec: typeof p.autoMinSec === 'number' ? p.autoMinSec : PROMPTER_DEFAULTS.autoMinSec,
      autoMaxSec: typeof p.autoMaxSec === 'number' ? p.autoMaxSec : PROMPTER_DEFAULTS.autoMaxSec,
    };
  } catch { return { ...PROMPTER_DEFAULTS }; }
}

// --- 台本バージョン管理 ---

/**
 * 台本を上書き保存し、変更があれば旧版を history に追加する。
 * scripts 配列全体を返す。
 */
export function updateScriptWithHistory(
  scripts: SavedScript[],
  scriptId: string,
  newText: string,
): SavedScript[] {
  return scripts.map((s) => {
    if (s.id !== scriptId) return s;
    // テキストが変わっていなければ日時だけ更新
    if (s.text === newText) return { ...s, updatedAt: Date.now() };
    // 旧版を履歴に追加
    const prevVersion: ScriptVersion = { text: s.text, savedAt: s.updatedAt };
    const history = [prevVersion, ...(s.history ?? [])].slice(0, MAX_HISTORY);
    return { ...s, text: newText, updatedAt: Date.now(), history };
  });
}
