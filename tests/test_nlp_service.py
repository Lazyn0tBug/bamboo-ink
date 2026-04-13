"""Tests for NLPService — classify_short_text facade."""

from bamboo_extract.meta_dict import MetaDictionary
from bamboo_extract.nlp import Entity, NLPPlugin
from bamboo_extract.nlp_service import NLPService


class _MockNLPPlugin(NLPPlugin):
    """Mock plugin that uses a simple token map for testing."""

    def __init__(self, token_map: dict[str, str]) -> None:
        # Maps token -> entity_type
        self._token_map = token_map

    def segment(self, text: str) -> list[str]:
        # Simple: split on common delimiters
        tokens: list[str] = []
        current = ""
        for ch in text:
            if ch in "（()）·.-":
                if current:
                    tokens.append(current)
                    current = ""
            else:
                current += ch
        if current:
            tokens.append(current)
        return [t for t in tokens if t.strip()]

    def recognize_entities(
        self, tokens: list[str], entity_types: set[str]
    ) -> list[Entity]:
        entities: list[Entity] = []
        for token in tokens:
            if token in self._token_map:
                etype = self._token_map[token]
                if etype in entity_types:
                    entities.append(Entity(token, etype))
        return entities

    def punctuate(self, text: str) -> str:
        raise NotImplementedError("reserved for P8/P9")


def _build_service(
    token_map: dict[str, str] | None = None,
    meta_dict: MetaDictionary | None = None,
) -> NLPService:
    """Helper: create NLPService with optional plugin and dictionary."""
    svc = NLPService()
    if token_map is not None:
        svc.set_plugin(_MockNLPPlugin(token_map))
    if meta_dict is not None:
        svc.set_meta_dict(meta_dict)
    return svc


class TestNLPServiceNoPlugin:
    """NLPService without plugin/dictionary returns unknown."""

    def test_no_plugin(self) -> None:
        svc = NLPService()
        assert svc.classify_short_text("宋·朱熹") == {"type": "unknown"}

    def test_plugin_no_dict(self) -> None:
        svc = _build_service(token_map={"宋": "dynasty"})
        assert svc.classify_short_text("宋·朱熹") == {"type": "unknown"}


class TestNLPServiceClassify:
    """classify_short_text with plugin + dictionary."""

    def test_valid_metadata(self) -> None:
        """Dynasty + author both match → metadata."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        svc = _build_service(
            token_map={"宋": "dynasty", "朱熹": "person"},
            meta_dict=md,
        )
        result = svc.classify_short_text("宋·朱熹")
        assert result["type"] == "metadata"
        assert result["dynasty"] == "宋"
        assert result["author"] == "朱熹"

    def test_dynasty_only(self) -> None:
        """Only dynasty matches → category."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        svc = _build_service(
            token_map={"宋": "dynasty"},
            meta_dict=md,
        )
        result = svc.classify_short_text("宋")
        assert result["type"] == "category"

    def test_unknown_text(self) -> None:
        """No token matches → unknown."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        svc = _build_service(
            token_map={},
            meta_dict=md,
        )
        result = svc.classify_short_text("洞经教部")
        assert result["type"] == "unknown"

    def test_false_positive_filtered(self) -> None:
        """Text that looks like metadata but isn't in dictionary → unknown."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        svc = _build_service(
            token_map={},
            meta_dict=md,
        )
        result = svc.classify_short_text("简明目录")
        assert result["type"] == "unknown"

    def test_empty_text(self) -> None:
        svc = _build_service(
            token_map={"宋": "dynasty"},
            meta_dict=MetaDictionary(),
        )
        assert svc.classify_short_text("") == {"type": "unknown"}

    def test_paren_wrapped(self) -> None:
        """(宋·朱熹) format with parens → metadata."""
        md = MetaDictionary()
        md.add_pair("宋", "朱熹")
        svc = _build_service(
            token_map={"宋": "dynasty", "朱熹": "person"},
            meta_dict=md,
        )
        result = svc.classify_short_text("(宋·朱熹)")
        assert result["type"] == "metadata"
        assert result["dynasty"] == "宋"
        assert result["author"] == "朱熹"
