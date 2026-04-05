/**
 * 台本テキストを練習用の文単位に分割するユーティリティ
 */

/** 章の情報 */
export interface Chapter {
  title: string;
  startIndex: number; // allSentences 内の開始インデックス
  endIndex: number;   // allSentences 内の終了インデックス（含む）
}

/** 段落（空行区切り）に分割 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 1文ごとに分割（句点・改行・感嘆符・疑問符で区切る） */
export function splitIntoSentences(text: string): string[] {
  const results: string[] = [];
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const parts = line.split(/(?<=[。！？])/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) results.push(trimmed);
    }
  }

  // 短すぎる文（3文字以下）は前の文と結合
  const merged: string[] = [];
  for (const sentence of results) {
    if (merged.length > 0 && sentence.length <= 3) {
      merged[merged.length - 1] += sentence;
    } else {
      merged.push(sentence);
    }
  }
  return merged;
}

/** 長すぎる文を読点「、」で補助的に分割 */
export function splitLongSentences(sentences: string[], maxLength: number = 80): string[] {
  const results: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxLength) { results.push(s); continue; }
    const parts = s.split(/(?<=[、])/);
    let current = '';
    for (const part of parts) {
      if (current.length + part.length > maxLength && current.length > 0) {
        results.push(current.trim());
        current = part;
      } else {
        current += part;
      }
    }
    if (current.trim().length > 0) results.push(current.trim());
  }
  return results;
}

/** メインのパース関数 */
export function parseScript(text: string, mode: 'sentence' | 'paragraph'): string[] {
  if (mode === 'paragraph') return splitIntoParagraphs(text);
  const sentences = splitIntoSentences(text);
  return splitLongSentences(sentences);
}

/**
 * 台本テキストから章を検出する。
 * # 見出し行 または 空行2つ以上を章の区切りとみなす。
 * 見出し行は文リストに含めず、章タイトルとして扱う。
 */
export function parseChapters(text: string, allSentences: string[]): Chapter[] {
  if (allSentences.length === 0) return [];

  const lines = text.split('\n');
  // # で始まる見出し行を検出
  const headings: { title: string; lineIndex: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,3}\s+(.+)/);
    if (m) headings.push({ title: m[1].trim(), lineIndex: i });
  }

  // 見出しがなければ、空行2つ以上で区切る（段落ベース）
  if (headings.length === 0) {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length <= 1) {
      return [{ title: '全体', startIndex: 0, endIndex: allSentences.length - 1 }];
    }
    const chapters: Chapter[] = [];
    let sentenceIdx = 0;
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const pSentences = splitLongSentences(splitIntoSentences(paragraphs[pi]));
      const start = sentenceIdx;
      sentenceIdx += pSentences.length;
      chapters.push({
        title: `セクション ${pi + 1}`,
        startIndex: Math.min(start, allSentences.length - 1),
        endIndex: Math.min(sentenceIdx - 1, allSentences.length - 1),
      });
    }
    return chapters;
  }

  // 見出しベースで章を作成
  // 見出し行のテキストを取り除いた台本から文を再パースして位置を推定
  const chapters: Chapter[] = [];
  const sections: { title: string; text: string }[] = [];
  for (let hi = 0; hi < headings.length; hi++) {
    const startLine = headings[hi].lineIndex + 1;
    const endLine = hi < headings.length - 1 ? headings[hi + 1].lineIndex : lines.length;
    sections.push({
      title: headings[hi].title,
      text: lines.slice(startLine, endLine).join('\n'),
    });
  }

  // 見出し前のテキストがあれば「はじめに」として追加
  const beforeFirst = lines.slice(0, headings[0].lineIndex).join('\n').trim();
  if (beforeFirst.length > 0) {
    sections.unshift({ title: 'はじめに', text: beforeFirst });
  }

  let sentenceIdx = 0;
  for (const sec of sections) {
    const secSentences = splitLongSentences(splitIntoSentences(sec.text));
    if (secSentences.length === 0) continue;
    const start = sentenceIdx;
    sentenceIdx += secSentences.length;
    chapters.push({
      title: sec.title,
      startIndex: Math.min(start, allSentences.length - 1),
      endIndex: Math.min(sentenceIdx - 1, allSentences.length - 1),
    });
  }

  if (chapters.length === 0) {
    return [{ title: '全体', startIndex: 0, endIndex: allSentences.length - 1 }];
  }
  return chapters;
}

/** サンプル台本 */
export const SAMPLE_SCRIPT = `# はじめに

皆さま、こんにちは。本日はお忙しい中お集まりいただき、誠にありがとうございます。

私は営業部の田中と申します。本日は、弊社の新しいプロジェクト管理ツール「TaskFlow」についてご紹介させていただきます。

# 現在の課題

まず、現在の課題からお話しします。多くの企業では、プロジェクト管理に複数のツールを使い分けており、情報が分散してしまっています。その結果、チーム間の連携が難しくなり、プロジェクトの進捗が見えにくくなっています。

# TaskFlowの特徴

TaskFlowは、これらの課題を一つのプラットフォームで解決します。タスク管理、スケジュール管理、コミュニケーション機能を統合し、チーム全体の生産性を向上させます。

具体的な特徴を3つご紹介します。1つ目は、直感的なドラッグ＆ドロップ操作です。2つ目は、リアルタイムの進捗ダッシュボードです。3つ目は、既存ツールとの豊富な連携機能です。

# 導入実績

導入企業様では、平均30%の業務効率改善を実現しています。特に、プロジェクトの可視化により、問題の早期発見が可能になったというお声を多くいただいています。

# おわりに

最後に、本日お配りした資料に詳細を記載しております。ぜひご覧いただき、ご不明な点があればお気軽にお尋ねください。

ご清聴ありがとうございました。`;
