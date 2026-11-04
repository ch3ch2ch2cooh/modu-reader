import { describe, expect, it } from 'vitest';
import { parseTxt } from '../../src/parsers/txt';
import { parseBook } from '../../src/parsers';

function textFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('parseTxt', () => {
  it('extracts title, chapters and reflow content', async () => {
    const content = [
      '第一章 出发',
      '',
      '天还没亮，他就出门了。',
      '',
      '第二章 归来',
      '',
      '回来时，雪已经停了。',
    ].join('\n');
    const parsed = await parseTxt(textFile('测试小说.txt', content));
    expect(parsed.title).toBe('测试小说');
    expect(parsed.format).toBe('txt');
    expect(parsed.chapters.length).toBe(2);
    expect(parsed.content?.chapters[1].html).toContain('雪已经停了');
  });

  it('cleans book-site suffixes from file names', async () => {
    const parsed = await parseTxt(textFile('【精校版】三体 - 刘慈欣.txt', '正文'));
    expect(parsed.title).not.toContain('【');
    expect(parsed.title).toContain('三体');
  });
});

describe('parseBook dispatch', () => {
  it('routes txt files through the txt parser', async () => {
    const parsed = await parseBook(textFile('样章.txt', '第一章\n\n内容'));
    expect(parsed.format).toBe('txt');
    expect(parsed.chapters.length).toBeGreaterThan(0);
  });
});
