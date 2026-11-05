import { useEffect } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { BookOpen, Highlighter, Settings } from 'lucide-react';
import ShelfPage from './pages/ShelfPage';
import NotesPage from './pages/NotesPage';
import SettingsPage from './pages/SettingsPage';
import ReaderPage from './pages/ReaderPage';
import { useSettings } from './store/settings';
import { THEMES } from './lib/themes';
import { takeOpenedFile } from './lib/openWith';
import { importBookFile } from './parsers';

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const themeId = useSettings((s) => s.prefs.themeId);
  const isReader = location.pathname.startsWith('/read/');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const theme = THEMES[themeId];
    void StatusBar.setBackgroundColor({ color: theme.bg }).catch(() => undefined);
    void StatusBar.setStyle({ style: theme.isDark ? Style.Light : Style.Dark }).catch(() => undefined);
  }, [themeId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) navigate(-1);
      else void CapacitorApp.exitApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [navigate]);

  // System "open with": import the incoming PDF/EPUB/TXT/MOBI and open it.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let busy = false;
    const consume = async () => {
      if (busy || cancelled) return;
      const file = await takeOpenedFile();
      if (!file || cancelled) return;
      busy = true;
      try {
        const { book } = await importBookFile(file);
        if (!cancelled) navigate(`/read/${book.id}`);
      } catch (error) {
        console.error('无法打开外部文件', error);
      } finally {
        busy = false;
      }
    };
    void consume();
    const stateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void consume();
    });
    return () => {
      cancelled = true;
      void stateListener.then((handle) => handle.remove());
    };
  }, [navigate]);

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<ShelfPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isReader ? <div className="app-status-scrim" aria-hidden="true" /> : null}

      {!isReader ? (
        <nav className="tab-bar">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <BookOpen size={21} />
            <span>书架</span>
          </NavLink>
          <NavLink to="/notes" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <Highlighter size={21} />
            <span>笔记</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <Settings size={21} />
            <span>设置</span>
          </NavLink>
        </nav>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
