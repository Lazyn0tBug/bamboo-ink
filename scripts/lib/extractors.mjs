/**
 * Extraction pipeline — territorial extraction, DOM indexing,
 * HTML normalization, and content classification.
 *
 * Exports: TYPES, createTerritory, buildDomIndex, normalizeHtml,
 *          pass1BookTitle, pass2Metadata, pass3ChapterTitle,
 *          extractContent
 */

import * as cheerio from 'cheerio';
import path from 'path';
import { flattenTables, analyzeAndCache, hasCachedPatterns } from './pattern-cache.mjs';

// ── Types constant ────────────────────────────────────────────────

export const TYPES = {
  BOOK_TITLE: 'book-title',
  METADATA: 'metadata',
  CHAPTER_TITLE: 'chapter-title',
  MAIN_TEXT: 'main-text',
  INLINE_ANNOTATION: 'inline-annotation',
  SECTION_SUMMARY: 'section-summary',
  COLOPHON: 'colophon',
  NAV_ITEM: 'nav-item',
  END_MARKER: 'end-marker',
};

// ── Territorial Extraction Infrastructure ─────────────────────────

/**
 * Create territorial extraction helpers bound to a cheerio instance.
 * Returns { claimSubtree, claimLeaf, isClaimed, hasClaimedAncestor, ... }
 *
 * @param {Function} $ - cheerio instance (cheerio.load result)
 * @param {typeof TYPES} types - content type constants
 */
export function createTerritory($, types) {
  /** @type {Set<object>} */
  const claimed = new Set();

  function claimSubtree(node) {
    claimed.add(node);
    const $n = $(node);
    $n.contents().each((_, child) => {
      claimSubtree(child);
    });
  }

  function claimLeaf(node) {
    claimed.add(node);
  }

  function isClaimed(node) {
    return claimed.has(node);
  }

  function hasClaimedAncestor(node) {
    let parent = node.parent;
    while (parent) {
      if (claimed.has(parent)) return true;
      parent = parent.parent;
    }
    return false;
  }

  function extractByRules(predicate, claimMode) {
    /** @type {Array<{type: string, content: string, sourceNodes: object[]}>} */
    const regions = [];

    $('body')
      .children()
      .each((_, el) => {
        if (hasClaimedAncestor(el) || isClaimed(el)) return;
        const type = predicate($, el);
        if (!type) return;
        const $el = $(el);
        const text = $el.text().trim();
        if (claimMode === 'subtree') {
          claimSubtree(el);
        } else {
          claimLeaf(el);
        }
        if (text) {
          regions.push({ type, content: text, sourceNodes: [el] });
        }
      });

    return regions;
  }

  function extractRemaining() {
    /** @type {Array<{type: string, content: string, sourceNodes: object[]}>} */
    const regions = [];
    /** @type {object[]|null} */
    let currentRegionNodes = null;
    let currentText = '';

    function walkTextNodes(node) {
      if (isClaimed(node) || hasClaimedAncestor(node)) return;

      if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          if (currentText) {
            currentText += ' ' + text;
          } else {
            currentText = text;
          }
          if (!currentRegionNodes) currentRegionNodes = [];
          currentRegionNodes.push(node);
        }
      } else if (node.children && node.children.length) {
        $(node)
          .contents()
          .each((_, child) => {
            walkTextNodes(child);
          });
      }
    }

    $('body')
      .contents()
      .each((_, node) => {
        walkTextNodes(node);
      });

    if (currentText && currentRegionNodes) {
      regions.push({
        type: types.MAIN_TEXT,
        content: currentText.trim(),
        sourceNodes: currentRegionNodes,
      });
    }

    return regions;
  }

  function mergeAdjacentRegions(regions) {
    if (regions.length === 0) return [];
    /** @type {Array<{type: string, content: string, sourceNodes: object[]}>} */
    const merged = [regions[0]];
    for (let i = 1; i < regions.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = regions[i];
      if (prev.type === curr.type) {
        prev.content += ' ' + curr.content;
        prev.sourceNodes = prev.sourceNodes.concat(curr.sourceNodes);
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }

  return {
    claimed,
    claimSubtree,
    claimLeaf,
    isClaimed,
    hasClaimedAncestor,
    extractByRules,
    extractRemaining,
    mergeAdjacentRegions,
  };
}

// ── DOM Index ──────────────────────────────────────────────────────

/**
 * @typedef {Object} DomIndex
 * @property {Map<string, object[]>} byColor
 * @property {Map<string, object[]>} byClass
 * @property {Map<string, object[]>} byTag
 * @property {Map<string, object[]>} bySize
 * @property {object[]} allTextNodes
 */

/**
 * Build a DOM index from a cheerio instance — one-time per-file traversal.
 *
 * @param {Function} $ - cheerio instance
 * @returns {DomIndex}
 */
export function buildDomIndex($) {
  /** @type {Map<string, object[]>} */
  const byColor = new Map();
  /** @type {Map<string, object[]>} */
  const byClass = new Map();
  /** @type {Map<string, object[]>} */
  const byTag = new Map();
  /** @type {Map<string, object[]>} */
  const bySize = new Map();
  /** @type {object[]} */
  const allTextNodes = [];

  function indexNode(node) {
    if (node.type === 'text') {
      allTextNodes.push(node);
      return;
    }
    if (node.type === 'comment') return;

    const tag = (node.tagName || '').toLowerCase();
    if (tag) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(node);
    }

    const $node = $(node);
    const color = $node.attr('color');
    if (color) {
      const upper = color.toUpperCase();
      if (!byColor.has(upper)) byColor.set(upper, []);
      byColor.get(upper).push(node);
    }

    const className = $node.attr('class');
    if (className) {
      const classes = className.trim().split(/\s+/);
      for (const cls of classes) {
        if (!byClass.has(cls)) byClass.set(cls, []);
        byClass.get(cls).push(node);
      }
    }

    const size = $node.attr('size');
    if (size) {
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push(node);
    }

    $node.contents().each((_, child) => {
      indexNode(child);
    });
  }

  $('body')
    .contents()
    .each((_, node) => {
      indexNode(node);
    });

  return { byColor, byClass, byTag, bySize, allTextNodes };
}

// ── HTML Normalization ─────────────────────────────────────────────

/**
 * Normalize raw HTML before cheerio parsing.
 *
 * @param {string} html - Raw HTML string
 * @returns {string} Normalized HTML string
 */
export function normalizeHtml(html) {
  html = html.replace(/<center\b/gi, '<div data-center="1"').replace(/<\/center>/gi, '</div>');
  html = flattenTables(html);
  html = html.replace(/<(?!br|hr|img|input|meta|link)([a-z]+)[^>]*>\s*<\/\1>/gi, '');
  return html;
}

// ── Shared Helper ──────────────────────────────────────────────────

/**
 * Check if a node is in a centered context.
 *
 * @param {Function} $
 * @param {object} node
 * @returns {boolean}
 */
function isInCenteredContext($, node) {
  const $node = $(node);
  if (($node.attr('data-center') || '') === '1') return true;
  if (($node.attr('align') || '').toLowerCase() === 'center') return true;
  let found = false;
  $node.parents().each((_, p) => {
    if (found) return;
    const $p = $(p);
    if (($p.attr('data-center') || '') === '1') {
      found = true;
      return;
    }
    if (($p.attr('align') || '').toLowerCase() === 'center') {
      found = true;
      return;
    }
  });
  return found;
}

// ── Territorial Pass 1: Book Title ─────────────────────────────────

/**
 * Pass 1: Extract book-title from DOM index.
 *
 * @param {DomIndex} index
 * @param {Function} $
 * @param {object} territory
 * @returns {string|null}
 */
export function pass1BookTitle(index, $, territory) {
  const articleNodes = index.byClass.get('article') || [];
  for (const node of articleNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const $node = $(node);
    const text = $node.text().trim();
    if (text.length > 0 && text.length < 80) {
      territory.claimSubtree(node);
      return text;
    }
  }

  const colorFF6666 = index.byColor.get('#FF6666') || [];
  const colorFF0000 = index.byColor.get('#FF0000') || [];
  const bookColorNodes = [...colorFF6666, ...colorFF0000];

  for (const node of bookColorNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    if (!isInCenteredContext($, node)) continue;
    const size = parseInt($(node).attr('size') || '0', 10);
    if (size < 5) continue;
    const text = $(node).text().trim();
    if (text.length > 0 && text.length < 80) {
      territory.claimSubtree(node);
      return text;
    }
  }

  for (const node of bookColorNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    if (!isInCenteredContext($, node)) continue;
    const sizeAttr = $(node).attr('size');
    if (sizeAttr && parseInt(sizeAttr, 10) >= 5) continue;

    let found = null;
    $(node)
      .find('font')
      .each((_, nested) => {
        if (found) return;
        const nestedSize = parseInt($(nested).attr('size') || '0', 10);
        if (nestedSize >= 5) {
          const text = $(nested).text().trim();
          if (text.length > 0 && text.length < 80) {
            found = { node: nested, text };
          }
        }
      });
    if (found) {
      territory.claimSubtree(node);
      return found.text;
    }
  }

  return null;
}

// ── Territorial Pass 2: Metadata ───────────────────────────────────

const METADATA_RE = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]/;

/**
 * Pass 2: Extract metadata from DOM.
 *
 * @param {DomIndex} index
 * @param {Function} $
 * @param {object} territory
 * @returns {{dynasty: string, author: string} | null}
 */
export function pass2Metadata(index, $, territory) {
  const metaNodes = index.byClass.get('metadata') || [];
  for (const node of metaNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const text = $(node).text().trim();
    const match = text.match(METADATA_RE);
    if (match) {
      territory.claimSubtree(node);
      return { dynasty: match[1], author: match[2] };
    }
  }

  for (const node of index.allTextNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const text = $(node).text().trim();
    const match = text.match(METADATA_RE);
    if (match) {
      const parent = node.parent;
      if (parent) territory.claimSubtree(parent);
      else territory.claimLeaf(node);
      return { dynasty: match[1], author: match[2] };
    }
  }

  return null;
}

// ── Territorial Pass 3: Chapter Title ──────────────────────────────

/**
 * Pass 3: Extract chapter-title nodes from DOM index.
 *
 * @param {DomIndex} index
 * @param {Function} $
 * @param {object} territory
 * @returns {Array<{title: string}>}
 */
export function pass3ChapterTitle(index, $, territory) {
  /** @type {Array<{title: string, sourceNode: object}>} */
  const chapters = [];

  function tryClaimAndCollect(node) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) return false;
    const $node = $(node);
    const text = $node.text().trim().replace(/\s+/g, '');
    if (text.length === 0 || text.length >= 80) return false;
    territory.claimSubtree(node);
    chapters.push({ title: text, sourceNode: node });
    return true;
  }

  const chapterNodes = index.byClass.get('chapter') || [];
  for (const node of chapterNodes) {
    tryClaimAndCollect(node);
  }

  const sectionNodes = index.byClass.get('section') || [];
  for (const node of sectionNodes) {
    tryClaimAndCollect(node);
  }

  const cc33cc = index.byColor.get('#CC33CC') || [];
  for (const node of cc33cc) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const tag = (node.tagName || '').toUpperCase();
    if (['B', 'FONT', 'DIV', 'SPAN'].includes(tag)) {
      tryClaimAndCollect(node);
    }
  }

  const hTags = [
    ...(index.byTag.get('h2') || []),
    ...(index.byTag.get('h3') || []),
    ...(index.byTag.get('h4') || []),
  ];
  for (const node of hTags) {
    if (isInCenteredContext($, node)) {
      tryClaimAndCollect(node);
    }
  }

  return chapters;
}

// ── Title Extraction (fallback) ────────────────────────────────────

function extractTitle($) {
  const titleTag = $('title').text().trim();
  if (titleTag) return titleTag;

  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  let found = '';
  $('font').each((_, el) => {
    if (found) return;
    const color = ($(el).attr('color') || '').toUpperCase();
    const size = parseInt($(el).attr('size') || '0', 10);

    if ((color === '#FF6666' || color === '#FF0000') && size >= 5) {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 50) {
        found = text;
      }
    }

    if ((color === '#FF6666' || color === '#FF0000') && !size) {
      $(el)
        .find('font')
        .each((_, nested) => {
          if (found) return;
          const nestedSize = parseInt($(nested).attr('size') || '0', 10);
          if (nestedSize >= 5) {
            const text = $(nested).text().trim();
            if (text.length > 0 && text.length < 50) {
              found = text;
            }
          }
        });
    }

    if (size >= 5 && !color) {
      let parent = el.parent;
      while (parent && parent.tagName === 'font') {
        const parentColor = ($(parent).attr('color') || '').toUpperCase();
        if (parentColor === '#FF6666' || parentColor === '#FF0000') {
          const text = $(el).text().trim();
          if (text.length > 0 && text.length < 50) {
            found = text;
          }
          break;
        }
        parent = parent.parent;
      }
    }
  });
  if (found) return found;

  return 'Untitled';
}

// ── Structural Context Detection ───────────────────────────────────

function detectStructure($, node) {
  const $node = $(node);
  const tag = node.tagName || '';

  if (tag === 'a' && $node.attr('href')) {
    return 'link';
  }

  let inCenter = false;
  $node.parents().each((_, p) => {
    if ($(p).attr('data-center') === '1' || ($(p).attr('align') || '').toLowerCase() === 'center') {
      inCenter = true;
    }
  });
  if (
    ($node.attr('data-center') || '') === '1' ||
    tag === 'center' ||
    ($node.attr('align') || '').toLowerCase() === 'center' ||
    ($node.css('text-align') || '').toLowerCase() === 'center'
  ) {
    inCenter = true;
  }

  if (tag === 'ol' || tag === 'ul') {
    return 'list';
  }

  if (tag === 'br' || tag === 'p') {
    return 'paragraph';
  }

  if (tag === 'pre') {
    return 'pre';
  }

  return inCenter ? 'centered' : 'general';
}

// ── Attribute Classification ───────────────────────────────────────

function classifyByAttributes($, node, context) {
  const $node = $(node);
  const tag = (node.tagName || '').toUpperCase();
  const text = $node.text().trim();

  if (!text && tag !== 'BR' && tag !== 'HR') return null;

  const className = ($node.attr('class') || '').trim();

  if (className === 'article') return TYPES.BOOK_TITLE;
  if (className === 'chapter') return TYPES.CHAPTER_TITLE;
  if (className === 'section') return TYPES.CHAPTER_TITLE;
  if (className === 'annotation') return TYPES.INLINE_ANNOTATION;
  if (className === 'reference') return TYPES.INLINE_ANNOTATION;
  if (className === 'menu') return 'menu-context';
  if (className === 'jing' || className === 'zhuan') return TYPES.MAIN_TEXT;

  if ((tag === 'B' || tag === 'FONT' || tag === 'DIV' || tag === 'SPAN') && text.length < 80) {
    let hasCC33CC = false;
    $node.find('font').each((_, f) => {
      if (($(f).attr('color') || '').toUpperCase() === '#CC33CC') {
        hasCC33CC = true;
      }
    });
    if (($(node).attr('color') || '').toUpperCase() === '#CC33CC' || hasCC33CC) {
      return TYPES.CHAPTER_TITLE;
    }
  }

  if (context === 'centered' || context === 'center') {
    let hasChapterClass = false;
    let hasArticleClass = false;
    $node.find('font').each((_, f) => {
      const childClass = ($(f).attr('class') || '').trim();
      if (childClass === 'chapter') hasChapterClass = true;
      if (childClass === 'article') hasArticleClass = true;
    });
    if (hasArticleClass) return TYPES.BOOK_TITLE;
    if (hasChapterClass) return TYPES.CHAPTER_TITLE;

    if (text.length < 80) {
      let hasCC33CC = false;
      $node.find('font').each((_, f) => {
        if (($(f).attr('color') || '').toUpperCase() === '#CC33CC') {
          hasCC33CC = true;
        }
      });
      if (($(node).attr('color') || '').toUpperCase() === '#CC33CC' || hasCC33CC) {
        return TYPES.CHAPTER_TITLE;
      }
    }

    if (text.length < 80) {
      let isBookTitle = false;
      $node.find('font').each((_, f) => {
        const color = ($(f).attr('color') || '').toUpperCase();
        const size = parseInt($(f).attr('size') || '0', 10);
        if ((color === '#FF6666' || color === '#FF0000') && size >= 5) {
          isBookTitle = true;
        }
      });
      if (isBookTitle) return TYPES.BOOK_TITLE;
    }

    if (['H2', 'H3', 'H4'].includes(tag)) {
      return TYPES.CHAPTER_TITLE;
    }
  }

  const style = $node.attr('style') || '';
  if (style) {
    if (/FONT-SIZE:\s*9pt/i.test(style)) return TYPES.INLINE_ANNOTATION;
    if (
      /FONT-SIZE:\s*10pt/i.test(style) &&
      /551A8B/i.test(($node.attr('color') || '') + ' ' + style)
    )
      return TYPES.INLINE_ANNOTATION;
  }
  if (className === 'notes') return TYPES.INLINE_ANNOTATION;

  if ($node.hasClass('swy1')) return TYPES.MAIN_TEXT;

  if (tag === 'A' && $node.attr('href')) return TYPES.NAV_ITEM;

  if (
    tag === 'P' &&
    (($node.attr('align') || '').toLowerCase() === 'justify' || $node.hasClass('MsoNormal'))
  ) {
    return TYPES.MAIN_TEXT;
  }

  if (['H2', 'H3', 'H4'].includes(tag)) return TYPES.CHAPTER_TITLE;

  if (tag === 'OL' || tag === 'UL') {
    return 'list-context';
  }

  return TYPES.MAIN_TEXT;
}

// ── Text Pattern Classification ────────────────────────────────────

const SECTION_SUMMARY_RE =
  /^右(?:传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章)/;
const END_MARKER_RE = /[\u4e00-\u9fff]+[\s]*[終终]\s*$/;

function classifyByText(text) {
  const trimmed = text
    .trim()
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!trimmed) return null;

  if (END_MARKER_RE.test(trimmed)) return TYPES.END_MARKER;
  if (SECTION_SUMMARY_RE.test(trimmed)) return TYPES.SECTION_SUMMARY;

  return null;
}

// ── Metadata regex for catalog pages ───────────────────────────────

const METADATA_RE_BODY = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]/;

// ── Main Extraction ────────────────────────────────────────────────

/**
 * @typedef {Object} PatternCache
 * @property {string} [bookTitle]
 * @property {object} [chapterTitlePatterns]
 * @property {object} [annotationPatterns]
 * @property {string} [contentContainerSelector]
 * @property {boolean} [hasSwy1Container]
 */

/**
 * @typedef {Object} ExtractOptions
 * @property {Map<string, CatalogEntry>} [catalogDict]
 * @property {string} [category]
 * @property {PatternCache} [patternCache]
 */

/**
 * @typedef {Object} CatalogEntry
 * @property {string} title
 * @property {string} dynasty
 * @property {string} author
 * @property {string} category
 * @property {string} catalogSource
 */

/**
 * Extract content from raw HTML into a JSON IR object.
 *
 * @param {string} html
 * @param {string} sourcePath
 * @param {ExtractOptions} [options]
 * @returns {object} JSON IR object
 */
export function extractContent(html, sourcePath, options = {}) {
  html = normalizeHtml(html);

  const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
  const index = buildDomIndex($raw);
  const title = extractTitle($raw);
  const ir = {
    title,
    author: undefined,
    dynasty: undefined,
    source: sourcePath,
    docType: 'content',
    chapters: [],
    navItems: [],
  };

  if (options.catalogDict) {
    const catalogMeta = lookupCatalogMeta(options.catalogDict, sourcePath);
    if (catalogMeta) {
      if (catalogMeta.author) ir.author = catalogMeta.author;
      if (catalogMeta.dynasty) ir.dynasty = catalogMeta.dynasty;
    }
  }

  const linkCount = $raw('a[href]').length;
  const bodyText = $raw('body').text().replace(/\s+/g, '').length;

  if (linkCount > 5 && bodyText < 3000) {
    ir.docType = 'catalog';
    if (!ir.author) {
      const bodyFullText = $raw('body').text().replace(/\s+/g, ' ').trim();
      const match = bodyFullText.match(METADATA_RE_BODY);
      if (match) {
        ir.dynasty = match[1];
        ir.author = match[2];
      }
    }
    $raw('a[href]').each((_, el) => {
      const href = $raw(el).attr('href') || '';
      const label = $raw(el).text().trim();
      if (href && label && label.length < 50) {
        ir.navItems.push({ href, label });
      }
    });
    return ir;
  }

  const territory = createTerritory($raw, TYPES);
  const { isClaimed, hasClaimedAncestor } = territory;

  const bookTitle = pass1BookTitle(index, $raw, territory);
  if (bookTitle) {
    ir.title = bookTitle;
  }

  if (!ir.author || !ir.dynasty) {
    const meta = pass2Metadata(index, $raw, territory);
    if (meta) {
      if (!ir.dynasty) ir.dynasty = meta.dynasty;
      if (!ir.author) ir.author = meta.author;
    }
  }

  const chapterTitles = pass3ChapterTitle(index, $raw, territory);
  /** @type {WeakSet<object>} */
  const chapterTitleNodes = new WeakSet();
  for (const ch of chapterTitles) {
    if (ch.sourceNode) chapterTitleNodes.add(ch.sourceNode);
  }

  function isAncestorOf(node, ancestor) {
    let current = node.parent;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  let pastEndMarker = false;
  let currentChapter = { title: '', sections: [] };
  let currentText = '';
  let currentAnnotations = [];

  function flushText() {
    if (currentText.trim()) {
      const section = {
        type: TYPES.MAIN_TEXT,
        content: currentText.trim(),
      };
      if (currentAnnotations.length > 0) {
        section.annotations = [...currentAnnotations];
        currentAnnotations = [];
      }
      currentChapter.sections.push(section);
      currentText = '';
    }
  }

  function flushChapter() {
    flushText();
    if (currentAnnotations.length > 0) {
      const sections = currentChapter.sections;
      if (sections.length > 0) {
        const lastSection = sections[sections.length - 1];
        if (lastSection.type === TYPES.MAIN_TEXT) {
          lastSection.annotations = [...(lastSection.annotations || []), ...currentAnnotations];
        } else {
          sections.push({
            type: TYPES.MAIN_TEXT,
            content: '',
            annotations: [...currentAnnotations],
          });
        }
      }
      currentAnnotations = [];
    }
    if (currentChapter.sections.length > 0 || currentChapter.title) {
      ir.chapters.push({ ...currentChapter });
    }
    currentChapter = { title: '', sections: [] };
  }

  function processNode(node) {
    if (isClaimed(node)) {
      if (chapterTitleNodes.has(node)) {
        flushText();
        const titleText = $raw(node).text().trim().replace(/\s+/g, '');
        if (titleText) {
          flushChapter();
          currentChapter.title = titleText;
        }
      }
      return;
    }
    if (hasClaimedAncestor(node)) {
      let foundChapterTitle = false;
      for (const chNode of chapterTitles.map((c) => c.sourceNode)) {
        if (isAncestorOf(node, chNode)) {
          foundChapterTitle = true;
          break;
        }
      }
      if (foundChapterTitle) {
        flushText();
        for (const ch of chapterTitles) {
          if (ch.sourceNode && isAncestorOf(node, ch.sourceNode) && !currentChapter.title) {
            currentChapter.title = ch.title;
          }
        }
      }
      return;
    }
    const context = detectStructure($raw, node);
    let type = classifyByAttributes($raw, node, context);

    if (!type || type === TYPES.MAIN_TEXT) {
      const textType = classifyByText($raw(node).html() || $raw(node).text());
      if (textType) type = textType;
    }

    const $node = $raw(node);
    const tag = (node.tagName || '').toUpperCase();

    if (!type || type === TYPES.MAIN_TEXT) {
      if (
        ['FONT', 'DIV', 'P', 'B', 'SPAN', 'CENTER'].includes(tag) &&
        $node.contents().length > 0
      ) {
        let hasMixedChildren = false;
        $node.contents().each((_, child) => {
          const childContext = detectStructure($raw, child);
          let childType = classifyByAttributes($raw, child, childContext);
          if (!childType || childType === TYPES.MAIN_TEXT) {
            const childText = $raw(child).text ? $raw(child).text() : '';
            const textType = classifyByText(childText);
            if (textType) childType = textType;
          }
          if (childType && childType !== TYPES.MAIN_TEXT && childType !== 'paragraph') {
            hasMixedChildren = true;
          }
          const childTag = (child.tagName || '').toUpperCase();
          if (
            childTag === 'DIV' &&
            ($raw(child).hasClass('swy1') || $raw(child).find('div.swy1').length > 0)
          ) {
            hasMixedChildren = true;
          }
        });

        if (hasMixedChildren) {
          $node.contents().each((_, child) => {
            if (isClaimed(child) && chapterTitleNodes.has(child)) {
              flushText();
              const titleText = $raw(child).text().trim().replace(/\s+/g, '');
              if (titleText) {
                flushChapter();
                currentChapter.title = titleText;
              }
              return;
            }
            processNode(child);
          });
          return;
        }
      }
    }

    switch (type) {
      case TYPES.BOOK_TITLE:
        break;

      case TYPES.CHAPTER_TITLE: {
        flushText();
        const titleText = $node.text().trim().replace(/\s+/g, '');
        if (titleText) {
          flushChapter();
          currentChapter.title = titleText;
        }
        break;
      }

      case TYPES.INLINE_ANNOTATION: {
        const annText = $node.text().trim();
        if (annText) {
          currentAnnotations.push({ text: annText });
        }
        break;
      }

      case TYPES.SECTION_SUMMARY: {
        flushText();
        currentChapter.sections.push({
          type: TYPES.SECTION_SUMMARY,
          content: $node.text().trim(),
        });
        break;
      }

      case TYPES.END_MARKER: {
        pastEndMarker = true;
        break;
      }

      case TYPES.COLOPHON: {
        flushText();
        currentChapter.sections.push({
          type: TYPES.COLOPHON,
          content: $node.text().trim(),
        });
        break;
      }

      case TYPES.NAV_ITEM: {
        const href = $node.attr('href') || '';
        const label = $node.text().trim();
        if (href && label) {
          ir.navItems.push({ href, label });
        }
        break;
      }

      case 'list-context': {
        $node.find('li, a').each((_, child) => {
          const $child = $raw(child);
          const childTag = (child.tagName || '').toUpperCase();
          if (childTag === 'A') {
            const href = $child.attr('href') || '';
            const label = $child.text().trim();
            if (href && label) {
              ir.navItems.push({ href, label });
            }
          } else {
            const liText = $child.text().trim();
            if (liText) {
              currentText += (currentText ? '\n' : '') + liText;
            }
          }
        });
        break;
      }

      case 'menu-context': {
        $node.find('a').each((_, child) => {
          const $child = $raw(child);
          const href = $child.attr('href') || '';
          const label = $child.text().trim();
          if (href && label) {
            ir.navItems.push({ href, label });
          }
        });
        break;
      }

      default: {
        if (pastEndMarker) {
          flushText();
          currentChapter.sections.push({
            type: TYPES.COLOPHON,
            content: $node.text().trim(),
          });
        } else if (tag === 'BR') {
          flushText();
        } else if (tag === 'PRE') {
          const preText = $node.text().trim();
          const paragraphs = preText.split(/\n\s*\n/).filter((p) => p.trim());
          for (const para of paragraphs) {
            currentText += (currentText ? ' ' : '') + para.trim();
          }
          flushText();
        } else {
          const text = $node.text().trim();
          if (text && text.length > 1) {
            currentText += (currentText ? ' ' : '') + text;
          }
        }
        break;
      }
    }
  }

  if (options.patternCache && !hasCachedPatterns(options.patternCache, title)) {
    analyzeAndCache(options.patternCache, html, title);
  }

  const bodyChildren = $raw('body').children();
  const swy1Direct = $raw('body > div.swy1').first();
  const elements =
    swy1Direct.length > 0 && bodyChildren.length === 1 ? swy1Direct.contents() : bodyChildren;

  elements.each((_, node) => {
    processNode(node);
  });

  flushChapter();

  ir.chapters = ir.chapters.filter((ch) => ch.sections.length > 0 || ch.title);

  return ir;
}

// ── Catalog Dictionary (re-imported here for extractContent) ───────
// These are also re-exported from the facade, but extractContent needs
// them locally. We import them from the facade's sibling logic — but
// since we can't have circular imports, we define them here and the
// facade will re-export.

/**
 * Build a catalog dictionary from catalog IR objects.
 *
 * @param {Array<{ir: object, catalogDir: string}>} catalogs
 * @returns {Map<string, CatalogEntry>}
 */
export function buildCatalogDict(catalogs) {
  /** @type {Map<string, CatalogEntry>} */
  const dict = new Map();

  for (const { ir } of catalogs) {
    for (const item of ir.navItems) {
      const resolvedPath = item.href;
      dict.set(resolvedPath, {
        title: ir.title,
        dynasty: ir.dynasty || '',
        author: ir.author || '',
        category: ir.category || '',
        catalogSource: ir.source || '',
      });
    }
  }

  return dict;
}

/**
 * Look up metadata from catalog dictionary by source path.
 *
 * @param {Map<string, CatalogEntry>} dict
 * @param {string} sourcePath
 * @returns {{dynasty: string, author: string, title: string} | null}
 */
export function lookupCatalogMeta(dict, sourcePath) {
  const basename = path.basename(sourcePath);
  if (dict.has(basename)) {
    return dict.get(basename);
  }

  for (const [href, entry] of dict) {
    if (sourcePath.endsWith(href) || href.endsWith(basename)) {
      return entry;
    }
  }

  return null;
}
