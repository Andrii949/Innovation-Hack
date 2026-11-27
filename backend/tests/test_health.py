import pytest
from app.errors import AppError
from app.main import create_app
from app.settings.service import get_setting
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy.orm import Session


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("origin", ["capacitor://localhost", "https://localhost"])
def test_cors_allows_capacitor_origins(client: TestClient, origin: str) -> None:
    response = client.options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_allows_web_dev_origin(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_app_error_envelope() -> None:
    test_app = create_app()
    router = APIRouter(prefix="/api")

    class SamplePayload(BaseModel):
        count: int

    @router.get("/boom")
    def boom() -> dict[str, str]:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono")

    @router.post("/validate-sample")
    def validate_sample(payload: SamplePayload) -> dict[str, int]:
        return {"count": payload.count}

    test_app.include_router(router)
    with TestClient(test_app) as test_client:
        response = test_client.get("/api/boom")
        assert response.status_code == 404
        assert response.json() == {"error": "NOT_FOUND", "message": "Nie znaleziono"}

        bad_validation = test_client.post("/api/validate-sample", json={})
        assert bad_validation.status_code == 422
        body = bad_validation.json()
        assert body["error"] == "VALIDATION_ERROR"
        assert isinstance(body["details"], list)
        assert any("count" in str(item) for item in body["details"])


def test_get_setting_falls_back_to_default(db: Session) -> None:
    assert get_setting(db, "default_equipment_lead_months") == 1
