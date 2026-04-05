import React, { useState, useRef } from 'react';
import {
  type SavedScript, type ScriptVersion,
  saveScripts, loadScripts, saveActiveScriptId, updateScriptWithHistory,
} from '../utils/storage';
import DiffView from './DiffView';

interface Props {
  currentText: string;
  onLoad: (text: string) => void;
  onClose: () => void;
}

type ViewMode =
  | { kind: 'list' }
  | { kind: 'diff'; textA: string; textB: string; labelA: string; labelB: string }
  | { kind: 'history'; script: SavedScript };

export default function ScriptManager({ currentText, onLoad, onClose }: Props) {
  const [scripts, setScripts] = useState<SavedScript[]>(() => loadScripts());
  const [editTitle, setEditTitle] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>({ kind: 'list' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const persist = (next: SavedScript[]) => { setScripts(next); saveScripts(next); };

  // 新規保存
  const handleSave = () => {
    const title = editTitle.trim() || `台本 ${scripts.length + 1}`;
    const newScript: SavedScript = { id: genId(), title, text: currentText, updatedAt: Date.now() };
    persist([newScript, ...scripts]);
    saveActiveScriptId(newScript.id);
    setEditTitle('');
  };

  // 上書き保存（バージョン管理付き）
  const handleOverwrite = (s: SavedScript) => {
    const next = updateScriptWithHistory(scripts, s.id, currentText);
    persist(next);
  };

  const handleLoad = (s: SavedScript) => { saveActiveScriptId(s.id); onLoad(s.text); };
  const handleDuplicate = (s: SavedScript) => {
    persist([{ ...s, id: genId(), title: `${s.title} (コピー)`, updatedAt: Date.now(), history: [] }, ...scripts]);
  };
  const handleDelete = (id: string) => { persist(scripts.filter((s) => s.id !== id)); };

  // エクスポート
  const exportOne = (s: SavedScript) => {
    downloadJson([{ title: s.title, rawScript: s.text, updatedAt: s.updatedAt }], `${s.title}.json`);
  };
  const exportAll = () => {
    downloadJson(scripts.map((s) => ({ title: s.title, rawScript: s.text, updatedAt: s.updatedAt })), '台本一覧.json');
  };

  // インポート
  const handleImportClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => { setImportError('ファイルの読み込みに失敗しました'); };
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const imported: SavedScript[] = [];
        for (const item of arr) {
          if (typeof item?.rawScript !== 'string' || !item.rawScript.trim()) continue;
          imported.push({
            id: genId(), text: item.rawScript,
            title: (typeof item.title === 'string' && item.title.trim()) ? item.title.trim() : `インポート ${scripts.length + imported.length + 1}`,
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
          });
        }
        if (imported.length === 0) { setImportError('有効な台本データが見つかりませんでした'); return; }
        persist([...imported, ...scripts]);
      } catch { setImportError('JSONの読み込みに失敗しました'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 履歴から復元
  const handleRestore = (script: SavedScript, ver: ScriptVersion) => {
    // 現在のテキストを履歴に押し込んでから復元
    const next = updateScriptWithHistory(scripts, script.id, ver.text);
    persist(next);
    onLoad(ver.text);
    setView({ kind: 'list' });
  };

  const fmtDate = (ts: number) => { try { return new Date(ts).toLocaleString('ja-JP'); } catch { return ''; } };

  // --- 差分比較ビュー ---
  if (view.kind === 'diff') {
    return (
      <div className="script-manager">
        <DiffView textA={view.textA} textB={view.textB} labelA={view.labelA} labelB={view.labelB}
          onClose={() => setView({ kind: 'list' })} />
      </div>
    );
  }

  // --- 履歴ビュー ---
  if (view.kind === 'history') {
    const s = view.script;
    const history = s.history ?? [];
    return (
      <div className="script-manager">
        <div className="script-manager-header">
          <h3>「{s.title}」の履歴</h3>
          <button className="btn btn-secondary btn-small" onClick={() => setView({ kind: 'list' })}>戻る</button>
        </div>

        {/* 現在版 */}
        <div className="version-item version-current">
          <span className="version-label">現在版</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{fmtDate(s.updatedAt)} / {s.text.length}文字</span>
        </div>

        {history.length === 0 ? (
          <p className="text-muted" style={{ padding: '12px 0' }}>過去の履歴はありません</p>
        ) : (
          <div className="script-list">
            {history.map((ver, vi) => (
              <div key={vi} className="version-item">
                <div className="version-info">
                  <span className="version-label">v{history.length - vi}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {fmtDate(ver.savedAt)} / {ver.text.length}文字
                  </span>
                </div>
                <div className="script-list-actions">
                  <button className="btn btn-primary btn-small" onClick={() => handleRestore(s, ver)}>復元</button>
                  <button className="btn btn-secondary btn-small" onClick={() => setView({
                    kind: 'diff', textA: ver.text, textB: s.text,
                    labelA: `v${history.length - vi}`, labelB: '現在版',
                  })}>比較</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- メイン一覧 ---
  return (
    <div className="script-manager">
      <div className="script-manager-header">
        <h3>台本管理</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>閉じる</button>
      </div>

      <div className="script-manager-save">
        <input type="text" className="range-number-input" style={{ width: '100%', textAlign: 'left' }}
          placeholder="タイトル（省略可）" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        <button className="btn btn-primary btn-small" onClick={handleSave}>新規保存</button>
        <button className="btn btn-secondary btn-small" onClick={handleImportClick}>インポート</button>
        {scripts.length > 0 && (
          <button className="btn btn-secondary btn-small" onClick={exportAll}>全エクスポート</button>
        )}
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
      {importError && <div className="recording-error">{importError}</div>}

      {scripts.length === 0 ? (
        <p className="text-muted" style={{ padding: '12px 0' }}>保存された台本はありません</p>
      ) : (
        <div className="script-list">
          {scripts.map((s) => {
            const histCount = s.history?.length ?? 0;
            return (
              <div key={s.id} className="script-list-item">
                <div className="script-list-info">
                  <span className="script-list-title">
                    {s.title}
                    {histCount > 0 && <span className="version-badge">{histCount}版</span>}
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {fmtDate(s.updatedAt)} / {s.text.length}文字
                  </span>
                </div>
                <div className="script-list-actions">
                  <button className="btn btn-primary btn-small" onClick={() => handleLoad(s)}>読込</button>
                  <button className="btn btn-secondary btn-small" onClick={() => handleOverwrite(s)}>上書き</button>
                  {histCount > 0 && (
                    <button className="btn btn-secondary btn-small" onClick={() => setView({ kind: 'history', script: s })}>履歴</button>
                  )}
                  <button className="btn btn-secondary btn-small" onClick={() => setView({
                    kind: 'diff', textA: s.text, textB: currentText, labelA: s.title, labelB: '現在の台本',
                  })}>比較</button>
                  <button className="btn btn-secondary btn-small" onClick={() => exportOne(s)}>JSON</button>
                  <button className="btn btn-secondary btn-small" onClick={() => handleDuplicate(s)}>複製</button>
                  <button className="btn btn-danger btn-small" onClick={() => handleDelete(s.id)}>削除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function downloadJson(data: unknown, filename: string): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}
