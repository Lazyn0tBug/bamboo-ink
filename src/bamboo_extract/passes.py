"""Territorial extraction passes for bamboo-extract.

Implements extract_title() pre-pass, Pass 1 (book-title), Pass 2 (metadata),
Pass 3 (chapter-title) and the is_in_centered_context helper.

Mirrors JS extractors.mjs:270-453.
"""

from __future__ import annotations

from selectolax.parser import HTMLParser

from .regex_patterns import (
    COLOR_551A8B_RE,
    FONT_SIZE_9PT_RE,
    FONT_SIZE_10PT_RE,
    METADATA_RE,
    TEXT_ALIGN_CENTER_RE,
)
from .territory import Territory
from .types import DOMIndex


def _all_descendants(node_id: int, children_map: dict[int, list[int]]) -> list[int]:
    """Collect ALL descendants of node_id (DFS) from children_map.

    children_map only stores direct children. This function walks the
    full tree to collect every descendant, matching JS claimSubtree()
    which does a complete DFS over the subtree.
    """
    result: list[int] = []
    stack = list(children_map.get(node_id, []))
    while stack:
        cid = stack.pop()
        result.append(cid)
        stack.extend(children_map.get(cid, []))
    return result

# ── Pre-pass: extract_title ─────────────────────────────────────────


def extract_title(raw_html: str, index: DOMIndex) -> str:
    """Extract book title from HTML without territorial constraints.

    Mirrors JS extractTitle() from extractors.mjs — a pre-pass that runs
    BEFORE territorial passes. Checks:
    1. <title> tag text from raw HTML (build_dom_index skips <head>)
    2. <h1> element text from index
    3. Color + size fallback from index
    4. "Untitled"

    Unlike pass1_book_title, this does NOT require centered context.
    """
    # 1. <title> tag — parse from raw HTML since index skips <head>
    raw_tree = HTMLParser(raw_html)
    for title_node in raw_tree.css("title"):
        text = title_node.text().strip()
        if text:
            return text

    # 2. <h1> element text
    for nid in index.by_tag.get("h1", []):
        text = index.text_by_id.get(nid, "").strip()
        if text:
            return text

    # 3. Fallback: color=#FF6666/#FF0000 + size>=5 (no centered requirement)
    color_nodes = [
        *index.by_color.get("#FF6666", []),
        *index.by_color.get("#FF0000", []),
    ]
    for nid in color_nodes:
        size = int(index.attrs_by_id.get(nid, {}).get("size", "0"))
        if size >= 5:
            text = index.text_by_id.get(nid, "").strip()
            if 0 < len(text) < 80:
                return text

    # 4. Final fallback
    return "Untitled"

# ── Helper: is_in_centered_context ──────────────────────────────────


def is_in_centered_context(node_id: int, index: DOMIndex) -> bool:
    """Check if a node or any of its ancestors is in a centered context.

    Equivalent to JS isInCenteredContext($, node) from extractors.mjs:270-293.
    Checks data-center="1", align="center", and style containing
    text-align:center — on the node itself and all ancestors via parent_map.
    """
    current: int | None = node_id
    while current is not None:
        attrs = index.attrs_by_id.get(current, {})
        if attrs.get("data-center") == "1":
            return True
        if attrs.get("align", "").lower() == "center":
            return True
        style = attrs.get("style", "")
        if style and TEXT_ALIGN_CENTER_RE.search(style):
            return True
        current = index.parent_map.get(current)
    return False


# ── Pass 1: Book Title ──────────────────────────────────────────────


def pass1_book_title(index: DOMIndex, territory: Territory) -> str | None:
    """Extract book-title from DOM.

    Strategy (JS extractors.mjs:305-359):
    A. class=article with 0 < len(text) < 80
    B. color=#FF6666/#FF0000 + centered + size>=5
    C. color=#FF6666/#FF0000 + centered + nested font size>=5
    """
    # Strategy A: class=article
    for nid in index.by_class.get("article", []):
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        text = index.text_by_id.get(nid, "").strip()
        if 0 < len(text) < 80:
            descendants = _all_descendants(nid, index.children_map)
            territory.claim_subtree(nid, descendants)
            return text

    # Collect color candidates
    color_nodes = [
        *index.by_color.get("#FF6666", []),
        *index.by_color.get("#FF0000", []),
    ]

    # Strategy B: direct size >= 5
    for nid in color_nodes:
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        if not is_in_centered_context(nid, index):
            continue
        size = int(index.attrs_by_id.get(nid, {}).get("size", "0"))
        if size < 5:
            continue
        text = index.text_by_id.get(nid, "").strip()
        if 0 < len(text) < 80:
            descendants = _all_descendants(nid, index.children_map)
            territory.claim_subtree(nid, descendants)
            return text

    # Strategy C: nested font with size >= 5
    font_node_ids = set(index.by_tag.get("font", []))
    for nid in color_nodes:
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        if not is_in_centered_context(nid, index):
            continue
        # Skip if node itself has size >= 5 (already handled by Strategy B)
        size_attr = index.attrs_by_id.get(nid, {}).get("size")
        if size_attr and int(size_attr) >= 5:
            continue

        # Search children for nested font with size >= 5
        for child_id in index.children_map.get(nid, []):
            if child_id not in font_node_ids:
                continue
            child_size = int(index.attrs_by_id.get(child_id, {}).get("size", "0"))
            if child_size >= 5:
                child_text = index.text_by_id.get(child_id, "").strip()
                if 0 < len(child_text) < 80:
                    descendants = _all_descendants(nid, index.children_map)
                    territory.claim_subtree(nid, descendants)
                    return child_text

    return None


# ── Pass 2: Metadata ────────────────────────────────────────────────


def pass2_metadata(
    index: DOMIndex, territory: Territory
) -> dict[str, str] | None:
    """Extract metadata (dynasty, author) from DOM.

    Strategy (JS extractors.mjs:373-396):
    1. class=metadata nodes with METADATA_RE match
    2. Fallback: all text nodes with METADATA_RE match
    """
    # Strategy 1: class=metadata
    for nid in index.by_class.get("metadata", []):
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        text = index.text_by_id.get(nid, "").strip()
        match = METADATA_RE.search(text)
        if match:
            territory.claim_leaf(nid)
            return {"dynasty": match.group(1), "author": match.group(2)}

    # Strategy 2: fallback to all text nodes
    for nid in index.all_text_nodes:
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        text = index.text_by_id.get(nid, "").strip()
        match = METADATA_RE.search(text)
        if match:
            territory.claim_leaf(nid)
            return {"dynasty": match.group(1), "author": match.group(2)}

    return None


# ── Pass 3: Chapter Title ───────────────────────────────────────────


def pass3_chapter_title(
    index: DOMIndex, territory: Territory
) -> list[dict]:
    """Extract chapter-title nodes from DOM.

    Strategy (JS extractors.mjs:408-453):
    1. class=chapter
    2. class=section
    3. color=#CC33CC + tag in [B, FONT, DIV, SPAN]
    4. h2/h3/h4 + centered
    """
    chapters: list[dict] = []

    def try_claim(nid: int) -> bool:
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            return False
        text = index.text_by_id.get(nid, "").strip()
        # Same whitespace normalization as JS: .replace(/\s+/g, "")
        normalized = "".join(text.split())
        if not normalized or len(normalized) >= 80:
            return False
        descendants = _all_descendants(nid, index.children_map)
        territory.claim_subtree(nid, descendants)
        chapters.append({"title": text, "node_id": nid})
        return True

    # 1. class=chapter
    for nid in index.by_class.get("chapter", []):
        try_claim(nid)

    # 2. class=section
    for nid in index.by_class.get("section", []):
        try_claim(nid)

    # 3. color=#CC33CC + tag in [B, FONT, DIV, SPAN]
    valid_tag_ids: set[int] = set()
    for tag in ("b", "font", "div", "span"):
        valid_tag_ids.update(index.by_tag.get(tag, []))
    for nid in index.by_color.get("#CC33CC", []):
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        if nid in valid_tag_ids:
            try_claim(nid)

    # 4. h2/h3/h4 + centered
    for tag in ("h2", "h3", "h4"):
        for nid in index.by_tag.get(tag, []):
            if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
                continue
            if is_in_centered_context(nid, index):
                try_claim(nid)

    return chapters


# ── Pass 4: Annotation ──────────────────────────────────────────────


def pass4_annotation(
    index: DOMIndex, territory: Territory
) -> list[dict]:
    """Extract annotation nodes from DOM.

    Mirrors JS pass4Annotation() from extractors.mjs:470-517.
    Three strategies in order:
    1. Class-based: annotation, reference, notes
    2. Style-based: FONT-SIZE: 9pt on font elements
    3. Style-based: FONT-SIZE: 10pt + color=#551A8B on font+span elements

    Uses claim_leaf (not claim_subtree) — annotation nodes are leaf text
    nodes (span, font), not containers with nested structure.
    """
    annotations: list[dict] = []

    def try_claim(nid: int) -> bool:
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            return False
        text = index.text_by_id.get(nid, "").strip()
        if not text:
            return False
        territory.claim_leaf(nid)
        # Also claim text children so extract_remaining excludes them
        for child_id in index.children_map.get(nid, []):
            territory.claim_leaf(child_id)
        annotations.append({"text": text, "node_id": nid})
        return True

    # Strategy 1: Class-based — annotation, reference, notes
    for cls in ("annotation", "reference", "notes"):
        for nid in index.by_class.get(cls, []):
            try_claim(nid)

    # Strategy 2: FONT-SIZE: 9pt on font elements
    for nid in index.by_tag.get("font", []):
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        attrs = index.attrs_by_id.get(nid, {})
        style = attrs.get("style", "")
        if style and FONT_SIZE_9PT_RE.search(style):
            try_claim(nid)

    # Strategy 3: FONT-SIZE: 10pt + color=#551A8B on font+span
    # Check both color attribute AND style string for the color
    for nid in index.by_tag.get("font", []) + index.by_tag.get("span", []):
        if territory.is_claimed(nid) or territory.has_claimed_ancestor(nid, index.parent_map):
            continue
        attrs = index.attrs_by_id.get(nid, {})
        style = attrs.get("style", "")
        if not style or not FONT_SIZE_10PT_RE.search(style):
            continue
        color = attrs.get("color", "")
        if COLOR_551A8B_RE.search(color) or COLOR_551A8B_RE.search(style):
            try_claim(nid)

    return annotations
