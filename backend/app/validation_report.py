"""ISO/IEC 17025 §7.11.2 requirement-to-test validation report generator (T29)."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from collections.abc import Sequence

CaseOutcome = Literal["passed", "failed", "error", "skipped"]
RequirementStatus = Literal["PASS", "FAIL", "MISSING"]


@dataclass(frozen=True)
class TestCaseRecord:
    """Single executed test case extracted from a JUnit XML report."""

    node_id: str
    classname: str
    name: str
    outcome: CaseOutcome
    requirements: tuple[str, ...]


@dataclass(frozen=True)
class RequirementSummary:
    """Aggregated verification result for one requirement identifier."""

    requirement_id: str
    tests: tuple[TestCaseRecord, ...]
    passed_count: int
    failed_count: int
    skipped_count: int
    status: RequirementStatus


@dataclass(frozen=True)
class ValidationReport:
    """Full requirement traceability matrix built from JUnit XML output."""

    total_tests: int
    passed_tests: int
    failed_tests: int
    skipped_tests: int
    requirements: tuple[RequirementSummary, ...]
    has_failures: bool


class _JUnitParser(HTMLParser):
    """Streaming XML parser using HTMLParser to avoid stdlib XML entity pitfalls."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cases: list[TestCaseRecord] = []
        self._in_testcase = False
        self._classname = ""
        self._name = ""
        self._outcome: CaseOutcome = "passed"
        self._reqs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {k: v or "" for k, v in attrs}
        if tag == "testcase":
            self._in_testcase = True
            self._classname = attr_map.get("classname", "")
            self._name = attr_map.get("name", "")
            self._outcome = "passed"
            self._reqs = []
            return
        if not self._in_testcase:
            return
        if tag == "property" and attr_map.get("name") == "req":
            for raw in attr_map.get("value", "").split(","):
                req_id = raw.strip()
                if req_id and req_id not in self._reqs:
                    self._reqs.append(req_id)
        elif tag == "failure":
            self._outcome = "failed"
        elif tag == "error":
            self._outcome = "error"
        elif tag == "skipped" and self._outcome == "passed":
            self._outcome = "skipped"

    def handle_endtag(self, tag: str) -> None:
        if tag == "testcase" and self._in_testcase:
            node_id = f"{self._classname}::{self._name}" if self._classname else self._name
            self.cases.append(
                TestCaseRecord(
                    node_id=node_id,
                    classname=self._classname,
                    name=self._name,
                    outcome=self._outcome,
                    requirements=tuple(self._reqs),
                )
            )
            self._in_testcase = False

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)


def natural_req_sort_key(req_id: str) -> tuple[tuple[int, int, str], ...]:
    """Sort requirement IDs naturally (e.g., F2 before F10, 17025-6.4 before 17025-7.11)."""
    parts = re.split(r"(\d+)", req_id.casefold())
    return tuple(
        (0, int(part), "") if part.isdigit() else (1, 0, part) for part in parts if part != ""
    )


def parse_junit_xml(xml_text: str) -> list[TestCaseRecord]:
    """Parse pytest-compatible JUnit XML content into TestCaseRecord items."""
    parser = _JUnitParser()
    parser.feed(xml_text)
    parser.close()
    return parser.cases


def build_report(
    cases: Sequence[TestCaseRecord],
    *,
    required_ids: Sequence[str] = (),
) -> ValidationReport:
    """Aggregate test outcomes per requirement ID."""
    grouped: dict[str, list[TestCaseRecord]] = {
        req.strip(): [] for req in required_ids if req.strip()
    }
    passed_tests = 0
    failed_tests = 0
    skipped_tests = 0

    for case in cases:
        if case.outcome == "passed":
            passed_tests += 1
        elif case.outcome == "skipped":
            skipped_tests += 1
        else:
            failed_tests += 1

        for req_id in case.requirements:
            grouped.setdefault(req_id, []).append(case)

    summaries: list[RequirementSummary] = []
    for req_id in sorted(grouped, key=natural_req_sort_key):
        req_cases = tuple(grouped[req_id])
        req_passed = sum(1 for c in req_cases if c.outcome == "passed")
        req_failed = sum(1 for c in req_cases if c.outcome in {"failed", "error"})
        req_skipped = sum(1 for c in req_cases if c.outcome == "skipped")

        status: RequirementStatus
        if req_failed > 0:
            status = "FAIL"
        elif req_passed == 0:
            status = "MISSING"
        else:
            status = "PASS"

        summaries.append(
            RequirementSummary(
                requirement_id=req_id,
                tests=req_cases,
                passed_count=req_passed,
                failed_count=req_failed,
                skipped_count=req_skipped,
                status=status,
            )
        )

    return ValidationReport(
        total_tests=len(cases),
        passed_tests=passed_tests,
        failed_tests=failed_tests,
        skipped_tests=skipped_tests,
        requirements=tuple(summaries),
        has_failures=failed_tests > 0 or any(s.status != "PASS" for s in summaries),
    )


def render_markdown(report: ValidationReport) -> str:
    """Render a Markdown validation matrix in Polish for ISO/IEC 17025 §7.11.2."""
    lines = [
        "# Raport walidacji PN-EN ISO/IEC 17025",
        "",
        (
            f"- Wykonane testy: **{report.total_tests}** "
            f"(PASS: **{report.passed_tests}**, FAIL: **{report.failed_tests}**, "
            f"SKIPPED: **{report.skipped_tests}**)"
        ),
        f"- Wymagania w raporcie: **{len(report.requirements)}**",
        "",
        "| Wymaganie | Testy | Wynik |",
        "|---|---|---|",
    ]

    if not report.requirements:
        lines.append("| *(brak oznaczonych wymagań)* | — | MISSING |")
    else:
        for req in report.requirements:
            if not req.tests:
                test_desc = "*(brak testów)*"
            else:
                names = ", ".join(f"`{t.name}`" for t in req.tests)
                test_desc = f"{names} ({req.passed_count}/{len(req.tests)} PASS)"
            lines.append(f"| `{req.requirement_id}` | {test_desc} | {req.status} |")

    lines.append("")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for generating Markdown validation reports from pytest JUnit XML."""
    parser = argparse.ArgumentParser(
        description="Generate an ISO/IEC 17025 requirement-to-test Markdown validation report.",
    )
    parser.add_argument("junit_xml", type=Path, help="Path to pytest JUnit XML output.")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Optional Markdown file path (writes to stdout when omitted).",
    )
    parser.add_argument(
        "--require",
        action="append",
        default=[],
        help="Comma-separated requirement IDs that must be present and passing.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 if any test failed or any requirement is FAIL/MISSING.",
    )
    args = parser.parse_args(argv)

    required_ids = [
        item.strip() for chunk in args.require for item in chunk.split(",") if item.strip()
    ]
    xml_text = args.junit_xml.read_text(encoding="utf-8")
    cases = parse_junit_xml(xml_text)
    report = build_report(cases, required_ids=required_ids)
    markdown = render_markdown(report)

    if args.output is not None:
        args.output.write_text(markdown, encoding="utf-8")
    else:
        sys.stdout.write(markdown)

    if args.strict and report.has_failures:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
