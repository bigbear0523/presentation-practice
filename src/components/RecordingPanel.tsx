import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { cancelSpeech } from '../utils/speech';

interface Props {
  currentIndex: number;
  totalCount: number;
  /** 苦手自動判定: 録り直し時に呼ばれる */
  onReRecord?: (index: number) => void;
}

type RecState = 'idle' | 'recording' | 'playing';

/** キーボード操作用にApp側から呼び出せるハンドル */
export interface RecordingPanelHandle {
  toggleRecording: () => void;
}

/**
 * 録音練習パネル
 * - MediaRecorder API でマイク録音
 * - 文ごとに録音を保持（メモリ内、ページリロードで消える）
 * - 既存の読み上げ機能と競合しないよう、録音・再生開始時に TTS を停止
 */
const RecordingPanel = forwardRef<RecordingPanelHandle, Props>(function RecordingPanel(
  { currentIndex, totalCount, onReRecord },
  ref,
) {
  const [recState, setRecState] = useState<RecState>('idle');
  const [recordings, setRecordings] = useState<Map<number, Blob>>(() => new Map());
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const unmountedRef = useRef(false);

  const hasRecording = recordings.has(currentIndex);
  const recordingCount = recordings.size;

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
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }

  function stopPlaybackInternal() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  const startRecording = async () => {
    setMicError(null);
    cancelSpeech();
    stopPlaybackInternal();

    // すでに録音がある場合は「録り直し」としてカウント
    if (recordings.has(currentIndex)) {
      onReRecord?.(currentIndex);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      const targetIndex = currentIndex;
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (unmountedRef.current) return;
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setRecordings((prev) => {
            const next = new Map(prev);
            next.set(targetIndex, blob);
            return next;
          });
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

  const stopRecording = () => {
    stopRecordingInternal();
  };

  const playRecording = () => {
    const blob = recordings.get(currentIndex);
    if (!blob) return;
    cancelSpeech();
    stopPlaybackInternal();

    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      if (unmountedRef.current) return;
      stopPlaybackInternal();
      setRecState('idle');
    };
    audio.onerror = () => {
      if (unmountedRef.current) return;
      stopPlaybackInternal();
      setRecState('idle');
    };

    audio.play().catch(() => {
      if (!unmountedRef.current) {
        stopPlaybackInternal();
        setRecState('idle');
      }
    });
    setRecState('playing');
  };

  const stopPlayback = () => {
    stopPlaybackInternal();
    setRecState('idle');
  };

  const deleteRecording = () => {
    stopPlaybackInternal();
    setRecordings((prev) => {
      const next = new Map(prev);
      next.delete(currentIndex);
      return next;
    });
  };

  // --- キーボード操作ハンドル ---
  useImperativeHandle(ref, () => ({
    toggleRecording() {
      if (recState === 'recording') stopRecording();
      else if (recState === 'idle') startRecording();
    },
  }));

  const isSupported =
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined';

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
        {recordingCount > 0 && (
          <span className="text-muted">{recordingCount} / {totalCount} 文 録音済み</span>
        )}
      </div>

      <div className="recording-controls">
        {recState === 'idle' && (
          <>
            <button className="btn btn-danger btn-small" onClick={startRecording}>⏺ 録音</button>
            {hasRecording && (
              <>
                <button className="btn btn-primary btn-small" onClick={playRecording}>▶ 録音を再生</button>
                <button className="btn btn-secondary btn-small" onClick={deleteRecording}>削除</button>
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
      {micError && <div className="recording-error">{micError}</div>}
    </div>
  );
});

export default RecordingPanel;
