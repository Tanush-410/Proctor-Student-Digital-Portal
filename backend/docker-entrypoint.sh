#!/bin/sh
# Applies any pending migrations against whatever DATABASE_URL points to
# (the mounted volume in production) before the server starts — safe to run
# on every container start: a no-op if the schema is already current.
set -e
npx prisma migrate deploy --schema prisma/schema.prisma
exec node dist/index.js
