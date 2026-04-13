"""IR data models for bamboo-extract."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Annotation(BaseModel):
    text: str


class Section(BaseModel):
    type: str  # "main-text" | "section-summary" | "colophon"
    content: str
    annotations: list[Annotation] = Field(default_factory=list)


class Chapter(BaseModel):
    title: str
    sections: list[Section] = Field(default_factory=list)


class NavItem(BaseModel):
    href: str
    label: str


class ContentIR(BaseModel):
    title: str = "Untitled"
    source: str | None = None
    docType: str = "content"  # noqa: N815 — matches JS IR field name
    dynasty: str | None = None
    author: str | None = None
    chapters: list[Chapter] = Field(default_factory=list)
    navItems: list[NavItem] = Field(default_factory=list)  # noqa: N815 — matches JS IR field name
