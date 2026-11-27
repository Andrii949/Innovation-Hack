import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.mark.parametrize("origin", ["capacitor://localhost", "https://localhost"])
def test_cors_allows_capacitor_origins(origin: str) -> None:
    response = TestClient(app).options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_allows_web_dev_origin() -> None:
    response = TestClient(app).get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
