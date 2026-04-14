"""Phase 4 business scenario tests — real use cases for the extraction pipeline.

Naming convention: test_phase{N}_business_scenarios.py
- One file per phase, added incrementally as features land
- Each file tests business-level behaviors visible to the end user
- Uses real HTML from content/ and 古籍/ directories when possible
- Synthetic fixtures only when real files don't exercise the feature

Update this file when:
- New phases add user-visible behavior (Pass 4 annotation, Pass 9 main-text, etc.)
- Bugs are found that should have been caught by business-level tests
- Requirements change and existing tests need adjustment

Current coverage (Phase 1-4):
1. Real content page: 大学章句集注 (normalized HTML)
2. Real catalog page: 经部藏目 (table of contents)
3. Annotation detection via classify_by_attributes
4. Edge cases from real files
"""

from pathlib import Path

from bamboo_extract import (
    classify_by_attributes,
    detect_catalog,
    extract,
)
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html
from bamboo_extract.territory import Territory

PACKAGE_ROOT = Path(__file__).parent.parent.parent  # tests/scenarios/ → project root
REAL_CONTENT_DIR = PACKAGE_ROOT / "src" / "normalized-html"
RAW_GUJI_DIR = PACKAGE_ROOT / "古籍"


def _build(html: str):
    """Helper: normalize + build index + create territory."""
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()
    return index, territory


# ── Scenario 1: Real content page (大学章句集注) ─────────────────────


class TestRealContentPage:
    """大学章句集注 — the canonical content page."""

    def setup_method(self) -> None:
        path = REAL_CONTENT_DIR / "经部" / "大学章句集注.htm"
        self.raw_html = path.read_text(encoding="utf-8")

    def test_title_extracted(self) -> None:
        """Book title should come from <title> tag."""
        ir = extract(self.raw_html)
        assert ir.title == "大学章句集注"

    def test_docType_is_content(self) -> None:  # noqa: N802 — matches IR field name
        """Content page should not be classified as catalog."""
        ir = extract(self.raw_html)
        assert ir.docType == "content"

    def test_no_navItems_for_content(self) -> None:  # noqa: N802 — matches IR field name
        """Content page should have empty navItems."""
        ir = extract(self.raw_html)
        assert ir.navItems == []


# ── Scenario 2: Real catalog page (经部藏目) ────────────────────────


class TestRealCatalogPage:
    """经部藏目 — the canonical catalog (table of contents) page."""

    def setup_method(self) -> None:
        path = RAW_GUJI_DIR / "1经部藏目.htm"
        self.raw_html = path.read_text(encoding="utf-8")

    def test_detected_as_catalog(self) -> None:
        """Should be classified as catalog (many links, little body text)."""
        idx, _ = _build(self.raw_html)
        assert detect_catalog(idx) is True

    def test_docType_catalog(self) -> None:  # noqa: N802 — matches IR field name
        """extract() should return docType=catalog."""
        ir = extract(self.raw_html)
        assert ir.docType == "catalog"

    def test_has_navItems(self) -> None:  # noqa: N802 — matches IR field name
        """Catalog should have multiple navigation items."""
        ir = extract(self.raw_html)
        assert len(ir.navItems) >= 5

    def test_navItems_have_href_and_label(self) -> None:  # noqa: N802 — matches IR field name
        """Each nav item should have valid href and label."""
        ir = extract(self.raw_html)
        for item in ir.navItems:
            assert item.href, f"Empty href in {item}"
            assert item.label, f"Empty label in {item}"
            assert len(item.label) < 50, f"Label too long: {item.label}"

    def test_title_from_title_tag(self) -> None:
        """Catalog title should come from <title> tag."""
        ir = extract(self.raw_html)
        assert "经部" in ir.title or "藏目" in ir.title


# ── Scenario 3: Annotation detection ────────────────────────────────


class TestAnnotationDetection:
    """classify_by_attributes — real annotation patterns."""

    def test_class_annotation(self) -> None:
        """class=annotation should be classified as annotation."""
        html = '<body><span class="annotation">注释文字</span></body>'
        idx, _ = _build(html)
        span_ids = idx.by_tag.get("span", [])
        assert len(span_ids) == 1
        result = classify_by_attributes(span_ids[0], idx)
        assert result == "annotation"

    def test_class_reference(self) -> None:
        """class=reference should be classified as annotation."""
        html = '<body><div class="reference">参考</div></body>'
        idx, _ = _build(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        result = classify_by_attributes(div_ids[0], idx)
        assert result == "annotation"

    def test_class_notes(self) -> None:
        """class=notes should be classified as annotation."""
        html = '<body><div class="notes">备注</div></body>'
        idx, _ = _build(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        result = classify_by_attributes(div_ids[0], idx)
        assert result == "annotation"

    def test_font_size_9pt_annotation(self) -> None:
        """FONT-SIZE: 9pt should be classified as annotation."""
        html = '<body><font style="FONT-SIZE: 9pt">小字注</font></body>'
        idx, _ = _build(html)
        font_ids = idx.by_tag.get("font", [])
        assert len(font_ids) == 1
        result = classify_by_attributes(font_ids[0], idx)
        assert result == "annotation"

    def test_font_size_10pt_purple_annotation(self) -> None:
        """FONT-SIZE: 10pt + color=#551A8B should be annotation."""
        html = '<body><font style="FONT-SIZE: 10pt" color="#551A8B">紫注</font></body>'
        idx, _ = _build(html)
        font_ids = idx.by_tag.get("font", [])
        assert len(font_ids) == 1
        result = classify_by_attributes(font_ids[0], idx)
        assert result == "annotation"

    def test_content_not_annotation(self) -> None:
        """Normal content should not be classified as annotation."""
        html = '<body><p>大学之书，古之大学所以教人之法也。</p></body>'
        idx, _ = _build(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        result = classify_by_attributes(p_ids[0], idx)
        assert result is None


# ── Scenario 4: Anchor-nav detection ────────────────────────────────


class TestAnchorNavDetection:
    """Standalone a[href] → anchor-nav."""

    def test_standalone_anchor_with_href(self) -> None:
        """Standalone a[href] should be anchor-nav."""
        html = '<body><a href="001.htm">第一章</a></body>'
        idx, _ = _build(html)
        a_ids = idx.by_tag.get("a", [])
        assert len(a_ids) == 1
        result = classify_by_attributes(a_ids[0], idx)
        assert result == "anchor-nav"

    def test_anchor_without_href(self) -> None:
        """a without href should not be anchor-nav."""
        html = '<body><a>无链接</a></body>'
        idx, _ = _build(html)
        a_ids = idx.by_tag.get("a", [])
        assert len(a_ids) == 1
        result = classify_by_attributes(a_ids[0], idx)
        assert result is None


# ── Scenario 5: Menu-context detection ──────────────────────────────


class TestMenuContextDetection:
    """class=menu with a[href] children → menu-context."""

    def test_menu_with_links(self) -> None:
        """menu with a[href] children → menu-context."""
        html = '<body><div class="menu"><a href="1.htm">A</a><a href="2.htm">B</a></div></body>'
        idx, _ = _build(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        result = classify_by_attributes(div_ids[0], idx)
        assert result == "menu-context"

    def test_menu_without_links(self) -> None:
        """menu without a[href] children → None."""
        html = '<body><div class="menu"><span>纯文本</span></div></body>'
        idx, _ = _build(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        result = classify_by_attributes(div_ids[0], idx)
        assert result is None


# ── Scenario 6: List-context detection ──────────────────────────────


class TestListContextDetection:
    """ol/ul with li>a → list-context."""

    def test_ol_with_link_items(self) -> None:
        """ol with li>a → list-context."""
        html = '<body><ol><li><a href="1.htm">A</a></li><li><a href="2.htm">B</a></li></ol></body>'
        idx, _ = _build(html)
        ol_ids = idx.by_tag.get("ol", [])
        assert len(ol_ids) == 1
        result = classify_by_attributes(ol_ids[0], idx)
        assert result == "list-context"

    def test_ul_without_links(self) -> None:
        """ul without links → None."""
        html = '<body><ul><li>纯文本</li></ul></body>'
        idx, _ = _build(html)
        ul_ids = idx.by_tag.get("ul", [])
        assert len(ul_ids) == 1
        result = classify_by_attributes(ul_ids[0], idx)
        assert result is None


# ── Scenario 7: Empty and minimal HTML ──────────────────────────────


class TestEmptyAndMinimal:
    """Edge cases: empty, minimal HTML."""

    def test_empty_string(self) -> None:
        """Empty string → Untitled, content, one empty chapter."""
        ir = extract("")
        assert ir.title == "Untitled"
        assert ir.docType == "content"
        assert len(ir.chapters) == 1

    def test_whitespace_only(self) -> None:
        """Whitespace only → same as empty."""
        ir = extract("   \n\n   ")
        assert ir.title == "Untitled"
        assert ir.docType == "content"

    def test_source_path_set(self) -> None:
        """source_path should be preserved."""
        ir = extract("<html></html>", source_path="经部/大学.htm")
        assert ir.source == "经部/大学.htm"


# ── Scenario 8: Pipeline claim isolation ────────────────────────────


class TestClaimIsolation:
    """Verify that Pass 1 claimed nodes don't leak into Pass 2/3 or remaining text."""

    def test_metadata_not_consumed_by_title(self) -> None:
        """Metadata node should not be consumed by book-title pass."""
        html = """<html><body>
        <CENTER><B><FONT COLOR="#FF6666" SIZE="5">书名</FONT></B></CENTER>
        <p>(宋·朱熹)</p>
        <p>正文内容</p>
        </body></html>"""
        ir = extract(html)
        assert ir.title == "书名"
        # NLP-enabled: 朱熹 classified as 南宋; regex-only: "宋"
        assert ir.dynasty in ("宋", "南宋")
        assert ir.author == "朱熹"

    def test_chapter_titles_not_consumed_by_metadata(self) -> None:
        """Chapter title nodes should not be consumed by metadata pass."""
        html = """<html><body>
        <CENTER><B><FONT COLOR="#FF6666" SIZE="5">书名</FONT></B></CENTER>
        <p>(宋·朱熹)</p>
        <center><B><FONT COLOR="#CC33CC">第一章</FONT></B></center>
        <p>正文第一章的内容</p>
        <center><B><FONT COLOR="#CC33CC">第二章</FONT></B></center>
        <p>正文第二章的内容</p>
        </body></html>"""
        ir = extract(html)
        assert ir.title == "书名"
        # NLP-enabled: 朱熹 classified as 南宋; regex-only: "宋"
        assert ir.dynasty in ("宋", "南宋")
        assert ir.author == "朱熹"
        assert len(ir.chapters) == 2
        titles = [ch.title for ch in ir.chapters]
        assert "第一章" in titles
        assert "第二章" in titles
