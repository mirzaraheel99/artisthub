# Phase 1 test script

Phase 1 is not done until the deep links work **on real hardware**. Simulators
share the host's URL handling and have no Spotify, YouTube or Apple Music
installed, so they cannot tell you whether a link opens the right app — they will
happily "pass" a test that fails on a real phone.

You need: one iPhone and one Android phone, each on the same Wi-Fi as your
machine, with Expo Go installed.

---

## 0. Before you start

**`localhost` will not work on a phone.** It points at the phone itself. In
`mobile/.env`, set the URL to your machine's LAN address:

```bash
# macOS / Linux
ipconfig getifaddr en0 || hostname -I | awk '{print $1}'
```

```
EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.20:8000   # your address, not this one
```

Load real content first — at least two artists with photos, and one artist with
three tracks covering all three platforms. Use real releases from the roster, not
placeholders; a fake Spotify URL cannot be link-tested.

---

## 1. Deep links — the gate for Phase 1

Run every row on **both** phones. "Opens the app" means the native app, not a
browser.

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | Spotify installed, logged in | Tap **Spotify** on a track | Spotify opens directly on that track |
| 2 | YouTube installed | Tap **YouTube** | YouTube app opens on that video |
| 3 | Apple Music installed (iOS) | Tap **Apple Music** | Music app opens on that track |
| 4 | **Uninstall Spotify** | Tap **Spotify** | Browser opens `open.spotify.com` — no crash, no dead tap |
| 5 | **Uninstall YouTube** (or disable on Android) | Tap **YouTube** | Browser opens the watch page |
| 6 | Airplane mode on | Tap any listen button | Either the app opens offline or an error line appears under the buttons. **Never a crash.** |
| 7 | Any | Tap a social chip on an artist profile | Correct profile opens in app or browser |

Rows 4 and 5 are the ones people skip and the ones that break in production.

**If a link opens a browser when the app *is* installed** on iOS: check that the
scheme is listed in `LSApplicationQueriesSchemes` in `mobile/app.json`. iOS
silently refuses `canOpenURL` for undeclared schemes, and the app falls back to
https — which looks like it works, but sends the fan to the web player.

---

## 2. Click tracking

After the runs above:

```bash
cd infra/supabase
./scripts/psql.sh -c \
  "select platform_code, opened_via, count(*)
     from link_clicks group by 1,2 order by 3 desc;"
```

- [ ] Every tap in section 1 produced exactly one row
- [ ] The platform matches what you tapped
- [ ] **`opened_via` says `native` when the app was installed and `web` when it wasn't.** This is the column that proves the deep links are doing their job — a run that is all `web` means fans are landing on the web player and the native schemes are not working
- [ ] `user_id` is null (there is no signup yet — expected, not a bug)
- [ ] `device_id` is the same value across all taps from one phone, and differs between the two phones
- [ ] The count in the dashboard's **Link clicks** tile matches this query

The counts must match the raw records. If they don't, the reporting in Phase 5
will be wrong in the same way and you won't notice it there.

---

## 3. Admin CRUD reflects in the app

- [ ] Add an artist in the dashboard → pull to refresh on the phone → they appear
- [ ] Reorder artists with ↑ ↓ → refresh → grid order matches
- [ ] Mark a track featured → refresh → it becomes the Home banner
- [ ] Edit an artist's name → refresh → the profile header updates
- [ ] Delete an artist → refresh → gone, and their tracks are gone too
- [ ] Upload a 6MB image → rejected with a readable message, not a silent failure
- [ ] Paste a YouTube URL into the Spotify field → blocked before save
- [ ] Try to save a track with no links at all → blocked with an explanation

---

## 4. Access control

Not "the UI hides it" — the database must refuse it.

```bash
cd infra/supabase
./scripts/test.sh        # 69 assertions across three suites
```

- [ ] Every line prints PASS, and the run ends with "All database tests passed"
- [ ] Sign up a second account, do **not** promote it, open the dashboard →
      "Not an admin" screen, and no artist data is reachable

---

## 5. Failure states

- [ ] Stop the backend (`docker compose --project-directory infra/supabase/stack down`),
      open the app → error state with a working "Try again", no crash
- [ ] Start it again, tap "Try again" → content loads
- [ ] An artist with no tracks → "No tracks yet", not an empty void
- [ ] An empty roster → "Nobody on the roster yet"
- [ ] No lorem ipsum or placeholder content anywhere

---

## Done when

Sections 1 and 2 pass on both an iPhone and an Android phone, including the
uninstalled-app fallbacks. That is the gate for starting Phase 2.
