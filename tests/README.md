# Automated verification suite

Every check below runs headless Chromium against the real game — no mocks.

## Test files

| File | Scope | What it proves |
|---|---|---|
| `smoke.js` | local | canvas paints (colour histogram), game starts, PWA metadata present, zero console errors |
| `verify.js` | local | jump arc, collision→pip loss, game over, pause/resume, best-score persistence, SW cache contents |
| `verify-live.js` | **deployed production URL** | HTTPS cold load, deployed manifest validity, SW activated + cache populated, audio unlock, jump arc, shield collisions, real touch input, localStorage across reload, **offline play with network killed**, zero external requests |
| `crops.js` | local | close-up sprite crops (grounded / airborne / invulnerable) for visual QA |

## Running

```bash
npm i puppeteer
CHROME_BIN=/path/to/chrome node tests/verify-live.js
GAME_URL=http://localhost:8080/ CHROME_BIN=/path/to/chrome node tests/verify.js
```

Output is JSON (`results` + `errors`), then a pass/fail line; exit code is non-zero if any check fails.

## Latest results

- Local suite: **8/8 passed**, 0 console errors
- Deployed E2E (`https://bigknoxy.github.io/vibehopper/`): **11/11 passed**, 0 console errors, 0 failed requests, 0 external requests
