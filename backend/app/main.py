import os

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Web dev server, Android WebView (https://localhost), iOS WebView (capacitor://localhost).
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "https://localhost",
    "capacitor://localhost",
)

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS")
    if raw is None:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Intelligent Laboratory API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api)
    return app


app = create_app()
