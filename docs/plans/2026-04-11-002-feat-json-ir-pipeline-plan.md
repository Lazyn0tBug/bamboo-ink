---
title: "feat: JSON IR 内容管道 — 提取器 + 双输出生成器"
type: feat
status: active
date: 2026-04-11
origin: docs/brainstorms/json-ir-pipeline.md
last_updated: 2026-04-11
---

# feat: JSON IR 内容管道 — 提取器 + 双输出生成器

## Overview

用「内容提取 → JSON IR → 双输出」管道替代现有的「7 模板正则修改」管道。从原始 HTML 中直接提取章节、正文、注疏等内容到 JSON 中间表示，再从 JSON 生成 Markdown（Astro Content Collection 消费）和 HTML5（独立可读）。目标是消除 ~800 行模板正则 + 7 个独立正常器，同时恢复部分 ~11% SKIP 文件的覆盖。

**当前状态**: Unit 0（基础设施）和 Unit 1（核心提取器）已完成，27 个测试通过。`content-extractor.mjs` 包含完整的提取、字典构建、HTML5/Markdown 渲染功能。待完成：CSS class 分类规则补充（Unit 1b）、模式缓存（Unit 2a）、CLI 批量处理（Unit 4）、经部验证（Unit 5）。

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

- `scripts/lib/content-extractor.mjs` — JSON IR 提取器核心（~788 行，Unit 1 已实现）。包含 `extractContent()`, `buildCatalogDict()`, `lookupCatalogMeta()`, `renderHtml5()`, `renderMarkdown()`, `writeIr()` 等函数。27 个测试通过。
- `tests/content-extractor.test.ts` — 27 个测试：6 extractContent, 3 renderHtml5, 4 renderMarkdown, 2 decodeHtml, 4 catalog dictionary, 8 content-config
- `scripts/convert-htm-to-md.js` — 现有转换脚本（将被替代）。Turndown 配置了 `guji-title` 自定义规则。
- `docs/brainstorms/json-ir-pipeline.md` — 需求文档 + Unit 1 实施复盘。定义了 9 种内容类型和 text.css 分类体系。
- `~/data/古籍/text.css` — **权威分类体系**（13 个 CSS class → 内容类型映射）。所有文件共享同一套 FrontPage 4.0 制作规范。
- `~/data/古籍/1经部藏目.htm` — 经部顶层索引（catalog 驱动的 metadata 源）。
- `~/data/古籍/2史部藏目.htm` — 史部顶层索引。
- `~/data/古籍/3子部藏目.htm` — 子部顶层索引。
- `~/data/古籍/4集部藏目.htm` — 集部顶层索引。
- `src/content.config.ts` — Content Collection Zod schema（Unit 0 已恢复）。
- `src/content/guji/经部/大学章句集注.md` — 现有 Markdown 输出样本。
- `src/normalized-html/经部/大学章句集注.htm` — 现有 HTML5 输出样本。
- `.astro/collections/guji.schema.json` — Content Collection 生成的 schema 缓存。
- `src/styles/global.css` — Tailwind v4 + OKLCH 传统色。

### Institutional Learnings

- **Unit 1 实施复盘（2026-04-11）** — 见 `docs/brainstorms/json-ir-pipeline.md` 末尾：
  - 多遍分类器架构已被证明有效（Pass 1→2→3，27 测试通过）
  - 目录字典（buildCatalogDict + lookupCatalogMeta）提供权威 metadata
  - `.contents()` 而非 `.children()` 是关键区别 — 裸露文本节点在古籍 HTML 中是内容本身
  - cheerio DOM 操作（`.before()`, `.appendTo()`）丢失/合并文本节点 → 正则预处理 + 只读遍历
  - text.css 提供 13 个权威 CSS class 映射
  - 表格扁平化：正则预处理优于 cheerio 操作
  - 应弃用的方案：模板检测器、DOM 操作式拆解、正则提取元数据、每文件重复检测
- `docs/session-checkpoint-content-pipeline-20260410.md` — 7 个验证发现的问题：
  - 经部文件均为 UTF-8，无 GBK 编码
  - HTML 是 MSHTML/FrontPage 产物，无 `<h1>`-`<h6>` 标签
  - 嵌套 `<FONT>` 3-4 层是常见现象

### External References

无外部研究。本地模式清晰且已验证：cheerio 解析 HTML，JSON 作为中间结构，直接生成 Markdown 和 HTML5。27 个单元测试通过，分类器架构稳定。

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

**决策**: 内容分类采用多遍扫描：第一遍识别结构上下文（是否居中、是否顶层节点），第二遍应用属性规则（字号、颜色、class），第三遍文本模式匹配（结束标记、章节总结）。

**理由**: 扁平决策树在属性重叠时产生误判（如 `<FONT COLOR="#FF6666">` 可能在正文中出现而非书名）。多遍扫描通过结构上下文先过滤，再应用属性规则，准确率更高。

### D6: 目录字典替代正则提取元数据 ✅ 已验证

**决策**: author/dynasty 从 catalog 页面构建字典（`buildCatalogDict` + `lookupCatalogMeta`），而非从正文 HTML 用正则提取。

**理由**: 索引导览页（如 `1经部藏目.htm`、`列女传/index.htm`）提供权威的书名→元数据映射。每本书的所有内容文件确定性继承 catalog 的 title/dynasty/author。实施验证：27 个测试全部通过。

### D7: text.css 权威分类体系

**决策**: Pass 2 分类应直接识别 text.css 定义的 CSS class（`.article`, `.chapter`, `.annotation`, `.reference`, `.menu` 等），而非仅靠 color+size 属性猜测。

**理由**: text.css 是原始 HTML 制作者的权威设计规范，定义了 13 个 class 到内容类型的明确映射。所有文件共享同一套 CSS 命名（Microsoft FrontPage 4.0 制作），class 识别比属性猜测可靠得多。

### D8: 正则预处理 + 只读遍历（非 DOM 操作）✅ 已验证

**决策**: 不修改 cheerio 解析后的 DOM，而是用正则预处理（`<table>`→`<div>` 等）后，直接 `.contents()` 遍历。

**理由**: cheerio 的 `.before()`, `.appendTo()` 等方法会丢失或合并相邻文本节点。正则预处理 + `.contents()` 只读遍历在实施中被证明可靠。

## Open Questions

### Resolved During Planning

- **Markdown 生成策略**: 从 JSON 直接拼接 vs 从 HTML5 经 Turndown 回退 → 选前者（D3），现有格式简单无需双轮转
- **CLI 设计**: 新脚本 vs 复用现有入口 → 复用现有，加 `--pipeline` 参数（D4）
- **IR 输出位置**: `src/content-ir/` 与 `src/normalized-html/` 并列，目录结构镜像源文件
- **分类器结构**: 扁平决策树 vs 多遍扫描 → 选多遍扫描（D5），结构上下文先过滤再应用属性规则
- **content.config.ts 恢复**: 必须在 Unit 3 产出 Markdown 之前完成，否则 Astro build 失败（Unit 0 已完成 ✅）
- **注疏可分离性验证**: 已确认注疏可被 `<FONT style="FONT-SIZE: 9pt">` 包裹分离 → 注疏架构保留（Unit 0 已完成 ✅）
- **目录字典元数据来源**: 从 catalog 页构建字典替代正则提取（D6，Unit 1 已实现 ✅）
- **DOM 遍历策略**: 正则预处理 + `.contents()` 只读遍历（D8，Unit 1 已验证 ✅）
- **章节总结基础模式**: 已覆盖 `右传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章`

### Deferred to Implementation

- **text.css CSS class 分类规则补充**: Pass 2 缺少 8 条 class 识别规则（.article, .chapter, .section, .annotation, .reference, .menu, .jing, .zhuan）+ 颜色 `#551A8B` + 10pt 注释识别
- **模式缓存机制**: 分析首个内容文件 → 缓存模式 → 应用到整本书，避免每文件重复分类
- **目录驱动批量处理**: 先处理 4 个顶层 catalog + 各部子 catalog → 构建完整 catalog dict → 逐文件提取
- **章节总结更多变体**: 除已知模式外，可能还有「右经…」「右第…章」等，需全量扫描确认
- **GBK 编码覆盖**: 除经部外，史部/子部/集部是否存在 GBK 编码文件
- **SKIP 文件恢复率**: ~11% 中有多少能通过 JSON IR 管道恢复

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
class=article                    → book-title（text.css 权威）
class=chapter                    → chapter-title（text.css 权威）
居中 + COLOR=#CC33CC             → chapter-title（实际 HTML 变体）
class=section                    → sub-chapter heading（text.css 权威）
class=annotation                 → inline-annotation（text.css 权威）
class=reference                  → inline-annotation（text.css 权威）
FONT size=9pt                    → inline-annotation（内联定义）
color=#551A8B + 10pt             → inline-annotation（text.css .annotation）
class=menu                       → catalog/nav context（text.css 权威）
class=jing                       → 经文（正文特殊类型，text.css 权威）
class=zhuan                      → 传文（正文特殊类型，text.css 权威）
class=original                   → main-text（text.css 权威）
class=swy1                       → main-text（12pt 正文，内联定义）
<P align=justify>                → main-text
```

**第三遍 — 文本模式（在一般上下文中应用）**：
```
text contains "…终"           → end-marker
text starts with "右…"        → section-summary
text matches "(朝代)·(作者)"   → metadata
otherwise                     → main-text
```

## Implementation Units

### ✅ Unit 0: 基础设施恢复 + 预实施验证（已完成）

**Goal:** 恢复缺失的 `content.config.ts` 和验证注疏可分离性。

**Status:** ✅ 完成 (commit 18150c0)

**交付物:**
- `src/content.config.ts` — Zod schema 匹配 Content Collection
- `tests/content-config.test.ts` — 8 个测试用例
- 注疏可分离性确认：`<FONT style="FONT-SIZE: 9pt">` 包裹可可靠分离
- section-summary 模式确认：`右传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章`

---

### ⚠️ Unit 1: JSON IR 提取器 — 核心内容分类 + IR 构建（部分完成）

**Goal:** 从原始 HTML 提取内容到 JSON IR 对象。

**Status:** ⚠️ 部分完成 (commit 9225873)

**已完成:**
- `scripts/lib/content-extractor.mjs` — 核心提取器（~788 行）
- `tests/content-extractor.test.ts` — 27 个测试全部通过
- 多遍分类器（Pass 1→2→3）✅
- 目录字典（`buildCatalogDict`, `lookupCatalogMeta`）✅
- 递归 Walker（`.contents()`）✅
- 表格扁平化预处理 ✅
- `renderHtml5()` 和 `renderMarkdown()` 已实现并测试通过 ✅
- `writeIr()` 已实现 ✅
- 章节总结正则覆盖"首章"变体 ✅

**待完成 → Unit 1b:**
- text.css CSS class 分类规则（8 条缺失）
- 颜色 `#551A8B` + 10pt 注释识别

**已验证的关键发现:**
- cheerio `.contents()` vs `.children()` 是关键区别
- `.before()`, `.appendTo()` 丢失文本节点 — 应使用正则预处理 + 只读遍历
- 正则提取 author/dynasty 不可靠 — 目录字典替代

---

### [ ] Unit 1b: text.css CSS 分类规则补充

**Goal:** 补充 Pass 2 中缺失的 8 条 CSS class 识别规则，使提取器能直接利用原始设计规范。

**Requirements:** R2, R9

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/lib/content-extractor.mjs` (`classifyByAttributes` 函数)
- Modify: `tests/content-extractor.test.ts` (add tests for CSS class classification)

**Approach:**
1. 在 `classifyByAttributes` 中添加 class 直接识别规则：
   - `class=article` → `book-title`（替代 color+size 猜测）
   - `class=chapter` → `chapter-title`
   - `class=section` → sub-chapter heading
   - `class=annotation` → `inline-annotation`
   - `class=reference` → `inline-annotation`
   - `class=menu` → catalog/nav context
   - `class=jing` → 经文（main-text 的子类型，暂归 main-text）
   - `class=zhuan` → 传文（main-text 的子类型，暂归 main-text）
2. 添加颜色+字号组合规则：`color=#551A8B` + 10pt → `inline-annotation`
3. 优先级：class 识别 > color+size 属性识别 > 文本模式识别

**Patterns to follow:**
- 现有 `classifyByAttributes` 函数结构（D5 多遍分类器 Pass 2）
- text.css 定义（位于 `~/data/古籍/text.css`，13 个 class 映射）

**Test scenarios:**
- Happy path: HTML with `class=article` → identified as book-title
- Happy path: HTML with `class=chapter` → identified as chapter-title
- Happy path: HTML with `class=annotation` → identified as inline-annotation
- Happy path: HTML with color `#551A8B` + 10pt → identified as inline-annotation
- Happy path: HTML with `class=menu` → identified as nav-item context
- Edge case: Same element has both `class=annotation` AND `FONT size=9pt` → consistent classification
- Integration: Re-run all 27 existing tests → no regression

**Verification:**
- All 27 existing tests still pass
- 8 new test cases for CSS class rules pass
- Extractor handles both class-based and attribute-based classification

---

### [ ] Unit 2a: 模式缓存机制

**Goal:** 实现按书缓存的内容分类模式，分析首个内容文件后应用到整本书的其他文件，避免重复分类计算。

**Requirements:** R1, R9

**Dependencies:** Unit 1, Unit 1b

**Files:**
- Create: `scripts/lib/pattern-cache.mjs`
- Modify: `scripts/lib/content-extractor.mjs` (accept pattern cache)
- Test: `tests/pattern-cache.test.ts`

**Approach:**
1. 模式缓存数据结构：
   ```
   {
     bookTitle: string,
     chapterTitlePatterns: { centerColor, headingTags, classValues },
     annotationPatterns: { fontSize, color, classValues },
     contentContainerSelector: string,  // e.g., "body > div.swy1"
     metadataSource: "catalog" | "regex"
   }
   ```
2. 首次分析流程：分析该书首个内容文件 → 提取模式 → 缓存
3. 后续文件：加载缓存模式 → 跳过分类规则推导 → 直接应用
4. 缓存存储：内存 Map（同批次处理）或 JSON 文件（跨批次持久化）

**Execution note:** Keep it simple for v1 — in-memory Map within a single `--book` or `--category` run. Persistent cache (JSON file) can be added later if needed.

**Patterns to follow:**
- `buildCatalogDict` / `lookupCatalogMeta` pattern in `scripts/lib/content-extractor.mjs`

**Test scenarios:**
- Happy path: Analyze first file → cache created → second file uses cache → same result
- Happy path: Cache hit reduces processing time (measurable)
- Edge case: No cache available → falls back to full classification
- Edge case: Book has only one file → cache created but not reused
- Error path: Corrupted cache file → falls back to full classification

**Verification:**
- Cached classification produces identical output to full classification
- Performance improvement measurable on multi-file books

---

### [ ] Unit 2: JSON IR → HTML5 渲染器

**Goal:** 从 JSON IR 生成语义化 HTML5。

**Status:** ⚠️ 已在 `scripts/lib/content-extractor.mjs` 中实现 `renderHtml5()`，有 3 个测试通过。需进一步完善。

**Requirements:** R4, R6, R9

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/lib/content-extractor.mjs` (renderHtml5 已存在，需完善)
- Test: `tests/content-extractor.test.ts` (已有 3 个 renderHtml5 测试)

**Approach:**
1. 当前 `renderHtml5()` 已覆盖：content-type IR、catalog IR、annotations
2. 需补充的测试场景：
   - 空内容 IR → 最小 HTML
   - colophon 渲染
   - section-summary 斜体样式
3. 确保 CSS 类引用 `normalized.css` 或 Tailwind 工具类

**Test scenarios:** *(补充)*
- Edge case: IR with no chapters → minimal HTML with just title
- Edge case: IR with colophon → separate `<section class="colophon">`
- Edge case: IR with section-summary → italic `<p>` elements

**Verification:**
- All HTML5 render tests pass
- Output matches structure of `src/normalized-html/` samples

---

### [ ] Unit 3: JSON IR → Markdown 生成器

**Goal:** 从 JSON IR 直接生成 Markdown。

**Status:** ⚠️ 已在 `scripts/lib/content-extractor.mjs` 中实现 `renderMarkdown()`，有 4 个测试通过。需进一步完善。

**Requirements:** R3, R6

**Dependencies:** Unit 0, Unit 1

**Files:**
- Modify: `scripts/lib/content-extractor.mjs` (renderMarkdown 已存在，需完善)
- Test: `tests/content-extractor.test.ts` (已有 4 个 renderMarkdown 测试)

**Approach:**
1. 当前 `renderMarkdown()` 已覆盖：frontmatter generation, catalog links, footnotes, section-summary italics
2. 需补充的测试场景：
   - Markdown 特殊字符转义（`#`, `*`, `_`, `[`, `]`）
   - 长注疏脚注渲染
   - 空内容 IR
3. frontmatter 格式匹配 Content Collection schema

**Test scenarios:** *(补充)*
- Edge case: Content containing Markdown special chars → properly escaped
- Edge case: Long annotation text → footnote renders correctly
- Edge case: Empty IR → minimal frontmatter only

**Verification:**
- Generated Markdown frontmatter validates against Content Collection schema
- All renderMarkdown tests pass

---

### [ ] Unit 4: 目录驱动 CLI 接口 + 批量处理

**Goal:** 提供完整的 CLI 接口，采用目录驱动的批量处理策略。

**Requirements:** R7, R8, R10

**Dependencies:** Unit 1, Unit 1b, Unit 2a, Unit 2, Unit 3

**Files:**
- Modify: `scripts/convert-htm-to-md.js` (add `--pipeline ir` + full CLI args)
- Create: `tests/cli-pipeline.test.ts`

**Approach:**
1. 添加 CLI 参数解析：
   - `--pipeline ir|legacy` — 选择管道（legacy 为默认）
   - `--file <path>` — 单个文件
   - `--book <name>` — 单本书
   - `--category <name>` — 整个类别
   - `--all` — 所有文件
   - `--dry-run` — 只打印计划
   - `--output <dir>` — 覆盖输出目录
2. **目录驱动处理流程**（新增）：
   - 第一步：扫描并处理所有 catalog 页面（`*藏目.htm`, `*/index.htm`）
   - 第二步：从 catalog IR 构建 `catalogDict`
   - 第三步：逐文件提取时注入 catalogDict → 权威 metadata
   - 第四步：报告覆盖率（catalog 链接数 vs 实际处理文件数）
3. 批量处理：
   - 扫描源目录，列出所有 `.htm` 文件
   - 按参数过滤
   - 逐个处理，收集成功/失败/SKIP 统计
4. 错误处理：try-catch，不中断

**Patterns to follow:**
- `scripts/convert-htm-to-md.js` 现有的 `findFiles()` 和 `main()` 结构
- `buildCatalogDict` / `lookupCatalogMeta` 模式

**Test scenarios:**
- Happy path: `--file <path>` processes single file and writes IR + outputs
- Happy path: `--all` scans, processes catalog first, then content files, reports count
- Happy path: Catalog-driven metadata injection → author/dynasty correct from catalog dict
- Edge case: `--dry-run` prints plan without writing any files
- Edge case: `--category 经部` processes only files under 经部
- Edge case: Catalog page with no nav links → empty dict, no crash
- Error path: Missing source file → prints error, continues
- Error path: Invalid pipeline argument → prints usage and exits

**Verification:**
- CLI help/usage on invalid input
- `--dry-run` produces zero file writes
- Catalog metadata injection verified against known entries
- Batch processing reports accurate success/fail counts

---

### [ ] Unit 5: 经部全量验证 + 差异对比

**Goal:** 用 JSON IR 管道处理经部全部文件，与现有模板管道输出对比。

**Requirements:** R1, R3, R4, R10

**Dependencies:** Unit 4

**Files:**
- Create: `scripts/compare-pipelines.mjs` (对比脚本)
- Modify: `tests/content-extractor.test.ts` (add regression tests for any gaps found)

**Approach:**
1. 运行 JSON IR 管道处理经部所有文件 → 产出 `src/content-ir/经部/` 和 `src/content/guji/经部/`
2. 对比两种管道的输出：
   - 文件覆盖率（JSON IR vs 模板管道）
   - SKIP 文件对比：哪些之前被 SKIP 的现在能处理
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

- **Interaction graph:** `convert-htm-to-md.js` 是唯一入口。JSON IR 管道将替代其核心转换逻辑但保持 CLI 兼容性。`content.config.ts` 已由 Unit 0 恢复。`content-extractor.mjs` 现在是核心库，被 CLI、测试、未来可能的批量处理消费。
- **Error propagation:** 单文件失败不中断批量处理。提取器对每个文件 try-catch，产出错误报告。
- **State lifecycle risks:** IR 写入和 Markdown/HTML5 输出是原子性的。`--all` 时建议先清空输出目录。
- **API surface parity:** JSON IR 管道产出的 Markdown 必须与 Content Collection schema 兼容。frontmatter 字段名和枚举值不能变。
- **Integration coverage:** 端到端场景（HTML → IR → Markdown → Astro 渲染）需手动验证。单元测试只证明单环节正确。
- **Unchanged invariants:** 原始 `~/data/古籍/` 目录始终只读。Content Collection schema 不变。Astro 页面消费 Markdown 的逻辑不变。
- **catalog 权威链:** 4 个顶层藏目页 + 各部子目录页 → 确定性的书名/朝代/作者映射 → 所有内容文件继承。这条链上任何 catalog 页面错误会传播到所有内容文件。
- **text.css 依赖:** 分类器新增对原始 CSS 定义的依赖。如果源数据中 CSS class 命名发生变化（不同 FrontPage 模板），需要补充对应的回退规则。

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 内容分类规则不够通用，遇到未见 HTML 变体 | Med | High | 每发现新变体只需加一条分类规则。提取器设计为规则表驱动，易扩展 |
| 注疏无法在源 HTML 中分离 | ~~Med~~ **Resolved** | ~~High~~ | Unit 0 已验证：可分离 ✅ |
| 章节总结模式变体不完整 | ~~Med~~ **Low** | Med | 已覆盖"首"字变体。全量扫描后确认完整性 |
| GBK 编码文件解码失败 | Low | Med | 复用现有 `detectEncoding()` + iconv-lite |
| 大型文件（>1MB HTML）提取性能 | Low | Low | cheerio 解析 O(n)，预估单文件 <1s |
| text.css CSS class 在部分文件中不使用 | Med | Low | class 识别为优先规则，color+size 属性仍作为回退 |
| catalog 页面本身有错误或缺失 | Low | Med | 无法从 catalog 获取 metadata 的文件，author/dynasty 留空 |
| 模式缓存导致过时规则传播 | Low | Low | v1 仅内存缓存，同批次内有效。跨批次持久化时加版本号 |

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
