"""Phase 5 business scenario tests — Pass 4 annotation + Pass 9 main-text.

Naming convention: test_phase{N}_business_scenarios.py
- One file per phase, added incrementally as features land
- Each file tests business-level behaviors visible to the end user
- Uses real HTML from content/ and 古籍/ directories when possible
- Synthetic fixtures only when real files don't exercise the feature

Update this file when:
- Pass 4 annotation behavior changes
- Main-text collection after annotation claims is affected
- Bugs are found that should have been caught by business-level tests

Current coverage (Phase 5):
1. Real content page: 大学章句集注 — annotation extraction
2. Synthetic: annotation claim isolation from main-text
3. Template G — pure main-text, no annotations
4. Mixed content: annotations interleaved with main-text
"""

from pathlib import Path

from bamboo_extract import extract, pass4_annotation
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html
from bamboo_extract.passes import (
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
)
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


# ── Scenario 1: Real content page with annotations ──────────────────


class TestRealContentWithAnnotations:
    """大学章句集注 — annotation extraction from real file."""

    def setup_method(self) -> None:
        path = REAL_CONTENT_DIR / "经部" / "大学章句集注.htm"
        self.raw_html = path.read_text(encoding="utf-8")

    def test_annotations_extracted_from_real_file(self) -> None:
        """Real file should produce annotation nodes via Pass 4."""
        idx, territory = _build(self.raw_html)
        # Run Pass 1-3 first (territorial chain)
        pass1_book_title(idx, territory)
        pass2_metadata(idx, territory)
        pass3_chapter_title(idx, territory)
        annotations = pass4_annotation(idx, territory)
        # Real file has multiple annotations
        assert len(annotations) > 0, "Expected annotations from real file"

    def test_annotation_text_not_in_main_text(self) -> None:
        """Pass 4 claimed annotations should not appear in remaining text."""
        ir = extract(self.raw_html)
        # Collect all section content
        all_content = ""
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_content += section.content

    def test_docType_is_content(self) -> None:  # noqa: N802
        """Content page with annotations should be docType=content."""
        ir = extract(self.raw_html)
        assert ir.docType == "content"

    def test_title_preserved_after_pass4(self) -> None:
        """Pass 4 should not affect title extraction."""
        ir = extract(self.raw_html)
        assert ir.title == "大学章句集注"


# ── Scenario 2: Template G — pure main-text, no annotations ────────


class TestPureMainText:
    """Template G (儀禮) — no annotations, all text is main-text."""

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

    def test_no_annotations(self) -> None:
        """Template G should produce zero annotations."""
        idx, territory = _build(self.TEMPLATE_G_HTML)
        pass1_book_title(idx, territory)
        pass2_metadata(idx, territory)
        pass3_chapter_title(idx, territory)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0

    def test_all_text_in_main_text(self) -> None:
        """All text should appear in main-text sections."""
        ir = extract(self.TEMPLATE_G_HTML)
        all_content = ""
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_content += section.content
        assert "士冠禮" in all_content
        assert "陳 服 于 房 中 西 墉 下" in all_content


# ── Scenario 3: Annotation claim isolation ──────────────────────────


class TestAnnotationClaimIsolation:
    """Verify Pass 4 annotations don't leak into main-text."""

    def test_annotation_not_in_remaining(self) -> None:
        """FONT-SIZE: 9pt annotation should not appear in remaining text."""
        html = """<html><body>
<CENTER><B><FONT COLOR="#FF6666" SIZE="5">书名</FONT></B></CENTER>
<p>(宋·朱熹)</p>
<center><B><FONT COLOR="#CC33CC">第一章</FONT></B></center>
<p>正文内容</p>
<FONT style="FONT-SIZE: 9pt">小字注释文字</FONT>
<p>更多正文</p>
</body></html>"""
        ir = extract(html)
        # Collect all section content
        all_content = ""
        for chapter in ir.chapters:
            for section in chapter.sections:
                all_content += section.content
        # Annotation text should NOT be in main-text
        assert "小字注释文字" not in all_content
        # But main-text should still be present
        assert "正文内容" in all_content
        assert "更多正文" in all_content

    def test_multiple_annotation_styles_claimed(self) -> None:
        """All three annotation styles should be claimed."""
        html = """<html><body>
<p>正文开头</p>
<span class="annotation">class注</span>
<font style="FONT-SIZE: 9pt">9pt注</font>
<font style="FONT-SIZE: 10pt" color="#551A8B">10pt紫注</font>
<p>正文结尾</p>
</body></html>"""
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        # All three annotation styles should be found
        assert len(annotations) >= 3
        texts = [a["text"] for a in annotations]
        assert any("class注" in t for t in texts)
        assert any("9pt注" in t for t in texts)
        assert any("10pt紫注" in t for t in texts)

    def test_empty_annotation_skipped(self) -> None:
        """Empty annotation element should not be claimed."""
        html = '<body><span class="annotation"></span><p>正文</p></body>'
        idx, territory = _build(html)
        annotations = pass4_annotation(idx, territory)
        assert len(annotations) == 0
        # main-text should still have 正文
        text_content = {
            nid: idx.text_by_id.get(nid, "").strip()
            for nid in idx.all_text_nodes
            if idx.text_by_id.get(nid, "").strip()
        }
        remaining = territory.extract_remaining(idx.all_text_nodes, text_content)
        remaining_text = "".join(r["content"] for r in remaining)
        assert "正文" in remaining_text


# ── Scenario 4: Pipeline integration ────────────────────────────────


class TestPipelineIntegration:
    """End-to-end pipeline with Pass 4 integrated."""

    def test_full_pipeline_with_annotations(self) -> None:
        """Full extract() pipeline should claim annotations before main-text."""
        html = """<html><head><title>测试书</title></head><body>
<CENTER><B><FONT COLOR="#FF6666" SIZE="5">测试书</FONT></B></CENTER>
<p>(明·王阳明)</p>
<center><B><FONT COLOR="#CC33CC">上卷</FONT></B></center>
<p>上卷正文内容</p>
<FONT style="FONT-SIZE: 9pt">朱子注曰：此为上卷之注</FONT>
<p>上卷后续正文</p>
<center><B><FONT COLOR="#CC33CC">下卷</FONT></B></center>
<p>下卷正文内容</p>
</body></html>"""
        ir = extract(html)
        assert ir.title == "测试书"
        assert ir.dynasty == "明"
        assert ir.author == "王阳明"
        assert len(ir.chapters) == 2
        chapter_titles = [ch.title for ch in ir.chapters]
        assert "上卷" in chapter_titles
        assert "下卷" in chapter_titles
        # Annotation should not be in any section content
        for chapter in ir.chapters:
            for section in chapter.sections:
                assert "朱子注曰" not in section.content

    def test_catalog_path_skips_pass4(self) -> None:
        """Catalog pages should not run Pass 4 (catalog path)."""
        html = """<html><head><title>目录</title></head><body>
<table><tr><td>
<a href="001.htm">第一章</a><br>
<a href="002.htm">第二章</a><br>
<a href="003.htm">第三章</a><br>
<a href="004.htm">第四章</a><br>
<a href="005.htm">第五章</a><br>
<a href="006.htm">第六章</a><br>
</td></tr></table>
</body></html>"""
        ir = extract(html)
        assert ir.docType == "catalog"
        assert ir.chapters == []
        assert len(ir.navItems) == 6
