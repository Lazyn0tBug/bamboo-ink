# 古籍现代化改造项目

> 传承中华文化，让古籍阅读更现代化

[![GitHub](https://img.shields.io/badge/GitHub-bamboo--ink-24292e?logo=github)](https://github.com/Lazyn0tBug/bamboo-ink)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?logo=bun)](https://bun.sh/)
[![Astro](https://img.shields.io/badge/Astro-5.x-ff5e57?logo=astro)](https://astro.build/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)

## 📋 项目状态

- [x] 项目框架搭建
- [x] 样式系统设计（3 种模板）
- [x] 首页和阅读页面样板
- [ ] HTML→Markdown 转换脚本
- [ ] 语义搜索集成
- [ ] AI 智能标注
- [ ] 批量转换

## 🎨 设计特点

### 三种阅读模板

| 模板     | 特点                         | 适用场景       |
| -------- | ---------------------------- | -------------- |
| **古典** | 宣纸背景、传统纹样、朱砂配色 | 深度阅读、研究 |
| **简约** | 白色背景、现代排版           | 快速浏览、查询 |
| **华丽** | 渐变背景、精致边框           | 展示、分享     |

### 配色方案

采用中国传统色：

- **宣纸白** `#F7F5F0` - 背景色
- **浓墨** `#2C2C2C` - 主文字色
- **朱砂** `#C43C3C` - 强调色
- **绢帛** `#E0D8C8` - 边框色

### 字体选择

- **正文**: Noto Serif SC (思源宋体)
- **UI**: Noto Sans SC (思源黑体)

## 🚀 快速开始

### 前置要求

- [Bun](https://bun.sh/) 1.0+ (推荐使用 Bun 管理项目)

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash
```

### 安装依赖

```bash
bun install
```

### 开发模式

```bash
bun run dev
```

访问 http://localhost:4321

### 构建

```bash
bun run build
bun run preview
```

### 转换古籍

```bash
bun run convert
```

## 📁 目录结构

```
guji-modern/
├── content/            # 古籍内容 (Markdown)
│   ├── 经/
│   ├── 史/
│   ├── 子/
│   └── 集/
├── src/
│   ├── layouts/        # 布局模板
│   │   └── BaseLayout.astro
│   ├── components/     # 可复用组件
│   ├── pages/          # 页面
│   │   ├── index.astro
│   │   └── guji/
│   │       └── [slug].astro
│   └── styles/         # 全局样式
├── scripts/
│   └── convert-htm-to-md.js  # 转换脚本
├── public/
│   └── fonts/          # 字体文件
└── package.json
```

## 📖 功能规划

### 已完成 ✅

1. **项目框架** - Astro + Tailwind CSS
2. **模板系统** - 古典/简约/华丽三种主题
3. **首页设计** - 四部分类导航、最近更新
4. **阅读页面** - 正文、侧边栏标注、工具栏

### 待实施 🚧

#### 阶段 1: 转换 (优先级高)

- [ ] 完善转换脚本
- [ ] 批量转换 HTML→Markdown
- [ ] 人工校对关键章节

#### 阶段 2: 搜索 (优先级中)

- [ ] 集成 FlexSearch
- [ ] 全文索引
- [ ] 搜索 UI

#### 阶段 3: AI 标注 (优先级中)

- [ ] 接入 LLM API
- [ ] 人物/地名/典故识别
- [ ] 标注展示组件

#### 阶段 4: 优化 (优先级低)

- [ ] 夜间模式
- [ ] 字体大小调节
- [ ] 阅读进度保存
- [ ] 书签功能

## 🛠️ 技术栈

| 类别       | 技术              | 版本   |
| ---------- | ----------------- | ------ |
| **包管理** | Bun               | 1.x    |
| **框架**   | Astro             | 5.x ⭐ |
| **样式**   | Tailwind CSS      | 4.x ⭐ |
| **集成**   | @astrojs/tailwind | 6.x    |
| **字体**   | Noto Serif SC     | Latest |
| **转换**   | Cheerio           | 1.x    |
| **转换**   | Turndown          | 7.x    |
| **搜索**   | FlexSearch        | 待集成 |
| **AI**     | OpenAI API        | 待集成 |

## 📝 实施计划

### 第一周：样板确认

- [x] 项目框架
- [x] 样式设计
- [x] 页面模板
- [ ] **待确认**: 设计风格、功能优先级

### 第二周：批量转换

- [ ] 转换脚本完善
- [ ] 处理编码问题
- [ ] 转换前 100 部经典

### 第三周：搜索集成

- [ ] 全文索引
- [ ] 搜索 UI
- [ ] 性能优化

### 第四周：AI 功能

- [ ] 智能标注
- [ ] AI 问答
- [ ] 知识图谱

## 🎯 成功标准

| 指标           | 目标        |
| -------------- | ----------- |
| **加载速度**   | < 1 秒      |
| **移动端适配** | 100% 响应式 |
| **搜索速度**   | < 100ms     |
| **标注准确率** | > 90%       |

## 📄 许可证

MIT

---

**项目创建**: 2026-04-09  
**负责人**: 付宗波  
**开发**: 虾龙 AI 助手 🦐
