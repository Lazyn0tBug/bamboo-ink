---
title: 'feat: Phase 6B — NLP 层（Protocol + Service + Pass 2 接入）'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-002-python-extraction-module.md
deepened: 2026-04-12
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
- Catalog 藏目页已包含大量结构化元数据（300+ 个朝代-作者对），但未被利用，且使用 4 种不同的 HTML 格式

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

## Context & Research

### Relevant Code and Patterns

- **`src/bamboo_extract/passes.py`** — 当前 pass2_metadata 实现（两策略：class=metadata → 全文扫描），首个匹配即返回。需改为迭代验证模式
- **`src/bamboo_extract/regex_patterns.py`** — METADATA_RE 定义处，使用 `regex` 模块的 `\p{Han}`  Unicode 属性转义
- **`src/bamboo_extract/__init__.py`** — extract() 管道编排，当前 10 个导出符号。需新增 NLPService 初始化和注入逻辑
- **`src/bamboo_extract/territory.py`** — Territory.claim_subtree / claim_leaf 模式，Pass 2 需继续使用
- **`pyproject.toml`** — Python >=3.12, uv + hatchling 构建, pytest + ruff + ty 工具链。需添加 jieba 依赖
- **测试模式** — `_build(html)` helper 返回 `(index, territory)`，类组织 `Test{PassName}`，pytest 风格 `assert`。见 `tests/test_extractors.py`
- **外部数据源评估** — Jiayan/EvaHan/SikuBERT 三个外部数据源已评估：集成成本高于收益，第一版不引入。后续如需要可引入 Jiayan 作为分词后端

### Institutional Learnings

- Phase 6（Pass 8 + assemble_results）已提交 188 测试通过，管道架构稳定
- 抽样测试确认 300+ 朝代-作者对分布在 4 种 Catalog HTML 格式中
- 两个编码失败文件已转换为 UTF-8（飞燕外传.htm, yj7_014.htm）

### External References

- `jieba >= 0.42.1` — 纯 Python 中文分词库，无 C 扩展，`pip install jieba` 即可
- `typing.Protocol` — Python 3.8+ 标准库，定义接口契约

## Key Technical Decisions

- **D1: NLP 作为独立服务层**: `NLPService` 是门面，`NLPPlugin` 是实现接口，Pass 只依赖 Service 门面。管道和 NLP 实现完全解耦。
- **D2: 动态元数据词典 + 多格式提取**: 从 Catalog 页面提取 `(朝代·作者)` 对，支持 4 种 HTML 格式（见 Unit 0）。数据来自真实藏书（300+ 对），自动更新，零维护成本。
- **D3: 元素级分词分类**: Pass 2 在匹配到候选时，调用 `NLPService.classify_short_text()` 进行分词+分类。短文本（<80 字）开销极小，不需要跑全文。
- **D4: 分类而非验证**: 核心方法是 `classify_short_text(text) -> dict`，返回结构化分类结果（如 `{"type": "metadata", "dynasty": "宋", "author": "朱熹"}`），Pass 根据分类结果判断是否认领。
- **D5: jieba + 动态词典**: 第一版用 `jieba` 分词 + 动态词典做实体匹配，不依赖统计 NER 模型。成本低，准确率高。
- **D6: Pass 2 迭代式候选匹配**: 改为遍历所有候选，NLP 验证通过才返回，否则继续下一个（不是第一个匹配就返回）。

## Catalog 格式分析（Document Review 补充）

经实际验证，4 个藏目页使用不同的 HTML 格式存储元数据：

| 文件 | 格式 | 示例 | 预估数量 |
|------|------|------|----------|
| `1经部藏目.htm` | `<font class="annotation">` | `(宋·苏轼)` | ~13 |
| `2史部藏目.htm` | `<FONT SIZE=-1 COLOR="#993300">` / `<font color="#993300" size="2">` | `(汉·司马迁)` / `(唐·颜师古 注)` | ~50+ |
| `3子部藏目.htm` | `<font size="2" color="#993300">` | `(周·荀况)` | ~180+ |
| `4集部藏目.htm` | `&middot;` HTML 实体 + 颜色标记 | 待确认 | 待确认 |
| **合计** | | | **300+** |

提取器需要识别这 4 种格式，统一解析为 `(dynasty, author)` 对。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### classify_short_text 数据流

```
Input: "(宋·朱熹)"
  │
  ├─ NLPService.classify_short_text(text)
  │   │
  │   ├─ [无插件] → {"type": "unknown"}  ← 向后兼容
  │   │
  │   └─ [有插件]
  │       │
  │       ├─ plugin.segment(text) → ["(", "宋", "·", "朱熹", ")"]
  │       │
  │       ├─ plugin.recognize_entities(tokens, {"dynasty", "person"})
  │       │   → [Entity("宋", "dynasty"), Entity("朱熹", "person")]
  │       │
  │       └─ 对照 MetaDictionary
  │           ├─ "宋" ∈ dynasties → dynasty="宋" ✓
  │           ├─ "朱熹" ∈ authors → author="朱熹", 所属朝代="宋" ✓
  │           └─ 朝代匹配 → {"type": "metadata", "dynasty": "宋", "author": "朱熹"}
```

### Pass 2 迭代式匹配流程（D6）

```
pass2_metadata(index, territory, nlp_service):
  │
  ├─ Strategy 1: class="metadata" nodes → collect candidates
  ├─ Strategy 2: all_text_nodes → collect candidates
  │
  └─ For each candidate:
      │
      ├─ text = node.text().strip()
      ├─ match = METADATA_RE.search(text)
      ├─ if not match: continue
      │
      ├─ result = nlp_service.classify_short_text(match.group(0))
      ├─ if result["type"] == "metadata":
      │     territory.claim_leaf(node_id)
      │     return {"dynasty": result["dynasty"], "author": result["author"]}
      └─ else: continue  ← 关键变化：不是 return None
  │
  └─ return None  ← 所有候选都被拒绝
```

### 系统初始化

```
extract(html):
  │
  ├─ nlp_service = NLPService()
  ├─ if meta_dict.json exists:
  │     meta_dict = MetaDictionary.load("resources/meta_dict.json")
  │     nlp_service.set_meta_dict(meta_dict)
  │     nlp_service.set_plugin(JiebaNLPPlugin(meta_dict))
  │
  └─ pass2_metadata(index, territory, nlp_service)
```

## Implementation Units

- [ ] **Unit 0: Catalog 预处理 + 动态元数据词典**

**Goal:** 从 Catalog 页面提取所有 `(朝代·作者)` 对，构建动态元数据词典。

**Requirements:** R8 (领地式 Pass 架构，不破坏现有管道)

**Dependencies:** extract() 管道已就绪（P6 完成）

**Files:**
- Create: `src/bamboo_extract/meta_dict.py`
- Create: `src/bamboo_extract/resources/` (目录)
- Test: `tests/test_meta_dict.py`

**Approach:**
- `build_meta_dict(catalog_htmls: list[str]) -> MetaDictionary`:
  - 对每个 Catalog HTML 运行 extract()
  - **从原始 HTML 中提取元数据元素**，支持 4 种格式：
    1. `<font class="annotation">(朝代·作者)</font>` — `class="annotation"` 直接匹配
    2. `<FONT SIZE=-1 COLOR="#993300">(朝代·作者)</FONT>` — `SIZE=-1` + 颜色 `#993300` / `#800000`
    3. `<font size="2" color="#993300">(朝代·作者)</font>` — `size="2"` + 颜色 `#993300` / `#800000`
    4. `&middot;` 实体 — 查找包含 `·` / `&middot;` 的相邻文本，匹配 `(朝代·作者)` 模式
  - 对提取到的文本运行 METADATA_RE，解析 dynasty-author 对
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
- Happy path: 5 个藏目页 + 首页 → 提取 300+ 个朝代-作者对（覆盖 4 种格式）
- Happy path: MetaDictionary.is_dynasty("宋") → True
- Happy path: MetaDictionary.is_dynasty("简明目录") → False
- Happy path: MetaDictionary.get_author_dynasty("苏轼") → "宋"
- Edge case: 空 Catalog 列表 → 空词典
- Edge case: 保存/加载 → 结果一致
- Edge case: 仅 `2史部藏目.htm`（无色标 class 格式）→ 正确提取

**Verification:**
- `uv run bamboo-extract --build-meta-dict 古籍/ --output meta_dict.json` 产出合法 JSON
- 词典包含常见朝代: 汉、唐、宋、明、清
- 词典包含来自 `2史部藏目.htm` 和 `3子部藏目.htm` 的条目
- `pytest tests/test_meta_dict.py` 通过

- [ ] **Unit 1: NLPPlugin Protocol 定义**

**Goal:** 定义 `NLPPlugin` Protocol，包含 segment / recognize_entities / punctuate 三个接口。

**Requirements:** R16 (NLP 层需要独立的技术规范)

**Dependencies:** 无

**Files:**
- Create: `src/bamboo_extract/nlp.py`

**Approach:**
- `NLPPlugin` Protocol:
  - `segment(text: str) -> list[str]` — 分词
  - `recognize_entities(text: str, entity_types: set[str]) -> list[Entity]` — 命名实体识别
  - `punctuate(text: str) -> str` — 标点断句（预留）
- `Entity` dataclass: `text`, `type` (dynasty/person/place/book), `start`, `end`
- 考虑使用 `TypedDict` 或小型 dataclass 替代 raw dict，适配 ty 类型检查

**Patterns to follow:**
- Python `typing.Protocol`
- 参考 `src/bamboo_extract/types.py` 中的 dataclass 定义风格

**Verification:**
- `uv run ruff check src/bamboo_extract/nlp.py` 通过
- Protocol 定义可通过 mypy/ty 类型检查

- [ ] **Unit 2: NLPService 门面**

**Goal:** `NLPService` 门面类，管道只依赖它，不直接依赖具体插件。

**Requirements:** R8, R16

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
- 参考 `src/bamboo_extract/territory.py` 的单一职责设计风格

**Verification:**
- classify_short_text("宋·朱熹") → `{"type": "metadata", "dynasty": "宋", "author": "朱熹"}`
- classify_short_text("洞经教部") → `{"type": "category"}` 或 `{"type": "unknown"}`
- classify_short_text("简明目录") → `{"type": "category"}` 或 `{"type": "unknown"}`

- [ ] **Unit 3: JiebaNLPPlugin 实现**

**Goal:** 基于 jieba 的默认 NLP 插件实现。

**Requirements:** R16

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

**Goal:** Pass 2 改为迭代式候选匹配，每个候选调用 NLPService.classify_short_text 分类。

**Requirements:** R5, R8, R9

**Dependencies:** Unit 0, Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `src/bamboo_extract/passes.py`（pass2_metadata）
- Modify: `src/bamboo_extract/__init__.py`（extract 管道初始化 NLPService + 加载 meta_dict）
- Modify: `src/bamboo_extract/__init__.py`（导出 NLPService, NLPPlugin, JiebaNLPPlugin, MetaDictionary）

**Approach:**
- `pass2_metadata` 内部变化（从"首个匹配即返回"改为"迭代验证"）：
  1. 收集所有 class=metadata 节点和全文扫描的候选文本（不只是第一个）
  2. 对每个候选，调用 `NLPService.classify_short_text(text)`
  3. `{"type": "metadata", "dynasty": ..., "author": ...}` → 返回验证后的结果
  4. 其他类型 → 继续下一个候选
  5. 所有候选都被拒绝 → 返回 None（保持原有 fallback 行为）
- `extract()` 初始化时：
  1. 加载 `meta_dict.json`（如果存在）
  2. 注册 `JiebaNLPPlugin()`
  3. 注入到 `NLPService`
- 如果 `meta_dict.json` 不存在 → 降级为纯正则（向后兼容）

**关于 35% → 60% 提取率目标的说明**: NLP 分类主要解决**误匹配过滤**（false positive elimination），将原本约 10-15% 的误匹配率降至接近 0%。提取率提升依赖于：(a) NLP 验证后更多真实元数据被正确识别而非被正则误判后丢弃；(b) 迭代式候选匹配确保不遗漏后面的正确匹配。具体提升幅度取决于真实数据分布，60% 是保守目标。

**Execution note:** 先写失败测试（现有误匹配案例），验证 NLP 能过滤后通过。

**Test scenarios:**
- Happy path: "(宋·朱熹)" → METADATA_RE 匹配 → NLP 分类为 metadata → dynasty="宋", author="朱熹"
- Happy path: "卷十二 三洞经教部·经三" → METADATA_RE 匹配 → NLP 分类为 category → 拒绝，继续 fallback
- Happy path: "简明目录·序" → METADATA_RE 匹配 → NLP 分类为 category → 拒绝，继续 fallback
- Happy path: 第一个候选被拒绝，第二个候选被接受 → 返回第二个
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
- 动态词典来源：从 Catalog 页面自动提取，不手动维护（经实际验证，300+ 对存在）
- Pass 1/3 暂时不接入 NLP — 本次只做 Pass 2，1/3 后续按需接入
- Catalog 提取需支持 4 种 HTML 格式：class=annotation / FONT SIZE+COLOR / font size+color / &middot; 实体
- 外部数据源（Jiayan/EvaHan/SikuBERT）评估：第一版不引入，集成成本高于收益

### Deferred to Implementation

- 人名识别规则：第一版只依赖词典匹配，复杂的人名识别（如复姓、双名）留给后续
- punctuate 实现：接口定义但不实现，留给 P8/P9
- NLP 性能优化：jieba 初始化延迟、批量处理缓存等，留给 P10 CLI 增强时处理
- Pass 1/3 的 NLP 接入：先验证 Pass 2 效果，再决定是否扩展到 1/3
- jieba 对文言文短文本的分词效果：需要在实现阶段验证，如果效果不理想，可考虑添加自定义词典或使用 pkuseg 等文言文友好的分词器
- `classify_short_text` 返回类型：计划用 raw dict，实现时需决定是否用 TypedDict 或 dataclass 以适配 ty 类型检查

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| jieba 分词结果对文言文不准确 | Medium | Medium | 第一版依赖词典匹配而非纯分词；准备 pkuseg 作为备选 |
| jieba 引入新依赖 | Low | Low | jieba 纯 Python 实现，无 C 扩展，安装简单 |
| NLP 分类增加处理时间 | Low | Low | 单次分类 < 1ms，9000 文件总延迟 < 10s，可接受 |
| 动态词典过时（新增藏书不在词典中）| Low | Medium | 提供 `--build-meta-dict` CLI 命令，每次新增藏书后重新构建 |
| 提取率提升不及预期 | Medium | Medium | 35%→60% 目标依赖迭代式候选匹配；若提升有限，后续可引入 LLM Fallback (R9) |

## System-Wide Impact

- **对 P8 的影响**: P8 不再需要定义 NLP Plugin Protocol — 已在 6B 完成。P8 只需接入 Exporter/Repository。
- **对 P7 的影响**: 质量评估可以使用 NLP 分类结果作为质量指标的一部分。
- **对 P11 的影响**: 全量验证前需要重新构建 meta_dict，确保覆盖率。
- **对 extract() 的影响**: Catalog 路径的元数据提取也需要使用新的多格式提取逻辑（与 Unit 0 共享）。
- **对 pyproject.toml 的影响**: 新增 `jieba >= 0.42.1` 依赖，是项目第一个第三方 NLP 库。
- **Unchanged invariants**: Pass 2 的返回值签名不变（`dict | None`），调用方（extract() 和 catalog 路径）不需要修改接口，只需处理 NLP 增强的内部行为。

## Documentation / Operational Notes

- **CLI 新增命令**: `--build-meta-dict` 参数用于从 Catalog 页面构建动态元数据词典
- **资源文件**: `src/bamboo_extract/resources/meta_dict.json` 需要加入 Python 包的 `package_data` 配置
- **外部数据源策略**: 第一版不引入 Jiayan/EvaHan/SikuBERT，如后续文言文分词效果差再评估

## Sources & References

- **Phase 8 计划** (NLP Plugin 已移至本 Phase 6B): `docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md` Phase 8 U8
- **当前 Pass 2**: `src/bamboo_extract/passes.py:178-207` — pass2_metadata
- **Catalog 数据源**: `古籍/1经部藏目.htm`, `古籍/2史部藏目.htm`, `古籍/3子部藏目.htm`, `古籍/4集部藏目.htm`, `古籍/0古籍首页.htm`
- **抽样测试结果**: `scripts/sampling_test.py` — 100 文件抽样，35% 提取率
- **误匹配案例**: "洞经教部·经三" → dynasty="洞经教部", author="经三"
- **Catalog 格式验证**: 实际验证 `2史部藏目.htm` 使用 `FONT SIZE=-1 COLOR="#993300"`，`3子部藏目.htm` 使用 `font size="2" color="#993300"`，共 300+ 对
- **测试模式参考**: `tests/test_extractors.py` — `_build()` helper, class-based test organization
- **类型检查**: `pyproject.toml` — ty 配置 (`missing-import = "error"`, `unresolved-reference = "error"`)
