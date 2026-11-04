import { describe, expect, it } from 'vitest';
import { detectFormat, formatFromName } from '../../src/lib/detect';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function asciiHead(text: string, size = 256): Uint8Array {
  const arr = new Uint8Array(size);
  for (let i = 0; i < text.length; i += 1) arr[i] = text.charCodeAt(i);
  return arr;
}

describe('detectFormat', () => {
  it('detects PDF by magic', () => {
    expect(detectFormat('whatever.bin', bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('pdf');
  });

  it('detects EPUB by zip magic + mimetype probe', () => {
    const head = new Uint8Array(256);
    head.set([0x50, 0x4b, 0x03, 0x04], 0);
    head.set(Array.from('mimetypeapplication/epub+zip').map((c) => c.charCodeAt(0)), 30);
    expect(detectFormat('book.epub', head)).toBe('epub');
  });

  it('detects MOBI by BOOKMOBI signature', () => {
    const head = asciiHead('X'.repeat(60) + 'BOOKMOBI' + 'Y'.repeat(200));
    expect(detectFormat('book.mobi', head)).toBe('mobi');
  });

  it('falls back to extension', () => {
    const empty = new Uint8Array(10);
    expect(detectFormat('novel.txt', empty)).toBe('txt');
    expect(detectFormat('novel.azw3', empty)).toBe('azw3');
    expect(detectFormat('novel.unknown', empty)).toBe('txt');
  });

  it('maps aliases', () => {
    expect(formatFromName('a.AZW')).toBe('mobi');
    expect(formatFromName('a.kf8')).toBe('azw3');
    expect(formatFromName('a.pdf')).toBe('pdf');
  });
});
