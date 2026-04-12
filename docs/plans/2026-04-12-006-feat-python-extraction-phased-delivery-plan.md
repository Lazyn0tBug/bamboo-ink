---
title: 'feat: Python 提取模块 — 分步实施计划'
type: feat
status: active
date: 2026-04-12
origin: docs/plans/2026-04-12-005-feat-python-extraction-module-plan.md
---

# feat: Python 提取模块 — 分步实施计划

## Overview

现有 `005` 号计划提供了完整的**技术设计**（数据模型、Pass 签名、状态机、Repository 抽象等），共 10 个实施单元（U1-U4, U6-U11, U9，U5/U8 延后）。本计划定义**如何分步交付**这些单元——从 P0 JS Bug Fix 开始，按纵向（端到端切片）和横向（分层递进）组织为 12 个 Phase（P0-P11），每个 Phase 交付可独立验证的里程碑，且对应一个或多个 JS Unit 验收门。

**核心策略**: dummy-first + 需求用例驱动。每个 Phase 对应明确的 JS Unit 测试场景，Phase 完成 = 对应 JS Unit 验收通过。

## Problem Frame

- 10 个实施单元、16 个需求、12 个以上 Python 文件待创建
- JS 侧有 **11 个 Unit**（0b, 0c, 1b, 1c, 1d, 2a, 2b, 3a, 3b, 3c, 3d），每个都是独立的验收单元
- P0 JS Bug Fix 修正 4 个已知 bug 后固化基线
- 纵向：从 HTML 输入到 JSON IR 输出的完整数据链
- 横向：JS Bug Fix → 骨架 → 基础设施 → 核心 Pass → 完整 Pass → 装配器 → 工具链 → 全量验证的递进过程
- 风险：单 Pass 实现偏差可能在 9000+ 验证时才暴露，代价高

**设计文档**: `docs/plans/2026-04-12-005-feat-python-extraction-module-plan.md`（完整技术规格）

## Requirements Trace

从 005 号计划继承，全部 16 个需求（R1-R16）属于 PC1：

| ID | Requirement | Phase |
|----|-------------|-------|
| R1 | Python 3.12+ 现代模块结构 | P1 |
| R2 | 核心提取 API | P5-P6 |
| R3 | 输出 IR 与 JS 版对等 | P6, P11 |
| R4 | CLI 入口 | P1, P9 |
| R5 | catalog/content docType 自动检测 | P4 |
| R6 | 规则表驱动 | P4 |
| R7 | 全量 9000+ 文件验证 | P11 |
| R8 | 领地式 Pass 架构 | P4-P7 |
| R9 | AI Fallback 接口 + Book Profile | P8 |
| R10 | Exporter 抽象协议 | P8 |
| R11 | 独立虚拟环境 | P1 |
| R12 | pytest 测试套件 | 每个 Phase |
| R13 | 错误分类、容错、恢复 | P9 |
| R14 | 可观测性（日志、度量、调试） | P9 |
| R15 | 完整数据流程 | P4-P7 |
| R16 | 技术规范 | P2-P5 |

## Scope Boundaries

- **In scope**: P0 JS Bug Fix + 11 个 Phase（P1-P11），完整 Pass 1-10 + assembleResults、CLI、9000+ 验证、AI/Export/NLP 接口 + dummy
- **Out of scope**: 实际 LLM 调用（PC2）、HTML5/Markdown 导出器（PC2+）、实际 NLP 工具接入（PC2+）、JS 前端改动
- **Out of scope**: 编码自动检测（仅 2 个非 UTF-8 文件，手动处理）
- **Pre-requisite**: JS Bug Fix（P0）+ parity baseline 固化

## Dependency Graph

```
P0: JS Bug Fix (基线固化)
    │
    ├─── 可独立并行 ───┐
    ▼                  ▼
  U11               U8 (协议定义)
  Repository         Exporter + NLP
  (文件存储)          (仅定义，不注册)
    │                  │
    ▼                  │
  P1: 骨架 ────────────┘
    │
    ▼
  P2: Territory + Normalize (Unit 0b)
    │
    ▼
  P3: DOM Index (Unit 0c)
    │
    ▼
  P4: Pass 1-3 + rules + catalog (Unit 1b)
    │
    ▼
  P5: Pass 4 annotation + Pass 9 main-text (Unit 1c)
    │
    ▼
  P6: Pass 5-8 + assemble_results (Unit 1d)
    │
    ├──────┬───────┬──────────┐
    ▼      ▼       ▼          ▼
   P7     P8      P9         P10
  Pass10 工具链  catalog    索引构建
  real   扩展点  meta注入   (依赖全部就绪)
  +质量  Repository         │
                            ▼
                         P11: 全量+CLI
                         (依赖 P0 + P10)
```

## Key Technical Decisions

- **D1 (dummy-first)**: 每个 Pass 单元先写 dummy 实现让管道跑通，再替换为 real。避免"全部写完才能验证"的风险。
- **D2 (Phase 边界)**: 每个 Phase 交付后必须通过对应测试，Phase 之间不交叉。Phase 完成后才可进入下一个。
- **D3 (验证策略)**: P1-P10 用代表性样本（每类 3-5 个文件）验证；P11 全量 9000+。
- **D4 (JS Bug Fix 作为 P0)**: P0 必须在 P1 之前或期间并行完成，但必须在 P6 完成前就绪（对等基线就绪，供 P11 全量验证使用）。
- **D5 (JS Unit 验收门)**: 每个 Python Phase 完成后，必须通过对应 JS Unit 的测试场景验收。**Phase 完成 = 对应 JS Unit 验收通过**。开发结果由构造保证正确，而非靠最后 9000+ 验证发现问题。

## JS Unit 验收门映射

Python 实施以 JS 侧 `2026-04-11-003` 号计划中的 Unit 定义为**需求用例权威来源**。全部 11 个 JS Unit 逐一对应到 Python Phase。

| Python Phase | 对应 JS Unit | Unit 内容 | 验收来源 |
|---|---|---|---|
| **P0: JS Bug Fix** | Bug Fix 专项 | 4 个 JS bug 修正 + 基线固化 | `tests/content-extractor.test.ts` |
| **P1: 骨架** | 无（首次可运行） | pyproject.toml + CLI + dummy extract | `tests/test_cli.py` |
| **P2: Territory + Normalize** | Unit 0b | Territory claim/extract + normalizeHtml + flattenTables | `tests/content-extractor.test.ts` |
| **P3: DOM Index** | Unit 0c | buildDomIndex + byColor/byClass/byTag/bySize + allTextNodes | `tests/content-extractor.test.ts` |
| **P4: 核心提取** | Unit 1b | Pass 1-3 (book-title/metadata/chapter-title) + rules + catalog 检测 | `tests/content-extractor.test.ts` |
| **P5: 注疏 + 正文** | Unit 1c | Pass 4 (annotation) + Pass 9 (main-text) | `tests/content-extractor.test.ts` |
| **P6: 装配器** | Unit 1d | Pass 5-8 (section-summary/end-marker/colophon/nav-item) + assemble_results | `tests/content-extractor.test.ts` |
| **P7: 质量评估** | Unit 2a | Pass 10 quality assessment + AI Fallback 接口 | `tests/content-extractor.test.ts` |
| **P8: 工具链** | Unit 2b + Unit 3a | Book Profile + 文件树内容增强 | `tests/book-profile.test.ts`, `tests/build-filetree.test.ts` |
| **P9: 索引构建** | Unit 3b | JSON 索引构建 (_index.json) | `tests/build-index.test.ts` |
| **P10: CLI 增强** | Unit 3c 部分 | CLI 批量模式 + FileRepository 集成 | `tests/content-extractor.test.ts` |
| **P11: 全量验证** | Unit 3c 部分 + Unit 3d | 9000+ 对等 + 经部全量 | `tests/content-extractor.test.ts` |

**验收规则**:
1. Python Phase 的 pytest 测试通过 → 再通过对应 JS Unit 的测试场景 → Phase 才算完成
2. JS Unit 的测试场景直接翻译为 Python pytest 用例（fixture 对齐）
3. 若 JS Unit 测试场景未全部通过，Python 不得进入下一 Phase

---

## Phase 0: JS Bug Fix（对等基线固化）

**目标**: 修正 JS 版 4 个已知 bug，固化修正后的 JS 输出作为 Python 对等基线。

**对应 005 号计划单元**: Pre-requisite（必须在 Python 工程开始前完成）

**实施内容**:

- [ ] **0.1 Bug 1: pass2Metadata 过度认领**
  - 位置: `scripts/lib/extractors.mjs:375`
  - 修正: 收紧 CSS 选择器，避免将非 metadata 节点误判为 metadata

- [ ] **0.2 Bug 2: Pattern cache 只写不读**
  - 位置: `scripts/lib/extractors.mjs:1232-1234`
  - 修正: 修复缓存读取逻辑，确保 flattenTables 结果被复用

- [ ] **0.3 Bug 3: isInCenteredContext 缺失 CSS**
  - 位置: `scripts/lib/extractors.mjs:270`
  - 修正: 补充缺失的 CSS 类判断条件

- [ ] **0.4 Bug 4: METADATA_RE 分隔符**
  - 位置: `scripts/lib/extractors.mjs:358`
  - 修正: 放宽正则边界，支持末尾无闭合分隔符（如 `(汉·刘向`）

- [ ] **0.5 基线固化**
  - 对修正涉及的输出文件重新生成 JS IR 基线
  - 在 `tests/parity-baseline/` 目录编写每个 bug 的修正文档（表现描述、diff、预期输出示例、受影响文件数）
  - 将修正后的 JS 输出保存到 `tests/parity-baseline/js-baseline-output/`（每类 3-5 个样本）

**Files:**
- Modify: `scripts/lib/extractors.mjs`
- Create: `tests/parity-baseline/bug-01-pass2-overclaim.md`
- Create: `tests/parity-baseline/bug-02-pattern-cache.md`
- Create: `tests/parity-baseline/bug-03-centered-context.md`
- Create: `tests/parity-baseline/bug-04-metadata-regex.md`
- Create: `tests/parity-baseline/js-baseline-output/` 目录结构

**Verification:**
- 4 个 bug 修正后，现有 88 个测试全部通过
- `tests/parity-baseline/` 目录包含 4 篇修正文档 + 基线样本（经/史/子/集各 3-5 个）
- 基线样本 IR 与修正前相比，metadata/annotation 等受影响字段正确

**JS Bug Fix 专项验收:**
- [ ] Bug 1: metadata 不再过度认领（非 metadata 节点不被误判）
- [ ] Bug 2: pattern cache 读取命中，flattenTables 结果被复用
- [ ] Bug 3: isInCenteredContext 正确识别居中上下文
- [ ] Bug 4: METADATA_RE 能匹配 `(汉·刘向`（无闭合分隔符）
- [ ] 基线样本 IR 输出正确，文档完整

**里程碑**: JS 对等基线固化。Python 模块以修正后的 JS 输出为对等目标。

---

## Phased Delivery

### Phase 1: 骨架就绪

**目标**: 创建 Python 项目骨架，`uv run bamboo-extract --help` 可运行，`bamboo-extract input.html --output output.json` 产出最小合法 IR。

**对应 005 号计划单元**: U1（已完成标记但代码未实现）

**实施内容**:

- [ ] **1.1 pyproject.toml**
  - name = `bamboo-extract`, version = `0.1.0`, requires-python = `>=3.12`
  - dependencies = `["selectolax", "pydantic>=2.0"]`
  - `[project.scripts]` → `bamboo-extract = bamboo_extract.cli:main`
  - dev dependencies: `pytest`, `ruff`, `ty`
  - 工具配置: `[tool.ruff]`, `[tool.ty]`, `[tool.pytest]`

- [ ] **1.2 模块骨架**
  - `src/bamboo_extract/__init__.py` — 导出 `extract` 函数（dummy 实现）
  - `src/bamboo_extract/cli.py` — argparse: `input.html --output output.json [--verbose]`
  - `src/bamboo_extract/types.py` — ContentIR + 核心 IR 模型（Pydantic BaseModel）

- [ ] **1.3 dummy extract() 实现**
  - 返回 `{title: "Untitled", source: source_path, docType: "content", chapters: [{title: "", sections: []}], navItems: []}`
  - 确保 `ir.model_dump(exclude_none=True)` 产出合法 JSON

**Files:**
- Create: `pyproject.toml`
- Create: `src/bamboo_extract/__init__.py`
- Create: `src/bamboo_extract/cli.py`
- Create: `src/bamboo_extract/types.py`
- Test: `tests/test_cli.py`

**Test scenarios:**
- Happy path: `uv run bamboo-extract --help` 显示用法
- Happy path: `uv run bamboo-extract input.html --output output.json` 产出合法 JSON
- Edge case: 不存在的输入文件 → 清晰的错误信息
- Edge case: 空 HTML 输入 → 产出空 IR 结构

**Verification:**
- `uv sync` 成功
- `uv run bamboo-extract input.html --output output.json` 产出 `{ "title": "Untitled", "chapters": [...], ... }`
- `pytest tests/test_cli.py` 通过

**里程碑**: 首次可运行。`bamboo-extract` 命令行工具可用，产出最小合法 IR。

---

### Phase 2: Territory + Normalize（Unit 0b）

**目标**: 实现领地认领机制 + HTML 预处理——提取管道的两大基础设施。

**对应 005 号计划单元**: U2 部分（Territory + normalize）

**实施内容**:

- [ ] **2.1 Territory 类**
  - `claimed: set[int]` — 用节点 ID 而非对象引用
  - `claim_leaf(node_id)`, `claim_subtree(node_id, descendants)`, `is_claimed(node_id)`, `has_claimed_ancestor(node_id)`
  - `extract_remaining()` — 返回未认领文本节点列表

- [ ] **2.2 normalize.py**
  - `normalize_html(html)` — `<center>` → `<div data-center>`，`flattenTables`，空标签剔除
  - `flattenTables` — 字符串预处理：`<td[^>]*>` → `<div class="table-cell">`，`</td>` → `</div>`

**Files:**
- Create: `src/bamboo_extract/territory.py`
- Create: `src/bamboo_extract/normalize.py`
- Test: `tests/test_territory.py`
- Test: `tests/test_normalize.py`

**Test scenarios:**
- Happy path: Territory claim_leaf → is_claimed 返回 True
- Happy path: Territory claim_subtree → 节点及后代全部标记
- Happy path: normalize_html → `<center>` 转为 `<div data-center>`
- Happy path: flattenTables → `<td>` 转为 `<div class="table-cell">`
- Edge case: Territory extract_remaining → 未认领节点正确返回
- Edge case: normalize 空输入 → 返回空字符串
- Edge case: has_claimed_ancestor → 祖先已被认领时返回 True

**Patterns to follow:**
- JS `extractors.mjs` 中 Territory/claim 相关逻辑
- JS `normalize` 函数的 flattenTables 实现

**Verification:**
- `pytest tests/test_territory.py` 通过
- `pytest tests/test_normalize.py` 通过

**JS Unit 0b 验收:**
- [ ] Territory claim_leaf → is_claimed 返回 True
- [ ] Territory claim_subtree → 节点及后代全部标记
- [ ] Territory extract_remaining → 未认领节点正确返回
- [ ] normalize_html → `<center>` 转为 `<div data-center>`
- [ ] flattenTables → `<td>` 转为 `<div class="table-cell">`
- [ ] Edge case: normalize 空输入 → 返回空字符串
- [ ] Edge case: normalize_html 幂等性

**里程碑**: 领地机制 + HTML 预处理就绪。管道输入端基础设施完成。

---

### Phase 3: DOM Index（Unit 0c）

**目标**: 实现 DOM 一次索引构建——Pass 查询的基础设施。

**对应 005 号计划单元**: U2 部分（build_dom_index）

**实施内容**:

- [ ] **3.1 build_dom_index**
  - selectolax 解析 → 构建 `by_color`, `by_class`, `by_tag`, `by_size` 索引
  - `all_text_nodes` — 全部文本节点列表（DOM 序）
  - `NodeProxy` — 快照属性（tag, attrs, text, id）
  - 颜色规范化：`#F66` → `#FF6666` 大写展开
  - 节点 ID 顺序递增分配（确定性）
  - `parent_map` — 支持 `has_claimed_ancestor` 查询

**Files:**
- Create: `src/bamboo_extract/dom_index.py`
- Modify: `src/bamboo_extract/types.py`（补充 NodeProxy, DOMIndex 类型）
- Test: `tests/test_dom_index.py`

**Test scenarios:**
- Happy path: 含多种 color/class/size 的 HTML → 索引中每个 key 有对应节点
- Happy path: all_text_nodes 包含 DOM 中全部文本节点
- Happy path: 颜色规范化 `#F66` → `#FF6666`
- Edge case: 无 COLOR 属性的 HTML → byColor 为空 Map
- Edge case: 节点 ID 顺序递增分配（确定性）

**Patterns to follow:**
- JS `extractors.mjs` 中 buildDomIndex 函数
- JS 颜色规范化逻辑

**Verification:**
- `pytest tests/test_dom_index.py` 通过
- `extract()` 管道可调用 `normalize_html()` + `build_dom_index()` + `Territory()`（即使后续 Pass 仍为 dummy）

**JS Unit 0c 验收:**
- [ ] 含多种 color/class/size 的 HTML → 索引中每个 key 有对应节点
- [ ] all_text_nodes 包含 DOM 中全部文本节点
- [ ] 颜色规范化 `#F66` → `#FF6666`
- [ ] Edge case: 无 COLOR 属性的 HTML → byColor 为空 Map
- [ ] Edge case: normalize_html 幂等性（两次规范化结果相同，与 0b 联合验证）

**里程碑**: DOM 索引就绪。Pass 查询机制的基础设施完成。管道：HTML → normalize → DOM index → Territory → (dummy Pass)。

---

### Phase 4: 核心提取 — Pass 1-3 + 规则表 + catalog 检测（Unit 1b）

**目标**: 实现领地式提取的前三个 Pass——book-title、metadata、chapter-title，以及规则表和 catalog 检测。

**对应 005 号计划单元**: U3（含 dummy + real）

**实施内容**:

- [ ] **4.1 规则表（rules.py）**
  - `CLASSIFICATION_RULES` — 与 JS 版等价规则表
  - `classify_by_attributes(node_proxy)` — 规则表扫描，返回分类标签
  - 规则: class-annotation, class-reference, class-notes, style-annotation-9pt, style-annotation-10pt, anchor-nav, list-context, menu-context 等

- [ ] **4.2 catalog 检测**
  - `detect_catalog(normalized_html, index)` — linkCount > 5 && bodyText < 3000
  - docType 切换: catalog → 仅提取 navItems，跳过后续 Pass

- [ ] **4.3 Pass 1: book-title**
  - 策略: class=article 文本 → color=#FF6666/#FF0000 + SIZE≥5 → 嵌套 font SIZE≥5
  - `claim_subtree`, `ir.title`

- [ ] **4.4 Pass 2: metadata**
  - 策略: class=metadata 文本 + METADATA_RE 匹配 → 全文扫描
  - `METADATA_RE = r'\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]?'`
  - `claim_leaf`, `ir.dynasty`, `ir.author`

- [ ] **4.5 Pass 3: chapter-title**
  - 策略: class=chapter/section → color=#CC33CC + tag in [B, FONT, DIV, SPAN] → h2/h3/h4 centered
  - `claim_subtree`, `chapter_titles[]`

**Files:**
- Create: `src/bamboo_extract/rules.py`
- Create: `src/bamboo_extract/extractors.py`（build_dom_index + Pass 1-3 编排）
- Modify: `src/bamboo_extract/__init__.py`（connect normalize + index + Pass 1-3）
- Test: `tests/test_rules.py`
- Test: `tests/test_extractors.py`

**Test scenarios:**
- Happy path: Pass 1 → 正确提取书名（class=article 优先）
- Happy path: Pass 2 → 正确解析 "汉·刘向" → dynasty="汉", author="刘向"
- Happy path: Pass 3 → class=chapter 节点正确认领
- Happy path: detect_catalog → linkCount>5 && bodyText<3000 → docType="catalog"
- Happy path: rules.py → 规则表扫描返回正确分类
- Edge case: 无 book-title 匹配 → title="Untitled"
- Edge case: 无 metadata 匹配 → dynasty=None, author=None
- Edge case: METADATA_RE 无闭合分隔符 `(汉·刘向` → 仍能匹配（JS bug fix）
- Edge case: catalog 页 → 跳过 Pass 1-4, 仅提取 navItems

**Patterns to follow:**
- JS `extractors.mjs:340-500` — pass1_book_title, pass2_metadata, pass3_chapter_title
- JS `extractors.mjs` CLASSIFICATION_RULES 表

**Execution note:** 每个 Pass 先写 dummy 实现（返回空结果），串联到 `extract()` 管道确认无报错，再替换为真实实现。测试驱动——先写测试用例确认 Pass 行为，再实现。

**Verification:**
- `pytest tests/test_rules.py` 通过
- `pytest tests/test_extractors.py` 通过（Pass 1-3 部分）
- 单样本文件（如 `经部/大学章句集注`）提取 → title/dynasty/author/chapter_titles 正确

**JS Unit 1b 验收:**
- [ ] Template F HTML → 提取 book-title + metadata + 3 chapter-titles
- [ ] "should extract chapters from Template F" 必须通过
- [ ] Edge case: 标题规则不匹配长文本容器（text length guard）
- [ ] Edge case: 无标题时 Pass 1 产出空，不影响 Pass 2/3
- [ ] Integration: Pass 1 认领的节点在 Pass 2/3 中被跳过
- [ ] 真实文件 `经部/大学章句集注.htm` → 产出 ≥3 chapters

**里程碑**: 核心提取可用。输入 HTML → 输出含 title, author, dynasty, chapter_titles 的 IR。

---

### Phase 5: 注疏 + 正文 — Pass 4 + Pass 9（Unit 1c）

**目标**: 实现注疏识别（从正文中剥离）和正文提取（剩余即正文）。

**对应 005 号计划单元**: U4 部分（Pass 4 + Pass 9）

**实施内容**:

- [ ] **5.1 Pass 4: annotation**
  - class=annotation/reference/notes → font-size: 9pt → font-size: 10pt + color=#551A8B
  - `claim_leaf`, 返回 Annotation 列表

- [ ] **5.2 Pass 9: main-text**
  - `territory.extract_remaining()` → 未认领文本节点 = main-text
  - 不需要任何规则

- [ ] **5.3 更新 extract() 管道**
  - normalize → index → catalog_detect → Pass 1-3 → Pass 4 → Pass 9 → 返回中间结果
  - 暂不串联 assemble_results（留到 P6）

**Files:**
- Create: `src/bamboo_extract/passes.py`（Pass 4 + Pass 9）
- Modify: `src/bamboo_extract/extractors.py`（串联 Pass 4 + Pass 9）
- Test: `tests/test_extractors.py`（补充 Pass 4 + Pass 9 测试）

**Test scenarios:**
- Happy path: Pass 4 → 正确收集 annotation 文本
- Happy path: Pass 9 → 正确收集剩余 main-text 文本
- Happy path: Pass 4 认领后 → Pass 9 不再收到这些文本
- Edge case: 注疏嵌套在正文中（夹注），正确剥离
- Edge case: 纯正文无注疏 → Pass 4 空，Pass 9 全收

**Patterns to follow:**
- JS `extractors.mjs:800-900` — Pass 4 annotation
- JS `territory.extractRemaining()` 行为

**Verification:**
- `pytest tests/test_extractors.py` 通过（含 Pass 4 + Pass 9）
- 单样本文件 → annotation 数量与 JS 版一致

**JS Unit 1c 验收:**
- [ ] Template F → 提取 15 sections with annotations（现有测试等价）
- [ ] Template G → 0 annotations，纯正文
- [ ] Edge case: 注疏嵌套在正文中（夹注），正确剥离
- [ ] Integration: Pass 4 认领后，Pass 9 的剩余文本正确归入 main-text
- [ ] 真实文件产出 ≥15 annotations

**里程碑**: 注疏 + 正文提取可用。Pass 4 认领 annotation，Pass 9 收集剩余文本。

---

### Phase 6: 装配器 — Pass 5-8 + assemble_results（Unit 1d）

**目标**: 实现 section-summary/end-marker/colophon/nav-item Pass，以及文本装配器状态机，串联完整 `extract()` 管道。

**对应 005 号计划单元**: U4 部分（Pass 5-8 + assemble_results）

**实施内容**:

- [ ] **6.1 Pass 5: section-summary**
  - SECTION_SUMMARY_RE 匹配 → 切分 section

- [ ] **6.2 Pass 6-7: end-marker + colophon**
  - END_MARKER_RE 匹配 → past_end_marker = True
  - end-marker 后文本 → colophon

- [ ] **6.3 Pass 8: nav-item**
  - menu-context (class=menu > a) → list-context (ol/ul > li > a) → 直接 a[href]
  - 仅非 catalog 页执行
  - `ir.navItems[]` 填充

- [ ] **6.4 文本装配器（assemble_results）**
  - 递归 DOM 遍历（等价 JS processElement 模型）
  - 状态机: past_end_marker, current_chapter, current_text, current_annotations, annotation_cursor
  - 遇 chapter-title 节点 → flush_text + flush_chapter
  - SECTION_SUMMARY_RE → section-summary section
  - END_MARKER_RE → past_end_marker = True → colophon
  - 普通文本 → main-text section（关联 annotations）
  - split 处理：marker 在文本中间时 split 前后分别处理

- [ ] **6.5 完整 extract() 管道串联**
  - normalize → index → catalog_detect → Pass 1-4 → Pass 8 → assemble → Pass 10(dummy) → 返回 ContentIR
  - `model_dump(exclude_none=True)` 序列化

**Files:**
- Create: `src/bamboo_extract/passes.py`（追加 Pass 5-8 + assemble_results）
- Modify: `src/bamboo_extract/extractors.py`（完整 extract 函数编排）
- Modify: `src/bamboo_extract/__init__.py`（导出完整 extract）
- Test: `tests/test_extractors.py`（补充 Pass 5-8 + assemble 测试）
- Test: `tests/test_parity.py`（基础对等验证框架）

**Test scenarios:**
- Happy path: assemble_results → 正确切分章节、关联 annotations
- Happy path: SECTION_SUMMARY_RE 匹配 → section-summary section
- Happy path: END_MARKER_RE 匹配 → colophon section
- Happy path: Pass 8 → 正确提取 navItems
- Edge case: 纯正文无章节标题 → 单 chapter 空 title
- Edge case: annotation 在章节中间 → 正确关联到对应 section
- Edge case: catalog 页 → 跳过 Pass 1-4 + assemble, 仅 navItems
- Edge case: marker 在文本中间 → split 后前后分别处理
- Integration: 代表性文件（经/史/子/集各一）→ 与 JS 版 IR 对等

**Patterns to follow:**
- JS `extractors.mjs:500-800` — assemble_results 状态机
- JS `extractors.mjs:800-900` — Pass 8 nav-item
- JS `processNode` default case 中的 SECTION_SUMMARY_RE / END_MARKER_RE 检测

**Verification:**
- `pytest tests/test_extractors.py` 通过（含 Pass 4-9 + assemble）
- 单样本文件完整提取 → 与 JS 版 IR 对等（title, chapters, sections, annotations, navItems 一致）
- `pytest tests/test_parity.py` 基础框架通过

**JS Unit 1d 验收:**
- [ ] "右传之首章，释明明德" → section-summary 拆分
- [ ] end marker → 后续文本归为 colophon
- [ ] catalog 页面 → nav-items 提取
- [ ] Edge case: 无 section-summary → 不拆分
- [ ] Edge case: 非 catalog 页面 → Pass 8 产出空

**里程碑**: 完整提取可用。`extract()` 管道全链路跑通，可产出与 JS 版对等的完整 IR。

---

### Phase 7: 质量评估 — Pass 10 真实实现（Unit 2a）

**目标**: 实现质量评分 + AI Fallback 接口（dummy 版）。

**对应 005 号计划单元**: U7 部分（Pass 10 quality assessment real）

**实施内容**:

- [ ] **7.1 Pass 10: quality assessment 真实实现**
  - 质量评分: `score = (chapters > 0 ? 1 : 0) + (annotations > 0 ? 1 : 0) + (sections > 1 ? 1 : 0)`
  - score < 2 → `ir._aiFallback = true`
  - claim_ratio 计算
  - quality_flag 标记

- [ ] **7.2 AIFallback Protocol（dummy）**
  - `AIFallback` Protocol 定义
  - dummy 实现返回占位值

**Files:**
- Modify: `src/bamboo_extract/passes.py`（Pass 10 real）
- Create: `src/bamboo_extract/ai_fallback.py`
- Test: `tests/test_quality.py`

**Test scenarios:**
- Happy path: 0 chapters → `_aiFallback = true`
- Happy path: 正常提取 → `_aiFallback` 不存在
- Edge case: 单章节包含全部但有 1 annotation → score = 2（已知限制）
- Edge case: claim_ratio == 0 → quality_flag = "suspicious"

**Verification:**
- `pytest tests/test_quality.py` 通过
- IR 输出含正确的 `_aiFallback` 标记

**JS Unit 2a 验收:**
- [ ] 0 chapters → `_aiFallback = true`
- [ ] 正常提取 → `_aiFallback` 不存在
- [ ] Edge case: 单章节包含全部但有 1 annotation → score = 2（已知限制）

**里程碑**: 质量评估可用。IR 产出包含正确的 quality 评分和 fallback 标记。

---

### Phase 8: 工具链 — Book Profile + Repository + 扩展点（Unit 2b + Unit 3a）

**目标**: Book Profile 系统、Repository 抽象、Exporter/NLP 协议、可观测性。

**对应 005 号计划单元**: U7, U8, U11

**说明**: 这些单元彼此无强依赖，可在 Phase 8 内并行或交替实施。推荐顺序：U8/U11 → U7。

- [ ] **8.1 U8: Exporter 协议 + NLP Plugin**
  - `ExportFormat` Enum: JSON_IR, HTML5, MARKDOWN
  - `Exporter` Protocol: export(ir, fmt) -> str
  - `NLPPlugin` Protocol: segment / recognize_entities / punctuate
  - Files: `src/bamboo_extract/export.py`, `src/bamboo_extract/nlp.py`

- [ ] **8.2 U11: Repository 抽象 + FileRepository**
  - `Repository` ABC（save_ir, load_ir, list_books, search, build_filetree）
  - `BookMeta` 含 category/subcategory 字段
  - `FileRepository` 实现：JSON 文件存储，_filetree.json 构建
  - 分类键解析: `"0"` → category="四库全书", subcategory="四库全书简明目录"
  - Files: `src/bamboo_extract/repository.py`

- [ ] **8.3 U7: 扩展点 + 可观测性**
  - `extract()` 签名增加 `ai_fallback`, `book_profile`, `nlp_plugin` 参数
  - `BookProfileStore` Protocol（dummy）
  - `FileMetrics` + `ExtractError` Pydantic 模型
  - `log_extraction()`, `report_progress()`, `report_aggregate()`
  - Files: `src/bamboo_extract/book_profile.py`, `src/bamboo_extract/observability.py`

**Test scenarios (Phase 8 综合):**
- Happy path: 处理含 `#CC33CC` 章节的文件 → Profile 中 `chapterColors: ["#CC33CC"]`
- Happy path: FileRepository save_ir → 正确路径写入
- Happy path: 加载已有 Profile → Pass 规则扩展匹配
- Happy path: IR 含多个 chapters → 文件树中章节列表正确
- Happy path: Phase A + Phase B 合并 → 完整文件树
- Edge case: 首次运行无 Profile → 使用硬编码默认规则
- Edge case: Profile 文件损坏 → 降级为默认规则
- Edge case: IR 文件缺 title → 用文件名 fallback
- Edge case: list_books → 特殊键 "0" 映射为 category="四库全书", subcategory="四库全书简明目录"

**Verification:**
- 所有 Phase 8 测试通过
- FileRepository 产出的 `_filetree.json` 与现有结构等价
- 可观测性输出符合 R14 规格

**JS Unit 2b 验收:**
- [ ] 处理含 `#CC33CC` 章节的文件 → Profile 中 `chapterColors: ["#CC33CC"]`
- [ ] 加载已有 Profile → Pass 规则扩展匹配
- [ ] Edge case: 首次运行无 Profile → 使用硬编码默认规则
- [ ] Edge case: Profile 文件损坏 → 降级为默认规则

**JS Unit 3a 验收:**
- [ ] IR 含多个 chapters → 文件树中章节列表正确
- [ ] Phase A + Phase B 合并 → 完整文件树
- [ ] Edge case: IR 文件缺 title → 用文件名 fallback

**里程碑**: 工具链就绪。Book Profile、Repository、扩展点、可观测性全部就绪。

---

### Phase 9: 索引构建 — catalog.py + JSON 索引（Unit 3b）

**目标**: catalog 元数据注入 + JSON 索引构建。

**对应 005 号计划单元**: U10, U3b

**实施内容**:

- [ ] **9.1 catalog.py**
  - `build_catalog_dict(catalog_irs)` — 从 catalog 页 IR 构建 path → entry 映射
  - `lookup_catalog_meta(dict, source_path)` — basename 匹配 + 后缀匹配
  - `extract()` 消费 catalog_dict 注入 author/dynasty

- [ ] **9.2 JSON 索引构建**
  - 递归扫描 IR JSON → 提取 title, category, chapters[].title, wordCount, processedAt
  - 写入 `_index.json`

**Files:**
- Create: `src/bamboo_extract/catalog.py`
- Create: `src/bamboo_extract/build_index.py`
- Modify: `src/bamboo_extract/extractors.py`（消费 catalog_dict）
- Test: `tests/test_catalog.py`
- Test: `tests/test_build_index.py`

**Test scenarios:**
- Happy path: build_catalog_dict → 从 catalog IR 构建映射
- Happy path: lookup_catalog_meta → basename 匹配成功
- Happy path: catalog_dict 注入 author/dynasty
- Happy path: 2 个 IR 文件 → 正确 _index.json
- Edge case: 空目录 → `{books: []}`
- Edge case: IR schema 不完整 → 空字符串填充

**Verification:**
- `pytest tests/test_catalog.py` 通过
- `pytest tests/test_build_index.py` 通过
- `_index.json` 存在且格式正确

**JS Unit 3b 验收:**
- [ ] 2 个 IR 文件 → 正确 _index.json
- [ ] Edge case: 空目录 → `{books: []}`
- [ ] Edge case: IR schema 不完整 → 空字符串填充
- [ ] catalog_dict 注入 author/dynasty 正确

**里程碑**: 索引构建就绪。catalog 元数据可注入到 content 页 IR，_index.json 可构建。

---

### Phase 10: CLI 增强（Unit 3c 部分）

**目标**: CLI 批量模式集成，FileRepository 集成，进度报告，错误处理。

**对应 005 号计划单元**: U6(real)

**前置条件**:
- Phase 1-9 全部通过

**实施内容**:

- [ ] **10.1 CLI 批量模式**
  - 批量模式: `bamboo-extract --dir <dir> --output-dir <dir>`
  - `--verbose`: per-file 摘要输出
  - `--debug`: 每 Pass 匹配详情 + debug JSON 输出
  - 错误处理: FileError 累计 > 10% 警告，Fatal 退出
  - 进度报告: 每 100 文件 rate + ETA
  - FileRepository 集成: 批量模式通过 `repository.save_ir()` 保存
  - Files: Modify `src/bamboo_extract/cli.py`

**Test scenarios:**
- Happy path: CLI 批量扫描目录 → 每文件一个 JSON
- Happy path: --verbose 输出 per-file 摘要
- Happy path: --debug 输出 per-Pass 匹配详情
- Edge case: 批量模式 10%+ FileError → 发出警告

**Verification:**
- CLI 批量模式正确扫描目录并产出 JSON
- FileRepository 产出的 `_filetree.json` 与现有结构等价

**JS Unit 3c 部分验收:**
- [ ] `--pipeline ir --file 经部/大学章句集注.htm` → 正确 IR
- [ ] `--pipeline ir --all --build-index --build-filetree` → 产出 `_index.json` + `_filetree.json`
- [ ] CLI 参数正常工作，单文件和批量模式均通过

**里程碑**: CLI 增强完成。支持批量处理、错误处理、进度报告、debug 模式。

---

### Phase 11: 全量验证（Unit 3c 部分 + Unit 3d）

**目标**: 对全量 9000+ 文件运行 Python 提取，逐文件与 JS 版 IR 比对，产出一致性报告。

**对应 005 号计划单元**: U9

**前置条件**:
- P0（JS Bug Fix）已完成
- Phase 1-10 全部通过
- parity baseline 输出已固化（`tests/parity-baseline/js-baseline-output/`）

**实施内容**:

- [ ] **11.1 对等验证框架**
  - `ParityChecker` 类: load_js_ir, load_py_ir, compare, classify_mismatch
  - 匹配规则按 R3 对等策略: 严格匹配 / 内容匹配 / 结构匹配 / 允许差异
  - 差异分类: Python bug / JS bug / 合理差异

- [ ] **11.2 样本验证（冒烟）**
  - 经/史/子/集各选 5 个代表性文件
  - 逐文件对等验证，确认无系统性偏差
  - 差异分析输出

- [ ] **11.3 全量验证**
  - 扫描全部 9000+ HTML 文件
  - 逐文件运行 Python extract + 加载 JS baseline IR
  - 逐字段比对，记录差异
  - 产出报告: 严格匹配率、内容匹配率、结构匹配率

- [ ] **11.4 差异修复**
  - 对每个 ParityMismatch 分析根因
  - Python bug → 修复 + 回归测试
  - JS bug → 记录并标注 "Python bug fix"
  - 合理差异 → 记录并纳入白名单

**Files:**
- Create: `src/bamboo_extract/parity.py`
- Create: `tests/test_parity_full.py`
- Create: `tests/parity-baseline/` 目录结构（含 README + bug 文档 + baseline 样本）

**Test scenarios:**
- Happy path: 全量 9000+ 文件 → 严格匹配字段 100%, 内容匹配字段 ≥ 98%
- Happy path: ParityChecker 正确分类差异类型
- Edge case: 单文件对等失败 → 记录但不中断
- Edge case: 合理差异（相邻 section 顺序互换）→ 白名单通过

**Verification:**
- `pytest tests/test_parity_full.py` 通过
- 一致性报告: 严格匹配 100%, 内容匹配 ≥ 98%
- 差异分析报告完成，所有差异已分类

**JS Unit 3c 部分验收:**
- [ ] 全量 9000+ 文件 → 逐文件对等验证通过

**JS Unit 3d 验收:**
- [ ] 经部所有文件成功处理，0 报错
- [ ] 覆盖率 ≥ 90%
- [ ] AI Fallback 标记 ≤ 10%

**里程碑**: 全量对等验证通过。Python 模块产出与 JS 版一致的 IR，可独立承担生产任务。

---

## Phase 依赖与并行性

```
P0 (JS Bug Fix) ────────────────────────────────────────────────────────────────→ P11 (全量验证)
    │
    ├─── 可独立并行 ───┐
    ▼                  ▼
  U11               U8 (协议定义)
  Repository         Exporter + NLP
    │                  │
    ▼                  │
  P1 (骨架) ──────────┘
    │
    ▼
  P2 (Territory+Normalize)
    │
    ▼
  P3 (DOM Index)
    │
    ▼
  P4 (Pass 1-3)
    │
    ▼
  P5 (Pass 4+9)
    │
    ▼
  P6 (Pass 5-8 + assemble)
    │
    ▼
  P7 (Quality)
    │
    ▼
  P8 (工具链)
    │
    ▼
  P9 (索引构建)
    │
    ▼
  P10 (CLI 增强)
    │
    └─────────────────────────────────────────────→ P11 (全量验证)
```

| Phase | 对应 JS Unit | 依赖 | 可并行 |
|-------|-------------|------|--------|
| P0: JS Bug Fix | Bug Fix 专项 | 无 | 无 |
| P1: 骨架 | 无 | 无 | 无 |
| P2: Territory+Normalize | Unit 0b | P0+P1 完成 | 无 |
| P3: DOM Index | Unit 0c | P2 完成 | 无 |
| P4: 核心提取 | Unit 1b | P3 完成 | 无 |
| P5: 注疏+正文 | Unit 1c | P4 完成 | 无 |
| P6: 装配器 | Unit 1d | P5 完成 | 无 |
| P7: 质量评估 | Unit 2a | P6 完成 | 无 |
| P8: 工具链 | Unit 2b + 3a | P7 完成 | U8/U11 可并行 |
| P9: 索引构建 | Unit 3b | P8 完成 | 无 |
| P10: CLI 增强 | Unit 3c 部分 | P9 完成 | 无 |
| P11: 全量验证 | Unit 3c 部分 + 3d | P10 + P0 全部完成 | 无 |

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| P0 JS Bug Fix 延迟 → P11 阻塞 | Medium | High | P1-P10 不依赖 JS baseline；P11 前完成即可 |
| normalize/flattenTables 移植复杂度高 | Medium | High | P2 专项攻坚，样本验证通过后才进入 P3 |
| assemble_results 状态机行为与 JS 不等价 | Medium | High | P6 阶段用代表性样本逐文件对比 |
| 9000+ 全量验证发现系统性偏差 | Medium | High | P11 分冒烟 → 全量两阶段，冒烟通过后全量跑 |
| selectolax 解析行为与 cheerio 不等价 | Low | Medium | P3 阶段用相同 fixture 对比 DOM 结构 |
| Phase 8 工具链范围膨胀 | Low | Medium | Phase 8 内分 3 个子单元，逐个完成 |
| P5/P6 拆分后 Pass 4 与 assemble 的 annotation 关联断裂 | Low | High | P5 验证 annotation 收集正确性，P6 验证关联正确性，每 Phase 独立验收 |

## System-Wide Impact

- **JS 版退役**: Python 模块全量验证通过后，JS 版 `scripts/lib/extractors.mjs` + `scripts/convert-htm-to-md.js` 可标记为 deprecated
- **构建流程变更**: 后续古籍转换使用 `uv run bamboo-extract` 替代 `node scripts/convert-htm-to-md.js`
- **CI/CD**: 新增 Python 测试 CI（pytest + ruff + ty）
- **Astro 前端**: 不受影响——仅消费 JSON IR，不关心生成方式
- **_filetree.json**: 格式不变，由 FileRepository.build_filetree 产出

## Documentation / Operational Notes

- Python 开发规范已记录在 `CLAUDE.md` 的 "Python 模块开发规范" 章节
- 005 号计划（`docs/plans/2026-04-12-005-feat-python-extraction-module-plan.md`）为完整技术设计参考
- 每个 Phase 完成后更新本计划对应的 checkbox
- Phase 完成后产出 Phase 总结文档到 `docs/solutions/` 目录

## Sources & References

- **设计文档**: [docs/plans/2026-04-12-005-feat-python-extraction-module-plan.md](docs/plans/2026-04-12-005-feat-python-extraction-module-plan.md)
- **需求文档**: [docs/brainstorms/2026-04-12-002-python-extraction-module.md](docs/brainstorms/2026-04-12-002-python-extraction-module.md)
- **JS 参考实现**: `scripts/lib/extractors.mjs`, `scripts/lib/renderers.mjs`, `scripts/lib/pattern-cache.mjs`
- **JS 测试**: `tests/content-extractor.test.ts`
- **CLAUDE.md**: Python 模块开发规范章节
