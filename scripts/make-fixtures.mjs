import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const fixtures = join(root, 'fixtures');
await mkdir(fixtures, { recursive: true });

// ---------------------------------------------------------------- TXT sample
const chapters = [
  {
    title: '第一章 山中无历日',
    body: `山里的清晨来得迟。雾气从谷底漫上来，像一锅将沸未沸的水，把松林、石阶和小庙的飞檐都煮得模糊了。
守庙的老人姓陈，没人知道他的名字，山下的人都叫他陈道人。他每日辰时起身，扫一遍院子，点三炷香，然后把那只缺了口的粗瓷碗摆在门槛上，等过路的人来讨水喝。
这一天，第一个来的不是人，是一只狐狸。
那狐狸毛色灰败，左后腿一瘸一拐，在院门口站了很久，才试探着迈进来。陈道人没有赶它，只是把水碗往前推了推。`,
  },
  {
    title: '第二章 松风煮茶',
    body: `陈道人的茶很苦，苦得像把整座山都熬了进去。
他自己却喝得从容，一小口一小口地抿，仿佛那苦味里藏着什么了不得的回甘。
狐狸不喝茶。它蹲在檐下，看老人把晒干的松针塞进壶里，看灶膛里的火一下一下舔着壶底。雾气从壶嘴出来，和山里的雾连成一片，分不清哪一缕是人间的，哪一缕是天上的。
"你是从北边来的吧。"陈道人忽然开口。狐狸的耳朵动了一下。`,
  },
  {
    title: '第三章 夜雨寄北',
    body: `夜里下起了雨。雨点打在瓦上，起初是零零落落的，后来连成一片。
陈道人点了一盏油灯，坐在窗前补一件旧道袍。针脚很粗，可是很密。狐狸就卧在他脚边，尾巴卷着，偶尔抬眼看一看灯花。
门外忽然传来敲击声，三长两短。老人执针的手停了一停，又继续落下。
"不该来的。"他说。`,
  },
  {
    title: '第四章 空山',
    body: `第二天雨停了，山更空。
陈道人照旧扫院子，照旧点香。只是门槛上的水碗不见了，原地留下一个浅浅的圆印，像一枚被时间磨平的印章。
他弯腰看了很久，什么也没说。
山下的货郎后来跟人讲，那年冬天，他路过小庙，看见院里多了一只小小的狐狸石像，缺了一条后腿，位置正好在檐下。`,
  },
  {
    title: '第五章 尾声',
    body: `再后来，庙也塌了，松林也砍了，修了公路，通了车。
只有那块地方，每逢下雨，还会渗出一小片湿痕，形状像一只碗。
有人说那是地下水。也有人说，是山在给自己倒一杯茶。`,
  },
];

const txt = chapters
  .map((c) => `${c.title}\n\n${c.body}\n\n`)
  .join('');
await writeFile(join(fixtures, '山海拾遗.txt'), txt, 'utf8');

// --------------------------------------------------------------- EPUB sample
const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file(
  'META-INF/container.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
);

const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4e6e5d"/><stop offset="1" stop-color="#24382e"/>
  </linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <rect x="34" y="34" width="532" height="832" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="2"/>
  <text x="300" y="420" text-anchor="middle" fill="#f7f3e8" font-size="92" font-family="serif" letter-spacing="14">山月记</text>
  <text x="300" y="500" text-anchor="middle" fill="#d8d2c2" font-size="30" font-family="serif" letter-spacing="6">中岛敦 著</text>
  <text x="300" y="800" text-anchor="middle" fill="#c9c3b3" font-size="22" font-family="serif">墨读 · 测试样书</text>
</svg>`;
zip.file('OEBPS/images/cover.svg', coverSvg);

const chapterFiles = [
  { id: 'ch1', title: '第一章 山月', html: `<h1>第一章 山月</h1><p>我立于山巅，看那轮月亮从云海里浮出来。</p><p>月光落在松针上，像是给整座山镀了一层薄薄的银。</p><p>那一夜我做了一个很长的梦，梦见自己变成了一只老虎。</p>` },
  { id: 'ch2', title: '第二章 虎啸', html: `<h1>第二章 虎啸</h1><p>醒来时，山谷里回荡着虎啸。我不知道那是不是我自己的声音。</p><p>同行的李征说，他昨夜也听见了，还看见林中有两点幽绿的光。</p>` },
  { id: 'ch3', title: '第三章 归途', html: `<h1>第三章 归途</h1><p>下山的路比上山时短。我们谁都没有说话。</p><p>回到城里，我照旧读书、写字，只是偶尔会在半夜惊醒，闻到自己身上有一股若有若无的松脂气味。</p>` },
];

zip.file('OEBPS/text/ch1.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title>
<link rel="stylesheet" href="../styles/book.css" type="text/css"/></head><body>${chapterFiles[0].html}</body></html>`);
zip.file('OEBPS/text/ch2.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title>
<link rel="stylesheet" href="../styles/book.css" type="text/css"/></head><body>${chapterFiles[1].html}</body></html>`);
zip.file('OEBPS/text/ch3.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第三章</title>
<link rel="stylesheet" href="../styles/book.css" type="text/css"/></head><body>${chapterFiles[2].html}</body></html>`);

zip.file(
  'OEBPS/styles/book.css',
  `body { margin: 0 1em; line-height: 1.8; }
h1 { font-size: 1.4em; margin: 1em 0; }`,
);

zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head><body>
<nav epub:type="toc" id="toc"><h1>目录</h1><ol>
<li><a href="text/ch1.xhtml">第一章 山月</a></li>
<li><a href="text/ch2.xhtml">第二章 虎啸</a></li>
<li><a href="text/ch3.xhtml">第三章 归途</a></li>
</ol></nav></body></html>`);

zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:modu-test-0001</dc:identifier>
    <dc:title>山月记</dc:title>
    <dc:creator>中岛敦</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="css" href="styles/book.css" media-type="text/css"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="text/ch3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/><itemref idref="ch2"/><itemref idref="ch3"/>
  </spine>
</package>`);

const epubBuffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
await writeFile(join(fixtures, '山月记.epub'), epubBuffer);

// ---------------------------------------------------------------- PDF sample
function pdfEscape(text) {
  return text.replace(/[\\()]/g, (m) => `\\${m}`);
}

const pages = [
  ['Modu Reader Test Document', 'Page one. This PDF is generated for parser tests.', 'It contains two pages and basic text.'],
  ['Second Page', 'Reading progress for PDF books is stored as a page number.', 'Highlights are stored as normalized rectangles.'],
];

const objects = [];
objects.push('<< /Type /Catalog /Pages 2 0 R >>');
objects.push('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');

const pageObjIndices = [];
const fontObjNum = 2 * pages.length + 3;
for (let i = 0; i < pages.length; i += 1) {
  const pageObjNum = objects.length + 1;
  const contentObjNum = pageObjNum + 1;
  const stream = pages[i]
    .map((line, lineIndex) => `BT /F1 20 Tf 72 ${720 - lineIndex * 34} Td (${pdfEscape(line)}) Tj ET`)
    .join('\n');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>`,
  );
  pageObjIndices.push(pageObjNum);
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
}
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let i = 0; i < objects.length; i += 1) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objects.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
await writeFile(join(fixtures, 'test-document.pdf'), pdf, 'latin1');

console.log('fixtures written to', fixtures);
