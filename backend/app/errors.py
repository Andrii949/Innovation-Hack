from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Domain error mapped to the unified Polish JSON error envelope."""

    def __init__(
        self,
        status_code: int,
        error: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error = error
        self.message = message
        self.details = details


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        body: dict[str, Any] = {"error": exc.error, "message": exc.message}
        if exc.details is not None:
            body["details"] = exc.details
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details: list[dict[str, Any]] = []
        for err in exc.errors():
            loc = [str(part) for part in err.get("loc", ())]
            field = ".".join(loc[1:]) if len(loc) > 1 else (loc[0] if loc else "")
            details.append(
                {
                    "field": field,
                    "loc": loc,
                    "message": str(err.get("msg", "")),
                    "type": str(err.get("type", "")),
                }
            )
        return JSONResponse(
            status_code=422,
            content={
                "error": "VALIDATION_ERROR",
                "message": "Nieprawidłowe dane wejściowe",
                "details": details,
            },
        )
