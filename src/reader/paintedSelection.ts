interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

interface WindowWithHighlights extends Window {
  CSS?: { highlights?: HighlightRegistry };
  Highlight?: new (range: Range) => unknown;
}

/** Paint a range with the CSS Custom Highlight API (survives clearing native selection). */
export function paintSelection(doc: Document, range: Range): void {
  const win = doc.defaultView as WindowWithHighlights | null;
  if (!win?.CSS?.highlights || !win.Highlight) return;
  try {
    win.CSS.highlights.set('modu-selected', new win.Highlight(range));
    if (!doc.getElementById('modu-selected-highlight-style')) {
      const style = doc.createElement('style');
      style.id = 'modu-selected-highlight-style';
      style.textContent =
        '::highlight(modu-selected){background:rgba(242,193,78,0.45);color:inherit;}';
      (doc.head ?? doc.documentElement).appendChild(style);
    }
  } catch {
    /* older WebView */
  }
}

export function clearPaintedSelection(doc: Document): void {
  const win = doc.defaultView as WindowWithHighlights | null;
  try {
    win?.CSS?.highlights?.delete('modu-selected');
  } catch {
    /* ignore */
  }
}
