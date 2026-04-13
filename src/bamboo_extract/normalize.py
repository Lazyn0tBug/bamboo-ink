"""HTML normalization — center tag, table flattening, empty tag removal.

Mirrors JS normalizeHtml() from extractors.mjs:254-258 and
flattenTables() from pattern-cache.mjs:25-52.
"""

from __future__ import annotations

import re


def _replace_td(m: re.Match[str]) -> str:
    """Replace <td ...> with <div class="table-cell" ...>, merging class attrs."""
    attrs = m.group(1) or ""
    class_match = re.search(r'class=["\x27]([^"\x27]*)["\x27]', attrs, re.IGNORECASE)
    if class_match:
        existing = class_match.group(1)
        attrs = attrs.replace(class_match.group(0), f'class="table-cell {existing}"')
    else:
        attrs = ' class="table-cell"' + attrs
    return f"<div{attrs}>"


def flatten_tables(html: str) -> str:
    """Replace <td> with <div class="table-cell">, unwrap table/tbody/tr.

    Mirrors the cheerio-based JS implementation using regex since
    selectolax does not support direct tag reassignment.
    """
    html = re.sub(r"<td\b([^>]*)>", _replace_td, html, flags=re.IGNORECASE)
    html = html.replace("</td>", "</div>")

    # Unwrap table, tbody, tr — remove tags but keep children
    for tag in ("table", "tbody", "tr"):
        html = re.sub(rf"<{tag}\b[^>]*>", "", html, flags=re.IGNORECASE)
        html = re.sub(rf"</{tag}>", "", html, flags=re.IGNORECASE)

    return html


# Tags to preserve when removing empty elements
_EMPTY_TAG_EXCEPTIONS = "br|hr|img|input|meta|link"

def normalize_html(html: str) -> str:
    """Normalize HTML for extraction pipeline.

    1. <center> → <div data-center="1">
    2. flattenTables — <td> → <div class="table-cell">, unwrap table/tbody/tr
    3. Remove empty tags (except br/hr/img/input/meta/link)
    """
    html = re.sub(r"<center\b", '<div data-center="1"', html, flags=re.IGNORECASE)
    html = re.sub(r"</center>", "</div>", html, flags=re.IGNORECASE)
    html = flatten_tables(html)
    html = re.sub(
        rf"<(?!{_EMPTY_TAG_EXCEPTIONS})([a-z]+)[^>]*>\s*</\1>",
        "",
        html,
        flags=re.IGNORECASE,
    )
    return html
