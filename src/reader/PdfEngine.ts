import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Locator, Note, ReaderPrefs } from '../types';
import { HIGHLIGHT_COLORS } from '../lib/themes';
import { closePdf, openPdf } from '../lib/pdf';
import type {
  ChapterContext,
  EngineCallbacks,
  EngineLocation,
  ReaderEngine,
  SelectionInfo,
} from './engine';
import { attachSwipe } from './swipe';

interface PageSlot {
  element: HTMLElement;
  canvas?: HTMLCanvasElement;
  textLayer?: HTMLElement;
  overlay: HTMLElement;
  rendered: boolean;
  rendering: boolean;
  width: number;
  height: number;
}

export class PdfEngine implements ReaderEngine {
  private doc?: PDFDocumentProxy;
  private scroller?: HTMLElement;
  private slots: PageSlot[] = [];
  private notes = new Map<string, Note>();
  private prefs: ReaderPrefs;
  private observer?: IntersectionObserver;
  private currentPage = 1;
  private scaleFactor = 1;
  private baseScale = 1;
  private baseWidth = 0;
  private baseHeight = 0;
  private zoom = 1;
  private raf = 0;
  private disposed = false;
  private detachSwipe?: () => void;

  constructor(
    private blob: Blob,
    prefs: ReaderPrefs,
    private cb: EngineCallbacks,
  ) {
    this.prefs = prefs;
    this.zoom = zoomFor(prefs);
  }

  async mount(container: HTMLElement, initial?: Locator): Promise<void> {
    const buffer = await this.blob.arrayBuffer();
    const doc = await openPdf(buffer);
    this.doc = doc;
    this.root = container;
    container.innerHTML = '';
    const scroller = document.createElement('div');
    scroller.className = 'pdf-scroll';
    container.appendChild(scroller);
    this.scroller = scroller;

    const first = await doc.getPage(1);
    const baseViewport = first.getViewport({ scale: 1 });
    const available = Math.max(240, scroller.clientWidth - 16);
    const fit = available / baseViewport.width;
    this.baseScale = fit;
    this.baseWidth = baseViewport.width * fit;
    this.baseHeight = baseViewport.height * fit;
    this.scaleFactor = fit * this.zoom;

    for (let i = 1; i <= doc.numPages; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'pdf-page';
      slot.dataset.page = String(i);
      const width = Math.floor(this.baseWidth * this.zoom);
      const height = Math.floor(this.baseHeight * this.zoom);
      slot.style.width = `${width}px`;
      slot.style.height = `${height}px`;

      const overlay = document.createElement('div');
      overlay.className = 'pdf-overlay';
      slot.appendChild(overlay);

      scroller.appendChild(slot);
      this.slots.push({ element: slot, overlay, rendered: false, rendering: false, width, height });
    }

    scroller.addEventListener('scroll', this.handleScroll, { passive: true });
    scroller.addEventListener('mouseup', this.handleSelectionSoon);
    scroller.addEventListener('touchend', this.handleSelectionSoon);
    scroller.addEventListener('click', this.handleClick);
    this.detachSwipe = attachSwipe(scroller, {
      onNext: () => this.nextPage(),
      onPrev: () => this.prevPage(),
      isBlocked: () => {
        const selection = window.getSelection();
        return !!selection && !selection.isCollapsed;
      },
    });

    this.observer = new IntersectionObserver(this.handleIntersect, {
      root: scroller,
      rootMargin: '150% 0px',
    });
    this.slots.forEach((slot) => this.observer?.observe(slot.element));

    const page = initial?.type === 'pdf' ? initial.page : 1;
    await this.renderPage(page);
    this.goTo({ type: 'pdf', page });
    this.applyHighlightAll();
    this.cb.onReady?.();
  }

  private root?: HTMLElement;

  private handleIntersect = (entries: IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const page = Number((entry.target as HTMLElement).dataset.page);
      if (page) void this.renderPage(page);
    }
  };

  private handleScroll = (): void => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.updateCurrentPage();
    });
  };

  private updateCurrentPage(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const top = scroller.scrollTop;
    const bottom = top + scroller.clientHeight;
    let bestPage = 1;
    let bestArea = -1;
    this.slots.forEach((slot, index) => {
      const slotTop = slot.element.offsetTop;
      const slotBottom = slotTop + slot.element.offsetHeight;
      const visible = Math.min(bottom, slotBottom) - Math.max(top, slotTop);
      if (visible > bestArea) {
        bestArea = visible;
        bestPage = index + 1;
      }
    });
    this.currentPage = bestPage;
    this.emitLocation();
  }

  private emitLocation(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const slot = this.slots[this.currentPage - 1];
    let within = 0;
    if (slot) {
      const height = slot.element.offsetHeight || 1;
      within = Math.max(0, Math.min(1, (scroller.scrollTop - slot.element.offsetTop) / height));
    }
    const total = this.slots.length || 1;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    const atEnd = maxScroll > 0 && scroller.scrollTop >= maxScroll - 4;
    const percent = atEnd ? 1 : Math.min(1, (this.currentPage - 1 + within) / total);
    const locator: Locator = { type: 'pdf', page: this.currentPage };
    const location: EngineLocation = {
      locator,
      percent,
      chapterIndex: 0,
      chapterTitle: `第 ${this.currentPage} / ${total} 页`,
      page: { current: this.currentPage, total, approximate: false },
    };
    this.cb.onLocation(location);
  }

  private async renderPage(pageNumber: number): Promise<void> {
    if (this.disposed) return;
    const doc = this.doc;
    const slot = this.slots[pageNumber - 1];
    if (!doc || !slot || slot.rendered || slot.rendering) return;
    slot.rendering = true;
    try {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.scaleFactor });
      const canvas = document.createElement('canvas');
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      } as never).promise;

      slot.canvas?.remove();
      slot.textLayer?.remove();
      slot.element.insertBefore(canvas, slot.overlay);
      slot.canvas = canvas;

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.setProperty('--scale-factor', String(this.scaleFactor));
      slot.element.insertBefore(textLayerDiv, slot.overlay);
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();
      slot.textLayer = textLayerDiv;
      slot.rendered = true;
      this.applyHighlightPage(pageNumber);
      page.cleanup();
    } catch {
      /* skip broken page */
    } finally {
      slot.rendering = false;
    }
  }

  private handleSelectionSoon = (): void => {
    setTimeout(() => this.captureSelection(), 90);
  };

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const hit = target?.closest?.('[data-note-id]') as HTMLElement | null;
    if (hit?.dataset.noteId) this.cb.onHighlightClick(hit.dataset.noteId);
  };

  private captureSelection(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!scroller.contains(range.commonAncestorContainer)) return;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;

    const pageEl = (range.startContainer.parentElement as HTMLElement | null)?.closest(
      '.pdf-page',
    ) as HTMLElement | null;
    const pageNumber = Number(pageEl?.dataset.page || this.currentPage);
    const pageRect = pageEl?.getBoundingClientRect();
    if (!pageRect) return;

    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      rects.push({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        w: rect.width / pageRect.width,
        h: rect.height / pageRect.height,
      });
    }

    const info: SelectionInfo = {
      text,
      locator: { type: 'pdf', page: pageNumber },
      chapterIndex: 0,
      chapterTitle: `第 ${pageNumber} 页`,
      screenRect: { left: pageRect.left, top: pageRect.top, width: 1, height: 1 },
      rects,
    };
    this.cb.onSelection(info);
  }

  applyPrefs(prefs: ReaderPrefs): void {
    this.prefs = prefs;
    const nextZoom = zoomFor(prefs);
    if (Math.abs(nextZoom - this.zoom) > 0.001) {
      void this.reflow(nextZoom);
    }
  }

  private async reflow(zoom: number): Promise<void> {
    if (!this.scroller) return;
    this.zoom = zoom;
    this.scaleFactor = this.baseScale * zoom;
    const page = this.currentPage;
    const scrollRatio = this.scroller.scrollTop / Math.max(1, this.scroller.scrollHeight);
    for (const slot of this.slots) {
      slot.canvas?.remove();
      slot.textLayer?.remove();
      slot.canvas = undefined;
      slot.textLayer = undefined;
      slot.rendered = false;
      slot.element.style.width = `${Math.floor(this.baseWidth * zoom)}px`;
      slot.element.style.height = `${Math.floor(this.baseHeight * zoom)}px`;
    }
    this.scroller.scrollTop = scrollRatio * this.scroller.scrollHeight;
    await this.renderPage(page);
    this.applyHighlightAll();
  }

  addNote(note: Note): void {
    this.notes.set(note.id, note);
    if (note.locator.type === 'pdf') this.applyHighlightPage(note.locator.page);
  }

  removeNote(noteId: string): void {
    this.notes.delete(noteId);
    this.root
      ?.querySelectorAll(`[data-note-id="${cssEscape(noteId)}"]`)
      .forEach((el) => el.remove());
  }

  private applyHighlightAll(): void {
    this.notes.forEach((note) => {
      if (note.locator.type === 'pdf') this.applyHighlightPage(note.locator.page);
    });
  }

  private applyHighlightPage(pageNumber: number): void {
    const slot = this.slots[pageNumber - 1];
    if (!slot) return;
    slot.overlay.querySelectorAll('[data-note-id]').forEach((el) => el.remove());
    this.notes.forEach((note) => {
      if (note.locator.type !== 'pdf' || note.locator.page !== pageNumber || !note.rects) return;
      for (const rect of note.rects) {
        const el = document.createElement('div');
        el.className = 'pdf-highlight';
        el.dataset.noteId = note.id;
        el.style.left = `${rect.x * 100}%`;
        el.style.top = `${rect.y * 100}%`;
        el.style.width = `${rect.w * 100}%`;
        el.style.height = `${rect.h * 100}%`;
        el.style.backgroundColor = HIGHLIGHT_COLORS[note.color];
        slot.overlay.appendChild(el);
      }
    });
  }

  async goTo(locator: Locator): Promise<void> {
    if (locator.type !== 'pdf' || !this.scroller) return;
    const page = Math.max(1, Math.min(this.slots.length, locator.page));
    await this.renderPage(page);
    const slot = this.slots[page - 1];
    if (!slot) return;
    this.scroller.scrollTop = slot.element.offsetTop;
    this.currentPage = page;
    this.emitLocation();
  }

  async getContext(_locator: Locator, chars: number, selectedText: string): Promise<ChapterContext> {
    const doc = this.doc;
    if (!doc) return { before: '', selected: selectedText, after: '', chapterTitle: '' };
    try {
      const page = await doc.getPage(this.currentPage);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ');
      const needle = selectedText.replace(/\s+/g, ' ').trim();
      const index = text.indexOf(needle);
      if (index < 0) {
        return { before: text.slice(0, chars), selected: needle, after: '', chapterTitle: '' };
      }
      return {
        before: text.slice(Math.max(0, index - chars), index),
        selected: needle,
        after: text.slice(index + needle.length, index + needle.length + chars),
        chapterTitle: `第 ${this.currentPage} 页`,
      };
    } catch {
      return { before: '', selected: selectedText, after: '', chapterTitle: '' };
    }
  }

  nextPage(): void {
    void this.goTo({ type: 'pdf', page: this.currentPage + 1 }).then(() => this.cb.onTurn?.(1));
  }

  prevPage(): void {
    void this.goTo({ type: 'pdf', page: this.currentPage - 1 }).then(() => this.cb.onTurn?.(-1));
  }

  selectAll(): void {
    if (!this.scroller) return;
    const range = document.createRange();
    range.selectNodeContents(this.scroller);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.captureSelection();
  }

  clearSelection(): void {
    window.getSelection()?.removeAllRanges();
  }

  destroy(): void {
    this.disposed = true;
    this.detachSwipe?.();
    this.observer?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.scroller) {
      this.scroller.removeEventListener('scroll', this.handleScroll);
      this.scroller.removeEventListener('mouseup', this.handleSelectionSoon);
      this.scroller.removeEventListener('touchend', this.handleSelectionSoon);
      this.scroller.removeEventListener('click', this.handleClick);
    }
    void closePdf(this.doc);
    this.doc = undefined;
    this.root?.replaceChildren();
    this.slots = [];
  }
}

function zoomFor(prefs: ReaderPrefs): number {
  // 19px is the neutral default: fit-to-width, no extra zoom.
  return Math.max(0.8, Math.min(1.6, 0.6 + (prefs.fontSize / 19) * 0.4));
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
