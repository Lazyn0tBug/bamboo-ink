---
date: 2026-04-12
topic: extraction-pipeline-optimization-and-standalone-architecture
---

# 提取管道优化与独立模块架构

## Problem Frame

`scripts/lib/content-extractor.mjs`（已拆分为 `extractors.mjs` + `renderers.mjs` + facade）是从 FrontPage/MSHTML HTML 中提取古籍内容到 JSON IR 的核心引擎。当前存在三类问题：

1. **代码质量**：存在已知 P1/P2 bug（claim 逻辑导致内容丢失、职责重叠、分类函数圈复杂度过高）
2. **运行时效能**：使用 Node.js + cheerio 处理 9000+ 文件，I/O 和解析效率有提升空间
3. **独立复用性**：提取逻辑与应用（Astro 站点）耦合，数字人文领域 Python 生态更成熟，Python 独立模块可复用性更强

## Requirements

**当前库代码优化**
- R1. 修复 `pass2Metadata` 中 `claimSubtree(parent)` 改为 `claimLeaf(node)`，防止 claim 整个 `div.swy1` 导致正文内容丢失
- R2. 合并 `extractTitle()` 和 `pass1BookTitle()` 的重叠逻辑，消除对 centered `#FF6666/#FF0000` + SIZE≥5 的重复扫描
- R3. 将 `classifyByAttributes` 从嵌套 if-else 重构为规则表模式（`[{ name, predicate, type }]` 数组），使新增分类规则只需追加而非插入中间位置
- R4. 修复 `flattenTables` 正则脆弱性：当前用全局替换处理 `<table>/<tr>/<td>`，可能误替换正文中包含 `table`、`tr`、`td` 字串的文本内容
- R5. 统一 `METADATA_RE` 和 `METADATA_RE_BODY` 两个相同正则为单一常量
- R6. ~~修复 `escapeYaml` 缺失反斜杠转义~~ — 已验证 `renderers.mjs:145` 已包含 `replace(/\\/g, '\\\\')`，此项已解决
- R7. 移除 `processNode` 中 `CENTER` 标签的 dead code 检查（normalizeHtml 已将所有 `<center>` 转为 `<div data-center>`）
- R8. 修复 `processNode` 中对子节点的重复分类问题：`hasMixedChildren` 扫描已分类一次，递归 `processNode` 时再次分类，缓存分类结果

**运行时效能**
- R9. 使用 Bun 运行转换脚本，利用其原生 ES 模块支持和更快的 I/O API
- R10. 消除 `patternCache` 的 write-only 问题：让 `processNode` 在有缓存时跳过冗余分类

**可观测性**
- R11. 增加结构化处理日志：per-file 记录 docType、chapters 数、annotations 数、处理耗时
- R12. 增加异常诊断报告：`Untitled` 标题、零 chapters、元数据缺失、catalog 误检等
- R13. CLI 增加 `--verbose` / `--debug` 输出控制

**独立 Python 模块**
- R14. 创建独立的 Python 包，提供与当前 JS `extractors.mjs` 等价的提取功能
- R15. Python 模块不依赖 Astro 项目结构，可单独安装和运行（`pip install` + CLI）
- R16. 输入输出格式与 JS 版保持一致：输入 HTML 字符串，输出 JSON IR 对象
- R17. Python 模块利用 `lxml` 作为 HTML 解析器，替代 cheerio（迭代解析无栈溢出风险）
- R18. Python 模块提供可选的中文 NLP 增强能力（注疏边界检测、段落切分）

## Success Criteria
- R2-R8 不改变外部行为，全部 113 个现有测试通过
- R1 修复 claim bug 后，更新受影响文件的测试断言（旧输出丢弃被 claim 的正文，新输出包含完整正文）
- 修复 claim bug 后，无正文内容因 metadata claim 被错误跳过
- Python 模块对经部示例文件提取结果与 JS 版一致（IR 结构比对）
- Bun 运行速度不低于当前 Node.js 版本，且有可测量的提升
- 9000+ 文件批量处理时，日志可快速定位失败/异常文件

## Scope Boundaries
- **In scope**: 正文内容提取的准确率和健壮性、运行时优化、独立 Python 模块
- **In scope**: 处理日志和可观测性
- **Out of scope**: Astro 前端 UI 改动、页面交互、样式
- **Out of scope**: 跨文本引用分析、AI 智能标注（后续增量功能）
- **Out of scope**: LLM 辅助内容识别（保持基于规则的确定性提取）

## Key Decisions

**D1. 三路并行而非二选一**
不选择"只优化 JS"或"只重写 Python"，而是：
- 当前 JS 库修 bug + 性能优化（立即可用，维护现有管道）
- 改用 Bun 运行（零代码改动，免费提速）
- 独立 Python 模块（长期战略，数字人文生态复用）

三者服务于不同目的：JS 修正是"止血"，Bun 是"补品"，Python 是"未来"。

**D1a. 双引擎维护风险缓解**（Review Finding）
维护 JS + Python 两套提取引擎存在规则漂移风险。缓解措施：
- Python 模块首期定位为 POC（Proof-of-Concept），仅验证核心提取管道等价性，不追求 9000 文件全覆盖
- 提取规则以文档化的规则表（R3 重构后的规则表）为单一事实源，而非以 JS 输出为事实标准
- 建立跨语言测试集：选取 50-100 个代表性 HTML 文件（经部/史部/子部/集部各 10-25 个），JS 和 Python 输出逐文件比对 IR 结构

**D2. Python 选 `lxml.html` 而非 `BeautifulSoup`**
`lxml` 是 C 扩展实现的 HTML5 解析器，比 BeautifulSoup 快 5-10 倍，且不会产生 cheerio 的 `.before()`/`.appendTo()` 文本节点丢失问题。对于 9000+ 文件的批量处理，速度差异显著。

**D3. 提取规则表为事实标准，而非 JS 输出**
R3 重构后的规则表（`[{ name, predicate, type }]`）是提取行为的事实标准。JS 和 Python 模块都应实现同一套规则，而非"Python 模仿 JS 输出"。这避免了将 JS 现有 bug 复制到 Python 的问题。JSON IR 的结构定义需要一个独立的 schema（TypeScript `interface` 或 JSON Schema），同时作为 JS 和 Python 的类型约束。

**D4. Python 模块首期定位为 POC**
首期不追求 9000 文件全覆盖，而是：实现核心提取管道（claim、pass1-3、processNode），用 50-100 个跨部类样本文件验证 IR 输出与 JS 版一致。R18（中文 NLP 增强）延后至 POC 验证后再评估。

## Dependencies / Assumptions
- Bun 已安装在开发环境（项目使用 `bun run` 命令，已验证可用）
- `lxml` 支持中文 HTML 解析（需验证 FrontPage 输出的非标准 HTML 兼容性）
- 源数据路径 `$HOME/data/古籍` 保持不变

## Outstanding Questions

### Resolved (during review)
- ~~Python 模块包名和发布方式~~ → 决定：首期 POC，本地使用，不发布。D4
- ~~跨语言测试复用~~ → 决定：选取 50-100 个样本文件，JS 和 Python 输出逐文件比对 IR。D1a
- ~~R6 escapeYaml 反斜杠转义~~ → 已验证 `renderers.mjs:145` 已包含该修复
- ~~R1 "不改变外部行为" 声明~~ → 已修正：R1 改变 IR 输出，需更新受影响测试
- ~~JSON IR schema 无单一 owner~~ → D3 决定：规则表为事实标准，需要独立 IR schema

### Deferred to Planning
- [Affects R4][Needs research] `flattenTables` 正则实际误替换了多少文件？需要扫描 9000 文件确认问题严重性
- [Affects R8][Technical] 分类结果缓存的具体数据结构设计
- [Affects R15][Technical] Python 模块的包结构：单文件 vs 多模块（对应 extractors/renderers 的拆分）
- [Affects R17][Needs research] `lxml` 对 FrontPage 4.0 非标准 HTML 的容错能力，特别是嵌套 `<FONT>` 标签和缺失闭合标签
- [Affects R9][Technical] Bun 与 cheerio 的兼容性验证（cheerio 是否完全支持 Bun 运行时）

## Next Steps
-> /ce:plan 为三路并行方案设计具体实施计划：JS 优化 → Bun 验证 → Python 模块骨架
