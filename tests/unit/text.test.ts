import { describe, expect, it } from 'vitest';
import {
  decodeText,
  isChapterTitle,
  splitTextIntoChapters,
  textToHtml,
} from '../../src/lib/text';

describe('isChapterTitle', () => {
  it('recognizes common Chinese headings', () => {
    expect(isChapterTitle('第一章 山中无历日')).toBe(true);
    expect(isChapterTitle('第12回 风雪山神庙')).toBe(true);
    expect(isChapterTitle('序章')).toBe(true);
    expect(isChapterTitle('番外 一')).toBe(true);
    expect(isChapterTitle('Chapter 3')).toBe(true);
  });

  it('ignores normal prose', () => {
    expect(isChapterTitle('他推开门，看见院子里的雪已经积了厚厚一层，')).toBe(false);
    expect(isChapterTitle('')).toBe(false);
  });
});

describe('splitTextIntoChapters', () => {
  const book = [
    '第一章 起',
    '',
    '第一段。',
    '',
    '第二段。',
    '',
    '第二章 承',
    '',
    '第三段。',
    '',
    '第三章 转',
    '',
    '第四段。',
  ].join('\n');

  it('splits on headings and keeps the preface', () => {
    const withPreface = `写在前面的话。\n\n${book}`;
    const result = splitTextIntoChapters(withPreface);
    expect(result.chapters.length).toBe(4);
    expect(result.chapters[0].title).toBe('前言');
    expect(result.chapters[1].title).toBe('第一章 起');
    expect(result.contents[3].html).toContain('第四段');
  });

  it('splits headings without adding an empty preface', () => {
    const result = splitTextIntoChapters(book);
    expect(result.chapters.length).toBe(3);
    expect(result.chapters[0].title).toBe('第一章 起');
  });

  it('falls back to fixed size chunks when there are no headings', () => {
    const long = Array.from({ length: 900 }, (_, i) => `这是第${i}段。`).join('\n\n');
    const result = splitTextIntoChapters(long);
    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.contents[0].title).toMatch(/^第1节$/);
  });

  it('escapes html inside text', () => {
    expect(textToHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;');
  });
});

describe('decodeText', () => {
  it('strips a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xe4, 0xb8, 0xad]);
    const result = decodeText(bytes.buffer);
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('中');
  });

  it('decodes UTF-16LE with BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x2d, 0x4e]);
    const result = decodeText(bytes.buffer);
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe('中');
  });
});
