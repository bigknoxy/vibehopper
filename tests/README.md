# Automated verification suite

Every check below runs headless Chromium against the real game — no mocks.

Two philosophies live here: **verification** (does the feature work?) and **falsification**
(what happens if we actively try to break the product's claims?). A green suite means
every public claim on the store page survives a hostile attempt.

## Test files

| File | Scope | What it proves |
|---|---|---|
| `smoke.js` | local | canvas paints (colour histogram), game starts, PWA metadata present, zero console errors |
| `verify.js` | local | jump arc, collision→pip loss, game over, pause/resume, best-score persistence, SW cache contents |
| `verify-live.js` | **deployed production URL** | HTTPS cold load, deployed manifest validity, SW activated + cache populated, audio unlock, jump arc, shield collisions, real touch input, localStorage across reload, **offline play with network killed**, zero external requests |
| `features.js` | local or live | TDD suite for player-facing features: mute persistence, on-screen pause (≥44px touch target), share sheet, OG/social meta, a11y labels, stale-input guard, best-score ratchet |
| `falsifiers.js` | local or live | attacks the marketing claims: 1.5s invulnerability spacing, jump buffering, hold-to-auto-jump, 70% forgiving hitbox (near-miss is free), 3-pip pacing, combo cap x5, orb restore, **per-frame cost inside a 60fps budget** (p95 ≤16.7ms) with game-time accuracy under 4× CPU throttle, offline boot, zero external requests |
| `regress.js` | local | one check per fixed bug, asserting the fixed behaviour: no phantom hop from an install-tip tap, death FX keep animating on the game-over screen, install pill never overlaps the HUD, restart resets player state, multi-pointer + blur input release, rotate-while-paused floor snap, dead-code greps, audio call sites |
| `shots.js` | deployed URL | captures README/social assets into `docs/` (portrait title + gameplay, 1200×630 og image) |
| `crops.js` | local | close-up sprite crops (grounded / airborne / invulnerable) for visual QA |

## Running

```bash
npm i puppeteer
CHROME_BIN=/path/to/chrome node tests/verify-live.js
CHROME_BIN=/path/to/chrome node tests/features.js
CHROME_BIN=/path/to/chrome node tests/falsifiers.js
CHROME_BIN=/path/to/chrome node tests/regress.js
GAME_URL=http://localhost:8080/ CHROME_BIN=/path/to/chrome node tests/verify.js
```

Output is JSON (`results` + `errors`), then a pass/fail line; exit code is non-zero if any check fails.
`features.js` and `falsifiers.js` also work against the deployed URL by setting `GAME_URL`.

## Latest results

- Local suite: **8/8 passed**, 0 console errors
- Deployed E2E (`https://bigknoxy.github.io/vibehopper/`): **11/11 passed**, 0 console errors, 0 failed requests, 0 external requests
- Features TDD: red baseline captured first (mute/pause/share/OG/a11y absent), then green after implementation — **7/7**
- Falsifiers: **11/11** — invulnerability spacing and jump buffering were caught as real bugs by this suite
- Regressions: **8/8** — one check per bug found in the code review, so none of them can silently come back
