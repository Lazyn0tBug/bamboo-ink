"""bamboo-extract — Ancient Chinese text extraction module."""

import logging
from pathlib import Path

from .assembler import assemble_results
from .catalog_detect import detect_catalog, extract_nav_items
from .dom_index import build_dom_index
from .jieba_plugin import JiebaNLPPlugin
from .meta_dict import KNOWN_DYNASTIES, MetaDictionary
from .nlp import NLPPlugin
from .nlp_service import NLPService
from .normalize import normalize_html
from .passes import (
    AnnotationEntry,
    ChapterTitleEntry,
    MetadataResult,
    extract_title,
    pass1_book_title,
    pass2_metadata,
    pass3_chapter_title,
    pass4_annotation,
    pass8_nav_item,
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

logger = logging.getLogger(__name__)

# Minimum number of dynasty-author pairs required for NLP to be useful.
# Below this threshold, is_dynasty() rarely matches, recognize_entities()
# returns empty, and the entire NLP layer silently degrades to regex-only.
_NLP_MIN_PAIRS = 50

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
    "pass8_nav_item",
    "assemble_results",
    "classify_by_attributes",
    "NLPService",
    "NLPPlugin",
    "JiebaNLPPlugin",
    "MetaDictionary",
    "MetadataResult",
    "ChapterTitleEntry",
    "AnnotationEntry",
]

# Package resource path
_PACKAGE_DIR = Path(__file__).parent


def _build_nlp_service() -> NLPService:
    """Initialize NLPService with meta_dict and JiebaNLPPlugin if available.

    If the loaded MetaDictionary has fewer than _NLP_MIN_pairs, the plugin
    is not registered — NLP is disabled to prevent silent degradation where
    is_dynasty() always returns False and the layer falls through to regex.
    """
    service = NLPService()
    meta_dict_path = _PACKAGE_DIR / "resources" / "meta_dict.json"
    if meta_dict_path.exists():
        meta_dict = MetaDictionary.load(meta_dict_path)
        service.set_meta_dict(meta_dict)
        if meta_dict.pair_count >= _NLP_MIN_PAIRS:
            service.set_plugin(JiebaNLPPlugin(meta_dict))
        else:
            logger.warning(
                "NLP plugin disabled: meta_dict has %d pairs (minimum %d). "
                "Falling back to regex-only metadata extraction.",
                meta_dict.pair_count,
                _NLP_MIN_PAIRS,
            )
    return service


def extract(html: str, source_path: str = "") -> ContentIR:
    """Extract content from HTML and return ContentIR.

    Pipeline:
    1. normalize_html — center/table/empty tag handling
    2. build_dom_index — by_color/class/tag/size + text_by_id/attrs_by_id
    3. detect_catalog — catalog vs content path decision
    4a. Catalog path: navItems from <a> elements, metadata from body text
    4b. Content path: extract_title → Pass 1-4 → Pass 8 → assemble_results
    """
    normalized = normalize_html(html)
    index = build_dom_index(normalized)
    territory = Territory()

    # Initialize NLP service (loads meta_dict + jieba plugin if available)
    nlp_service = _build_nlp_service()

    # ── Catalog path ─────────────────────────────────────────────
    if detect_catalog(index):
        nav_items = [
            NavItem(href=item["href"], label=item["label"])
            for item in extract_nav_items(index)
        ]

        # Try to extract metadata from body text with NLP validation
        dynasty: str | None = None
        author: str | None = None
        has_nlp = nlp_service.is_active
        for nid in index.all_text_nodes:
            text = index.text_by_id.get(nid, "").strip()
            match = METADATA_RE.search(text)
            if not match:
                continue
            if has_nlp:
                result = nlp_service.classify_short_text(match.group(0))
                if result.get("type") == "metadata":
                    dynasty = result["dynasty"]
                    author = result["author"]
                    break
                # NLP rejected — fall back to regex if dynasty is valid
                regex_dynasty = match.group(1).strip()
                if regex_dynasty in KNOWN_DYNASTIES:
                    dynasty = regex_dynasty
                    author = match.group(2).strip()
                    break
                # NLP rejected + unknown dynasty — continue
            else:
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

    # Pass 2: metadata (dynasty, author) — with optional NLP validation
    metadata = pass2_metadata(index, territory, nlp_service)
    dynasty = metadata["dynasty"] if metadata else None
    author = metadata["author"] if metadata else None

    # Pass 3: chapter titles
    chapter_titles = pass3_chapter_title(index, territory)
    chapter_title_nodes = {ch["node_id"] for ch in chapter_titles}

    # Pass 4: annotations (claims annotation nodes from territory)
    annotations = pass4_annotation(index, territory)

    # Pass 8: nav items (extracts navigation links)
    ir = ContentIR()
    pass8_nav_item(index, territory, ir)

    # Assemble: walk DOM, split sections, associate annotations, build chapters
    assemble_results(index, annotations, chapter_title_nodes, territory, ir)

    return ContentIR(
        title=title,
        source=source_path or None,
        docType="content",
        dynasty=dynasty,
        author=author,
        chapters=ir.chapters,
        navItems=ir.navItems,
    )
