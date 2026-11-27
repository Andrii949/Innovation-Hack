from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar

_audit_user_var: ContextVar[int | None] = ContextVar("audit_user_id", default=None)
_audit_reason_var: ContextVar[str | None] = ContextVar("audit_reason", default=None)


def set_audit_user(user_id: int | None) -> None:
    _audit_user_var.set(user_id)


def set_audit_reason(reason: str | None) -> None:
    _audit_reason_var.set(reason)


def get_audit_user() -> int | None:
    return _audit_user_var.get()


def get_audit_reason() -> str | None:
    return _audit_reason_var.get()


def clear_audit_context() -> None:
    _audit_user_var.set(None)
    _audit_reason_var.set(None)


@contextmanager
def audit_context(user_id: int | None, reason: str | None = None) -> Generator[None]:
    user_token = _audit_user_var.set(user_id)
    reason_token = _audit_reason_var.set(reason)
    try:
        yield
    finally:
        _audit_user_var.reset(user_token)
        _audit_reason_var.reset(reason_token)
