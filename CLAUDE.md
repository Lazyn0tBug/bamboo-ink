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

### Astro 最佳实践

- 使用 Astro 6 静态站点生成
- 优先使用 Astro 组件语法
- 动态路由实现 `getStaticPaths`
- 客户端脚本使用 `is:inline` 或 `is:script`

### 样式规范

- 使用 Tailwind CSS v4 原子化 CSS
- 中国传统色系 (宣纸/浓墨/朱砂/绢帛/黛色/赭色)
- OKLCH 颜色空间定义
- 响应式设计优先 (Mobile First)

### 字体系统

- 正文：楷体 (`font-kai`)
- 标题：隶书 (`font-li`)
- 印章：篆书 (`font-zhuan`)
- 英文：宋体 (`font-song`)

### 模板系统

- **古典** - 宣纸背景 + 绢帛边框 + 传统纹样
- **简约** - 纯白背景 + 灰色边框 + 无纹样
- **华丽** - 渐变宣纸 + 朱砂边框 + 增强纹样

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

- `astro-testing` - Astro 测试最佳实践
  - 使用 Vitest 进行单元测试
  - 使用 Playwright 进行 E2E 测试

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
```

### Git 工作流

- `feature/guji-modernization` - 主开发分支
- `feature/astro6-upgrade` - Astro 6 升级分支
- 提交前运行 `bun run validate`
- 提交信息遵循约定式提交

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
├── astro.config.mjs   # Astro 配置
├── postcss.config.js  # PostCSS 配置
├── package.json       # 依赖配置
└── tsconfig.json      # TypeScript 配置
```

## 配置说明

### Astro 配置 (astro.config.mjs)

```javascript
export default defineConfig({
  security: { csp: true }, // CSP 安全策略
  experimental: { rustCompiler: true }, // Rust 编译器
  output: 'static', // 静态站点
  build: { format: 'file' }, // 文件输出格式
});
```

### Tailwind 配置 (src/styles/global.css)

```css
@import 'tailwindcss';

@theme {
  /* 中国传统色 - OKLCH */
  --color-xuanzhi-100: oklch(96% 0.015 85);
  --color-zhusha-500: oklch(48% 0.22 25);
  /* ... */

  /* 书法字体 */
  --font-kai: 'Kaiti SC', 'STKaiti', ...;
  --font-li: 'LiSu', 'STLiti', ...;
}
```

## 注意事项

1. **使用 Bun 包管理器** - 项目配置为 `bunfig.toml`，不使用 npm/yarn
2. **不要提交 .astro/ 目录** - 自动生成文件已在 .gitignore
3. **保持组件简洁** - 单个组件不超过 300 行
4. **类型安全** - Props 和接口定义类型
5. **无障礙性** - 使用语义化 HTML、ARIA 属性
6. **模板切换** - 使用 `data-template` 属性和 localStorage
7. **CSP 兼容性** - 避免内联样式（Shiki 警告可忽略）

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
