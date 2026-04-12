---
title: 'feat: Python 古籍提取模块 — PC1 完整实现'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-002-python-extraction-module.md
---

# feat: Python 古籍提取模块 — PC1 完整实现

## Overview

用现代 Python 3.12+ 构建独立的古籍内容提取模块，完整实现 JS 版全部提取能力（HTML → JSON IR），含 CLI、全量 9000+ 文件验证、AI Fallback / Book Profile / Exporter / NLP 接口设计（dummy 实现）。

**对等定义**: 功能实现完全一致——对于所有需求（R1-R16），Python 模块都能获得与 JS 版一致的**结果**。不要求逐字段、逐函数、逐模块等价，不要求算法或代码结构等价。当 JS 版存在已知 bug 时，Python 按正确预期行为实现（而非复现 bug），差异在 U9 对等验证中标注为 "Python bug fix"。

**对等基线**: 以 **修正后的 JS 输出** 为基线。对于 6 个已知 JS bug 涉及的文件，先修正 JS 输出再与 Python 比对。修正方法记录在 `tests/parity-baseline/` 目录。

## Pre-requisite: Fix JS Bugs Before Python Implementation

**必须在 Python 工程开始前完成**。Python 模块以修正后的 JS 输出为对等基线，因此 JS 版的 6 个已知 bug 必须先修正并固化基线输出。

### Bug 修正清单

| # | Bug | 文件位置 | 修正方法 | 基线文档 |
|---|-----|----------|----------|----------|
| 1 | pass2Metadata 过度认领 | `scripts/lib/extractors.mjs:375` | 收紧 CSS 选择器，避免将非 metadata 节点误判为 metadata | `tests/parity-baseline/bug-01-pass2-overclaim.md` |
| 2 | Pattern cache 只写不读 | `scripts/lib/extractors.mjs:1232-1234` | 修复缓存读取逻辑，确保 flattenTables 结果被复用 | `tests/parity-baseline/bug-02-pattern-cache.md` |
| 3 | isInCenteredContext 缺失 CSS | `scripts/lib/extractors.mjs:270` | 补充缺失的 CSS 类判断条件 | `tests/parity-baseline/bug-03-centered-context.md` |
| 4 | METADATA_RE 分隔符 | `scripts/lib/extractors.mjs:358` | 放宽正则边界，支持末尾无闭合分隔符（如 `(汉·刘向`） | `tests/parity-baseline/bug-04-metadata-regex.md` |
| 5 | ~~escapeYaml 未转义反斜杠~~ | ~~`scripts/lib/renderers.mjs:143`~~ | ~~已修复~~ | ~~已固化~~ |
| 6 | ~~escapeMarkdown 未转义反引号~~ | ~~`scripts/lib/renderers.mjs:152`~~ | ~~已修复~~ | ~~已固化~~ |

### 执行步骤

1. 逐 bug 修正 `scripts/lib/extractors.mjs` / `scripts/lib/renderers.mjs`
2. 对每个 bug 修正，运行现有测试确认修复有效
3. 对修正涉及的输出文件重新生成 JS IR 基线
4. 在 `tests/parity-baseline/` 目录编写每个 bug 的修正文档，包括：
   - bug 表现描述
   - 修正前后的代码 diff
   - 修正后的预期输出示例
   - 受影响的文件数量
5. 固化基线：将修正后的 JS 输出保存到 `tests/parity-baseline/js-baseline-output/`

### 基线目录结构

```
tests/parity-baseline/
├── README.md                           # 基线总览 + 对等策略说明
├── bug-01-pass2-overclaim.md           # Bug 1 修正文档
├── bug-02-pattern-cache.md             # Bug 2 修正文档
├── bug-03-centered-context.md          # Bug 3 修正文档
├── bug-04-metadata-regex.md            # Bug 4 修正文档
└── js-baseline-output/                 # 修正后的 JS IR 输出（抽样样本）
    ├── 经部/
    ├── 史部/
    ├── 子部/
    └── 集部/
```

**注意事项**：
- Bug 5 (escapeYaml) 和 Bug 6 (escapeMarkdown) 已在之前的 JS 修复中修正，仅需文档固化
- Bug 4 (METADATA_RE) 的修正会影响所有 metadata 提取结果，需重点验证
- 基线输出不需要全量 9000+ 文件，每类选取 3-5 个代表性样本即可

## Problem Frame

参见 origin document（`docs/brainstorms/2026-04-12-002-python-extraction-module.md`）。核心目标：

- 12 个需求（R1-R12）全部在 PC1 完成
- 输出 IR 与 JS 版按 R3 对等策略一致（严格字段 100%，内容字段 ≥ 98%）
- 全量 9000+ 文件验证覆盖
- AI/Export/NLP 完成接口设计 + dummy 实现
- 模块可独立 `uv run bamboo-extract` 使用

## Python Tooling (Astral Stack)

| Tool | Purpose | Replaces |
|------|---------|----------|
| **uv** | 包管理 + 虚拟环境 + 脚本运行 | pip / venv / pip-tools |
| **ruff** | Linter + Formatter | flake8 / black / isort |
| **ty** | 类型检查 | mypy / pyright |
| **pyproject.toml** | 项目元数据 + 工具配置 | setup.py / setup.cfg |

**工作流**:
```bash
uv sync                    # 安装依赖 + 创建 .venv
uv run bamboo-extract ...  # 运行 CLI
uv run ruff check .        # lint
uv run ruff format .       # format
uv run ty check .          # type check
uv run pytest tests/       # test
```

## Requirements Trace

从 origin document 继承，全部属于 PC1：

| ID   | Requirement                                              | Plan Units          |
| ---- | -------------------------------------------------------- | ------------------- |
| R1   | Python 3.12+ 现代模块结构，pyproject.toml 管理           | U1                  |
| R2   | 核心提取 API：`extract(html, source_path, catalog_dict=None) → ContentIR` | U2, U3, U4 |
| R3   | 输出 IR 与 JS 版对等（见对等策略）                       | U3, U4, U9      |
| R4   | CLI 入口：`bamboo-extract input.html --output output.json` | U1, U6            |
| R5   | 支持 catalog 和 content 两种 docType 自动检测            | U4                  |
| R6   | 规则表驱动，与 JS 版 CLASSIFICATION_RULES 同一套逻辑     | U3                  |
| R7   | 全量 9000+ 文件验证覆盖                                  | U9                  |
| R8   | 领地式 Pass 架构（Pass 1-10 + assembleResults）          | U2, U3, U4      |
| R9   | AI Fallback 接口设计 + Book Profile 系统（显式扩展点参数） | U7         |
| R10  | Exporter 抽象协议设计（首期不实现具体导出器）            | U8                  |
| R11  | 独立虚拟环境，不依赖 JS/Astro 项目结构                   | U1                  |
| R12  | 完整的 pytest 测试套件，fixture 与 JS 测试对齐           | 每单元              |
| R13  | 完整的错误分类、容错和恢复策略 | U6, U9              |
| R14  | 完整的可观测性设计（日志、度量、调试支持） | U6, U7              |
| R15  | 完整的数据流程设计（从源文件到 JSON IR 的数据流向） | U2, U3, U4, U9      |
| R16  | 完整的技术规范（解析器约束、选择器兼容、类型约束等） | U2, U3, U4          |

## Scope Boundaries

- **In scope**: 完整 Pass 1-10 + assembleResults、CLI、9000+ 验证、AI/Export/NLP 接口 + dummy
- **Out of scope**: 实际 LLM 调用（PC2）、HTML5/Markdown 导出器（PC2+）、实际 NLP 工具接入（PC2+）、JS 前端改动
- **Out of scope**: 编码自动检测（仅 2 个非 UTF-8 文件，手动处理）

## Context & Research

### Relevant Code and Patterns

| File (JS reference)                       | Purpose                  | Lines  |
| ----------------------------------------- | ------------------------ | ------ |
| `scripts/lib/extractors.mjs`              | 核心提取引擎             | ~1125  |
| `scripts/lib/renderers.mjs`               | HTML5 + Markdown 渲染    | ~162   |
| `scripts/lib/pattern-cache.mjs`           | flattenTables + cache    | ~162   |
| `scripts/convert-htm-to-md.js`            | CLI 入口                 | ~563   |
| `tests/content-extractor.test.ts`         | 主测试文件               | ~1224  |

**无 Python 基础设施**: 仓库中无 `pyproject.toml`、`.venv` 或任何 Python 代码。

### Key Technical Decisions

- **D1 (Parser)**: selectolax + Modest — 原始解析 ~45-135s（9000 文件），完整管道预估 75-300 min（含 normalize + index + Passes + assemble + 序列化）
- **D2 (Validation)**: 9000+ 全量验证（非 origin 的 50-100 POC），开发中按经史子集四类选取样本迭代
- **D3 (IR Schema)**: JSON Schema 为跨语言单一事实源，Python 端通过 Pydantic BaseModel 实现等价约束，含运行时验证 + 序列化一致性
- **D4 (Stepped AI)**: AI/Export/NLP 分 A1/A2/A3/A4 步骤，PC1 仅接口 + dummy
- **D5 (双引擎叙事)**: JS 版为对照基准，Python 将独立承担生产。JS 版将在 Python 达成后退役，不再保留
- **D6 (Book Profile)**: PC1 dummy 返回 None，PC2 多文件聚合 + 源文件 hash 校验

## Open Questions

### Resolved During Planning

- **Parser 选型**: selectolax（非 BeautifulSoup/html5lib，非 goquery）—— H5 输出是 PC2+ 序列化问题，不影响 PC1 解析
- **IR Schema**: JSON Schema（非 TypeScript interface）——跨语言兼容
- **AI 范围**: 分步实施，PC1 仅 dummy
- **编码处理**: 仅 2 个非 UTF-8 文件，手动处理，不纳入模块设计
- **Python 治理**: pyproject.toml 管理，后续可移出仓库

### Deferred to Implementation

- [Affects U9] 9000+ 批量验证的具体脚本和容错策略：需要扫描全部文件，逐差异分析
- [Affects U3] rules.py 与 JS CLASSIFICATION_RULES 的长期同步方案：首期手动等价，后续考虑共享 YAML/JSON 生成
- [Affects U2] selectolax CSS selector 与 cheerio selector 的细微差异：需样本验证
- [Affects U3] METADATA_RE 正则边界情况：JS 版要求闭合分隔符（`(朝代·作者)` 后必须有 `)` 或空白），Python 是否放宽为支持末尾无分隔符（`(汉·刘向` 也能匹配）—— JS bug fix
- [Affects U3/U4] IR Schema 验证：首期是否导出 `validate_ir(ir)` 函数检查必填字段和枚举合法性（agent-native reviewer 建议，非 blocker）

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*
>
> **完整设计规格见 "Python Module Design" 节**——包含全部 Pydantic 数据模型、Protocol 接口、Pass 签名、normalize 规格、状态机规格。本节仅提供高层数据流概览。

### Python Module Data Flow

```
extract(html, source_path, catalog_dict=None)
  │
  ├─ 1. normalize_html(html) → 干净 HTML
  │     center→div, flattenTables, 空标签剔除
  │
  ├─ 2. selectolax.parse() + build_dom_index()
  │     by_color, by_class, by_tag, by_size, all_text_nodes
  │
  ├─ 3. IR 骨架初始化 (title=Untitled, docType=content)
  │     catalog_dict 注入 author/dynasty（如有）
  │
  ├─ 4. catalog 检测 (linkCount > 5 && bodyText < 3000)
  │     → docType=catalog, 提取 navItems, 跳过后续 Pass
  │
  ├─ 5. Territory 实例化 (claimed set)
  │
  ├─ 6. Pass 1: book-title (class=article, color=#FF6666/#FF0000 + SIZE≥5)
  │     → claimSubtree, ir.title
  │
  ├─ 7. Pass 2: metadata (class=metadata, text pattern "朝代·作者")
  │     → claimLeaf/claimSubtree, ir.dynasty, ir.author
  │
  ├─ 8. Pass 3: chapter-title (class=chapter/section, color=#CC33CC, h2/h3/h4 centered)
  │     → claimSubtree, chapter_titles[]
  │
  ├─ 9. Pass 4: annotation (class=annotation/reference/notes, font-size:9pt, ...)
  │     → claimLeaf, annotations[]
  │
  ├─ 10. Pass 8: nav-item (a[href], menu, ol/ul context)
  │      → claimLeaf/claimSubtree, ir.navItems[]
  │
  ├─ 11. assemble_results(root_nodes, annotations, chapter_title_node_ids, ir, territory)
  │      ├─ 递归 DOM 遍历（等价 JS processElement）
  │      ├─ 遇 chapter-title 节点 → flush_text + flush_chapter
  │      ├─ SECTION_SUMMARY_RE → section-summary
  │      ├─ END_MARKER_RE → past_end_marker = True
  │      ├─ past_end_marker 后 → colophon
  │      └─ 普通文本 → main-text section（关联 annotations）
  │
  ├─ 13. Pass 10: quality assessment (dummy)
  │      → ir._aiFallback = "none"
  │
  └─ 14. ir.model_dump(exclude_none=True) → json.dumps() → 文件
```

### CLI Flow

```
bamboo-extract input.html --output output.json [--verbose]
  │
  ├─ argparse: input, --output, --verbose
  ├─ read file (UTF-8)
  ├─ extract(html, source_path) → ContentIR     # 详见 "完整数据流（类型标注版）"
  └─ json.dumps(ir, indent=2, ensure_ascii=False) → output.json
```

CLI 详细设计见 `types.py` / `cli.py` 实现单元。

## Python Module Design

本节定义 Python 模块的完整设计规格——数据模型、协议、接口合约、数据流和状态机。实现单元（Implementation Units）在此设计之上组织。

### 1. IR 数据模型

所有类型定义位于 `types.py`。IR 数据模型使用 **Pydantic v2 BaseModel** 实现——提供运行时验证、类型强制、JSON 序列化一致性，避免 `TypedDict` 静默失败风险。内部类型（TextRegion、DOMIndex 等）继续使用 `@dataclass`。

```bash
# pyproject.toml
dependencies = ["selectolax", "pydantic>=2.0"]
```

#### 1.1 核心 IR 类型（Pydantic BaseModel）

```python
from pydantic import BaseModel, ConfigDict, Field

class NavItem(BaseModel):
    model_config = ConfigDict(frozen=False)
    href: str
    label: str

class Annotation(BaseModel):
    model_config = ConfigDict(frozen=False)
    text: str

class Entity(BaseModel):
    """NLP 实体识别结果（PC2+ 能力，PC1 无消费者——仅定义类型，不接入管道）"""
    model_config = ConfigDict(frozen=False)
    entity_type: str                # "person" | "place" | "book" | "dynasty" | "term"
    text: str
    start: int
    end: int

class Section(BaseModel):
    model_config = ConfigDict(frozen=False)
    type: Literal["main-text", "inline-annotation", "section-summary", "colophon"]
    content: str                    # 文本内容（已清洗）
    annotations: list[Annotation] | None = None  # 仅 main-text 可含

    def model_dump(self, **kwargs):
        """空 annotations 时从序列化中剔除"""
        d = super().model_dump(**kwargs)
        if d.get("annotations") is None:
            d.pop("annotations", None)
        return d

class Chapter(BaseModel):
    model_config = ConfigDict(frozen=False)
    title: str                      # 首个章节可为空字符串（preamble）
    sections: list[Section] = Field(default_factory=list)

class ContentIR(BaseModel):
    """
    顶层 IR 数据模型。等价于 JS 版 extractContent() 输出 + JSON Schema 约束。

    序列化: ir.model_dump(exclude_none=True) → dict → json.dumps()
    验证:   ContentIR.model_validate(raw_dict) → 失败时 ValidationError 含字段路径
    """
    model_config = ConfigDict(frozen=False)
    title: str = "Untitled"
    source: str
    docType: Literal["content", "catalog"] = "content"
    chapters: list[Chapter] = Field(default_factory=lambda: [Chapter(title="", sections=[])])
    navItems: list[NavItem] = Field(default_factory=list)
    author: str | None = None       # exclude_none=True 时剔除（等价 JS undefined 省略）
    dynasty: str | None = None      # 同上
    _aiFallback: str | None = pydantic.PrivateAttr(default=None)  # Pass 10 占位，首期固定 "none"
```

**关键约束**（Pydantic 自动验证）：
- `Section.type` 有 4 种合法值——传入非法值时 `ValidationError` 抛出，含字段路径
- `inline-annotation` 作为 section type 存在（与 origin document IR schema 一致）；同时 `annotations` 数组也附着于 `main-text` section（双表示：section 级 vs 内联级）
- `ContentIR.chapters` 默认包含一个 preamble 章节（`title=""`）——`Field(default_factory=...)` 保证不为空
- `exclude_none=True` 序列化时自动剔除 `author`/`dynasty`/`annotations` 的 None 值——等价 JS `undefined` 省略行为

**Schema Changes from Origin**：
Origin document (`docs/brainstorms/2026-04-12-002-python-extraction-module.md`) defines `Section.type` as `Literal["main-text", "inline-annotation", "section-summary", "colophon"]`. Python plan 保持 4 种类型不变，与 origin 完全一致。注疏的双表示（`inline-annotation` section type + `annotations` 数组）需要实现时明确：Pass 4 收集的 annotations 既作为独立的 `inline-annotation` section 存在，也作为 `annotations` 数组附着于相邻 `main-text` section。具体归属由文本装配器决定。
- 首个 chapter 的 `title` 可为 `""`（preamble 章节，出现在第一个 chapter-title 之前的文本归入此处）
- `ContentIR.chapters` 至少包含一个元素（即使为空 title 的 preamble）

**IR 验证函数**（用于 U9 对等验证 + `--debug` 模式）：

```python
from pydantic import ValidationError

def validate_ir(ir_dict: dict) -> ContentIR:
    """
    将 raw dict 验证为 ContentIR 模型。
    用于：
    1. U9 对等验证中验证 JS 输出的结构合法性
    2. --debug 模式验证 Python 输出完整性
    3. 管道异常后产出部分 IR 的结构验证

    Returns:
        ContentIR 实例（Pydantic 自动转换嵌套模型）

    Raises:
        ValidationError: 含详细字段路径和错误信息
    """
    return ContentIR.model_validate(ir_dict)
```

**Pydantic vs TypedDict 对比**：

| 维度 | TypedDict | Pydantic BaseModel |
|------|-----------|-------------------|
| 编译期检查 | mypy ✅ | mypy ✅ |
| 运行时验证 | ❌ 静默失败 | ✅ ValidationError 含字段路径 |
| 序列化一致性 | ❌ 手动 `json.dumps` | ✅ `model_dump(mode="json")` |
| None 剔除 | ❌ 手动过滤 | ✅ `exclude_none=True` |
| 嵌套验证 | ❌ 需手动递归 | ✅ 自动递归验证嵌套模型 |
| 性能开销 | 零 | 约 0.01ms/model（PC1 可接受） |

#### 1.2 中间类型（Internal-Only）

这些类型不进入最终 IR，仅在提取管道内部使用。

```python
from selectolax.parser import HtmlTree, Node  # selectolax 内置类型
```

**`HtmlTree`**: `selectolax.parser.HtmlTree` — selectolax 解析后的 DOM 树根节点，提供 `.css()` 选择器查询和 `.text_content()` 全文提取。

**`Node`**: `selectolax.parser.Node` — 单个 DOM 节点，提供 `.tag`, `.attributes`, `.parent()`, `.children()`, `.text_content()` 等方法。

```python
@dataclass
class TextRegion:
    """extract_remaining() 产出的文本区域"""
    node_id: int                    # 源节点 ID
    text: str                       # 文本内容
    is_chapter_title: bool          # 是否被标记为 chapter-title
    chapter_title_text: str | None  # 仅 is_chapter_title=True 时有值
    dom_order: int                  # DOM 序序号（用于排序）

@dataclass
class DOMIndex:
    """build_dom_index() 产出的索引结构"""
    by_color: dict[str, list[int]]      # 颜色 → 节点 ID 列表（大写 #RRGGBB）
    by_class: dict[str, list[int]]      # 类名 → 节点 ID 列表
    by_tag: dict[str, list[int]]        # 标签名 → 节点 ID 列表（小写）
    by_size: dict[str, list[int]]       # 字号 → 节点 ID 列表（原始值）
    all_text_nodes: list[int]           # 所有文本节点 ID 列表（DOM 序）
    parent_map: dict[int, int]          # 子节点 ID → 父节点 ID
    node_map: dict[int, NodeProxy]      # 节点 ID → 节点代理（含 text, tag, attributes）
```

**`NodeProxy` 设计**：selectolax 节点对象不可哈希且无稳定身份，因此用轻量代理封装：

```python
@dataclass
class NodeProxy:
    node_id: int
    tag: str                        # 标签名（小写）
    text: str                       # 节点文本（text_content）
    inner_text: str                 # 直接文本（不含子节点）
    class_name: str                 # class 属性
    style: str                      # style 属性
    href: str | None                # href 属性
    color: str | None               # 解析后的颜色（大写 #RRGGBB）
    font_size: str | None           # 解析后的 font-size
    is_centered: bool               # 是否居中（data-center 属性或 text-align: center）
```

#### 1.3 Catalog 类型

```python
class CatalogEntry(BaseModel):
    model_config = ConfigDict(frozen=False)
    path: str                       # 文件路径
    title: str                      # 条目标题
    href: str                       # 链接
    dynasty: str                    # 朝代（如有）
    author: str                     # 作者（如有）
```

### 2. 协议定义

#### 2.1 Territory 协议

```python
class Territory:
    """
    领地式提取核心。维护 claimed set，提供 claim/query/extract 接口。
    用节点 ID（int）而非对象引用，避免 selectolax 节点身份不一致。
    """
    def __init__(self) -> None: ...

    def claim_leaf(self, node_id: int) -> None:
        """认领单个节点。若已认领则幂等无操作。"""

    def claim_subtree(self, node_id: int, descendants: list[int]) -> None:
        """认领节点及其所有后代。descendants 为所有后代节点 ID 列表。"""

    def is_claimed(self, node_id: int) -> bool:
        """查询节点是否已被认领。"""

    def has_claimed_ancestor(self, node_id: int) -> bool:
        """查询节点是否有任何已认领的祖先。需要内部 parent_map。"""

    def extract_remaining(
        self,
        all_text_node_ids: list[int],
        node_map: dict[int, NodeProxy],
    ) -> list[TextRegion]:
        """返回所有未认领且无已认领祖先的文本节点，包装为 TextRegion。"""

    def extract_by_rules(
        self,
        rules: list[ClassificationRule],
        index: DOMIndex,
        node_map: dict[int, NodeProxy],
        mode: Literal["leaf", "subtree"] = "subtree",
    ) -> list[int]:
        """
        按规则表扫描 DOM 索引，匹配节点并认领。
        mode="leaf" 仅认领匹配节点本身；mode="subtree" 认领匹配节点及其后代。
        返回被认领的节点 ID 列表。
        """
```

#### 2.2 Classification Rule 类型

```python
@dataclass
class ClassificationRule:
    name: str                                   # 规则名（如 "class-chapter"）
    predicate: Callable[[NodeProxy], bool]      # 匹配谓词
    classify_as: str                            # 分类结果（如 "chapter-title"）
```

#### 2.3 AIFallback 协议（PC2 显式传入）

```python
class QualityScore(BaseModel):
    model_config = ConfigDict(frozen=False)
    chapters_count: int
    annotations_count: int
    has_single_chapter_capturing_all: bool      # 仅一个 chapter 且包含全部内容
    deviates_from_book_profile: bool = False    # PC1 固定为 False（Book Profile 在 PC2 激活后才有值）

class AIFallback(Protocol):
    def should_fallback(self, quality: QualityScore) -> bool: ...
    def fallback_extract(self, html: str) -> ContentIR: ...
```

**PC1 不传入**。`extract()` 中不调用 AI Fallback。PC2 实现具体 `AIFallback` 并通过 `extract(..., ai_fallback=my_ai)` 传入。

**触发条件**（等价 JS Layer 2）：
- `chapters_count == 0` 且文件明显有章节结构
- `annotations_count == 0` 且文件有明显注疏标记
- `has_single_chapter_capturing_all == True`
- `deviates_from_book_profile == True`（PC2 Book Profile 激活后）

#### 2.4 BookProfileStore 协议（PC2 显式传入）

```python
class BookProfile(BaseModel):
    model_config = ConfigDict(frozen=False)
    chapter_colors: list[str]       # 该文件使用的章节颜色
    book_title_colors: list[str]    # 标题颜色
    annotation_sizes: list[int]     # 注疏字号
    annotation_colors: list[str]    # 注疏颜色
    content_container: str          # 内容容器 selector
    has_swy1: bool                  # 是否包含 swy1 容器

class BookProfileStore(Protocol):
    def get(self, book_id: str) -> BookProfile | None: ...
    def save(self, book_id: str, profile: BookProfile) -> None: ...
    def update(self, book_id: str, profile: BookProfile) -> None: ...
```

**PC1 不传入 BookProfileStore**。`extract()` 中不调用 Book Profile。PC2 实现具体 `BookProfileStore` 并通过 `extract(..., book_profile=my_store)` 传入。

**book_id 生成**：从 `source_path` 提取（如 `古籍/经部/大学章句集注/大学章句集注.htm` → `经部/大学章句集注`）。

#### 2.5 NLPPlugin 协议（PC2+ 显式传入）

```python
class NLPPlugin(Protocol):
    def segment(self, text: str) -> list[str]: ...
    def recognize_entities(self, text: str) -> list[Entity]: ...
    def punctuate(self, text: str) -> str: ...
```

**PC1 不传入 NLPPlugin**。PC2+ 接入实际 NLP 工具（jieba/pkuseg/LLM NER）后通过 `extract(..., nlp_plugin=my_nlp)` 传入。

#### 2.6 Exporter 协议

```python
class ExportFormat(Enum):
    JSON_IR = "json"
    HTML5 = "html5"
    MARKDOWN = "markdown"

class Exporter(Protocol):
    def export(self, ir: ContentIR, fmt: ExportFormat) -> str: ...
```

PC1 不实现具体导出器。JSON 输出由 CLI 直接 `json.dumps` 完成。

#### 2.7 Repository 抽象（PC1 文件存储，PC2 可换 SQLite）

当前系统用 `_filetree.json`（479KB, 10871 行）+ 单文件 JSON IR 组织书籍索引。PC1 保持 JSON 文件存储，但通过 `Repository` 抽象层使存储后端可替换。PC2 切换到 SQLite 时上层代码不变。

```python
class BookMeta(BaseModel):
    """书籍元数据——跨文件聚合，等价于当前 _filetree.json 的结构化版本"""
    model_config = ConfigDict(frozen=False)
    id: str                           # 唯一标识（如 "经部/大学章句集注"）
    title: str
    dynasty: str | None = None
    author: str | None = None
    category: str                     # 四部分类: "经部" | "史部" | "子部" | "集部"
    subcategory: str                  # 子分类，无细分时与 category 同名（如 "经部"→"经部"），有细分时拆分（如 "史部-其他"→"史部"/"其他"）
    file_path: str                    # 源文件相对路径
    ir_file_path: str                 # IR 文件相对路径
    chapter_count: int = 0
    section_count: int = 0
    annotation_count: int = 0
    source_hash: str | None = None    # PC2 变更检测
```

**_filetree.json 分类键映射**（7 → category/subcategory）:

| _filetree.json 原始键 | category | subcategory | 说明 |
|---|---|---|---|
| `经部` | 经部 | 经部 | 四部之一，无细分 |
| `史部-廿五史` | 史部 | 廿五史 | 四部之二，正史类 |
| `史部-其他` | 史部 | 其他 | 四部之二，非正史类 |
| `子部-先秦两汉` | 子部 | 先秦两汉 | 四部之三，按时代细分 |
| `子部-魏晋以下` | 子部 | 魏晋以下 | 四部之三，按时代细分 |
| `集部` | 集部 | 集部 | 四部之四，无细分 |
| `四库全书` | 四库全书 | 四库全书简明目录 | 原键为 `"0"`（不合理命名），纠正为 `"四库全书"`，sub 为 `"四库全书简明目录"` |

> **`"0"` 键纠正说明**：当前 `_filetree.json` 中使用 `"0"` 作为键名存放「四库全书简明目录」类别，这是历史遗留的不合理命名。Python 模块在解析时应将 `"0"` 映射为 `category="四库全书"`, `subcategory="四库全书简明目录"`。同时在后续 JS 基线修正中，建议将 `_filetree.json` 的 `"0"` 键重命名为 `"四库全书"`。

```python
from abc import ABC, abstractmethod

class Repository(ABC):
    """存储后端抽象——PC1 用 JSON 文件，PC2 可换 SQLite"""

    @abstractmethod
    def save_ir(self, book_id: str, ir: ContentIR) -> None:
        """保存单本书的 IR 到存储"""

    @abstractmethod
    def load_ir(self, book_id: str) -> ContentIR | None:
        """加载单本书的 IR"""

    @abstractmethod
    def save_meta(self, meta: BookMeta) -> None:
        """保存书籍元数据"""

    @abstractmethod
    def list_books(self, category: str | None = None) -> list[BookMeta]:
        """列出所有书籍，可按四部分类筛选。subcategory 永不为 None（无细分时与 category 同名）"""

    @abstractmethod
    def search(self, query: str, limit: int = 20) -> list[BookMeta]:
        """搜索书籍。PC1: 标题匹配; PC2: FTS5 全文搜索"""

    @abstractmethod
    def get_filetree(self) -> dict:
        """获取完整文件树（等价于 _filetree.json）"""

    @abstractmethod
    def build_filetree(self, irs: list[tuple[str, ContentIR]]) -> dict:
        """从 IR 列表构建文件树，写入 _filetree.json"""
```

**PC1 实现 — FileRepository**:

```python
class FileRepository(Repository):
    """PC1 实现——JSON 文件存储，输出到 src/content-ir/"""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_ir(self, book_id: str, ir: ContentIR) -> None:
        # 写入 {base_dir}/{category}/{book_id}.json
        # 自动创建分类目录，使用 ir.model_dump(exclude_none=True) 序列化

    def load_ir(self, book_id: str) -> ContentIR | None:
        # 读取 JSON → ContentIR.model_validate_json()

    def list_books(self, category: str | None = None) -> list[BookMeta]:
        # 扫描 base_dir 下的 .json 文件 + 读取 _filetree.json 构建 BookMeta
        # 解析 _filetree.json 分类键：
        #   含 "-" 则拆分（"史部-其他"→category="史部", subcategory="其他"）
        #   不含 "-" 则同名（"经部"→category="经部", subcategory="经部"）
        #   特殊键 "0" → category="四库全书", subcategory="四库全书简明目录"

    def search(self, query: str, limit: int = 20) -> list[BookMeta]:
        # PC1: 标题/ID 简单匹配（后续 PC2 SQLite 可 FTS5 全文搜索）

    def build_filetree(self, irs) -> dict:
        # 构建 {version, builtAt, categories: {...}} 结构
        # 目录键合成规则：f"{category}-{subcategory}"（若同名则仅 category，如 "经部"）
        # 写入 _filetree.json
```

**PC2 预留 — SQLiteRepository**（设计规格，PC1 不实现）:

```sql
CREATE TABLE books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    dynasty TEXT,
    author TEXT,
    category TEXT NOT NULL,              -- 四部分类
    subcategory TEXT NOT NULL,           -- 子分类（无细分时与 category 同名）
    file_path TEXT NOT NULL,
    ir_file_path TEXT,
    chapter_count INTEGER DEFAULT 0,
    section_count INTEGER DEFAULT 0,
    annotation_count INTEGER DEFAULT 0,
    source_hash TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT NOT NULL REFERENCES books(id),
    title TEXT NOT NULL,
    section_count INTEGER DEFAULT 0,
    dom_order INTEGER NOT NULL,
    UNIQUE(book_id, dom_order)
);

CREATE TABLE sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    dom_order INTEGER NOT NULL
);

CREATE TABLE annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES sections(id),
    text TEXT NOT NULL
);

-- PC2 全文搜索（FTS5）
CREATE VIRTUAL TABLE sections_fts USING fts5(
    content,
    content_rowid='id',
    tokenize='unicode61'
);
```

**PC2 切换方式**：只需将 `FileRepository(base_dir)` 替换为 `SQLiteRepository(db_path)`，上层 `repository.save_ir()` / `repository.load_ir()` 调用代码**一行不改**。

### 3. 接口合约

#### 3.1 公共 API

```python
def extract(
    html: str,
    source_path: str,
    catalog_dict: dict[str, CatalogEntry] | None = None,
    *,
    ai_fallback: AIFallback | None = None,
    book_profile: BookProfileStore | None = None,
    nlp_plugin: NLPPlugin | None = None,
) -> ContentIR:
    """
    核心提取函数。等价于 JS 版 extractContent()。

    管道: normalize → index → catalog_detect → pass1 → pass2 → pass3
         → pass4 → pass8 → assemble_results → pass10 → [可选扩展点]

    扩展点（PC2+ 按需传入）：
        ai_fallback: AI fallback 接口，触发时重新提取
        book_profile: Book Profile 存储，用于质量评估
        nlp_plugin: NLP 插件，用于分词/实体识别/自动断句

    Args:
        html: 原始 HTML 字符串
        source_path: 源文件路径（用于 IR.source 和 catalog 匹配）
        catalog_dict: 跨文件元数据注入（可选，首期通常为 None）

    Returns:
        ContentIR 字典
    """
```

#### 3.2 Normalize 接口

```python
def normalize_html(html: str) -> str:
    """
    HTML 4 预处理。3 步转换，严格按序执行：

    Step 1: <center> → <div data-center="1">
      - 所有 <center> 标签替换为 <div data-center="1">
      - 闭合标签 </center> → </div>

    Step 2: flattenTables — 表格扁平化
      - 使用 selectolax DOM 操作（非字符串层面正则替换，等价于 JS cheerio DOM 实现）
      - 递归解包 <table> > <tr> > <td> 链，将 <td> 内容替换为 <div class="table-cell">
      - 保留原 <td> 的 class/style 属性
      - 处理 <tbody> 注入（FrontPage 4.0 自动添加的 tbody 包装）
      - 嵌套表格递归扁平化
      - 不替换文本内容中的 "table" 单词（DOM 操作天然避免此问题）

    Step 3: 空标签剔除
      - 移除所有空标签（如 <span></span>、<font></font>）
      - 自闭合 void elements 除外（<br>、<hr>、<img>、<input>）
      - 连续空标签全部移除

    Returns:
        清洗后的 HTML 字符串
    """
```

#### 3.3 DOM Index 接口

```python
def build_dom_index(html: str) -> tuple[DOMIndex, "HtmlTree"]:
    """
    一次遍历构建 DOM 索引。

    Args:
        html: normalize_html() 输出的 HTML 字符串

    Returns:
        (index, tree) — 索引结构和 selectolax HtmlTree 根节点
        HtmlTree 是 selectolax.parser.HtmlTree 类型，用于递归 DOM 遍历

    id_counter: int = 0  # 顺序递增分配节点 ID（确定性，同一 HTML 输入产出相同 ID）
    Side effects:
        index.by_color: 颜色键为大写 #RRGGBB（如 "#FF6666"）；缩写形式（#F66）需展开为 #FF6666
        index.by_class: 多 class 属性拆分为多个键（"foo bar" → by_class["foo"] 和 by_class["bar"]）
        index.by_tag: 标签名为小写（"div"、"font"、"span"）
        index.by_size: 字号为原始字符串值（"5"、"9pt"）
        index.all_text_nodes: 所有文本节点 ID，按 DOM 序排列
        index.parent_map: 子 ID → 父 ID 映射
    """
```

#### 3.4 Pass 接口

每个 Pass 函数接收 `DOMIndex`、`HtmlTree`、`Territory` 实例，执行领地式提取，返回结构化结果。

**Pass 5-7 说明**：Pass 5 (section-summary)、Pass 6 (end-marker)、Pass 7 (colophon) 不在 DOM 级执行——它们在文本装配器的递归 `process_element` 中作为文本级正则检测实现（见 3.5 文本装配器）。这与 JS 版行为等价：JS 的 `processNode` 也在 default 分支对文本节点做 regex 检测。

**Pass 5-7 split 处理**：`SECTION_SUMMARY_RE` 和 `END_MARKER_RE` 使用 `search`（非 `match`）检测。如果匹配位置在文本中间（非整段匹配），需要 split 处理：

```python
# 例: "正文内容 右经一章 后续内容"
# SECTION_SUMMARY_RE.search() 匹配 "右经一章"
# 处理:
# 1. flush_text("正文内容")  → main-text
# 2. 创建 section-summary("右经一章")
# 3. 继续处理 "后续内容"     → 后续 main-text 或 colophon
```

具体而言：
- 若 `END_MARKER_RE.search(text)` 匹配位置 < len(text)：split 为 `[before_marker, marker, after_marker]`
  - `before_marker` → 作为普通文本追加
  - `marker` → 触发 `past_end_marker = True`
  - `after_marker` → 作为 colophon 处理
- `SECTION_SUMMARY_RE` 同理：匹配后 split 剩余文本继续正常流程

```python
# Pass 1: book-title — 无前置依赖，首个执行
def pass1_book_title(
    index: DOMIndex,
    tree: HtmlTree,
    territory: Territory,
) -> str | None:
    """
    提取书名。策略（按优先级）：
    1. class=article 文本（claim_subtree）
    2. color=#FF6666/#FF0000 + centered + font SIZE≥5（claim_subtree）
    3. 嵌套 font SIZE≥5（claim_subtree）

    Returns: 书名字符串，未匹配返回 None
    Side effect: 匹配节点被 claim_subtree
    """

# Pass 2: metadata — 依赖 Pass 1 已认领 book-title 节点（territory 中部分节点可能已被 claim）
def pass2_metadata(
    index: DOMIndex,
    tree: HtmlTree,
    territory: Territory,
) -> tuple[str, str] | None:
    """
    提取朝代和作者。策略：
    1. class=metadata 文本 + METADATA_RE 匹配
    2. 全文扫描 METADATA_RE

    METADATA_RE = r'\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]?'
    匹配模式："(汉·刘向)" → dynasty="汉", author="刘向"
    注意: 闭合分隔符 `[）)\s]?` 为可选（`?`），支持末尾无分隔符的情况如 `(汉·刘向`（JS bug fix）

    ⚠️ JS Bug Fix: JS 版 pass2 对 metadata 文本节点使用 claim_leaf（仅认领文本节点本身），
       不会过度认领父容器。Python 保持此行为。

    Returns: (dynasty, author) 元组，未匹配返回 (None, None)
    Side effect: 匹配文本节点被 claim_leaf
    """

# Pass 3: chapter-title — 依赖 Pass 1-2 已认领 book-title + metadata
def pass3_chapter_title(
    index: DOMIndex,
    tree: HtmlTree,
    territory: Territory,
) -> list[TextRegion]:
    """
    提取章节标题。策略（按优先级）：
    1. class=chapter 或 class=section（claim_subtree）
    2. color=#CC33CC + tag in [B, FONT, DIV, SPAN]（claim_subtree）
    3. h2/h3/h4 centered（claim_subtree）

    Returns: TextRegion 列表（is_chapter_title=True），按 DOM 序
    Side effect: 匹配节点被 claim_subtree
    """

# Pass 4: annotation — 依赖 Pass 1-3 已认领 book-title + metadata + chapter-title
def pass4_annotation(
    index: DOMIndex,
    tree: HtmlTree,
    territory: Territory,
) -> list[Annotation]:
    """
    收集注疏。策略：
    1. class=annotation / class=reference / class=notes（claim_leaf）
    2. font-size: 9pt（claim_leaf）
    3. font-size: 10pt + color=#551A8B（claim_leaf）

    Returns: Annotation 列表，按 DOM 序
    Side effect: 匹配节点被 claim_leaf
    """

# Pass 8: nav-item — 依赖 Pass 1-4 已认领的节点（仅非 catalog 页执行）
def pass8_nav_item(
    index: DOMIndex,
    tree: HtmlTree,
    territory: Territory,
    ir: ContentIR,
) -> None:
    """
    收集导航项。策略：
    1. menu-context: class=menu > a（claim_subtree）
    2. list-context: ol/ul > li > a（claim_subtree）
    3. 直接 a[href] 节点（claim_leaf）

    仅非 catalog 页执行。
    Side effect: ir.navItems 被填充，匹配节点被认领
    """

# Pass 10: quality assessment — 依赖所有 Pass + assemble_results 完成后的完整 IR
def pass10_quality_assessment(ir: ContentIR) -> QualityScore:
    """
    质量评估。PC1 简化版：
    1. 计算 QualityScore（chapters_count, annotations_count, has_single_chapter_capturing_all）
    2. deviates_from_book_profile = False（PC2 Book Profile 激活后才计算）
    3. 设置 ir._aiFallback = "none"
    4. 若 ai_fallback 参数传入且 should_fallback 为 True，调用 ai_fallback.fallback_extract()

    Returns: QualityScore（仅用于日志/调试）
    """
```

#### 3.5 文本装配器接口

```python
def assemble_results(
    root_nodes: list[Node],
    annotations: list[Annotation],
    chapter_title_node_ids: set[int],
    ir: ContentIR,
    territory: Territory,
) -> None:
    """
    文本装配器——依赖 Pass 1-4 + Pass 8 已认领的节点，递归 DOM 遍历将未认领节点组装为 chapters/sections。

    ⚠️ 实现注意: JS 版使用递归 processElement 遍历 DOM 节点树（非平坦 text_regions 迭代）。
    Python 必须复制此模型——平坦迭代无法处理混合内容容器中的嵌套结构。

    Args:
        root_nodes: 顶层 DOM 节点列表（selectolax 节点）
        annotations: pass4_annotation() 收集的注疏（DOM 序）
        chapter_title_node_ids: pass3_chapter_title() 产出的章节标题节点 ID 集合
        ir: 可变 IR 字典（in-place 修改）
        territory: 用于 is_claimed() 查询

    状态机:
        - past_end_marker: bool = False
        - current_chapter: Chapter = { title: "", sections: [] }
        - current_text: str = ""
        - current_annotations: list[Annotation] = []
        - annotation_cursor: int = 0（annotations 数组游标）

        递归遍历 root_nodes（等价于 JS processElement）:
          def process_element(node):
            若 node.id in chapter_title_node_ids:
              → flush_text() → flush_chapter() → current_chapter.title = node.text → return
            若 SECTION_SUMMARY_RE.match(node.text):
              → flush_text() → 创建 section-summary section
            若 END_MARKER_RE.search(node.text):
              → flush_text() → past_end_marker = True
            若 past_end_marker:
              → flush_text() → 创建 colophon section
            否则（普通文本）:
              → attach_annotations(node, annotations, cursor)
              → current_text += node.text
            若 node 有混合子节点（含未认领的非文本子元素）:
              → 对每个子节点递归 process_element

        遍历结束后:
          → flush_text() → 创建最后的 main-text section
          → flush_chapter() → 推入最后的 chapter

    flush_text():
        若 current_text.strip() 非空:
          创建 Section(type="main-text", content=current_text, annotations=current_annotations)
          追加到 current_chapter.sections
          清空 current_text, current_annotations

    flush_chapter():
        若 current_chapter.sections 非空 或 current_chapter.title 非空:
          推入 current_chapter 到 ir.chapters
          创建新 Chapter(title="", sections=[])
    """
```

### 4. 正则模式

```python
# METADATA_RE: 匹配 "朝代·作者" 模式
# 匹配: (汉·刘向), 宋·朱熹, 明·王阳明）
METADATA_RE = re.compile(r'\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]?')

# SECTION_SUMMARY_RE: 匹配 "右传之首章"、"右经一章" 等
SECTION_SUMMARY_RE = re.compile(r'^右(?:传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章)')

# END_MARKER_RE: 匹配以 "终" 或 "終" 结尾的文本
END_MARKER_RE = re.compile(r'[\u4e00-\u9fff]+[\s]*[終终]\s*$')
```

### 5. Catalog 检测

```python
def detect_catalog(html: str) -> bool:
    """
    检测 HTML 是否为 catalog 页。
    启发式：linkCount > 5 且 bodyText < 3000 字符
    """
```

### 6. 完整数据流（类型标注版）

```
extract(html: str, source_path: str, catalog_dict=None) → ContentIR
  │
  ├─ 1. normalize_html(html: str) → str          # 干净 HTML
  │     Step1: center→div[data-center="1"]
  │     Step2: flattenTables（selectolax DOM 操作，非字符串正则）
  │     Step3: 空标签剔除
  │
  ├─ 2. build_dom_index(normalized_html: str)
  │    → tuple[DOMIndex, HtmlTree]
  │     by_color: dict[str, list[int]]     # "#FF6666" → [42, 87, ...]
  │     by_class: dict[str, list[int]]     # "chapter" → [15, 23, ...]
  │     by_tag: dict[str, list[int]]       # "font" → [8, 12, ...]
  │     by_size: dict[str, list[int]]      # "5" → [8, 9, ...]
  │     all_text_nodes: list[int]          # [1, 3, 5, 7, ...]
  │     parent_map: dict[int, int]         # {3: 1, 5: 3, ...}
  │     node_map: dict[int, NodeProxy]     # {1: NodeProxy(...), ...}
  │
  ├─ 3. IR 初始化
  │    ir: ContentIR = {
  │      title: "Untitled",
  │      source: source_path,
  │      author: None,
  │      dynasty: None,
  │      docType: "content",
  │      chapters: [],
  │      navItems: [],
  │    }
  │    catalog_dict 注入: 若 catalog_dict 中有匹配 entry → ir.author, ir.dynasty
  │    若 catalog_dict 为 None 或无匹配 → 保持 pass2_metadata 提取的值（或 None）
  │
  ├─ 4. detect_catalog(normalized_html) → bool
  │     在 normalize + parse 后的 DOM 上检测（非原始 HTML）
  │     若 True: ir.docType = "catalog"
  │       → 提取 navItems（所有 a[href]）
  │       → 跳过 Pass 1-10
  │       → return ir
  │
  ├─ 5. territory = Territory()
  │
  ├─ 6. pass1_book_title(index, tree, territory) → str | None
  │     → ir.title = result or "Untitled"
  │
  ├─ 7. pass2_metadata(index, tree, territory) → (str,str) | None
  │     → ir.dynasty, ir.author = result or (None, None)
  │
  ├─ 8. pass3_chapter_title(index, tree, territory) → list[TextRegion]
  │     → chapter_title_regions（is_chapter_title=True）
  │
  ├─ 9. pass4_annotation(index, tree, territory) → list[Annotation]
  │     → annotations[]（DOM 序）
  │
  ├─ 10. pass8_nav_item(index, tree, territory, ir) → None
  │      → ir.navItems[] 填充
  │
  ├─ 11. territory.extract_remaining(all_text_nodes, node_map)
  │      → list[TextRegion]（仅用于日志/调试，不传入 assemble_results）
  │
  ├─ 12. assemble_results(root_nodes, annotations, chapter_title_node_ids, ir, territory)
  │      → 递归 DOM 遍历，ir.chapters[] 填充（in-place 修改）
  │
  ├─ 13. pass10_quality_assessment(ir)
  │      → ir._aiFallback = "none"
  │      → [可选] 若 ai_fallback 参数传入且应 fallback → ai_fallback.fallback_extract()
  │
  └─ 14. return ir  （CLI: ir.model_dump(exclude_none=True) → json.dumps()）
```

### 7. 文本装配器状态机（完整规格）

#### 7.1 状态变量

| 变量 | 类型 | 初始值 | 说明 |
|------|------|--------|------|
| `past_end_marker` | `bool` | `False` | 是否遇到 end-marker |
| `current_chapter` | `Chapter` | `{title: "", sections: []}` | 正在构建的章节 |
| `current_text` | `str` | `""` | 正在累积的正文 |
| `current_annotations` | `list[Annotation]` | `[]` | 当前 section 的注疏 |
| `annotation_cursor` | `int` | `0` | annotations 数组消费游标 |

#### 7.2 状态转移（递归 DOM 遍历模型）

> **实现注意**：JS 版 `assembleResults` 使用递归 `processElement` 遍历 DOM 节点树。Python 必须复制此模型——平坦迭代 text_regions 无法处理混合内容容器中的嵌套结构。

```
输入: root_elements (selectolax 节点列表), annotations, chapter_title_node_ids

状态变量:
  past_end_marker: bool = False
  current_chapter: Chapter = {title: "", sections: []}
  current_text: str = ""
  current_annotations: list[Annotation] = []
  annotation_cursor: int = 0

递归遍历 (等价于 JS processElement):
  def process_element(node):
    ┌─────────────────────────────────────────────────┐
    │ node.id in chapter_title_node_ids?              │
    │   → flush_text()                                │
    │   → flush_chapter()                             │
    │   → current_chapter.title = node.text_content    │
    │   → return                                      │
    └─────────────────────────────────────────────────┘
    │ No
    ├─────────────────────────────────────────────────┤
    │ SECTION_SUMMARY_RE.match(node.text)?            │
    │   → flush_text()                                │
    │   → 若匹配在文本中间（非整段）：split 处理       │
    │     before → flush_text()                        │
    │     match → section-summary                     │
    │     after → 继续后续检测                         │
    │   → 否则（整段匹配）：                          │
    │     current_chapter.sections.append({           │
    │       type: "section-summary",                   │
    │       content: node.text.strip()                 │
    │     })                                           │
    └─────────────────────────────────────────────────┘
    │ No
    ├─────────────────────────────────────────────────┤
    │ END_MARKER_RE.search(node.text)?                │
    │   → 若匹配在文本中间：split 处理                │
    │     before → flush_text()                        │
    │     marker → past_end_marker = True             │
    │     after → past_end_marker 分支处理             │
    │   → flush_text()                                │
    │   → past_end_marker = True                      │
    └─────────────────────────────────────────────────┘
    │ No
    ├─────────────────────────────────────────────────┤
    │ past_end_marker == True?                        │
    │   → flush_text()                                │
    │   → current_chapter.sections.append({           │
    │       type: "colophon",                          │
    │       content: node.text                         │
    │     })                                           │
    └─────────────────────────────────────────────────┘
    │ No（普通文本）
    └─────────────────────────────────────────────────┘
    │ → attach_annotations(node, annotations, cursor)
    │ → current_text += node.text

    ┌─────────────────────────────────────────────────┐
    │ node 有混合子节点（含未认领的非文本子元素）?     │
    │   → 对每个子节点递归 process_element            │
    └─────────────────────────────────────────────────┘

循环结束（所有根节点处理完）:
  → flush_text()          # 处理最后的累积文本
  → flush_chapter()       # 推入最后的章节
```

#### 7.3 attach_annotations 逻辑

```python
def attach_annotations(
    region: TextRegion,
    annotations: list[Annotation],
    cursor: int,
) -> tuple[int, list[Annotation]]:
    """
    将 DOM 序在 region 之前的未消费 annotations 关联到当前 region。
    返回新游标和关联的 annotations 列表。

    实际实现中，annotations 已通过 DOM 序排列，
    只需消费 cursor 到 region.dom_order 之间的项。
    """
```

#### 7.4 边界情况

- **空文件**：text_regions 为空 → 产出 `{title: "Untitled", chapters: [{title: "", sections: []}], ...}`
- **纯正文无标题**：无 chapter-title → 所有文本归入 preamble chapter（title=""）
- **end-marker 在中间**：end-marker 后出现 chapter-title → past_end_marker 保持 True（JS 行为不重置），但章节标题仍触发 flush_chapter，新章节正常构建。注意：past_end_marker 后遇到的章节标题不会清除 colophon 状态，后续非标题文本仍归入 colophon
- **多个 end-marker**：首个触发 past_end_marker，后续文本全部归入 colophon
- **嵌套注疏**：Pass 4 已通过 claim_leaf 剥离，文本装配器只处理未认领文本

### 8. 错误设计（R13）

#### 8.1 错误分类体系

| 级别 | 错误类型 | 示例 | 行为 |
|------|---------|------|------|
| **Fatal** | 无法继续运行 | 依赖缺失、配置错误 | 终止整个管道，返回非零退出码 |
| **FileError** | 单文件无法处理 | 文件不存在、编码错误、空文件 | 记录错误，跳过该文件，继续处理下一个 |
| **ParseError** | HTML 解析失败 | 严重 malformed HTML | 记录错误，跳过该文件，产出空 IR |
| **ExtractError** | 提取逻辑异常 | Pass 内部异常、assemble 崩溃 | 记录错误和堆栈，跳过该文件 |
| **QualityWarning** | 产出不符合预期 | 0 chapters（疑似应该有章节）、claim 覆盖率 < 10% | 产出 IR，标记 quality flag = "suspicious" |
| **ParityMismatch** | 对等验证差异 | Python vs JS 输出不一致 | 记录差异详情，分类为 Python bug / JS bug / 合理差异 |

#### 8.2 容错策略

- **单文件容错**：任何 FileError/ParseError/ExtractError 不影响其他文件处理
- **Pass 级容错**：单个 Pass 内部异常 → 记录日志（WARNING），该 Pass 产出为空结果，后续 Pass 继续执行
- **管道级容错**：Pass 1-3 全部失败（title/author/chapter 均为空）→ 仍产出 IR（仅含 main-text），不中断
- **批量处理退出条件**：Fatal 错误立即退出；FileError 累计超过 10% 时发出警告但不退出

#### 8.3 错误传播路径

```
extract(html, source_path)
  ├─ normalize_html → ParseError（抛出，调用方捕获）
  ├─ build_dom_index → ParseError（同上）
  ├─ pass1-4, pass8 → ExtractError（单 Pass 失败产出空结果，不中断后续 Pass）
  ├─ assemble_results → ExtractError（产出空 chapters，不中断）
  └─ 返回 ContentIR（可能部分为空，但结构完整）

CLI 层：
  ├─ 单文件模式：任何错误 → 非零退出码
  └─ 批量模式：FileError 记录并继续；Fatal 退出并产出部分报告
```

#### 8.4 ExtractError 输出结构

```python
class ExtractError(BaseModel):
    model_config = ConfigDict(frozen=False)
    source: str            # 源文件路径
    error_type: Literal["fatal", "file", "parse", "extract", "quality"]
    stage: str             # "normalize" | "index" | "pass1" | ... | "assemble"
    message: str           # 人类可读描述
    traceback: str | None = None  # 详细堆栈（--verbose 模式）
    partial_ir: bool = False      # 是否产出了部分 IR
```

### 9. 可观测性设计（R14）

可观测性按层级拆分。PC1 实现核心层，扩展功能在 PC2 按需添加。

| 层级 | PC1 实现 | PC2+ 扩展 |
|------|---------|----------|
| **核心日志** | `logging` 标准输出（ERROR/WARNING/INFO/DEBUG） | 无，已足够 |
| **进度报告** | 每 100 文件一行 INFO（含 rate + ETA） | 无，已足够 |
| **FileMetrics** | Pydantic BaseModel + per-file 摘要行 | JSON 导出 |
| **ExtractError** | Pydantic BaseModel + 错误时记录 | 无 |
| **--debug 模式** | 产出 `output.debug.json`（含 DOMIndex 快照 + claimed set + 每 Pass 中间结果） | 更多诊断 |
| **Aggregate 指标** | 简单计数：total/success/error + avg time | p95/p99/claim_ratio |

**PC1 不实现**：`--diff` 模式（U9 比对脚本单独实现）、p95/p99 百分位统计、`report_aggregate()` 完整函数（批量结束时输出一行汇总即可）。

#### 9.1 日志策略

**Log Levels**：

| Level | 用途 | 示例 |
|-------|------|------|
| `ERROR` | 必须干预的错误 | 依赖缺失、文件编码错误、解析崩溃 |
| `WARNING` | 潜在问题但不阻塞 | 0 chapters、claim 覆盖率低、METADATA_RE 假阳性 |
| `INFO` | 关键操作摘要 | 每文件完成摘要 |
| `DEBUG` | 调试详情 | 每个 Pass 的匹配节点数、规则触发详情 |

**日志格式**：`[LEVEL] [{source_path}] {message}`

**默认输出**（INFO 级别，每文件一行）：
```
[INFO] [经部/大学章句集注/大学章句集注.htm] docType=content title="大学章句集注" chapters=28 annotations=156 time=42ms
```

#### 9.2 度量指标

**Per-file 指标**（FileMetrics BaseModel）：

```python
class FileMetrics(BaseModel):
    model_config = ConfigDict(frozen=False)
    source: str
    doc_type: str
    title: str
    chapters_count: int
    sections_count: int
    annotations_count: int
    nav_items_count: int
    normalize_time_ms: float
    index_time_ms: float
    pass_time_ms: float
    assemble_time_ms: float
    total_time_ms: float
    claim_ratio: float             # 认领文本 / 总文本（0.0-1.0）
    quality_flag: str | None = None  # "suspicious" 或 None
```

**Aggregate 指标**（批量完成后输出）：

| 指标 | 说明 |
|------|------|
| total_files / success_files / error_files | 文件计数（按 error_type 分类） |
| avg_time_ms / p95_time_ms / p99_time_ms | 单文件耗时分布 |
| total_time_ms | 总耗时 |
| avg_claim_ratio | 平均认领率 |
| parity_match_rate | 对等匹配率（U9 阶段） |

#### 9.3 进度报告

- 每处理 100 个文件输出：`[INFO] Progress: 1200/9042 (13.3%) — 327 files/s — ETA: 24m`
- 完成每个 checkpoint（经部/史部/子部/集部）时输出阶段摘要
- 异常退出时产出已完成部分的报告

#### 9.4 调试支持

**`--debug` 模式**：
- 输出每个 Pass 的匹配详情（规则名、匹配节点数、认领节点 ID）
- 产出 `output.debug.json` 包含完整 DOMIndex 快照、Territory claimed set、每 Pass 中间结果

**`--diff` 模式**（parity 调试）：
```bash
bamboo-extract --diff input.html --js-ir js_output.json --py-ir py_output.json
```
- 逐字段对比 JS/Python IR 差异
- 标注差异类型（Python bug / JS bug / 合理差异）
- 输出差异节点的 DOM 上下文

### 10. 数据流映射（R15）

本节将需求文档 R15 定义的七阶段数据流映射到实现单元：

| 数据流阶段 | 实现函数 | 实现单元 | 输入 | 输出 |
|-----------|---------|---------|------|------|
| 1. Normalize | `normalize_html()` | U2 | 原始 HTML str | 干净 HTML str |
| 2. Index | `build_dom_index()` | U2 | 干净 HTML str | DOMIndex + HtmlTree |
| 3. Catalog Detect | `detect_catalog()` | U4 | DOMIndex + HtmlTree | bool → ir.docType |
| 4. Territory Pass 1-4,8 | `pass1_book_title()` ... `pass8_nav_item()` | U3, U4 | DOMIndex + HtmlTree + Territory | 各 Pass 中间结果 + claimed set |
| 5. Extract Remaining | `territory.extract_remaining()` | U2 | all_text_nodes + node_map + claimed | TextRegion 列表 |
| 6. Assemble | `assemble_results()` | U4 | root_nodes + annotations + chapter_title_ids + territory | ir.chapters[] (in-place) |
| 7. Serialize | `json.dumps()` (CLI) | U6 | ContentIR dict | JSON 文件 |

**数据不变性验证**（在 U9 对等验证中实现）：
- 文本总量守恒：`sum(len(s.content) for s in all_sections) ≤ len(HtmlTree.text_content())`
- 认领互斥：`len(claimed) == sum(claim_leaf + claim_subtree 的 ID 数)`
- 章节有序：`chapters[i].title 的 DOM 位置 < chapters[i+1].title 的 DOM 位置`
- Annotation 关联：每个 annotation 必须出现在某个 main-text section 的 annotations 数组或作为 inline-annotation section

### 11. 技术规范约束（R16）

本节定义实现必须遵守的技术约束，源自 R16 需求文档。

#### 11.1 flattenTables 实现策略

- 使用 selectolax DOM 操作（非字符串正则），等价于 JS cheerio DOM 实现：
  - 查找所有 `<td>` 节点，将其标签替换为 `<div>` 并保留原 class/style 属性（使用 `replace_with()` 或手动提升子节点）
  - 递归处理嵌套表格（td 内包含 table 的情况）
  - 使用 `replace_with()` + 子节点提升移除 `<tbody>` 和 `<tr>` 包装（⚠️ selectolax **不支持** `unwrap()`，需手动实现：将节点的子节点逐个插入到父节点中，然后删除该节点）
  - 属性保留：原 `<td class="foo" style="...">` 变为 `<div class="foo" style="...">`

#### 11.2 颜色规范化

`build_dom_index` 中 `by_color` 键使用大写 `#RRGGBB` 格式。所有缩写形式（`#F66`）必须在索引构建时展开为 `#FF6666`。

#### 11.3 CSS 选择器兼容性

- selectolax 支持 CSS3 标准选择器，不支持 jQuery 扩展（`:contains`、`:has`、`:eq`）
- JS 版中使用的 `:contains` 选择器需在 Python 中用 `.filter()` 手动实现文本匹配
- 其余所有选择器（`.class`、`[attr]`、`tag > child` 等）在 selectolax 中完全等价

#### 11.4 递归深度

- FrontPage 4.0 HTML 实测最大深度 50-80 层
- `assemble_results` 使用递归 DOM 遍历模型，入口处 `sys.setrecursionlimit(2000)` 提升安全裕度
- RecursionError 兜底：记录 ParseError，产出空 IR

#### 11.5 类型约束（ContentIR）

- `author` 和 `dynasty` 使用 `str | None = None` + `exclude_none=True` 序列化，仅非空时包含（等价 JS `undefined` 省略行为）
- 首个 chapter 的 `title` 可为 `""`（preamble）
- 空 `content` 的 section 应被剔除
- 空 `href` 的链接不应纳入 navItems

---

## Implementation Units

按依赖顺序排列。核心策略：**dummy-first，先跑通流程**。

U1 完成后即可运行 `bamboo-extract input.html --output output.json`，得到完整的 IR 结构（dummy 值），然后逐步替换各单元为真实实现。

```
执行顺序（dummy-first）:

U1 → U2(dummy) → U3(dummy) → U4(dummy)  ← 首次跑通全流程
  ↓
U2(real) → U3(real) → U4(real)           ← 逐步替换
  ↓
U6 → U7(扩展点+可观测性) → U8 → U10 → U9
```

---

- [x] **Unit U1: Python 项目骨架 + pyproject.toml + CLI 基础**

**Goal:** 建立 Python 包结构、依赖配置、CLI 入口，可独立 `uv run bamboo-extract input.html --output output.json`。

**Requirements:** R1, R4, R11

**Dependencies:** 无

**Files:**
- Create: `src/bamboo_extract/__init__.py`
- Create: `src/bamboo_extract/cli.py`
- Create: `pyproject.toml`
- Test: `tests/test_cli.py`

**Approach:**
- `pyproject.toml`: name = `bamboo-extract`, version = `0.1.0`, requires-python = `>=3.12`, dependencies = `["selectolax", "pydantic>=2.0"]`
- `[project.scripts]` → `bamboo-extract = bamboo_extract.cli:main`
- `__init__.py`: 导出 `extract` 函数（初始为 dummy 实现，返回最小合法 ContentIR）
- `cli.py`: argparse 实现 `bamboo-extract input.html --output output.json [--verbose]`
  - 读取文件 → 调用 `extract()` → `ir.model_dump(exclude_none=True)` → `json.dumps(..., indent=2, ensure_ascii=False)` → 写入 output
- **dummy extract() 实现**: 返回 `{title: "Untitled", source: source_path, docType: "content", chapters: [{title: "", sections: []}], navItems: []}`
- 安装验证: `uv sync` + `uv run bamboo-extract --help`

**Test scenarios:**
- Happy path: `uv run bamboo-extract --help` 显示用法
- Happy path: `uv run bamboo-extract input.html --output output.json` 产出合法 JSON（最小 IR 结构）
- Edge case: 不存在的输入文件 → 清晰的错误信息
- Edge case: 空 HTML 输入 → 产出空 IR 结构（dummy 也返回合法结构）

**Verification:**
- `uv run bamboo-extract input.html --output output.json` 产出 `{ "title": "Untitled", "chapters": [...], ... }`
- `pytest tests/test_cli.py` 通过
- 首次全流程可运行（dummy 值）

---

- [ ] **Unit U2: Territory 类 + DOM 索引构建（dummy → real）**

**Goal:** 实现领地式提取的核心基础设施：Territory 类和 DOM 一次索引。

**Requirements:** R8

**Dependencies:** U1（骨架就绪）

**Files:**
- Create: `src/bamboo_extract/territory.py`
- Create: `src/bamboo_extract/normalize.py`
- Create: `src/bamboo_extract/types.py`
- Test: `tests/test_territory.py`
- Test: `tests/test_normalize.py`

**Approach:**

**第一阶段 — Dummy（依赖 U1 后立即可做）:**
- `types.py`: 定义 Pydantic IR 模型（ContentIR, Chapter, Section, Annotation, NavItem, Entity）+ 中间 `@dataclass` 类型（TextRegion, DOMIndex, NodeProxy, CatalogEntry, QualityScore）
- `territory.py`: Territory 类 dummy 实现
  - `claimed: set[int] = set()` — claim_leaf/claim_subtree 为空操作
  - `is_claimed()` 始终返回 False
  - `extract_remaining()` 返回空列表
- `normalize.py`: `normalize_html(html)` 返回 `html`（不做任何转换）
- `build_dom_index()` 返回空的 DOMIndex（所有字典为空，all_text_nodes 为空）
- **目标**: 让 extract() 管道能跑通，虽然不提取任何内容，但结构完整

**第二阶段 — Real（替换 dummy）:**
- `types.py`: IR 模型已由 Pydantic BaseModel 定义（第一阶段完成），此阶段增加 `validate_ir()` 验证函数
- **Territory 类真实实现**:
  - `claimed: set[int]` — 用节点 ID 而非对象引用
  - `claim_leaf(node_id)` — 添加到 claimed set
  - `claim_subtree(node_id, descendants)` — 添加节点及所有后代
  - `is_claimed(node_id)` — 查询 claimed set
  - `has_claimed_ancestor(node_id)` — 沿 parent_map 上行检查
  - `extract_remaining(all_text_node_ids, node_map) -> list[TextRegion]`
  - `extract_by_rules(rules, index, node_map, mode) -> list[int]`
- **build_dom_index 真实实现**: 一次遍历 selectolax DOM，构建 by_color/by_class/by_tag/by_size/all_text_nodes/parent_map/node_map
- **normalize_html 真实实现**: center→div, flattenTables（selectolax DOM 操作）, 空标签剔除

**Technical design:** _(dummy-first — 先做类型定义和空操作，再做真实逻辑)_

```python
# 第一阶段 dummy
class Territory:
    def __init__(self):
        self._claimed: set[int] = set()
    def claim_leaf(self, node_id: int) -> None: pass
    def claim_subtree(self, node_id: int, descendants: list[int]) -> None: pass
    def is_claimed(self, node_id: int) -> bool: return False
    def has_claimed_ancestor(self, node_id: int) -> bool: return False
    def extract_remaining(self, all_text_node_ids, node_map) -> list: return []
```

**Patterns to follow:**
- JS `extractors.mjs:37-165` createTerritory 实现
- JS `extractors.mjs:184-244` buildDomIndex 实现
- Python 用 ID-based claimed set（非对象引用）

**Test scenarios:**
- Happy path (dummy): extract_remaining 返回空列表，不抛出异常
- Happy path (real): claim_leaf → is_claimed 返回 True
- Happy path (real): claim_subtree → 节点和后代均被认领
- Edge case (real): has_claimed_ancestor → 祖先被认领时返回 True
- Edge case (real): extract_remaining 全部节点已认领 → 返回空列表
- Happy path (real): build_dom_index → by_color/by_class/by_tag/by_size 正确索引
- Edge case (real): normalize_html → `<center>` 转为 `<div data-center>`
- Edge case (real): flattenTables → 不替换文本中的 "table" 单词
- Edge case (real): flattenTables → 嵌套表格正确扁平化，class 属性保留

**Verification:**
- Dummy 阶段: extract() 全流程可运行，产出 dummy IR
- Real 阶段: `pytest tests/test_territory.py` 通过，Territory 行为与 JS 等价

---

- [ ] **Unit U3: 规则表 + Pass 1-3（dummy → real）**

**Goal:** 实现规则表驱动的分类器，完成 Pass 1-3 领地式提取。

**Requirements:** R2, R3, R6, R8

**Dependencies:** U2（Territory + DOM 索引 — dummy 版即可开始）

**Files:**
- Create: `src/bamboo_extract/rules.py`
- Create: `src/bamboo_extract/extractors.py`
- Test: `tests/test_rules.py`
- Test: `tests/test_extractors.py`

**Approach:**

**第一阶段 — Dummy（依赖 U2 dummy 后即可做）:**
- `rules.py`: 定义空的 CLASSIFICATION_RULES 列表 `[]`
- `extractors.py`: Pass 1-3 dummy 实现
  - `pass1_book_title()` 返回 None（未找到书名）
  - `pass2_metadata()` 返回 (None, None)（未找到元数据）
  - `pass3_chapter_title()` 返回空列表 `[]`
- `detect_catalog()` 返回 False
- **目标**: extract() 跑通时，产出的 IR 仍为 dummy 值，但所有 Pass 都执行了（空操作）

**第二阶段 — Real（替换 dummy）:**
- **rules.py**: CLASSIFICATION_RULES — 与 JS 版同一套逻辑的 Python 实现
  - 规则按优先级排序（book-title > metadata > chapter-title > annotation > ...）
  - 每条规则: `{ name: str, predicate: callable, classify_as: str }`
- **extractors.py 真实实现**:
  - `pass1_book_title`: class=article 文本; color=#FF6666/#FF0000 + centered + SIZE≥5; 嵌套 font SIZE≥5
  - `pass2_metadata`: class=metadata + METADATA_RE; 全文扫描 METADATA_RE; claim_leaf（非 claim_subtree，修复 JS bug）
  - `pass3_chapter_title`: class=chapter/section; color=#CC33CC + tag in [B, FONT, DIV, SPAN]; h2/h3/h4 centered
  - `detect_catalog`: linkCount > 5 && bodyText < 3000

**Patterns to follow:**
- JS `extractors.mjs:300-354` pass1BookTitle
- JS `extractors.mjs:368-391` pass2Metadata
- JS `extractors.mjs:403-448` pass3ChapterTitle

**Test scenarios:**
- Happy path (dummy): Pass 1-3 返回空/None，不抛出异常
- Happy path (real): class=article 节点 → book-title 提取
- Happy path (real): "宋·朱熹" 文本 → dynasty="宋", author="朱熹"
- Happy path (real): class=chapter → chapter-title 提取
- Edge case (real): 节点已被认领 → 跳过（领地不变式）
- Edge case (real): METADATA_RE 假阳性 → `(天·地人)` 等非元数据返回 None
- Edge case (real): class=section → chapter-title 提取（JS 有代码无测试的路径）

**Verification:**
- Dummy 阶段: extract() 全流程可运行，dummy Pass 不干扰管道
- Real 阶段: Pass 1-3 输出与 JS 版对相同 fixture 的结果一致

---

- [ ] **Unit U4: Pass 4-9 + 文本装配器（dummy → real）**

**Goal:** 完成 Pass 4（annotation）、Pass 8（nav-item）、assemble_results 文本装配器、catalog 检测、完整 `extract()` API。

**Requirements:** R2, R3, R5, R8

**Dependencies:** U3（Pass 1-3 + 规则表 — dummy 版即可开始）

**Files:**
- Create: `src/bamboo_extract/passes.py`
- Modify: `src/bamboo_extract/__init__.py`（导出 extract）
- Modify: `src/bamboo_extract/extractors.py`（完整 extract 函数）
- Test: `tests/test_extractors.py`（补充 Pass 4-9 测试）
- Test: `tests/test_parity.py`（跨语言对等验证基础）

**Approach:**

**第一阶段 — Dummy（依赖 U3 dummy 后即可做，此时全流程可跑通）:**
- `passes.py`: Pass 4/8/10 + assemble_results dummy 实现
  - `pass4_annotation()` 返回空列表 `[]`
  - `pass8_nav_item()` 空操作（ir.navItems 保持空列表）
  - `pass10_quality_assessment()` 设置 `ir._aiFallback = "none"`
  - `assemble_results()` — 创建最小合法 chapters 结构: `ir.chapters = [{title: "", sections: []}]`
- **完整 extract() 管道串联**:
  ```python
  def extract(html, source_path, catalog_dict=None):
      normalized = normalize_html(html)      # U2 dummy → 返回原 HTML
      index, tree = build_dom_index(normalized)  # U2 dummy → 空索引
      territory = Territory()                # U2 dummy → 空操作
      catalog = detect_catalog(normalized)   # U3 dummy → False

      title = pass1_book_title(index, tree, territory)    # U3 dummy → None
      dynasty, author = pass2_metadata(index, tree, territory)  # U3 dummy → (None, None)
      chapter_titles = pass3_chapter_title(index, tree, territory)  # U3 dummy → []

      annotations = pass4_annotation(index, tree, territory)  # U4 dummy → []
      pass8_nav_item(index, tree, territory, ir)              # U4 dummy → 无操作

      text_regions = territory.extract_remaining(...)  # U2 dummy → []（仅用于日志）
      assemble_results(tree.css('body'), annotations, set(chapter_title_ids), ir, territory)  # U4 dummy → 最小结构

      pass10_quality_assessment(ir)  # U4 dummy → _aiFallback = "none"
      return ir
  ```
- **此时运行**: `uv run bamboo-extract input.html --output output.json` 产出 `{title: "Untitled", chapters: [{title: "", sections: []}], navItems: [], _aiFallback: "none"}` — **全流程跑通**

**第二阶段 — Real（逐步替换 dummy）:**
- **passes.py 真实实现**:
  - `pass4_annotation`: class=annotation/reference/notes; font-size: 9pt; font-size: 10pt + color=#551A8B
  - `pass8_nav_item`: menu-context (class=menu > a); list-context (ol/ul > li/a); 直接 a[href]
  - `assemble_results`: 递归 processElement DOM 遍历模型（详见 "Python Module Design" 节 3.5 和 7）——接收 root_nodes + territory，非扁平 text_regions
  - `pass10_quality_assessment`: 计算 QualityScore + claim_ratio
- **完整 extract()**: 替换所有 dummy 调用为真实实现

**Technical design:** _(directional guidance — assemble_results 递归模型)_

详见 "Python Module Design" 节 3.5 和 7 的状态机规格。实现方式为递归 DOM 遍历：
1. 从根节点开始递归
2. 对每个节点检查类型（chapter-title / section-summary / end-marker / annotation / main-text）
3. 对混合内容容器递归处理子节点
4. 克隆节点以移除已认领后代

**Patterns to follow:**
- JS `extractors.mjs:465-512` pass4Annotation
- JS `extractors.mjs:528-581` pass8NavItem
- JS `extractors.mjs:666-875` assembleResults

**Test scenarios:**
- Happy path (dummy): extract() 返回最小合法 IR，全流程不报错
- Happy path (real): class=annotation → annotation 提取并 claim
- Happy path (real): a[href] → nav-item 提取
- Happy path (real): 纯正文 HTML → 所有未认领文本归为 main-text
- Happy path (real): 含 chapter-title → 正确拆分 chapters
- Edge case (real): SECTION_SUMMARY_RE 匹配 → section-summary section
- Edge case (real): END_MARKER_RE 匹配 → past_end_marker 后文本归为 colophon
- Integration (real): 完整 extract() 对 Template F fixture → IR 与 JS 版一致
- Integration (real): catalog HTML → docType=catalog, navItems 提取

**Verification:**
- Dummy 阶段: `uv run bamboo-extract input.html --output output.json` 产出合法最小 IR
- Real 阶段: `extract()` 对经部样本文件产出合理 IR（多章节、注疏、正文分离）

---

- [ ] **Unit U5: renderers.py（HTML5 + Markdown 输出）—— DEFERRED to PC2+**

> **Scope note**: Origin document R10-A1 明确"首期仅定义协议，不实现具体导出器"。U5 从 PC1 移除，延至 PC2 实现。PC1 仅保留 U8 的协议定义。
>
> **Title fallback**: JS 版有 `extractTitle` 多级 fallback（`<title>`、`<h1>`、color+size 扫描）。Python 不实现 fallback —— title 将通过顶级索引导览页（catalog_dict）完成确定性数据收集，无需 fallback。

---

- [ ] **Unit U6: CLI 完整实现**

**Goal:** CLI 支持完整提取功能、--verbose 输出、批量处理、错误处理、可观测性。

**Requirements:** R4, R7, R13, R14

**Dependencies:** U4（extract 函数 — dummy 版即可开始 CLI 开发）

**Files:**
- Modify: `src/bamboo_extract/cli.py`
- Test: `tests/test_cli.py`

**Approach:**

**第一阶段 — Dummy CLI（依赖 U4 dummy 后即可做）:**
- 单文件: `bamboo-extract input.html --output output.json`
- 批量: `bamboo-extract --dir 古籍/经部/ --output-dir output/`
- `--verbose`: 每文件输出 `{sourcePath} docType={docType} chapters={N} annotations={N} time={Ms}`
- 错误处理骨架: 单文件模式错误 → 非零退出码；批量模式错误 → 记录并继续
- **此时可用 dummy extract() 验证 CLI 批量扫描能力**

**第二阶段 — Real（增强）:**
- 批量模式使用 `FileRepository(base_dir)` 保存 IR 文件 + 构建 `_filetree.json`
- `--debug`: 输出每 Pass 匹配详情 + `output.debug.json`
- `--diff`: parity 调试模式，逐字段对比 JS/Python IR
- 批量模式进度报告（每 100 文件含 rate + ETA）
- 完成时 aggregate 指标（avg/p95/p99 time, claim ratio, parity match rate）
- FileError 累计 > 10% 时发出警告

**Test scenarios:**
- Happy path: 单文件提取 → 产出合法 JSON
- Happy path: --verbose 输出 per-file 摘要
- Happy path: 批量目录扫描 → 每文件一个 JSON
- Happy path: 批量模式进度报告（每 100 文件）
- Edge case: 不存在的输入文件 → 清晰的错误信息
- Edge case: 空 HTML 输入 → 产出空 IR 结构
- Edge case: 批量模式 10%+ FileError → 发出警告但不退出

**Verification:**
- `bamboo-extract --help` 显示完整用法
- 单文件和批量模式均正常工作
- Dummy extract() 也能通过批量扫描验证

---

- [ ] **Unit U7: 显式扩展点 + AI Fallback / Book Profile 接口 + 可观测性**

**Goal:** `extract()` 函数签名支持显式扩展点参数（`ai_fallback`, `book_profile`, `nlp_plugin`）。Pass 10 质量评估真实实现。可观测性基础设施核心层。

**Requirements:** R9, R14

**Dependencies:** U4（核心提取管道 — dummy 版即可开始）

**Files:**
- Create: `src/bamboo_extract/ai_fallback.py`    # AIFallback Protocol
- Create: `src/bamboo_extract/book_profile.py`   # BookProfileStore Protocol
- Create: `src/bamboo_extract/observability.py`  # FileMetrics, ExtractError, 日志/进度
- Modify: `src/bamboo_extract/extractors.py`     # extract() 签名增加扩展点参数
- Test: `tests/test_ai_fallback.py`
- Test: `tests/test_observability.py`

**Approach:**

**核心设计 — 显式扩展点（替代 Filter 注册机制）:**

PC1 不实现 `ExtractPipeline` 注册机制。改为在 `extract()` 签名中预留关键字参数：

```python
def extract(
    html: str,
    source_path: str,
    catalog_dict: dict | None = None,
    *,
    ai_fallback: AIFallback | None = None,
    book_profile: BookProfileStore | None = None,
    nlp_plugin: NLPPlugin | None = None,
) -> ContentIR:
    ...
    # Pass 10 后，若有扩展点则调用：
    if ai_fallback and _should_fallback(quality):
        ir = ai_fallback.fallback_extract(html)
    if nlp_plugin:
        ir = _apply_nlp(ir, nlp_plugin)
```

PC2 使用时直接传参：
```python
extract(html, path, ai_fallback=MyAIFallback(), nlp_plugin=MyNLP())
```

**对比注册机制的取舍**：
- 优势：直观、agent 友好、固定调用顺序（避免排序 bug）、PC1 零注册表代码
- 限制：扩展点数量固定，不可动态添加

**PC1 实现**：
- Protocol 定义（AIFallback, BookProfileStore, NLPPlugin）
- `extract()` 签名包含 `*_` 扩展点参数
- 函数体内条件调用（`if ai_fallback:` ...）
- PC1 调用方不传任何扩展点参数

**Pass 10 质量评估（PC1 真实实现）:**
- 计算 QualityScore（chapters_count, annotations_count, has_single_chapter_capturing_all）
- 计算 claim_ratio（认领文本 / 总文本）
- 若 chapters_count == 0 且文件非 catalog → quality_flag = "suspicious"
- 设置 `ir._aiFallback = "none"`

**可观测性基础设施（R14，PC1 核心层）:**
- `FileMetrics` Pydantic BaseModel
- `ExtractError` Pydantic BaseModel
- `log_extraction()` — 结构化日志输出
- `report_progress()` — 批量进度报告（每 100 文件，含 rate + ETA）
- `report_aggregate()` — 简化版：批量结束时输出一行汇总（total/success/error + avg time）
- **PC1 不实现**: p95/p99 百分位统计、完整 aggregate 报告

**Test scenarios:**
- Happy path: extract(ai_fallback=...) 传参正常执行（传入 None 时不调用）
- Happy path: Pass 10 → ir._aiFallback = "none"
- Happy path: FileMetrics 记录完整 per-file 指标
- Happy path: log_extraction 输出标准格式日志
- Edge case: claim_ratio == 0 → quality_flag = "suspicious"
- Edge case: ExtractError 输出结构正确
- Edge case: report_progress 每 100 文件输出一次

**Verification:**
- `extract()` 签名包含扩展点参数，PC1 调用方不传参数也能正常工作
- `pytest tests/test_ai_fallback.py` 通过
- 协议定义清晰，PC2 可直接传入实现
- 批量模式可观测性输出符合 R14 核心层规格

---

- [ ] **Unit U8: Exporter 协议 + NLP Plugin 接口定义**

**Goal:** 定义 Exporter Protocol 和 NLP Plugin 接口（PC1 仅定义，不注册到管道）。

**Requirements:** R10

**Dependencies:** U1（模块骨架）

**Files:**
- Create: `src/bamboo_extract/export.py`
- Create: `src/bamboo_extract/nlp.py`
- Test: `tests/test_export.py`

**Approach:**
- `ExportFormat` Enum: JSON_IR = "json", HTML5 = "html5", MARKDOWN = "markdown"
- `Exporter` Protocol: export(ir, fmt) -> str
- 仅定义协议，不实现具体导出器（JSON 由 CLI 通过 json.dumps 完成）
- NLPPlugin Protocol: segment / recognize_entities / punctuate

**Test scenarios:**
- Happy path: ExportFormat 枚举值正确
- Happy path: Exporter Protocol 类型检查通过
- Happy path: NLPPlugin Protocol 定义清晰

**Verification:**
- `pytest tests/test_export.py` 通过

---

- [ ] **Unit U10: catalog.py（跨文件元数据注入）**

**Goal:** 实现 build_catalog_dict 和 lookup_catalog_meta，等价于 JS 版 catalogDict。

**Requirements:** R2（catalog_dict 参数）

**Dependencies:** U4（extract 函数签名支持 catalog_dict）

**Files:**
- Create: `src/bamboo_extract/catalog.py`
- Modify: `src/bamboo_extract/extractors.py`（消费 catalog_dict）
- Test: `tests/test_catalog.py`

**Approach:**
- `build_catalog_dict(catalog_irs: list[ContentIR]) -> dict[str, CatalogEntry]`
  - 从 catalog 页 IR 的 navItems 构建 path → entry 映射
- `lookup_catalog_meta(dict, source_path) -> CatalogEntry | None`
  - basename 匹配 + 后缀匹配（等价于 JS 版逻辑）
- `extract(html, source_path, catalog_dict=None)` 消费 catalog_dict 注入 author/dynasty
- 首期可为 None（content 页从自身 metadata 提取），后续实现 build_catalog_dict 后补齐

**Patterns to follow:**
- JS `extractors.mjs:1084-1124` buildCatalogDict / lookupCatalogMeta

**Test scenarios:**
- Happy path: build_catalog_dict 从 catalog IR 构建映射
- Happy path: lookup_catalog_meta 通过 basename 和后缀匹配
- Edge case: 无匹配 → 返回 None
- Integration: extract(catalog_dict=...) 注入 author/dynasty

**Verification:**
- `pytest tests/test_catalog.py` 通过
- catalog_dict 注入行为与 JS 版一致

---

- [ ] **Unit U11: Repository 抽象层 + FileRepository 实现**

**Goal:** 定义 Repository 抽象接口，实现 FileRepository（JSON 文件存储），支持 IR 保存/加载、书籍列表、文件树构建。

**Requirements:** R2 (catalog_dict 消费)

**Dependencies:** U1（骨架），U4（ContentIR 模型）

**Files:**
- Create: `src/bamboo_extract/repository.py`
- Create: `src/bamboo_extract/filetree.py`
- Test: `tests/test_repository.py`

**Approach:**
- Repository ABC（详见 2.7 节设计规格）
- `BookMeta` Pydantic 模型已定义于 `types.py`（2.7 节），含 `subcategory` 字段
- FileRepository 实现：
  - `save_ir(book_id, ir)`: 写入 `{base_dir}/{category}/{book_id}.json`，自动创建分类目录
  - `load_ir(book_id)`: 读取 JSON → `ContentIR.model_validate()`
  - `list_books(category=None)`: 扫描 `.json` 文件 + 读取 `_filetree.json` 构建 BookMeta 列表
    - 解析 `_filetree.json` 分类键：
      - `"史部-其他"` → `category="史部"`, `subcategory="其他"`
      - `"经部"` → `category="经部"`, `subcategory="经部"`
      - `"0"` → `category="四库全书"`, `subcategory="四库全书简明目录"`（历史遗留键名纠正）
  - `search(query, limit)`: PC1 标题/ID 简单匹配（PC2 切换 SQLite 后 FTS5）
  - `build_filetree(irs)`: 从 IR 列表构建 `{version, builtAt, categories: {...}}` 结构
    - 目录键合成：`f"{category}-{subcategory}"`（同名时简化为 `category`，如 `"经部"`）
    - 写入 `_filetree.json`
- FileRepository.build_filetree 输出等价于当前 `_filetree.json` 的结构（479KB, 10871 行）
- CLI 批量模式使用 FileRepository 替代直接 `json.dumps` 写入

**Patterns to follow:**
- 当前 `_filetree.json` 结构（`src/content-ir/_filetree.json`）
- 当前 CLI 批量写入逻辑（`scripts/convert-htm-to-md.js` 中的文件输出路径）
- Repository Pattern 设计（2.7 节完整规格）

**Test scenarios:**
- Happy path: save_ir → 写入正确路径的 JSON 文件
- Happy path: load_ir → 读取 JSON → ContentIR 验证通过
- Happy path: list_books → 返回所有书籍 BookMeta 列表
- Happy path: list_books(category="经部") → 仅返回经部书籍
- Happy path: list_books → 正确解析分类键（"史部-其他"→category="史部",subcategory="其他"；"经部"→category="经部",subcategory="经部"）
- Happy path: list_books → 特殊键 "0" 映射为 category="四库全书", subcategory="四库全书简明目录"
- Happy path: build_filetree → 输出等价于当前 `_filetree.json` 结构（含 7 个分类键）
- Happy path: build_filetree → 目录键合成：同名仅 category（"经部"），不同名合成为 "史部-其他"
- Happy path: build_filetree → "四库全书" 类合成键为 "四库全书-四库全书简明目录"
- Edge case: save_ir 到不存在的分类目录 → 自动创建
- Edge case: load_ir 不存在的 book_id → 返回 None
- Edge case: search 空查询 → 返回空列表
- Edge case: list_books → 分类键 "0" 不为数值类型、不误判为空（字符串 "0" 解析）
- Integration: CLI 批量模式通过 FileRepository 保存 IR + 构建 filetree

**Verification:**
- `pytest tests/test_repository.py` 通过
- FileRepository 产出的 `_filetree.json` 与现有结构等价
- CLI 批量模式使用 `repository.save_ir()` 替代直接写入

---

- [ ] **Unit U9: 全量 9000+ 文件对等验证**

**Goal:** 对全量 9000+ 文件运行 Python 提取，逐文件与 JS 版 IR 比对，产出一致性报告。

**Requirements:** R3, R7

**Dependencies:** U4（完整提取管道 real）、U6（CLI）、U7（可观测性）、U11（Repository）

**Files:**
- Create: `tests/test_parity.py`
- Create: `scripts/compare_ir.py`（Python 比对脚本）
- Create: `scripts/gen_js_ir.sh`（JS 批量输出脚本）

**Approach:**
- **JS 侧批量输出**: 运行 `bun run scripts/convert-htm-to-md.js --pipeline ir` 产出 9000+ JSON IR
- **JS 输出修正**: 对 6 个已知 JS bug 涉及的文件，手动修正 JS 输出作为基线
- **Python 侧批量输出**: `bamboo-extract --dir 古籍/ --output-dir output/` 产出 9000+ JSON IR
- **比对逻辑** (compare_ir.py — 差异自动分类脚本):
  - 逐文件加载 JS IR (修正后) 和 Python IR
  - **Pydantic 验证**: 双方均通过 `ContentIR.model_validate()` 验证结构合法性，`ValidationError` 含字段路径
  - R3 对等策略分层匹配:
    - 严格匹配: title, source, docType, author, dynasty, chapters[].title, sections[].type
    - 内容匹配: sections[].content, annotations[].text, navItems[].label（去除首尾空白后比较）
    - 结构匹配: chapters/sections/navItems 数量和嵌套层级（允许相邻的一项互换）
  - **差异自动分类**（R13 ParityMismatch）:
    - ✅ 完全匹配 → 计数
    - ℹ️ 空白/顺序差异 → 合理解析差异，不计入不匹配
    - 🔧 Python bug fix → 已知 6 个 JS bug 的修复差异，标注并计入匹配
    - 🐛 Python bug → Python 实现缺陷，需要修复
    - 🐛 JS bug → JS 原有缺陷未在修正基线中覆盖，需要分析
  - 产出一致性报告: 匹配率、不匹配文件列表、差异摘要
- **通过标准**: 严格匹配 100%（不含 bug fix 差异），内容匹配 ≥ 98%
- **容错策略**（R13）:
  - 单文件解析失败 → 记录 FileError，跳过该文件，不阻塞后续
  - 单文件比对异常 → 记录 ParityMismatch，继续下一个
  - 批量中断后恢复 → 读取 checkpoint 文件，从上次完成位置继续
  - Checkpoint 文件格式: `.context/parity-checkpoint.json`，记录已完成文件列表和匹配统计
- **分阶段验证**（分步迭代，逐步扩大）:
  - 第 1 阶段: 经部样本 25 文件 → 验证基础功能，修复差异
  - 第 2 阶段: 史部样本 25 文件 → 验证跨模板兼容，修复差异
  - 第 3 阶段: 子部样本 25 文件 → 验证边界情况，修复差异
  - 第 4 阶段: 集部样本 25 文件 → 验证全部模板覆盖，修复差异
  - 第 5 阶段: 全量 9000+ 扫描 → 产出最终一致性报告
  每个阶段完成后修复所有差异，再进入下一阶段。
- **质量门控**:
  - Templates A-G 各至少 1 个样本通过人类抽样验证
  - 对差异自动分类为 "🐛 Python bug" 的条目进行人工复核
- **可观测性**（R14）:
  - 每 100 文件输出进度（含 rate + ETA）
  - 完成时输出 aggregate 指标
  - 异常退出时产出已完成部分的报告

**Test scenarios:**
- Happy path: 经部 25 个样本 → 100% 严格匹配，≥ 98% 内容匹配
- Happy path: 史部 25 个样本 → 同上
- Happy path: 全部 7 种模板（A-G）各至少一个样本通过
- Edge case: catalog 页面 → navItems 结构等价
- Edge case: 含 end-marker → colophon 正确归集

**Verification:**
- `pytest tests/test_parity.py` 对样本文件报告匹配率 ≥ 98%
- 全量 9000+ 扫描后产出一致性报告
- 差异分析明确分类（Python bug / JS bug / 合理解析差异）

---

## Unit 依赖图

```
无依赖 (可并行开始):
├── U1: 项目骨架 + CLI 基础
│   └── 完成后即可运行 dummy extract() → 产出最小合法 IR
├── U8: Exporter + NLP 接口定义（纯协议，不阻塞核心路径）

U1 完成后 → U2(dummy) → U3(dummy) → U4(dummy):
└── 全流程首次跑通（所有 Pass dummy，产出最小 IR）
    ↓
├── U2(real): Territory + DOM 索引 + normalize 真实实现
├── U3(real): 规则表 + Pass 1-3 真实实现
├── U4(real): Pass 4-10 + 文本装配器 真实实现
├── U6: CLI 完整实现（dummy extract() 即可开始）
├── U7: 显式扩展点 + Protocol 定义 + 可观测性
├── U10: catalog.py
├── U11: Repository 抽象层 + FileRepository
└── U9: 全量验证（需 U4(real) + U6 + U7）
```

推荐执行顺序:
1. **U1** → 骨架 + CLI 基础
2. **U2(dummy) + U3(dummy) + U4(dummy)** → 全流程首次跑通（可并行，因为都返回空/None）
3. **U2(real) → U3(real) → U4(real)** → 逐步替换为真实实现
4. **U6** → CLI 完整实现（可用 dummy extract() 验证）
5. **U7** → 显式扩展点 + Protocol 定义 + 可观测性
6. **U8 + U10 + U11** → 协议 + catalog + Repository（可并行）
7. **U9** → 全量对等验证（最后执行，依赖所有 real 实现）

## System-Wide Impact

- **Interaction graph**: `extract()` 是公共 API，被 CLI 和外部消费者调用。签名 `extract(html, source_path, catalog_dict=None, *, ai_fallback=None, book_profile=None, nlp_plugin=None)` 向后兼容（所有扩展点参数默认 None）
- **Error propagation**: 无法分类的内容降级为 `main-text`（容错策略），不抛出异常。Pass 级异常产出空结果但不中断管道（R13）
- **State lifecycle**: Territory 实例 per-file 创建/销毁，不跨文件持久化
- **API surface parity**: Python `extract()` 输入输出与 JS `extractContent()` 等价（HTML 字符串 → ContentIR dict）
- **Unchanged invariants**: IR schema 不变。JS 版行为不受影响（Python 完全独立）。**但 Python 将修复 JS 版的已知缺陷**（pass2Metadata 过度认领、escapeYaml 不完整等），因此在这些特定场景下 Python 输出会与 JS 版**不一致**——这是有意为之的正确行为修复，差异需在 U9 报告中标注为 "Python bug fix"
- **Observability**: CLI 批量模式输出 per-file 指标、进度报告、aggregate 汇总。`--debug` 模式产出完整调试快照（R14）
- **Python 模块**: 完全独立，不导入 JS 模块，不依赖 Astro 项目结构

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| selectolax 对 FrontPage 4.0 非标准 HTML 容错不足 | Low | Medium | normalize.py 增加预处理；Modest 引擎对 HTML 4 兼容性良好 |
| normalize_html / flattenTables 移植复杂度高（JS 版 ~200 行） | Medium | High | 独立单元实现；首版保守，后续优化 |
| Python DOM 节点引用模型与 cheerio 不同 | Low | Medium | 用 ID-based claimed set，避免节点身份不一致 |
| 首期 scope 膨胀（同时实现 AI 调用） | Low | High | 严格限制 PC1 = 完整对等 + dummy；AI 不实际调用 LLM |
| 跨语言一致性匹配率 < 98% | Medium | High | R3 对等策略逐差异分析；以修正后 JS 行为为基线；差异自动分类脚本 |
| rules.py 与 JS CLASSIFICATION_RULES 未来不同步 | Medium | Medium | 首期手动等价；后续考虑共享 YAML/JSON 生成 |
| 9000+ 批量验证脚本的容错和性能 | Medium | Medium | 分经史子集四阶段 checkpoint；差异自动分类脚本；单文件失败不阻塞；R14 进度报告 + aggregate 指标 |
| assemble_results 递归模型复杂度 | Medium | High | JS 版使用递归 processElement 遍历 DOM 树；Python 必须复制此模型；深嵌套 DOM 可 iterative stack 替代 |
| 扩展架构过度设计风险 | Low | Medium | 首期使用显式扩展点参数（非注册机制），PC2+ 按需扩展 |
| 单文件崩溃导致 9000+ 批量中断 | Low | High | R13 六级错误分类 + 单文件容错；Pass 级容错（单 Pass 失败不中断后续） |
| 无可观测性导致问题排查困难 | Medium | High | R14 per-file 指标 + 进度报告 + --debug 模式（核心层）；批量运行全程可见 |

### Rollback Criteria

Python 模块达成后，JS 版退役，不回退。质量门控作为发布条件而非回滚条件：
- **发布条件**: 严格匹配 100%（不含 bug fix 差异）且内容匹配 ≥ 98%，至少 2 本书的人类抽检通过，`bamboo-extract --dir` 可替代 `bun run convert`
- **未达标处理**: 逐差异分析（Python bug / JS bug / 合理解析差异），修复后重新验证
- **切换触发**: 发布条件全部满足后，`bun run convert` 入口替换为 `bamboo-extract --dir`，JS 版退役

### Known JS Bugs to Avoid（Python 实现时需修复）

| Bug | JS Location | Severity | Python Action |
|-----|-------------|----------|---------------|
| pass2Metadata 过度认领：`claimSubtree(parent)` 当 metadata 文本节点位于大容器内时，会认领整个内容容器，导致正文丢失 | `extractors.mjs:375` | P1 | Python pass2 使用 `claim_leaf` 仅认领匹配文本节点，不认领父容器 |
| Pattern cache 只写不读：`analyzeAndCache` 缓存了模式但 `processNode` 从不消费，造成性能假象 | `extractors.mjs:1232-1234` | P2 | Python 不实现 pattern cache，或实现完整的读写消费逻辑 |
| `isInCenteredContext` 缺少 CSS `text-align: center` 检测，与 `detectStructure` 不一致 | `extractors.mjs:270` | P2 | Python `is_centered_context` 同时检查 `data-center` 属性和 CSS `text-align` |
| METADATA_RE 正则要求闭合分隔符，元数据在字符串末尾时匹配失败 | `extractors.mjs:358` | P2 | Python METADATA_RE 将闭合分隔符改为可选（`[）)\s]?`），支持末尾无分隔符 |
| ~~escapeYaml 未转义反斜杠~~ — ~~含反斜杠的标题/作者会产出无效 YAML frontmatter~~ | ~~`renderers.mjs:143`~~ | ~~P3~~ | ~~已修复：当前 renderers.mjs 已包含 `.replace(/\\\\/g, '\\\\\\\\')`。PC2+ 实现时直接复制当前行为~~ |
| ~~escapeMarkdown 未转义反引号~~ | ~~`renderers.mjs:152`~~ | ~~P3~~ | ~~已修复：当前 renderers.mjs 已包含 `.replace(/`/g, '\\`')`。PC2+ 实现时直接复制当前行为~~ |

### Known JS Testing Gaps（Python 测试需覆盖）

| Gap | Impact | Python Action |
|-----|--------|---------------|
| JS 仅测试 Templates F 和 G，Templates A-E 零覆盖 | 5 种模板变体无回归保护 | Python 测试必须覆盖全部 7 种模板（A-G） |
| `extractByRules` 'leaf' 认领模式零覆盖 | leaf vs subtree 语义差异无法察觉 | U3 测试包含 leaf 和 subtree 两种模式 |
| `pass3ChapterTitle` class=section 策略零覆盖 | section 类章节标题无法提取 | U3 测试补充 class=section 用例 |
| `flattenTables` 无独立单元测试 | 表格扁平化是 FrontPage 4.0 关键预处理 | U2 normalize.py 测试包含 flattenTables 专项 |
| METADATA_RE 假阳性无负面测试 | 非元数据内容可能被误识别 | U3 测试添加 `(天·地人)` 等反例 |

## Documentation / Operational Notes

- Python 虚拟环境: 项目根目录 `.venv/`，已加入 `.gitignore`
- `.pipeline-cache/` 目录加入 `.gitignore`
- `src/bamboo_extract/` 模块位于当前仓库 `src/` 下，后续可移出为独立包
- U9 验证完成后，learnings 写入 `docs/solutions/`
- 本计划完成后，Python 模块独立承担生产任务（PC3），JS 版退役
- `--debug` 模式产出的 `output.debug.json` 不纳入 git 追踪
- 批量验证的 aggregate 指标报告存入 `docs/solutions/` 供后续参考

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-12-002-python-extraction-module.md](docs/brainstorms/2026-04-12-002-python-extraction-module.md)
- **JS extractors:** `scripts/lib/extractors.mjs`
- **JS renderers:** `scripts/lib/renderers.mjs`
- **JS pattern cache:** `scripts/lib/pattern-cache.mjs`
- **JS CLI:** `scripts/convert-htm-to-md.js`
- **JS tests:** `tests/content-extractor.test.ts`
- **Existing plan:** [docs/plans/2026-04-12-004-feat-extraction-pipeline-optimization-python-poc-plan.md](docs/plans/2026-04-12-004-feat-extraction-pipeline-optimization-python-poc-plan.md)
