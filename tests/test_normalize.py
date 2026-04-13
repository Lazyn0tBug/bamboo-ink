"""Tests for HTML normalization — center tag, table flattening, empty tag removal."""

from bamboo_extract.normalize import flatten_tables, normalize_html


class TestCenterTag:
    def test_center_to_div(self) -> None:
        html = "<center>Hello</center>"
        result = normalize_html(html)
        assert '<div data-center="1"' in result
        assert "</div>" in result
        assert "<center" not in result

    def test_center_with_attributes(self) -> None:
        html = '<center class="foo">Test</center>'
        result = normalize_html(html)
        assert '<div data-center="1" class="foo">' in result


class TestFlattenTables:
    def test_td_to_div(self) -> None:
        html = "<table><tr><td>hello</td></tr></table>"
        result = flatten_tables(html)
        assert '<div class="table-cell">hello</div>' in result
        assert "<td" not in result

    def test_preserves_td_class(self) -> None:
        html = '<td class="myclass">x</td>'
        result = flatten_tables(html)
        assert 'class="table-cell myclass"' in result

    def test_unwraps_table_tags(self) -> None:
        html = "<table><tbody><tr><td>a</td></tr></tbody></table>"
        result = flatten_tables(html)
        assert "<table" not in result
        assert "<tbody" not in result
        assert "<tr>" not in result


class TestEmptyTagRemoval:
    def test_removes_empty_tags(self) -> None:
        html = "<p></p><span></span><div>keep</div>"
        result = normalize_html(html)
        assert "<p></p>" not in result
        assert "<span></span>" not in result
        assert "<div>keep</div>" in result

    def test_preserves_br(self) -> None:
        html = "line1<br/>line2"
        result = normalize_html(html)
        assert "<br" in result


class TestEdgeCases:
    def test_empty_input(self) -> None:
        assert normalize_html("") == ""

    def test_idempotent(self) -> None:
        html = "<center><table><tr><td>x</td></tr></table></center>"
        first = normalize_html(html)
        second = normalize_html(first)
        assert first == second
