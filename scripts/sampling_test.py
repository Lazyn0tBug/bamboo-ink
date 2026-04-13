"""Sampling test: run extract() on a random sample of 古籍/ files.

Reports success rate, common failure patterns, and representative outputs.
"""

import random
import traceback
from collections import Counter, defaultdict
from pathlib import Path

from bamboo_extract import extract
from bamboo_extract.dom_index import build_dom_index
from bamboo_extract.normalize import normalize_html

GUJI_DIR = Path("古籍")
SAMPLE_SIZE = 100


def find_all_files():
    """Find all .htm files under 古籍/."""
    return sorted(GUJI_DIR.rglob("*.htm"))


def sample_files(n: int = SAMPLE_SIZE):
    """Sample n files with stratification by directory."""
    all_files = find_all_files()
    # Group by top-level category
    by_cat = defaultdict(list)
    for f in all_files:
        parts = f.parts
        if len(parts) >= 2:
            cat = parts[1]  # 史部-其他, 经部, etc.
        else:
            cat = "root"
        by_cat[cat].append(f)

    # Stratified sample: at least 5 per category, rest random
    sampled = []
    remaining = n
    for cat, files in by_cat.items():
        take = min(5, len(files), remaining)
        sampled.extend(random.sample(files, take))
        remaining -= take

    # Fill remaining from global pool
    if remaining > 0:
        already = set(sampled)
        available = [f for f in all_files if f not in already]
        sampled.extend(random.sample(available, min(remaining, len(available))))

    return sampled[:n]


def analyze_file(path: Path) -> dict:
    """Run extract() and return analysis dict."""
    try:
        html = path.read_text(encoding="utf-8")
    except Exception as e:
        return {"error": f"read: {e}"}

    try:
        ir = extract(html)
    except Exception as e:
        tb = traceback.format_exc()
        return {"error": f"extract: {e}", "traceback": tb}

    result = {
        "error": None,
        "title": ir.title,
        "title_is_untitled": ir.title == "Untitled",
        "docType": ir.docType,
        "dynasty": ir.dynasty,
        "author": ir.author,
        "chapter_count": len(ir.chapters),
        "total_sections": sum(len(ch.sections) for ch in ir.chapters),
        "total_annotations": sum(
            len(s.annotations) for ch in ir.chapters for s in ch.sections
        ),
        "nav_items": len(ir.navItems),
        "section_type_counter": Counter(),
        "has_chapter_titles": False,
        "first_section_type": None,
        "first_section_content_preview": "",
        "html_size": len(html),
    }

    for ch in ir.chapters:
        if ch.title:
            result["has_chapter_titles"] = True
        for s in ch.sections:
            result["section_type_counter"][s.type] += 1
            if result["first_section_type"] is None:
                result["first_section_type"] = s.type
                result["first_section_content_preview"] = s.content[:80]

    return result


def main():
    random.seed(42)
    files = sample_files(SAMPLE_SIZE)
    print(f"Sampling {len(files)} files from {len(find_all_files())} total")
    print(f"Categories: {sorted(set(f.parts[1] if len(f.parts) >= 2 else 'root' for f in files))}")
    print()

    results = []
    errors = []

    for f in files:
        result = analyze_file(f)
        result["path"] = str(f)
        results.append(result)
        if result["error"]:
            errors.append(result)

    # ── Summary stats ────────────────────────────────────────────
    success = [r for r in results if r["error"] is None]
    failed = [r for r in results if r["error"] is not None]

    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total: {len(results)}")
    print(f"Success: {len(success)}")
    print(f"Failed: {len(failed)}")
    print()

    if success:
        titles = [r["title"] for r in success]
        print(f"Titles: {Counter(titles).most_common(10)}")
        print(f"Untitled rate: {sum(1 for r in success if r['title_is_untitled'])}/{len(success)}")
        print()

        dynasties = [r["dynasty"] for r in success if r["dynasty"]]
        print(f"Dynasty extraction: {len(dynasties)}/{len(success)} ({len(dynasties)*100//len(success)}%)")
        if dynasties:
            print(f"  Top: {Counter(dynasties).most_common(5)}")
        print()

        authors = [r["author"] for r in success if r["author"]]
        print(f"Author extraction: {len(authors)}/{len(success)} ({len(authors)*100//len(success)}%)")
        print()

        docTypes = [r["docType"] for r in success]
        print(f"docTypes: {Counter(docTypes)}")
        print()

        chapter_counts = [r["chapter_count"] for r in success]
        print(f"Chapter counts: min={min(chapter_counts)}, max={max(chapter_counts)}, avg={sum(chapter_counts)/len(chapter_counts):.1f}")
        print(f"  Zero chapters: {sum(1 for c in chapter_counts if c == 0)}")
        print(f"  One chapter: {sum(1 for c in chapter_counts if c == 1)}")
        print(f"  Multi-chapter: {sum(1 for c in chapter_counts if c > 1)}")
        print()

        has_titles = [r["has_chapter_titles"] for r in success]
        print(f"Has chapter titles: {sum(has_titles)}/{len(success)}")
        print()

        total_annotations = [r["total_annotations"] for r in success]
        print(f"Annotations: min={min(total_annotations)}, max={max(total_annotations)}, avg={sum(total_annotations)/len(total_annotations):.1f}")
        print(f"  Zero annotations: {sum(1 for a in total_annotations if a == 0)}")
        print()

        section_types = Counter()
        for r in success:
            for st, cnt in r["section_type_counter"].items():
                section_types[st] += cnt
        print(f"Section types: {section_types}")
        print()

        nav_counts = [r["nav_items"] for r in success]
        print(f"navItems: min={min(nav_counts)}, max={max(nav_counts)}, avg={sum(nav_counts)/len(nav_counts):.1f}")

    # ── Error analysis ───────────────────────────────────────────
    if errors:
        print()
        print("=" * 60)
        print("ERRORS")
        print("=" * 60)
        error_types = Counter()
        for e in errors:
            etype = e["error"].split(":")[0] if e["error"] else "unknown"
            error_types[etype] += 1
        print(f"Error types: {error_types.most_common()}")
        print()
        for e in errors[:5]:
            print(f"  {e['path']}")
            print(f"    {e['error']}")
            if "traceback" in e:
                print(f"    Traceback: {e['traceback'][:300]}")

    # ── Representative examples ──────────────────────────────────
    print()
    print("=" * 60)
    print("REPRESENTATIVE EXAMPLES")
    print("=" * 60)

    # Example: good extraction with chapters + annotations
    good = [r for r in success if r["chapter_count"] > 1 and r["total_annotations"] > 0]
    if good:
        ex = good[0]
        print(f"\n--- Good extraction: {ex['path']} ---")
        print(f"  title: {ex['title']}")
        print(f"  dynasty: {ex['dynasty']}, author: {ex['author']}")
        print(f"  chapters: {ex['chapter_count']}, annotations: {ex['total_annotations']}")
        print(f"  section types: {dict(ex['section_type_counter'])}")

    # Example: content with catalog
    catalogs = [r for r in success if r["docType"] == "catalog"]
    if catalogs:
        ex = catalogs[0]
        print(f"\n--- Catalog: {ex['path']} ---")
        print(f"  title: {ex['title']}")
        print(f"  navItems: {ex['nav_items']}")
        print(f"  dynasty: {ex['dynasty']}, author: {ex['author']}")

    # Example: Untitled
    untitled = [r for r in success if r["title_is_untitled"]]
    if untitled:
        ex = untitled[0]
        print(f"\n--- Untitled: {ex['path']} ---")
        print(f"  chapters: {ex['chapter_count']}, sections: {ex['total_sections']}")
        print(f"  preview: {ex['first_section_content_preview'][:60]}")

    # Example: single chapter no metadata
    plain = [r for r in success if r["chapter_count"] == 1 and not r["dynasty"] and not r["has_chapter_titles"]]
    if plain:
        ex = plain[0]
        print(f"\n--- Plain single chapter: {ex['path']} ---")
        print(f"  title: {ex['title']}")
        print(f"  section types: {dict(ex['section_type_counter'])}")
        print(f"  preview: {ex['first_section_content_preview'][:60]}")

    # Example: content with only main-text sections
    main_only = [r for r in success if set(ex["section_type_counter"].keys()) == {"main-text"} and ex["chapter_count"] == 1]
    if main_only:
        ex = main_only[0]
        print(f"\n--- Main-text only: {ex['path']} ---")
        print(f"  title: {ex['title']}")
        print(f"  sections: {ex['total_sections']}")

    print()
    print("=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
