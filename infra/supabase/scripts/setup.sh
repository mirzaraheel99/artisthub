#!/usr/bin/env bash
# Stand up the self-hosted Supabase stack and apply Artist Hub migrations.
#
# We pull the compose stack from the upstream supabase/supabase repo rather than
# vendoring a copy: the service list and image tags change between releases, and
# a hand-maintained fork drifts into subtle breakage. We only own the .env and
# the migrations.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$HERE/stack"
SUPABASE_REF="${SUPABASE_REF:-master}"

if [[ ! -f "$HERE/.env" ]]; then
  echo "error: $HERE/.env not found. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

if [[ ! -d "$STACK_DIR" ]]; then
  echo "==> Fetching the Supabase docker stack ($SUPABASE_REF)"
  tmp="$(mktemp -d)"
  git clone --depth 1 --filter=blob:none --sparse \
    --branch "$SUPABASE_REF" https://github.com/supabase/supabase "$tmp/supabase"
  git -C "$tmp/supabase" sparse-checkout set docker
  mv "$tmp/supabase/docker" "$STACK_DIR"
  rm -rf "$tmp"
fi

cp "$HERE/.env" "$STACK_DIR/.env"

echo "==> Starting containers"
docker compose --project-directory "$STACK_DIR" up -d

echo "==> Waiting for Postgres"
for _ in $(seq 1 60); do
  if docker compose --project-directory "$STACK_DIR" exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

"$HERE/scripts/migrate.sh"

echo
echo "Stack is up."
echo "  API     http://localhost:8000"
echo "  Studio  http://localhost:8000  (login with DASHBOARD_USERNAME / DASHBOARD_PASSWORD)"
echo
echo "Next: sign up once in the admin app, then run"
echo "  ./scripts/psql.sh -c \"select public.promote_to_admin('you@example.com');\""
