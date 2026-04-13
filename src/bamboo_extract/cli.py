"""CLI entry point for bamboo-extract."""

import argparse
import json
import sys
from pathlib import Path

from . import extract


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="bamboo-extract",
        description="Extract structured content from ancient Chinese HTML files",
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input HTML file path",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output JSON file path (defaults to stdout)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
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
