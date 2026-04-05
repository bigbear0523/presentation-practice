import React, { useState } from 'react';
import { type SentenceStatsMap, type SentenceStats, isAutoWeak, type DashboardStats, type TimerResult } from '../utils/storage';
import type { Chapter } from '../utils/scriptParser';
import { getRecentDays } from '../utils/dailyLog';

interface Props {
  totalSentences: number;
  chapters: Chapter[];
  checkedItems: number[];
  weakItems: number[];
  autoWeakStats: SentenceStatsMap;
  dashboardStats: DashboardStats;
  recordingCount: number;
  timerResults: TimerResult[];
  allSentences: string[];
  onClose: () => void;
  /** 章の苦手だけ練習に遷移する（chapterIndex, weakMode） */
  onPracticeChapterWeak?: (chapterIndex: number, mode: 'manual' | 'auto') => void;
}

export default function Dashboard({
  totalSentences, chapters, checkedItems, weakItems, autoWeakStats,
  dashboardStats, recordingCount, timerResults, allSentences, onClose,
  onPracticeChapterWeak,
}: Props) {
  const [graphDays, setGraphDays] = useState(7);

  const weakRanking = Object.entries(autoWeakStats)
    .map(([key, stats]) => ({ index: parseInt(key, 10), stats, score: calcScore(stats) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const autoWeakCount = Object.values(autoWeakStats).filter((s) => isAutoWeak(s)).length;
  const recentResults = timerResults.slice(0, 10);
  const avgReachRate = timerResults.length > 0
    ? timerResults.reduce((sum, r) => sum + r.reachRate, 0) / timerResults.length : 0;
  const completedCount = timerResults.filter((r) => r.completed).length;
  const completionRate = timerResults.length > 0 ? completedCount / timerResults.length : 0;

  const dailyData = getRecentDays(graphDays);
  const maxDaily = Math.max(1, ...dailyData.map((d) => d.practiceCount + d.speakCount + d.recordCount + d.timerCount));

  // 到達率推移（直近10件、古い順）
  const reachTrend = timerResults.slice(0, 10).reverse();
  const maxReach = 100;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h3>学習ダッシュボード</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      <div className="dashboard-stats-grid">
        <StatCard label="総文数" value={totalSentences} />
        <StatCard label="チェック済み" value={checkedItems.length} accent="success" />
        <StatCard label="手動苦手" value={weakItems.length} accent="danger" />
        <StatCard label="自動苦手" value={autoWeakCount} accent="warning" />
        <StatCard label="録音数" value={recordingCount} />
        <StatCard label="累計再生" value={dashboardStats.totalSpeakCount} />
        <StatCard label="累計録音" value={dashboardStats.totalRecordCount} />
        <StatCard label="本番回数" value={timerResults.length} />
      </div>

      {/* 日別練習グラフ */}
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h4 className="dashboard-section-title">日別練習</h4>
          <div className="btn-group">
            {[7, 14, 30].map((n) => (
              <button key={n} className={`btn btn-mode btn-small ${graphDays === n ? 'active' : ''}`}
                onClick={() => setGraphDays(n)}>{n}日</button>
            ))}
          </div>
        </div>
        <div className="daily-graph">
          {dailyData.map((d) => {
            const total = d.practiceCount + d.speakCount + d.recordCount + d.timerCount;
            const pct = (total / maxDaily) * 100;
            const label = d.date.slice(5);
            return (
              <div key={d.date} className="daily-bar-col">
                <div className="daily-bar-wrap">
                  <div className="daily-bar" style={{ height: `${Math.max(2, pct)}%` }}
                    title={`練習${d.practiceCount} 再生${d.speakCount} 録音${d.recordCount} 本番${d.timerCount}`} />
                </div>
                {graphDays <= 14 && <span className="daily-bar-label">{label}</span>}
                <span className="daily-bar-count">{total || ''}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 到達率推移 */}
      {reachTrend.length >= 2 && (
        <div className="dashboard-section">
          <h4 className="dashboard-section-title">到達率の推移（直近{reachTrend.length}回）</h4>
          <div className="reach-chart">
            <div className="reach-chart-axis">
              <span>100%</span><span>50%</span><span>0%</span>
            </div>
            <div className="reach-chart-body">
              {/* グリッド線 */}
              <div className="reach-chart-grid" />
              <div className="reach-chart-grid" style={{ bottom: '50%' }} />
              {/* 棒 + ドット */}
              {reachTrend.map((r, i) => {
                const pct = Math.round(r.reachRate * 100);
                return (
                  <div key={i} className="reach-chart-col">
                    <div className="reach-chart-bar-wrap">
                      <div className={`reach-chart-bar ${r.completed ? 'reach-completed' : 'reach-incomplete'}`}
                        style={{ height: `${pct}%` }}
                        title={`${fmtDate(r.date)}: ${pct}% ${r.completed ? '完走' : '途中'}`} />
                    </div>
                    <span className="reach-chart-label">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="reach-chart-legend">
            <span className="reach-legend-item"><span className="reach-dot reach-completed" />完走</span>
            <span className="reach-legend-item"><span className="reach-dot reach-incomplete" />途中終了</span>
          </div>
        </div>
      )}

      {/* 本番履歴 */}
      {timerResults.length > 0 && (
        <div className="dashboard-section">
          <h4 className="dashboard-section-title">本番履歴</h4>
          <div className="timer-summary">
            <span>平均到達率: <strong>{Math.round(avgReachRate * 100)}%</strong></span>
            <span>完走率: <strong>{Math.round(completionRate * 100)}%</strong>（{completedCount}/{timerResults.length}回）</span>
          </div>

          {(() => {
            const versionMap = new Map<string, { count: number; totalReach: number; completed: number }>();
            for (const r of timerResults) {
              const vKey = r.scriptVersionAt ? fmtDate(r.scriptVersionAt) : '旧版';
              const label = `${r.scriptTitle ?? '不明'} (${vKey})`;
              const prev = versionMap.get(label) ?? { count: 0, totalReach: 0, completed: 0 };
              prev.count++; prev.totalReach += r.reachRate; if (r.completed) prev.completed++;
              versionMap.set(label, prev);
            }
            if (versionMap.size <= 1) return null;
            return (
              <div className="version-stats">
                {Array.from(versionMap.entries()).map(([label, v]) => (
                  <div key={label} className="version-stat-row">
                    <span className="version-stat-label">{label}</span>
                    <span className="text-muted">
                      {v.count}回 / 到達率{Math.round((v.totalReach / v.count) * 100)}% / 完走{v.completed}回
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="timer-history">
            {recentResults.map((r, i) => (
              <div key={i} className="timer-history-item">
                <div className="timer-history-date">{fmtDate(r.date)}</div>
                <div className="timer-history-detail">
                  <span className={r.completed ? 'timer-completed' : 'timer-incomplete'}>
                    {r.completed ? '完走' : '途中終了'}
                  </span>
                  <span>{fmtTime(r.elapsed)} / {fmtTime(r.limitSec)}</span>
                  <span>{r.reachedIndex + 1}/{r.totalSentences}文（{Math.round(r.reachRate * 100)}%）</span>
                  {r.scriptVersionAt && <span className="version-badge">{fmtDate(r.scriptVersionAt)}版</span>}
                  {!r.scriptVersionAt && r.scriptId && <span className="text-muted" style={{ fontSize: '0.7rem' }}>旧版</span>}
                  {r.recordedIndices && r.recordedIndices.length > 0 && (
                    <span className="rec-badge" title={`録音済み: ${r.recordedIndices.map((x) => x + 1).join(', ')}文目`}>
                      録音{r.recordedIndices.length}文
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 章ごとの進捗 + 苦手ランキング + 苦手練習ボタン */}
      {chapters.length > 1 && (
        <div className="dashboard-section">
          <h4 className="dashboard-section-title">章ごとの進捗・苦手</h4>
          {chapters.map((ch, ci) => {
            const count = ch.endIndex - ch.startIndex + 1;
            const checked = checkedItems.filter((i) => i >= ch.startIndex && i <= ch.endIndex).length;
            const manualWeak = weakItems.filter((i) => i >= ch.startIndex && i <= ch.endIndex).length;
            const autoWeak = Array.from({ length: count }, (_, k) => ch.startIndex + k)
              .filter((i) => { const s = autoWeakStats[String(i)]; return s ? isAutoWeak(s) : false; }).length;
            const pct = count > 0 ? Math.round((checked / count) * 100) : 0;
            const hasWeak = manualWeak > 0 || autoWeak > 0;

            const chapterWeakTop = Array.from({ length: count }, (_, k) => ch.startIndex + k)
              .map((i) => ({ index: i, score: calcScore(autoWeakStats[String(i)] ?? { fastReveals: 0, replays: 0, reRecords: 0 }) }))
              .filter((x) => x.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3);

            return (
              <div key={ci} className="dashboard-chapter-block">
                <div className="dashboard-chapter-row">
                  <span className="dashboard-chapter-title">{ch.title}</span>
                  <div className="progress-bar-container" style={{ flex: 1 }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.75rem', minWidth: 100, textAlign: 'right' }}>
                    {checked}/{count}
                    {manualWeak > 0 && <span style={{ color: 'var(--danger)' }}> ★{manualWeak}</span>}
                    {autoWeak > 0 && <span style={{ color: 'var(--warning)' }}> ⚡{autoWeak}</span>}
                  </span>
                </div>
                {/* 苦手練習ボタン */}
                {hasWeak && onPracticeChapterWeak && (
                  <div className="chapter-weak-actions">
                    {manualWeak > 0 && (
                      <button className="btn btn-danger btn-small" onClick={() => onPracticeChapterWeak(ci, 'manual')}>
                        ★苦手{manualWeak}文を練習
                      </button>
                    )}
                    {autoWeak > 0 && (
                      <button className="btn btn-warning btn-small" onClick={() => onPracticeChapterWeak(ci, 'auto')}>
                        ⚡自動苦手{autoWeak}文を練習
                      </button>
                    )}
                  </div>
                )}
                {chapterWeakTop.length > 0 && (
                  <div className="chapter-weak-ranking">
                    {chapterWeakTop.map((item) => (
                      <span key={item.index} className="chapter-weak-item" title={allSentences[item.index]?.slice(0, 40) ?? ''}>
                        {item.index + 1}文目(スコア{item.score})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* よく詰まる文ランキング */}
      {weakRanking.length > 0 && (
        <div className="dashboard-section">
          <h4 className="dashboard-section-title">よく詰まる文 TOP{weakRanking.length}</h4>
          <div className="sentence-list" style={{ maxHeight: 300 }}>
            {weakRanking.map((item) => (
              <div key={item.index} className="sentence-item">
                <span className="sentence-number">{item.index + 1}.</span>
                <span className="sentence-preview" style={{ flex: 1 }}>
                  {allSentences[item.index]?.slice(0, 30) ?? ''}...
                  <span className="text-muted" style={{ marginLeft: 8 }}>
                    スコア{item.score}
                    {item.stats.fastReveals > 0 && ` 速表示${item.stats.fastReveals}`}
                    {item.stats.replays > 0 && ` 再生${item.stats.replays}`}
                    {item.stats.reRecords > 0 && ` 録直${item.stats.reRecords}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function calcScore(s: SentenceStats): number { return s.fastReveals * 3 + s.replays + s.reRecords * 2; }
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const color = accent === 'success' ? 'var(--success)' : accent === 'danger' ? 'var(--danger)' : accent === 'warning' ? 'var(--warning)' : 'var(--text-primary)';
  return (<div className="dashboard-stat-card"><div className="dashboard-stat-value" style={{ color }}>{value}</div><div className="dashboard-stat-label">{label}</div></div>);
}
function fmtTime(sec: number): string { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${s.toString().padStart(2, '0')}`; }
function fmtDate(ts: number): string { try { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`; } catch { return ''; } }
