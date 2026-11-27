import json
from pathlib import Path

import pytest
from app.print import render as render_module
from app.print.render import RenderError, render

TEMPLATE = """#let data = json(bytes(sys.inputs.data))
= #data.title
"""


@pytest.fixture
def print_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "templates").mkdir()
    (tmp_path / "fonts").mkdir()
    (tmp_path / "templates" / "hello.typ").write_text(TEMPLATE, encoding="utf-8")
    (tmp_path / "templates" / "broken.typ").write_text("#let x = (\n", encoding="utf-8")
    monkeypatch.setattr(render_module, "PRINT_DIR", tmp_path)
    return tmp_path


@pytest.mark.usefixtures("print_dir")
def test_render_returns_pdf() -> None:
    pdf = render("hello.typ", json.dumps({"title": "Karta urządzenia 121/A"}))

    assert pdf.startswith(b"%PDF")


@pytest.mark.usefixtures("print_dir")
def test_broken_template_raises_render_error() -> None:
    with pytest.raises(RenderError, match="exit code"):
        render("broken.typ", "{}")


@pytest.mark.usefixtures("print_dir")
def test_timeout_raises_render_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(render_module, "RENDER_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(RenderError, match="timed out"):
        render("hello.typ", json.dumps({"title": "x"}))


@pytest.mark.usefixtures("print_dir")
def test_missing_typst_binary_raises_render_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PATH", "")

    with pytest.raises(RenderError, match="typst binary not found"):
        render("hello.typ", "{}")
