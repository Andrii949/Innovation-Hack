from app.forms.validation import FieldSpec, validate_form_values


def test_validate_number_text_bool_date_fields() -> None:
    fields = [
        FieldSpec(
            key="temp",
            label="Temperatura",
            type="number",
            unit="°C",
            min="18",
            max="22",
            required=True,
        ),
        FieldSpec(key="ok", label="Czyste", type="bool", required=True),
        FieldSpec(key="note", label="Uwaga", type="text", required=False),
        FieldSpec(key="checked_date", label="Data", type="date", required=False),
    ]
    res = validate_form_values(
        fields,
        {"temp": "20,5", "ok": True, "checked_date": "2026-11-27"},
    )
    assert res.errors == {}
    assert res.out_of_range == []
    assert res.values == {
        "temp": "20.5",
        "ok": True,
        "note": None,
        "checked_date": "2026-11-27",
    }


def test_validate_flags_out_of_range_and_missing_required() -> None:
    fields = [
        FieldSpec(
            key="temp", label="Temperatura", type="number", min="18", max="22", required=True
        ),
        FieldSpec(key="hum", label="Wilgotność", type="number", required=True),
    ]
    res = validate_form_values(fields, {"temp": "25,0"})
    assert res.out_of_range == ["temp"]
    assert "hum" in res.errors
