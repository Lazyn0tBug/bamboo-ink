---
title: "feat: JSON IR 内容管道 — 提取器 + 双输出生成器"
type: feat
status: active
date: 2026-04-11
origin: docs/brainstorms/json-ir-pipeline.md
---

# feat: JSON IR 内容管道 — 提取器 + 双输出生成器

## Overview

用「内容提取 → JSON IR → 双输出」管道替代现有的「7 模板正则修改」管道。从原始 HTML 中直接提取章节、正文、注疏等内容到 JSON 中间表示，再从 JSON 生成 Markdown（Astro Content Collection 消费）和 HTML5（独立可读）。目标是消除 ~800 行模板正则 + 7 个独立正常器，同时恢复部分 ~11% SKIP 文件的覆盖。

## Problem Frame

当前 `scripts/convert-htm-to-md.js` 是一个粗糙的 cheerio + turndown 直接转换脚本：
- 只做简单的标签剥离，无法处理嵌套 `<FONT>`、`<PRE>` 正文、注疏区分
- frontmatter 字段错误（`section` 而非 `category`，朝代映射为单字）
- 硬编码只处理前 10 个文件，无 CLI 参数
- Turndown 对非语义化 HTML 完全失败

`feat/html-normalization` 分支上的 7 模板方案（~800 行正则 + cheerio DOM 遍历）虽然能处理 ~89% 文件，但每个模板独立维护，发现新变体就需要加新正则。

**JSON IR 管道从根本上改变思路**：不再「修改 HTML 标签」，而是「提取有效内容到结构化 JSON」。提取器通过 DOM 模式（字号、颜色、位置）识别 9 种内容类型，一份 JSON 同时驱动 Markdown 和 HTML5 两个输出端。

## Requirements Trace

从 origin document 继承：

- R1. 提取内容到 JSON IR，每本书一个 JSON 文件，位于 `src/content-ir/`，目录结构与源文件一致
- R2. JSON IR 包含 9 种内容类型：book-title, metadata, chapter-title, main-text, inline-annotation, section-summary, colophon, nav-item, end-marker
- R3. 从 JSON IR 生成 Markdown，frontmatter 匹配现有 Content Collection schema（`title`, `docType`, `category`, `author`, `dynasty`, `date`, `source`）
- R4. 从 JSON IR 生成 HTML5，语义化标签 + 统一外部样式表
- R5. 目录页（catalog）`docType` 为 `catalog`，产出 `navItems`
- R6. 内嵌注疏在 Markdown 中使用脚注 `[^注N]`，在 HTML5 中使用行内 `<span class="annotation">`
- R7. 不修改原始 `~/data/古籍/` 数据（只读输入）
- R8. CLI 支持 `--file`, `--book`, `--category`, `--all`, `--dry-run` 参数
- R9. 首轮实现完全基于规则，不使用 LLM
- R10. 保留旧管道作为 fallback 期间并行运行

## Scope Boundaries

- **In scope**: 经部、史部、子部、集部四部的正文和目录 HTML 内容提取
- **In scope**: 替代现有的 `convert-htm-to-md.js` 作为主要转换工具
- **Out of scope**: 图片资源迁移、AI 标注、跨文本引用图
- **Out of scope**: 引用细粒度标注（如区分《诗》和《书》）——暂归入正文 `content`
- **Out of scope**: LLM 辅助识别 —— 首轮完全基于规则
- **Deferred**: ~11% SKIP 文件的恢复 —— 在实施中观察但不作为承诺目标

## Context & Research

### Relevant Code and Patterns

- `scripts/convert-htm-to-md.js` — 现有转换脚本（将被替代）。使用 cheerio 解析 + turndown 生成。Turndown 配置了 `guji-title` 自定义规则。有已知 bug（`section` 字段、硬编码限制 10 文件）。
- `docs/specs/guji-semantic-dictionary.md` — 语义字典规范，定义 dynasty/category/author/books 四个域。JSON IR 的 `author` 和 `dynasty` 字段可与字典的 normalize API 对接。
- `src/content/guji/经部/大学章句集注.md` — 现有 Markdown 输出样本，frontmatter 包含 `title`, `docType: "content"`, `category: "经部"`, `date`, `source`。
- `src/normalized-html/经部/大学章句集注.htm` — 现有 HTML5 输出样本，使用 `<article>`, `<h1>`, `<h2 class="font-li">`, `<p class="font-kai">` 等语义化标签。
- `.astro/collections/guji.schema.json` — Content Collection 生成的 schema，定义 required: `title`，optional: `docType` (enum: catalog/content), `category` (enum: 经部/史部/子部/集部), `subcategory`, `author`, `dynasty`, `date`, `source`。
- `src/styles/global.css` — Tailwind v4 + OKLCH 传统色，定义了 `--font-kai`, `--font-li`, `text-mo-600`, `text-dai-500` 等工具类。

### Institutional Learnings

- `docs/session-checkpoint-content-pipeline-20260410.md` — 7 个验证发现的问题：
  - 经部文件均为 UTF-8，无 GBK 编码（但史部/子部可能存在 GBK）
  - HTML 是 MSHTML/FrontPage 产物，无 `<h1>`-`<h6>` 标签
  - 嵌套 `<FONT>` 3-4 层是常见现象
  - `content.config.ts` 文件已丢失，但 schema 在 `.astro/collections/` 缓存中
- `docs/plans/2026-04-11-001-feat-html-normalization-pipeline-plan.md` — 7 模板方案详细计划，包含模板特征分析、9032 文件扫描结果。JSON IR 管道将替代这个方案。
- `docs/brainstorms/json-ir-pipeline.md` — 需求文档，定义 9 种内容类型的识别标准和双输出映射。

### External References

无外部研究。本地模式清晰：cheerio 解析 HTML，turndown 生成 Markdown，JSON 作为中间结构。技术栈简单成熟。

## Key Technical Decisions

### D1: 单通用提取器（非 per-template）

**决策**: 不使用 7 个模板独立提取器，而是实现一个通用内容提取器，通过 DOM 特征（字号、颜色、位置、结构）直接分类 9 种内容类型。

**理由**: 模板本质上是同一组 DOM 模式的不同组合。通用提取器维护成本更低，且天然覆盖 SKIP 文件中符合内容类型但不符合模板模式的情况。

### D2: IR 文件一对一映射

**决策**: 每个源 HTML 文件产出一个 JSON IR 文件，路径镜像源目录结构。

**理由**: 简单、可追溯、版本控制友好。不合并多章节文件。

### D3: Markdown 直接从 JSON 生成（非 Turndown 回退）

**决策**: 直接从 JSON IR 拼接 Markdown 字符串，不经过 HTML5 中间表示。

**理由**: 现有 Markdown 输出格式极其简单（ATX 标题 + 普通段落 + 脚注），直接生成的复杂度远低于 JSON → HTML5 → Turndown → Markdown 的双轮转。Turndown 回退链引入额外的 bug 传播面（Unit 2 的问题会静默污染 Unit 3 输出）且性能开销翻倍。Markdown 特殊字符转义通过简单的字符串 replace 即可处理。

### D4: CLI 复用 `convert-htm-to-md.js` 入口

**决策**: 在 `scripts/convert-htm-to-md.js` 中新增 `--pipeline ir` 参数切换到 JSON IR 管道，而非新建独立入口。

**理由**: 已有文件、已有依赖加载（cheerio, turndown, iconv），保持单入口。旧管道通过默认行为保留为 fallback。

### D5: 多遍分类器（非扁平决策树）

**决策**: 内容分类采用多遍扫描：第一遍识别结构上下文（是否居中、是否顶层节点），第二遍应用属性规则（字号、颜色），第三遍文本模式匹配（结束标记、章节总结）。

**理由**: 扁平决策树在属性重叠时产生误判（如 `<FONT COLOR="#FF6666">` 可能在正文中出现而非书名）。多遍扫描通过结构上下文先过滤，再应用属性规则，准确率更高。

## Open Questions

### Resolved During Planning

- **Markdown 生成策略**: 从 JSON 直接拼接 vs 从 HTML5 经 Turndown 回退 → 选前者（D3），现有格式简单无需双轮转
- **CLI 设计**: 新脚本 vs 复用现有入口 → 复用现有，加 `--pipeline` 参数（D4）
- **IR 输出位置**: `src/content-ir/` 与 `src/normalized-html/` 并列，目录结构镜像源文件
- **分类器结构**: 扁平决策树 vs 多遍扫描 → 选多遍扫描（D5），结构上下文先过滤再应用属性规则
- **content.config.ts 恢复**: 必须在 Unit 3 产出 Markdown 之前完成，否则 Astro build 失败
- **注疏可分离性验证**: 实施前需确认源 HTML 中注疏是否被 `<FONT size=9pt>` 包裹，否则降级为 v1 out of scope

### Deferred to Implementation

- **注疏可分离性**: 需在实际源 HTML 中确认注疏是否被 `<FONT size=9pt>` 包裹。如果注疏与正文在同一文本节点中无标记混合，v1 降级为 out of scope，注疏归入正文 `content`
- **章节总结变体扫描**: 除「右传之X章」外，需 `grep` 全部源文件统计 `^右.` 开头的行，确认完整模式集。在 Unit 1 实施前完成
- **SKIP 文件恢复率**: ~11% 中有多少能通过 JSON IR 管道恢复，取决于它们的内容特征是否符合 9 种类型
- **GBK 编码覆盖**: 除经部外，史部/子部/集部是否存在 GBK 编码文件，需要在批量处理时确认
- **注疏颜色变体**: 除 `#551A8B` 外是否还有其他颜色标记注疏，需在实际文件中观察

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### 数据流

```
Source HTML (*.htm)
     │
     ▼
┌─────────────────────┐
│  Encoding Detection │  BOM → UTF-8 → GBK fallback (iconv-lite)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Cheerio Parse      │  DOM tree
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Content Extractor               │
│                                         │
│  1. Title:   <title>, <h1>, <FONT>     │
│  2. Meta:    author/dynasty regex       │
│  3. Classify: walk body nodes → 9 types │
│     - FONT size=9pt  → annotation       │
│     - COLOR=#CC33CC  → chapter-title    │
│     - <a href>       → nav-item         │
│     - "…终"          → end-marker       │
│     - "右传之…"      → section-summary   │
│     - default        → main-text        │
│  4. Build IR: { title, author, dynasty, │
│     docType, chapters[], navItems[] }   │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│   JSON IR Writer    │  src/content-ir/<path>/<book>.json
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────┐
│ MD Gen │  │ HTML5 Gen│
│        │  │          │
│ JSON → │  │ JSON →   │
│ string │  │ cheerio  │
│ → .md  │  │ → string │
│        │  │ → .htm   │
└────────┘  └──────────┘
```

### 内容分类多遍扫描（D5）

**第一遍 — 结构上下文**：
```
node is <a>                 → nav-item（链接节点）
node parent is <CENTER>     → 居中上下文（标题候选）
node is <OL>/<UL>           → 列表上下文（目录候选）
node is <BR> sibling        → 分段上下文（正文候选）
otherwise                   → 一般上下文
```

**第二遍 — 属性规则（在结构上下文中应用）**：
```
居中 + COLOR=#FF6666/SIZE=5|6  → book-title
居中 + COLOR=#CC33CC           → chapter-title
FONT size=9pt                  → inline-annotation
FONT color=#551A8B             → inline-annotation
<P align=justify>              → main-text
class=swy1                     → main-text（12pt 正文）
```

**第三遍 — 文本模式（在一般上下文中应用）**：
```
text contains "…终"           → end-marker
text starts with "右…"        → section-summary
text matches "(朝代)·(作者)"   → metadata
otherwise                     → main-text
```

## Implementation Units

- [ ] **Unit 0: 基础设施恢复 + 预实施验证**

**Goal:** 恢复缺失的 `content.config.ts` 和验证注疏可分离性，为后续单元提供基础设施保障。

**Requirements:** R3

**Dependencies:** None (prerequisite for all units)

**Files:**
- Create: `src/content.config.ts`
- Test: `tests/content-config.test.ts`

**Approach:**
1. 从 `.astro/collections/guji.schema.json` 反推 Zod schema，创建 `src/content.config.ts`
2. 定义 `defineCollection({ schema: z.object({ ... }) })` 匹配缓存 schema
3. 验证 `bun run check` 通过，Content Collection 类型生成正确
4. 抽样 5 个源 HTML 文件（经部 Template F、Template G、史部 Template B 各一个），人工检查注疏是否被 `<FONT style="FONT-SIZE: 9pt">` 包裹
   - 如果是 → 注疏架构保留，继续实施
   - 如果否 → 注疏降级为 v1 out of scope，更新 R6 和 origin document
5. `grep` 全部源文件统计 `^右.` 开头的行，汇总 section-summary 模式变体

**Verification:**
- `bun run check` 通过（Astro 类型检查）
- 注疏可分离性结论明确（保留或降级）
- section-summary 模式变体列表完整

- [ ] **Unit 1: JSON IR 提取器 — 核心内容分类 + IR 构建**

**Goal:** 从原始 HTML 提取内容到 JSON IR 对象，支持 9 种内容类型的识别和分类。

**Requirements:** R1, R2, R7, R9

**Dependencies:** Unit 0

**Files:**
- Create: `scripts/lib/content-extractor.mjs`
- Create: `tests/content-extractor.test.ts`
- Modify: `scripts/convert-htm-to-md.js` (add `--pipeline ir` + CLI args)

**Approach:**
1. 实现 `extractContent(html, sourcePath)` 函数：
   - cheerio 解析原始 HTML
   - 提取 title（`<title>` → `<h1>`/`<h2>` → `<FONT color=#FF6666 SIZE=5|6>` → 文件名回退）
   - 提取 metadata（书名后的 `(朝代·作者)` 模式正则匹配）
   - **多遍扫描分类**（D5）：
     - 第一遍：标记每个节点的结构上下文（居中、列表、链接、分段、一般）
     - 第二遍：在结构上下文中应用属性规则（字号、颜色、class）
     - 第三遍：文本模式匹配（结束标记、章节总结、朝代·作者）
   - 构建 IR 对象：`{ title, author, dynasty, source, docType, chapters[], navItems[] }`
   - 对于 `docType: "catalog"` 文件，只产出 `navItems`
   - 对于 `docType: "content"` 文件，产出 `chapters` 结构
2. 实现 `writeIr(ir, outputDir)` 函数：将 IR 写入 JSON 文件
3. 内容分类器设计为可扩展：规则表驱动，`classifyNode($, node, context)` 返回类型 ID，新增类型只需在对应遍的分类表中加规则

**Execution note:** Start with failing tests against known HTML fixtures (from the brainstorm doc and existing normalized HTML samples). Test-first for each content type classification.

**Patterns to follow:**
- `scripts/convert-htm-to-md.js` 的 cheerio 加载和编码检测模式
- ESM 模块格式（`.mjs` 扩展名）

**Test scenarios:**
- Happy path: Extract content from Template F fixture (大学章句集注) → verify IR has correct title, chapters, sections with main-text type
- Happy path: Extract content from Template G fixture (儀禮) → verify IR has correct title, section headings, main-text paragraphs
- Happy path: Extract content from catalog fixture (列女传) → verify IR has docType: "catalog" and navItems array with correct href/label pairs
- Edge case: Empty/minimal HTML → returns SKIP-like IR with empty chapters
- Edge case: Nested <FONT> tags (3-4 levels) → correctly extracts title text without tag artifacts
- Edge case: "…终" end marker → end-marker type, content after it goes to colophon
- Edge case: Metadata pattern absent (no author/dynasty in title) → author and dynasty fields empty or null
- Edge case: Catalog table with no <a href> links → empty navItems array, not an error
- Edge case: <script>/<style> blocks in source → stripped before classification
- Error path: Malformed HTML (unclosed tags) → still produces valid JSON IR
- Error path: GBK encoded input → correctly decoded before extraction

**Verification:**
- 3+ test fixtures (经部、史部、catalog) extract to valid JSON IR
- IR validates against expected schema (title required, docType in enum, chapters/navItems structure correct)
- `bun vitest run tests/content-extractor.test.ts` passes

- [ ] **Unit 2: JSON IR → HTML5 渲染器**

**Goal:** 从 JSON IR 生成语义化 HTML5，包含统一样式表引用和 Tailwind 工具类。

**Requirements:** R4, R6, R9

**Dependencies:** Unit 1

**Files:**
- Create: `scripts/lib/ir-to-html5.mjs`
- Modify: `scripts/convert-htm-to-md.js` (wire up HTML5 generation)
- Test: `tests/ir-to-html5.test.ts`

**Approach:**
1. 实现 `renderHtml5(ir)` 函数：
   - 使用 cheerio 构建 HTML5 DOM（`cheerio.load(buildEmptyHtml(title))` 模式，同 html-normalization 方案）
   - 映射规则：
     - book-title → `<h1 class="font-li text-2xl">`
     - chapter-title → `<h2 class="font-li text-xl text-dai-500 mt-8 mb-4">`
     - main-text → `<p class="font-kai leading-loose text-mo-600">`
     - inline-annotation → `<span class="annotation">`（行内）
     - section-summary → `<p class="font-kai italic text-sm text-dai-400">`
     - colophon → `<section class="colophon"><p class="font-kai text-sm">`
     - nav-item → `<nav class="mt-8"><ul class="space-y-2">` + `<li><a href>`
   - 添加 `<link rel="stylesheet" href="../styles/normalized.css">`
2. 复用 `src/normalized-html/styles/normalized.css`（已有的 OKLCH 颜色 + 字体定义）

**Patterns to follow:**
- `scripts/normalize-html.mjs` 的 cheerio 构建模式（在 `feat/html-normalization` 分支上）
- HTML 输出格式同 `src/normalized-html/` 目录下的样本

**Test scenarios:**
- Happy path: Render content-type IR → produces valid HTML5 with `<article>`, `<h1>`, `<h2>`, `<p class="font-kai">`
- Happy path: Render IR with inline annotations → produces `<span class="annotation">` in output
- Happy path: Render catalog-type IR → produces `<nav><ul>` with links
- Edge case: IR with no chapters (empty content) → produces minimal HTML with just `<h1>` title
- Edge case: IR with colophon section → colophon rendered in separate `<section class="colophon">`
- Integration: Round-trip — extract from known HTML fixture → render HTML5 → verify output matches expected structure

**Verification:**
- Rendered HTML5 from test fixtures matches the structure of existing `src/normalized-html/` samples
- All CSS classes reference existing Tailwind utilities or `normalized.css` definitions
- No inline styles in output

- [ ] **Unit 3: JSON IR → Markdown 生成器（直接生成）**

**Goal:** 从 JSON IR 直接生成 Markdown，确保正确的 frontmatter 和脚注格式。

**Requirements:** R3, R6

**Dependencies:** Unit 0, Unit 1, Unit 2

**Files:**
- Create: `scripts/lib/ir-to-markdown.mjs`
- Modify: `scripts/convert-htm-to-md.js` (wire up Markdown generation)
- Test: `tests/ir-to-markdown.test.ts`

**Approach:**
1. 实现 `renderMarkdown(ir)` 函数：
   - 遍历 IR chapters → sections，直接拼接 Markdown 字符串
   - 映射规则：
     - book-title → `# 书名`
     - chapter-title → `## 章节名`
     - main-text → 普通段落文本（需转义 `#`, `*`, `_`, `[`, `]` 等 Markdown 特殊字符）
     - inline-annotation → 行内追加 `[^注N]`，在文末统一定义脚注
     - section-summary → `*斜体段落*`
     - colophon → 普通段落（正文末尾）
     - nav-item → `* [链接](href)` 无序列表
   - 生成 frontmatter：`{ title, docType, category (从 source 路径提取), author, dynasty, date, source }`
2. Markdown 特殊字符转义通过字符串 replace 处理，不依赖 Turndown
3. 脚注编号：每个文件内全局递增（`[^注1]`, `[^注2]`, ...）

**Patterns to follow:**
- Frontmatter 格式匹配 `src/content/guji/经部/大学章句集注.md`
- Markdown 脚注格式遵循 CommonMark 脚注扩展（`[^N]: 文本` 在文末定义）

**Test scenarios:**
- Happy path: Render content-type IR → produces Markdown with correct frontmatter and ATX headings
- Happy path: IR with annotations → produces numbered footnotes `[^注1]`, `[^注2]` in paragraph and definitions at bottom of file
- Happy path: Catalog IR → produces Markdown with `docType: "catalog"` and unordered link list
- Edge case: Long annotation text → footnote renders correctly without breaking Markdown structure
- Edge case: Content containing Markdown special chars (`#`, `*`, `_`) → properly escaped
- Integration: Round-trip — extract → render Markdown → verify frontmatter + body structure matches existing samples

**Verification:**
- Generated Markdown frontmatter validates against Content Collection schema
- Footnotes render correctly (numbered, with correct text)
- `bun vitest run tests/ir-to-markdown.test.ts` passes

- [ ] **Unit 4: CLI 接口 + 批量处理**

**Goal:** 为 JSON IR 管道提供完整的 CLI 接口，支持 `--file`, `--book`, `--category`, `--all`, `--dry-run`, `--output` 参数，并产出完整报告。

**Requirements:** R7, R8, R10

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `scripts/convert-htm-to-md.js` (add `--pipeline ir` + full CLI args)
- Test: `tests/cli-pipeline.test.ts`

**Approach:**
1. 添加 CLI 参数解析（使用 `process.argv` 手动解析，不引入新依赖）：
   - `--pipeline ir|legacy` — 选择管道（legacy 为默认，保持兼容）
   - `--file <path>` — 处理单个文件
   - `--book <name>` — 处理单本书（所有相关 HTML 文件）
   - `--category <name>` — 处理整个类别（经部/史部/子部/集部）
   - `--all` — 处理所有文件
   - `--dry-run` — 只打印计划，不写入
   - `--output <dir>` — 覆盖默认输出目录
   - `--skip-ir` — 跳过 IR 写入（只生成输出）
   - `--skip-output` — 跳过输出生成（只写 IR）
2. 批量处理逻辑：
   - 扫描源目录，列出所有 `.htm` 文件
   - 按匹配的参数过滤
   - 逐个处理，收集成功/失败/SKIP 统计
   - 输出处理报告（进度条或计数）
3. 错误处理：每个文件 try-catch，失败不中断整体流程

**Patterns to follow:**
- `scripts/convert-htm-to-md.js` 现有的 `findFiles()` 和 `main()` 结构
- 错误日志格式保持一致

**Test scenarios:**
- Happy path: `--file <path>` processes single file and writes IR + outputs
- Happy path: `--all` scans and processes all files, reports count
- Edge case: `--dry-run` prints plan without writing any files
- Edge case: `--category 经部` processes only files under 经部
- Error path: Missing source file → prints error, continues
- Error path: Invalid pipeline argument → prints usage and exits

**Verification:**
- CLI help text or usage displayed on invalid input
- `--dry-run` produces zero file writes
- Batch processing reports accurate success/fail counts

- [ ] **Unit 5: 经部全量验证 + 差异对比**

**Goal:** 用 JSON IR 管道处理经部全部文件，与现有 `feat/html-normalization` 分支的模板管道输出对比，验证覆盖率和正确性。

**Requirements:** R1, R3, R4, R10

**Dependencies:** Unit 4

**Files:**
- Create: `scripts/compare-pipelines.mjs` (对比脚本)
- Modify: `tests/content-extractor.test.ts` (add regression tests for any gaps found)

**Approach:**
1. 运行 JSON IR 管道处理经部所有文件 → 产出 `src/content-ir/经部/` 和 `src/content/guji/经部/`
2. 对比两种管道的输出：
   - 文件覆盖率（JSON IR 处理的文件数 vs 模板管道）
   - SKIP 文件对比：哪些之前被 SKIP 的文件现在能处理
   - 内容抽样检查：随机抽样 10 个文件，人工对比 Markdown 正文
3. 记录差异并决定是否需要在提取器中补充规则
4. 更新 `docs/brainstorms/json-ir-pipeline.md` 中的 open questions

**Execution note:** This is a validation unit — treat findings as feedback for the extractor. If systematic gaps are found, add targeted classification rules.

**Test scenarios:**
- Integration: Run `--category 经部 --dry-run` → shows expected file count matching actual .htm count in 经部
- Integration: Process known Template A/B/F/G files from 经部 → IR contains correct content for each

**Verification:**
- JSON IR pipeline file count >= template pipeline file count for 经部
- No previously working files are now broken (no regression)
- SKIP files from template pipeline that are now covered are documented
- 经部文件 IR 提取成功率 >= 95%，已知模板 A/F/G 文件零回归

## System-Wide Impact

- **Interaction graph:** `convert-htm-to-md.js` 是唯一的入口脚本。JSON IR 管道将替代其核心转换逻辑但保持 CLI 兼容性。`content.config.ts` 由 Unit 0 恢复。
- **Error propagation:** 单个文件失败不中断批量处理。提取器对每个文件 try-catch，产出错误报告。
- **State lifecycle risks:** IR 写入和 Markdown/HTML5 输出是原子性的（每文件一次 write）。如果中途失败，部分文件可能产出旧版本 + 新版本混合。建议 `--all` 时先清空输出目录。
- **API surface parity:** JSON IR 管道产出的 Markdown 必须与 Content Collection schema 兼容。frontmatter 字段名和枚举值不能变。
- **Integration coverage:** 端到端场景（HTML → IR → Markdown → Astro 渲染）需要手动验证。单元测试只能证明单环节正确。
- **Unchanged invariants:** 原始 `~/data/古籍/` 目录始终只读。Content Collection schema 不变。Astro 页面消费 Markdown 的逻辑不变。
- **旧管道迁移：** Unit 5 验证通过后，`feat/html-normalization` 分支的 `scripts/normalize-html.mjs`（如已实现）将被废弃。`src/normalized-html/` 目录下的 HTML5 输出将由 JSON IR 管道的 Unit 2 重新生成。两条管道在 Unit 5 之前并行运行，之后 JSON IR 成为主力。

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 内容分类规则不够通用，遇到未见 HTML 变体 | Med | High | 每发现新变体只需加一条分类规则（而非整模板）。提取器设计为规则表驱动，易扩展 |
| 注疏无法在源 HTML 中分离（无 `<FONT size=9pt>` 包裹） | Med | High | Unit 0 预验证。如果确认无法分离，注疏降级为 v1 out of scope，归入正文 content |
| 章节总结模式变体不完整（遗漏「右经…」「右第…章」） | Med | Med | Unit 0 预实施扫描 grep 全部源文件。分类器第三遍文本模式设计为可扩展 |
| GBK 编码文件解码失败 | Low | Med | 复用现有 `detectEncoding()` + iconv-lite，已在 convert-htm-to-md.js 中验证 |
| 大型文件（>1MB HTML）提取性能 | Low | Low | cheerio 解析和 DOM 遍历是 O(n) 操作，预估单文件 <1s。全量 9000 文件预计 2-3 小时，可接受 |
| 多遍分类器性能开销 | Low | Low | 三遍扫描均为单次 DOM 遍历中的条件判断，额外开销可忽略 |
| 批量处理时间过长影响开发迭代 | Med | Low | 使用 `--category` 按部类分批运行，经部验证通过后再跑全量。可选 `Promise.allSettled` 并发优化 |

## Documentation / Operational Notes

- `docs/brainstorms/json-ir-pipeline.md` 作为需求文档持续维护
- 新文件 `docs/ir-pipeline-coverage-report.md` — 经部验证后的覆盖率对比报告
- 旧的 `docs/plans/2026-04-11-001-feat-html-normalization-pipeline-plan.md` 标注为 superseded（被 JSON IR 管道替代）
- `src/content-ir/` 目录需添加到 `.gitignore` 或纳入版本控制 —— 建议纳入，JSON 文件可读且便于 diff

## Sources & References

- **Origin document:** [docs/brainstorms/json-ir-pipeline.md](docs/brainstorms/json-ir-pipeline.md)
- Related code: `scripts/convert-htm-to-md.js`, `src/content/guji/经部/大学章句集注.md`, `src/normalized-html/经部/大学章句集注.htm`
- Related plans: `docs/plans/2026-04-11-001-feat-html-normalization-pipeline-plan.md` (superseded)
- Related specs: `docs/specs/guji-semantic-dictionary.md` (metadata normalization)
- Related session findings: `docs/session-checkpoint-content-pipeline-20260410.md`
- Content Collection schema: `.astro/collections/guji.schema.json`
- External deps: cheerio ^1.0.0, turndown ^7.2.0, iconv-lite ^0.6.3
