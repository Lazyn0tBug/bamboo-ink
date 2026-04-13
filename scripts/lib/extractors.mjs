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
  if (/text-align\s*:\s*center/i.test($node.attr('style') || '')) return true;
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
    if (/text-align\s*:\s*center/i.test($p.attr('style') || '')) {
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

const METADATA_RE = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+)[）)\s]?/;

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
      territory.claimLeaf(node);
      return { dynasty: match[1], author: match[2] };
    }
  }

  for (const node of index.allTextNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const text = $(node).text().trim();
    const match = text.match(METADATA_RE);
    if (match) {
      territory.claimLeaf(node);
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

// ── Territorial Pass 4: Annotation ─────────────────────────────────

/**
 * Pass 4: Extract inline-annotation nodes from DOM index.
 * Territorial: only claims unclaimed nodes, uses claimLeaf.
 *
 * Equivalent to CLASSIFICATION_RULES annotation branches:
 *   class-annotation, class-reference, class-notes,
 *   style-annotation-9pt, style-annotation-10pt
 *
 * @param {DomIndex} index
 * @param {Function} $
 * @param {object} territory
 * @returns {Array<{text: string, sourceNode: object}>}
 */
export function pass4Annotation(index, $, territory) {
  /** @type {Array<{text: string, sourceNode: object}>} */
  const annotations = [];

  function tryClaim(node) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) return false;
    const $node = $(node);
    const text = $node.text().trim();
    if (!text) return false;
    territory.claimLeaf(node);
    annotations.push({ text, sourceNode: node });
    return true;
  }

  // Class-based: annotation, reference, notes
  for (const cls of ['annotation', 'reference', 'notes']) {
    const nodes = index.byClass.get(cls) || [];
    for (const node of nodes) {
      tryClaim(node);
    }
  }

  // Style-based: FONT-SIZE: 9pt (check byTag for font elements)
  const fontNodes = index.byTag.get('font') || [];
  for (const node of fontNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const $node = $(node);
    const style = $node.attr('style') || '';
    if (/FONT-SIZE:\s*9pt/i.test(style)) {
      tryClaim(node);
    }
  }

  // Style-based: FONT-SIZE: 10pt + #551A8B (check font and span elements)
  const spanNodes = index.byTag.get('span') || [];
  const styleCheckNodes = [...fontNodes, ...spanNodes];
  for (const node of styleCheckNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const $node = $(node);
    const style = $node.attr('style') || '';
    const color = ($node.attr('color') || '').toUpperCase();
    if (/FONT-SIZE:\s*10pt/i.test(style) && /551A8B/i.test(color + ' ' + style)) {
      tryClaim(node);
    }
  }

  return annotations;
}

// ── Territorial Pass 8: Nav Item ───────────────────────────────────

/**
 * Pass 8: Extract nav-item nodes from DOM index.
 * Territorial: only claims unclaimed nodes, uses claimLeaf.
 *
 * Equivalent to CLASSIFICATION_RULES nav-item branches:
 *   anchor-nav, plus list-context/menu-context nav extraction
 *
 * @param {DomIndex} index
 * @param {Function} $
 * @param {object} territory
 * @param {object} ir
 */
export function pass8NavItem(index, $, territory, ir) {
  // menu-context: class=menu > a — claim menu first to prevent double-counting
  const menuNodes = index.byClass.get('menu') || [];
  for (const node of menuNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    $(node)
      .find('a')
      .each((_, child) => {
        const $child = $(child);
        const href = $child.attr('href') || '';
        const label = $child.text().trim();
        if (href && label && label.length < 50) {
          ir.navItems.push({ href, label });
        }
      });
    territory.claimSubtree(node);
  }

  // list-context: OL/UL > li/a — claim list first to prevent double-counting
  for (const tag of ['ol', 'ul']) {
    const listNodes = index.byTag.get(tag) || [];
    for (const listNode of listNodes) {
      if (territory.isClaimed(listNode) || territory.hasClaimedAncestor(listNode)) continue;
      $(listNode)
        .find('li, a')
        .each((_, child) => {
          const $child = $(child);
          const childTag = (child.tagName || '').toUpperCase();
          if (childTag === 'A') {
            const href = $child.attr('href') || '';
            const label = $child.text().trim();
            if (href && label && label.length < 50) {
              ir.navItems.push({ href, label });
            }
          }
          // li text is handled by extractRemaining as main-text
        });
      territory.claimSubtree(listNode);
    }
  }

  // Direct anchors with href (skip those inside claimed menu/list containers)
  const anchorNodes = index.byTag.get('a') || [];
  for (const node of anchorNodes) {
    if (territory.isClaimed(node) || territory.hasClaimedAncestor(node)) continue;
    const $node = $(node);
    const href = $node.attr('href') || '';
    const label = $node.text().trim();
    if (href && label && label.length < 50) {
      territory.claimLeaf(node);
      ir.navItems.push({ href, label });
    }
  }
}

// ── Title Extraction (fallback) ────────────────────────────────────

function extractTitle($, index) {
  const titleTag = $('title').text().trim();
  if (titleTag) return titleTag;

  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  // Use DOM index for color/size scan — eliminates duplicate $('font') traversal
  // that pass1BookTitle also performs via index.byColor.
  const colorFF6666 = index.byColor.get('#FF6666') || [];
  const colorFF0000 = index.byColor.get('#FF0000') || [];
  const bookColorNodes = [...colorFF6666, ...colorFF0000];

  let found = '';
  for (const node of bookColorNodes) {
    if (found) break;
    const size = parseInt($(node).attr('size') || '0', 10);

    if (size >= 5) {
      const text = $(node).text().trim();
      if (text.length > 0 && text.length < 50) {
        found = text;
      }
    }

    // Check for nested font with size ≥ 5
    if (!size) {
      $(node)
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
  }

  // Also check: size on element, color on ancestor font
  if (!found) {
    const size5plus = index.bySize.get('5') || [];
    for (const node of size5plus) {
      if (found) break;
      let parent = node.parent;
      while (parent && parent.tagName === 'font') {
        const parentColor = ($(parent).attr('color') || '').toUpperCase();
        if (parentColor === '#FF6666' || parentColor === '#FF0000') {
          const text = $(node).text().trim();
          if (text.length > 0 && text.length < 50) {
            found = text;
          }
          break;
        }
        parent = parent.parent;
      }
    }
  }

  if (found) return found;

  return 'Untitled';
}

// ── Text Assembly (replaces processNode recursive traversal) ───────

/**
 * Assemble text, annotations, and chapter titles into IR chapters/sections.
 * Walks top-level elements under the content container. Skips claimed nodes.
 * Chapter title nodes (claimed by Pass 3) serve as chapter boundaries.
 *
 * @param {Array<{type: string, content: string, sourceNodes: object[]}>} textRegions
 * @param {Array<{text: string, sourceNode: object}>} annotations
 * @param {WeakSet<object>} chapterTitleNodes
 * @param {Function} $
 * @param {object} territory
 * @param {object} ir
 */
export function assembleResults(textRegions, annotations, chapterTitleNodes, $, territory, ir) {
  let pastEndMarker = false;
  let currentChapter = { title: '', sections: [] };
  let currentText = '';
  /** @type {Array<{text: string}>} */
  let currentAnnotations = [];

  function flushText() {
    if (currentText.trim()) {
      const trimmed = currentText.trim();
      if (SECTION_SUMMARY_RE.test(trimmed)) {
        currentChapter.sections.push({
          type: TYPES.SECTION_SUMMARY,
          content: trimmed,
        });
      } else if (END_MARKER_RE.test(trimmed)) {
        pastEndMarker = true;
        const beforeMarker = trimmed.replace(END_MARKER_RE, '').trim();
        if (beforeMarker) {
          const section = { type: TYPES.MAIN_TEXT, content: beforeMarker };
          if (currentAnnotations.length > 0) {
            section.annotations = [...currentAnnotations];
            currentAnnotations = [];
          }
          currentChapter.sections.push(section);
        }
      } else if (pastEndMarker) {
        currentChapter.sections.push({
          type: TYPES.COLOPHON,
          content: trimmed,
        });
      } else {
        const section = { type: TYPES.MAIN_TEXT, content: trimmed };
        if (currentAnnotations.length > 0) {
          section.annotations = [...currentAnnotations];
          currentAnnotations = [];
        }
        currentChapter.sections.push(section);
      }
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

  // Build annotation lookup: node → [{text}]
  /** @type {Map<object, Array<{text: string}>>} */
  const annotationByNode = new Map();
  for (const ann of annotations) {
    const existing = annotationByNode.get(ann.sourceNode) || [];
    existing.push({ text: ann.text });
    annotationByNode.set(ann.sourceNode, existing);
  }

  /**
   * Check if any descendant of node is a chapter title node.
   */
  function hasChapterTitleDescendant(node) {
    let found = false;
    $(node)
      .find('*')
      .each((_, child) => {
        if (found) return;
        if (chapterTitleNodes.has(child)) found = true;
      });
    return found;
  }

  /**
   * Check if any descendant is an annotation node, and collect them.
   * Walks annotationByNode and checks if the annotation node is under `node`.
   */
  function collectAnnotationsFromDescendants(node) {
    for (const [annNode, anns] of annotationByNode) {
      // Walk up from annNode to see if node is an ancestor
      let p = annNode;
      while (p) {
        if (p === node) {
          currentAnnotations.push(...anns);
          break;
        }
        p = p.parent;
      }
    }
  }

  /**
   * Process a single node, similar to old processNode but simpler.
   * Only walks top-level elements; recurses only for mixed-content containers.
   */
  function processElement(node) {
    // Skip claimed nodes (but check for chapter titles)
    if (territory.isClaimed(node)) {
      if (chapterTitleNodes.has(node)) {
        flushText();
        const titleText = $(node).text().trim().replace(/\s+/g, '');
        if (titleText) {
          flushChapter();
          currentChapter.title = titleText;
        }
      }
      return;
    }

    // Skip nodes under claimed ancestors (their text was already handled)
    if (territory.hasClaimedAncestor(node)) return;

    const tag = (node.tagName || '').toUpperCase();

    // H2/H3/H4 → chapter boundary (even if not claimed by Pass 3, e.g. non-centered H4)
    if (tag === 'H2' || tag === 'H3' || tag === 'H4') {
      flushText();
      const titleText = $(node).text().trim().replace(/\s+/g, '');
      if (titleText) {
        flushChapter();
        currentChapter.title = titleText;
      }
      return;
    }

    // BR → paragraph break
    if (tag === 'BR') {
      flushText();
      return;
    }

    // PRE → formatted text
    if (tag === 'PRE') {
      const preText = $(node).text().trim();
      const paragraphs = preText.split(/\n\s*\n/).filter((p) => p.trim());
      for (const para of paragraphs) {
        if (currentText) currentText += ' ' + para.trim();
        else currentText = para.trim();
      }
      flushText();
      return;
    }

    // Check if this node has a chapter title descendant
    if (hasChapterTitleDescendant(node)) {
      // Collect annotations from this node before recursing
      collectAnnotationsFromDescendants(node);
      // Process children individually
      $(node)
        .contents()
        .each((_, child) => {
          processElement(child);
        });
      return;
    }

    // Check for annotations among descendants and collect them
    collectAnnotationsFromDescendants(node);

    // Accumulate text from this element, excluding claimed annotation text
    // Clone and remove claimed annotation descendants to get clean text
    const $clone = $(node).clone();
    $clone.find('*').each((_, child) => {
      if (territory.isClaimed(child)) {
        $(child, $clone).remove();
      }
    });
    // Also remove claimed direct children (find doesn't get direct children)
    $clone.contents().each((_, child) => {
      if (territory.isClaimed(child)) {
        $(child, $clone).remove();
      }
    });
    const text = $clone.text().trim();
    if (text && text.length > 1) {
      if (currentText) currentText += ' ' + text;
      else currentText = text;
    }
  }

  // Get root elements
  const bodyChildren = $('body').children();
  const swy1Direct = $('body > div.swy1').first();
  const rootElements =
    swy1Direct.length > 0 && bodyChildren.length === 1 ? swy1Direct.contents() : bodyChildren;

  rootElements.each((_, node) => {
    processElement(node);
  });

  flushChapter();
  ir.chapters = ir.chapters.filter((ch) => ch.sections.length > 0 || ch.title);
}

// ── Text Pattern Classification ────────────────────────────────────

const SECTION_SUMMARY_RE =
  /^右(?:传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章)/;
const END_MARKER_RE = /[\u4e00-\u9fff]+[\s]*[終终]\s*$/;

// ── Processing Result Builder ──────────────────────────────────────

/**
 * Build a ProcessingResult from an IR object and start time.
 * Detects quality warnings for observability.
 *
 * @param {object} ir - The content IR object
 * @param {number} startTime - Timestamp from Date.now() at start of extraction
 * @returns {ProcessingResult}
 */
function buildResult(ir, startTime) {
  const elapsedMs = Date.now() - startTime;
  const warnings = [];

  if (!ir.title || ir.title === 'Untitled') warnings.push('untitled-title');
  if (ir.chapters.length === 0) warnings.push('zero-chapters');
  if (!ir.author && !ir.dynasty) warnings.push('missing-metadata');
  if (ir.docType === 'catalog' && ir.navItems.length === 0) warnings.push('catalog-no-navitems');

  let annotationsCount = 0;
  let sectionsCount = 0;
  for (const ch of ir.chapters) {
    sectionsCount += ch.sections.length;
    for (const sec of ch.sections) {
      annotationsCount += (sec.annotations || []).length;
    }
  }

  return {
    sourcePath: ir.source,
    docType: ir.docType,
    title: ir.title,
    chaptersCount: ir.chapters.length,
    annotationsCount,
    sectionsCount,
    elapsedMs,
    warnings,
  };
}

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
 * @typedef {Object} ProcessingResult
 * @property {string} sourcePath
 * @property {string} docType
 * @property {string} title
 * @property {number} chaptersCount
 * @property {number} annotationsCount
 * @property {number} sectionsCount
 * @property {number} elapsedMs
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} ExtractResult
 * @property {object} ir - The content IR object
 * @property {ProcessingResult} result - Processing metrics and warnings
 */

/**
 * @typedef {Object} ExtractOptions
 * @property {Map<string, CatalogEntry>} [catalogDict]
 * @property {string} [category]
 * @property {PatternCache} [patternCache]
 * @property {boolean} [returnResult] - If true, return { ir, result } instead of just ir
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
  const startTime = Date.now();
  html = normalizeHtml(html);

  const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
  const index = buildDomIndex($raw);
  const title = extractTitle($raw, index);
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
      const match = bodyFullText.match(METADATA_RE);
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
    const result = buildResult(ir, startTime);
    if (options.returnResult) {
      return { ir, result };
    }
    return ir;
  }

  const territory = createTerritory($raw, TYPES);

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

  // ── Populate Pattern Cache (A4) ──────────────────────────────────
  if (options.patternCache && ir.title && ir.title !== 'Untitled') {
    if (!hasCachedPatterns(options.patternCache, ir.title)) {
      analyzeAndCache(options.patternCache, html, ir.title);
    }
  }

  // ── Territorial Pass 4-9 + Text Assembly ─────────────────────────

  const annotations = pass4Annotation(index, $raw, territory);
  if (ir.docType !== 'catalog') {
    pass8NavItem(index, $raw, territory, ir);
  }
  const textRegions = territory.extractRemaining();
  assembleResults(textRegions, annotations, chapterTitleNodes, $raw, territory, ir, chapterTitles);

  const result = buildResult(ir, startTime);
  if (options.returnResult) {
    return { ir, result };
  }
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
