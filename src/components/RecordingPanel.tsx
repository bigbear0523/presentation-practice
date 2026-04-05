import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { cancelSpeech } from '../utils/speech';
import {
  hasIndexedDB, saveRecording, loadRecording,
  deleteRecording as deleteRecordingDb, listRecordingKeys,
  exportRecordings, importRecordings, type RecordingExportEntry,
} from '../utils/recordingDb';

interface Props {
  currentIndex: number;
  totalCount: number;
  onReRecord?: (index: number) => void;
  onRecordingCountChange?: (count: number) => void;
  /** IndexedDB 用の台本ID（指定されていれば永続化する） */
  scriptId?: string;
}

type RecState = 'idle' | 'recording' | 'playing';

export interface RecordingPanelHandle {
  toggleRecording: () => void;
}

const RecordingPanel = forwardRef<RecordingPanelHandle, Props>(function RecordingPanel(
  { currentIndex, totalCount, onReRecord, onRecordingCountChange, scriptId },
  ref,
) {
  const [recState, setRecState] = useState<RecState>('idle');
  const [recordings, setRecordings] = useState<Map<number, Blob>>(() => new Map());
  const [micError, setMicError] = useState<string | null>(null);
  const [dbAvailable] = useState(() => hasIndexedDB());

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const unmountedRef = useRef(false);

  const hasRecording = recordings.has(currentIndex);

  useEffect(() => { onRecordingCountChange?.(recordings.size); }, [recordings.size, onRecordingCountChange]);
  const recordingCount = recordings.size;

  // IndexedDB から録音一覧を読み込む
  useEffect(() => {
    if (!dbAvailable || !scriptId) return;
    let cancelled = false;
    listRecordingKeys(scriptId).then(async (indices) => {
      if (cancelled) return;
      const map = new Map<number, Blob>();
      for (const idx of indices) {
        const blob = await loadRecording(scriptId, idx);
        if (blob && !cancelled) map.set(idx, blob);
      }
      if (!cancelled) setRecordings(map);
    });
    return () => { cancelled = true; };
  }, [dbAvailable, scriptId]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopRecordingInternal();
      stopPlaybackInternal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stopRecordingInternal();
    stopPlaybackInternal();
    if (!unmountedRef.current) setRecState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  function stopRecordingInternal() {
    if (recorderRef.current && recorderRef.current.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
  }

  function stopPlaybackInternal() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current = null; }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
  }

  const startRecording = async () => {
    setMicError(null);
    cancelSpeech();
    stopPlaybackInternal();

    if (recordings.has(currentIndex)) onReRecord?.(currentIndex);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      const targetIndex = currentIndex;
      const sid = scriptId;
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (unmountedRef.current) return;
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setRecordings((prev) => { const next = new Map(prev); next.set(targetIndex, blob); return next; });
          // IndexedDB に永続化
          if (dbAvailable && sid) saveRecording(sid, targetIndex, blob);
        }
        setRecState('idle');
      };

      recorder.start();
      setRecState('recording');
    } catch (err) {
      console.warn('マイクアクセス失敗:', err);
      setMicError('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
      setRecState('idle');
    }
  };

  const stopRecording = () => { stopRecordingInternal(); };

  const playRecording = () => {
    const blob = recordings.get(currentIndex);
    if (!blob) return;
    cancelSpeech();
    stopPlaybackInternal();
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { if (!unmountedRef.current) { stopPlaybackInternal(); setRecState('idle'); } };
    audio.onerror = () => { if (!unmountedRef.current) { stopPlaybackInternal(); setRecState('idle'); } };
    audio.play().catch(() => { if (!unmountedRef.current) { stopPlaybackInternal(); setRecState('idle'); } });
    setRecState('playing');
  };

  const stopPlayback = () => { stopPlaybackInternal(); setRecState('idle'); };

  const handleDeleteRecording = () => {
    stopPlaybackInternal();
    setRecordings((prev) => { const next = new Map(prev); next.delete(currentIndex); return next; });
    if (dbAvailable && scriptId) deleteRecordingDb(scriptId, currentIndex);
  };

  useImperativeHandle(ref, () => ({
    toggleRecording() {
      if (recState === 'recording') stopRecording();
      else if (recState === 'idle') startRecording();
    },
  }));

  // --- エクスポート / インポート ---
  const [ioStatus, setIoStatus] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!dbAvailable || !scriptId) return;
    setIoStatus('エクスポート中...');
    try {
      const entries = await exportRecordings(scriptId);
      if (entries.length === 0) { setIoStatus('エクスポートする録音がありません'); return; }
      const json = JSON.stringify(entries, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recordings_${scriptId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIoStatus(`${entries.length}件の録音をエクスポートしました`);
    } catch { setIoStatus('エクスポートに失敗しました'); }
  };

  const handleImportClick = () => { importFileRef.current?.click(); };
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIoStatus('インポート中...');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) { setIoStatus('不正なファイル形式です'); return; }
      const entries = parsed as RecordingExportEntry[];
      const count = await importRecordings(entries);
      if (count === 0) { setIoStatus('有効な録音データが見つかりませんでした'); return; }
      // メモリ内のMapも更新
      if (scriptId) {
        const indices = await listRecordingKeys(scriptId);
        const map = new Map<number, Blob>();
        for (const idx of indices) {
          const blob = await loadRecording(scriptId, idx);
          if (blob) map.set(idx, blob);
        }
        setRecordings(map);
      }
      setIoStatus(`${count}件の録音をインポートしました`);
    } catch { setIoStatus('インポートに失敗しました。ファイル形式を確認してください。'); }
    e.target.value = '';
  };

  const isSupported = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof MediaRecorder !== 'undefined';

  if (!isSupported) {
    return (
      <div className="recording-panel">
        <span className="text-muted">※ このブラウザは録音機能に対応していません</span>
      </div>
    );
  }

  return (
    <div className="recording-panel">
      <div className="recording-header">
        <span className="control-label">録音練習</span>
        {recordingCount > 0 && <span className="text-muted">{recordingCount} / {totalCount} 文 録音済み</span>}
        {dbAvailable && scriptId && <span className="text-muted" style={{ fontSize: '0.7rem' }}>自動保存</span>}
      </div>

      <div className="recording-controls">
        {recState === 'idle' && (
          <>
            <button className="btn btn-danger btn-small" onClick={startRecording}>⏺ 録音</button>
            {hasRecording && (
              <>
                <button className="btn btn-primary btn-small" onClick={playRecording}>▶ 再生</button>
                <button className="btn btn-secondary btn-small" onClick={handleDeleteRecording}>削除</button>
              </>
            )}
          </>
        )}
        {recState === 'recording' && (
          <button className="btn btn-danger btn-small recording-active" onClick={stopRecording}>⏹ 録音停止</button>
        )}
        {recState === 'playing' && (
          <button className="btn btn-warning btn-small" onClick={stopPlayback}>⏹ 再生停止</button>
        )}
      </div>

      <div className="recording-status">
        {recState === 'recording' && <span className="status-badge status-recording">録音中</span>}
        {recState === 'playing' && <span className="status-badge status-playing">再生中</span>}
        {recState === 'idle' && hasRecording && <span className="recording-exists">この文の録音があります</span>}
        {recState === 'idle' && !hasRecording && <span className="text-muted" style={{ fontSize: '0.8rem' }}>未録音</span>}
      </div>

      {/* エクスポート / インポート */}
      {dbAvailable && scriptId && (
        <div className="recording-io">
          <button className="btn btn-secondary btn-small" onClick={handleExport} disabled={recordingCount === 0}>
            録音エクスポート
          </button>
          <button className="btn btn-secondary btn-small" onClick={handleImportClick}>
            録音インポート
          </button>
          <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      )}
      {ioStatus && <div className="text-muted" style={{ fontSize: '0.8rem' }}>{ioStatus}</div>}
      {micError && <div className="recording-error">{micError}</div>}
    </div>
  );
});

export default RecordingPanel;
