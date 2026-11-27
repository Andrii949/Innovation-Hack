import stat
from pathlib import Path

import pytest
from app.config import DEFAULT_CORS_ORIGINS, Settings

REPO_ROOT = Path(__file__).resolve().parents[2]


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, val = line.partition("=")
        assert sep == "="
        values[key.strip()] = val.strip()
    return values


@pytest.mark.req("17025-7.11.3")
def test_env_examples_have_required_keys_and_no_secrets() -> None:
    infra_env = _parse_env_file(REPO_ROOT / "infra" / ".env.example")
    backend_env = _parse_env_file(REPO_ROOT / "backend" / ".env.example")

    for key in (
        "DOMAIN",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
        "APP_DB_USER",
        "APP_DB_PASSWORD",
        "CORS_ORIGINS",
        "PUBLIC_BASE_URL",
        "OCR_API_URL",
        "OCR_API_KEY",
        "OCR_MODEL",
        "OCR_TIMEOUT_S",
        "SEED_ADMIN_PASSWORD",
        "SEED_MANAGER_PASSWORD",
        "SEED_WORKER_PASSWORD",
    ):
        assert key in infra_env

    for key in (
        "DATABASE_URL",
        "CORS_ORIGINS",
        "PUBLIC_BASE_URL",
        "OCR_API_URL",
        "OCR_API_KEY",
        "OCR_MODEL",
        "OCR_TIMEOUT_S",
    ):
        assert key in backend_env

    assert infra_env["OCR_API_KEY"] == ""
    assert backend_env["OCR_API_KEY"] == ""
    assert infra_env["SEED_ADMIN_PASSWORD"] == ""
    assert infra_env["SEED_MANAGER_PASSWORD"] == ""
    assert infra_env["SEED_WORKER_PASSWORD"] == ""


@pytest.mark.req("F6", "17025-7.11.3")
def test_cors_defaults_include_capacitor_android_and_ios_origins() -> None:
    origins = Settings(cors_origins=DEFAULT_CORS_ORIGINS).cors_origin_list
    assert "http://localhost:5173" in origins
    assert "https://localhost" in origins
    assert "capacitor://localhost" in origins

    infra_env = _parse_env_file(REPO_ROOT / "infra" / ".env.example")
    assert "https://localhost" in infra_env["CORS_ORIGINS"]
    assert "capacitor://localhost" in infra_env["CORS_ORIGINS"]


@pytest.mark.req("F6", "17025-7.11.3")
def test_caddyfile_enforces_security_headers_api_proxy_and_spa_fallback() -> None:
    caddy = (REPO_ROOT / "infra" / "Caddyfile").read_text(encoding="utf-8")
    assert ":2020" in caddy
    assert "respond /healthz" in caddy
    assert "reverse_proxy api:8000" in caddy
    assert "try_files {path} /index.html" in caddy
    assert 'X-Content-Type-Options "nosniff"' in caddy
    assert 'X-Frame-Options "DENY"' in caddy
    assert "Strict-Transport-Security" in caddy
    assert "camera=(self)" in caddy


@pytest.mark.req("17025-7.5.2", "17025-7.11.3")
def test_docker_compose_defines_all_services_and_least_privilege_db_url() -> None:
    compose = (REPO_ROOT / "infra" / "docker-compose.yml").read_text(encoding="utf-8")
    for service in ("  db:", "  api:", "  worker:", "  web:"):
        assert service in compose
    assert "10-app-role.sh:/docker-entrypoint-initdb.d/10-app-role.sh:ro" in compose
    assert "MIGRATION_DATABASE_URL:" in compose
    assert "${APP_DB_USER:-lab_app}" in compose
    assert "127.0.0.1:2020/healthz" in compose


@pytest.mark.req("17025-7.11.3")
def test_infra_scripts_are_executable_and_use_strict_bash() -> None:
    scripts = (
        REPO_ROOT / "infra" / "postgres" / "10-app-role.sh",
        REPO_ROOT / "backend" / "docker-entrypoint.sh",
        REPO_ROOT / "infra" / "backup.sh",
        REPO_ROOT / "infra" / "restore.sh",
        REPO_ROOT / "infra" / "smoke-test.sh",
    )
    for script in scripts:
        assert script.is_file()
        mode = script.stat().st_mode
        assert mode & stat.S_IXUSR
        lines = script.read_text(encoding="utf-8").splitlines()
        assert lines[0] == "#!/usr/bin/env bash"
        assert lines[1] == "set -euo pipefail"


@pytest.mark.req("F6")
def test_native_manifests_declare_camera_and_nfc_permissions() -> None:
    manifest = (
        REPO_ROOT / "frontend" / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    ).read_text(encoding="utf-8")
    assert "android.permission.CAMERA" in manifest
    assert "android.permission.NFC" in manifest
    assert "android.permission.POST_NOTIFICATIONS" in manifest

    plist = (REPO_ROOT / "frontend" / "ios" / "App" / "App" / "Info.plist").read_text(
        encoding="utf-8"
    )
    assert "NSCameraUsageDescription" in plist
    assert "NFCReaderUsageDescription" in plist
