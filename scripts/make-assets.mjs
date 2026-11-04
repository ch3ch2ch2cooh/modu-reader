import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const out = join(process.cwd(), 'assets');
await mkdir(out, { recursive: true });

const BOOK = `
  <g fill="none" stroke="#f8efe0" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M512 424 C 438 382 336 372 268 402 L268 690 C 340 660 442 672 512 712 C 582 672 684 660 756 690 L756 402 C 688 372 586 382 512 424 Z"/>
    <path d="M512 424 L512 712"/>
  </g>
  <path d="M566 372 h58 v138 l-29 -22 -29 22 z" fill="#e9bb72" opacity="0.95"/>
`;

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a45f36"/>
      <stop offset="0.55" stop-color="#87482a"/>
      <stop offset="1" stop-color="#5d2f18"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect x="46" y="46" width="932" height="932" rx="196" fill="none" stroke="#f6e7d2" stroke-opacity="0.22" stroke-width="4"/>
  ${BOOK}
</svg>`;

const foregroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 512) scale(0.74) translate(-512 -512)">
    ${BOOK}
  </g>
</svg>`;

const backgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a45f36"/>
      <stop offset="0.55" stop-color="#87482a"/>
      <stop offset="1" stop-color="#5d2f18"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;

const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#f6f3ec"/>
  <g transform="translate(1366 1300)">
    <rect x="-310" y="-310" width="620" height="620" rx="150" fill="#87482a"/>
    <g transform="scale(0.66)">
      ${BOOK}
    </g>
  </g>
  <text x="1366" y="1760" text-anchor="middle" fill="#7a6a55" font-family="serif" font-size="108" letter-spacing="24">MODU READER</text>
</svg>`;

const splashDarkSvg = splashSvg
  .replace('<rect width="2732" height="2732" fill="#f6f3ec"/>', '<rect width="2732" height="2732" fill="#141414"/>')
  .replace('fill="#7a6a55"', 'fill="#8c8272"');

async function svgToPng(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(out, file));
  console.log('wrote', file);
}

await svgToPng(iconSvg, 1024, 'icon.png');
await svgToPng(foregroundSvg, 1024, 'icon-foreground.png');
await svgToPng(backgroundSvg, 1024, 'icon-background.png');
await svgToPng(splashSvg, 2732, 'splash.png');
await svgToPng(splashDarkSvg, 2732, 'splash-dark.png');
