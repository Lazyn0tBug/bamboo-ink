---
title: 'feat: Phase 6B — NLP 层（Protocol + Service + Pass 2 接入）'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-002-python-extraction-module.md
---

# feat: Phase 6B — NLP 层（Protocol + Service + Pass 2 接入）

## Overview

当前 Pass 2（metadata）依赖 METADATA_RE 正则匹配朝代和作者，抽样 100 文件结果显示仅 35% 提取率，且存在大量误匹配（如"洞经教部"被当朝代、"简明目录"被当作者）。35% 已经触及正则的天花板。

本工作提前 P8 的 NLP Plugin 设计，创建 `NLPPlugin` Protocol + `NLPService` 门面 + `JiebaNLPPlugin` 默认实现，并在 Pass 1-3 中接入分词分类。

**核心思路**：不依赖静态朝代词典，而是从 Catalog 页面（5 个藏目页 + 首页）中提取所有 `(朝代·作者)` 对构建**动态元数据词典**。Pass 1-3 处理非正文元素时，用这个词典做分词分类 — 因为朝代、作者、章节都是短文本（<80 字），天然适合分词处理。

**合并范围**：
- P8 原计划的 NLP Plugin（segment / recognize_entities / punctuate 三个接口）
- Catalog 预处理 + 动态元数据词典构建
- Pass 2 的 NLP 分类接入（后续 Pass 1/3 也可接入）
- jieba 分词引擎集成

**不合并**：P8 的 Exporter Protocol、Repository 抽象、Book Profile、可观测性 — 这些仍按原计划在 P8 做。

## Problem Frame

- METADATA_RE `\(?(\p{Han}{1,4})[·\.\-](\p{Han}+)[）)\s]?` 无法区分真正的朝代-作者对和分类标签
- "卷十二 三洞经教部·经三" 匹配为 dynasty="洞经教部", author="经三"
- "简明目录·序" 匹配为 dynasty="简明目录", author="序"
- 9044 文件规模下，35% 提取率 + 大量误匹配 = 约 6000+ 文件元数据缺失或错误
- Catalog 藏目页（`1经部藏目.htm` 等）已包含结构化元数据 `<font class="annotation">(宋·苏轼)</font>`，但未被利用

## Requirements Trace

- R5: catalog/content docType 自动检测 — NLP 验证后可更准确区分
- R8: 领地式 Pass 架构 — NLP 作为 Pass 的辅助工具，不破坏领地模型
- R9: AI Fallback 接口 — NLP 分类失败可触发 AI Fallback
- R16: 技术规范 — NLP 层需要独立的技术规范

## Scope Boundaries

- **In scope**: NLPPlugin Protocol, NLPService, JiebaNLPPlugin, Catalog 预处理, 动态元数据词典, Pass 2 分类接入
- **In scope**: punctuate 接口定义（预留，`NotImplementedError`）
- **Out of scope**: punctuate 实际实现（留给 P8/P9）
- **Out of scope**: LLM-based NLP 实现（PC2 阶段）
- **Out of scope**: Pass 1/3 的 NLP 接入（本次只接入 Pass 2，1/3 后续按需接入）
- **Out of scope**: Exporter, Repository, Book Profile, Observability（按原计划在 P8 做）

## Key Technical Decisions

- **D1: NLP 作为独立服务层**: `NLPService` 是门面，`NLPPlugin` 是实现接口，Pass 只依赖 Service 门面。管道和 NLP 实现完全解耦。
- **D2: 动态元数据词典**: 从 Catalog 页面提取 `(朝代·作者)` 对，而非手动维护静态 `dynasty_dict.txt`。数据来自真实藏书，自动更新，零维护成本。
- **D3: 元素级分词分类**: Pass 2 在匹配到候选时，调用 `NLPService.classify_short_text()` 进行分词+分类。短文本（<80 字）开销极小，不需要跑全文。
- **D4: 分类而非验证**: 核心方法是 `classify_short_text(text) -> dict`，返回结构化分类结果（如 `{"type": "dynasty", "value": "宋"}`），Pass 根据分类结果判断是否认领。
- **D5: jieba + 动态词典**: 第一版用 `jieba` 分词 + 动态词典做实体匹配，不依赖统计 NER 模型。成本低，准确率高。

## Implementation Units

- [ ] **Unit 0: Catalog 预处理 + 动态元数据词典**

**Goal:** 从 Catalog 页面提取所有 `(朝代·作者)` 对，构建动态元数据词典。

**Dependencies:** extract() 管道已就绪（P6 完成）

**Files:**
- Create: `src/bamboo_extract/meta_dict.py`
- Test: `tests/test_meta_dict.py`

**Approach:**
- `build_meta_dict(catalog_htmls: list[str]) -> MetaDictionary`:
  - 对每个 Catalog HTML 运行 extract()
  - 从 IR 中提取 navItems 和 body 中的 `<font class="annotation">` 元素
  - 解析 `(朝代·作者)` 格式，提取 dynasty-author 对
  - 去重后构建 `MetaDictionary`:
    - `dynasties: set[str]` — 所有朝代名
    - `authors: dict[str, str]` — author → dynasty 映射
    - `dynasty_authors: dict[str, set[str]]` — dynasty → set[author] 映射
- `MetaDictionary` 类:
  - `is_dynasty(text: str) -> bool` — 判断是否是朝代名
  - `get_author_dynasty(author: str) -> str | None` — 查询作者所属朝代
  - `save(path) / load(path)` — 持久化为 JSON
- 输出: `src/bamboo_extract/resources/meta_dict.json`
- 提供 CLI 命令: `uv run bamboo-extract --build-meta-dict 古籍/ --output src/bamboo_extract/resources/meta_dict.json`

**Test scenarios:**
- Happy path: 5 个藏目页 + 首页 → 提取 100+ 个朝代-作者对
- Happy path: MetaDictionary.is_dynasty("宋") → True
- Happy path: MetaDictionary.is_dynasty("简明目录") → False
- Happy path: MetaDictionary.get_author_dynasty("苏轼") → "宋"
- Edge case: 空 Catalog 列表 → 空词典
- Edge case: 保存/加载 → 结果一致

**Verification:**
- `uv run bamboo-extract --build-meta-dict 古籍/ --output meta_dict.json` 产出合法 JSON
- 词典包含常见朝代: 汉、唐、宋、明、清
- `pytest tests/test_meta_dict.py` 通过

- [ ] **Unit 1: NLPPlugin Protocol 定义**

**Goal:** 定义 `NLPPlugin` Protocol，包含 segment / recognize_entities / punctuate 三个接口。

**Dependencies:** 无

**Files:**
- Create: `src/bamboo_extract/nlp.py`

**Approach:**
- `NLPPlugin` Protocol:
  - `segment(text: str) -> list[str]` — 分词
  - `recognize_entities(text: str, entity_types: set[str]) -> list[Entity]` — 命名实体识别
  - `punctuate(text: str) -> str` — 标点断句（预留）
- `Entity` dataclass: `text`, `type` (dynasty/person/place/book), `start`, `end`

**Patterns to follow:**
- Python `typing.Protocol`

**Verification:**
- `uv run ruff check src/bamboo_extract/nlp.py` 通过
- Protocol 定义可通过 mypy/ty 类型检查

- [ ] **Unit 2: NLPService 门面**

**Goal:** `NLPService` 门面类，管道只依赖它，不直接依赖具体插件。

**Dependencies:** Unit 0, Unit 1

**Files:**
- Create: `src/bamboo_extract/nlp_service.py`

**Approach:**
- `NLPService` 类:
  - `_plugin: NLPPlugin | None = None` — 注册的插件
  - `_meta_dict: MetaDictionary | None = None` — 动态元数据词典
  - `set_plugin(plugin: NLPPlugin)` — 注册插件
  - `set_meta_dict(meta_dict: MetaDictionary)` — 注册词典
  - `classify_short_text(text: str) -> dict | None` — 核心方法
    - 分词 → 实体识别 → 对照动态词典
    - `(宋·朱熹)` → `{"type": "metadata", "dynasty": "宋", "author": "朱熹"}`
    - `三洞经教部` → `{"type": "category"}` (非元数据)
    - `士冠禮` → `{"type": "unknown"}` (无法分类的短文本)
  - 无插件注册时返回 `{"type": "unknown"}`（向后兼容）

**Patterns to follow:**
- 当前 Pass 架构的服务门面模式

**Verification:**
- classify_short_text("宋·朱熹") → `{"type": "metadata", "dynasty": "宋", "author": "朱熹"}`
- classify_short_text("洞经教部") → `{"type": "category"}` 或 `{"type": "unknown"}`
- classify_short_text("简明目录") → `{"type": "category"}` 或 `{"type": "unknown"}`

- [ ] **Unit 3: JiebaNLPPlugin 实现**

**Goal:** 基于 jieba 的默认 NLP 插件实现。

**Dependencies:** Unit 0, Unit 1

**Files:**
- Create: `src/bamboo_extract/jieba_plugin.py`
- Modify: `pyproject.toml`（添加 jieba 依赖）

**Approach:**
- `JiebaNLPPlugin(NLPPlugin)`:
  - `__init__` 可接受 `MetaDictionary` 作为参数（用于分词时参考）
  - `segment(text)` → `jieba.lcut(text)` 过滤空字符串
  - `recognize_entities(text, entity_types)`:
    - 基于动态词典的实体匹配：扫描分词结果，匹配 dynasty/person
    - 返回 `Entity` 列表
  - `punctuate(text)` → `NotImplementedError`（预留）
- 依赖：`jieba >= 0.42.1`

**Test scenarios:**
- Happy path: "宋·朱熹" → segment → ["宋", "·", "朱熹"]
- Happy path: recognize_entities("宋·朱熹", {"dynasty", "person"}) → [{"text": "宋", "type": "dynasty"}, {"text": "朱熹", "type": "person"}]
- Happy path: "卷十二三洞经教部经三" → segment → 包含"三洞"、"经教部"等非朝代词
- Edge case: 空文本 → segment 返回 []
- Edge case: 纯标点 → segment 返回 []

**Verification:**
- `pytest tests/test_nlp.py` 通过

- [ ] **Unit 4: Pass 2 接入 NLP 分类**

**Goal:** Pass 2 在 METADATA_RE 匹配后，调用 NLPService.classify_short_text 分类结果。

**Dependencies:** Unit 2, Unit 3

**Files:**
- Modify: `src/bamboo_extract/passes.py`（pass2_metadata）
- Modify: `src/bamboo_extract/__init__.py`（extract 管道初始化 NLPService + 加载 meta_dict）

**Approach:**
- `pass2_metadata` 内部变化：
  1. METADATA_RE 匹配到候选文本
  2. 调用 `NLPService.classify_short_text(text)`
  3. `{"type": "metadata", "dynasty": ..., "author": ...}` → 返回验证后的结果
  4. 其他类型 → 继续下一个候选（保持原有 fallback 行为）
- `extract()` 初始化时：
  1. 加载 `meta_dict.json`（如果存在）
  2. 注册 `JiebaNLPPlugin()`
  3. 注入到 `NLPService`
- 如果 `meta_dict.json` 不存在 → 降级为纯正则（向后兼容）

**Execution note:** 先写失败测试（现有误匹配案例），验证 NLP 能过滤后通过。

**Test scenarios:**
- Happy path: "(宋·朱熹)" → METADATA_RE 匹配 → NLP 分类为 metadata → dynasty="宋", author="朱熹"
- Happy path: "卷十二 三洞经教部·经三" → METADATA_RE 匹配 → NLP 分类为 category → 拒绝，继续 fallback
- Happy path: "简明目录·序" → METADATA_RE 匹配 → NLP 分类为 category → 拒绝，继续 fallback
- Edge case: 无 NLP 插件/无 meta_dict → 降级为纯正则（保持向后兼容）
- Integration: 真实文件 徐幹中論.htm → 元数据提取正确

**Patterns to follow:**
- 当前 Pass 2 的两级策略（class=metadata → 全文扫描）
- 保持原有 fallback 行为不变

**Verification:**
- 抽样测试中 35% 提取率提升（目标：>60%）
- "洞经教部"、"简明目录"类误匹配被过滤
- 现有 188 个测试全部通过

## Open Questions

### Resolved During Planning

- NLP 分类失败时行为：继续下一个候选（不是直接返回 None），保持原有的 fallback 链条
- 动态词典来源：从 Catalog 页面自动提取，不手动维护
- Pass 1/3 暂时不接入 NLP — 本次只做 Pass 2，1/3 后续按需接入

### Deferred to Implementation

- 人名识别规则：第一版只依赖词典匹配，复杂的人名识别（如复姓、双名）留给后续
- punctuate 实现：接口定义但不实现，留给 P8/P9
- NLP 性能优化：jieba 初始化延迟、批量处理缓存等，留给 P10 CLI 增强时处理
- Pass 1/3 的 NLP 接入：先验证 Pass 2 效果，再决定是否扩展到 1/3

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Catalog 页面元数据覆盖率不足 | Low | Medium | 5 个藏目页 + 首页应覆盖大部分常见朝代-作者对；未覆盖时降级为纯正则 |
| jieba 分词结果不稳定 | Low | Low | jieba 是确定性算法；需在测试中验证 |
| jieba 引入新依赖 | Low | Low | jieba 纯 Python 实现，无 C 扩展，安装简单 |
| NLP 分类增加处理时间 | Low | Low | 单次分类 < 1ms，9000 文件总延迟 < 10s，可接受 |
| 动态词典过时（新增藏书不在词典中）| Low | Medium | 提供 `--build-meta-dict` CLI 命令，每次新增藏书后重新构建 |

## System-Wide Impact

- **对 P8 的影响**: P8 不再需要定义 NLP Plugin Protocol — 已在 6B 完成。P8 只需接入 Exporter/Repository。
- **对 P7 的影响**: 质量评估可以使用 NLP 分类结果作为质量指标的一部分。
- **对 P11 的影响**: 全量验证前需要重新构建 meta_dict，确保覆盖率。

## Sources & References

- **Phase 8 计划** (NLP Plugin 已移至本 Phase 6B): `docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md` Phase 8 U8
- **当前 Pass 2**: `src/bamboo_extract/passes.py:178-207` — pass2_metadata
- **Catalog 数据源**: `古籍/1经部藏目.htm`, `古籍/2史部藏目.htm`, `古籍/3子部藏目.htm`, `古籍/4集部藏目.htm`, `古籍/0古籍首页.htm`
- **抽样测试结果**: `scripts/sampling_test.py` — 100 文件抽样，35% 提取率
- **误匹配案例**: "洞经教部·经三" → dynasty="洞经教部", author="经三"
