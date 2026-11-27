#!/usr/bin/env bash
set -euo pipefail

APP_DB_USER="${APP_DB_USER:-lab_app}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-lab_app}"
DB_OWNER="${POSTGRES_USER:-lab}"
DB_NAME="${POSTGRES_DB:-lab}"

psql -v ON_ERROR_STOP=1 \
  --username "$DB_OWNER" \
  --dbname "$DB_NAME" \
  -v app_user="$APP_DB_USER" \
  -v app_password="$APP_DB_PASSWORD" \
  -v db_owner="$DB_OWNER" \
  -v db_name="$DB_NAME" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'app_user')\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'db_owner',
  :'app_user'
)\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
  :'db_owner',
  :'app_user'
)\gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user')\gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user')\gexec

SELECT format(
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
  END;
  $body$;
  $fn$,
  format('REVOKE ALL ON TABLE public.audit_log FROM %I', :'app_user'),
  format('GRANT SELECT, INSERT ON TABLE public.audit_log TO %I', :'app_user')
)\gexec

DROP EVENT TRIGGER IF EXISTS enforce_audit_log_privileges;
CREATE EVENT TRIGGER enforce_audit_log_privileges
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
  EXECUTE FUNCTION public.enforce_audit_log_append_only();
EOSQL
