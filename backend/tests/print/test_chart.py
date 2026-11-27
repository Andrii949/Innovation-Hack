from datetime import UTC, datetime

from app.core.ranges import RangeResult
from app.print.chart import OUT_OF_THRESHOLD_COLOR, chart_svg
from app.results.schemas import Series, SeriesParameter, SeriesPoint

SO3 = SeriesParameter(name="SO₃", unit="%")


def point(day: int, value: str, status: RangeResult = RangeResult.IN_RANGE) -> SeriesPoint:
    return SeriesPoint(
        at=datetime(2026, 11, day, 8, tzinfo=UTC),
        sample_label=f"Próbka {day}",
        value=value,
        status=status,
    )


def series(
    points: list[SeriesPoint], threshold_min: str | None = None, threshold_max: str | None = None
) -> Series:
    return Series(
        parameter=SO3,
        threshold_min=threshold_min,
        threshold_max=threshold_max,
        points=points,
        count=len(points),
        out_of_threshold=sum(p.status is not RangeResult.IN_RANGE for p in points),
    )


def test_chart_has_point_per_result_and_threshold_lines() -> None:
    svg = chart_svg(
        series(
            [point(1, "1.50"), point(2, "3.35", RangeResult.ABOVE), point(3, "2.10")],
            threshold_min="0.10",
            threshold_max="3.20",
        )
    )

    assert svg.startswith("<svg")
    assert svg.count("<circle") == 3
    assert svg.count('class="threshold"') == 2
    assert svg.count(f'fill="{OUT_OF_THRESHOLD_COLOR}"') == 1
    assert ">3,20</text>" in svg  # Polish decimal comma on the threshold label
    assert ">01.11.2026</text>" in svg


def test_chart_without_thresholds_has_no_threshold_lines() -> None:
    svg = chart_svg(series([point(1, "1.50"), point(2, "2.00")]))

    assert svg.count("<circle") == 2
    assert 'class="threshold"' not in svg


def test_single_point_with_equal_bounds_renders() -> None:
    svg = chart_svg(series([point(1, "3.20")], threshold_min="3.20", threshold_max="3.20"))

    assert svg.count("<circle") == 1
    assert "nan" not in svg.lower()


def test_empty_series_chart_says_no_data() -> None:
    svg = chart_svg(series([], threshold_min="0.10", threshold_max="3.20"))

    assert "Brak danych" in svg
    assert "<circle" not in svg
