/**
 * 日別練習ログ（ダッシュボードのグラフ用）
 * localStorage に直近30日分を保持
 */

const KEY = 'pres-practice-daily-log';

export interface DailyEntry {
  date: string;       // 'YYYY-MM-DD'
  practiceCount: number;
  speakCount: number;
  recordCount: number;
  timerCount: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadLog(): DailyEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveLog(log: DailyEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(log.slice(0, 30))); } catch { /* ignore */ }
}

function getOrCreateToday(log: DailyEntry[]): { entry: DailyEntry; index: number } {
  const t = today();
  const idx = log.findIndex((e) => e.date === t);
  if (idx >= 0) return { entry: log[idx], index: idx };
  const entry: DailyEntry = { date: t, practiceCount: 0, speakCount: 0, recordCount: 0, timerCount: 0 };
  return { entry, index: -1 };
}

/** 指定フィールドを +1 する */
export function incrementDaily(field: keyof Omit<DailyEntry, 'date'>): void {
  const log = loadLog();
  const { entry, index } = getOrCreateToday(log);
  entry[field]++;
  if (index >= 0) {
    log[index] = entry;
  } else {
    log.unshift(entry);
  }
  saveLog(log);
}

/** 直近N日分を返す（日付昇順） */
export function getRecentDays(n: number = 7): DailyEntry[] {
  const log = loadLog();
  const result: DailyEntry[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const target = new Date(d);
    target.setDate(target.getDate() - i);
    const ds = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const found = log.find((e) => e.date === ds);
    result.push(found ?? { date: ds, practiceCount: 0, speakCount: 0, recordCount: 0, timerCount: 0 });
  }
  return result;
}
