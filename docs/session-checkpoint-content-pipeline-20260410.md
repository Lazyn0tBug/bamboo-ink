# 会话成果：经部 Content Pipeline 验证与 HTML 规范化讨论

> **日期**: 2026-04-10
> **分支**: `feat/guji-content-pipeline`
> **HEAD**: `34d163f`
> **状态**: PAUSED — 需要决定 HTML 规范化策略后再继续

---

## 已完成的决策与发现

### Office Hours 决策（已写入 `~/.gstack/projects/` 的设计文档）

- **增量验证方案**：论语先行 → 经部全量 → 史子集
- **Approach A**（单书验证）被采纳
- **Frontmatter Schema**：已定义，需补充 `chapters` 和 `slug` 字段
- **Catalog-to-Disk 映射算法**：已设计
- **多文件拼接算法**：已设计
- **Slug 策略**：中文字符路径 + pinyin slug 字段
- **部署目标**：GitHub Pages

### 本次会话发现的 7 个问题（验证后）

| #   | 问题                                                                                                  | 影响                                                                     | 状态       |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| 1   | `content.config.ts` 已有 `author`、`dynasty`、`subcategory` 字段，文档说"需要添加"                    | 文档错误，实际只需添加 `chapters` 和 `slug`                              | 已修正     |
| 2   | `docType` 枚举实际是 `['catalog', 'content']`，文档写的是 `['book', 'catalog', 'chapter']`            | 文档错误                                                                 | 已修正     |
| 3   | 转换脚本 `extractMetadata` 将 `经部` 映射为 `经`（单字），输出到 `content/经/`，但 schema 期望 `经部` | **转换脚本有 bug**，输出无法被 Content Collection 识别                   | 待修       |
| 4   | 经部所有已检查文件均为 UTF-8（无 BOM，meta 声明 `charset=utf-8`），无 GBK                             | 编码检测逻辑可能永远不走 GBK 分支                                        | 待验证全量 |
| 5   | `论语.htm` 是单文件（74KB），非目录。多文件的是 `论语集注/`（12 个章节文件）                          | 文档中 "论语测试多文件拼接" 的前提错误                                   | 待修正     |
| 6   | HTML 是 Microsoft FrontPage 4.0 产物：无语义化标签，标题用 `<FONT size=5>`，正文在 `<PRE>` 中         | **Turndown 将完全失败** — 它需要语义化 HTML，会把 `<PRE>` 内容转成代码块 | 关键阻塞   |
| 7   | 藏目路径与磁盘路径不匹配（目录写 `经部/论语/index.htm`，实际是 `经部/论语.htm`）                      | 映射算法需要容错                                                         | 算法已涵盖 |

### HTML 结构分析（经部样本）

**`论语.htm` 实际结构：**

```html
<CENTER><B><FONT face=楷体_GB2312><FONT color=#ff6666><FONT size=5>论语</FONT></FONT></FONT></B></CENTER>
<CENTER><HR width="85%"></CENTER>
<DIV align=center><TABLE><TBODY><TR><TD><PRE>
<SPAN class=swy1>
<CENTER><B><FONT color=#cc33cc>论语序说</B></FONT></CENTER>
    史记世家曰："孔子名丘，字仲尼..."
    何氏曰："鲁论语二十篇..."
    程子曰："读论语：有读了全然无事者..."
</SPAN></PRE></TD></TR></TBODY></TABLE></DIV>
```

**关键发现：**

- 无 `<h1>`-`<h6>` 标签 — 标题是 `<FONT size=N>` 和 `<FONT color=XXX>`
- 正文全部在 `<PRE>` 标签内 — 不换行，无段落标记
- 嵌套 `<FONT>` 标签 3-4 层
- 内联 CSS 大写（MSHTML 生成器产物）
- 外部 CSS 链接 `text.css` 和 `goldnets.css`
- 图片：`bg.gif` 背景

### `论语集注/` 目录结构

```
index.htm, 00.htm, 000.htm, 001.htm-010.htm (13 个文件)
next1.gif, up.gif (导航图片)
```

章节文件用 3 位数字编号（000-010），但 `index.htm` 本身也包含完整正文。

---

## 当前决策点（PAUSED）

### 问题：HTML 格式极度混乱，是否需要先规范化？

**选项 A：先规范化 HTML，再转换**

- 写一个脚本将 FrontPage HTML 转换为干净的语义化 HTML
- 然后用 Turndown 或自定义脚本转换
- 优点：规范化后的 HTML 可作为中间产物，便于调试
- 缺点：额外增加一个步骤，且规范化脚本可能比直接转换更复杂

**选项 B：跳过规范化，直接写 cheerio 提取器**

- 分析 HTML 模式（标题=FONT size/color，正文=PRE 内的文本）
- 用 cheerio 直接提取标题层级和正文段落
- 输出干净的 Markdown
- 优点：少一个步骤，直接拿到最终产物
- 缺点：需要手动处理所有 HTML 变体

**选项 C：先做 HTML 模式审计**

- 抽样检查 10-20 个不同书籍的 HTML 文件
- 识别所有不同的 HTML 模式/模板
- 确认是否存在 2-3 种固定模板，还是每本书都不一样
- 然后决定 A 还是 B
- 优点：基于数据做决策，不盲猜
- 缺点：延迟开始转换

### 推荐

**选项 C 优先**。在写任何转换代码之前，先花 10 分钟抽样 20 个文件，摸清 HTML 模式的全貌。如果发现有 2-3 种可复用的模板，选项 B（直接提取）是最高效的。如果每本书都不同，可能需要选项 A（规范化）作为中间步骤。

---

## 下次会话重启指南

1. 阅读本文件了解已发现的问题
2. 查看 `~/.gstack/projects/Lazyn0tBug-bamboo-ink/Lazyn0tBug-feat-guji-content-pipeline-design-20260410.md` 获取已批准的设计文档
3. 运行 `bun run dev` 确认当前站点可正常构建
4. 优先解决 HTML 模式审计（选项 C），再决定转换策略
5. 转换脚本需修复的问题：category 映射（`经`→`经部`）、docType 枚举、`--book` 参数支持

## 待修复的代码问题

- `scripts/convert-htm-to-md.js:69-77` — `section` 字段映射为单字（`经`），应为 `经部`
- `scripts/convert-htm-to-md.js:138` — frontmatter 用 `section` 而非 `category`
- `scripts/convert-htm-to-md.js:196` — `files.slice(0, 10)` 硬编码限制
- `src/content.config.ts` — 缺少 `chapters` 和 `slug` 字段
- `src/content.config.ts:18` — `docType` 无 `'book'` 枚举值（应为 `'content'`）
