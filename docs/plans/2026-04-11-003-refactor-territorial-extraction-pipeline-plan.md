---
title: 'refactor: 领地式串行提取管道（重构版 v2）'
type: refactor
status: active
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md
supersedes: docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md
---

# refactor: 领地式串行提取管道

## Overview

将当前单遍 per-tag 竞争式分类器（`classifyByAttributes` 同时匹配 9 种类型）重构为**领地式串行提取**（9 个独立 Pass，每 Pass 专注一种类型，已认领区域后续跳过）。配合 HTML 预处理、Book Profile 增强、DOM 一次索引、文件树/目录树数据构建和 JSON 索引构建，形成完整管道：

```
Tier 0 基础数据层 → Tier 1 核心提取层 → Tier 2 增强层 → Tier 3 数据增强 + 集成层
```

**与现有管道的关系**: 现有 `content-extractor.mjs` 的多遍分类器（Pass 1-3）和输出渲染器（`renderMarkdown`、`renderHtml5`）保持不变。重构聚焦于 `extractContent()` 的内部提取逻辑。测试保持不变并扩展。

## Problem Frame

当前提取器的根本问题是**规则竞争**：每个 DOM 元素要和所有类型的规则竞争匹配。`classifyByAttributes` 用 `$node.find('font')` 检查深嵌套后代的颜色，导致容器元素被误分类（如 `div.swy1` 被误判为 chapter-title 因为内部包含 `#CC33CC` 字体）。修复方式是加 text length guard，但这只是补丁——根本问题在于单遍分类无法隔离不同类型的规则域。

领地式提取解决这个架构问题：每轮 Pass 只看一种类型的规则，已标记区域自动跳过，消除竞争。同时简化了正文提取——Pass 9 中「剩余即正文」，不需要任何规则。

**当前已完成状态**:

- Unit 0 ✅: Content Collection schema（已有计划）
- Unit 1 ✅: 核心提取器、多遍分类器、目录字典、递归遍历器（已有计划）
- Unit 1b ✅: text.css CSS class 规则（已有计划）
- Unit 2 ✅: HTML5 渲染器（已有计划）
- Unit 2a ✅: 模式缓存机制（已有计划）
- Unit 3 ✅: Markdown 渲染器（已有计划）
- **领地式 Unit 1 (区域跟踪基础设施) ✅: `createTerritory()` 已完成并提交 (`cce3b41`)**
- Unit 4 ❌: CLI 批量处理（已有计划，被本计划覆盖）
- Unit 5 ❌: 经部全量验证（已有计划，被本计划覆盖）

本计划是**重构现有提取器**，不是从零开始。所有已通过测试必须保持通过。

## Requirements Trace

从 origin document 继承（`docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md`）：

- **R1**. 领地式串行提取：9 个 Pass + Pass 10 Fallback (origin §3.2)
- **R2**. 领地标记机制 (origin §3.2.2)
- **R3**. 完整 9 种内容类型 (origin §4)
- **R4**. 容错：无法识别 → main-text (origin §2.4)
- **R5**. AI Fallback 触发 (origin §3.2.3)
- **R6**. JSON 索引文件 `_index.json` (origin §3.4/§3.8)
- **R7**. 编码转换脚本 (origin §6 P0)
- **R8**. 现有 61 个测试保持通过
- **R9**. 增量处理 CLI 参数兼容 (origin §5)
- **R10**. Book Profile 系统 (origin §3.5)
- **R11**. DOM 一次索引 (origin §3.6)
- **R12**. 文件树/目录树数据 (origin §3.8 阶段1)
- **R13**. 文件内容索引 (origin §3.8)

## Scope Boundaries

- **In scope**: `extractContent()` 内部架构重构为领地式串行提取（Pass 1-10）
- **In scope**: HTML 预处理增强（规范化 + 简化）
- **In scope**: Book Profile 系统（分析 + 磁盘缓存 + 规则增强）
- **In scope**: DOM 一次索引（byColor/byClass/byTag/bySize）
- **In scope**: 文件树/目录树数据构建（JSON 格式，per-book 嵌套结构）
- **In scope**: JSON 索引构建（`_index.json`，book-level 摘要）
- **In scope**: 编码转换一次性脚本
- **In scope**: AI Fallback 框架（触发条件、接口定义，不含实际 AI 调用实现）
- **Out of scope**: `renderMarkdown()` 和 `renderHtml5()` — 保持不变
- **Out of scope**: `buildCatalogDict()` / `lookupCatalogMeta()` — 保持不变
- **Out of scope**: 目录-内容自动关联（Component D，见 origin §7）
- **Out of scope**: SQLite 接口（Phase 2，见 origin §3.4）
- **Out of scope**: AI 验证层抽检（Layer 3，独立计划）
- **Out of scope**: 模式缓存磁盘持久化（独立优化）

## Context & Research

### Relevant Code and Patterns

- `scripts/lib/content-extractor.mjs` — 核心提取器（~1046 行，含 Unit 1 新增代码）。需重构 extractContent 内部逻辑。
- `scripts/lib/pattern-cache.mjs` — 模式缓存（~162 行），`flattenTables()` 在此。表格展平已验证有效。
- `scripts/convert-htm-to-md.js` — CLI 入口（~557 行），双管道（ir/legacy）。需扩展编码转换、索引构建、文件树构建。
- `tests/content-extractor.test.ts` — 75 测试（61 原始 + 14 Unit 1），必须保持通过 + 新增领地式测试。
- `tests/pattern-cache.test.ts` — 15 测试，保持不变。
- `~/data/古籍/text.css` — 权威 CSS class 映射（13 个 class）。
- `src/content-ir/经部/大学章句集注.json` — 唯一 IR 输出样本，用于验证 schema。
- `src/content.config.ts` — Content Collection schema（Zod），需扩展 `_aiFallback` 等字段。

### Key Technical Decisions

### D1: 混合领地标记粒度

**决策**: 标题/章节 Pass（Pass 1-3）使用**子树认领**——认领匹配节点及其所有后代。注疏/正文 Pass（Pass 4-9）使用**叶子节点认领**——只认领匹配的叶子元素/文本节点。

**理由**:

- 标题和章节通常是短文本容器（如 `<FONT color="#CC33CC">学而第一</FONT>`），子树认领简单安全，避免父容器残留文本被后续 Pass 误收。
- 注疏可能嵌套在正文中（夹注），叶子认领允许注疏被精确剥离而不吞掉周围正文。
- 正文 Pass 只收集未认领的文本节点，不受容器级认领影响。

**关键约束**: 提取过程中 DOM 必须保持只读（无 `remove()`, `replaceWith()` 等 mutation），否则 cheerio 节点引用会失效。

### D2: Pass 内部用 DOM 索引查询

**决策**: 每个 Pass 不再遍历 DOM，而是在 DOM 一次索引（D7）上查询匹配的节点集合。索引**一次构建，全程复用**——Pass 之间 DOM 不变，claimed 状态通过单独 Set 跟踪，不走索引更新。

**理由**: 多遍扫描被 O(1) 索引查询替代。claimed 过滤在查询结果上做，不修改索引本身。

### D3: 区域合并策略

**决策**: 同类型相邻区域自动合并。不同类型不合并，保持边界清晰。

**理由**: 减少碎片化区域，使最终 IR 更干净。

### D4: patternCache 保留为规则优化手段

**决策**: 保留 `patternCache` 但不依赖它做分类。硬编码规则保底，缓存规则增量优化。

### D5: HTML 规范化放在 `content-extractor.mjs`

**决策**: `normalizeHtml()` 放在 `scripts/lib/content-extractor.mjs` 中作为内部函数。

### D6: Book Profile 动态规则增强

**决策**: 处理每本书第一个文件后，从提取结果中分析 Book Profile，持久化到磁盘缓存，用于增强同书后续文件的 Pass 规则。

### D7: DOM 一次索引 — 懒加载工具

**决策**: `buildDomIndex($)` 作为 per-file 工具函数编写，在提取时按需调用，**不**在启动时一次性构建全量索引。只在访问到具体文件时才构建该文件的 DOM 索引。

**理由**: DOM 索引是 per-file 的半稳定数据，无全局构建必要。工具先行，后续 Pass 集成时按需调用。

### D8: HTML 规范化只做结构层，不碰语义标签

**决策**: 规范化只做结构转换，不做语义标签替换。与 origin §3.7 一致。

### D9: 文件树数据两阶段构建

**决策**: 文件树分 Phase A/B 构建：

- **Phase A**（立即可做，无依赖）：仅扫描 `古籍/` 目录文件系统 → 产出类别/书名/文件路径。不依赖 IR。
- **Phase B**（IR 提取后）：扫描 IR JSON → 补充章节/段落详情，增强 Phase A 的结果。

**理由**: Phase A 数据可被 Book Profile、CLI 调度等后续单元提前消费。

### D10: 文件树与索引数据分离

**决策**: `_filetree.json`（树形导航）和 `_index.json`（book-level 检索）分别构建，职责清晰，消费者不同。

### D11: 编码转换一次性批量完成

**决策**: 编码转换在 Tier 0 一次性批量完成，后续所有管道假设输入全是 UTF-8。比 per-file 懒转换更高效，消除后续所有单元对编码的担忧。

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification._

### 完整数据流

```
═══════════════════════════════════════════════════════════
  TIER 0: 基础数据层（无依赖，先做）
═══════════════════════════════════════════════════════════

古籍/ 目录扫描 (Phase A)
  │  扫文件系统 → 类别/书名/路径
  ▼
_filetree.json (Phase A, 仅骨架)

古籍/*.htm 批量编码转换 (一次性)
  │  GBK → UTF-8 (带 BOM)
  ▼
所有源文件 = UTF-8 (后续管道假设)

buildDomIndex($) 工具函数编写
  │  byColor, byClass, byTag, bySize, allTextNodes
  ▼
DOM 索引工具就绪 (per-file 懒加载，不集成到提取流)

═══════════════════════════════════════════════════════════
  TIER 1: 核心提取层（依赖 Tier 0）
═══════════════════════════════════════════════════════════

normalizeHtml() + flattenTables() (每次运行)
  │  <center> → <div data-center>
  │  表格展平, 空标签剔除, 嵌套 div 合并
  ▼
cheerio.load(normalizedHtml)
  │
  ▼ buildDomIndex($)  ← 使用 Tier 0 工具
  │
  ▼ Book Profile 查询 (若有，从 .pipeline-cache/ 加载)
  │
  ▼ Pass 1: book-title      认领: claimSubtree()
  ▼ Pass 2: metadata        认领: claimSubtree()
  ▼ Pass 3: chapter-title   认领: claimSubtree()
  ▼ Pass 4: annotation      认领: claimLeaf()
  ▼ Pass 5: section-summary  认领: 文本后处理
  ▼ Pass 6: end-marker       认领: 文本后处理
  ▼ Pass 7: colophon         认领: 文本后处理
  ▼ Pass 8: nav-item         认领: claimSubtree() (仅 catalog 页)
  ▼ Pass 9: main-text        认领: extractRemaining() → 剩余即正文
  │
  ▼ Pass 10: 质量评估 + Book Profile 分析
  │   评分 → 低于阈值 → ir._aiFallback = true
  │   分析 Profile → 持久化到 .pipeline-cache/
  │
  ▼ 写入 IR JSON → src/content-ir/<category>/<book>.json

═══════════════════════════════════════════════════════════
  TIER 3: 数据增强 + 集成层
═══════════════════════════════════════════════════════════

文件树 Phase B 增强
  │  扫描 IR → 补充章节详情 → 更新 _filetree.json
  ▼
JSON 索引构建 (_index.json)
  │  扫描 IR → 提取 book-level 摘要
  ▼
CLI 集成 (--build-index, --build-filetree, --encode-convert)
  │
  ▼
经部全量验证

═══════════════════════════════════════════════════════════
  TIER 2 贯穿 Tier 1→3: 增强层
═══════════════════════════════════════════════════════════

  质量评估 + AI Fallback 框架 (Pass 10 后)
  Book Profile 系统 (Pass 10 后分析 + 持久化)
```

### DOM 索引查询机制

```
DOM 索引 (build once per file, immutable during extraction)
  byColor: Map<color, Node[]>
  byClass: Map<class, Node[]>
  byTag: Map<tagName, Node[]>
  bySize: Map<size, Node[]>
  allTextNodes: Node[]

claimed Set (mutable, grows per Pass, 独立于索引)
  claimed: Set<Node>

Pass 查询流程:
  candidates = index.byClass.get("article")  // 从索引拿节点
  matched = candidates.filter(n => !isClaimed(n) && passesRules(n))  // claimed 过滤 + 规则匹配
  matched.forEach(n => claimSubtree(n) || claimLeaf(n))  // 认领
```

## Implementation Units

> **领地式 Unit 1 已完成**（`cce3b41`）：区域跟踪基础设施。以下 Units 按四个 Tier 组织。

---

## Tier 0: 基础数据层（无依赖，先做）

---

- [ ] **Unit 0a: 批量编码转换**

**Goal:** 一次性将 `古籍/` 下所有 GBK 编码 .htm 文件转为 UTF-8（带 BOM），消除后续管道对编码的担忧。

**Requirements:** R7

**Dependencies:** 无

**Files:**

- Create: `scripts/convert-encoding.js`
- Test: 手动验证（脚本本身无需单元测试，dry-run 模式即验证手段）

**Approach:**

- 扫描 `古籍/` 下所有 .htm 文件
- 检测编码（BOM → UTF-8，无 BOM 且含 CJK → GBK 探针）
- GBK 文件原地覆盖为 UTF-8（带 BOM）
- 输出转换报告（总文件数、已转换数、跳过数、错误数）
- `--dry-run` 模式：只报告不写入

**Test scenarios:**

- Happy path: 已知 GBK 文件 → 转换后 UTF-8 输出，内容不变
- Edge case: 已 UTF-8 文件 → 跳过，不修改
- Edge case: dry-run 模式 → 报告正确但不修改文件

**Verification:**

- 脚本对 `古籍/` 中已知 GBK 文件正确转换
- `--dry-run` 先行验证后再执行

---

- [ ] **Unit 0b: 文件树 Phase A（骨架索引）**

**Goal:** 扫描 `古籍/` 目录文件系统，构建 `src/content-ir/_filetree.json` 骨架版——仅包含类别/书名/文件路径，不依赖 IR 提取。

**Requirements:** R12

**Dependencies:** 无

**Files:**

- Create: `scripts/lib/build-filetree.mjs`
- Modify: `scripts/convert-htm-to-md.js` (调用入口)
- Test: `tests/build-filetree.test.ts`

**Approach:**

- 递归扫描 `古籍/` 目录
- 产出结构：
  ```json
  {
    "version": 1,
    "builtAt": "2026-04-11T12:00:00Z",
    "categories": {
      "经部": [{ "id": "大学章句集注", "path": "古籍/经部/大学章句集注.htm" }]
    }
  }
  ```
- 按 category 分组，按书名排序
- 写入 `src/content-ir/_filetree.json`（Phase A 骨架）
- Phase B 后续扫描 IR 补充 chapters/sections 详情

**Test scenarios:**

- Happy path: 含 2 个类别的目录 → 正确分组
- Happy path: 同书多文件 → 合并到同一 book entry
- Edge case: 空目录 → `{categories: {}}`

**Verification:**

- `_filetree.json` 存在且包含所有类别/书名
- 可被后续 CLI 调度消费

---

- [ ] **Unit 0c: DOM 索引工具 + HTML 规范化**

**Goal:** 编写 `buildDomIndex($)` 工具函数和 `normalizeHtml()` 内部函数。不集成到提取流，仅完成工具编写和独立测试。

**Requirements:** R8, R11

**Dependencies:** Unit 1（已有 `createTerritory` 基础设施）

**Files:**

- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**

- **`buildDomIndex($raw)`**: 遍历 DOM 一次，产出：
  - `byColor: Map<string, Node[]>` — 按 COLOR 属性索引
  - `byClass: Map<string, Node[]>` — 按 class 属性索引
  - `byTag: Map<string, Node[]>` — 按标签名索引
  - `bySize: Map<string, Node[]>` — 按 SIZE 属性索引
  - `allTextNodes: Node[]` — 所有文本节点数组
- **`normalizeHtml(html)`**:
  - `<center>` → `<div data-center="1">`（已有逻辑迁移）
  - 表格展平（调用 `flattenTables()`）
  - 空标签剔除
  - 嵌套 div 合并
  - **不做** `<font>` → `<span>` 替换（D8 约束）
- 两个函数均为纯工具，不修改 `extractContent` 内部逻辑

**Test scenarios:**

- Happy path: 含多种 color/class/size 的 HTML → 索引中每个 key 有对应节点
- Happy path: allTextNodes 包含 DOM 中全部文本节点
- Happy path: normalizeHtml 处理 `<center>` + 嵌套 div → 正确展平
- Edge case: 无 COLOR 属性的 HTML → byColor 为空 Map
- Edge case: normalizeHtml 幂等性

**Verification:**

- 现有 75 测试全部通过
- 新增 3+ DOM 索引测试通过
- 新增 3+ 规范化测试通过

---

## Tier 1: 核心提取层（依赖 Tier 0）

---

- [ ] **Unit 1b: Pass 1-3（book-title / metadata / chapter-title）+ DOM 索引集成**

**Goal:** 将 `extractContent()` 重构为领地式 Pass 1-3，集成 DOM 索引查询，替代现有内联标题/章节识别。

**Requirements:** R1, R2, R3, R8

**Dependencies:** Unit 0b, Unit 0c, Unit 1（已有）

**Files:**

- Modify: `scripts/lib/content-extractor.mjs` (extractContent 函数)
- Test: `tests/content-extractor.test.ts`

**Approach:**

- `extractContent` 入口改为：`normalizeHtml` → `cheerio.load` → `buildDomIndex` → Pass 1-10
- **Pass 1 (book-title)**: 从索引查询 → `isClaimed` 过滤 → 规则匹配 → `claimSubtree`
  - 规则: center + `#FF6666`/`#FF0000` + SIZE≥5, 或 class=`article`
  - 文本长度 < 80 字符
  - 产出 → `ir.chapters[0].sections`
- **Pass 2 (metadata)**: 同上流程
  - 规则: 文本匹配 `(朝代·作者)` 模式, 或 class=`metadata`
  - 产出 → 暂存，用于 IR metadata 字段
- **Pass 3 (chapter-title)**: 同上流程
  - 规则: `#CC33CC`, class=`chapter`, 居中+嵌套font
  - 文本长度 < 80 字符
  - 产出 → 每个 chapter-title 创建新 chapter entry

**Test scenarios:**

- Happy path: Template F HTML → 提取 book-title + metadata + 3 chapter-titles
- Happy path: 已有 "should extract chapters from Template F" 必须通过
- Edge case: 标题规则不匹配长文本容器（text length guard）
- Edge case: 无标题时 Pass 1 产出空，不影响 Pass 2/3
- Integration: Pass 1 认领的节点在 Pass 2/3 中被跳过

**Verification:**

- 现有 75 测试全部通过
- 新增 3+ 标题/元数据/章节领地式测试通过
- 真实文件 `经部/大学章句集注.htm` 产出 ≥3 chapters

---

- [ ] **Unit 1c: Pass 4 annotation + Pass 9 main-text**

**Goal:** 实现注疏识别（从正文中剥离）和正文提取（剩余即正文）。

**Requirements:** R1, R2, R3, R4, R8

**Dependencies:** Unit 1b

**Files:**

- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**

- **Pass 4 (annotation)**: 从索引查询 → `isClaimed` 过滤 → 规则匹配 → `claimLeaf`
  - 规则: `FONT[size="9"]`, `style="FONT-SIZE: 9pt"`, class=`annotation`, `#551A8B`
  - 叶子认领模式
  - 注疏暂存到 annotations 数组
- **Pass 9 (main-text)**: 使用 `extractRemaining()`（已有 Unit 1 函数）
  - 所有未 claim 的文本节点 = main-text
  - 不需要任何规则

**Test scenarios:**

- Happy path: Template F → 提取 15 sections with annotations（现有测试）
- Happy path: Template G → 0 annotations，纯正文（现有测试）
- Edge case: 注疏嵌套在正文中（夹注），正确剥离
- Integration: Pass 4 认领后，Pass 9 的剩余文本正确归入 main-text

**Verification:**

- 现有测试通过
- 真实文件产出 ≥15 annotations

---

- [ ] **Unit 1d: Pass 5-8（section-summary / end-marker / colophon / nav-item）**

**Goal:** 实现剩余的 4 个 Pass。

**Requirements:** R1, R2, R3, R8

**Dependencies:** Unit 1c

**Files:**

- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**

- **Pass 5 (section-summary)**: 后处理 main-text content，应用 `SECTION_SUMMARY_RE`
- **Pass 6 (end-marker)**: 后处理 main-text，应用 `END_MARKER_RE`，切分 end-marker 后内容 → colophon
- **Pass 7 (colophon)**: end-marker 之后的文本，匹配出版标记
- **Pass 8 (nav-item)**: 仅 catalog 页面，`<a href>` in catalog context

**Test scenarios:**

- Happy path: "右传之首章，释明明德" → section-summary 拆分
- Happy path: end marker → 后续文本归为 colophon
- Happy path: catalog 页面 → nav-items 提取
- Edge case: 无 section-summary → 不拆分
- Edge case: 非 catalog 页面 → Pass 8 产出空

**Verification:**

- 现有 "should detect section-summary patterns" 通过
- 现有 "should handle end markers" 通过
- 新增 4+ 测试通过

---

## Tier 2: 增强层（依赖 Tier 1）

---

- [ ] **Unit 2a: 质量评估 + AI Fallback 框架**

**Goal:** 实现质量评分和 AI Fallback 标记（仅接口定义和触发条件，不含实际 AI 调用）。

**Requirements:** R4, R5

**Dependencies:** Unit 1d

**Files:**

- Modify: `scripts/lib/content-extractor.mjs`
- Modify: `src/content.config.ts` (添加 `_aiFallback` 字段)
- Test: `tests/content-extractor.test.ts`

**Approach:**

- 质量评分: `score = (chapters > 0 ? 1 : 0) + (annotations > 0 ? 1 : 0) + (sections > 1 ? 1 : 0)`
- score < 2 → `ir._aiFallback = true`
- 定义 `AiFallbackResult` 类型和 `runAiFallback()` 接口（返回占位）
- Schema 更新: 添加 `_aiFallback?: boolean`

**Test scenarios:**

- Happy path: 0 chapters → `_aiFallback = true`
- Happy path: 正常提取 → `_aiFallback` 不存在
- Edge case: 单章节包含全部但有 1 annotation → score = 2（已知限制）

**Verification:**

- 新增 2+ 质量评估测试通过
- IR schema 验证 `_aiFallback` 字段

---

- [ ] **Unit 2b: Book Profile 系统**

**Goal:** 从提取结果中分析 Book Profile，持久化到磁盘缓存，用于增强同书后续文件的 Pass 规则。

**Requirements:** R10

**Dependencies:** Unit 1d

**Files:**

- Create: `scripts/lib/book-profile.mjs`
- Modify: `scripts/lib/content-extractor.mjs` (Profile 查询 + 规则增强)
- Modify: `scripts/convert-htm-to-md.js` (Profile 持久化调用)
- Test: `tests/book-profile.test.ts`

**Approach:**

- `analyzeBookProfile(ir, $raw, book)`: 从 IR 提取结果逆向分析
- `loadBookProfile(book)`: 检查 `.pipeline-cache/profiles/<book>.json`
- 规则增强: Pass 函数接受可选 profile 参数，扩展匹配范围
- 持久化: 每本书第一个文件处理完后写入

**Test scenarios:**

- Happy path: 处理含 `#CC33CC` 章节的文件 → Profile 中 `chapterColors: ["#CC33CC"]`
- Happy path: 加载已有 Profile → Pass 规则扩展匹配
- Edge case: 首次运行无 Profile → 使用硬编码默认规则
- Edge case: Profile 文件损坏 → 降级为默认规则

**Verification:**

- 新增 4+ Book Profile 测试通过
- `.pipeline-cache/profiles/` 存在且格式正确

---

## Tier 3: 数据增强 + 集成层

---

- [ ] **Unit 3a: 文件树 Phase B（内容增强）**

**Goal:** 扫描 IR JSON，补充 `_filetree.json` 中每本书的章节/段落详情。

**Requirements:** R12

**Dependencies:** Unit 0b（Phase A 骨架已存在）, Unit 1d（IR 文件已产出）

**Files:**

- Modify: `scripts/lib/build-filetree.mjs`
- Test: `tests/build-filetree.test.ts`

**Approach:**

- 读取 Phase A 的 `_filetree.json`
- 扫描 `src/content-ir/` 下所有 IR JSON
- 对每个 IR 文件提取 chapters[].title, sections count, dynast, author
- 更新对应 book entry，补充嵌套章节结构

**Test scenarios:**

- Happy path: IR 含多个 chapters → 文件树中章节列表正确
- Happy path: Phase A + Phase B 合并 → 完整文件树
- Edge case: IR 文件缺 title → 用文件名 fallback

**Verification:**

- `_filetree.json` 含完整章节嵌套结构

---

- [ ] **Unit 3b: JSON 索引构建**

**Goal:** 构建 `src/content-ir/_index.json`，提供 book-level 摘要用于全局检索。

**Requirements:** R6, R13

**Dependencies:** Unit 1d（需要 IR 文件已存在）

**Files:**

- Create: `scripts/lib/build-index.mjs`
- Modify: `scripts/convert-htm-to-md.js`
- Test: `tests/build-index.test.ts`

**Approach:**

- 递归扫描 `src/content-ir/` 下所有 .json 文件
- 提取 title, category, chapters[].title, wordCount, processedAt
- 写入 `_index.json`

**Test scenarios:**

- Happy path: 2 个 IR 文件 → 正确 \_index.json
- Edge case: 空目录 → `{books: []}`
- Edge case: IR schema 不完整 → 空字符串填充

**Verification:**

- `_index.json` 存在且格式正确
- 新增 4+ 索引构建测试通过

---

- [ ] **Unit 3c: CLI 集成与端到端验证**

**Goal:** 将所有单元集成到 CLI，更新参数。

**Requirements:** R9

**Dependencies:** Unit 0a-0c, Unit 1b-1d, Unit 2a-2b, Unit 3a-3b

**Files:**

- Modify: `scripts/convert-htm-to-md.js`

**Approach:**

- 新增 `--build-index`, `--build-filetree`, `--rebuild-index` 参数
- `--pipeline ir --all` 自动触发索引和文件树构建
- `--encode-convert` 触发编码转换脚本
- 集成流程: 编码检测 → normalizeHtml → buildDomIndex → 加载 Profile → Pass 1-10 → 质量评估 → 保存 Profile → 输出 IR/MD/HTML5

**Test scenarios:**

- Integration: `--pipeline ir --file 经部/大学章句集注.htm` → 正确 IR + MD + HTML5
- Integration: `--pipeline ir --all --build-index --build-filetree` → 产出 \_index.json + \_filetree.json

**Verification:**

- CLI 参数正常工作
- 单文件和批量模式均通过

---

- [ ] **Unit 3d: 经部全量验证**

**Goal:** 对经部全部文件运行领地式管道，验证覆盖率、正确性、性能。

**Requirements:** R8, R9

**Dependencies:** Unit 3c

**Files:**

- Modify: `scripts/convert-htm-to-md.js`

**Approach:**

- `--pipeline ir --category 经部 --all` 全量处理
- 逐文件对比新旧输出，产出验证报告

**Verification:**

- 经部所有文件成功处理，0 报错
- 覆盖率 ≥ 90%
- AI Fallback 标记 ≤ 10%

---

## Unit 依赖图

```
TIER 0: 基础数据层（无依赖）
├── Unit 0a: 批量编码转换
├── Unit 0b: 文件树 Phase A (骨架)
└── Unit 0c: DOM 索引工具 + HTML 规范化

TIER 1: 核心提取层
├── Unit 1b: Pass 1-3 + DOM 索引集成  ──→ 依赖 Unit 0b, 0c, 已有 Unit 1
│     │
│     └── Unit 1c: Pass 4 + Pass 9
│           │
│           └── Unit 1d: Pass 5-8
│                 │
│                 ├── Unit 2a: 质量评估 + AI Fallback
│                 │
│                 └── Unit 2b: Book Profile 系统

TIER 3: 数据增强 + 集成
├── Unit 3a: 文件树 Phase B (内容增强)  ──→ 依赖 Unit 0b + Unit 1d
├── Unit 3b: JSON 索引构建  ──→ 依赖 Unit 1d
├── Unit 3c: CLI 集成  ──→ 依赖 Unit 0a-0c, 1b-1d, 2a-2b, 3a-3b
└── Unit 3d: 经部全量验证  ──→ 依赖 Unit 3c
```

## System-Wide Impact

- **Interaction graph:** `extractContent()` 是管道的核心函数，被 `processFileIr()` in `convert-htm-to-md.js` 调用。重构后函数签名不变（`extractContent(html, sourcePath, options)`），调用方无需修改。
- **Error propagation:** 领地式提取的容错策略确保单个 Pass 失败不影响后续 Pass（某轮产出空数组即可）。质量评估在 Pass 10 统一处理。
- **State lifecycle:** IR schema 中 `_aiFallback` 是新增字段，`renderMarkdown` 和 `renderHtml5` 忽略此字段，不影响输出。
- **API surface parity:** `extractContent()` 公开接口不变。内部新增的 `claimSubtree`、`claimLeaf`、`buildDomIndex`、`extractRemaining` 等辅助函数不导出。
- **Unchanged invariants:** `renderMarkdown()`、`renderHtml5()`、`buildCatalogDict()`、`lookupCatalogMeta()` 保持不变。IR 输出 schema（chapters、sections、navItems）保持不变。`patternCache` 保留为规则优化手段（D4），不删除。

## Risks & Dependencies

| Risk                           | Likelihood | Impact | Mitigation                                              |
| ------------------------------ | ---------- | ------ | ------------------------------------------------------- |
| 子树/叶子认领模式混用错误      | Medium     | High   | 单元测试分别覆盖 subtree/leaf 模式                      |
| DOM mutation 导致引用失效      | Low        | High   | 提取全程只读（D1 约束）；规范化在 cheerio.load 之前完成 |
| Pass 顺序不适配某些模板        | Medium     | Medium | AI Fallback 兜底；验证层反馈调整顺序                    |
| 重构期间回归测试失败           | Low        | High   | 每 Unit 完成后运行全部测试；测试驱动开发                |
| HTML 规范化过度 → 丢失语义信息 | Low        | Medium | 规范化只做结构转换（D8）；保留原始 HTML 备份            |
| 编码转换误覆盖 UTF-8 文件      | Low        | Medium | 转换前校验 BOM；--dry-run 先行验证                      |
| Book Profile 分析不准确        | Medium     | Low    | Profile 仅用于增强规则，不影响保底匹配                  |
| 9000+ 文件索引 JSON 过大       | Low        | Low    | 纯 JSON 数组约 2.7MB，完全可控                          |
| DOM 索引内存占用过大           | Low        | Medium | 索引仅存节点引用，额外内存 < 2x DOM 大小                |

## Documentation / Operational Notes

- 编码转换脚本是一次性操作（D11），执行后记录转换报告，不纳入日常管道
- `_index.json` 和 `_filetree.json` 每次 `--all` 运行自动重建
- `.pipeline-cache/` 目录应加入 `.gitignore`
- `docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md` 中 Unit 4/5 被本计划覆盖

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md](docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md)
- **Existing IR pipeline plan:** [docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md](docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md)
- Core extractor: `scripts/lib/content-extractor.mjs`
- Pattern cache: `scripts/lib/pattern-cache.mjs`
- CLI entry: `scripts/convert-htm-to-md.js`
- Tests: `tests/content-extractor.test.ts`, `tests/pattern-cache.test.ts`
- External reference: [MinerU document parsing pipeline](https://github.com/opendatalab/mineru)
