import Dexie, { type Table } from 'dexie';
import type {
  BookFile,
  BookRecord,
  Bookmark,
  Category,
  Note,
  ReadingProgress,
  ReflowContent,
} from '../types';

export class ReaderDB extends Dexie {
  books!: Table<BookRecord, string>;
  files!: Table<BookFile, string>;
  contents!: Table<ReflowContent, string>;
  progress!: Table<ReadingProgress, string>;
  bookmarks!: Table<Bookmark, string>;
  notes!: Table<Note, string>;
  categories!: Table<Category, string>;

  constructor(name = 'modu-reader') {
    super(name);
    this.version(1).stores({
      books: 'id, title, author, format, status, createdAt, lastOpenedAt, *categoryIds',
      files: 'bookId',
      contents: 'bookId',
      progress: 'bookId, updatedAt',
      bookmarks: 'id, bookId, createdAt',
      notes: 'id, bookId, chapterIndex, createdAt',
      categories: 'id, name, order',
    });
  }
}

export const db = new ReaderDB();
