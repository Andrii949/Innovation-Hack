"""Measurement series drawn as standalone SVG for PDF reports (docs/02-architektura.md §8.5).

Built by hand so typst needs no packages from the internet; colours follow the frontend tokens.
"""

from datetime import datetime
from decimal import Decimal
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.core.ranges import RangeResult
from app.results.schemas import Series

POINT_COLOR = "#0c3f76"  # --chart-1, brand navy
LINE_COLOR = "#275284"  # --chart-3
THRESHOLD_COLOR = "#60a501"  # --chart-4
OUT_OF_THRESHOLD_COLOR = "#e7000b"  # --destructive
AXIS_COLOR = "#9ca3af"
FONT = 'font-family="DejaVu Sans" font-size="11"'

MARGIN_LEFT = 56
MARGIN_RIGHT = 16
MARGIN_TOP = 16
MARGIN_BOTTOM = 24


def chart_svg(series: Series, *, width: int = 640, height: int = 240) -> str:
    head = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    )
    if not series.points:
        return (
            f'{head}<text x="{width / 2:.1f}" y="{height / 2:.1f}" text-anchor="middle" {FONT}>'
            "Brak danych</text></svg>"
        )

    values = [Decimal(p.value) for p in series.points]
    thresholds = [Decimal(t) for t in (series.threshold_min, series.threshold_max) if t is not None]
    low, high = min(values + thresholds), max(values + thresholds)
    pad = (high - low) / 10 or abs(high) / 10 or Decimal(1)
    low, high = low - pad, high + pad

    plot_width = width - MARGIN_LEFT - MARGIN_RIGHT
    plot_height = height - MARGIN_TOP - MARGIN_BOTTOM
    bottom = MARGIN_TOP + plot_height
    first = min(p.at for p in series.points)
    last = max(p.at for p in series.points)
    span = (last - first).total_seconds()

    def x(at: datetime) -> float:
        if not span:
            return MARGIN_LEFT + plot_width / 2
        return MARGIN_LEFT + (at - first).total_seconds() / span * plot_width

    def y(value: Decimal) -> float:
        return MARGIN_TOP + float((high - value) / (high - low)) * plot_height

    parts = [
        head,
        f'<text x="4" y="{MARGIN_TOP - 4}" {FONT}>{escape(series.parameter.unit)}</text>',
        f'<line x1="{MARGIN_LEFT}" y1="{MARGIN_TOP}" x2="{MARGIN_LEFT}" y2="{bottom}" '
        f'stroke="{AXIS_COLOR}"/>',
        f'<line x1="{MARGIN_LEFT}" y1="{bottom}" x2="{width - MARGIN_RIGHT}" y2="{bottom}" '
        f'stroke="{AXIS_COLOR}"/>',
    ]
    for threshold in (series.threshold_min, series.threshold_max):
        if threshold is None:
            continue
        line_y = y(Decimal(threshold))
        parts.append(
            f'<line class="threshold" x1="{MARGIN_LEFT}" y1="{line_y:.1f}" '
            f'x2="{width - MARGIN_RIGHT}" y2="{line_y:.1f}" stroke="{THRESHOLD_COLOR}" '
            'stroke-dasharray="6 4"/>'
        )
        parts.append(
            f'<text x="{MARGIN_LEFT - 4}" y="{line_y + 4:.1f}" text-anchor="end" {FONT}>'
            f"{escape(threshold.replace('.', ','))}</text>"
        )

    coords = [(x(p.at), y(v)) for p, v in zip(series.points, values, strict=True)]
    polyline = " ".join(f"{cx:.1f},{cy:.1f}" for cx, cy in coords)
    parts.append(f'<polyline points="{polyline}" fill="none" stroke="{LINE_COLOR}"/>')
    for p, (cx, cy) in zip(series.points, coords, strict=True):
        color = POINT_COLOR if p.status is RangeResult.IN_RANGE else OUT_OF_THRESHOLD_COLOR
        parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3" fill="{color}"/>')

    tz = ZoneInfo(get_settings().timezone)
    parts.append(
        f'<text x="{MARGIN_LEFT}" y="{height - 6}" {FONT}>{first.astimezone(tz):%d.%m.%Y}</text>'
    )
    parts.append(
        f'<text x="{width - MARGIN_RIGHT}" y="{height - 6}" text-anchor="end" {FONT}>'
        f"{last.astimezone(tz):%d.%m.%Y}</text>"
    )
    parts.append("</svg>")
    return "".join(parts)
