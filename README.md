# Galactic Defender

A single-file, browser-based Space Invaders–style arcade game with a retro CRT look. Everything lives in [`invaders.html`](invaders.html) (HTML, CSS and JavaScript on a `<canvas>`), with the ship and invader sprites stored as SVGs in [`sprites/`](sprites/).

## Running the game

```sh
./go.sh        # python -m http.server 8000 --bind 0.0.0.0
```

Then open <http://localhost:8000/invaders.html>.

Serving over HTTP is recommended. The sprites are fetched at runtime, and the LaunchDarkly SDK needs network access. The game still plays if the SDK can't load (for example, offline): it falls back to the default ship sprite.

## Gameplay

1. **Login:** enter a callsign (see [Player login](#player-login)).
2. **Start:** press **START GAME**.
3. Shoot the descending invaders before they reach you. Hide behind the destructible barriers (4 of them).
4. You have **3 lives** (shown as ▲ in the HUD). The game ends when you run out of lives or the invaders reach you. Clearing waves increases the **WAVE** counter.
5. Each invader destroyed scores **10 points**. The HUD shows **PLAYER**, **SCORE**, **WAVE**, **HI** (session high score) and **LIVES**.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← / → or A / D | ◀ / ▶ buttons |
| Fire | Space | FIRE button |
| Pause / resume | P | ⏸ button |
| Restart | R | ↻ button |

Touch controls appear automatically on touch devices and narrow viewports. Multi-touch is supported, so you can move and fire at once.

## Player login

Before the first game, a login screen asks the pilot for a **callsign**.

- Callsigns are up to **12 characters**. Only letters, digits, spaces, `-` and `_` are kept. Whitespace is collapsed and the name is upper-cased. An empty result shows `CALLSIGN REQUIRED`.
- The callsign is shown in the HUD and in the welcome message on the start screen.
- It is saved in `localStorage` (key `galactic-defender-player`) and pre-filled on your next visit. If storage is unavailable (private mode), the game continues without persisting it.
- It becomes the **LaunchDarkly context key** (`kind: "user"`, `key`/`name` = callsign), so feature flags can be targeted per player. Until login, the context is anonymous (`anonymous-player`).
- While you type in the login field, game hotkeys (P, R, Space, etc.) are ignored so they don't interfere.
- Pressing restart never leaves the login screen over a live game.

There is no server-side authentication. The callsign is an identifier only, not a credential.

## Feature flags (LaunchDarkly)

The game uses the [LaunchDarkly client-side JS SDK](https://docs.launchdarkly.com/sdk/client-side/javascript) (v3, loaded from jsDelivr).

| Flag | Type | Purpose |
| --- | --- | --- |
| `invaders-shooter-sprite` | string (multivariate) | Path of the SVG used for the player's ship, e.g. `sprites/ship.svg`. |

- The flag is evaluated at startup. Changes stream in and **hot-swap the ship sprite live**, with no reload.
- If the SDK fails to load, initialization times out (3 s), or the flag value is empty or not a string, the game uses `sprites/ship.svg`. A sprite that fails to load keeps the current one.
- The client-side ID is set in `LD_CLIENT_SIDE_ID` in `invaders.html`. Client-side IDs are designed to be public.
- To add a new ship, put an SVG in `sprites/` and add a matching variation to the flag.

## Project structure

```
invaders.html                       Game: markup, styles, logic, LaunchDarkly wiring
sprites/ship.svg                    Default player ship
sprites/invader.svg                 Invader sprite
go.sh                               Local dev server (python http.server on :8000)
.github/workflows/auto-factory.yml  LaunchDarkly Auto-Factory workflow, run on PRs
```

## Development notes

- No build step or dependencies. Edit `invaders.html` and refresh.
- Game states: menu, playing, paused, game over and win.
- Touch detection combines a media query with a `body.touch` class set from JS, for devices the query misses.
- The `.github/workflows/auto-factory.yml` workflow runs on pull requests (opened, updated, reopened, labeled). See the comments in that file for its configuration.
