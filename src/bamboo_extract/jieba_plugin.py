"""Jieba-based NLP plugin for bamboo-extract.

Uses jieba (结巴分词) for Chinese word segmentation and matches tokens
against the dynamic MetaDictionary for entity recognition.
"""

from __future__ import annotations

import jieba

from .meta_dict import MetaDictionary
from .nlp import Entity, NLPPlugin


class JiebaNLPPlugin(NLPPlugin):
    """NLP plugin backed by jieba segmentation + dictionary matching."""

    def __init__(self, meta_dict: MetaDictionary | None = None) -> None:
        self._meta_dict = meta_dict
        if meta_dict is not None:
            # Add dynasty and author names to jieba's custom dictionary
            # so they are recognized as single tokens during segmentation.
            for dynasty in meta_dict.dynasties:
                jieba.add_word(dynasty)
            for author in meta_dict.authors:
                jieba.add_word(author)

    def segment(self, text: str) -> list[str]:
        """Split text into tokens using jieba.lcut."""
        return [t for t in jieba.lcut(text) if t.strip()]

    def recognize_entities(
        self, tokens: list[str], entity_types: set[str]
    ) -> list[Entity]:
        """Match tokens against MetaDictionary to identify entities."""
        if self._meta_dict is None:
            return []

        entities: list[Entity] = []
        for token in tokens:
            if "dynasty" in entity_types and self._meta_dict.is_dynasty(
                token
            ):
                entities.append(Entity(token, "dynasty"))
            if "person" in entity_types and self._meta_dict.is_author(token):
                entities.append(Entity(token, "person"))
        return entities

    def punctuate(self, text: str) -> str:
        """Reserved for P8/P9."""
        raise NotImplementedError("punctuate is reserved for P8/P9")
