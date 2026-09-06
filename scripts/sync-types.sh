#!/usr/bin/env bash
# The schema types are one file, used by both apps.
#
# mobile/src/lib/types.ts is canonical; the admin copy is generated from it.
# Copying by hand silently dropped table definitions twice during development.
# Each time, the admin build failed with "not assignable to type 'never'", which
# does not obviously mean "a table is missing from your types file" — hence this
# check running before every typecheck.
#
#   ./scripts/sync-types.sh          copy canonical -> admin
#   ./scripts/sync-types.sh --check  fail if they differ
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/mobile/src/lib/types.ts"
DEST="$ROOT/admin/src/lib/types.ts"

if [[ "${1:-}" == "--check" ]]; then
  if diff -q "$SRC" "$DEST" >/dev/null 2>&1; then
    echo "types.ts is in sync."
  else
    echo "types.ts has drifted between mobile and admin." >&2
    diff "$SRC" "$DEST" || true
    echo "Run ./scripts/sync-types.sh to copy the canonical file across." >&2
    exit 1
  fi
else
  cp "$SRC" "$DEST"
  echo "Copied mobile/src/lib/types.ts -> admin/src/lib/types.ts"
fi
