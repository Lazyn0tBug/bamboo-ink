# 更新日志

所有重要的项目变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Updated
- 降级 Astro 5.x → 4.16.19 (稳定版)
- 使用 Tailwind CSS 3.4.19 (稳定版)
- 使用 @astrojs/tailwind 5.1.5
- 升级 cheerio 1.0.0-rc.12 → 1.0.0
- 升级 turndown 7.1.2 → 7.2.0

### Changed
- 修复 CSS 配置为 Tailwind v3 语法
- 移除不兼容的 @tailwindcss/postcss

---

## [1.0.0] - 2026-04-09

### Added
- 项目初始化
- Astro 框架 + Tailwind CSS
- 三种阅读模板（古典/简约/华丽）
- 首页和阅读页面
- HTML→Markdown 转换脚本
- GitHub 仓库 (bamboo-ink)
- Bun 包管理
- 技术栈审查文档

### Changed
- 仓库名从 `guji-modern` 改为 `bamboo-ink`

---

## 版本说明

### 主要版本 (Major)
- 架构变更或不兼容的 API 变更

### 次要版本 (Minor)  
- 新功能添加，向后兼容

### 补丁版本 (Patch)
- Bug 修复和小改进，向后兼容
