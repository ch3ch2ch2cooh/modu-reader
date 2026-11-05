import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  List,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AIAnnotation,
  AnnotationQA,
  BookRecord,
  Bookmark,
  HighlightColor,
  Locator,
  Note,
  ReflowContent,
} from '../types';
import {
  addBookmark,
  addNote,
  deleteBookmark,
  deleteNote,
  getBook,
  getBookContent,
  getBookFile,
  getProgress,
  listBookmarks,
  listNotes,
  saveProgress,
  updateNote,
} from '../db/repo';
import { Sheet } from '../components/Sheet';
import { THEMES, HIGHLIGHT_COLORS, FONT_STACKS } from '../lib/themes';
import { useSettings } from '../store/settings';
import { percentLabel } from '../lib/utils';
import { EpubEngine } from '../reader/EpubEngine';
import { PdfEngine } from '../reader/PdfEngine';
import { ReflowEngine } from '../reader/ReflowEngine';
import type { EngineCallbacks, EngineLocation, ReaderEngine, SelectionInfo } from '../reader/engine';
import { annotatePassage, askAnnotation } from '../ai/annotate';
import { hasVolumeKeySupport, setVolumeKeysEnabled } from '../lib/volumeKeys';

declare global {
  interface Window {
    __moduVolumeKey?: (direction: 'up' | 'down') => void;
  }
}

type ReaderStatus = 'loading' | 'ready' | 'error';

export default function ReaderPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefs = useSettings((s) => s.prefs);
  const ai = useSettings((s) => s.ai);

  const [book, setBook] = useState<BookRecord | null>(null);
  const [content, setContent] = useState<ReflowContent | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [status, setStatus] = useState<ReaderStatus>('loading');
  const [error, setError] = useState('');
  const [location, setLocation] = useState<EngineLocation | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const selectionRef = useRef<SelectionInfo | null>(null);
  const holdSelectionRef = useRef(false);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [sheet, setSheet] = useState<'toc' | 'marks' | null>(null);
  const [noteDraft, setNoteDraft] = useState<SelectionInfo | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [aiState, setAiState] = useState<{
    status: 'idle' | 'loading' | 'done' | 'error';
    text: string;
    sources: { title: string; url: string }[];
    noteId?: string;
    error?: string;
  }>({ status: 'idle', text: '', sources: [] });
  const [aiSource, setAiSource] = useState<{
    selected: string;
    before: string;
    after: string;
    chapterTitle: string;
    annotation: AIAnnotation;
  } | null>(null);
  const [aiChat, setAiChat] = useState<AnnotationQA[]>([]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAsking, setAiAsking] = useState(false);
  const [aiAskError, setAiAskError] = useState('');
  const [toast, setToast] = useState('');
  const [sliderValue, setSliderValue] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const locationRef = useRef<EngineLocation | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notes = useLiveQuery(() => (id ? listNotes(id) : Promise.resolve([])), [id], []) ?? [];

  const theme = THEMES[prefs.themeId];

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2000);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    if (!id) return;
    setBookmarks(await listBookmarks(id));
  }, [id]);

  const persistProgress = useCallback(
    (loc: EngineLocation) => {
      if (!id) return;
      void saveProgress({
        bookId: id,
        locator: loc.locator,
        percent: loc.percent,
        chapterIndex: loc.chapterIndex,
        chapterTitle: loc.chapterTitle,
      });
    },
    [id],
  );

  const onLocation = useCallback(
    (loc: EngineLocation) => {
      locationRef.current = loc;
      setLocation(loc);
      setSliderValue(Math.round(loc.percent * 1000));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistProgress(loc), 700);
    },
    [persistProgress],
  );

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChromeVisible(false), 4200);
  }, []);

  const toggleChrome = useCallback(() => {
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    setChromeVisible((prev) => {
      if (prev) return false;
      chromeTimer.current = setTimeout(() => setChromeVisible(false), 4200);
      return true;
    });
  }, []);

  const handleContentTap = useCallback(() => {
    if (selectionRef.current) {
      engineRef.current?.clearSelection();
      setSelection(null);
      return;
    }
    toggleChrome();
  }, [toggleChrome]);

  const animateTurn = useCallback((direction: 1 | -1) => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.remove('page-turn-next', 'page-turn-prev');
    void el.offsetWidth;
    el.classList.add(direction > 0 ? 'page-turn-next' : 'page-turn-prev');
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => {
      el.classList.remove('page-turn-next', 'page-turn-prev');
    }, 240);
  }, []);

  useEffect(
    () => () => {
      if (turnTimer.current) clearTimeout(turnTimer.current);
    },
    [],
  );

  // load book + content
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const record = await getBook(id);
        if (!record) throw new Error('这本书不在书架中');
        const [blob, reflow, progress] = await Promise.all([
          getBookFile(id),
          getBookContent(id),
          getProgress(id),
        ]);
        if (!alive) return;
        if (record.format === 'epub' || record.format === 'pdf') {
          if (!blob) throw new Error('图书文件已丢失，请重新导入');
          blobRef.current = blob;
        } else {
          if (!reflow) throw new Error('图书内容已丢失，请重新导入');
        }
        setBook(record);
        setContent(reflow ?? null);
        await refreshBookmarks();
        if (progress && progress.percent > 0.002) {
          flash(`已回到上次位置 · ${percentLabel(progress.percent)}`);
        }
      } catch (err) {
        if (alive) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, flash, refreshBookmarks]);

  // create the engine
  useEffect(() => {
    if (!book) return;
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const callbacks: EngineCallbacks = {
      onLocation,
      onSelection: (sel) => {
        if (!sel && holdSelectionRef.current) {
          holdSelectionRef.current = false;
          return;
        }
        setSelection(sel);
        if (sel && Capacitor.isNativePlatform()) {
          // Capture the selection into React state, then drop the WebView's
          // native selection so its copy/share/select-all menu does not pile
          // up on top of our own toolbar.
          holdSelectionRef.current = true;
          requestAnimationFrame(() => engineRef.current?.clearSelection());
        }
      },
      onHighlightClick: (noteId) => {
        const note = notes.find((n) => n.id === noteId) ?? null;
        if (note) setActiveNote(note);
      },
      onReady: () => {
        if (!disposed) setStatus('ready');
      },
      onTap: () => handleContentTap(),
      onTurn: (direction) => animateTurn(direction),
    };

    (async () => {
      try {
        let engine: ReaderEngine;
        const progress = await getProgress(id);
        const initial = progress?.locator;
        if (book.format === 'epub' && blobRef.current) {
          engine = new EpubEngine(blobRef.current, book.chapters, prefs, callbacks);
        } else if (book.format === 'pdf' && blobRef.current) {
          engine = new PdfEngine(blobRef.current, prefs, callbacks);
        } else if (content) {
          engine = new ReflowEngine(content.chapters, prefs, callbacks, book.title);
        } else {
          throw new Error('无法打开这本书');
        }
        if (disposed) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        await engine.mount(container, initial);
        engine.applyPrefs(prefs);
        // apply existing highlights
        const currentNotes = await listNotes(id);
        currentNotes.forEach((note) => engine.addNote(note));
      } catch (err) {
        console.error(err);
        if (!disposed) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    })();

    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, content]);

  // typography changes
  useEffect(() => {
    engineRef.current?.applyPrefs(prefs);
  }, [prefs]);

  // volume keys: down = next page, up = previous page
  useEffect(() => {
    if (!hasVolumeKeySupport()) return;
    window.__moduVolumeKey = (direction) => {
      if (direction === 'down') engineRef.current?.nextPage();
      else engineRef.current?.prevPage();
    };
    void setVolumeKeysEnabled(prefs.volumeKeys);
    return () => {
      delete window.__moduVolumeKey;
      void setVolumeKeysEnabled(false);
    };
  }, [prefs.volumeKeys]);

  // save on exit / background
  useEffect(() => {
    const flush = () => {
      if (locationRef.current) persistProgress(locationRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
      flush();
    };
  }, [persistProgress]);

  // deep link: ?note= / ?bookmark=
  useEffect(() => {
    if (status !== 'ready') return;
    const noteId = params.get('note');
    const bookmarkId = params.get('bookmark');
    if (!noteId && !bookmarkId) return;
    (async () => {
      if (noteId) {
        const note = notes.find((n) => n.id === noteId);
        if (note) {
          await engineRef.current?.goTo(note.locator);
          setActiveNote(note);
        }
      } else if (bookmarkId) {
        const list = await listBookmarks(id);
        const bookmark = list.find((b) => b.id === bookmarkId);
        if (bookmark) await engineRef.current?.goTo(bookmark.locator);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    showChrome();
    return () => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
    };
  }, [showChrome]);

  const currentChapter = location?.chapterTitle || book?.chapters[0]?.title || '';

  function seek(percent: number) {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.seekPercent) {
      engine.seekPercent(percent);
      return;
    }
    if (!book) return;
    if (book.format === 'pdf') {
      const page = Math.max(1, Math.round(percent * (book.chapters.length || 1)));
      void engine.goTo({ type: 'pdf', page });
    } else {
      const index = Math.min(
        (content?.chapters.length ?? book.chapters.length) - 1,
        Math.max(0, Math.floor(percent * (content?.chapters.length ?? book.chapters.length))),
      );
      void engine.goTo({ type: 'reflow', chapterIndex: index, offset: 0, ratio: 0 });
    }
  }

  async function commitHighlight(sel: SelectionInfo, color: HighlightColor) {
    const note = await addNote({
      bookId: id,
      locator: sel.locator,
      chapterIndex: sel.chapterIndex,
      chapterTitle: sel.chapterTitle,
      text: sel.text,
      note: '',
      color,
      rects: sel.rects,
    });
    engineRef.current?.addNote(note);
    engineRef.current?.clearSelection();
    setSelection(null);
    flash('已高亮');
  }

  async function saveDraftNote(text: string, color: HighlightColor) {
    if (!noteDraft) return;
    const note = await addNote({
      bookId: id,
      locator: noteDraft.locator,
      chapterIndex: noteDraft.chapterIndex,
      chapterTitle: noteDraft.chapterTitle,
      text: noteDraft.text,
      note: text.trim(),
      color,
      rects: noteDraft.rects,
    });
    engineRef.current?.addNote(note);
    engineRef.current?.clearSelection();
    setSelection(null);
    setNoteDraft(null);
    flash('笔记已保存');
  }

  async function runAI(sel: SelectionInfo) {
    setSelection(null);
    engineRef.current?.clearSelection();
    setAiState({ status: 'loading', text: '', sources: [] });
    try {
      const context = await engineRef.current!.getContext(sel.locator, ai.contextChars, sel.text);
      const annotation = await annotatePassage(
        {
          bookTitle: book?.title ?? '',
          author: book?.author,
          chapterTitle: context.chapterTitle || sel.chapterTitle,
          selected: sel.text,
          before: context.before,
          after: context.after,
        },
        ai,
      );
      const note = await addNote({
        bookId: id,
        locator: sel.locator,
        chapterIndex: sel.chapterIndex,
        chapterTitle: sel.chapterTitle,
        text: sel.text,
        note: '',
        color: 'blue',
        rects: sel.rects,
        ai: annotation,
      });
      engineRef.current?.addNote(note);
      setAiSource({
        selected: sel.text,
        before: context.before,
        after: context.after,
        chapterTitle: context.chapterTitle || sel.chapterTitle,
        annotation,
      });
      setAiChat([]);
      setAiQuestion('');
      setAiAskError('');
      setAiState({
        status: 'done',
        text: annotation.answer,
        sources: annotation.sources.map((s) => ({ title: s.title, url: s.url })),
        noteId: note.id,
      });
    } catch (err) {
      setAiState({
        status: 'error',
        text: '',
        sources: [],
        error: (err as Error).message,
      });
    }
  }

  async function askFollowUp() {
    const question = aiQuestion.trim();
    if (!question || !aiSource || !book || aiAsking) return;
    setAiAsking(true);
    setAiAskError('');
    try {
      const answer = await askAnnotation(
        {
          bookTitle: book.title,
          author: book.author,
          chapterTitle: aiSource.chapterTitle,
          selected: aiSource.selected,
          before: aiSource.before,
          after: aiSource.after,
          annotation: aiSource.annotation.answer,
          history: aiChat.map((item) => ({ question: item.question, answer: item.answer })),
          question,
        },
        ai,
      );
      const qa: AnnotationQA = { question, answer, createdAt: Date.now() };
      const next = [...aiChat, qa];
      const annotation = { ...aiSource.annotation, qa: next };
      setAiChat(next);
      setAiSource({ ...aiSource, annotation });
      setAiQuestion('');
      if (aiState.noteId) await updateNote(aiState.noteId, { ai: annotation });
    } catch (err) {
      setAiAskError((err as Error).message);
    } finally {
      setAiAsking(false);
    }
  }

  function closeAI() {
    setAiState({ status: 'idle', text: '', sources: [] });
    setAiSource(null);
    setAiChat([]);
    setAiQuestion('');
    setAiAskError('');
  }

  async function shareSelection(sel: SelectionInfo) {
    try {
      if (navigator.share) {
        await navigator.share({ text: sel.text });
        return;
      }
    } catch {
      /* fall through to copy */
    }
    await navigator.clipboard?.writeText(sel.text);
    flash('已复制，可粘贴分享');
  }

  function searchSelection(sel: SelectionInfo) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(sel.text)}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.click();
  }

  async function toggleBookmark() {
    const loc = locationRef.current;
    if (!loc) return;
    const existing = null;
    void existing;
    const bookmark = await addBookmark({
      bookId: id,
      locator: loc.locator,
      chapterIndex: loc.chapterIndex,
      chapterTitle: loc.chapterTitle,
      excerpt: loc.chapterTitle || `阅读到 ${percentLabel(loc.percent)}`,
    });
    void bookmark;
    await refreshBookmarks();
    flash('已添加书签');
  }

  async function updateActiveNote(patch: Partial<Note>) {
    if (!activeNote) return;
    await updateNote(activeNote.id, patch);
    engineRef.current?.removeNote(activeNote.id);
    const updated = { ...activeNote, ...patch, updatedAt: Date.now() };
    engineRef.current?.addNote(updated);
    setActiveNote(updated);
  }

  async function removeActiveNote() {
    if (!activeNote) return;
    await deleteNote(activeNote.id);
    engineRef.current?.removeNote(activeNote.id);
    setActiveNote(null);
    flash('已删除笔记');
  }

  const aiBusy = aiState.status === 'loading';

  return (
    <div
      className="reader-page"
      data-theme={prefs.themeId}
      style={
        {
          background: theme.bg,
          color: theme.fg,
          '--reader-bg': theme.bg,
          '--reader-fg': theme.fg,
          '--reader-muted': theme.muted,
          '--reader-ui': theme.ui,
          '--reader-border': theme.border,
          '--reader-font': FONT_STACKS[prefs.fontFamily],
          '--reader-font-size': `${prefs.fontSize}px`,
          '--reader-line-height': String(prefs.lineHeight),
          '--reader-para-gap': `${prefs.paragraphSpacing}em`,
          '--reader-margin': `${prefs.margin}px`,
        } as CSSProperties
      }
    >
      <div className="reader-status-scrim" aria-hidden="true" />
      <div
        className="reader-stage"
        ref={containerRef}
        onClick={() => {
          if (selection || aiBusy) return;
          handleContentTap();
        }}
      />

      {status === 'loading' ? (
        <div className="reader-loading" style={{ color: theme.muted }}>
          <Loader2 size={22} className="spin" />
          <span>正在打开《{book?.title ?? '图书'}》…</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="reader-error">
          <h3>打不开这本书</h3>
          <p>{error}</p>
          <button className="primary-button" onClick={() => navigate(-1)}>
            返回书架
          </button>
        </div>
      ) : null}

      <header className={`reader-top ${chromeVisible ? 'is-visible' : ''}`}>
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={22} />
        </button>
        <div className="reader-top__title">
          <strong>{book?.title}</strong>
          <span>{currentChapter}</span>
        </div>
        <button className="icon-button" onClick={() => setSheet('marks')} aria-label="书签与笔记">
          <MoreHorizontal size={22} />
        </button>
      </header>

      <div className={`reader-bottom ${chromeVisible ? 'is-visible' : ''}`}>
        <div className="reader-progress-meta">
          <span>
            {location?.page
              ? `${location.page.approximate ? '约 ' : ''}${location.page.current} / ${location.page.total} 页`
              : '页数统计中…'}
          </span>
          <span>{percentLabel(sliderValue / 1000)}</span>
        </div>
        <div className="reader-progress">
          <input
            type="range"
            min={0}
            max={1000}
            value={sliderValue}
            onChange={(event) => setSliderValue(Number(event.target.value))}
            onPointerUp={() => seek(sliderValue / 1000)}
            onKeyUp={() => seek(sliderValue / 1000)}
          />
        </div>
        <div className="reader-actions">
          <button className="reader-action" onClick={() => setSheet('toc')}>
            <List size={19} />
            <span>目录</span>
          </button>
          <button className="reader-action" onClick={() => void toggleBookmark()}>
            <BookmarkIcon size={19} />
            <span>书签</span>
          </button>
          <button className="reader-action" onClick={() => setSheet('marks')}>
            <Highlighter size={19} />
            <span>笔记</span>
          </button>
        </div>
        <div className="reader-pager">
          <button onClick={() => engineRef.current?.prevPage()}>
            <ChevronLeft size={18} /> 上一页
          </button>
          <button onClick={() => engineRef.current?.nextPage()}>
            下一页 <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {selection ? (
        <SelectionToolbar
          selection={selection}
          onHighlight={(color) => void commitHighlight(selection, color)}
          onNote={() => {
            setNoteDraft(selection);
            setSelection(null);
          }}
          onAI={() => void runAI(selection)}
          onShare={() => void shareSelection(selection)}
          onSelectAll={() => {
            engineRef.current?.selectAll?.();
            flash('已全选当前页');
          }}
          onSearch={() => searchSelection(selection)}
          placement={
            selection.screenRect.top <= 1 || selection.screenRect.top > window.innerHeight * 0.5
              ? 'top'
              : 'bottom'
          }
          onCopy={() => {
            void navigator.clipboard?.writeText(selection.text);
            flash('已复制');
            engineRef.current?.clearSelection();
            setSelection(null);
          }}
          onClose={() => {
            engineRef.current?.clearSelection();
            setSelection(null);
          }}
        />
      ) : null}

      {toast ? <div className="toast toast--reader">{toast}</div> : null}

      <Sheet open={sheet === 'toc'} onClose={() => setSheet(null)} title="目录" tall>
        <ul className="toc-list">
          {(content?.chapters ?? book?.chapters ?? []).map((chapter, index) => {
            const active = location?.chapterIndex === index;
            const href = 'href' in chapter ? chapter.href : undefined;
            return (
              <li key={`${chapter.title}-${index}`}>
                <button
                  className={active ? 'is-active' : ''}
                  onClick={() => {
                    setSheet(null);
                    const engine = engineRef.current;
                    if (!engine || !book) return;
                    if (book.format === 'pdf') {
                      void engine.goTo({ type: 'pdf', page: Number(href || index + 1) });
                    } else if (book.format === 'epub') {
                      void engine.goTo({
                        type: 'epub',
                        cfi: '',
                        href,
                        chapterIndex: index,
                      });
                    } else {
                      void engine.goTo({
                        type: 'reflow',
                        chapterIndex: index,
                        offset: 0,
                        ratio: 0,
                      });
                    }
                  }}
                >
                  <span className="toc-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="toc-title">{chapter.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'marks'} onClose={() => setSheet(null)} title="书签与笔记" tall>
        <div className="marks-section">
          <div className="section-label">书签 · {bookmarks.length}</div>
          {bookmarks.length === 0 ? (
            <p className="muted-text">还没有书签，点底部「书签」添加当前位置。</p>
          ) : (
            <ul className="mark-list">
              {bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <button
                    className="mark-list__main"
                    onClick={() => {
                      setSheet(null);
                      void engineRef.current?.goTo(bookmark.locator);
                    }}
                  >
                    <span>{bookmark.chapterTitle || '书签'}</span>
                    <small>{new Date(bookmark.createdAt).toLocaleDateString()}</small>
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    onClick={async () => {
                      await deleteBookmark(bookmark.id);
                      await refreshBookmarks();
                    }}
                    aria-label="删除书签"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="marks-section">
          <div className="section-label">笔记 · {notes.length}</div>
          {notes.length === 0 ? (
            <p className="muted-text">选中文字后可以高亮、写笔记或请 AI 注释。</p>
          ) : (
            <ul className="mark-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    className="mark-list__main mark-list__main--note"
                    onClick={() => {
                      setSheet(null);
                      void engineRef.current?.goTo(note.locator);
                      setActiveNote(note);
                    }}
                  >
                    <span className={`hl-dot hl-dot--${note.color}`} />
                    <span className="mark-quote">{note.text.slice(0, 60)}</span>
                    {note.ai ? <Sparkles size={13} className="ai-badge" /> : null}
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    onClick={async () => {
                      await deleteNote(note.id);
                      engineRef.current?.removeNote(note.id);
                    }}
                    aria-label="删除笔记"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      <Sheet open={!!noteDraft} onClose={() => setNoteDraft(null)} title="写笔记">
        {noteDraft ? (
          <NoteDraftForm
            quote={noteDraft.text}
            onCancel={() => setNoteDraft(null)}
            onSave={saveDraftNote}
          />
        ) : null}
      </Sheet>

      <Sheet open={!!activeNote} onClose={() => setActiveNote(null)} title="笔记详情">
        {activeNote ? (
          <ActiveNotePanel
            note={activeNote}
            onSave={updateActiveNote}
            onDelete={removeActiveNote}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={aiState.status !== 'idle'}
        onClose={closeAI}
        title="AI 注释"
        tall
      >
        <div className="ai-sheet">
          {aiState.status === 'loading' ? (
            <div className="ai-loading">
              <Loader2 size={22} className="spin" />
              <p>正在结合上下文{ai.searchProvider === 'none' ? '' : '与联网资料'}生成注释…</p>
            </div>
          ) : null}
          {aiState.status === 'error' ? (
            <div className="ai-error">
              <p>{aiState.error}</p>
              <button className="ghost-button" onClick={() => navigate('/settings')}>
                去设置 API Key
              </button>
            </div>
          ) : null}
          {aiState.status === 'done' ? (
            <>
              <div className="ai-answer">{aiState.text}</div>
              {aiState.sources.length > 0 ? (
                <div className="ai-sources">
                  <div className="section-label">参考来源</div>
                  {aiState.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  ))}
                </div>
              ) : null}
              <p className="hint-text">注释已自动保存到笔记，可在下面继续追问这段文字。</p>
              <div className="ai-chat">
                {aiChat.map((item, index) => (
                  <div className="ai-chat__item" key={`${item.createdAt}-${index}`}>
                    <p className="ai-chat__question">问：{item.question}</p>
                    <p className="ai-chat__answer">答：{item.answer}</p>
                  </div>
                ))}
                <form
                  className="ai-chat__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void askFollowUp();
                  }}
                >
                  <input
                    value={aiQuestion}
                    placeholder="继续追问这段文字，例如：这里的隐喻是什么？"
                    onChange={(event) => setAiQuestion(event.target.value)}
                    disabled={aiAsking}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!aiQuestion.trim() || aiAsking}
                  >
                    {aiAsking ? '思考中' : '提问'}
                  </button>
                </form>
                {aiAskError ? <p className="ai-chat__error">{aiAskError}</p> : null}
              </div>
            </>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

function SelectionToolbar({
  selection,
  onHighlight,
  onNote,
  onAI,
  onCopy,
  onShare,
  onSelectAll,
  onSearch,
  placement,
  onClose,
}: {
  selection: SelectionInfo;
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onAI: () => void;
  onCopy: () => void;
  onShare: () => void;
  onSelectAll: () => void;
  onSearch: () => void;
  placement: 'top' | 'bottom';
  onClose: () => void;
}) {
  return (
    <div
      className={`selection-toolbar ${
        placement === 'top' ? 'selection-toolbar--top' : ''
      }`}
      role="toolbar"
    >
      <div className="selection-toolbar__quote">“{selection.text.slice(0, 42)}{selection.text.length > 42 ? '…' : ''}”</div>
      <div className="selection-toolbar__row">
        <div className="color-dots">
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
            <button
              key={color}
              className="color-dot"
              style={{ background: HIGHLIGHT_COLORS[color] }}
              onClick={() => onHighlight(color)}
              aria-label={`${color} 高亮`}
            />
          ))}
        </div>
        <button className="tool-button" onClick={onNote}>
          笔记
        </button>
        <button className="tool-button tool-button--ai" onClick={onAI}>
          <Sparkles size={15} /> AI
        </button>
        <button className="icon-button" onClick={onClose} aria-label="取消">
          <X size={17} />
        </button>
      </div>
      <div className="selection-toolbar__actions">
        <button onClick={onCopy}>复制</button>
        <button onClick={onShare}>分享</button>
        <button onClick={onSelectAll}>全选</button>
        <button onClick={onSearch}>网页搜索</button>
      </div>
    </div>
  );
}

function NoteDraftForm({
  quote,
  onCancel,
  onSave,
}: {
  quote: string;
  onCancel: () => void;
  onSave: (text: string, color: HighlightColor) => void;
}) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<HighlightColor>('yellow');
  return (
    <div className="note-form">
      <blockquote>{quote}</blockquote>
      <textarea
        autoFocus
        value={text}
        rows={5}
        placeholder="写下你的想法…"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="note-form__colors">
        {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((key) => (
          <button
            key={key}
            className={`color-dot ${color === key ? 'is-active' : ''}`}
            style={{ background: HIGHLIGHT_COLORS[key] }}
            onClick={() => setColor(key)}
          />
        ))}
        <span className="muted-text">高亮颜色</span>
      </div>
      <div className="sheet-actions sheet-actions--row">
        <button className="ghost-button" onClick={onCancel}>
          取消
        </button>
        <button className="primary-button" onClick={() => onSave(text, color)}>
          保存
        </button>
      </div>
    </div>
  );
}

function ActiveNotePanel({
  note,
  onSave,
  onDelete,
}: {
  note: Note;
  onSave: (patch: Partial<Note>) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(note.note);
  return (
    <div className="note-detail">
      <blockquote>{note.text}</blockquote>
      <p className="note-detail__chapter">{note.chapterTitle}</p>
      {note.ai ? (
        <div className="note-detail__ai">
          <div className="section-label">
            <Sparkles size={14} /> AI 注释
          </div>
          <p>{note.ai.answer}</p>
          {note.ai.sources.length > 0 ? (
            <div className="ai-sources">
              {note.ai.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.title || source.url}
                </a>
              ))}
            </div>
          ) : null}
          {note.ai.qa && note.ai.qa.length > 0 ? (
            <div className="ai-chat ai-chat--readonly">
              {note.ai.qa.map((item, index) => (
                <div className="ai-chat__item" key={`${item.createdAt}-${index}`}>
                  <p className="ai-chat__question">问：{item.question}</p>
                  <p className="ai-chat__answer">答：{item.answer}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <textarea
        value={text}
        rows={4}
        placeholder="补充你的笔记…"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="note-form__colors">
        {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((key) => (
          <button
            key={key}
            className={`color-dot ${note.color === key ? 'is-active' : ''}`}
            style={{ background: HIGHLIGHT_COLORS[key] }}
            onClick={() => onSave({ color: key })}
          />
        ))}
      </div>
      <div className="sheet-actions sheet-actions--row">
        <button className="ghost-button ghost-button--danger" onClick={onDelete}>
          <Trash2 size={16} /> 删除
        </button>
        <button className="primary-button" onClick={() => onSave({ note: text })}>
          保存笔记
        </button>
      </div>
    </div>
  );
}
