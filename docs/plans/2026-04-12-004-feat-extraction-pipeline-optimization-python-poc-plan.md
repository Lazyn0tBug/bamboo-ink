---
title: 'feat: 提取管道优化 + Bun 验证 + Python POC（三路并行）'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-001-extraction-pipeline-optimization.md
---

# feat: 提取管道优化 + Bun 验证 + Python POC（三路并行）

## Overview

在完成模块拆分（`extractors.mjs` + `renderers.mjs` + facade）和领地式 Unit 1（`createTerritory` 基础设施）之后、Unit 1c（Pass 4/9）之前，插入三路并行的技术准备工作：

1. **Track A — JS 代码优化**：修复 7 个已知 bug（R1-R5, R7-R8）、消除 patternCache write-only 问题（R10）、增加可观测性（R11-R13）、**重构 processNode 为领地式 Pass 4-9**（Unit A6）
2. **Track B — Bun 运行时验证**：将 CLI 脚本从 Node.js 切换到 Bun 运行（R9）
3. **Track C — Python POC 模块**：用 lxml 实现等价的提取管道，50-100 个样本文件验证 IR 输出一致性（R14-R17，R18 延后）

**目标**：在 Unit 1c 之前完成所有技术路线的代码准备，确保后续领地式 Pass 在干净、高效、可观测的代码基础上构建。

## Problem Frame

参见 origin document（`docs/brainstorms/2026-04-12-001-extraction-pipeline-optimization.md`）。核心问题：

- `extractors.mjs` 存在 claim bug（R1）导致正文内容丢失，已在 `src/content-ir/经部/大学章句集注.json` 中表现为单章节合并
- `classifyByAttributes` ~100 行嵌套 if-else（R3），新增规则维护成本高
- `flattenTables` 正则脆弱（R4），`patternCache` write-only（R10）
- 无可观测性：9000+ 文件批量处理时无法定位失败文件
- 无独立 Python 模块，数字人文生态复用受限

## Requirements Trace

从 origin document 继承：

| ID | Requirement | Track | Plan Units |
|----|-------------|-------|------------|
| R1 | 修复 pass2Metadata claimSubtree→claimLeaf | A | A1 |
| R2 | 合并 extractTitle/pass1BookTitle 重叠逻辑 | A | A1 |
| R3 | classifyByAttributes 重构为规则表 | A | A2 |
| R4 | 修复 flattenTables 正则脆弱性 | A | A3 |
| R5 | 统一 METADATA_RE / METADATA_RE_BODY | A | A2 |
| R6 | ~~escapeYaml 反斜杠转义~~ | — | **已解决**（renderers.mjs:145） |
| R7 | 移除 processNode 中 CENTER dead code | A | A2 |
| R8 | 缓存子节点分类结果，避免重复扫描 | A | A2 |
| R9 | 使用 Bun 运行转换脚本 | B | B1 |
| R10 | 消除 patternCache write-only | A | A4 |
| R11 | 结构化处理日志（per-file docType/chapters/annotations/耗时） | A | A5 |
| R12 | 异常诊断报告（Untitled/零 chapters/元数据缺失/catalog 误检） | A | A5 |
| R13 | CLI --verbose / --debug 输出控制 | A | A5 |
| R14 | 独立 Python 包，等价提取功能 | C | C1, C2 |
| R15 | 不依赖 Astro 项目结构，pip install + CLI | C | C1 |
| R16 | 输入输出格式与 JS 一致 | C | C2, C3 |
| R17 | lxml 解析器替代 cheerio | C | C2 |
| R18 | 中文 NLP 增强 | — | **延后**（D4，POC 验证后评估） |

## Scope Boundaries

- **In scope**: JS 提取引擎 bug 修复、重构、可观测性；Bun 运行时切换；Python POC 模块
- **In scope**: 跨语言 IR 输出一致性验证（50-100 样本文件）
- **Out of scope**: Astro 前端 UI 改动、页面交互、样式
- **Out of scope**: 跨文本引用分析、AI 智能标注、LLM 辅助内容识别
- **Out of scope**: R18 中文 NLP 增强（延后至 POC 验证后）
- **Out of scope**: 领地式 Pass 4-10 的**新增**规则实现（但 processNode 的领地式重构属于本计划 — 见 Unit A6）

## Context & Research

### Relevant Code and Patterns

| File | Purpose | Line Count |
|------|---------|-----------|
| `scripts/lib/extractors.mjs` | 核心提取引擎 | ~1103 |
| `scripts/lib/renderers.mjs` | HTML5 + Markdown 渲染 | ~162 |
| `scripts/lib/content-extractor.mjs` | Facade（re-exports） | ~81 |
| `scripts/lib/pattern-cache.mjs` | 模式缓存 + flattenTables | ~162 |
| `scripts/convert-htm-to-md.js` | CLI 入口 | ~563 |
| `tests/content-extractor.test.ts` | 主测试文件 | ~1224 |
| `tests/pattern-cache.test.ts` | 模式缓存测试 | ~192 行，21 测试 |

**已知 bug 位置**：
- R1: `extractors.mjs` pass2Metadata 中 `claimSubtree(parent)` 应改为 `claimLeaf(node)`
- R2: `extractTitle()` (line ~714) 和 `pass1BookTitle()` (line ~759) 扫描相同条件
- R3: `classifyByAttributes` lines 551-649，~100 行嵌套 if-else
- R4: `pattern-cache.mjs` flattenTables lines 25-33，全局正则替换
- R5: `METADATA_RE` (line ~358) 和 `METADATA_RE_BODY` (line ~672) 相同正则
- R7: `processNode` switch case 检查 `CENTER` 标签（normalizeHtml 已转换）
- R8: `hasMixedChildren` 分类一次，递归 `processNode` 再分类一次
- R10: `extractors.mjs` lines 1030-1032，缓存写入但 `processNode` 从不消费

**无 Python 基础设施**：仓库中无 `pyproject.toml`、`requirements.txt`、`.venv` 或任何 Python 代码。

**测试约定**：Vitest + jsdom，测试文件在 `tests/` 目录，命名 `{feature}.test.ts`。项目要求 `bun run validate && bun run test && bun run build` 零失败才能提交。

### Key Technical Decisions

**D1. 三路并行**（origin D1）：JS 修正=止血，Bun=补品，Python=未来。三者服务不同目的，互不阻塞。

**D1a. 双引擎维护风险缓解**（origin D1a）：Python 首期 POC，不追求 9000 文件全覆盖。以规则表为事实标准，建立 50-100 样本跨语言测试集。

**D3. 规则表为事实标准**（origin D3）：R3 重构后的规则表 `[{ name, predicate, type }]` 是提取行为的标准。JS 和 Python 实现同一套规则。

**D4. Python 首期 POC**（origin D4）：实现核心提取管道（claim、pass1-3、processNode），50-100 样本验证 IR 一致。R18 延后。

**D5. R1 必须更新测试断言**：R1 修复 claim bug 会改变 IR 输出，受影响文件的旧测试断言需要更新（不再丢弃被 claim 的正文）。

**D6. 先优化再 Unit 1c，Unit A6 替代 Unit 1c**: 用户明确要求在所有技术路线代码准备完成后再继续 Unit 1c。Unit A6（processNode 重构为领地式 Pass 4-9）完成后，Unit 1c 的工作已包含在内，下一个工作变为 Unit 1d（Pass 5-8 的领地式调整）。

**D7. Bun 切换范围最小化**：仅修改 CLI 脚本 shebang 和 npm script 调用方式。JS 提取引擎代码零改动（纯 ES 模块，Bun 原生兼容）。

**D8. 规则表重构分两步**：先提取规则定义（数据），再重写 classifyByAttributes 消费规则表（逻辑）。两步在同一 Unit 内完成，避免中间状态。

## Open Questions

### Resolved During Planning

- **R6 状态**：已验证 `renderers.mjs:145` 已包含反斜杠转义，从待办移除
- **R1 "不改变外部行为" 声明**：已修正 — R1 改变 IR 输出，需更新受影响测试（D5）
- **Python 模块包名/发布**：首期 POC，本地使用，不发布（D4）
- **跨语言测试复用**：选取 50-100 样本文件，JS/Python 输出逐文件比对 IR（D1a）
- **R18 中文 NLP**：延后至 POC 验证后评估（D4）

### Deferred to Implementation

- [Affects A3] `flattenTables` 正则实际影响范围：需扫描 9000 文件或先实现安全版再对比
- [Affects A4] patternCache 消费的具体数据结构：取决于 R3 规则表的形式
- [Affects C1] Python 包结构：单文件 vs 多模块（对应 extractors/renderers 拆分），POC 阶段建议单文件
- [Affects C2] lxml 对 FrontPage 4.0 非标准 HTML 容错能力：需实际样本验证

### Cross-Plan Dependencies (from existing plan)
- **Unit 0a（编码转换）** 应在本计划 Track A 之前完成。Review 发现编码转换脚本无测试做原地覆写（Adversarial P0），建议先加测试再执行
- **Unit 1c 被 Unit A6 覆盖**：本计划完成后，现有计划中的 Unit 1c 不再需要独立实现

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

### Track A: JS 优化数据流

```
extractors.mjs (当前 ~1103 lines)
  │
  ├── A1: 修复 pass2Metadata claim bug (claimSubtree → claimLeaf)
  │   └── 更新受影响测试断言
  ├── A1: 合并 extractTitle / pass1BookTitle 重叠逻辑
  │
  ├── A2: classifyByAttributes 重构为规则表
  │   ├── 定义 const CLASSIFICATION_RULES: Rule[]
  │   ├── classifyByAttributes 改为 rules.find(predicate) 循环
  │   ├── 统一 METADATA_RE → 单一常量
  │   ├── 移除 CENTER dead code
  │   └── 缓存子节点分类结果（Map<node, type>）
  │
  ├── A3: flattenTables 安全化
  │   └── 改用 cheerio DOM 操作替代全局正则
  │
  ├── A4: patternCache 消费集成
  │   └── processNode 有缓存时跳过 classifyByAttributes
  │
  └── A5: 可观测性
      ├── Per-file 处理结果对象：{ sourcePath, docType, chapters, annotations, elapsedMs }
      ├── CLI --verbose → 输出 per-file 摘要
      ├── CLI --debug → 输出 per-node 分类详情
      └── 异常诊断：Untitled / 零 chapters / 元数据缺失 / catalog 误检

---

  └── A6: processNode 重构为领地式 Pass 4-9 + 文本装配器
      ├── Pass 4: annotation（从索引查 → claimLeaf）
      ├── Pass 5-7: 文本后处理（section-summary / end-marker / colophon）
      ├── Pass 8: nav-item（从索引查 <a href> → claimLeaf）
      ├── Pass 9: extractRemaining() → 未认领文本节点
      └── assembleResults(): 文本装配 → chapters/sections（复用 flushText/flushChapter）
```

### Track B: Bun 切换

```
convert-htm-to-md.js
  │
  ├── shebang: #!/usr/bin/env node → #!/usr/bin/env bun
  ├── npm script: 已是 bun run（零改动）
  └── 验证: bun run scripts/convert-htm-to-md.js --pipeline ir --dry-run
```

### Track C: Python POC 架构

```
src/
  bamboo_extract/
    __init__.py        # 公共 API: extract(html, source_path) -> dict
    extractors.py      # 核心：Territory, build_dom_index, normalize_html, pass1-3, process_node
    renderers.py       # HTML5 + Markdown 输出（等价于 JS renderers.mjs）
    pattern_cache.py   # flattenTables 等价
    cli.py             # CLI: bamboo-extract input.html --output output.json

pyproject.toml         # 项目元数据 + lxml 依赖
tests/
  test_extractors.py   # 单元测试（等价于 content-extractor.test.ts 子集）
  test_parity.py       # 跨语言一致性：JS IR vs Python IR 比对
  fixtures/            # 50-100 个样本 HTML 文件
```

## Implementation Units

> 三路并行组织，按执行顺序编号。Track A = A1-A5, Track B = B1, Track C = C1-C3.

---

### Track A: JS 代码优化

---

- [ ] **Unit A1: 修复 claim bug + 合并标题扫描重叠**

**Goal:** 修复 pass2Metadata 中 claim 整个 div.swy1 导致正文丢失的 bug；合并 extractTitle() 和 pass1BookTitle() 的重复扫描。

**Requirements:** R1, R2

**Dependencies:** 无（当前代码库已就绪）

**Files:**
- Modify: `scripts/lib/extractors.mjs`
- Modify: `tests/content-extractor.test.ts`

**Approach:**
- **R1 修复**: `pass2Metadata` 中将 `claimSubtree(parent)` 改为 `claimLeaf(node)`（仅认领 metadata 文本节点本身，不吞掉父容器下其他内容）
- **R1 测试更新**: 识别受影响的测试用例（那些断言了 "被 claim 吞掉的旧输出" 的），更新断言以反映修复后包含完整正文的行为
- **R2 修复**: 检查 `extractTitle()` 和 `pass1BookTitle()` 的扫描条件（centered `#FF6666/#FF0000` + SIZE≥5），提取为共享函数 `findBookTitleCandidates($, index)`，两者复用同一候选集

**Patterns to follow:**
- 现有 `claimSubtree` / `claimLeaf` 语义（Unit 1 已定义）
- 领地式提取的 "认领即跳过" 不变式

**Test scenarios:**
- Edge case: metadata 节点在 div.swy1 内时，claimLeaf 不吞掉 div 下其他正文内容
- Happy path: 修复后 IR 包含被 claim bug 丢弃的正文 sections
- Happy path: extractTitle 和 pass1BookTitle 共享候选集，不重复扫描
- Integration: 现有 75+ 标题/元数据/章节测试全部通过

**Verification:**
- `bun run test` 全部通过（包括更新后的断言）
- `src/content-ir/经部/大学章句集注.json` 修复后包含多个 chapters（不再单章节合并）

---

- [ ] **Unit A2: classifyByAttributes 规则表重构 + R5/R7/R8**

**Goal:** 将 ~100 行嵌套 if-else 分类器重构为规则表模式，同时处理 R5（统一正则）、R7（移除 CENTER dead code）、R8（缓存子节点分类）。

**Requirements:** R3, R5, R7, R8

**Dependencies:** Unit A1（需要在稳定的 claim 行为上重构）

**Files:**
- Modify: `scripts/lib/extractors.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- 定义 `CLASSIFICATION_RULES` 常量数组，每项 `{ name: string, predicate: (node) => boolean, type: string }`
- 将现有 if-else 的每个条件分支提取为一个规则对象，保持匹配顺序不变（确保行为等价）
- `classifyByAttributes` 改为遍历规则表：`for (const rule of CLASSIFICATION_RULES) { if (rule.predicate(node)) return rule.type; }`
- **R5**: 合并 `METADATA_RE` 和 `METADATA_RE_BODY` 为单一 `METADATA_RE` 常量
- **R7**: 移除 `processNode` 中 `case 'CENTER'` 分支（normalizeHtml 已转为 `<div data-center>`）
- **R8**: 引入 `classificationCache: WeakMap<Node, string>`，`hasMixedChildren` 扫描时写入缓存，`processNode` 递归时先查缓存
- 所有改动保持外部行为不变（R3/R5/R7/R8 不改变 IR 输出）

**Technical design:** *(directional guidance)*
```
CLASSIFICATION_RULES = [
  { name: 'book-title',  predicate: (n) => isCentered(n) && isLargeTitle(n), type: TYPES.bookTitle },
  { name: 'metadata',    predicate: (n) => METADATA_RE.test(text(n)),        type: TYPES.metadata },
  { name: 'chapter',     predicate: (n) => isChapterColored(n) || hasChapterClass(n), type: TYPES.chapterTitle },
  { name: 'annotation',  predicate: (n) => isAnnotationStyle(n),             type: TYPES.annotation },
  // ... remaining types in priority order
];
```

**Patterns to follow:**
- 现有 9 种内容类型的匹配条件（从 extractors.mjs lines 551-649 提取）
- WeakMap 用于 Node → Type 缓存（避免内存泄漏）

**Test scenarios:**
- Happy path: 每种内容类型（book-title, metadata, chapter-title, annotation, main-text, section-summary, end-marker, colophon, nav-item）在规则表下仍正确分类
- Edge case: 节点匹配多个规则时，优先级顺序与旧 if-else 一致
- Edge case: 无匹配规则 → 返回 undefined（fallback 为 main-text）
- Integration: 现有 75+ 分类相关测试全部通过（行为不变验证）

**Verification:**
- `bun run test` 全部通过
- 规则表行数 < 50 行（vs 旧 ~100 行嵌套 if-else）
- `grep -c "if.*class\|if.*color\|if.*size" extractors.mjs` 显著减少

---

- [ ] **Unit A3: flattenTables 安全化**

**Goal:** 将 `flattenTables` 从全局正则替换改为基于 cheerio DOM 操作，避免误替换正文中包含 `table`/`tr`/`td` 字串的文本。

**Requirements:** R4

**Dependencies:** 无（pattern-cache.mjs 独立文件）

**Files:**
- Modify: `scripts/lib/pattern-cache.mjs`
- Test: `tests/pattern-cache.test.ts`

**Approach:**
- 方案：在 `flattenTables` 中不再对 HTML 字符串做全局替换，而是将 table 展平逻辑推迟到 cheerio.load 之后
- 新实现接收 cheerio `$` 对象，遍历 `$('table, tr, td')` 节点，用 DOM 操作（`replaceWith`, `unwrap`）展平表格结构
- 保持旧函数签名兼容（接收 HTML 字符串，返回展平后的 HTML 字符串），内部改用 cheerio 解析+操作+序列化
- 添加保护：仅处理 FrontPage 产生的 `<table>` 结构标签，不误伤文本内容

**Test scenarios:**
- Happy path: 含标准 FrontPage 表格的 HTML → 展平为 div 结构
- Edge case: 文本内容含 "table" 单词 → 不被误替换
- Edge case: 嵌套表格 → 递归展平
- Edge case: 无表格 HTML → 原样返回

**Verification:**
- `bun run test -- tests/pattern-cache.test.ts` 全部通过
- 对 9000 文件中含 table 的文件，展平后无文本内容异常

---

- [ ] **Unit A4: patternCache 消费集成**

**Goal:** 让 `processNode` 在有 patternCache 缓存时跳过冗余的 `classifyByAttributes` 扫描。

**Requirements:** R10

**Dependencies:** Unit A2（规则表重构后，patternCache 才可被有效消费）

**Files:**
- Modify: `scripts/lib/extractors.mjs`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- 当前代码（extractors.mjs lines 1030-1032）只在 `!hasCachedPatterns()` 时写入缓存，但 `processNode` 从不读取
- 修改 `processNode`：在处理每节点前，先查 `options.patternCache` 是否有该节点类型的缓存规则
- 有缓存时：直接使用缓存的分类结果，跳过 `classifyByAttributes`
- 无缓存时：走正常 `classifyByAttributes` 路径，结果写入缓存
- 缓存 key 设计：基于节点特征签名（tagName + className + color + fontSize + textLength）

**Test scenarios:**
- Happy path: 有 patternCache 时，processNode 跳过 classifyByAttributes 但分类结果一致
- Happy path: 无 patternCache 时，行为与现有完全一致
- Edge case: 缓存不命中 → 降级为 classifyByAttributes
- Integration: 现有测试在有/无 cache 两种模式下输出一致

**Verification:**
- 现有测试全部通过
- 有 cache 模式下 classifyByAttributes 调用次数显著减少（可通过 --debug 验证）

---

- [ ] **Unit A5: 可观测性 — 结构化日志 + 异常诊断 + CLI 控制**

**Goal:** 增加 per-file 处理日志、异常诊断报告、CLI `--verbose`/`--debug` 输出控制。

**Requirements:** R11, R12, R13

**Dependencies:** Unit A1-A4（观测的是优化后的管道）

**Files:**
- Modify: `scripts/lib/extractors.mjs`
- Modify: `scripts/convert-htm-to-md.js`
- Test: `tests/content-extractor.test.ts`

**Approach:**
- 在 `extractContent` 中构建 `ProcessingResult` 对象：
  ```
  { sourcePath, docType, title, chaptersCount, annotationsCount, elapsedMs, warnings: string[] }
  ```
- `extractContent` 返回 `{ ir, result }` 而非仅 `ir`（保持向后兼容：options.returnResult=true 时才返回 result）
- CLI `convert-htm-to-md.js` 中消费 result：
  - 默认：静默或仅输出进度
  - `--verbose`：每行输出 `{sourcePath} docType={docType} chapters={N} annotations={N} time={Ms}`
  - `--debug`：额外输出每节点分类详情（node tag, matched rule, type）
- 异常诊断 warnings 包括：
  - `title === "Untitled"` 或空标题
  - `chaptersCount === 0`
  - `metadata` 缺失（author/dynasty 为空）
  - `docType === "catalog"` 但 navItems 为空（可能的 catalog 误检）

**Patterns to follow:**
- `build-filetree.mjs` 中的 debug logging pattern: `const log = (...args) => isDev && console.log('[build-filetree]', ...args)`

**Test scenarios:**
- Happy path: --verbose 输出包含 docType/chapters/annotations 信息
- Happy path: --debug 输出每节点分类详情
- Edge case: Untitled 标题 → warnings 包含 "untitled-title"
- Edge case: 零 chapters → warnings 包含 "zero-chapters"
- Edge case: 空 HTML 输入 → docType 判定 + 警告

**Verification:**
- `bun run convert --pipeline ir --file <样本> --verbose` 输出结构化日志
- 异常文件能被 --verbose 日志快速定位

---

- [ ] **Unit A6: processNode 重构为领地式 Pass 4-9 + 文本装配器**

**Goal:** 将 `processNode()`（~197 行递归 DOM 遍历 + classifyByAttributes）替换为领地式 Pass 4-9 + 文本装配器，彻底消除 classifyByAttributes 的递归重复调用（R8 完全完成），为 Unit 1c 铺平道路。

**Requirements:** R1（间接：修复后正文不再被 claim bug 吞掉，需要新的装配器正确归集）、R3、R8

**Dependencies:** Unit A1（claim bug 修复后，正确的认领状态）、Unit A2（规则表重构后，Pass 4-9 有规则可用）

**Files:**
- Modify: `scripts/lib/extractors.mjs`（替换 processNode 为领地式 Pass 4-9 + assembleResults）
- Test: `tests/content-extractor.test.ts`

**Approach:**

将 `extractContent()` 中 Pass 3 之后的 `processNode(root)` 调用替换为以下领地式 Pass 序列：

```
Pass 3 完成后:
  │  territory.claimed 包含 book-title + metadata + chapter-title
  │  chapterTitleNodes 已知
  │  flushText / flushChapter / pastEndMarker 状态机已定义
  ▼

Pass 4: annotation（领地式）
  │  从 index 查 annotation 特征节点 → isClaimed 过滤 → claimLeaf
  │  产出: annotations[]（按 DOM 序排序）
  ▼

Pass 5: section-summary（文本后处理）
  │  暂不执行——在文本装配器中检测

Pass 6: end-marker（文本后处理）
  │  暂不执行——在文本装配器中检测

Pass 7: colophon（end-marker 之后）
  │  暂不执行——在文本装配器中检测

Pass 8: nav-item（领地式，仅非 catalog 页）
  │  从 index 查 <a href> → 规则过滤 → claimLeaf
  │  产出: navItems[]

Pass 9: main-text 收集
  │  extractRemaining(allTextNodes) → 未认领的文本节点
  │  产出: textNodes[]（按 DOM 序）
  ▼

文本装配器 assembleResults():
  │  输入: textNodes[], annotations[], chapterTitleNodes
  │  按 DOM 序遍历 textNodes → 拼接 currentText
  │  遇到 chapterTitleNode → flushText + flushChapter
  │  检测到 SECTION_SUMMARY_RE → 拆分为 section-summary
  │  检测到 END_MARKER_RE → pastEndMarker = true
  │  pastEndMarker 后文本 → colophon section
  │  产出: ir.chapters[].sections[]（与现有 IR 结构一致）
```

**关键设计决策**:
- 文本装配器复用现有 `flushText()` / `flushChapter()` / `pastEndMarker` 逻辑（这些是正确的）
- 仅替换分类来源：从 "processNode 递归 classify" → "Pass 4-9 领地式提取结果 + 文本装配"
- SECTION_SUMMARY 和 END_MARKER 检测从 DOM 级移至文本级（当前也是在 processNode 的 default case 中对文本做 regex 检测）

**Patterns to follow:**
- 现有 `extractRemaining()` 函数（Unit 1 已实现）
- 现有 `flushText()` / `flushChapter()` 状态机（不改动）
- Pass 4 规则与现有 `classifyByAttributes` 中 annotation 分支等价

**Test scenarios:**
- Happy path: Template F → IR 输出与现有 processNode 完全一致（章节、注疏、正文结构相同）
- Happy path: Template G → 纯正文，无注疏，输出一致
- Edge case: 注疏嵌套在正文中（夹注）→ Pass 4 claimLeaf 正确剥离
- Edge case: 含 end-marker → pastEndMarker 后文本归为 colophon
- Edge case: section-summary 正则匹配 → 拆分为独立 section
- Integration: 所有现有测试通过（IR 输出等价验证）

**Verification:**
- `bun run test` 全部通过（IR 输出与现有 processNode 等价）
- `extractors.mjs` 中 `classifyByAttributes` 在 Pass 3 之后不再被调用
- 真实文件 `经部/大学章句集注.json` 结构合理（多章节、注疏、正文分离）

---

### Track B: Bun 运行时验证

---

- [ ] **Unit B1: Bun 运行时切换**

**Goal:** 将 CLI 脚本从 Node.js 切换到 Bun 运行，验证兼容性和性能。

**Requirements:** R9

**Dependencies:** 无

**Files:**
- Modify: `scripts/convert-htm-to-md.js`（shebang）
- Modify: `package.json`（npm script 验证）
- Test: 手动验证 + 现有测试（bun vitest 已在运行）

**Approach:**
- 修改 `scripts/convert-htm-to-md.js` shebang：`#!/usr/bin/env node` → `#!/usr/bin/env bun`
- `package.json` 中 `"convert": "bun run scripts/convert-htm-to-md.js"` 已是 `bun run`，零改动
- 验证 `bun run convert --pipeline ir --dry-run 2>&1 | head -20` 正常工作
- 验证 `bun vitest run`（已在用，Bun 兼容性已部分验证）
- 性能基准：对比 `time node scripts/convert-htm-to-md.js --pipeline ir --category 经部` vs `time bun run scripts/convert-htm-to-md.js --pipeline ir --category 经部`（仅前 10 文件）
- 记录性能对比结果（不要求特定提升幅度）

**Test scenarios:**
- Happy path: `bun run convert --pipeline ir --dry-run` 正常输出
- Happy path: 单文件处理 `--file 经部/大学章句集注.htm` 产出正确 IR
- Integration: 现有 vitest 测试在 bun 下全部通过（已验证）

**Verification:**
- CLI 在 Bun 下无报错
- 产出的 IR JSON 与 Node.js 版本逐字节一致
- 性能基准有数据记录

---

### Track C: Python POC 模块

---

- [ ] **Unit C1: Python 项目骨架 + 基础设施**

**Goal:** 建立 Python 包结构、依赖配置、CLI 入口。

**Requirements:** R14, R15

**Dependencies:** 无

**Files:**
- Create: `src/bamboo_extract/__init__.py`
- Create: `src/bamboo_extract/extractors.py`（空骨架）
- Create: `src/bamboo_extract/renderers.py`（空骨架）
- Create: `src/bamboo_extract/pattern_cache.py`（空骨架）
- Create: `src/bamboo_extract/cli.py`
- Create: `pyproject.toml`
- Test: `tests/test_extractors.py`（空骨架）

**Approach:**
- `pyproject.toml`:
  - name = `bamboo-extract`
  - version = `0.1.0`
  - dependencies = `["lxml"]`
  - 可选依赖 `["jieba"]`（为 R18 预留，不安装）
  - `[project.scripts]` → `bamboo-extract = bamboo_extract.cli:main`
- `bamboo_extract/__init__.py` 导出公共 API：`extract(html, source_path) -> dict`
- `cli.py`: 简单 argparse，支持 `input.html --output output.json`
- `extractors.py`: 空骨架，仅定义函数签名和 docstring
- 安装验证：`pip install -e .` + `bamboo-extract --help`

**Test scenarios:**
- Happy path: `pip install -e .` 成功
- Happy path: `bamboo-extract --help` 显示用法
- Happy path: 导入 `from bamboo_extract import extract` 不报错

**Verification:**
- `pip install -e .` 在虚拟环境中成功
- CLI 可执行

---

- [ ] **Unit C2: Python 核心提取管道实现**

**Goal:** 实现等价于 JS extractors.mjs 的核心提取管道：Territory、DOM 索引、HTML 规范化、Pass 1-3、processNode。

**Requirements:** R14, R16, R17

**Dependencies:** Unit C1, Unit A1-A2, Unit A6（JS 领地式 Pass 4-9 稳定后，Python 实现同一规则集）

**Files:**
- Modify: `src/bamboo_extract/extractors.py`
- Modify: `src/bamboo_extract/renderers.py`
- Modify: `src/bamboo_extract/pattern_cache.py`
- Test: `tests/test_extractors.py`

**Approach:**
- ** Territory**: Python 版 `Territory` 类，`claimed: set[int]`（用节点索引 ID 而非节点引用），`claim_leaf()`, `claim_subtree()`, `is_claimed()`, `has_claimed_ancestor()`, `extract_remaining()`
- **DOM 索引**: 用 `lxml.html.HtmlElement` 遍历，构建 `by_color`, `by_class`, `by_tag`, `by_size`, `all_text_nodes`
- **HTML 规范化**: Python 版 `normalize_html()`，逻辑等价于 JS 版（center→div, table 展平, 空标签剔除）
- **Pass 1-3**: 实现与 JS 相同的规则（从 A2 重构后的规则表翻译为 Python）
- **processNode**: Python 版领地式 Pass 4-9 + 文本装配器（翻译自 A6 重构后的 JS 实现）
- **renderers**: 翻译 `renderers.mjs` 的 escapeHtml/escapeYaml/escapeMarkdown + render_html5/render_markdown
- **关键约束**: Python 模块不依赖 cheerio/Node.js/Astro，纯 Python + lxml
- 首期仅实现 Pass 1-3 + main-text fallback（Pass 4-8 延后），满足 POC 验证需求

**Patterns to follow:**
- JS 版 `extractors.mjs` 的函数签名和返回值
- A2 重构后的规则表（Python 版等价实现）
- JS 测试中的 inline HTML fixtures 翻译为 Python pytest fixtures

**Test scenarios:**
- Happy path: 与 JS 版相同的 Template F fixture → 提取 book-title + metadata + chapter-titles
- Happy path: 与 JS 版相同的 Template G fixture → 纯正文，无注疏
- Edge case: 空 HTML → 空 IR（docType 判定）
- Edge case: catalog HTML → navItems 提取
- Integration: IR 结构与 JS 版 `extractContent()` 输出等价

**Verification:**
- `pytest tests/test_extractors.py` 全部通过
- Python 输出的 IR JSON 结构与 JS 版等价（字段名、嵌套层级、内容）

---

- [ ] **Unit C3: 跨语言一致性验证**

**Goal:** 用 50-100 个样本文件验证 Python 和 JS 版提取结果一致。

**Requirements:** R16

**Dependencies:** Unit C2, Unit A1（JS claim bug 修复后）

**Files:**
- Create: `tests/test_parity.py`
- Create: `tests/fixtures/`（样本 HTML 文件）
- Create: `scripts/compare-ir-output.js`（JS 侧批量输出工具）

**Approach:**
- 从 9000 文件中选取 50-100 个代表性样本（经部/史部/子部/集部各 10-25 个，含 catalog 页、纯正文页、含注疏页）
- JS 版：运行 `bun run scripts/convert-htm-to-md.js --pipeline ir` 对样本文件产出 JSON IR
- Python 版：运行 `bamboo-extract` 对相同 HTML 文件产出 JSON IR
- 比对工具：逐字段比较 IR 输出
  - 必须匹配：title, source, docType, chapters[].title, sections[].type, sections[].content, annotations[].text
  - 允许差异：chapters/sections 顺序（如果提取顺序不同但内容等价）
  - 不一致时输出 diff
- 产出一致性报告：匹配率、不匹配文件列表、差异摘要

**Test scenarios:**
- Happy path: 50 个样本文件 IR 输出 100% 匹配
- Edge case: catalog 页面 → navItems 结构等价
- Edge case: 含注疏页面 → annotations 数组等价

**Verification:**
- `pytest tests/test_parity.py` 报告匹配率 ≥ 95%
- 不匹配文件有明确的差异分析（是 Python bug 还是 JS bug）

---

## Unit 依赖图

```
无依赖 (可并行开始):
├── A1: claim bug + 标题扫描合并
├── A3: flattenTables 安全化
├── B1: Bun 运行时切换
└── C1: Python 项目骨架

A1 完成后:
└── A2: 规则表重构 + R5/R7/R8

A2 完成后:
├── A4: patternCache 消费集成
├── A6: processNode 重构为领地式 Pass 4-9（替代 Unit 1c）
└── C2: Python 核心提取管道（需要 A2 规则表作为事实标准）

A4 完成后:
└── A5: 可观测性

A6 完成后:
└── Unit 1c 已就绪（Pass 4/9 领地式已实现，只需调整验证）

A4 完成后:
└── A5: 可观测性

C2 + A1 完成后:
└── C3: 跨语言一致性验证

全部 Track A/B 完成后（Unit 1c 前置条件满足）:
└── 可开始 Unit 1c: Pass 4 annotation + Pass 9 main-text
```

## System-Wide Impact

- **Interaction graph**: `extractContent()` 签名通过 Unit A5 扩展为返回 `{ ir, result }`，但向后兼容（默认仅返回 `ir`）。调用方 `processFileIr()` in `convert-htm-to-md.js` 无需修改除非显式启用 `--verbose`。
- **Error propagation**: R1 修复后，原本被 claim bug 丢弃的正文会重新出现在 IR 中。这是预期行为变更，不是回归。
- **State lifecycle**: `classification_cache` (WeakMap) 随每个文件创建/销毁，不跨文件持久化。
- **API surface parity**: `extractContent()` 公开接口不变（返回类型兼容）。新增 `ProcessingResult` 是可选返回。
- **Python 模块**: 完全独立，不导入 JS 模块，不依赖 Astro。`pyproject.toml` 声明 `lxml` 为唯一必需依赖。
- **Unchanged invariants**: IR schema（chapters/sections/navItems/docType）不变。`renderMarkdown`/`renderHtml5`/`buildCatalogDict`/`lookupCatalogMeta` 行为不变（R2 仅优化内部扫描，不改变输出）。
- **processNode 替换**: A6 将 `processNode()` 从递归 DOM 遍历替换为领地式 Pass 4-9 + 文本装配器。**公开行为不变**（IR 输出等价），但内部实现从 "classify-every-node" 变为 "territorial extraction + text assembly"。这意味着 Unit 1c 的 Pass 4/9 已经就绪，无需再实现。

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A2 规则表重构引入分类顺序变化 | Medium | High | 逐测试验证行为等价；规则表严格保持原 if-else 优先级 |
| A1 修复 claim bug 后大量测试断言失效 | Medium | Medium | D5 已预期；批量更新断言后重新运行全量测试 |
| A3 flattenTables 安全化后性能下降 | Low | Medium | 用 cheerio 遍历替代全局正则，可能略慢但正确性优先；可后续优化 |
| C2 Python lxml 对 FrontPage HTML 容错不如 cheerio | Medium | Medium | 样本验证（C3）；必要时在 normalize_html 中增加预处理 |
| C3 跨语言一致性匹配率 < 95% | Medium | High | 逐差异分析：区分 Python bug vs JS bug vs 合理解析差异 |
| Bun 与 cheerio 兼容性问题 | Low | High | B1 中验证；如不兼容，回退到 Node.js，不阻塞 Track A/C |
| A4 patternCache 缓存命中低 | Low | Low | 缓存是增量优化，不影响正确性；无缓存时行为不变 |
| A5 extractContent 返回类型扩展需严格向后兼容 | Medium | High | options.returnResult 默认 false，保持现有仅返回 ir 的行为 |
| A6 processNode 替换为领地式 Pass 需保证 IR 输出等价 | Medium | High | 现有测试（75+）作为回归基准；逐测试验证输出等价 |
| A5 extractContent 返回类型扩展需严格向后兼容 | Medium | High | options.returnResult 默认 false，保持现有仅返回 ir 的行为 |
| C2 Python lxml 对 FrontPage 非标准 HTML 容错未知 | Medium | Medium | C3 样本验证先行；必要时 normalize_html 增加预处理步骤 |
| C3 cheerio 与 lxml DOM 节点引用模型不同 | Low | Medium | Python 用索引 ID（非对象引用）实现 claimed set，避免节点身份不一致 |

## Documentation / Operational Notes

- 编码转换脚本（Unit 0a from 现有计划）可在本计划任一 Track 之前或之后执行，不影响本计划
- Python 虚拟环境建议放在项目根目录 `.venv/`，加入 `.gitignore`
- `.pipeline-cache/` 目录加入 `.gitignore`（**前置条件**：在 Unit 2b 之前完成，非本计划范围）
- `src/content-ir/`、`src/content/`、`src/normalized-html/` 为管道产出目录，已在 `.gitignore` 中
- C3 验证完成后，建议将 learnings 写入 `docs/solutions/`（目前该目录不存在）
- 本计划完成后的下一个工作是现有计划 `docs/plans/2026-04-11-003-...` 中的 **Unit 1d: Pass 5-8（section-summary / end-marker / colophon / nav-item）**。注意：Unit 1c（Pass 4 + Pass 9）已被本计划 Unit A6 覆盖。

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-12-001-extraction-pipeline-optimization.md](docs/brainstorms/2026-04-12-001-extraction-pipeline-optimization.md)
- **Territorial extraction plan:** [docs/plans/2026-04-11-003-refactor-territorial-extraction-pipeline-plan.md](docs/plans/2026-04-11-003-refactor-territorial-extraction-pipeline-plan.md)
- Core extractor: `scripts/lib/extractors.mjs`
- Renderers: `scripts/lib/renderers.mjs`
- Facade: `scripts/lib/content-extractor.mjs`
- Pattern cache: `scripts/lib/pattern-cache.mjs`
- CLI entry: `scripts/convert-htm-to-md.js`
- Tests: `tests/content-extractor.test.ts`, `tests/pattern-cache.test.ts`
