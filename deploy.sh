#!/usr/bin/env bash
# =============================================================================
#  VibeHop — one-shot GitHub Pages deployment
#  Idempotent: safe to run repeatedly. Creates the repo, pushes main,
#  enables GitHub Pages via the API, prints the live URL, and starts a
#  local preview server.
#
#  Requires: git, python3, and the GitHub CLI authenticated (`gh auth login`)
# =============================================================================
set -euo pipefail

REPO_NAME="${REPO_NAME:-vibehopper}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# ---------------------------------------------------------- service worker bump --
# Cache-first clients only refresh when the cache name changes, so stamp it on deploy.
if [ -f sw.js ] && grep -q "const CACHE = 'vibehop-v" sw.js; then
  STAMP="$(date +%Y%m%d%H%M%S)"
  sed -i "s/const CACHE = 'vibehop-v[0-9]*'/const CACHE = 'vibehop-v$STAMP'/" sw.js
  ok "Service worker cache stamped: vibehop-v$STAMP"
fi

# ------------------------------------------------------------------ icon render --
# The PNG icons are rendered from the SVGs so the mark can never drift from the
# source (ImageMagick's SVG delegate drops the gradient — use a browser).
render_icons() {
  local chrome=""
  for c in google-chrome-stable google-chrome chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && { chrome="$c"; break; }
  done
  [ -n "$chrome" ] || { warn "No Chrome found — keeping the existing PNG icons"; return 0; }
  [ -f docs/icon.svg ] || return 0
  ( cd docs
    "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --window-size=512,512 --screenshot=icon-512.png "file://$PWD/icon.svg" >/dev/null 2>&1
    "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --window-size=512,512 --screenshot=icon-maskable-512.png "file://$PWD/icon-maskable.svg" >/dev/null 2>&1
    convert icon-512.png -resize 192x192 -strip -define png:compression-level=9 icon-192.png
    convert icon-512.png -resize 180x180 -strip -define png:compression-level=9 icon-180.png
  )
  ok "Icons re-rendered from docs/icon.svg"
}
if [ -f docs/icon.svg ]; then render_icons; fi

# ---------------------------------------------------------------- preflight --
command -v git   >/dev/null || { echo "git is required";   exit 1; }
command -v gh    >/dev/null || { echo "GitHub CLI is required: https://cli.github.com/"; exit 1; }
gh auth status   >/dev/null 2>&1 || { echo "Not logged in. Run: gh auth login"; exit 1; }
OWNER="$(gh api user -q .login)"
ok "Authenticated as $OWNER"

# ------------------------------------------------------------------- git init --
if [ ! -d .git ]; then
  log "Initializing git repository (branch: main)"
  git init -q -b main
fi
git add -A
if git diff --cached --quiet; then
  warn "Nothing new to commit"
else
  git commit -q -m "VibeHop: lo-fi neon rhythm runner PWA"
  ok "Committed"
fi
git branch -M main

# ------------------------------------------------------------------ repo + push --
if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  warn "Repository $OWNER/$REPO_NAME already exists — pushing instead"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin main
else
  log "Creating public repository $OWNER/$REPO_NAME"
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi
ok "Code pushed to https://github.com/$OWNER/$REPO_NAME"

# ------------------------------------------------------------ enable gh-pages --
log "Enabling GitHub Pages (branch: main, path: /)"
read -r -d '' PAGES_BODY <<'JSON' || true
{"source":{"branch":"main","path":"/"}}
JSON
if gh api "/repos/$OWNER/$REPO_NAME/pages" >/dev/null 2>&1; then
  warn "Pages already enabled — updating source"
  printf '%s' "$PAGES_BODY" | gh api --method PUT -H "Accept: application/vnd.github+json" \
    "/repos/$OWNER/$REPO_NAME/pages" --input - >/dev/null
else
  printf '%s' "$PAGES_BODY" | gh api --method POST -H "Accept: application/vnd.github+json" \
    "/repos/$OWNER/$REPO_NAME/pages" --input - >/dev/null
fi
LIVE_URL="https://$OWNER.github.io/$REPO_NAME/"
ok "Live URL: $LIVE_URL"

# --------------------------------------------------------- local preview serve --
PORT="${PORT:-8080}"
if command -v python3 >/dev/null; then
  if lsof -i ":$PORT" >/dev/null 2>&1 || ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    warn "Port $PORT is busy — using 8081"
    PORT=8081
  fi
  log "Starting local preview on http://localhost:$PORT"
  (python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  sleep 1
  ok "Local preview: http://localhost:$PORT"
fi

cat <<EOF

────────────────────────────────────────────────────────
  VibeHop is live
  · Remote : $LIVE_URL          (Pages build takes ~60s on first run)
  · Local  : http://localhost:$PORT
  · Repo   : https://github.com/$OWNER/$REPO_NAME

  Install as an app: open the URL, then
   · Android/Desktop → "📲 Install App" button in-game
   · iOS Safari      → Share ⎋ → Add to Home Screen ＋
────────────────────────────────────────────────────────
EOF

# Poll until the Pages build is actually serving
log "Waiting for the Pages build to go live…"
for i in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$LIVE_URL" || true)"
  if [ "$CODE" = "200" ]; then ok "Pages build ready — $LIVE_URL"; break; fi
  [ "$i" = "30" ] && warn "Still building (HTTP $CODE) — check $LIVE_URL shortly"
  sleep 10
done
