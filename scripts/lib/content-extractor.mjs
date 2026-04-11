/**
 * JSON IR Content Extractor
 *
 * Extracts structured content from legacy HTML (FrontPage/MSHTML) into
 * a JSON intermediate representation. Uses a multi-pass classifier:
 *   Pass 1: Structural context (centered, link, list, etc.)
 *   Pass 2: Attribute rules (font size, color, class)
 *   Pass 3: Text patterns (end markers, section summaries)
 *
 * Metadata (dynasty, author) comes from the catalog dictionary, not regex.
 *
 * Supported content types:
 *   book-title, metadata, chapter-title, main-text, inline-annotation,
 *   section-summary, colophon, nav-item, end-marker
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import fs from 'fs/promises';
import path from 'path';
import { analyzeAndCache, hasCachedPatterns, flattenTables } from './pattern-cache.mjs';

// ── Content Type Constants ────────────────────────────────────────

const TYPES = {
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

// Section summary patterns: "右传之X章" and "右经X章"
// Includes "首章" (first chapter) in addition to numbered chapters
const SECTION_SUMMARY_RE =
  /^右(?:传之(?:首|[一二三四五六七八九十]+)章|经(?:首|[一二三四五六七八九十]*)章)/;

// End marker pattern: "儀 禮 終", "仪礼终", "周易終" (both traditional 終 and simplified 终)
const END_MARKER_RE = /[\u4e00-\u9fff]+[\s]*[終终]\s*$/;

// Metadata pattern: "(朝代·作者)" — only used for catalog page body text
// as fallback; primary metadata comes from catalog dictionary
const METADATA_RE_BODY = /\(?([\u4e00-\u9fff]{1,4})[·\.\-]([\u4e00-\u9fff]+?)[）)\s]/;

// ── Catalog Dictionary ───────────────────────────────────────────

/**
 * @typedef {Object} CatalogEntry
 * @property {string} title - Book title
 * @property {string} dynasty - Dynasty name
 * @property {string} author - Author name
 * @property {string} category - e.g., "经部", "史部"
 * @property {string} catalogSource - Source path of the catalog page
 */

/**
 * Build a catalog dictionary from catalog IR objects.
 * Maps resolved href paths to book metadata.
 *
 * @param {Array<{ir: object, catalogDir: string}>} catalogs - Catalog IRs with their base directories
 * @returns {Map<string, CatalogEntry>} href -> metadata map
 */
export function buildCatalogDict(catalogs) {
  /** @type {Map<string, CatalogEntry>} */
  const dict = new Map();

  for (const { ir } of catalogs) {
    for (const item of ir.navItems) {
      // Resolve relative href against catalog directory
      const resolvedPath = item.href; // Keep as-is for now; resolve at lookup time
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
 * Tries exact match, basename match, and parent directory match.
 *
 * @param {Map<string, CatalogEntry>} dict - Catalog dictionary
 * @param {string} sourcePath - e.g., "经部/大学章句集注.htm"
 * @returns {{dynasty: string, author: string, title: string} | null}
 */
export function lookupCatalogMeta(dict, sourcePath) {
  // Try exact href match
  const basename = path.basename(sourcePath);
  if (dict.has(basename)) {
    return dict.get(basename);
  }

  // Try matching against partial path (e.g., "列女传/001.htm")
  for (const [href, entry] of dict) {
    if (sourcePath.endsWith(href) || href.endsWith(basename)) {
      return entry;
    }
  }

  return null;
}

// ── Encoding Detection ───────────────────────────────────────────

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

// ── Title Extraction ─────────────────────────────────────────────

function extractTitle($) {
  // Try <title> tag first
  const titleTag = $('title').text().trim();
  if (titleTag) return titleTag;

  // Try <h1>
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  // Try centered <FONT color=#FF6666> or <FONT color=#FF0000> with SIZE>=5
  // Handle nested FONT tags where color and size may be on different elements
  let found = '';
  $('font').each((_, el) => {
    if (found) return;
    const color = ($(el).attr('color') || '').toUpperCase();
    const size = parseInt($(el).attr('size') || '0', 10);

    // Direct: this font has both color and size
    if ((color === '#FF6666' || color === '#FF0000') && size >= 5) {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 50) {
        found = text;
      }
    }

    // Nested: this font has color, check descendants for size>=5
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

    // Nested: this font has size>=5, check ancestors for book color
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

// ── Structural Context Detection (Pass 1) ────────────────────────

function detectStructure($, node) {
  const $node = $(node);
  const tag = node.tagName || '';

  if (tag === 'a' && $node.attr('href')) {
    return 'link';
  }

  // Check if node is inside a <CENTER> ancestor
  let inCenter = false;
  $node.parents().each((_, p) => {
    if ($(p).is('center') || $(p).css('text-align') === 'center') {
      inCenter = true;
    }
  });
  if (
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

// ── Attribute Classification (Pass 2) ────────────────────────────

function classifyByAttributes($, node, context) {
  const $node = $(node);
  const tag = (node.tagName || '').toUpperCase();
  const text = $node.text().trim();

  // Skip empty nodes
  if (!text && tag !== 'BR' && tag !== 'HR') return null;

  // ── text.css CSS class rules (highest priority — authoritative) ──
  const className = ($node.attr('class') || '').trim();

  // class=article → book-title (text.css: 24pt, #FF6666)
  if (className === 'article') return TYPES.BOOK_TITLE;

  // class=chapter → chapter-title (text.css: 18pt, #551A8B)
  if (className === 'chapter') return TYPES.CHAPTER_TITLE;

  // class=section → sub-chapter heading (text.css: 14pt, #336699)
  if (className === 'section') return TYPES.CHAPTER_TITLE;

  // class=annotation → inline-annotation (text.css: 10pt, #551A8B) — any tag
  if (className === 'annotation') return TYPES.INLINE_ANNOTATION;

  // class=reference → inline-annotation (text.css: 10pt, black) — any tag
  if (className === 'reference') return TYPES.INLINE_ANNOTATION;

  // class=menu → catalog/nav context (text.css: 14pt, #333333)
  if (className === 'menu') return 'menu-context';

  // class=jing / class=zhuan → main-text subtypes (text.css: 经文/传文)
  if (className === 'jing' || className === 'zhuan') return TYPES.MAIN_TEXT;

  // --- Centered context ---
  if (context === 'centered' || context === 'center') {
    // Check for CSS class in child fonts (text.css authoritative)
    let hasChapterClass = false;
    let hasArticleClass = false;
    $node.find('font').each((_, f) => {
      const childClass = ($(f).attr('class') || '').trim();
      if (childClass === 'chapter') hasChapterClass = true;
      if (childClass === 'article') hasArticleClass = true;
    });
    if (hasArticleClass) return TYPES.BOOK_TITLE;
    if (hasChapterClass) return TYPES.CHAPTER_TITLE;

    // Check for chapter title: COLOR="#CC33CC"
    let hasCC33CC = false;
    $node.find('font').each((_, f) => {
      if (($(f).attr('color') || '').toUpperCase() === '#CC33CC') {
        hasCC33CC = true;
      }
    });
    if (($(node).attr('color') || '').toUpperCase() === '#CC33CC' || hasCC33CC) {
      return TYPES.CHAPTER_TITLE;
    }

    // Check for book title: COLOR="#FF6666" + SIZE>=5, or COLOR="#FF0000" + SIZE>=5
    let isBookTitle = false;
    $node.find('font').each((_, f) => {
      const color = ($(f).attr('color') || '').toUpperCase();
      const size = parseInt($(f).attr('size') || '0', 10);
      if ((color === '#FF6666' || color === '#FF0000') && size >= 5) {
        isBookTitle = true;
      }
    });
    if (isBookTitle) return TYPES.BOOK_TITLE;

    if (['H2', 'H3', 'H4'].includes(tag)) {
      return TYPES.CHAPTER_TITLE;
    }
  }

  // --- Font size / color annotations (check any element with inline style) ---
  const style = $node.attr('style') || '';
  if (style) {
    if (/FONT-SIZE:\s*9pt/i.test(style)) return TYPES.INLINE_ANNOTATION;
    // text.css .annotation: 10pt + color=#551A8B (check both color attr and style)
    if (
      /FONT-SIZE:\s*10pt/i.test(style) &&
      /551A8B/i.test(($node.attr('color') || '') + ' ' + style)
    )
      return TYPES.INLINE_ANNOTATION;
  }
  // Also check for class-based annotation on the node itself
  if (className === 'notes') return TYPES.INLINE_ANNOTATION;

  // --- class="swy1" → main text (12pt) ---
  if ($node.hasClass('swy1')) return TYPES.MAIN_TEXT;

  // --- <a href> → nav item ---
  if (tag === 'A' && $node.attr('href')) return TYPES.NAV_ITEM;

  // --- <P align=justify> or <p class=MsoNormal> → main text ---
  if (
    tag === 'P' &&
    (($node.attr('align') || '').toLowerCase() === 'justify' || $node.hasClass('MsoNormal'))
  ) {
    return TYPES.MAIN_TEXT;
  }

  // --- Headings → chapter titles ---
  if (['H2', 'H3', 'H4'].includes(tag)) return TYPES.CHAPTER_TITLE;

  // --- OL/UL → list (nav items inside) ---
  if (tag === 'OL' || tag === 'UL') {
    return 'list-context';
  }

  return TYPES.MAIN_TEXT;
}

// ── Text Pattern Classification (Pass 3) ─────────────────────────

function classifyByText(text) {
  const trimmed = text
    .trim()
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!trimmed) return null;

  // End marker
  if (END_MARKER_RE.test(trimmed)) return TYPES.END_MARKER;

  // Section summary
  if (SECTION_SUMMARY_RE.test(trimmed)) return TYPES.SECTION_SUMMARY;

  return null;
}

// ── Main Extraction ──────────────────────────────────────────────

/**
 * @typedef {Object} ExtractOptions
 * @property {Map<string, CatalogEntry>} [catalogDict] - Catalog dictionary for metadata lookup
 * @property {string} [category] - Category override (e.g., "经部")
 * @property {Map<string, object>} [patternCache] - Pattern cache for multi-file extraction
 */

/**
 * Extract content from raw HTML into a JSON IR object.
 *
 * @param {string} html - Raw HTML string (UTF-8 or decoded from GBK)
 * @param {string} sourcePath - Relative source path (e.g., "经部/论语.htm")
 * @param {ExtractOptions} [options] - Optional catalog dictionary and overrides
 * @returns {object} JSON IR object
 */
export function extractContent(html, sourcePath, options = {}) {
  // Pre-process: flatten table-wrapped content (Template F pattern)
  html = flattenTables(html);

  const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });

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

  // Try catalog dictionary first for metadata
  if (options.catalogDict) {
    const catalogMeta = lookupCatalogMeta(options.catalogDict, sourcePath);
    if (catalogMeta) {
      if (catalogMeta.author) ir.author = catalogMeta.author;
      if (catalogMeta.dynasty) ir.dynasty = catalogMeta.dynasty;
    }
  }

  // ── Check if this is a catalog page ──
  const linkCount = $raw('a[href]').length;
  const bodyText = $raw('body').text().replace(/\s+/g, '').length;

  // Catalog: many links, short body text
  if (linkCount > 5 && bodyText < 3000) {
    ir.docType = 'catalog';
    // Fallback: try to find metadata in body text
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

  // ── Content extraction ──
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
    // Attach any remaining orphan annotations to the last section
    if (currentAnnotations.length > 0) {
      const sections = currentChapter.sections;
      if (sections.length > 0) {
        const lastSection = sections[sections.length - 1];
        if (lastSection.type === TYPES.MAIN_TEXT) {
          lastSection.annotations = [...(lastSection.annotations || []), ...currentAnnotations];
        } else {
          // Add as a standalone annotation section
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

  /**
   * Process a single element node.
   * If the element is a container (div, font with mixed content),
   * recursively process its children first.
   */
  function processNode(node) {
    const context = detectStructure($raw, node);
    let type = classifyByAttributes($raw, node, context);

    // Pass 3: text pattern override
    if (!type || type === TYPES.MAIN_TEXT) {
      const textType = classifyByText($raw(node).html() || $raw(node).text());
      if (textType) type = textType;
    }

    const $node = $raw(node);
    const tag = (node.tagName || '').toUpperCase();

    // If this is a container element with mixed children (like a FONT that
    // absorbed annotations and chapter titles), process children first
    if (!type || type === TYPES.MAIN_TEXT) {
      if (['FONT', 'DIV', 'P', 'B', 'SPAN'].includes(tag) && $node.contents().length > 0) {
        let hasMixedChildren = false;
        $node.contents().each((_, child) => {
          const childContext = detectStructure($raw, child);
          let childType = classifyByAttributes($raw, child, childContext);
          // Also check text patterns for children (including text nodes)
          if (!childType || childType === TYPES.MAIN_TEXT) {
            const childText = $raw(child).text ? $raw(child).text() : '';
            const textType = classifyByText(childText);
            if (textType) childType = textType;
          }
          if (childType && childType !== TYPES.MAIN_TEXT && childType !== 'paragraph') {
            hasMixedChildren = true;
          }
        });

        if (hasMixedChildren) {
          $node.contents().each((_, child) => {
            processNode(child);
          });
          return; // Skip processing this node itself
        }
      }
    }

    switch (type) {
      case TYPES.BOOK_TITLE:
        // Already captured in title field
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
        let annText = $node.text().trim();
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
        // MAIN_TEXT or general content
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

  // Process content from the appropriate container
  // Container detection always runs (cheap DOM query).
  // The pattern cache is used to skip redundant classification analysis,
  // not to bypass container selection.
  if (options.patternCache && !hasCachedPatterns(options.patternCache, title)) {
    analyzeAndCache(options.patternCache, html, title);
  }

  const bodyChildren = $raw('body').children();
  const swy1 = $raw('body > div.swy1').first();
  const elements = swy1.length > 0 && bodyChildren.length === 1 ? swy1.contents() : bodyChildren;

  // Walk content elements (with recursive descent into mixed containers)
  elements.each((_, node) => {
    processNode(node);
  });

  // Flush remaining
  flushChapter();

  // Clean up empty chapters
  ir.chapters = ir.chapters.filter((ch) => ch.sections.length > 0 || ch.title);

  return ir;
}

// ── IR Writer ────────────────────────────────────────────────────

/**
 * Write a JSON IR object to disk.
 *
 * @param {object} ir - JSON IR object
 * @param {string} outputDir - Output directory (e.g., src/content-ir)
 * @param {string} sourcePath - Relative source path (e.g., "经部/论语.htm")
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

// ── Output Generation ────────────────────────────────────────────

/**
 * Generate HTML5 from JSON IR.
 *
 * @param {object} ir - JSON IR object
 * @returns {string} HTML5 string
 */
export function renderHtml5(ir) {
  const head = `<!DOCTYPE html><html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ir.title)}</title>
  <link rel="stylesheet" href="../styles/normalized.css">
</head>`;

  let body = '<body>\n  <article>\n';
  body += `    <h1>${escapeHtml(ir.title)}</h1>\n`;

  if (ir.docType === 'catalog' && ir.navItems.length > 0) {
    body += '  <nav class="mt-8"><ul class="space-y-2">';
    for (const item of ir.navItems) {
      body += `<li class="font-kai text-mo-600"><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
    }
    body += '</ul></nav>';
  } else if (ir.docType === 'content') {
    for (const chapter of ir.chapters) {
      if (chapter.title) {
        body += `<h2 class="font-li text-xl text-dai-500 mt-8 mb-4">${escapeHtml(chapter.title)}</h2>`;
      }

      let sectionOpen = false;
      for (const section of chapter.sections) {
        if (section.type === 'main-text') {
          if (sectionOpen) body += '</section>';
          body += '<section class="mt-8 pt-8 border-t border-border-secondary">';
          sectionOpen = true;

          let paraContent = escapeHtml(section.content);
          if (section.annotations && section.annotations.length > 0) {
            for (const ann of section.annotations) {
              paraContent += ` <span class="annotation">${escapeHtml(ann.text)}</span>`;
            }
          }
          body += `<p class="font-kai leading-loose text-mo-600">${paraContent}</p>`;
        } else if (section.type === 'section-summary') {
          body += `<p class="font-kai italic text-sm text-dai-400">${escapeHtml(section.content)}</p>`;
        } else if (section.type === 'colophon') {
          if (sectionOpen) {
            body += '</section>';
            sectionOpen = false;
          }
          body += `<section class="colophon"><p class="font-kai text-sm">${escapeHtml(section.content)}</p></section>`;
        }
      }
      if (sectionOpen) body += '</section>';
    }
  }

  body += '  </article>\n</body></html>';
  return head + body;
}

/**
 * Generate Markdown from JSON IR.
 *
 * @param {object} ir - JSON IR object
 * @returns {string} Markdown string with frontmatter
 */
export function renderMarkdown(ir) {
  const categoryMatch = ir.source.match(/^([^/]+)/);
  const category = categoryMatch ? categoryMatch[1] : undefined;

  let md = '---\n';
  md += `title: "${escapeYaml(ir.title)}"\n`;
  md += `docType: "${ir.docType}"\n`;
  if (category) md += `category: "${category}"\n`;
  if (ir.author) md += `author: "${escapeYaml(ir.author)}"\n`;
  if (ir.dynasty) md += `dynasty: "${escapeYaml(ir.dynasty)}"\n`;
  md += `date: "${new Date().toISOString().split('T')[0]}"\n`;
  md += `source: "${ir.source}"\n`;
  md += '---\n\n';

  if (ir.docType === 'catalog' && ir.navItems.length > 0) {
    for (const item of ir.navItems) {
      md += `* [${item.label}](${item.href})\n`;
    }
  } else if (ir.docType === 'content') {
    let footnoteCounter = 0;
    const footnotes = [];

    for (const chapter of ir.chapters) {
      if (chapter.title) {
        md += `\n## ${chapter.title}\n\n`;
      }

      for (const section of chapter.sections) {
        if (section.type === 'main-text') {
          let paraText = escapeMarkdown(section.content);

          if (section.annotations && section.annotations.length > 0) {
            for (const ann of section.annotations) {
              footnoteCounter++;
              paraText += `[^注${footnoteCounter}]`;
              footnotes.push(`[^注${footnoteCounter}]: ${ann.text}`);
            }
          }

          md += `${paraText}\n\n`;
        } else if (section.type === 'section-summary') {
          md += `*${section.content}*\n\n`;
        } else if (section.type === 'colophon') {
          md += `${section.content}\n\n`;
        }
      }
    }

    if (footnotes.length > 0) {
      md += footnotes.join('\n') + '\n';
    }
  }

  return md;
}

// ── Helpers ──────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeYaml(str) {
  return str.replace(/"/g, '\\"');
}

function escapeMarkdown(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#');
}
