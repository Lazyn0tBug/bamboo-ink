"""Tests for regex_patterns.py — all compiled patterns match expected inputs."""

from bamboo_extract.regex_patterns import (
    CJK_RE,
    COLOR_551A8B_RE,
    END_MARKER_RE,
    FONT_SIZE_9PT_RE,
    FONT_SIZE_10PT_RE,
    FONT_SIZE_CAPTURE_RE,
    METADATA_RE,
    SECTION_SUMMARY_RE,
    TEXT_ALIGN_CENTER_RE,
    WHITESPACE_COLLAPSE_RE,
)


class TestCjk:
    def test_bmp_char(self) -> None:
        assert CJK_RE.search("\u4e00")  # 一

    def test_extension_a(self) -> None:
        assert CJK_RE.search("\U00020000")  # Extension A

    def test_non_cjk(self) -> None:
        assert not CJK_RE.search("hello")


class TestMetadata:
    def test_simplified(self) -> None:
        m = METADATA_RE.search("汉·司马迁")
        assert m and m.group(1) == "汉" and m.group(2) == "司马迁"

    def test_traditional(self) -> None:
        m = METADATA_RE.search("漢·司馬遷")
        assert m and m.group(1) == "漢" and m.group(2) == "司馬遷"

    def test_with_paren(self) -> None:
        m = METADATA_RE.search("(唐·李白)")
        assert m and m.group(1) == "唐" and m.group(2) == "李白"


class TestSectionSummary:
    def test_traditional_chuan(self) -> None:
        assert SECTION_SUMMARY_RE.search("右傳之首章")

    def test_simplified_chuan(self) -> None:
        assert SECTION_SUMMARY_RE.search("右传之首章")

    def test_traditional_jing(self) -> None:
        assert SECTION_SUMMARY_RE.search("右經首章")

    def test_simplified_jing(self) -> None:
        assert SECTION_SUMMARY_RE.search("右经首章")

    def test_with_number(self) -> None:
        assert SECTION_SUMMARY_RE.search("右傳之二章")

    def test_random_text(self) -> None:
        assert not SECTION_SUMMARY_RE.search("some random text")


class TestEndMarker:
    def test_traditional(self) -> None:
        assert END_MARKER_RE.search("某某終")

    def test_simplified(self) -> None:
        assert END_MARKER_RE.search("某某终")

    def test_with_space(self) -> None:
        assert END_MARKER_RE.search("某某 終")

    def test_no_marker(self) -> None:
        assert not END_MARKER_RE.search("某某开始")


class TestTextAlignCenter:
    def test_lowercase(self) -> None:
        assert TEXT_ALIGN_CENTER_RE.search("text-align: center")

    def test_uppercase(self) -> None:
        assert TEXT_ALIGN_CENTER_RE.search("TEXT-ALIGN:CENTER")

    def test_with_spaces(self) -> None:
        assert TEXT_ALIGN_CENTER_RE.search("text-align  :  center")


class TestFontSize:
    def test_9pt(self) -> None:
        assert FONT_SIZE_9PT_RE.search("FONT-SIZE: 9pt")

    def test_10pt(self) -> None:
        assert FONT_SIZE_10PT_RE.search("FONT-SIZE: 10pt")

    def test_capture_size(self) -> None:
        m = FONT_SIZE_CAPTURE_RE.search("FONT-SIZE: 9pt")
        assert m and m.group(1) == "9"


class TestColor551A8B:
    def test_match(self) -> None:
        assert COLOR_551A8B_RE.search("color: #551A8B")

    def test_in_style(self) -> None:
        assert COLOR_551A8B_RE.search("#551A8B; FONT-SIZE: 10pt")


class TestWhitespaceCollapse:
    def test_multiple_spaces(self) -> None:
        result = WHITESPACE_COLLAPSE_RE.sub(" ", "a   b")
        assert result == "a b"

    def test_newlines(self) -> None:
        result = WHITESPACE_COLLAPSE_RE.sub(" ", "a\n\nb")
        assert result == "a b"
