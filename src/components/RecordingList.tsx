import React, { useState, useEffect, useRef, useCallback } from 'react';
import { hasIndexedDB, loadRecording, deleteRecording, listRecordingKeys } from '../utils/recordingDb';

interface Props {
  scriptId: string;
  allSentences: string[];
  onNavigate: (index: number) => void;
  onClose: () => void;
}

interface RecEntry {
  index: number;
  preview: string;
  hasRec: boolean;
  duration: number | null; // 秒。取得できない場合 null
}

/**
 * 録音一覧パネル
 * 文ごとの録音の有無・再生・削除・録音時間を表示
 */
export default function RecordingList({ scriptId, allSentences, onNavigate, onClose }: Props) {
  const [entries, setEntries] = useState<RecEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const unmountedRef = useRef(false);

  const dbAvailable = hasIndexedDB();

  // 録音一覧を読み込み
  const loadEntries = useCallback(async () => {
    if (!dbAvailable) { setLoading(false); return; }
    setLoading(true);
    try {
      const indices = await listRecordingKeys(scriptId);
      const indexSet = new Set(indices);
      const result: RecEntry[] = allSentences.map((text, i) => ({
        index: i,
        preview: text.slice(0, 30),
        hasRec: indexSet.has(i),
        duration: null,
      }));

      // 録音があるものだけ時間を取得
      for (const entry of result) {
        if (!entry.hasRec) continue;
        try {
          const blob = await loadRecording(scriptId, entry.index);
          if (blob && !unmountedRef.current) {
            entry.duration = await getBlobDuration(blob);
          }
        } catch { /* skip */ }
      }

      if (!unmountedRef.current) setEntries(result);
    } catch { /* ignore */ }
    if (!unmountedRef.current) setLoading(false);
  }, [dbAvailable, scriptId, allSentences]);

  useEffect(() => {
    unmountedRef.current = false;
    loadEntries();
    return () => { unmountedRef.current = true; cleanupAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadEntries]);

  const cleanupAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setPlayingIndex(null);
  };

  const handlePlay = async (index: number) => {
    if (playingIndex === index) { cleanupAudio(); return; }
    cleanupAudio();
    try {
      const blob = await loadRecording(scriptId, index);
      if (!blob || unmountedRef.current) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { if (!unmountedRef.current) cleanupAudio(); };
      audio.onerror = () => { if (!unmountedRef.current) cleanupAudio(); };
      await audio.play();
      if (!unmountedRef.current) setPlayingIndex(index);
    } catch { cleanupAudio(); }
  };

  const handleDelete = async (index: number) => {
    if (playingIndex === index) cleanupAudio();
    try {
      await deleteRecording(scriptId, index);
      await loadEntries();
    } catch { /* ignore */ }
  };

  if (!dbAvailable) {
    return (
      <div className="recording-list-panel">
        <div className="script-manager-header">
          <h3>録音一覧</h3>
          <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
        </div>
        <p className="text-muted">このブラウザでは録音保存に未対応です</p>
      </div>
    );
  }

  const recCount = entries.filter((e) => e.hasRec).length;

  return (
    <div className="recording-list-panel">
      <div className="script-manager-header">
        <h3>録音一覧</h3>
        <span className="text-muted">{recCount} / {allSentences.length} 文 録音済み</span>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      {loading ? (
        <p className="text-muted" style={{ padding: 12 }}>読み込み中...</p>
      ) : (
        <div className="recording-list-body">
          {entries.map((e) => (
            <div key={e.index} className={`recording-list-item ${e.hasRec ? 'has-rec' : ''}`}>
              <span className="sentence-number">{e.index + 1}.</span>
              <span className="recording-list-preview">{e.preview}...</span>
              {e.hasRec ? (
                <div className="recording-list-actions">
                  <span className="recording-list-duration">
                    {e.duration !== null ? `${e.duration.toFixed(1)}秒` : '--秒'}
                  </span>
                  <button className={`btn btn-small ${playingIndex === e.index ? 'btn-warning' : 'btn-primary'}`}
                    onClick={() => handlePlay(e.index)}>
                    {playingIndex === e.index ? '⏹' : '▶'}
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => handleDelete(e.index)}>削除</button>
                  <button className="btn btn-secondary btn-small" onClick={() => { cleanupAudio(); onNavigate(e.index); }}>移動</button>
                </div>
              ) : (
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>未録音</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Blob から音声の長さを取得する。取得できない場合は null */
async function getBlobDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      const cleanup = () => { URL.revokeObjectURL(url); };
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        cleanup();
        resolve(Number.isFinite(d) ? d : null);
      };
      audio.onerror = () => { cleanup(); resolve(null); };
      // Chromeでは duration が Infinity になることがある。その場合のフォールバック
      setTimeout(() => { cleanup(); resolve(null); }, 3000);
      audio.src = url;
    } catch { resolve(null); }
  });
}
