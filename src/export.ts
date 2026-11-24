import type { ImageCard } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function finalAlt(c: ImageCard): string {
  return c.decorative ? '' : c.alt;
}

/** Fills alt on the pasted HTML, or builds a small page when only files were chosen. */
export function buildHtml(original: string | null, cards: ImageCard[]): string {
  if (original && original.trim()) {
    const doc = new DOMParser().parseFromString(original, 'text/html');
    const imgs = [...doc.querySelectorAll('img')];
    for (const c of cards) {
      const img = imgs[c.htmlIndex];
      if (img && c.status === 'done') img.setAttribute('alt', finalAlt(c));
    }
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }
  const body = cards
    .map((c) => `  <img src="${esc(c.file)}" alt="${esc(finalAlt(c))}">`)
    .join('\n');
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Images</title></head>\n<body>\n${body}\n</body>\n</html>\n`;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildCsv(cards: ImageCard[]): string {
  const rows = [['file', 'kind', 'alt', 'source', 'reason']];
  for (const c of cards) {
    rows.push([c.file, c.decorative ? 'decorative' : c.kind, finalAlt(c), c.source ?? '', c.reason ?? '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
