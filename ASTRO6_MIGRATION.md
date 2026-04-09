# Astro 6 迁移计划

## 主要变更

### 1. Node.js 版本要求

- **最低版本**: Node 22+
- **现状**: 当前项目未指定 Node 版本
- **行动**: 更新 `.nvmrc` 和 `package.json` engines

### 2. 依赖升级

| 依赖  | 当前版本 | Astro 6 要求           |
| ----- | -------- | ---------------------- |
| Vite  | -        | v7+                    |
| Shiki | -        | v4+                    |
| Zod   | -        | v4+ (使用 `astro/zod`) |

### 3. 新功能利用

- [ ] **Fonts API** - 替代当前 Google Fonts 链接
- [ ] **Content Security Policy** - 增强安全性
- [ ] **Live Content Collections** - 可选，用于动态内容
- [ ] **Rust Compiler** (实验) - 性能提升

## 迁移状态

### ✅ 已完成 (2026-04-09)

- [x] Node.js 升级到 v22.14.0
- [x] Astro 升级到 v6.1.5
- [x] @astrojs/tailwind 升级到 v6.0.2
- [x] 构建测试通过
- [x] Lint/Format/Check 全部通过
- [x] 无破坏性变更

### 🔄 待优化

- [ ] 迁移到 Astro Fonts API (当前使用 Google Fonts 链接)
- [ ] 启用 Content Security Policy
- [ ] 评估 Live Content Collections
- [ ] 测试 Rust 编译器 (实验性)

## 当前项目状态

### 已配置

- ✅ Prettier + ESLint + Astro Check
- ✅ 传统中国色系统 (OKLCH)
- ✅ 楷隶字体系统
- ✅ 模板切换功能

### 待迁移

- 🔄 Google Fonts → Astro Fonts API
- 📝 考虑启用 CSP
- 📝 评估 Live Collections

## 风险点

1. **Tailwind 配置** - 当前使用 v3 语法，Astro 6 不强制 v4
2. **自定义组件** - 需测试所有 `.astro` 组件
3. **脚本文件** - `convert-htm-to-md.js` 不受影响

## 回滚计划

如需回滚：

```bash
git checkout feature/guji-modernization
bun install
```

## 时间估算

| 阶段     | 预计时间    |
| -------- | ----------- |
| 准备     | 15 分钟     |
| 升级     | 30 分钟     |
| 修复     | 1-2 小时    |
| 优化     | 可选        |
| **总计** | **~2 小时** |
