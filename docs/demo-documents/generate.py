#!/usr/bin/env python3
"""Render the demo calibration certificates from data/*.json through typst.

Requires the `typst` binary (developed with 0.15.1). PDFs go to pdf/ and, when
`pdftoppm` is available, page images go to png/. No third-party Python packages.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "certificate.typ"
DATA_DIR = ROOT / "data"
PDF_DIR = ROOT / "pdf"
PNG_DIR = ROOT / "png"

_REQUIRED = {
    "cert_no",
    "issue_date",
    "calibration_date",
    "unit",
    "lab",
    "client",
    "user",
    "object",
    "place",
    "method",
    "conditions",
    "traceability",
    "uncertainty",
    "adjustments",
    "compliance",
    "points",
    "notes",
    "performed_by",
    "authorized_by",
    "demo_note",
}
_REQUIRED_LAB = {"name", "address", "contact", "ap", "accreditation"}
_REQUIRED_OBJECT = {"name", "manufacturer", "model", "serial", "inventory", "location"}
_REQUIRED_POINT = {"reference", "indication", "error", "uncertainty"}


def _validate(path: Path, payload: object) -> None:
    if not isinstance(payload, dict):
        raise SystemExit(f"{path.name}: top-level value must be an object")
    missing = _REQUIRED - payload.keys()
    if missing:
        raise SystemExit(f"{path.name}: missing keys {sorted(missing)}")
    for key in ("lab", "object"):
        value = payload[key]
        if not isinstance(value, dict):
            raise SystemExit(f"{path.name}: {key} must be an object")
    missing_lab = _REQUIRED_LAB - payload["lab"].keys()
    if missing_lab:
        raise SystemExit(f"{path.name}: lab missing keys {sorted(missing_lab)}")
    missing_object = _REQUIRED_OBJECT - payload["object"].keys()
    if missing_object:
        raise SystemExit(f"{path.name}: object missing keys {sorted(missing_object)}")
    points = payload["points"]
    if not isinstance(points, list) or not points:
        raise SystemExit(f"{path.name}: points must be a non-empty array")
    for index, point in enumerate(points, start=1):
        if not isinstance(point, dict):
            raise SystemExit(f"{path.name}: point {index} must be an object")
        missing_point = _REQUIRED_POINT - point.keys()
        if missing_point:
            raise SystemExit(
                f"{path.name}: point {index} missing keys {sorted(missing_point)}"
            )


def main() -> int:
    typst = shutil.which("typst")
    if typst is None:
        print("typst not found in PATH (expected 0.15.x)", file=sys.stderr)
        return 1

    PDF_DIR.mkdir(exist_ok=True)
    PNG_DIR.mkdir(exist_ok=True)
    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm is None:
        print("pdftoppm not found; skipping PNG previews", file=sys.stderr)

    sources = sorted(DATA_DIR.glob("*.json"))
    if not sources:
        print(f"no JSON files in {DATA_DIR}", file=sys.stderr)
        return 1

    for source in sources:
        text = source.read_text(encoding="utf-8")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{source.name}: invalid JSON: {exc}") from exc
        _validate(source, payload)

        pdf = PDF_DIR / f"{source.stem}.pdf"
        command = [typst, "compile", str(TEMPLATE), str(pdf), "--input", f"data={text}"]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            print(result.stderr.strip(), file=sys.stderr)
            return result.returncode
        print(f"{pdf.relative_to(ROOT)}")

        if pdftoppm is not None:
            prefix = PNG_DIR / source.stem
            subprocess.run(
                [pdftoppm, "-png", "-r", "150", str(pdf), str(prefix)],
                check=True,
            )
            print(f"{prefix.relative_to(ROOT)}-*.png")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
