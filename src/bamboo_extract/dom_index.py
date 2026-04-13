"""DOM index builder for bamboo-extract.

Parses normalized HTML with selectolax, traverses body children
recursively, and builds lookup indices for Pass queries.

Mirrors JS buildDomIndex() from extractors.mjs:184-244.
"""

from __future__ import annotations

from selectolax.parser import HTMLParser

from .types import DOMIndex


def _normalize_color(color: str) -> str:
    """Normalize color to uppercase + expanded hex.

    '#F66' -> '#FF6666'
    '#abc' -> '#AABBCC'
    '#FF6666' -> '#FF6666' (no-op for already-expanded)
    """
    color = color.upper().strip()
    if color.startswith("#") and len(color) == 4:
        color = "#" + color[1] * 2 + color[2] * 2 + color[3] * 2
    return color


def build_dom_index(html: str) -> DOMIndex:
    """Build DOM index from normalized HTML.

    Returns a DOMIndex with by_color, by_class, by_tag, by_size,
    all_text_nodes, and parent_map populated from a single recursive
    traversal of the body element.
    """
    tree = HTMLParser(html)
    body = tree.body
    if body is None:
        return DOMIndex()

    index = DOMIndex()
    next_id = [0]  # mutable counter for recursive closure

    def _index_node(node, parent_id: int | None) -> None:
        node_id = next_id[0]
        next_id[0] += 1

        tag = node.tag

        # Skip comments
        if tag == "#comment":
            return

        # Text node
        if tag == "-text":
            index.all_text_nodes.append(node_id)
            if parent_id is not None:
                index.parent_map[node_id] = parent_id
            return

        # Element node — index by tag
        tag_lower = tag.lower()
        if tag_lower:
            index.by_tag.setdefault(tag_lower, []).append(node_id)

        # Index by color (normalized)
        attrs = node.attrs or {}
        if "color" in attrs:
            color = _normalize_color(attrs["color"])
            index.by_color.setdefault(color, []).append(node_id)

        # Index by class (split multi-class values)
        if "class" in attrs:
            classes = attrs["class"].strip().split()
            for cls in classes:
                index.by_class.setdefault(cls, []).append(node_id)

        # Index by size
        if "size" in attrs:
            index.by_size.setdefault(attrs["size"], []).append(node_id)

        # Record parent
        if parent_id is not None:
            index.parent_map[node_id] = parent_id

        # Recurse into children
        child = node.child
        while child is not None:
            _index_node(child, node_id)
            child = child.next

    # Start from body's direct children (matches JS $('body').contents())
    child = body.child
    while child is not None:
        _index_node(child, None)
        child = child.next

    return index
