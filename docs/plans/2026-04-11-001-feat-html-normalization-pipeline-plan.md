---
title: 'feat: HTML 规范化 + Markdown 双管道'
type: feat
status: active
date: 2026-04-11
origin: docs/plans/2026-04-10-001-feat-html-normalization-pipeline-plan.md
---

# feat: HTML 规范化 + Markdown 双管道

## Overview

将 `~/data/古籍/` 下约 9,046 个 FrontPage/MSHTML HTML 文件规范化为语义化 HTML5，再从规范化 HTML 生成 Markdown。产出两份数字资产：

1. **规范化 HTML** — 语义化、可独立分发、引用统一外部样式表的 HTML5
2. **Markdown 文件** — Astro Content Collection 消费，含完整 frontmatter

输出位置：`src/normalized-html/`（HTML 资产）和 `content/guji/`（Markdown 资产），不修改原始 `~/data/古籍/` 数据。

## Problem Frame

原始 HTML 来自 FrontPage 4.0、MSHTML 5.0、Netscape 4.6、Word 导出等来源。无语义化标签（标题用 `<FONT size=5>`，正文在 `<PRE>` 内），嵌套多层 `<FONT>`，内联大写 CSS。Turndown 直接转换完全失败。

经 9,032 文件全量扫描（经史子集四部），发现 **7 种内容模板** 覆盖 ~89% 文件（另有 ~11% 为异常值需跳过）：

| 模板                  | 特征                                                                                                                | 样本文件                           | 占比         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------ |
| A: `<pre>` 纯文本     | 标题 `<font>`，正文 `<pre>` 内纯文本 + `<CENTER><FONT color=#cc33cc>` 章节标题                                      | 论语.htm, 官箴.htm                 | ~22% (1,962) |
| F: `<table>` 包裹内容 | `<table><td class=swy1>` 包裹 + `<CENTER><FONT COLOR="#FF6666">` 标题 + `<FONT COLOR="#CC33CC">` 章节 + `<br>` 分段 | 大学章句集注.htm, 中庸章句集注.htm | ~33% (3,000) |
| G: `<H2>` + 裸文本    | `<H2>` 或 `<center><FONT>` 标题 + 裸正文 + `<BR>` 分段 + 可选 `<OL>` 嵌套                                           | 儀禮.htm, 釋名.htm, 九州春秋.htm   | ~22% (2,000) |
| B: `<P>` 段落         | `<P align=justify>` 段落 + `<FONT>` 包裹                                                                            | 史部-其他 部分文件                 | ~3% (300)    |
| D: 目录页             | `<table>` 表格 + `<a href>` 章节链接，正文短（<3000 字符）                                                          | 各 category index.htm              | ~7% (603)    |
| E: Word MsoNormal     | `<p class=MsoNormal>` + `<O:P>` 标签 + `<span style=...>` 内联 CSS + `<table>` 布局                                 | 东坡易传/01.htm                    | ~2% (143)    |
| C: Word 单文件        | `<H1>` 书 + `<H2>` 章 + `（全书终）` 标记                                                                           | 极少                               | <1% (7)      |
| SKIP: 异常值          | 外链 .txt、Netscape 生成、空文件、纯图片                                                                            | —                                  | ~11% (1,000) |

> **与原计划的差异**：原计划基于 21 个文件审计，假设 4 种模板覆盖 95%+。全量扫描后发现 Template F（`<table>` 包裹）和 G（裸文本）是最大两块，合计 ~55% 文件。原 Template F "异常值" 已重新分类为 SKIP。

## Requirements Trace

- R1. 规范化 HTML 输出到 `src/normalized-html/` 目录，保持与原数据相同的分类目录结构
- R2. Markdown 输出到 `content/guji/` 目录，匹配 Astro Content Collection schema
- R3. 规范化 HTML 使用语义化标签（`<article>`, `<h1>`-`<h6>`, `<p>`, `<nav>`, `<section>`）
- R4. 规范化 HTML 引用统一外部样式表（位于 `src/normalized-html/styles/`），不内联样式
- R5. Markdown frontmatter 包含 `title`, `docType`, `category`, `subcategory`, `author`, `dynasty`, `date`, `source`
- R6. 不修改原始 `~/data/古籍/` 数据（只读输入）
- R7. 多章节文件保留独立文件，不合并
- R8. 支持 `--file`, `--book`, `--category`, `--all`, `--dry-run` 命令行参数
- R9. 规范化 HTML 可独立打开浏览（`file://` 协议）

## Scope Boundaries

- **In scope**: 经史子集四部的正文和目录 HTML 规范化 + Markdown 转换
- **Out of scope**: AI 标注、搜索功能、跨文本引用图
- **Out of scope**: 古文观止（外链 .txt）和首页（master nav）在首轮转换中标记为 skipped
- **Out of scope**: 图片资源迁移（bg.gif, banner.gif 等暂不处理）
- **Out of scope**: 项目根目录 texure.html / texure2.html（设计参考文件，不在管道范围内）

## Context & Research

### Relevant Code and Patterns

- `scripts/normalize-html.mjs` — 主规范化脚本（438 行），Template A 已实现（含内联 `<style>` 需改为外部样式表），B/C/D 为 stub，F 返回 skip
- `scripts/lib/template-detector.mjs` — 启发式模板分类器（82 行），当前仅识别 A/B/C/D，需扩展 E/F/G/SKIP
- `scripts/convert-htm-to-md.js` — 旧转换脚本，有 3 个已知 bug，暂保留不删除
- `scripts/parse-catalogs.js` — 藏目解析脚本，提取作者/朝代/分类元数据
- `src/content.config.ts` — Zod schema：`title`, `docType: ['catalog'|'content']`, `category: 四部` 等
- `src/styles/global.css` — Tailwind v4 + OKLCH 中国传统色定义，`@theme` 块，6 种主题变体

### Template Sampling Methodology

模板分类基于 9,032 文件全量扫描（覆盖经部、史部-其他、史部-廿五史、子部-先秦两汉、子部-魏晋以下、集部），关键样本文件：

| 模板 | 样本文件                           | 来源       |
| ---- | ---------------------------------- | ---------- |
| A    | 论语.htm, 官箴.htm                 | 经部, 史部 |
| F    | 大学章句集注.htm, 中庸章句集注.htm | 经部       |
| G    | 儀禮.htm, 釋名.htm, 九州春秋.htm   | 经部, 史部 |
| E    | 东坡易传/01.htm                    | 经部       |
| D    | 各 category index.htm              | 全部分类   |

### Key Technical Decisions

- **双管道架构**：HTML → 规范化 HTML → Markdown（而非一步到位）
  - 理由：规范化 HTML 本身就是数字资产；从干净 HTML 转 Markdown 可复用 Turndown
- **多章节保留独立文件**：论语集注/001.htm → 论语集注/001.htm（不合并为单文件）
- **统一外部样式表**：规范化 HTML 引用 `../styles/normalized.css`，样式集中管理，与项目现有 Tailwind v4 + OKLCH 体系一致
- **cheerio 重建而非清洗**：用 cheerio 提取结构化数据后重建语义化 HTML5，而非在原始 HTML 上清洗
- **模板 F 优先实施**：Template F（~3,000 文件，`<table>` 包裹内容）是最大单类模板，优先实现可最快提升覆盖率
- **7 模板架构**：原计划 4 模板扩展为 7 模板（A/B/C/D/E/F/G）+ SKIP，Template F 和 G 合计覆盖 ~55% 文件
- **Template F 结构特征**：`<table><td class=swy1>` 包裹 + `<CENTER><FONT COLOR="#FF6666">` 标题 + `<FONT COLOR="#CC33CC">` 章节 + `<br>` 分段（与 Template A 语义相似但 HTML 结构不同）
- **Template G 结构特征**：`<H2>` 或 `<center><FONT>` 标题 + 裸正文文本 + `<BR>` 分段，部分含 `<OL>` 嵌套列表

### External References

- cheerio（DOM 解析与重建）
- Turndown（HTML → Markdown 转换）
- iconv-lite（GBK → UTF-8 编码检测，当前经部文件均为 UTF-8 但保留检测逻辑）

## Open Questions

### Resolved During Planning

- **规范化 HTML 放在哪里？** → `src/normalized-html/`，保持与原数据相同的分类结构
- **Markdown 放在哪里？** → `content/guji/`，按四部分类
- **样式策略？** → 统一外部样式表 `src/normalized-html/styles/normalized.css`，复用项目 `@theme` OKLCH 色值 + 字体定义
- **多章节合并？** → 不合并，保留独立文件
- **编码？** → 所有经部文件为 UTF-8，保留 GBK 检测但不优先处理
- **模板分类覆盖？** → 7 模板 (A/B/C/D/E/F/G) + SKIP，覆盖 ~89% 文件，9,032 全量扫描确认
- **Template F 结构确认？** → `<table><td class=swy1>` 包裹 + `<CENTER><FONT COLOR="#FF6666">` 标题 + `<FONT COLOR="#CC33CC">` 章节 + `<br>` 分段（与 A 语义等价）
- **Template G 结构确认？** → `<H2>` 标题 + 裸正文 + `<BR>` 分段（經部/史部/子部均有大量样本）
- **实施顺序？** → F(3000) → A(1962) → G(2000) → B(300) → D(603) → E(143) → C(7)，按文件量优先级
- **Template E 结构确认？** → Word MsoNormal + `<O:P>` 标签 + `<span style=...>` 内联 CSS + `<table>` 布局（143 文件，集中在东坡易传）

### Deferred to Implementation

- **`<PRE>` / `<BR>` 内段落分割规则**：Template A/F/G 的 `<BR>` 分隔是否等价于空行分段，需在实现时观察具体内容确认
- **Template E 的 `<O:P>` 标签处理**：Word 生成的 `<O:P>` 是否需要特殊剥离或保留
- **Template G 的 `<OL>` 嵌套层级**：劉熙釋名.htm 中嵌套 `<OL>` 的层级转换规则
- **多目录扫描的文件去重**：如目录既有 index.htm 又有章节文件，如何判定 index.htm 是目录页还是正文
- **Template SKIP 人工复核**：~1,000 个跳过文件中是否有可归类补充的

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification._

```
┌─────────────────────────┐
│  ~/data/古籍/            │  (只读，9,032 HTML)
│  原始 FrontPage HTML     │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  Template Detector (7 templates)      │
│  A: <pre>  |  F: <td>  |  G: bare    │
│  B: <p justify> |  D: <table nav>    │
│  E: MsoNormal  |  C: H1/H2+全书终    │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────┐     ┌──────────────────────────┐
│  Normalizer            │────→│  src/normalized-html/    │  ← 资产 1: 语义化 HTML5
│  (cheerio 提取+重建)   │     │  经部/论语.htm           │     引用 ../styles/normalized.css
│                        │     │  经部/论语集注/001.htm   │     Tailwind utility classes
└──────────┬─────────────┘     └──────────────────────────┘
           │                          │
           │     ┌────────────────────┘
           │     │  src/normalized-html/styles/normalized.css
           │     │  ┌─ @theme OKLCH 色值（从 global.css 复制）
           │     │  ├─ 语义标签基础样式 (article, h1-h6, p, nav, section)
           │     │  ├─ Tailwind utility class 等价物
           │     │  └─ 字体定义
           │
           ▼
┌──────────────────────┐     ┌──────────────────────────┐
│  Turndown +            │────→│  content/guji/           │  ← 资产 2: Markdown
│  Frontmatter 注入      │     │  经部/论语.md            │     Astro Content Collection
└──────────────────────┘     └──────────────────────────┘
```

## Implementation Units

> **执行顺序调整**：按文件量优先级排列——F(3,000) → A(1,962) → G(2,000) → B(300) → D(603) → E(143) → C(7)，而非原计划的 A→B→C→D→E。每一步执行完毕后进行确认，避免错误累积。

- [ ] **Unit 1: Template F normalizer + 大学章句集注验证（单文件）**

**Goal:** 确认 Template F 检测器正确分类大学章句集注.htm，输出规范化 HTML 和 Markdown。

**Requirements:** R1, R2, R3, R4, R5, R7, R9

**Dependencies:** 无（模板检测器需扩展 F 识别）

**Files:**

- Modify: `scripts/lib/template-detector.mjs` — 添加 Template F 检测规则（`<table><td class=swy1>` 包裹 + `<CENTER><FONT COLOR="#FF6666">` 标题 + `<br>` 分段）
- Modify: `scripts/normalize-html.mjs` — 实现 `normalizeTemplateF()` 处理器
- Create: `src/normalized-html/styles/normalized.css` — 统一外部样式表
- Create: `src/normalized-html/经部/大学章句集注.htm` — 输出
- Create: `content/guji/经部/大学章句集注.md` — 输出
- Test: `tests/html-normalization.test.ts`

**Approach:**

1. 扩展模板检测器识别 `<table><td>` 包裹的内容模式（与 A 语义等价但结构不同）
2. `normalizeTemplateF()`: 从 `<td>` 提取内容 → 提取标题 `<CENTER><FONT COLOR="#FF6666">` → 提取章节 `<FONT COLOR="#CC33CC">` → 按 `<br>` 分割段落 → 重建语义化 HTML5
3. 创建外部样式表 `normalized.css`
4. 运行 `bun run scripts/normalize-html.mjs --file ~/data/古籍/经部/大学章句集注.htm` 验证
5. 浏览器打开验证

**Test scenarios:**

- Happy path: 大学章句集注.htm → `<h1>` 标题 + `<h2>` 章节 + `<p>` 段落，无 `<table><td>` 遗留
- Happy path: 规范化 HTML 引用外部样式表
- Edge case: `<br>` 连续出现 → 正确处理为空行分段
- Error path: 检测失败 → 标记 skipped

**Verification:**

- `src/normalized-html/经部/大学章句集注.htm` 可浏览器打开
- `content/guji/经部/大学章句集注.md` 存在且 `bun run build` 成功
- 规范化 HTML 中无 `<table class=swy1>`, `<FONT>`, `<CENTER>` 等遗留标签

- [ ] **Unit 2: Template A normalizer + 论语验证（单文件）**

**Goal:** 确认模板检测器正确分类论语.htm，输出规范化 HTML 和 Markdown。（已部分实现，需验证完善）

**Requirements:** R1, R2, R3, R4, R5, R7, R9

**Dependencies:** Unit 1（共享样式表 + 基础设施）

**Files:**

- Modify: `scripts/normalize-html.mjs` — Template A normalizer（已部分实现，需验证完善）
- Create: `src/normalized-html/经部/论语.htm` — 输出
- Create: `content/guji/经部/论语.md` — 输出
- Test: `tests/html-normalization.test.ts`（追加）

**Approach:**

1. 复用 Unit 1 创建的 `normalized.css` 样式表
2. 规范化 HTML 的 `<head>` 中注入 `<link rel="stylesheet" href="../styles/normalized.css">` 替代当前的内联 `<style>` 块
3. 运行 `bun run scripts/normalize-html.mjs --file ~/data/古籍/经部/论语.htm` 验证输出
4. 浏览器直接打开 `src/normalized-html/经部/论语.htm` 验证排版和颜色
5. 运行 `bun run build` 验证 Astro 能消费生成的 Markdown

**Patterns to follow:**

- 现有 `scripts/normalize-html.mjs` 的 cheerio + Turndown 架构
- `src/styles/global.css` 的 OKLCH 色值定义和 `@theme` 结构

**Test scenarios:**

- Happy path: 输入论语.htm → 输出规范化 HTML 含 `<h1>`、`<article>`、`<section>` 和正确 Tailwind classes → 输出 Markdown 含 `# 论语` 和 frontmatter
- Happy path: 规范化 HTML 的 `<head>` 引用 `../styles/normalized.css` 而非内联 `<style>`
- Edge case: 输入文件不存在 → 抛出清晰错误

**Verification:**

- `src/normalized-html/经部/论语.htm` 可浏览器打开，显示正确排版和颜色
- `content/guji/经部/论语.md` 存在且 `bun run build` 成功
- 规范化 HTML 中无 `<FONT>`, `<CENTER>`, `<PRE>`, `<SPAN>` 等遗留标签

- [ ] **Unit 3: Template G normalizer + 儀禮验证（单文件）**

**Goal:** 实现 Template G normalizer，覆盖 ~2,000 文件（裸文本 + `<BR>` 分段）。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**

- Modify: `scripts/lib/template-detector.mjs` — 添加 Template G 检测（`<H2>` + 裸文本 + `<BR>` 分段，无 `<PRE>` 无 `<P justify>`）
- Modify: `scripts/normalize-html.mjs` — 实现 `normalizeTemplateG()` 处理器
- Create: `src/normalized-html/经部/儀禮.htm` — 输出
- Create: 对应 Markdown 输出
- Test: `tests/html-normalization.test.ts`（追加）

**Approach:**

1. 扩展检测器识别 `<H2>`/`<center>` 标题 + 裸正文 + `<BR>` 分段模式
2. `normalizeTemplateG()`: 提取 `<H2>` → `<h1>`，裸正文按 `<BR>` 分割 → `<p>` 段落，处理嵌套 `<OL>`
3. 选择 儀禮.htm（纯 BR 分段）和 釋名.htm（含 OL 嵌套）两个样本验证

**Test scenarios:**

- Happy path: 儀禮.htm → `<BR>` 正确分割为 `<p>` 段落
- Happy path: 釋名.htm → 嵌套 `<OL>` 正确转换为语义化列表
- Edge case: `<H2>` 既是标题又是章节标记 → 正确识别层级

**Verification:**

- 规范化 HTML 可浏览器打开，排版正确
- `bun run build` 成功

- [ ] **Unit 4: Template B（`<P>` 段落）和 Template D（目录页）**

**Goal:** 实现 Template B 和 D normalizer，覆盖 ~900 文件。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**

- Modify: `scripts/normalize-html.mjs` — 添加 Template B 和 D 处理器
- Create: `src/normalized-html/史部-其他/官箴.htm` — Template B 示例
- Create: 目录页规范化 HTML 示例
- Create: `docType: catalog` 的 Markdown
- Test: `tests/html-normalization.test.ts`（追加）

**Approach:**

1. **Template B**（`<P align=justify>` 段落）：
   - 提取标题：居中 `<FONT>` → `<h1>`
   - 提取章节标题：居中 `<FONT>` 或 `<H2>` → `<h2>`
   - `<P align=justify>` 内文本 → `<p class="font-kai leading-loose">`
   - 移除 `<FONT>` 包裹，保留文本
2. **Template D**（目录页）：
   - 提取书名 → `<h1>`
   - 提取 `<table>` 中的 `<a href>` 链接 → `<nav><ul><li><a href>章节名</a></li></ul></nav>`
   - 保留相对路径链接
   - 输出 `docType: catalog` 的 Markdown

**Test scenarios:**

- Happy path: 官箴.htm（Template B）→ 段落正确分割，无 `<FONT>` 遗留
- Happy path: 目录页（Template D）→ `<nav>` 含所有章节链接
- Happy path: 双列表格目录 → 正确转换为 `<ul>` 列表

**Verification:**

- 规范化 HTML 可浏览器打开，排版正确
- Markdown frontmatter 含 `docType: "catalog"`

- [ ] **Unit 5: Template E（Word MsoNormal）和 Template C（Word 单文件）**

**Goal:** 实现 Template E 和 C normalizer，覆盖 ~150 文件。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**

- Modify: `scripts/lib/template-detector.mjs` — 添加 Template E 检测（`MsoNormal` class + `<O:P>` 标签）
- Modify: `scripts/normalize-html.mjs` — 实现 `normalizeTemplateE()` 和 `normalizeTemplateC()` 处理器
- Create: `src/normalized-html/经部/东坡易传/01.htm` — Template E 示例
- Create: 对应 Markdown 输出
- Test: `tests/html-normalization.test.ts`（追加）

**Approach:**

1. **Template E**（Word MsoNormal）：
   - 剥离 `<p class=MsoNormal>` → `<p>`
   - 剥离 `<O:P>` 标签，保留内容
   - 提取 `<span style=...>` 内联样式 → Tailwind classes
   - 处理 `<table>` 布局（非语义化表格）→ 提取内容重建
2. **Template C**（Word 单文件）：
   - `<H1>` → `<h1>`, `<H2>` → `<h2>`
   - `<P align=justify>` → `<p>`
   - 检测 `（全书终）` 时停止处理

**Test scenarios:**

- Happy path: 东坡易传/01.htm → 无 `<O:P>` 遗留，`<span style>` 转换为 Tailwind classes
- Happy path: Template C → `<H1>`→`<h1>`, `<H2>`→`<h2>`, 全书终标记后内容丢弃

**Verification:**

- 规范化 HTML 可浏览器打开，排版正确
- `bun run build` 成功

- [ ] **Unit 6: CLI 完整接口 + 经部全量转换**

**Goal:** 实现完整 CLI 参数，运行经部全量转换并输出统计。

**Requirements:** R1, R2, R6, R8

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4, Unit 5

**Files:**

- Modify: `scripts/normalize-html.mjs` — 完善 CLI 参数解析
- Modify: `package.json` — 添加 `normalize` 命令
- Test: `tests/cli-normalization.test.ts`

**Approach:**

1. 实现完整参数解析：`--file`, `--book`, `--category`, `--all`, `--dry-run`
2. `--category 经部` 执行流程：
   - 扫描目录 → 模板检测 → 规范化 → 输出统计
3. 统计成功/失败/skipped 数量（按模板类型分组统计）
4. 更新 `package.json` scripts

**Test scenarios:**

- Happy path: `--book 论语` → 只转换论语相关文件
- Happy path: `--category 经部` → 转换经部所有文件，输出统计
- Happy path: `--dry-run` → 输出匹配文件列表，不写入
- Edge case: 不存在的书/类别 → 清晰错误提示

**Verification:**

- `bun run normalize --category 经部` 成功
- `bun run build` 成功

## System-Wide Impact

- **Interaction graph:** `scripts/normalize-html.mjs` 读取 `~/data/古籍/`（只读），写入 `src/normalized-html/` 和 `content/guji/`。`content/guji/` 被 Astro Content Collection 消费。`src/normalized-html/styles/normalized.css` 是所有规范化 HTML 的共享样式
- **Error propagation:** 模板检测失败 → Template SKIP → 跳过并记录日志，不静默丢失
- **State lifecycle risks:** 纯批量文件写入，可重复运行（幂等）
- **API surface parity:** `src/content.config.ts` Zod schema 是 Markdown frontmatter 契约
- **Unchanged invariants:** 原始数据永不修改；现有 `scripts/convert-htm-to-md.js` 保留不删除

## Risks & Dependencies

| Risk                          | Likelihood | Impact | Mitigation                                                                                           |
| ----------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `<PRE>`/`<BR>` 内文本分割不准 | High       | Med    | 每个模板先观察 2-3 个样本文件确认分段规则；如无法分割，保留原始格式                                  |
| 模板检测器误判（A vs F）      | Med        | Med    | `--verbose` 输出检测依据；A/F 语义等价，误判不影响最终输出质量                                       |
| Template G 裸文本分段歧义     | High       | Med    | `<BR>` 可能是段落内换行也可能是分段；通过连续 `<BR>` 数量判断                                        |
| 样式表路径相对引用失效        | Low        | Med    | 规范化 HTML 和样式表在同一 `src/normalized-html/` 树下，相对路径 `../styles/normalized.css` 始终正确 |
| 多章节文件目录结构混乱        | Low        | High   | 保留原结构，逐文件独立处理                                                                           |
| Template E Word 标签兼容      | Med        | Low    | `<O:P>` 和 MsoNormal 类剥离逻辑需在多个样本上验证                                                    |

## Documentation / Operational Notes

- 本计划完成后更新 `docs/guji-modernization-plan.md`（标记阶段 1 完成）
- `package.json` scripts 添加 `normalize` 命令
- `README.md` 添加规范化 HTML 使用说明

### 分目录分步实施策略

**原则**：每次针对一个目录，解决一个问题，然后停下来确认。

1. **Unit 1**: 经部/大学章句集注.htm（单文件 Template F 验证）→ 确认检测 + 规范化 + 样式 → 停
2. **Unit 2**: 经部/论语.htm（单文件 Template A 验证）→ 确认 → 停
3. **Unit 3**: 经部/儀禮.htm（单文件 Template G 验证）→ 确认 → 停
4. **扩展**: 经部/ 全量 Template F → 统计确认 → 经部/ 全量 Template A → 统计确认
5. **跨目录**: 史部-其他/ → 史部-廿五史/ → 子部/ → 集部/，每目录独立确认

## Sources & References

- **Origin document:** `docs/plans/2026-04-10-001-feat-html-normalization-pipeline-plan.md`
- Related code: `scripts/normalize-html.mjs`, `scripts/lib/template-detector.mjs`, `src/content.config.ts`
- Related styles: `src/styles/global.css`
- External: cheerio, Turndown, iconv-lite
