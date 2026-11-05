import { escapeHtml } from './utils';

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function urlToDataUrl(url: string): Promise<string | undefined> {
  try {
    if (url.startsWith('data:')) return url;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return undefined;
  }
}

const COVER_W = 480;
const COVER_H = 720;

/** Normalize any image into a 2:3 JPEG/PNG cover data URL. */
export async function imageUrlToCover(url: string): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  const dataUrl = await urlToDataUrl(url);
  if (!dataUrl) return undefined;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = COVER_W;
        canvas.height = COVER_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = '#efe9dc';
        ctx.fillRect(0, 0, COVER_W, COVER_H);
        const scale = Math.min(COVER_W / img.width, COVER_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

const GRADIENTS: [string, string][] = [
  ['#b06a3f', '#6b3a1f'],
  ['#4e6e5d', '#2f4639'],
  ['#5a6b8c', '#333f57'],
  ['#8c5a6b', '#57333f'],
  ['#7a6a4f', '#4a3f2d'],
  ['#3f6a6e', '#254245'],
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Generate a typographic cover for books without artwork (txt/mobi often lack one). */
export function makeGeneratedCover(title: string, author: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = COVER_W;
    canvas.height = COVER_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const [start, end] = GRADIENTS[hashString(title) % GRADIENTS.length];
    const gradient = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
    gradient.addColorStop(0, start);
    gradient.addColorStop(1, end);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, COVER_W, COVER_H);

    // subtle border
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, COVER_W - 36, COVER_H - 36);

    const chars = Array.from(title.trim()).slice(0, 12);
    const perLine = chars.length > 8 ? 4 : 3;
    const lines: string[] = [];
    for (let i = 0; i < chars.length; i += perLine) {
      lines.push(chars.slice(i, i + perLine).join(''));
    }

    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = lines.length > 2 ? 82 : 96;
    ctx.font = `600 ${fontSize}px "Noto Serif SC", "Songti SC", serif`;
    const startY = COVER_H / 2 - ((lines.length - 1) * fontSize * 1.12) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, COVER_W / 2, startY + i * fontSize * 1.12);
    });

    if (author) {
      ctx.font = '400 26px "Noto Sans SC", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(Array.from(author).slice(0, 14).join(''), COVER_W / 2, COVER_H - 74);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(COVER_W / 2 - 34, startY + lines.length * fontSize * 1.12 + 8);
    ctx.lineTo(COVER_W / 2 + 34, startY + lines.length * fontSize * 1.12 + 8);
    ctx.stroke();

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return undefined;
  }
}

export function coverPlaceholderHtml(title: string): string {
  return escapeHtml(title);
}

/** True for a blank/near-white cover image (e.g. a scanned PDF's empty first page). */
export async function isBlankCover(dataUrl?: string): Promise<boolean> {
  if (!dataUrl) return true;
  if (typeof document === 'undefined') return false;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        let sumSq = 0;
        let nonWhite = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          if (lum < 235) nonWhite += 1;
        }
        const mean = sum / pixels;
        const variance = Math.max(0, sumSq / pixels - mean * mean);
        const deviation = Math.sqrt(variance);
        resolve(deviation < 7 || (nonWhite / pixels < 0.004 && mean > 245));
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}
