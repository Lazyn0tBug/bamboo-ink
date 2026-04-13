---
title: 'feat: Phase 6 — Pass 8 + assemble_results (Unit 1d)'
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-002-python-extraction-module.md
---

# feat: Phase 6 — Pass 8 + assemble_results (Unit 1d)

## Overview

Phase 5 (Pass 4 annotation + Pass 9 main-text) is complete. The pipeline runs: `normalize_html() → build_dom_index() → extract_title() → Pass 1-4 → Territory.extract_remaining() → dummy chapter assembly`. Chapter assembly is a placeholder — it creates one `Chapter` per chapter_title and attaches all remaining text as a single `main-text` section to the last chapter, with no section splitting, annotation association, or colophon/end-marker detection.

Phase 6 replaces the dummy chapter assembly with a proper **assemble_results** state machine (JS reference: `extractors.mjs:671-880`). This adds:

1. **Pass 8 (nav-item)** — extract anchor links from menus, lists, and direct `<a>` elements
2. **assemble_results** — DOM walk with state machine: `flushText`, `flushChapter`, `processElement`, detecting section boundaries (SECTION_SUMMARY_RE, END_MARKER_RE), classifying sections (main-text, section-summary, colophon), and associating annotations with their containing sections
3. **Pipeline wiring** — full `extract()` pipeline: Pass 1-4 → Pass 8 → assemble_results (DOM walk) → ContentIR

After this phase, `extract()` produces Chapters with properly split Sections, annotations attached to their sections, and navItems for content pages that contain link lists.

**Branch**: `feat/python-extraction-poc`

## Requirements Trace

From phased delivery plan (006):
- R8: 领地式 Pass 架构 — Pass 8 extends the territorial pass chain
- R9: 段落级文本组装 — assemble_results replaces dummy chapter assembly
- R15: 完整数据流程 — full pipeline with section splitting and annotation association

JS Unit 1d 验收门:
- Template F HTML → sections split by `<BR>`, annotations associated with sections, section-summary detected
- Template G HTML → proper section splitting, no annotations
- Edge case: end-marker detection (`終`) splits pre/post colophon
- Edge case: annotations inside chapter containers associated with correct section
- Integration: full extract() pipeline produces IR matching JS output for sections + annotations

## Scope Boundaries

- **In scope**: pass8_navItem, assemble_results state machine, extract() pipeline wiring, section type classification
- **Out of scope**: Pass 10 (quality checks), CLI changes, 9000+ full validation
- **Out of scope**: Annotation metadata enrichment (source_node tracking beyond node_id)

## Key Technical Decisions

- **D1: Pass 5-7 are not separate functions**: In the JS implementation, section-summary, end-marker, and colophon detection happen inside `assembleResults.flushText()` as text classification — not as separate territorial passes. The Python implementation follows the same pattern: `flushText` classifies text using `SECTION_SUMMARY_RE` and `END_MARKER_RE` (already in regex_patterns.py). No pass5/pass6/pass7 functions needed.
- **D2: assemble_results uses index-based DOM traversal, not cheerio `$()`**: JS uses `$().contents()`, `$().find()`, `$().clone()`, `$().text()`. Python uses `children_map` for children iteration, `text_by_id` for text collection, and territory checks to skip claimed nodes. No cheerio equivalent needed — the index provides all necessary traversal capability.
- **D3: Annotation association via node_id mapping**: JS uses `sourceNode` object references in a Map for annotation lookup. Python uses `node_id` integers as keys — `annotation_by_node: dict[int, list[str]]` mapping annotation node IDs to their text. `collect_annotations_from_descendants` walks the annotation list and checks parent_map ancestry.
- **D4: processElement replaces cheerio `.contents().each()` recursion**: Python `process_element(node_id)` walks via `children_map` for recursion, checking territory.is_claimed and has_claimed_ancestor before processing each node. H2/H3/H4 serve as chapter boundaries even when not claimed by Pass 3.
- **D5: Section types use string literals, not enum**: Following existing Section.type convention ("main-text", "section-summary", "colophon"). No new enum type needed.

## Implementation Units

- [ ] **Unit 6.1: pass8_navItem territorial extraction**

**Goal:** `pass8_nav_item(index, territory, ir) -> None` — writes nav items directly to `ir.navItems`. Side effect: claims nav nodes from territory.

**Dependencies:** Phase 4 complete (by_tag, by_class, children_map, text_by_id)

**Files:**
- Create: `src/bamboo_extract/passes.py` already exists, add `pass8_nav_item` function
- Modify: `src/bamboo_extract/__init__.py` (export pass8_nav_item)
- Test: `tests/test_extractors.py` (add Pass 8 test cases)

**Approach** (JS reference: `extractors.mjs:533-586`):
1. Strategy 1: menu-context — iterate `by_class["menu"]` → unclaimed → find `<a>` children via children_map walk → collect {href, label} where href non-empty and len(label) < 50 → claim_subtree → append to ir.navItems
2. Strategy 2: list-context — iterate `by_tag["ol"]` + `by_tag["ul"]` → unclaimed → find `<a>` children → same collection → claim_subtree → append to ir.navItems
3. Strategy 3: direct anchors — iterate `by_tag["a"]` → unclaimed and no claimed ancestor → href non-empty and len(text) < 50 → claim_leaf → append to ir.navItems
4. Returns None (writes to ir.navItems directly, matching JS pattern)

**Patterns to follow:**
- Same try_claim pattern as pass4_annotation
- Pass 8 is territorial — uses territory.is_claimed + has_claimed_ancestor checks
- For finding `<a>` children, walk children_map DFS (same as `_all_descendants` helper in passes.py)

**Test scenarios:**
- Happy path: menu with `<a>` links → navItems extracted
- Happy path: `<ol>`/`<ul>` with `<a>` links → navItems extracted
- Happy path: direct `<a href="...">` links → navItems extracted
- Edge case: links inside claimed containers → skipped (territory isolation)
- Edge case: links with empty href → skipped
- Edge case: links with label >= 50 chars → skipped
- Edge case: no links → empty list
- Integration: catalog HTML already handled by catalog_detect path; Pass 8 handles content pages with embedded nav links

**Verification:**
- `pytest tests/test_extractors.py` Pass 8 tests pass
- Catalog HTML → catalog_detect path (not Pass 8) still works

- [ ] **Unit 6.2: assemble_results state machine**

**Goal:** `assemble_results(index, annotations, chapter_title_nodes, territory) -> list[Chapter]` — returns list of Chapter objects with properly split sections.

**Dependencies:** Unit 6.1 complete (Pass 8 runs before assemble_results)

**Files:**
- Create: `src/bamboo_extract/assembler.py`
- Test: `tests/test_assembler.py`

**Approach** (JS reference: `extractors.mjs:671-880`):

`assemble_results` does a full DOM walk from body children (or swy1 container), collecting text from unclaimed nodes, detecting section boundaries, and building Chapter/Section structures. It does NOT consume `extract_remaining` output — the JS `textRegions` parameter is a dead argument never used in the function body.

**State:**
- `past_end_marker: bool` — tracks whether END_MARKER_RE has been seen
- `current_chapter: dict` — {title, sections}
- `current_text: str` — accumulated text buffer
- `current_annotations: list[dict]` — accumulated annotations for current section

**Core functions:**

`flush_text() -> Section | None`:
- If current_text trimmed is non-empty:
  - If SECTION_SUMMARY_RE matches → return Section(type="section-summary", content=trimmed)
  - If END_MARKER_RE matches → set past_end_marker=True, extract text before marker, return Section(type="main-text", content=before_marker)
  - If past_end_marker → return Section(type="colophon", content=trimmed)
  - Otherwise → return Section(type="main-text", content=trimmed)
- Reset current_text and current_annotations

`flush_chapter() -> Chapter | None`:
- Call flush_text
- If current_annotations remain → attach to last main-text section (or create empty main-text section)
- If chapter has sections or title → return Chapter
- Reset current_chapter

`collect_annotations_from_descendants(node_id)`:
- Walk annotation_by_node dict, check if annotation node is descendant of node_id via parent_map
- If yes → add annotation text to current_annotations

`process_element(node_id)`:
- Skip if claimed or has claimed ancestor (but check chapter_title_nodes for claimed nodes)
- If H2/H3/H4 → flush_text, flush_chapter, set current_chapter.title from text, return
- If BR → flush_text, return
- If PRE → collect text, flush_text, return
- If has chapter_title descendant → collect_annotations, recurse children
- Otherwise → collect_annotations, collect text from unclaimed child text nodes (walk children_map, gather text_by_id for unclaimed leaf text nodes), accumulate to current_text

**Text collection within process_element** (matching JS `$clone.text()` pattern):
- Walk descendants via children_map DFS
- For each text node: skip if claimed or has claimed ancestor
- Concatenate unclaimed text node values with space separator
- JS has `text.length > 1` guard — only accumulate if trimmed text length > 1

**Root element selection** (JS: `extractors.mjs:868-872`):
- Check for direct `body > div.swy1` → if present and body has single child, use swy1 contents
- Otherwise use body children

**Annotation association**:
- Build `annotation_by_node: dict[int, list[str]]` from annotations list
- In process_element, call `collect_annotations_from_descendants` to associate annotations with their containing section

**Patterns to follow:**
- JS `extractors.mjs:671-880` — assembleResults
- Territory pattern: process_element checks territory.is_claimed before processing
- Text collection: walk children_map DFS, collect text_by_id for unclaimed leaf text nodes (matching JS `$clone.text()` pattern)

**Test scenarios:**
- Happy path: text with `<BR>` separators → multiple sections split
- Happy path: section-summary text ("右傳之首章") → section type "section-summary"
- Happy path: end-marker text ("經終") → splits into main-text before marker, colophon after
- Happy path: annotations between text blocks → associated with preceding main-text section
- Happy path: chapter title node → flushes current chapter, starts new one
- Edge case: empty text → no section created
- Edge case: colophon text after end marker → type "colophon"
- Edge case: annotations at chapter boundary → flushed with last section of previous chapter
- Edge case: H2/H3/H4 not claimed by Pass 3 → still serves as chapter boundary
- Edge case: claimed annotation text excluded from section text (clone + remove claimed)
- Integration: full chapter with title + sections + annotations → correct Chapter list

**Verification:**
- `pytest tests/test_assembler.py` all pass
- Template F → sections match JS output count and content
- Template G → sections match JS output count and content

- [ ] **Unit 6.3: Wire assemble_results into extract() pipeline**

**Goal:** Replace dummy chapter assembly in `extract()` with Pass 8 → assemble_results → ContentIR.

**Dependencies:** Units 6.1 and 6.2 complete

**Files:**
- Modify: `src/bamboo_extract/__init__.py` (replace dummy chapter assembly)

**Approach:**
Current pipeline (content path):
```
Pass 1 → Pass 2 → Pass 3 → Pass 4 → extract_remaining → dummy chapter assembly → ContentIR
```

New pipeline:
```
Pass 1 → Pass 2 → Pass 3 → Pass 4 → Pass 8 → assemble_results → ContentIR
```

Changes:
1. Run pass8_nav_item after Pass 4 (claims nav nodes from territory)
2. Build chapter_title_nodes set from Pass 3 output (node_id set)
3. Call assemble_results(index, annotations, chapter_title_nodes, territory) — this does the full DOM walk, collects text from unclaimed nodes, splits sections, and builds chapters
4. Build ContentIR with chapters from assemble_results output
5. Pass 8 navItems → ir.navItems (for content pages that have embedded nav links)

**Note:** `extract_remaining` is NOT called before `assemble_results`. In the JS implementation, `territory.extractRemaining()` is called but its result (`textRegions`) is never used inside `assembleResults` — the function does its own DOM walk via `processElement`. The Python `assemble_results` follows the same pattern: territory tracks claimed nodes, and the DOM walk skips them during text collection. `extract_remaining` remains available for debugging/testing but is not part of the production pipeline.

**The catalog path remains unchanged** — detect_catalog still handles pure catalog pages.

**Test scenarios:**
- Happy path: Template F → title + metadata + chapters with sections + annotations
- Happy path: Template G → title + chapters with sections, no annotations
- Happy path: content page with embedded `<a>` links → navItems populated
- Integration: full pipeline section types match JS output
- Integration: annotations not in section.content (territory isolation verified)
- Edge case: no chapters found → single default chapter with all sections

**Verification:**
- `pytest tests/` all pass (including Phase 1-5 tests)
- Template F → section count and types match JS reference
- Template G → section count and types match JS reference

## Open Questions

### Resolved During Planning

- Pass 5-7 are not separate functions — section classification happens in flushText (matching JS architecture)
- assemble_results does its own DOM walk — does NOT consume extract_remaining output. JS `textRegions` parameter is dead code (passed but never used in function body). Python follows same pattern: territory tracks claimed nodes, DOM walk skips them.
- Annotation association uses node_id dict keys, not object references — matches Python territory pattern
- SECTION_SUMMARY_RE and END_MARKER_RE already exist in regex_patterns.py — no new regex needed
- Section.type already supports "main-text", "section-summary", "colophon" — no model changes needed
- Section.annotations already exists as `list[Annotation]` — no model changes needed
- process_element text collection: walk children_map DFS, collect text_by_id for unclaimed leaf nodes. JS has `text.length > 1` guard.

### Deferred to Implementation

- Exact section text normalization: JS uses `.trim()` and whitespace concatenation. Python may need to handle selectolax text() vs cheerio text() differences.
- Root element selection edge cases: JS has special handling for `body > div.swy1`. Python normalize already handles tables, but swy1 class detection may need adjustment.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| selectolax text() concatenation differs from cheerio text() for mixed-content elements | Compare output on Template F fixture; adjust whitespace joining if needed |
| Annotation-descendant check via parent_map may be slow for large documents | O(n*m) where n=annotations, m=depth. Pre-compute ancestor chains or use node_id range check if needed |
| process_element recursion depth on deeply nested DOM | Python recursion limit (1000). Unlikely for ancient text HTML but add safeguard if needed |
| Text collection from children_map DFS must match JS `$clone.text()` behavior | Test on Template F fixture with mixed-content elements (tables, nested fonts); compare section text output |
| Section splitting behavior differs from JS for edge cases (BR inside containers, empty sections) | Test against JS output on Template F/G fixtures; adjust flush_text boundaries |
| JS `territory.extractRemaining()` called but result unused in `assembleResults` — potential JS dead code | Python skips this call entirely. If JS relies on side effects, verify territory state is correct before/after assemble_results |

## Sources & References

- **Upstream Phase**: Phase 5 (Pass 4 annotation + Pass 9 main-text)
- **Downstream Phase**: Phase 7+ (Pass 10 quality checks, full validation)
- **JS Reference**: `scripts/lib/extractors.mjs:533-586` — pass8NavItem
- **JS Reference**: `scripts/lib/extractors.mjs:671-880` — assembleResults
- **JS Reference**: `scripts/lib/extractors.mjs:884-886` — SECTION_SUMMARY_RE, END_MARKER_RE
- **JS Reference**: `scripts/lib/extractors.mjs:1060-1070` — full pipeline wiring
- **Phase Plan**: `docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md` Phase 6
- **Python passes.py**: `src/bamboo_extract/passes.py` — existing Pass 1-4 implementations
- **Python regex**: `src/bamboo_extract/regex_patterns.py` — SECTION_SUMMARY_RE, END_MARKER_RE
- **Python types**: `src/bamboo_extract/types.py` — Section with annotations field
