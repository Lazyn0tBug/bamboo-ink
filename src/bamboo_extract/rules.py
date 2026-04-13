"""Classification rules for bamboo-extract.

Equivalent to JS CLASSIFICATION_RULES used in pattern-cache.mjs and
the annotation/nav classification branches in extractors.mjs.

Provides classify_by_attributes() for rule-based node classification.
"""

from __future__ import annotations

from .regex_patterns import (
    COLOR_551A8B_RE,
    FONT_SIZE_9PT_RE,
    FONT_SIZE_10PT_RE,
)
from .types import DOMIndex


def classify_by_attributes(node_id: int, index: DOMIndex) -> str | None:
    """Classify a node based on its attributes.

    Checks rules in priority order (matching JS CLASSIFICATION_RULES):
    1. class=annotation/reference/notes → "annotation"
    2. FONT-SIZE: 9pt style → "annotation"
    3. FONT-SIZE: 10pt + color=#551A8B → "annotation"
    4. class=menu with a[href] children → "menu-context"
    5. ol/ul with li>a children → "list-context"
    6. standalone a[href] → "anchor-nav"

    Returns the first matching classification, or None.
    """
    attrs = index.attrs_by_id.get(node_id, {})
    tag = attrs.get("tag", "").lower()

    # 1. Class-based annotation detection
    cls = attrs.get("class", "")
    if cls:
        classes = cls.lower().split()
        if any(c in classes for c in ("annotation", "reference", "notes")):
            return "annotation"

    # 2. Style-based: FONT-SIZE: 9pt
    style = attrs.get("style", "")
    if style and FONT_SIZE_9PT_RE.search(style):
        return "annotation"

    # 3. Style-based: FONT-SIZE: 10pt + color=#551A8B
    color = attrs.get("color", "")
    if (
        style
        and FONT_SIZE_10PT_RE.search(style)
        and (COLOR_551A8B_RE.search(color) or COLOR_551A8B_RE.search(style))
    ):
        return "annotation"

    # 4. menu-context: class=menu with a[href] children
    if "menu" in cls.lower() if cls else False:
        children = index.children_map.get(node_id, [])
        for child_id in children:
            child_attrs = index.attrs_by_id.get(child_id, {})
            if child_attrs.get("tag", "").lower() == "a" and child_attrs.get("href"):
                return "menu-context"

    # 5. list-context: ol/ul with li>a children
    if tag in ("ol", "ul"):
        children = index.children_map.get(node_id, [])
        for child_id in children:
            child_attrs = index.attrs_by_id.get(child_id, {})
            if child_attrs.get("tag", "").lower() == "li":
                grandchildren = index.children_map.get(child_id, [])
                for gc_id in grandchildren:
                    gc_attrs = index.attrs_by_id.get(gc_id, {})
                    if gc_attrs.get("tag", "").lower() == "a" and gc_attrs.get("href"):
                        return "list-context"

    # 6. anchor-nav: standalone a[href]
    if tag == "a" and attrs.get("href"):
        return "anchor-nav"

    return None
