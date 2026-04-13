"""Pre-compiled regex patterns for extraction pipeline.

Uses the `regex` module instead of built-in `re` to support Unicode
property escapes (``\\p{Han}``) for accurate CJK character matching
across Extension A/B/C/D/E/F/G, not just BMP Basic block.

All patterns are pre-compiled at import time. Import the constants
directly — do not re-compile at call sites.
"""

from __future__ import annotations

import regex

# ── Character Classes ────────────────────────────────────────────────

# Match any CJK Unified Ideograph (includes all Extension planes)
CJK_RE = regex.compile(r"\p{Han}")

# ── Text Pattern Classification (Phase 5) ────────────────────────────

# Metadata: extract dynasty and author from patterns like "漢·司馬遷"
# Captures: group 1 = dynasty, group 2 = author
METADATA_RE = regex.compile(r"\(?(\p{Han}{1,4})[·\.\-](\p{Han}+)[）)\s]?")

# Section summary: classical Chinese end-of-section markers
# e.g., "右傳之首章", "右經首章", "右傳之二章" (may use simplified or traditional)
SECTION_SUMMARY_RE = regex.compile(
    r"^右(?:[传傳]之(?:首|[一二三四五六七八九十]+)章|[经經](?:首|[一二三四五六七八九十]*)章)"
)

# End marker: text ending with 终/終
END_MARKER_RE = regex.compile(r"\p{Han}+[\s]*[終终]\s*$")

# ── Style Detection (Phase 4 DOM Index classification rules) ────────

# Centered text detection
TEXT_ALIGN_CENTER_RE = regex.compile(r"text-align\s*:\s*center", regex.IGNORECASE)

# Font size detection for annotation classification
FONT_SIZE_9PT_RE = regex.compile(r"FONT-SIZE:\s*9pt", regex.IGNORECASE)
FONT_SIZE_10PT_RE = regex.compile(r"FONT-SIZE:\s*10pt", regex.IGNORECASE)

# Color detection for specific annotation styles
COLOR_551A8B_RE = regex.compile(r"551A8B", regex.IGNORECASE)

# Font size capture: extract numeric pt value
FONT_SIZE_CAPTURE_RE = regex.compile(r"FONT-SIZE:\s*(\d+)pt", regex.IGNORECASE)

# Whitespace collapse — use str.split().join() instead when possible;
# this RE exists for cases where selective whitespace normalization is needed
WHITESPACE_COLLAPSE_RE = regex.compile(r"\s+")
