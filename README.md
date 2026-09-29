# GALACTIC DEFENDER // ARCADE

A retro, single-file Space Invaders-style arcade game that runs entirely in the browser. The whole game lives in [`invaders.html`](invaders.html) (HTML + CSS + vanilla JS on a `<canvas>`), with SVG sprites in [`sprites/`](sprites).

## Running locally

The game fetches its sprites over HTTP, so serve the folder rather than opening the file directly:

```sh
./go.sh        # python -m http.server 8000 --bind 0.0.0.0
```

Then open <http://localhost:8000/invaders.html>.

If the sprites can't be loaded (e.g. opened via `file://`), the game still runs using flat-colour placeholder rectangles.

## How to play

1. **Enter your callsign** on the login screen (see [Player login](#player-login)).
2. Press **START GAME**.
3. Shoot every invader in the formation. Clearing a wave spawns a harder one.
4. You have **3 lives**. You lose one when an invader bullet hits you, and the game ends immediately if the formation reaches your line or you run out of lives.

| Action  | Keyboard        | Touch            |
|---------|-----------------|------------------|
| Move    | `←` `→` or `A` `D` | On-screen ◀ ▶ buttons |
| Fire    | `Space`         | On-screen FIRE button |
| Pause   | `P`             | —                |
| Restart | `R`             | —                |

Touch controls appear automatically on touch devices and narrow viewports. Move and fire can be held at the same time (multi-touch).

### Game mechanics

- **Scoring:** 10 points per invader. The HUD shows PLAYER, SCORE, WAVE, HI (session high score) and LIVES.
- **Waves:** each wave has 8 columns of invaders. Rows start at 3 and grow by one every two waves (max 5). The formation steps faster each wave (step interval drops from 40 to a minimum of 10 ticks).
- **Barriers:** four destructible shields sit between you and the invaders and erode cell by cell.
- **Effects:** CRT-style scanlines, vignette and flicker overlays, plus particle explosions.

## Player login

Before a game starts, the player is asked for a **callsign**:

- Up to **12 characters**; input is sanitised to letters, digits, spaces, `-` and `_`, whitespace is collapsed, and the result is upper-cased. An empty name is rejected with `CALLSIGN REQUIRED`.
- The callsign is saved in `localStorage` (key `galactic-defender-player`) and pre-filled on the next visit. If storage is unavailable (e.g. private mode) the game still works.
- It is shown in the **PLAYER** slot of the HUD and in the welcome message.
- It is used as the [LaunchDarkly](#feature-flags-launchdarkly) context key, so flags can be targeted per player.
- Keyboard shortcuts (`P`, `R`, `Space`, ...) are ignored while typing in the text field.

> Note: the login prompt mentions a leaderboard, but scores are not yet persisted or submitted anywhere. Only the in-session high score is tracked.

## Feature flags (LaunchDarkly)

The game uses the [LaunchDarkly client-side JS SDK](https://docs.launchdarkly.com/sdk/client-side/javascript) (loaded from jsDelivr) for a live-swappable shooter sprite.

| Flag | Type | Purpose |
|------|------|---------|
| `invaders-shooter-sprite` | string | Filename/path of the player's ship SVG (e.g. `sprites/ship.svg`). |

- Flag changes stream in and **hot-swap the ship sprite while the game is running**.
- If the SDK is blocked, initialisation times out (3 s), or the flag holds an unusable value, the game falls back to `sprites/ship.svg` and keeps the current sprite.
- After login, `identify()` retargets the LaunchDarkly context to `{ kind: "user", key: <callsign>, name: <callsign> }`. Failures here never block play.

## Project layout

```
invaders.html      The entire game (markup, styles, logic)
sprites/ship.svg   Default player ship
sprites/invader.svg Invader sprite
go.sh              Local dev server (python http.server on :8000)
.github/workflows/ Automation workflows
```
