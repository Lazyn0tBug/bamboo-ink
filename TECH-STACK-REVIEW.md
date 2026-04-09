# 技术栈审查与改进建议

**审查依据**: MetaDev Harness 架构 v2  
**审查日期**: 2026-04-09  
**项目**: bamboo-ink (古籍现代化改造)

---

## 📊 当前技术栈

| 层级       | 当前技术           | 状态        |
| ---------- | ------------------ | ----------- |
| **包管理** | Bun 1.x            | ✅ 现代化   |
| **框架**   | Astro 4.x          | ✅ 静态站点 |
| **样式**   | Tailwind CSS 3.x   | ✅ 原子化   |
| **字体**   | Noto Serif SC      | ✅ 开源字体 |
| **转换**   | Cheerio + Turndown | ⚠️ 基础功能 |
| **搜索**   | 待集成             | ❌ 缺失     |
| **AI**     | 待集成             | ❌ 缺失     |
| **部署**   | 本地               | ⚠️ 需完善   |

---

## 🔍 MetaDev 原则对照

### 1. 关注点分离 ✅

| 原则               | 当前实现                 | 评分       |
| ------------------ | ------------------------ | ---------- |
| 内容/样式/行为分离 | Astro + Tailwind         | ⭐⭐⭐⭐⭐ |
| 布局/页面/组件分离 | layouts/pages/components | ⭐⭐⭐⭐⭐ |
| 转换脚本独立       | scripts/目录             | ⭐⭐⭐⭐⭐ |

**建议**: 保持当前架构，已经很清晰。

---

### 2. AI 优先 ❌

| 原则            | 当前实现 | 评分 | 改进建议     |
| --------------- | -------- | ---- | ------------ |
| AI 特定能力抽象 | 无       | ⭐   | 集成 AI 标注 |
| 多模型支持      | 无       | ⭐   | 支持多 LLM   |
| 知识库建设      | 无       | ⭐   | 向量化存储   |

**改进建议**:

```
优先级 1: AI 智能标注
- 人物识别 (人名、字号、谥号)
- 地名识别 (古今地名对照)
- 典故识别 (成语、典故出处)
- 时间识别 (年号、干支纪年)

优先级 2: AI 问答
- 基于古籍内容的问答
- 文言文翻译
- 背景知识解释

优先级 3: 知识库
- 古籍内容向量化
- 语义搜索
- 关联推荐
```

---

### 3. 工程化落地 ⚠️

| 原则     | 当前实现  | 评分     | 改进建议             |
| -------- | --------- | -------- | -------------------- |
| 批量转换 | 脚本已写  | ⭐⭐⭐⭐ | 增加进度条和错误处理 |
| 质量控制 | 无        | ⭐       | 添加校验和测试       |
| 文档完善 | 有 README | ⭐⭐⭐⭐ | 添加 API 文档        |
| CI/CD    | 无        | ⭐       | 添加 GitHub Actions  |

**改进建议**:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: bun run convert --dry-run
```

---

### 4. 可观测性内建 ❌

| 原则     | 当前实现 | 评分 | 改进建议     |
| -------- | -------- | ---- | ------------ |
| 日志记录 | 无       | ⭐   | 添加转换日志 |
| 错误追踪 | 无       | ⭐   | 添加错误报告 |
| 性能监控 | 无       | ⭐   | 添加性能指标 |
| 审计日志 | 无       | ⭐   | 记录用户行为 |

**改进建议**:

```javascript
// scripts/logger.js
import { writeFile } from 'fs/promises';

export const logger = {
  info: (msg, data) => {
    console.log(`[INFO] ${msg}`, data);
    // 写入日志文件
  },
  error: (msg, error) => {
    console.error(`[ERROR] ${msg}`, error);
    // 写入错误日志
  },
  progress: (current, total, item) => {
    const percent = ((current / total) * 100).toFixed(1);
    console.log(`[PROGRESS] ${percent}% - ${item}`);
  },
};
```

---

## 📋 改进清单

### P0 - 必须改进

| 任务               | 工作量 | 说明               |
| ------------------ | ------ | ------------------ |
| **1. AI 标注集成** | 8h     | 人物/地名/典故识别 |
| **2. 全文搜索**    | 6h     | FlexSearch 集成    |
| **3. 转换日志**    | 2h     | 记录转换过程和错误 |

### P1 - 应该改进

| 任务            | 工作量 | 说明                |
| --------------- | ------ | ------------------- |
| **4. CI/CD**    | 4h     | GitHub Actions 配置 |
| **5. 错误处理** | 4h     | 转换脚本错误恢复    |
| **6. 质量检查** | 4h     | Markdown 格式校验   |

### P2 - 可以改进

| 任务                | 工作量 | 说明             |
| ------------------- | ------ | ---------------- |
| **7. 性能监控**     | 4h     | 页面加载时间监控 |
| **8. 用户行为分析** | 4h     | 阅读习惯统计     |
| **9. API 文档**     | 2h     | 技术文档完善     |

---

## 🎯 技术栈升级建议

### 当前架构

```
┌─────────────────────────────────────┐
│           应用层                     │
│   Astro 静态站点                     │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│         基础设施层                   │
│   文件系统 (Markdown)                │
└─────────────────────────────────────┘
```

### 建议架构 (MetaDev 对齐)

```
┌─────────────────────────────────────┐
│           应用层                     │
│   Astro + AI 问答界面                │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│        编排与执行层 ⭐                │
│   搜索编排 · AI 标注编排             │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│         基础设施层                   │
│   📚 知识层 (向量数据库)             │
│   💾 数据层 (Markdown + JSON)        │
│   🧠 模型层 (LLM API)                │
└─────────────────────────────────────┘
```

---

## 🔧 具体技术方案

### 1. 搜索集成 (优先级：高)

```bash
bun install flexsearch @types/flexsearch
```

```javascript
// src/lib/search.js
import FlexSearch from 'flexsearch';

export const searchIndex = new FlexSearch.Document({
  tokenize: 'forward',
  document: {
    id: 'id',
    index: ['title', 'content', 'section'],
  },
});

// 构建索引
export async function buildIndex(posts) {
  posts.forEach((post) => {
    searchIndex.add({
      id: post.id,
      title: post.title,
      content: post.content,
      section: post.section,
    });
  });
}

// 搜索
export function search(query, limit = 20) {
  return searchIndex.search(query, { limit });
}
```

### 2. AI 标注集成 (优先级：高)

```bash
bun install ai
```

```javascript
// src/lib/ai-annotate.js
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  baseURL: 'https://api.siliconflow.cn/v1', // 或使用其他提供商
  apiKey: process.env.OPENAI_API_KEY,
});

export async function annotate(text) {
  const { object } = await generateObject({
    model: openai('Qwen/Qwen2.5-72B-Instruct'),
    schema: z.object({
      persons: z.array(z.string()),
      locations: z.array(z.string()),
      allusions: z.array(z.string()),
      dates: z.array(z.string()),
    }),
    prompt: `请标注以下古籍文本中的人物、地名、典故、时间：\n\n${text}`,
  });

  return object;
}
```

### 3. 向量数据库 (优先级：中)

```bash
bun install @qdrant/js-client-rest
```

```javascript
// src/lib/vector-db.js
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

// 存储文本块
export async function storeEmbedding(id, text, embedding) {
  await client.upsert('guji-texts', {
    points: [
      {
        id,
        vector: embedding,
        payload: { text, created_at: new Date().toISOString() },
      },
    ],
  });
}

// 语义搜索
export async function semanticSearch(query, limit = 10) {
  const queryEmbedding = await embed(query);
  const results = await client.search('guji-texts', {
    vector: queryEmbedding,
    limit,
  });
  return results;
}
```

### 4. 监控和日志 (优先级：中)

```javascript
// scripts/logger.js
import { writeFile, appendFile } from 'fs/promises';
import { join } from 'path';

const LOG_DIR = './logs';
const CONVERT_LOG = join(LOG_DIR, 'convert.log');
const ERROR_LOG = join(LOG_DIR, 'error.log');

export const logger = {
  async info(msg, data = {}) {
    const line = `[${new Date().toISOString()}] [INFO] ${msg} ${JSON.stringify(data)}\n`;
    await appendFile(CONVERT_LOG, line);
    console.log(line.trim());
  },

  async error(msg, error) {
    const line = `[${new Date().toISOString()}] [ERROR] ${msg}\n${error.stack}\n`;
    await appendFile(ERROR_LOG, line);
    console.error(line.trim());
  },

  async progress(current, total, item) {
    const percent = ((current / total) * 100).toFixed(1);
    const msg = `[PROGRESS] ${percent}% (${current}/${total}) - ${item}`;
    await this.info(msg);
  },
};
```

---

## 📊 改进优先级矩阵

```
重要性
  ↑
高│  1. AI 标注    │  3. 转换日志
  │  2. 全文搜索   │  4. CI/CD
  │───────────────┼───────────────
低│  7. 性能监控   │  9. API 文档
  │  8. 用户行为   │  5. 错误处理
  └───────────────┴───────────────→
     紧急           不紧急
```

---

## 🎯 下一步行动

### 立即实施 (本周)

1. ✅ 添加全文搜索 (FlexSearch)
2. ✅ 集成 AI 标注 (Qwen API)
3. ✅ 添加转换日志

### 下周实施

4. ✅ 配置 CI/CD (GitHub Actions)
5. ✅ 完善错误处理
6. ✅ 质量检查脚本

### 后续优化

7. 向量数据库集成
8. 用户行为分析
9. API 文档完善

---

**审查者**: 虾龙 AI 助手 🦐  
**审查日期**: 2026-04-09  
**下次审查**: 实施改进后重新审查
