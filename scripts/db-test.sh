#!/usr/bin/env bash
# Rebuilds a throwaway database on plain Postgres (no Docker needed), applies
# the Supabase shim, every migration, the seed, and the SQL test suite.
#   PGHOST/PGPORT/PGUSER control the server (defaults: localhost:5432 postgres)
#   ./scripts/db-test.sh            # migrations + seed + tests
#   SKIP_SEED=1 ./scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB:-teamnest_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB} with (force)" -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_supabase_shim.sql

for f in supabase/migrations/*.sql; do
  echo "→ migrate $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true
  test "${PIPESTATUS[0]}" -eq 0
done

if [[ -z "${SKIP_SEED:-}" ]]; then
  echo "→ seed"
  "${PSQL[@]}" -d "$DB" -f supabase/seed.sql > /dev/null
fi

for f in supabase/tests/[1-9]*.sql; do
  [[ -e "$f" ]] || continue
  echo "→ test $(basename "$f")"
  "${PSQL[@]}" -tA -d "$DB" -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //" | grep -v "^$"
  test "${PIPESTATUS[0]}" -eq 0
done
echo "✓ database checks passed (${DB})"
