"""Tests for catalog detection."""

from bamboo_extract.catalog_detect import detect_catalog, extract_nav_items
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html

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

CONTENT_HTML = """<html><body>
<p>大学之书，古之大学所以教人之法也。</p>
<p>程子曰：此孔氏遗书，初学入德之门也。</p>
<p>三代之隆，其法寖备。</p>
</body></html>"""


def _build(html: str):
    return build_dom_index(normalize_html(html))


class TestDetectCatalog:
    def test_catalog_detected(self) -> None:
        idx = _build(CATALOG_HTML)
        assert detect_catalog(idx) is True

    def test_content_not_catalog(self) -> None:
        idx = _build(CONTENT_HTML)
        assert detect_catalog(idx) is False

    def test_empty_not_catalog(self) -> None:
        idx = _build("<html><body></body></html>")
        assert detect_catalog(idx) is False


class TestExtractNavItems:
    def test_catalog_nav_items(self) -> None:
        idx = _build(CATALOG_HTML)
        items = extract_nav_items(idx)
        assert len(items) == 7
        assert items[0] == {"href": "001.htm", "label": "母仪传"}
        assert items[6] == {"href": "007.htm", "label": "孽嬖传"}
