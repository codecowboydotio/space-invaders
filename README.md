# Galactic Defender

A single-file, browser-based Space Invaders clone rendered on an HTML5 `<canvas>`. Defend the last frontier from descending waves of invaders using a retro CRT-style arcade cabinet UI, with keyboard and touch controls, destructible barriers, and a LaunchDarkly-driven player sprite.

## Quick start

The game is a static page — no build step or dependencies to install. Serve the directory with any static file server and open it in a browser.

```sh
./go.sh
```

`go.sh` starts a Python HTTP server bound to all interfaces on port 8000:

```sh
python -m http.server 8000 --bind 0.0.0.0
```

Then open **http://localhost:8000/invaders.html**.

> A local server is required (rather than opening `invaders.html` directly as a `file://` page) because the game fetches the ship and invader sprites via `fetch()`, which most browsers block for local files. If opened directly as a file, the game still runs but falls back to flat-color placeholder rectangles instead of the SVG sprites.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move left / right | `←` `→` or `A` `D` | On-screen ◀ / ▶ buttons |
| Fire | `Space` | On-screen FIRE button |
| Pause / resume | `P` | On-screen ⏸ button |
| Restart | `R` | On-screen ↻ button |

Touch controls are shown automatically on touch-capable devices and narrow viewports (≤820px wide); keyboard hints are shown otherwise.

## Gameplay

- Clear each wave of invaders to advance; rows and invader speed increase with each wave.
- Four destructible barriers sit above the player and absorb both player and invader fire, cell by cell, until destroyed.
- Losing all three lives, or letting the invader formation reach the player's line, ends the game.
- Score and a session high score are tracked in the HUD, along with the current wave and remaining lives.

## Project structure

```
invaders.html                    Game markup, styling, and logic (single file)
sprites/
  ship.svg                       Default player ship sprite
  invader.svg                    Invader sprite
go.sh                             Convenience script to serve the game locally
.github/workflows/auto-factory.yml  Disabled template for LaunchDarkly Auto-Factory CI
```

## LaunchDarkly integration

`invaders.html` loads the [LaunchDarkly JavaScript client SDK](https://www.npmjs.com/package/launchdarkly-js-client-sdk) from a CDN and initializes an anonymous client-side context on page load, using a hardcoded client-side ID for the production environment.

The player's ship sprite is controlled by a multivariate string flag: `invaders-shooter-sprite`. Each variation's value is a sprite file path relative to `./sprites/` (e.g. `sprites/ship.svg`), which the game fetches and hot-swaps in as the live ship sprite whenever the flag value changes, via a `change:invaders-shooter-sprite` streaming listener.

If the SDK fails to load or initialize (no network, opened as a local `file://` page, blocked script, etc.), the game falls back to the default sprite path (`sprites/ship.svg`) and continues to run normally — the LaunchDarkly integration is purely cosmetic and never blocks gameplay.

## CI / Auto-Factory workflow

`.github/workflows/auto-factory.yml` is a fully commented-out drop-in template for the [LaunchDarkly Auto-Factory](https://github.com/launchdarkly-labs/launchdarkly-auto-factory) GitHub Action. It is not active — every line is prefixed with `##` — and is kept here as a reference for wiring up automated flag creation and code-change agents against pull requests, should that workflow be enabled later.
