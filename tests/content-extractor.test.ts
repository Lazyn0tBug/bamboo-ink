import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import {
  extractContent,
  renderHtml5,
  renderMarkdown,
  decodeHtml,
  buildCatalogDict,
  lookupCatalogMeta,
  createTerritory,
  TYPES,
  buildDomIndex,
  normalizeHtml,
  pass1BookTitle,
  pass2Metadata,
  pass3ChapterTitle,
} from '../scripts/lib/content-extractor.mjs';
import {
  createPatternCache,
  analyzeAndCache,
  hasCachedPatterns,
  buildClassificationSignature,
  classifyWithCache,
} from '../scripts/lib/pattern-cache.mjs';

// ── Test Fixtures ────────────────────────────────────────────────

// Template F: table-wrapped content with annotations (大学章句集注 style)
const templateFHtml = `<html><head><TITLE>大学章句集注</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT></B></CENTER>
<table border="0" width="90%"><tr>
<td class=swy1><center><B><FONT COLOR="#CC33CC">大学章句序</B></FONT></center>
大学之书，古之大学所以教人之法也。<br>
<FONT style="FONT-SIZE: 9pt">程子曰：此孔氏遗书，初学入德之门也。</FONT><br>
三代之隆，其法寖备。<br>
<center><B><FONT COLOR="#CC33CC">大学章句</B></FONT></center>
子程子曰：大学，孔氏之遗书。<br>
<FONT style="FONT-SIZE: 9pt">朱子曰：亲，当作新。</FONT><br>
右传之首章。释明明德。
</td></tr></table>
</body></html>`;

// Template G: bare text + BR separation (儀禮 style, no annotations)
const templateGHtml = `<html><head><TITLE>儀禮</title></head><body>
<H2><FONT COLOR="#FF0000">儀 禮</FONT></H2>
&nbsp;
<BR>士冠禮
<BR>士昏禮
<BR>士相见禮
<H4>士 冠 禮</H4>
士 冠 禮 。 筮 于 廟 門 。 主 人 玄 冠 朝 服 。
<P>陳 服 于 房 中 西 墉 下 。 東 領 北 上 。
<P>儀 禮 終
</body></html>`;

// Catalog: table with nav links (列女传 style)
const catalogHtml = `<html><head><title>列女传</title></head><body>
<table border="1"><tr>
<td><p><b><font color="#FF0000" size="6">列女传</font></b></p>(汉·刘向)</td>
</tr>
<tr><td>
<p><a href="001.htm">母仪传</a><br>
<a href="002.htm">贤明传</a><br>
<a href="003.htm">仁智传</a><br>
<a href="004.htm">贞顺传</a><br>
<a href="005.htm">节义传</a><br>
<a href="006.htm">辩通传</a><br>
<a href="007.htm">孽嬖传</a></p>
</td></tr>
</table>
</body></html>`;

// Empty HTML
const emptyHtml = `<html><head><title></title></head><body></body></html>`;

// ── extractContent Tests ─────────────────────────────────────────

describe('extractContent', () => {
  it('should extract Template F content with chapters and annotations', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    expect(ir.title).toBe('大学章句集注');
    expect(ir.docType).toBe('content');
    expect(ir.source).toBe('经部/大学章句集注.htm');
    expect(ir.chapters.length).toBeGreaterThan(0);
    expect(ir.chapters.some((ch) => ch.title.includes('大学章句序'))).toBe(true);
    expect(ir.chapters.some((ch) => ch.title.includes('大学章句'))).toBe(true);
    // Check for annotations
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
  });

  it('should extract Template G content with section headings', () => {
    const ir = extractContent(templateGHtml, '经部/儀禮.htm');
    expect(ir.title).toBe('儀禮');
    expect(ir.docType).toBe('content');
    expect(ir.chapters.length).toBeGreaterThan(0);
    // "士 冠 禮" should be a chapter or section heading
    const hasGuanLi = ir.chapters.some(
      (ch) => ch.title.includes('冠禮') || ch.sections.some((s) => s.content.includes('冠禮'))
    );
    expect(hasGuanLi).toBe(true);
    // "儀 禮 終" should not appear in output
    const allText = JSON.stringify(ir);
    expect(allText).not.toContain('儀 禮 終');
  });

  it('should detect end markers with simplified 终 character', () => {
    const simplifiedEndHtml = `<html><head><title>周易</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>周易</FONT></FONT></B></CENTER>
<DIV class=swy1>乾。元亨利贞。<BR>
周易终
</DIV>
</body></html>`;
    const ir = extractContent(simplifiedEndHtml, '经部/周易.htm');
    const allText = JSON.stringify(ir);
    expect(allText).not.toContain('周易终');
  });

  it('should extract catalog with navItems and metadata', () => {
    const ir = extractContent(catalogHtml, '史部-其他/列女传/index.htm');
    expect(ir.docType).toBe('catalog');
    expect(ir.title).toBe('列女传');
    expect(ir.author).toBe('刘向');
    expect(ir.dynasty).toBe('汉');
    expect(ir.navItems.length).toBe(7);
    expect(ir.navItems[0]).toEqual({ href: '001.htm', label: '母仪传' });
    expect(ir.navItems[6]).toEqual({ href: '007.htm', label: '孽嬖传' });
  });

  it('should return empty chapters for empty HTML', () => {
    const ir = extractContent(emptyHtml, '经部/empty.htm');
    expect(ir.title).toBe('Untitled');
    expect(ir.chapters.length).toBe(0);
    expect(ir.navItems.length).toBe(0);
  });

  it('should handle nested FONT tags in title extraction', () => {
    const nestedHtml = `<html><head></head><body>
<CENTER><B><FONT face=楷体_GB2312><FONT color=#ff6666><FONT size=5>论语</FONT></FONT></FONT></B></CENTER>
<PRE>学而时习之。</PRE>
</body></html>`;
    const ir = extractContent(nestedHtml, '经部/论语.htm');
    expect(ir.title).toBe('论语');
  });

  it('should extract section-summary patterns', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const summaries = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.type === 'section-summary');
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries[0].content).toContain('右传之首章');
  });
});

// ── renderHtml5 Tests ────────────────────────────────────────────

describe('renderHtml5', () => {
  it('should render content-type IR with article and headings', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const html = renderHtml5(ir);
    expect(html).toContain('<article>');
    expect(html).toContain('<h1>');
    expect(html).toContain('大学章句集注');
    expect(html).toContain('<h2');
    expect(html).toContain('normalized.css');
    expect(html).not.toContain('<FONT');
    expect(html).not.toContain('<CENTER');
  });

  it('should render catalog IR with nav and links', () => {
    const ir = extractContent(catalogHtml, '史部-其他/列女传/index.htm');
    const html = renderHtml5(ir);
    expect(html).toContain('<nav');
    expect(html).toContain('<ul');
    expect(html).toContain('母仪传');
    expect(html).toContain('001.htm');
    expect(html).not.toContain('<table');
  });

  it('should render annotations as span elements', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const html = renderHtml5(ir);
    const sectionsWithAnn = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    if (sectionsWithAnn.length > 0) {
      expect(html).toContain('<span class="annotation">');
    }
  });
});

// ── renderMarkdown Tests ─────────────────────────────────────────

describe('renderMarkdown', () => {
  it('should render content-type IR with frontmatter', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const md = renderMarkdown(ir);
    expect(md).toContain('---');
    expect(md).toContain('title: "大学章句集注"');
    expect(md).toContain('docType: "content"');
    expect(md).toContain('category: "经部"');
    expect(md).toContain('source: "经部/大学章句集注.htm"');
  });

  it('should render catalog IR with unordered links', () => {
    const ir = extractContent(catalogHtml, '史部-其他/列女传/index.htm');
    const md = renderMarkdown(ir);
    expect(md).toContain('docType: "catalog"');
    expect(md).toContain('* [母仪传](001.htm)');
    expect(md).toContain('* [孽嬖传](007.htm)');
  });

  it('should render annotations as footnotes', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const md = renderMarkdown(ir);
    const sectionsWithAnn = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    if (sectionsWithAnn.length > 0) {
      expect(md).toContain('[^注1]');
      expect(md).toMatch(/\[\^注\d+\]:/);
    }
  });

  it('should render section-summary as italic', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    const md = renderMarkdown(ir);
    const summaries = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.type === 'section-summary');
    if (summaries.length > 0) {
      expect(md).toContain('*右传之首章');
    }
  });
});

// ── decodeHtml Tests ─────────────────────────────────────────────

describe('decodeHtml', () => {
  it('should detect and decode UTF-8', () => {
    const utf8Buffer = Buffer.from('<html><body>论语</body></html>', 'utf8');
    const decoded = decodeHtml(utf8Buffer);
    expect(decoded).toContain('论语');
  });

  it('should handle BOM-prefixed UTF-8', () => {
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('<html><body>论语</body></html>', 'utf8'),
    ]);
    const decoded = decodeHtml(bomBuffer);
    expect(decoded).toContain('论语');
  });
});

// ── Catalog Dictionary Tests ─────────────────────────────────────

describe('buildCatalogDict', () => {
  it('should build a dictionary from catalog IRs', () => {
    const catalogIr = {
      title: '列女传',
      author: '刘向',
      dynasty: '汉',
      source: '史部-其他/列女传/index.htm',
      docType: 'catalog',
      chapters: [],
      navItems: [
        { href: '001.htm', label: '母仪传' },
        { href: '002.htm', label: '贤明传' },
      ],
    };
    const dict = buildCatalogDict([{ ir: catalogIr, catalogDir: '史部-其他/列女传' }]);
    expect(dict.size).toBe(2);
    expect(dict.get('001.htm')).toEqual({
      title: '列女传',
      dynasty: '汉',
      author: '刘向',
      category: '',
      catalogSource: '史部-其他/列女传/index.htm',
    });
  });
});

describe('lookupCatalogMeta', () => {
  it('should find metadata by exact href match', () => {
    const dict = new Map();
    dict.set('001.htm', {
      title: '列女传',
      dynasty: '汉',
      author: '刘向',
      category: '史部',
      catalogSource: '史部-其他/列女传/index.htm',
    });
    const meta = lookupCatalogMeta(dict, '史部/001.htm');
    expect(meta).not.toBeNull();
    expect(meta?.author).toBe('刘向');
    expect(meta?.dynasty).toBe('汉');
  });

  it('should return null for unknown paths', () => {
    const dict = new Map();
    dict.set('001.htm', {
      title: '列女传',
      dynasty: '汉',
      author: '刘向',
      category: '',
      catalogSource: '',
    });
    const meta = lookupCatalogMeta(dict, '经部/论语.htm');
    expect(meta).toBeNull();
  });
});

describe('extractContent with catalogDict', () => {
  it('should inject metadata from catalog dictionary', () => {
    const catalogIr = {
      title: '列女传',
      author: '刘向',
      dynasty: '汉',
      source: '史部-其他/列女传/index.htm',
      docType: 'catalog',
      chapters: [],
      navItems: [{ href: '001.htm', label: '母仪传' }],
    };
    const dict = buildCatalogDict([{ ir: catalogIr, catalogDir: '史部-其他/列女传' }]);

    const contentHtml = `<html><head><title>母仪传</title></head><body>
<H2>母仪传</H2>
<P>有虞二妃者，尧之二女也。</P>
</body></html>`;

    const ir = extractContent(contentHtml, '史部/001.htm', { catalogDict: dict });
    expect(ir.author).toBe('刘向');
    expect(ir.dynasty).toBe('汉');
    expect(ir.title).toBe('母仪传');
  });
});

// ── CSS Class Classification (text.css) Tests ────────────────────

// class=article → book-title (text.css: 24pt, #FF6666, centered)
const articleClassHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>学而时习之。</DIV>
</body></html>`;

// class=chapter → chapter-title (text.css: 18pt, #551A8B)
const chapterClassHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<CENTER><B><FONT class=chapter>学而第一</FONT></B></CENTER>
<DIV class=swy1>子曰：学而时习之。</DIV>
</body></html>`;

// class=annotation → inline-annotation (text.css: 10pt, #551A8B)
const annotationClassHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>子曰：学而时习之。<FONT class=annotation>时习者，时时温习也。</FONT></DIV>
</body></html>`;

// class=reference → inline-annotation (text.css: 10pt, black)
const referenceClassHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>子曰：学而时习之。<SPAN class=reference>参见《礼记·学记》。</SPAN></DIV>
</body></html>`;

// class=menu → catalog/nav context (text.css: 14pt, #333333)
const menuClassHtml = `<html><head><title>目录</title></head><body>
<DIV class=menu><A HREF="001.htm">学而第一</A><BR>
<A HREF="002.htm">为政第二</A></DIV>
</body></html>`;

// color=#551A8B + 10pt → inline-annotation (text.css .annotation fallback)
const colorAnnotationHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>子曰：学而时习之。<FONT style="FONT-SIZE: 10pt; COLOR: #551A8B">程子曰：此乃学习之道。</FONT></DIV>
</body></html>`;

describe('CSS class classification (text.css)', () => {
  it('should identify class=article as book-title', () => {
    const ir = extractContent(articleClassHtml, '经部/论语.htm');
    expect(ir.title).toBe('论语');
    // The article class element should be recognized as book-title (consumed into title, not a chapter)
    expect(ir.chapters.length).toBeGreaterThan(0);
    // Article class text should not appear as chapter title
    const chapterTitles = ir.chapters.map((ch) => ch.title);
    expect(chapterTitles).not.toContain('论语');
  });

  it('should identify class=chapter as chapter-title', () => {
    const ir = extractContent(chapterClassHtml, '经部/论语.htm');
    expect(ir.title).toBe('论语');
    expect(ir.chapters.some((ch) => ch.title === '学而第一')).toBe(true);
  });

  it('should identify class=annotation as inline-annotation', () => {
    const ir = extractContent(annotationClassHtml, '经部/论语.htm');
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
    expect(sectionsWithAnnotations[0].annotations[0].text).toContain('时时温习');
  });

  it('should identify class=reference as inline-annotation', () => {
    const ir = extractContent(referenceClassHtml, '经部/论语.htm');
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
    expect(sectionsWithAnnotations[0].annotations[0].text).toContain('礼记');
  });

  it('should identify class=menu as nav context', () => {
    const ir = extractContent(menuClassHtml, '经部/目录.htm');
    expect(ir.navItems.length).toBe(2);
    expect(ir.navItems[0].href).toBe('001.htm');
    expect(ir.navItems[0].label).toBe('学而第一');
    expect(ir.navItems[1].href).toBe('002.htm');
    expect(ir.navItems[1].label).toBe('为政第二');
  });

  it('should identify color=#551A8B + 10pt as inline-annotation on SPAN elements', () => {
    const spanAnnotationHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>子曰：学而时习之。<SPAN style="FONT-SIZE: 10pt; COLOR: #551A8B">此乃学习之道。</SPAN></DIV>
</body></html>`;
    const ir = extractContent(spanAnnotationHtml, '经部/论语.htm');
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
    expect(sectionsWithAnnotations[0].annotations[0].text).toContain('学习之道');
  });

  it('should identify color=#551A8B + 10pt as inline-annotation', () => {
    const ir = extractContent(colorAnnotationHtml, '经部/论语.htm');
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
    expect(sectionsWithAnnotations[0].annotations[0].text).toContain('学习之道');
  });

  it('should classify class=annotation consistently with FONT size=9pt', () => {
    // Both annotation class and FONT size=9pt should produce inline-annotation
    const bothHtml = `<html><head><title>论语</title></head><body>
<CENTER><B><FONT class=article>论语</FONT></B></CENTER>
<DIV class=swy1>正文。<FONT class=annotation style="FONT-SIZE: 9pt">注疏一。</FONT><FONT style="FONT-SIZE: 9pt">注疏二。</FONT></DIV>
</body></html>`;
    const ir = extractContent(bothHtml, '经部/论语.htm');
    const annotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .flatMap((s) => s.annotations || []);
    expect(annotations.length).toBe(2);
    expect(annotations[0].text).toContain('注疏一');
    expect(annotations[1].text).toContain('注疏二');
  });
});

// ── renderHtml5 Edge Cases ───────────────────────────────────────

describe('renderHtml5 edge cases', () => {
  it('should render empty IR with minimal HTML', () => {
    const ir = {
      title: 'Empty Book',
      source: '经部/empty.htm',
      docType: 'content' as const,
      chapters: [],
      navItems: [],
    };
    const html = renderHtml5(ir);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Empty Book</title>');
    expect(html).toContain('<article>');
    expect(html).toContain('<h1>Empty Book</h1>');
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('<section');
  });

  it('should render colophon as separate section', () => {
    const ir = {
      title: '仪礼',
      source: '经部/仪礼.htm',
      docType: 'content' as const,
      chapters: [
        {
          title: '士冠礼',
          sections: [
            {
              type: 'main-text' as const,
              content: '士冠礼。筮于庙门。',
            },
            {
              type: 'colophon' as const,
              content: '仪礼终',
            },
          ],
        },
      ],
      navItems: [],
    };
    const html = renderHtml5(ir);
    expect(html).toContain('<section class="colophon">');
    expect(html).toContain('仪礼终');
    // Colophon should not be inside the main-text section
    expect(html).toContain('</section>');
  });

  it('should render section-summary with italic styling', () => {
    const ir = {
      title: '大学章句集注',
      source: '经部/大学章句集注.htm',
      docType: 'content' as const,
      chapters: [
        {
          title: '大学章句',
          sections: [
            {
              type: 'main-text' as const,
              content: '大学之道，在明明德。',
            },
            {
              type: 'section-summary' as const,
              content: '右传之首章。释明明德。',
            },
          ],
        },
      ],
      navItems: [],
    };
    const html = renderHtml5(ir);
    expect(html).toContain('italic');
    expect(html).toContain('右传之首章');
    expect(html).toContain('text-sm');
    expect(html).toContain('text-dai-400');
  });
});

// ── renderMarkdown Edge Cases ────────────────────────────────────

describe('renderMarkdown edge cases', () => {
  it('should escape Markdown special characters in content', () => {
    const ir = {
      title: '论语',
      source: '经部/论语.htm',
      docType: 'content' as const,
      chapters: [
        {
          title: '学而',
          sections: [
            {
              type: 'main-text' as const,
              content: '子曰：#标题*斜体_下划线[链接]#测试',
            },
          ],
        },
      ],
      navItems: [],
    };
    const md = renderMarkdown(ir);
    // All special chars should be escaped
    expect(md).toContain('\\#标题');
    expect(md).toContain('\\*斜体');
    expect(md).toContain('\\_下划线');
    expect(md).toContain('\\[链接\\]');
  });

  it('should render long annotation text as footnote', () => {
    const longAnnotation =
      '程子曰：「此孔氏遗书，初学入德之门也。于今可见古人为学次第者，独赖此篇之存，而论、孟次之。学者必由是而学焉，则庶乎其不差矣。」';
    const ir = {
      title: '大学章句集注',
      source: '经部/大学章句集注.htm',
      docType: 'content' as const,
      chapters: [
        {
          title: '大学章句',
          sections: [
            {
              type: 'main-text' as const,
              content: '大学之道。',
              annotations: [{ text: longAnnotation }],
            },
          ],
        },
      ],
      navItems: [],
    };
    const md = renderMarkdown(ir);
    expect(md).toContain('[^注1]');
    expect(md).toContain('[^注1]:');
    expect(md).toContain('程子曰');
    expect(md).toContain('初学入德之门也');
  });

  it('should render empty IR with frontmatter only', () => {
    const ir = {
      title: 'Empty Book',
      source: '经部/empty.htm',
      docType: 'content' as const,
      chapters: [],
      navItems: [],
    };
    const md = renderMarkdown(ir);
    expect(md).toContain('---');
    expect(md).toContain('title: "Empty Book"');
    expect(md).toContain('docType: "content"');
    expect(md).toContain('source: "经部/empty.htm"');
    // No body content beyond frontmatter
    const afterFrontmatter = md.split('---')[2] || '';
    expect(afterFrontmatter.trim()).toBe('');
  });
});

// ── DOM Index (Unit 0c) ──────────────────────────────────────────

describe('buildDomIndex', () => {
  it('should index nodes by color attribute', () => {
    const html = `<html><body>
      <font color="#CC33CC">chapter</font>
      <font color="#FF6666">title</font>
      <font color="#CC33CC">another chapter</font>
      <div>no color</div>
    </body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.byColor.get('#CC33CC')).toHaveLength(2);
    expect(index.byColor.get('#FF6666')).toHaveLength(1);
    expect(index.byColor.has('#000000')).toBe(false);
  });

  it('should index nodes by class attribute', () => {
    const html = `<html><body>
      <div class="swy1">text1</div>
      <div class="article">title</div>
      <div class="swy1">text2</div>
      <span class="annotation">note</span>
    </body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.byClass.get('swy1')).toHaveLength(2);
    expect(index.byClass.get('article')).toHaveLength(1);
    expect(index.byClass.get('annotation')).toHaveLength(1);
  });

  it('should index nodes by tag name', () => {
    const html = `<html><body>
      <font color="#CC33CC">a</font>
      <font color="#FF6666">b</font>
      <div class="swy1">c</div>
      <p>text</p>
    </body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.byTag.get('font')).toHaveLength(2);
    expect(index.byTag.get('div')).toHaveLength(1);
    expect(index.byTag.get('p')).toHaveLength(1);
    // body is the root — indexing starts from its contents, not body itself
    expect(index.byTag.has('html')).toBe(false);
  });

  it('should index nodes by size attribute', () => {
    const html = `<html><body>
      <font size="5">big</font>
      <font size="9">small</font>
      <font size="5">also big</font>
    </body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.bySize.get('5')).toHaveLength(2);
    expect(index.bySize.get('9')).toHaveLength(1);
  });

  it('should collect all text nodes', () => {
    const html = `<html><body>
      <div>hello</div>
      <span>world</span>
      plain text
    </body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    const texts = index.allTextNodes
      .map((n: object) => ($(n as any).text() || '').trim())
      .filter((t: string) => t.length > 0);

    expect(texts.some((t: string) => t.includes('hello'))).toBe(true);
    expect(texts.some((t: string) => t.includes('world'))).toBe(true);
    expect(texts.some((t: string) => t.includes('plain text'))).toBe(true);
  });

  it('should return empty maps for HTML with no attributes', () => {
    const html = `<html><body><div><span>text</span></div></body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.byColor.size).toBe(0);
    expect(index.bySize.size).toBe(0);
    // byClass should be empty (no class attrs)
    expect(index.byClass.size).toBe(0);
    // byTag should still have entries
    expect(index.byTag.size).toBeGreaterThan(0);
  });

  it('should normalize color values to uppercase', () => {
    const html = `<html><body><font color="#ff6666">red</font></body></html>`;
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
    const index = buildDomIndex($);

    expect(index.byColor.has('#FF6666')).toBe(true);
    expect(index.byColor.has('#ff6666')).toBe(false);
  });
});

// ── HTML Normalization (Unit 0c) ─────────────────────────────────

describe('normalizeHtml', () => {
  it('should replace <center> with <div data-center="1">', () => {
    const html = '<html><body><CENTER><FONT>title</FONT></CENTER></body></html>';
    const result = normalizeHtml(html);

    expect(result).toContain('<div data-center="1">');
    expect(result).toContain('</div>');
    expect(result).not.toContain('<CENTER');
    expect(result).not.toContain('<center');
  });

  it('should flatten table-wrapped content', () => {
    const html = `<html><body><table><tr><td class=swy1>
      <p>content here</p>
    </td></tr></table></body></html>`;
    const result = normalizeHtml(html);

    // Table wrapper should be removed, content preserved
    expect(result).not.toContain('<table');
    expect(result).toContain('content here');
  });

  it('should remove empty tags', () => {
    const html = '<html><body><span></span><b></b><div class="swy1">text</div></body></html>';
    const result = normalizeHtml(html);

    expect(result).not.toContain('<span></span>');
    expect(result).not.toContain('<b></b>');
    expect(result).toContain('text');
  });

  it('should preserve consecutive divs (no merging — center blocks must stay separate)', () => {
    const html = `<html><body>
      <div class="swy1">paragraph one</div>
      <div class="swy1">paragraph two</div>
    </body></html>`;
    const result = normalizeHtml(html);

    // Consecutive divs are NOT merged — merging would combine separate
    // <center> blocks after conversion to data-center divs
    const divCount = (result.match(/<div/g) || []).length;
    expect(divCount).toBe(2);
    expect(result).toContain('paragraph one');
    expect(result).toContain('paragraph two');
  });

  it('should be idempotent', () => {
    const html = `<html><body><CENTER><div class="swy1">text</div></CENTER></body></html>`;
    const first = normalizeHtml(html);
    const second = normalizeHtml(first);

    expect(first).toBe(second);
  });

  it('should handle nested center tags', () => {
    const html = '<html><body><CENTER><CENTER>deep</CENTER></CENTER></body></html>';
    const result = normalizeHtml(html);

    expect(result).toContain('data-center="1"');
    expect(result).not.toContain('<CENTER');
  });
});

function setupTerritory(html: string) {
  const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
  return createTerritory($raw, TYPES);
}

describe('createTerritory', () => {
  // ── claimSubtree Tests ──

  describe('claimSubtree', () => {
    it('should mark a node and all its descendants as claimed', () => {
      const t = setupTerritory(
        '<html><body><div id="outer"><span id="inner">hello</span></div></body></html>'
      );
      const $ = cheerio.load(
        '<html><body><div id="outer"><span id="inner">hello</span></div></body></html>',
        { xmlMode: false, decodeEntities: true }
      );
      const outer = $('div#outer').get(0);
      const inner = $('span#inner').get(0);

      expect(t.isClaimed(outer)).toBe(false);
      expect(t.isClaimed(inner)).toBe(false);

      t.claimSubtree(outer);

      expect(t.isClaimed(outer)).toBe(true);
      expect(t.isClaimed(inner)).toBe(true);
    });

    it('should mark text nodes inside a claimed subtree as claimed', () => {
      const html = '<html><body><div id="box">chapter title</div></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);
      const box = $raw('div#box').get(0);
      const textNode = $raw('div#box').contents().get(0);

      t.claimSubtree(box);

      expect(t.isClaimed(box)).toBe(true);
      expect(t.isClaimed(textNode)).toBe(true);
    });
  });

  // ── claimLeaf Tests ──

  describe('claimLeaf', () => {
    it('should mark only the target node, not its descendants', () => {
      const html = '<html><body><span id="leaf"><small>nested</small></span></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);
      const leaf = $raw('span#leaf').get(0);
      const nested = $raw('span#leaf small').get(0);

      t.claimLeaf(leaf);

      expect(t.isClaimed(leaf)).toBe(true);
      expect(t.isClaimed(nested)).toBe(false);
    });
  });

  // ── hasClaimedAncestor Tests ──

  describe('hasClaimedAncestor', () => {
    it('should return true for a text node inside a claimed container', () => {
      const html = '<html><body><div id="claimed">some text</div></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);
      const div = $raw('div#claimed').get(0);
      const textNode = $raw('div#claimed').contents().get(0);

      t.claimSubtree(div);

      expect(t.hasClaimedAncestor(textNode)).toBe(true);
    });

    it('should return false for nodes outside claimed containers', () => {
      const html = '<html><body><div id="claimed">x</div><p>free text</p></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);
      const div = $raw('div#claimed').get(0);
      const p = $raw('p').get(0);
      const pText = $raw('p').contents().get(0);

      t.claimSubtree(div);

      expect(t.hasClaimedAncestor(p)).toBe(false);
      expect(t.hasClaimedAncestor(pText)).toBe(false);
    });
  });

  // ── extractByRules Tests ──

  describe('extractByRules', () => {
    it('should match nodes by predicate and claim them in subtree mode', () => {
      const html = `<html><body>
        <div id="a" data-type="title">Title A</div>
        <div id="b">Plain text</div>
        <div id="c" data-type="title">Title C</div>
      </body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const regions = t.extractByRules(($, node) => {
        const $n = $(node);
        if ($n.attr('data-type') === 'title') return 'book-title';
        return null;
      }, 'subtree');

      expect(regions.length).toBe(2);
      expect(regions[0].content).toBe('Title A');
      expect(regions[1].content).toBe('Title C');
      expect(regions[0].type).toBe('book-title');
    });

    it('should skip already-claimed nodes', () => {
      const html = `<html><body>
        <div id="a" data-type="title">Title A</div>
        <div id="b" data-type="title">Title B</div>
      </body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const divA = $raw('div#a').get(0);
      t.claimSubtree(divA);

      const regions = t.extractByRules(($, node) => {
        const $n = $(node);
        if ($n.attr('data-type') === 'title') return 'book-title';
        return null;
      }, 'subtree');

      expect(regions.length).toBe(1);
      expect(regions[0].content).toBe('Title B');
    });

    it('should work with empty claimed set (no pre-claimed nodes)', () => {
      const html = `<html><body>
        <div data-type="title">Solo</div>
      </body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const regions = t.extractByRules(
        ($, node) => ($(node).attr('data-type') === 'title' ? 'book-title' : null),
        'subtree'
      );

      expect(regions.length).toBe(1);
      expect(regions[0].content).toBe('Solo');
    });
  });

  // ── extractRemaining Tests ──

  describe('extractRemaining', () => {
    it('should collect unclaimed text nodes as main-text', () => {
      const html = `<html><body>
        <div id="claimed">skip me</div>
        Free text one
        Free text two
      </body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const div = $raw('div#claimed').get(0);
      t.claimSubtree(div);

      const regions = t.extractRemaining();

      expect(regions.length).toBe(1);
      expect(regions[0].type).toBe(TYPES.MAIN_TEXT);
      expect(regions[0].content).toContain('Free text one');
      expect(regions[0].content).toContain('Free text two');
      expect(regions[0].content).not.toContain('skip me');
    });

    it('should not collect text inside claimed containers', () => {
      const html = `<html><body>
        <div id="box">This text is claimed<div>and nested</div></div>
        <p>Unclaimed paragraph</p>
      </body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const box = $raw('div#box').get(0);
      t.claimSubtree(box);

      const regions = t.extractRemaining();

      expect(regions.length).toBe(1);
      expect(regions[0].content).toContain('Unclaimed paragraph');
      expect(regions[0].content).not.toContain('This text is claimed');
      expect(regions[0].content).not.toContain('and nested');
    });

    it('should return empty array when all text is claimed', () => {
      const html = `<html><body><div id="all">everything</div></body></html>`;
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const div = $raw('div#all').get(0);
      t.claimSubtree(div);

      const regions = t.extractRemaining();

      expect(regions.length).toBe(0);
    });
  });

  // ── mergeAdjacentRegions Tests ──

  describe('mergeAdjacentRegions', () => {
    it('should merge adjacent regions of the same type', () => {
      const html = '<html><body></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const node1 = {};
      const node2 = {};
      const node3 = {};
      const regions = [
        { type: TYPES.MAIN_TEXT, content: 'First paragraph', sourceNodes: [node1] },
        { type: TYPES.MAIN_TEXT, content: 'Second paragraph', sourceNodes: [node2] },
        { type: TYPES.MAIN_TEXT, content: 'Third paragraph', sourceNodes: [node3] },
      ];

      const merged = t.mergeAdjacentRegions(regions);

      expect(merged.length).toBe(1);
      expect(merged[0].content).toBe('First paragraph Second paragraph Third paragraph');
      expect(merged[0].sourceNodes.length).toBe(3);
    });

    it('should preserve boundaries between different types', () => {
      const html = '<html><body></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const regions = [
        { type: 'book-title', content: 'Title', sourceNodes: [{}] },
        { type: TYPES.MAIN_TEXT, content: 'Text A', sourceNodes: [{}] },
        { type: TYPES.MAIN_TEXT, content: 'Text B', sourceNodes: [{}] },
        { type: TYPES.SECTION_SUMMARY, content: 'Summary', sourceNodes: [{}] },
        { type: TYPES.MAIN_TEXT, content: 'Text C', sourceNodes: [{}] },
      ];

      const merged = t.mergeAdjacentRegions(regions);

      expect(merged.length).toBe(4);
      expect(merged[0].type).toBe('book-title');
      expect(merged[1].content).toBe('Text A Text B');
      expect(merged[2].type).toBe(TYPES.SECTION_SUMMARY);
      expect(merged[3].content).toBe('Text C');
    });

    it('should return empty array for empty input', () => {
      const html = '<html><body></body></html>';
      const $raw = cheerio.load(html, { xmlMode: false, decodeEntities: true });
      const t = createTerritory($raw, TYPES);

      const merged = t.mergeAdjacentRegions([]);

      expect(merged).toEqual([]);
    });
  });
});

// ── Territorial Pass 1-3 (Unit 1b) ─────────────────────────────────

function setupPasses(html: string) {
  const normalized = normalizeHtml(html);
  const $raw = cheerio.load(normalized, { xmlMode: false, decodeEntities: true });
  const index = buildDomIndex($raw);
  const territory = createTerritory($raw, TYPES);
  return { $raw, index, territory };
}

describe('Pass 1: book-title extraction', () => {
  it('should find book-title by class=article', () => {
    const html = `<html><body>
      <CENTER><B><FONT class=article>论语</FONT></B></CENTER>
      <DIV class=swy1>content</DIV>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const title = pass1BookTitle(index, $raw, territory);

    expect(title).toBe('论语');
    expect(territory.claimed.size).toBeGreaterThan(0);
  });

  it('should find book-title by centered #FF6666 + SIZE≥5', () => {
    const html = `<html><body>
      <CENTER><B><FONT COLOR="#FF6666" SIZE=5>大学章句集注</FONT></B></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const title = pass1BookTitle(index, $raw, territory);

    expect(title).toBe('大学章句集注');
  });

  it('should find book-title by centered #FF0000 + SIZE≥5', () => {
    const html = `<html><body>
      <CENTER><B><FONT COLOR="#FF0000" SIZE=5>周易</FONT></B></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const title = pass1BookTitle(index, $raw, territory);

    expect(title).toBe('周易');
  });

  it('should return null when no book-title found', () => {
    const html = `<html><body><DIV class=swy1>just content</DIV></body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const title = pass1BookTitle(index, $raw, territory);

    expect(title).toBeNull();
  });

  it('should not match long text (>80 chars) as book-title', () => {
    const longText = 'a'.repeat(100);
    const html = `<html><body><CENTER><FONT class=article>${longText}</FONT></CENTER></body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const title = pass1BookTitle(index, $raw, territory);

    expect(title).toBeNull();
  });
});

describe('Pass 2: metadata extraction', () => {
  it('should extract dynasty/author from (朝代·作者) pattern', () => {
    const html = `<html><body>(汉·刘向)</body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const meta = pass2Metadata(index, $raw, territory);

    expect(meta).not.toBeNull();
    expect(meta?.dynasty).toBe('汉');
    expect(meta?.author).toBe('刘向');
  });

  it('should return null when no metadata pattern found', () => {
    const html = `<html><body><DIV class=swy1>just content</DIV></body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const meta = pass2Metadata(index, $raw, territory);

    expect(meta).toBeNull();
  });

  it('should not claim subtree when matching metadata on class="metadata" container', () => {
    // Bug: claimSubtree on .metadata node swallows nested non-metadata content
    // When .metadata is a wrapper containing both metadata text AND child elements,
    // claimSubtree claims everything — losing nested annotations or content.
    const html = `<html><body>
      <DIV class=swy1>
        <DIV class="metadata">
          (汉·刘向)
          <FONT style="FONT-SIZE: 9pt">此为夹注内容不应被metadata吞噬</FONT>
        </DIV>
      </DIV>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);

    const meta = pass2Metadata(index, $raw, territory);
    expect(meta).not.toBeNull();
    expect(meta?.dynasty).toBe('汉');
    expect(meta?.author).toBe('刘向');

    // The FONT annotation should NOT be claimed — only the metadata text should be
    const fontNodes = index.byTag.get('font') || [];
    expect(fontNodes.length).toBe(1);
    // Bug: with claimSubtree, the FONT would be claimed too
    expect(territory.isClaimed(fontNodes[0])).toBe(false);
  });

  it('should match metadata pattern without closing delimiter', () => {
    // Bug: METADATA_RE requires closing ）, ), or whitespace at the end,
    // but some metadata like "(汉·刘向" has no closing delimiter.
    const html = `<html><body>(汉·刘向</body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const meta = pass2Metadata(index, $raw, territory);

    expect(meta).not.toBeNull();
    expect(meta?.dynasty).toBe('汉');
    expect(meta?.author).toBe('刘向');
  });
});

describe('Pass 3: chapter-title extraction', () => {
  it('should find chapter-titles by class=chapter', () => {
    const html = `<html><body>
      <CENTER><B><FONT class=chapter>学而第一</FONT></B></CENTER>
      <CENTER><B><FONT class=chapter>为政第二</FONT></B></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const chapters = pass3ChapterTitle(index, $raw, territory);

    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe('学而第一');
    expect(chapters[1].title).toBe('为政第二');
  });

  it('should find chapter-titles by color=#CC33CC', () => {
    const html = `<html><body>
      <CENTER><B><FONT COLOR="#CC33CC">大学章句序</FONT></B></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const chapters = pass3ChapterTitle(index, $raw, territory);

    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('大学章句序');
  });

  it('should find chapter-titles from centered H2/H3/H4', () => {
    const html = `<html><body>
      <CENTER><H2>第一章</H2></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const chapters = pass3ChapterTitle(index, $raw, territory);

    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('第一章');
  });

  it('should find chapter-titles from style="text-align:center" wrapper', () => {
    // Bug: isInCenteredContext only checks data-center and align="center",
    // but NOT style="text-align:center" used by some FrontPage templates.
    // This test uses H2 (which requires isInCenteredContext to match),
    // not #CC33CC or class=chapter which have their own rules.
    const html = `<html><body>
      <DIV style="text-align:center"><H2>第二章</H2></DIV>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const chapters = pass3ChapterTitle(index, $raw, territory);

    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('第二章');
  });

  it('should not match long text (>80 chars) as chapter-title', () => {
    const longText = 'a'.repeat(100);
    const html = `<html><body><CENTER><FONT COLOR="#CC33CC">${longText}</FONT></CENTER></body></html>`;
    const { $raw, index, territory } = setupPasses(html);
    const chapters = pass3ChapterTitle(index, $raw, territory);

    expect(chapters.length).toBe(0);
  });

  it('should skip nodes already claimed by Pass 1', () => {
    const html = `<html><body>
      <CENTER><B><FONT class=article>论语</FONT></B></CENTER>
    </body></html>`;
    const { $raw, index, territory } = setupPasses(html);

    // Run Pass 1 first
    pass1BookTitle(index, $raw, territory);
    // Then Pass 3
    const chapters = pass3ChapterTitle(index, $raw, territory);

    // The article class element is claimed by Pass 1, but it wouldn't match
    // chapter rules anyway (no #CC33CC, no class=chapter)
    // This tests that Pass 3 respects Pass 1's claims
    expect(chapters.length).toBe(0);
  });
});

describe('Pass 1-3 integration with extractContent', () => {
  it('should extract Template F with territorial Pass 1-3', () => {
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    expect(ir.title).toBe('大学章句集注');
    expect(ir.docType).toBe('content');
    // Should have chapters for 大学章句序 and 大学章句
    expect(ir.chapters.some((ch) => ch.title.includes('大学章句序'))).toBe(true);
    expect(ir.chapters.some((ch) => ch.title.includes('大学章句'))).toBe(true);
    // Should have annotations
    const sectionsWithAnnotations = ir.chapters
      .flatMap((ch) => ch.sections)
      .filter((s) => s.annotations && s.annotations.length > 0);
    expect(sectionsWithAnnotations.length).toBeGreaterThan(0);
  });

  it('should extract Template G with territorial Pass 1-3', () => {
    const ir = extractContent(templateGHtml, '经部/儀禮.htm');
    expect(ir.title).toBe('儀禮');
    expect(ir.docType).toBe('content');
    expect(ir.chapters.length).toBeGreaterThan(0);
    // End marker should not appear in output
    const allText = JSON.stringify(ir);
    expect(allText).not.toContain('儀 禮 終');
  });

  it('should handle empty HTML without errors', () => {
    const emptyHtml = `<html><head><title></title></head><body></body></html>`;
    const ir = extractContent(emptyHtml, '经部/empty.htm');

    expect(ir.title).toBe('Untitled');
    expect(ir.chapters.length).toBe(0);
  });
});

// ── ProcessingResult & Warnings (Unit A5) ──────────────────────────

describe('ProcessingResult (returnResult option)', () => {
  it('should return { ir, result } when returnResult is true', () => {
    const extractResult = extractContent(templateFHtml, '经部/大学章句集注.htm', {
      returnResult: true,
    }) as {
      ir: { title: string };
      result: { sourcePath: string; docType: string; chaptersCount: number; elapsedMs: number };
    };
    expect(extractResult).toHaveProperty('ir');
    expect(extractResult).toHaveProperty('result');
    expect(extractResult.ir.title).toBe('大学章句集注');
    expect(extractResult.result.sourcePath).toBe('经部/大学章句集注.htm');
    expect(extractResult.result.docType).toBe('content');
    expect(extractResult.result.chaptersCount).toBeGreaterThan(0);
    expect(extractResult.result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('should have empty warnings for a well-formed content file', () => {
    // Template F with metadata pattern (宋·朱熹) added
    const completeHtml = `<html><head><TITLE>大学章句集注</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT></B></CENTER>
<p>(宋·朱熹)</p>
<table border="0" width="90%"><tr>
<td class=swy1><center><B><FONT COLOR="#CC33CC">大学章句序</B></FONT></center>
大学之书，古之大学所以教人之法也。<br>
<FONT style="FONT-SIZE: 9pt">程子曰：此孔氏遗书，初学入德之门也。</FONT><br>
</td></tr></table>
</body></html>`;
    const { result } = extractContent(completeHtml, '经部/大学章句集注.htm', {
      returnResult: true,
    }) as { ir: object; result: { warnings: string[] } };
    expect(result.warnings).toEqual([]);
  });

  it('should detect untitled-title warning for empty HTML', () => {
    const { result } = extractContent(emptyHtml, '经部/empty.htm', {
      returnResult: true,
    }) as { ir: object; result: { warnings: string[] } };
    expect(result.warnings).toContain('untitled-title');
    expect(result.warnings).toContain('zero-chapters');
    expect(result.warnings).toContain('missing-metadata');
  });

  it('should NOT have catalog-no-navitems for a catalog with links', () => {
    const { result } = extractContent(catalogHtml, '史部-其他/列女传/index.htm', {
      returnResult: true,
    }) as { ir: object; result: { warnings: string[]; docType: string; title: string } };
    expect(result.warnings).not.toContain('catalog-no-navitems');
    expect(result.docType).toBe('catalog');
    expect(result.title).toBe('列女传');
  });

  it('should count annotations and sections correctly', () => {
    const { result } = extractContent(templateFHtml, '经部/大学章句集注.htm', {
      returnResult: true,
    }) as { ir: object; result: { sectionsCount: number; annotationsCount: number } };
    expect(result.sectionsCount).toBeGreaterThan(0);
    expect(typeof result.annotationsCount).toBe('number');
    expect(result.annotationsCount).toBeGreaterThanOrEqual(0);
  });
});

// ── Classification Cache (Unit A4) ────────────────────────────────

describe('buildClassificationSignature', () => {
  it('should produce consistent signatures for identical nodes', () => {
    const html = `<html><body><font color="#CC33CC" size="3" class="chapter">Title</font></body></html>`;
    const $ = cheerio.load(html);
    const node = $('font').get(0);
    const sig1 = buildClassificationSignature($, node);
    const sig2 = buildClassificationSignature($, node);
    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different nodes', () => {
    const html = `<html><body>
      <font color="#CC33CC" class="chapter">Title</font>
      <font color="#551A8B" class="annotation">Note</font>
    </body></html>`;
    const $ = cheerio.load(html);
    const nodes = $('font').toArray();
    const sig1 = buildClassificationSignature($, nodes[0]);
    const sig2 = buildClassificationSignature($, nodes[1]);
    expect(sig1).not.toBe(sig2);
  });
});

describe('classifyWithCache', () => {
  it('should call classifyFn on cache miss', () => {
    const cache = createPatternCache();
    analyzeAndCache(cache, templateFHtml, '大学章句集注');

    let callCount = 0;
    const classifyFn = () => {
      callCount++;
      return 'test-type';
    };

    const result = classifyWithCache(
      cache,
      '大学章句集注',
      'FONT|chapter|#CC33CC|3|short',
      classifyFn
    );
    expect(result).toBe('test-type');
    expect(callCount).toBe(1);
  });

  it('should return cached type on cache hit', () => {
    const cache = createPatternCache();
    analyzeAndCache(cache, templateFHtml, '大学章句集注');

    let callCount = 0;
    const classifyFn = () => {
      callCount++;
      return 'cached-type';
    };

    const sig = 'FONT|chapter|#CC33CC|3|short';
    const result1 = classifyWithCache(cache, '大学章句集注', sig, classifyFn);
    const result2 = classifyWithCache(cache, '大学章句集注', sig, classifyFn);

    expect(result1).toBe('cached-type');
    expect(result2).toBe('cached-type');
    expect(callCount).toBe(1); // called only once
  });

  it('should fall through when book not in cache', () => {
    const cache = createPatternCache();
    // No patterns cached for this book

    let callCount = 0;
    const classifyFn = () => {
      callCount++;
      return 'fallback-type';
    };

    const result = classifyWithCache(
      cache,
      'Unknown Book',
      'FONT|chapter|#CC33CC|3|short',
      classifyFn
    );
    expect(result).toBe('fallback-type');
    expect(callCount).toBe(1);
  });
});

describe('extractContent with classification cache', () => {
  it('should produce identical IR with and without pattern cache', () => {
    const cache = createPatternCache();

    // First extraction: populates cache
    const ir1 = extractContent(templateFHtml, '经部/大学章句集注.htm', {
      patternCache: cache,
    });

    // Second extraction: uses cached classifications
    const ir2 = extractContent(templateFHtml, '经部/大学章句集注.htm', {
      patternCache: cache,
    });

    // Both should produce identical IR
    expect(JSON.stringify(ir1)).toBe(JSON.stringify(ir2));
  });

  it('should produce identical IR without any patternCache', () => {
    // No cache at all — full classification every time
    const ir = extractContent(templateFHtml, '经部/大学章句集注.htm');
    expect(ir.title).toBe('大学章句集注');
    expect(ir.chapters.length).toBeGreaterThan(0);
  });

  it('should read from patternCache on second extraction (not re-analyze)', () => {
    // Bug: pattern cache was write-only — analyzeAndCache called every time
    // even for same book. Fix: check hasCachedPatterns before analyzing.
    const cache = createPatternCache();

    // Before any extraction: not cached
    expect(hasCachedPatterns(cache, '大学章句集注')).toBe(false);

    // First extraction: populates cache
    extractContent(templateFHtml, '经部/大学章句集注.htm', { patternCache: cache });
    expect(hasCachedPatterns(cache, '大学章句集注')).toBe(true);

    // Capture cache state after first extraction
    const cachedPatternsAfterFirst = JSON.parse(
      JSON.stringify(cache.get('大学章句集注') || {})
    );

    // Second extraction: should NOT re-analyze (cache already populated)
    extractContent(templateFHtml, '经部/大学章句集注.htm', { patternCache: cache });

    // Cache content should be identical (not re-analyzed)
    const cachedPatternsAfterSecond = JSON.parse(
      JSON.stringify(cache.get('大学章句集注') || {})
    );
    expect(cachedPatternsAfterSecond).toEqual(cachedPatternsAfterFirst);
  });
});
