import React from 'react';

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

      {/* 苦手のみ */}
      <div className="control-group">
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
      </div>
    </div>
  );
}
