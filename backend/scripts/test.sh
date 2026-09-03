#!/bin/bash
# Runs the test suite against a dedicated Postgres database, never the dev
# database — integration tests wipe tables between runs, which would be
# destructive against DATABASE_URL. Point TEST_DATABASE_URL at a database
# that exists only for this (see backend/.env.example) — a second Supabase
# project or a local Postgres both work.
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$TEST_DATABASE_URL" ]; then
  echo "TEST_DATABASE_URL is not set — point it at a Postgres database used only for tests (see backend/.env.example)." >&2
  exit 1
fi

# schema.prisma also reads DIRECT_URL for DDL (db push/migrate bypass the
# pooled pgbouncer connection for that). Point BOTH at the test database —
# if DIRECT_URL were left as whatever .env set for dev/prod, --force-reset
# below would drop the WRONG database.
export DATABASE_URL="$TEST_DATABASE_URL"
export DIRECT_URL="$TEST_DATABASE_URL"

# --force-reset drops and recreates every table from the schema before each
# run (the Postgres equivalent of the old `rm -f test.db`) — --accept-data-loss
# is required by prisma db push whenever a reset is involved, safe here since
# this database only ever holds throwaway test data.
npx prisma db push --force-reset --accept-data-loss --skip-generate > /dev/null
npx vitest run "$@"
