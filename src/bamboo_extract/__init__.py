"""bamboo-extract — Ancient Chinese text extraction module."""

from .types import Annotation, Chapter, ContentIR, NavItem, Section

__all__ = ["ContentIR", "Chapter", "Section", "Annotation", "NavItem", "extract"]


def extract(html: str, source_path: str = "") -> ContentIR:
    """Extract content from HTML and return ContentIR.

    Dummy implementation — returns minimal valid IR structure.
    """
    return ContentIR(
        title="Untitled",
        source=source_path or None,
        docType="content",
        chapters=[Chapter(title="", sections=[])],
        navItems=[],
    )
