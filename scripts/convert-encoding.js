#!/usr/bin/env bun
/**
 * 批量编码转换脚本 — GBK → UTF-8 (BOM)
 *
 * 用法:
 *   bun run scripts/convert-encoding.js 古籍/经部          # 转换指定目录
 *   bun run scripts/convert-encoding.js 古籍/              # 递归转换所有子目录
 *   bun run scripts/convert-encoding.js --dry-run 古籍/经部 # 只报告，不写入
 *
 * 规则:
 *   - 有 UTF-8 BOM → 跳过
 *   - 已 UTF-8（无 BOM 但解析成功含 CJK）→ 跳过
 *   - 其他 → 按 GBK 解码，重新编码为 UTF-8 + BOM
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Detect encoding of a file buffer.
 * @param {Buffer} buf
 * @returns {'utf8-bom' | 'utf8' | 'gbk' | 'ascii'}
 */
function detectEncoding(buf) {
  if (buf.length < 3) return 'ascii';
  // Check BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8-bom';

  const ascii = buf.slice(0, 8192);
  const hasNonAscii = ascii.some((b) => b > 127);
  if (!hasNonAscii) return 'ascii';

  // Try UTF-8 decode, check for CJK
  const text = buf.toString('utf8');
  if (CJK_RE.test(text)) return 'utf8';

  // Contains non-ASCII but no valid CJK in UTF-8 → likely GBK
  return 'gbk';
}

/**
 * Collect all .htm files recursively under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectHtmFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectHtmFiles(full));
    } else if (entry.isFile() && /\.(htm|html)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results.sort();
}

/**
 * Convert files in a directory.
 * @param {string} targetDir
 * @param {boolean} dryRun
 * @returns {{total, converted, skipped, errors: Array<{file, reason}>}}
 */
function convertDirectory(targetDir, dryRun = false) {
  const report = { total: 0, converted: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(targetDir)) {
    console.error(`Error: directory not found: ${targetDir}`);
    process.exit(1);
  }

  const files = collectHtmFiles(targetDir);
  report.total = files.length;

  if (files.length === 0) {
    console.log('No .htm/.html files found.');
    return report;
  }

  for (const filePath of files) {
    try {
      const buf = fs.readFileSync(filePath);
      const enc = detectEncoding(buf);

      if (enc === 'utf8-bom' || enc === 'utf8' || enc === 'ascii') {
        report.skipped++;
        continue;
      }

      // GBK → UTF-8 + BOM
      const decoded = iconv.decode(buf, 'gbk');
      const encoded = iconv.encode(decoded, 'utf8');
      const withBom = Buffer.concat([UTF8_BOM, encoded]);

      if (!dryRun) {
        fs.writeFileSync(filePath, withBom);
      }

      report.converted++;
      const rel = path.relative(process.cwd(), filePath);
      console.log(dryRun ? `[DRY-RUN] CONVERT ${rel}` : `CONVERTED ${rel}`);
    } catch (err) {
      report.errors.push({ file: path.relative(process.cwd(), filePath), reason: err.message });
    }
  }

  return report;
}

// ── CLI ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirs = args.filter((a) => !a.startsWith('--'));

if (dirs.length === 0) {
  console.log('Usage:');
  console.log('  bun run scripts/convert-encoding.js <directory> [--dry-run]');
  console.log('');
  console.log('Examples:');
  console.log('  bun run scripts/convert-encoding.js 古籍/经部');
  console.log('  bun run scripts/convert-encoding.js 古籍/');
  console.log('  bun run scripts/convert-encoding.js --dry-run 古籍/经部');
  process.exit(1);
}

const results = { total: 0, converted: 0, skipped: 0, errors: [] };

for (const dir of dirs) {
  console.log(`\n── ${dryRun ? '[DRY-RUN] ' : ''}Scanning: ${dir} ──`);
  const r = convertDirectory(dir, dryRun);
  results.total += r.total;
  results.converted += r.converted;
  results.skipped += r.skipped;
  results.errors.push(...r.errors);
}

console.log(`\n========== 转换报告 ==========
总文件数: ${results.total}
已转换:   ${results.converted}
已跳过:   ${results.skipped}
错误:     ${results.errors.length}`);

if (results.errors.length > 0) {
  console.log('\n错误详情:');
  for (const e of results.errors) {
    console.log(`  ${e.file}: ${e.reason}`);
  }
}

if (dryRun && results.converted > 0) {
  console.log(`\n(Dry run: 以上 ${results.converted} 个文件将被转换)`);
}
