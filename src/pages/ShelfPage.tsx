import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Check,
  FolderInput,
  FolderPlus,
  Layers,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { BookRecord, Category } from '../types';
import {
  createCategory,
  deleteBook,
  deleteCategory,
  getBookContent,
  listBooks,
  listCategories,
  listProgress,
  renameCategory,
  setBookCategories,
  toggleBookCategory,
} from '../db/repo';
import { importBookFile } from '../parsers';
import { formatBytes, formatRelative, percentLabel } from '../lib/utils';
import { htmlToPlainText } from '../lib/text';
import { canPickFolder, pickBookFolder, readBookFileAsFile } from '../lib/folderImport';
import { BookCover } from '../components/BookCover';
import { Sheet } from '../components/Sheet';
import { CATEGORY_COLORS, classifyBook } from '../ai/classify';
import { useSettings } from '../store/settings';

type Filter = 'all' | 'none' | string;

type ImportStatus = 'pending' | 'parsing' | 'classifying' | 'done' | 'duplicate' | 'error' | 'cancelled';

interface ImportTask {
  key: string;
  name: string;
  status: ImportStatus;
  category?: string;
  message?: string;
}

interface ImportSource {
  name: string;
  size: number;
  getFile: () => Promise<File>;
}

const MAX_FOLDER_FILE = 80 * 1024 * 1024;

const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  pending: '等待',
  parsing: '解析中',
  classifying: 'AI 归类',
  done: '已导入',
  duplicate: '已在书架',
  error: '失败',
  cancelled: '已停止',
};

export default function ShelfPage() {
  const navigate = useNavigate();
  const books = useLiveQuery(() => listBooks(), [], []) ?? [];
  const categories = useLiveQuery(() => listCategories(), [], []) ?? [];
  const progressRows = useLiveQuery(() => listProgress(), [], []) ?? [];

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [importTasks, setImportTasks] = useState<ImportTask[]>([]);
  const [batch, setBatch] = useState<{ total: number; done: number; current: string } | null>(null);
  const [folderPlan, setFolderPlan] = useState<{
    folder: string;
    sources: ImportSource[];
    skipped: number;
    bytes: number;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [actionBook, setActionBook] = useState<BookRecord | null>(null);
  const [categorySheet, setCategorySheet] = useState(false);
  const [manageSheet, setManageSheet] = useState(false);
  const ai = useSettings((s) => s.ai);
  const fileRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBatch = useRef(false);
  const cancelImport = useRef(false);
  const importActive = importTasks.some(
    (task) => task.status === 'parsing' || task.status === 'classifying',
  );

  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    progressRows.forEach((row) => map.set(row.bookId, row.percent));
    return map;
  }, [progressRows]);

  const latestProgress = progressRows.find((p) => books.some((b) => b.id === p.bookId));
  const continueBook = latestProgress
    ? books.find((b) => b.id === latestProgress.bookId)
    : books[0];

  const visibleBooks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return books
      .filter((book) => {
        if (filter === 'none') return book.categoryIds.length === 0;
        if (filter !== 'all') return book.categoryIds.includes(filter);
        return true;
      })
      .filter((book) => {
        if (!keyword) return true;
        return (
          book.title.toLowerCase().includes(keyword) ||
          book.author.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt));
  }, [books, filter, query]);

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2600);
  }

  function updateTask(key: string, patch: Partial<ImportTask>) {
    setImportTasks((prev) => prev.map((task) => (task.key === key ? { ...task, ...patch } : task)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setManageSheet(false);
    const sources: ImportSource[] = Array.from(files).map((file) => ({
      name: file.name,
      size: file.size,
      getFile: async () => file,
    }));
    await runImport(sources);
  }

  async function pickFolder() {
    setManageSheet(false);
    try {
      const picked = await pickBookFolder();
      const usable = picked.files.filter((file) => file.size <= MAX_FOLDER_FILE);
      const skipped = picked.files.length - usable.length;
      if (usable.length === 0) {
        flash(
          skipped > 0 ? '文件夹里的电子书都超过 80MB' : '文件夹里没有支持的电子书',
        );
        return;
      }
      setFolderPlan({
        folder: picked.folder,
        skipped,
        bytes: usable.reduce((sum, file) => sum + file.size, 0),
        sources: usable.map((file) => ({
          name: file.name,
          size: file.size,
          getFile: () => readBookFileAsFile(file.uri, file.name),
        })),
      });
    } catch (error) {
      flash(`选择文件夹失败：${(error as Error).message.slice(0, 60)}`);
    }
  }

  async function runImport(sources: ImportSource[]) {
    if (sources.length === 0) return;
    cancelImport.current = false;
    const tasks: ImportTask[] = sources.map((source, index) => ({
      key: `${Date.now()}-${index}-${source.name}`,
      name: source.name,
      status: 'pending',
    }));
    setImportTasks(tasks);

    let okCount = 0;
    let classifiedCount = 0;

    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      const task = tasks[i];
      if (cancelImport.current) {
        for (let j = i; j < sources.length; j += 1) {
          updateTask(tasks[j].key, { status: 'cancelled' });
        }
        break;
      }
      updateTask(task.key, { status: 'parsing' });
      try {
        const file = await source.getFile();
        const result = await importBookFile(file);
        if (result.duplicate) {
          updateTask(task.key, { status: 'duplicate' });
          continue;
        }
        okCount += 1;
        if (ai.autoClassify) {
          updateTask(task.key, { status: 'classifying' });
          try {
            const category = await autoCategorize(result.book);
            if (category) {
              classifiedCount += 1;
              updateTask(task.key, { status: 'done', category });
            } else {
              updateTask(task.key, { status: 'done' });
            }
          } catch (error) {
            console.warn('auto classify failed', error);
            updateTask(task.key, { status: 'done' });
          }
        } else {
          updateTask(task.key, { status: 'done' });
        }
      } catch (error) {
        console.error(error);
        updateTask(task.key, {
          status: 'error',
          message: (error as Error).message.slice(0, 80),
        });
      }
    }

    cancelImport.current = false;
    if (fileRef.current) fileRef.current.value = '';
    flash(
      classifiedCount > 0
        ? `已导入 ${okCount} 本 · AI 归类 ${classifiedCount} 本`
        : `已导入 ${okCount} 本书`,
    );

    // Keep the queue visible when something failed, otherwise fade it out.
    window.setTimeout(() => {
      setImportTasks((prev) =>
        prev.some(
          (task) =>
            task.status === 'error' || task.status === 'duplicate' || task.status === 'cancelled',
        )
          ? prev
          : [],
      );
    }, 2600);
  }

  async function runBatchClassify(scope: 'uncategorized' | 'all') {
    setManageSheet(false);
    const targets = scope === 'uncategorized' ? books.filter((b) => b.categoryIds.length === 0) : books;
    if (targets.length === 0) {
      flash(scope === 'uncategorized' ? '没有未分类的书' : '书架还是空的');
      return;
    }

    cancelBatch.current = false;
    setBatch({ total: targets.length, done: 0, current: targets[0].title });
    let okCount = 0;

    for (let i = 0; i < targets.length; i += 1) {
      if (cancelBatch.current) break;
      setBatch({ total: targets.length, done: i, current: targets[i].title });
      try {
        const category = await autoCategorize(targets[i]);
        if (category) okCount += 1;
      } catch (error) {
        console.warn('batch classify failed', targets[i].title, error);
      }
      setBatch({ total: targets.length, done: i + 1, current: targets[i].title });
    }

    const cancelled = cancelBatch.current;
    setBatch(null);
    flash(cancelled ? `已停止，本次归类 ${okCount} 本` : `已归类 ${okCount} 本`);
  }

  async function ensureCategory(name: string): Promise<Category> {
    const existing = (await listCategories()).find((category) => category.name === name);
    if (existing) return existing;
    return createCategory(name, CATEGORY_COLORS[name] ?? '#9a5b34');
  }

  async function autoCategorize(book: BookRecord): Promise<string | null> {
    let sampleText = '';
    if (book.format !== 'epub' && book.format !== 'pdf') {
      const content = await getBookContent(book.id);
      sampleText = (content?.chapters ?? [])
        .slice(0, 2)
        .map((chapter) => htmlToPlainText(chapter.html))
        .join('\n')
        .slice(0, 900);
    }
    const result = await classifyBook(
      {
        title: book.title,
        author: book.author,
        format: book.format,
        chapters: book.chapters.slice(0, 15).map((chapter) => chapter.title),
        sampleText,
      },
      ai,
    );
    const category = await ensureCategory(result.category);
    await setBookCategories(book.id, [category.id]);
    return result.category;
  }

  function startLongPress(book: BookRecord) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => setActionBook(book), 480);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const activeCategory = categories.find((c) => c.id === filter);

  return (
    <div className="page shelf-page">
      <header className="shelf-header">
        <div>
          <h1>书架</h1>
          <p className="shelf-sub">
            {books.length} 本藏书
            {latestProgress?.chapterTitle ? ` · 上次读到「${latestProgress.chapterTitle}」` : ''}
          </p>
        </div>
        <div className="shelf-header__actions">
          <button
            className={`icon-button ${searching ? 'is-active' : ''}`}
            onClick={() => {
              setSearching((v) => !v);
              setQuery('');
            }}
            aria-label="搜索"
          >
            {searching ? <X size={20} /> : <Search size={20} />}
          </button>
          <button className="icon-button" onClick={() => setCategorySheet(true)} aria-label="分类管理">
            <FolderPlus size={20} />
          </button>
          <button
            className="icon-button"
            onClick={() => setManageSheet(true)}
            aria-label="批量管理"
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {searching ? (
        <div className="search-bar">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书名或作者"
          />
        </div>
      ) : null}

      {continueBook && filter === 'all' && !query ? (
        <button
          className="continue-card"
          onClick={() => navigate(`/read/${continueBook.id}`)}
        >
          <BookCover
            book={continueBook}
            className="continue-card__cover"
            progress={progressMap.get(continueBook.id) ?? 0}
          />
          <div className="continue-card__info">
            <span className="eyebrow">
              {latestProgress ? '继续阅读' : '开始阅读'} ·{' '}
              {formatRelative(latestProgress?.updatedAt ?? continueBook.createdAt)}
            </span>
            <h2>{continueBook.title}</h2>
            <p>
              {latestProgress?.chapterTitle || continueBook.author || '尚未开始'}
              {latestProgress ? ` · 已读 ${percentLabel(latestProgress.percent)}` : ''}
            </p>
            <span className="continue-card__cta">
              <BookOpen size={15} /> {latestProgress ? '接着读' : '翻开'}
            </span>
          </div>
        </button>
      ) : null}

      <div className="chip-row">
        <button
          className={`chip ${filter === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
        <button
          className={`chip ${filter === 'none' ? 'is-active' : ''}`}
          onClick={() => setFilter('none')}
        >
          未分类
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`chip ${filter === category.id ? 'is-active' : ''}`}
            onClick={() => setFilter(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {activeCategory ? (
        <p className="category-hint">
          {visibleBooks.length} 本 · {activeCategory.name}
        </p>
      ) : null}

      {visibleBooks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <BookOpen size={30} />
          </div>
          <h3>{books.length === 0 ? '书架还是空的' : '这里还没有书'}</h3>
          <p>
            {books.length === 0
              ? '支持 EPUB、PDF、TXT、MOBI、AZW3，导入后会自动识别封面和章节。'
              : '换一个分类或关键词试试。'}
          </p>
          {books.length === 0 ? (
            <button className="primary-button" onClick={() => fileRef.current?.click()}>
              <Plus size={18} /> 导入图书
            </button>
          ) : null}
        </div>
      ) : (
        <div className="book-grid">
          {visibleBooks.map((book) => (
            <div key={book.id} className="book-cell">
              <button
                className="book-cell__button"
                onClick={() => navigate(`/read/${book.id}`)}
                onPointerDown={() => startLongPress(book)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActionBook(book);
                }}
              >
                <BookCover book={book} progress={progressMap.get(book.id) ?? 0} />
                <span className="book-cell__title">{book.title}</span>
                <span className="book-cell__meta">
                  {book.status === 'finished'
                    ? '已读完'
                    : progressMap.get(book.id)
                      ? `${percentLabel(progressMap.get(book.id)!)} · ${book.author || '未知作者'}`
                      : book.author || '未知作者'}
                </span>
              </button>
              <button
                className="book-cell__more"
                onClick={() => setActionBook(book)}
                aria-label="更多操作"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="fab" onClick={() => fileRef.current?.click()} aria-label="导入图书">
        <Plus size={24} />
      </button>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".epub,.pdf,.txt,.mobi,.azw,.azw3,application/epub+zip,application/pdf,text/plain,application/octet-stream"
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {importTasks.length > 0 ? (
        <div className="import-overlay">
          <div className="import-card import-card--queue">
            <div className="queue-head">
              <strong>{importActive ? '正在批量导入' : '导入结果'}</strong>
              {!importActive ? (
                <button className="icon-button" onClick={() => setImportTasks([])} aria-label="关闭">
                  <X size={18} />
                </button>
              ) : null}
            </div>
            <ul className="import-queue">
              {importTasks.map((task) => (
                <li key={task.key} className={`task-${task.status}`}>
                  <span className="task-dot" />
                  <span className="task-name">{task.name}</span>
                  <span className="task-state">
                    {task.category ? `→ ${task.category}` : IMPORT_STATUS_LABEL[task.status]}
                  </span>
                </li>
              ))}
            </ul>
            {importActive ? <p className="queue-hint">大文件或 AZW3 可能需要几秒钟</p> : null}
            {importActive ? (
              <button
                className="ghost-button"
                onClick={() => {
                  cancelImport.current = true;
                }}
              >
                停止导入
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {batch ? (
        <div className="import-overlay">
          <div className="import-card">
            <div className="spinner" />
            <strong>
              AI 正在分类 {batch.done}/{batch.total}
            </strong>
            <p>{batch.current}</p>
            <div className="progress-track">
              <span style={{ width: `${Math.round((batch.done / Math.max(1, batch.total)) * 100)}%` }} />
            </div>
            <button
              className="ghost-button"
              onClick={() => {
                cancelBatch.current = true;
              }}
            >
              停止
            </button>
          </div>
        </div>
      ) : null}

      <Sheet
        open={!!folderPlan}
        onClose={() => setFolderPlan(null)}
        title={folderPlan ? `文件夹：${folderPlan.folder}` : '从文件夹导入'}
      >
        {folderPlan ? (
          <div className="folder-plan">
            <p>
              找到 <strong>{folderPlan.sources.length}</strong> 本可导入，共{' '}
              {formatBytes(folderPlan.bytes)}。
            </p>
            {folderPlan.skipped > 0 ? (
              <p className="hint-text">另有 {folderPlan.skipped} 本超过 80MB，已跳过。</p>
            ) : null}
            <p className="hint-text">
              将逐本解析{ai.autoClassify ? '并由 AI 自动分类' : ''}，书多时可能需要几分钟，可随时停止。
            </p>
            <ul className="folder-preview">
              {folderPlan.sources.slice(0, 10).map((source) => (
                <li key={source.name}>
                  <span>{source.name}</span>
                  <small>{formatBytes(source.size)}</small>
                </li>
              ))}
              {folderPlan.sources.length > 10 ? (
                <li className="folder-preview__more">
                  还有 {folderPlan.sources.length - 10} 本…
                </li>
              ) : null}
            </ul>
            <div className="sheet-actions sheet-actions--row">
              <button className="ghost-button" onClick={() => setFolderPlan(null)}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  const sources = folderPlan.sources;
                  setFolderPlan(null);
                  void runImport(sources);
                }}
              >
                开始导入
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {message ? <div className="toast">{message}</div> : null}

      <BookActionSheet
        book={actionBook}
        categories={categories}
        onClose={() => setActionBook(null)}
        onOpen={(book) => navigate(`/read/${book.id}`)}
        onToggleCategory={async (book, categoryId) => {
          await toggleBookCategory(book.id, categoryId);
          setActionBook((prev) =>
            prev
              ? {
                  ...prev,
                  categoryIds: prev.categoryIds.includes(categoryId)
                    ? prev.categoryIds.filter((c) => c !== categoryId)
                    : [...prev.categoryIds, categoryId],
                }
              : prev,
          );
        }}
        onDelete={async (book) => {
          await deleteBook(book.id);
          setActionBook(null);
          flash(`已删除《${book.title}》`);
        }}
      />

      <ManageSheet
        open={manageSheet}
        onClose={() => setManageSheet(false)}
        total={books.length}
        uncategorized={books.filter((book) => book.categoryIds.length === 0).length}
        hasApiKey={!!ai.apiKey.trim()}
        autoClassify={ai.autoClassify}
        onBatchImport={() => {
          fileRef.current?.click();
        }}
        onFolderImport={() => void pickFolder()}
        onClassifyUncategorized={() => void runBatchClassify('uncategorized')}
        onClassifyAll={() => void runBatchClassify('all')}
        onManageCategories={() => {
          setManageSheet(false);
          setCategorySheet(true);
        }}
      />

      <CategorySheet
        open={categorySheet}
        categories={categories}
        onClose={() => setCategorySheet(false)}
        onChanged={() => undefined}
      />
    </div>
  );
}

interface BookActionSheetProps {
  book: BookRecord | null;
  categories: Category[];
  onClose: () => void;
  onOpen: (book: BookRecord) => void;
  onToggleCategory: (book: BookRecord, categoryId: string) => void;
  onDelete: (book: BookRecord) => void;
}

function BookActionSheet({
  book,
  categories,
  onClose,
  onOpen,
  onToggleCategory,
  onDelete,
}: BookActionSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Sheet open={!!book} onClose={onClose} title={book?.title}>
      {book ? (
        <div className="book-action">
          <div className="book-action__head">
            <BookCover book={book} className="book-action__cover" />
            <div>
              <p className="book-action__author">{book.author || '未知作者'}</p>
              <p className="book-action__meta">
                {book.format.toUpperCase()} · {book.chapterCount} 章
              </p>
              <p className="book-action__meta">{book.fileName}</p>
            </div>
          </div>

          <div className="section-label">归类到</div>
          {categories.length === 0 ? (
            <p className="muted-text">还没有分类，先到书架右上角创建一个。</p>
          ) : (
            <div className="category-picker">
              {categories.map((category) => {
                const active = book.categoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    className={`category-pill ${active ? 'is-active' : ''}`}
                    onClick={() => onToggleCategory(book, category.id)}
                  >
                    {active ? <Check size={13} /> : null}
                    {category.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="sheet-actions">
            <button className="primary-button" onClick={() => onOpen(book)}>
              <BookOpen size={17} /> 打开阅读
            </button>
            {confirmDelete ? (
              <button className="danger-button" onClick={() => onDelete(book)}>
                确认删除这本书及其笔记？
              </button>
            ) : (
              <button className="ghost-button ghost-button--danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={17} /> 从书架删除
              </button>
            )}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

interface ManageSheetProps {
  open: boolean;
  onClose: () => void;
  total: number;
  uncategorized: number;
  hasApiKey: boolean;
  autoClassify: boolean;
  onBatchImport: () => void;
  onFolderImport: () => void;
  onClassifyUncategorized: () => void;
  onClassifyAll: () => void;
  onManageCategories: () => void;
}

function ManageSheet({
  open,
  onClose,
  total,
  uncategorized,
  hasApiKey,
  autoClassify,
  onBatchImport,
  onFolderImport,
  onClassifyUncategorized,
  onClassifyAll,
  onManageCategories,
}: ManageSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="批量管理">
      <div className="manage-list">
        <button className="manage-item" onClick={onBatchImport}>
          <FolderInput size={20} />
          <div>
            <strong>批量导入图书</strong>
            <p>适合少量几本；大量图书建议用下面的「从文件夹批量导入」。</p>
          </div>
        </button>

        <button className="manage-item" onClick={onFolderImport}>
          <FolderPlus size={20} />
          <div>
            <strong>从文件夹批量导入</strong>
            <p>选择「书」这类文件夹，自动导入其中所有 EPUB / PDF / TXT / MOBI / AZW3。</p>
          </div>
        </button>

        <button
          className="manage-item"
          disabled={uncategorized === 0}
          onClick={onClassifyUncategorized}
        >
          <Sparkles size={20} />
          <div>
            <strong>AI 分类未分类书籍</strong>
            <p>
              {uncategorized} 本待分类 ·{' '}
              {hasApiKey ? '使用 DeepSeek 判断' : '未填 API Key，将使用本地关键词规则'}
            </p>
          </div>
        </button>

        <button className="manage-item" disabled={total === 0} onClick={onClassifyAll}>
          <Layers size={20} />
          <div>
            <strong>重新分类全部书籍</strong>
            <p>{total} 本 · 会覆盖每本书当前的分类</p>
          </div>
        </button>

        <button className="manage-item" onClick={onManageCategories}>
          <FolderPlus size={20} />
          <div>
            <strong>分类管理</strong>
            <p>新建、重命名、删除分类</p>
          </div>
        </button>
      </div>

      <p className="hint-text manage-hint">
        {autoClassify
          ? '导入时自动分类已开启；这里可以对已有藏书补做或重做分类。'
          : '导入时自动分类已关闭；仍可在这里手动批量分类。'}
      </p>
    </Sheet>
  );
}

interface CategorySheetProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}

function CategorySheet({ open, categories, onClose, onChanged }: CategorySheetProps) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createCategory(trimmed);
    setName('');
    onChanged();
  }

  async function saveRename(id: string) {
    const trimmed = editingName.trim();
    if (trimmed) await renameCategory(id, trimmed);
    setEditingId(null);
    onChanged();
  }

  return (
    <Sheet open={open} onClose={onClose} title="分类管理" tall>
      <div className="category-add">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新分类名称，如：历史、待读"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add();
          }}
        />
        <button className="primary-button primary-button--small" onClick={() => void add()}>
          <Plus size={16} /> 添加
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="muted-text">还没有分类。分类只影响书架筛选，不会移动原文件。</p>
      ) : (
        <ul className="category-list">
          {categories.map((category) => (
            <li key={category.id}>
              {editingId === category.id ? (
                <div className="category-list__edit">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveRename(category.id);
                    }}
                  />
                  <button className="icon-button" onClick={() => void saveRename(category.id)}>
                    <Check size={18} />
                  </button>
                </div>
              ) : pendingDelete === category.id ? (
                <div className="category-confirm">
                  <span>删除「{category.name}」？</span>
                  <button
                    className="ghost-button ghost-button--danger"
                    onClick={async () => {
                      await deleteCategory(category.id);
                      setPendingDelete(null);
                      onChanged();
                    }}
                  >
                    删除
                  </button>
                  <button className="ghost-button" onClick={() => setPendingDelete(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <span className="dot" style={{ background: category.color }} />
                  <span className="category-list__name">{category.name}</span>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    onClick={() => setPendingDelete(category.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
