/**
 * JSON IR Content Extractor — Facade
 *
 * Re-exports from focused modules to maintain a stable public API.
 * Both `convert-htm-to-md.js` and `tests/content-extractor.test.ts`
 * import by name from this file — no changes needed there.
 *
 * Modules:
 *   - ./extractors.mjs  — territorial extraction, DOM indexing,
 *                          HTML normalization, content classification
 *   - ./renderers.mjs   — HTML5 and Markdown output generation
 */

// ── Re-exports from extractors.mjs ─────────────────────────────────

export {
  TYPES,
  createTerritory,
  buildDomIndex,
  normalizeHtml,
  pass1BookTitle,
  pass2Metadata,
  pass3ChapterTitle,
  extractContent,
  buildCatalogDict,
  lookupCatalogMeta,
} from './extractors.mjs';

// ── Re-exports from renderers.mjs ──────────────────────────────────

export { renderHtml5, renderMarkdown } from './renderers.mjs';

// ── Encoding utilities (local) ─────────────────────────────────────

import iconv from 'iconv-lite';

export function detectEncoding(buffer) {
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

export function decodeHtml(buffer) {
  const encoding = detectEncoding(buffer);
  return encoding === 'gbk' ? iconv.decode(buffer, 'gbk') : buffer.toString('utf8');
}

// ── IR Writer ──────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';

/**
 * Write a JSON IR object to disk.
 *
 * @param {object} ir - JSON IR object
 * @param {string} outputDir - Output directory
 * @param {string} sourcePath - Relative source path
 */
export async function writeIr(ir, outputDir, sourcePath) {
  const dirName = path.dirname(sourcePath);
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const targetDir = path.join(outputDir, dirName);

  await fs.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, `${baseName}.json`);
  await fs.writeFile(targetPath, JSON.stringify(ir, null, 2) + '\n', 'utf8');

  return targetPath;
}
