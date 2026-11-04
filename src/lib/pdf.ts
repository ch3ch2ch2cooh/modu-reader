import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { installMapHelpers } from './mapHelpers';

installMapHelpers();

let configured = false;

function configure() {
  if (configured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  configured = true;
}

export function getPdfjs() {
  configure();
  return pdfjsLib;
}

const base = import.meta.env.BASE_URL || './';

export async function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  configure();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return pdfjsLib.getDocument({
    // clone so the caller's buffer stays usable for a second open
    data: bytes.slice(),
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  }).promise;
}

/** pdf.js v6 exposes teardown on the loading task, not always on the proxy. */
export async function closePdf(doc: PDFDocumentProxy | undefined): Promise<void> {
  if (!doc) return;
  const anyDoc = doc as unknown as {
    destroy?: () => Promise<void>;
    cleanup?: () => Promise<void>;
    loadingTask?: { destroy?: () => Promise<void> };
  };
  try {
    if (typeof anyDoc.destroy === 'function') await anyDoc.destroy();
    else if (typeof anyDoc.loadingTask?.destroy === 'function') await anyDoc.loadingTask.destroy();
    else if (typeof anyDoc.cleanup === 'function') await anyDoc.cleanup();
  } catch {
    /* ignore */
  }
}

export type { PDFDocumentProxy };
