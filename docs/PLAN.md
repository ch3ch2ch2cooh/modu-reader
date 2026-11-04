# 墨读 · 分阶段实施与验收记录

> 目标：一个可在安卓端离线使用的电子书阅读器，覆盖 EPUB / PDF / TXT / MOBI / AZW3，支持排版、书架分类、最近阅读、进度恢复、书签、划线笔记和 DeepSeek 注释。

技术栈：Capacitor 8 + React 19 + TypeScript + Vite；Dexie(IndexedDB)；epub.js；pdf.js；vendored MOBI/KF8 解析器。

## 阶段与验收结果

| 阶段 | 内容 | 验收方式 | 状态 |
| --- | --- | --- | --- |
| S0 环境与骨架 | 安装 JDK 21 + Android SDK，搭建 Vite/React/Capacitor 工程，打通 Gradle | `gradlew assembleDebug` 产出 APK；`aapt2 dump badging` 显示 `com.modu.reader`、minSdk 24、targetSdk 36 | ✅ |
| S1 数据层 | `books / files / contents / progress / bookmarks / notes / categories` 七张表与仓储层 | `npm test` 中 repo 用例：增删改查、级联删除、最近阅读、分类、书签、笔记 | ✅ 21 个单测全绿 |
| S2 书架与导入 | 多选导入、格式识别、封面网格、空态、导入进度、重复检测、最近阅读卡片 | Playwright：导入 3 本 → 3 张卡片 + 3 张封面；点击进入阅读 | ✅ |
| S3 全格式解析 | EPUB（目录/封面）、PDF（大纲/首页封面）、TXT（GBK/Big5 识别 + 章节正则）、MOBI/KF8（TOC/封面/图片） | 单测：TXT 分章、格式探测；真机样例：《Pride and Prejudice》AZW3 解析出 74 章 / 73 万字，MOBI 81 章；浏览器内导入耗时约 2.6s（两本 25MB） | ✅ |
| S4 阅读排版 | 6 主题、3 字体、字号/行距/段距/页边距、设置持久化 | E2E：夜间主题 + 两次 A+ 后 `font-size` 增大、背景变为 `rgb(28,28,30)`，返回再进入仍保持 | ✅ |
| S5 进度与继续阅读 | 归一化 Locator、防抖保存、退出/切后台 flush、首页继续阅读、重开跳转 | E2E：翻到第二章 → 返回书架显示「第二章 松风煮茶」→ 重开仍在第二章 | ✅ |
| S6 分类 | 新建/重命名/删除分类、书籍归类、筛选、未分类 | E2E：新建「历史」→ 归类 → 历史筛选 1 本 → 未分类 0 本 | ✅ |
| S7 书签 | 当前页书签、列表、跳转、删除 | E2E：加书签后进入「书签与笔记」；单测覆盖存储 | ✅ |
| S8 高亮与笔记 | 划选文字四色高亮、写笔记、列表、跳转、删除；EPUB/PDF/TXT 三引擎各自实现 | E2E：TXT 选区→高亮 DOM 出现 1 个 `<mark>`；第二条选区写笔记后共 2 条，笔记页可见 | ✅ |
| S9 AI 注释 | DeepSeek Chat（原生 HTTP 绕 CORS）、默认 Bing 搜索、上下文拼接、自动存为笔记 | E2E：Playwright 拦截 `api.deepseek.com` 返回固定注释，校验请求包含正文、面板展示、笔记页出现 AI 摘要；真机真实 Key 下 2 秒返回注释 | ✅ |
| S10 安卓集成 | 图标/启动图、状态栏、返回键、SAF 文件选择（`<input type=file>` 由 Capacitor 桥接）、debug 签名 APK | `assembleDebug` + `apksigner verify`；真机（Redmi K70 Ultra / Android 16）导入 TXT/EPUB/PDF/AZW3、阅读、夜间主题、书签/高亮、PDF 翻页与高亮、强杀重启后数据仍在；APK 侧载安装见 README | ✅ |
| S11 AI 自动分类 | 导入完成后用 DeepSeek 从固定分类表选类，自动创建 / 归入分类；无 Key 或失败时本地关键词回退；设置页可开关 | 单测：规则与分类归一化；E2E：mock 分类响应后书架出现「历史」分类并自动归类；真机真实 Key 下《人类简史》→「历史」 | ✅ |
| S12 批量管理 | 「⋮ → 批量管理」：批量导入队列、AI 批量分类（仅未分类 / 全部重分类）、进度与停止 | E2E：批量分类未分类书籍后生成「小说」分类并归类；真机调起系统多选文件选择器，入口按未分类数量启用 | ✅ |
| S13 文件夹导入与滑动翻页 | 原生 SAF 插件（ACTION_OPEN_DOCUMENT_TREE）列举文件夹、逐本读取；80MB 上限；引擎级左右滑动翻页（EPUB 注入 iframe） | 真机「书」文件夹预览 107 本 / 839MB、跳过 5 本超大文件；TXT、EPUB 滑动翻章通过；E2E 8 项全绿 | ✅ |
| S14 状态栏留白 / 音量键 / 中部轻触工具栏 | 阅读区域整体下移一个状态栏高度并叠加同色遮罩；去掉 Aa 悬浮按钮与底栏“排版”；轻触屏幕中部呼出/收起工具栏；EPUB iframe 轻点同样生效；原生音量键翻页 | 真机：中部轻触工具栏 1→0→1 正常开关，不再弹出排版面板；翻页后首行完整 | ✅ |
| S15 阅读设置归位 | 阅读页不再弹出排版面板，字体/字号/主题等统一放在「设置」页；设置页保留实时预览 | 真机：轻触中部只切换工具栏；在设置页改字体后打开书生效并持久化 | ✅ |
| S16 内置中文字体 | 打包 Noto Serif SC（宋）与 LXGW WenKai（楷），向 EPUB iframe 注入 @font-face；字体切换后重新定位修复空白页 | 真机：1984 切宋体/楷体立即变字形；切换后不再出现空白列 | ✅ |
| S17 页数统计 | 按当前排版计算全书页数与当前页：PDF 精确页数，EPUB 用 locations + 当前节每页字符数估算，TXT/MOBI 按总字符与排版估算；底栏显示页码 | 真机：1984 22px 约 639 页，28px 约 1009 页；翻页后当前页 13→19 同步变化 | ✅ |
| S18 翻页动画 | 引擎触发 onTurn，舞台做 0.2s 横移+淡入；音量键/滑动/按钮共用；尊重 reduced-motion | 真机点击下一页捕获到 page-turn-next 动画类，EPUB 翻页动画生效 | ✅ |

## 关键实现说明

### 统一阅读模型

三种引擎实现同一个 `ReaderEngine` 接口：

- **EpubEngine**：epub.js 分页渲染，CFI 定位，`rendition.on('selected')` 获取选区，`annotations.highlight` 恢复高亮；后台生成 locations 用于百分比与进度条跳转。
- **ReflowEngine**：TXT/MOBI/AZW3 共用，章节 HTML + 滚动；字符偏移定位，Range 包装 `<mark>` 实现高亮。
- **PdfEngine**：pdf.js 画布 + 文本层，按页懒加载，IntersectionObserver 渲染；高亮保存为页内归一化矩形。

`Locator` 是进度、书签、笔记共用的定位值：

```ts
type Locator =
  | { type: 'epub'; cfi: string; href?: string; chapterIndex?: number }
  | { type: 'pdf'; page: number }
  | { type: 'reflow'; chapterIndex: number; offset: number; endOffset?: number; ratio: number };
```

### 格式解析

- EPUB：`book.loaded.navigation` 拍平目录，`coverUrl()` 提取封面，失败则 canvas 生成。
- PDF：`getOutline()` 转页码目录，第一页渲染成封面。
- TXT：`jschardet` 采样识别编码（GBK→gb18030），标题正则支持中文章节/序章/番外/Chapter N；无标题按 6000 字分节。
- MOBI/AZW3：`src/vendor/mobi-parser.mjs`（基于 `@lingo-reader/mobi-parser`）修复 KF8 `<link>` 非 kindle 资源导致崩溃的问题；导入时把章节内 blob 图片内联为 data URL。

### AI 注释

1. 选区 → `engine.getContext()` 取前后各 N 字与章节名；
2. 若配置搜索服务，先检索并取前 4 条摘要；
3. 组装 system + user prompt 调用 `POST /chat/completions`；
4. 结果连同选区、颜色、位置写入 `notes` 表，`ai` 字段保存答案与来源。

原生端使用 `CapacitorHttp`，避免 WebView CORS；浏览器端用 fetch，测试通过路由拦截验证。

## 验证命令

```bash
npm test        # 26 passed
npm run e2e     # 8 passed
npm run build   # tsc + vite build
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1
```

## 真机适配修复（Redmi K70 Ultra / Android 16）

- **PDF 导入失败**：WebView 143 缺少 `Map.prototype.getOrInsertComputed`，pdf.js v6 直接抛 `TypeError`。新增 `src/lib/mapHelpers.ts` 在启动时 polyfill 主线程与 Worker 可用的 Map/WeakMap 方法。
- **状态栏遮挡**：Android 15+ 强制边到边，`env(safe-area-inset-*)` 在 WebView 中为 0；Capacitor 8 会注入 `--safe-area-inset-*` CSS 变量，已改为优先使用它们。
- **阅读器顶栏透出正文**：顶栏半透明渐变会与正文标题重影，改为与主题同色的不透明栏。
- **长书名溢出**：`test-document` 这类无空格长标题会压到相邻书格，已加 `overflow-wrap: anywhere`。

## 未覆盖 / 后续可做

- 真机安装与触屏手势的最终人工验收（当前环境无硬件虚拟化，无法跑安卓模拟器）。
- 云同步、导出笔记、TTS、简繁转换、双栏平板布局。
- 受 DRM 保护的 AZW3/MOBI 无法解析（会提示导入失败）。
- 搜索服务需用户自备 Key；DeepSeek API 本身不含联网。
