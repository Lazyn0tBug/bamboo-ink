# 古籍元数据语义字典规范

> **版本**: v0.1
> **创建日期**: 2026-04-10
> **状态**: 草案
> **维护**: 随转换进度逐步扩充

## 1. 目的

本规范定义古籍元数据语义字典的结构、内容和使用方式，解决以下问题：

1. **命名不统一** — 源 HTML 中同一朝代/作者/书籍有多种写法（如「南宋」「宋代」「赵宋」）
2. **验证缺失** — 转换后的 frontmatter 无法自动校验 category/author/dynasty 是否合法
3. **浏览器端检查** — 客户端加载 Markdown 后，可用字典校验元数据一致性
4. **转换脚本参考** — 元数据提取时做模糊匹配而非硬编码规则

## 2. 字典文件

### 2.1 位置

```
scripts/lib/dictionary.json    — 字典数据（机器可读）
docs/specs/guji-semantic-dictionary.md — 本规范文档（人类可读）
```

### 2.2 格式

JSON 对象，包含四个顶级域：`dynasties`、`categories`、`authors`、`books`。

## 3. 数据结构

### 3.1 朝代域（dynasties）

```json
{
  "dynasties": [
    {
      "canonical": "宋",
      "aliases": ["宋代", "赵宋", "南宋", "北宋", "两宋"],
      "period_start": 960,
      "period_end": 1279,
      "era_names": ["建隆", "乾德", "..."]
    }
  ]
}
```

| 字段           | 类型     | 必填 | 说明                               |
| -------------- | -------- | ---- | ---------------------------------- |
| `canonical`    | string   | 是   | 标准朝代名，frontmatter 中统一使用 |
| `aliases`      | string[] | 是   | 所有别名，包含 canonical 本身      |
| `period_start` | number   | 否   | 公元起始年（CE，公元前为负）       |
| `period_end`   | number   | 否   | 公元结束年                         |
| `era_names`    | string[] | 否   | 该朝代常见年号列表                 |

### 3.2 分类域（categories）

```json
{
  "categories": [
    {
      "canonical": "经部",
      "subcategories": [
        {
          "canonical": "易类",
          "aliases": ["易", "周易类"]
        },
        {
          "canonical": "書类",
          "aliases": ["書", "尚书类", "尚書类"]
        }
      ]
    }
  ]
}
```

| 字段                        | 类型     | 必填 | 说明                   |
| --------------------------- | -------- | ---- | ---------------------- |
| `canonical`                 | string   | 是   | 标准部类名             |
| `subcategories`             | object[] | 是   | 下属子类，按四部分类法 |
| `subcategories[].canonical` | string   | 是   | 子类标准名             |
| `subcategories[].aliases`   | string[] | 是   | 子类别名               |

### 3.3 作者域（authors）

```json
{
  "authors": [
    {
      "canonical": "吕本中",
      "aliases": ["吕本中", "吕居仁", "东莱先生"],
      "dynasty": "宋",
      "birth_year": 1084,
      "death_year": 1145,
      "courtesy_name": "居仁",
      "art_name": "东莱先生"
    }
  ]
}
```

| 字段            | 类型     | 必填 | 说明                                 |
| --------------- | -------- | ---- | ------------------------------------ |
| `canonical`     | string   | 是   | 标准作者名                           |
| `aliases`       | string[] | 是   | 所有别名（含本名、字、号、谥号）     |
| `dynasty`       | string   | 是   | 所属朝代（引用 dynasties.canonical） |
| `birth_year`    | number   | 否   | 出生年                               |
| `death_year`    | number   | 否   | 卒年                                 |
| `courtesy_name` | string   | 否   | 字                                   |
| `art_name`      | string   | 否   | 号                                   |

### 3.4 典籍域（books）

```json
{
  "books": [
    {
      "canonical": "官箴",
      "aliases": ["官箴"],
      "category": "子部",
      "subcategory": "儒家类",
      "author": "吕本中",
      "dynasty": "宋"
    }
  ]
}
```

| 字段          | 类型     | 必填 | 说明                                |
| ------------- | -------- | ---- | ----------------------------------- |
| `canonical`   | string   | 是   | 典籍标准名                          |
| `aliases`     | string[] | 是   | 所有别名（含简称、异名）            |
| `category`    | string   | 是   | 所属部（引用 categories.canonical） |
| `subcategory` | string   | 否   | 所属子类                            |
| `author`      | string   | 否   | 作者（引用 authors.canonical）      |
| `dynasty`     | string   | 否   | 成书朝代                            |

## 4. API 规范

字典加载器 (`scripts/lib/dictionary-loader.js`) 提供以下接口：

### 4.1 normalize(field, value)

将别名映射到 canonical 值。

```javascript
normalize('dynasty', '南宋'); // → "宋"
normalize('dynasty', '宋'); // → "宋"（已是 canonical）
normalize('author', '吕居仁'); // → "吕本中"
normalize('author', '未知作者'); // → "未知作者"（未知值返回原值 + warn）
```

| 参数    | 类型                                            | 说明                               |
| ------- | ----------------------------------------------- | ---------------------------------- |
| `field` | `"dynasty" \| "author" \| "book" \| "category"` | 字段类型                           |
| `value` | string                                          | 待归一化的值                       |
| 返回值  | string                                          | canonical 值，或原始值（未匹配时） |

### 4.2 validate(field, value)

检查值是否在字典中。

```javascript
validate('dynasty', '宋'); // → true
validate('dynasty', '道部'); // → false（不是合法朝代）
validate('category', '经部'); // → true
```

| 参数    | 类型                                                             | 说明                                 |
| ------- | ---------------------------------------------------------------- | ------------------------------------ |
| `field` | `"dynasty" \| "author" \| "book" \| "category" \| "subcategory"` | 字段类型                             |
| `value` | string                                                           | 待校验的值                           |
| 返回值  | boolean                                                          | 是否在字典的 aliases 或 canonical 中 |

### 4.3 lookup(field, value)

返回完整记录。

```javascript
lookup('author', '吕本中');
// → { canonical: "吕本中", aliases: [...], dynasty: "宋", ... }

lookup('author', '吕居仁');
// → 同上（通过别名查找）
```

### 4.4 getAll(field)

返回某字段的所有 canonical 值列表。

```javascript
getAll('dynasty');
// → ["夏", "商", "周", "秦", "汉", "唐", "宋", ...]
```

## 5. 使用场景

### 5.1 转换脚本中的元数据归一化

```javascript
// convert-htm-to-md.js
const dict = loadDictionary();

// 从 HTML title 提取到 "官箴(南宋·吕本中)"
const raw = parseTitle('官箴(南宋·吕本中)');
// raw = { book: "官箴", dynasty: "南宋", author: "吕本中" }

const normalized = {
  book: dict.normalize('book', raw.book), // → "官箴"
  dynasty: dict.normalize('dynasty', raw.dynasty), // → "宋"
  author: dict.normalize('author', raw.author), // → "吕本中"
};
```

### 5.2 Content Collections Schema 验证

```typescript
// src/content/config.ts
import { dict } from '../../scripts/lib/dictionary-loader.mjs';

const dynastyValues = dict.getAll('dynasty');
const categoryValues = dict.getAll('category');

export const gujiSchema = z.object({
  dynasty: z.enum(dynastyValues as [string, ...string[]]),
  category: z.enum(categoryValues as [string, ...string[]]),
  // ...
});
```

### 5.3 浏览器端校验（可选）

```javascript
// 客户端加载 Markdown 后校验元数据
const dict = await fetch('/dictionary.json').then((r) => r.json());
const meta = extractFrontmatter(markdown);

if (!dict.dynasties.some((d) => d.aliases.includes(meta.dynasty))) {
  console.warn(`[guji] Unknown dynasty: "${meta.dynasty}" in ${meta.title}`);
}
```

### 5.4 批量验证脚本

```bash
# 验证所有已转换的 Markdown 文件的 frontmatter
bun run scripts/validate-frontmatter.js
# 输出所有未通过字典校验的字段
```

## 6. 维护规则

### 6.1 扩充流程

1. 转换新批次古籍时，从源 HTML 中提取新的作者/典籍/年号
2. 运行 `bun run scripts/dictionary-suggest.js` 自动建议新条目
3. 人工审核后添加到 `dictionary.json`
4. 提交时附带 commit message 说明新增条目

### 6.2 命名原则

- **canonical 名**：使用最常见、最学术认可的标准写法
  - 朝代：用最短名（「宋」而非「宋代」「赵宋」）
  - 作者：用本名（「吕本中」而非「吕居仁」）
  - 典籍：用通行简称（「官箴」「资治通鉴」）
- **aliases**：尽可能收录所有变体，包括：
  - 简繁体（「尚書」/「尚书」）
  - 带/不带书名号（「《论语》」/「论语」）
  - 带/不带朝代前缀（「宋·苏轼」/「苏轼」）
  - 字号谥号（「东坡」/「苏轼」/「苏东坡」）

### 6.3 版本管理

字典文件不引入版本号，以 git 历史追踪变更。重大变更应在 PR 描述中说明影响范围。

## 7. 最小可用版本范围

首次交付时，字典应至少包含从已采样源 HTML 中提取的条目：

| 域         | 最小范围                 | 预估条目数 |
| ---------- | ------------------------ | ---------- |
| dynasties  | 源 HTML 中出现的所有朝代 | ~30        |
| categories | 四部 + 常见子类          | ~60        |
| authors    | 已采样文件中出现的作者   | ~50        |
| books      | 已采样文件中出现的典籍   | ~50        |

后续随转换进度逐步扩充，目标覆盖全部 9000+ 文件中出现的元数据。

## 8. 与外部权威数据的关系

本字典为项目内部使用，不追求与 CBDB/CTEXT 的完全兼容。但预留以下扩展点：

- `authors` 可添加 `cbdb_id` 字段对接中国历代人物传记数据库
- `books` 可添加 `ctext_urn` 字段对接中国哲学书电子化计划
- `dynasties` 的 `period_start/period_end` 可对接标准历史年表
