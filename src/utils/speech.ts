/**
 * SpeechSynthesis APIを使った読み上げユーティリティ
 * - 日本語音声の優先選択
 * - 音声一覧の遅延読み込み対応
 * - cancel 後の onEnd 発火に対する世代カウンタ防御
 * - speechSynthesis 未対応環境でのガード
 */

/** 世代カウンタ: cancel のたびにインクリメントし、古い onEnd を無効化する */
let generation = 0;

/** speechSynthesis が利用可能かどうか */
function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 日本語音声を取得する（遅延対応付き） */
export function getJapaneseVoice(): Promise<SpeechSynthesisVoice | null> {
  if (!hasSpeechSynthesis()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const tryGet = () => {
      const voices = window.speechSynthesis.getVoices();
      return (
        voices.find((v) => v.lang === 'ja-JP') ||
        voices.find((v) => v.lang.startsWith('ja')) ||
        null
      );
    };

    const voice = tryGet();
    if (voice) {
      resolve(voice);
      return;
    }

    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(tryGet());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);

    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(tryGet());
    }, 3000);
  });
}

/** 読み上げを安全にキャンセルし、世代を進める */
export function cancelSpeech(): void {
  generation++;
  if (hasSpeechSynthesis()) {
    window.speechSynthesis.cancel();
  }
}

/** 現在の世代番号を返す */
export function getSpeechGeneration(): number {
  return generation;
}

/** テキストを読み上げる。speechSynthesis 未対応なら即 onEnd を呼ぶ */
export function speak(
  text: string,
  options: {
    voice: SpeechSynthesisVoice | null;
    rate?: number;
    onEnd?: () => void;
    onError?: () => void;
  }
): void {
  if (!hasSpeechSynthesis()) {
    // 読み上げ不可でもフローを壊さないよう onEnd だけ呼ぶ
    options.onEnd?.();
    return;
  }

  // 既存の読み上げをキャンセル（世代も進む）
  cancelSpeech();

  // この utterance が属する世代を記録
  const myGeneration = generation;

  const utterance = new SpeechSynthesisUtterance(text);
  if (options.voice) {
    utterance.voice = options.voice;
    utterance.lang = options.voice.lang;
  } else {
    utterance.lang = 'ja-JP';
  }
  utterance.rate = options.rate ?? 1.0;

  utterance.onend = () => {
    // cancel() 後にブラウザが遅れて onEnd を発火させることがある。
    // 世代が変わっていたらこの utterance は無効なので無視する。
    if (generation !== myGeneration) return;
    options.onEnd?.();
  };

  utterance.onerror = (e) => {
    if (generation !== myGeneration) return;
    if (e.error !== 'interrupted') {
      console.warn('読み上げエラー:', e.error);
      options.onError?.();
    }
  };

  window.speechSynthesis.speak(utterance);
}

/** 一時停止 */
export function pauseSpeech(): void {
  if (hasSpeechSynthesis()) window.speechSynthesis.pause();
}

/** 再開 */
export function resumeSpeech(): void {
  if (hasSpeechSynthesis()) window.speechSynthesis.resume();
}
