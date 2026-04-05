import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ScriptInput from './components/ScriptInput';
import PracticePanel from './components/PracticePanel';
import type { PracticePanelHandle } from './components/PracticePanel';
import Controls from './components/Controls';
import type { PracticeMode, SplitMode } from './components/Controls';
import ProgressPanel from './components/ProgressPanel';
import RecordingPanel from './components/RecordingPanel';
import type { RecordingPanelHandle } from './components/RecordingPanel';
import PrompterView from './components/PrompterView';
import { parseScript, SAMPLE_SCRIPT } from './utils/scriptParser';
import { getJapaneseVoice, cancelSpeech } from './utils/speech';
import {
  saveScript, loadScript,
  saveCheckedItems, loadCheckedItems,
  saveWeakItems, loadWeakItems,
  saveCurrentIndex, loadCurrentIndex,
  savePracticeMode, loadPracticeMode,
  saveSplitMode, loadSplitMode,
  saveSpeechRate, loadSpeechRate,
  saveDarkMode, loadDarkMode,
  saveHintLength, loadHintLength,
  saveAutoInterval, loadAutoInterval,
  clearAllData,
  saveAutoWeakStats, loadAutoWeakStats, isAutoWeak,
  type SentenceStatsMap, type SentenceStats,
} from './utils/storage';

// --- ErrorBoundary ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }
  handleReload = () => { window.location.reload(); };
  handleClearAndReload = () => { clearAllData(); window.location.reload(); };
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#c00', background: '#fff0f0', margin: 16, borderRadius: 8 }}>
          <h2 style={{ marginBottom: 12 }}>エラーが発生しました</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#666', marginTop: 8 }}>{this.state.error.stack}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={this.handleReload} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 14 }}>再読み込み</button>
            <button onClick={this.handleClearAndReload} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #c00', background: '#c00', color: '#fff', cursor: 'pointer', fontSize: 14 }}>保存データを初期化して再読み込み</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- 統計ヘルパー ---
function bumpStat(
  stats: SentenceStatsMap,
  index: number,
  field: keyof SentenceStats,
): SentenceStatsMap {
  const key = String(index);
  const prev = stats[key] ?? { fastReveals: 0, replays: 0, reRecords: 0 };
  return { ...stats, [key]: { ...prev, [field]: prev[field] + 1 } };
}

function AppInner() {
  const [scriptText, setScriptText] = useState(() => loadScript() || SAMPLE_SCRIPT);
  const [splitMode, setSplitMode] = useState<SplitMode>(() => loadSplitMode() as SplitMode);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(() => loadPracticeMode() as PracticeMode);
  const [currentIndex, setCurrentIndex] = useState(() => loadCurrentIndex());
  const [checkedItems, setCheckedItems] = useState<number[]>(() => loadCheckedItems());
  const [weakItems, setWeakItems] = useState<number[]>(() => loadWeakItems());
  const [speechRate, setSpeechRate] = useState(() => loadSpeechRate());
  const [darkMode, setDarkMode] = useState(() => loadDarkMode());
  const [hintLength, setHintLength] = useState(() => loadHintLength());
  const [autoInterval, setAutoInterval] = useState(() => loadAutoInterval());
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [weakOnly, setWeakOnly] = useState(false);
  const [autoWeakOnly, setAutoWeakOnly] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [isPrompter, setIsPrompter] = useState(false);
  const [autoWeakStats, setAutoWeakStats] = useState<SentenceStatsMap>(() => loadAutoWeakStats());

  // キーボード操作用 ref
  const practiceRef = useRef<PracticePanelHandle>(null);
  const recordingRef = useRef<RecordingPanelHandle>(null);
  // プロンプター中のSpace読み上げ用（PrompterViewから関数を受け取る）
  const prompterSpeakRef = useRef<(() => void) | null>(null);

  useEffect(() => { getJapaneseVoice().then((v) => setVoice(v)); }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    saveDarkMode(darkMode);
  }, [darkMode]);

  const allSentences = useMemo(() => parseScript(scriptText, splitMode), [scriptText, splitMode]);

  // 苦手フィルタ (手動 → 自動苦手 → 全体)
  const sentences = useMemo(() => {
    if (weakOnly) return allSentences.filter((_, i) => weakItems.includes(i));
    if (autoWeakOnly) {
      return allSentences.filter((_, i) => {
        const s = autoWeakStats[String(i)];
        return s ? isAutoWeak(s) : false;
      });
    }
    return allSentences;
  }, [allSentences, weakOnly, autoWeakOnly, weakItems, autoWeakStats]);

  // 自動苦手の文数（ボタンの enabled 判定用）
  const autoWeakCount = useMemo(() => {
    return allSentences.filter((_, i) => {
      const s = autoWeakStats[String(i)];
      return s ? isAutoWeak(s) : false;
    }).length;
  }, [allSentences, autoWeakStats]);

  useEffect(() => {
    if (currentIndex >= sentences.length) {
      setCurrentIndex(Math.max(0, sentences.length - 1));
    }
  }, [sentences.length, currentIndex]);

  // localStorage 保存
  useEffect(() => { saveCurrentIndex(currentIndex); }, [currentIndex]);
  useEffect(() => { saveCheckedItems(checkedItems); }, [checkedItems]);
  useEffect(() => { saveWeakItems(weakItems); }, [weakItems]);
  useEffect(() => { saveSpeechRate(speechRate); }, [speechRate]);
  useEffect(() => { saveHintLength(hintLength); }, [hintLength]);
  useEffect(() => { saveAutoInterval(autoInterval); }, [autoInterval]);
  useEffect(() => { saveAutoWeakStats(autoWeakStats); }, [autoWeakStats]);

  // --- キーボードショートカット ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // IME変換中は無視（日本語入力中の誤発火防止）
      if (e.isComposing) return;
      // テキスト入力中は無視
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // プロンプター中
      if (isPrompter) {
        if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentIndex((p) => Math.min(p + 1, allSentences.length - 1)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentIndex((p) => Math.max(p - 1, 0)); }
        if (e.key === ' ') { e.preventDefault(); prompterSpeakRef.current?.(); }
        if (e.key === 'Escape') setIsPrompter(false);
        return;
      }
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); practiceRef.current?.goNext(); break;
        case 'ArrowLeft':  e.preventDefault(); practiceRef.current?.goPrev(); break;
        case ' ':          e.preventDefault(); practiceRef.current?.speakOrStop(); break;
        case 'Enter':      e.preventDefault(); practiceRef.current?.toggleReveal(); break;
        case 'h': case 'H':
          cancelSpeech();
          setPracticeMode((prev) => prev === 'hint' ? 'normal' : 'hint');
          break;
        case 'r': case 'R':
          recordingRef.current?.toggleRecording();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPrompter, allSentences.length]);

  // --- コールバック ---
  const handleApplyScript = (text: string) => {
    cancelSpeech();
    setScriptText(text); saveScript(text);
    setCurrentIndex(0); setCheckedItems([]); setWeakItems([]);
    setWeakOnly(false); setAutoWeakOnly(false);
    setAutoWeakStats({});
  };

  const handleChangeSplitMode = (mode: SplitMode) => {
    cancelSpeech();
    setSplitMode(mode); saveSplitMode(mode);
    setCurrentIndex(0); setCheckedItems([]); setWeakItems([]);
    setWeakOnly(false); setAutoWeakOnly(false);
    setAutoWeakStats({});
  };

  const handleChangePracticeMode = (mode: PracticeMode) => {
    cancelSpeech();
    setPracticeMode(mode); savePracticeMode(mode);
  };

  const handleChangeSpeechRate = (rate: number) => { setSpeechRate(rate); };

  const handleChangeIndex = useCallback((index: number) => {
    if (index === -1) {
      setCurrentIndex((prev) => Math.min(prev + 1, sentences.length - 1));
    } else {
      setCurrentIndex(Math.max(0, Math.min(index, sentences.length - 1)));
    }
  }, [sentences.length]);

  const handleToggleChecked = (index: number) => {
    setCheckedItems((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleToggleWeak = (index: number) => {
    const realIndex = weakOnly ? allSentences.indexOf(sentences[index]) : index;
    setWeakItems((prev) =>
      prev.includes(realIndex) ? prev.filter((i) => i !== realIndex) : [...prev, realIndex]
    );
  };

  const handleToggleWeakOnly = () => {
    cancelSpeech(); setAutoWeakOnly(false);
    setWeakOnly((prev) => !prev); setCurrentIndex(0);
  };

  const handleToggleAutoWeakOnly = () => {
    cancelSpeech(); setWeakOnly(false);
    setAutoWeakOnly((prev) => !prev); setCurrentIndex(0);
  };

  // --- 苦手自動判定コールバック ---
  const handleReplay = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'replays'));
  }, []);
  const handleFastReveal = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'fastReveals'));
  }, []);
  const handleReRecord = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'reRecords'));
  }, []);

  // --- プロンプターモード ---
  if (isPrompter && sentences.length > 0) {
    return (
      <PrompterView
        sentences={sentences}
        currentIndex={currentIndex}
        onChangeIndex={handleChangeIndex}
        voice={voice}
        speechRate={speechRate}
        onClose={() => setIsPrompter(false)}
        onSpeakRef={prompterSpeakRef}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">プレゼン暗記練習</h1>
        <div className="header-actions">
          <button className="btn btn-secondary btn-small" onClick={() => setIsPrompter(true)} disabled={sentences.length === 0}>
            プロンプター
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setShowProgress(!showProgress)}>
            {showProgress ? '練習に戻る' : '進捗一覧'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀ ライト' : '🌙 ダーク'}
          </button>
        </div>
      </header>

      <ScriptInput initialText={scriptText} onApply={handleApplyScript} />

      {sentences.length === 0 ? (
        <div className="empty-state">
          <p>台本を入力して「反映する」を押してください。</p>
        </div>
      ) : showProgress ? (
        <ProgressPanel
          sentences={allSentences}
          currentIndex={currentIndex}
          onChangeIndex={(i) => { setCurrentIndex(i); setShowProgress(false); }}
          checkedItems={checkedItems}
          weakItems={weakItems}
          autoWeakStats={autoWeakStats}
        />
      ) : (
        <>
          <Controls
            practiceMode={practiceMode}
            onChangePracticeMode={handleChangePracticeMode}
            splitMode={splitMode}
            onChangeSplitMode={handleChangeSplitMode}
            speechRate={speechRate}
            onChangeSpeechRate={handleChangeSpeechRate}
            hintLength={hintLength}
            onChangeHintLength={(l) => setHintLength(l)}
            autoInterval={autoInterval}
            onChangeAutoInterval={(s) => setAutoInterval(s)}
            weakOnly={weakOnly}
            onToggleWeakOnly={handleToggleWeakOnly}
            hasWeakItems={weakItems.length > 0}
            autoWeakOnly={autoWeakOnly}
            onToggleAutoWeakOnly={handleToggleAutoWeakOnly}
            hasAutoWeakItems={autoWeakCount > 0}
          />

          <PracticePanel
            ref={practiceRef}
            sentences={sentences}
            currentIndex={currentIndex}
            onChangeIndex={handleChangeIndex}
            practiceMode={practiceMode}
            voice={voice}
            speechRate={speechRate}
            hintLength={hintLength}
            autoInterval={autoInterval}
            checkedItems={checkedItems}
            onToggleChecked={handleToggleChecked}
            weakItems={weakItems}
            onToggleWeak={handleToggleWeak}
            onReplay={handleReplay}
            onFastReveal={handleFastReveal}
          />

          <RecordingPanel
            ref={recordingRef}
            currentIndex={currentIndex}
            totalCount={sentences.length}
            onReRecord={handleReRecord}
          />

          {/* キーボードショートカット一覧 */}
          <div className="keyboard-hints">
            <span>←→ 移動</span>
            <span>Space 再生/停止</span>
            <span>Enter 表示切替</span>
            <span>H ヒントモード</span>
            <span>R 録音</span>
          </div>
        </>
      )}

      <footer className="app-footer">
        <p>プレゼン暗記練習アプリ — データはすべてブラウザ内に保存されます（外部送信なし）</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
