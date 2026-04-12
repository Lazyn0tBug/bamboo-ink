---
title: 'feat: Python 古籍提取模块 — 对等实现、原生 AI 就绪'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-001-extraction-pipeline-optimization.md
---

# feat: Python 古籍提取模块

## Overview

用现代 Python 3.12+ 构建独立的古籍内容提取模块，首期完整实现与 JS 版对等的全部提取能力（HTML → JSON IR），设计上原生预留 AI Fallback 和 Book Profile 接口，为后续替换 JS 版做准备。

**对等定义**：对等指对于所有需求，Python 模块都能获得与 JS 版一致的结果。不要求逐字段、逐函数、逐模块等价。

**战略定位**：JS 版编码任务已完成（A1-A6 + B1），当前作为 Python 的对等开发参考（对照基准）。此功能后续由 Python 模块独立承担，JS 版不再维护。

## Evolution Path

```
PC1 (首期, v0.1)          PC2 (v0.2+)              PC3 (v0.3+)
────────────────────  →   ────────────────────  →  ────────────────────
完整对等实现                AI 能力激活              替代 JS 版
Pass 1-10 + assemble      Book Profile + AI Fallback  独立生产
CLI + 全量 9000+ 验证      实际 LLM 集成              退役 JS 版
```

**PC1 目标**: 实现与 JS 版对等的完整提取管道（Pass 1-10 + assembleResults），覆盖全部 9000+ 文件。AI 相关功能完成接口设计，首期作为 dummy 存在。

**PC2 目标**: 激活 AI 能力——接入实际 LLM 实现 AI Fallback、Book Profile 质量评估、AI 验证层抽检。

**PC3 目标**: Python 模块独立承担生产任务，JS 版退役。

## Requirements

| ID   | Requirement                                              | PC   |
| ---- | -------------------------------------------------------- | ---- |
| R1   | Python 3.12+ 现代模块结构，pyproject.toml 管理           | 1    |
| R2   | 核心提取 API：`extract(html, source_path) → ContentIR`   | 1    |
| R3   | 输出 IR 与 JS 版对等（所有需求结果一致，见对等策略）     | 1    |
| R4   | CLI 入口：`bamboo-extract input.html --output output.json` | 1  |
| R5   | 支持 catalog 和 content 两种 docType 自动检测            | 1    |
| R6   | 规则表驱动，与 JS 版 `CLASSIFICATION_RULES` 同一套逻辑   | 1    |
| R7   | 全量 9000+ 文件验证覆盖（开发中按经史子集四类选取样本迭代） | 1 |
| R8   | 领地式 Pass 架构（Pass 1-10 + assembleResults）          | 1    |
| R9   | AI Fallback 接口设计 + Book Profile 系统（首期 dummy）   | 1    |
| R10  | `Exporter` 抽象协议设计（首期不实现具体导出器）          | 1    |
| R11  | 独立虚拟环境，不依赖 JS/Astro 项目结构                   | 1    |
| R12  | 完整的 pytest 测试套件，fixture 与 JS 测试对齐           | 1    |
| R13  | 完整的错误分类、容错和恢复策略                          | 1    |
| R14  | 完整的可观测性设计（日志、度量、调试支持）              | 1    |
| R15  | 完整的数据流程设计（从源文件到 JSON IR 的数据流向）     | 1    |
| R16  | 完整的技术规范（解析器约束、选择器兼容、类型约束、DOM 操作边界） | 1 |

### R3 对等策略

对等指所有需求结果一致，而非字面逐字节等价：

| 层级 | 字段 | 匹配要求 | 说明 |
|------|------|----------|------|
| **严格匹配** | `title`, `source`, `docType`, `author`, `dynasty` | 字符串完全一致 | 元数据字段 |
| **严格匹配** | `chapters[].title`, `sections[].type` | 字符串完全一致 | 结构标识 |
| **内容匹配** | `sections[].content`, `annotations[].text`, `navItems[].label` | 去除首尾空白后一致 | 允许解析器空白差异 |
| **结构匹配** | `chapters[]`, `sections[]`, `navItems[]` 的数量和嵌套层级 | 数量一致，顺序允许相邻两项互换 | 允许 DOM 遍历顺序的合理解析差异 |
| **允许差异** | JSON 文件格式（缩进、ensure_ascii） | 由编码规范统一（见 R4） | 不影响对等 |

**"合理解析差异"判定**：与 JS 版行为一致即为可辩护。当 Python 和 JS 对同一 HTML 文件产生差异时，以 JS 版行为为参考基准——如果 JS 版输出本身存在某种处理结果，Python 版产出等价结果即为合格。

### R4 CLI JSON 编码规范

```python
json.dumps(ir, indent=2, ensure_ascii=False)  # 2 空格缩进，保留中文字符
```

与 JS 版 `JSON.stringify(ir, null, 2)` 行为一致。

**序列化容错**：使用自定义 encoder 兜底，任何非 JSON 可序列化类型转为字符串：
```python
class IREncoder(json.JSONEncoder):
    def default(self, obj):
        return str(obj)
```

### R7 验证策略

| 维度 | 定义 |
|------|------|
| 目标覆盖 | **全部 9000+ 文件** |
| 开发迭代 | 按经部、史部、子部、集部四类自行选取代表性样本，在开发过程中持续减少重复工作 |
| 通过标准 | 按 R3 对等策略分层匹配，严格匹配字段 100% 一致，内容匹配字段 ≥ 98% 一致 |
| 差异处理 | 逐差异分析：Python bug / JS bug / 合理解析差异 |

### R8 Pass 范围说明

Python 实现**完整 Pass 1-10 + assembleResults**，与 JS 版 `extractContent()` 全量等价：

- **Pass 1-3**: book-title, metadata, chapter-title 认领（与 JS 版等价）
- **Pass 4**: annotation 收集
- **Pass 5**: section-summary 检测（在文本装配器中执行）
- **Pass 6**: end-marker 检测（在文本装配器中执行）
- **Pass 7**: colophon 检测（end-marker 之后，在文本装配器中执行）
- **Pass 8**: nav-item 收集
- **Pass 9**: main-text 收集（`extractRemaining()`）
- **Pass 10**: 质量评估 + Book Profile 分析（首期 dummy，含 `_aiFallback` 字段占位）

Pass 1-3 的 claimed 状态在 Python 内部通过同一 `Territory` 实例共享，Pass 4-10 读取 Pass 1-3 产生的 claimed 集。

### R9 AI 原生设计（分步实施）

Python 模块**原生具备 AI 能力**，分步实施：

#### R9-A1: AI Fallback 接口设计

当规则引擎产出质量低于阈值时，触发 AI Fallback：

```python
class AIFallback(Protocol):
    def should_fallback(self, quality: QualityScore) -> bool: ...
    def fallback_extract(self, html: str) -> ContentIR: ...

class QualityScore(TypedDict):
    chapters_count: int
    annotations_count: int
    has_single_chapter_capturing_all: bool
    deviates_from_book_profile: bool
```

**触发条件**（与 JS 版 Layer 2 设计等价）：
- 0 chapters（文件明显有章节结构）
- 0 annotations（文件有明显注疏标记）
- 单章节包含全部内容（规则未生效的信号）
- 提取内容显著低于同书平均（Book Profile 比较）

**首期 dummy 实现**：`should_fallback` 始终返回 `False`，`fallback_extract` 返回空 IR 或抛出 `NotImplementedError`。

#### R9-A2: Book Profile 系统

利用「同一本书的所有内容文件共享同一套 FrontPage 模板」这一不变性：

```python
class BookProfile(TypedDict):
    chapter_colors: list[str]       # 该文件实际使用的章节颜色
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

**首期 dummy 实现**：`BookProfileStore` 返回 `None`（无缓存 Profile），Pass 10 仅预留 `_aiFallback` 字段，不执行实际评估。

**Book Profile 缓存策略建议**：
- 首期（PC1）：仅定义接口，dummy 返回 `None`，无缓存风险
- PC2 激活时：采用多文件聚合 Profile（非单文件），避免首文件噪声污染；引入源文件 hash 校验，源文件变化时自动重建；Profile 质量评分低于阈值时标记不可信
- 缓存位置：`.pipeline-cache/profiles/<book_id>.json`，不纳入 git 追踪

### R10 导出器协议（分步实施）

#### R10-A1: 定义协议和枚举

```python
class ExportFormat(Enum):
    JSON_IR = "json"
    HTML5 = "html5"
    MARKDOWN = "markdown"
    # Future: TEI_XML = "tei-xml"
    # Future: IIIF = "iiif"
    # Future: CSV = "csv"

class Exporter(Protocol):
    def export(self, ir: ContentIR, fmt: ExportFormat) -> str: ...
```

**首期仅定义协议，不实现具体导出器**。JSON 输出由 CLI 直接通过 `json.dumps` 完成。HTML5/Markdown 导出延至 PC2 或后续版本。

#### R10-A2: 实现 HTML5/Markdown 导出器（PC2+）

- HTML5 导出器：从 JSON IR 重建可阅读的 HTML5 页面
- Markdown 导出器：从 JSON IR 生成 Markdown 文档

### R15 数据流程设计

从单一数据源（FrontPage 4.0 HTML）到最终输出物（JSON IR）的完整数据流。本节从业务层面阐述数据的流向、形态转换和处理逻辑，帮助建立完整的系统概念，并指导后期的问题定位和处理。

#### R15-A1: 数据流全景（七阶段）

```
FrontPage 4.0 HTML ──→ 干净 HTML ──→ DOM 索引 ──→ 认领结果 ──→ 文本区域 ──→ 章节结构 ──→ JSON IR
  (原始源)              (normalize)   (index)      (Pass 1-4,8)  (Pass 9)     (assemble)    (输出)
```

每个阶段的数据形态和产出如下：

| 阶段 | 输入数据 | 处理逻辑 | 输出数据 | 数据损失点 |
|------|---------|---------|---------|-----------|
| **1. Normalize** | 原始 HTML 字符串（含 `<center>`、嵌套表格、空标签、`<font>` 标签） | `<center>` → `<div data-center>`，表格扁平化，空标签剔除 | 干净 HTML 字符串 | `<center>` 标签语义丢失（转为 `data-center` 属性）；`<table>` 结构被扁平化为 `<div>` 链 |
| **2. Index** | 干净 HTML 字符串 | selectolax 解析，构建 by_color/by_class/by_tag/by_size 索引 + NodeProxy 代理 | DOMIndex（字典结构）+ HtmlTree（只读树） | 无数据损失；NodeProxy 仅捕获快照属性，不包含树的完整关系 |
| **3. Catalog Detect** | DOMIndex + HtmlTree | 统计 linkCount 和 bodyText 长度 | docType: "catalog" 或 "content" | 误判风险：内容密集但链接多的页面可能被误判为 catalog |
| **4. Territory Pass 1-4,8** | DOMIndex + HtmlTree + Territory（空 claimed set） | 按优先级认领节点：book-title → metadata → chapter-title → annotation → nav-item | Territory（claimed set 填充）+ 各 Pass 中间结果 | 误认领不可逆：Pass 1 误领的节点在后续 Pass 中永久不可见 |
| **5. Extract Remaining** | DOMIndex.all_text_nodes + Territory.claimed | 过滤已认领节点和已认领祖先的节点 | TextRegion 列表（DOM 序） | 被误认领的文本节点不会出现在 TextRegion 中 |
| **6. Assemble** | TextRegion 列表 + annotations + chapter_title_regions | 递归 DOM 遍历 + 状态机：检测章节标题、章节摘要、结束标记、佚文，累积文本并切分章节 | ContentIR.chapters[]（in-place 填充） | clone-and-strip 过程中的文本提取可能丢失嵌套结构中的文本 |
| **7. Serialize** | ContentIR 字典 | JSON 编码 | JSON 字符串文件 | `_aiFallback` 等可选字段在不为空时才序列化 |

#### R15-A2: 数据不变性（Invariants）

以下不变性贯穿整个数据流，可用于问题检测和处理：

| 不变性 | 说明 | 违反后果 |
|--------|------|---------|
| **文本总量守恒** | 原始 HTML 的文本内容总量 ≥ 最终 IR 中所有 section.content 的文本总量 | 如果 IR 文本量 > 原始 HTML，说明有重复；如果差距过大（>30%），说明有数据丢失 |
| **认领互斥** | 同一节点 ID 只能被一个 Pass 认领，不可重复认领 | 重复认领意味着领地模型 bug |
| **章节有序** | chapters[] 按 DOM 中出现顺序排列 | 乱序意味着 assemble 状态机有问题 |
| **Annotation 关联** | 每个 annotation 必须关联到某个 main-text section | 孤立 annotation 说明装配器消费游标有误 |
| **DocType 互斥** | 一个文件只能是 catalog 或 content，不能同时包含 navItems 和 chapters | 同时存在说明 catalog 检测失败 |

#### R15-A3: 数据流错误映射

当最终输出出现问题时，可通过数据流反向定位问题阶段：

| 输出问题 | 可能的问题阶段 | 排查方法 |
|---------|--------------|---------|
| 书名错误/缺失 | Stage 4 (Pass 1) | 检查 Pass 1 匹配的规则和节点 |
| 朝代/作者错误 | Stage 4 (Pass 2) | 检查 METADATA_RE 匹配和 claim_leaf 行为 |
| 章节划分错误 | Stage 4 (Pass 3) 或 Stage 6 (assemble) | 检查 chapter-title 认领 vs 装配器章节切分 |
| 注疏缺失 | Stage 4 (Pass 4) 或 Stage 6 (annotation 关联) | 检查 Pass 4 认领范围 + assemble 游标消费 |
| 正文缺失 | Stage 5 (extract_remaining) 或 Stage 6 (clone-and-strip) | 检查是否有节点被误认领 + clone 过程是否丢失文本 |
| 注疏文本混入正文 | Stage 6 (clone-and-strip) | assemble 未正确剥离已认领的 annotation 节点 |
| 导航项缺失 | Stage 4 (Pass 8) | 检查 menu/list-context 匹配 |

### R16 技术规范

本节定义实现必须遵守的技术约束。之前很多问题源于技术规范不明确——解析器能力、选择器兼容性、DOM 操作边界等必须在编码前定义清楚。

#### R16-A1: 解析器能力约束

**selectolax 解析能力**：

| 能力 | 支持情况 | 说明 |
|------|---------|------|
| HTML 解析 | ✅ 支持 | 基于 Modest (lexbor) 引擎，自动修复 malformed HTML |
| CSS 选择器 | ✅ CSS3 标准 | 支持 `.class`、`#id`、`[attr]`、`[attr=val]`、`tag.class`、组合器 `>` ` ` `+` `~` |
| CSS 选择器扩展 | ❌ 不支持 | jQuery 扩展（`:contains`、`:has`、`:eq`、`:first`）不可用 |
| DOM 读取 | ✅ 支持 | `text_content`、`tag`、`attrs`、`parent`、`children`、`next`、`prev` |
| DOM 写入-属性修改 | ✅ 支持 | `node.attrs['key'] = 'val'` |
| DOM 写入-标签替换 | ⚠️ 有限 | `replace_with()` 接受单个 Node 或文本字符串，不接受 Node 列表 |
| DOM 写入-元素创建 | ⚠️ 间接 | 无 `createElement` API，需通过解析 HTML 片段获取新节点 |
| DOM 写入-unwrap | ✅ 支持 | `node.unwrap()` 移除当前节点、保留子节点 |
| DOM 写入-html setter | ❌ 不支持 | `node.html` 为 getter-only，不可设置 |
| 节点克隆 | ✅ 支持 | `node deepcopy` 可克隆节点树 |
| 节点身份 | ⚠️ 不稳定 | 树修改后原有节点引用可能失效（invalidated） |

**flattenTables 的 selectolax 实现策略**：

由于 selectolax 不支持元素创建和 html setter，flattenTables 采用以下策略：
- `<td>` → 使用 `unwrap()` 保留内容，在内容前后插入文本标记（如 `\n`）模拟 div 分隔
- 或使用**字符串预处理**：在 selectolax 解析前，用正则将 `<td[^>]*>` 替换为 `<div class="table-cell">`，`</td>` 替换为 `</div>`——这是 JS 版 cheerio 方案的等效替代，且因为发生在解析前，不存在 DOM 身份失效问题
- 嵌套表格：递归正则替换，先处理最内层 `<td>`

#### R16-A2: CSS 选择器兼容性映射

JS 版 cheerio 使用的选择器 vs Python selectolax 等价选择器：

| JS cheerio 选择器 | 用途 | selectolax 等价 | 兼容性 |
|-------------------|------|-----------------|--------|
| `.article` | book-title class 匹配 | `.article` | ✅ 完全等价 |
| `.metadata` | metadata class 匹配 | `.metadata` | ✅ 完全等价 |
| `.chapter`, `.section` | chapter class 匹配 | `.chapter`, `.section` | ✅ 完全等价 |
| `.annotation` | annotation class 匹配 | `.annotation` | ✅ 完全等价 |
| `[style*="COLOR: #FF6666"]` | 内联样式匹配 | `[style*="COLOR: #FF6666"]` | ✅ 等价（大小写敏感） |
| `font[size="5"]` | font 字号匹配 | `font[size="5"]` | ✅ 等价 |
| `[data-center]` | 居中属性 | `[data-center]` | ✅ 等价 |
| `body > div.swy1` | 直接子代 | `body > div.swy1` | ✅ 等价 |
| `a[href]` | 带 href 的链接 | `a[href]` | ✅ 等价 |
| `:contains(text)` | 包含文本 | ❌ 不支持 → 用 `.filter()` 手动过滤 | ⚠️ 需代码适配 |
| `ol > li > a` | 列表嵌套 | `ol > li > a` | ✅ 等价 |

#### R16-A3: 颜色规范化

FrontPage 4.0 HTML 中的颜色可能有多种写法，必须在 build_dom_index 时统一：

| 输入形式 | 规范化输出 | 说明 |
|---------|-----------|------|
| `#F66` | `#FF6666` | 缩写展开为大写 6 位 |
| `#f66` | `#FF6666` | 小写缩写同样展开 |
| `#ff6666` | `#FF6666` | 小写全写转大写 |
| `#FF6666` | `#FF6666` | 已规范，无需转换 |
| `red`（命名颜色） | 不展开（按需转换） | FrontPage HTML 中极少使用命名颜色 |

**颜色匹配规则**：所有 Pass 函数使用大写 `#RRGGBB` 键查询 `by_color` 索引。

#### R16-A4: Territory 认领语义

| 操作 | 语义 | 副作用 |
|------|------|--------|
| `claim_leaf(node_id)` | 标记单个节点为已认领 | 仅该节点 ID 加入 claimed set |
| `claim_subtree(node_id, descendants)` | 标记节点及其所有后代为已认领 | 节点 ID + 所有后代 ID 加入 claimed set |
| `is_claimed(node_id)` | 查询节点是否被认领 | 无副作用 |
| `has_claimed_ancestor(node_id)` | 查询节点是否有已认领的祖先 | 无副作用；需遍历 parent_map |

**关键约束**：
- 认领是**幂等**的：对已认领节点重复认领无额外效果
- 认领是**不可逆**的：一旦认领，后续 Pass 无法再访问
- Pass 顺序决定认领优先级：Pass 1 先于 Pass 2，Pass 2 先于 Pass 3，依此类推
- `descendants` 列表由调用方在 `build_dom_index` 阶段预计算，或 Pass 函数实时遍历

#### R16-A5: 类型约束

| 类型 | 约束 | 说明 |
|------|------|------|
| `ContentIR.title` | `str`, 非空, 默认 `"Untitled"` | 未匹配书名时固定为 "Untitled" |
| `ContentIR.source` | `str`, 相对路径 | 使用源文件相对于 `古籍/` 的路径 |
| `ContentIR.docType` | `"content" \| "catalog"` | 枚举，不可为其他值 |
| `Section.type` | `"main-text" \| "inline-annotation" \| "section-summary" \| "colophon"` | 枚举，不可为其他值 |
| `Chapter.title` | `str`, 首个 chapter 可为 `""`（preamble） | 非首个 chapter 的 title 不应为空 |
| `Section.content` | `str`, 可为空字符串 | 空 content 的 section 应被剔除 |
| `NavItem.href` | `str`, 非空 | 空 href 的链接不应纳入 navItems |
| `NavItem.label` | `str`, 去除首尾空白 | |

#### R16-A6: 递归深度约束

`assemble_results` 使用递归 DOM 遍历模型。CPython 默认递归限制约 1000 层。

- **预期最大 DOM 深度**：FrontPage 4.0 HTML 中实测最深约 50-80 层（嵌套 table > tbody > tr > td > div > font > span）
- **安全裕度**：80 层 << 1000 层，递归模型安全
- **防御措施**：在 `assemble_results` 入口处用 `sys.setrecursionlimit(2000)` 提升限制，防止极端文件
- **兜底**：如果 RecursionError 发生，记录 ParseError 并产出空 IR

## IR Schema (Contract)

IR schema 以 **JSON Schema** 为单一事实源，同时作为 JS 和 Python 的类型约束。Python 端通过 TypedDict 实现等价约束。

```python
class ContentIR(TypedDict):
    title: str
    source: str
    author: str         # 作者，catalog 页从 metadata 提取
    dynasty: str        # 朝代，catalog 页从 metadata 提取
    docType: Literal["content", "catalog"]
    chapters: list[Chapter]
    navItems: list[NavItem]
    _aiFallback: str    # optional, Pass 10 占位，首期固定为 "none"

class Chapter(TypedDict):
    title: str
    sections: list[Section]

class Section(TypedDict):
    type: Literal["main-text", "inline-annotation", "section-summary", "colophon"]
    content: str
    annotations: list[Annotation]  # optional

class Annotation(TypedDict):
    text: str

class NavItem(TypedDict):
    href: str
    label: str

class Entity(TypedDict):
    """NLP 实体识别结果（AI 能力预留）"""
    entity_type: str    # 如: "person", "place", "book", "dynasty", "term"
    text: str
    start: int
    end: int
```

## NLP Plugin Protocol（AI 能力预留，分步实施）

### R9-A3: 定义协议 + NoOpNLP dummy

```python
class NLPPlugin(Protocol):
    def segment(self, text: str) -> list[str]: ...
    def recognize_entities(self, text: str) -> list[Entity]: ...
    def punctuate(self, text: str) -> str: ...
```

**首期 dummy 实现**：`NoOpNLP` — `segment` 返回 `[text]`，`recognize_entities` 返回 `[]`，`punctuate` 返回 `text`。

### R9-A4: 接入实际 NLP 工具（PC2+）

- 分词：jieba 或 pkuseg
- 实体识别：接入 LLM 或轻量 NER 模型
- 断句/标点：用于无标点古籍文本

## Module Structure

```
src/bamboo_extract/
├── __init__.py          # Public API: extract(html, source_path) → ContentIR
├── territory.py         # Territory class: claim_leaf, claim_subtree, is_claimed, ...
├── normalize.py         # normalize_html, flattenTables (HTML 4 预处理)
├── rules.py             # CLASSIFICATION_RULES — same logic as JS version
├── extractors.py        # build_dom_index, Pass 1-3 编排
├── passes.py            # Pass 4-10 + assemble_results 文本装配器
├── ai_fallback.py       # AIFallback protocol + BookProfile + dummy 实现
├── nlp.py               # NLPPlugin protocol + NoOpNLP dummy
├── export.py            # Exporter protocol + ExportFormat enum（首期不实现具体导出器）
├── types.py             # ContentIR, Chapter, Section, Entity TypedDict 定义
├── cli.py               # argparse CLI: bamboo-extract input.html --output output.json
└── catalog.py           # build_catalog_dict, lookup_catalog_meta（等价 JS catalogDict）

tests/
├── test_extractors.py   # Unit tests (fixtures from JS tests)
├── test_parity.py       # Cross-language parity: JS IR vs Python IR
├── test_rules.py        # Rule table behavior
├── test_cli.py          # CLI integration tests
├── test_normalize.py    # normalize_html / flattenTables 专项测试
└── test_ai_fallback.py  # AI Fallback + Book Profile dummy 测试

pyproject.toml           # Project metadata + dependencies: selectolax, cssselect
```

**模块拆分原则**：遵循单一职责。`extractors.py` 仅负责 Pass 1-3 编排和 DOM 索引构建；`passes.py` 负责 Pass 4-10 和结果装配；AI 相关能力独立为 `ai_fallback.py`。

## Non-Goals

- **不是 JS 的直接翻译**：Python 模块有自己的设计哲学和 API 风格
- **不是微服务**：首期是本地库 + CLI，不涉及 HTTP/gRPC
- **不包含 AI/LLM 调用**：AI Fallback 和 Book Profile 仅完成接口设计和 dummy 实现，首期不调用实际 LLM
- **不改变 JS 前端行为**：JS 渲染层（Astro 组件、页面布局）不受影响

## Success Criteria

1. `bamboo-extract input.html --output output.json` 对全量 9000+ 文件产出与 JS 版按 R3/R7 对等策略一致的 IR（严格字段 100%，内容字段 ≥ 98%）
2. `pytest tests/` 全部通过，单元测试覆盖率 ≥ 80%（不含集成测试）
3. AI Fallback 接口 + Book Profile 接口已完成设计且有 dummy 实现
4. Exporter 协议已定义（首期不实现具体导出器）
5. 模块可独立 `pip install -e .` 并使用
6. 不依赖 Astro 项目结构
7. 错误分类体系完整（R13）：Fatal/FileError/ParseError/ExtractError/QualityWarning/ParityMismatch 六类错误均有对应行为和输出
8. 可观测性完整（R14）：批量模式有进度报告、per-file 指标、aggregate 汇总、`--debug` 单文件调试支持
9. 单文件失败不阻塞其他文件，Fatal 错误有清晰的退出码和错误报告
10. 数据流程完整定义（R15）：七阶段数据流（normalize → index → catalog → territory → extract → assemble → serialize）清晰定义，数据不变性可验证
11. 技术规范完整（R16）：解析器能力约束、CSS 选择器兼容性映射、颜色规范化、Territory 认领语义、类型约束、递归深度约束均有明确定义

## Dependencies

| Unit | Depends on | Notes |
|------| ----------- | ----- |
| PC1 (首期实现) | JS 版 A6 完成（领地式 Pass 4-9 稳定） | JS 版编码任务已全部完成，作为对照基准 |
| PC2 (AI 激活) | PC1 完成 + LLM API 接入 | 需要实际可用的 LLM 服务 |

### 编码处理

源文件 9000+ 中仅 2 个文件非 UTF-8，手动处理即可，不纳入模块设计。

### Python 模块治理

- 首期：`pyproject.toml` 管理，与当前仓库共存
- 后续选项：(A) 移出仓库作为独立 Python 包发布；(B) 保留为子模块，通过 `pip install -e` 引用
- 测试：pytest，CI 初步通过 `pyproject.toml` + GitHub Actions 实现

### R2 API 补充：catalogDict 注入

`extract(html, source_path)` 签名扩展为 `extract(html, source_path, catalog_dict=None)`：
- `catalog_dict` 参数对应 JS 版 `options.catalogDict`，用于跨文件元数据注入
- 首期可为 `None`（content 页 author/dynasty 从自身 metadata 提取），后续实现 `build_catalog_dict()` 后补齐

### R13 错误设计

批量处理 9000+ 文件必须有明确的错误分类和容错策略，避免单文件失败阻塞全局。

#### R13-A1: 错误分类体系

| 级别 | 错误类型 | 示例 | 行为 |
|------|---------|------|------|
| **Fatal** | 无法继续运行 | 依赖缺失、配置错误、磁盘满 | 终止整个管道，返回非零退出码 |
| **FileError** | 单文件无法处理 | 文件不存在、编码错误、空文件 | 记录错误，跳过该文件，继续处理下一个 |
| **ParseError** | HTML 解析失败 | 严重 malformed HTML | 记录错误，跳过该文件，产出空 IR |
| **ExtractError** | 提取逻辑异常 | Pass 内部异常、assemble 崩溃 | 记录错误和堆栈，跳过该文件 |
| **QualityWarning** | 产出不符合预期 | 0 chapters（疑似应该有章节）、claim 覆盖率 < 10% | 产出 IR，标记 quality flag = "suspicious" |
| **ParityMismatch** | 对等验证差异 | Python vs JS 输出不一致 | 记录差异详情，分类为 Python bug / JS bug / 合理差异 |

#### R13-A2: 容错策略

- **单文件容错**：任何 FileError/ParseError/ExtractError 不影响其他文件处理
- **Pass 级容错**：单个 Pass 内部异常 → 记录日志，该 Pass 产出为空，后续 Pass 继续执行
- **管道级容错**：Pass 1-3 全部失败（title/author/chapter 均为空）→ 仍产出 IR（仅含 main-text），不中断
- **批量处理退出条件**：Fatal 错误立即退出；FileError 累计超过 10% 时发出警告但不退出；Fatal 累计超过 3 个时退出

#### R13-A3: 错误传播路径

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

#### R13-A4: 错误输出格式

每个错误产出结构化 JSON（供后续分析）：

```python
class ExtractError(TypedDict):
    source: str            # 源文件路径
    error_type: str        # "fatal" | "file" | "parse" | "extract" | "quality"
    stage: str             # "normalize" | "index" | "pass1" | ... | "assemble"
    message: str           # 人类可读描述
    traceback: str | None  # 详细堆栈（--verbose 模式）
    partial_ir: bool       # 是否产出了部分 IR
```

### R14 可观测性设计

9000+ 文件批量处理必须具备完整的运行时可见性——进度、性能、质量三维度可观测。

#### R14-A1: 日志策略

**Log Levels**：

| Level | 用途 | 示例 |
|-------|------|------|
| `ERROR` | 必须干预的错误 | 依赖缺失、文件编码错误、解析崩溃 |
| `WARNING` | 潜在问题但不阻塞 | 0 chapters、claim 覆盖率低、METADATA_RE 假阳性 |
| `INFO` | 关键操作摘要 | 每文件完成摘要（title, docType, chapters, time） |
| `DEBUG` | 调试详情 | 每个 Pass 的匹配节点数、规则触发详情 |

**日志格式**（每行）：
```
[LEVEL] [{source_path}] {message}
```

**默认输出**：INFO 级别，每文件一行摘要
```
[INFO] [经部/大学章句集注/大学章句集注.htm] docType=content title="大学章句集注" chapters=28 annotations=156 time=42ms
```

#### R14-A2: 度量指标

**Per-file 指标**：

```python
class FileMetrics(TypedDict):
    source: str
    doc_type: str
    title: str
    chapters_count: int
    sections_count: int
    annotations_count: int
    nav_items_count: int
    normalize_time_ms: float
    index_time_ms: float
    pass_time_ms: float        # Pass 1-10 总耗时
    assemble_time_ms: float
    total_time_ms: float
    claim_ratio: float         # 认领文本 / 总文本（0.0-1.0）
    quality_flag: str | None   # "suspicious" 或 None
```

**Aggregate 指标**（批量完成后输出）：

| 指标 | 说明 |
|------|------|
| total_files | 总文件数 |
| success_files | 成功处理数 |
| error_files | 失败数（按 error_type 分类） |
| avg_time_ms | 平均单文件耗时 |
| p95_time_ms | P95 单文件耗时 |
| p99_time_ms | P99 单文件耗时 |
| total_time_ms | 总耗时 |
| avg_claim_ratio | 平均认领率 |
| parity_match_rate | 对等匹配率（U9 阶段） |

#### R14-A3: 进度报告

**批量模式进度**：

- 每处理 100 个文件输出一行进度：`[INFO] Progress: 1200/9042 (13.3%) — 327 files/s — ETA: 24m`
- 完成每个 checkpoint（经部/史部/子部/集部）时输出阶段摘要
- 异常退出时产出已完成部分的报告

#### R14-A4: 调试支持

**单文件调试模式**：
```bash
bamboo-extract input.html --output output.json --debug
```
- `--debug` 输出每个 Pass 的匹配详情（规则名、匹配节点数、认领节点 ID）
- 产出 `output.debug.json` 包含完整的 DOMIndex 快照、Territory claimed set、每 Pass 中间结果

**Parity 差异调试**：
```bash
bamboo-extract --diff input.html --js-ir js_output.json --py-ir py_output.json
```
- 逐字段对比 JS/Python IR 差异
- 标注差异类型（Python bug / JS bug / 合理差异）
- 输出差异节点的 DOM 上下文（帮助定位是哪个 Pass 认领出错）

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------| ---------- | ------ | ---------- |
| selectolax 对 FrontPage 4.0 非标准 HTML 容错不足 | Low | Medium | `normalize.py` 增加预处理；selectolax 基于 Modest 引擎，对 HTML 4 兼容性良好；`flattenTables` 在字符串层面预处理 |
| `normalize_html` / `flattenTables` 移植复杂度高（JS 版 ~200 行核心难点） | Medium | High | 作为独立单元 `normalize.py` 实现；首版保守实现，后续优化 |
| Python DOM 节点引用模型与 cheerio 不同 | Low | Medium | Python 用索引 ID 实现 claimed set，避免节点身份不一致 |
| 首期 scope 膨胀（同时实现 AI 调用） | Low | High | 严格限制首期 = 完整对等实现；AI 相关功能仅接口 + dummy |
| 跨语言一致性匹配率 < 98% | Medium | High | 按 R3 对等策略逐差异分析，以 JS 版行为为参考基准 |
| rules.py 与 JS CLASSIFICATION_RULES 未来可能不同步 | Medium | Medium | 首期手动保证等价；后续考虑从共享 YAML/JSON 生成双端规则表 |
| AI Fallback dummy 实现可能误导下游消费者 | Low | Medium | dummy 实现抛出明确 `NotImplementedError`，文档标注首期不可用 |
| Book Profile 缓存污染（首个文件质量差影响同书后续文件） | Low | Medium | PC2 引入 Profile 质量评分 + 源文件 hash 校验，PC1 仅 dummy 不受影响 |
| 单文件崩溃导致 9000+ 批量中断 | Low | High | R13 定义六级错误分类 + 单文件容错，任何非 Fatal 错误不中断管道 |
| 无可观测性导致问题排查困难 | Medium | High | R14 定义 per-file 指标 + 进度报告 + --debug 模式，批量运行全程可见 |
