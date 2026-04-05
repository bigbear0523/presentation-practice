import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { PracticeMode } from './Controls';
import { speak, cancelSpeech, pauseSpeech, resumeSpeech } from '../utils/speech';

interface Props {
  sentences: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  practiceMode: PracticeMode;
  voice: SpeechSynthesisVoice | null;
  speechRate: number;
  hintLength: number;
  autoInterval: number;
  checkedItems: number[];
  onToggleChecked: (index: number) => void;
  weakItems: number[];
  onToggleWeak: (index: number) => void;
  /** 苦手自動判定: 読み上げ時に呼ばれる */
  onReplay?: (index: number) => void;
  /** 苦手自動判定: 素早く表示した時に呼ばれる */
  onFastReveal?: (index: number) => void;
}

/** キーボード操作用にApp側から呼び出せるハンドル */
export interface PracticePanelHandle {
  speakOrStop: () => void;
  toggleReveal: () => void;
  goNext: () => void;
  goPrev: () => void;
}

/**
 * メインの練習パネル
 *
 * 【なぜ useRef を多用するか】
 * speak() の onEnd は発話完了時（数秒後）に実行される非同期コールバック。
 * React の props/state はレンダー時点の値をクロージャに閉じ込めるため、
 * onEnd 内で参照すると「発話開始時」の古い値を掴む（stale closure）。
 * useRef.current は常に最新値を指すため、この問題を回避できる。
 */
const PracticePanel = forwardRef<PracticePanelHandle, Props>(function PracticePanel({
  sentences,
  currentIndex,
  onChangeIndex,
  practiceMode,
  voice,
  speechRate,
  hintLength,
  autoInterval,
  checkedItems,
  onToggleChecked,
  weakItems,
  onToggleWeak,
  onReplay,
  onFastReveal,
}, ref) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [speakingState, setSpeakingState] = useState<'idle' | 'speaking' | 'paused'>('idle');

  // --- 最新値を ref で保持（非同期コールバックから安全に参照するため） ---
  const sentencesRef = useRef(sentences);
  const currentIndexRef = useRef(currentIndex);
  const voiceRef = useRef(voice);
  const speechRateRef = useRef(speechRate);
  const onChangeIndexRef = useRef(onChangeIndex);
  sentencesRef.current = sentences;
  currentIndexRef.current = currentIndex;
  voiceRef.current = voice;
  speechRateRef.current = speechRate;
  onChangeIndexRef.current = onChangeIndex;

  const isReadingAll = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  // 苦手自動判定: 文が表示された時刻を記録し、素早い表示を検出
  const shownAtRef = useRef<number>(Date.now());

  const total = sentences.length;
  const currentSentence = sentences[currentIndex] ?? '';

  const resetSpeechState = useCallback(() => {
    cancelSpeech();
    isReadingAll.current = false;
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (!unmountedRef.current) {
      setSpeakingState('idle');
    }
  }, []);

  // インデックス変更時にリセット & 表示時刻を記録
  useEffect(() => {
    setIsRevealed(false);
    shownAtRef.current = Date.now();
  }, [currentIndex]);

  useEffect(() => {
    resetSpeechState();
  }, [sentences, resetSpeechState]);

  useEffect(() => {
    if (practiceMode !== 'auto') {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }
    autoTimerRef.current = setInterval(() => {
      onChangeIndexRef.current(-1);
    }, autoInterval * 1000);
    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [practiceMode, autoInterval]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cancelSpeech();
      isReadingAll.current = false;
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, []);

  const speakText = (text: string) => {
    if (!text || unmountedRef.current) return;
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setSpeakingState('speaking');
    speak(text, {
      voice: voiceRef.current,
      rate: speechRateRef.current,
      onEnd: () => {
        if (unmountedRef.current) return;
        if (isReadingAll.current) {
          const idx = currentIndexRef.current;
          const len = sentencesRef.current.length;
          if (idx < len - 1) {
            const nextIdx = idx + 1;
            onChangeIndexRef.current(nextIdx);
            pendingTimerRef.current = setTimeout(() => {
              pendingTimerRef.current = null;
              if (unmountedRef.current) return;
              if (isReadingAll.current) {
                speakText(sentencesRef.current[nextIdx] ?? '');
              } else {
                setSpeakingState('idle');
              }
            }, 300);
          } else {
            isReadingAll.current = false;
            setSpeakingState('idle');
          }
        } else {
          setSpeakingState('idle');
        }
      },
      onError: () => {
        if (unmountedRef.current) return;
        isReadingAll.current = false;
        setSpeakingState('idle');
      },
    });
  };

  const speakCurrent = () => {
    isReadingAll.current = false;
    onReplay?.(currentIndexRef.current);
    speakText(sentencesRef.current[currentIndexRef.current] ?? '');
  };

  const speakAll = () => {
    isReadingAll.current = true;
    speakText(sentencesRef.current[currentIndexRef.current] ?? '');
  };

  useEffect(() => {
    if (practiceMode === 'auto' && currentSentence) {
      isReadingAll.current = false;
      speakText(currentSentence);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, practiceMode]);

  const handlePause = () => { pauseSpeech(); setSpeakingState('paused'); };
  const handleResume = () => { resumeSpeech(); setSpeakingState('speaking'); };
  const handleStop = () => { resetSpeechState(); };

  const goFirst = () => { resetSpeechState(); onChangeIndex(0); };
  const goPrev = () => { resetSpeechState(); if (currentIndex > 0) onChangeIndex(currentIndex - 1); };
  const goNext = () => { resetSpeechState(); if (currentIndex < total - 1) onChangeIndex(currentIndex + 1); };
  const goRandom = () => { resetSpeechState(); onChangeIndex(Math.floor(Math.random() * total)); };

  // 表示切替（苦手自動判定: 2秒以内に表示 → 素早い表示としてカウント）
  const handleRevealToggle = () => {
    if (!isRevealed && (practiceMode === 'blanked' || practiceMode === 'hint')) {
      const elapsed = Date.now() - shownAtRef.current;
      if (elapsed < 2000) {
        onFastReveal?.(currentIndex);
      }
    }
    setIsRevealed((prev) => !prev);
  };

  // --- キーボード操作ハンドル ---
  useImperativeHandle(ref, () => ({
    speakOrStop() {
      if (speakingState === 'idle') speakCurrent();
      else handleStop();
    },
    toggleReveal() { handleRevealToggle(); },
    goNext,
    goPrev,
  }));

  const getDisplayText = (): string => {
    if (practiceMode === 'blanked') {
      return isRevealed ? currentSentence : '（ここに文が隠れています。「表示」を押してください）';
    }
    if (practiceMode === 'hint') {
      if (isRevealed) return currentSentence;
      return `${currentSentence.slice(0, hintLength)}${'…'.repeat(3)}`;
    }
    return currentSentence;
  };

  const isHidden = (practiceMode === 'blanked' || practiceMode === 'hint') && !isRevealed;

  return (
    <div className="practice-panel">
      <div className="position-info">
        <span className="position-text">
          {currentIndex + 1} / {total}
        </span>
        {speakingState !== 'idle' && (
          <span className={`status-badge status-${speakingState}`}>
            {speakingState === 'speaking' ? '読み上げ中' : '一時停止中'}
          </span>
        )}
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <div className={`sentence-display ${speakingState === 'speaking' ? 'speaking' : ''} ${isHidden ? 'hidden-text' : ''}`}>
        <p className="sentence-text">{getDisplayText()}</p>
      </div>

      {(practiceMode === 'blanked' || practiceMode === 'hint') && (
        <div className="reveal-controls">
          <button className="btn btn-primary btn-large" onClick={handleRevealToggle}>
            {isRevealed ? '隠す' : '表示する'}
          </button>
        </div>
      )}

      <div className="speech-controls">
        {speakingState === 'idle' && (
          <>
            <button className="btn btn-primary" onClick={speakCurrent}>
              ▶ 現在の文を読む
            </button>
            <button className="btn btn-secondary" onClick={speakAll}>
              ▶▶ 全文を順番に読む
            </button>
          </>
        )}
        {speakingState === 'speaking' && (
          <>
            <button className="btn btn-warning" onClick={handlePause}>⏸ 一時停止</button>
            <button className="btn btn-danger" onClick={handleStop}>⏹ 停止</button>
          </>
        )}
        {speakingState === 'paused' && (
          <>
            <button className="btn btn-primary" onClick={handleResume}>▶ 再開</button>
            <button className="btn btn-danger" onClick={handleStop}>⏹ 停止</button>
          </>
        )}
      </div>

      <div className="nav-controls">
        <button className="btn btn-secondary" onClick={goFirst}>⏮ 最初へ</button>
        <button className="btn btn-secondary" onClick={goPrev} disabled={currentIndex === 0}>◀ 前へ</button>
        <button className="btn btn-secondary" onClick={goNext} disabled={currentIndex >= total - 1}>次へ ▶</button>
        <button className="btn btn-secondary" onClick={goRandom}>🔀 ランダム</button>
      </div>

      <div className="mark-controls">
        <button
          className={`btn ${checkedItems.includes(currentIndex) ? 'btn-success' : 'btn-secondary'}`}
          onClick={() => onToggleChecked(currentIndex)}
        >
          {checkedItems.includes(currentIndex) ? '✔ チェック済み' : '☐ チェックする'}
        </button>
        <button
          className={`btn ${weakItems.includes(currentIndex) ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => onToggleWeak(currentIndex)}
        >
          {weakItems.includes(currentIndex) ? '★ 苦手マーク済み' : '☆ 苦手マーク'}
        </button>
      </div>
    </div>
  );
});

export default PracticePanel;
