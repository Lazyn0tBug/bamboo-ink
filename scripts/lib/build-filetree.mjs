#!/usr/bin/env node
/**
 * 文件树构建 — Phase A: 仅扫描文件系统，产出类别/书名/文件路径骨架
 *
 * 用法:
 *   bun run scripts/lib/build-filetree.mjs              # 扫描默认古籍目录
 *   bun run scripts/lib/build-filetree.mjs --out path   # 指定输出路径
 *   bun run scripts/lib/build-filetree.mjs --dry-run    # 只报告不写入
 *
 * 产出结构:
 *   {
 *     "version": 1,
 *     "builtAt": "ISO timestamp",
 *     "phase": "A",
 *     "categories": {
 *       "经部": [
 *         { "id": "大学章句集注", "files": ["古籍/经部/大学章句集注.htm"] },
 *         { "id": "四書章句集注", "files": [
 *             "古籍/经部/四書章句集注/大学章句集注.htm",
 *             "古籍/经部/四書章句集注/中庸章句集注.htm"
 *         ]}
 *       ]
 *     }
 *   }
 *
 * 规则:
 *   - 类别 = 古籍/ 下的一级子目录
 *   - 书籍 = 类别目录下的单个 .htm 文件，或子目录中的 .htm 文件集合
 *   - 单文件书籍: id = 文件名（去掉 .htm）
 *   - 目录书籍: id = 子目录名
 */

import fs from 'fs';
import path from 'path';

/**
 * Build the file tree skeleton from a source directory.
 * @param {string} sourceDir - Absolute path to the source directory (e.g. 古籍/)
 * @returns {{version: number, builtAt: string, phase: string, categories: Record<string, Array<{id: string, files: string[]}>>}}
 */
export function buildFileTree(sourceDir) {
  const result = {
    version: 1,
    builtAt: new Date().toISOString(),
    phase: 'A',
    categories: {},
  };

  if (!fs.existsSync(sourceDir)) {
    return result;
  }

  // Scan top-level subdirectories = categories
  const categories = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const cat of categories) {
    const catPath = path.join(sourceDir, cat);
    const books = scanCategory(catPath, sourceDir);
    if (books.length > 0) {
      result.categories[cat] = books;
    }
  }

  return result;
}

/**
 * Scan a category directory for books.
 * @param {string} catDir
 * @param {string} rootDir - The source root (for relative paths)
 * @returns {Array<{id: string, files: string[]}>}
 */
function scanCategory(catDir, rootDir) {
  const books = [];
  const entries = fs.readdirSync(catDir, { withFileTypes: true });

  // 1) Direct .htm files in category root = single-file books
  const directHtmFiles = entries
    .filter((e) => e.isFile() && /\.(htm|html)$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  for (const fileName of directHtmFiles) {
    const rel = path.relative(rootDir, path.join(catDir, fileName));
    const bookId = fileName.replace(/\.(htm|html)$/i, '');
    books.push({ id: bookId, files: [rel] });
  }

  // 2) Subdirectories = multi-file books (or nested structure)
  const subDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const dirName of subDirs) {
    const subDirPath = path.join(catDir, dirName);
    const htmFiles = collectHtmFilesRecursive(subDirPath, rootDir);
    if (htmFiles.length > 0) {
      books.push({ id: dirName, files: htmFiles });
    }
  }

  return books;
}

/**
 * Recursively collect .htm files under a directory.
 * @param {string} dir
 * @param {string} rootDir
 * @returns {string[]}
 */
function collectHtmFilesRecursive(dir, rootDir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectHtmFilesRecursive(full, rootDir));
    } else if (entry.isFile() && /\.(htm|html)$/i.test(entry.name)) {
      results.push(path.relative(rootDir, full));
    }
  }
  return results.sort();
}

/**
 * Write the file tree to disk.
 * @param {object} tree - The tree object from buildFileTree()
 * @param {string} outputPath - Output file path
 */
export function writeFileTree(tree, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(tree, null, 2) + '\n', 'utf-8');
}

// ── CLI ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sourceDir =
  args.find((a) => a.startsWith('--source='))?.split('=')[1] ||
  path.resolve('古籍');
const outPath =
  args.find((a) => a.startsWith('--out='))?.split('=')[1] ||
  path.resolve('src/content-ir/_filetree.json');
const dryRun = args.includes('--dry-run');

const tree = buildFileTree(sourceDir);

const catCount = Object.keys(tree.categories).length;
const bookCount = Object.values(tree.categories).reduce(
  (sum, books) => sum + books.length,
  0
);
const fileCount = Object.values(tree.categories).reduce(
  (sum, books) => sum + books.reduce((s, b) => s + b.files.length, 0),
  0
);

console.log(`File Tree (Phase A)`);
console.log(`  Categories: ${catCount}`);
console.log(`  Books:      ${bookCount}`);
console.log(`  Files:      ${fileCount}`);

if (!dryRun) {
  writeFileTree(tree, outPath);
  console.log(`  Written to: ${outPath}`);
} else {
  console.log(`  (Dry run: not writing to disk)`);
}
