#!/bin/bash
# Runs the test suite against a dedicated SQLite file, never the dev database —
# integration tests wipe tables between runs, which would be destructive against dev.db.
set -e
cd "$(dirname "$0")/.."

export DATABASE_URL="file:./test.db"
rm -f prisma/test.db
npx prisma db push --skip-generate --schema prisma/schema.prisma > /dev/null
npx vitest run "$@"
