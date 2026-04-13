---
title: 'feat: Phase 5 — Pass 4 annotation + Pass 9 main-text (Unit 1c)'
type: feat
status: active
date: 2026-04-12
origin: docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md
---

# feat: Phase 5 — Pass 4 annotation + Pass 9 main-text (Unit 1c)

## Overview

Phase 4 (Pass 1-3 + rules + catalog detect) is complete. The pipeline currently runs: `normalize_html() → build_dom_index() → extract_title() → Pass 1 → Pass 2 → Pass 3 → Territory.extract_remaining() → dummy ContentIR`.

Phase 5 adds **Pass 4 (annotation)** and **Pass 9 (main-text)**. Pass 4 identifies annotation nodes (小字注, reference, notes) and claims them from the territory. Pass 9 is already partially working via `territory.extract_remaining()` — the key question is verifying that once Pass 4 claims annotations, the remaining text correctly represents main-text. After this phase, `extract()` returns ContentIR with annotations properly collected and main-text separated from annotation text.

**Branch**: `feat/python-extraction-poc`

## Problem Frame

Currently the pipeline collects all remaining unclaimed text as main-text, but annotation nodes (注释文字) are not claimed by any pass — they leak into main-text. Pass 4 fixes this by claiming annotation nodes before main-text collection. This is a vertical slice: one new territorial pass + verification that the existing remaining-text collection works correctly once annotations are claimed.

## Requirements Trace

From phased delivery plan (006):
- R8: 领地式 Pass 架构 — Pass 4 extends the territorial pass chain
- R15: 完整数据流程 — annotations now flow through the pipeline

JS Unit 1c 验收门:
- Template F HTML → 提取 15 sections with annotations
- Template G HTML → 0 annotations, pure main-text
- Edge case: 注疏嵌套在正文中（夹注），正确剥离
- Integration: Pass 4 认领后，Pass 9 的剩余文本正确归入 main-text
- 真实文件产出 ≥15 annotations

## Scope Boundaries

- **In scope**: pass4_annotation function, extract() pipeline wiring to include Pass 4, verify extract_remaining for main-text
- **Out of scope**: Pass 5-8 (assemble_results), Pass 10 (quality), CLI changes, 9000+ full validation
- **Out of scope**: Annotation association with text regions (section-level mapping) — that is assemble_results work in Phase 6

## Key Technical Decisions

- **D1: pass4_annotation returns list of Annotation objects, not raw text**: Matching the JS return type `Array<{text, sourceNode}>`, the Python version returns `list[dict]` with `text` and `node_id`. The `Annotation` Pydantic model already exists in types.py — Pass 4 populates it.
- **D2: claim_leaf, not claim_subtree**: JS pass4Annotation uses `claimLeaf(node)` for each annotation node. This is correct because annotation nodes are leaf text nodes (span, font), not containers with nested structure. Pass 4 uses `territory.claim_leaf(nid)`.
- **D3: Strategy order matches JS exactly**: 1) class-based scan (annotation/reference/notes), 2) FONT-SIZE: 9pt on font elements, 3) FONT-SIZE: 10pt + color=#551A8B on font+span elements. No centered-context requirement for Pass 4 (unlike Pass 1-3).
- **D4: Pass 9 needs no new code**: `territory.extract_remaining()` already exists and works. The only change is calling it after Pass 4 instead of after Pass 3 — the annotations claimed by Pass 4 will naturally be excluded from remaining text.

## Implementation Units

- [ ] **Unit 5.1: pass4_annotation territorial extraction**

**Goal:** `pass4_annotation(index, territory) -> list[dict]` — returns list of {text, node_id} for each annotation node claimed.

**Dependencies:** Phase 4 complete (DOMIndex populated with text_by_id, attrs_by_id, by_class, by_color, by_tag)

**Files:**
- Modify: `src/bamboo_extract/passes.py` (add pass4_annotation function)
- Modify: `src/bamboo_extract/__init__.py` (export pass4_annotation)
- Test: `tests/test_extractors.py` (add Pass 4 test cases)

**Approach** (exact JS equivalent, `scripts/lib/extractors.mjs:470-517`):

1. Strategy 1: class-based scan — iterate `by_class["annotation"]`, `by_class["reference"]`, `by_class["notes"]` → for each unclaimed node with non-empty text → `claim_leaf` → collect {text, node_id}
2. Strategy 2: FONT-SIZE: 9pt — scan `by_tag["font"]` → unclaimed nodes → check style attr for `FONT-SIZE:\s*9pt` → claim_leaf → collect
3. Strategy 3: FONT-SIZE: 10pt + color=#551A8B — scan `by_tag["font"]` + `by_tag["span"]` → unclaimed nodes → check style for `FONT-SIZE:\s*10pt` AND color=#551A8B (in color attr or style) → claim_leaf → collect
4. Return list of {text, node_id}

Each strategy uses the same `try_claim` helper pattern: check territory → get text → skip if empty → claim_leaf → append to results.

**Patterns to follow:**
- JS `extractors.mjs:470-517` — pass4Annotation
- Same `try_claim` pattern as pass3_chapter_title (check territory, get text, claim, collect)
- Use regex_patterns.py constants for FONT_SIZE_9PT_RE, FONT_SIZE_10PT_RE, COLOR_551A8B_RE

**Test scenarios:**
- Happy path: class="annotation" node → claimed, text collected
- Happy path: class="reference" node → claimed, text collected
- Happy path: class="notes" node → claimed, text collected
- Happy path: `<font style="FONT-SIZE: 9pt">小字注</font>` → claimed via style scan
- Happy path: `<font style="FONT-SIZE: 10pt" color="#551A8B">紫注</font>` → claimed via color+style scan
- Happy path: `<span style="FONT-SIZE: 10pt; color:#551A8B">夹注</span>` → claimed via span scan
- Edge case: already claimed by Pass 1-3 → skip (territory isolation)
- Edge case: annotation inside claimed ancestor → skip (has_claimed_ancestor check)
- Edge case: empty text node → skip (no text to collect)
- Edge case: no annotations in HTML → return empty list (Template G scenario)
- Integration: Template F → ≥15 annotations extracted

**Verification:**
- `pytest tests/test_extractors.py` Pass 4 tests pass
- Template F fixture → pass4_annotation returns ≥15 items
- Template G fixture → pass4_annotation returns []

- [ ] **Unit 5.2: Wire Pass 4 into extract() pipeline**

**Goal:** Update `extract()` to run Pass 4 between Pass 3 and territory collection. Collect annotation list (not yet wired into IR — Phase 6 handles that).

**Dependencies:** Unit 5.1 complete

**Files:**
- Modify: `src/bamboo_extract/__init__.py` (wire Pass 4 into pipeline)

**Approach:**
- Current pipeline: `Pass 1 → Pass 2 → Pass 3 → extract_remaining → build chapters`
- New pipeline: `Pass 1 → Pass 2 → Pass 3 → Pass 4 → extract_remaining → build chapters`
- Pass 4 runs after Pass 3, before `_collect_text` / `extract_remaining`
- Annotations are collected but NOT yet added to ContentIR — the IR model has no `annotations` field. Phase 6 (assemble_results) will add the field and wire annotations into sections. For Phase 5, pass4_annotation results are collected in extract() and verified via tests, but the final IR output does not yet include them.
- The existing `_collect_text` → `extract_remaining` → chapter building logic remains unchanged — the only difference is that annotation nodes are now claimed, so they won't appear in remaining text

**Test scenarios:**
- Happy path: full pipeline with annotations → annotations claimed, not in remaining text
- Happy path: full pipeline without annotations (Template G) → annotations=[], all text in remaining
- Integration: Pass 4 claimed nodes not in extract_remaining output (claim isolation)
- Edge case: real file (大学章句集注.htm) → ≥15 annotations, correct main-text

**Verification:**
- `pytest tests/` all pass (including Phase 1-4 tests)
- `uv run bamboo-extract template-f.html --output output.json` produces IR with annotations
- Template G → annotations empty, main-text complete

## Open Questions

### Resolved During Planning

- Pass 4 uses `claim_leaf` not `claim_subtree` — confirmed by JS source (line 479: `territory.claimLeaf(node)`)
- No centered-context check needed for Pass 4 — JS pass4Annotation has no `isInCenteredContext` guard
- Pass 9 needs no new implementation — `territory.extract_remaining()` already works; the change is purely in pipeline ordering

### Deferred to Implementation

- Annotation-to-section association: Phase 6 assemble_results will map annotations to their containing text regions. Phase 5 only collects the annotation list.
- Template F/G fixture text: JS tests use inline HTML fixtures. Python tests should use equivalent HTML strings or load from test fixture files.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| selectolax `node.text()` differs from cheerio `$node.text()` for annotation nodes | Compare output on Template F fixture; if differs, adjust whitespace normalization |
| Pass 4 claims nodes that should be main-text | Test against real files; verify annotation count matches JS output |
| Has-claimed-ancestor check misses edge cases where annotation is nested in a Pass 1-3 claimed container | Test with nested annotation inside book-title or chapter-title containers |

## Sources & References

- **Upstream Phase**: Phase 4 (Pass 1-3 + rules + catalog detect)
- **Downstream Phase**: Phase 6 (Pass 5-8 + assemble_results)
- **JS Reference**: `scripts/lib/extractors.mjs:470-517` — pass4Annotation
- **JS Reference**: `scripts/lib/extractors.mjs:1060-1070` — pipeline wiring (Pass 4 before assemble)
- **Phase Plan**: `docs/plans/2026-04-12-006-feat-python-extraction-phased-delivery-plan.md` Phase 5
- **Python passes.py**: `src/bamboo_extract/passes.py` — existing Pass 1-3 implementations
- **Python types.py**: `src/bamboo_extract/types.py` — Annotation Pydantic model
