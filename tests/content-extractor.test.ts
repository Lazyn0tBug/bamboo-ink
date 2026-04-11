import { describe, it, expect } from 'vitest';
import {
  extractContent,
  renderHtml5,
  renderMarkdown,
  decodeHtml,
  buildCatalogDict,
  lookupCatalogMeta,
} from '../scripts/lib/content-extractor.mjs';

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
