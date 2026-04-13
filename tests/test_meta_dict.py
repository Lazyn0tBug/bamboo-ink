"""Tests for MetaDictionary — dynamic metadata dictionary from Catalog pages."""

from bamboo_extract.meta_dict import MetaDictionary, build_meta_dict


# ── Fixtures: 4 Catalog HTML formats ─────────────────────────────────

# Format 1: <font class="annotation">(朝代·作者)</font>
CATALOG_FORMAT_1 = """<html><body>
<table>
<tr><td><a href="a.htm">东坡易传</a> <font class="annotation">(宋·苏轼)</font></td></tr>
<tr><td><a href="b.htm">韩诗外传</a> <font class="annotation">(汉·韩婴)</font></td></tr>
</table>
</body></html>"""

# Format 2: <FONT SIZE=-1 COLOR="#993300">(朝代·作者)</FONT>
CATALOG_FORMAT_2 = """<html><body>
<table>
<tr><td>史记 <FONT SIZE=-1 COLOR="#993300">(汉·司马迁)</FONT></td></tr>
<tr><td>汉书 <FONT SIZE=-1 COLOR="#800000">(汉·班固)</FONT></td></tr>
</table>
</body></html>"""

# Format 3: <font size="2" color="#993300">(朝代·作者)</font>
CATALOG_FORMAT_3 = """<html><body>
<table>
<tr><td>荀子 <font size="2" color="#993300">(周·荀况)</font></td></tr>
<tr><td>孟子 <font size="2" color="#993300">(周·孟轲)</font></td></tr>
</table>
</body></html>"""

# Format 4: &middot; entity pattern (metadata in text with middle dot)
CATALOG_FORMAT_4 = """<html><body>
<p>(唐·颜师古 注)</p>
<p>(宋·朱熹)</p>
</body></html>"""


def _build_meta_dict(*htmls: str) -> MetaDictionary:
    """Helper: build from variable number of HTML strings."""
    return build_meta_dict(list(htmls))


# ── MetaDictionary class ─────────────────────────────────────────────


class TestMetaDictionary:
    def test_is_dynasty_true(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.is_dynasty("宋") is True
        assert md.is_dynasty("汉") is True

    def test_is_dynasty_false(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.is_dynasty("简明目录") is False
        assert md.is_dynasty("洞经教部") is False

    def test_is_author(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.is_author("苏轼") is True
        assert md.is_author("韩婴") is True
        assert md.is_author("Unknown") is False

    def test_get_author_dynasty(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.get_author_dynasty("苏轼") == "宋"
        assert md.get_author_dynasty("韩婴") == "汉"

    def test_get_author_dynasty_missing(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.get_author_dynasty("Unknown") is None

    def test_get_dynasty_authors(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        authors = md.get_dynasty_authors("宋")
        assert "苏轼" in authors

    def test_get_dynasty_authors_empty(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.get_dynasty_authors("清") == set()

    def test_add_pair(self) -> None:
        md = MetaDictionary()
        md.add_pair("明", "罗贯中")
        assert md.is_dynasty("明") is True
        assert md.get_author_dynasty("罗贯中") == "明"

    def test_add_empty_pair(self) -> None:
        md = MetaDictionary()
        md.add_pair("", "")
        assert len(md.dynasties) == 0
        assert len(md.authors) == 0


# ── Save/Load ────────────────────────────────────────────────────────


class TestMetaDictionaryPersistence:
    def test_save_and_load(self, tmp_path) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        path = tmp_path / "meta_dict.json"
        md.save(path)
        loaded = MetaDictionary.load(path)
        assert loaded.dynasties == md.dynasties
        assert loaded.authors == md.authors
        assert loaded.dynasty_authors == md.dynasty_authors

    def test_save_creates_parent_dirs(self, tmp_path) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        path = tmp_path / "sub" / "dir" / "meta_dict.json"
        md.save(path)
        assert path.exists()


# ── build_meta_dict: 4 HTML formats ──────────────────────────────────


class TestBuildMetaDictFormats:
    def test_format1_annotation_class(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_1)
        assert md.is_dynasty("宋") is True
        assert md.is_author("苏轼") is True
        assert md.is_author("韩婴") is True

    def test_format2_font_size_color(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_2)
        assert md.is_dynasty("汉") is True
        assert md.is_author("司马迁") is True
        assert md.is_author("班固") is True

    def test_format3_font_lowercase(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_3)
        assert md.is_dynasty("周") is True
        assert md.is_author("荀况") is True
        assert md.is_author("孟轲") is True

    def test_format4_plain_text(self) -> None:
        md = _build_meta_dict(CATALOG_FORMAT_4)
        assert md.is_dynasty("唐") is True
        assert md.is_author("颜师古") is True
        assert md.is_dynasty("宋") is True
        assert md.is_author("朱熹") is True

    def test_all_formats_combined(self) -> None:
        md = _build_meta_dict(
            CATALOG_FORMAT_1,
            CATALOG_FORMAT_2,
            CATALOG_FORMAT_3,
            CATALOG_FORMAT_4,
        )
        # Should have dynasties from all formats
        assert md.is_dynasty("宋") is True
        assert md.is_dynasty("汉") is True
        assert md.is_dynasty("周") is True
        assert md.is_dynasty("唐") is True
        # Authors from all formats
        assert md.is_author("苏轼") is True
        assert md.is_author("司马迁") is True
        assert md.is_author("荀况") is True
        assert md.is_author("颜师古") is True


# ── Edge cases ───────────────────────────────────────────────────────


class TestBuildMetaDictEdgeCases:
    def test_empty_html_list(self) -> None:
        md = build_meta_dict([])
        assert len(md.dynasties) == 0
        assert len(md.authors) == 0

    def test_empty_html_string(self) -> None:
        md = build_meta_dict([""])
        assert len(md.dynasties) == 0

    def test_no_metadata_pattern(self) -> None:
        md = build_meta_dict(["<html><body><p>No metadata here</p></body></html>"])
        assert len(md.dynasties) == 0

    def test_deduplication(self) -> None:
        html = """<html><body>
        <font class="annotation">(宋·苏轼)</font>
        <font class="annotation">(宋·苏轼)</font>
        </body></html>"""
        md = build_meta_dict([html])
        assert md.get_author_dynasty("苏轼") == "宋"
        # Only one author entry despite two occurrences
        assert md.authors["苏轼"] == "宋"
