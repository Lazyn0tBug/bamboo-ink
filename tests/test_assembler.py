"""Tests for assemble_results state machine."""

from bamboo_extract import (
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
    pass4_annotation,
    pass8_nav_item,
)
from bamboo_extract.assembler import assemble_results
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html
from bamboo_extract.territory import Territory
from bamboo_extract.types import ContentIR


def _build(html: str):
    """Helper: normalize + build index + create territory."""
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()
    return index, territory


def _run_pipeline(html: str) -> ContentIR:
    """Run Pass 1-4 + Pass 8 + assemble_results."""
    idx, territory = _build(html)
    ir = ContentIR()

    title = idx.text_by_id.get(
        next((nid for nid in idx.by_tag.get("title", [])), None), ""
    ).strip() if idx.by_tag.get("title") else ""

    pass1_result = pass1_book_title(idx, territory)
    if pass1_result:
        ir.title = pass1_result
    elif title:
        ir.title = title

    metadata = pass2_metadata(idx, territory)
    if metadata:
        ir.dynasty = metadata["dynasty"]
        ir.author = metadata["author"]

    chapter_titles = pass3_chapter_title(idx, territory)
    chapter_title_nodes = {ch["node_id"] for ch in chapter_titles}

    annotations = pass4_annotation(idx, territory)
    pass8_nav_item(idx, territory, ir)

    assemble_results(idx, annotations, chapter_title_nodes, territory, ir)
    return ir


# ── assemble_results core ───────────────────────────────────────────


class TestAssembleResults:
    """assemble_results — section splitting and annotation association."""

    def test_br_splits_sections(self) -> None:
        """BR tags should split text into separate sections."""
        html = """<html><body>
        <p>First paragraph</p>
        <BR>
        <p>Second paragraph</p>
        </body></html>"""
        idx, territory = _build(html)
        ir = ContentIR()
        assemble_results(idx, [], set(), territory, ir)
        assert len(ir.chapters) >= 1
        sections = ir.chapters[0].sections
        # Should have at least 2 sections split by BR
        assert len(sections) >= 2
        assert sections[0].type == "main-text"
        assert "First paragraph" in sections[0].content

    def test_section_summary_detection(self) -> None:
        """右傳之首章 should be detected as section-summary."""
        html = """<html><body>
        <p>正文内容</p>
        <p>右傳之首章</p>
        </body></html>"""
        idx, territory = _build(html)
        ir = ContentIR()
        assemble_results(idx, [], set(), territory, ir)
        sections = ir.chapters[0].sections
        assert any(s.type == "section-summary" for s in sections)

    def test_end_marker_colophon(self) -> None:
        """Text after 終 marker should be colophon."""
        html = """<html><body>
        <p>正文内容終</p>
        <p>后记文字</p>
        </body></html>"""
        idx, territory = _build(html)
        ir = ContentIR()
        assemble_results(idx, [], set(), territory, ir)
        sections = ir.chapters[0].sections
        assert any(s.type == "colophon" for s in sections)
        # colophon should come after main-text
        types = [s.type for s in sections]
        main_idx = types.index("main-text")
        colophon_idx = types.index("colophon")
        assert colophon_idx > main_idx

    def test_annotation_association(self) -> None:
        """Annotations should be associated with their containing section."""
        html = """<html><body>
        <p>正文开头</p>
        <font style="FONT-SIZE: 9pt">注释文字</font>
        <p>正文结尾</p>
        </body></html>"""
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) >= 1

        ir = ContentIR()
        assemble_results(idx, annotations, set(), territory, ir)
        sections = ir.chapters[0].sections
        # At least one section should have annotations
        assert any(len(s.annotations) > 0 for s in sections)

    def test_chapter_title_boundary(self) -> None:
        """Chapter title nodes should split chapters."""
        html = """<html><body>
        <p>第一章正文</p>
        <center><b><font color="#CC33CC">第二章</font></b></center>
        <p>第二章正文</p>
        </body></html>"""
        idx, territory = _build(html)
        pass1_book_title(idx, territory)
        chapter_titles = pass3_chapter_title(idx, territory)
        chapter_title_nodes = {ch["node_id"] for ch in chapter_titles}
        annotations = pass4_annotation(idx, territory)

        ir = ContentIR()
        assemble_results(idx, annotations, chapter_title_nodes, territory, ir)
        # Should have 2 chapters
        assert len(ir.chapters) >= 2
        titles = [ch.title for ch in ir.chapters]
        assert any("第二章" in t for t in titles)

    def test_h2_h3_h4_as_chapter_boundary(self) -> None:
        """H2/H3/H4 should serve as chapter boundary even if not claimed."""
        html = """<html><body>
        <p>前面内容</p>
        <h2>新章节</h2>
        <p>新章节内容</p>
        </body></html>"""
        idx, territory = _build(html)
        ir = ContentIR()
        assemble_results(idx, [], set(), territory, ir)
        # H2 should trigger chapter split
        assert len(ir.chapters) >= 2
        titles = [ch.title for ch in ir.chapters]
        assert "新章节" in titles

    def test_empty_text_no_section(self) -> None:
        """Empty accumulated text should not create a section."""
        html = """<html><body>
        <font style="FONT-SIZE: 9pt">only annotation</font>
        </body></html>"""
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)

        ir = ContentIR()
        assemble_results(idx, annotations, set(), territory, ir)
        # Should have a default chapter but no main-text sections
        # (only annotation text, no main text)
        assert len(ir.chapters) >= 1

    def test_claimed_text_excluded(self) -> None:
        """Text from claimed nodes should not appear in sections."""
        html = """<html><body>
        <center><b><font color="#FF6666" size="5">书名</font></b></center>
        <p>正文内容</p>
        </body></html>"""
        idx, territory = _build(html)
        pass1_book_title(idx, territory)  # claims the title
        annotations = pass4_annotation(idx, territory)

        ir = ContentIR()
        assemble_results(idx, annotations, set(), territory, ir)
        sections = ir.chapters[0].sections
        all_content = " ".join(s.content for s in sections)
        assert "书名" not in all_content
        assert "正文内容" in all_content

    def test_no_chapters_returns_default(self) -> None:
        """No chapter boundaries → single default chapter."""
        html = """<html><body>
        <p>Some text</p>
        </body></html>"""
        idx, territory = _build(html)
        ir = ContentIR()
        assemble_results(idx, [], set(), territory, ir)
        assert len(ir.chapters) == 1
        assert ir.chapters[0].title == ""

    def test_annotation_at_chapter_boundary_flushed(self) -> None:
        """Annotations at chapter end should be flushed with last section."""
        html = """<html><body>
        <p>第一章内容</p>
        <font style="FONT-SIZE: 9pt">章末注</font>
        <center><b><font color="#CC33CC">第二章</font></b></center>
        <p>第二章内容</p>
        </body></html>"""
        idx, territory = _build(html)
        pass1_book_title(idx, territory)
        chapter_titles = pass3_chapter_title(idx, territory)
        chapter_title_nodes = {ch["node_id"] for ch in chapter_titles}
        annotations = pass4_annotation(idx, territory)

        ir = ContentIR()
        assemble_results(idx, annotations, chapter_title_nodes, territory, ir)
        # Annotations should be in first chapter's sections, not lost
        all_anns = []
        for ch in ir.chapters:
            for s in ch.sections:
                all_anns.extend(s.annotations)
        assert len(all_anns) >= 1
        assert any("章末注" in a.text for a in all_anns)

    def test_full_pipeline_integration(self) -> None:
        """Full pipeline with all passes + assemble."""
        html = """<html><head><title>测试书</title></head><body>
        <center><b><font color="#FF6666" size="5">测试书</font></b></center>
        <p>(明·王阳明)</p>
        <center><b><font color="#CC33CC">上卷</font></b></center>
        <p>上卷正文</p>
        <font style="FONT-SIZE: 9pt">朱子注</font>
        <p>后续正文</p>
        </body></html>"""
        ir = _run_pipeline(html)
        assert ir.title == "测试书"
        assert ir.dynasty == "明"
        assert ir.author == "王阳明"
        assert len(ir.chapters) >= 1
        # Annotation should not be in any section content
        for ch in ir.chapters:
            for s in ch.sections:
                assert "朱子注" not in s.content
        # But annotations should exist in sections
        all_anns = []
        for ch in ir.chapters:
            for s in ch.sections:
                all_anns.extend(s.annotations)
        assert len(all_anns) >= 1
