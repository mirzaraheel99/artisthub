# Artist Hub

Mobile app + admin dashboard for a hip-hop label. Fans discover the roster and
tap out to Spotify / YouTube / Apple Music; the label controls every piece of
content from the dashboard.

**Phase 1 (this branch): foundation + discovery.** Auth, referrals, rewards,
offers, events and notifications are later phases.

## Two rules the code is built around

1. **No in-app audio playback, anywhere.** Every listen action deep-links out to
   a real platform. The app is a router, not a player. This keeps plays counting
   where they matter and avoids music licensing entirely.
2. **Nothing rewards listening.** Rewards come from referrals only. Incentivised
   streams and views violate both Spotify's and YouTube's terms and would put the
   artists' own accounts at risk.

## Layout

```
infra/supabase/   Self-hosted Supabase: migrations, RLS, setup + backup scripts, SQL tests
admin/            Admin dashboard (Vite + React + TypeScript + Tailwind)
mobile/           Fan app (Expo + React Native)
docs/             Deploy guide and the Phase 1 device test script
```

## Getting it running

```bash
# 1. Backend
cd infra/supabase
cp .env.example .env          # fill in the secrets it describes
./scripts/setup.sh            # starts the stack and applies migrations

# 2. Admin dashboard
cd ../../admin
cp .env.example .env.local    # VITE_SUPABASE_URL + anon key
npm install && npm run dev    # http://localhost:5173

# 3. Sign up once in the dashboard, then grant yourself admin:
cd ../infra/supabase
./scripts/psql.sh -c "select public.promote_to_admin('you@example.com');"

# 4. Mobile app
cd ../../mobile
cp .env.example .env          # use your LAN IP, not localhost — see docs/PHASE-1-TESTING.md
npm install && npx expo start
```

## Checks

```bash
cd mobile  && npm run typecheck && npm test     # deep-link URL derivation
cd admin   && npm run typecheck && npm run build
cd infra/supabase && ./scripts/psql.sh -f tests/rls_check.sql
                     ./scripts/psql.sh -f tests/schema_check.sql
```

The two SQL test files are the evidence for the access-control and data-integrity
items on the pre-launch checklist. They impersonate a real user at the database
level, because the UI hiding something is not the same as the database refusing it.

## Brand

Gold `#FFB800` is the primary action colour; purple `#7C3AED` is the secondary,
reserved for rewards, progress and sponsor tiers so the two never compete for the
same job. Defined in `mobile/src/theme.ts` and the `@theme` block in
`admin/src/index.css` — change both together.
