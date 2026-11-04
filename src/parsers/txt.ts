import type { ParsedBook } from './types';
import { decodeText, splitTextIntoChapters } from '../lib/text';
import { makeGeneratedCover } from '../lib/cover';

export function cleanTitleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[【\[（(].*?[】\]）)]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parseTxt(file: File): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeText(buffer);
  const { chapters, contents } = splitTextIntoChapters(text);
  const title = cleanTitleFromFileName(file.name) || '未命名';
  const warning =
    encoding && !/utf-?8|utf-?16/i.test(encoding) ? `已按 ${encoding.toUpperCase()} 解码。` : undefined;

  return {
    title,
    author: '',
    format: 'txt',
    chapters,
    cover: makeGeneratedCover(title, ''),
    content: { bookId: '', kind: 'reflow', chapters: contents },
    warning,
  };
}
