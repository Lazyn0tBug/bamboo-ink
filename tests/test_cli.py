"""CLI and extract() tests for bamboo-extract Phase 1."""

import json
import subprocess
from pathlib import Path

from bamboo_extract import extract

PACKAGE_ROOT = Path(__file__).parent.parent


class TestExtractDummy:
    def test_returns_minimal_ir(self) -> None:
        ir = extract("<html></html>", source_path="test.htm")
        assert ir.title == "Untitled"
        assert ir.source == "test.htm"
        assert ir.docType == "content"
        assert len(ir.chapters) == 1
        assert ir.chapters[0].title == ""
        assert ir.navItems == []

    def test_model_dump_excludes_none(self) -> None:
        ir = extract("", source_path="")
        data = ir.model_dump(exclude_none=True)
        assert "title" in data
        assert "chapters" in data
        assert "source" not in data  # empty string becomes None


class TestCliHelp:
    def test_help_shows_usage(self) -> None:
        result = subprocess.run(
            ["uv", "run", "bamboo-extract", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PACKAGE_ROOT),
        )
        assert result.returncode == 0
        assert "extract" in result.stdout.lower()


class TestCliExtract:
    def test_produces_valid_json(self, tmp_path: Path) -> None:
        html_file = tmp_path / "test.html"
        html_file.write_text("<html><body>Hello</body></html>", encoding="utf-8")
        output_file = tmp_path / "output.json"

        result = subprocess.run(
            ["uv", "run", "bamboo-extract", str(html_file), "--output", str(output_file)],
            capture_output=True,
            text=True,
            cwd=str(PACKAGE_ROOT),
        )
        assert result.returncode == 0

        data = json.loads(output_file.read_text(encoding="utf-8"))
        assert "title" in data
        assert "chapters" in data
        assert data["docType"] == "content"

    def test_missing_file_error(self, tmp_path: Path) -> None:
        result = subprocess.run(
            ["uv", "run", "bamboo-extract", str(tmp_path / "nonexistent.html")],
            capture_output=True,
            text=True,
            cwd=str(PACKAGE_ROOT),
        )
        assert result.returncode == 1
        assert "Error" in result.stderr

    def test_empty_html_produces_ir(self, tmp_path: Path) -> None:
        html_file = tmp_path / "empty.html"
        html_file.write_text("", encoding="utf-8")
        output_file = tmp_path / "output.json"

        result = subprocess.run(
            ["uv", "run", "bamboo-extract", str(html_file), "--output", str(output_file)],
            capture_output=True,
            text=True,
            cwd=str(PACKAGE_ROOT),
        )
        assert result.returncode == 0

        data = json.loads(output_file.read_text(encoding="utf-8"))
        assert data["title"] == "Untitled"
        assert len(data["chapters"]) >= 1
