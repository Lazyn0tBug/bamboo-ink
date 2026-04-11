---
title: 'feat: HTML5 规范化 + Markdown 转换双管道'
type: feat
status: active
date: 2026-04-10
origin: docs/session-checkpoint-content-pipeline-20260410.md
---

# feat: HTML5 规范化 + Markdown 转换双管道

## Overview

构建两步数据管道：先将 9,046 个 FrontPage/MSHTML 格式的老旧 HTML 文件规范化为语义化 HTML5（使用 Tailwind CSS v4 + OKLCH 颜色），再从规范化 HTML 生成 Markdown + Frontmatter。产出两份数字资产：

1. **规范化 HTML** — 语义化、可独立分发、使用现代 CSS 的清洁 HTML5
2. **Markdown 文件** — Astro Content Collection 消费，含完整 frontmatter

输出位置：`src/normalized-html/`（HTML 资产）和 `content/guji/`（Markdown 资产），均不修改原始 `~/data/古籍/` 数据。

## Problem Frame

原始 HTML 文件（438MB，9,046 个）来自多种来源：FrontPage 4.0、MSHTML 5.0、Netscape 4.6、Word 导出。无语义化标签（标题用 `<FONT size=5>`，正文在 `<PRE>` 内），嵌套 3-4 层 `<FONT>`，内联大写 CSS。Turndown 直接转换完全失败。

审计 21 个文件后发现 **4 种内容模板** 覆盖 95%+ 文件：

| 模板 | 特征 | 占比 |
|------|------|------|
| A: `<pre>` 纯文本 | 标题 `<font>`，正文 `<pre>` 内纯文本 | ~15% |
| B: `<P>` 段落 | `<P align=justify>` 段落 + `<FONT>` 包裹 | ~50% |
| C: Word 单文件 | `<H1>` 书 + `<H2>` 章 + 全部内容内联 | ~10% |
| D: 目录页 | `<table>` 表格 + `<a href>` 章节链接 | ~20% |
| F: 异常值 | 外链 .txt、Netscape 生成等 | ~5% |

详见 `docs/session-checkpoint-content-pipeline-20260410.md`。

## Requirements Trace

- R1. 规范化 HTML 输出到 `src/normalized-html/` 目录，保持与原数据相同的分类目录结构
- R2. Markdown 输出到 `content/guji/` 目录，匹配 Astro Content Collection schema
- R3. 规范化 HTML 使用语义化标签（`<article>`, `<h1>`-`<h6>`, `<p>`, `<nav>`）
- R4. 规范化 HTML 使用 Tailwind CSS v4 utility classes + OKLCH 颜色
- R5. Markdown frontmatter 包含 `title`, `docType`, `category`, `subcategory`, `author`, `dynasty`, `date`, `source`
- R6. 不修改原始 `~/data/古籍/` 数据（只读输入）
- R7. 增量验证：先验证 论语（单文件 + 多文件两个 case），再扩展到 经部 全量
- R8. 支持 `--book <name>` 参数单书转换和 `--category <name>` 批量转换

## Scope Boundaries

- **In scope**: 经史子集四部的正文和目录 HTML 规范化 + Markdown 转换
- **Out of scope**: AI 标注、搜索功能、跨文本引用图（Phase 2+ 功能）
- **Out of scope**: 古文观止（外链 .txt，Template F-1）和首页（master nav）在首轮转换中标记为 skipped
- **Out of scope**: 图片资源迁移（bg.gif, banner.gif 等暂不处理，规范化 HTML 中移除背景图引用）

## Context & Research

### Relevant Code and Patterns

- `scripts/convert-htm-to-md.js` — 现有转换脚本（212 行），使用 cheerio + Turndown + iconv-lite，有 3 个已知 bug（category 单字映射、docType 不匹配、slice(0,10) 硬编码）
- `scripts/parse-catalogs.js` — 藏目解析脚本，提取作者/朝代/分类元数据
- `scripts/lib/` — 共享库目录（已有 `dictionary.json` 输出）
- `src/content.config.ts` — Zod schema：`title`, `docType: ['catalog'|'content']`, `category: 四部`, `subcategory`, `author`, `dynasty`, `date`, `source`
- `src/styles/global.css` — Tailwind v4 + OKLCH 中国传统色定义，`@theme` 块
- `content/catalogs/` — 4 个藏目 Markdown 文件（经史子集）

### Institutional Learnings

- 藏目路径与磁盘路径不匹配（目录写 `经部/论语/index.htm`，实际是 `经部/论语.htm`）— 映射算法需容错
- 所有经部文件均为 UTF-8（无 GBK），编码检测的 GBK 分支可能永远不触发
- 藏目引导已实施经验：字典解析 + Markdown + Content Collections 流程已验证可行

### Key Technical Decisions

- **双管道架构**：HTML → 规范化 HTML → Markdown（而非 HTML → Markdown 一步到位）
  - 理由：规范化 HTML 本身就是一份数字资产；且从干净 HTML 转 Markdown 可复用 Turndown，减少 Markdown 转换的复杂度
  - 见 origin: `docs/session-checkpoint-content-pipeline-20260410.md`
- **cheerio 提取 + 重建**：不用 Turndown 直接处理原始 HTML，而是用 cheerio 提取结构化数据后重建语义化 HTML
- **Tailwind v4 直接注入**：规范化 HTML 使用内联 Tailwind CDN（开发阶段）或 `@import` 引用项目 `src/styles/global.css` 中的 color tokens
- **增量验证**：论语（论语.htm 单文件 + 论语集注/ 多文件）先验证，再扩展到经部全量
  - 理由：论语集注测试多文件拼接，论语.htm 测试单文件提取
  - 见 origin: office hours design doc

## Open Questions

### Resolved During Planning

- **规范化 HTML 放在哪里？** → `src/normalized-html/`，保持与原数据相同的分类结构（`src/normalized-html/经部/论语.htm`）
- **Markdown 放在哪里？** → `content/guji/`，按四部分类（`content/guji/经部/论语.md`）
- **使用 Turndown 还是自定义 Markdown 生成？** → 规范化 HTML 完成后 Turndown 可以直接工作，无需自定义 Markdown 生成
- **编码问题？** → 所有检查的文件均为 UTF-8，保留检测逻辑但不作为优先处理

### Deferred to Implementation

- **OKLCH 颜色具体值**：规范化 HTML 中使用哪些 Tailwind utility classes 还是自定义 OKLCH 值？取决于规范化 HTML 是否需要独立于 Astro 项目运行
- **`<PRE>` 内段落分割**：Template A 和 C 的正文在 `<PRE>` 内，如何判断段落边界（空行？特定标记？章节标题颜色？）需要在实现时观察具体文本
- **多文件拼接的章节标题提取**：论语集注/001.htm 等章节文件的标题格式需要在实现时确认

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────┐
│  ~/data/古籍/        │  (只读，9,046 HTML)
│  原始 FrontPage HTML │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Template Detector   │  根据 HTML 特征判定模板 A/B/C/D/F
│  (启发式分类)        │  <pre> → A, <p justify> → B, <H1> → C, <table nav> → D
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────────────┐
│  Normalizer          │────→│  src/normalized-html/ │  ← 资产 1: 语义化 HTML5
│  (cheerio 重建)      │     │  经部/论语.htm        │     Tailwind classes
│                      │     │  ...                  │     OKLCH 颜色
└────────┬────────────┘     └──────────────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────────────┐
│  Turndown +          │────→│  content/guji/        │  ← 资产 2: Markdown
│  Frontmatter 注入    │     │  经部/论语.md         │     Astro Content Collection
└─────────────────────┘     └──────────────────────┘
```

**Normalizer 输出规范**（每个模板）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>论语</title>
  <!-- Tailwind v4 通过 CSS 变量引用项目 OKLCH tokens -->
</head>
<body class="bg-xuanzhi-50 text-mo-600">
  <article>
    <h1 class="font-li text-3xl text-zhusha-500">论语</h1>
    <section>
      <h2 class="font-kai text-xl text-dai-500">论语序说</h2>
      <p class="font-kai leading-loose">史记世家曰：孔子名丘...</p>
      <p class="font-kai leading-loose">何氏曰：鲁论语二十篇...</p>
    </section>
  </article>
</body>
</html>
```

## Implementation Units

- [ ] **Unit 1: 模板检测器 + 论语验证（论语.htm 单文件）**

**Goal:** 实现启发式模板检测器，确认 论语.htm 的模板分类正确，输出规范化 HTML 和 Markdown。

**Requirements:** R1, R2, R3, R4, R5, R7

**Dependencies:** 无（从零开始）

**Files:**
- Create: `scripts/normalize-html.mjs` — 主规范化脚本
- Create: `scripts/lib/template-detector.mjs` — 模板检测逻辑
- Create: `src/normalized-html/经部/论语.htm` — 输出（规范化 HTML）
- Create: `content/guji/经部/论语.md` — 输出（Markdown）
- Modify: `scripts/convert-htm-to-md.js` — 修复 category 单字映射 bug（`经`→`经部`）
- Test: `tests/html-normalization.test.ts`

**Approach:**
1. 实现 `detectTemplate(html)` 函数，根据以下规则判定模板：
   - 包含 `<PRE>` 且正文在 `<PRE>` 内 → Template A
   - 包含 `<P align=justify>` 或 `<P align="justify">` → Template B
   - 包含 `<H1>` 且有 `（全书终）` → Template C
   - 包含 `<table>` 且 body 内容主要是 `<a href>` 链接 → Template D
   - 以上都不匹配 → Template F（异常值）
2. 实现 `normalizeTemplateA($)` — 针对 `<PRE>` 模板：
   - 提取标题：`<FONT size=5|6>` 或 `<FONT color=#ff6666>` 内的文本
   - 提取章节标题：`<FONT color=#cc33cc>` 居中文本 → `<h2>`
   - 提取正文：`<PRE>` 内文本，按空行分割为 `<p>` 段落
   - 移除导航、脚本、样式、`<CENTER>`、`<HR>` 等装饰
3. 输出规范化 HTML 到 `src/normalized-html/经部/论语.htm`
4. 用 Turndown 将规范化 HTML 转为 Markdown
5. 注入 frontmatter（从 `parse-catalogs.js` 的字典数据或文件名提取元数据）
6. 输出 Markdown 到 `content/guji/经部/论语.md`
7. 运行 `bun run build` 验证 Astro 能正确消费该 Markdown

**Patterns to follow:**
- 现有 `scripts/convert-htm-to-md.js` 的 cheerio + Turndown 架构
- ESM 模块（`import` 语法，`fileURLToPath`）

**Test scenarios:**
- Happy path: 输入 `~/data/古籍/经部/论语.htm` → 输出规范化 HTML 含 `<h1>论语</h1>` 和 `<article>` 标签 → 输出 Markdown 含 `# 论语` 标题和 frontmatter
- Happy path: 规范化 HTML 的 class 属性包含 Tailwind utility classes（如 `bg-xuanzhi-50`）
- Edge case: 输入不存在 → 抛出清晰的错误信息
- Error path: 输入 Template F（异常值）→ 输出标记为 skipped 并记录原因

**Verification:**
- `src/normalized-html/经部/论语.htm` 存在且可通过浏览器打开，显示正确排版
- `content/guji/经部/论语.md` 存在且 `bun run build` 成功
- 规范化 HTML 中无 `<FONT>`, `<CENTER>`, `<PRE>`, `<SPAN class=swy1>` 等遗留标签

- [ ] **Unit 2: 论语集注多文件拼接验证**

**Goal:** 验证 `scripts/lib/file-mapping.mjs` 能正确识别 论语集注/ 的 12 个章节文件，按序拼接为单一规范化 HTML + Markdown。

**Requirements:** R1, R2, R3, R5, R7

**Dependencies:** Unit 1

**Files:**
- Create: `scripts/lib/file-mapping.mjs` — 文件映射与章节拼接逻辑
- Create: `src/normalized-html/经部/论语集注.htm` — 输出
- Create: `content/guji/经部/论语集注.md` — 输出
- Test: `tests/html-normalization.test.ts`（追加测试用例）

**Approach:**
1. 实现 `buildFileMapping(sourceDir)` — 扫描目录，构建 {书名: [文件列表]} 映射
   - 检测目录中的 `index.htm` + 数字编号文件（001.htm, 002.htm...）
   - 检测目录中的 `index.htm` 是否包含完整正文（如果有，忽略章节文件）
2. 实现 `concatenateChapters(files)` — 按自然排序合并章节
   - 排序：00.htm, 000.htm, 001.htm → 001.htm, 002.htm...（处理前导零）
   - 每个章节提取 `<title>` 或首个 `<FONT>` 作为章节标题
   - 章节间插入 `<hr class="border-border-secondary">` 分隔
3. 对合并后的 HTML 运行 Unit 1 的 normalizer
4. frontmatter 中写入 `chapters` 数组记录来源文件

**Patterns to follow:**
- 现有 `scripts/parse-catalogs.js` 的文件扫描逻辑
- 自然排序使用 `Intl.Collator` 或自定义比较函数

**Test scenarios:**
- Happy path: 输入 `~/data/古籍/经部/论语集注/` 目录 → 输出单一 `论语集注.htm` 包含所有章节
- Happy path: 章节按正确顺序排列（001 在 002 之前）
- Edge case: `index.htm` 包含完整正文 → 忽略章节文件，仅使用 index.htm
- Edge case: 章节文件命名不规则（00.htm vs 000.htm）→ 正确排序

**Verification:**
- `src/normalized-html/经部/论语集注.htm` 包含所有章节标题和内容
- Markdown frontmatter 中 `chapters` 数组正确记录了 12 个源文件

- [ ] **Unit 3: 模板 B（`<P>` 段落）和模板 C（Word 单文件）支持**

**Goal:** 实现 Template B 和 C 的 normalizer，覆盖 ~60% 的文件。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/normalize-html.mjs` — 添加 Template B 和 C 处理器
- Create: `src/normalized-html/史部-其他/官箴.htm` — Template B 示例输出
- Create: `src/normalized-html/子部-先秦两汉/莊子.htm` — Template C 示例输出
- Create: `content/guji/史部-其他/官箴.md`
- Create: `content/guji/子部-先秦两汉/莊子.md`
- Test: `tests/html-normalization.test.ts`（追加测试用例）

**Approach:**
1. Template B normalizer（`<P align=justify>` 段落）：
   - 提取标题：居中 `<FONT color=#FF0000 size=5|6>` → `<h1>`
   - 提取章节标题：居中 `<FONT color=#000080 size=5>` 或 `<H2>` → `<h2>`
   - 提取正文：`<P align=justify>` 内的文本 → `<p>`
   - 移除 `<FONT>` 包裹但保留文本
2. Template C normalizer（Word 导出单文件）：
   - 提取标题：`<H1>` → `<h1>`
   - 提取章节：`<H2>` → `<h2>`
   - 提取正文：`<P align=justify>` → `<p>`
   - 检测到 `（全书终）` 时停止（忽略后面的导航/版权信息）
3. 选择 1-2 个样本文件运行，验证输出

**Test scenarios:**
- Happy path: 官箴.htm（Template B）→ `<p>` 段落正确分割，无 `<FONT>` 遗留
- Happy path: 莊子.htm（Template C）→ `<H1>`→`<h1>`, `<H2>`→`<h2>`, 正文分段正确
- Edge case: 段落内包含 `<br>` 或空行 → 正确处理为同一段落还是分段

**Verification:**
- 规范化 HTML 中无 `<FONT>`, `<P align=justify>` 遗留
- Markdown 输出段落间有正确空行分隔

- [ ] **Unit 4: 模板 D（目录页）支持**

**Goal:** 实现目录页的规范化，输出带 `<nav>` 的索引 HTML 和 `docType: catalog` 的 Markdown。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/normalize-html.mjs` — 添加 Template D 处理器
- Create: `src/normalized-html/经部/论语集注/index.htm` — 规范化目录
- Create: `content/catalogs/经部-catalog.md` — 更新（或确认已有藏目一致）
- Test: `tests/html-normalization.test.ts`（追加测试用例）

**Approach:**
1. Template D normalizer（目录页）：
   - 提取书名：`<FONT color=#FF0000 size=5|6>` → `<h1>`
   - 提取 `<table>` 中的 `<a href>` 链接 → `<nav><ul><li><a href="...">章节名</a></li></ul></nav>`
   - 保留相对路径链接（`001.htm` → `001.htm`）
2. 输出 `docType: catalog` 的 Markdown（或复用现有藏目 Markdown）
3. 规范化目录 HTML 使用 Tailwind 的 grid 或 flex 布局

**Test scenarios:**
- Happy path: 论语集注/index.htm → `<nav>` 含所有章节链接
- Happy path: 双列表格目录（战国策）→ 正确转换为 `<ul>` 列表
- Edge case: 目录页链接指向不存在的文件 → 正常处理（不验证目标文件存在性）

**Verification:**
- 规范化目录 HTML 可通过浏览器打开，链接可点击
- Markdown frontmatter `docType: "catalog"`

- [ ] **Unit 5: CLI 接口 + 经部全量转换**

**Goal:** 实现 `--book`, `--category`, `--all` 命令行参数，运行经部全量转换。

**Requirements:** R1, R2, R6, R8

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4

**Files:**
- Modify: `scripts/normalize-html.mjs` — 添加 CLI 参数解析
- Modify: `package.json` — 添加 `normalize` 和 `convert` 脚本命令
- Create: `tests/cli-normalization.test.ts` — CLI 参数测试

**Approach:**
1. 使用 `process.argv` 解析参数：
   - `--book <name>` — 单书转换（如 `--book 论语`）
   - `--category <name>` — 按类别批量转换（如 `--category 经部`）
   - `--all` — 全量转换
   - `--dry-run` — 只输出匹配的文件列表，不执行转换
2. `--category 经部` 执行流程：
   - 扫描 `~/data/古籍/经部/` 目录
   - 对每个文件/目录运行模板检测
   - 规范化 → 输出到 `src/normalized-html/经部/`
   - Turndown → 输出到 `content/guji/经部/`
   - 统计成功/失败/skipped 数量
3. 添加 `--skip` 参数支持跳过特定文件
4. 更新 `package.json` scripts：
   ```
   "normalize": "bun run scripts/normalize-html.mjs"
   ```

**Test scenarios:**
- Happy path: `--book 论语` → 只转换论语相关文件
- Happy path: `--category 经部` → 转换经部所有文件，输出统计
- Happy path: `--dry-run` → 输出匹配文件列表，不写入任何文件
- Edge case: `--book 不存在的书` → 输出 "未找到匹配的文件"
- Error path: `--category 不存在的类别` → 输出错误信息

**Verification:**
- `bun run normalize --category 经部` 成功执行
- `src/normalized-html/经部/` 包含所有经部规范化 HTML
- `content/guji/经部/` 包含所有经部 Markdown
- `bun run build` 成功

- [ ] **Unit 6: 规范化 HTML 的独立样式支持**

**Goal:** 规范化 HTML 可独立打开浏览（不依赖 Astro 构建），内联或引用 Tailwind 样式。

**Requirements:** R4

**Dependencies:** Unit 5

**Files:**
- Create: `src/styles/normalized-html.css` — 规范化 HTML 专用样式
- Modify: `scripts/normalize-html.mjs` — 注入样式引用到规范化 HTML

**Approach:**
1. 创建 `src/styles/normalized-html.css`：
   - 从 `src/styles/global.css` 的 `@theme` 块复制 OKLCH color tokens
   - 使用 Tailwind CDN（开发/预览模式）或内联 utility classes
   - 定义 `<article>`, `<h1>`-`<h6>`, `<p>`, `<nav>`, `<section>` 的基础样式
2. 规范化 HTML 的 `<head>` 中注入 `<link rel="stylesheet" href="../styles/normalized-html.css">`
3. 支持通过 `file://` 协议直接打开浏览（相对路径）

**Test scenarios:**
- Happy path: 直接在浏览器中打开 `src/normalized-html/经部/论语.htm` → 正确显示排版和颜色
- Edge case: 离线打开（无网络）→ 如果使用了 CDN，颜色可能不生效但不影响内容可读性

**Verification:**
- 规范化 HTML 文件可通过 `file://` 协议直接打开，排版正确
- 颜色使用 OKLCH 中国传统色

## System-Wide Impact

- **Interaction graph:** `scripts/normalize-html.mjs` 读取 `~/data/古籍/`（只读），写入 `src/normalized-html/` 和 `content/guji/`。`content/guji/` 被 Astro Content Collection 消费。`src/normalized-html/` 是独立资产。
- **Error propagation:** 模板检测失败 → 归类为 Template F → 跳过并记录日志。不会静默丢失内容。
- **State lifecycle risks:** 无状态管理。纯批量文件写入，可重复运行（幂等）。
- **API surface parity:** `src/content.config.ts` 的 Zod schema 是 Markdown frontmatter 的契约。规范化 HTML 无 API 契约。
- **Unchanged invariants:** 原始 `~/data/古籍/` 数据永不修改。现有 `scripts/convert-htm-to-md.js` 保留（可废弃但暂不删除）。

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `<PRE>` 内文本无明确段落标记，分割不准 | High | Med | 实现时先观察 论语.htm 的 `<PRE>` 内容，确认分割规则；如无法分割，保留 `<pre>` 格式 |
| 模板检测器误判（文件混合多种模板特征） | Med | Med | 添加 `--verbose` 模式输出检测依据；Template F 兜底 |
| 经部全量转换后发现大量 skipped 文件 | Med | High | 单元 5 的统计输出暴露问题；人工检查 skipped 文件后补充模板处理器 |
| 规范化 HTML 的 Tailwind classes 在独立浏览时不生效 | Low | Low | 使用内联 `<style>` 块而非 CDN；或使用 Tailwind Play CDN |
| 多文件拼接时章节顺序错误 | Low | High | 使用自然排序算法，测试用例覆盖 00/000/001 混合场景 |

## Documentation / Operational Notes

- `docs/session-checkpoint-content-pipeline-20260410.md` — 前置会话成果，包含 HTML 审计详情
- 本计划完成后更新：`docs/guji-modernization-plan.md`（标记阶段 1 完成）
- `README.md` 应添加规范化 HTML 和 Markdown 的使用说明
- `package.json` scripts 添加 `normalize` 命令

## Sources & References

- **Origin document:** `docs/session-checkpoint-content-pipeline-20260410.md`
- **Office Hours design doc:** `~/.gstack/projects/Lazyn0tBug-bamboo-ink/Lazyn0tBug-feat-guji-content-pipeline-design-20260410.md`
- **HTML Audit Report:** `docs/session-checkpoint-content-pipeline-20260410.md` §HTML 模板审计（21 文件样本）
- Related code: `scripts/convert-htm-to-md.js`, `scripts/parse-catalogs.js`, `src/content.config.ts`
- Related styles: `src/styles/global.css`
