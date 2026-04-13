"""bamboo-extract — Ancient Chinese text extraction module."""

from .dom_index import build_dom_index
from .normalize import normalize_html
from .territory import Territory
from .types import (
    Annotation,
    Chapter,
    ContentIR,
    DOMIndex,
    NavItem,
    NodeProxy,
    Section,
)

__all__ = [
    "ContentIR",
    "Chapter",
    "Section",
    "Annotation",
    "NavItem",
    "NodeProxy",
    "DOMIndex",
    "Territory",
    "normalize_html",
    "build_dom_index",
    "extract",
]


def extract(html: str, source_path: str = "") -> ContentIR:
    """Extract content from HTML and return ContentIR.

    Pipeline (Phase 3):
    1. normalize_html — center/table/empty tag handling
    2. build_dom_index — by_color/class/tag/size + text nodes + parent_map
    3. Territory — claim tracking (ready for Pass integration in Phase 4)

    Pass 1-10 are dummy — return empty results. Phase 4+ will implement real Passes.
    """
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()

    # Phase 3: Passes are dummy — all text goes to main-text via Territory
    text_content = {nid: node_text for nid, node_text in _collect_text(index, normalized)}
    remaining = territory.extract_remaining(index.all_text_nodes, text_content)

    # Always return at least one chapter (even if empty) for backward compatibility
    chapters: list[Chapter]
    if remaining:
        sections = [Section(type=r["type"], content=r["content"]) for r in remaining]
        chapters = [Chapter(title="", sections=sections)]
    else:
        chapters = [Chapter(title="", sections=[])]

    return ContentIR(
        title="Untitled",
        source=source_path or None,
        docType="content",
        chapters=chapters,
        navItems=[],
    )


def _collect_text(index: DOMIndex, html: str) -> list[tuple[int, str]]:
    """Collect text content for all text node IDs.

    Temporary helper — Phase 4 will use NodeProxy-based text extraction.
    For now, parse the normalized HTML and map text node IDs to their text.
    """
    # Phase 3 workaround: we don't have per-node text from DOMIndex yet.
    # Collect all text via selectolax and assign by DOM order to match all_text_nodes.
    from selectolax.parser import HTMLParser

    tree = HTMLParser(html)
    result: list[tuple[int, str]] = []
    root = tree.root
    if root is None:
        return result

    text_idx = 0

    for node in root.traverse():
        if node.tag == "-text" and text_idx < len(index.all_text_nodes):
            nid = index.all_text_nodes[text_idx]
            text = node.text().strip()
            if text:
                result.append((nid, text))
            text_idx += 1

    return result
