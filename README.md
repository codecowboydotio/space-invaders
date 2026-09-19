# Galactic Defender (Space Invaders)

A retro, single-page Space Invaders clone built with vanilla JavaScript and
the HTML5 Canvas API. No build step, no dependencies to install — open it in
a browser (via a local web server) and play.

The whole game — rendering, input, physics, and UI — lives in
[`invaders.html`](invaders.html). Sprite art is loaded at runtime from
standalone SVG files under [`sprites/`](sprites).

## Features

- Classic Space Invaders gameplay: a marching grid of invaders that speeds
  up as they're destroyed, descending and reversing direction at the screen
  edges, four destructible barriers, and wave progression.
- Retro CRT arcade look: scanlines, vignette, screen flicker, a pixel font,
  and phosphor-green/amber color scheme, all done in CSS.
- Keyboard controls (arrow keys / A-D to move, Space to fire, P to pause,
  R to restart) and full on-screen touch controls for mobile/tablet, driven
  by the same input state so no game logic branches on input type.
- Score, wave, high score, and lives HUD.
- Sprites are loaded as SVG text and rendered onto the canvas; if a sprite
  fails to load (e.g. opened as a local `file://` page without a server),
  the game still runs and falls back to flat-colored placeholder rectangles.
- Optional [LaunchDarkly](https://launchdarkly.com/) integration: the
  `invaders-shooter-sprite` feature flag can swap the player's ship sprite
  live, without a page reload, by streaming flag changes to the client. If
  the LaunchDarkly SDK can't initialize (no network, blocked script, etc.)
  the game silently falls back to the default ship sprite.

## Project structure

```
.
├── invaders.html            # The entire game: markup, styles, and game logic
├── go.sh                    # Convenience script to serve the game locally
├── sprites/
│   ├── ship.svg              # Default player ship sprite
│   └── invader.svg           # Invader sprite
└── .github/
    └── workflows/
        └── auto-factory.yml  # Disabled template for LaunchDarkly's Auto-Factory GitHub Action
```

## Running it locally

The game fetches its sprite SVGs with `fetch()`, which browsers block for
pages opened directly from disk (`file://`). It needs to be served over
HTTP, even for local play.

The included [`go.sh`](go.sh) script starts Python's built-in web server on
port 8000:

```bash
./go.sh
```

Then open `http://localhost:8000/invaders.html` in a browser.

This is a quick way to get the game running and is fine for local
development, but as noted in `go.sh`, it's a bare-bones HTTP server not
intended for production use. Any other static file server (e.g.
`npx serve`, `php -S`, nginx) works just as well — just point it at the
repository root and load `invaders.html`.

## Controls

| Action      | Keyboard         | Touch                |
|-------------|------------------|-----------------------|
| Move        | `◀ ▶` or `A` `D` | Left / right buttons |
| Fire        | `Space`          | FIRE button          |
| Pause       | `P`              | Pause button (⏸)     |
| Restart     | `R`              | Restart button (↻)   |

Touch controls appear automatically on touch-capable or narrow-viewport
devices; keyboard hints appear otherwise.

## LaunchDarkly feature flag

The game loads the LaunchDarkly JS client SDK from a CDN and, if
initialization succeeds, evaluates a multivariate string flag named
`invaders-shooter-sprite`. Each variation's value is expected to be a
sprite path relative to the repo root (e.g. `sprites/ship.svg`). Flag
changes are streamed and hot-swap the ship sprite in place. If the SDK
isn't available or fails to initialize, the game uses the default ship
sprite at `sprites/ship.svg` and plays normally — the flag is purely
cosmetic and never required to play.

## GitHub Actions

[`.github/workflows/auto-factory.yml`](.github/workflows/auto-factory.yml)
is a fully commented-out template for wiring this repo into LaunchDarkly's
Auto-Factory action, which would let an agent chain create flags and push
code changes to pull requests automatically. It is inert as committed —
uncomment and configure the secrets/variables described in the file's
header comments to enable it.
