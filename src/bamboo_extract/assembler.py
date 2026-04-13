"""assemble_results state machine for bamboo-extract.

Replaces dummy chapter assembly with proper section splitting,
annotation association, and chapter boundary detection.

Mirrors JS extractors.mjs:671-880 assembleResults.
"""

from __future__ import annotations

from .regex_patterns import END_MARKER_RE, SECTION_SUMMARY_RE
from .territory import Territory
from .types import Annotation, Chapter, ContentIR, DOMIndex, Section


def assemble_results(
    index: DOMIndex,
    annotations: list[dict],
    chapter_title_nodes: set[int],
    territory: Territory,
    ir: ContentIR,
) -> list[Chapter]:
    """Walk DOM, split sections, associate annotations, build chapters.

    Does NOT consume extract_remaining output — does its own DOM walk,
    matching JS behavior where textRegions parameter is dead code.
    """
    past_end_marker = False
    current_chapter: dict = {"title": "", "sections": []}
    current_text = ""
    current_annotations: list[Annotation] = []

    # Build annotation lookup: node_id -> [Annotation]
    annotation_by_node: dict[int, list[Annotation]] = {}
    for ann in annotations:
        nid = ann["node_id"]
        ann_obj = Annotation(text=ann["text"])
        if nid not in annotation_by_node:
            annotation_by_node[nid] = []
        annotation_by_node[nid].append(ann_obj)

    # Build tag lookup: for element node_ids, we need to know their tag.
    # We can derive this from by_tag — build a reverse map.
    tag_by_id: dict[int, str] = {}
    for tag, ids in index.by_tag.items():
        for nid in ids:
            tag_by_id[nid] = tag

    def flush_text() -> Section | None:
        """Flush accumulated text as a section.

        Checks section-summary (anchored at start), end-marker, colophon,
        and normal main-text patterns.
        """
        nonlocal current_text, current_annotations
        trimmed = current_text.strip()
        if not trimmed:
            return None

        # Check for end-marker first — it can appear anywhere in the text
        end_match = END_MARKER_RE.search(trimmed)
        if end_match:
            nonlocal past_end_marker
            past_end_marker = True
            before = END_MARKER_RE.sub("", trimmed).strip()
            current_text = ""
            # Text before the marker is main-text; if nothing before,
            # the entire text is still treated as main-text (the 終 marks
            # the end of the main body, not a separate section).
            content = before if before else trimmed
            section = Section(type="main-text", content=content)
            if current_annotations:
                section.annotations = list(current_annotations)
                current_annotations = []
            return section

        # Section-summary: anchored at start
        if SECTION_SUMMARY_RE.search(trimmed):
            current_text = ""
            return Section(type="section-summary", content=trimmed)

        if past_end_marker:
            current_text = ""
            return Section(type="colophon", content=trimmed)

        # Normal main-text
        current_text = ""
        section = Section(type="main-text", content=trimmed)
        if current_annotations:
            section.annotations = list(current_annotations)
            current_annotations = []
        return section

    def push_section(section: Section) -> None:
        current_chapter["sections"].append(section)

    def flush_chapter() -> None:
        nonlocal current_chapter, current_annotations
        section = flush_text()
        if section:
            push_section(section)

        # Flush remaining annotations to last main-text section
        if current_annotations:
            sections = current_chapter["sections"]
            if sections:
                last = sections[-1]
                if last.type == "main-text":
                    last.annotations.extend(current_annotations)
                else:
                    sections.append(
                        Section(
                            type="main-text",
                            content="",
                            annotations=list(current_annotations),
                        )
                    )
            current_annotations = []

        if current_chapter["sections"] or current_chapter["title"]:
            ir.chapters.append(
                Chapter(
                    title=current_chapter["title"],
                    sections=current_chapter["sections"],
                )
            )
        current_chapter = {"title": "", "sections": []}

    def _all_descendants(node_id: int) -> list[int]:
        result: list[int] = []
        stack = list(index.children_map.get(node_id, []))
        while stack:
            cid = stack.pop()
            result.append(cid)
            stack.extend(index.children_map.get(cid, []))
        return result

    def _has_chapter_title_descendant(node_id: int) -> bool:
        return any(desc_id in chapter_title_nodes for desc_id in _all_descendants(node_id))

    def _collect_text_from_unclaimed_descendants(node_id: int) -> str:
        """Walk descendants, collect text from unclaimed leaf text nodes.

        Matching JS $clone.text() — excludes claimed nodes.
        Only collects from leaf text nodes (node_ids in text_by_id but NOT
        in children_map, i.e., not element containers).
        """
        parts: list[str] = []

        def _walk(nid: int) -> None:
            for cid in index.children_map.get(nid, []):
                if territory.is_claimed(cid) or territory.has_claimed_ancestor(
                    cid, index.parent_map
                ):
                    continue
                if cid in index.children_map:
                    # Element node — recurse
                    _walk(cid)
                elif cid in index.text_by_id:
                    # Text node
                    text = index.text_by_id.get(cid, "").strip()
                    if text:
                        parts.append(text)

        _walk(node_id)
        return " ".join(parts)

    def collect_annotations_for_node(node_id: int) -> None:
        """Collect annotations whose node is node_id or a descendant."""
        nonlocal current_annotations
        for ann_nid, anns in annotation_by_node.items():
            # Check if ann_nid == node_id or ann_nid is descendant of node_id
            current: int | None = ann_nid
            while current is not None:
                if current == node_id:
                    current_annotations.extend(anns)
                    break
                current = index.parent_map.get(current)

    def process_element(node_id: int) -> None:
        nonlocal current_text

        # Skip claimed nodes (but check for chapter titles and annotations)
        if territory.is_claimed(node_id):
            if node_id in chapter_title_nodes:
                s = flush_text()
                if s:
                    push_section(s)
                flush_chapter()
                title_text = index.text_by_id.get(node_id, "").strip()
                if title_text:
                    current_chapter["title"] = "".join(title_text.split())
            # Also collect annotations from claimed nodes (e.g., annotation
            # elements at root level that sit between content elements)
            collect_annotations_for_node(node_id)
            return

        # Skip nodes under claimed ancestors
        if territory.has_claimed_ancestor(node_id, index.parent_map):
            return

        tag = tag_by_id.get(node_id, "").upper()

        # H2/H3/H4 → chapter boundary
        if tag in ("H2", "H3", "H4"):
            section = flush_text()
            if section:
                push_section(section)
            title_text = index.text_by_id.get(node_id, "").strip()
            if title_text:
                flush_chapter()
                current_chapter["title"] = "".join(title_text.split())
            return

        # BR → paragraph break
        if tag == "BR":
            section = flush_text()
            if section:
                push_section(section)
            return

        # PRE → formatted text
        if tag == "PRE":
            pre_text = index.text_by_id.get(node_id, "").strip()
            paragraphs = [p.strip() for p in pre_text.split("\n\n") if p.strip()]
            for para in paragraphs:
                if current_text:
                    current_text += " " + para
                else:
                    current_text = para
            flush_text()
            return

        # Check for chapter title descendant
        if _has_chapter_title_descendant(node_id):
            collect_annotations_for_node(node_id)
            for cid in index.children_map.get(node_id, []):
                process_element(cid)
            return

        # Collect annotations from this node's subtree
        collect_annotations_for_node(node_id)

        # Accumulate text from unclaimed descendants, then flush immediately.
        # Each element's text is classified independently — section-summary
        # and end-marker patterns are anchored and would be lost if text
        # accumulates across elements.
        #
        # For text nodes (root-level, not in attrs_by_id), collect their
        # own text directly since they have no descendants to walk.
        if node_id not in index.attrs_by_id and node_id in index.text_by_id:
            text = index.text_by_id.get(node_id, "").strip()
        else:
            text = _collect_text_from_unclaimed_descendants(node_id)
        if text and len(text) > 1:
            if current_text:
                current_text += " " + text
            else:
                current_text = text

        # Flush accumulated text as a section after processing this element.
        # This ensures each element's text gets classified independently.
        section = flush_text()
        if section:
            push_section(section)

    # ── Root element selection ─────────────────────────────────────
    # The DOM index starts from body children (body itself is not indexed).
    # Root elements are body's direct children — node_ids that appear as
    # keys in children_map (element containers) or in text_by_id without
    # a parent in parent_map.
    # Since body children are indexed with parent_id=None, we find them
    # by looking for top-level element node_ids (those in children_map
    # whose parent is not set, or those in text_by_id without parent).

    # Find swy1 class among indexed elements
    swy1_ids = index.by_class.get("swy1", [])
    direct_swy1 = None
    for sid in swy1_ids:
        if sid not in index.parent_map:
            direct_swy1 = sid
            break

    # Find all root-level element IDs (top-level elements with no parent)
    root_ids: list[int] = []
    for nid in index.attrs_by_id:
        if nid not in index.parent_map:
            root_ids.append(nid)
    # Also check text-only root nodes
    for nid in index.text_by_id:
        if nid not in index.parent_map and nid not in index.attrs_by_id:
            root_ids.append(nid)

    # Sort by node_id to maintain DOM order
    root_ids.sort()

    root_children = (
        index.children_map.get(direct_swy1, [])
        if direct_swy1
        else root_ids
    )

    for child_id in root_children:
        process_element(child_id)

    flush_chapter()

    # Filter empty chapters
    ir.chapters = [ch for ch in ir.chapters if ch.sections or ch.title]

    # Always return at least one chapter
    if not ir.chapters:
        ir.chapters = [Chapter(title="", sections=[])]

    return ir.chapters
