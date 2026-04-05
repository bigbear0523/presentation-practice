import React, { useState } from 'react';
import { SAMPLE_SCRIPT } from '../utils/scriptParser';

interface Props {
  initialText: string;
  onApply: (text: string) => void;
}

/**
 * 台本入力コンポーネント
 * テキストエリアに台本をコピペし、「反映」で練習データに変換
 */
export default function ScriptInput({ initialText, onApply }: Props) {
  const [text, setText] = useState(initialText);
  const [isOpen, setIsOpen] = useState(!initialText);

  const handleApply = () => {
    if (text.trim().length === 0) return;
    onApply(text);
    setIsOpen(false);
  };

  const handleLoadSample = () => {
    setText(SAMPLE_SCRIPT);
  };

  return (
    <div className="script-input">
      <div className="script-input-header">
        <button
          className="btn btn-secondary"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? '▲ 台本入力を閉じる' : '▼ 台本を編集する'}
        </button>
      </div>

      {isOpen && (
        <div className="script-input-body">
          <textarea
            className="script-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ここにプレゼン台本を貼り付けてください..."
            rows={12}
          />
          <div className="script-input-actions">
            <button className="btn btn-primary" onClick={handleApply}>
              反映する
            </button>
            <button className="btn btn-secondary" onClick={handleLoadSample}>
              サンプル台本を読み込む
            </button>
            <span className="text-muted">
              {text.length > 0 ? `${text.length}文字` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
