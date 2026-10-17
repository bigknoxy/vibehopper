# VibeHop

**Lo-fi neon rhythm runner — a zero-dependency, offline-ready Progressive Web App.**

VibeHop is a casual endless runner you can install on Android and iOS from the browser. Hop, dash through glowing rings, and collect neon prisms — all rendered on a single 2D canvas, with a fully synthesized lo-fi soundtrack. No CDNs, no external fonts, no remote assets, no build step.

**▶ Play: https://bigknoxy.github.io/vibehopper/**

---

## What it is

| | |
|---|---|
| **Genre** | Casual endless rhythm-runner |
| **Platform** | Any modern browser · installable PWA (Android / iOS / Desktop) |
| **Dependencies** | **Zero.** One HTML file, one manifest, one service worker |
| **Offline** | Yes — cache-first service worker, playable with no network |
| **Audio** | 100% procedural Web Audio API (115 BPM lo-fi loop + pentatonic SFX) |
| **Install size** | ~45 KB total |

## How to play

| Action | Control |
|---|---|
| Hop | `Space` / `↑` / tap anywhere · **hold to auto-hop** |
| Mid-air dash | Tap **inside a glowing ring** |
| Pause | `P` / `Esc` / tab away |

- You have a **3-pip shield** — a collision shatters the obstacle, docks 1 pip, and grants 1.5 s of invulnerability. Momentum never stops.
- **Prism orbs** restore 1 pip and build your score multiplier (up to ×5).
- Movement tolerances are deliberately generous: 70% inner hitbox, 6-frame coyote time, 6-frame jump buffering.

## Install as an app

- **Android / Desktop (Chrome, Edge):** use the in-game **📲 Install App** button, or the browser's install icon in the address bar.
- **iOS (Safari):** tap **Share ⎋ → Add to Home Screen ＋**. The game shows a hint automatically.

Once installed it launches fullscreen, offline, with a themed status bar.

## Run it locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

A server is required (not `file://`) so the service worker and manifest register.

## Project layout

```
vibehopper/
├── index.html      # entire game: engine, audio synth, PWA glue
├── manifest.json   # PWA manifest (inline SVG icon, standalone display)
├── sw.js           # cache-first service worker (offline readiness)
├── deploy.sh       # one-shot GitHub Pages deployment script
└── README.md
```

## Deployment

The included [`deploy.sh`](deploy.sh) is a single-block script that creates the GitHub repo, pushes `main`, enables GitHub Pages through the API, and prints the live URL:

```bash
bash deploy.sh
```

It relies on the [GitHub CLI](https://cli.github.com/) being authenticated (`gh auth login`).

## Tech notes

- **Rendering:** native 2D canvas `shadowBlur` glow, 3-layer parallax (gradient mountains → glowing pillars → ambient dust motes), sparkle particle trails and burst effects, lo-fi scanline grain.
- **Palette:** deep night `#0d0e1e` · soft mint `#4ef0d0` · warm magenta `#ff5376` · amber `#ffd166`.
- **Audio:** lookahead-scheduled Web Audio sequencer (kick/hat/snare, filtered bass, detuned triangle pads, sparse pentatonic lead). Unlocks cleanly on first interaction to satisfy browser autoplay policies.
- **Physics:** fixed 60 Hz timestep with accumulator; hold-to-auto-jump, coyote time, jump buffering, squash & stretch.

## License

MIT
