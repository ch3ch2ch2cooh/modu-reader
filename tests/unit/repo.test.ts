import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import {
  addBookmark,
  addBook,
  addNote,
  createCategory,
  deleteBook,
  deleteCategory,
  getBook,
  getBookFile,
  getLastReadBook,
  getProgress,
  listAllNotes,
  listBookmarks,
  listBooks,
  listCategories,
  saveProgress,
  setBookCategories,
  toggleBookCategory,
  updateBook,
} from '../../src/db/repo';
import type { BookRecord } from '../../src/types';

function makeBook(id: string, title = '测试书'): BookRecord {
  const now = Date.now();
  return {
    id,
    title,
    author: '作者',
    format: 'txt',
    fileName: `${title}.txt`,
    fileSize: 1024,
    chapters: [{ index: 0, title: '第一章' }],
    chapterCount: 1,
    categoryIds: [],
    status: 'unread',
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.books.clear(),
    db.files.clear(),
    db.contents.clear(),
    db.progress.clear(),
    db.bookmarks.clear(),
    db.notes.clear(),
    db.categories.clear(),
  ]);
});

describe('book repository', () => {
  it('stores a book with file and reflow content', async () => {
    const book = makeBook('b1');
    const blob = new Blob(['hello']);
    await addBook(book, blob, {
      bookId: 'b1',
      kind: 'reflow',
      chapters: [{ title: '第一章', html: '<p>正文</p>' }],
    });

    expect((await listBooks()).length).toBe(1);
    expect((await getBook('b1'))?.title).toBe('测试书');
    // fake-indexeddb does not preserve jsdom Blob instances faithfully, so we
    // only assert the row exists; real binary round-trips are covered by E2E.
    expect(await getBookFile('b1')).toBeTruthy();
    expect(await getBookFile('missing')).toBeUndefined();
  });

  it('updates and deletes a book with its dependent rows', async () => {
    await addBook(makeBook('b1'));
    await updateBook('b1', { title: '新标题' });
    expect((await getBook('b1'))?.title).toBe('新标题');

    await saveProgress({
      bookId: 'b1',
      locator: { type: 'reflow', chapterIndex: 0, offset: 0, ratio: 0.5 },
      percent: 0.5,
      chapterIndex: 0,
      chapterTitle: '第一章',
    });
    await addBookmark({
      bookId: 'b1',
      locator: { type: 'reflow', chapterIndex: 0, offset: 0, ratio: 0.5 },
      chapterIndex: 0,
      chapterTitle: '第一章',
      excerpt: '书签',
    });
    await addNote({
      bookId: 'b1',
      locator: { type: 'reflow', chapterIndex: 0, offset: 0, ratio: 0.5 },
      chapterIndex: 0,
      chapterTitle: '第一章',
      text: '重点',
      note: '',
      color: 'yellow',
    });

    await deleteBook('b1');
    expect(await getBook('b1')).toBeUndefined();
    expect(await getProgress('b1')).toBeUndefined();
    expect(await listBookmarks('b1')).toEqual([]);
    expect(await listAllNotes()).toEqual([]);
  });

  it('returns the last read book for the continue card', async () => {
    await addBook(makeBook('b1', '旧书'));
    await addBook(makeBook('b2', '新书'));
    await saveProgress({
      bookId: 'b2',
      locator: { type: 'reflow', chapterIndex: 2, offset: 0, ratio: 0.1 },
      percent: 0.42,
      chapterIndex: 2,
      chapterTitle: '第三章',
    });

    const last = await getLastReadBook();
    expect(last?.book.id).toBe('b2');
    expect(last?.progress?.percent).toBeCloseTo(0.42);
  });
});

describe('categories', () => {
  it('creates, assigns and removes categories', async () => {
    await addBook(makeBook('b1'));
    const category = await createCategory('历史');
    expect((await listCategories()).map((c) => c.name)).toEqual(['历史']);

    await toggleBookCategory('b1', category.id);
    expect((await getBook('b1'))?.categoryIds).toEqual([category.id]);

    await setBookCategories('b1', []);
    expect((await getBook('b1'))?.categoryIds).toEqual([]);

    await toggleBookCategory('b1', category.id);
    await deleteCategory(category.id);
    expect((await getBook('b1'))?.categoryIds).toEqual([]);
    expect(await listCategories()).toEqual([]);
  });
});

describe('bookmarks and notes', () => {
  it('persists bookmarks and notes with locators', async () => {
    await addBook(makeBook('b1'));
    const bookmark = await addBookmark({
      bookId: 'b1',
      locator: { type: 'pdf', page: 7 },
      chapterIndex: 0,
      chapterTitle: '第 7 页',
      excerpt: '摘录',
    });
    expect((await listBookmarks('b1'))[0].id).toBe(bookmark.id);

    const note = await addNote({
      bookId: 'b1',
      locator: { type: 'pdf', page: 7 },
      chapterIndex: 0,
      chapterTitle: '第 7 页',
      text: '被划线的文字',
      note: '我的想法',
      color: 'blue',
      rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }],
    });
    const all = await listAllNotes();
    expect(all[0].text).toBe('被划线的文字');
    expect(all[0].note).toBe('我的想法');
    expect(note.rects?.[0].w).toBeCloseTo(0.3);
  });
});
