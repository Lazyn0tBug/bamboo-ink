"""IR data models and DOM index types for bamboo-extract."""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel, Field


class Annotation(BaseModel):
    text: str


class Section(BaseModel):
    type: str  # "main-text" | "section-summary" | "colophon"
    content: str
    annotations: list[Annotation] = Field(default_factory=list)


class Chapter(BaseModel):
    title: str
    sections: list[Section] = Field(default_factory=list)


class NavItem(BaseModel):
    href: str
    label: str


class ContentIR(BaseModel):
    title: str = "Untitled"
    source: str | None = None
    docType: str = "content"  # noqa: N815 — matches JS IR field name
    dynasty: str | None = None
    author: str | None = None
    chapters: list[Chapter] = Field(default_factory=list)
    navItems: list[NavItem] = Field(default_factory=list)  # noqa: N815 — matches JS IR field name


# ── DOM Index Types ──────────────────────────────────────────────────


@dataclass
class NodeProxy:
    """Snapshot of a DOM node's attributes and text content.

    Mirrors the cheerio node object used in JS buildDomIndex.
    node_id is a deterministic integer assigned in DOM traversal order.
    """

    node_id: int
    tag: str  # lowercase element tag, '#text' for text nodes
    attrs: dict[str, str] = field(default_factory=dict)
    text: str = ""
    node_id_attr: str | None = None  # value of 'id' attribute if present


@dataclass
class DOMIndex:
    """DOM index built from one pass over the parsed tree.

    All indices store node_id integers (not object references) for
    compatibility with Territory.claimed set.
    """

    by_color: dict[str, list[int]] = field(default_factory=dict)
    """Normalized uppercase + expanded hex (#F66 -> #FF6666)."""
    by_class: dict[str, list[int]] = field(default_factory=dict)
    by_tag: dict[str, list[int]] = field(default_factory=dict)
    by_size: dict[str, list[int]] = field(default_factory=dict)
    all_text_nodes: list[int] = field(default_factory=list)
    parent_map: dict[int, int] = field(default_factory=dict)  # {node_id: parent_node_id}
