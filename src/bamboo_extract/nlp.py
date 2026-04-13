"""NLP Plugin Protocol for bamboo-extract.

Defines the interface that NLP implementations must satisfy. The Protocol
pattern allows any conforming implementation (jieba, LLM-based, etc.) to
be swapped without changing the NLPService facade or Pass code.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass
class Entity:
    """Named entity recognized from text."""

    text: str
    type: Literal["dynasty", "person", "place", "book"]


class NLPPlugin(Protocol):
    """Protocol for NLP plugin implementations.

    Three interfaces:
    - segment: split text into tokens
    - recognize_entities: identify named entities in token list
    - punctuate: add punctuation to unpunctuated text (reserved)
    """

    def segment(self, text: str) -> list[str]:
        """Split text into word tokens.

        Example: "(宋·朱熹)" → ["(", "宋", "·", "朱熹", ")"]
        """
        ...

    def recognize_entities(
        self, tokens: list[str], entity_types: set[str]
    ) -> list[Entity]:
        """Identify named entities from a list of tokens.

        Called by NLPService.classify_short_text after segment().
        Example: recognize_entities(["宋", "·", "朱熹"], {"dynasty", "person"})
        → [Entity("宋", "dynasty"), Entity("朱熹", "person")]
        """
        ...

    def punctuate(self, text: str) -> str:
        """Add punctuation to unpunctuated classical Chinese text.

        Reserved for P8/P9. First implementation raises NotImplementedError.
        """
        ...
