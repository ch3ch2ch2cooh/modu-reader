import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const FIXTURES = {
  epub: resolve('fixtures/山月记.epub'),
  txt: resolve('fixtures/山海拾遗.txt'),
  pdf: resolve('fixtures/test-document.pdf'),
};

const AI_SETTINGS = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  searchProvider: 'none',
  searchKey: '',
  contextChars: 800,
  temperature: 0.6,
  autoClassify: false,
};

const PREFS = {
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.85,
  paragraphSpacing: 0.9,
  margin: 22,
  themeId: 'paper',
  pageMode: 'paginated',
  volumeKeys: true,
  showSettingsOnOpen: false,
};

async function resetApp(page: Page, aiOverrides: Partial<typeof AI_SETTINGS> = {}) {
  const ai = { ...AI_SETTINGS, ...aiOverrides };
  await page.addInitScript(
    ([prefs, settings]) => {
      if (!localStorage.getItem('modu-settings')) {
        localStorage.setItem(
          'modu-settings',
          JSON.stringify({ state: { prefs, ai: settings }, version: 2 }),
        );
      }
    },
    [PREFS, ai] as const,
  );
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const request = indexedDB.deleteDatabase('modu-reader');
        request.onsuccess = () => done();
        request.onerror = () => done();
        request.onblocked = () => done();
      }),
  );
  await page.reload();
  await expect(page.locator('.shelf-header h1')).toHaveText('书架');
}

async function importBooks(page: Page, files: string[], expected: number) {
  await page.locator('input[type=file]').setInputFiles(files);
  await expect(page.locator('.book-cell')).toHaveCount(expected, { timeout: 120_000 });
}

async function showChrome(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    if (await page.locator('.reader-top.is-visible').count()) return;
    const box = await page.locator('.reader-stage').boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + 260);
    await page.waitForTimeout(300);
  }
}

async function goBack(page: Page) {
  await showChrome(page);
  await page.locator('.reader-top .icon-button').first().click();
  await expect(page.locator('.shelf-header h1')).toBeVisible();
}

test('导入 EPUB / TXT / PDF 并识别封面与章节', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.epub, FIXTURES.txt, FIXTURES.pdf], 3);

  await expect(page.locator('.book-cell__title', { hasText: '山月记' })).toBeVisible();
  await expect(page.locator('.book-cell__title', { hasText: '山海拾遗' })).toBeVisible();
  await expect(page.locator('.book-cell__meta', { hasText: '中岛敦' }).first()).toBeVisible();

  // covers: generated for txt, extracted for epub/pdf
  const covers = page.locator('.book-grid .book-cover img');
  await expect(covers).toHaveCount(3);

  await page.locator('.book-cell__button', { hasText: '山月记' }).click();
  await expect(page.locator('.reader-top__title span')).toHaveText('第一章 山月');
  const frame = page.frameLocator('.reader-stage iframe');
  await expect(frame.locator('body')).toContainText('我立于山巅');
  await goBack(page);

  await page.locator('.book-cell__button', { hasText: '山海拾遗' }).click();
  await expect(page.locator('.reflow-body')).toContainText('山里的清晨来得迟');
  await goBack(page);

  await page.locator('.book-cell__button', { hasText: 'test-document' }).click();
  await expect(page.locator('.pdf-page')).toHaveCount(2);
  await expect(page.locator('.reader-top__title span')).toContainText('第 1 / 2 页');
  await goBack(page);
});

test('字体、字号与背景色设置后生效并持久化', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.txt], 1);
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reflow-body')).toBeVisible();

  const body = page.locator('.reflow-body');
  const before = await body.evaluate((el) => getComputedStyle(el).fontSize);
  const beforeBg = await page.locator('.reader-page').evaluate((el) => getComputedStyle(el).backgroundColor);

  await goBack(page);
  await page.locator('.tab-bar a', { hasText: '设置' }).click();
  await expect(page.locator('.theme-swatch').first()).toBeVisible();
  const previewBefore = await page
    .locator('.reading-preview')
    .evaluate((el) => getComputedStyle(el).fontSize);
  await page.locator('.theme-swatch', { hasText: '夜间' }).click();
  await page.locator('.step-button', { hasText: 'A+' }).click();
  await page.locator('.step-button', { hasText: 'A+' }).click();
  await page.waitForTimeout(300);
  const previewAfter = await page
    .locator('.reading-preview')
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(parseFloat(previewAfter)).toBeGreaterThan(parseFloat(previewBefore));

  await page.locator('.tab-bar a', { hasText: '书架' }).click();
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reader-page')).toHaveAttribute('data-theme', 'night');
  const after = await body.evaluate((el) => getComputedStyle(el).fontSize);
  const afterBg = await page.locator('.reader-page').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
  expect(afterBg).not.toBe(beforeBg);
  expect(afterBg).toBe('rgb(28, 28, 30)');

  await goBack(page);
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reader-page')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('.reflow-body')).toHaveCSS('font-size', after);
});

test('书签、划线、笔记与阅读进度恢复', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.txt], 1);
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reflow-body')).toBeVisible();

  // bookmark the current position
  await showChrome(page);
  await page.locator('.reader-action', { hasText: '书签' }).click();

  // create a highlight by selecting text and pressing a colour
  await page.evaluate(() => {
    const paragraph = document.querySelector('.reflow-body p');
    if (!paragraph || !paragraph.firstChild) return;
    const range = document.createRange();
    range.setStart(paragraph.firstChild, 2);
    range.setEnd(paragraph.firstChild, 16);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector('.reflow-scroll')
      ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.selection-toolbar')).toBeVisible();
  await page.locator('.selection-toolbar .color-dot').first().click();
  await expect(page.locator('.reflow-highlight')).toHaveCount(1);

  // write a real note on a second selection
  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('.reflow-body p');
    const paragraph = paragraphs[1];
    if (!paragraph || !paragraph.firstChild) return;
    const range = document.createRange();
    range.setStart(paragraph.firstChild, 0);
    range.setEnd(paragraph.firstChild, 8);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector('.reflow-scroll')
      ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.selection-toolbar .tool-button', { hasText: '笔记' }).click();
  await page.locator('.note-form textarea').fill('这是一条测试笔记');
  await page.locator('.note-form .primary-button').click();
  await expect(page.locator('.reflow-highlight')).toHaveCount(2);

  // go to chapter 2, leave, return -> position restored
  await showChrome(page);
  await page.locator('.reader-pager button').last().click();
  await expect(page.locator('.reader-top__title span')).toHaveText('第二章 松风煮茶');
  await page.waitForTimeout(900);
  await goBack(page);
  await expect(page.locator('.continue-card')).toContainText('第二章 松风煮茶');
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reader-top__title span')).toHaveText('第二章 松风煮茶');
  await goBack(page);

  // notes tab lists the note
  await page.locator('.tab-bar a', { hasText: '笔记' }).click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.locator('.note-card').first()).toContainText('这是一条测试笔记');
});

test('AI 注释：选中文字→DeepSeek→保存为笔记', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.txt], 1);

  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as { messages: { content: string }[] };
    expect(JSON.stringify(payload.messages)).toContain('山里的清晨');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: '这句话描写山谷清晨的雾气，用“煮”字把静止的雾写活了。',
            },
          },
        ],
      }),
    });
  });

  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reflow-body')).toBeVisible();
  await page.evaluate(() => {
    const paragraph = document.querySelector('.reflow-body p');
    if (!paragraph || !paragraph.firstChild) return;
    const range = document.createRange();
    range.setStart(paragraph.firstChild, 0);
    range.setEnd(paragraph.firstChild, 10);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector('.reflow-scroll')
      ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.selection-toolbar .tool-button', { hasText: 'AI' }).click();
  await expect(page.locator('.ai-answer')).toContainText('把静止的雾写活了', { timeout: 60_000 });

  await page.locator('.ai-chat__form input').fill('这里的“煮”字好在哪里？');
  await page.locator('.ai-chat__form button').click();
  await expect(page.locator('.ai-chat__item')).toContainText('这里的“煮”字好在哪里？', {
    timeout: 30_000,
  });

  await page.locator('.sheet-head .icon-button').click();
  await goBack(page);
  await page.locator('.tab-bar a', { hasText: '笔记' }).click();
  await expect(page.locator('.note-card__ai')).toContainText('把静止的雾写活了');
});

test('分类：新建、归类与筛选', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.txt], 1);

  await page.locator('.shelf-header__actions .icon-button[aria-label="分类管理"]').click();
  await page.locator('.category-add input').fill('历史');
  await page.locator('.category-add .primary-button').click();
  await expect(page.locator('.category-list__name')).toHaveText('历史');
  await page.locator('.sheet-head .icon-button').click();

  await page.locator('.book-cell__more').first().click();
  await page.locator('.category-pill', { hasText: '历史' }).click();
  await page.locator('.sheet-head .icon-button').click();

  await page.locator('.chip', { hasText: '历史' }).click();
  await expect(page.locator('.book-cell')).toHaveCount(1);
  await page.locator('.chip', { hasText: '未分类' }).click();
  await expect(page.locator('.book-cell')).toHaveCount(0);
});

test('PDF 文本高亮、翻页进度与重开恢复', async ({ page }) => {
  await resetApp(page);
  await importBooks(page, [FIXTURES.pdf], 1);
  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.pdf-page')).toHaveCount(2);
  await expect(page.locator('.textLayer span').first()).toBeAttached();

  await page.evaluate(() => {
    const span = document.querySelector('.textLayer span');
    if (!span) return;
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector('.pdf-scroll')
      ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.selection-toolbar')).toBeVisible();
  await page.locator('.selection-toolbar .color-dot').first().click();
  await expect(page.locator('.pdf-highlight')).toHaveCount(1);

  await showChrome(page);
  await page.locator('.reader-pager button').last().click();
  await expect(page.locator('.reader-top__title span')).toContainText('第 2 / 2 页');
  await page.waitForTimeout(900);
  await goBack(page);

  await page.locator('.book-cell__button').first().click();
  await expect(page.locator('.reader-top__title span')).toContainText('第 2 / 2 页');
  await expect(page.locator('.pdf-highlight')).toHaveCount(1);
});

test('导入时 AI 自动分类', async ({ page }) => {
  await resetApp(page, { autoClassify: true });

  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    const payload = route.request().postDataJSON() as { messages: { content: string }[] };
    const prompt = JSON.stringify(payload.messages);
    expect(prompt).toContain('山海拾遗');
    expect(prompt).toContain('可选分类');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '{"category":"历史","reason":"测试分类"}' } }],
      }),
    });
  });

  await importBooks(page, [FIXTURES.txt], 1);
  await expect(page.locator('.chip', { hasText: '历史' })).toBeVisible({ timeout: 30_000 });

  await page.locator('.chip', { hasText: '历史' }).click();
  await expect(page.locator('.book-cell')).toHaveCount(1);

  await page.locator('.book-cell__more').first().click();
  await expect(page.locator('.category-pill.is-active', { hasText: '历史' })).toBeVisible();
});

test('批量分类已有未分类书籍', async ({ page }) => {
  await resetApp(page, { autoClassify: false });

  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '{"category":"小说","reason":"批量分类"}' } }],
      }),
    });
  });

  await importBooks(page, [FIXTURES.txt], 1);
  await expect(page.locator('.chip', { hasText: '小说' })).toHaveCount(0);

  await page.locator('.shelf-header__actions .icon-button[aria-label="批量管理"]').click();
  await page.locator('.manage-item', { hasText: 'AI 分类未分类书籍' }).click();
  await expect(page.locator('.chip', { hasText: '小说' })).toBeVisible({ timeout: 60_000 });

  await page.locator('.chip', { hasText: '小说' }).click();
  await expect(page.locator('.book-cell')).toHaveCount(1);
});
