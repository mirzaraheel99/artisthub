#!/usr/bin/env bash
# Apply every migration in order. Migrations are written to be re-runnable, so
# this is safe to run repeatedly.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$HERE/stack"

for f in "$HERE"/migrations/*.sql; do
  echo "==> $(basename "$f")"
  docker compose --project-directory "$STACK_DIR" exec -T db \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$f"
done

echo "Migrations applied."
