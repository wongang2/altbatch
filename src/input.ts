import type { ImageCard } from './types';

let counter = 0;
const nextId = () => `c${++counter}`;

export function baseName(p: string): string {
  return decodeURIComponent(p.split('#')[0].split('?')[0].split('/').pop() ?? p);
}

export interface HtmlImg {
  src: string;
  alt: string | null;
}

/** `<img>` list of a pasted HTML string, in document order. */
export function parseHtmlImages(html: string): HtmlImg[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('img')].map((img) => ({
    src: img.getAttribute('src') ?? '',
    alt: img.getAttribute('alt'),
  }));
}

export function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function measure(blob: Blob): Promise<{ width: number; height: number; thumbUrl: string }> {
  const thumbUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.src = thumbUrl;
  try {
    await img.decode();
  } catch {
    return { width: 0, height: 0, thumbUrl };
  }
  return { width: img.naturalWidth, height: img.naturalHeight, thumbUrl };
}

async function makeCard(file: string, blob: Blob | undefined, mime: string, htmlIndex: number, existingAlt?: string): Promise<ImageCard> {
  const card: ImageCard = {
    id: nextId(), file, htmlIndex, mime, existingAlt,
    kind: 'photo', alt: existingAlt ?? '', decorative: false, approved: false, status: 'pending',
  };
  if (blob) {
    card.blob = blob;
    Object.assign(card, await measure(blob));
  }
  return card;
}

/** Cards from selected image files (folder or multi-select). */
export async function cardsFromFiles(files: File[]): Promise<ImageCard[]> {
  const imgs = files.filter((f) => f.type.startsWith('image/') || mimeFromName(f.name) !== 'application/octet-stream');
  const out: ImageCard[] = [];
  for (const f of imgs) out.push(await makeCard(f.name, f, f.type || mimeFromName(f.name), -1));
  return out;
}

/** Cards from pasted HTML. Relative paths are matched to selected files by file name, then remote fetch is tried. */
export async function cardsFromHtml(html: string, files: File[]): Promise<ImageCard[]> {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const out: ImageCard[] = [];
  const list = parseHtmlImages(html);
  for (let i = 0; i < list.length; i++) {
    const { src, alt } = list[i];
    const name = baseName(src) || `image-${i + 1}`;
    let blob: Blob | undefined;
    let error: string | undefined;
    const local = byName.get(name.toLowerCase());
    try {
      if (src.startsWith('data:')) {
        blob = await (await fetch(src)).blob();
      } else if (local && !/^https?:\/\//i.test(src)) {
        blob = local;
      } else if (/^(https?:)?\/\//i.test(src)) {
        const res = await fetch(src.startsWith('//') ? `https:${src}` : src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
      } else {
        error = 'Not found: choose the folder that contains this file';
      }
    } catch (e) {
      error = `Could not load (${(e as Error).message}). Choose the file from your computer.`;
    }
    const mime = blob ? (blob.type && blob.type.startsWith('image/') ? blob.type : mimeFromName(name)) : mimeFromName(name);
    const card = await makeCard(src.startsWith('data:') ? `inline-${i + 1}` : src, blob, mime, i, alt ?? undefined);
    if (error) { card.status = 'error'; card.error = error; }
    out.push(card);
  }
  return out;
}
