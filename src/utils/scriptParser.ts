/**
 * 台本テキストを練習用の文単位に分割するユーティリティ
 */

/** 段落（空行区切り）に分割 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/) // 空行で段落分割
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 1文ごとに分割（句点・改行・感嘆符・疑問符で区切る） */
export function splitIntoSentences(text: string): string[] {
  const results: string[] = [];

  // まず改行で分割し、各行をさらに句点で分割
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);

  for (const line of lines) {
    // 句点「。」「！」「？」で分割。区切り文字は前の文に含める
    const parts = line.split(/(?<=[。！？])/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        results.push(trimmed);
      }
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

/**
 * 長すぎる文を読点「、」で補助的に分割
 * maxLength を超える文を読点で分割する
 */
export function splitLongSentences(
  sentences: string[],
  maxLength: number = 80
): string[] {
  const results: string[] = [];

  for (const s of sentences) {
    if (s.length <= maxLength) {
      results.push(s);
      continue;
    }
    // 読点で分割を試みる
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
    if (current.trim().length > 0) {
      results.push(current.trim());
    }
  }

  return results;
}

/** メインのパース関数 */
export function parseScript(
  text: string,
  mode: 'sentence' | 'paragraph'
): string[] {
  if (mode === 'paragraph') {
    return splitIntoParagraphs(text);
  }
  const sentences = splitIntoSentences(text);
  return splitLongSentences(sentences);
}

/** サンプル台本 */
export const SAMPLE_SCRIPT = `皆さま、こんにちは。本日はお忙しい中お集まりいただき、誠にありがとうございます。

私は営業部の田中と申します。本日は、弊社の新しいプロジェクト管理ツール「TaskFlow」についてご紹介させていただきます。

まず、現在の課題からお話しします。多くの企業では、プロジェクト管理に複数のツールを使い分けており、情報が分散してしまっています。その結果、チーム間の連携が難しくなり、プロジェクトの進捗が見えにくくなっています。

TaskFlowは、これらの課題を一つのプラットフォームで解決します。タスク管理、スケジュール管理、コミュニケーション機能を統合し、チーム全体の生産性を向上させます。

具体的な特徴を3つご紹介します。1つ目は、直感的なドラッグ＆ドロップ操作です。2つ目は、リアルタイムの進捗ダッシュボードです。3つ目は、既存ツールとの豊富な連携機能です。

導入企業様では、平均30%の業務効率改善を実現しています。特に、プロジェクトの可視化により、問題の早期発見が可能になったというお声を多くいただいています。

最後に、本日お配りした資料に詳細を記載しております。ぜひご覧いただき、ご不明な点があればお気軽にお尋ねください。

ご清聴ありがとうございました。`;
