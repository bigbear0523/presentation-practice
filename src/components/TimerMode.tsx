import React, { useState, useEffect, useRef } from 'react';

interface Props {
  totalSentences: number;
  currentIndex: number;
  onClose: () => void;
  /** 終了時に結果を通知する */
  onFinish?: (info: { elapsed: number; limitSec: number; completed: boolean; reachedIndex: number }) => void;
}

/**
 * 本番モード: 制限時間付き練習
 * - 経過時間表示
 * - 予定ペースとの差
 * - 終了時に簡易結果表示
 */
export default function TimerMode({ totalSentences, currentIndex, onClose, onFinish }: Props) {
  const [limitMinutes, setLimitMinutes] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 秒
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startIndexRef = useRef(0);

  const limitSec = limitMinutes * 60;

  // タイマー
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= limitSec) {
          setIsRunning(false);
          setFinished(true);
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [isRunning, limitSec]);

  // クリーンアップ
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleStart = () => {
    setElapsed(0);
    setFinished(false);
    startIndexRef.current = currentIndex;
    setIsRunning(true);
  };

  const handleStop = () => {
    setIsRunning(false);
    setFinished(true);
  };

  /** 結果を確定せず時間選択に戻す */
  const handleReset = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRunning(false);
    setFinished(false);
    setElapsed(0);
  };

  // finished が true になったときに onFinish を呼ぶ
  const finishedRef = useRef(false);
  useEffect(() => {
    if (finished && !finishedRef.current) {
      finishedRef.current = true;
      onFinish?.({
        elapsed,
        limitSec,
        completed: elapsed >= limitSec,
        reachedIndex: currentIndex,
      });
    }
    if (!finished) finishedRef.current = false;
  }, [finished, elapsed, limitSec, currentIndex, onFinish]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ペース計算
  const progress = totalSentences > 0 ? (currentIndex + 1) / totalSentences : 0;
  const timeProgress = limitSec > 0 ? elapsed / limitSec : 0;
  const paceDiff = progress - timeProgress; // +なら早い、-なら遅い

  const paceLabel = () => {
    if (!isRunning && !finished) return '';
    if (Math.abs(paceDiff) < 0.05) return '予定通り';
    if (paceDiff > 0) return `${Math.round(paceDiff * 100)}% 先行`;
    return `${Math.round(Math.abs(paceDiff) * 100)}% 遅れ`;
  };

  const paceColor = () => {
    if (Math.abs(paceDiff) < 0.05) return 'var(--success)';
    if (paceDiff > 0) return 'var(--accent)';
    return 'var(--danger)';
  };

  const coveredSentences = currentIndex - startIndexRef.current + 1;

  return (
    <div className="timer-mode">
      <div className="timer-header">
        <span className="control-label">本番モード</span>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      {!isRunning && !finished && (
        <div className="timer-setup">
          <label className="control-label">制限時間</label>
          <div className="btn-group">
            {[3, 5, 10, 15, 20].map((m) => (
              <button key={m}
                className={`btn btn-mode btn-small ${limitMinutes === m ? 'active' : ''}`}
                onClick={() => setLimitMinutes(m)}
              >
                {m}分
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-small" onClick={handleStart}>開始</button>
        </div>
      )}

      {(isRunning || finished) && (
        <div className="timer-display">
          <div className="timer-clock">
            <span className="timer-elapsed">{formatTime(elapsed)}</span>
            <span className="timer-limit"> / {formatTime(limitSec)}</span>
          </div>

          {/* タイムバー */}
          <div className="timer-bar">
            <div className="timer-bar-fill" style={{ width: `${Math.min(100, timeProgress * 100)}%` }} />
            <div className="timer-bar-marker" style={{ left: `${Math.min(100, progress * 100)}%` }} />
          </div>

          <div className="timer-pace" style={{ color: paceColor() }}>
            {paceLabel()} — {currentIndex + 1} / {totalSentences} 文
          </div>

          {isRunning && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-small" onClick={handleStop}>終了</button>
              <button className="btn btn-secondary btn-small" onClick={handleReset}>リセット</button>
            </div>
          )}

          {finished && (
            <div className="timer-result">
              <p>練習文数: {coveredSentences} 文</p>
              <p>経過時間: {formatTime(elapsed)}</p>
              <p>ペース: 1文あたり {coveredSentences > 0 ? (elapsed / coveredSentences).toFixed(1) : '-'} 秒</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-small" onClick={handleStart}>もう一度</button>
                <button className="btn btn-secondary btn-small" onClick={handleReset}>時間を選び直す</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
