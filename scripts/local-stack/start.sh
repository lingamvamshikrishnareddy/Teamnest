#!/usr/bin/env bash
# Docker-free local Supabase-compatible stack for development and E2E:
#   Postgres (yours) + Supabase Auth (GoTrue) + PostgREST + gateway on :54321
#
# Prereqs: a Postgres 15+ server, and the two binaries:
#   AUTH_BIN       Supabase Auth binary  (github.com/supabase/auth/releases)
#   POSTGREST_BIN  PostgREST binary      (github.com/PostgREST/postgrest/releases)
# Usage:
#   PGHOST=/tmp PGPORT=54322 AUTH_BIN=/opt/tnstack/auth/auth POSTGREST_BIN=/opt/tnstack/postgrest/postgrest \
#     ./scripts/local-stack/start.sh [--reset]
# Prints the anon key to put in apps/web/.env.local and apps/mobile/.env.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${STACK_DB:-teamnest_local}"
PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-5432}"; PGUSER="${PGUSER:-postgres}"
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
LOG_DIR="${LOG_DIR:-.local-stack}"
mkdir -p "$LOG_DIR"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER")
TCP_HOST=$([[ "$PGHOST" == /* ]] && echo 127.0.0.1 || echo "$PGHOST")

if [[ "${1:-}" == "--reset" ]] || ! "${PSQL[@]}" -d "$DB" -c 'select 1' >/dev/null 2>&1; then
  echo "→ creating database $DB"
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
  "${PSQL[@]}" -d "$DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login noinherit createrole password 'auth'; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'auth'; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
grant create on database $DB to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
alter database $DB set search_path = "\$user", public, extensions;
alter database $DB set app.encryption_key = 'local-dev-only-not-a-secret';
SQL
  echo "→ auth migrations"
  DATABASE_URL="postgres://supabase_auth_admin:auth@$TCP_HOST:$PGPORT/$DB?sslmode=disable&search_path=auth" \
  GOTRUE_DB_DRIVER=postgres GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations" \
  API_EXTERNAL_URL=http://127.0.0.1:54321 GOTRUE_SITE_URL=http://127.0.0.1:3000 GOTRUE_JWT_SECRET="$JWT_SECRET" \
    "$AUTH_BIN" migrate > "$LOG_DIR/auth-migrate.log" 2>&1
  "${PSQL[@]}" -d "$DB" -c "grant usage on schema auth to anon, authenticated, service_role; grant execute on all functions in schema auth to anon, authenticated, service_role;"
  echo "→ app migrations + seed"
  for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true; done
  "${PSQL[@]}" -d "$DB" -f supabase/seed.sql > /dev/null
fi

echo "→ starting services (logs in $LOG_DIR/)"
PORT=9999 GOTRUE_API_HOST=127.0.0.1 GOTRUE_DB_DRIVER=postgres \
DATABASE_URL="postgres://supabase_auth_admin:auth@$TCP_HOST:$PGPORT/$DB?sslmode=disable&search_path=auth" \
API_EXTERNAL_URL=http://127.0.0.1:54321 GOTRUE_SITE_URL=http://127.0.0.1:3000 \
GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_DISABLE_SIGNUP=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true GOTRUE_MFA_MAX_ENROLLED_FACTORS=10 \
GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook \
GOTRUE_RATE_LIMIT_HEADER="" GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true \
  nohup "$AUTH_BIN" serve > "$LOG_DIR/auth.log" 2>&1 &
echo $! > "$LOG_DIR/auth.pid"

PGRST_DB_URI="postgres://authenticator:auth@$TCP_HOST:$PGPORT/$DB?sslmode=disable" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3001 PGRST_DB_EXTRA_SEARCH_PATH="public,extensions" PGRST_DB_MAX_ROWS=10000 PGRST_LOG_LEVEL="${PGRST_LOG_LEVEL:-error}" \
  nohup "$POSTGREST_BIN" > "$LOG_DIR/postgrest.log" 2>&1 &
echo $! > "$LOG_DIR/postgrest.pid"

nohup node scripts/local-stack/gateway.mjs > "$LOG_DIR/gateway.log" 2>&1 &
echo $! > "$LOG_DIR/gateway.pid"

sleep 2
ANON=$(node scripts/local-stack/jwt.mjs "$JWT_SECRET" anon)
echo "✓ stack up: http://127.0.0.1:54321"
echo "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON"
