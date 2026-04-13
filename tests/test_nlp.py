"""Tests for JiebaNLPPlugin — jieba-based NLP plugin."""

from bamboo_extract.jieba_plugin import JiebaNLPPlugin
from bamboo_extract.meta_dict import MetaDictionary
from bamboo_extract.nlp import Entity


class TestJiebaPluginSegment:
    """segment() — jieba word segmentation."""

    def test_dynasty_author_split(self) -> None:
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("宋·朱熹")
        assert "宋" in tokens
        assert "朱熹" in tokens

    def test_empty_text(self) -> None:
        plugin = JiebaNLPPlugin()
        assert plugin.segment("") == []

    def test_punctuation_only(self) -> None:
        plugin = JiebaNLPPlugin()
        tokens = plugin.segment("。！？")
        # jieba may still return punctuation; filter out empty
        non_empty = [t for t in tokens if t.strip()]
        assert len(non_empty) <= 3

    def test_with_parens(self) -> None:
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("(宋·朱熹)")
        assert "宋" in tokens
        assert "朱熹" in tokens


class TestJiebaPluginRecognize:
    """recognize_entities() — dictionary-based entity matching."""

    def test_dynasty_and_person(self) -> None:
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("宋·朱熹")
        entities = plugin.recognize_entities(tokens, {"dynasty", "person"})
        assert len(entities) == 2
        assert any(e.text == "宋" and e.type == "dynasty" for e in entities)
        assert any(
            e.text == "朱熹" and e.type == "person" for e in entities
        )

    def test_no_meta_dict(self) -> None:
        """Plugin without MetaDictionary returns empty."""
        plugin = JiebaNLPPlugin()
        entities = plugin.recognize_entities(
            ["宋", "朱熹"], {"dynasty", "person"}
        )
        assert entities == []

    def test_unknown_tokens(self) -> None:
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        plugin = JiebaNLPPlugin(md)
        entities = plugin.recognize_entities(
            ["洞经教部", "经三"], {"dynasty", "person"}
        )
        assert entities == []

    def test_filtered_entity_types(self) -> None:
        """Only requested entity types are returned."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("宋·朱熹")
        # Request only dynasty
        entities = plugin.recognize_entities(tokens, {"dynasty"})
        assert len(entities) == 1
        assert entities[0].type == "dynasty"
        # Request only person
        entities = plugin.recognize_entities(tokens, {"person"})
        assert len(entities) == 1
        assert entities[0].type == "person"


class TestJiebaPluginPunctuate:
    def test_not_implemented(self) -> None:
        plugin = JiebaNLPPlugin()
        import pytest

        with pytest.raises(NotImplementedError):
            plugin.punctuate("学而时习之")
