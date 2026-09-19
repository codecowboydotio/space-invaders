# Space Invaders — Galactic Defender

A single-file, browser-based Space Invaders clone rendered on an HTML5 `<canvas>`, styled as a green-phosphor arcade cabinet. The player defends against waves of descending invaders that speed up and grow denser as the game progresses.

## Play it

The whole game lives in [`invaders.html`](invaders.html) — no build step, no dependencies to install. It fetches its sprites via `fetch()`, so it needs to be served over HTTP rather than opened directly as a `file://` URL.

### Run locally

```bash
./go.sh
```

This starts Python's built-in HTTP server on port 8000, bound to all interfaces:

```bash
python -m http.server 8000 --bind 0.0.0.0
```

Then open [http://localhost:8000/invaders.html](http://localhost:8000/invaders.html) in a browser.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move left / right | `←` `→` or `A` `D` | ◀ / ▶ buttons |
| Fire | `Space` | FIRE button |
| Pause / resume | `P` | ⏸ button |
| Restart | `R` | ↻ button |

Touch controls are shown automatically for touch-capable devices; keyboard controls work everywhere else.

## Gameplay

- **Score, wave, high score, and lives** are tracked live in the HUD above the screen.
- Each **wave** spawns a denser invader formation with a faster step interval, so the game ramps up in difficulty as you clear rows.
- The player starts with 3 lives (shown as ▲ icons); losing all of them ends the run with a **GAME OVER** screen and final score. Clearing every wave's formation without dying leads to a **VICTORY** screen.
- The game can be paused and restarted at any time via keyboard, touch buttons, or the on-screen overlay.

## Sprites

Ship and invader graphics are standalone SVG files under [`sprites/`](sprites):

- `sprites/ship.svg` — the player's ship (default)
- `sprites/invader.svg` — the invader sprite

Sprites are fetched as text and rendered via a blob-backed `Image`, which is what makes the LaunchDarkly-driven hot-swap below possible without a page reload.

## LaunchDarkly integration

The game initializes the [LaunchDarkly JavaScript SDK](https://docs.launchdarkly.com/sdk/client-side/javascript) as an anonymous client-side user and evaluates a multivariate string flag, `invaders-shooter-sprite`, to pick the player ship's sprite file (e.g. `sprites/ship.svg` vs. an alternate skin). It also subscribes to real-time flag change streaming, so toggling the flag's value in LaunchDarkly hot-swaps the ship sprite in the running game without a page refresh.

If the SDK isn't available (no network, opened as a local file, or initialization fails/times out), the game silently falls back to the default `sprites/ship.svg` and plays normally — the flag is purely cosmetic and never blocks gameplay.

## Repository layout

```
.
├── go.sh                          # convenience script to serve the game locally
├── invaders.html                  # the entire game: markup, styles, and logic
├── sprites/
│   ├── invader.svg
│   └── ship.svg
└── .github/workflows/
    └── auto-factory.yml           # LaunchDarkly Auto-Factory PR automation
```

## CI / automation

[`.github/workflows/auto-factory.yml`](.github/workflows/auto-factory.yml) runs the LaunchDarkly Auto-Factory agent chain against every pull request (opened, updated, reopened, or labeled). With flag creation and code changes enabled, it can create real LaunchDarkly flags, wire them into the code, add instrumentation and tests, and push those changes back to the PR branch. See the comments at the top of that file for details on providers, approval gates, and the optional knowledge-graph code-reference step.
