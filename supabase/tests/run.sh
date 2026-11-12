#!/usr/bin/env bash
# Tests the database rules (row-level security, limits, triggers) against a real
# Postgres: a fresh database → stand-ins for what Supabase provides → every
# migration from 0002 on → rules.test.sql, which acts as different players and
# checks what each is allowed to do.
#
#   npm run test:db
#
# Needs a Postgres server you can create databases on. Point it at one with the
# usual PGHOST / PGPORT / PGUSER / PGPASSWORD variables (CI uses a postgres:16
# service container). It only ever touches the database named below.
#
# 0001_init.sql (the PostGIS science schema) isn't part of the live database
# yet, so it isn't applied here.
set -euo pipefail
cd "$(dirname "$0")"
DB="${CLIPIT_TEST_DB:-clipit_rules_test}"
MIGRATIONS=../migrations

dropdb --if-exists "$DB"
createdb "$DB"
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" > /dev/null; }

run stubs.sql
last=""
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  name="$(basename "$f")"
  [ "$name" = "0001_init.sql" ] && continue
  # Rows written before the newest migration must survive it: seed them just before it runs.
  if [ "$name" = "0010_hardening.sql" ]; then run legacy.sql; fi
  run "$f" || { echo "FAILED applying $name"; exit 1; }
  last="$f"
done
# Migrations are run by hand in the SQL editor, sometimes twice: the newest must be safe to repeat.
run "$last" || { echo "FAILED re-applying $(basename "$last")"; exit 1; }
echo "applied $(ls "$MIGRATIONS"/*.sql | wc -l | tr -d ' ') migrations (newest one twice)"

out="$(psql -q -d "$DB" -f rules.test.sql 2>&1 | grep -E 'PASS|FAIL|ERROR' | sed 's/^.*NOTICE:  //' || true)"
echo "$out"
dropdb "$DB"
pass=$(grep -c '^PASS' <<< "$out" || true)
fail=$(grep -c -E '^FAIL|ERROR' <<< "$out" || true)
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] && [ "$pass" -gt 0 ]
