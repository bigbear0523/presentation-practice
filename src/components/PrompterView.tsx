import React, { useState, useEffect, useRef, useCallback } from 'react';
import { speak, cancelSpeech, getSpeechGeneration } from '../utils/speech';
import { loadPrompterSettings, savePrompterSettings } from '../utils/storage';
import type { PrompterSettings } from '../utils/storage';

/** 本番タイマー情報（App側から渡される、表示のみ） */
export interface PrompterTimer {
  isRunning: boolean;
  elapsed: number;    // 秒
  limitSec: number;
  onStart: () => void;
  onStop: () => void;
  finished: boolean;
  limitMinutes: number;
  onChangeLimitMinutes: (m: number) => void;
}

type BgMode = 'dark' | 'light' | 'green' | 'sepia' | 'blue' | 'highcontrast';
type AutoMode = 'fixed' | 'adaptive';

/** 設定プリセット */
interface Preset { label: string; fontSize: number; lineHeight: number; maxWidthPct: number; bgMode: BgMode; }
const PRESETS: Preset[] = [
  { label: '標準', fontSize: 48, lineHeight: 1.6, maxWidthPct: 90, bgMode: 'dark' },
  { label: '大会場', fontSize: 72, lineHeight: 1.8, maxWidthPct: 80, bgMode: 'dark' },
  { label: '読みやすい', fontSize: 56, lineHeight: 2.0, maxWidthPct: 70, bgMode: 'sepia' },
  { label: '高コントラスト', fontSize: 64, lineHeight: 1.8, maxWidthPct: 85, bgMode: 'highcontrast' },
];

interface Props {
  sentences: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  voice: SpeechSynthesisVoice | null;
  speechRate: number;
  onClose: () => void;
  onSpeakRef?: React.MutableRefObject<(() => void) | null>;
  /** 本番タイマー（省略時はタイマー非表示） */
  timer?: PrompterTimer;
  /** 章名 */
  chapterName?: string;
  /** 章内の文数 */
  chapterTotal?: number;
  /** 章内の現在位置 (0-based) */
  chapterCurrent?: number;
  /** 全体の文数 */
  allSentencesCount?: number;
  /** 苦手マークのインデックス配列 (allSentences基準) */
  weakItems?: number[];
  /** 録音済みインデックス配列 (allSentences基準) */
  recordedIndices?: number[];
  /** 現在文のallSentences上のインデックス */
  currentGlobalIndex?: number;
  /** 自動苦手スタッツ (allSentences基準) */
  autoWeakStats?: Record<string, { fastReveals: number; replays: number; reRecords: number }>;
}

const BG_STYLES: Record<BgMode, React.CSSProperties> = {
  dark:         { background: '#111', color: '#fff' },
  light:        { background: '#fff', color: '#111' },
  green:        { background: '#003300', color: '#0f0' },
  sepia:        { background: '#f4ecd8', color: '#3e2723' },
  blue:         { background: '#0d1b2a', color: '#e0e0ff' },
  highcontrast: { background: '#000', color: '#ff0' },
};

const BG_LABELS: Record<BgMode, string> = {
  dark: '黒', light: '白', green: '緑',
  sepia: 'セピア', blue: '青', highcontrast: '高コン',
};

const BG_MODES: BgMode[] = ['dark', 'light', 'green', 'sepia', 'blue', 'highcontrast'];

export default function PrompterView({
  sentences,
  currentIndex,
  onChangeIndex,
  voice,
  speechRate,
  onClose,
  onSpeakRef,
  timer,
  chapterName,
  chapterTotal,
  chapterCurrent,
  allSentencesCount,
  weakItems,
  recordedIndices,
  currentGlobalIndex,
  autoWeakStats,
}: Props) {
  // --- 設定の復元 ---
  const [saved] = useState<PrompterSettings>(() => loadPrompterSettings());
  const [autoMinOnStart, setAutoMinOnStart] = useState(saved.autoMinOnStart ?? true);

  // --- Phase 1: UI state ---
  const [fontSize, setFontSize] = useState(saved.fontSize);
  const [lineHeight, setLineHeight] = useState(saved.lineHeight);
  const [maxWidthPct, setMaxWidthPct] = useState(saved.maxWidthPct);
  const [bgMode, setBgMode] = useState<BgMode>((saved.bgMode as BgMode) || 'dark');
  const [toolbarCollapsed, setToolbarCollapsed] = useState(saved.toolbarCollapsed);

  // --- Phase 2: Tap navigation ---
  const [tapNavEnabled, setTapNavEnabled] = useState(saved.tapNavEnabled);

  // --- Phase 3: Auto-advance ---
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSec, setAutoSec] = useState(saved.autoSec);
  const [autoMode, setAutoMode] = useState<AutoMode>((saved.autoMode as AutoMode) || 'fixed');
  const [autoCoeff, setAutoCoeff] = useState(saved.autoCoeff);
  const [autoMinSec, setAutoMinSec] = useState(saved.autoMinSec);
  const [autoMaxSec, setAutoMaxSec] = useState(saved.autoMaxSec);

  // --- 設定の自動保存 ---
  useEffect(() => {
    savePrompterSettings({
      fontSize, lineHeight, maxWidthPct, bgMode, toolbarCollapsed,
      tapNavEnabled, autoMode, autoSec, autoCoeff, autoMinSec, autoMaxSec,
      autoMinOnStart,
    });
  }, [fontSize, lineHeight, maxWidthPct, bgMode, toolbarCollapsed,
      tapNavEnabled, autoMode, autoSec, autoCoeff, autoMinSec, autoMaxSec, autoMinOnStart]);

  // --- 本番開始時にツールバー自動最小化 ---
  const prevTimerRunning = useRef(false);
  useEffect(() => {
    if (timer?.isRunning && !prevTimerRunning.current && autoMinOnStart) {
      setToolbarCollapsed(true);
    }
    prevTimerRunning.current = !!timer?.isRunning;
  }, [timer?.isRunning, autoMinOnStart]);

  const [isSpeaking, setIsSpeaking] = useState(false);

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  /**
   * 手動停止フラグ。stopAll() で true になり、
   * 自動送り effect の読み上げを抑止する。
   * autoPlay を ON に切り替えたときに false に戻す。
   */
  const stoppedRef = useRef(false);

  const total = sentences.length;
  const currentSentence = sentences[currentIndex] ?? '';

  // --- Auto delay calculation ---
  const getAutoDelay = useCallback(() => {
    if (autoMode === 'fixed') return autoSec * 1000;
    const ms = currentSentence.length * autoCoeff;
    return Math.max(autoMinSec * 1000, Math.min(autoMaxSec * 1000, ms));
  }, [autoMode, autoSec, autoCoeff, autoMinSec, autoMaxSec, currentSentence.length]);

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

  // --- Phase 3: 自動送りタイマー (setTimeout化) ---
  useEffect(() => {
    if (!autoPlay) {
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
      return;
    }
    // autoPlay ON → 停止フラグ解除
    stoppedRef.current = false;
    autoTimerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      onChangeIndex(-1);
    }, getAutoDelay());
    return () => {
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [autoPlay, currentIndex, getAutoDelay, onChangeIndex]);

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
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, []);

  const goPrev = () => { stopAll(); if (currentIndex > 0) onChangeIndex(currentIndex - 1); };
  const goNext = () => { stopAll(); if (currentIndex < total - 1) onChangeIndex(currentIndex + 1); };

  // --- Phase 2: Body click handler ---
  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapNavEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) {
      goPrev();
    } else {
      goNext();
    }
  };

  const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  // --- Phase 5: marks ---
  const isWeak = weakItems != null && currentGlobalIndex != null && weakItems.includes(currentGlobalIndex);
  const isRecorded = recordedIndices != null && currentGlobalIndex != null && recordedIndices.includes(currentGlobalIndex);
  const isAutoWeak = autoWeakStats != null && currentGlobalIndex != null && (() => {
    const s = autoWeakStats[String(currentGlobalIndex)];
    return s ? (s.fastReveals >= 2 || s.replays >= 3 || s.reRecords >= 2) : false;
  })();

  // --- Phase 4: remaining time color ---
  const remainColor = (elapsed: number, limitSec: number): string => {
    if (limitSec === 0) return 'inherit';
    const ratio = (limitSec - elapsed) / limitSec;
    if (ratio > 0.3) return '#30d158';
    if (ratio > 0.1) return '#ffd60a';
    return '#ff453a';
  };

  const estimatedFinishSec = (idx: number, ttl: number, elapsed: number): number => {
    if (idx === 0 || elapsed === 0) return 0;
    return Math.round((elapsed / (idx + 1)) * ttl);
  };

  const autoDelaySec = Math.round(getAutoDelay() / 1000 * 10) / 10;

  return (
    <div className="prompter-overlay" style={BG_STYLES[bgMode]}>
      {/* ツールバー */}
      <div className={`prompter-toolbar ${toolbarCollapsed ? 'collapsed' : ''}`}>
        <button className="btn btn-secondary btn-small" onClick={() => { stopAll(); onClose(); }}>
          通常モードに戻る
        </button>

        <span className="prompter-pos">{currentIndex + 1} / {total}</span>

        {isSpeaking && <span className="status-badge status-speaking">読み上げ中</span>}

        {toolbarCollapsed ? (
          <button className="btn btn-small prompter-collapse-btn" onClick={() => setToolbarCollapsed(false)}>
            設定 ▼
          </button>
        ) : (
          <>
            <div className="prompter-settings">
              {/* 文字サイズ */}
              <label className="prompter-label">
                文字: {fontSize}px
                <input type="range" min={16} max={120} value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))} />
              </label>

              {/* 行間 */}
              <label className="prompter-label">
                行間: {lineHeight}
                <input type="range" min={1.2} max={2.4} step={0.2} value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))} />
              </label>

              {/* 表示幅 */}
              <label className="prompter-label">
                幅: {maxWidthPct}%
                <input type="range" min={40} max={100} step={5} value={maxWidthPct}
                  onChange={(e) => setMaxWidthPct(Number(e.target.value))} />
              </label>

              {/* 背景色 */}
              <div className="btn-group prompter-bg-group">
                {BG_MODES.map((m) => (
                  <button key={m}
                    className={`btn btn-small ${bgMode === m ? 'active' : ''}`}
                    style={bgMode !== m ? { opacity: 0.6 } : {}}
                    onClick={() => setBgMode(m)}
                  >
                    {BG_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* タップ操作 */}
              <label className="prompter-label">
                <input type="checkbox" checked={tapNavEnabled}
                  onChange={(e) => setTapNavEnabled(e.target.checked)} />
                タップ移動
              </label>

              {/* プリセット */}
              <div className="btn-group">
                {PRESETS.map((p) => (
                  <button key={p.label} className="btn btn-small"
                    style={{ opacity: 0.7 }}
                    onClick={() => {
                      setFontSize(p.fontSize); setLineHeight(p.lineHeight);
                      setMaxWidthPct(p.maxWidthPct); setBgMode(p.bgMode);
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 自動送り */}
              <label className="prompter-label">
                <input type="checkbox" checked={autoPlay}
                  onChange={(e) => {
                    if (!e.target.checked) { stopAll(); }
                    else { stoppedRef.current = false; setAutoPlay(true); }
                  }} />
                自動送り
              </label>
              {autoPlay && (
                <div className="prompter-auto-settings">
                  <div className="btn-group">
                    <button className={`btn btn-small ${autoMode === 'fixed' ? 'active' : ''}`}
                      onClick={() => setAutoMode('fixed')}>固定</button>
                    <button className={`btn btn-small ${autoMode === 'adaptive' ? 'active' : ''}`}
                      onClick={() => setAutoMode('adaptive')}>文字数</button>
                  </div>
                  {autoMode === 'fixed' ? (
                    <label className="prompter-label">
                      {autoSec}秒
                      <input type="range" min={2} max={15} value={autoSec}
                        onChange={(e) => setAutoSec(Number(e.target.value))} />
                    </label>
                  ) : (
                    <>
                      <label className="prompter-label">
                        {autoCoeff}ms/字
                        <input type="range" min={50} max={300} step={10} value={autoCoeff}
                          onChange={(e) => setAutoCoeff(Number(e.target.value))} />
                      </label>
                      <span className="prompter-auto-bounds">
                        ({autoMinSec}〜{autoMaxSec}秒)
                      </span>
                    </>
                  )}
                  <span className="prompter-auto-status">次: {autoDelaySec}秒</span>
                </div>
              )}

              <label className="prompter-label">
                <input type="checkbox" checked={autoMinOnStart}
                  onChange={(e) => setAutoMinOnStart(e.target.checked)} />
                本番時自動最小化
              </label>

              <button className="btn btn-small prompter-collapse-btn" onClick={() => setToolbarCollapsed(true)}>
                ▲ 最小化
              </button>
            </div>
          </>
        )}
      </div>

      {/* プログレスバー */}
      <div className="prompter-progress">
        <div className="prompter-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* 情報バー (Phase 4) */}
      {(chapterName || allSentencesCount != null) && (
        <div className="prompter-info-bar" style={{ color: BG_STYLES[bgMode].color }}>
          {chapterName && (
            <span className="prompter-info-item">「{chapterName}」</span>
          )}
          {chapterTotal != null && chapterCurrent != null && (
            <span className="prompter-info-item">章 {chapterCurrent + 1}/{chapterTotal}</span>
          )}
          <span className="prompter-info-item">
            全体 {currentIndex + 1}/{total}
          </span>
          <span className="prompter-info-item">
            残り {Math.max(0, total - currentIndex - 1)}文
          </span>
          {timer?.isRunning && timer.elapsed > 0 && currentIndex > 0 && (
            <span className="prompter-info-item">
              予想完了: {fmtTime(estimatedFinishSec(currentIndex, total, timer.elapsed))}
            </span>
          )}
        </div>
      )}

      {/* マーク表示 (Phase 5) */}
      {(isWeak || isAutoWeak || isRecorded) && (
        <div className="prompter-marks">
          {isWeak && <span className="prompter-mark prompter-mark-weak">★ 苦手</span>}
          {isAutoWeak && !isWeak && <span className="prompter-mark prompter-mark-auto-weak">⚡ 自動苦手</span>}
          {isRecorded && <span className="prompter-mark prompter-mark-recorded">🎤 録音済</span>}
        </div>
      )}

      {/* 本文表示 */}
      <div className="prompter-body" onClick={handleBodyClick}>
        <p className="prompter-text" style={{ fontSize, lineHeight, maxWidth: `${maxWidthPct}%` }}>
          {currentSentence}
        </p>
      </div>

      {/* 本番タイマー表示 */}
      {timer && (
        <div className="prompter-timer">
          {!timer.isRunning && !timer.finished && (
            <div className="prompter-timer-setup">
              {[3, 5, 10, 15, 20].map((m) => (
                <button key={m}
                  className={`btn btn-small ${timer.limitMinutes === m ? 'active' : ''}`}
                  style={timer.limitMinutes !== m ? { opacity: 0.5 } : {}}
                  onClick={() => timer.onChangeLimitMinutes(m)}
                >{m}分</button>
              ))}
              <button className="btn btn-primary btn-small" onClick={timer.onStart}>本番開始</button>
            </div>
          )}
          {(timer.isRunning || timer.finished) && (
            <>
              <div className="prompter-timer-display">
                <span className="prompter-timer-clock">{fmtTime(timer.elapsed)}</span>
                <span className="prompter-timer-sep"> / </span>
                <span className="prompter-timer-limit">{fmtTime(timer.limitSec)}</span>
                <span className="prompter-timer-remain"
                  style={{ color: timer.isRunning ? remainColor(timer.elapsed, timer.limitSec) : undefined }}>
                  （残り {fmtTime(Math.max(0, timer.limitSec - timer.elapsed))}）
                </span>
                <span className="prompter-timer-pace"
                  style={{ color: paceColor(currentIndex, total, timer.elapsed, timer.limitSec) }}>
                  {paceLabel(currentIndex, total, timer.elapsed, timer.limitSec)}
                </span>
              </div>
              {timer.isRunning && (
                <button className="btn btn-danger btn-small" onClick={timer.onStop}>本番終了</button>
              )}
              {timer.finished && (
                <div className="prompter-timer-result">
                  <span>完了 — {fmtTime(timer.elapsed)} / {currentIndex + 1}文</span>
                  <button className="btn btn-primary btn-small" onClick={timer.onStart}>もう一度</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

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
        {tapNavEnabled && ' / タップ: 左=前へ 右=次へ'}
      </div>
    </div>
  );
}

// --- ヘルパー ---
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function paceLabel(idx: number, total: number, elapsed: number, limitSec: number): string {
  if (total === 0 || limitSec === 0) return '';
  const progress = (idx + 1) / total;
  const timeProg = elapsed / limitSec;
  const diff = progress - timeProg;
  if (Math.abs(diff) < 0.05) return '予定通り';
  if (diff > 0) return `${Math.round(diff * 100)}% 先行`;
  return `${Math.round(Math.abs(diff) * 100)}% 遅れ`;
}

function paceColor(idx: number, total: number, elapsed: number, limitSec: number): string {
  if (total === 0 || limitSec === 0) return 'inherit';
  const diff = (idx + 1) / total - elapsed / limitSec;
  if (Math.abs(diff) < 0.05) return '#30d158';
  if (diff > 0) return '#0a84ff';
  return '#ff453a';
}
