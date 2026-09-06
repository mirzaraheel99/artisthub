#!/usr/bin/env bash
# Run every database test suite.
#
# These are the evidence for the access-control and economic items on the
# pre-launch checklist. They impersonate real roles at the database level,
# because the UI hiding a control is not the same as the database refusing it.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$HERE/stack"
PSQL=${PSQL:-"docker compose --project-directory $STACK_DIR exec -T db psql -U postgres -d postgres"}

cd "$HERE"
FAILED=0

for suite in tests/0[12]_*.sql; do
  echo "== $(basename "$suite")"
  output=$($PSQL -q -f "$suite" 2>&1)
  echo "$output" | grep -E "PASS|FAIL" | sed 's/^psql:[^ ]* //; s/^NOTICE:  //'
  if echo "$output" | grep -q "FAIL"; then FAILED=1; fi
  if echo "$output" | grep -qiE "^psql.*ERROR"; then
    echo "  (unexpected SQL error)"; echo "$output" | grep -iE "^psql.*ERROR" | head -3
    FAILED=1
  fi
  echo
done

echo "== 03_concurrency.sh"
if PSQL="$PSQL" bash tests/03_concurrency.sh; then :; else FAILED=1; fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All database tests passed."
else
  echo "Some database tests FAILED."
  exit 1
fi
