import React from 'react';

interface Props {
  textA: string;
  textB: string;
  labelA: string;
  labelB: string;
  onClose: () => void;
}

/** 行単位の簡易差分比較 */
export default function DiffView({ textA, textB, labelA, labelB, onClose }: Props) {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const diff = computeDiff(linesA, linesB);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <h4>台本比較</h4>
        <span className="text-muted">{labelA} ↔ {labelB}</span>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>
      <div className="diff-body">
        {diff.map((line, i) => (
          <div key={i} className={`diff-line diff-${line.type}`}>
            <span className="diff-marker">
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
            </span>
            <span className="diff-text">{line.text || '\u00A0'}</span>
          </div>
        ))}
        {diff.length === 0 && <p className="text-muted" style={{ padding: 12 }}>差分はありません</p>}
      </div>
    </div>
  );
}

interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/**
 * 簡易 LCS ベースの行単位 diff
 * O(n*m) だが台本は数百行程度なので問題ない
 */
function computeDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // LCS テーブル構築
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // バックトラックで diff を構築
  const result: DiffLine[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'same', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'del', text: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}
