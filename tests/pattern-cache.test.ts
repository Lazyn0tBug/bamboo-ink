import { describe, it, expect } from 'vitest';
import {
  createPatternCache,
  analyzePatterns,
  cachePatterns,
  getCachedPatterns,
  hasCachedPatterns,
  analyzeAndCache,
} from '../scripts/lib/pattern-cache.mjs';
import { extractContent } from '../scripts/lib/content-extractor.mjs';

// ── Test Fixtures ────────────────────────────────────────────────

// Template F style: swy1 container, CC33CC chapter titles, 9pt annotations
const templateFHtml = `<html><head><TITLE>大学章句集注</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT></B></CENTER>
<table border="0" width="90%"><tr>
<td class=swy1><center><B><FONT COLOR="#CC33CC">大学章句序</B></FONT></center>
大学之书，古之大学所以教人之法也。<br>
<FONT style="FONT-SIZE: 9pt">程子曰：此孔氏遗书，初学入德之门也。</FONT><br>
</td></tr></table>
</body></html>`;

// Template G style: bare text + BR, no swy1 container
const templateGHtml = `<html><head><TITLE>儀禮</title></head><body>
<H2><FONT COLOR="#FF0000">儀 禮</FONT></H2>
&nbsp;
<BR>士冠禮
<BR>士昏禮
<BR>士相见禮
<H4>士 冠 禮</H4>
士 冠 禮 。 筮 于 廟 門 。 主 人 玄 冠 朝 服 。
</body></html>`;

// ── Pattern Cache Tests ─────────────────────────────────────────

describe('createPatternCache', () => {
  it('should create an empty Map', () => {
    const cache = createPatternCache();
    expect(cache).toBeInstanceOf(Map);
    expect(cache.size).toBe(0);
  });
});

describe('analyzePatterns', () => {
  it('should detect swy1 container in Template F HTML', () => {
    const patterns = analyzePatterns(templateFHtml, '大学章句集注');
    expect(patterns.bookTitle).toBe('大学章句集注');
    expect(patterns.contentContainerSelector).toBe('body > div.swy1');
    expect(patterns.hasSwy1Container).toBe(true);
  });

  it('should detect body container in Template G HTML (no swy1)', () => {
    const patterns = analyzePatterns(templateGHtml, '儀禮');
    expect(patterns.bookTitle).toBe('儀禮');
    expect(patterns.contentContainerSelector).toBe('body');
    expect(patterns.hasSwy1Container).toBe(false);
  });

  it('should discover chapter title colors from centered elements', () => {
    const patterns = analyzePatterns(templateFHtml, '大学章句集注');
    expect(patterns.chapterTitlePatterns.centerColors).toContain('#CC33CC');
  });

  it('should discover annotation font sizes', () => {
    const patterns = analyzePatterns(templateFHtml, '大学章句集注');
    expect(patterns.annotationPatterns.fontSizes).toContain(9);
  });

  it('should discover annotation class values', () => {
    const htmlWithAnnotationClass = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>正文。<FONT class=annotation>注疏。</FONT></DIV>
</body></html>`;
    const patterns = analyzePatterns(htmlWithAnnotationClass, '论语');
    expect(patterns.annotationPatterns.classValues).toContain('annotation');
  });
});

describe('cachePatterns / getCachedPatterns / hasCachedPatterns', () => {
  it('should store and retrieve patterns', () => {
    const cache = createPatternCache();
    const patterns = analyzePatterns(templateFHtml, '大学章句集注');
    cachePatterns(cache, patterns);

    expect(hasCachedPatterns(cache, '大学章句集注')).toBe(true);
    expect(hasCachedPatterns(cache, '论语')).toBe(false);

    const retrieved = getCachedPatterns(cache, '大学章句集注');
    expect(retrieved).not.toBeNull();
    expect(retrieved.bookTitle).toBe('大学章句集注');
    expect(retrieved.contentContainerSelector).toBe('body > div.swy1');
  });

  it('should return null for missing book', () => {
    const cache = createPatternCache();
    const patterns = analyzePatterns(templateFHtml, '大学章句集注');
    cachePatterns(cache, patterns);

    expect(getCachedPatterns(cache, 'unknown')).toBeNull();
  });
});

describe('analyzeAndCache', () => {
  it('should analyze and cache in one step', () => {
    const cache = createPatternCache();
    const patterns = analyzeAndCache(cache, templateFHtml, '大学章句集注');

    expect(cache.size).toBe(1);
    expect(patterns.contentContainerSelector).toBe('body > div.swy1');
    expect(getCachedPatterns(cache, '大学章句集注')).toBe(patterns);
  });
});

// ── Edge Cases ───────────────────────────────────────────────────

describe('edge cases', () => {
  it('should handle book with only one file (cache created but not reused)', () => {
    const cache = createPatternCache();
    analyzeAndCache(cache, templateFHtml, '大学章句集注');

    // Only one file → cache exists but no other files to apply to
    expect(cache.size).toBe(1);
    expect(hasCachedPatterns(cache, '大学章句集注')).toBe(true);
  });

  it('should handle empty HTML gracefully', () => {
    const emptyHtml = '<html><head><title></title></head><body></body></html>';
    const patterns = analyzePatterns(emptyHtml, 'Empty');
    expect(patterns.bookTitle).toBe('Empty');
    expect(patterns.contentContainerSelector).toBe('body');
    expect(patterns.chapterTitlePatterns.centerColors).toEqual([]);
    expect(patterns.annotationPatterns.fontSizes).toEqual([]);
  });

  it('should cache patterns for different books independently', () => {
    const cache = createPatternCache();
    analyzeAndCache(cache, templateFHtml, '大学章句集注');
    analyzeAndCache(cache, templateGHtml, '儀禮');

    expect(cache.size).toBe(2);

    const fPatterns = getCachedPatterns(cache, '大学章句集注');
    const gPatterns = getCachedPatterns(cache, '儀禮');

    expect(fPatterns.contentContainerSelector).toBe('body > div.swy1');
    expect(gPatterns.contentContainerSelector).toBe('body');
  });
});

// ── Integration with extractContent ──────────────────────────────

describe('extractContent with patternCache', () => {
  it('should produce identical IR with and without pattern cache', () => {
    const cache = createPatternCache();

    // First extraction: analyzes and caches
    const ir1 = extractContent(templateFHtml, '经部/大学章句集注.htm', {
      patternCache: cache,
    });

    // Second extraction: uses cached patterns
    const ir2 = extractContent(templateFHtml, '经部/大学章句集注-2.htm', {
      patternCache: cache,
    });

    // Both should produce the same structure
    expect(ir1.title).toBe(ir2.title);
    expect(ir1.chapters.length).toBe(ir2.chapters.length);
    expect(ir1.chapters.map((ch) => ch.title)).toEqual(ir2.chapters.map((ch) => ch.title));
  });

  it('should fall back to full classification when no cache available', () => {
    // No patternCache option → full classification
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    expect(ir.title).toBe('大学章句集注');
    expect(ir.chapters.length).toBeGreaterThan(0);
  });

  it('should auto-populate cache on first extraction', () => {
    const cache = createPatternCache();

    extractContent(templateFHtml, '经部/大学章句集注.htm', {
      patternCache: cache,
    });

    // Cache should be populated after first call
    expect(cache.size).toBeGreaterThan(0);
    expect(hasCachedPatterns(cache, '大学章句集注')).toBe(true);
  });
});
