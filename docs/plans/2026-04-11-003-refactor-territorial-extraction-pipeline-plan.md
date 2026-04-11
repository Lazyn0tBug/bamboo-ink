---
title: 'refactor: 领地式串行提取管道'
type: refactor
status: active
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md
---

# refactor: 领地式串行提取管道

## Overview

将当前单遍 per-tag 竞争式分类器（`classifyByAttributes` 同时匹配 9 种类型）重构为**领地式串行提取**（6 个独立 Pass，每 Pass 专注一种类型，已认领区域后续跳过）。配合 HTML 预处理增强和 JSON 索引构建，形成四层管道：预处理 → 提取 → AI Fallback → 索引。

**与现有管道的关系**: 现有 `content-extractor.mjs` 的多遍分类器（Pass 1-3）和输出渲染器（`renderMarkdown`、`renderHtml5`）保持不变。重构聚焦于 `extractContent()` 的内部提取逻辑——从「单次遍历时内联分类」改为「多轮领地式扫描」。测试保持不变并扩展。

## Problem Frame

当前提取器的根本问题是**规则竞争**：每个 DOM 元素要和所有类型的规则竞争匹配。`classifyByAttributes` 用 `$node.find('font')` 检查深嵌套后代的颜色，导致容器元素被误分类（如 `div.swy1` 被误判为 chapter-title 因为内部包含 `#CC33CC` 字体）。修复方式是加 text length guard，但这只是补丁——根本问题在于单遍分类无法隔离不同类型的规则域。

领地式提取解决这个架构问题：每轮 Pass 只看一种类型的规则，已标记区域自动跳过，消除竞争。同时简化了正文提取——Pass 4 中「剩余即正文」，不需要任何规则。

**当前已完成状态**（来自 `docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md`）：
- Unit 0 ✅: Content Collection schema
- Unit 1 ✅: 核心提取器、多遍分类器、目录字典、递归遍历器
- Unit 1b ✅: text.css CSS class 规则
- Unit 2 ✅: HTML5 渲染器
- Unit 2a ✅: 模式缓存机制
- Unit 3 ✅: Markdown 渲染器
- Unit 4 ❌: CLI 批量处理
- Unit 5 ❌: 经部全量验证

本计划是**重构现有提取器**，不是从零开始。所有已通过测试必须保持通过。

## Requirements Trace

从 origin document 继承：

- R1. 领地式串行提取：9 个 Pass（book-title → metadata → chapter-title → annotation → section-summary → end-marker → colophon → nav-item → main-text）+ Pass 10 Fallback (see origin: docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md §3.2)
- R2. 领地标记机制：每 Pass 产出 region 标记，后续 Pass 跳过已认领区域 (see origin: §3.2.2)
- R3. 完整 9 种内容类型：book-title, metadata, chapter-title, main-text, annotation, section-summary, end-marker, colophon, nav-item (see origin: §4)
- R4. 容错：无法识别 → main-text，不报错不中断 (see origin: §2.4)
- R5. AI Fallback 触发：质量阈值检测（0 chapters、单章节包含全部、0 annotations 但有信号）(see origin: §3.2.3)
- R6. JSON 索引文件：`src/content-ir/_index.json`，覆盖 9000+ 文件 (see origin: §3.4)
- R7. 编码转换脚本：一次性 GBK → UTF-8 转换 (see origin: §6 P0)
- R8. 现有 61 个测试必须保持通过 (regression constraint)
- R9. 增量处理 CLI 参数保持兼容 (--pipeline ir, --file, --book, --category, --all) (see origin: §5 non-functional)

## Scope Boundaries

- **In scope**: `extractContent()` 内部架构重构为领地式串行提取
- **In scope**: HTML 预处理增强（规范化 + 简化）
- **In scope**: JSON 索引构建（`_index.json`）
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

- `scripts/lib/content-extractor.mjs` — 核心提取器（~887 行），当前多遍分类器。需重构为领地式串行提取。
- `scripts/lib/pattern-cache.mjs` — 模式缓存（~162 行），`flattenTables()` 在此。表格展平已验证有效。
- `scripts/convert-htm-to-md.js` — CLI 入口（~557 行），双管道（ir/legacy）。需扩展编码转换和索引构建。
- `tests/content-extractor.test.ts` — 61 测试，必须保持通过 + 新增领地式测试。
- `tests/pattern-cache.test.ts` — 15 测试，保持不变。
- `~/data/古籍/text.css` — 权威 CSS class 映射（13 个 class）。
- `src/content-ir/经部/大学章句集注.json` — 唯一 IR 输出样本，用于验证 schema。

### Key Technical Decisions

### D1: 混合领地标记粒度

**决策**: 标题/章节 Pass（Pass 1-2）使用**子树认领**——认领匹配节点及其所有后代。注疏/正文 Pass（Pass 3-4）使用**叶子节点认领**——只认领匹配的叶子元素/文本节点。

**理由**:
- 标题和章节通常是短文本容器（如 `<FONT color="#CC33CC">学而第一</FONT>`），子树认领简单安全，避免父容器残留文本被后续 Pass 误收。
- 注疏可能嵌套在正文中（夹注），叶子认领允许注疏被精确剥离而不吞掉周围正文。
- 正文 Pass 只收集未认领的文本节点，不受容器级认领影响。

**关键约束**: 提取过程中 DOM 必须保持只读（无 `remove()`, `replaceWith()` 等 mutation），否则 cheerio 节点引用会失效。

### D2: Pass 内部仍用多遍扫描

**决策**: 每个 Pass 内部仍使用 3 遍扫描（结构上下文 → 属性规则 → 文本模式），但只匹配该 Pass 的目标类型。

**理由**: 多遍扫描已被证明有效（27 测试通过）。变化的是 Pass 之间的隔离——不同 Pass 不再竞争同一 DOM 节点。

### D3: 区域合并策略

**决策**: 同类型相邻区域自动合并（如连续 3 个 annotation 段落 → 1 个 annotation 区域）。不同类型不合并，保持边界清晰。

**理由**: 减少碎片化区域，使最终 IR 更干净。相邻同类型区域在语义上通常属于同一内容块。

### D4: patternCache 保留为规则优化手段

**决策**: 保留 `patternCache` 但不依赖它做分类。缓存的章节颜色、注疏字号等信息可用于动态增强各 Pass 的规则匹配（如从缓存的 `chapterTitleColors` 动态扩展 TITLE_RULES），但规则引擎本身使用硬编码默认规则保底。

**理由**: 硬编码规则保证首次运行即可用（不依赖先验分析），缓存规则提供增量优化空间。两者互补，不互斥。

### D5: HTML 规范化放在 `content-extractor.mjs`

**决策**: `normalizeHtml()` 放在 `scripts/lib/content-extractor.mjs` 中作为内部函数，不放在 `pattern-cache.mjs`。

**理由**: `pattern-cache.mjs` 职责是模式缓存，加入规范化函数违反单一职责。`content-extractor.mjs` 已有 `flattenTables()` 和 `<center>` 替换逻辑，规范化自然归属此处。

### D6: Book Profile 动态规则增强

**决策**: 处理每本书第一个文件后，从提取结果中分析 Book Profile（章节颜色、注疏字号、内容容器等），用于增强同书后续文件的 Pass 规则。Profile 持久化到磁盘缓存。

**理由**: 9000+ 文件来自 ~200-300 本书，每本书共享同一套 FrontPage 模板。Book Profile 让规则从「猜」变为「已知」，显著提升可靠性和性能。

### D7: DOM 一次索引

**决策**: cheerio.load() 后执行一次 DOM 遍历，建立 byColor/byClass/byTag/bySize 索引 Map + allTextNodes 数组。9 个 Pass 在索引上查询，不再遍历 DOM。

**理由**: 9 Pass × O(n) = O(9n)。一次索引 + 9 次 Map 查询 = O(n)。对大文件和 9000+ 规模累计差异显著。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### 领地式提取数据流

```
HTML (UTF-8, normalized, table-flattened)
     │
     ▼ cheerio.load()
     │
     ▼ $raw (DOM tree, read-only — 提取全程无 mutation)
     │
     ▼ DOM 一次索引: byColor, byClass, byTag, bySize, allTextNodes
     │
     ▼ extractTitle($raw) → ir.title
     │
     ▼ Pass 1: book-title    规则: center + #FF6666/FF0000 + SIZE≥5, class=article
       认领: claimSubtree() → claimed += 标题节点+后代
     │
     ▼ Pass 2: metadata      规则: "(朝代·作者)" pattern, class=metadata
       认领: claimSubtree() → claimed += 元数据节点
     │
     ▼ Pass 3: chapter-title 规则: #CC33CC, class=chapter, 居中+嵌套font
       认领: claimSubtree() → claimed += 章节节点+后代
     │
     ▼ Pass 4: annotation    规则: font-size=9pt, class=annotation, #551A8B
       认领: claimLeaf()    → claimed += 注疏叶子节点（不吞周围正文）
     │
     ▼ Pass 5: section-summary 规则: SECTION_SUMMARY_RE ("右传之X章")
       认领: 文本后处理，拆分 main-text → section-summary + main-text
     │
     ▼ Pass 6: end-marker    规则: END_MARKER_RE ("仪礼终")
       认领: 文本后处理
     │
     ▼ Pass 7: colophon      规则: "------YOUTH整理" 等出版标记
       认领: 文本后处理
     │
     ▼ Pass 8: nav-item      规则: <a href> in catalog context
       认领: claimSubtree() → 仅 catalog 页面
     │
     ▼ Pass 9: main-text     规则: 无。未 claimed 的文本节点 = main-text
       → 最大简化：不需要任何规则
     │
     ▼ Pass 10: Fallback + Book Profile
           质量评分: 基于 Book Profile 的相对比较（非魔法数字）
           低于阈值 → flag for AI Fallback
           未 claim 区域 → main-text（默认容错）
           分析 Book Profile → 持久化到磁盘缓存
```

### Region 跟踪数据结构

```
claimed: Set<Node>        // 已被认领的 DOM 节点（元素 + 文本节点）
regions: Array<{
  type: string,            // content type
  content: string,         // 提取的文本
  sourceNodes: Node[]      // 来源节点（用于合并和调试）
}>

// 子树认领：标题/章节 Pass 使用
function claimSubtree(node) {
  claimed.add(node)
  for (const child of node.children) claimSubtree(child)
  // 同时认领文本节点
}

// 叶子节点认领：注疏/正文 Pass 使用
function claimLeaf(node) {
  claimed.add(node)
  // 不认领后代，保留周围正文
}
```

### Pass 间状态传递

```
extractContent(html, sourcePath, options):
  $raw = cheerio.load(prepare(html))
  claimed = new Set()

  // Pass 1: title
  titleRegions = extractByRules($raw, claimed, TITLE_RULES)
  claimed.add(titleRegions.flatMap(r => r.sourceNodes))
  ir.chapters.push({ title: "", sections: titleRegions.map(r => toSection(r)) })

  // Pass 2: chapters
  chapterRegions = extractByRules($raw, claimed, CHAPTER_RULES)
  claimed.add(chapterRegions.flatMap(r => r.sourceNodes))
  // Split into chapters by chapter-title

  // Pass 3: annotations
  annotationRegions = extractByRules($raw, claimed, ANNOTATION_RULES)
  claimed.add(annotationRegions.flatMap(r => r.sourceNodes))

  // Pass 4: main-text (remaining)
  textRegions = extractRemaining($raw, claimed)

  // Pass 5: section-summary (post-process text regions)
  splitSectionSummaries(textRegions)

  // Pass 6: quality assessment
  quality = assessQuality(ir)
  if quality < THRESHOLD: ir._aiFallback = true

  return ir
```

## Implementation Units

- [ ] **Unit 1: 区域跟踪基础设施**

**Goal:** 建立领地标记机制的核心数据结构——`claimed` Set 和区域收集器。不修改现有提取逻辑，只添加基础设施。

**Requirements:** R1, R2

**Dependencies:** 无（基础设施层）

**Files:**
- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- 在 `extractContent()` 内新增 `claimed: Set<Node>` 数据结构
- 新增 `claimSubtree($raw, node)` 函数——认领节点及其所有后代（含文本节点），用于标题/章节 Pass
- 新增 `claimLeaf(node)` 函数——只认领单个节点，用于注疏 Pass
- 新增 `isClaimed(node)` 函数——检查节点是否已被认领
- 新增 `extractByRules($raw, claimed, rules, claimMode)` 辅助函数——根据规则集扫描 body children，跳过已认领节点，按 claimMode（subtree/leaf）认领匹配节点
- 新增 `extractRemaining($raw, claimed)` 函数——收集所有未认领的文本节点（跳过已认领元素的后代文本节点）
- 新增 `mergeAdjacentRegions(regions)` 函数——合并同类型相邻区域
- **关键约束**: 提取过程中 DOM 必须保持只读（无 mutation），否则节点引用失效
- 保持所有现有函数不变（`classifyByAttributes`, `classifyByText`, `detectStructure` 等可复用）

**Execution note:** 先写测试再实现——定义 3 个测试：claim/unclaimed 正确性、区域合并、extractByRules 跳过已认领节点。

**Test scenarios:**
- Happy path: `claimSubtree()` 后 `isClaimed()` 对节点及其后代均返回 true
- Happy path: `claimLeaf()` 后 `isClaimed()` 仅对目标节点返回 true，后代返回 false
- Happy path: `extractByRules(claimMode="subtree")` 跳过 claimed 节点，认领匹配节点及其后代
- Happy path: `mergeAdjacentRegions()` 合并相邻同类型区域，保留不同类型边界
- Edge case: claimed Set 为空时 `extractByRules()` 行为等同于全量扫描
- Edge case: 子树认领后 `extractRemaining()` 不收集已认领容器的后代文本节点

**Verification:**
- 3 个新增测试通过
- 现有 61 测试不受影响

---

- [ ] **Unit 2: Pass 1 标题提取 + Pass 2 章节提取**

**Goal:** 用领地式方式实现标题和章节提取，替代现有的内联标题/章节识别逻辑。

**Requirements:** R1, R2, R3, R8

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/lib/content-extractor.mjs` (extractContent 函数)
- Test: `tests/content-extractor.test.ts`

**Approach:**
- **Pass 1 (标题)**: 定义 TITLE_RULES——
  - center 容器 + COLOR=`#FF6666`/`#FF0000` + SIZE≥5
  - class=`article`
  - 文本长度 < 80 字符（复用现有 text length guard）
- **Pass 2 (章节)**: 定义 CHAPTER_RULES——
  - COLOR=`#CC33CC` + 文本长度 < 80
  - class=`chapter`
  - 居中 + `#CC33CC` 嵌套 font
- 每个 Pass 产出 regions，claim 节点，填充 IR
- Pass 1 的 book-title 放入 IR 的 `chapters[0].sections`（零号章节用于存放 book-level 内容）
- Pass 2 的 chapter-title 创建新 chapter entry

**Test scenarios:**
- Happy path: Template F HTML → 提取 book-title + 3 chapter-titles
- Happy path: 已有测试 "should extract chapters from Template F" 必须通过
- Edge case: 标题规则不匹配长文本容器（text length guard 验证）
- Edge case: 无标题时 Pass 1 产出空，不影响后续 Pass
- Integration: Pass 1 认领的节点在 Pass 2 中被跳过，不被重复识别

**Verification:**
- 现有 61 测试全部通过（回归保护）
- 新增 3+ 标题/章节领地式测试通过
- 真实文件 `经部/大学章句集注.htm` 产出 ≥3 chapters

---

- [ ] **Unit 3: Pass 3 注疏提取 + Pass 4 正文提取**

**Goal:** 实现注疏识别（从正文中剥离注释区域）和正文提取（剩余即正文）。

**Requirements:** R1, R2, R3, R4, R8

**Dependencies:** Unit 2

**Files:**
- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- **Pass 3 (注疏)**: 定义 ANNOTATION_RULES——
  - `FONT[size="9"]` / `style="FONT-SIZE: 9pt"`
  - class=`annotation`
  - COLOR=`#551A8B`
  - 注疏区域附加到最近的 main-text section（暂存到 annotations array）
- **Pass 4 (正文)**: 不需要规则——收集所有未 claim 的文本节点
  - 遍历 body children，跳过 claimed 节点
  - 连续未认领文本节点合并为一个 main-text region
  - 注疏在 Pass 3 已提取，Pass 4 不会误收
- 注疏归属：Pass 4 收集 main-text 时，将最近的未归属注疏附加到该 section

**Test scenarios:**
- Happy path: Template F HTML → 提取 15 sections with annotations（现有测试）
- Happy path: Template G HTML → 0 annotations，纯正文（现有测试）
- Edge case: 注疏区域与章节标题相邻时，注疏不吞掉标题
- Edge case: 注疏嵌套在正文字符串中（夹注），正确剥离
- Integration: Pass 3 认领后，Pass 4 的剩余文本正确归入 main-text

**Verification:**
- 现有测试 "should extract annotations from Template F" 通过
- 现有测试 "should handle Template G (no annotations)" 通过
- 真实文件 `经部/大学章句集注.htm` 产出 ≥11 section-summaries 和 ≥15 annotations

---

- [ ] **Unit 4: Pass 5 段落标记 + Pass 6 质量评估**

**Goal:** 在正文块内识别 section-summary（"右传之X章"），实现质量评估和 AI Fallback 标记。

**Requirements:** R1, R3, R4, R5, R8

**Dependencies:** Unit 3

**Files:**
- Modify: `scripts/lib/content-extractor.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- **Pass 5 (段落标记)**: 后处理 Pass 4 产出的 main-text regions
  - 对每个 main-text region 的 content 应用 `SECTION_SUMMARY_RE`
  - 匹配到的区域拆分为 `section-summary` + 剩余 `main-text`
  - 复用现有的 `classifyByText()` 中的 regex
- **Pass 6 (质量评估)**: 简单启发式评分（P1 已知限制：公式粗粒度，后续可改进）
  - `score = (chapters > 0 ? 1 : 0) + (annotations > 0 ? 1 : 0) + (sections > 1 ? 1 : 0)`
  - score < 2 → 标记 `ir._aiFallback = true`（AI Fallback 的实际调用在后续计划实现）
  - 未认领区域 → 归入当前 chapter 的最后一个 main-text section
  - **已知限制**: 公式仅检测完全失败（0/1 分），无法识别部分失败（如单章节包含全部但恰好有 1 annotation 得 2 分）。后续通过 AI 验证层改进。

**Test scenarios:**
- Happy path: "右传之首章，释明明德" → section-summary 从 main-text 中拆分
- Happy path: end marker "----------------YOUTH整理" → 后续文本归为 colophon
- Edge case: 无 section-summary 模式的纯正文 → 不拆分
- Edge case: 质量评分 < 2 → `_aiFallback` 标记为 true
- Edge case: 质量评分 >= 2 → `_aiFallback` 为 false 或 undefined

**Verification:**
- 现有测试 "should detect section-summary patterns" 通过
- 现有测试 "should handle end markers" 通过
- 新增 2 质量评估测试通过

---

- [ ] **Unit 5: HTML 预处理增强 + 编码转换脚本**

**Goal:** 增强 HTML 规范化（更多 FrontPage 标签处理），编写一次性编码转换脚本。

**Requirements:** R7

**Dependencies:** 无（独立于领地式提取）

**Files:**
- Modify: `scripts/lib/content-extractor.mjs` (新增 `normalizeHtml()` 内部函数)
- Create: `scripts/convert-encoding.js`
- Test: `tests/content-extractor.test.ts` (规范化测试)

**Approach:**
- **HTML 规范化增强** (在 `normalizeHtml()` 中):
  - `<center>` → `<div data-center="1">` (已有，迁移到 normalizeHtml)
  - 表格展平 (已有 `flattenTables()`，调用链整合)
  - `<font>` → `<span>` 标签替换（保留属性）
  - `<b>/<i>/<u>` → `<strong>/<em>/<u>` 语义化
  - 空标签剔除 (`<div></div>`, `<span></span>`)
  - 嵌套 div 合并 (`<div><div>content</div></div>` → `<div>content</div>`)
- **编码转换脚本** (`scripts/convert-encoding.js`):
  - 扫描 `古籍/` 下所有 .htm 文件
  - 检测编码（BOM → UTF-8，无 BOM 且含 CJK → GBK 探针）
  - GBK 文件原地覆盖为 UTF-8（带 BOM）
  - 输出转换报告（总文件数、已转换数、跳过数、错误数）
  - `--dry-run` 模式：只报告不写入

**Test scenarios:**
- Happy path: normalizeHtml 处理含 `<center>` + 嵌套 `<font>` 的 HTML → 标准化输出
- Happy path: 编码转换脚本处理 GBK 文件 → UTF-8 输出，内容不变
- Edge case: normalizeHtml 处理已规范化的 HTML → 不变（幂等性）
- Edge case: 编码转换 dry-run 模式 → 报告正确但不修改文件

**Verification:**
- 新增 3+ 规范化测试通过
- 编码转换脚本对 `古籍/` 中已知 GBK 文件正确转换
- 现有测试不受影响

---

- [ ] **Unit 6: JSON 索引构建**

**Goal:** 处理完成后构建 `src/content-ir/_index.json`，为 9000+ 文件提供统一检索入口。

**Requirements:** R6, R9

**Dependencies:** Unit 4（需要 IR 文件已存在）

**Files:**
- Create: `scripts/lib/build-index.mjs`
- Modify: `scripts/convert-htm-to-md.js` (IR 管道末尾调用索引构建)
- Test: `tests/build-index.test.ts`

**Approach:**
- **索引构建函数** (`buildIrIndex(irDir) → indexObject`):
  - 递归扫描 `irDir` 下所有 .json 文件（排除 `_index.json`）
  - 对每个 IR 文件提取：title, category, chapters[].title, wordCount, processedAt
  - 产出 `{version, books[], builtAt}` 结构
  - 写入 `irDir/_index.json`
- **CLI 集成**:
  - `--pipeline ir --build-index` 参数触发索引构建
  - `--pipeline ir --rebuild-index` 强制重建（覆盖已有索引）
  - 默认 `--all` 模式自动构建索引

**Test scenarios:**
- Happy path: 扫描含 2 个 IR 文件的目录 → 产出正确 _index.json
- Happy path: `--build-index` 触发构建 → 文件写入
- Edge case: 空目录 → 产出 `{books: []}`
- Edge case: IR 文件 schema 不完整（缺少 dynasty）→ 索引用空字符串填充

**Verification:**
- `--pipeline ir --all` 后 `src/content-ir/_index.json` 存在且格式正确
- 新增 4+ 索引构建/查询测试通过

---

- [ ] **Unit 7: CLI 集成与端到端验证**

**Goal:** 将所有单元集成到 CLI，更新参数，运行经部全量验证。

**Requirements:** R9

**Dependencies:** Unit 1-6

**Files:**
- Modify: `scripts/convert-htm-to-md.js`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- **CLI 参数更新**:
  - 新增 `--build-index` 参数
  - 新增 `--rebuild-index` 参数
  - `--pipeline ir --all` 自动触发索引构建
- **集成流程**:
  - 编码检测 → HTML 规范化+简化 → 领地式提取（Pass 1-6）→ 输出 IR/MD/HTML5 → 索引构建
- **端到端验证**:
  - 对 `古籍/经部/` 所有文件运行 `--pipeline ir --category 经部`
  - 对比新旧管道输出差异
  - 报告覆盖率、AI Fallback 标记文件数、索引条目数

**Test scenarios:**
- Integration: `--pipeline ir --file 经部/大学章句集注.htm` → 产出正确 IR + MD + HTML5
- Integration: `--pipeline ir --category 经部 --dry-run` → 报告文件列表但不写入
- Integration: `--pipeline ir --all --build-index` → 产出 _index.json

**Verification:**
- 经部所有文件成功处理，0 报错
- `_index.json` 包含经部所有书籍条目
- 对比新旧输出，领地式管道产出 ≥ 现有管道的章节/注疏识别率

## System-Wide Impact

- **Interaction graph:** `extractContent()` 是管道的核心函数，被 `processFileIr()` in `convert-htm-to-md.js` 调用。重构后函数签名不变（`extractContent(html, sourcePath, options)`），调用方无需修改。
- **Error propagation:** 领地式提取的容错策略确保单个 Pass 失败不影响后续 Pass（某轮产出空数组即可）。质量评估在 Pass 6 统一处理。
- **State lifecycle:** IR schema 中 `_aiFallback` 是新增字段，`renderMarkdown` 和 `renderHtml5` 忽略此字段，不影响输出。
- **API surface parity:** `extractContent()` 公开接口不变。内部新增的 `claimSubtree`、`claimLeaf`、`extractByRules`、`extractRemaining` 等辅助函数不导出。
- **Unchanged invariants:** `renderMarkdown()`、`renderHtml5()`、`buildCatalogDict()`、`lookupCatalogMeta()` 保持不变。IR 输出 schema（chapters、sections、navItems）保持不变。`patternCache` 保留为规则优化手段（D4），不删除。

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 子树/叶子认领模式混用错误 | Medium | High | 单元测试分别覆盖 subtree/leaf 模式；`extractRemaining` 跳过已认领容器后代 |
| DOM mutation 导致引用失效 | Low | High | 提取全程只读（已在 D1 中明确约束）；规范化在 cheerio.load 之前完成 |
| Pass 顺序不适配某些模板 | Medium | Medium | AI Fallback 兜底；验证层反馈调整顺序 |
| 重构期间回归测试失败 | Low | High | 每 Unit 完成后运行全部 61 测试；测试驱动开发 |
| HTML 规范化过度 → 丢失语义信息 | Low | Medium | 规范化只做结构转换（标签替换），不做语义判断；保留原始 HTML 备份 |
| 编码转换误覆盖 UTF-8 文件 | Low | Medium | 转换前校验 BOM；--dry-run 先行验证 |
| 9000+ 文件索引 JSON 过大 | Low | Low | 纯 JSON 数组约 9000 × 300 bytes ≈ 2.7MB，完全可控 |

## Documentation / Operational Notes

- 编码转换脚本是一次性操作，执行后记录转换报告，不纳入日常管道
- `_index.json` 每次 `--all` 运行自动重建，无需手动维护
- `docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md` 中 Unit 4/5 被本计划覆盖，原计划可标记为 superseded

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md](docs/brainstorms/2026-04-11-002-feat-pipeline-refactor-requirements.md)
- **Existing IR pipeline plan:** [docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md](docs/plans/2026-04-11-002-feat-json-ir-pipeline-plan.md)
- Core extractor: `scripts/lib/content-extractor.mjs`
- Pattern cache: `scripts/lib/pattern-cache.mjs`
- CLI entry: `scripts/convert-htm-to-md.js`
- Tests: `tests/content-extractor.test.ts`, `tests/pattern-cache.test.ts`
- External reference: [MinerU document parsing pipeline](https://github.com/opendatalab/mineru) — 两阶段布局分析 + 内容识别架构参考
