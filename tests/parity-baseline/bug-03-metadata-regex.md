# Bug 3: METADATA_RE 分隔符过于严格

## 表现描述

`METADATA_RE` 正则要求末尾必须有 `）`、`)` 或空白字符。但某些元数据如 `(汉·刘向` 没有闭合分隔符，导致匹配失败。

## 位置

`scripts/lib/extractors.mjs:363`

## Diff

```diff
-const METADATA_RE = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]/;
+const METADATA_RE = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+)[）)\s]?/;
```

## 修复逻辑

两处改动：
1. `+?` → `+`：将作者组改为贪婪匹配。当末尾分隔符为可选时，非贪婪 `+?` 会匹配过少字符（如 `刘` 而非 `刘向`）。
2. `[）)\s]` → `[）)\s]?`：使末尾分隔符可选，支持无闭合分隔符的元数据格式。

## 预期输出示例

修复前：`(汉·刘向` → METADATA_RE 不匹配 → metadata 提取失败。
修复后：`(汉·刘向` → dynasty="汉", author="刘向"。

## 受影响文件数

包含无闭合分隔符元数据的古籍 HTML 文件。

## 回归测试

`tests/content-extractor.test.ts`: "should match metadata pattern without closing delimiter"
