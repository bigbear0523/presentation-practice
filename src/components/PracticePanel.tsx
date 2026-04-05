import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { PracticeMode } from './Controls';
import { speak, cancelSpeech, pauseSpeech, resumeSpeech, getSpeechGeneration } from '../utils/speech';

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
  onReplay?: (index: number) => void;
  onFastReveal?: (index: number) => void;
}

export interface PracticePanelHandle {
  speakOrStop: () => void;
  toggleReveal: () => void;
  goNext: () => void;
  goPrev: () => void;
}

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
  const shownAtRef = useRef<number>(Date.now());

  /**
   * 手動停止フラグ。
   * true のとき、useEffect による自動再生（auto モードの currentIndex 変化）を抑止する。
   * ユーザーが明示的に再生操作をしたときに false に戻す。
   */
  const stoppedRef = useRef(false);

  const total = sentences.length;
  const currentSentence = sentences[currentIndex] ?? '';

  /**
   * 全再生状態を安全にリセットする中央関数。
   * cancelSpeech() で世代を進め、全タイマー・フラグをクリアする。
   */
  const resetSpeechState = useCallback(() => {
    cancelSpeech();
    isReadingAll.current = false;
    stoppedRef.current = true; // 停止フラグ ON
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (!unmountedRef.current) {
      setSpeakingState('idle');
    }
  }, []);

  useEffect(() => {
    setIsRevealed(false);
    shownAtRef.current = Date.now();
  }, [currentIndex]);

  useEffect(() => {
    resetSpeechState();
  }, [sentences, resetSpeechState]);

  // 自動送りモードのタイマー（practiceMode === 'auto' のときのみ）
  useEffect(() => {
    if (practiceMode !== 'auto') {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }
    // auto モードに切り替わったら停止フラグ解除
    stoppedRef.current = false;
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

  /**
   * 指定テキストを読み上げる。
   * onEnd / setTimeout 内で世代チェック + 停止フラグチェックを二重で行う。
   */
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
        // 停止済みなら何もしない
        if (stoppedRef.current) {
          setSpeakingState('idle');
          return;
        }

        if (isReadingAll.current) {
          const idx = currentIndexRef.current;
          const len = sentencesRef.current.length;
          if (idx < len - 1) {
            const nextIdx = idx + 1;
            onChangeIndexRef.current(nextIdx);
            const genBeforeTimer = getSpeechGeneration();
            pendingTimerRef.current = setTimeout(() => {
              pendingTimerRef.current = null;
              if (unmountedRef.current) return;
              if (stoppedRef.current) { setSpeakingState('idle'); return; }
              if (getSpeechGeneration() !== genBeforeTimer) return;
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
    stoppedRef.current = false; // 明示的な再生操作 → 停止フラグ解除
    isReadingAll.current = false;
    onReplay?.(currentIndexRef.current);
    speakText(sentencesRef.current[currentIndexRef.current] ?? '');
  };

  const speakAll = () => {
    stoppedRef.current = false; // 明示的な再生操作 → 停止フラグ解除
    isReadingAll.current = true;
    speakText(sentencesRef.current[currentIndexRef.current] ?? '');
  };

  /**
   * auto モードで currentIndex が変わったら自動読み上げ。
   * ただし stoppedRef.current === true（手動停止後）なら発火しない。
   */
  useEffect(() => {
    if (practiceMode === 'auto' && currentSentence && !stoppedRef.current) {
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

  const handleRevealToggle = () => {
    if (!isRevealed && (practiceMode === 'blanked' || practiceMode === 'hint')) {
      const elapsed = Date.now() - shownAtRef.current;
      if (elapsed < 2000) {
        onFastReveal?.(currentIndex);
      }
    }
    setIsRevealed((prev) => !prev);
  };

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
