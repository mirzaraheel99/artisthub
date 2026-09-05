# Deploying to the Hetzner server

Self-hosting Supabase is free — the software is open source and you pay only for
the box. What you take on in exchange is operations: backups, upgrades, TLS and
mail are yours now, not a provider's. This page covers all four.

## Sizing

The stack is roughly eight containers (Postgres, GoTrue, PostgREST, Storage,
Realtime, Kong, Studio, Meta). **4GB RAM is the realistic floor** — a CPX21 at
about €8/month. On 2GB it will start and then thrash under any real load.

## 1. Server prep

```bash
ssh root@YOUR_SERVER
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Only SSH and HTTPS reach the outside world. Postgres (5432) and the API
# gateway (8000) must never be exposed directly — the reverse proxy in step 3
# is the only public entrance.
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable
```

Create a non-root user and disable password SSH login before anything else goes
on this box.

## 2. The stack

```bash
mkdir -p /srv && cd /srv
git clone YOUR_REPO_URL artisthub && cd artisthub/infra/supabase

cp .env.example .env
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # JWT_SECRET
# Mint ANON_KEY and SERVICE_ROLE_KEY from JWT_SECRET:
#   https://supabase.com/docs/guides/self-hosting#api-keys

./scripts/setup.sh
```

`SERVICE_ROLE_KEY` bypasses every RLS policy in the database. It belongs on the
server and nowhere else — never in the mobile bundle, never in the admin
dashboard, never in a chat message.

## 3. A domain and TLS — not optional

**You cannot ship a bare IP to a mobile app.** No certificate authority issues
certs for IP addresses, so there is no https, and iOS App Transport Security
blocks plain http by default. Point a subdomain at the server first:

```
api.yourdomain.com   A   YOUR_SERVER_IP
```

Then put Caddy in front — it gets and renews Let's Encrypt certificates on its
own:

```bash
apt install -y caddy
cat > /etc/caddy/Caddyfile <<'EOF'
api.yourdomain.com {
    reverse_proxy localhost:8000
}
EOF
systemctl reload caddy
```

Then set `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL` in `.env` to
`https://api.yourdomain.com`, restart the stack, and point both apps at that URL.

## 4. Auth email

GoTrue ships with no mail provider. Phase 1 runs with `ENABLE_EMAIL_AUTOCONFIRM=true`
so you can test without one.

**Turn that off before real users exist.** With auto-confirm on, anyone can sign
up as any email address they do not own — including an address you later want to
make an admin. Add SMTP credentials (Resend, Postmark and SES all have usable
free tiers), set `ENABLE_EMAIL_AUTOCONFIRM=false`, and confirm that a signup
email actually arrives before you launch.

## 5. Backups

Nobody is doing this for you.

```bash
crontab -e
0 4 * * * /srv/artisthub/infra/supabase/scripts/backup.sh >> /var/log/ah-backup.log 2>&1
```

`backup.sh` keeps 14 days locally. Local copies do not survive the server dying,
so ship them off-box — Hetzner Object Storage or a Storage Box, via rclone or
`s3cmd`. **Restore one into a scratch database and confirm it works.** An
untested backup is not a backup.

## 6. Updating

```bash
cd /srv/artisthub && git pull
cd infra/supabase && ./scripts/migrate.sh    # migrations are re-runnable
docker compose --project-directory stack up -d
```

Take a backup before any upgrade that moves the Postgres major version.

## Checklist before real users

- [ ] Domain resolves and https works, with no bare-IP URL left in any config
- [ ] `SERVICE_ROLE_KEY` exists only in the server's `.env`
- [ ] `ENABLE_EMAIL_AUTOCONFIRM=false`, SMTP configured, signup email confirmed arriving
- [ ] Firewall allows only SSH and 443; ports 5432 and 8000 are not reachable from outside
- [ ] Backups running on cron, shipped off-box, and one restore actually tested
- [ ] `tests/rls_check.sql` and `tests/schema_check.sql` both all-PASS against production
