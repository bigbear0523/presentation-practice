import React from 'react';
import { type SentenceStatsMap, type SentenceStats, isAutoWeak, type DashboardStats } from '../utils/storage';
import type { Chapter } from '../utils/scriptParser';

interface Props {
  totalSentences: number;
  chapters: Chapter[];
  checkedItems: number[];
  weakItems: number[];
  autoWeakStats: SentenceStatsMap;
  dashboardStats: DashboardStats;
  recordingCount: number;
  onClose: () => void;
}

/** 学習ダッシュボード */
export default function Dashboard({
  totalSentences,
  chapters,
  checkedItems,
  weakItems,
  autoWeakStats,
  dashboardStats,
  recordingCount,
  onClose,
}: Props) {
  // 苦手ランキング: スコア順にソート
  const weakRanking = Object.entries(autoWeakStats)
    .map(([key, stats]) => ({ index: parseInt(key, 10), stats, score: calcScore(stats) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const autoWeakCount = Object.values(autoWeakStats).filter((s) => isAutoWeak(s)).length;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h3>学習ダッシュボード</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      {/* 概要統計 */}
      <div className="dashboard-stats-grid">
        <StatCard label="総文数" value={totalSentences} />
        <StatCard label="チェック済み" value={checkedItems.length} accent="success" />
        <StatCard label="手動苦手" value={weakItems.length} accent="danger" />
        <StatCard label="自動苦手" value={autoWeakCount} accent="warning" />
        <StatCard label="録音数" value={recordingCount} />
        <StatCard label="累計再生" value={dashboardStats.totalSpeakCount} />
        <StatCard label="累計録音" value={dashboardStats.totalRecordCount} />
        <StatCard label="累計練習" value={dashboardStats.totalPracticeCount} />
      </div>

      {/* 章ごとの進捗 */}
      {chapters.length > 1 && (
        <div className="dashboard-section">
          <h4 className="dashboard-section-title">章ごとの進捗</h4>
          {chapters.map((ch, ci) => {
            const count = ch.endIndex - ch.startIndex + 1;
            const checked = checkedItems.filter((i) => i >= ch.startIndex && i <= ch.endIndex).length;
            const pct = count > 0 ? Math.round((checked / count) * 100) : 0;
            return (
              <div key={ci} className="dashboard-chapter-row">
                <span className="dashboard-chapter-title">{ch.title}</span>
                <div className="progress-bar-container" style={{ flex: 1 }}>
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted" style={{ fontSize: '0.8rem', minWidth: 48, textAlign: 'right' }}>
                  {checked}/{count}
                </span>
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
                  スコア {item.score}
                  {item.stats.fastReveals > 0 && ` / 速表示${item.stats.fastReveals}`}
                  {item.stats.replays > 0 && ` / 再生${item.stats.replays}`}
                  {item.stats.reRecords > 0 && ` / 録直${item.stats.reRecords}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function calcScore(s: SentenceStats): number {
  return s.fastReveals * 3 + s.replays + s.reRecords * 2;
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const color = accent === 'success' ? 'var(--success)'
    : accent === 'danger' ? 'var(--danger)'
    : accent === 'warning' ? 'var(--warning)'
    : 'var(--text-primary)';
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-value" style={{ color }}>{value}</div>
      <div className="dashboard-stat-label">{label}</div>
    </div>
  );
}
