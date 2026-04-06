import React from 'react';
import type { RangeMode } from '../utils/storage';

export type PracticeMode = 'normal' | 'blanked' | 'hint' | 'auto';
export type SplitMode = 'sentence' | 'paragraph';

interface Props {
  practiceMode: PracticeMode;
  onChangePracticeMode: (mode: PracticeMode) => void;
  splitMode: SplitMode;
  onChangeSplitMode: (mode: SplitMode) => void;
  speechRate: number;
  onChangeSpeechRate: (rate: number) => void;
  hintLength: number;
  onChangeHintLength: (len: number) => void;
  autoInterval: number;
  onChangeAutoInterval: (sec: number) => void;
  weakOnly: boolean;
  onToggleWeakOnly: () => void;
  hasWeakItems: boolean;
  autoWeakOnly: boolean;
  onToggleAutoWeakOnly: () => void;
  hasAutoWeakItems: boolean;
  recordedOnly: boolean;
  onToggleRecordedOnly: () => void;
  hasRecordedItems: boolean;
  weakContext: boolean;
  onToggleWeakContext: () => void;
  hasAnyWeakItems: boolean;
  weakContextRange: number;
  onChangeWeakContextRange: (n: number) => void;
  // 部分練習
  rangeMode: RangeMode;
  onChangeRangeMode: (mode: RangeMode) => void;
  rangeStart: number;
  rangeEnd: number;
  onChangeRangeStart: (n: number) => void;
  onChangeRangeEnd: (n: number) => void;
  totalSentenceCount: number;
  activeSentenceCount: number;
}

/**
 * 練習モード・設定を切り替えるコントロールパネル
 */
export default function Controls({
  practiceMode,
  onChangePracticeMode,
  splitMode,
  onChangeSplitMode,
  speechRate,
  onChangeSpeechRate,
  hintLength,
  onChangeHintLength,
  autoInterval,
  onChangeAutoInterval,
  weakOnly,
  onToggleWeakOnly,
  hasWeakItems,
  autoWeakOnly,
  onToggleAutoWeakOnly,
  hasAutoWeakItems,
  recordedOnly,
  onToggleRecordedOnly,
  hasRecordedItems,
  weakContext,
  onToggleWeakContext,
  hasAnyWeakItems,
  weakContextRange,
  onChangeWeakContextRange,
  rangeMode,
  onChangeRangeMode,
  rangeStart,
  rangeEnd,
  onChangeRangeStart,
  onChangeRangeEnd,
  totalSentenceCount,
  activeSentenceCount,
}: Props) {
  const modes: { value: PracticeMode; label: string }[] = [
    { value: 'normal', label: '通常表示' },
    { value: 'blanked', label: '穴埋め練習' },
    { value: 'hint', label: '先頭ヒント' },
    { value: 'auto', label: '自動送り' },
  ];

  const rates = [0.6, 0.8, 1.0, 1.2, 1.5, 2.0];

  return (
    <div className="controls">
      {/* 練習モード選択 */}
      <div className="control-group">
        <label className="control-label">練習モード</label>
        <div className="btn-group">
          {modes.map((m) => (
            <button
              key={m.value}
              className={`btn btn-mode ${practiceMode === m.value ? 'active' : ''}`}
              onClick={() => onChangePracticeMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 分割モード */}
      <div className="control-group">
        <label className="control-label">分割単位</label>
        <div className="btn-group">
          <button
            className={`btn btn-mode ${splitMode === 'sentence' ? 'active' : ''}`}
            onClick={() => onChangeSplitMode('sentence')}
          >
            1文ごと
          </button>
          <button
            className={`btn btn-mode ${splitMode === 'paragraph' ? 'active' : ''}`}
            onClick={() => onChangeSplitMode('paragraph')}
          >
            段落ごと
          </button>
        </div>
      </div>

      {/* 読み上げ速度 */}
      <div className="control-group">
        <label className="control-label">読み上げ速度</label>
        <div className="btn-group">
          {rates.map((r) => (
            <button
              key={r}
              className={`btn btn-mode btn-small ${speechRate === r ? 'active' : ''}`}
              onClick={() => onChangeSpeechRate(r)}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>

      {/* ヒント文字数（先頭ヒントモード時のみ） */}
      {practiceMode === 'hint' && (
        <div className="control-group">
          <label className="control-label">ヒント文字数: {hintLength}文字</label>
          <input
            type="range"
            min={1}
            max={20}
            value={hintLength}
            onChange={(e) => onChangeHintLength(Number(e.target.value))}
            className="range-input"
          />
        </div>
      )}

      {/* 自動送り間隔（自動送りモード時のみ） */}
      {practiceMode === 'auto' && (
        <div className="control-group">
          <label className="control-label">自動送り間隔: {autoInterval}秒</label>
          <input
            type="range"
            min={2}
            max={15}
            value={autoInterval}
            onChange={(e) => onChangeAutoInterval(Number(e.target.value))}
            className="range-input"
          />
        </div>
      )}

      {/* 苦手・復習フィルタ */}
      <div className="control-group" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button
          className={`btn ${weakOnly ? 'btn-danger' : 'btn-secondary'}`}
          onClick={onToggleWeakOnly}
          disabled={!hasWeakItems && !weakOnly}
        >
          {weakOnly ? '★ 苦手のみ表示中' : '☆ 苦手だけ練習'}
        </button>
        <button
          className={`btn ${autoWeakOnly ? 'btn-warning' : 'btn-secondary'}`}
          onClick={onToggleAutoWeakOnly}
          disabled={!hasAutoWeakItems && !autoWeakOnly}
        >
          {autoWeakOnly ? '⚡ 自動苦手のみ' : '⚡ 自動苦手だけ練習'}
        </button>
        <button
          className={`btn ${weakContext ? 'btn-danger' : 'btn-secondary'}`}
          onClick={onToggleWeakContext}
          disabled={!hasAnyWeakItems && !weakContext}
        >
          {weakContext ? `★±${weakContextRange} 苦手前後表示中` : `★±${weakContextRange} 苦手の前後も練習`}
        </button>
        {weakContext && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            幅:
            <button className="btn btn-small" onClick={() => onChangeWeakContextRange(Math.max(1, weakContextRange - 1))} disabled={weakContextRange <= 1}>−</button>
            <span style={{ minWidth: 16, textAlign: 'center' }}>{weakContextRange}</span>
            <button className="btn btn-small" onClick={() => onChangeWeakContextRange(Math.min(5, weakContextRange + 1))} disabled={weakContextRange >= 5}>+</button>
          </span>
        )}
        <button
          className={`btn ${recordedOnly ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleRecordedOnly}
          disabled={!hasRecordedItems && !recordedOnly}
        >
          {recordedOnly ? '🎤 録音済みのみ' : '🎤 録音済みだけ復習'}
        </button>
      </div>

      {/* 部分練習 */}
      <div className="control-group">
        <label className="control-label">練習範囲</label>
        <div className="btn-group">
          {([
            { value: 'all', label: '全体' },
            { value: 'from-current', label: '現在文から後ろ' },
            { value: 'around', label: '前後3文' },
            { value: 'custom', label: '範囲指定' },
          ] as const).map((r) => (
            <button
              key={r.value}
              className={`btn btn-mode btn-small ${rangeMode === r.value ? 'active' : ''}`}
              onClick={() => onChangeRangeMode(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {rangeMode === 'custom' && (
        <div className="control-group range-custom">
          <label className="control-label">
            {rangeStart + 1}文目 〜 {rangeEnd + 1}文目
          </label>
          <input
            type="number"
            className="range-number-input"
            min={1}
            max={totalSentenceCount}
            value={rangeStart + 1}
            onChange={(e) => {
              const v = Math.max(0, Math.min(Number(e.target.value) - 1, totalSentenceCount - 1));
              onChangeRangeStart(v);
            }}
          />
          <span>〜</span>
          <input
            type="number"
            className="range-number-input"
            min={1}
            max={totalSentenceCount}
            value={rangeEnd + 1}
            onChange={(e) => {
              const v = Math.max(0, Math.min(Number(e.target.value) - 1, totalSentenceCount - 1));
              onChangeRangeEnd(v);
            }}
          />
        </div>
      )}
      {rangeMode !== 'all' && (
        <div className="control-group">
          <span className="text-muted">
            練習対象: {activeSentenceCount} / {totalSentenceCount} 文
          </span>
        </div>
      )}
    </div>
  );
}
