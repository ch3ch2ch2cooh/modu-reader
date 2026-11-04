import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Bookmark as BookmarkIcon, Highlighter, Sparkles } from 'lucide-react';
import { listAllBookmarks, listAllNotes, listBooks } from '../db/repo';
import { formatRelative } from '../lib/utils';

export default function NotesPage() {
  const navigate = useNavigate();
  const notes = useLiveQuery(() => listAllNotes(), [], []) ?? [];
  const bookmarks = useLiveQuery(() => listAllBookmarks(), [], []) ?? [];
  const books = useLiveQuery(() => listBooks(), [], []) ?? [];
  const [tab, setTab] = useState<'notes' | 'bookmarks'>('notes');

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  return (
    <div className="page notes-page">
      <header className="shelf-header">
        <div>
          <h1>笔记</h1>
          <p className="shelf-sub">
            {notes.length} 条划线与笔记 · {bookmarks.length} 个书签
          </p>
        </div>
      </header>

      <div className="segmented segmented--wide">
        <button className={tab === 'notes' ? 'is-active' : ''} onClick={() => setTab('notes')}>
          <Highlighter size={15} /> 笔记
        </button>
        <button
          className={tab === 'bookmarks' ? 'is-active' : ''}
          onClick={() => setTab('bookmarks')}
        >
          <BookmarkIcon size={15} /> 书签
        </button>
      </div>

      {tab === 'notes' ? (
        notes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Highlighter size={28} />
            </div>
            <h3>还没有笔记</h3>
            <p>阅读时长按选中文字，可以高亮、写笔记，或请 AI 注释。</p>
          </div>
        ) : (
          <div className="note-list">
            {notes.map((note) => {
              const book = bookMap.get(note.bookId);
              return (
                <button
                  className="note-card"
                  key={note.id}
                  onClick={() => navigate(`/read/${note.bookId}?note=${note.id}`)}
                >
                  <div className="note-card__head">
                    <span className={`hl-dot hl-dot--${note.color}`} />
                    <span className="note-card__book">{book?.title ?? '未知书籍'}</span>
                    <span className="note-card__time">{formatRelative(note.createdAt)}</span>
                  </div>
                  <p className="note-card__quote">{note.text}</p>
                  {note.note ? <p className="note-card__body">{note.note}</p> : null}
                  {note.ai ? (
                    <p className="note-card__ai">
                      <Sparkles size={13} /> {note.ai.answer.slice(0, 110)}
                      {note.ai.answer.length > 110 ? '…' : ''}
                    </p>
                  ) : null}
                  <span className="note-card__chapter">
                    {note.chapterTitle || `第 ${note.chapterIndex + 1} 章`}
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : bookmarks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <BookmarkIcon size={28} />
          </div>
          <h3>还没有书签</h3>
          <p>阅读时点底部的书签按钮，就能把当前位置存下来。</p>
        </div>
      ) : (
        <div className="note-list">
          {bookmarks.map((bookmark) => {
            const book = bookMap.get(bookmark.bookId);
            return (
              <button
                className="note-card"
                key={bookmark.id}
                onClick={() =>
                  navigate(`/read/${bookmark.bookId}?bookmark=${bookmark.id}`)
                }
              >
                <div className="note-card__head">
                  <BookmarkIcon size={15} className="bookmark-icon" />
                  <span className="note-card__book">{book?.title ?? '未知书籍'}</span>
                  <span className="note-card__time">{formatRelative(bookmark.createdAt)}</span>
                </div>
                <p className="note-card__quote">{bookmark.excerpt || '（无摘录）'}</p>
                <span className="note-card__chapter">
                  {bookmark.chapterTitle || `第 ${bookmark.chapterIndex + 1} 章`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {books.length === 0 ? (
        <div className="empty-hint">
          <BookOpen size={16} /> 先到书架导入一本图书吧
        </div>
      ) : null}
    </div>
  );
}
