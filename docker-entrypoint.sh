#!/bin/sh
set -e

echo "Running database migrations..."
prisma migrate deploy

if [ "${SKIP_SEED:-false}" != "true" ]; then
  node prisma/seed.mjs
fi

exec "$@"
