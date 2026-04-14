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


class TestJiebaMultiTokenDynastyNames:
    """Multi-token dynasty name handling.

    Dynasty names like "南北朝" or "北宋" may be segmented by jieba into
    sub-tokens. These tests verify that jieba (with add_word) correctly
    handles these cases.
    """

    def test_compound_dynasty_recognized_as_single_token(self) -> None:
        """'南北朝' should be recognized as a single dynasty token."""
        md = MetaDictionary()
        md.add_pair("南北朝", "陶渊明")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("南北朝·陶渊明")
        # With add_word, jieba should keep 南北朝 as one token
        assert "南北朝" in tokens
        entities = plugin.recognize_entities(tokens, {"dynasty", "person"})
        assert any(e.text == "南北朝" and e.type == "dynasty" for e in entities)
        assert any(e.text == "陶渊明" and e.type == "person" for e in entities)

    def test_bei_song_recognized(self) -> None:
        """'北宋' should be recognized as a single dynasty token."""
        md = MetaDictionary()
        md.add_pair("北宋", "苏轼")
        plugin = JiebaNLPPlugin(md)
        tokens = plugin.segment("北宋·苏轼")
        assert "北宋" in tokens
        entities = plugin.recognize_entities(tokens, {"dynasty", "person"})
        assert any(e.text == "北宋" and e.type == "dynasty" for e in entities)
        assert any(e.text == "苏轼" and e.type == "person" for e in entities)
