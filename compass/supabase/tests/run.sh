#!/usr/bin/env bash
# Runs the RLS suite against a throwaway local Postgres.
#
# It stands up a fresh cluster, fakes the small part of Supabase the migration
# leans on (the auth schema, auth.uid(), auth.jwt(), the authenticated/anon
# roles), applies the migration, and exercises the policies as three separate
# users. Nothing here touches a real Supabase project.
#
# Usage: supabase/tests/run.sh
set -euo pipefail

PORT="${PGTEST_PORT:-5433}"
TMPROOT="$(mktemp -d)"
PGDATA="$TMPROOT/pgdata"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="/usr/lib/postgresql/16/bin:$PATH"

command -v initdb >/dev/null || { echo "postgres not installed; skipping"; exit 0; }

mkdir -p "$PGDATA"
if [ "$(id -u)" -eq 0 ]; then
  # postgres must be able to traverse into the temp dir mktemp made 0700.
  chmod 755 "$TMPROOT"
  chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
  RUN() { su postgres -c "PATH=$PATH $*"; }
else
  RUN() { eval "$*"; }
fi

cleanup() {
  RUN "pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$TMPROOT"
}
trap cleanup EXIT

RUN "initdb -D $PGDATA -A trust" >/dev/null
RUN "pg_ctl -D $PGDATA -l $PGDATA/log -o '-k /tmp -p $PORT -c listen_addresses=' -w start" >/dev/null

PSQL="psql -h /tmp -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$PSQL -f "$HERE/00_supabase_harness.sql"
$PSQL -f "$HERE/../migrations/0001_initial_schema.sql" 2>&1 | grep -v 'does not exist, skipping' || true
psql -h /tmp -p "$PORT" -U postgres -f "$HERE/01_rls_test.sql" 2>&1 \
  | grep -vE '^(SET|INSERT|DO|SELECT|UPDATE|DELETE|RESET)'
