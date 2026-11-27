import pytest
from app.core.db_security import ensure_db_roles, validate_pg_identifier
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

TEST_APP_ROLE = "_test_lab_app"


@pytest.mark.req("17025-7.11.3")
@pytest.mark.parametrize(
    "bad_name",
    ["", "1bad", "lab-app", "lab; DROP TABLE audit_log;", "lab app", "a$b"],
)
def test_validate_pg_identifier_rejects_unsafe_names(bad_name: str) -> None:
    with pytest.raises(ValueError, match="Invalid PostgreSQL identifier"):
        validate_pg_identifier(bad_name)


@pytest.mark.req("17025-7.5.2", "17025-7.11.3")
def test_ensure_db_roles_is_idempotent_and_grants_domain_table_crud(db: Session) -> None:
    conn = db.connection()
    ensure_db_roles(conn, app_user=TEST_APP_ROLE)
    ensure_db_roles(conn, app_user=TEST_APP_ROLE)

    db.execute(text(f"SET LOCAL ROLE {TEST_APP_ROLE}"))
    with db.begin_nested():
        db.execute(text("INSERT INTO public.setting (key, value) VALUES ('_sec_probe', '1'::json)"))
        row = db.execute(
            text("SELECT value::text FROM public.setting WHERE key = '_sec_probe'")
        ).scalar_one()
        assert row == "1"
    db.execute(text("RESET ROLE"))


@pytest.mark.req("17025-7.5.2", "17025-7.11.3")
def test_audit_log_allows_select_and_insert_but_blocks_update_and_delete(db: Session) -> None:
    conn = db.connection()
    ensure_db_roles(conn, app_user=TEST_APP_ROLE)

    db.execute(text(f"SET LOCAL ROLE {TEST_APP_ROLE}"))
    inserted_id = db.execute(
        text(
            """
            INSERT INTO public.audit_log (at, user_id, action, entity, entity_id, reason)
            VALUES (now(), 1, 'create', 'setting', '1', 'db_security_probe')
            RETURNING id
            """
        )
    ).scalar_one()

    selected_reason = db.execute(
        text("SELECT reason FROM public.audit_log WHERE id = :id"),
        {"id": inserted_id},
    ).scalar_one()
    assert selected_reason == "db_security_probe"

    with pytest.raises(DBAPIError), db.begin_nested():
        db.execute(
            text("UPDATE public.audit_log SET reason = 'tampered' WHERE id = :id"),
            {"id": inserted_id},
        )

    with pytest.raises(DBAPIError), db.begin_nested():
        db.execute(
            text("DELETE FROM public.audit_log WHERE id = :id"),
            {"id": inserted_id},
        )
    db.execute(text("RESET ROLE"))


@pytest.mark.req("17025-7.11.3")
def test_alembic_version_is_read_only_for_app_role(db: Session) -> None:
    conn = db.connection()
    ensure_db_roles(conn, app_user=TEST_APP_ROLE)

    db.execute(text(f"SET LOCAL ROLE {TEST_APP_ROLE}"))
    versions = db.execute(text("SELECT version_num FROM public.alembic_version")).scalars().all()
    assert len(versions) >= 1

    with pytest.raises(DBAPIError), db.begin_nested():
        db.execute(text("DELETE FROM public.alembic_version"))
    db.execute(text("RESET ROLE"))


@pytest.mark.req("17025-7.5.2")
def test_event_trigger_locks_down_recreated_audit_log_table(db: Session) -> None:
    conn = db.connection()
    ensure_db_roles(conn, app_user=TEST_APP_ROLE)

    db.execute(text("DROP TABLE public.audit_log"))
    db.execute(text("CREATE TABLE public.audit_log (id serial PRIMARY KEY, action text NOT NULL)"))

    privileges = (
        db.execute(
            text(
                """
                SELECT
                    has_table_privilege(:role, 'public.audit_log', 'SELECT') AS can_select,
                    has_table_privilege(:role, 'public.audit_log', 'INSERT') AS can_insert,
                    has_table_privilege(:role, 'public.audit_log', 'UPDATE') AS can_update,
                    has_table_privilege(:role, 'public.audit_log', 'DELETE') AS can_delete
                """
            ),
            {"role": TEST_APP_ROLE},
        )
        .mappings()
        .one()
    )
    assert dict(privileges) == {
        "can_select": True,
        "can_insert": True,
        "can_update": False,
        "can_delete": False,
    }
