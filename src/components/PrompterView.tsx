import React, { useState, useEffect, useRef } from 'react';
import { speak, cancelSpeech, getSpeechGeneration } from '../utils/speech';

interface Props {
  sentences: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  voice: SpeechSynthesisVoice | null;
  speechRate: number;
  onClose: () => void;
  onSpeakRef?: React.MutableRefObject<(() => void) | null>;
}

export default function PrompterView({
  sentences,
  currentIndex,
  onChangeIndex,
  voice,
  speechRate,
  onClose,
  onSpeakRef,
}: Props) {
  const [fontSize, setFontSize] = useState(48);
  const [bgMode, setBgMode] = useState<'dark' | 'light' | 'green'>('dark');
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSec, setAutoSec] = useState(5);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);
  /**
   * 手動停止フラグ。stopAll() で true になり、
   * 自動送り effect の読み上げを抑止する。
   * autoPlay を ON に切り替えたときに false に戻す。
   */
  const stoppedRef = useRef(false);

  const total = sentences.length;
  const currentSentence = sentences[currentIndex] ?? '';

  /** 全停止: 読み上げキャンセル + 自動送り停止 + 停止フラグ ON */
  const stopAll = () => {
    cancelSpeech();
    stoppedRef.current = true;
    setAutoPlay(false);
    if (!unmountedRef.current) setIsSpeaking(false);
  };

  const speakCurrent = () => {
    if (isSpeaking) {
      stopAll();
      return;
    }
    if (!currentSentence) return;
    stoppedRef.current = false; // 明示的な再生操作 → 停止フラグ解除
    cancelSpeech();
    setIsSpeaking(true);
    const gen = getSpeechGeneration();
    speak(currentSentence, {
      voice,
      rate: speechRate,
      onEnd: () => {
        if (unmountedRef.current || stoppedRef.current) return;
        if (getSpeechGeneration() !== gen) return;
        setIsSpeaking(false);
      },
      onError: () => {
        if (unmountedRef.current || stoppedRef.current) return;
        if (getSpeechGeneration() !== gen) return;
        setIsSpeaking(false);
      },
    });
  };

  useEffect(() => {
    if (onSpeakRef) onSpeakRef.current = speakCurrent;
    return () => { if (onSpeakRef) onSpeakRef.current = null; };
  });

  // 自動送りタイマー
  useEffect(() => {
    if (!autoPlay) {
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
      return;
    }
    // autoPlay ON → 停止フラグ解除
    stoppedRef.current = false;
    autoTimerRef.current = setInterval(() => {
      if (stoppedRef.current) return; // 念のため
      onChangeIndex(-1);
    }, autoSec * 1000);
    return () => {
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [autoPlay, autoSec, onChangeIndex]);

  // 自動送りで文が変わったら読み上げ
  useEffect(() => {
    // 手動停止後は自動再生しない
    if (stoppedRef.current) return;
    if (autoPlay && currentSentence) {
      cancelSpeech();
      setIsSpeaking(true);
      const gen = getSpeechGeneration();
      speak(currentSentence, {
        voice,
        rate: speechRate,
        onEnd: () => {
          if (unmountedRef.current || stoppedRef.current) return;
          if (getSpeechGeneration() !== gen) return;
          setIsSpeaking(false);
        },
        onError: () => {
          if (unmountedRef.current || stoppedRef.current) return;
          if (getSpeechGeneration() !== gen) return;
          setIsSpeaking(false);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, autoPlay]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cancelSpeech();
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, []);

  const goPrev = () => { stopAll(); if (currentIndex > 0) onChangeIndex(currentIndex - 1); };
  const goNext = () => { stopAll(); if (currentIndex < total - 1) onChangeIndex(currentIndex + 1); };

  const bgStyles: Record<string, React.CSSProperties> = {
    dark:  { background: '#111', color: '#fff' },
    light: { background: '#fff', color: '#111' },
    green: { background: '#003300', color: '#0f0' },
  };

  const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  return (
    <div className="prompter-overlay" style={bgStyles[bgMode]}>
      <div className="prompter-toolbar">
        <button className="btn btn-secondary btn-small" onClick={() => { stopAll(); onClose(); }}>
          通常モードに戻る
        </button>

        <span className="prompter-pos">{currentIndex + 1} / {total}</span>

        {isSpeaking && <span className="status-badge status-speaking">読み上げ中</span>}

        <div className="prompter-settings">
          <label className="prompter-label">
            文字: {fontSize}px
            <input type="range" min={24} max={96} value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>

          <div className="btn-group">
            {(['dark', 'light', 'green'] as const).map((m) => (
              <button key={m}
                className={`btn btn-small ${bgMode === m ? 'active' : ''}`}
                style={bgMode !== m ? { opacity: 0.6 } : {}}
                onClick={() => setBgMode(m)}
              >
                {m === 'dark' ? '黒' : m === 'light' ? '白' : '緑'}
              </button>
            ))}
          </div>

          <label className="prompter-label">
            <input type="checkbox" checked={autoPlay}
              onChange={(e) => {
                if (!e.target.checked) { stopAll(); }
                else { stoppedRef.current = false; setAutoPlay(true); }
              }} />
            自動送り {autoSec}秒
          </label>
          {autoPlay && (
            <input type="range" min={2} max={15} value={autoSec}
              onChange={(e) => setAutoSec(Number(e.target.value))} />
          )}
        </div>
      </div>

      <div className="prompter-progress">
        <div className="prompter-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="prompter-body" onClick={goNext}>
        <p className="prompter-text" style={{ fontSize }}>
          {currentSentence}
        </p>
      </div>

      <div className="prompter-nav">
        <button className="btn btn-secondary" onClick={goPrev} disabled={currentIndex === 0}>
          ◀ 前へ
        </button>
        <button className="btn btn-secondary" onClick={speakCurrent}>
          {isSpeaking ? '⏹ 停止' : '▶ 読む'}
        </button>
        <button className="btn btn-secondary" onClick={goNext} disabled={currentIndex >= total - 1}>
          次へ ▶
        </button>
      </div>

      <div className="prompter-key-hints">
        ←→ 移動 / Space 読む / Esc 戻る
      </div>
    </div>
  );
}
