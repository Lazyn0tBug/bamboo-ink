"""Tests for DOM index builder — color/class/tag/size indices, text nodes, parent map."""

from bamboo_extract.dom_index import _normalize_color, build_dom_index


class TestNormalizeColor:
    def test_shorthand(self) -> None:
        assert _normalize_color("#F66") == "#FF6666"

    def test_shorthand_lowercase(self) -> None:
        assert _normalize_color("#abc") == "#AABBCC"

    def test_already_expanded(self) -> None:
        assert _normalize_color("#FF6666") == "#FF6666"

    def test_with_spaces(self) -> None:
        assert _normalize_color(" #F66 ") == "#FF6666"


class TestBasic:
    def test_by_tag(self) -> None:
        html = "<body><p>a</p><p>b</p><div>c</div>"
        idx = build_dom_index(html)
        assert len(idx.by_tag.get("p", [])) == 2
        assert len(idx.by_tag.get("div", [])) == 1

    def test_by_class_single(self) -> None:
        html = '<body><div class="foo">a</div>'
        idx = build_dom_index(html)
        assert len(idx.by_class.get("foo", [])) == 1

    def test_by_class_multiple(self) -> None:
        html = '<body><div class="foo bar">a</div>'
        idx = build_dom_index(html)
        assert len(idx.by_class.get("foo", [])) == 1
        assert len(idx.by_class.get("bar", [])) == 1

    def test_by_color(self) -> None:
        html = '<body><font color="#F66">a</font>'
        idx = build_dom_index(html)
        assert "#FF6666" in idx.by_color
        assert len(idx.by_color["#FF6666"]) == 1

    def test_by_size(self) -> None:
        html = '<body><font size="5">a</font>'
        idx = build_dom_index(html)
        assert "5" in idx.by_size
        assert len(idx.by_size["5"]) == 1


class TestAllTextNodes:
    def test_collects_text(self) -> None:
        html = "<body><p>hello</p><div>world</div>"
        idx = build_dom_index(html)
        assert len(idx.all_text_nodes) >= 2

    def test_nested_text(self) -> None:
        html = "<body><div><span>a</span>b</div>"
        idx = build_dom_index(html)
        # Should have text for 'a' inside span and 'b' after span
        assert len(idx.all_text_nodes) >= 2


class TestParentMap:
    def test_parent_relationship(self) -> None:
        html = "<body><div><span>x</span></div>"
        idx = build_dom_index(html)
        # span's parent should be div
        # Find div and span node IDs
        div_ids = idx.by_tag.get("div", [])
        span_ids = idx.by_tag.get("span", [])
        assert len(div_ids) >= 1
        assert len(span_ids) >= 1
        assert idx.parent_map[span_ids[0]] == div_ids[0]

    def test_top_level_has_no_parent(self) -> None:
        html = "<body><p>a</p>"
        idx = build_dom_index(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) >= 1
        assert p_ids[0] not in idx.parent_map


class TestNodeIds:
    def test_incremental(self) -> None:
        html = "<body><p>a</p><div>b</div><span>c</span>"
        idx = build_dom_index(html)
        all_ids = set()
        for ids in idx.by_tag.values():
            all_ids.update(ids)
        for nid in idx.all_text_nodes:
            all_ids.add(nid)
        # IDs should be 0..N-1
        assert all_ids == set(range(len(all_ids)))


class TestEdgeCases:
    def test_empty_body(self) -> None:
        html = "<body></body>"
        idx = build_dom_index(html)
        assert idx.by_color == {}
        assert idx.by_class == {}
        assert idx.by_tag == {}
        assert idx.by_size == {}
        assert idx.parent_map == {}

    def test_no_color_attribute(self) -> None:
        html = '<body><div class="foo">a</div>'
        idx = build_dom_index(html)
        assert idx.by_color == {}

    def test_comments_skipped(self) -> None:
        html = "<body><!-- comment --><p>text</p>"
        idx = build_dom_index(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1

    def test_nested_structure(self) -> None:
        html = "<body><div><p><span>x</span></p></div>"
        idx = build_dom_index(html)
        div_ids = idx.by_tag.get("div", [])
        p_ids = idx.by_tag.get("p", [])
        span_ids = idx.by_tag.get("span", [])
        assert len(div_ids) == 1
        assert len(p_ids) == 1
        assert len(span_ids) == 1
        # Verify chain: span -> p -> div
        assert idx.parent_map[span_ids[0]] == p_ids[0]
        assert idx.parent_map[p_ids[0]] == div_ids[0]


class TestTextById:
    def test_element_text(self) -> None:
        html = "<body><p>hello</p></body>"
        idx = build_dom_index(html)
        p_ids = idx.by_tag.get("p", [])
        assert len(p_ids) == 1
        assert "hello" in idx.text_by_id[p_ids[0]]

    def test_text_node_text(self) -> None:
        html = "<body><div>a<span>b</span>c</div>"
        idx = build_dom_index(html)
        # All text nodes should have entries in text_by_id
        for nid in idx.all_text_nodes:
            assert nid in idx.text_by_id


class TestAttrsById:
    def test_element_attrs(self) -> None:
        html = '<body><font color="#F66" size="5">x</font></body>'
        idx = build_dom_index(html)
        font_ids = idx.by_tag.get("font", [])
        assert len(font_ids) == 1
        assert idx.attrs_by_id[font_ids[0]] == {"tag": "font", "color": "#F66", "size": "5"}

    def test_no_attrs(self) -> None:
        html = "<body><div>x</div></body>"
        idx = build_dom_index(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        assert idx.attrs_by_id[div_ids[0]] == {"tag": "div"}


class TestChildrenMap:
    def test_parent_children(self) -> None:
        html = "<body><div><span>a</span><p>b</p></div></body>"
        idx = build_dom_index(html)
        div_ids = idx.by_tag.get("div", [])
        assert len(div_ids) == 1
        children = idx.children_map.get(div_ids[0], [])
        # Should include span and text node children
        assert len(children) >= 2

    def test_nested_chain(self) -> None:
        html = "<body><div><p><span>x</span></p></div></body>"
        idx = build_dom_index(html)
        div_ids = idx.by_tag.get("div", [])
        p_ids = idx.by_tag.get("p", [])
        span_ids = idx.by_tag.get("span", [])
        assert len(div_ids) == 1
        assert len(p_ids) == 1
        assert len(span_ids) == 1
        # div's children should include p
        assert p_ids[0] in idx.children_map.get(div_ids[0], [])
        # p's children should include span
        assert span_ids[0] in idx.children_map.get(p_ids[0], [])
