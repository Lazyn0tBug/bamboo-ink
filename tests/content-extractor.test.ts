import { describe, it, expect } from 'vitest';
import { extractContent, renderHtml5, renderMarkdown, decodeHtml, buildCatalogDict, lookupCatalogMeta } from '../scripts/lib/content-extractor.mjs';

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
