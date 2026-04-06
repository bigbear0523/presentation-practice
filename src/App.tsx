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
import type { PrompterTimer } from './components/PrompterView';
import ScriptManager from './components/ScriptManager';
import TimerMode from './components/TimerMode';
import Dashboard from './components/Dashboard';
import RecordingList from './components/RecordingList';
import { parseScript, parseChapters, SAMPLE_SCRIPT } from './utils/scriptParser';
import { getJapaneseVoice, cancelSpeech } from './utils/speech';
import { incrementDaily } from './utils/dailyLog';
import { downloadBackup, restoreBackup } from './utils/backup';
import { listRecordingKeys } from './utils/recordingDb';
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
  type RangeMode,
  saveRangeMode, loadRangeMode,
  saveRangeStart, loadRangeStart,
  saveRangeEnd, loadRangeEnd,
  saveDashboardStats, loadDashboardStats, type DashboardStats,
  appendTimerResult, loadTimerResults, type TimerResult,
  loadActiveScriptId, loadScripts,
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

function bumpStat(stats: SentenceStatsMap, index: number, field: keyof SentenceStats): SentenceStatsMap {
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
  const [rangeMode, setRangeMode] = useState<RangeMode>(() => loadRangeMode());
  const [rangeStart, setRangeStart] = useState(() => loadRangeStart());
  const [rangeEnd, setRangeEnd] = useState(() => loadRangeEnd());
  const [rangeAnchor, setRangeAnchor] = useState(() => loadCurrentIndex());
  // 新機能 state
  const [showScriptManager, setShowScriptManager] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRecordingList, setShowRecordingList] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(() => loadDashboardStats());
  const [recordingCount, setRecordingCount] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState(-1); // -1 = 全体
  // プロンプター用本番タイマー
  const [pTimerRunning, setPTimerRunning] = useState(false);
  const [pTimerElapsed, setPTimerElapsed] = useState(0);
  const [pTimerFinished, setPTimerFinished] = useState(false);
  const [pTimerLimitMin, setPTimerLimitMin] = useState(5);
  const pTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerResults, setTimerResults] = useState<TimerResult[]>(() => loadTimerResults());
  const [activeScriptId, setActiveScriptId] = useState(() => loadActiveScriptId() || 'default');
  const [prompterRecordedIndices, setPrompterRecordedIndices] = useState<number[]>([]);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const practiceRef = useRef<PracticePanelHandle>(null);
  const recordingRef = useRef<RecordingPanelHandle>(null);
  const prompterSpeakRef = useRef<(() => void) | null>(null);

  useEffect(() => { getJapaneseVoice().then((v) => setVoice(v)); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    saveDarkMode(darkMode);
  }, [darkMode]);

  // プロンプター表示時に録音済みインデックスを取得
  useEffect(() => {
    if (isPrompter) {
      listRecordingKeys(activeScriptId).then(setPrompterRecordedIndices).catch(() => {});
    }
  }, [isPrompter, activeScriptId]);

  const allSentences = useMemo(() => parseScript(scriptText, splitMode), [scriptText, splitMode]);

  // 章の検出
  const chapters = useMemo(() => {
    if (splitMode !== 'sentence') return [];
    return parseChapters(scriptText, allSentences);
  }, [scriptText, allSentences, splitMode]);

  // 章フィルタ → 範囲フィルタ → 苦手フィルタ
  const chapterSentences = useMemo(() => {
    if (selectedChapter < 0 || selectedChapter >= chapters.length) return allSentences;
    const ch = chapters[selectedChapter];
    return allSentences.slice(ch.startIndex, ch.endIndex + 1);
  }, [allSentences, chapters, selectedChapter]);

  const rangeSentences = useMemo(() => {
    if (rangeMode === 'all') return chapterSentences;
    const total = chapterSentences.length;
    if (total === 0) return chapterSentences;
    let start = 0;
    let end = total - 1;
    if (rangeMode === 'from-current') {
      start = Math.min(rangeAnchor, total - 1);
    } else if (rangeMode === 'around') {
      start = Math.max(0, rangeAnchor - 3);
      end = Math.min(total - 1, rangeAnchor + 3);
    } else if (rangeMode === 'custom') {
      start = Math.max(0, Math.min(rangeStart, total - 1));
      end = Math.max(start, Math.min(rangeEnd, total - 1));
    }
    return chapterSentences.slice(start, end + 1);
  }, [chapterSentences, rangeMode, rangeStart, rangeEnd, rangeAnchor]);

  const sentences = useMemo(() => {
    if (weakOnly) {
      const offset = allSentences.indexOf(rangeSentences[0]);
      return rangeSentences.filter((_, i) => weakItems.includes(offset + i));
    }
    if (autoWeakOnly) {
      const offset = allSentences.indexOf(rangeSentences[0]);
      return rangeSentences.filter((_, i) => {
        const s = autoWeakStats[String(offset + i)];
        return s ? isAutoWeak(s) : false;
      });
    }
    return rangeSentences;
  }, [rangeSentences, allSentences, weakOnly, autoWeakOnly, weakItems, autoWeakStats]);

  const autoWeakCount = useMemo(() => {
    return allSentences.filter((_, i) => {
      const s = autoWeakStats[String(i)];
      return s ? isAutoWeak(s) : false;
    }).length;
  }, [allSentences, autoWeakStats]);

  useEffect(() => {
    if (currentIndex >= sentences.length) setCurrentIndex(Math.max(0, sentences.length - 1));
  }, [sentences.length, currentIndex]);

  // localStorage 保存
  useEffect(() => { saveCurrentIndex(currentIndex); }, [currentIndex]);
  useEffect(() => { saveCheckedItems(checkedItems); }, [checkedItems]);
  useEffect(() => { saveWeakItems(weakItems); }, [weakItems]);
  useEffect(() => { saveSpeechRate(speechRate); }, [speechRate]);
  useEffect(() => { saveHintLength(hintLength); }, [hintLength]);
  useEffect(() => { saveAutoInterval(autoInterval); }, [autoInterval]);
  useEffect(() => { saveAutoWeakStats(autoWeakStats); }, [autoWeakStats]);
  useEffect(() => { saveRangeMode(rangeMode); }, [rangeMode]);
  useEffect(() => { saveRangeStart(rangeStart); }, [rangeStart]);
  useEffect(() => { saveRangeEnd(rangeEnd); }, [rangeEnd]);
  useEffect(() => { saveDashboardStats(dashboardStats); }, [dashboardStats]);

  // プロンプター用本番タイマー
  const pTimerLimitSec = pTimerLimitMin * 60;
  useEffect(() => {
    if (!pTimerRunning) {
      if (pTimerRef.current) { clearInterval(pTimerRef.current); pTimerRef.current = null; }
      return;
    }
    pTimerRef.current = setInterval(() => {
      setPTimerElapsed((prev) => {
        const next = prev + 1;
        if (next >= pTimerLimitSec) { setPTimerRunning(false); setPTimerFinished(true); }
        return next;
      });
    }, 1000);
    // cleanup: effect 再実行時 + アンマウント時の両方で確実にクリア
    return () => { if (pTimerRef.current) { clearInterval(pTimerRef.current); pTimerRef.current = null; } };
  }, [pTimerRunning, pTimerLimitSec]);

  // 台本名と章名を取得（結果保存用）
  const currentScriptTitle = useMemo(() => {
    const first30 = scriptText.replace(/^#.*\n?/gm, '').trim().slice(0, 30);
    return first30 || '無題';
  }, [scriptText]);
  const currentChapterName = selectedChapter >= 0 && selectedChapter < chapters.length
    ? chapters[selectedChapter].title : '全体';

  /** タイマー結果を保存する共通関数（録音情報も非同期で取得して付与） */
  const saveTimerResult = useCallback((info: {
    elapsed: number; limitSec: number; completed: boolean; reachedIndex: number;
  }) => {
    const scripts = loadScripts();
    const activeScript = scripts.find((s) => s.id === activeScriptId);
    const result: TimerResult = {
      date: Date.now(),
      limitSec: info.limitSec,
      elapsed: info.elapsed,
      completed: info.completed,
      reachedIndex: info.reachedIndex,
      totalSentences: sentences.length,
      reachRate: sentences.length > 0 ? (info.reachedIndex + 1) / sentences.length : 0,
      scriptTitle: currentScriptTitle,
      chapterName: currentChapterName,
      scriptId: activeScriptId,
      scriptVersionAt: activeScript?.updatedAt,
    };
    // まず結果を保存（録音情報なし）
    const saved = appendTimerResult(result);
    setTimerResults(saved);
    incrementDaily('timerCount');
    // 非同期で録音情報を追加（失敗しても結果は保存済み）
    listRecordingKeys(activeScriptId).then((indices) => {
      if (indices.length === 0) return;
      // 直近保存した結果に録音情報を付与して上書き
      const updated = [...saved];
      if (updated[0] && updated[0].date === result.date) {
        updated[0] = { ...updated[0], recordedIndices: indices };
        setTimerResults(updated);
        try { localStorage.setItem('pres-practice-timer-results', JSON.stringify(updated.slice(0, 50))); } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ });
  }, [sentences.length, currentScriptTitle, currentChapterName, activeScriptId]);

  // プロンプタータイマー終了時に結果保存
  const pTimerFinishedRef = useRef(false);
  useEffect(() => {
    if (pTimerFinished && !pTimerFinishedRef.current) {
      pTimerFinishedRef.current = true;
      saveTimerResult({
        elapsed: pTimerElapsed,
        limitSec: pTimerLimitSec,
        completed: pTimerElapsed >= pTimerLimitSec,
        reachedIndex: currentIndex,
      });
    }
    if (!pTimerFinished) pTimerFinishedRef.current = false;
  }, [pTimerFinished, pTimerElapsed, pTimerLimitSec, currentIndex, saveTimerResult]);

  const prompterTimer: PrompterTimer = {
    isRunning: pTimerRunning,
    elapsed: pTimerElapsed,
    limitSec: pTimerLimitSec,
    finished: pTimerFinished,
    limitMinutes: pTimerLimitMin,
    onChangeLimitMinutes: setPTimerLimitMin,
    onStart: () => { setPTimerElapsed(0); setPTimerFinished(false); setPTimerRunning(true); },
    onStop: () => { setPTimerRunning(false); setPTimerFinished(true); },
  };

  // キーボード
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
  const resetAll = () => {
    setCurrentIndex(0); setCheckedItems([]); setWeakItems([]);
    setWeakOnly(false); setAutoWeakOnly(false); setAutoWeakStats({});
    setRangeMode('all'); setRangeStart(0); setRangeEnd(0); setRangeAnchor(0);
    setSelectedChapter(-1);
  };

  const handleApplyScript = (text: string) => {
    cancelSpeech();
    setScriptText(text); saveScript(text);
    resetAll();
    // ダッシュボード: 練習カウント
    setDashboardStats((prev) => ({ ...prev, totalPracticeCount: prev.totalPracticeCount + 1 }));
    incrementDaily('practiceCount');
  };

  const handleChangeSplitMode = (mode: SplitMode) => {
    cancelSpeech();
    setSplitMode(mode); saveSplitMode(mode);
    resetAll();
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
    setCheckedItems((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]);
  };

  const handleToggleWeak = (index: number) => {
    const realIndex = weakOnly ? allSentences.indexOf(sentences[index]) : index;
    setWeakItems((prev) => prev.includes(realIndex) ? prev.filter((i) => i !== realIndex) : [...prev, realIndex]);
  };

  const handleToggleWeakOnly = () => {
    cancelSpeech(); setAutoWeakOnly(false);
    setWeakOnly((prev) => !prev); setCurrentIndex(0);
  };

  const handleToggleAutoWeakOnly = () => {
    cancelSpeech(); setWeakOnly(false);
    setAutoWeakOnly((prev) => !prev); setCurrentIndex(0);
  };

  const handleReplay = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'replays'));
    setDashboardStats((prev) => ({ ...prev, totalSpeakCount: prev.totalSpeakCount + 1 }));
    incrementDaily('speakCount');
  }, []);
  const handleFastReveal = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'fastReveals'));
  }, []);
  const handleReRecord = useCallback((index: number) => {
    setAutoWeakStats((prev) => bumpStat(prev, index, 'reRecords'));
    setDashboardStats((prev) => ({ ...prev, totalRecordCount: prev.totalRecordCount + 1 }));
    incrementDaily('recordCount');
  }, []);

  // 台本管理から読み込み
  const handleLoadFromManager = (text: string) => {
    handleApplyScript(text);
    setShowScriptManager(false);
    setActiveScriptId(loadActiveScriptId() || 'default');
  };

  // 章の苦手だけ練習（ダッシュボードから遷移）
  const handlePracticeChapterWeak = useCallback((chapterIndex: number, mode: 'manual' | 'auto') => {
    cancelSpeech();
    setSelectedChapter(chapterIndex);
    setRangeMode('all');
    if (mode === 'manual') { setWeakOnly(true); setAutoWeakOnly(false); }
    else { setWeakOnly(false); setAutoWeakOnly(true); }
    setCurrentIndex(0);
    setShowDashboard(false);
  }, []);

  // プロンプター
  if (isPrompter && sentences.length > 0) {
    // 章内進捗の計算
    const pChapterTotal = selectedChapter >= 0 && selectedChapter < chapters.length
      ? chapters[selectedChapter].endIndex - chapters[selectedChapter].startIndex + 1
      : undefined;
    const pChapterCurrent = selectedChapter >= 0 && selectedChapter < chapters.length
      ? currentIndex
      : undefined;
    // 現在文のallSentences上のインデックス
    const pGlobalIndex = allSentences.indexOf(sentences[currentIndex] ?? '');
    return (
      <PrompterView
        sentences={sentences}
        currentIndex={currentIndex}
        onChangeIndex={handleChangeIndex}
        voice={voice}
        speechRate={speechRate}
        onClose={() => { setIsPrompter(false); setPTimerRunning(false); }}
        onSpeakRef={prompterSpeakRef}
        timer={prompterTimer}
        chapterName={currentChapterName}
        chapterTotal={pChapterTotal}
        chapterCurrent={pChapterCurrent}
        allSentencesCount={allSentences.length}
        weakItems={weakItems}
        recordedIndices={prompterRecordedIndices}
        currentGlobalIndex={pGlobalIndex >= 0 ? pGlobalIndex : undefined}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">プレゼン暗記練習</h1>
        <div className="header-actions">
          <button className="btn btn-secondary btn-small" onClick={() => setShowScriptManager(!showScriptManager)}>
            {showScriptManager ? '閉じる' : '台本管理'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setShowDashboard(!showDashboard)}>
            {showDashboard ? '閉じる' : 'ダッシュボード'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setIsPrompter(true)} disabled={sentences.length === 0}>
            プロンプター
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setShowRecordingList(!showRecordingList)}>
            {showRecordingList ? '閉じる' : '録音一覧'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setShowProgress(!showProgress)}>
            {showProgress ? '練習に戻る' : '進捗一覧'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀' : '🌙'}
          </button>
        </div>
      </header>

      {/* 台本管理パネル */}
      {showScriptManager && (
        <ScriptManager
          currentText={scriptText}
          onLoad={handleLoadFromManager}
          onClose={() => setShowScriptManager(false)}
          timerResults={timerResults}
        />
      )}

      {/* ダッシュボード */}
      {showDashboard && (
        <Dashboard
          totalSentences={allSentences.length}
          chapters={chapters}
          checkedItems={checkedItems}
          weakItems={weakItems}
          autoWeakStats={autoWeakStats}
          dashboardStats={dashboardStats}
          recordingCount={recordingCount}
          timerResults={timerResults}
          allSentences={allSentences}
          onClose={() => setShowDashboard(false)}
          onPracticeChapterWeak={handlePracticeChapterWeak}
          onNavigate={(i) => { setCurrentIndex(i); setShowDashboard(false); }}
        />
      )}

      {/* 録音一覧パネル */}
      {showRecordingList && (
        <RecordingList
          scriptId={activeScriptId}
          allSentences={allSentences}
          onNavigate={(i) => { setCurrentIndex(i); setShowRecordingList(false); }}
          onClose={() => setShowRecordingList(false)}
        />
      )}

      <ScriptInput initialText={scriptText} onApply={handleApplyScript} />

      {/* 章選択（2章以上ある場合のみ表示） */}
      {chapters.length > 1 && (
        <div className="chapter-selector">
          <label className="control-label">章</label>
          <div className="btn-group">
            <button
              className={`btn btn-mode btn-small ${selectedChapter === -1 ? 'active' : ''}`}
              onClick={() => { setSelectedChapter(-1); setCurrentIndex(0); }}
            >
              全体
            </button>
            {chapters.map((ch, ci) => (
              <button
                key={ci}
                className={`btn btn-mode btn-small ${selectedChapter === ci ? 'active' : ''}`}
                onClick={() => { setSelectedChapter(ci); setCurrentIndex(0); }}
              >
                {ch.title}
              </button>
            ))}
          </div>
        </div>
      )}

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
            rangeMode={rangeMode}
            onChangeRangeMode={(m) => { setRangeAnchor(currentIndex); setRangeMode(m); setCurrentIndex(0); }}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onChangeRangeStart={setRangeStart}
            onChangeRangeEnd={setRangeEnd}
            totalSentenceCount={chapterSentences.length}
            activeSentenceCount={sentences.length}
          />

          {/* 本番モード */}
          <div style={{ marginBottom: 8 }}>
            <button className="btn btn-secondary btn-small" onClick={() => setShowTimer(!showTimer)}>
              {showTimer ? '本番モードを閉じる' : '本番モード'}
            </button>
          </div>
          {showTimer && (
            <TimerMode
              totalSentences={sentences.length}
              currentIndex={currentIndex}
              onClose={() => setShowTimer(false)}
              onFinish={saveTimerResult}
            />
          )}

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
            onRecordingCountChange={setRecordingCount}
            scriptId={activeScriptId}
          />

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
        <div className="backup-controls">
          <button className="btn btn-secondary btn-small" onClick={async () => {
            setBackupStatus('エクスポート中...');
            try { await downloadBackup(); setBackupStatus('バックアップをダウンロードしました'); }
            catch { setBackupStatus('エクスポートに失敗しました'); }
          }}>
            一括バックアップ
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => backupFileRef.current?.click()}>
            復元
          </button>
          <input ref={backupFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!confirm('現在のデータにバックアップの内容を上書き復元します。よろしいですか？')) { e.target.value = ''; return; }
            setBackupStatus('復元中...');
            try {
              const msg = await restoreBackup(file);
              setBackupStatus(msg + '（リロードすると反映されます）');
            } catch { setBackupStatus('復元に失敗しました'); }
            e.target.value = '';
          }} />
          {backupStatus && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{backupStatus}</span>}
        </div>
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
