import type { Locator, Note, ReaderPrefs, ReflowChapter } from '../types';
import { HIGHLIGHT_COLORS } from '../lib/themes';
import type {
  ChapterContext,
  EngineCallbacks,
  EngineLocation,
  ReaderEngine,
  SelectionInfo,
} from './engine';
import { attachSwipe } from './swipe';
import { estimateCharsPerPage, pageFromPercent } from '../lib/pages';

interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}

export class ReflowEngine implements ReaderEngine {
  private root?: HTMLElement;
  private scroller?: HTMLElement;
  private body?: HTMLElement;
  private chapterIndex = 0;
  private notes = new Map<string, Note>();
  private prefs: ReaderPrefs;
  private raf = 0;
  private suppressScroll = false;
  private disposed = false;
  private detachSwipe?: () => void;
  private totalChars = 0;

  constructor(
    private chapters: ReflowChapter[],
    prefs: ReaderPrefs,
    private cb: EngineCallbacks,
    private bookTitle = '',
  ) {
    this.prefs = prefs;
  }

  async mount(container: HTMLElement, initial?: Locator): Promise<void> {
    this.root = container;
    this.totalChars = this.chapters.reduce(
      (sum, chapter) => sum + chapter.html.replace(/<[^>]+>/g, '').length,
      0,
    );
    container.innerHTML = '';
    const scroller = document.createElement('div');
    scroller.className = 'reflow-scroll';
    const body = document.createElement('div');
    body.className = 'reflow-body';
    scroller.appendChild(body);
    container.appendChild(scroller);
    this.scroller = scroller;
    this.body = body;

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

    const startChapter =
      initial?.type === 'reflow' ? Math.min(initial.chapterIndex, this.chapters.length - 1) : 0;
    const ratio = initial?.type === 'reflow' ? initial.ratio : 0;
    const offset = initial?.type === 'reflow' ? initial.offset : 0;

    this.renderChapter(startChapter);
    requestAnimationFrame(() => {
      if (offset > 0) this.scrollToOffset(offset);
      else if (ratio > 0) this.scrollToRatio(ratio);
      this.emitLocation();
      this.cb.onReady?.();
    });
  }

  applyPrefs(prefs: ReaderPrefs): void {
    this.prefs = prefs;
    if (!this.root) return;
    const theme = prefs.themeId;
    this.root.dataset.theme = theme;
    this.root.style.setProperty('--reader-font-size', `${prefs.fontSize}px`);
    this.root.style.setProperty('--reader-line-height', String(prefs.lineHeight));
    this.root.style.setProperty('--reader-para-gap', `${prefs.paragraphSpacing}em`);
    this.root.style.setProperty('--reader-margin', `${prefs.margin}px`);
    requestAnimationFrame(() => this.emitLocation());
  }

  private renderChapter(index: number): void {
    if (!this.body) return;
    const chapter = this.chapters[index];
    if (!chapter) return;
    this.chapterIndex = index;

    this.suppressScroll = true;
    // MOBI/KF8 chapters often already start with their own <h1>/<h2>; avoid
    // showing the same title twice when the heading is part of the content.
    const hasOwnHeading = /<h[1-3][\s>]/i.test(chapter.html.slice(0, 400));
    const heading = hasOwnHeading
      ? ''
      : `<h2 class="chapter-heading">${escapeHtml(chapter.title)}</h2>`;
    this.body.innerHTML = `${heading}${chapter.html}`;
    this.applyHighlightsForChapter(index);
    this.scroller?.scrollTo({ top: 0 });
    this.suppressScroll = false;
    this.emitLocation();
  }

  private handleScroll = (): void => {
    if (this.suppressScroll) return;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.emitLocation();
    });
  };

  private handleSelectionSoon = (): void => {
    setTimeout(() => this.captureSelection(), 90);
  };

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest?.('mark[data-note-id]') as HTMLElement | null;
    if (mark?.dataset.noteId) {
      this.cb.onHighlightClick(mark.dataset.noteId);
    }
  };

  private captureSelection(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!scroller.contains(range.commonAncestorContainer)) return;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text) {
      this.cb.onSelection(null);
      return;
    }

    const offsets = this.offsetsForRange(range);
    if (!offsets) return;
    const rect = range.getBoundingClientRect();
    const chapter = this.chapters[this.chapterIndex];
    const info: SelectionInfo = {
      text,
      locator: {
        type: 'reflow',
        chapterIndex: this.chapterIndex,
        offset: offsets.start,
        endOffset: offsets.end,
        ratio: this.currentRatio(),
      },
      chapterIndex: this.chapterIndex,
      chapterTitle: chapter?.title ?? '',
      screenRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
    this.cb.onSelection(info);
  }

  private textNodes(): TextNodeInfo[] {
    if (!this.body) return [];
    const walker = document.createTreeWalker(this.body, NodeFilter.SHOW_TEXT);
    const nodes: TextNodeInfo[] = [];
    let pos = 0;
    let current = walker.nextNode() as Text | null;
    while (current) {
      const length = current.data.length;
      nodes.push({ node: current, start: pos, end: pos + length });
      pos += length;
      current = walker.nextNode() as Text | null;
    }
    return nodes;
  }

  private offsetsForRange(range: Range): { start: number; end: number } | null {
    const nodes = this.textNodes();
    let start = -1;
    let end = -1;
    for (const info of nodes) {
      if (start < 0 && info.node === range.startContainer) start = info.start + range.startOffset;
      if (end < 0 && info.node === range.endContainer) end = info.start + range.endOffset;
    }
    if (start < 0 || end < 0 || end <= start) return null;
    return { start, end };
  }

  private rangeForOffsets(start: number, end: number): Range | null {
    const nodes = this.textNodes();
    const startNode = nodes.find((n) => n.end > start);
    const endNode = [...nodes].reverse().find((n) => n.start < end);
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode.node, Math.max(0, start - startNode.start));
    range.setEnd(endNode.node, Math.min(endNode.node.data.length, end - endNode.start));
    return range;
  }

  private scrollToOffset(offset: number): void {
    if (!this.scroller) return;
    const range = this.rangeForOffsets(Math.max(0, offset), Math.max(1, offset + 1));
    if (!range) return;
    const rect = range.getBoundingClientRect();
    const top = this.scroller.getBoundingClientRect().top;
    this.scroller.scrollTop += rect.top - top - 12;
  }

  private scrollToRatio(ratio: number): void {
    if (!this.scroller) return;
    const max = this.scroller.scrollHeight - this.scroller.clientHeight;
    this.scroller.scrollTop = Math.max(0, Math.min(1, ratio)) * max;
  }

  private currentRatio(): number {
    const scroller = this.scroller;
    if (!scroller) return 0;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, scroller.scrollTop / max));
  }

  private emitLocation(): void {
    if (!this.scroller) return;
    const ratio = this.currentRatio();
    const chapter = this.chapters[this.chapterIndex];
    const count = Math.max(1, this.chapters.length);
    const percent = Math.min(1, (this.chapterIndex + ratio) / count);
    const locator: Locator = {
      type: 'reflow',
      chapterIndex: this.chapterIndex,
      offset: 0,
      ratio,
    };
    const charsPerPage = estimateCharsPerPage(
      Math.max(120, this.scroller.clientWidth - this.prefs.margin * 2),
      Math.max(160, this.scroller.clientHeight - 60),
      this.prefs.fontSize,
      this.prefs.lineHeight,
    );
    const totalPages = Math.max(1, Math.ceil(this.totalChars / charsPerPage));
    const location: EngineLocation = {
      locator,
      percent,
      chapterIndex: this.chapterIndex,
      chapterTitle: chapter?.title ?? '',
      page: {
        current: pageFromPercent(percent, totalPages),
        total: totalPages,
        approximate: true,
      },
    };
    this.cb.onLocation(location);
  }

  addNote(note: Note): void {
    this.notes.set(note.id, note);
    if (note.locator.type === 'reflow' && note.locator.chapterIndex === this.chapterIndex) {
      this.applyHighlightsForChapter(this.chapterIndex);
    }
  }

  removeNote(noteId: string): void {
    this.notes.delete(noteId);
    if (!this.body) return;
    const marks = this.body.querySelectorAll(`mark[data-note-id="${cssEscape(noteId)}"]`);
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  /** Re-render marks for the visible chapter. Offsets are chapter-local. */
  private applyHighlightsForChapter(chapterIndex: number): void {
    if (!this.body) return;
    this.body.querySelectorAll('mark[data-note-id]').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });

    const notes = [...this.notes.values()]
      .filter((n) => n.locator.type === 'reflow' && n.locator.chapterIndex === chapterIndex)
      .map((n) => {
        const loc = n.locator as { offset: number; endOffset?: number };
        const start = loc.offset;
        return { note: n, start, end: loc.endOffset ?? start + n.text.length };
      })
      .sort((a, b) => b.start - a.start);

    for (const item of notes) {
      this.wrapRange(item.start, item.end, item.note.id, HIGHLIGHT_COLORS[item.note.color]);
    }
  }

  private wrapRange(start: number, end: number, noteId: string, color: string): void {
    const range = this.rangeForOffsets(start, end);
    if (!range || range.collapsed) return;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(this.body!, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode() as Text | null;
    while (current) {
      if (range.intersectsNode(current)) nodes.push(current);
      current = walker.nextNode() as Text | null;
    }
    for (const node of nodes.reverse()) {
      if (!node.parentNode) continue;
      let from = 0;
      let to = node.data.length;
      if (node === range.startContainer) from = range.startOffset;
      if (node === range.endContainer) to = range.endOffset;
      if (from >= to) continue;
      const target = from === 0 && to === node.data.length ? node : node.splitText(from);
      if (to - from < target.data.length) target.splitText(to - from);
      const mark = document.createElement('mark');
      mark.className = 'reflow-highlight';
      mark.dataset.noteId = noteId;
      mark.style.backgroundColor = color;
      target.parentNode?.insertBefore(mark, target);
      mark.appendChild(target);
    }
  }

  async goTo(locator: Locator): Promise<void> {
    if (locator.type !== 'reflow') return;
    if (locator.chapterIndex !== this.chapterIndex) {
      this.renderChapter(locator.chapterIndex);
    }
    await new Promise((r) => requestAnimationFrame(r));
    if (locator.offset > 0) this.scrollToOffset(locator.offset);
    else this.scrollToRatio(locator.ratio);
    this.emitLocation();
  }

  async getContext(_locator: Locator, chars: number, selectedText: string): Promise<ChapterContext> {
    const chapter = this.chapters[this.chapterIndex];
    const title = chapter?.title ?? '';
    const root = this.body;
    const text = (root?.innerText ?? '').replace(/\u00a0/g, ' ');
    const needle = selectedText.replace(/\s+/g, ' ').trim();
    const index = text.indexOf(needle);
    if (index < 0) {
      return { before: text.slice(0, chars), selected: needle, after: text.slice(0, chars), chapterTitle: title };
    }
    return {
      before: text.slice(Math.max(0, index - chars), index),
      selected: needle,
      after: text.slice(index + needle.length, index + needle.length + chars),
      chapterTitle: title,
    };
  }

  nextPage(): void {
    this.turnPage(1);
  }

  prevPage(): void {
    this.turnPage(-1);
  }

  private turnPage(direction: 1 | -1): void {
    this.cb.onTurn?.(direction);
    const scroller = this.scroller;
    if (!scroller) return;
    const delta = (scroller.clientHeight - 40) * direction;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const next = scroller.scrollTop + delta;
    if (next <= 4 && direction < 0) {
      if (this.chapterIndex > 0) {
        this.renderChapter(this.chapterIndex - 1);
        requestAnimationFrame(() => {
          scroller.scrollTop = scroller.scrollHeight;
          this.emitLocation();
        });
      }
      return;
    }
    if (next >= max - 4 && direction > 0) {
      if (this.chapterIndex < this.chapters.length - 1) {
        this.renderChapter(this.chapterIndex + 1);
      }
      return;
    }
    scroller.scrollTo({ top: next, behavior: 'smooth' });
  }

  clearSelection(): void {
    window.getSelection()?.removeAllRanges();
  }

  destroy(): void {
    this.disposed = true;
    this.detachSwipe?.();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.scroller) {
      this.scroller.removeEventListener('scroll', this.handleScroll);
      this.scroller.removeEventListener('mouseup', this.handleSelectionSoon);
      this.scroller.removeEventListener('touchend', this.handleSelectionSoon);
      this.scroller.removeEventListener('click', this.handleClick);
    }
    this.root?.replaceChildren();
    this.root = undefined;
    this.scroller = undefined;
    this.body = undefined;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
