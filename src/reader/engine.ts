import type { Locator, Note, ReaderPrefs } from '../types';

export interface PageStats {
  current: number;
  total: number;
  /** character-based estimate (EPUB / reflow), or false for fixed PDF pages */
  approximate: boolean;
}

export interface EngineLocation {
  locator: Locator;
  percent: number;
  chapterIndex: number;
  chapterTitle: string;
  page?: PageStats;
}

export interface SelectionInfo {
  text: string;
  locator: Locator;
  chapterIndex: number;
  chapterTitle: string;
  /** viewport coordinates of the selection, used to place the toolbar */
  screenRect: { left: number; top: number; width: number; height: number };
  /** pdf: normalized rects inside the page */
  rects?: { x: number; y: number; w: number; h: number }[];
}

export interface EngineCallbacks {
  onLocation: (location: EngineLocation) => void;
  onSelection: (selection: SelectionInfo | null) => void;
  onHighlightClick: (noteId: string) => void;
  onReady?: () => void;
  /** tap inside the content area (EPUB iframe never reaches the parent DOM); fraction of screen width */
  onTap?: (fraction?: number) => void;
  /** a page turn just started, used for the flip animation */
  onTurn?: (direction: 1 | -1) => void;
}

export interface ChapterContext {
  before: string;
  selected: string;
  after: string;
  chapterTitle: string;
}

export interface ReaderEngine {
  mount(container: HTMLElement, initial?: Locator): Promise<void>;
  destroy(): void;
  goTo(locator: Locator): Promise<void>;
  applyPrefs(prefs: ReaderPrefs): void;
  addNote(note: Note): void;
  removeNote(noteId: string): void;
  getContext(locator: Locator, chars: number, selectedText: string): Promise<ChapterContext>;
  nextPage(): void;
  prevPage(): void;
  clearSelection(): void;
  /** select all readable text in the current section/page */
  selectAll?(): void;
  /** optional: jump to a 0..1 position (epub uses generated locations) */
  seekPercent?(percent: number): void;
}
