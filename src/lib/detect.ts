import type { BookFormat } from '../types';

const EXT_MAP: Record<string, BookFormat> = {
  epub: 'epub',
  pdf: 'pdf',
  txt: 'txt',
  text: 'txt',
  mobi: 'mobi',
  azw: 'mobi',
  azw3: 'azw3',
  kf8: 'azw3',
};

export function formatFromName(fileName: string): BookFormat | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext];
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

/** Detect format from magic bytes first, then fall back to the extension. */
export function detectFormat(fileName: string, head: Uint8Array): BookFormat {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf';

  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    const probe = ascii(head, 0, 4096);
    if (probe.includes('mimetype') || probe.includes('META-INF')) return 'epub';
    const byName = formatFromName(fileName);
    if (byName === 'epub') return 'epub';
  }

  if (ascii(head, 60, 8) === 'BOOKMOBI') {
    // PalmDB: record 0 offset at byte 78, MOBI header starts 16 bytes in,
    // version is a 4-byte field at MOBI+20.
    const record0 = readU32(head, 78);
    const version = record0 + 36 + 4 <= head.length ? readU32(head, record0 + 36) : 6;
    if (version >= 8) return 'azw3';
    return 'mobi';
  }

  const byName = formatFromName(fileName);
  if (byName) return byName;

  return 'txt';
}

export function formatLabel(format: BookFormat): string {
  switch (format) {
    case 'epub':
      return 'EPUB';
    case 'pdf':
      return 'PDF';
    case 'mobi':
      return 'MOBI';
    case 'azw3':
      return 'AZW3';
    default:
      return 'TXT';
  }
}
