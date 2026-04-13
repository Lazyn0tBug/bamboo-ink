"""NLP Service facade for bamboo-extract.

Orchestrates NLP plugin execution: segment text, recognize entities,
and validate against MetaDictionary to classify short text snippets.

The Pass layer depends only on this facade, not on any specific NLP
implementation (jieba, LLM, etc.).
"""

from __future__ import annotations

from typing import Literal, TypedDict

from .meta_dict import MetaDictionary
from .nlp import NLPPlugin


class _MetadataResult(TypedDict):
    type: Literal["metadata"]
    dynasty: str
    author: str


class _CategoryResult(TypedDict):
    type: Literal["category"]


class _UnknownResult(TypedDict):
    type: Literal["unknown"]


ClassificationResult = _MetadataResult | _CategoryResult | _UnknownResult


class NLPService:
    """Facade for NLP operations. Pass code depends on this, not on plugins."""

    def __init__(self) -> None:
        self._plugin: NLPPlugin | None = None
        self._meta_dict: MetaDictionary | None = None

    def set_plugin(self, plugin: NLPPlugin) -> None:
        """Register an NLP plugin implementation."""
        self._plugin = plugin

    def set_meta_dict(self, meta_dict: MetaDictionary) -> None:
        """Register the dynamic metadata dictionary for entity validation."""
        self._meta_dict = meta_dict

    @property
    def is_active(self) -> bool:
        """Check if NLP service is fully configured and ready."""
        return self._plugin is not None and self._meta_dict is not None

    def classify_short_text(self, text: str) -> ClassificationResult:
        """Classify a short text snippet using NLP + MetaDictionary.

        Returns one of:
        - {"type": "metadata", "dynasty": str, "author": str} — valid dynasty-author pair
        - {"type": "category"} — matched a dynasty but no corresponding author
        - {"type": "unknown"} — no plugin, no dictionary, or no match
        """
        if self._plugin is None or self._meta_dict is None:
            return {"type": "unknown"}

        tokens = self._plugin.segment(text)
        if not tokens:
            return {"type": "unknown"}

        entities = self._plugin.recognize_entities(
            tokens, {"dynasty", "person"}
        )
        if not entities:
            return {"type": "unknown"}

        # Match entities against MetaDictionary
        dynasty: str | None = None
        author: str | None = None

        for entity in entities:
            if entity.type == "dynasty" and self._meta_dict.is_dynasty(
                entity.text
            ):
                dynasty = entity.text
            elif entity.type == "person" and self._meta_dict.is_author(
                entity.text
            ):
                author = entity.text
                # Verify author's dynasty matches if we already found one
                author_dynasty = self._meta_dict.get_author_dynasty(
                    entity.text
                )
                if dynasty is not None and author_dynasty != dynasty:
                    # Dynasty mismatch — reset and let author's dynasty win
                    dynasty = author_dynasty

        if dynasty and author:
            return {"type": "metadata", "dynasty": dynasty, "author": author}
        if dynasty:
            return {"type": "category"}
        return {"type": "unknown"}
