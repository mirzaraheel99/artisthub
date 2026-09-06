#!/usr/bin/env bash
# Inspect the target server and report whether Artist Hub can be installed
# without disturbing anything already running on it.
#
# READ ONLY. This script changes nothing. Run it on the server, read the report,
# and only then run setup.sh.
#
#   scp -r infra/supabase/scripts/preflight.sh user@server:/tmp/
#   bash /tmp/preflight.sh
set -uo pipefail

BLOCKERS=0
WARNINGS=0

hr()   { printf '%s\n' "------------------------------------------------------------"; }
ok()   { printf '  OK       %s\n' "$1"; }
warn() { printf '  WARN     %s\n' "$1"; WARNINGS=$((WARNINGS+1)); }
bad()  { printf '  BLOCKER  %s\n' "$1"; BLOCKERS=$((BLOCKERS+1)); }
note() { printf '           %s\n' "$1"; }

port_busy() {                      # port_busy <port>  -> 0 if in use
  if command -v ss >/dev/null 2>&1; then
    ss -lntH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  else
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  fi
}

echo
echo "Artist Hub — server preflight"
echo "Host: $(hostname)   Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
hr

# ---------------------------------------------------------------------------
echo "What is already listening"
hr
if command -v ss >/dev/null 2>&1 || command -v netstat >/dev/null 2>&1; then
  if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | tail -n +2 | awk '{printf "           %-24s %s\n", $4, $6}' | sort -u
  else
    netstat -lntp 2>/dev/null | tail -n +3 | awk '{printf "           %-24s %s\n", $4, $7}' | sort -u
  fi
else
  warn "Neither ss nor netstat is available; cannot enumerate listeners."
fi
echo

# The stack's defaults. Anything already bound here must be remapped rather
# than taken over — taking a port from a running application is exactly the
# kind of silent breakage this script exists to prevent.
echo "Ports the default Supabase stack wants"
hr
for entry in "8000:Kong API gateway" "5432:PostgreSQL" "54321:Studio" "4000:Realtime/analytics"; do
  port="${entry%%:*}"; label="${entry#*:}"
  if port_busy "$port"; then
    warn "$port is IN USE ($label) — remap this in .env, do not take it over."
  else
    ok "$port is free ($label)"
  fi
done
echo

# ---------------------------------------------------------------------------
echo "Docker"
hr
if command -v docker >/dev/null 2>&1; then
  ok "docker present: $(docker --version 2>/dev/null | head -1)"
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose v2 present"
  else
    bad "docker compose v2 not found. The stack requires it."
  fi

  if ! docker ps >/dev/null 2>&1; then
    warn "Cannot talk to the Docker daemon as this user. Re-run with sudo, or add the user to the docker group."
  else
    running=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
    note "Containers currently running: $running"
    docker ps --format '           {{.Names}}  ({{.Image}})  {{.Ports}}' 2>/dev/null | head -20

    # The upstream compose project uses fixed service names. A name collision
    # would make `docker compose up` adopt or recreate somebody else's container.
    for name in supabase-db supabase-kong supabase-auth supabase-rest supabase-storage supabase-studio realtime-dev; do
      if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
        bad "A container named '$name' already exists. Set COMPOSE_PROJECT_NAME to something unique before installing."
      fi
    done

    if docker network ls --format '{{.Name}}' 2>/dev/null | grep -qx "supabase_default"; then
      warn "Docker network 'supabase_default' already exists — another Supabase stack may be installed."
    fi

    for vol in $(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -i supabase); do
      warn "Existing Docker volume '$vol' — do NOT let a fresh install reuse or prune it."
    done
  fi
else
  bad "docker is not installed."
fi
echo

# ---------------------------------------------------------------------------
echo "Web server in front"
hr
FOUND_PROXY=0
for svc in nginx apache2 httpd caddy traefik; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc is running — Artist Hub should be proxied through it, not alongside it."
    FOUND_PROXY=1
  fi
done
for panel in /usr/local/psa /usr/local/cpanel /usr/local/CyberCP; do
  if [[ -d "$panel" ]]; then
    warn "Control panel detected at $panel. It rewrites web server config, so add the subdomain THROUGH the panel, never by hand-editing files."
    FOUND_PROXY=1
  fi
done
[[ "$FOUND_PROXY" -eq 0 ]] && note "No existing reverse proxy detected. Caddy can be installed to terminate TLS."
echo

# ---------------------------------------------------------------------------
echo "Capacity"
hr
if command -v free >/dev/null 2>&1; then
  total_mb=$(free -m | awk '/^Mem:/{print $2}')
  avail_mb=$(free -m | awk '/^Mem:/{print $7}')
  note "RAM total ${total_mb}MB, available ${avail_mb}MB"
  # The stack is roughly eight containers. Below ~2GB free it will start and
  # then thrash, which shows up as the neighbouring applications getting slow.
  if [[ "$avail_mb" -lt 1800 ]]; then
    bad "Under 1.8GB RAM available. Installing here risks starving the applications already on this box."
  elif [[ "$avail_mb" -lt 3000 ]]; then
    warn "Under 3GB available. Workable for a pilot, but watch memory once traffic starts."
  else
    ok "Sufficient RAM headroom."
  fi
fi

avail_gb=$(df -BG --output=avail /srv 2>/dev/null | tail -1 | tr -dc '0-9')
[[ -z "${avail_gb:-}" ]] && avail_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
note "Disk available on the install path: ${avail_gb}GB"
if [[ "${avail_gb:-0}" -lt 20 ]]; then
  bad "Under 20GB free. Postgres plus Storage plus backups will fill this."
elif [[ "${avail_gb:-0}" -lt 40 ]]; then
  warn "Under 40GB free. Ship backups off-box and watch growth."
else
  ok "Sufficient disk."
fi
echo

# ---------------------------------------------------------------------------
echo "Install path"
hr
TARGET=${TARGET:-/srv/artisthub}
if [[ -e "$TARGET" ]]; then
  if [[ -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
    warn "$TARGET already exists and is not empty. Review it before installing."
  else
    ok "$TARGET exists and is empty."
  fi
else
  ok "$TARGET does not exist and will be created. Nothing else is touched."
fi
echo

hr
echo "Summary: $BLOCKERS blocker(s), $WARNINGS warning(s)."
echo
if [[ "$BLOCKERS" -gt 0 ]]; then
  echo "Do not run setup.sh yet. Resolve the blockers above first."
  exit 1
fi
if [[ "$WARNINGS" -gt 0 ]]; then
  echo "Installation looks possible, but read each warning — every one of them"
  echo "describes a way this install could disturb something already running."
  exit 0
fi
echo "Clear to install. Send this output back before running setup.sh."
