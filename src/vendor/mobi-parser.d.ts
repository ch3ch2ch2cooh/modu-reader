export interface MobiMetadataLike {
  identifier?: string;
  title?: string;
  author?: string[];
  publisher?: string;
  description?: string;
  language?: string;
  subject?: string[];
  rights?: string;
  contributor?: string[];
}

export interface MobiChapterLike {
  id: string;
  text?: string;
  start?: number;
  end?: number;
  size?: number;
}

export interface MobiTocItemLike {
  label: string;
  href: string;
  children?: MobiTocItemLike[];
}

export interface MobiParserLike {
  getMetadata(): MobiMetadataLike;
  getSpine(): MobiChapterLike[];
  loadChapter(id: string): { html: string; css?: { id: string; href: string }[] } | undefined;
  getToc(): MobiTocItemLike[];
  getCoverImage(): string;
  resolveHref(href: string): { id: string; selector: string } | undefined;
  destroy(): void;
}

export function initMobiFile(file: Uint8Array, resourceSaveDir?: string): Promise<MobiParserLike>;
export function initKf8File(file: Uint8Array, resourceSaveDir?: string): Promise<MobiParserLike>;
