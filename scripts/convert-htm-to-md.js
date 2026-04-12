#!/usr/bin/env bun
/**
 * 古籍内容转换脚本 — 双管道（JSON IR + Legacy）
 *
 * 用法:
 *   bun run convert-htm-to-md.js --pipeline ir --all
 *   bun run convert-htm-to-md.js --pipeline ir --file 经部/论语.htm
 *   bun run convert-htm-to-md.js --pipeline ir --category 经部 --dry-run
 *   bun run convert-htm-to-md.js --pipeline ir --book 大学章句集注
 *   bun run convert-htm-to-md.js                    # legacy 默认行为
 *
 * CLI 参数:
 *   --pipeline ir|legacy   选择管道（legacy 为默认）
 *   --file <path>          单个文件（相对源目录路径）
 *   --book <name>          单本书（标题匹配）
 *   --category <name>      整个类别（经部/史部/子部/集部）
 *   --all                  所有文件
 *   --dry-run              只打印计划，不写入
 *   --output <dir>         覆盖输出目录
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import iconv from 'iconv-lite';

import {
  extractContent,
  renderHtml5,
  renderMarkdown,
  writeIr,
  buildCatalogDict,
  decodeHtml,
} from './lib/content-extractor.mjs';
import { createPatternCache } from './lib/pattern-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '../古籍'); // 项目根目录/古籍

// ── Default output directories ──────────────────────────────────────

const IR_OUTPUT_DIR = path.join(__dirname, '../src/content-ir');
const MD_OUTPUT_DIR = path.join(__dirname, '../src/content/guji');
const HTML5_OUTPUT_DIR = path.join(__dirname, '../src/normalized-html');

// ── CLI Argument Parsing ────────────────────────────────────────────

/**
 * Parse command-line arguments.
 *
 * @returns {object} Parsed options
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    pipeline: 'legacy',
    file: undefined,
    book: undefined,
    category: undefined,
    all: false,
    dryRun: false,
    output: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pipeline':
        opts.pipeline = args[++i];
        if (!['ir', 'legacy'].includes(opts.pipeline)) {
          console.error(`错误: 未知的 pipeline "${opts.pipeline}"。可选值: ir, legacy`);
          process.exit(1);
        }
        break;
      case '--file':
        opts.file = args[++i];
        break;
      case '--book':
        opts.book = args[++i];
        break;
      case '--category':
        opts.category = args[++i];
        break;
      case '--all':
        opts.all = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`错误: 未知的参数 "${args[i]}"`);
        printUsage();
        process.exit(1);
    }
  }

  // Validate: must specify at least one scope
  if (opts.pipeline === 'ir' && !opts.file && !opts.book && !opts.category && !opts.all) {
    console.error('错误: IR 管道需要指定 --file, --book, --category 或 --all 之一');
    printUsage();
    process.exit(1);
  }

  return opts;
}

function printUsage() {
  console.log(`用法: convert-htm-to-md.js [选项]

选项:
  --pipeline ir|legacy   选择管道（legacy 为默认）
  --file <path>          单个文件（相对源目录路径）
  --book <name>          单本书（标题匹配）
  --category <name>      整个类别（经部/史部/子部/集部）
  --all                  所有文件
  --dry-run              只打印计划，不写入
  --output <dir>         覆盖输出目录
  --help, -h             显示帮助`);
}

// ── Legacy Pipeline ─────────────────────────────────────────────────

// (Existing legacy code — unchanged)

const TARGET_DIR = path.join(__dirname, '../content');

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

turndownService.keep(['pre']);

turndownService.addRule('guji-title', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: function (content, node, _options) {
    const hLevel = node.tagName.charAt(1);
    const hPrefix = '#'.repeat(Number(hLevel));
    return `\n\n${hPrefix} ${content.trim()}\n\n`;
  },
});

function detectEncodingLegacy(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf8';
  }
  try {
    const text = buffer.toString('utf8');
    if (/[\u4e00-\u9fa5]/.test(text)) {
      return 'utf8';
    }
  } catch {
    // ignore
  }
  return 'gbk';
}

function extractMetadataLegacy($, filePath) {
  const title =
    $('title').text().trim() || $('h1').first().text().trim() || path.basename(filePath, '.htm');

  const section = filePath.includes('/经部')
    ? '经'
    : filePath.includes('/史部')
      ? '史'
      : filePath.includes('/子部')
        ? '子'
        : filePath.includes('/集部')
          ? '集'
          : '其他';

  return {
    title,
    section,
    date: new Date().toISOString().split('T')[0],
    source: filePath,
  };
}

function cleanHtmlLegacy($) {
  $('script, style, link, meta').remove();

  $('font, center, span').each((_, el) => {
    $(el).replaceWith($(el).html());
  });

  $('pre').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`<div class="verse">${text}</div>`);
  });

  const body = $('body').html() || $.html();
  return body;
}

async function convertFileLegacy(filePath) {
  try {
    console.log(`处理：${filePath}`);

    const buffer = await fs.readFile(filePath);
    const encoding = detectEncodingLegacy(buffer);
    console.log(`  编码：${encoding}`);

    const html = encoding === 'gbk' ? iconv.decode(buffer, 'gbk') : buffer.toString('utf8');
    const $ = cheerio.load(html);
    const metadata = extractMetadataLegacy($, filePath);
    const cleanedHtml = cleanHtmlLegacy($);
    const markdown = turndownService.turndown(cleanedHtml);

    const frontmatter = `---
title: "${metadata.title}"
section: "${metadata.section}"
date: "${metadata.date}"
source: "${metadata.source}"
---

`;

    const relativePath = path.relative(SOURCE_DIR, filePath);
    const targetPath = path.join(
      TARGET_DIR,
      metadata.section,
      relativePath.replace(/\.htm[l]?$/, '.md')
    );

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, frontmatter + markdown, 'utf8');

    console.log(`  ✓ 完成：${targetPath}`);
    return true;
  } catch (error) {
    console.error(`  ✗ 错误：${error.message}`);
    return false;
  }
}

// ── IR Pipeline ─────────────────────────────────────────────────────

/**
 * Scan source directory for all .htm files.
 *
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Array of file paths
 */
async function findFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && /\.(htm|html)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Check if a file is a catalog page by name pattern.
 *
 * Catalog pages have names like "*藏目.htm" or are "index.htm".
 *
 * @param {string} filePath - Full file path
 * @returns {boolean}
 */
function isCatalogPage(filePath) {
  const name = path.basename(filePath).toLowerCase();
  return (
    name.includes('藏目') || name.includes('藏目') || name === 'index.htm' || name === 'index.html'
  );
}

/**
 * Filter files based on CLI options.
 *
 * @param {string[]} allFiles - All discovered .htm files
 * @param {object} opts - Parsed CLI options
 * @returns {string[]} Filtered file list
 */
function filterFiles(allFiles, opts) {
  if (opts.file) {
    // Match by relative path suffix
    const target = opts.file.replace(/^\.?\//, '');
    return allFiles.filter((f) => {
      const rel = path.relative(SOURCE_DIR, f);
      return rel === target || rel.endsWith('/' + target);
    });
  }

  if (opts.book) {
    // Match by title — we'll need to extract titles, so return candidates
    // whose basename (without ext) contains the book name
    return allFiles.filter((f) => {
      const name = path.basename(f, path.extname(f));
      return name.includes(opts.book);
    });
  }

  if (opts.category) {
    return allFiles.filter((f) => {
      const rel = path.relative(SOURCE_DIR, f);
      return rel.startsWith(opts.category + '/') || rel.includes('/' + opts.category + '/');
    });
  }

  if (opts.all) {
    return allFiles;
  }

  return [];
}

/**
 * Process a single file through the IR pipeline.
 *
 * @param {string} filePath - Full file path
 * @param {object} options - extractContent options (catalogDict, patternCache)
 * @param {object} outputDirs - Output directories
 * @param {boolean} dryRun - If true, skip writing
 * @returns {Promise<{success: boolean, ir: object|null, isCatalog: boolean}>}
 */
async function processFileIr(filePath, options, outputDirs, dryRun) {
  try {
    const relPath = path.relative(SOURCE_DIR, filePath);
    const buffer = await fs.readFile(filePath);
    const html = decodeHtml(buffer);
    const ir = extractContent(html, relPath, options);

    if (dryRun) {
      console.log(
        `  [dry-run] ${relPath} → docType=${ir.docType}, chapters=${ir.chapters?.length ?? 0}, navItems=${ir.navItems?.length ?? 0}`
      );
      return { success: true, ir, isCatalog: ir.docType === 'catalog' };
    }

    // Write IR
    const irPath = await writeIr(ir, outputDirs.ir, relPath);
    console.log(`  IR: ${irPath}`);

    // Write Markdown
    const md = renderMarkdown(ir);
    const mdDir = path.join(outputDirs.md, path.dirname(relPath));
    const mdBase = path.basename(relPath, path.extname(relPath));
    const mdPath = path.join(mdDir, `${mdBase}.md`);
    await fs.mkdir(mdDir, { recursive: true });
    await fs.writeFile(mdPath, md, 'utf8');
    console.log(`  MD: ${mdPath}`);

    // Write HTML5 (for content-type only)
    if (ir.docType === 'content') {
      const html5 = renderHtml5(ir);
      const html5Dir = path.join(outputDirs.html5, path.dirname(relPath));
      const html5Path = path.join(html5Dir, `${mdBase}.htm`);
      await fs.mkdir(html5Dir, { recursive: true });
      await fs.writeFile(html5Path, html5, 'utf8');
      console.log(`  HTM5: ${html5Path}`);
    }

    return { success: true, ir, isCatalog: ir.docType === 'catalog' };
  } catch (error) {
    console.error(`  ✗ 错误：${error.message}`);
    return { success: false, ir: null, isCatalog: false };
  }
}

/**
 * Run the IR pipeline on a set of files.
 *
 * Catalog-aware processing:
 * 1. Process catalog pages first to build catalogDict
 * 2. Process content files with catalogDict injection
 * 3. Report coverage stats
 *
 * @param {string[]} files - List of file paths to process
 * @param {object} opts - Parsed CLI options
 * @returns {Promise<{total: number, success: number, failed: number, skipped: number, catalogLinks: number, covered: number}>}
 */
async function runIrPipeline(files, opts) {
  const outputDirs = {
    ir: opts.output || IR_OUTPUT_DIR,
    md: opts.output ? path.join(opts.output, 'md') : MD_OUTPUT_DIR,
    html5: opts.output ? path.join(opts.output, 'html5') : HTML5_OUTPUT_DIR,
  };

  const patternCache = createPatternCache();

  if (files.length === 0) {
    console.log('没有找到匹配的文件');
    return { total: 0, success: 0, failed: 0, skipped: 0, catalogLinks: 0, covered: 0 };
  }

  console.log(`找到 ${files.length} 个文件`);

  if (opts.dryRun) {
    console.log('\n[dry-run] 计划处理以下文件:');
    for (const f of files) {
      console.log(`  ${path.relative(SOURCE_DIR, f)}`);
    }
    console.log('');
  }

  // Step 1: Separate catalog and content files
  const catalogFiles = files.filter(isCatalogPage);
  const contentFiles = files.filter((f) => !isCatalogPage(f));

  if (catalogFiles.length > 0) {
    console.log(`\n目录页 (${catalogFiles.length}):`);
  }

  // Step 2: Process catalog pages first
  const catalogDict = new Map();
  let catalogCount = 0;
  for (const file of catalogFiles) {
    const result = await processFileIr(file, { patternCache }, outputDirs, opts.dryRun);
    if (result.success && result.ir) {
      catalogCount++;
      // Build dict from this catalog's navItems
      const catalogDir = path.relative(SOURCE_DIR, path.dirname(file));
      const dictEntries = buildCatalogDict([{ ir: result.ir, catalogDir }]);
      for (const [href, entry] of dictEntries) {
        catalogDict.set(href, entry);
      }
    }
  }

  if (!opts.dryRun) {
    console.log(`\n目录字典: ${catalogDict.size} 个条目`);
  } else if (catalogFiles.length > 0) {
    console.log(`\n[dry-run] 目录字典: 预计 ${catalogDict.size}+ 个条目`);
  }

  // Step 3: Process content files with catalogDict
  if (contentFiles.length > 0) {
    console.log(`\n内容页 (${contentFiles.length}):`);
  }

  let successCount = 0;
  let failedCount = 0;
  let coveredLinks = 0;

  for (const file of contentFiles) {
    const result = await processFileIr(
      file,
      { catalogDict, patternCache },
      outputDirs,
      opts.dryRun
    );
    if (result.success) {
      successCount++;
      // Count how many navItems from catalogs match this file
      const relPath = path.relative(SOURCE_DIR, file);
      const basename = path.basename(relPath);
      if (catalogDict.has(basename)) coveredLinks++;
    } else {
      failedCount++;
    }
  }

  // Step 4: Report coverage
  const totalCatalogLinks = catalogDict.size;
  console.log(`\n覆盖率统计:`);
  console.log(`  目录页: ${catalogCount} 成功`);
  console.log(`  内容页: ${successCount} 成功, ${failedCount} 失败`);
  console.log(`  目录链接: ${totalCatalogLinks}, 已覆盖: ${coveredLinks}`);

  return {
    total: files.length,
    success: successCount + catalogCount,
    failed: failedCount,
    skipped: 0,
    catalogLinks: totalCatalogLinks,
    covered: coveredLinks,
  };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (opts.pipeline === 'legacy') {
    // Legacy pipeline
    console.log('🚀 古籍 HTML 转 Markdown 转换工具 (Legacy)\n');

    await fs.mkdir(TARGET_DIR, { recursive: true });

    const files = [];
    async function findFilesLegacy(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await findFilesLegacy(fullPath);
        } else if (entry.isFile() && /\.(htm|html)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    await findFilesLegacy(SOURCE_DIR);

    console.log(`找到 ${files.length} 个 HTML 文件\n`);

    let success = 0;
    let failed = 0;

    for (const file of files.slice(0, 10)) {
      const result = await convertFileLegacy(file);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    console.log(`\n✅ 转换完成`);
    console.log(`成功：${success} 文件`);
    console.log(`失败：${failed} 文件`);
    return;
  }

  // IR Pipeline
  console.log('📜 JSON IR 内容管道\n');

  // Ensure output directories exist (unless dry-run)
  if (!opts.dryRun) {
    await fs.mkdir(opts.output || IR_OUTPUT_DIR, { recursive: true });
    await fs.mkdir(opts.output ? path.join(opts.output, 'md') : MD_OUTPUT_DIR, { recursive: true });
    await fs.mkdir(opts.output ? path.join(opts.output, 'html5') : HTML5_OUTPUT_DIR, {
      recursive: true,
    });
  }

  // Find and filter files
  const allFiles = await findFiles(SOURCE_DIR);
  const targetFiles = filterFiles(allFiles, opts);

  // Run IR pipeline
  const stats = await runIrPipeline(targetFiles, opts);

  console.log(`\n✅ IR 管道完成`);
  console.log(`总计: ${stats.total} 文件`);
  console.log(`成功: ${stats.success} 文件`);
  console.log(`失败: ${stats.failed} 文件`);
}

// Run
main().catch((err) => {
  console.error('致命错误:', err.message);
  process.exit(1);
});
