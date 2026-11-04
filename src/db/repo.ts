import { db } from './db';
import type {
  BookFile,
  BookRecord,
  Bookmark,
  Category,
  Locator,
  Note,
  ReadingProgress,
  ReflowContent,
} from '../types';

export async function listBooks(): Promise<BookRecord[]> {
  return db.books.orderBy('createdAt').reverse().toArray();
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return db.books.get(id);
}

export async function addBook(
  book: BookRecord,
  file?: Blob,
  content?: ReflowContent,
): Promise<void> {
  await db.transaction('rw', db.books, db.files, db.contents, async () => {
    await db.books.add(book);
    if (file) await db.files.put({ bookId: book.id, blob: file });
    if (content) await db.contents.put({ ...content, bookId: book.id });
  });
}

export async function updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
  await db.books.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteBook(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.books, db.files, db.contents, db.progress, db.bookmarks, db.notes],
    async () => {
      await db.books.delete(id);
      await db.files.delete(id);
      await db.contents.delete(id);
      await db.progress.delete(id);
      await db.bookmarks.where('bookId').equals(id).delete();
      await db.notes.where('bookId').equals(id).delete();
    },
  );
}

export async function getBookFile(bookId: string): Promise<Blob | undefined> {
  const row = await db.files.get(bookId);
  return row?.blob;
}

export async function getBookContent(bookId: string): Promise<ReflowContent | undefined> {
  return db.contents.get(bookId);
}

// ---------------------------------------------------------------- progress

export async function getProgress(bookId: string): Promise<ReadingProgress | undefined> {
  return db.progress.get(bookId);
}

export async function listProgress(): Promise<ReadingProgress[]> {
  return db.progress.orderBy('updatedAt').reverse().toArray();
}

export async function saveProgress(input: {
  bookId: string;
  locator: Locator;
  percent: number;
  chapterIndex: number;
  chapterTitle: string;
}): Promise<void> {
  const now = Date.now();
  const percent = Math.max(0, Math.min(1, input.percent));
  const record: ReadingProgress = { ...input, percent, updatedAt: now };
  const status: BookRecord['status'] = percent >= 0.985 ? 'finished' : 'reading';
  await db.transaction('rw', db.progress, db.books, async () => {
    await db.progress.put(record);
    await db.books.update(input.bookId, { lastOpenedAt: now, status, updatedAt: now });
  });
}

/** Most recent unfinished book, used for the "continue reading" card. */
export async function getLastReadBook(): Promise<{
  book: BookRecord;
  progress?: ReadingProgress;
} | null> {
  const rows = await db.progress.orderBy('updatedAt').reverse().limit(20).toArray();
  for (const p of rows) {
    const book = await db.books.get(p.bookId);
    if (book) return { book, progress: p };
  }
  const latest = await db.books.orderBy('lastOpenedAt').reverse().limit(1).first();
  if (latest?.lastOpenedAt) return { book: latest };
  return null;
}

// --------------------------------------------------------------- bookmarks

export async function addBookmark(input: {
  bookId: string;
  locator: Locator;
  chapterIndex: number;
  chapterTitle: string;
  excerpt: string;
}): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: Date.now(),
  };
  await db.bookmarks.add(bookmark);
  return bookmark;
}

export async function listBookmarks(bookId: string): Promise<Bookmark[]> {
  return db.bookmarks.where('bookId').equals(bookId).reverse().sortBy('createdAt');
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

// ------------------------------------------------------------------- notes

export async function addNote(
  input: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Note> {
  const now = Date.now();
  const note: Note = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.notes.add(note);
  return note;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

export async function listNotes(bookId: string): Promise<Note[]> {
  return db.notes.where('bookId').equals(bookId).reverse().sortBy('createdAt');
}

export async function listAllNotes(): Promise<Note[]> {
  return db.notes.orderBy('createdAt').reverse().toArray();
}

export async function listAllBookmarks(): Promise<Bookmark[]> {
  return db.bookmarks.orderBy('createdAt').reverse().toArray();
}

// -------------------------------------------------------------- categories

export async function listCategories(): Promise<Category[]> {
  return db.categories.orderBy('order').toArray();
}

export async function createCategory(name: string, color = '#9a5b34'): Promise<Category> {
  const count = await db.categories.count();
  const category: Category = {
    id: crypto.randomUUID(),
    name: name.trim(),
    color,
    order: count,
    createdAt: Date.now(),
  };
  await db.categories.add(category);
  return category;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name: name.trim() });
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.books, async () => {
    await db.categories.delete(id);
    const books = await db.books.where('categoryIds').equals(id).toArray();
    await Promise.all(
      books.map((b) =>
        db.books.update(b.id, { categoryIds: b.categoryIds.filter((c) => c !== id) }),
      ),
    );
  });
}

export async function setBookCategories(bookId: string, categoryIds: string[]): Promise<void> {
  await db.books.update(bookId, { categoryIds, updatedAt: Date.now() });
}

export async function toggleBookCategory(bookId: string, categoryId: string): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) return;
  const has = book.categoryIds.includes(categoryId);
  await db.books.update(bookId, {
    categoryIds: has
      ? book.categoryIds.filter((c) => c !== categoryId)
      : [...book.categoryIds, categoryId],
    updatedAt: Date.now(),
  });
}
