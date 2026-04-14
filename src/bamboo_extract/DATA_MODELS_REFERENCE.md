# bamboo-extract 数据模型备查表

> 本文档记录所有数据模型的使用场景、序列化需求、表现方式，以及替换指南。
> 当需要更换某个模型的表现方式时（如 TypedDict → Pydantic，或反之），查阅此表。

## 表现方式选择原则

| 表现方式 | 适用场景 | 优点 | 缺点 |
|----------|---------|------|------|
| **Pydantic BaseModel** | 序列化/持久化、跨边界传输、需要验证 | 自动序列化、验证、类型安全 | 运行时开销大 |
| **TypedDict** | 函数间中间数据、短生命周期、需要类型提示 | 零开销、类型安全 | 不能验证、运行时只是 dict |
| **dataclass** | 内部传递、有方法/行为、不需要序列化 | 零开销、有方法、可变/不可变均可 | 无内置序列化 |
| **plain dict** | 临时数据、无类型要求的场景 | 最灵活 | 无类型安全 |

## 序列化/持久化层 — Pydantic BaseModel

这些模型是最终输出 IR 的一部分，需要 `.model_dump()` / `.model_validate()` 能力。

| 模型 | 文件 | 字段 | 消费者 | 可否替换为 TypedDict | 备注 |
|------|------|------|--------|-------------------|------|
| `ContentIR` | `types.py:30` | title, source, docType, dynasty, author, chapters, navItems | 前端 JSON 响应、测试 fixture | ❌ 不能 — 需要序列化+验证 | IR 根对象 |
| `Chapter` | `types.py:20` | title, sections | ContentIR 嵌套 | ❌ 不能 | 嵌套序列化 |
| `Section` | `types.py:14` | type, content, annotations | Chapter 嵌套 | ❌ 不能 | 嵌套序列化 |
| `Annotation` | `types.py:10` | text | Section 嵌套 | ❌ 不能 | 嵌套序列化 |
| `NavItem` | `types.py:25` | href, label | ContentIR 嵌套 | ❌ 不能 | 嵌套序列化 |

**替换场景**：如果某个 IR 模型只需要在 Python 内部传递（例如纯后端处理，不输出 JSON），可以替换为 TypedDict。但当前所有 IR 模型都需要 JSON 序列化，**必须保持 Pydantic**。

## 中间传递层 — TypedDict

这些模型的返回值生命周期短，创建后立即被消费，不需要序列化。

| 模型 | 文件 | 字段 | 消费者 | 可否替换为 Pydantic | 备注 |
|------|------|------|--------|-------------------|------|
| `ClassificationResult` | `nlp_service.py:18-32` | type + dynasty/author (variant) | pass2_metadata 立即消费 | ⚠️ 可以但不推荐 — 增加无谓开销 | 联合类型 `_MetadataResult \| _CategoryResult \| _UnknownResult` |

## 内部结构层 — dataclass

这些模型在运行时内部使用，有方法/行为，不需要 Pydantic 序列化。

| 模型 | 文件 | 字段 | 方法 | 可否替换为 Pydantic | 备注 |
|------|------|------|------|-------------------|------|
| `NodeProxy` | `types.py:43` | node_id, tag, attrs, text, node_id_attr | 无 | ⚠️ 可以但不推荐 | DOM 节点快照，纯内部 |
| `DOMIndex` | `types.py:58` | by_color, by_class, by_tag, by_size, all_text_nodes, parent_map, text_by_id, attrs_by_id, children_map | 无 | ⚠️ 可以但不推荐 | 大型索引结构，Pydantic 开销大 |
| `Entity` | `nlp.py:14` | text, type | 无 | ⚠️ 可以但不推荐 | Plugin→Service 间短生命周期传递 |
| `MetaDictionary` | `meta_dict.py:25` | dynasties, authors, dynasty_authors | is_dynasty, is_author, get_author_dynasty, get_dynasty_authors, add_pair, save, load | ⚠️ 可以但不推荐 — save/load 已手动实现 | 有行为的词典对象，不是纯数据 |

## 纯 dict 传递 — 可考虑 TypedDict

这些是 Pass 层返回的纯 dict，没有类型约束。可以添加 TypedDict 提高类型安全。

| 返回值 | 文件 | 结构 | 消费者 | 建议 | 优先级 |
|--------|------|------|--------|------|--------|
| pass2 返回值 | `passes.py:187` | `{"dynasty": str, "author": str} \| None` | `extract()` | 添加 `MetadataResult(TypedDict)` | P3 低 |
| pass3 返回列表 | `passes.py:256` | `[{"title": str, "node_id": int}]` | `extract()` | 添加 `ChapterTitleEntry(TypedDict)` | P3 低 |
| pass4 返回列表 | `passes.py:314` | `[{"text": str, "node_id": int}]` | `assemble_results()` | 添加 `AnnotationEntry(TypedDict)` | P3 低 |
| extract_remaining | `territory.py:37` | `[{"type": str, "content": str, "node_ids": list[int]}]` | (未使用) | 如将来使用可添加 TypedDict | P3 低 |

## 特殊结构

| 模型 | 文件 | 类型 | 备注 |
|------|------|------|------|
| `Territory` | `territory.py:6` | 普通 class | 状态跟踪器，不是数据模型 |
| `NLPPlugin` | `nlp.py:22` | Protocol | 接口定义，不是数据模型 |
| `NLPService` | `nlp_service.py:35` | 普通 class | 门面类，不是数据模型 |
| `JiebaNLPPlugin` | `jieba_plugin.py:15` | 普通 class | Plugin 实现，不是数据模型 |

## 替换决策树

当需要将某个数据模型更换表现方式时，按以下流程决策：

```
需要序列化/JSON 输出？
├── 是 → 使用 Pydantic BaseModel
│   └── 需要运行时验证输入？→ 保持 Pydantic
│   └── 不需要验证，只序列化？→ Pydantic（最小验证开销）
└── 否 → 只在 Python 内部传递
    ├── 需要方法/行为？→ 使用 dataclass 或普通 class
    ├── 只需要类型提示？→ 使用 TypedDict
    └── 纯临时数据？→ 使用 plain dict
```

## 当前状态总结

- **Pydantic (5)**: ContentIR, Chapter, Section, Annotation, NavItem — ✅ 正确
- **dataclass (4)**: NodeProxy, DOMIndex, Entity, MetaDictionary — ✅ 正确
- **TypedDict (4)**: ClassificationResult (+ 3 variants) — ✅ 正确
- **plain dict (4)**: pass2/3/4 返回值, extract_remaining — ⚠️ 可改善但非必需
