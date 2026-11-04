import { copyFile, mkdir, cp, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const src = join(root, 'node_modules/pdfjs-dist');
const dest = join(root, 'public/pdfjs');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(dest, { recursive: true });
  for (const dir of ['cmaps', 'standard_fonts']) {
    const from = join(src, dir);
    const to = join(dest, dir);
    if (await exists(to)) continue;
    if (!(await exists(from))) continue;
    await cp(from, to, { recursive: true });
    console.log(`[pdf-assets] copied ${dir}`);
  }
  const wasm = join(src, 'wasm');
  if ((await exists(wasm)) && !(await exists(join(dest, 'wasm')))) {
    await cp(wasm, join(dest, 'wasm'), { recursive: true });
    console.log('[pdf-assets] copied wasm');
  }
}

main().catch((err) => {
  console.error('[pdf-assets] failed', err);
  process.exitCode = 1;
});
