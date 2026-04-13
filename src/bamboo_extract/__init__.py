"""bamboo-extract — Ancient Chinese text extraction module."""

from .catalog_detect import detect_catalog, extract_nav_items
from .dom_index import build_dom_index
from .normalize import normalize_html
from .passes import (
    extract_title,
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
    pass4_annotation,
)
from .regex_patterns import METADATA_RE
from .rules import classify_by_attributes
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
    "extract_title",
    "detect_catalog",
    "extract_nav_items",
    "pass1_book_title",
    "pass2_metadata",
    "pass3_chapter_title",
    "pass4_annotation",
    "classify_by_attributes",
]


def extract(html: str, source_path: str = "") -> ContentIR:
    """Extract content from HTML and return ContentIR.

    Pipeline:
    1. normalize_html — center/table/empty tag handling
    2. build_dom_index — by_color/class/tag/size + text_by_id/attrs_by_id
    3. detect_catalog — catalog vs content path decision
    4a. Catalog path: navItems from <a> elements, metadata from body text
    4b. Content path: extract_title → Pass 1-4 → Territory remaining
    """
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()

    # ── Catalog path ─────────────────────────────────────────────
    if detect_catalog(index):
        nav_items = [
            NavItem(href=item["href"], label=item["label"])
            for item in extract_nav_items(index)
        ]

        # Try to extract metadata from body text
        dynasty: str | None = None
        author: str | None = None
        for nid in index.all_text_nodes:
            text = index.text_by_id.get(nid, "").strip()
            match = METADATA_RE.search(text)
            if match:
                dynasty = match.group(1)
                author = match.group(2)
                break

        return ContentIR(
            title=extract_title(html, index),
            source=source_path or None,
            docType="catalog",
            dynasty=dynasty,
            author=author,
            chapters=[],
            navItems=nav_items,
        )

    # ── Content path ─────────────────────────────────────────────

    # Pre-pass: title from <title> tag / <h1> / color scan
    title = extract_title(html, index)

    # Pass 1: book-title (territorial, overrides pre-pass if found)
    pass1_result = pass1_book_title(index, territory)
    if pass1_result:
        title = pass1_result

    # Pass 2: metadata (dynasty, author)
    metadata = pass2_metadata(index, territory)
    dynasty = metadata["dynasty"] if metadata else None
    author = metadata["author"] if metadata else None

    # Pass 3: chapter titles
    chapter_titles = pass3_chapter_title(index, territory)

    # Pass 4: annotations (claims annotation nodes from territory)
    # Side effect: annotation nodes are claimed; return value wired in Phase 6
    _annotations = pass4_annotation(index, territory)

    # Territory: collect remaining unclaimed text
    text_content = {nid: node_text for nid, node_text in _collect_text(index)}
    remaining = territory.extract_remaining(index.all_text_nodes, text_content)

    # Build chapters: one chapter per chapter_title, remaining as main-text
    chapters: list[Chapter] = []
    for ch_info in chapter_titles:
        chapters.append(Chapter(title=ch_info["title"], sections=[]))

    # Remaining text as section(s)
    if remaining:
        if chapters:
            # Attach remaining text to last chapter
            sections = [Section(type=r["type"], content=r["content"]) for r in remaining]
            chapters[-1].sections.extend(sections)
        else:
            # No chapters — put all remaining text in one default chapter
            sections = [Section(type=r["type"], content=r["content"]) for r in remaining]
            chapters = [Chapter(title="", sections=sections)]

    # Always return at least one chapter
    if not chapters:
        chapters = [Chapter(title="", sections=[])]

    return ContentIR(
        title=title,
        source=source_path or None,
        docType="content",
        dynasty=dynasty,
        author=author,
        chapters=chapters,
        navItems=[],
    )


def _collect_text(index: DOMIndex) -> list[tuple[int, str]]:
    """Collect text content for all text node IDs from index.text_by_id.

    Phase 4: build_dom_index populates text_by_id for every text node,
    so no re-parsing is needed.
    """
    result: list[tuple[int, str]] = []
    for nid in index.all_text_nodes:
        text = index.text_by_id.get(nid, "").strip()
        if text:
            result.append((nid, text))
    return result
