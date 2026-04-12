# Bug 1: pass2Metadata 过度认领

## 表现描述

`pass2Metadata` 对匹配 `class="metadata"` 的节点调用 `claimSubtree(node)`，导致整个子树被认领。如果 `.metadata` 容器内还包含非 metadata 子元素（如夹注 FONT），这些子元素也会被一并吞噬，后续 Pass 4（annotation）无法再处理它们。

## 位置

`scripts/lib/extractors.mjs:375`

## Diff

```diff
-      territory.claimSubtree(node);
+      territory.claimLeaf(node);
```

## 修复逻辑

将 `claimSubtree` 替换为 `claimLeaf`：只认领匹配的 metadata 节点本身，不认领其子树。子元素仍可被其他 Pass（如 annotation 提取）处理。

## 预期输出示例

修复前：`.metadata` DIV 及其所有子节点（含 FONT 夹注）全部被 claimed。
修复后：仅 `.metadata` DIV 被 claimed，其 FONT 子节点仍可被 Pass 4 提取为 annotation。

## 受影响文件数

所有包含 `class="metadata"` 且嵌套子元素的 HTML 文件。实际古籍 HTML 中 `class="metadata"` 节点通常仅包含纯文本，但修复可防止边缘情况下的正文丢失。

## 回归测试

`tests/content-extractor.test.ts`: "should not claim subtree when matching metadata on class='metadata' container"
