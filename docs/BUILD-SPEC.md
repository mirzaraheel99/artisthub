# Artist Hub — Complete Build Specification

> **How to use this document.** This is the full specification for a mobile app,
> a public web layer, an admin dashboard, an artist dashboard, and a self-hosted
> backend. It is written to be handed to an implementer or a reviewer. Section 15
> lists the attacks and failure modes this design is meant to survive — start
> there if you are pressure-testing it.
>
> Where a decision is still open it is marked **[OPEN]**. Do not silently pick a
> default for those; flag them.

---

## 1. What is being built

A record label operates a hip-hop roster and a hookah lounge in Houston. This
system connects the two: fans discover the roster in an app, tap out to real
streaming platforms, and earn lounge rewards by bringing friends through the
door. The label controls every piece of content and every economic parameter from
a dashboard.

Four audiences, four surfaces:

| Surface | Audience | Purpose |
|---|---|---|
| **Mobile app** (iOS + Android) | Fans | Discover roster, route out to streaming, earn and redeem rewards, see exclusive content, RSVP to events |
| **Public web** | Anyone with a shared link | Referral landing, artist pages, offer previews — converts to app install |
| **Admin dashboard** | Label staff | Content, economics, users, reports, notifications |
| **Artist dashboard** | Signed artists | Read-only view of their own engagement data |
| **Staff mode** (inside mobile app) | Lounge employees | Scan and redeem codes, check fans in |

### The business model in one paragraph

Rewards cost ~$3 against a $29.99 menu price. A reward is only paid out after a
referred friend physically visits the lounge and makes a purchase, so each payout
is funded by the visit that earned it. Redemption drives footfall on slow nights.
Once the Houston user base is proven, partner businesses in other cities fund the
same reward mechanics in exchange for the traffic — the offers marketplace is the
expansion mechanism, not a later monetisation.

---

## 2. Non-negotiable rules

These are constraints, not preferences. A design that violates any of them is
wrong regardless of how well it is built.

1. **No in-app audio or video playback of catalogue music.** Every listen action
   deep-links out to Spotify, YouTube or Apple Music. The app is a router, not a
   player. This avoids music licensing entirely and ensures plays count on the
   platforms where they matter. Exclusive Vault content (§9) is the sole
   exception and is label-owned, never distributed material.
2. **Nothing rewards listening, streaming, watching, or time in the app.** Points
   come only from referrals, physical visits, event attendance, and
   profile/lifecycle milestones. Incentivised streams violate Spotify and YouTube
   terms and enforcement lands on the *artist's* account.
3. **No hardcoded content or economics.** Every artist, track, link, reward,
   threshold, point rule, offer, event, blackout window and notification is
   managed from the admin dashboard.
4. **Security is enforced in the database, not the UI.** Every access rule is a
   Row Level Security policy or a constraint. UI hiding is a convenience, never a
   control.
5. **Money-affecting state changes are server-side.** A client never supplies a
   point amount, a referral status, a reward eligibility, or a redemption result.

---

## 3. Technology and infrastructure

- **Mobile:** React Native + Expo (managed workflow), React Navigation (native
  stack + bottom tabs), Zustand, Expo Linking / Notifications / Haptics /
  Camera, `react-native-qrcode-svg`, `react-native-reanimated`.
- **Backend:** Self-hosted Supabase (Postgres, GoTrue auth, PostgREST, Storage,
  Edge Functions) via Docker Compose.
- **Admin + artist dashboard:** Vite + React + TypeScript + Tailwind, Recharts.
- **Public web:** Same stack as the dashboard, separate build, server-rendered or
  statically generated for SEO on artist pages.

### Deployment constraints

The server is an existing live Hetzner box already running unrelated
applications. The deployment must not disturb them.

- Everything under `/srv/artisthub/`. No writes outside that path.
- A dedicated Docker network and a distinct compose project name.
- All container ports bound to `127.0.0.1` only. Nothing new listens publicly.
- The existing web server proxies a subdomain to the stack. Do not install a
  second reverse proxy. **[OPEN]** — which web server, and which ports are free,
  must be confirmed before writing the deploy config.
- **A bare IP cannot be shipped to a mobile app.** No certificate authority
  issues certs for IP addresses, so there is no HTTPS, and iOS App Transport
  Security blocks cleartext. A domain with TLS is a prerequisite, not a polish
  item.
- `SERVICE_ROLE_KEY` bypasses all RLS. Server-side only. Never in a mobile
  bundle, a web bundle, or a repository.
- `ENABLE_EMAIL_AUTOCONFIRM` must be `false` before any real user exists.
  Otherwise anyone can register an address they do not control.
- Backups are the operator's responsibility: nightly `pg_dumpall`, shipped
  off-box, with at least one tested restore before launch.

---

## 4. Design system

**Feel:** modern hip-hop culture app. Bold, confident, street-influenced but
clean. Full-bleed photography, heavy display type, high contrast. Not a stock UI
kit, not pastel rounded cards, not emoji-driven.

### Colour

Dark-first. Gold is the primary action colour; purple is the secondary, reserved
for rewards, progress and sponsor tiers, so the two never compete for the same
job on one screen.

```
Ground          #0A0A0A
Surface         #111111
Surface raised  #171717
Border          #2E2E2E
Text            #F5F5F5
Text muted      #8B8B8B

Gold (primary)  #FFB800    dim #D99C00
Purple (2nd)    #7C3AED    dim #6428D4

Danger          #EF4444
Success         #22C55E

Platform accents, used only as thin indicators on listen buttons:
Spotify #1DB954   YouTube #FF0000   Apple Music #FA243C
```

Semantic colour (success / warning / danger) is separate from the brand accents
and never substitutes for them.

**Admin and artist dashboards** use a neutral high-contrast document palette —
near-black on white in light mode, near-white on near-black in dark mode — with
gold and purple as sparing accents only. Both themes must be fully specified;
readability at long sittings takes priority over brand expression on these
surfaces.

### Typography

- **Display** (artist names, screen titles): heavy, tight-tracked sans — album
  cover energy. Weight 800, letter-spacing -0.5.
- **Body:** clean, highly readable, generous line height (1.5–1.6).
- **Utility / data:** monospaced with `tabular-nums` wherever figures align in
  columns — codes, counts, currency, reports.

### Motion and feedback

| Moment | Treatment |
|---|---|
| Card press | Scale to 0.97, spring, under 120ms |
| Screen transition | Shared-element continuity between grid card and profile hero |
| Progress bars | Fill with easing, never a jump |
| Reward unlock | Bold celebratory flash or confetti + `Haptics.notificationAsync(Success)` |
| Referral confirmed | Medium impact haptic + progress bar animates to new value |
| Redemption success | Success haptic, full-screen green state, unmistakable across a dim room |
| Redemption failure | Error haptic, full-screen red state, reason in plain words |
| Listen button tap | Light impact haptic |

All motion respects reduced-motion settings. Every screen has a designed
loading, empty, and error state — never a blank view or an unexplained spinner.

### Accessibility and physical context

- Minimum touch target 44×44pt.
- Staff redemption screens must be readable at arm's length in a dark, loud
  lounge: large type, colour *and* text to convey result, no reliance on subtle
  tint.
- Text contrast ≥ 4.5:1 against its actual background.
- Screen reader labels on all interactive elements.

### Texture

A very subtle grain overlay (opacity ≈ 0.035) over hero imagery for a print
feel. It should read as texture; if it is consciously visible it is too strong.

---

## 5. Data model

Fully normalised. Design principles applied throughout:

- **No repeating column groups.** Streaming links are rows in `track_links`, not
  three columns on `tracks` — adding a fourth platform must be a row, not a
  migration.
- **No mutable balances.** Points are an append-only ledger; a balance is always
  derived. A stored counter drifts and cannot be audited.
- **Lookup tables over free text** for anything filtered or grouped (cities,
  categories, roles).
- **Many-to-many where reality is many-to-many** (event line-ups, user roles).
- **Every money- or trust-affecting row is immutable once written** and corrected
  by a compensating row, never an in-place edit.

### 5.1 Identity

```
cities
  id, name, state, timezone, is_active, created_at

profiles                          -- 1:1 with auth.users
  id (fk auth.users, pk), display_name, phone_e164, phone_verified_at,
  email, referral_code (unique), referred_by (fk profiles, nullable),
  city_id (fk cities), is_banned, ban_reason, banned_at, banned_by,
  created_at
  CHECK (referred_by IS NULL OR referred_by <> id)

roles                             -- lookup
  code pk ('fan' | 'staff' | 'artist' | 'admin'), description

user_roles                        -- many-to-many; a person can be staff AND artist
  user_id (fk profiles), role_code (fk roles), granted_by, granted_at
  PRIMARY KEY (user_id, role_code)

devices
  id, user_id (fk profiles), install_id, platform ('ios'|'android'),
  model, first_seen_at, last_seen_at
  UNIQUE (user_id, install_id)

push_tokens
  id, user_id (fk profiles), device_id (fk devices), token, platform,
  created_at, revoked_at
  UNIQUE (token) WHERE revoked_at IS NULL
```

`profiles.role` as a single column is wrong: a lounge employee who is also a
signed artist is a real case. `user_roles` handles it. `push_token` on `profiles`
is likewise wrong — one person has multiple devices.

### 5.2 Venues

```
venues
  id, city_id (fk cities), name, address, timezone,
  is_owned,                       -- true = our lounge; false = partner venue
  is_active, created_at

venue_staff
  id, venue_id (fk venues), user_id (fk profiles),
  is_active, granted_by, granted_at, revoked_at
  UNIQUE (venue_id, user_id) WHERE revoked_at IS NULL
```

`is_owned` is what makes multi-city work: in Houston the label funds rewards; in
Dallas a partner venue does. Same mechanics, different funder.

### 5.3 Roster and catalogue

```
artists
  id, name, slug (unique), bio, photo_url, city_id (fk cities),
  install_code (unique),          -- artist's own trackable install link
  is_featured, sort_order, is_active, created_at, updated_at

artist_members                    -- links a signed artist to their login
  artist_id (fk artists), user_id (fk profiles), PRIMARY KEY (artist_id, user_id)

link_platforms                    -- lookup: spotify, youtube, apple, tidal, …
  code pk, display_name, url_pattern, native_scheme_template, is_active

artist_links
  id, artist_id (fk artists), platform_code (fk link_platforms), url
  UNIQUE (artist_id, platform_code)

social_platforms                  -- lookup: instagram, tiktok, x, …
  code pk, display_name, url_pattern

artist_socials
  id, artist_id (fk artists), platform_code (fk social_platforms), url
  UNIQUE (artist_id, platform_code)

tracks
  id, artist_id (fk artists), title, cover_art_url, release_date,
  is_featured, is_active, created_at, updated_at

track_links
  id, track_id (fk tracks), platform_code (fk link_platforms), url
  UNIQUE (track_id, platform_code)
  CHECK (url matches link_platforms.url_pattern)   -- enforced by trigger

link_clicks
  id (bigserial), track_link_id (fk track_links), user_id (fk profiles, null),
  device_id (fk devices, null), platform_code, city_id,
  opened_via ('native'|'web'|'failed'),
  clicked_at
```

A track must have at least one row in `track_links` — enforced by a deferred
constraint trigger. A track that routes nowhere is meaningless in an app with no
player.

`opened_via` is what proves deep links work in production: it distinguishes
"opened the Spotify app" from "fell back to the web player".

### 5.4 Exclusive content (the Vault)

```
exclusive_posts
  id, artist_id (fk artists), title, body, media_url, media_type,
  publish_at, expires_at, is_published, created_by, created_at

exclusive_post_views
  post_id (fk exclusive_posts), user_id (fk profiles), first_viewed_at
  PRIMARY KEY (post_id, user_id)
```

This is label-owned material — snippets, studio footage, scrapped verses — that
exists nowhere else. It is not distributed catalogue and carries no streaming
link. It is the retention engine: a fixed weekly slot builds the habit of
opening the app.

### 5.5 Points ledger

```
point_rules                       -- admin-editable earn rates
  code pk, description, points, daily_cap, is_active, updated_at
  -- seed: referral_confirmed 100, venue_checkin 25, event_attended 40,
  --       birthday 50, monthly_streak 75

point_transactions                -- APPEND ONLY. No UPDATE, no DELETE.
  id, user_id (fk profiles), rule_code (fk point_rules, nullable),
  points,                         -- may be negative (spend / reversal)
  source_type ('referral'|'checkin'|'event'|'reward_purchase'|'adjustment'|'reversal'),
  source_id, note, created_by, created_at
  UNIQUE (source_type, source_id, rule_code)   -- idempotency: no double-award
```

Balance is `SELECT sum(points) WHERE user_id = ?`. Never store it. A mistake is
corrected by inserting a reversal row, which preserves the audit trail. The
uniqueness constraint on `(source_type, source_id, rule_code)` is what makes
award operations safe to retry.

### 5.6 Rewards

```
blackout_rules
  id, name, weekday_mask,         -- bitmask, Mon=1 … Sun=64
  start_time, end_time, is_active
  -- default: Fri+Sat, 20:00–02:00, evaluated in the VENUE's timezone

reward_catalog
  id, name, description,
  point_cost,
  unit_cost_cents,                -- what it actually costs the business
  menu_value_cents,               -- what the fan perceives
  requires_purchase,              -- the attach rule
  blackout_rule_id (fk, nullable),
  validity_days,                  -- 30 small, 90 large
  monthly_issue_cap,              -- liability ceiling; null = uncapped
  max_per_user_per_visit,         -- default 1
  is_active, sort_order

reward_grants
  id, user_id (fk profiles), reward_id (fk reward_catalog),
  redemption_code (unique),
  granted_at, expires_at,
  redeemed_at, redeemed_venue_id (fk venues), redeemed_by_staff_id (fk profiles),
  voided_at, void_reason, voided_by
  CHECK (redeemed_at IS NULL OR voided_at IS NULL)   -- never both
```

`unit_cost_cents` and `menu_value_cents` are separate on purpose: the fan sees
one number, the cost-exposure report uses the other.

### 5.7 Referrals

```
referrals
  id, referrer_id (fk profiles), referred_user_id (fk profiles),
  status ('pending'|'confirmed'|'rejected'),
  created_at, confirmed_at,
  confirming_redemption_id (fk reward_grants, nullable),
  rejected_reason
  UNIQUE (referred_user_id)          -- a person can be referred exactly once, ever
  CHECK (referrer_id <> referred_user_id)
  CHECK (status <> 'confirmed' OR confirming_redemption_id IS NOT NULL)
```

**The confirmation rule.** A referral moves to `confirmed` only when the referred
user redeems their own welcome offer, in a venue, scanned by staff. Not on
install, not on signup.

This is the core anti-fraud mechanism. A fabricated account cannot walk through a
door. It also means every payout is funded: the referrer's reward is earned only
after the referred person physically visited and made a purchase.

The rejected alternative — requiring the referred person to *also* refer someone
— fails because it puts the referrer's reward behind an action they cannot
control, which is demotivating and reduces participation.

### 5.8 Visits

```
venue_visits
  id, user_id (fk profiles), venue_id (fk venues),
  staff_id (fk profiles),         -- who scanned
  checked_in_at
  UNIQUE (user_id, venue_id, date(checked_in_at))   -- one check-in per day
```

### 5.9 Businesses, offers, events

```
business_categories
  id, name, slug, sort_order

businesses
  id, city_id (fk cities), name, logo_url, category_id (fk business_categories),
  address, contact_name, contact_email, contact_phone,
  tier ('basic'|'featured'|'sponsor'), is_active, created_at

offers
  id, business_id (fk businesses), title, description, terms,
  starts_on, ends_on, redemption_type ('in_store_code'|'link_out'), link_url,
  max_redemptions, max_per_user, is_active, created_at
  CHECK (ends_on IS NULL OR ends_on >= starts_on)

offer_redemptions
  id, offer_id (fk offers), user_id (fk profiles),
  redeemed_at, staff_id (fk profiles, nullable), venue_id (fk venues, nullable)
  UNIQUE (offer_id, user_id) WHERE max_per_user = 1   -- partial, enforced by trigger

events
  id, venue_id (fk venues), title, description,
  starts_at, ends_at, is_published, created_at

event_artists                     -- an event has a LINE-UP, not one artist
  event_id (fk events), artist_id (fk artists), billing_order
  PRIMARY KEY (event_id, artist_id)

event_rsvps
  event_id (fk events), user_id (fk profiles),
  created_at, attended_at, attended_scanned_by
  PRIMARY KEY (event_id, user_id)
```

### 5.10 Notifications

```
notification_campaigns
  id, title, body, deep_link,
  segment (jsonb),                -- {city_id, artist_id, has_unredeemed_reward, …}
  scheduled_for, sent_at, status ('draft'|'scheduled'|'sending'|'sent'|'failed'),
  created_by, created_at

notification_deliveries
  id, campaign_id (fk notification_campaigns), user_id (fk profiles),
  push_token_id (fk push_tokens),
  sent_at, delivered_at, opened_at, error
  UNIQUE (campaign_id, user_id)
```

Per-user delivery rows are what let you prove a targeted send reached only the
intended segment.

### 5.11 Audit and abuse

```
audit_log                         -- APPEND ONLY
  id, actor_id (fk profiles, nullable), action, entity_type, entity_id,
  before (jsonb), after (jsonb), ip, user_agent, created_at

abuse_flags
  id, user_id (fk profiles), flag_type, severity,
  detail (jsonb), status ('open'|'dismissed'|'actioned'),
  reviewed_by, reviewed_at, created_at

app_settings
  key pk, value (jsonb), updated_by, updated_at
```

Every admin write, every role grant, every reward void, every ban, and every
manual point adjustment writes to `audit_log`.

---

## 6. Roles and access model

| Role | Can do |
|---|---|
| **fan** | Read published content; read *own* profile, points, rewards, referrals; insert own link clicks and RSVPs |
| **staff** | Everything a fan can, plus: validate and redeem codes at their assigned venue, check fans in, view their own shift's redemptions |
| **artist** | Everything a fan can, plus: read aggregate engagement for *their own* artist record only |
| **admin** | Full read/write; role grants; economic parameters; reports |

Rules that must hold:

1. A user can edit their own profile but **cannot** change their own role,
   referral code, referral lineage, or ban status. Frozen by the policy's
   `WITH CHECK`, comparing against the current stored row.
2. There is **no path from client to admin.** The first admin is created with a
   direct database connection. Thereafter only an existing admin can grant it.
3. Staff permissions are **scoped to a venue**, not global. A Dallas partner's
   staff cannot redeem a Houston grant.
4. An artist reading engagement data is scoped through `artist_members`. Artist A
   requesting artist B's data gets nothing, enforced by policy, not by the query
   the dashboard happens to send.
5. A banned user's session is refused at the policy level, not just hidden in the
   UI.

---

## 7. Redemption: the critical path

This is the only place where money leaves the business, and the only flow where a
race condition costs real product. Specify it precisely.

### Sequence

1. Fan opens **My Rewards**, showing a QR encoding `redemption_code`.
2. Staff opens **Staff Mode** (visible only with the `staff` role) and scans, or
   types the code manually.
3. Server validates, in a single atomic statement:

```sql
UPDATE reward_grants
   SET redeemed_at = now(),
       redeemed_by_staff_id = :staff_id,
       redeemed_venue_id = :venue_id
 WHERE redemption_code = :code
   AND redeemed_at IS NULL          -- not already redeemed
   AND voided_at   IS NULL          -- not voided
   AND expires_at  > now()          -- not expired
RETURNING id;
```

Zero rows returned means refused. **The conditional UPDATE is the concurrency
control.** A read-then-write, or a check in application code, loses the race when
two staff members scan the same screenshot simultaneously — and that is exactly
what will be attempted.

4. Additional checks, all server-side:
   - Blackout window, evaluated in the **venue's** timezone, not the device's.
   - `requires_purchase` → staff must confirm a purchase was made.
   - `max_per_user_per_visit` against today's redemptions.
   - Staff is active at this venue.
5. On success: write `venue_visits`, award points via `point_transactions`, and
   if this grant is a welcome offer, confirm the corresponding referral and award
   the referrer.
6. Return an unmistakable full-screen result. Redemption happens in a dark, loud
   room — colour alone is not enough; state the outcome in words.

### Refusal reasons, each with its own plain-language message

`already redeemed` · `expired` · `voided` · `not found` · `blackout window` ·
`purchase required` · `limit reached for this visit` · `staff not authorised at
this venue` · `user is banned`

---

## 8. Anti-abuse: defence in depth

Redemption gating defeats fake accounts. It does not end the problem — it moves
the attack to **staff collusion**: an employee scanning welcome offers for visits
that never happened. In venue loyalty programs this is the most common fraud, and
it is almost always staff rather than customers.

| Layer | Defeats | Notes |
|---|---|---|
| **Phone verification at signup** | Disposable-email account farms | One verified number per account. Cheapest, highest leverage control available |
| **Redemption gate** | Anyone who never physically appears | §5.7 |
| **Staff attribution on every scan** | Collusion | Log *which employee*. One person scanning 40 welcome offers in a shift is only visible if attribution is captured |
| **Referrer ≠ scanning staff** | The direct internal path | Database constraint, not a UI check |
| **Velocity flags** | Clustered abuse | Same device / IP / rapid signups → `abuse_flags` for human review. **Do not auto-ban**: shared venue Wi-Fi false-positives constantly |
| **One referral per referred user, ever** | Re-referral cycling | `UNIQUE (referred_user_id)` |
| **Idempotent point awards** | Replayed award calls | `UNIQUE (source_type, source_id, rule_code)` |

Every one of these is invisible to an honest fan. None adds a step to the normal
flow.

---

## 9. Economic guardrails

All admin-configurable. All enforced server-side.

| Guardrail | Mechanism | Why |
|---|---|---|
| **Attach a purchase** | `reward_catalog.requires_purchase` | Turns a giveaway into a discount on a sale. Nobody walks in, takes free wings, and leaves |
| **Blackout prime hours** | `blackout_rules`, venue timezone | Protects peak revenue; pushes redemption to slow nights. Converts a cost into demand-shifting |
| **Expiry** | `validity_days` → `expires_at` | Creates urgency; 30–50% typically go unredeemed. Without it, liability is unbounded |
| **One per visit** | `max_per_user_per_visit` | Stops stacking three rewards into one free night |
| **Monthly issue cap** | `monthly_issue_cap` | A viral promotion is discovered on a dashboard, not in the food cost |
| **Staff scan required** | No self-redemption path exists | Audit trail; prevents screenshot self-service |

### Reward ladder **[OPEN — awaiting sign-off]**

| Confirmed referrals | Reward | Menu value | Unit cost |
|---|---|---|---|
| 1 | Mozzarella sticks | $8.99 | $1.50 |
| 3 | Free wings | $15.99 | $3.00 |
| 6 | Free hookah | $29.99 | $3.00 |
| every 6 after | Free hookah, repeating | $29.99 | $3.00 |

Welcome offer for a referred friend: mozzarella sticks, `requires_purchase = true`.

Expect roughly 1–3% of users to refer anyone at all, and the median referrer to
bring one person. Budget from that distribution, not from the ladder.

---

## 10. Mobile app

### Onboarding
Splash with logo animation → 2–3 intro cards (discover the roster, refer friends,
earn rewards) → signup (email or phone) → **phone verification** → push
permission requested *after* signup, never before.

A referral code arriving via deep link is captured **before** signup and attached
atomically during account creation, in the signup trigger. A second client call
that could be skipped or replayed is not acceptable.

### Discover
Featured banner (admin-controlled), full-bleed artist grid with gradient overlay
and name in display type, New Releases horizontal row, latest Vault drop,
pull-to-refresh.

### Artist profile
Full-bleed hero, bio, social row, track list. Per track: one button per available
platform. **Deep-link behaviour** — attempt the native scheme first
(`spotify:track:ID`, `vnd.youtube://ID`, `music://…`), fall back to the https URL
if unavailable. Record `opened_via` either way. On iOS every scheme must be
declared in `LSApplicationQueriesSchemes` or `canOpenURL` silently fails and every
fan lands on the web player. Click logging is fire-and-forget — a fan's tap must
never wait on an analytics write.

Plus: share sheet, and a "Follow on Spotify" CTA (a follow compounds across all
future releases in a way a single play does not).

### Rewards
Referral code with tap-to-copy, invite via share sheet, animated progress toward
each tier, "My Rewards" with QR codes and expiry countdowns, redemption history,
referral list showing pending vs confirmed with an explanation of what confirms
one.

### Vault
Chronological exclusive content. Fixed weekly slot.

### Offers
Active local offers, filtered by category, sorted by business tier then distance
if location is granted.

### Events
Upcoming events with line-up, add-to-calendar, RSVP.

### Profile
Details, points balance, tier status, notification preferences, log out, **delete
account** (required for store compliance).

### Staff mode
Gated on the `staff` role and venue assignment. Camera scanner plus manual entry,
result screen per §7, today's redemptions for that staff member.

---

## 11. Public web layer

**Mandatory, not optional.** A referral link shared in a group chat opens in a
browser on a phone with no app installed. With nothing there, the referral loop
breaks at its single most important moment.

- Referral landing: names the referrer, states the welcome offer, drives install
  with the code preserved through the store round-trip.
- Artist pages: public, SEO-indexed, with the same outbound streaming links.
- Offer previews: visible, but claiming requires the app.
- **Rewards, redemption and push stay app-only.** That asymmetry is the
  conversion mechanic.

---

## 12. Admin dashboard

1. **Home** — users total and new (7/30d), pending vs confirmed referrals,
   rewards outstanding (with **cost exposure in dollars**), redemptions,
   day-30 retention, growth chart, activity feed.
2. **Artists** — CRUD, photo upload, socials, install link and its performance,
   grid reordering, featured toggle.
3. **Tracks** — CRUD per artist, cover art, per-platform links with validation
   mirroring the database constraints, featured toggle.
4. **Vault** — compose and schedule exclusive posts.
5. **Rewards** — catalogue CRUD, point costs, unit and menu values, attach rule,
   blackout rules, expiry, monthly caps, live liability figure.
6. **Points** — earn rates, daily caps, manual adjustment with mandatory reason.
7. **Users** — search, referral tree, points ledger, rewards, ban/unban, role
   grants, staff venue assignment.
8. **Abuse queue** — open flags with evidence, dismiss or action.
9. **Businesses & offers** — CRUD, tiers, per-business redemption counts.
10. **Events** — CRUD, line-up, RSVP and attendance counts.
11. **Notifications** — composer with segment targeting (all / by city / by
    artist follower / unredeemed rewards / inactive N days), schedule or send,
    history with delivery and open rates, reusable templates.
12. **Reports** — user growth by source, referral funnel and conversion, rewards
    unlocked vs redeemed with outstanding exposure, offer redemptions per
    business, artist engagement (clicks out by artist, track, platform,
    `opened_via`). Date filters and CSV export throughout.

---

## 13. Artist dashboard

Separate login, scoped by `artist_members`. Read-only.

Clicks out over time by track and platform, native vs web split, installs driven
by their own link, event RSVP counts, Vault engagement.

This is the strongest signing and retention tool available and the data already
exists — it needs a screen, not a pipeline. It also makes artists promote the app
to their own followings, because they can watch the number move.

---

## 14. Build phases

Each phase ships only when its exit criteria pass.

**Phase 1 — Foundation and discovery** *(complete)*
Schema, RLS, storage, admin artist/track CRUD, app Discover and Artist Profile,
deep-link routing with click tracking.
*Exit:* deep links verified on real iOS **and** Android hardware, including the
fallback with the target app uninstalled. Simulators cannot test this — they have
none of the three apps installed and will report a false pass. Click rows match
taps exactly.

**Phase 2 — Auth, referrals, web layer**
Onboarding, phone verification, referral capture at signup, referral screen,
public web landing, admin users and leaderboard.
*Exit:* two real accounts, one refers the other, count is correct and cannot be
double-counted. Farming attempts from one device are caught. A referral link
opens the web landing on a phone without the app and survives the store
round-trip.

**Phase 3 — Points, rewards, redemption**
Ledger, catalogue, grants, staff mode, all guardrails, abuse queue.
*Exit:* every guardrail verified independently. Concurrent redemption of one code
from two devices — exactly one succeeds. Non-staff cannot reach staff mode by
direct API call. Expired, voided and blacked-out grants each refuse with the
correct message.

**Phase 4 — Offers, events, Vault**
*Exit:* an offer created in admin appears in the app, redeems once, and lands in
the business report. Vault content is visible only to signed-in users.

**Phase 5 — Notifications, reports, artist dashboard, polish**
*Exit:* a targeted push reaches only the intended segment, proven from
`notification_deliveries`. Every report figure reconciles against raw SQL. Full
walkthrough as a brand-new user.

---

## 15. Loopholes and failure modes to defend

**This section is the pressure-test target.** Each item must be provably closed
at the database level, with a test that demonstrates it.

### Privilege and access
1. A user grants themselves `admin` or `staff` via a profile update.
2. A user injects `role` into signup metadata and the trigger honours it.
3. A user reads another user's rewards, points, referrals, phone or email.
4. Artist A reads artist B's engagement data by changing an ID in a request.
5. Staff at venue X redeem a grant belonging to venue Y.
6. A banned user continues to act with a still-valid JWT.
7. A non-staff account calls the redemption endpoint directly, bypassing UI gating.
8. A non-admin writes to a storage bucket, or overwrites another artist's photo.
9. CSV export leaks phone numbers or emails to a non-admin.

### Economic
10. The same redemption code is redeemed twice — sequentially, or concurrently
    from two devices (the race is the real test).
11. An expired or voided grant is redeemed.
12. A grant is redeemed during a blackout window by changing the device clock or
    timezone.
13. `requires_purchase` is bypassed.
14. Multiple rewards are stacked into one visit.
15. A client submits its own point amount, or a negative one.
16. A point award is replayed, double-crediting.
17. Monthly issue caps are exceeded under concurrency.
18. Points are spent twice by two simultaneous requests (balance is derived —
    the spend must be serialised).

### Referral
19. Self-referral, directly or via a second account on the same device.
20. Referral code brute-forced or enumerated (7 chars, ~31^7 space — rate-limit
    lookups regardless).
21. A user is referred twice, by two different referrers.
22. A referral is confirmed without a real redemption.
23. **Staff confirm referrals for their own account or an accomplice's.**
24. Disposable emails or VOIP numbers used to farm signups at scale.
25. A referral is confirmed, the account deleted, and the reward kept.

### Data integrity
26. Deleting an artist orphans tracks, links, or click history.
27. A track exists with no streaming link.
28. A streaming URL for the wrong platform is stored, generating a native link to
    the wrong app.
29. Timezone handling differs between server, venue and device.
30. An audit or ledger row is edited or deleted after the fact.

### Operational
31. The Supabase stack collides with an application already on the server.
32. `SERVICE_ROLE_KEY` reaches a client bundle or the repository.
33. Auto-confirm is left enabled and someone registers an address they don't own.
34. Backups are configured but never restore-tested.
35. Push tokens go stale and delivery figures silently overstate reach.

---

## 16. Testing requirements

- **SQL policy tests.** Impersonate each role at the database level with
  `SET LOCAL role` and `request.jwt.claims`, asserting every rule in §6 and every
  item in §15. UI checks are not evidence.
- **Concurrency tests.** Two simultaneous transactions against one redemption
  code; exactly one succeeds. Same for point spends and issue caps.
- **Unit tests** on pure logic: native URL derivation, blackout evaluation across
  timezones and midnight boundaries, points arithmetic, expiry.
- **Real-device tests** for anything involving another app: deep links, push
  delivery, camera scanning.
- **Reconciliation tests.** Every dashboard figure matches a raw SQL query.
- **Failure-state tests.** Backend unreachable → every screen degrades to a
  readable error with a working retry. No crashes, no blank views.

---

## 17. Open decisions

| # | Decision | Status |
|---|---|---|
| 1 | Label / app name — baked into bundle identifiers at submission | **Blocking** |
| 2 | Server inventory: listening ports, existing containers, web server | **Blocking deploy** |
| 3 | Domain for the API, and TLS termination | **Blocking mobile release** |
| 4 | Reward ladder sign-off (1 / 3 / 6 proposed) | Awaiting |
| 5 | Blackout window (Fri–Sat after 20:00 proposed) | Awaiting |
| 6 | SMTP provider for auth email | Needed before Phase 2 |
| 7 | SMS provider for phone verification | Needed before Phase 2 |
| 8 | Artist agreement terms: splits, exclusivity, content obligation | Business, not technical |

---

## 18. Standards

- TypeScript strict everywhere. No `any` in application code.
- Migrations are re-runnable and forward-only. Never edit a shipped migration.
- No secret in a repository. `.env.example` documents; `.env` is ignored.
- Every list has a designed empty state; every fetch has a designed error state.
- No placeholder or lorem ipsum content at any point — a fake streaming URL
  cannot be link-tested, so it hides exactly the bug that matters.
- Money is stored in integer cents. Never floating point.
- All timestamps `timestamptz`, stored UTC, rendered in the relevant venue's
  timezone.
