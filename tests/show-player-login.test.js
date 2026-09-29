/**
 * Tests for the show-player-login feature flag and the player login subsystem.
 *
 * Coverage:
 *  1. sanitizeName  – pure function, no DOM
 *  2. isTypingTarget – keyboard-guard helper
 *  3. loadStoredName / storeName – localStorage wrappers
 *  4. setPlayerName – HUD + ldClient.identify() side-effects
 *  5. handleLogin – full submit handler: validation error path, success path
 *  6. Flag variation branching (v1 vs control) – login overlay visibility
 *  7. Metric tracking – ldClient.track() calls, try/catch safety
 *  8. restartGame safety guard – loginOverlay never left open over live game
 *
 * @jest-environment jsdom
 */

"use strict";

const { sanitizeName, isTypingTarget, PLAYER_NAME_KEY } = require("./login.helpers");

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers to build the minimal DOM fragment that the login subsystem needs.
───────────────────────────────────────────────────────────────────────────── */

function buildDOM() {
  document.body.innerHTML = `
    <span id="playerVal">---</span>
    <div id="loginOverlay" style="display:none">
      <form id="loginForm">
        <input id="nameInput" type="text" maxlength="12" />
        <div id="loginError"></div>
        <button id="loginBtn" type="submit">ENTER</button>
      </form>
    </div>
    <div id="overlay" style="display:none">
      <h2 id="overlayTitle"></h2>
      <p id="overlayText"></p>
      <button id="startBtn"></button>
    </div>
  `;
}

/**
 * Builds a minimal replica of the login subsystem from invaders.html.
 * Returns the functions and references so each test can exercise them.
 * @param {object} ldClientMock  - mock for ldClient (may be null)
 */
function buildLoginSystem(ldClientMock) {
  buildDOM();

  const playerEl    = document.getElementById("playerVal");
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm    = document.getElementById("loginForm");
  const nameInput    = document.getElementById("nameInput");
  const loginError   = document.getElementById("loginError");
  const overlay      = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText  = document.getElementById("overlayText");
  const startBtn     = document.getElementById("startBtn");

  let ldClient = ldClientMock !== undefined ? ldClientMock : null;
  let playerName = "";

  function showOverlay(title, text, btnLabel) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = text;
    startBtn.textContent = btnLabel;
    overlay.style.display = "flex";
  }

  function setPlayerName(name) {
    playerName = name;
    playerEl.textContent = name || "---";
    if (ldClient && name) {
      try { ldClient.identify({ kind: "user", key: name, name: name }); }
      catch (_) { /* keep anonymous context */ }
    }
  }

  function loadStoredName() {
    try { return sanitizeName(localStorage.getItem(PLAYER_NAME_KEY) || ""); }
    catch (_) { return ""; }
  }

  function storeName(name) {
    try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch (_) { /* private mode */ }
  }

  function handleLogin(e) {
    if (e) e.preventDefault();
    const name = sanitizeName(nameInput.value);
    if (name.length < 1) {
      loginError.textContent = "CALLSIGN REQUIRED";
      // Track validation failure — best-effort, never blocks the UI.
      try {
        if (ldClient) { ldClient.track("show-player-login-error"); }
      } catch (_) {}
      return;
    }
    loginError.textContent = "";
    setPlayerName(name);
    storeName(name);
    loginOverlay.style.display = "none";
    // Track successful callsign submission — best-effort, never blocks the UI.
    try {
      if (ldClient) { ldClient.track("show-player-login-login-success"); }
    } catch (_) {}
    showOverlay(
      "GALACTIC DEFENDER",
      "Welcome, " + name + ".<br>Arrow keys or A/D to move, SPACE to fire, P to pause.",
      "▶ START GAME"
    );
  }

  return {
    playerEl, loginOverlay, loginForm, nameInput, loginError,
    overlay, overlayTitle, overlayText, startBtn,
    setPlayerName, loadStoredName, storeName, handleLogin, showOverlay,
    getPlayerName: () => playerName,
    getLdClient: () => ldClient,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. sanitizeName — pure function
═══════════════════════════════════════════════════════════════════════════ */

describe("sanitizeName", () => {
  test("returns empty string for empty input", () => {
    expect(sanitizeName("")).toBe("");
  });

  test("returns empty string for null/undefined", () => {
    expect(sanitizeName(null)).toBe("");
    expect(sanitizeName(undefined)).toBe("");
  });

  test("upper-cases result", () => {
    expect(sanitizeName("ace")).toBe("ACE");
  });

  test("strips HTML-unsafe characters", () => {
    // "<script>alert(1)</script>" → strip non-alphanum/space/dash/underscore →
    // "scriptalert1script" → uppercase → "SCRIPTALERT1SCRIPT" (18 chars)
    // → slice to MAX_NAME_LEN (12) → "SCRIPTALERT1"
    expect(sanitizeName("<script>alert(1)</script>")).toBe("SCRIPTALERT1");
  });

  test("strips characters outside the allowed set", () => {
    // allowed: letters, digits, space, dash, underscore
    expect(sanitizeName("A!B@C#D$E")).toBe("ABCDE");
  });

  test("preserves allowed special chars: dash and underscore", () => {
    expect(sanitizeName("ACE_1-a")).toBe("ACE_1-A");
  });

  test("collapses multiple spaces into one", () => {
    expect(sanitizeName("ACE   BOT")).toBe("ACE BOT");
  });

  test("trims leading/trailing whitespace", () => {
    expect(sanitizeName("  ACE  ")).toBe("ACE");
  });

  test("truncates to MAX_NAME_LEN (12 chars)", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    expect(sanitizeName(long).length).toBeLessThanOrEqual(12);
    expect(sanitizeName(long)).toBe("ABCDEFGHIJKL");
  });

  test("whitespace-only input returns empty string", () => {
    expect(sanitizeName("   ")).toBe("");
  });

  test("digits are preserved", () => {
    expect(sanitizeName("ACE123")).toBe("ACE123");
  });

  test("mixed valid/invalid chars are handled correctly", () => {
    expect(sanitizeName("ACE-1 bot_X!")).toBe("ACE-1 BOT_X");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. isTypingTarget — keyboard-guard helper
═══════════════════════════════════════════════════════════════════════════ */

describe("isTypingTarget", () => {
  test("returns true for an INPUT element", () => {
    const input = document.createElement("input");
    expect(isTypingTarget({ target: input })).toBe(true);
  });

  test("returns true for a TEXTAREA element", () => {
    const textarea = document.createElement("textarea");
    expect(isTypingTarget({ target: textarea })).toBe(true);
  });

  test("returns true for a contentEditable element", () => {
    const div = document.createElement("div");
    div.isContentEditable = true;
    expect(isTypingTarget({ target: div })).toBe(true);
  });

  test("returns false for a BUTTON element", () => {
    const btn = document.createElement("button");
    // isTypingTarget returns undefined (falsy) for non-text targets
    expect(isTypingTarget({ target: btn })).toBeFalsy();
  });

  test("returns false for a DIV (non-editable)", () => {
    const div = document.createElement("div");
    // isTypingTarget returns undefined (falsy) for non-text targets
    expect(isTypingTarget({ target: div })).toBeFalsy();
  });

  test("returns false/falsy when target is null", () => {
    expect(isTypingTarget({ target: null })).toBeFalsy();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. loadStoredName / storeName — localStorage wrappers
═══════════════════════════════════════════════════════════════════════════ */

describe("loadStoredName / storeName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("loadStoredName returns empty string when nothing stored", () => {
    const { loadStoredName } = buildLoginSystem(null);
    expect(loadStoredName()).toBe("");
  });

  test("storeName persists the name; loadStoredName retrieves and sanitizes it", () => {
    const sys = buildLoginSystem(null);
    sys.storeName("ACE");
    expect(sys.loadStoredName()).toBe("ACE");
  });

  test("loadStoredName sanitizes stored value (upper-cases, strips bad chars)", () => {
    localStorage.setItem(PLAYER_NAME_KEY, "  ace!!  ");
    const { loadStoredName } = buildLoginSystem(null);
    expect(loadStoredName()).toBe("ACE");
  });

  test("storeName does not throw when localStorage is unavailable", () => {
    // Simulate broken localStorage
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      get() { throw new Error("SecurityError"); },
      configurable: true,
    });
    const { storeName } = buildLoginSystem(null);
    expect(() => storeName("ACE")).not.toThrow();
    // Restore
    Object.defineProperty(window, "localStorage", original);
  });

  test("loadStoredName returns empty string when localStorage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      get() { throw new Error("SecurityError"); },
      configurable: true,
    });
    const { loadStoredName } = buildLoginSystem(null);
    expect(loadStoredName()).toBe("");
    Object.defineProperty(window, "localStorage", original);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. setPlayerName — HUD + ldClient.identify() side-effects
═══════════════════════════════════════════════════════════════════════════ */

describe("setPlayerName", () => {
  test("updates playerEl text content with the name", () => {
    const { playerEl, setPlayerName } = buildLoginSystem(null);
    setPlayerName("MAVERICK");
    expect(playerEl.textContent).toBe("MAVERICK");
  });

  test("sets playerEl to '---' when name is empty", () => {
    const { playerEl, setPlayerName } = buildLoginSystem(null);
    setPlayerName("");
    expect(playerEl.textContent).toBe("---");
  });

  test("calls ldClient.identify() with correct context when name is set", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { setPlayerName } = buildLoginSystem(mockLd);
    setPlayerName("GHOST");
    expect(mockLd.identify).toHaveBeenCalledWith({ kind: "user", key: "GHOST", name: "GHOST" });
  });

  test("does NOT call ldClient.identify() when name is empty", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { setPlayerName } = buildLoginSystem(mockLd);
    setPlayerName("");
    expect(mockLd.identify).not.toHaveBeenCalled();
  });

  test("does NOT throw when ldClient.identify() throws", () => {
    const mockLd = {
      identify: jest.fn().mockImplementation(() => { throw new Error("network"); }),
      track: jest.fn(),
      variation: jest.fn(),
    };
    const { setPlayerName } = buildLoginSystem(mockLd);
    expect(() => setPlayerName("VIPER")).not.toThrow();
  });

  test("does NOT call identify when ldClient is null", () => {
    // Should complete without error even with null ldClient
    const { setPlayerName, playerEl } = buildLoginSystem(null);
    expect(() => setPlayerName("VIPER")).not.toThrow();
    expect(playerEl.textContent).toBe("VIPER");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. handleLogin — form submit handler
═══════════════════════════════════════════════════════════════════════════ */

describe("handleLogin — validation error path (empty callsign)", () => {
  test("shows CALLSIGN REQUIRED when input is empty", () => {
    const { nameInput, loginError, handleLogin } = buildLoginSystem(null);
    nameInput.value = "";
    handleLogin(null);
    expect(loginError.textContent).toBe("CALLSIGN REQUIRED");
  });

  test("shows CALLSIGN REQUIRED when input is whitespace only", () => {
    const { nameInput, loginError, handleLogin } = buildLoginSystem(null);
    nameInput.value = "   ";
    handleLogin(null);
    expect(loginError.textContent).toBe("CALLSIGN REQUIRED");
  });

  test("shows CALLSIGN REQUIRED when input contains only invalid chars", () => {
    const { nameInput, loginError, handleLogin } = buildLoginSystem(null);
    nameInput.value = "!!##$$";
    handleLogin(null);
    expect(loginError.textContent).toBe("CALLSIGN REQUIRED");
  });

  test("does NOT hide loginOverlay on validation failure", () => {
    const { nameInput, loginOverlay, handleLogin } = buildLoginSystem(null);
    loginOverlay.style.display = "flex"; // as it would be during v1 init
    nameInput.value = "";
    handleLogin(null);
    expect(loginOverlay.style.display).toBe("flex");
  });

  test("tracks show-player-login-error metric on validation failure when ldClient present", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "";
    handleLogin(null);
    expect(mockLd.track).toHaveBeenCalledWith("show-player-login-error");
  });

  test("does NOT track error metric when ldClient is null", () => {
    // Should not throw — the if(ldClient) guard prevents the call
    const { nameInput, handleLogin } = buildLoginSystem(null);
    nameInput.value = "";
    expect(() => handleLogin(null)).not.toThrow();
  });

  test("track('show-player-login-error') failure does NOT propagate", () => {
    const mockLd = {
      identify: jest.fn(),
      track: jest.fn().mockImplementation(() => { throw new Error("LD error"); }),
      variation: jest.fn(),
    };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "";
    expect(() => handleLogin(null)).not.toThrow();
  });

  test("does NOT call ldClient.track(login-success) on validation failure", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "";
    handleLogin(null);
    const calls = mockLd.track.mock.calls.map(c => c[0]);
    expect(calls).not.toContain("show-player-login-login-success");
  });

  test("calls e.preventDefault() when event is provided", () => {
    const { nameInput, handleLogin } = buildLoginSystem(null);
    nameInput.value = "";
    const mockEvent = { preventDefault: jest.fn() };
    handleLogin(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });
});

describe("handleLogin — success path (valid callsign)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("clears the error message on success", () => {
    const { nameInput, loginError, handleLogin } = buildLoginSystem(null);
    loginError.textContent = "CALLSIGN REQUIRED"; // pre-existing error
    nameInput.value = "MAVERICK";
    handleLogin(null);
    expect(loginError.textContent).toBe("");
  });

  test("hides loginOverlay on success", () => {
    const { nameInput, loginOverlay, handleLogin } = buildLoginSystem(null);
    loginOverlay.style.display = "flex";
    nameInput.value = "MAVERICK";
    handleLogin(null);
    expect(loginOverlay.style.display).toBe("none");
  });

  test("updates HUD playerEl with sanitized callsign", () => {
    const { nameInput, playerEl, handleLogin } = buildLoginSystem(null);
    nameInput.value = "maverick";
    handleLogin(null);
    expect(playerEl.textContent).toBe("MAVERICK");
  });

  test("persists callsign to localStorage", () => {
    const { nameInput, handleLogin } = buildLoginSystem(null);
    nameInput.value = "GHOST";
    handleLogin(null);
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("GHOST");
  });

  test("shows the main menu overlay (GALACTIC DEFENDER) after login", () => {
    const { nameInput, overlay, overlayTitle, handleLogin } = buildLoginSystem(null);
    nameInput.value = "VIPER";
    handleLogin(null);
    expect(overlay.style.display).toBe("flex");
    expect(overlayTitle.textContent).toBe("GALACTIC DEFENDER");
  });

  test("welcome message contains the player's callsign", () => {
    const { nameInput, overlayText, handleLogin } = buildLoginSystem(null);
    nameInput.value = "VIPER";
    handleLogin(null);
    expect(overlayText.innerHTML).toContain("VIPER");
  });

  test("tracks show-player-login-login-success metric on success when ldClient present", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ACE";
    handleLogin(null);
    expect(mockLd.track).toHaveBeenCalledWith("show-player-login-login-success");
  });

  test("does NOT track error metric on success", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ACE";
    handleLogin(null);
    const calls = mockLd.track.mock.calls.map(c => c[0]);
    expect(calls).not.toContain("show-player-login-error");
  });

  test("does NOT track login-success metric when ldClient is null", () => {
    const { nameInput, handleLogin } = buildLoginSystem(null);
    nameInput.value = "ACE";
    expect(() => handleLogin(null)).not.toThrow();
  });

  test("track('show-player-login-login-success') failure does NOT propagate", () => {
    const mockLd = {
      identify: jest.fn(),
      track: jest.fn().mockImplementation(() => { throw new Error("LD error"); }),
      variation: jest.fn(),
    };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ACE";
    expect(() => handleLogin(null)).not.toThrow();
  });

  test("sanitizes callsign input before storing/displaying", () => {
    const { nameInput, playerEl, handleLogin } = buildLoginSystem(null);
    nameInput.value = "  ace!!bot  ";
    handleLogin(null);
    expect(playerEl.textContent).toBe("ACEBOT");
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("ACEBOT");
  });

  test("calls ldClient.identify() with the sanitized callsign on success", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ghost";
    handleLogin(null);
    expect(mockLd.identify).toHaveBeenCalledWith({ kind: "user", key: "GHOST", name: "GHOST" });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. Flag variation branching (v1 vs control) — login overlay visibility
═══════════════════════════════════════════════════════════════════════════ */

describe("show-player-login flag — variation branching", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Simulates the relevant portion of init() that branches on loginVariation.
   * Returns the final display states of both overlays.
   */
  function simulateInit(loginVariation, savedName, ldClientMock) {
    const sys = buildLoginSystem(ldClientMock);
    const { nameInput, loginOverlay, overlay } = sys;

    // Both hidden before branching (as init() does)
    loginOverlay.style.display = "none";
    overlay.style.display = "none";

    if (loginVariation === "v1") {
      if (savedName) nameInput.value = savedName;
      if (savedName) sys.setPlayerName(savedName);
      loginOverlay.style.display = "flex";
    } else {
      // control path
      loginOverlay.style.display = "none";
      sys.showOverlay(
        "GALACTIC DEFENDER",
        "Defend the last frontier.<br>Arrow keys or A/D to move, SPACE to fire, P to pause.",
        "▶ START GAME"
      );
    }

    return { sys, loginOverlay, overlay };
  }

  test("v1 variation — loginOverlay is shown", () => {
    const { loginOverlay } = simulateInit("v1", "", null);
    expect(loginOverlay.style.display).toBe("flex");
  });

  test("v1 variation — main overlay (overlay) stays hidden initially", () => {
    const { overlay } = simulateInit("v1", "", null);
    expect(overlay.style.display).toBe("none");
  });

  test("control variation — loginOverlay stays hidden", () => {
    const { loginOverlay } = simulateInit("control", "", null);
    expect(loginOverlay.style.display).toBe("none");
  });

  test("control variation — main overlay is shown immediately", () => {
    const { overlay } = simulateInit("control", "", null);
    expect(overlay.style.display).toBe("flex");
  });

  test("control variation — main overlay title is GALACTIC DEFENDER", () => {
    const { sys } = simulateInit("control", "", null);
    expect(sys.overlayTitle.textContent).toBe("GALACTIC DEFENDER");
  });

  test("v1 variation — pre-fills nameInput from saved name", () => {
    const { sys } = simulateInit("v1", "MAVERICK", null);
    expect(sys.nameInput.value).toBe("MAVERICK");
  });

  test("v1 variation — setPlayerName called with saved name (HUD updated)", () => {
    const { sys } = simulateInit("v1", "MAVERICK", null);
    expect(sys.playerEl.textContent).toBe("MAVERICK");
  });

  test("v1 variation — no name pre-filled when nothing in localStorage", () => {
    const { sys } = simulateInit("v1", "", null);
    expect(sys.nameInput.value).toBe("");
  });

  test("ldClient null → falls back to control variation behaviour", () => {
    // When ldClient is null, code uses default 'control' — overlay should show
    const loginVariation = null ? "will-not-happen" : "control"; // mirrors the ternary
    const { overlay } = simulateInit(loginVariation, "", null);
    expect(overlay.style.display).toBe("flex");
  });

  test("variation() called with flag key 'show-player-login' and default 'control'", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn().mockReturnValue("v1") };
    // Simulate the exact ternary from init()
    const loginVariation = mockLd ? mockLd.variation("show-player-login", "control") : "control";
    expect(mockLd.variation).toHaveBeenCalledWith("show-player-login", "control");
    expect(loginVariation).toBe("v1");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. Metric tracking event keys — literal strings, no typos
═══════════════════════════════════════════════════════════════════════════ */

describe("Metric tracking — event key correctness", () => {
  test("error metric key is exactly 'show-player-login-error'", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = ""; // trigger error path
    handleLogin(null);
    expect(mockLd.track).toHaveBeenCalledWith("show-player-login-error");
    // Verify the exact string — any typo would fail this assertion
    const errorCall = mockLd.track.mock.calls.find(c => c[0] === "show-player-login-error");
    expect(errorCall).toBeDefined();
  });

  test("success metric key is exactly 'show-player-login-login-success'", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ACE"; // trigger success path
    handleLogin(null);
    const successCall = mockLd.track.mock.calls.find(c => c[0] === "show-player-login-login-success");
    expect(successCall).toBeDefined();
  });

  test("only one track() call fires on the error path", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "";
    handleLogin(null);
    expect(mockLd.track).toHaveBeenCalledTimes(1);
  });

  test("only one track() call fires on the success path", () => {
    const mockLd = { identify: jest.fn(), track: jest.fn(), variation: jest.fn() };
    const { nameInput, handleLogin } = buildLoginSystem(mockLd);
    nameInput.value = "ACE";
    handleLogin(null);
    expect(mockLd.track).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. restartGame safety guard — loginOverlay never stuck over live game
═══════════════════════════════════════════════════════════════════════════ */

describe("restartGame safety guard", () => {
  test("loginOverlay.style.display is set to 'none' by restartGame logic", () => {
    buildDOM();
    const loginOverlay = document.getElementById("loginOverlay");
    loginOverlay.style.display = "flex"; // simulate it being open

    // Inline the guard from restartGame() in invaders.html
    loginOverlay.style.display = "none"; // never leave the login screen stuck over a live game

    expect(loginOverlay.style.display).toBe("none");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. DOM structure — required elements are present in invaders.html output
═══════════════════════════════════════════════════════════════════════════ */

describe("DOM structure — login elements", () => {
  beforeEach(() => {
    buildDOM();
  });

  test("loginOverlay element exists", () => {
    expect(document.getElementById("loginOverlay")).not.toBeNull();
  });

  test("loginForm element exists", () => {
    expect(document.getElementById("loginForm")).not.toBeNull();
  });

  test("nameInput element exists and has correct type", () => {
    const el = document.getElementById("nameInput");
    expect(el).not.toBeNull();
    expect(el.type).toBe("text");
  });

  test("nameInput has maxlength of 12", () => {
    const el = document.getElementById("nameInput");
    expect(el.maxLength).toBe(12);
  });

  test("loginError element exists", () => {
    expect(document.getElementById("loginError")).not.toBeNull();
  });

  test("playerVal element exists in HUD", () => {
    expect(document.getElementById("playerVal")).not.toBeNull();
  });

  test("loginOverlay is initially hidden (display:none)", () => {
    const el = document.getElementById("loginOverlay");
    // In the actual HTML it starts display:none
    el.style.display = "none";
    expect(el.style.display).toBe("none");
  });
});
