import type { BookRecord } from '../types';
import { detectFormat } from '../lib/detect';
import { uid } from '../lib/utils';
import { addBook, listBooks } from '../db/repo';
import { parseEpub } from './epub';
import { parsePdf } from './pdf';
import { parseTxt } from './txt';
import { parseMobi } from './mobi';
import type { ParsedBook } from './types';

export type { ParsedBook } from './types';

export async function parseBook(file: File): Promise<ParsedBook> {
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  const format = detectFormat(file.name, head);

  switch (format) {
    case 'epub':
      return parseEpub(file);
    case 'pdf':
      return parsePdf(file);
    case 'mobi':
    case 'azw3':
      return parseMobi(file, format);
    default:
      return parseTxt(file);
  }
}

export async function importBookFile(file: File): Promise<{ book: BookRecord; duplicate: boolean }> {
  const existing = (await listBooks()).find(
    (b) => b.fileName === file.name && b.fileSize === file.size,
  );
  if (existing) return { book: existing, duplicate: true };

  const parsed = await parseBook(file);
  const now = Date.now();
  const id = uid();
  const book: BookRecord = {
    id,
    title: parsed.title || file.name.replace(/\.[^.]+$/, ''),
    author: parsed.author || '',
    format: parsed.format,
    fileName: file.name,
    fileSize: file.size,
    cover: parsed.cover,
    chapters: parsed.chapters,
    chapterCount: parsed.chapters.length,
    categoryIds: [],
    status: 'unread',
    createdAt: now,
    updatedAt: now,
  };

  await addBook(
    book,
    parsed.file,
    parsed.content ? { ...parsed.content, bookId: id } : undefined,
  );

  return { book, duplicate: false };
}
