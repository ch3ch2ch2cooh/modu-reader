import ePub from 'epubjs';
import type { Book, Contents, Rendition } from 'epubjs';
import type { ChapterMeta, Locator, Note, ReaderPrefs } from '../types';
import { FONT_STACKS, HIGHLIGHT_COLORS, THEMES } from '../lib/themes';
import type {
  ChapterContext,
  EngineCallbacks,
  EngineLocation,
  ReaderEngine,
  SelectionInfo,
} from './engine';
import { attachSwipe } from './swipe';
import { estimateCharsPerPage, pageFromPercent } from '../lib/pages';

function baseHref(href: string | undefined): string {
  return (href ?? '').split('#')[0];
}

export class EpubEngine implements ReaderEngine {
  private book?: Book;
  private rendition?: Rendition;
  private prefs: ReaderPrefs;
  private notes = new Map<string, Note>();
  private currentChapterIndex = 0;
  private destroyed = false;
  private locationsReady = false;
  private pendingPercent?: number;
  private lastHref = '';
  private swipeDocs = new WeakSet<Document>();
  private swipeCleanups: (() => void)[] = [];
  private fontCss?: string;
  private lastCfi = '';
  private relocateTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private blob: Blob,
    private chapters: ChapterMeta[],
    prefs: ReaderPrefs,
    private cb: EngineCallbacks,
  ) {
    this.prefs = prefs;
  }

  async mount(container: HTMLElement, initial?: Locator): Promise<void> {
    const buffer = await this.blob.arrayBuffer();
    const book = ePub(buffer);
    this.book = book;
    await book.ready;
    if (this.destroyed) return;

    const rendition = book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
      allowScriptedContent: false,
    });
    this.rendition = rendition;
    this.applyPrefs(this.prefs);

    rendition.on('relocated', this.handleRelocated);
    rendition.on('selected', this.handleSelected);
    rendition.on('markClicked', this.handleMarkClicked);
    rendition.on('rendered', (_section: unknown, view: { contents?: Contents }) => {
      this.attachContentsSwipe(view?.contents);
    });

    const target = initial?.type === 'epub' ? initial.cfi : undefined;
    await rendition.display(target);
    this.applyAllHighlights();
    this.attachContentsSwipe(this.getContents());
    this.cb.onReady?.();

    // Generating locations powers an accurate progress slider; it can take a
    // moment on large books, so it runs after the first page is visible.
    void book.locations
      .generate(1200)
      .then(() => {
        this.locationsReady = true;
        if (typeof this.pendingPercent === 'number') {
          const percent = this.pendingPercent;
          this.pendingPercent = undefined;
          this.seekPercent(percent);
        }
        void this.rendition?.reportLocation();
      })
      .catch(() => undefined);
  }

  applyPrefs(prefs: ReaderPrefs): void {
    this.prefs = prefs;
    const rendition = this.rendition;
    if (!rendition) return;
    const theme = THEMES[prefs.themeId];
    const font = FONT_STACKS[prefs.fontFamily];
    rendition.themes.default({
      html: {
        background: theme.bg,
      },
      body: {
        background: `${theme.bg} !important`,
        color: `${theme.fg} !important`,
        'font-family': `${font} !important`,
        'font-size': `${prefs.fontSize}px !important`,
        'line-height': `${prefs.lineHeight} !important`,
        padding: `18px ${prefs.margin}px 76px !important`,
        'text-align': 'justify !important',
        '-webkit-user-select': 'text',
        'user-select': 'text',
      },
      p: {
        'margin': `0 0 ${prefs.paragraphSpacing}em !important`,
        'line-height': `${prefs.lineHeight} !important`,
        'text-indent': '2em',
      },
      a: { color: theme.fg },
      img: { 'max-width': '100%', 'height': 'auto', opacity: theme.isDark ? '0.85' : '1' },
      '::selection': { background: 'rgba(242,193,78,0.45)' },
    });
    rendition.themes.fontSize(`${prefs.fontSize}px`);
    this.applyMeasure(prefs);
    window.setTimeout(() => this.applyMeasure(prefs), 80);

    // Changing the font or size repaginates the book; epub.js may leave the
    // viewport on a stale/blank column, so re-display the current CFI once the
    // new layout settles.
    if (this.lastCfi) {
      const cfi = this.lastCfi;
      if (this.relocateTimer) clearTimeout(this.relocateTimer);
      this.relocateTimer = setTimeout(() => {
        if (!this.destroyed && cfi) {
          void this.rendition?.display(cfi).catch(() => undefined);
        }
      }, 260);
    }
  }

  /**
   * epub.js writes horizontal padding inline (with !important) when it builds
   * its column layout, so user margins have to be re-applied on the body node.
   */
  private applyMeasure(prefs: ReaderPrefs): void {
    const contents = this.rendition?.getContents() as unknown as Contents | Contents[] | undefined;
    const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
    for (const content of list) {
      const body = content?.document?.body;
      if (!body) continue;
      body.style.setProperty('padding-left', `${prefs.margin}px`, 'important');
      body.style.setProperty('padding-right', `${prefs.margin}px`, 'important');
      body.style.setProperty('padding-top', '8px', 'important');
      body.style.setProperty('padding-bottom', '76px', 'important');
    }
  }

  private handleRelocated = (location: unknown): void => {
    const loc = location as {
      start: {
        cfi?: string;
        href?: string;
        index?: number;
        displayed?: { page: number; total: number };
      };
    };
    if (!loc?.start) return;
    const href = baseHref(loc.start.href);
    this.lastCfi = loc.start.cfi ?? this.lastCfi;
    if (href !== this.lastHref) {
      this.lastHref = href;
      window.setTimeout(() => this.applyMeasure(this.prefs), 0);
    }
    const chapterIndex = this.resolveChapterIndex(href, loc.start.index ?? 0);
    this.currentChapterIndex = chapterIndex;

    const chapter = this.chapters[chapterIndex];
    const page = loc.start.displayed?.page ?? 1;
    const totalPages = loc.start.displayed?.total ?? 1;
    const within = totalPages > 0 ? (page - 1) / totalPages : 0;
    const chapterCount = Math.max(1, this.chapters.length);
    let percent = Math.min(1, (chapterIndex + within) / chapterCount);
    if (this.locationsReady && loc.start.cfi) {
      try {
        const exact = this.book?.locations.percentageFromCfi(loc.start.cfi);
        if (typeof exact === 'number' && Number.isFinite(exact)) {
          percent = Math.min(1, Math.max(0, exact));
        }
      } catch {
        /* keep the chapter-based estimate */
      }
    }

    const result: EngineLocation = {
      locator: {
        type: 'epub',
        cfi: loc.start.cfi ?? '',
        href: loc.start.href,
        chapterIndex,
      },
      percent,
      chapterIndex,
      chapterTitle: chapter?.title ?? '',
      page: this.buildPageStats(percent, loc.start.displayed?.total),
    };
    this.cb.onLocation(result);
  };

  private buildPageStats(
    percent: number,
    pagesInSection?: number,
  ): EngineLocation['page'] {
    if (!this.locationsReady || !this.book) return undefined;
    const totalChars = this.book.locations.length() * 1200;
    const contents = this.getContents();
    const body = contents?.document?.body;
    if (!body || totalChars <= 0) return undefined;

    const textLength = (body.innerText ?? '').replace(/\s+/g, '').length;
    let charsPerPage = 0;
    if (pagesInSection && pagesInSection > 0 && textLength > 0) {
      charsPerPage = textLength / pagesInSection;
    } else {
      const style = body.style;
      const paddingX =
        (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const paddingY =
        (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      charsPerPage = estimateCharsPerPage(
        Math.max(120, body.clientWidth - paddingX),
        Math.max(160, body.clientHeight - paddingY),
        this.prefs.fontSize,
        this.prefs.lineHeight,
      );
    }
    if (!Number.isFinite(charsPerPage) || charsPerPage < 20) return undefined;
    const total = Math.max(1, Math.ceil(totalChars / charsPerPage));
    return { current: pageFromPercent(percent, total), total, approximate: true };
  }

  private resolveChapterIndex(href: string, spineIndex: number): number {
    if (href) {
      const byHref = this.chapters.findIndex((c) => baseHref(c.href) === href);
      if (byHref >= 0) return byHref;
    }
    let fallback = 0;
    for (let i = 0; i < this.chapters.length; i += 1) {
      if (this.chapters[i].index <= spineIndex) fallback = i;
      else break;
    }
    return fallback;
  }

  private handleSelected = (cfiRange: string, contents: Contents): void => {
    const selection = contents.window.getSelection();
    const text = selection?.toString().replace(/\s+/g, ' ').trim();
    if (!text || !selection || selection.rangeCount === 0) {
      this.cb.onSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const iframe = contents.window.frameElement as HTMLIFrameElement | null;
    const frameRect = iframe?.getBoundingClientRect();
    const section = (contents as unknown as { section?: { href?: string } }).section;
    const href = section?.href ?? '';
    const chapterIndex = this.resolveChapterIndex(baseHref(href), 0);

    const info: SelectionInfo = {
      text,
      locator: { type: 'epub', cfi: cfiRange, href, chapterIndex },
      chapterIndex,
      chapterTitle: this.chapters[chapterIndex]?.title ?? '',
      screenRect: {
        left: (frameRect?.left ?? 0) + rect.left,
        top: (frameRect?.top ?? 0) + rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
    this.cb.onSelection(info);
  };

  private handleMarkClicked = (_cfiRange: string, data?: { id?: string }): void => {
    if (data?.id) this.cb.onHighlightClick(data.id);
  };

  addNote(note: Note): void {
    this.notes.set(note.id, note);
    if (note.locator.type !== 'epub') return;
    const rendition = this.rendition;
    if (!rendition) return;
    const color = HIGHLIGHT_COLORS[note.color];
    try {
      rendition.annotations.highlight(
        note.locator.cfi,
        { id: note.id },
        () => this.cb.onHighlightClick(note.id),
        undefined,
        { fill: color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' },
      );
    } catch {
      /* epubjs throws when the cfi is outside the rendered section */
    }
  }

  removeNote(noteId: string): void {
    const note = this.notes.get(noteId);
    if (!note || note.locator.type !== 'epub') return;
    this.notes.delete(noteId);
    try {
      this.rendition?.annotations.remove(note.locator.cfi, 'highlight');
    } catch {
      /* ignore */
    }
  }

  private applyAllHighlights(): void {
    this.notes.forEach((note) => {
      if (note.locator.type === 'epub') {
        this.addNote(note);
      }
    });
  }

  async goTo(locator: Locator): Promise<void> {
    if (locator.type !== 'epub' || !this.rendition) return;
    const target = locator.cfi || locator.href;
    if (!target) return;
    await this.rendition.display(target).catch(() => undefined);
  }

  private getContents(): Contents | undefined {
    try {
      const contents = this.rendition?.getContents() as unknown as Contents | Contents[];
      if (Array.isArray(contents)) return contents[0];
      return contents;
    } catch {
      return undefined;
    }
  }

  private attachContentsSwipe(contents?: Contents): void {
    const doc = contents?.document;
    if (!doc) return;
    this.injectFonts(doc);
    if (this.swipeDocs.has(doc)) return;
    this.swipeDocs.add(doc);
    this.swipeCleanups.push(
      attachSwipe(doc, {
        onNext: () => this.nextPage(),
        onPrev: () => this.prevPage(),
        onTap: (fraction) => this.cb.onTap?.(fraction),
        isBlocked: () => {
          const selection = doc.getSelection();
          return !!selection && !selection.isCollapsed;
        },
      }),
    );
  }

  /** Copy the bundled @font-face rules into the EPUB iframe document. */
  private injectFonts(doc: Document): void {
    if (doc.getElementById('modu-reader-fonts')) return;
    if (this.fontCss === undefined) {
      const rules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule.cssText.startsWith('@font-face')) rules.push(rule.cssText);
          }
        } catch {
          /* ignore inaccessible sheets */
        }
      }
      this.fontCss = rules.join('\n');
    }
    if (!this.fontCss) return;
    const style = doc.createElement('style');
    style.id = 'modu-reader-fonts';
    style.textContent = this.fontCss;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  async getContext(_locator: Locator, chars: number, selectedText: string): Promise<ChapterContext> {
    const contents = this.getContents();
    const chapterTitle = this.chapters[this.currentChapterIndex]?.title ?? '';
    const text = (contents?.document?.body?.innerText ?? '').replace(/\u00a0/g, ' ');
    const needle = selectedText.replace(/\s+/g, ' ').trim();
    let index = text.indexOf(needle);
    if (index < 0) {
      const collapsed = text.replace(/\s+/g, ' ');
      const at = collapsed.indexOf(needle);
      if (at >= 0) {
        return {
          before: collapsed.slice(Math.max(0, at - chars), at),
          selected: needle,
          after: collapsed.slice(at + needle.length, at + needle.length + chars),
          chapterTitle,
        };
      }
      index = 0;
    }
    return {
      before: text.slice(Math.max(0, index - chars), index),
      selected: needle,
      after: text.slice(index + needle.length, index + needle.length + chars),
      chapterTitle,
    };
  }

  nextPage(): void {
    const rendition = this.rendition;
    if (!rendition) return;
    void rendition.next().then(() => {
      if (!this.destroyed) this.cb.onTurn?.(1);
    });
  }

  prevPage(): void {
    const rendition = this.rendition;
    if (!rendition) return;
    void rendition.prev().then(() => {
      if (!this.destroyed) this.cb.onTurn?.(-1);
    });
  }

  seekPercent(percent: number): void {
    if (!this.book || !this.rendition) return;
    const target = Math.max(0, Math.min(1, percent));
    if (!this.locationsReady) {
      this.pendingPercent = target;
      return;
    }
    try {
      const cfi = this.book.locations.cfiFromPercentage(target);
      if (cfi) void this.rendition.display(cfi);
    } catch {
      /* ignore invalid percentage */
    }
  }

  clearSelection(): void {
    try {
      const contents = this.getContents();
      contents?.window?.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.relocateTimer) clearTimeout(this.relocateTimer);
    this.swipeCleanups.forEach((cleanup) => cleanup());
    this.swipeCleanups = [];
    try {
      this.book?.destroy();
    } catch {
      /* ignore */
    }
    this.book = undefined;
    this.rendition = undefined;
  }
}
