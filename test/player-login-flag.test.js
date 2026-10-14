"use strict";
/*
 * Flag-path tests for the "enable-player-login" multivariate flag (PR #34).
 *
 *   "control" → original start screen, no login, no identify()
 *   "v1"      → callsign login screen + HUD PLAYER slot + identify()
 *
 * invaders.html is a single self-contained page, so each test boots the real
 * page in jsdom with a fake LaunchDarkly SDK (window.LDClient) whose
 * variation() result we control and whose track()/identify() calls we record.
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "invaders.html"), "utf8");
const FLAG_KEY = "enable-player-login";
const STORAGE_KEY = "galactic-defender-player";

const EV_ERROR = "enable-player-login-error";
const EV_GAME_STARTED = "enable-player-login-game-started";
const EV_LOGIN_COMPLETED = "enable-player-login-login-completed";

/* ---------------- harness ---------------- */

function makeFakeLD(opts = {}) {
  const log = [];
  const client = {
    waitForInitialization: async () => {
      if (opts.initFails) throw new Error("init failed");
    },
    variation: (key, def) => {
      if (key !== FLAG_KEY) return def; // other flags (ship sprite) → default
      log.push(["variation", key]);
      if (opts.variationThrows) throw new Error("variation boom");
      return Object.prototype.hasOwnProperty.call(opts, "variation") ? opts.variation : def;
    },
    identify: (ctx) => {
      log.push(["identify", ctx]);
      if (opts.identifyThrows) throw new Error("identify boom");
      if (opts.identifyRejects) return Promise.reject(new Error("identify rejected"));
      return Promise.resolve();
    },
    track: (key) => {
      log.push(["track", key]);
      if (opts.trackThrows) throw new Error("track boom");
    },
    on: () => {},
  };
  return {
    client,
    log,
    tracks: () => log.filter((e) => e[0] === "track").map((e) => e[1]),
    identifies: () => log.filter((e) => e[0] === "identify").map((e) => e[1]),
    count: (eventKey) => log.filter((e) => e[0] === "track" && e[1] === eventKey).length,
  };
}

const openDoms = [];

async function bootGame({ ld, storedName } = {}) {
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const dom = new JSDOM(HTML, {
    url: "http://localhost/",
    runScripts: "dangerously",
    virtualConsole: new VirtualConsole(), // silence page console + jsdom "not implemented" noise
    beforeParse(window) {
      window.matchMedia = () => ({
        matches: false,
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });
      // No network: sprite fetch fails and the game falls back to placeholder rects.
      window.fetch = () => Promise.reject(new Error("no network in tests"));
      // init() ends with requestAnimationFrame(loop) — use it as the "booted" signal
      // and never actually run the render loop (no canvas in jsdom).
      window.requestAnimationFrame = () => { resolveReady(); return 0; };
      if (storedName !== undefined) window.localStorage.setItem(STORAGE_KEY, storedName);
      if (ld) window.LDClient = { initialize: () => ld.client };
    },
  });
  openDoms.push(dom);
  let timer;
  await Promise.race([
    ready,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("init() never reached requestAnimationFrame")), 3000);
    }),
  ]);
  clearTimeout(timer);
  const doc = dom.window.document;
  const $ = (id) => doc.getElementById(id);
  return {
    dom,
    window: dom.window,
    $,
    submitLogin(name) {
      $("nameInput").value = name;
      $("loginForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    },
    clickStart() { $("startBtn").click(); },
    pressKey(code) {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { code }));
      dom.window.dispatchEvent(new dom.window.KeyboardEvent("keyup", { code }));
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  while (openDoms.length) openDoms.pop().window.close();
});

function assertControlScreen(game) {
  assert.equal(game.$("loginOverlay").style.display, "none", "login overlay must stay hidden");
  assert.equal(game.$("overlay").style.display, "flex", "original start overlay must be shown");
  assert.equal(game.$("overlayTitle").textContent, "GALACTIC DEFENDER");
  assert.match(game.$("overlayText").textContent, /Defend the last frontier\./);
  assert.equal(game.$("startBtn").textContent, "▶ START GAME");
  assert.equal(game.$("playerHud").style.display, "none", "HUD PLAYER slot must stay hidden");
}

/* ---------------- entry screen ---------------- */

describe("enable-player-login: entry screen", () => {
  it("control → original start overlay, no login screen, no HUD PLAYER slot, no identify()", async () => {
    const ld = makeFakeLD({ variation: "control" });
    const game = await bootGame({ ld, storedName: "ACE" });
    assertControlScreen(game);
    assert.equal(game.$("nameInput").value, "", "saved callsign must not be pre-filled on control");
    assert.equal(ld.identifies().length, 0, "control must never identify()");
    assert.equal(ld.count(EV_LOGIN_COMPLETED), 0);
  });

  it("v1 → login screen replaces the start overlay and HUD PLAYER slot is shown", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    assert.equal(game.$("loginOverlay").style.display, "flex");
    assert.equal(game.$("overlay").style.display, "none");
    assert.equal(game.$("playerHud").style.display, "");
    assert.equal(game.$("playerVal").textContent, "---");
    assert.equal(ld.identifies().length, 0, "no identify() until a callsign exists");
  });

  it("v1 with a saved callsign → input pre-filled, HUD shows it, identify() with that callsign", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld, storedName: "ace<b>" });
    assert.equal(game.$("nameInput").value, "ACEB", "stored name is sanitised");
    assert.equal(game.$("playerVal").textContent, "ACEB");
    const ids = ld.identifies();
    assert.equal(ids.length, 1);
    assert.equal(ids[0].kind, "user");
    assert.equal(ids[0].key, "ACEB");
    assert.equal(ids[0].name, "ACEB");
  });

  it("flag is evaluated against the anonymous context before any identify()", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    await bootGame({ ld, storedName: "ACE" });
    const firstVariation = ld.log.findIndex((e) => e[0] === "variation");
    const firstIdentify = ld.log.findIndex((e) => e[0] === "identify");
    assert.ok(firstVariation >= 0 && firstIdentify > firstVariation);
  });
});

/* ---------------- fail-safe to control ---------------- */

describe("enable-player-login: fails safe to control", () => {
  const cases = [
    ["SDK missing (no LDClient global)", undefined],
    ["SDK init fails", { initFails: true, variation: "v1" }],
    ["variation() throws", { variationThrows: true }],
    ["unknown variation string (v2)", { variation: "v2" }],
    ["non-string value (true)", { variation: true }],
    ["empty string", { variation: "" }],
  ];
  for (const [label, opts] of cases) {
    it(`${label} → control behaviour, nothing tracked, nothing throws`, async () => {
      const ld = opts ? makeFakeLD(opts) : undefined;
      const game = await bootGame({ ld, storedName: "ACE" });
      assertControlScreen(game);
      game.clickStart();
      assert.equal(game.$("overlay").style.display, "none", "game starts normally");
      if (ld) {
        assert.equal(ld.identifies().length, 0);
        if (opts.initFails) assert.deepEqual(ld.tracks(), [], "ldClient is null after failed init → no track()");
      }
    });
  }
});

/* ---------------- login submit (v1 only) ---------------- */

describe("enable-player-login: login submit", () => {
  it("v1 valid callsign → login-completed tracked BEFORE identify(), name stored, welcome overlay", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    game.submitLogin("  mav!erick  ");
    const trackIdx = ld.log.findIndex((e) => e[0] === "track" && e[1] === EV_LOGIN_COMPLETED);
    const idIdx = ld.log.findIndex((e) => e[0] === "identify");
    assert.ok(trackIdx >= 0, "login-completed tracked");
    assert.ok(idIdx > trackIdx, "tracked before identify() switches the context");
    assert.equal(ld.count(EV_LOGIN_COMPLETED), 1);
    assert.equal(ld.identifies()[0].key, "MAVERICK");
    assert.equal(game.$("playerVal").textContent, "MAVERICK");
    assert.equal(game.window.localStorage.getItem(STORAGE_KEY), "MAVERICK");
    assert.equal(game.$("loginOverlay").style.display, "none");
    assert.equal(game.$("overlay").style.display, "flex");
    assert.match(game.$("overlayText").textContent, /Welcome, MAVERICK\./);
    assert.equal(game.$("loginError").textContent, "");
  });

  it("v1 empty / all-invalid callsign → error shown, nothing tracked, no identify()", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    for (const bad of ["", "   ", "!!@@##"]) {
      game.submitLogin(bad);
      assert.equal(game.$("loginError").textContent, "CALLSIGN REQUIRED");
      assert.equal(game.$("loginOverlay").style.display, "flex", "stays on login screen");
    }
    assert.equal(ld.count(EV_LOGIN_COMPLETED), 0);
    assert.equal(ld.identifies().length, 0);
    assert.equal(game.window.localStorage.getItem(STORAGE_KEY), null);
  });

  it("control → login screen never shown, so login-completed is never tracked", async () => {
    const ld = makeFakeLD({ variation: "control" });
    const game = await bootGame({ ld });
    game.clickStart();
    assert.equal(ld.count(EV_LOGIN_COMPLETED), 0);
    assert.equal(ld.identifies().length, 0);
  });

  it("v1 typing in the callsign field does not trigger game hotkeys (R/P)", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    const input = game.$("nameInput");
    input.dispatchEvent(new game.window.KeyboardEvent("keydown", { code: "KeyR", bubbles: true }));
    assert.equal(game.$("loginOverlay").style.display, "flex", "R in the input must not start a game");
    assert.equal(ld.count(EV_GAME_STARTED), 0);
  });
});

/* ---------------- identify() failure (v1 only) ---------------- */

describe("enable-player-login: identify() failures", () => {
  it("v1 identify() throws → error event tracked, play continues", async () => {
    const ld = makeFakeLD({ variation: "v1", identifyThrows: true });
    const game = await bootGame({ ld });
    game.submitLogin("ACE");
    assert.equal(ld.count(EV_ERROR), 1);
    assert.equal(game.$("playerVal").textContent, "ACE");
    assert.equal(game.$("overlay").style.display, "flex");
    game.clickStart();
    assert.equal(game.$("overlay").style.display, "none", "game started despite identify failure");
    assert.equal(ld.count(EV_GAME_STARTED), 1);
  });

  it("v1 identify() rejects → error event tracked asynchronously, play continues", async () => {
    const ld = makeFakeLD({ variation: "v1", identifyRejects: true });
    const game = await bootGame({ ld });
    game.submitLogin("ACE");
    await flush();
    assert.equal(ld.count(EV_ERROR), 1);
    game.clickStart();
    assert.equal(game.$("overlay").style.display, "none");
  });

  it("control → identify() never called, so no identify error is tracked", async () => {
    const ld = makeFakeLD({ variation: "control", identifyThrows: true });
    const game = await bootGame({ ld, storedName: "ACE" });
    game.clickStart();
    await flush();
    assert.equal(ld.count(EV_ERROR), 0);
  });
});

/* ---------------- game-started metric (both variations) ---------------- */

describe("enable-player-login: game-started metric", () => {
  it("control → first start from menu tracks game-started once; R / pause+R restarts do not", async () => {
    const ld = makeFakeLD({ variation: "control" });
    const game = await bootGame({ ld });
    game.clickStart();
    assert.equal(ld.count(EV_GAME_STARTED), 1);
    game.pressKey("KeyR");
    game.pressKey("KeyP");
    game.pressKey("KeyR");
    assert.equal(ld.count(EV_GAME_STARTED), 1);
  });

  it("v1 → first start after login tracks game-started once; R restarts do not", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    game.submitLogin("ACE");
    assert.equal(ld.count(EV_GAME_STARTED), 0, "login alone is not a game start");
    game.clickStart();
    assert.equal(ld.count(EV_GAME_STARTED), 1);
    assert.equal(game.$("loginOverlay").style.display, "none");
    game.pressKey("KeyR");
    assert.equal(ld.count(EV_GAME_STARTED), 1);
  });

  it("v1 → R pressed from the login screen hides login overlay and counts as the first start", async () => {
    const ld = makeFakeLD({ variation: "v1" });
    const game = await bootGame({ ld });
    game.pressKey("KeyR"); // window-targeted, not the input
    assert.equal(game.$("loginOverlay").style.display, "none", "login screen never stuck over a live game");
    assert.equal(game.$("overlay").style.display, "none");
    assert.equal(ld.count(EV_GAME_STARTED), 1);
  });
});

/* ---------------- page error metric (both variations) ---------------- */

describe("enable-player-login: page error metric", () => {
  for (const variation of ["control", "v1"]) {
    it(`${variation} → window error and unhandledrejection each track the error event`, async () => {
      const ld = makeFakeLD({ variation });
      const game = await bootGame({ ld });
      const w = game.window;
      const errEvt = new w.ErrorEvent("error", { message: "boom", cancelable: true });
      w.dispatchEvent(errEvt);
      assert.equal(ld.count(EV_ERROR), 1);
      assert.equal(errEvt.defaultPrevented, false, "listener is observe-only");
      w.dispatchEvent(new w.Event("unhandledrejection", { cancelable: true }));
      assert.equal(ld.count(EV_ERROR), 2);
    });
  }

  it("SDK missing → window errors are ignored without throwing", async () => {
    const game = await bootGame({});
    const w = game.window;
    assert.doesNotThrow(() => {
      w.dispatchEvent(new w.ErrorEvent("error", { message: "boom" }));
      w.dispatchEvent(new w.Event("unhandledrejection"));
    });
    game.clickStart();
    assert.equal(game.$("overlay").style.display, "none");
  });
});

/* ---------------- telemetry can never break the game ---------------- */

describe("enable-player-login: track() throwing is harmless", () => {
  it("control → start, restart and page errors still work when track() throws", async () => {
    const ld = makeFakeLD({ variation: "control", trackThrows: true });
    const game = await bootGame({ ld });
    game.clickStart();
    assert.equal(game.$("overlay").style.display, "none");
    const w = game.window;
    assert.doesNotThrow(() => w.dispatchEvent(new w.ErrorEvent("error", { message: "boom" })));
    game.pressKey("KeyR");
    assert.equal(game.$("overlay").style.display, "none");
  });

  it("v1 → login, identify failure and start still work when track() throws", async () => {
    const ld = makeFakeLD({ variation: "v1", trackThrows: true, identifyThrows: true });
    const game = await bootGame({ ld });
    game.submitLogin("ACE");
    assert.equal(game.$("playerVal").textContent, "ACE");
    assert.equal(game.window.localStorage.getItem(STORAGE_KEY), "ACE");
    assert.equal(game.$("loginOverlay").style.display, "none");
    assert.equal(game.$("overlay").style.display, "flex");
    game.clickStart();
    assert.equal(game.$("overlay").style.display, "none");
  });
});
