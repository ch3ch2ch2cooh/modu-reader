import type { ChapterMeta } from '../types';
import type { ParsedBook } from './types';
import { closePdf, openPdf } from '../lib/pdf';
import { isBlankCover, makeGeneratedCover } from '../lib/cover';

const MAX_TOC_ITEMS = 800;

interface OutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: OutlineNode[];
}

export async function parsePdf(file: File): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer();
  const pdf = await openPdf(buffer);
  try {
    const meta = await pdf.getMetadata().catch(() => undefined);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const title =
      typeof info.Title === 'string' && info.Title.trim()
        ? info.Title.trim()
        : file.name.replace(/\.[^.]+$/, '');
    const author = typeof info.Author === 'string' ? info.Author.trim() : '';

    const chapters: ChapterMeta[] = [];
    const pageToIndex = new Map<number, number>();

    const resolvePage = async (dest: OutlineNode['dest']): Promise<number | undefined> => {
      try {
        const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
        if (!Array.isArray(explicit) || explicit.length === 0) return undefined;
        const ref = explicit[0];
        if (typeof ref === 'number') return ref + 1;
        const index = await pdf.getPageIndex(ref as never);
        return index + 1;
      } catch {
        return undefined;
      }
    };

    const outline = (await pdf.getOutline().catch(() => null)) as OutlineNode[] | null;

    const walk = async (nodes: OutlineNode[]) => {
      for (const node of nodes) {
        if (chapters.length >= MAX_TOC_ITEMS) return;
        const page = await resolvePage(node.dest);
        if (page && !pageToIndex.has(page)) {
          pageToIndex.set(page, chapters.length);
          chapters.push({
            index: chapters.length,
            title: (node.title || '').trim() || `第 ${page} 页`,
            href: String(page),
          });
        }
        if (node.items?.length) await walk(node.items);
      }
    };

    if (outline?.length) await walk(outline);

    if (chapters.length === 0) {
      chapters.push({ index: 0, title: '正文', href: '1' });
    }

    let cover: string | undefined;
    try {
      cover = await renderFirstPageCover(pdf);
    } catch {
      cover = undefined;
    }
    if (!cover || (await isBlankCover(cover))) cover = makeGeneratedCover(title, author);

    return {
      title,
      author,
      format: 'pdf',
      chapters,
      cover,
      file,
      warning: 'PDF 为固定版式，字号设置仅影响缩放，不支持重排。',
    };
  } finally {
    await closePdf(pdf);
  }
}

async function renderFirstPageCover(pdf: Awaited<ReturnType<typeof openPdf>>): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const targetWidth = 480;
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}
