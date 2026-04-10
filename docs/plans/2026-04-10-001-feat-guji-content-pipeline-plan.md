---
title: 古籍内容管道 — HTML 结构化转换 + 内容集合
type: feat
status: active
date: 2026-04-10
origin: docs/guji-modernization-plan.md
---

# 古籍内容管道 — HTML 结构化转换 + 内容集合

## Overview

将 `~/data/古籍` 目录中约 9000+ 个老旧 HTML 文件转换为结构化的 Markdown 文档，并接入 Astro Content Collections。**核心难点不是格式转换，而是内容结构识别与重建** — 古籍 HTML 包含章节、注解、校勘、双行小注等丰富结构信息，必须认真解析并保留。

本项目采用**分步策略**：先完成最简单的「纯文本类」古籍（子部/集部为主），验证管道后再处理复杂的「注疏类」（经部）和「编年/纪传类」（史部）。每类完成一个样本集后停下来审查确认。

## Problem Frame

### 源数据特征（实际采样分析）

源 HTML 文件由不同时期、不同人录入，来源混杂（华东师大网站、国学网等），格式极度不统一：

| 特征 | 观察结果 |
|------|----------|
| **编码器** | Microsoft FrontPage 4.0、Netscape 4.05 |
| **字符编码** | 大部分为 UTF-8，部分可能残留 GBK |
| **HTML 版本** | 非标准 HTML 4，大量内联样式和过时标签 |
| **嵌套深度** | 可达 10+ 层 table/blockquote/font 嵌套 |
| **正文章节** | 有的用 `<pre>` 包裹纯文本，有的用 `<ol>` 列表结构 |
| **注解** | 经部有「正文+注+疏」三层结构（如《唐律疏议》450KB+ 单文件） |
| **编年** | 史部（如《资治通鉴》）用年号纪年作为段落前缀 |
| **导航噪声** | 页眉页脚大量导航链接、图片、主题样式 — 需剥离 |
| **缺字** | 部分用 `■` 标记 Unicode 缺字 |

### 四类古籍结构差异

| 部类 | 结构特征 | 复杂度 | 代表样本 |
|------|----------|--------|----------|
| **子部** | 哲学论著，多为纯文本分段落，偶有简单注 | ★★☆ | 《官箴》（14KB, `<pre>` 纯文本） |
| **集部** | 诗文集合，每篇独立，有标题 | ★★☆ | 待采样 |
| **史部-编年** | 按年号纪年分段落，每段内事件连续叙述 | ★★★ | 《资治通鉴》（卷 58: 年号→事件段落） |
| **史部-纪传** | 每人一篇传记，有传主标题和"颂曰"结尾 | ★★★ | 《列女传》（每条有标题+正文+颂） |
| **史部-校注** | 正文+校注并行，含目录索引页 | ★★★★ | 《华阳国志校补图注》（450KB+） |
| **经部-注疏** | 正文+注+疏+校勘记四层嵌套 | ★★★★★ | 《唐律疏议》（大文件） |

### 业界参考

| 项目 | 格式 | 借鉴点 |
|------|------|--------|
| CTEXT (ctext.org) | JSON API, URN 分层 | 轻量分层递归：work → subsection → fulltext |
| CBETA | TEI P5 XML | 校勘记 apparatus、版本 witness、双行小注 encoding |
| TEI Chinese | XML with `<seg>` | 正文/注/疏用 `@type` 区分，linked notes |

**本项目选择**：Markdown + YAML frontmatter 作为存储格式，不追求 TEI XML 的学术级严谨，但要在 Markdown 中保留可识别的结构层次，为后续 AI 标注留出接口。

## Requirements Trace

- **R1.** 源 HTML 中的章节/卷/篇结构必须在输出中可识别（至少保留为 Markdown 标题层次）
- **R2.** 正文与非正文内容（导航噪声、脚本、样式）必须分离 — 输出只包含古籍内容
- **R3.** 注解/校勘/颂/论等内容必须与正文区分，标记为独立段落或块引用
- **R4.** 每篇文档必须包含标准 frontmatter（title, author, dynasty, category, subcategory, source, edition 等）
- **R5.** 转换过程必须可重复 — 同一输入每次产出相同输出
- **R6.** 每类样本转换后需人工审查确认，方可继续
- **R7.** 输出必须接入 Astro Content Collections，阅读页从 collection 读取
- **R8.** 技术基础设施（content config, collection schema, 阅读页改造）必须先于批量转换

## Scope Boundaries

- **包含**: HTML → Markdown 转换脚本重写、Content Collections 配置、阅读页接入、样本转换与审查
- **不包含**: 全文搜索（Phase 2）、AI 标注（Phase 3）、数据库/SQLite（后续阶段按需引入）
- **不包含**: 经部注疏类（《十三经注疏》等）的首批转换 — 留作最后阶段
- **不包含**: 校勘记的精细 apparatus 编码 — 先以块引用保留原文，后续精化
- **不包含**: 缺字（■）的自动补全 — 保留标记，后续处理

## Context & Research

### Relevant Code and Patterns

- `scripts/convert-htm-to-md.js` — 现有转换脚本（213 行），过于简化：只做 cheerio 解析 + turndown 转换，未处理古籍结构
- `src/layouts/BaseLayout.astro` — 基础布局组件
- `src/pages/guji/[slug].astro` — 阅读页，目前无 content collection 接入
- `src/styles/global.css` — 全局样式，已有 @layer 主题系统
- `tests/BaseLayout.test.ts`, `tests/colors.test.ts` — 现有测试
- 无 `content.config.ts` — 需新建
- 无 `content/` 目录 — 需创建

### Institutional Learnings

无 docs/solutions/ 目录，无历史方案可参考。

### External References

- [CTEXT API 数据模型](https://ctext.org/tools/api) — 轻量分层递归
- [CBETA TEI P5](https://github.com/cbeta-org/xml-p5) — 校勘记 apparatus encoding
- [TEI 使用指南](https://tei-c.org/Vault/Tutorials/TEI-ChinLoc-2ndPrintEd.pdf) — 中文 TEI 本地化
- [WH/T 70-2015 古籍元数据规范](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202012/W020200813589545894387.pdf) — 中国行业标准
- [CBDB](https://cbdb.hsites.harvard.edu/) — 人物权威数据库

## Key Technical Decisions

### D1. 存储格式：Markdown + YAML frontmatter（非 TEI XML）

**理由**: 项目技术栈为 Astro（天然支持 Markdown collections），TEI XML 过于重且需额外解析层。Markdown 足以保留结构层次（标题层级、块引用、代码块），且便于人类阅读和编辑。

### D2. 按部类分阶段转换，不按统一模型

**理由**: 四类古籍结构差异巨大。子部纯文本和经部注疏的转换复杂度差 10 倍。采用渐进策略：
1. 纯文本类（子部/集部部分）→ 验证管道
2. 编年/纪传类（史部）→ 处理结构化段落
3. 校注类（史部含校补）→ 处理正文/注文分离
4. 注疏类（经部）→ 处理多层嵌套

每阶段完成后人工审查确认再进入下一阶段。

### D3. 转换架构：两阶段管道

```
Stage 1: HTML 清洗 + 结构识别 → 结构化 JSON
Stage 2: 结构化 JSON → Markdown + frontmatter
```

**理由**: JSON 中间格式使得：
- 可以独立调试「结构识别」和「Markdown 生成」两个环节
- 中间结果可用于后续 AI 标注（JSON 比 Markdown 更易程序处理）
- 便于增量转换（跳过已有 JSON 的文件）

### D4. 不使用数据库（暂不引入 SQLite）

**理由**: 当前阶段只需文件系统的 Markdown 存储。SQLite 在搜索和索引阶段才有价值。当前保持简单。

### D5. 元数据归一化：语义字典

转换脚本从 HTML 提取的元数据（朝代、作者、书名）存在多种写法，必须通过语义字典归一化为 canonical 值。字典同时作为 Content Collections schema 的枚举来源和浏览器端校验参考。详见 [guji-semantic-dictionary.md](../../specs/guji-semantic-dictionary.md)。

### D6. 元数据字段遵循 WH/T 70-2015 核心集

frontmatter 字段设计参考中国古籍元数据规范，包含：title, author, dynasty, category, subcategory, edition, source, date, juan（可选）, language, license。

## Open Questions

### Resolved During Planning

- **Q: 是否统一四类为一个内容集合？**
  - **A: 否。** 用户明确要求不必统一成一个大而全的文档模型。采用 `category` 字段区分，但使用单一 collection（避免四种 collection 的管理开销），通过 frontmatter 的 `category`/`subcategory` 区分部类和子类。
- **Q: 缺字（■）如何处理？**
  - **A: 保留原样，** 用 `[缺字]` 标记，后续可对接 Unicode gaiji 数据库。
- **Q: 转换脚本语言？**
  - **A: 继续用 Node.js（Bun 运行），** 复用已有的 cheerio + turndown 依赖，但大幅增强结构识别逻辑。

### Deferred to Implementation

- **Q: 多版本同一典籍的存储策略**（如简体版 + 繁体版并存）
  - **A: 后续处理，** 当前以源文件为单一版本。
- **Q: 跨文本引用关系**（如《资治通鉴》引用《史记》内容）
  - **A: 后续 AI 标注阶段处理。**
- **Q: 校对后的修正如何回写**
  - **A: 直接修改 Markdown 文件，暂不做双向同步。**

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### 转换管道架构

```
源 HTML 文件 (~/data/古籍/)
    │
    ▼
┌─────────────────────────────────────┐
│  Stage 1: 结构识别 (HTML → JSON)     │
│                                     │
│  1. HTML 清洗（移除脚本/样式/导航）   │
│  2. 编码检测与转换                   │
│  3. 结构解析（标题/段落/注解/颂/疏）  │
│  4. 元数据提取（书名/作者/朝代/分类）  │
│  5. 输出: JSON 中间格式               │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Stage 2: Markdown 生成 (JSON → MD)  │
│                                     │
│  1. 按类型生成 frontmatter           │
│  2. 正文 → Markdown 段落              │
│  3. 注解 → 块引用/注释                │
│  4. 章节 → Markdown 标题              │
│  5. 输出: content/{部}/{书名}.md     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Stage 3: Content Collections 接入    │
│                                     │
│  1. content.config.ts 定义 schema    │
│  2. 阅读页从 getCollection 读取        │
│  3. 动态路由按 collection 条目生成     │
└─────────────────────────────────────┘
```

### 四类结构识别策略

**子部（纯文本类）— ★★☆**
```
HTML: <pre> 段落文本
JSON: { type: "treatise", paragraphs: [...], annotations: [...] }
MD:  纯标题 + 段落，注解用块引用
```

**史部-编年（资治通鉴类）— ★★★**
```
HTML: <pre> 年号纪年 + 事件段落
JSON: { type: "chronicle", entries: [{ era, year, events: [...] }] }
MD:  年号为 h3/h4，事件为段落
```

**史部-纪传（列女传类）— ★★★**
```
HTML: <pre> 传主标题(彩色粗体) + 正文 + 颂曰
JSON: { type: "biography", entries: [{ name, content, ode }] }
MD:  传主为 h3，正文为段落，"颂曰"用块引用
```

**经部-注疏 — ★★★★★**
```
HTML: 嵌套 <ol> 或 <pre> 含注/疏标记
JSON: { type: "annotated", sections: [{ text, commentaries: [{ author, content }] }] }
MD:  正文为段落，注/疏用嵌套块引用
```

## Implementation Units

### 执行策略

每完成一个 Unit 后必须：
1. 运行 `bun run lint && bun run test && bun run build`
2. 人工审查样本输出
3. 用户确认后方可进入下一 Unit

### Unit 编号说明

Unit 0 为语义字典，是所有后续工作的前置基础。Unit 1-3 为基础设施，Unit 4+ 为各批次转换与审查。

- [ ] **Unit 0: 语义字典规范 + 最小可用版本**

**Goal:** 建立古籍元数据规范字典（JSON），为转换脚本的元数据提取、Content Collections schema 验证、浏览器端加载检查提供权威参考

**Requirements:** R4, R5

**Dependencies:** 无

**Files:**
- Create: `docs/specs/guji-semantic-dictionary.md`（规范文档）
- Create: `scripts/lib/dictionary.json`（最小可用字典数据）
- Create: `scripts/lib/dictionary-loader.js`（字典加载与校验工具）
- Test: `scripts/tests/dictionary.test.js`

**Approach:**
- 规范文档定义字典的完整结构、字段含义、使用场景、维护方式
- 字典数据采用 JSON 格式，包含四大域：
  - **dynasties** — 朝代名规范（含别名、公元纪年范围）
  - **categories** — 四部分类法（部→类→属三级，含子类列表）
  - **authors** — 作者名规范（含字号、别名、所属朝代）
  - **books** — 典籍名规范（含简称、异名、所属部类）
- 每条记录的 canonical 字段为唯一标准写法，aliases 数组包含所有变体
- 字典加载器提供两个功能：
  1. `normalize(field, value)` — 将别名映射到 canonical 值（如 `normalize("dynasty", "南宋")` → `"宋"`）
  2. `validate(field, value)` — 检查值是否在字典中
- 当前只填充已采样的典籍/作者/朝代（约 50-100 条），后续随转换进度逐步扩充
- 转换脚本在元数据提取阶段调用 `normalize` 确保输出一致性
- Content Collections schema 引用字典值作为 enum 约束

**Execution note:** 先完成规范文档，再填充最小字典数据（从已采样的源 HTML 中提取），最后写加载器。

**Patterns to follow:**
- 参考 CBDB 的人物命名规范
- 参考 WH/T 70-2015 的朝代/分类受控词表

**Test scenarios:**
- Happy path: `normalize("dynasty", "南宋")` → `"宋"`
- Happy path: `normalize("dynasty", "宋")` → `"宋"`（已是 canonical）
- Happy path: `normalize("author", "吕居仁")` → `"吕本中"`
- Edge case: `normalize` 遇到未知值，返回原始值并 warn
- Edge case: `validate("category", "道部")` → false（不在字典中）
- Integration: 转换脚本对《官箴》提取元数据后，通过 normalize 将 "南宋" 归一为 "宋"
- Verification: `bun run check` 类型检查通过，字典加载无错误

- [ ] **Unit 1: 基础设施 — Content Collections 配置（引用 Unit 0 字典）**

**Goal:** 建立 Astro Content Collections 的 schema 配置，定义古籍文档的类型系统

**Requirements:** R4, R7

**Dependencies:** Unit 0（schema 的枚举值从字典加载）

**Files:**
- Create: `src/content/config.ts`
- Modify: `astro.config.mjs`（如需集成 content 配置）

**Approach:**
- 定义 `guji` collection 的 Zod schema，包含 frontmatter 字段：title, author, dynasty, category, subcategory, edition, source, date, juan, language
- category 为枚举：经部 | 史部 | 子部 | 集部
- 不定义 body 的渲染规则（使用 Astro 默认 Markdown 渲染）
- 保持 schema 宽松 — 后续按需增加字段

**Patterns to follow:**
- Astro 6 Content Collections 文档模式
- 使用 `defineCollection` + `z.object`

**Test scenarios:**
- Happy path: schema 正确验证包含所有必填字段的 frontmatter
- Edge case: schema 拒绝缺少必填字段的文档
- Edge case: category 字段只接受四个合法值
- Verification: `bun run check` 类型检查通过

- [ ] **Unit 2: 基础设施 — 转换管道骨架（JSON 中间格式）**

**Goal:** 重写 `scripts/convert-htm-to-md.js` 为两阶段管道的 Stage 1，实现 HTML 清洗和结构识别，输出 JSON 中间格式

**Requirements:** R1, R2, R5

**Dependencies:** Unit 0, Unit 1

**Files:**
- Modify: `scripts/convert-htm-to-md.js`
- Create: `scripts/lib/html-parser.js`（结构识别模块）
- Create: `scripts/lib/cleaner.js`（HTML 清洗模块）
- Test: `scripts/tests/convert.test.js`（或集成到 vitest）

**Approach:**
- 将现有 monolithic 脚本拆分为模块化管道
- **cleaner.js**: 移除 script/style/link/meta/nav/img（保留 alt）、剥离 theme 噪声、解嵌套 table/blockquote/font、编码检测与转换
- **parser.js**: 识别文档类型（纯文本/编年/纪传/注疏）、提取章节标题、提取正文段落、提取注解/校勘/颂
- **元数据提取**: 从 title 标签、路径、内容头部推断书名/作者/朝代/分类，使用 Unit 0 字典 normalize 归一化
- 输出 JSON 中间格式到临时目录（如 `tmp/json/`）
- 保留现有 `--all` 参数支持，新增 `--stage1` 只输出 JSON

**Execution note:** 先写测试再写实现。从最简单的子部纯文本样本（如《官箴》）开始。

**Patterns to follow:**
- cheerio 用于 DOM 操作
- 使用管道模式：cleanHtml($) → identifyType($) → extractMetadata($) → extractStructure($) → toJSON()

**Test scenarios:**
- Happy path: 《官箴》HTML → 正确提取 title=官箴, author=吕本中, dynasty=南宋, category=子部, paragraphs=[各段落文本]
- Happy path: 《列女传》007.htm → 正确识别多条传记，每条有 name/content/ode
- Edge case: 处理 `<pre>` 中的全角空格（\u3000\u3000）作为段落分隔
- Edge case: 处理 `<font color>` 等内联样式包裹的标题
- Edge case: GBK 编码文件的检测与转换
- Verification: JSON 输出结构完整，无 HTML 标签残留，无导航噪声

- [ ] **Unit 3: 基础设施 — JSON → Markdown 生成器**

**Goal:** 实现 Stage 2，将 JSON 中间格式转换为 Markdown + frontmatter

**Requirements:** R1, R3, R4

**Dependencies:** Unit 2

**Files:**
- Create: `scripts/lib/markdown-generator.js`
- Modify: `scripts/convert-htm-to-md.js`（集成 Stage 2）
- Test: `scripts/tests/markdown-generator.test.js`

**Approach:**
- 按 JSON 的 type 字段（treatise/chronicle/biography/annotated）选择生成策略
- frontmatter 使用 YAML 格式，字段对齐 Unit 1 的 schema
- 正文段落直接输出 Markdown 段落
- 注解/校勘用 Markdown 块引用（`>` ）
- "颂曰"类结尾用 `> **颂曰：**` 格式
- 年号纪年用 `### 年号` 作为小标题
- 输出到 `content/{部}/{书名}/{篇}.md`

**Test scenarios:**
- Happy path: treatise 类型 JSON → 正确的 Markdown 文件带 frontmatter
- Happy path: biography 类型 JSON → 传主为 h3，颂曰为块引用
- Edge case: 处理正文中的特殊字符（Markdown 保留字符）
- Verification: 生成的 Markdown 可被 Astro Content Collections 正确加载

- [ ] **Unit 4: 阅读页接入 Content Collections**

**Goal:** 改造 `src/pages/guji/[slug].astro` 从 Content Collections 读取数据，而非静态 props

**Requirements:** R7

**Dependencies:** Unit 0, Unit 1, Unit 3（至少有一个样本 Markdown 存在）

**Files:**
- Modify: `src/pages/guji/[slug].astro`
- Modify: `src/layouts/BaseLayout.astro`（如需要适配 collection 数据）
- Modify: `src/pages/index.astro`（导航从 collection 生成）
- Test: `tests/guji-page.test.ts`

**Approach:**
- 实现 `getStaticPaths` 从 `getCollection('guji')` 读取所有条目
- 使用 `Astro.params.slug` 匹配 entry
- 保留现有的模板切换功能
- 缺失 slug 时返回 404
- 首页的「最近更新」从 collection 按 date 排序

**Test scenarios:**
- Happy path: 访问已有 slug 的阅读页，正确渲染内容
- Happy path: 模板切换功能正常工作
- Edge case: 访问不存在的 slug 返回 404
- Verification: `bun run dev` 后访问页面正常，模板切换正常

- [ ] **Unit 5: 子部样本转换与审查**

**Goal:** 完成子部全部 HTML 文件的转换，人工审查样本

**Requirements:** R1, R2, R4, R5, R6

**Dependencies:** Unit 0, Unit 1-3

**Files:**
- Modify: `scripts/convert-htm-to-md.js`（批量模式）
- Output: `content/子部/*.md`

**Approach:**
- 扫描 `~/data/古籍/子部*/` 目录
- 批量执行 Stage 1 + Stage 2
- 输出 Markdown 到 `content/子部/`
- 随机抽样 10 个文件人工检查
- 审查点：章节结构是否保留、元数据是否准确、噪声是否清除

**Test scenarios:**
- Integration: 批量转换全部子部文件，无报错
- Edge case: 处理子部中嵌套较深的目录结构（如 `子部-魏晋以下/`）
- Verification: 生成的 Markdown 文件数量 = 源 HTML 文件数量（减去索引页）
- Verification: 抽样检查内容结构完整

- [ ] **Unit 6: 集部样本转换与审查**

**Goal:** 完成集部 HTML 文件转换，人工审查

**Requirements:** R1, R2, R4, R6

**Dependencies:** Unit 5（复用子部管道，可能需调整诗文处理策略）

**Files:**
- Output: `content/集部/*.md`

**Approach:**
- 同 Unit 5，针对集部（诗文集合）调整识别策略
- 诗文标题作为 h3/h4，正文保留原格式
- 审查后确认管道，进入史部

**Test scenarios:**
- Integration: 批量转换全部集部文件
- Verification: 诗文格式保留正确

- [ ] **Unit 7: 史部-编年类样本转换与审查**

**Goal:** 完成《资治通鉴》等编年体史书的转换

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 5

**Files:**
- Modify: `scripts/lib/html-parser.js`（增加编年识别策略）
- Output: `content/史部/资治通鉴/*.md`

**Approach:**
- 识别年号纪年模式（如 `孝灵皇帝中光和四年（辛酉，公元一八一年）`）
- 每个年号下事件作为独立段落
- 年号作为 h3 小标题
- 审查点：年号识别准确率、事件段落不丢失

**Test scenarios:**
- Happy path: 资治通鉴卷 58 → 每个年号为 h3，事件为段落
- Edge case: 处理跨年号的长段落
- Verification: 抽样检查年号纪年完整性

- [ ] **Unit 8: 史部-纪传类样本转换与审查**

**Goal:** 完成《列女传》等纪传体史书的转换

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 5

**Files:**
- Modify: `scripts/lib/html-parser.js`（增加纪传识别策略）
- Output: `content/史部/列女传/*.md`

**Approach:**
- 识别传主标题（彩色粗体 `<B><FONT COLOR>` 包裹的人名）
- 正文为段落
- "颂曰"结尾为块引用
- 审查点：每条传记独立、颂曰保留

**Test scenarios:**
- Happy path: 列女传 007.htm → 每条孽嬖传人物独立，有标题+正文+颂
- Verification: 传记数量与源文件一致

- [ ] **Unit 9: 史部-校注类样本转换与审查**

**Goal:** 完成《华阳国志校补图注》《唐律疏议》等含校注的史书转换

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 7, Unit 8

**Files:**
- Modify: `scripts/lib/html-parser.js`（增加校注分离策略）
- Modify: `scripts/lib/markdown-generator.js`（增加 annotated 类型生成）
- Output: `content/史部/华阳国志/*.md`

**Approach:**
- 分离正文与校注内容
- 校注用块引用标注来源（如 `> **任乃强校注：** ...`）
- 大文件处理（450KB+ 文件的分块策略）
- 审查点：正文不被注文污染、注文不丢失

**Test scenarios:**
- Happy path: 华阳国志卷一 → 正文与校注分离
- Edge case: 处理 450KB+ 大文件
- Verification: 正文完整性检查

- [ ] **Unit 10: 经部-注疏类样本转换与审查**

**Goal:** 完成经部注疏类古籍的转换（最高复杂度）

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 9

**Files:**
- Modify: `scripts/lib/html-parser.js`（增加注疏嵌套识别）
- Output: `content/经部/*.md`

**Approach:**
- 识别正文/注/疏三层结构
- 使用嵌套块引用（`>` 一层为注，`>>` 为疏）
- 先转换 1-2 个经部样本确认策略
- 审查通过后批量转换

**Test scenarios:**
- Happy path: 经部注疏文件 → 正文/注/疏层次正确
- Edge case: 处理嵌套深度超过 3 层的结构
- Verification: 人工审查经部样本

## System-Wide Impact

- **Interaction graph:** Content Collections 接入影响所有读取古籍数据的组件（阅读页、首页导航、模板切换）
- **Error propagation:** 转换脚本的元数据提取错误会导致 frontmatter 不完整，但不会导致运行时崩溃（schema 验证会捕获）
- **State lifecycle risks:** 转换是单向操作（HTML → JSON → MD），无状态回写问题
- **API surface parity:** Content Collections schema 一旦定义，后续扩展需保持向后兼容
- **Integration coverage:** 转换管道与 Astro 构建管道的交接点在 `content/` 目录 — Markdown 文件必须通过 `bun run check` 的 schema 验证
- **Unchanged invariants:** 现有模板切换功能、样式系统、CSP 策略不受影响

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| HTML 结构差异超出预期，解析器无法覆盖所有情况 | 每类先用样本调试，逐步补充边界情况处理；保留原始 HTML 备份 |
| 大文件（450KB+）处理超时或内存溢出 | 分块处理策略；单文件超时监控 |
| 元数据提取不准确（作者/朝代推断错误） | 人工审查阶段修正；frontmatter 允许后续手动编辑 |
| 编码检测失败导致乱码 | 保留源文件备份；GBK 检测用 iconv 的严格模式 |
| Markdown 输出不通过 Astro schema 验证 | 每类样本生成后立即运行 `bun run check` |
| 转换过程中丢失特殊结构（如表格、诗词格式） | 保留源文件对照；特殊结构用 HTML-in-Markdown 保留 |

## Documentation / Operational Notes

- **转换日志**: 每次批量转换生成 `tmp/convert-log.json` 记录成功/失败文件
- **回滚**: 保留源 HTML 文件不动，Markdown 输出为新增，可随时删除重建
- **审查流程**: 每阶段完成后，用户抽查 5-10 个样本，确认结构/内容/元数据正确后继续

## Sources & References

- **Origin document:** [docs/guji-modernization-plan.md](docs/guji-modernization-plan.md)
- Related code: `scripts/convert-htm-to-md.js`, `src/pages/guji/[slug].astro`
- External docs:
  - [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
  - [CTEXT API](https://ctext.org/tools/api)
  - [CBETA TEI P5](https://github.com/cbeta-org/xml-p5)
  - [TEI 使用指南（中文版）](https://tei-c.org/Vault/Tutorials/TEI-ChinLoc-2ndPrintEd.pdf)
  - [WH/T 70-2015 古籍元数据规范](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202012/W020200813589545894387.pdf)
