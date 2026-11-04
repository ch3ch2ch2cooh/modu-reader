/**
 * Rough page-size model used for whole-book page numbers. EPUB cannot be
 * paginated end-to-end without laying out every section, so we estimate from
 * the current typography: characters per line * lines per page.
 */
export function estimateCharsPerPage(
  width: number,
  height: number,
  fontSize: number,
  lineHeight: number,
): number {
  const charsPerLine = Math.max(8, Math.floor(width / Math.max(1, fontSize)));
  const linesPerPage = Math.max(4, Math.floor(height / Math.max(1, fontSize * lineHeight)));
  return charsPerLine * linesPerPage;
}

export function pageFromPercent(percent: number, total: number): number {
  return Math.max(1, Math.min(total, Math.round(percent * total)));
}
