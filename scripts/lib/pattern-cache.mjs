/**
 * Pattern cache for content extraction.
 *
 * Caches content classification patterns discovered from the first file
 * of a book, then applies them to subsequent files to avoid redundant
 * classification work.
 *
 * All files from the same book share the same HTML patterns (CSS classes,
 * color schemes, container structure) because they were produced by the
 * same Microsoft FrontPage 4.0 template.
 */

import * as cheerio from 'cheerio';

/**
 * Flatten table-wrapped content to div-based structure.
 *
 * Converts <table>/<tr>/<td> chains into <div> elements so that
 * cheerio can traverse content uniformly regardless of table wrapping.
 * Preserves class and other attributes on <td> by mapping to <div>.
 *
 * @param {string} html - Raw HTML string
 * @returns {string} HTML with table structure flattened to divs
 */
export function flattenTables(html) {
  return html
    .replace(/<\/table>/gi, '')
    .replace(/<\/tr>/gi, '')
    .replace(/<tr[^>]*>/gi, '')
    .replace(/<table[^>]*>/gi, '')
    .replace(/<td\b([^>]*)>/gi, '<div$1>')
    .replace(/<\/td>/gi, '</div>');
}

/**
 * Create an empty pattern cache.
 *
 * @returns {Map<string, object>} Cache keyed by book title
 */
export function createPatternCache() {
  return new Map();
}

/**
 * Analyze an HTML file and extract content patterns for caching.
 *
 * Discovers:
 * - contentContainerSelector: which DOM element holds the content
 * - chapterTitlePatterns: how chapter titles are marked (colors, classes)
 * - annotationPatterns: how annotations are marked (font size, colors, classes)
 * - hasSwy1Container: whether the file uses div.swy1 container
 *
 * @param {string} html - Raw HTML string
 * @param {string} bookTitle - Book title (cache key)
 * @returns {object} Pattern object
 */
export function analyzePatterns(html, bookTitle) {
  html = flattenTables(html);

  const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });

  // Detect content container
  const hasSwy1 = $('body > div.swy1').length > 0;
  const containerSelector = hasSwy1 ? 'body > div.swy1' : 'body';

  // Discover chapter title patterns from centered elements
  const chapterTitlePatterns = { centerColors: new Set(), classValues: new Set() };
  $('center, [align=center], [style*="text-align:center"]').each((_, el) => {
    const $el = $(el);
    $el.find('font').each((_, f) => {
      const color = ($(f).attr('color') || '').toUpperCase();
      if (color) chapterTitlePatterns.centerColors.add(color);
      const cls = ($(f).attr('class') || '').trim();
      if (cls) chapterTitlePatterns.classValues.add(cls);
    });
    const directColor = ($el.attr('color') || '').toUpperCase();
    if (directColor) chapterTitlePatterns.centerColors.add(directColor);
  });

  // Discover annotation patterns
  const annotationPatterns = { fontSizes: new Set(), colors: new Set(), classValues: new Set() };
  $('font').each((_, el) => {
    const style = $(el).attr('style') || '';
    const sizeMatch = style.match(/FONT-SIZE:\s*(\d+)pt/i);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10);
      // Small fonts are typically annotations
      if (size <= 10) annotationPatterns.fontSizes.add(size);
    }
    const color = $(el).attr('color') || '';
    if (color) annotationPatterns.colors.add(color.toUpperCase());
    const cls = ($(el).attr('class') || '').trim();
    if (cls) annotationPatterns.classValues.add(cls);
  });
  // Also check non-font elements for class values
  $('[class]').each((_, el) => {
    const cls = ($(el).attr('class') || '').trim();
    if (cls) annotationPatterns.classValues.add(cls);
  });

  return {
    bookTitle,
    chapterTitlePatterns: {
      centerColors: [...chapterTitlePatterns.centerColors],
      classValues: [...chapterTitlePatterns.classValues],
    },
    annotationPatterns: {
      fontSizes: [...annotationPatterns.fontSizes],
      colors: [...annotationPatterns.colors],
      classValues: [...annotationPatterns.classValues],
    },
    contentContainerSelector: containerSelector,
    hasSwy1Container: hasSwy1,
  };
}

/**
 * Store analyzed patterns in the cache.
 *
 * @param {Map<string, object>} cache - Pattern cache
 * @param {object} patterns - Pattern object from analyzePatterns
 */
export function cachePatterns(cache, patterns) {
  cache.set(patterns.bookTitle, patterns);
}

/**
 * Retrieve cached patterns for a book.
 *
 * @param {Map<string, object>} cache - Pattern cache
 * @param {string} bookTitle - Book title
 * @returns {object|null} Cached patterns or null if not found
 */
export function getCachedPatterns(cache, bookTitle) {
  return cache.get(bookTitle) || null;
}

/**
 * Check if a book's patterns are cached.
 *
 * @param {Map<string, object>} cache - Pattern cache
 * @param {string} bookTitle - Book title
 * @returns {boolean}
 */
export function hasCachedPatterns(cache, bookTitle) {
  return cache.has(bookTitle);
}

/**
 * Analyze HTML and cache the patterns in one step.
 *
 * @param {Map<string, object>} cache - Pattern cache
 * @param {string} html - Raw HTML string
 * @param {string} bookTitle - Book title (cache key)
 * @returns {object} Pattern object (also stored in cache)
 */
export function analyzeAndCache(cache, html, bookTitle) {
  const patterns = analyzePatterns(html, bookTitle);
  cachePatterns(cache, patterns);
  return patterns;
}
