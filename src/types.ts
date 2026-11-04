export type BookFormat = 'epub' | 'pdf' | 'txt' | 'mobi' | 'azw3';

export type ReadingStatus = 'unread' | 'reading' | 'finished';

export interface ChapterMeta {
  index: number;
  title: string;
  /** epub only: spine href, used for direct navigation */
  href?: string;
}

/** Locator is the canonical "where am I" value shared by progress / bookmarks / notes. */
export type Locator =
  | { type: 'epub'; cfi: string; href?: string; chapterIndex?: number }
  | { type: 'pdf'; page: number }
  | {
      type: 'reflow';
      chapterIndex: number;
      /** character offset inside the chapter's flat text */
      offset: number;
      /** end character offset of a highlighted range (notes only) */
      endOffset?: number;
      /** 0..1 scroll ratio as a fallback when text matching fails */
      ratio: number;
    };

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  /** data URL of a resized cover */
  cover?: string;
  chapters: ChapterMeta[];
  chapterCount: number;
  categoryIds: string[];
  status: ReadingStatus;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

export interface BookFile {
  bookId: string;
  blob: Blob;
}

export interface ReflowChapter {
  title: string;
  html: string;
}

/** Pre-parsed contents for txt / mobi / azw3, so the reader never re-parses. */
export interface ReflowContent {
  bookId: string;
  kind: 'reflow';
  chapters: ReflowChapter[];
}

export interface ReadingProgress {
  bookId: string;
  locator: Locator;
  percent: number;
  chapterIndex: number;
  chapterTitle: string;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  locator: Locator;
  chapterIndex: number;
  chapterTitle: string;
  excerpt: string;
  createdAt: number;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface AIAnnotation {
  answer: string;
  model: string;
  sources: { title: string; url: string; snippet?: string }[];
  createdAt: number;
}

export interface Note {
  id: string;
  bookId: string;
  locator: Locator;
  chapterIndex: number;
  chapterTitle: string;
  /** the quoted passage */
  text: string;
  /** user's own note; empty for a pure highlight */
  note: string;
  color: HighlightColor;
  /** PDF: normalized rects (0..1) relative to the page box */
  rects?: { x: number; y: number; w: number; h: number }[];
  ai?: AIAnnotation;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

export type ThemeId = 'paper' | 'sepia' | 'green' | 'gray' | 'night' | 'black';

export interface ReaderPrefs {
  fontFamily: 'serif' | 'sans' | 'kai';
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  margin: number;
  themeId: ThemeId;
  pageMode: 'scroll' | 'paginated';
  /** use hardware volume keys to turn pages in the reader */
  volumeKeys: boolean;
  /** show the typography panel every time a book is opened */
  showSettingsOnOpen: boolean;
}

export interface AISettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  searchProvider: 'none' | 'tavily' | 'bing';
  searchKey: string;
  contextChars: number;
  temperature: number;
  /** classify every imported book into a category with DeepSeek */
  autoClassify: boolean;
}
