"""Dynamic metadata dictionary from Catalog pages.

Builds a MetaDictionary from (dynasty, author) pairs extracted from Catalog
藏目页 HTML, supporting 4 different HTML formats. Used by NLPService for
classify_short_text entity validation in Pass 2.

4 Catalog HTML formats:
1. <font class="annotation">(朝代·作者)</font>
2. <FONT SIZE=-1 COLOR="#993300">(朝代·作者)</FONT>
3. <font size="2" color="#993300">(朝代·作者)</font>
4. &middot; entity in adjacent text — (朝代·作者) pattern
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from selectolax.parser import HTMLParser

from .regex_patterns import METADATA_RE

# Known dynasty names for validation during extraction.
# Used to reject non-metadata patterns like "(英译本)" that match the
# regex but are not actual dynasty-author pairs.
KNOWN_DYNASTIES = {
    "宋", "唐", "汉", "明", "清", "元", "晋", "南北朝", "隋", "五代",
    "北宋", "南宋", "秦", "周", "三国", "北魏", "东晋", "西晋",
}


@dataclass
class MetaDictionary:
    """Dynamic dictionary of dynasty-author pairs extracted from Catalog pages.

    Supports three lookups:
    - is_dynasty(text) — is this text a known dynasty name?
    - get_author_dynasty(author) — what dynasty does this author belong to?
    - dynasty_authors(dynasty) — which authors are known for this dynasty?
    """

    dynasties: set[str] = field(default_factory=set)
    """Set of dynasty names, e.g. {"宋", "汉", "唐"}."""

    authors: dict[str, str] = field(default_factory=dict)
    """author → dynasty mapping, e.g. {"苏轼": "宋"}."""

    dynasty_authors: dict[str, set[str]] = field(default_factory=dict)
    """dynasty → set of authors, e.g. {"宋": {"苏轼", "朱熹"}}."""

    def is_dynasty(self, text: str) -> bool:
        """Check if text is a known dynasty name."""
        return text in self.dynasties

    def is_author(self, text: str) -> bool:
        """Check if text is a known author name."""
        return text in self.authors

    def get_author_dynasty(self, author: str) -> str | None:
        """Look up the dynasty for a given author."""
        return self.authors.get(author)

    def get_dynasty_authors(self, dynasty: str) -> set[str]:
        """Get all known authors for a given dynasty."""
        return self.dynasty_authors.get(dynasty, set())

    @property
    def pair_count(self) -> int:
        """Number of unique (dynasty, author) pairs in the dictionary."""
        return len(self.authors)

    def validate_pair(self, dynasty: str, author: str) -> bool:
        """Check if dynasty is a known name and author is non-empty."""
        if not dynasty.strip() or not author.strip():
            return False
        return dynasty.strip() in KNOWN_DYNASTIES

    def add_pair(self, dynasty: str, author: str) -> None:
        """Add a (dynasty, author) pair to the dictionary."""
        dynasty = dynasty.strip()
        author = author.strip()
        if not dynasty or not author:
            return

        self.dynasties.add(dynasty)
        self.authors[author] = dynasty
        if dynasty not in self.dynasty_authors:
            self.dynasty_authors[dynasty] = set()
        self.dynasty_authors[dynasty].add(author)

    def save(self, path: str | Path) -> None:
        """Save the dictionary to JSON."""
        data = {
            "dynasties": sorted(self.dynasties),
            "authors": self.authors,
            "dynasty_authors": {
                k: sorted(v) for k, v in self.dynasty_authors.items()
            },
        }
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2))

    @classmethod
    def load(cls, path: str | Path) -> MetaDictionary:
        """Load the dictionary from JSON."""
        data = json.loads(Path(path).read_text())
        md = cls()
        md.dynasties = set(data.get("dynasties", []))
        md.authors = data.get("authors", {})
        md.dynasty_authors = {
            k: set(v) for k, v in data.get("dynasty_authors", {}).items()
        }
        return md


# ── Catalog HTML format extractors ────────────────────────────────────


def _extract_metadata_pairs(html: str) -> list[tuple[str, str]]:
    """Extract all (dynasty, author) pairs from a single Catalog HTML string.

    Uses METADATA_RE to scan text nodes that appear in metadata-like contexts.
    This is format-agnostic — it scans all text nodes and lets the regex
    find (dynasty·author) patterns, then validates dynasty against the
    KNOWN_DYNASTIES allowlist to reject non-metadata patterns.
    """
    pairs: list[tuple[str, str]] = []
    tree = HTMLParser(html)

    for node in tree.css("font, p, td, span, b"):
        text = node.text().strip()
        if not text:
            continue
        match = METADATA_RE.search(text)
        if match:
            dynasty = match.group(1).strip()
            author = match.group(2).strip()
            # Reject empty author or unknown dynasty (e.g., "(英译本)")
            if not author or dynasty not in KNOWN_DYNASTIES:
                continue
            pairs.append((dynasty, author))

    return pairs


def build_meta_dict(catalog_htmls: list[str]) -> MetaDictionary:
    """Build a MetaDictionary from a list of Catalog HTML strings.

    For each Catalog HTML, extract (dynasty, author) pairs from text nodes
    using METADATA_RE. All pairs are deduplicated and loaded into the
    MetaDictionary.

    Returns an empty dictionary if catalog_htmls is empty.
    """
    md = MetaDictionary()
    for html in catalog_htmls:
        pairs = _extract_metadata_pairs(html)
        for dynasty, author in pairs:
            md.add_pair(dynasty, author)
    return md
