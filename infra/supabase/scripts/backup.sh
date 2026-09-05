#!/usr/bin/env bash
# Nightly-safe logical backup. Self-hosting means backups are yours to run:
#   0 4 * * *  /srv/artisthub/infra/supabase/scripts/backup.sh >> /var/log/ah-backup.log 2>&1
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$HERE/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

docker compose --project-directory "$HERE/stack" exec -T db \
  pg_dumpall -U postgres | gzip > "$OUT_DIR/artisthub-$STAMP.sql.gz"

# Keep 14 days locally; ship older ones off-box if you care about them.
find "$OUT_DIR" -name 'artisthub-*.sql.gz' -mtime +14 -delete
echo "backup written: $OUT_DIR/artisthub-$STAMP.sql.gz"
