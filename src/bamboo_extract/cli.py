"""CLI entry point for bamboo-extract."""

import argparse
import json
import sys
from pathlib import Path

from . import extract
from .meta_dict import MetaDictionary, build_meta_dict


def _cmd_build_meta_dict(args: argparse.Namespace) -> None:
    """Build meta_dict.json from catalog HTML files.

    Extracts (dynasty, author) pairs from catalog pages using the same
    METADATA_RE + KNOWN_DYNASTIES validation used at runtime. If the
    static dictionary exists at the output path, merge results into it.
    """
    input_dir = Path(args.input)
    if not input_dir.is_dir():
        print(f"Error: not a directory: {args.input}", file=sys.stderr)
        sys.exit(1)

    catalog_htmls: list[str] = []
    for path in sorted(input_dir.rglob("*.htm")):
        catalog_htmls.append(path.read_text(encoding="utf-8"))
    for path in sorted(input_dir.rglob("*.html")):
        catalog_htmls.append(path.read_text(encoding="utf-8"))

    if not catalog_htmls:
        print("Error: no .htm/.html files found in", args.input, file=sys.stderr)
        sys.exit(1)

    # Extract pairs from catalog HTML
    md = build_meta_dict(catalog_htmls)
    catalog_pairs = md.pair_count

    # Merge with existing static dictionary if present
    output_path = Path(args.output)
    if output_path.exists():
        existing = MetaDictionary.load(output_path)
        # Add catalog pairs on top of existing entries (catalog takes
        # precedence for authors found in both)
        for author, dynasty in md.authors.items():
            existing.add_pair(dynasty, author)
        md = existing
        if args.verbose:
            print(f"Merged {catalog_pairs} catalog pairs with existing dictionary", file=sys.stderr)

    md.save(output_path)

    print(f"Wrote {md.pair_count} dynasty-author pairs to {args.output}", file=sys.stderr)


def main() -> None:
    # Check for subcommand before parsing — if argv[1] is a known
    # subcommand, use subparser mode; otherwise fall back to legacy
    # positional-arg mode for backward compatibility.
    subcommands = {"extract", "build-meta-dict", "help"}
    has_subcommand = len(sys.argv) > 1 and sys.argv[1] in subcommands

    if has_subcommand:
        _main_with_subcommands()
    else:
        _main_legacy()


def _main_with_subcommands() -> None:
    """Parser with explicit subcommands."""
    parser = argparse.ArgumentParser(
        prog="bamboo-extract",
        description="Extract structured content from ancient Chinese HTML files",
    )
    subparsers = parser.add_subparsers(dest="command")

    # ── extract subcommand ──────────────────────────────────────────
    extract_parser = subparsers.add_parser("extract", help="Extract content from HTML file")
    extract_parser.add_argument("input", help="Input HTML file path")
    extract_parser.add_argument(
        "--output", "-o",
        help="Output JSON file path (defaults to stdout)",
    )
    extract_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )

    # ── build-meta-dict subcommand ──────────────────────────────────
    meta_parser = subparsers.add_parser(
        "build-meta-dict",
        help="Build meta_dict.json from catalog HTML files",
    )
    meta_parser.add_argument("input", help="Directory containing catalog HTML files")
    meta_parser.add_argument(
        "--output", "-o", required=True,
        help="Output path for meta_dict.json",
    )
    meta_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    if args.command == "build-meta-dict":
        _cmd_build_meta_dict(args)
        return

    if args.command == "extract":
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"Error: file not found: {args.input}", file=sys.stderr)
            sys.exit(1)

        html = input_path.read_text(encoding="utf-8")
        ir = extract(html, source_path=args.input)
        output = ir.model_dump(exclude_none=True)
        json_str = json.dumps(output, ensure_ascii=False, indent=2)

        if args.output:
            Path(args.output).write_text(json_str, encoding="utf-8")
            if args.verbose:
                print(f"Written: {args.output}", file=sys.stderr)
        else:
            print(json_str)
        return

    parser.print_help()
    sys.exit(1)


def _main_legacy() -> None:
    """Legacy positional-arg mode: bamboo-extract <input> [-o output] [-v]."""
    parser = argparse.ArgumentParser(
        prog="bamboo-extract",
        description="Extract structured content from ancient Chinese HTML files",
    )
    parser.add_argument("input", nargs="?", help="Input HTML file path")
    parser.add_argument(
        "--output", "-o",
        help="Output JSON file path (defaults to stdout)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    html = input_path.read_text(encoding="utf-8")
    ir = extract(html, source_path=args.input)
    output = ir.model_dump(exclude_none=True)
    json_str = json.dumps(output, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).write_text(json_str, encoding="utf-8")
        if args.verbose:
            print(f"Written: {args.output}", file=sys.stderr)
    else:
        print(json_str)
