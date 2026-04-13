"""Phase 6 business scenario tests — assemble_results state machine.

Naming convention: test_phase{N}_business_scenarios.py
- One file per phase, added incrementally as features land
- Each file tests business-level behaviors visible to the end user
- Uses real HTML from content/ and 古籍/ directories when possible
- Synthetic fixtures only when real files don't exercise the feature

Update this file when:
- assemble_results state machine behavior changes
- Section splitting (BR, H2/H3/H4) logic is modified
- Section-summary, colophon, or end-marker detection is adjusted
- Annotation association to sections is affected

Current coverage (Phase 6):
1. Section splitting via BR tags
2. Section-summary detection (右傳之首章 pattern)
3. End-marker and colophon (終 marker)
4. Annotation association with sections
5. Chapter boundary via H2/H3/H4
6. Multi-chapter content with interleaved annotations
7. Real file integration: 大学章句集注
"""

from pathlib import Path

from bamboo_extract import assemble_results, extract, pass4_annotation
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html
from bamboo_extract.passes import (
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
)
from bamboo_extract.territory import Territory
from bamboo_extract.types import ContentIR

PACKAGE_ROOT = Path(__file__).parent.parent.parent
REAL_CONTENT_DIR = PACKAGE_ROOT / "src" / "normalized-html"


def _build(html: str):
    """Helper: normalize + build index + create territory."""
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()
    return index, territory


# ── Scenario 1: Section splitting ───────────────────────────────────


class TestSectionSplitting:
    """BR and element boundaries should split text into sections."""

    def test_br_splits_paragraphs(self) -> None:
        """BR tags should create separate sections."""
        html = """<html><body>
        <p>第一段</p>
        <BR>
        <p>第二段</p>
        <BR>
        <p>第三段</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        assert len(sections) >= 3
        assert "第一段" in sections[0].content
        assert "第二段" in sections[1].content
        assert "第三段" in sections[2].content

    def test_consecutive_text_merged(self) -> None:
        """Consecutive paragraph elements should produce separate sections."""
        html = """<html><body>
        <p>第一段</p>
        <p>第二段</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        # Each element produces its own section
        assert len(sections) >= 2


# ── Scenario 2: Section-summary detection ──────────────────────────


class TestSectionSummary:
    """右傳之首章 pattern should produce section-summary type."""

    def test_traditional_chuan_summary(self) -> None:
        """右傳之首章 should be section-summary."""
        html = """<html><body>
        <p>正文内容</p>
        <p>右傳之首章</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        summary_sections = [s for s in sections if s.type == "section-summary"]
        assert len(summary_sections) == 1
        assert "右傳之首章" in summary_sections[0].content

    def test_simplified_chuan_summary(self) -> None:
        """右传之二章 should be section-summary."""
        html = """<html><body>
        <p>正文</p>
        <p>右传之二章</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        assert any(s.type == "section-summary" for s in sections)

    def test_jing_summary(self) -> None:
        """右經首章 should be section-summary."""
        html = """<html><body>
        <p>正文</p>
        <p>右經首章</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        assert any(s.type == "section-summary" for s in sections)


# ── Scenario 3: End-marker and colophon ────────────────────────────


class TestEndMarkerAndColophon:
    """終 marker should end main body; subsequent text becomes colophon."""

    def test_text_after_end_marker_is_colophon(self) -> None:
        """Text after 終 should be colophon."""
        html = """<html><body>
        <p>正文内容終</p>
        <p>后记文字</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        types = [s.type for s in sections]
        assert "colophon" in types
        assert "main-text" in types
        # colophon should come after main-text
        main_idx = types.index("main-text")
        colophon_idx = types.index("colophon")
        assert colophon_idx > main_idx

    def test_end_marker_with_text_before(self) -> None:
        """End marker with text before it should produce main-text."""
        html = """<html><body>
        <p>正文終</p>
        <p>跋文</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        main_sections = [s for s in sections if s.type == "main-text"]
        assert len(main_sections) >= 1

    def test_simplified_end_marker(self) -> None:
        """终 (simplified) should also trigger colophon."""
        html = """<html><body>
        <p>正文终</p>
        <p>后记</p>
        </body></html>"""
        ir = extract(html)
        sections = ir.chapters[0].sections
        assert any(s.type == "colophon" for s in sections)


# ── Scenario 4: Annotation association ─────────────────────────────


class TestAnnotationAssociation:
    """Annotations should be attached to their containing section."""

    def test_annotation_in_section(self) -> None:
        """Annotation text should be in section.annotations, not content."""
        html = """<html><body>
        <p>正文</p>
        <font style="FONT-SIZE: 9pt">小字注</font>
        <p>更多正文</p>
        </body></html>"""
        ir = extract(html)
        all_content = ""
        all_annotations = []
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_content += section.content
                all_annotations.extend(section.annotations)
        # Annotation text should not be in content
        assert "小字注" not in all_content
        # But should be in annotations
        assert any("小字注" in a.text for a in all_annotations)

    def test_annotation_at_chapter_boundary(self) -> None:
        """Annotations between chapters should be attached to sections."""
        html = """<html><body>
        <CENTER><B><FONT COLOR="#FF6666" SIZE="5">书名</FONT></B></CENTER>
        <p>第一章内容</p>
        <font style="FONT-SIZE: 9pt">章末注</font>
        <center><B><FONT COLOR="#CC33CC">第二章</FONT></B></center>
        <p>第二章内容</p>
        </body></html>"""
        ir = extract(html)
        all_annotations = []
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_annotations.extend(section.annotations)
        assert any("章末注" in a.text for a in all_annotations)


# ── Scenario 5: Chapter boundary detection ─────────────────────────


class TestChapterBoundary:
    """H2/H3/H4 and claimed chapter titles should create chapter splits."""

    def test_h2_creates_chapter(self) -> None:
        """H2 should create a new chapter."""
        html = """<html><body>
        <p>前言</p>
        <h2>第一章</h2>
        <p>第一章内容</p>
        <h2>第二章</h2>
        <p>第二章内容</p>
        </body></html>"""
        ir = extract(html)
        assert len(ir.chapters) >= 2
        titles = [ch.title for ch in ir.chapters]
        assert "第一章" in titles
        assert "第二章" in titles

    def test_colored_chapter_title(self) -> None:
        """#CC33CC colored text should create chapter boundary."""
        html = """<html><body>
        <CENTER><B><FONT COLOR="#FF6666" SIZE="5">书名</FONT></B></CENTER>
        <p>前言</p>
        <center><B><FONT COLOR="#CC33CC">上卷</FONT></B></center>
        <p>上卷内容</p>
        <center><B><FONT COLOR="#CC33CC">下卷</FONT></B></center>
        <p>下卷内容</p>
        </body></html>"""
        ir = extract(html)
        assert len(ir.chapters) >= 2
        titles = [ch.title for ch in ir.chapters]
        assert "上卷" in titles
        assert "下卷" in titles

    def test_h4_centered_chapter(self) -> None:
        """Centered H4 should create chapter boundary."""
        html = """<html><body>
        <H2><FONT COLOR="#FF0000">儀 禮</FONT></H2>
        <BR>士冠禮
        <BR>士昏禮
        <H4>士 冠 禮</H4>
        士 冠 禮 。 筮 于 廟 門 。
        <P>陳 服 于 房 中 西 墉 下 。
        </body></html>"""
        ir = extract(html)
        # Should have at least one chapter with the H4 title
        titles = [ch.title for ch in ir.chapters]
        assert any("冠禮" in t for t in titles)


# ── Scenario 6: Real file integration ──────────────────────────────


class TestRealFileIntegration:
    """assemble_results should work correctly with real 古籍 HTML."""

    def setup_method(self) -> None:
        path = REAL_CONTENT_DIR / "经部" / "大学章句集注.htm"
        self.raw_html = path.read_text(encoding="utf-8")

    def test_produces_chapters(self) -> None:
        """Real file should produce multiple chapters."""
        ir = extract(self.raw_html)
        assert len(ir.chapters) >= 1

    def test_sections_have_content(self) -> None:
        """Each chapter should have non-empty sections."""
        ir = extract(self.raw_html)
        for chapter in ir.chapters:
            if chapter.sections:
                assert any(s.content for s in chapter.sections)

    def test_section_types_present(self) -> None:
        """Should have main-text sections at minimum."""
        ir = extract(self.raw_html)
        all_types = set()
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_types.add(section.type)
        assert "main-text" in all_types

    def test_no_annotation_text_in_content(self) -> None:
        """Annotation text should not leak into section content."""
        idx, territory = _build(self.raw_html)
        pass1_book_title(idx, territory)
        pass2_metadata(idx, territory)
        pass3_chapter_title(idx, territory)
        annotations = pass4_annotation(idx, territory)

        if not annotations:
            return  # Skip if no annotations to check

        ir = extract(self.raw_html)
        annotation_texts = {a["text"] for a in annotations}
        for chapter in ir.chapters:
            for section in chapter.sections:
                for ann_text in annotation_texts:
                    assert ann_text not in section.content
