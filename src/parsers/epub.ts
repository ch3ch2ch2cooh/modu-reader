import ePub from 'epubjs';
import type { Book } from 'epubjs';
import type { ChapterMeta } from '../types';
import type { ParsedBook } from './types';
import { imageUrlToCover, makeGeneratedCover } from '../lib/cover';

function stripHash(href: string): string {
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(0, i) : href;
}

function spineIndex(book: Book, href: string): number {
  try {
    const item = book.spine.get(stripHash(href));
    return typeof item?.index === 'number' ? item.index : -1;
  } catch {
    return -1;
  }
}

export async function parseEpub(file: File): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer();
  const book = ePub(buffer);
  try {
    await book.ready;
    const metadata = await book.loaded.metadata;
    const navigation = await book.loaded.navigation;

    const chapters: ChapterMeta[] = [];
    const seen = new Set<string>();
    const walk = (items: { href: string; label: string; subitems?: unknown[] }[]) => {
      for (const item of items) {
        const href = stripHash(item.href || '');
        const label = (item.label || '').trim();
        if (href && !seen.has(href)) {
          seen.add(href);
          chapters.push({
            index: spineIndex(book, href) >= 0 ? spineIndex(book, href) : chapters.length,
            title: label || `第 ${chapters.length + 1} 节`,
            href,
          });
        }
        const sub = (item as { subitems?: typeof items }).subitems;
        if (Array.isArray(sub) && sub.length) walk(sub);
      }
    };

    if (navigation?.toc?.length) walk(navigation.toc as never);

    if (chapters.length === 0) {
      book.spine.each((section: { href?: string; index: number }) => {
        if (!section.href) return;
        chapters.push({
          index: section.index,
          title: `第 ${chapters.length + 1} 节`,
          href: stripHash(section.href),
        });
      });
    }

    let cover: string | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) cover = await imageUrlToCover(coverUrl);
    } catch {
      cover = undefined;
    }
    if (!cover) {
      cover = makeGeneratedCover(metadata.title || file.name, metadata.creator || '');
    }

    return {
      title: (metadata.title || file.name.replace(/\.[^.]+$/, '')).trim(),
      author: (metadata.creator || '').trim(),
      format: 'epub',
      chapters,
      cover,
      file,
    };
  } finally {
    book.destroy();
  }
}
