import type { ChapterMeta, ReflowChapter } from '../types';
import type { ParsedBook } from './types';
import type { BookFormat } from '../types';
import { imageUrlToCover, makeGeneratedCover } from '../lib/cover';

interface TocItem {
  label: string;
  href: string;
  children?: TocItem[];
}

interface ParserLike {
  getMetadata(): {
    title?: string;
    author?: string[];
    creator?: string[];
    publisher?: string;
    description?: string;
  };
  getSpine(): { id: string; text?: string }[];
  loadChapter(id: string): { html: string; css?: { id: string; href: string }[] } | undefined;
  getToc(): TocItem[];
  getCoverImage(): string;
  resolveHref(href: string): { id: string; selector: string } | undefined;
  destroy(): void;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function materializeHtml(
  html: string,
  css: { href: string }[] | undefined,
): Promise<string> {
  if (typeof document === 'undefined') return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;

  for (const part of css ?? []) {
    try {
      const res = await fetch(part.href);
      if (!res.ok) continue;
      const text = await res.text();
      const style = document.createElement('style');
      style.textContent = text;
      holder.prepend(style);
    } catch {
      /* ignore broken css */
    }
  }

  const images = Array.from(holder.querySelectorAll('img'));
  for (const img of images) {
    const src = img.getAttribute('src') ?? '';
    if (!src.startsWith('blob:')) continue;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      img.setAttribute('src', await blobToDataUrl(blob));
    } catch {
      img.remove();
    }
  }

  // strip external stylesheet links pointing at dead blob URLs
  holder.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('blob:')) link.remove();
  });

  return holder.innerHTML;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function titleFromHtml(html: string): string {
  const match = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  return match ? stripTags(match[1]).slice(0, 40) : '';
}

/** First sentence-ish slice of the plain text, used when a chapter has no heading. */
function firstLine(plain: string, max = 30): string {
  const cleaned = plain.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const stop = cleaned.search(/[。！？.!?]/);
  const slice = stop > 3 ? cleaned.slice(0, stop + 1) : cleaned;
  return slice.length > max ? `${slice.slice(0, max)}…` : slice;
}

export async function parseMobi(file: File, format: BookFormat): Promise<ParsedBook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Vendored build of @lingo-reader/mobi-parser with a fix for KF8 books whose
  // <link> tags are ordinary stylesheets (upstream crashes on those).
  const mod = await import('../vendor/mobi-parser');

  const attempts: (() => Promise<ParserLike>)[] =
    format === 'azw3'
      ? [() => mod.initKf8File(bytes) as unknown as Promise<ParserLike>, () => mod.initMobiFile(bytes) as unknown as Promise<ParserLike>]
      : [() => mod.initMobiFile(bytes) as unknown as Promise<ParserLike>, () => mod.initKf8File(bytes) as unknown as Promise<ParserLike>];

  let parser: ParserLike | undefined;
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      parser = await attempt();
      if (parser.getSpine().length > 0) break;
    } catch (err) {
      lastError = err;
      parser = undefined;
    }
  }
  if (!parser) {
    throw new Error(`无法解析该 ${format.toUpperCase()} 文件：${String(lastError ?? '未知错误')}`);
  }

  try {
    const meta = parser.getMetadata();
    const title = (meta.title || file.name.replace(/\.[^.]+$/, '')).trim();
    const author = (meta.author ?? meta.creator ?? []).join(' / ');

    const idToTitle = new Map<string, string>();
    const walkToc = (items: TocItem[]) => {
      for (const item of items) {
        try {
          const resolved = parser!.resolveHref(item.href);
          if (resolved?.id) idToTitle.set(resolved.id, item.label.trim());
        } catch {
          /* ignore */
        }
        if (item.children?.length) walkToc(item.children);
      }
    };
    try {
      walkToc(parser.getToc());
    } catch {
      /* toc optional */
    }

    const chapters: ChapterMeta[] = [];
    const contents: ReflowChapter[] = [];

    for (const spineItem of parser.getSpine()) {
      let processed: { html: string; css?: { href: string }[] } | undefined;
      try {
        processed = parser.loadChapter(spineItem.id);
      } catch {
        processed = undefined;
      }
      if (!processed?.html) continue;
      const plain = stripTags(processed.html);
      if (!plain) continue;

      const html = await materializeHtml(processed.html, processed.css);
      const fallback = firstLine(plain, 30);
      const title2 =
        idToTitle.get(spineItem.id) ||
        titleFromHtml(html) ||
        fallback ||
        `第 ${contents.length + 1} 节`;
      contents.push({ title: title2, html });
      chapters.push({ index: contents.length - 1, title: title2 });
    }

    if (contents.length === 0) throw new Error('没有找到可显示的正文内容');

    let cover: string | undefined;
    try {
      const coverUrl = parser.getCoverImage();
      if (coverUrl) cover = await imageUrlToCover(coverUrl);
    } catch {
      cover = undefined;
    }
    if (!cover) cover = makeGeneratedCover(title, author);

    return {
      title,
      author,
      format,
      chapters,
      cover,
      content: { bookId: '', kind: 'reflow', chapters: contents },
    };
  } finally {
    parser.destroy();
  }
}
