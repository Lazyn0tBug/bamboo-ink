"""Catalog detection for bamboo-extract.

Detects catalog (table of contents) pages based on link count vs body text ratio.
Mirrors JS extractors.mjs:1007-1010.
"""

from __future__ import annotations

from .types import DOMIndex


def detect_catalog(index: DOMIndex) -> bool:
    """Detect if the HTML is a catalog (table of contents) page.

    Criteria (JS extractors.mjs:1010):
    - linkCount > 5 AND bodyText < 3000 characters (whitespace stripped)

    Returns True for catalog pages, False for content pages.
    """
    link_count = len(index.by_tag.get("a", []))
    body_text_len = sum(
        len("".join(index.text_by_id.get(nid, "").split()))
        for nid in index.all_text_nodes
    )
    return link_count > 5 and body_text_len < 3000


def extract_nav_items(index: DOMIndex) -> list[dict[str, str]]:
    """Extract nav items from <a> elements.

    Mirrors JS extractors.mjs:1020-1026.
    Each nav item: {href, label} where label length < 50.
    """
    items = []
    for nid in index.by_tag.get("a", []):
        attrs = index.attrs_by_id.get(nid, {})
        href = attrs.get("href", "")
        label = index.text_by_id.get(nid, "").strip()
        if href and label and len(label) < 50:
            items.append({"href": href, "label": label})
    return items
