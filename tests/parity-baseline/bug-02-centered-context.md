# Bug 2: isInCenteredContext 缺失 CSS 类判断

## 表现描述

`isInCenteredContext` 只检查 `data-center` 和 `align="center"`，但不检查 `style="text-align:center"`。某些 FrontPage 模板使用内联 CSS 而非 HTML 属性来居中内容，导致居中的章节标题（如 `H2` 包裹在 `style="text-align:center"` 的 `DIV` 中）无法被 Pass 3 识别为章节标题。

## 位置

`scripts/lib/extractors.mjs:270`

## Diff

```diff
+  if (/text-align\s*:\s*center/i.test($node.attr('style') || '')) return true;
   let found = false;
   $node.parents().each((_, p) => {
     ...
+    if (/text-align\s*:\s*center/i.test($p.attr('style') || '')) {
+      found = true;
+      return;
+    }
   });
```

## 修复逻辑

在 `isInCenteredContext` 中，对节点自身和其父节点都增加 `style` 属性中 `text-align:center` 的检查（大小写不敏感，容忍冒号前后空格）。

## 预期输出示例

修复前：`<DIV style="text-align:center"><H2>第二章</H2></DIV>` → 章节标题未被提取（0 chapters）。
修复后：同一 HTML → 正确提取 "第二章" 为章节标题。

## 受影响文件数

使用 `style="text-align:center"` 而非 `<center>` 或 `align="center"` 的古籍 HTML 文件。

## 回归测试

`tests/content-extractor.test.ts`: "should find chapter-titles from style=\"text-align:center\" wrapper"
