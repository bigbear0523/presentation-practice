import React, { useState } from 'react';
import { type SavedScript, saveScripts, loadScripts, saveActiveScriptId } from '../utils/storage';

interface Props {
  currentText: string;
  onLoad: (text: string) => void;
  onClose: () => void;
}

/** 複数台本の管理パネル */
export default function ScriptManager({ currentText, onLoad, onClose }: Props) {
  const [scripts, setScripts] = useState<SavedScript[]>(() => loadScripts());
  const [editTitle, setEditTitle] = useState('');

  const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 現在の台本を保存
  const handleSave = () => {
    const title = editTitle.trim() || `台本 ${scripts.length + 1}`;
    const newScript: SavedScript = { id: genId(), title, text: currentText, updatedAt: Date.now() };
    const next = [newScript, ...scripts];
    setScripts(next);
    saveScripts(next);
    saveActiveScriptId(newScript.id);
    setEditTitle('');
  };

  // 台本を読み込む
  const handleLoad = (s: SavedScript) => {
    saveActiveScriptId(s.id);
    onLoad(s.text);
  };

  // 台本を複製
  const handleDuplicate = (s: SavedScript) => {
    const dup: SavedScript = { ...s, id: genId(), title: `${s.title} (コピー)`, updatedAt: Date.now() };
    const next = [dup, ...scripts];
    setScripts(next);
    saveScripts(next);
  };

  // 台本を削除
  const handleDelete = (id: string) => {
    const next = scripts.filter((s) => s.id !== id);
    setScripts(next);
    saveScripts(next);
  };

  const formatDate = (ts: number) => {
    try { return new Date(ts).toLocaleString('ja-JP'); } catch { return ''; }
  };

  return (
    <div className="script-manager">
      <div className="script-manager-header">
        <h3>台本管理</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      {/* 現在の台本を保存 */}
      <div className="script-manager-save">
        <input
          type="text"
          className="range-number-input"
          style={{ width: '100%', textAlign: 'left' }}
          placeholder="タイトル（省略可）"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />
        <button className="btn btn-primary btn-small" onClick={handleSave}>
          現在の台本を保存
        </button>
      </div>

      {/* 一覧 */}
      {scripts.length === 0 ? (
        <p className="text-muted" style={{ padding: '12px 0' }}>保存された台本はありません</p>
      ) : (
        <div className="script-list">
          {scripts.map((s) => (
            <div key={s.id} className="script-list-item">
              <div className="script-list-info">
                <span className="script-list-title">{s.title}</span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {formatDate(s.updatedAt)} / {s.text.length}文字
                </span>
              </div>
              <div className="script-list-actions">
                <button className="btn btn-primary btn-small" onClick={() => handleLoad(s)}>読み込む</button>
                <button className="btn btn-secondary btn-small" onClick={() => handleDuplicate(s)}>複製</button>
                <button className="btn btn-danger btn-small" onClick={() => handleDelete(s.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
