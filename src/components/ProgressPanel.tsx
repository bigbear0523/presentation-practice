import React from 'react';
import { isAutoWeak, type SentenceStatsMap } from '../utils/storage';

interface Props {
  sentences: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  checkedItems: number[];
  weakItems: number[];
  /** 自動苦手判定の統計（任意） */
  autoWeakStats?: SentenceStatsMap;
}

/**
 * 進捗一覧パネル
 * 全文の一覧・チェック状態・苦手マーク・自動苦手理由を表示
 */
export default function ProgressPanel({
  sentences,
  currentIndex,
  onChangeIndex,
  checkedItems,
  weakItems,
  autoWeakStats,
}: Props) {
  const total = sentences.length;
  const checkedCount = checkedItems.length;
  const weakCount = weakItems.length;
  const autoWeakCount = autoWeakStats
    ? sentences.filter((_, i) => {
        const s = autoWeakStats[String(i)];
        return s ? isAutoWeak(s) : false;
      }).length
    : 0;

  return (
    <div className="progress-panel">
      <h3 className="progress-title">進捗一覧</h3>

      {/* 統計 */}
      <div className="progress-stats">
        <span>全{total}文</span>
        <span className="stat-checked">✔ {checkedCount}文 チェック済み</span>
        <span className="stat-weak">★ {weakCount}文 苦手</span>
        {autoWeakCount > 0 && <span className="stat-auto-weak">⚡ {autoWeakCount}文 自動苦手</span>}
        <span>達成率: {total > 0 ? Math.round((checkedCount / total) * 100) : 0}%</span>
      </div>

      {/* 達成バー */}
      <div className="progress-bar-container large">
        <div
          className="progress-bar-fill"
          style={{ width: `${total > 0 ? (checkedCount / total) * 100 : 0}%` }}
        />
      </div>

      {/* 文一覧 */}
      <div className="sentence-list">
        {sentences.map((s, i) => {
          const isChecked = checkedItems.includes(i);
          const isWeak = weakItems.includes(i);
          const isCurrent = i === currentIndex;
          const stats = autoWeakStats?.[String(i)];
          const isAW = stats ? isAutoWeak(stats) : false;

          return (
            <div
              key={i}
              className={`sentence-item ${isCurrent ? 'current' : ''} ${isChecked ? 'checked' : ''} ${isWeak ? 'weak' : ''}`}
              onClick={() => onChangeIndex(i)}
            >
              <span className="sentence-number">{i + 1}.</span>
              <span className="sentence-preview">
                {s.length > 40 ? s.slice(0, 40) + '…' : s}
              </span>
              <span className="sentence-marks">
                {isChecked && <span className="mark-check">✔</span>}
                {isWeak && <span className="mark-weak">★</span>}
                {isAW && <span className="mark-auto-weak" title={getAutoWeakReason(stats!)}>⚡</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 自動苦手の理由を日本語で返す */
function getAutoWeakReason(s: { fastReveals: number; replays: number; reRecords: number }): string {
  const reasons: string[] = [];
  if (s.fastReveals >= 2) reasons.push(`素早く表示 ${s.fastReveals}回`);
  if (s.replays >= 3) reasons.push(`再生 ${s.replays}回`);
  if (s.reRecords >= 2) reasons.push(`録り直し ${s.reRecords}回`);
  return reasons.length > 0 ? reasons.join(' / ') : '自動苦手';
}
