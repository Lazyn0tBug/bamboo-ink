"""Tests for extraction passes — Pass 1 (book-title), Pass 2 (metadata),
Pass 3 (chapter-title), extract_title pre-pass, is_in_centered_context helper,
and end-to-end extract() pipeline."""

from bamboo_extract import extract
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html
from bamboo_extract.passes import (
    extract_title,
    is_in_centered_context,
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
    pass4_annotation,
    pass8_nav_item,
)
from bamboo_extract.territory import Territory

# ── Fixtures ────────────────────────────────────────────────────────

TEMPLATE_F_HTML = """<html><head><TITLE>大学章句集注</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT></B></CENTER>
<p>(宋·朱熹)</p>
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
</body></html>"""

TEMPLATE_G_HTML = """<html><head><TITLE>儀禮</title></head><body>
<H2><FONT COLOR="#FF0000">儀 禮</FONT></H2>
&nbsp;
<BR>士冠禮
<BR>士昏禮
<BR>士相见禮
<H4>士 冠 禮</H4>
士 冠 禮 。 筮 于 廟 門 。 主 人 玄 冠 朝 服 。
<P>陳 服 于 房 中 西 墉 下 。 東 領 北 上 。
<P>儀 禮 終
</body></html>"""

CATALOG_HTML = """<html><head><title>列女传</title></head><body>
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
</body></html>"""

METADATA_HTML = """<html><head><title>大学章句集注</title></head><body>
<CENTER><B><FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT></B></CENTER>
<p>(宋·朱熹)</p>
<table border="0" width="90%"><tr>
<td class=swy1><center><B><FONT COLOR="#CC33CC">大学章句序</B></FONT></center>
大学之书，古之大学所以教人之法也。
</td></tr></table>
</body></html>"""

METADATA_CLASS_HTML = """<html><body>
<p class="metadata">(汉·班固)</p>
<p>Some text here.</p>
</body></html>"""


def _build(html: str):
    """Helper: normalize + build index + create territory."""
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()
    return index, territory


# ── is_in_centered_context ──────────────────────────────────────────


class TestIsInCenteredContext:
    def test_data_center(self) -> None:
        html = '<body><div data-center="1"><p>x</p></div></body>'
        idx, _ = _build(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        assert is_in_centered_context(p_ids[0], idx)

    def test_align_center(self) -> None:
        html = '<body><div align="center"><p>x</p></div></body>'
        idx, _ = _build(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        assert is_in_centered_context(p_ids[0], idx)

    def test_style_text_align(self) -> None:
        html = '<body><div style="text-align:center"><p>x</p></div></body>'
        idx, _ = _build(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        assert is_in_centered_context(p_ids[0], idx)

    def test_not_centered(self) -> None:
        html = "<body><div><p>x</p></div></body>"
        idx, _ = _build(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        assert not is_in_centered_context(p_ids[0], idx)


# ── Pass 1: Book Title ──────────────────────────────────────────────


class TestPass1BookTitle:
    def test_template_f_title(self) -> None:
        """Template F: centered #FF6666 + nested font SIZE=5."""
        idx, territory = _build(TEMPLATE_F_HTML)
        title = pass1_book_title(idx, territory)
        assert title == "大学章句集注"

    def test_template_g_title(self) -> None:
        """Template G: H2 with #FF0000 font, not centered.

        Note: JS extractTitle() finds "儀禮" from <title> tag, not from
        pass1BookTitle. Pass 1 requires centered context for color-based
        matching. This test verifies Pass 1 returns None (correct behavior)
        — the title comes from extract_title() instead.
        """
        idx, territory = _build(TEMPLATE_G_HTML)
        title = pass1_book_title(idx, territory)
        # Pass 1 returns None because #FF0000 font is not centered
        assert title is None

    def test_catalog_title(self) -> None:
        """Catalog: nested font size=6 with #FF0000, not centered.

        The <font> is inside <b><p><td> — no centered ancestor.
        Pass 1 returns None — title comes from <title> tag via extract_title.
        """
        idx, territory = _build(CATALOG_HTML)
        title = pass1_book_title(idx, territory)
        # Not centered, so Pass 1 doesn't match
        assert title is None

    def test_no_match(self) -> None:
        """Empty HTML → no title."""
        idx, territory = _build("<html><body></body></html>")
        title = pass1_book_title(idx, territory)
        assert title is None

    def test_claimed_nodes(self) -> None:
        """Already claimed node should be skipped."""
        idx, territory = _build(TEMPLATE_F_HTML)
        # Manually claim the first article-like node
        article_ids = idx.by_class.get("article", [])
        for nid in article_ids:
            territory.claim_subtree(nid, idx.children_map.get(nid, []))
        title = pass1_book_title(idx, territory)
        # Strategy A skipped, should find via color Strategy B/C
        assert title == "大学章句集注"


# ── Pass 2: Metadata ────────────────────────────────────────────────


class TestPass2Metadata:
    def test_metadata_class(self) -> None:
        """class=metadata with dynasty·author pattern."""
        idx, territory = _build(METADATA_CLASS_HTML)
        meta = pass2_metadata(idx, territory)
        assert meta is not None
        assert meta["dynasty"] == "汉"
        assert meta["author"] == "班固"

    def test_text_fallback(self) -> None:
        """Fallback: text node scan for (宋·朱熹)."""
        idx, territory = _build(METADATA_HTML)
        meta = pass2_metadata(idx, territory)
        assert meta is not None
        assert meta["dynasty"] == "宋"
        assert meta["author"] == "朱熹"

    def test_no_match(self) -> None:
        """No metadata pattern → None."""
        idx, territory = _build("<html><body><p>Some text</p></body></html>")
        meta = pass2_metadata(idx, territory)
        assert meta is None

    def test_already_claimed(self) -> None:
        """Claimed metadata node → skipped."""
        idx, territory = _build(METADATA_CLASS_HTML)
        meta_ids = idx.by_class.get("metadata", [])
        for nid in meta_ids:
            territory.claim_leaf(nid)
        meta = pass2_metadata(idx, territory)
        assert meta is None


# ── Pass 3: Chapter Title ───────────────────────────────────────────


class TestPass3ChapterTitle:
    def test_template_f_chapters(self) -> None:
        """Template F: #CC33CC colored chapter titles."""
        idx, territory = _build(TEMPLATE_F_HTML)
        # Run Pass 1 first to claim book title
        pass1_book_title(idx, territory)
        chapters = pass3_chapter_title(idx, territory)
        assert len(chapters) >= 2
        titles = [ch["title"] for ch in chapters]
        assert any("大学章句序" in t for t in titles)
        assert any("大学章句" in t for t in titles)

    def test_template_g_chapters(self) -> None:
        """Template G: H4 is not centered, so Pass 3 finds no chapters.

        Note: In JS, the chapter titles come from assemble_results which
        processes text regions and detects headings. Pass 3 only finds
        centered h2/h3/h4. Template G's H4 is not centered.
        """
        idx, territory = _build(TEMPLATE_G_HTML)
        pass1_book_title(idx, territory)
        chapters = pass3_chapter_title(idx, territory)
        # H4 is not centered → no chapters from Pass 3
        # This is correct behavior; assemble_results (Phase 6) handles this
        assert len(chapters) == 0

    def test_long_text_skipped(self) -> None:
        """Text >= 80 chars → skip."""
        long_text = "a" * 80
        html = f'<body><div class="chapter">{long_text}</div></body>'
        idx, territory = _build(html)
        chapters = pass3_chapter_title(idx, territory)
        assert len(chapters) == 0

    def test_empty_text_skipped(self) -> None:
        """Empty text → skip."""
        html = '<body><div class="chapter"></div></body>'
        idx, territory = _build(html)
        chapters = pass3_chapter_title(idx, territory)
        assert len(chapters) == 0

    def test_claimed_skipped(self) -> None:
        """Already claimed nodes → skip."""
        html = '<body><div class="chapter">Title</div></body>'
        idx, territory = _build(html)
        div_ids = idx.by_tag.get("div", [])
        for nid in div_ids:
            territory.claim_subtree(nid, idx.children_map.get(nid, []))
        chapters = pass3_chapter_title(idx, territory)
        assert len(chapters) == 0


# ── Pass 4: Annotation ──────────────────────────────────────────────


class TestPass4Annotation:
    """pass4_annotation — territorial annotation extraction."""

    def test_class_annotation(self) -> None:
        """class="annotation" → claimed, text collected."""
        html = '<body><span class="annotation">注释文字</span></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert annotations[0]["text"] == "注释文字"
        assert territory.is_claimed(annotations[0]["node_id"])

    def test_class_reference(self) -> None:
        """class="reference" → claimed, text collected."""
        html = '<body><div class="reference">参考</div></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert annotations[0]["text"] == "参考"

    def test_class_notes(self) -> None:
        """class="notes" → claimed, text collected."""
        html = '<body><div class="notes">备注</div></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert annotations[0]["text"] == "备注"

    def test_font_size_9pt(self) -> None:
        """<font style="FONT-SIZE: 9pt">小字注</font> → claimed via style scan."""
        html = '<body><font style="FONT-SIZE: 9pt">小字注</font></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert "小字注" in annotations[0]["text"]

    def test_font_size_10pt_purple(self) -> None:
        """<font style="FONT-SIZE: 10pt" color="#551A8B">紫注</font> → claimed."""
        html = '<body><font style="FONT-SIZE: 10pt" color="#551A8B">紫注</font></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert "紫注" in annotations[0]["text"]

    def test_span_size_10pt_purple(self) -> None:
        """<span style="FONT-SIZE: 10pt; color:#551A8B">夹注</span> → claimed."""
        html = '<body><span style="FONT-SIZE: 10pt; color:#551A8B">夹注</span></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 1
        assert "夹注" in annotations[0]["text"]

    def test_already_claimed_skipped(self) -> None:
        """Already claimed by Pass 1-3 → skip (territory isolation)."""
        html = '<body><span class="annotation">注释</span></body>'
        idx, territory = _build(html)
        span_ids = idx.by_tag.get("span", [])
        for nid in span_ids:
            territory.claim_leaf(nid)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0

    def test_has_claimed_ancestor_skipped(self) -> None:
        """Annotation inside claimed ancestor → skip."""
        html = '<body><div class="article"><span class="annotation">注</span></div></body>'
        idx, territory = _build(html)
        div_ids = idx.by_tag.get("div", [])
        for nid in div_ids:
            territory.claim_subtree(nid, idx.children_map.get(nid, []))
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0

    def test_empty_text_skipped(self) -> None:
        """Empty text node → skip."""
        html = '<body><span class="annotation"></span></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0

    def test_no_annotations(self) -> None:
        """No annotation patterns → empty list (Template G scenario)."""
        idx, territory = _build(TEMPLATE_G_HTML)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0

    def test_template_f_annotations(self) -> None:
        """Template F → ≥2 annotations (FONT-SIZE: 9pt annotations)."""
        idx, territory = _build(TEMPLATE_F_HTML)
        # Run Pass 1-3 first to claim book title and chapter titles
        pass1_book_title(idx, territory)
        pass2_metadata(idx, territory)
        pass3_chapter_title(idx, territory)
        annotations = pass4_annotation(idx, territory)
        # Template F has 2 FONT-SIZE: 9pt annotation lines
        assert len(annotations) >= 2
        # Verify annotation text matches expected content
        texts = [a["text"] for a in annotations]
        assert any("程子曰" in t for t in texts)
        assert any("朱子曰" in t for t in texts)

    def test_template_f_annotations_not_in_remaining(self) -> None:
        """Integration: Pass 4 claimed annotations not in remaining text."""
        idx, territory = _build(TEMPLATE_F_HTML)
        pass1_book_title(idx, territory)
        pass2_metadata(idx, territory)
        pass3_chapter_title(idx, territory)
        annotations = pass4_annotation(idx, territory)
        # Collect remaining
        text_content = {
            nid: idx.text_by_id.get(nid, "").strip()
            for nid in idx.all_text_nodes
            if idx.text_by_id.get(nid, "").strip()
        }
        remaining = territory.extract_remaining(idx.all_text_nodes, text_content)
        remaining_text = "".join(r["content"] for r in remaining)
        # Annotation text should NOT appear in remaining
        for ann in annotations:
            assert ann["text"] not in remaining_text


# ── extract_title pre-pass ──────────────────────────────────────────


class TestExtractTitle:
    def test_from_title_tag(self) -> None:
        """<title> tag is primary source."""
        html = "<html><head><title>大学章句集注</title></head><body></body></html>"
        idx, _ = _build(html)
        assert extract_title(html, idx) == "大学章句集注"

    def test_from_h1(self) -> None:
        """Fallback to <h1> if no <title>."""
        html = "<html><body><h1>儀禮</h1></body></html>"
        idx, _ = _build(html)
        assert extract_title(html, idx) == "儀禮"

    def test_from_color_size(self) -> None:
        """Fallback to color + size match."""
        html = '<html><body><font color="#FF0000" size="5">古書</font></body></html>'
        idx, _ = _build(html)
        assert extract_title(html, idx) == "古書"

    def test_untyped_fallback(self) -> None:
        """No match → Untitled."""
        idx, _ = _build("<html><body><p>some text</p></body></html>")
        assert extract_title("", idx) == "Untitled"


# ── End-to-end extract() pipeline ───────────────────────────────────


class TestExtractPipeline:
    def test_template_f_full_pipeline(self) -> None:
        """Template F → title + metadata + chapters + content."""
        ir = extract(TEMPLATE_F_HTML)
        assert ir.title == "大学章句集注"
        assert ir.docType == "content"
        assert ir.dynasty == "宋"
        assert ir.author == "朱熹"
        assert len(ir.chapters) >= 2
        titles = [ch.title for ch in ir.chapters]
        assert any("大学章句序" in t for t in titles)
        assert any("大学章句" in t for t in titles)

    def test_catalog_full_pipeline(self) -> None:
        """Catalog HTML → docType=catalog, navItems, metadata."""
        ir = extract(CATALOG_HTML)
        assert ir.docType == "catalog"
        assert ir.title == "列女传"
        assert ir.dynasty == "汉"
        assert ir.author == "刘向"
        assert len(ir.navItems) == 7
        assert ir.navItems[0].href == "001.htm"
        assert ir.navItems[0].label == "母仪传"
        assert ir.chapters == []

    def test_empty_html(self) -> None:
        """Empty HTML → Untitled, one empty chapter."""
        ir = extract("<html><body></body></html>")
        assert ir.title == "Untitled"
        assert ir.docType == "content"
        assert len(ir.chapters) == 1
        assert ir.chapters[0].title == ""

    def test_pass1_claimed_not_reprocessed(self) -> None:
        """Pass 1 claimed nodes should not appear in remaining text."""
        ir = extract(TEMPLATE_F_HTML)
        # Book title "大学章句集注" should not appear in section content
        for chapter in ir.chapters:
            for section in chapter.sections:
                assert "大学章句集注" not in section.content


# ── Pass 8: Nav Item ────────────────────────────────────────────────


class TestPass8NavItem:
    """pass8_nav_item — territorial nav-item extraction."""

    def test_direct_anchors(self) -> None:
        """Direct <a href> links → claimed, navItems collected."""
        html = """<body>
        <a href="001.htm">第一章</a>
        <a href="002.htm">第二章</a>
        </body>"""
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815 — matches ContentIR field name

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 2
        assert ir.navItems[0].href == "001.htm"
        assert ir.navItems[0].label == "第一章"
        assert ir.navItems[1].href == "002.htm"

    def test_menu_context(self) -> None:
        """class=menu with <a> children → navItems extracted, menu claimed."""
        html = """<body>
        <div class="menu">
            <a href="a.htm">Alpha</a>
            <a href="b.htm">Beta</a>
        </div>
        </body>"""
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 2
        # Menu should be claimed
        div_ids = idx.by_tag.get("div", [])
        assert any(territory.is_claimed(nid) for nid in div_ids)

    def test_list_context(self) -> None:
        """<ol>/<ul> with <a> children → navItems extracted, list claimed."""
        html = """<body>
        <ol>
            <li><a href="1.htm">One</a></li>
            <li><a href="2.htm">Two</a></li>
        </ol>
        </body>"""
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 2
        # OL should be claimed
        ol_ids = idx.by_tag.get("ol", [])
        assert any(territory.is_claimed(nid) for nid in ol_ids)

    def test_empty_href_skipped(self) -> None:
        """<a> with empty href → skipped."""
        html = '<body><a href="">Empty</a><a href="real.htm">Real</a></body>'
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 1
        assert ir.navItems[0].href == "real.htm"

    def test_long_label_skipped(self) -> None:
        """<a> with label >= 50 chars → skipped."""
        long_label = "a" * 50
        html = f'<body><a href="x.htm">{long_label}</a><a href="y.htm">Short</a></body>'
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 1
        assert ir.navItems[0].label == "Short"

    def test_no_links(self) -> None:
        """No <a> elements → empty navItems."""
        html = "<body><p>No links here</p></body>"
        idx, territory = _build(html)

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        assert len(ir.navItems) == 0

    def test_claimed_container_skipped(self) -> None:
        """Links inside claimed container → skipped (territory isolation)."""
        html = """<body>
        <div class="article">Menu</div>
        <a href="outside.htm">Outside</a>
        </body>"""
        idx, territory = _build(html)
        # Claim the div first
        div_ids = idx.by_tag.get("div", [])
        for nid in div_ids:
            territory.claim_subtree(nid, idx.children_map.get(nid, []))

        class _IR:
            navItems: list = []  # noqa: N815

        ir = _IR()
        pass8_nav_item(idx, territory, ir)
        # Should still find the outside anchor
        assert len(ir.navItems) == 1
        assert ir.navItems[0].href == "outside.htm"
