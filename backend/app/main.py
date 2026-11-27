from collections.abc import Awaitable, Callable

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.audit.context import clear_audit_context
from app.audit.listener import register_audit_listener
from app.audit.router import router as audit_router
from app.auth.router import router as auth_router
from app.config import get_settings
from app.db import SessionLocal
from app.equipment.calibration_plans import router as calibration_plans_router
from app.equipment.router import catalog_router, check_plans_router
from app.equipment.router import router as equipment_router
from app.errors import register_error_handlers
from app.files.router import router as files_router
from app.forms.router import router as forms_router
from app.notifications.router import devices_router
from app.notifications.router import router as notifications_router
from app.notifications.router import rules_router as notification_rules_router
from app.print.router import router as print_router
from app.reagents.router import lots_router
from app.reagents.router import router as reagents_router
from app.reports.router import router as reports_router
from app.results.router import parameters_router, results_router
from app.schedule.router import router as schedule_router
from app.settings.router import router as settings_router

api = APIRouter(prefix="/api")
api.include_router(audit_router)
api.include_router(auth_router)
api.include_router(settings_router)
api.include_router(files_router)
api.include_router(forms_router)
api.include_router(catalog_router)
api.include_router(equipment_router)
api.include_router(check_plans_router)
api.include_router(calibration_plans_router)
api.include_router(schedule_router)
api.include_router(parameters_router)
api.include_router(results_router)
api.include_router(reagents_router)
api.include_router(lots_router)
api.include_router(notifications_router)
api.include_router(notification_rules_router)
api.include_router(devices_router)
api.include_router(print_router)
api.include_router(reports_router)


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app() -> FastAPI:
    settings = get_settings()
    register_audit_listener(SessionLocal)
    app = FastAPI(
        title="Intelligent Laboratory API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def reset_audit_vars(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        clear_audit_context()
        try:
            return await call_next(request)
        finally:
            clear_audit_context()

    register_error_handlers(app)
    app.include_router(api)
    return app


app = create_app()
