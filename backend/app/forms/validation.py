from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.equipment._core import RangeResult, check_range, parse_decimal


class FieldSpec(BaseModel):
    key: str
    label: str
    type: Literal["number", "text", "bool", "date"]
    unit: str | None = None
    min: str | None = None
    max: str | None = None
    required: bool = False


class FormValidation(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    errors: dict[str, str] = Field(default_factory=dict)
    out_of_range: list[str] = Field(default_factory=list)


def validate_field_specs(raw_fields: list[FieldSpec]) -> list[dict[str, Any]]:
    seen_keys: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for spec in raw_fields:
        key = spec.key.strip()
        label = spec.label.strip()
        if not key or not label:
            raise ValueError("Klucz oraz etykieta pola formularza są wymagane")
        if key in seen_keys:
            raise ValueError(f"Duplikat klucza pola formularza: {key}")
        seen_keys.add(key)
        min_str: str | None = None
        max_str: str | None = None
        if spec.type == "number":
            min_dec = parse_decimal(spec.min) if spec.min is not None and spec.min != "" else None
            max_dec = parse_decimal(spec.max) if spec.max is not None and spec.max != "" else None
            if min_dec is not None and max_dec is not None and min_dec > max_dec:
                raise ValueError(f"Zakres min > max w polu {key}")
            min_str = format(min_dec, "f") if min_dec is not None else None
            max_str = format(max_dec, "f") if max_dec is not None else None
        normalized.append(
            {
                "key": key,
                "label": label,
                "type": spec.type,
                "unit": spec.unit,
                "min": min_str,
                "max": max_str,
                "required": spec.required,
            }
        )
    return normalized


def validate_form_values(fields: list[FieldSpec], raw: dict[str, Any]) -> FormValidation:
    values: dict[str, Any] = {}
    errors: dict[str, str] = {}
    out_of_range: list[str] = []

    for spec in fields:
        has_val = spec.key in raw and raw[spec.key] is not None
        raw_val = raw.get(spec.key)
        if isinstance(raw_val, str) and raw_val.strip() == "":
            has_val = False

        if not has_val:
            if spec.required:
                errors[spec.key] = "Pole jest wymagane"
            else:
                values[spec.key] = None
            continue

        if spec.type == "number":
            if isinstance(raw_val, bool):
                errors[spec.key] = "INVALID_NUMBER"
                continue
            text_val = str(raw_val) if isinstance(raw_val, str | int) else None
            if text_val is None:
                errors[spec.key] = "INVALID_NUMBER"
                continue
            try:
                dec_val = parse_decimal(text_val)
            except ValueError:
                errors[spec.key] = "INVALID_NUMBER"
                continue
            values[spec.key] = format(dec_val, "f")
            min_dec = parse_decimal(spec.min) if spec.min is not None and spec.min != "" else None
            max_dec = parse_decimal(spec.max) if spec.max is not None and spec.max != "" else None
            if check_range(dec_val, min_dec, max_dec) is not RangeResult.IN_RANGE:
                out_of_range.append(spec.key)

        elif spec.type == "text":
            if not isinstance(raw_val, str):
                errors[spec.key] = "Oczekiwano tekstu"
                continue
            values[spec.key] = raw_val

        elif spec.type == "bool":
            if not isinstance(raw_val, bool):
                errors[spec.key] = "Oczekiwano wartości logicznej"
                continue
            values[spec.key] = raw_val

        elif spec.type == "date":
            if isinstance(raw_val, date):
                values[spec.key] = raw_val.isoformat()
            elif isinstance(raw_val, str):
                try:
                    parsed_date = date.fromisoformat(raw_val.strip())
                except ValueError:
                    errors[spec.key] = "Nieprawidłowy format daty (wymagany RRRR-MM-DD)"
                    continue
                values[spec.key] = parsed_date.isoformat()
            else:
                errors[spec.key] = "Nieprawidłowy format daty"

    return FormValidation(values=values, errors=errors, out_of_range=out_of_range)
