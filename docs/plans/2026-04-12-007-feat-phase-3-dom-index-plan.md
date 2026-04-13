---
title: 'feat: Phase 3 — DOM Index + NodeProxy (Unit 0c)'
type: feat
status: active
date: 2026-04-12
origin: docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md
---

# feat: Phase 3 — DOM Index + NodeProxy (Unit 0c)

## Overview

Phase 2 (Territory + Normalize) 完成后，需要实现 DOM 一次索引构建——Pass 查询的基础设施。`build_dom_index` 用 selectolax 解析规范化后的 HTML，构建 `by_color`、`by_class`、`by_tag`、`by_size` 四个索引字典、`all_text_nodes` 列表、`parent_map` 字典，并分配确定性节点 ID。

## Problem Frame

- JS 版 `buildDomIndex`（extractors.mjs:184-244）是纯 cheerio 递归遍历，约 60 行
- Python 用 selectolax——Node 对象不可写但可读，适合遍历+索引
- 需要在索引中支持：颜色简写展开（`#F66` → `#FF6666`）、parent_map 支持祖先查询、NodeProxy 提供快照属性
- 最终管道：`normalize_html() → build_dom_index() → Territory() → (dummy Pass)`

## Requirements Trace

- R5: catalog/content docType 自动检测（Phase 3 提供索引基础设施）
- R6: 规则表驱动（Phase 3 提供 by_class/by_color/by_size 查询）
- R8: 领地式 Pass 架构（Phase 3 提供 parent_map 支持 has_claimed_ancestor）
- R16: 技术规范（颜色规范化、节点 ID 确定性）

## Scope Boundaries

- **In scope**: `build_dom_index` + `NodeProxy` + `DOMIndex` 类型 + 测试
- **Out of scope**: 任何 Pass 实现（留到 Phase 4）
- **Out of scope**: `extract()` 完整串联（留到 Phase 6）

## Context & Research

### Relevant Code and Patterns

- JS `extractors.mjs:184-244` — `buildDomIndex($)` 递归遍历 body contents
- `src/bamboo_extract/normalize.py` — 上游输入（规范化后的 HTML 字符串）
- `src/bamboo_extract/territory.py` — 下游消费者（使用 parent_map 做 has_claimed_ancestor）
- `src/bamboo_extract/types.py` — 需补充 `NodeProxy` 和 `DOMIndex` 类型
- `src/bamboo_extract/regex_patterns.py` — 已创建的正则常量表，Phase 3 不直接使用

### Key Technical Decisions

- **D1: selectolax 递归遍历** — 不用 CSS 选择器（只能查已知选择器），用 `tree.root` 递归遍历全部节点
- **D2: 节点 ID 递增分配** — 从 0 开始按 DOM 遍历序分配，确定性且可复现
- **D3: parent_map 用 dict[int, int]** — `{node_id: parent_id}`，与 Territory.has_claimed_ancestor 签名匹配
- **D4: 颜色规范化** — `#RGB` → `#RRGGBB` 大写展开，与 JS 版 `color.toUpperCase()` 对齐

## Implementation Units

- [x] **Unit 3.1: DOMIndex + NodeProxy 类型定义**

**Goal:** 定义 `DOMIndex` dataclass 和 `NodeProxy` dataclass，包含所有索引字段。

**Requirements:** R6, R8, R16

**Dependencies:** Phase 2 完成

**Files:**
- Modify: `src/bamboo_extract/types.py`（追加 NodeProxy, DOMIndex）

**Approach:**
- `NodeProxy` dataclass：`node_id: int`, `tag: str`, `attrs: dict[str, str]`, `text: str`, `node_id_attr: str | None`
- `DOMIndex` dataclass：`by_color: dict[str, list[int]]`, `by_class: dict[str, list[int]]`, `by_tag: dict[str, list[int]]`, `by_size: dict[str, list[int]]`, `all_text_nodes: list[int]`, `parent_map: dict[int, int]`
- 索引值存储节点 ID（整数）而非对象引用——与 Territory.claimed 设计一致

**Test scenarios:**
- Happy path: NodeProxy 可构造、可比较（dataclass equality）
- Happy path: DOMIndex 所有字段类型正确

**Verification:**
- `uv run ruff check src/bamboo_extract/types.py` 通过
- `uv run ty check` 无类型错误

- [x] **Unit 3.2: build_dom_index 实现**

**Goal:** 实现 DOM 索引构建函数——解析 HTML、递归遍历、构建四个索引 + all_text_nodes + parent_map + 节点 ID 分配。

**Requirements:** R5, R6, R8, R16

**Dependencies:** Unit 3.1

**Files:**
- Create: `src/bamboo_extract/dom_index.py`
- Test: `tests/test_dom_index.py`

**Approach:**
- `build_dom_index(html: str) -> DOMIndex` 函数
- `selectolax.parser.HTMLParser(html)` 解析
- 递归遍历 `tree.root` 或 `tree.body` 的全部子节点
- 按 DOM 遍历序分配递增节点 ID（从 0 开始）
- 文本节点（`node.tag == '#text'`）→ 加入 `all_text_nodes`
- 元素节点：
  - `tag` 小写 → `by_tag[tag].append(node_id)`
  - `color` 属性 → 规范化后 → `by_color[color].append(node_id)`
  - `class` 属性 → split → `by_class[cls].append(node_id)`
  - `size` 属性 → `by_size[size].append(node_id)`
- 记录 `parent_map[node_id] = parent_id`
- 跳过注释节点

**Patterns to follow:**
- JS `extractors.mjs:184-244` — `buildDomIndex` 递归结构
- 颜色规范化：`#RGB` → `#RRGGBB`（每个字符重复一次）

**Test scenarios:**
- Happy path: 含 color/class/size 的 HTML → 每个索引 key 有对应节点 ID
- Happy path: all_text_nodes 包含 DOM 中全部文本节点（DOM 序）
- Happy path: 颜色规范化 `#F66` → `#FF6666`，`#abc` → `#AABBCC`
- Happy path: parent_map 正确映射父子关系
- Happy path: 节点 ID 从 0 递增分配（确定性）
- Edge case: 空输入 → DOMIndex 所有字段为空
- Edge case: 无 color 属性的 HTML → by_color 为空 dict
- Edge case: class 含多个值（`class="foo bar"`）→ foo 和 bar 都入库
- Edge case: 注释节点 → 跳过不索引
- Edge case: 嵌套结构（div > p > span）→ parent_map 能追溯祖先

**Verification:**
- `pytest tests/test_dom_index.py` 通过
- `uv run ruff check src/bamboo_extract/dom_index.py tests/test_dom_index.py` 通过

- [x] **Unit 3.3: extract() 管道串联**

**Goal:** 将 `normalize_html()` + `build_dom_index()` + `Territory()` 串联到 `extract()` 函数中（Pass 仍为 dummy）。

**Requirements:** R2, R15

**Dependencies:** Unit 3.2

**Files:**
- Modify: `src/bamboo_extract/__init__.py`
- Test: `tests/test_cli.py`（补充端到端验证）

**Approach:**
- `extract()` 改为：`normalize_html(html)` → `build_dom_index(normalized)` → `Territory()` → 返回最小合法 IR
- 保留 dummy IR 输出（Pass 实现留到 Phase 4）
- 验证管道不抛异常

**Test scenarios:**
- Happy path: 完整 HTML 文件 → extract() 返回合法 ContentIR，不抛异常
- Happy path: 空 HTML → 返回空 IR
- Integration: normalize → index → territory 链条无数据丢失

**Verification:**
- `pytest tests/` 全部通过（含 Phase 1-2 所有测试）
- `uv run bamboo-extract input.html --output output.json` 产出合法 JSON

## Open Questions

### Resolved During Planning

- 颜色规范化：JS 只做了 `.toUpperCase()` 但没有展开 `#F66` → `#FF6666`。Python 应该两者都做（大写 + 展开），确保索引查询更准确

### Deferred to Implementation

- selectolax 遍历 `tree.root` 还是 `tree.body`？JS 版用 `$('body').contents()`——需要确认 selectolax body 节点是否总是存在

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| selectolax 解析行为与 cheerio 不等价（节点顺序差异） | 用相同 fixture 对比 DOM 结构 |
| 颜色展开遗漏某些边界情况（如 `#F` 单字符） | 只处理 `#RGB` 3 位和 `#RRGGBB` 6 位两种合法形式 |

## JS Unit 0c 验收

- [x] 含多种 color/class/size 的 HTML → 索引中每个 key 有对应节点
- [x] all_text_nodes 包含 DOM 中全部文本节点
- [x] 颜色规范化 `#F66` → `#FF6666`
- [x] Edge case: 无 COLOR 属性的 HTML → byColor 为空 Map
- [x] Edge case: 节点 ID 顺序递增分配（确定性）
- [x] Edge case: normalize_html 幂等性（两次规范化结果相同，与 0b 联合验证）

## Sources & References

- **上游 Phase**: Phase 2 (Territory + Normalize)
- **下游 Phase**: Phase 4 (Pass 1-3 + rules + catalog)
- **JS 参考实现**: `scripts/lib/extractors.mjs:184-244` — buildDomIndex
- **Phase 计划**: `docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md` Phase 3
