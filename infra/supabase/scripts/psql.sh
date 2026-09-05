#!/usr/bin/env bash
# Open a psql shell (or run -c "...") against the stack's database.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker compose --project-directory "$HERE/stack" exec -T db \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
