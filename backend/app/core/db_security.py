"""Database least-privilege role setup and ISO 17025 append-only audit_log enforcement."""

import logging
import os
import re

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, make_url

logger = logging.getLogger(__name__)

_SAFE_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

_SET_CONFIG_SQL = text(
    """
    SELECT
        set_config('app.sec_user', :app_user, true),
        set_config('app.sec_pass', :app_password, true),
        set_config('app.sec_owner', :db_owner, true)
    """
)

_ENSURE_ROLES_SQL = text(
    """
    DO $do$
    DECLARE
        v_app text := current_setting('app.sec_user');
        v_pass text := current_setting('app.sec_pass');
        v_owner text := COALESCE(NULLIF(current_setting('app.sec_owner'), ''), current_user);
        v_is_super boolean := false;
        v_tbl text;
        v_seq text;
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_app) THEN
            IF v_pass <> '' THEN
                EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', v_app, v_pass);
            ELSE
                EXECUTE format('CREATE ROLE %I NOLOGIN', v_app);
            END IF;
        ELSIF v_pass <> '' THEN
            EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', v_app, v_pass);
        END IF;

        EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), v_app);
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_app);

        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
            v_owner,
            v_app
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT USAGE, SELECT ON SEQUENCES TO %I',
            v_owner,
            v_app
        );

        FOR v_tbl IN
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename NOT IN ('audit_log', 'alembic_version')
        LOOP
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
                v_tbl,
                v_app
            );
        END LOOP;

        FOR v_seq IN
            SELECT sequencename
            FROM pg_sequences
            WHERE schemaname = 'public'
        LOOP
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO %I', v_seq, v_app);
        END LOOP;

        IF to_regclass('public.audit_log') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.audit_log FROM %I', v_app);
            EXECUTE format('GRANT SELECT, INSERT ON TABLE public.audit_log TO %I', v_app);
        END IF;

        IF to_regclass('public.alembic_version') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.alembic_version FROM %I', v_app);
            EXECUTE format('GRANT SELECT ON TABLE public.alembic_version TO %I', v_app);
        END IF;

        SELECT rolsuper INTO v_is_super FROM pg_roles WHERE rolname = current_user;
        IF v_is_super THEN
            EXECUTE format(
                $fn$
                CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only()
                RETURNS event_trigger
                LANGUAGE plpgsql
                SECURITY DEFINER
                AS $body$
                BEGIN
                    IF to_regclass('public.audit_log') IS NOT NULL THEN
                        EXECUTE %L;
                        EXECUTE %L;
                    END IF;
                    IF to_regclass('public.alembic_version') IS NOT NULL THEN
                        EXECUTE %L;
                        EXECUTE %L;
                    END IF;
                END;
                $body$;
                $fn$,
                format('REVOKE ALL ON TABLE public.audit_log FROM %I', v_app),
                format('GRANT SELECT, INSERT ON TABLE public.audit_log TO %I', v_app),
                format('REVOKE ALL ON TABLE public.alembic_version FROM %I', v_app),
                format('GRANT SELECT ON TABLE public.alembic_version TO %I', v_app)
            );
            DROP EVENT TRIGGER IF EXISTS enforce_audit_log_privileges;
            CREATE EVENT TRIGGER enforce_audit_log_privileges
                ON ddl_command_end
                WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
                EXECUTE FUNCTION public.enforce_audit_log_append_only();
        END IF;
    END
    $do$;
    """
)


def validate_pg_identifier(name: str) -> str:
    """Validate a PostgreSQL identifier against safe ASCII identifier rules."""
    if not _SAFE_IDENT_RE.fullmatch(name):
        msg = f"Invalid PostgreSQL identifier: {name!r}"
        raise ValueError(msg)
    return name


def ensure_db_roles(
    connection: Connection,
    *,
    app_user: str,
    app_password: str | None = None,
    db_owner: str | None = None,
) -> None:
    """Create/sync the least-privilege app role and enforce append-only audit_log grants."""
    safe_user = validate_pg_identifier(app_user)
    safe_owner = validate_pg_identifier(db_owner) if db_owner is not None else ""
    connection.execute(
        _SET_CONFIG_SQL,
        {
            "app_user": safe_user,
            "app_password": app_password or "",
            "db_owner": safe_owner,
        },
    )
    connection.execute(_ENSURE_ROLES_SQL)


def sync_from_env() -> None:
    """Sync the runtime application role using MIGRATION_DATABASE_URL and DATABASE_URL."""
    migration_dsn = os.environ.get("MIGRATION_DATABASE_URL")
    app_dsn = os.environ.get("DATABASE_URL")
    if not migration_dsn or not app_dsn:
        return

    admin_url = make_url(migration_dsn)
    app_url = make_url(app_dsn)
    if not app_url.username or admin_url.username == app_url.username:
        return

    engine = create_engine(migration_dsn, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            ensure_db_roles(
                connection,
                app_user=app_url.username,
                app_password=app_url.password,
                db_owner=admin_url.username,
            )
        logger.info("Synchronized database privileges for role %s", app_url.username)
    finally:
        engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    sync_from_env()
