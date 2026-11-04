import type { BookFormat, ChapterMeta, ReflowContent } from '../types';

export interface ParsedBook {
  title: string;
  author: string;
  format: BookFormat;
  chapters: ChapterMeta[];
  cover?: string;
  /** original bytes, kept for epub/pdf */
  file?: Blob;
  /** pre-extracted chapters for txt/mobi/azw3 */
  content?: ReflowContent;
  warning?: string;
}
