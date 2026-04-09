# Bamboo Ink - 古籍现代化改造项目开发指南

## 项目概述

本项目为「古籍图书馆」构建现代化阅读平台，将中国传统古籍以现代技术呈现。

**技术栈**: Astro 6 + TypeScript + Tailwind CSS v4 + OKLCH 颜色系统

**核心特色**: 中国传统色系、楷隶书法字体、模板切换、CSP 安全策略

## 项目结构

1. **首页 (index.astro)** - 四部分类导航、最近更新、功能展示
2. **古籍阅读页 (guji/[slug].astro)** - 古籍内容展示、智能标注、模板切换
3. **基础布局 (BaseLayout.astro)** - 导航、页脚、模板系统

## 开发原则

### 核心开发流程 - 完整改动必须遵守

**每次完整改动都必须经过以下步骤，缺一不可：**

```bash
# 1. 代码审查 - 检查代码质量
bun run lint

# 2. 更新测试用例 - 新增功能必须添加对应测试
# 在 tests/ 目录添加或更新 .test.ts 文件

# 3. 运行测试 - 验证功能正确性
bun run test

# 4. 代码格式化
bun run format

# 5. Astro 类型检查
bun run check

# 6. 构建验证
bun run build

# 7. 完整验证流程（推荐）
bun run validate && bun run test && bun run build
```

**原则说明：**

1. **代码审查优先** - 任何改动必须先通过 lint 检查
2. **测试驱动开发** - 新功能必须先写测试，再写实现
3. **测试覆盖** - 每个功能模块必须有对应测试文件
4. **验证完备** - 提交前必须通过所有验证（lint + test + build）
5. **零容忍** - 任何一步失败都不能提交

### Git 提交规范

```bash
# 提交前必须运行
bun run validate && bun run test

# 约定式提交格式
git commit -m "type: description"

# type 包括:
# - feat: 新功能
# - fix: Bug 修复
# - test: 测试相关
# - docs: 文档更新
# - chore: 构建/工具配置
# - refactor: 代码重构
```

### Astro 最佳实践

#### 组件架构

```astro
---
// 使用 Astro 6 组件脚本
import { getCollection } from 'astro:content';

// 类型安全 Props
interface Props {
  title: string;
  template?: 'classic' | 'simple' | 'deluxe';
}

const { title } = Astro.props;

// 静态数据优先 prerender
const data = await getCollection('guji');
---

<!-- 语义化 HTML -->
<article>
  <slot />
</article>
```

**原则：**

- ✅ 使用 `<script>` 标签定义组件逻辑
- ✅ Props 必须定义 TypeScript 接口
- ✅ 优先静态生成，必要时使用 `prerender = false`
- ✅ 使用 `<slot>` 进行内容投射
- ✅ 组件职责单一，保持 <300 行

#### 动态路由

```typescript
// src/pages/guji/[slug].astro
export async function getStaticPaths() {
  const gujiEntries = await getCollection('guji');

  return gujiEntries.map((entry) => ({
    params: { slug: entry.slug },
    props: { entry },
  }));
}
```

**原则：**

- ✅ 必须实现 `getStaticPaths`
- ✅ 返回 `{ params, props }` 结构
- ✅ 使用 `Astro.params.slug` 访问参数
- ✅ 错误处理：缺失路径返回 404

#### 客户端交互

```astro
<!-- 按需加载客户端 JavaScript -->
<script is:inline>
  // 纯客户端逻辑（模板切换、动画）
  const button = document.querySelector('[data-template]');
  button?.addEventListener('click', handler);
</script>

<!-- 需要打包的脚本 -->
<script>
  // 需要 npm 包的逻辑
  import { something } from 'package';
</script>
```

**原则：**

- ✅ 默认静态，除非必须交互
- ✅ 使用 `is:inline` 避免打包开销
- ✅ 事件委托优于逐个绑定
- ✅ 使用 localStorage 保存状态

#### 数据加载

```astro
---
// 构建时数据（优先）
const staticData = await getCollection('guji');

// 运行时数据（必要时）
export const prerender = false;
const runtimeData = await fetchAPI(Aastro.request.url);
---
```

**原则：**

- ✅ 优先构建时 prerender
- ✅ 运行时数据使用 `prerender = false`
- ✅ 数据验证使用 Zod
- ✅ 错误边界：try-catch 处理 API 失败

#### 图片优化

```astro
---
import Image from 'astro:assets';
import heroImage from '../assets/hero.jpg';
---

<!-- Astro 自动优化 -->
<Image src={heroImage} alt="描述" width="800" height="600" loading="lazy" />
```

**原则：**

- ✅ 使用 `astro:assets` 自动优化
- ✅ 始终提供 `alt` 文本
- ✅ 使用 `loading="lazy"` 懒加载
- ✅ 指定 `width` 和 `height` 避免 CLS
- ✅ 响应式图片使用 `srcset`

#### SEO 优化

```astro
---
const { title, description } = Astro.props;
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---

<head>
  <title>{title} - 古籍图书馆</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalURL} />
  <meta property="og:title" content={title} />
  <meta property="og:image" content="/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
</head>
```

**原则：**

- ✅ 每个页面唯一 `<title>`
- ✅ 提供 `<meta description>`
- ✅ 使用 `<link rel="canonical">`
- ✅ Open Graph 和 Twitter Card 元标签
- ✅ 结构化数据（JSON-LD）

#### 性能优化

```astro
---
// 按需加载重型组件
const HeavyComponent = await import('../components/Heavy.astro').then((m) => m.default);
---

<!-- 使用 view transitions -->
<html lang="zh-CN" style="view-transition-name: root;"></html>
```

**原则：**

- ✅ 使用 Astro Rust 编译器
- ✅ 组件按需加载（`await import`）
- ✅ 启用 View Transitions API
- ✅ 字体使用 `font-display: swap`
- ✅ CSS 使用 `@theme` 定义变量

#### CSP 安全

```javascript
// astro.config.mjs
export default defineConfig({
  security: {
    csp: true,
  },
});
```

**原则：**

- ✅ 启用 CSP 自动哈希
- ✅ 避免内联脚本（使用外部文件）
- ✅ 字体自托管（Fonts API）
- ✅ 定期审查 CSP 报告

### 样式规范

- 使用 Tailwind CSS v4 原子化 CSS
- 中国传统色系 (宣纸/浓墨/朱砂/绢帛/黛色/赭色)
- OKLCH 颜色空间定义
- 响应式设计优先 (Mobile First)
- 使用 CSS 变量实现模板切换

### 字体系统

- 正文：楷体 (`font-kai`)
- 标题：隶书 (`font-li`)
- 印章：篆书 (`font-zhuan`)
- 英文：宋体 (`font-song`)
- 使用 Astro Fonts API 自托管

### 模板系统

- **古典** - 宣纸背景 + 绢帛边框 + 传统纹样
- **简约** - 纯白背景 + 灰色边框 + 无纹样
- **华丽** - 渐变宣纸 + 朱砂边框 + 增强纹样

### 可访问性 (A11y)

```astro
<!-- 语义化 HTML -->
<nav aria-label="主导航">
  <ul>
    <li><a href="/" aria-current="page">首页</a></li>
  </ul>
</nav>

<!-- 图片替代文本 -->
<img src={image} alt="古籍页面扫描图" />

<!-- 表单标签 -->
<label for="search">搜索古籍</label>
<input id="search" type="search" aria-describedby="search-help" />
```

**原则：**

- ✅ 使用语义化 HTML 元素
- ✅ 所有图片提供 `alt` 文本
- ✅ 表单控件关联 `<label>`
- ✅ 颜色对比度符合 WCAG AA
- ✅ 键盘导航支持（`:focus-visible`）

## 可用的 Skills

项目中已配置以下 skills，开发时可直接调用相关技能规范：

### Astro 核心技能

- `astro-best-practices` - Astro 最佳实践
  - 使用 `<script is:inline>` 处理客户端交互
  - 静态站点优先，必要时使用服务端渲染
  - 图片使用 Astro 优化
  - 参考：https://docs.astro.build

### TypeScript 与 JavaScript

- `typescript-advanced-types` - TypeScript 高级类型
  - 接口定义、泛型、条件类型
  - 类型安全的组件 Props
  - Zod 数据验证 (Astro 6 使用 `astro/zod`)

- `modern-javascript-patterns` - 现代 JavaScript 模式
  - ES6+ 特性
  - 异步模式：async/await
  - 函数式编程

### 样式与 UI

- `tailwindcss-v4` - Tailwind CSS v4
  - CSS `@theme` 配置
  - OKLCH 颜色空间
  - 响应式工具类

- `traditional-chinese-colors` - 中国传统色
  - 宣纸色系 (`xuanzhi-*`)
  - 浓墨色系 (`mo-*`)
  - 朱砂色系 (`zhusha-*`)
  - 绢帛色系 (`juanbo-*`)
  - 黛色色系 (`dai-*`)
  - 赭色色系 (`zhu-*`)

### 安全与性能

- `astro-csp` - Content Security Policy
  - Astro 6 内置 CSP 支持
  - 自动脚本哈希
  - 安全头注入

- `astro-rust-compiler` - Astro Rust 编译器
  - 更快的构建速度
  - 更好的错误诊断

### 测试相关

- `vitest` - 单元测试框架
  - 使用 `bun run test` 运行测试
  - 测试文件位于 `tests/` 目录
  - 使用 `bun run test:coverage` 生成覆盖率报告
  - 使用 `bun run test:ui` 打开 Web UI

- `astro-testing` - Astro 测试最佳实践
  - 组件测试使用黑盒方式
  - 测试行为而非实现

### 工具链

- `oxc-toolchain` - OXC 工具链 (可选)
  - Oxlint 代码检查
  - Oxfmt 代码格式化
  - 高性能 Rust 实现

- `agent-browser` - 浏览器自动化
  - QA 测试
  - 截图验证

- `design-review` - 设计审查
  - 视觉一致性检查
  - UI/UX 优化

- `qa` - 质量保证
  - 系统性测试
  - Bug 修复

## 开发流程

### 验证流程

每个功能开发完成后需经过验证：

```bash
# 1. 代码检查
bun run lint

# 2. 代码格式化
bun run format

# 3. Astro 类型检查
bun run check

# 4. 完整验证
bun run validate

# 5. 构建测试
bun run build

# 6. 测试验证（必须）
bun run test
```

### 测试策略

**测试覆盖要求：**

- 新功能必须添加对应测试
- 测试文件位于 `tests/` 目录
- 命名格式：`{FeatureName}.test.ts`
- 测试类型：单元测试 + 集成测试

**测试编写原则：**

1. **黑盒测试** - 测试行为而非实现
2. **边缘情况** - 覆盖边界值和错误情况
3. **回归测试** - Bug 修复必须添加回归测试
4. **测试独立性** - 每个测试用例独立运行

**示例测试结构：**

```typescript
// tests/FeatureName.test.ts
import { describe, it, expect } from 'vitest';

describe('FeatureName', () => {
  it('should work correctly', () => {
    expect(true).toBe(true);
  });

  it('should handle edge cases', () => {
    // 边缘情况测试
  });

  it('should not regress on fix', () => {
    // 回归测试
  });
});
```

### Git 工作流

- `feature/guji-modernization` - 主开发分支
- `feature/astro6-upgrade` - Astro 6 升级分支
- **提交前必须运行** `bun run validate && bun run test`
- 提交信息遵循约定式提交
- **禁止** 无测试的提交

## 项目命令

```bash
# 开发服务器
bun run dev

# 构建静态站点
bun run build

# 预览生产构建
bun run preview

# 古籍转换 (HTML → Markdown)
bun run convert

# 代码检查
bun run lint

# 代码修复
bun run lint:fix

# 代码格式化
bun run format

# 格式化检查
bun run format:check

# Astro 类型检查
bun run check

# 完整验证流程
bun run validate

# 测试命令
bun run test          # 运行单元测试
bun run test:ui       # 打开测试 Web UI
bun run test:coverage # 生成覆盖率报告
```

## 文件结构

```
bamboo-ink/
├── content/           # Markdown 古籍内容
│   ├── 经部/         # 儒家经典
│   ├── 史部/         # 历史典籍
│   ├── 子部/         # 诸子百家
│   └── 集部/         # 文学作品集
├── public/            # 静态资源
│   └── favicon.svg
├── scripts/           # 工具脚本
│   └── convert-htm-to-md.js
├── src/
│   ├── components/    # 可复用组件
│   ├── layouts/       # 布局组件
│   │   └── BaseLayout.astro
│   ├── pages/         # 页面组件
│   │   ├── index.astro
│   │   └── guji/[slug].astro
│   └── styles/        # 全局样式
│       └── global.css
├── tests/             # 测试文件（必须维护）
│   ├── BaseLayout.test.ts
│   └── colors.test.ts
├── astro.config.mjs   # Astro 配置
├── postcss.config.js  # PostCSS 配置
├── vitest.config.ts   # Vitest 测试配置
├── package.json       # 依赖配置
└── tsconfig.json      # TypeScript 配置
```

## 配置说明

### Astro 配置 (astro.config.mjs)

```javascript
import { defineConfig } from 'astro/config';
import { fontProviders } from 'astro/config';

export default defineConfig({
  // 安全配置
  security: {
    csp: true,
  },

  // 性能优化
  experimental: {
    rustCompiler: true,
  },

  // 字体 API
  fonts: [
    {
      name: 'Noto Serif SC',
      cssVariable: '--font-noto',
      provider: fontProviders.fontsource(),
      weights: [300, 400, 500, 600, 700],
    },
  ],

  // 输出配置
  output: 'static',
  build: {
    format: 'file',
  },
});
```

### Tailwind 配置 (src/styles/global.css)

```css
@import 'tailwindcss';

@theme {
  /* 中国传统色 - OKLCH */
  --color-xuanzhi-100: oklch(96% 0.015 85);
  --color-zhusha-500: oklch(48% 0.22 25);
  
  /* 书法字体 */
  --font-kai: 'Kaiti SC', 'STKaiti', ...;
  --font-li: 'LiSu', 'STLiti', ...;
}
```

### 性能监控

**核心性能指标 (Core Web Vitals)：**
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

**优化检查清单：**
```bash
# 构建后检查文件大小
ls -lh dist/

# 使用 Lighthouse 审计
lighthouse http://localhost:4321/

# 检查字体加载
chrome://net-internals/#dns
```

## 注意事项

1. **使用 Bun 包管理器** - 项目配置为 `bunfig.toml`，不使用 npm/yarn
2. **不要提交 .astro/ 目录** - 自动生成文件已在 .gitignore
3. **保持组件简洁** - 单个组件不超过 300 行
4. **类型安全** - Props 和接口定义类型
5. **无障礙性** - 使用语义化 HTML、ARIA 属性
6. **模板切换** - 使用 `data-template` 属性和 localStorage
7. **CSP 兼容性** - 避免内联样式（Shiki 警告可忽略）
8. **测试必须** - 任何功能改动必须更新测试并验证通过
9. **审查优先** - 提交前必须运行 lint 和 test
10. **零容忍** - lint/test/build 任何失败都禁止提交

## 性能优化

- **Rust 编译器** - 构建速度提升 20%
- **Tailwind v4** - 减少依赖，CSS 原生配置
- **静态站点** - 预渲染 HTML，无服务端开销
- **资源优化** - 图片懒加载，字体预加载

## 相关文档

- [README.md](./README.md) - 项目完整说明
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 实施计划
- [TECH-STACK-REVIEW.md](./TECH-STACK-REVIEW.md) - 技术栈审查
- [ASTRO6_MIGRATION.md](./ASTRO6_MIGRATION.md) - Astro 6 迁移指南
- [AGENTS.md](./AGENTS.md) - 项目开发指南

## 设计资源

- **字体**: Noto Serif SC, Ma Shan Zheng (Google Fonts)
- **颜色**: OKLCH 中国传统色
- **纹理**: SVG 宣纸纹理、古典纹样
- **图标**: Heroicons (内联 SVG)

## 联系与反馈

如有问题或建议，请参考项目文档或提交 Issue。
