import jschardet from 'jschardet';
import { escapeHtml } from './utils';
import type { ChapterMeta, ReflowChapter } from '../types';

const CHAPTER_PATTERNS: RegExp[] = [
  /^\s*第[零〇一二三四五六七八九十百千万两0-9]+[章节回卷部篇集幕]\s*[^\n]{0,30}$/,
  /^\s*(?:序章|序言|序|前言|引子|楔子|尾声|后记|后序|终章|大结局|番外)[^\n]{0,30}$/,
  /^\s*Chapter\s+[0-9IVXLC]+[^\n]{0,40}$/i,
  /^\s*(?:Prologue|Epilogue|Introduction|Preface)\s*$/i,
];

const MAX_TITLE_LENGTH = 48;

export function isChapterTitle(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) return false;
  return CHAPTER_PATTERNS.some((re) => re.test(trimmed));
}

export function decodeText(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return { text: '', encoding: 'utf-8' };

  // BOM detection first
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      encoding: 'utf-8',
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      encoding: 'utf-16le',
    };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
      encoding: 'utf-16be',
    };
  }

  const guess = detectEncoding(bytes);
  try {
    const text = new TextDecoder(guess, { fatal: false }).decode(bytes);
    return { text, encoding: guess };
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
  }
}

function detectEncoding(bytes: Uint8Array): string {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  let binary = '';
  for (let i = 0; i < sample.length; i += 1) binary += String.fromCharCode(sample[i]);
  const result = jschardet.detect(binary);
  const raw = (result?.encoding || 'utf-8').toLowerCase();
  const confidence = result?.confidence ?? 0;
  const normalized = raw.replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    utf8: 'utf-8',
    ascii: 'utf-8',
    gb2312: 'gb18030',
    gbk: 'gb18030',
    gb18030: 'gb18030',
    big5: 'big5',
    shiftjis: 'shift_jis',
    eucjp: 'euc-jp',
    euckr: 'euc-kr',
    windows1252: 'windows-1252',
    iso88591: 'iso-8859-1',
    utf16le: 'utf-16le',
    utf16be: 'utf-16be',
  };
  const mapped = map[normalized] ?? normalized;
  if (mapped === 'utf-8' || confidence > 0.5) return mapped;
  return 'gbk';
}

export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);

  // Chinese novels usually put one paragraph per line (no blank line), while
  // English TXT files are hard-wrapped. Decide by looking at line endings.
  const sentenceEnd = /[。！？…」』”"'’.!?]$/;
  const ended = nonEmpty.filter((line) => sentenceEnd.test(line)).length;
  const oneParagraphPerLine = nonEmpty.length >= 3 && ended / nonEmpty.length >= 0.5;

  let paragraphs: string[];
  if (oneParagraphPerLine) {
    paragraphs = nonEmpty;
  } else {
    paragraphs = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
  }

  if (paragraphs.length === 0) return '';
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/**
 * Split a plain text book into chapters using common Chinese/English heading
 * patterns, falling back to fixed-size chunks at paragraph boundaries.
 */
export function splitTextIntoChapters(
  text: string,
  fallbackChunkSize = 6000,
): { chapters: ChapterMeta[]; contents: ReflowChapter[] } {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');

  type Section = { title: string; lines: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;
  let preface: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isChapterTitle(line)) {
      if (current) sections.push(current);
      current = { title: line.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preface.push(line);
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    // No headings: chunk the whole text.
    const chunks: ReflowChapter[] = [];
    let buffer = '';
    const partSize = Math.max(1500, fallbackChunkSize);
    const parts = normalized.split(/\n{2,}/);
    for (const part of parts) {
      if (buffer.length + part.length > partSize && buffer) {
        chunks.push({ title: `第${chunks.length + 1}节`, html: textToHtml(buffer) });
        buffer = '';
      }
      buffer += (buffer ? '\n\n' : '') + part;
    }
    if (buffer.trim()) {
      chunks.push({ title: `第${chunks.length + 1}节`, html: textToHtml(buffer) });
    }
    return {
      chapters: chunks.map((c, i) => ({ index: i, title: c.title })),
      contents: chunks,
    };
  }

  const contents: ReflowChapter[] = [];
  const prefaceText = preface.join('\n').trim();
  if (prefaceText.length > 0 && sections.length > 0) {
    contents.push({ title: '前言', html: textToHtml(prefaceText) });
  }
  for (const section of sections) {
    const body = section.lines.join('\n').trim();
    contents.push({ title: section.title, html: textToHtml(body) });
  }

  return {
    chapters: contents.map((c, i) => ({ index: i, title: c.title })),
    contents,
  };
}

/** Flat text of a simple HTML chapter, used for offset-based positions. */
export function htmlToPlainText(html: string): string {
  if (typeof document === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}
