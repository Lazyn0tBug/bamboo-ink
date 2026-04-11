---
title: "JSON IR 内容管道 — 替代模板正则方案"
date: 2026-04-11
status: draft
origin: user brainstorm during Unit 4 implementation pause
---

# JSON IR 内容管道

## Problem

当前 HTML 规范化管道使用 7 个模板正常器（~800 行正则 + cheerio DOM 遍历），每个模板独立维护，发现新变体需要加新正则。约 11% 的文件被标记为 SKIP 因为不匹配任何模板。

**核心问题**：使用大量正则表达式和函数修改 HTML 标签是低效的维护策略。

## Proposed Solution

从原始 HTML 中**提取内容**而非**修改标签**，使用 JSON 作为统一的中间表示（IR），再从 JSON 生成 Markdown 和 HTML5。

### New Pipeline

```
原始 HTML → 模板检测 → JSON 内容提取(IR) → Markdown / HTML5
```

### JSON IR Schema

每本书一个 JSON 文件，位于 `src/content-ir/`，结构与源文件目录一致。

#### 内容型文件（正文有实质内容）

```json
{
  "title": "大学章句集注",
  "author": "朱熹",
  "dynasty": "宋",
  "source": "经部/大学章句集注.htm",
  "docType": "content",
  "chapters": [
    {
      "title": "大学章句序",
      "sections": [
        {
          "type": "main-text",
          "content": "大学之书，古之大学所以教人之法也。"
        },
        {
          "type": "main-text",
          "content": "大学之道，在明明德，在亲民，在止于至善。",
          "annotations": [
            { "text": "程子曰：亲，当作新。大学者，大人之学也。..." }
          ]
        },
        {
          "type": "main-text",
          "content": "知止而后有定，定而后能静，静而后能安。",
          "annotations": [
            { "text": "后，与后同。止者，所当止之地..." }
          ]
        },
        {
          "type": "section-summary",
          "content": "右传之首章。释明明德。"
        }
      ]
    }
  ]
}
```

#### 目录型文件（仅链接列表）

```json
{
  "title": "列女传",
  "author": "刘向",
  "dynasty": "汉",
  "source": "史部-其他/列女传/index.htm",
  "docType": "catalog",
  "navItems": [
    { "href": "001.htm", "label": "母仪传" },
    { "href": "002.htm", "label": "贤明传" },
    { "href": "003.htm", "label": "仁智传" }
  ]
}
```

## Content Classification System

完整的内容类型体系、识别标准、IR 处理规则和双输出（Markdown + HTML5）映射。

### 内容类型总表

| ID | 类型 | 识别标准（HTML 特征） | IR 处理 |
|----|------|----------------------|--------|
| `book-title` | 书名 | `<FONT SIZE=5|6>` 或 `COLOR="#FF6666"` 居中；或在 `<h1>`/`<h2>` 内 | `title` 字段 |
| `metadata` | 元数据 | 书名后紧跟的作者/朝代文本（如"南宋·吕本中""汉·刘向"） | `author`, `dynasty` 字段 |
| `chapter-title` | 章节标题 | `<CENTER><B><FONT COLOR="#CC33CC">`；或 `<h2>`/`<h3>`/`<h4>` 居中 | `chapters[].title` |
| `main-text` | 正文 | 12pt 字号（`class=swy1` 或无字号约束）；无 `<FONT size=9pt>` 包裹 | `sections[].type: "main-text"` |
| `inline-annotation` | 内嵌注疏 | `<FONT style="FONT-SIZE: 9pt">` 包裹；或颜色 `#551A8B` | `sections[].annotations[]` |
| `section-summary` | 章节总结 | 以"右传之…章"、"右经…章"等开头的独立段落 | `sections[].type: "section-summary"` |
| `colophon` | 文后跋/尾注 | 以"…终"（如"儀 禮 終""仪礼终"）结尾的段落后的所有内容 | `type: "colophon"` 章节 |
| `nav-item` | 目录条目 | `<a href="...">章节名</a>` 在表格或列表中 | `navItems: [{href, label}]` |
| `end-marker` | 结束标记 | 包含"…终"的段落（如"儀 禮 終"） | 丢弃，不进入 IR |

### 注疏子类型

| 子类型 | 识别标准 | IR 结构 |
|--------|---------|--------|
| **内嵌注疏** | `<FONT style="FONT-SIZE: 9pt">` 包裹，与正文在同一行内交替出现 | `annotations[]` 数组，附属于 `main-text` section |
| **段落注疏** | 独立成段，不以 `#551A8B` 颜色标记 | `type: "section-summary"` 独立 section |
| **文后跋** | 全书末尾，在结束标记之前 | `type: "colophon"` 独立章节 |

### 双输出映射表

每个内容类型在 Markdown 和 HTML5 下的具体处理方式：

| 类型 | Markdown 输出 | HTML5 输出 |
|------|-------------|-----------|
| `book-title` | `# 书名`（ATX H1） | `<h1 class="font-li text-2xl">书名</h1>` |
| `metadata` | frontmatter 的 `author`, `dynasty` 字段 | 不在 HTML body 中显示，仅 frontmatter |
| `chapter-title` | `## 章节名`（ATX H2） | `<h2 class="font-li text-xl text-dai-500">章节名</h2>` |
| `main-text` | 普通段落文本，连续 | `<p class="font-kai leading-loose text-mo-600">正文</p>` |
| `inline-annotation` | `[^注N]: 注疏文本` 脚注（自动编号） | `<aside class="text-xs text-dai-500">注疏</aside>` 或 `<span class="annotation">` 行内 |
| `section-summary` | `*右传之X章。释XXX。*`（斜体段落） | `<p class="font-kai italic text-sm text-dai-400">右传之X章</p>` |
| `colophon` | 正文末尾段落 | `<section class="colophon"><p class="font-kai text-sm">跋文</p></section>` |
| `nav-item` | `* [章节名](001.htm)` 无序列表 | `<nav><ul><li><a href="001.htm">章节名</a></li></ul></nav>` |
| `end-marker` | 不输出 | 不输出 |

### 注疏输出细节

内嵌注疏在 Markdown 中使用脚注，在 HTML5 中使用行内标注：

**Markdown 示例：**
```markdown
大学之道，在明明德，在亲民，在止于至善。[^注1]知止而后有定，定而后能静[^注2]。

[^注1]: 程子曰："亲，当作新。"大学者，大人之学也。...
[^注2]: 后，与后同，后放此。止者，所当止之地...
```

**HTML5 示例：**
```html
<p class="font-kai leading-loose text-mo-600">
  大学之道，在明明德，在亲民，在止于至善。
  <span class="annotation">程子曰："亲，当作新。"大学者，大人之学也。</span>
</p>
```

### 目录页特殊处理

目录页的 `docType` 为 `catalog`，不产生 `chapters`，而是产生 `navItems`：

```json
{
  "title": "列女传",
  "author": "刘向",
  "dynasty": "汉",
  "docType": "catalog",
  "navItems": [
    { "href": "001.htm", "label": "母仪传" },
    { "href": "002.htm", "label": "贤明传" }
  ]
}
```

对应的 Markdown frontmatter 设 `docType: "catalog"`，body 为无序链接列表。

## Key Technical Decisions

### Why JSON?

- **精确表达层级关系**：章节→段落→注疏的对应关系用嵌套对象自然表达
- **机器可读**：前端消费方便，后续做注疏标注、引用关联有扩展空间
- **版本控制友好**：与现有 Git 工作流兼容
- **生成灵活**：同一 JSON 可同时生成 Markdown 和 HTML5

### 与现有系统的关系

- **弃用模板检测器**：`template-detector.mjs` 已被多遍分类器替代，应删除
- **弃用 Turndown**：JSON → Markdown 由 `renderMarkdown()` 直接生成
- **弃用 cheerio rebuild**：JSON → HTML5 由 `renderHtml5()` 直接生成
- **保留 Astro Content Collection**：最终消费的是 Markdown，frontmatter schema 不变
- **利用原始 CSS（text.css）**：`$HOME/data/古籍/text.css` 定义了权威的内容类型分类体系，应作为提取器 Pass 2 的分类依据
- **IR 输出目录**：`src/content-ir/`（与现有 `src/content/guji/` 和 `src/normalized-html/` 并列）

## Scope Boundaries

- **In scope**: 经部、史部、子部、集部四部的正文和目录 HTML 内容提取
- **Out of scope**: 图片资源迁移、AI 标注、跨文本引用图
- **Out of scope**: 引用的细粒度标注（如区分《诗》和《书》）——暂归入正文内容
- **Out of scope**: LLM 辅助识别——首轮实现完全基于规则

## Open Questions

### Resolved During Brainstorm

- **中间文件格式** → JSON。理由：精确表达层级关系、机器可读、版本控制友好、同一源可生成 Markdown 和 HTML5
- **注疏处理策略** → 内嵌注疏用 `annotations[]` 关联到所属段落，Markdown 输出为脚注，HTML5 输出为行内 `<span class="annotation">`
- **目录页 docType** → IR 中用 `docType: "catalog"` 区分，与现有 Content Collection schema 一致
- **结束标记处理** → "…终"（如"儀 禮 終"）识别为结束信号，其后内容归入 `colophon`，标记本身不输出
- **元数据来源** → 目录字典（catalog dict）提供权威 author/dynasty，非正则提取
- **分类体系来源** → `text.css` 定义了 13 个权威 CSS class 映射到内容类型，应作为提取器依据
- **模板检测器命运** → 弃用，多遍分类器统一替代

### Deferred to Implementation

- **引用提取粒度**：暂归入正文 `content`，后续可通过引号模式（`《.*?》曰`）增量提取为 `quotations` 字段
- **章节总结识别规则**：除"右传之X章"外，可能还有"右经…""右第…章"等变体，需在实施中扫描确认
- **内嵌注疏关联**：段落级关联（注疏属于最近的 `<BR>` 分隔的正文块），非句子级
- **非标准文件覆盖**：~11% 的 SKIP 文件是否能在 IR 管道中部分恢复？需在实施中观察

## Migration Strategy

1. 实现 JSON 提取器（替代现有模板正常器）
2. 实现 JSON → Markdown 转换器（复用现有 frontmatter 逻辑）
3. 实现 JSON → HTML5 渲染器（替代现有 cheerio rebuild）
4. 逐目录迁移，先经部验证后推广
5. 保留旧管道作为 fallback

---

## Unit 1 实施复盘 (2026-04-11)

### 沉淀的可复用知识

#### 1. 多遍分类器架构 ✅

Pass 1（结构上下文）→ Pass 2（属性规则）→ Pass 3（文本模式）的三层架构已被证明有效。职责分离，新增规则不干扰已有逻辑。

#### 2. 目录驱动的文件树（权威知识源）✅

索引导览页（catalog）提供权威 metadata：
- 4 个顶层目录页：`1经部藏目.htm`, `2史部藏目.htm`, `3子部藏目.htm`, `4集部藏目.htm`
- 各部子目录页（如 `列女传/index.htm`）
- 每个链接到的文件 → 确定性地继承 catalog 的 title/dynasty/author

```
索引导览页 → 构建 catalog dict → 逐文件提取时查询
```

#### 3. 原始 CSS 分类体系（text.css）✅

发现原始 HTML 制作者的权威设计规范 `text.css`（位于 `$HOME/data/古籍/text.css`），定义了完整的内容类型语义：

| CSS Class | 字号 | 颜色 | 内容类型 | 优先级 |
|-----------|------|------|---------|--------|
| `.article` | 24pt | `#FF6666` | 书名 | **权威** |
| `.chapter` | 18pt | `#551A8B` | 章标题 | **权威** |
| `.section` | 14pt | `#336699` | 节标题 | **权威** |
| `.jing` | large | `#551A8B` | 经文 | **权威** |
| `.zhuan` | 12pt | `#000000` | 传文 | **权威** |
| `.original` | 12pt | `#000000` | 正文 | **权威** |
| `.annotation` | 10pt | `#551A8B` | 注释 | **权威** |
| `.reference` | 10pt | `#000000` | 引文/参考 | **权威** |
| `.menu` | 14pt | `#333333` | 菜单/导航 | **权威** |
| `.poem` | 12pt | (继承) | 诗歌 | **权威** |
| `.caption` | 18pt | `#551A8B` | 图注 | **权威** |
| `.swy1` | 12pt/18pt | - | 正文容器 | 内联定义 |
| `.swy2` | 9pt/12pt | - | 辅助信息 | 内联定义 |

**颜色语义体系：**
- `#FF6666` → 书名/标题（红色）
- `#FF0000` → 书名标记（纯红）
- `#CC33CC` → 章节标题（品红，实际 HTML 中替代 `.chapter` 的 `#551A8B`）
- `#551A8B` → 注释/经文（深紫）
- `#336699` → 节标题（深蓝）
- `#333333` → 菜单（深灰）

**关键发现：** 所有文件共享同一套 CSS class 命名和颜色语义（Microsoft FrontPage 4.0 制作），这意味着提取器可以直接利用 class 名称而非仅靠属性猜测。

#### 4. 递归 Walker（`.contents()`）✅

cheerio 的 `.contents()` 而非 `.children()` 是正确处理裸露文本节点的关键。混合容器递归下降处理。

#### 5. 表格扁平化预处理 ✅

正则预处理 `<table>/<tr>/<td>` → `<div>` 优于 cheerio DOM 操作（`.before()`, `.appendTo()` 会丢失/合并文本节点）。

#### 6. 模式缓存机制（待实现）

同一典籍内部模式统一 → 分析首个内容文件 → 缓存模式 → 应用到整本书的所有文件。避免对每个文件重复分类。

### 被证明无效/低效、应去除的方案

| 方案 | 原因 | 替代方案 |
|------|------|---------|
| 模板检测器 (`template-detector.mjs`) | 7 个独立模板 ~800 行正则，维护成本高 | 多遍分类器统一处理 |
| cheerio DOM 操作式拆解 (`.before()`, `.appendTo()`) | 丢失/合并文本节点 | 正则预处理 + `.contents()` 只读遍历 |
| 正则提取 author/dynasty | 脏 HTML 上几乎不可能可靠 | 目录字典权威查询 |
| 每文件重复检测模式 | 浪费计算 | 模式缓存（按书缓存） |
| 独立 `.swy1` 解包逻辑 | cheerio 行为不可控 | 直接取 `body > div.swy1` 的 `.contents()` |

### 当前提取器的缺失（从 text.css 发现）

Pass 2 (`classifyByAttributes`) 目前**缺少**以下规则：
- `class=chapter` → `chapter-title`（text.css 权威定义）
- `class=section` → sub-chapter heading
- `class=annotation` 或 `class=reference` → `inline-annotation`
- `class=menu` → catalog/nav context
- 颜色 `#551A8B` + 10pt → `inline-annotation`（text.css `.annotation` 定义）
- `class=article` → `book-title`（比猜 color+size 更权威）
- `class=jing` → 经文（正文特殊类型）
- `class=zhuan` → 传文（正文特殊类型）
