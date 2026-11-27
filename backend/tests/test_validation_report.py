from pathlib import Path

import pytest
from app.validation_report import build_report, main, parse_junit_xml, render_markdown

SAMPLE_JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" tests="4" failures="0" errors="0" skipped="0">
    <properties>
      <property name="req" value="IGNORED_SUITE_PROP"/>
    </properties>
    <testcase classname="tests.test_a" name="test_ten">
      <properties>
        <property name="req" value="F10"/>
      </properties>
    </testcase>
    <testcase classname="tests.test_b" name="test_two">
      <properties>
        <property name="req" value="F2"/>
        <property name="req" value="17025-6.4.8"/>
      </properties>
    </testcase>
    <testcase classname="tests.test_c" name="test_untagged"/>
  </testsuite>
</testsuites>
"""


@pytest.mark.req("17025-7.11.2")
def test_parse_junit_and_natural_sort_requirements() -> None:
    cases = parse_junit_xml(SAMPLE_JUNIT)
    assert len(cases) == 3

    report = build_report(cases)
    assert report.total_tests == 3
    assert report.passed_tests == 3
    assert report.has_failures is False
    assert [r.requirement_id for r in report.requirements] == ["17025-6.4.8", "F2", "F10"]
    assert all(r.status == "PASS" for r in report.requirements)


@pytest.mark.req("17025-7.11.2")
def test_failed_error_and_skipped_cases_affect_requirement_status() -> None:
    xml_text = """<?xml version="1.0" encoding="utf-8"?>
    <testsuite name="pytest">
      <testcase classname="t" name="test_ok">
        <properties><property name="req" value="F4"/></properties>
      </testcase>
      <testcase classname="t" name="test_bad">
        <properties><property name="req" value="F4"/></properties>
        <failure message="boom">traceback</failure>
      </testcase>
      <testcase classname="t" name="test_err">
        <properties><property name="req" value="F5"/></properties>
        <error message="setup">traceback</error>
      </testcase>
      <testcase classname="t" name="test_skip">
        <properties><property name="req" value="F8"/></properties>
        <skipped message="wip"/>
      </testcase>
    </testsuite>
    """
    report = build_report(parse_junit_xml(xml_text))
    by_id = {r.requirement_id: r for r in report.requirements}

    assert report.has_failures is True
    assert by_id["F4"].status == "FAIL"
    assert (by_id["F4"].passed_count, by_id["F4"].failed_count) == (1, 1)
    assert by_id["F5"].status == "FAIL"
    assert by_id["F8"].status == "MISSING"


@pytest.mark.req("17025-7.11.2")
def test_missing_required_ids_reported_and_strict_mode_fails(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    xml_path = tmp_path / "report.xml"
    xml_path.write_text(SAMPLE_JUNIT, encoding="utf-8")

    exit_code = main([str(xml_path), "--require", "F2,F99", "--strict"])
    output = capsys.readouterr().out

    assert exit_code == 1
    assert "| `F99` | *(brak testów)* | MISSING |" in output


@pytest.mark.req("17025-7.11.2")
def test_cli_writes_markdown_output_file(tmp_path: Path) -> None:
    xml_path = tmp_path / "report.xml"
    out_path = tmp_path / "validation-report.md"
    xml_path.write_text(SAMPLE_JUNIT, encoding="utf-8")

    exit_code = main([str(xml_path), "--output", str(out_path), "--require", "F2,F10", "--strict"])
    markdown = out_path.read_text(encoding="utf-8")

    assert exit_code == 0
    assert "# Raport walidacji PN-EN ISO/IEC 17025" in markdown
    assert "| `F2` | `test_two` (1/1 PASS) | PASS |" in markdown
    assert "| `F10` | `test_ten` (1/1 PASS) | PASS |" in markdown


@pytest.mark.req("17025-7.11.2")
def test_render_empty_requirements_note() -> None:
    xml_text = '<testsuite><testcase classname="x" name="y"/></testsuite>'
    report = build_report(parse_junit_xml(xml_text))
    rendered = render_markdown(report)
    assert "*(brak oznaczonych wymagań)*" in rendered


@pytest.mark.req("F1", "17025-7.11.2")
def test_req_marker_populates_record_property(request: pytest.FixtureRequest) -> None:
    recorded = [value for name, value in request.node.user_properties if name == "req"]
    assert set(recorded) == {"F1", "17025-7.11.2"}
