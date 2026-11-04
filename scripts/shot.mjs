import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'shots/shelf.png';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: false });
console.log('shot ->', out);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
