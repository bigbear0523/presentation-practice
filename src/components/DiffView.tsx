import React, { useMemo } from 'react';

interface Props {
  textA: string;
  textB: string;
  labelA: string;
  labelB: string;
  onClose: () => void;
}

/** 行単位の差分比較（変更箇所の文字単位ハイライト付き） */
export default function DiffView({ textA, textB, labelA, labelB, onClose }: Props) {
  const diff = useMemo(() => {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    return computeDiff(linesA, linesB);
  }, [textA, textB]);

  const stats = useMemo(() => {
    let added = 0, deleted = 0, same = 0;
    for (const line of diff) {
      if (line.type === 'add') added++;
      else if (line.type === 'del') deleted++;
      else same++;
    }
    return { added, deleted, same };
  }, [diff]);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <h4>台本比較</h4>
        <span className="text-muted">{labelA} ↔ {labelB}</span>
        <span className="diff-stats">
          <span className="diff-stat-add">+{stats.added}</span>
          <span className="diff-stat-del">-{stats.deleted}</span>
          <span className="text-muted">{stats.same}行共通</span>
        </span>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>
      <div className="diff-body">
        {diff.map((line, i) => (
          <div key={i} className={`diff-line diff-${line.type}`}>
            <span className="diff-line-num">{line.lineNum ?? ''}</span>
            <span className="diff-marker">
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
            </span>
            {line.type === 'same' ? (
              <span className="diff-text">{line.text || '\u00A0'}</span>
            ) : (
              <span className="diff-text" dangerouslySetInnerHTML={{ __html: highlightChanges(line.text, line.pairText ?? '') }} />
            )}
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
  lineNum?: number;
  pairText?: string; // 対応する行（変更箇所ハイライト用）
}

function computeDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const raw: DiffLine[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'same', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'add', text: b[j - 1] });
      j--;
    } else {
      raw.push({ type: 'del', text: a[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // 行番号を振り、del+add の隣接ペアに pairText を設定
  let lineA = 0, lineB = 0;
  for (const line of raw) {
    if (line.type === 'same') { lineA++; lineB++; line.lineNum = lineB; }
    else if (line.type === 'del') { lineA++; line.lineNum = lineA; }
    else { lineB++; line.lineNum = lineB; }
  }

  // del の直後に add がある場合、互いに pairText を設定
  for (let k = 0; k < raw.length - 1; k++) {
    if (raw[k].type === 'del' && raw[k + 1].type === 'add') {
      raw[k].pairText = raw[k + 1].text;
      raw[k + 1].pairText = raw[k].text;
    }
  }

  return raw;
}

/** 対応行との文字差分をハイライトする（簡易: 先頭・末尾の共通部分を除外し、中央を強調） */
function highlightChanges(text: string, pair: string): string {
  if (!pair || !text) return escapeHtml(text || '\u00A0');

  // 先頭の共通文字数
  let prefixLen = 0;
  while (prefixLen < text.length && prefixLen < pair.length && text[prefixLen] === pair[prefixLen]) prefixLen++;

  // 末尾の共通文字数
  let suffixLen = 0;
  while (
    suffixLen < text.length - prefixLen &&
    suffixLen < pair.length - prefixLen &&
    text[text.length - 1 - suffixLen] === pair[pair.length - 1 - suffixLen]
  ) suffixLen++;

  const prefix = escapeHtml(text.slice(0, prefixLen));
  const changed = escapeHtml(text.slice(prefixLen, text.length - suffixLen));
  const suffix = escapeHtml(text.slice(text.length - suffixLen));

  if (!changed) return prefix + suffix;
  return `${prefix}<mark class="diff-highlight">${changed}</mark>${suffix}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
