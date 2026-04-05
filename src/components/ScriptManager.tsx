import React, { useState, useRef } from 'react';
import { type SavedScript, saveScripts, loadScripts, saveActiveScriptId } from '../utils/storage';
import DiffView from './DiffView';

interface Props {
  currentText: string;
  onLoad: (text: string) => void;
  onClose: () => void;
}

/** 複数台本の管理パネル（インポート/エクスポート/差分比較付き） */
export default function ScriptManager({ currentText, onLoad, onClose }: Props) {
  const [scripts, setScripts] = useState<SavedScript[]>(() => loadScripts());
  const [editTitle, setEditTitle] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<SavedScript | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const handleSave = () => {
    const title = editTitle.trim() || `台本 ${scripts.length + 1}`;
    const newScript: SavedScript = { id: genId(), title, text: currentText, updatedAt: Date.now() };
    const next = [newScript, ...scripts];
    setScripts(next);
    saveScripts(next);
    saveActiveScriptId(newScript.id);
    setEditTitle('');
  };

  const handleLoad = (s: SavedScript) => { saveActiveScriptId(s.id); onLoad(s.text); };

  const handleDuplicate = (s: SavedScript) => {
    const dup: SavedScript = { ...s, id: genId(), title: `${s.title} (コピー)`, updatedAt: Date.now() };
    const next = [dup, ...scripts];
    setScripts(next);
    saveScripts(next);
  };

  const handleDelete = (id: string) => {
    const next = scripts.filter((s) => s.id !== id);
    setScripts(next);
    saveScripts(next);
  };

  // --- エクスポート ---
  const exportOne = (s: SavedScript) => {
    downloadJson([{ title: s.title, rawScript: s.text, updatedAt: s.updatedAt }], `${s.title}.json`);
  };

  const exportAll = () => {
    const data = scripts.map((s) => ({ title: s.title, rawScript: s.text, updatedAt: s.updatedAt }));
    downloadJson(data, '台本一覧.json');
  };

  // --- インポート ---
  const handleImportClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const imported: SavedScript[] = [];
        for (const item of arr) {
          if (typeof item?.rawScript !== 'string' || !item.rawScript.trim()) continue;
          imported.push({
            id: genId(),
            title: (typeof item.title === 'string' && item.title.trim()) ? item.title.trim() : `インポート ${scripts.length + imported.length + 1}`,
            text: item.rawScript,
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
          });
        }
        if (imported.length === 0) { setImportError('有効な台本データが見つかりませんでした'); return; }
        const next = [...imported, ...scripts];
        setScripts(next);
        saveScripts(next);
        setImportError(null);
      } catch { setImportError('JSONの読み込みに失敗しました。ファイル形式を確認してください。'); }
    };
    reader.readAsText(file);
    // 同じファイルを再選択可能にするためリセット
    e.target.value = '';
  };

  const formatDate = (ts: number) => { try { return new Date(ts).toLocaleString('ja-JP'); } catch { return ''; } };

  // 差分比較表示中
  if (diffTarget) {
    return (
      <div className="script-manager">
        <DiffView
          textA={diffTarget.text}
          textB={currentText}
          labelA={diffTarget.title}
          labelB="現在の台本"
          onClose={() => setDiffTarget(null)}
        />
      </div>
    );
  }

  return (
    <div className="script-manager">
      <div className="script-manager-header">
        <h3>台本管理</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      {/* 保存 + インポート/エクスポート */}
      <div className="script-manager-save">
        <input type="text" className="range-number-input" style={{ width: '100%', textAlign: 'left' }}
          placeholder="タイトル（省略可）" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        <button className="btn btn-primary btn-small" onClick={handleSave}>保存</button>
        <button className="btn btn-secondary btn-small" onClick={handleImportClick}>インポート</button>
        {scripts.length > 0 && (
          <button className="btn btn-secondary btn-small" onClick={exportAll}>全エクスポート</button>
        )}
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
      {importError && <div className="recording-error">{importError}</div>}

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
                <button className="btn btn-primary btn-small" onClick={() => handleLoad(s)}>読込</button>
                <button className="btn btn-secondary btn-small" onClick={() => setDiffTarget(s)}>比較</button>
                <button className="btn btn-secondary btn-small" onClick={() => exportOne(s)}>JSON</button>
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

/** JSON をファイルとしてダウンロードする */
function downloadJson(data: unknown, filename: string): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}
