import React, { useState, useEffect, useRef } from 'react';
import { speak, cancelSpeech } from '../utils/speech';

interface Props {
  sentences: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  voice: SpeechSynthesisVoice | null;
  speechRate: number;
  onClose: () => void;
  /** App側のrefにSpaceキー用の読み上げ関数を渡す */
  onSpeakRef?: React.MutableRefObject<(() => void) | null>;
}

/**
 * プロンプター表示モード
 * 大きな文字で1文ずつ表示し、自動送り・背景切替・文字サイズ調整が可能
 */
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
  const total = sentences.length;
  const currentSentence = sentences[currentIndex] ?? '';

  // 現在の文を読み上げ（Spaceキーからも呼ばれる）
  const speakCurrent = () => {
    if (isSpeaking) {
      cancelSpeech();
      setIsSpeaking(false);
      return;
    }
    if (!currentSentence) return;
    cancelSpeech();
    setIsSpeaking(true);
    speak(currentSentence, {
      voice,
      rate: speechRate,
      onEnd: () => { if (!unmountedRef.current) setIsSpeaking(false); },
      onError: () => { if (!unmountedRef.current) setIsSpeaking(false); },
    });
  };

  // App側のrefに読み上げ関数を渡す（Spaceキー用）
  useEffect(() => {
    if (onSpeakRef) onSpeakRef.current = speakCurrent;
    return () => { if (onSpeakRef) onSpeakRef.current = null; };
  });

  // 自動送り
  useEffect(() => {
    if (!autoPlay) {
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
      return;
    }
    autoTimerRef.current = setInterval(() => {
      onChangeIndex(-1);
    }, autoSec * 1000);
    return () => {
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [autoPlay, autoSec, onChangeIndex]);

  // 自動送りで文が変わったら読み上げ
  useEffect(() => {
    if (autoPlay && currentSentence) {
      cancelSpeech();
      setIsSpeaking(true);
      speak(currentSentence, {
        voice,
        rate: speechRate,
        onEnd: () => { if (!unmountedRef.current) setIsSpeaking(false); },
        onError: () => { if (!unmountedRef.current) setIsSpeaking(false); },
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

  const goPrev = () => { cancelSpeech(); setIsSpeaking(false); if (currentIndex > 0) onChangeIndex(currentIndex - 1); };
  const goNext = () => { cancelSpeech(); setIsSpeaking(false); if (currentIndex < total - 1) onChangeIndex(currentIndex + 1); };

  const bgStyles: Record<string, React.CSSProperties> = {
    dark:  { background: '#111', color: '#fff' },
    light: { background: '#fff', color: '#111' },
    green: { background: '#003300', color: '#0f0' },
  };

  const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  return (
    <div className="prompter-overlay" style={bgStyles[bgMode]}>
      {/* ツールバー */}
      <div className="prompter-toolbar">
        <button className="btn btn-secondary btn-small" onClick={onClose}>
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
              onChange={(e) => setAutoPlay(e.target.checked)} />
            自動送り {autoSec}秒
          </label>
          {autoPlay && (
            <input type="range" min={2} max={15} value={autoSec}
              onChange={(e) => setAutoSec(Number(e.target.value))} />
          )}
        </div>
      </div>

      {/* 進捗バー */}
      <div className="prompter-progress">
        <div className="prompter-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* メイン表示 */}
      <div className="prompter-body" onClick={goNext}>
        <p className="prompter-text" style={{ fontSize }}>
          {currentSentence}
        </p>
      </div>

      {/* ナビ */}
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

      {/* キーヒント */}
      <div className="prompter-key-hints">
        ←→ 移動 / Space 読む / Esc 戻る
      </div>
    </div>
  );
}
