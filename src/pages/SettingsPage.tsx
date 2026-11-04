import { Smartphone, Sparkles, Type, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AISettingsPanel } from '../components/AISettingsPanel';
import { ReadingSettings } from '../components/ReadingSettings';
import { db } from '../db/db';

export default function SettingsPage() {
  const [cleared, setCleared] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function clearAll() {
    await db.delete();
    window.location.reload();
  }

  return (
    <div className="page settings-page">
      <header className="shelf-header">
        <div>
          <h1>设置</h1>
          <p className="shelf-sub">阅读偏好、AI 注释与数据</p>
        </div>
      </header>

      <section className="settings-card">
        <div className="settings-card__title">
          <Type size={18} /> 阅读排版
        </div>
        <ReadingSettings />
      </section>

      <section className="settings-card">
        <div className="settings-card__title">
          <Sparkles size={18} /> AI 注释
        </div>
        <AISettingsPanel />
      </section>

      <section className="settings-card">
        <div className="settings-card__title">
          <Smartphone size={18} /> 关于
        </div>
        <div className="about-block">
          <p>
            <strong>墨读</strong> v0.1.0
          </p>
          <p>支持 EPUB / PDF / TXT / MOBI / AZW3，所有图书与笔记仅保存在本机。</p>
          <p className="hint-text">
            AZW3/KF8 由本地解析器处理，受 DRM 保护的电子书无法打开；PDF 为固定版式，不支持重排。
          </p>
          {cleared ? <p className="error-text">已清空。</p> : null}
          {confirmClear ? (
            <div className="confirm-row">
              <p className="error-text">将删除书架、进度、书签和全部笔记，不可恢复。</p>
              <div className="sheet-actions sheet-actions--row">
                <button className="ghost-button" onClick={() => setConfirmClear(false)}>
                  取消
                </button>
                <button className="danger-button" onClick={() => void clearAll()}>
                  确认清空
                </button>
              </div>
            </div>
          ) : (
            <button
              className="ghost-button ghost-button--danger"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={16} /> 清空本机全部数据
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
