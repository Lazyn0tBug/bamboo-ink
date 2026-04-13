# Bug 4: Pattern cache 只写不读

## 表现描述

`patternCache` 在 `extractContent` 中被 `analyzeAndCache` 写入，但从未被读取。每次提取都重新分析 HTML，即使同一本书的 patterns 已在缓存中。

## 位置

`scripts/lib/extractors.mjs:1057-1059`

## Diff

```diff
-import { flattenTables, analyzeAndCache } from './pattern-cache.mjs';
+import { flattenTables, analyzeAndCache, hasCachedPatterns } from './pattern-cache.mjs';

   // ── Populate Pattern Cache (A4) ──────────────────────────────────
   if (options.patternCache && ir.title && ir.title !== 'Untitled') {
-    analyzeAndCache(options.patternCache, html, ir.title);
+    if (!hasCachedPatterns(options.patternCache, ir.title)) {
+      analyzeAndCache(options.patternCache, html, ir.title);
+    }
   }
```

## 修复逻辑

在 `analyzeAndCache` 之前加 `hasCachedPatterns` 检查。如果该书已有缓存，跳过重复分析。

## 预期输出示例

修复前：同一本书的每个文件都重新分析 patterns。
修复后：第一文件分析并缓存，后续文件跳过分析（缓存命中）。

## 受影响文件数

所有使用 `patternCache` 选项调用的古籍批量提取场景。批量处理同一本书时，每个文件都避免了重复的 pattern 分析开销。

## 回归测试

`tests/content-extractor.test.ts`: "should read from patternCache on second extraction (not re-analyze)"
