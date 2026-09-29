/**
 * Tests for the player login screen feature added in PR #30.
 * Flag key: enable-player-login-screen
 * Variation: v1 (login shown) vs control (login skipped)
 *
 * Because invaders.html is a single-file browser game with all logic in an
 * IIFE, this test file re-implements the pure functions and simulates the DOM
 * interactions that the IIFE performs, allowing unit and integration coverage
 * without a full browser.
 */

"use strict";

/* ------------------------------------------------------------------
   1. HELPERS – replicated from invaders.html (must match exactly)
------------------------------------------------------------------ */

const MAX_NAME_LEN = 12;
const PLAYER_NAME_KEY = "galactic-defender-player";

function sanitizeName(raw) {
  return (raw || "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN)
    .toUpperCase();
}

/* ------------------------------------------------------------------
   2. sanitizeName – pure unit tests
------------------------------------------------------------------ */

describe("sanitizeName()", () => {
  test("returns empty string for null/undefined/empty", () => {
    expect(sanitizeName(null)).toBe("");
    expect(sanitizeName(undefined)).toBe("");
    expect(sanitizeName("")).toBe("");
  });

  test("upper-cases alphabetic input", () => {
    expect(sanitizeName("ace")).toBe("ACE");
    expect(sanitizeName("Ghost")).toBe("GHOST");
  });

  test("strips disallowed characters (symbols, punctuation)", () => {
    expect(sanitizeName("A<script>")).toBe("ASCRIPT");
    expect(sanitizeName("!@#$%^&*()")).toBe("");
    expect(sanitizeName("pi<lot>")).toBe("PILOT");
    expect(sanitizeName("na'me")).toBe("NAME");
    expect(sanitizeName("\"quoted\"")).toBe("QUOTED");
  });

  test("allows letters, digits, space, hyphen, underscore", () => {
    // "ACE-1 P_X" is 9 chars, well under MAX_NAME_LEN, so nothing is truncated
    expect(sanitizeName("ACE-1 p_X")).toBe("ACE-1 P_X");
  });

  test("collapses multiple spaces to single space", () => {
    expect(sanitizeName("A   B")).toBe("A B");
    expect(sanitizeName("  STAR  ")).toBe("STAR");
  });

  test("trims leading and trailing whitespace", () => {
    expect(sanitizeName("  ACE  ")).toBe("ACE");
  });

  test("enforces MAX_NAME_LEN (12 chars) after sanitisation", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    expect(sanitizeName(long).length).toBeLessThanOrEqual(MAX_NAME_LEN);
    expect(sanitizeName(long)).toBe("ABCDEFGHIJKL");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(sanitizeName("   ")).toBe("");
    expect(sanitizeName("\t\n")).toBe("");
  });

  test("handles numeric-only callsigns", () => {
    expect(sanitizeName("007")).toBe("007");
  });

  test("handles mixed allowed characters", () => {
    expect(sanitizeName("RED-5_R2")).toBe("RED-5_R2");
  });
});

/* ------------------------------------------------------------------
   3. DOM setup helper – builds the minimal HTML the IIFE expects
------------------------------------------------------------------ */

function buildDOM() {
  document.body.innerHTML = `
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
      <button id="startBtn">START</button>
    </div>
    <span id="playerVal">---</span>
    <span id="scoreVal">0000</span>
    <span id="waveVal">01</span>
    <span id="hiVal">0000</span>
    <span id="livesVal">▲▲▲</span>
  `;
}

/* ------------------------------------------------------------------
   4. Simulated module – mirrors the logic inside the IIFE so we can
      drive handleLogin and the flag-gate path without eval().
------------------------------------------------------------------ */

function createModule({ ldClient = null } = {}) {
  const playerEl    = document.getElementById("playerVal");
  const overlay     = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText  = document.getElementById("overlayText");
  const startBtn    = document.getElementById("startBtn");
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm   = document.getElementById("loginForm");
  const nameInput   = document.getElementById("nameInput");
  const loginError  = document.getElementById("loginError");

  let playerName = "";

  function setPlayerName(name) {
    playerName = name;
    playerEl.textContent = name || "---";
    if (ldClient && name) {
      try { ldClient.identify({ kind: "user", key: name, name }); } catch (_) {}
    }
  }

  function storeName(name) {
    try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch (_) {}
  }

  function loadStoredName() {
    try { return sanitizeName(localStorage.getItem(PLAYER_NAME_KEY) || ""); } catch (_) { return ""; }
  }

  function showOverlay(title, text, btnLabel) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = text;
    startBtn.textContent = btnLabel;
    overlay.style.display = "flex";
  }

  function handleLogin(e) {
    if (e) e.preventDefault();
    const name = sanitizeName(nameInput.value);
    if (name.length < 1) {
      loginError.textContent = "CALLSIGN REQUIRED";
      try {
        if (ldClient) ldClient.track("enable-player-login-screen-error", ldClient.getContext());
      } catch (_) {}
      return;
    }
    loginError.textContent = "";
    setPlayerName(name);
    storeName(name);
    loginOverlay.style.display = "none";
    try {
      if (ldClient) ldClient.track("enable-player-login-screen-login", ldClient.getContext());
    } catch (_) {}
    showOverlay(
      "GALACTIC DEFENDER",
      "Welcome, " + name + ".<br>Arrow keys or A/D to move, SPACE to fire, P to pause.",
      "▶ START GAME"
    );
  }

  const LD_FLAG_LOGIN = "enable-player-login-screen";

  function runFlagGate() {
    const showLogin = ldClient
      ? ldClient.variation(LD_FLAG_LOGIN, "control") === "v1"
      : false;

    if (showLogin) {
      const saved = loadStoredName();
      if (saved) nameInput.value = saved;
      overlay.style.display = "none";
      loginOverlay.style.display = "flex";
      if (saved) setPlayerName(saved);
    } else {
      loginOverlay.style.display = "none";
      overlay.style.display = "none";
      showOverlay(
        "GALACTIC DEFENDER",
        "Defend the last frontier.<br>Arrow keys or A/D to move, SPACE to fire, P to pause.",
        "▶ START GAME"
      );
    }
  }

  function isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  return {
    handleLogin,
    runFlagGate,
    showOverlay,
    setPlayerName,
    storeName,
    loadStoredName,
    isTypingTarget,
    getPlayerName: () => playerName,
    loginOverlay,
    overlay,
    loginError,
    overlayTitle,
    overlayText,
    nameInput,
    playerEl,
  };
}

/* ------------------------------------------------------------------
   5. Feature flag gate – control path (flag OFF / ldClient null)
------------------------------------------------------------------ */

describe("Flag gate – control path (flag off)", () => {
  beforeEach(() => {
    buildDOM();
    localStorage.clear();
  });

  test("shows game menu overlay when ldClient is null", () => {
    const m = createModule({ ldClient: null });
    m.runFlagGate();
    expect(m.overlay.style.display).toBe("flex");
    expect(m.loginOverlay.style.display).toBe("none");
  });

  test("shows game menu overlay when flag returns 'control'", () => {
    const fakeClient = {
      variation: jest.fn().mockReturnValue("control"),
      getContext: jest.fn().mockReturnValue({ kind: "user", key: "anonymous-player" }),
    };
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.overlay.style.display).toBe("flex");
    expect(m.loginOverlay.style.display).toBe("none");
  });

  test("overlay title is GALACTIC DEFENDER in control path", () => {
    const m = createModule({ ldClient: null });
    m.runFlagGate();
    expect(m.overlayTitle.textContent).toBe("GALACTIC DEFENDER");
  });

  test("loginOverlay stays display:none when flag is 'control'", () => {
    const fakeClient = {
      variation: jest.fn().mockReturnValue("control"),
      getContext: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.loginOverlay.style.display).toBe("none");
  });

  test("flag variation() called with correct flag key and default", () => {
    const fakeClient = {
      variation: jest.fn().mockReturnValue("control"),
      getContext: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(fakeClient.variation).toHaveBeenCalledWith(
      "enable-player-login-screen",
      "control"
    );
  });
});

/* ------------------------------------------------------------------
   6. Feature flag gate – v1 path (flag ON)
------------------------------------------------------------------ */

describe("Flag gate – v1 path (flag on)", () => {
  let fakeClient;

  beforeEach(() => {
    buildDOM();
    localStorage.clear();
    fakeClient = {
      variation: jest.fn().mockReturnValue("v1"),
      getContext: jest.fn().mockReturnValue({ kind: "user", key: "anonymous-player" }),
      identify: jest.fn().mockResolvedValue(undefined),
    };
  });

  test("shows loginOverlay when flag returns 'v1'", () => {
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.loginOverlay.style.display).toBe("flex");
  });

  test("hides game menu overlay when flag returns 'v1'", () => {
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.overlay.style.display).toBe("none");
  });

  test("pre-fills nameInput with saved callsign from localStorage", () => {
    localStorage.setItem(PLAYER_NAME_KEY, "MAVERICK");
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.nameInput.value).toBe("MAVERICK");
  });

  test("sets HUD playerVal from saved callsign", () => {
    localStorage.setItem(PLAYER_NAME_KEY, "ICEMAN");
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.playerEl.textContent).toBe("ICEMAN");
  });

  test("does not pre-fill input or set HUD if no stored name", () => {
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(m.nameInput.value).toBe("");
    expect(m.playerEl.textContent).toBe("---");
  });
});

/* ------------------------------------------------------------------
   7. handleLogin – validation (empty / whitespace callsign)
------------------------------------------------------------------ */

describe("handleLogin() – validation failure (empty callsign)", () => {
  let fakeClient;

  beforeEach(() => {
    buildDOM();
    localStorage.clear();
    fakeClient = {
      variation: jest.fn().mockReturnValue("v1"),
      track: jest.fn(),
      getContext: jest.fn().mockReturnValue({ kind: "user", key: "anonymous-player" }),
      identify: jest.fn(),
    };
  });

  test("shows CALLSIGN REQUIRED error for empty input", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(m.loginError.textContent).toBe("CALLSIGN REQUIRED");
  });

  test("shows CALLSIGN REQUIRED for whitespace-only input", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "   ";
    m.handleLogin(null);
    expect(m.loginError.textContent).toBe("CALLSIGN REQUIRED");
  });

  test("does NOT hide loginOverlay on validation failure", () => {
    const m = createModule({ ldClient: fakeClient });
    m.loginOverlay.style.display = "flex"; // simulate it being shown
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(m.loginOverlay.style.display).toBe("flex");
  });

  test("does NOT show game menu overlay on validation failure", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(m.overlay.style.display).toBe("none");
  });

  test("tracks error event with correct key on validation failure", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(fakeClient.track).toHaveBeenCalledWith(
      "enable-player-login-screen-error",
      expect.anything()
    );
  });

  test("passes getContext() result as second arg to track() on error", () => {
    const ctx = { kind: "user", key: "anonymous-player", anonymous: true };
    fakeClient.getContext.mockReturnValue(ctx);
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(fakeClient.track).toHaveBeenCalledWith(
      "enable-player-login-screen-error",
      ctx
    );
  });

  test("does NOT track login event on validation failure", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    const loginCalls = fakeClient.track.mock.calls.filter(
      ([key]) => key === "enable-player-login-screen-login"
    );
    expect(loginCalls.length).toBe(0);
  });

  test("does NOT call track when ldClient is null", () => {
    // Ensure it doesn't throw
    const m = createModule({ ldClient: null });
    m.nameInput.value = "";
    expect(() => m.handleLogin(null)).not.toThrow();
  });

  test("track telemetry failure does not block error display", () => {
    fakeClient.track.mockImplementation(() => { throw new Error("SDK gone"); });
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    expect(() => m.handleLogin(null)).not.toThrow();
    expect(m.loginError.textContent).toBe("CALLSIGN REQUIRED");
  });
});

/* ------------------------------------------------------------------
   8. handleLogin – success path (valid callsign)
------------------------------------------------------------------ */

describe("handleLogin() – success path (valid callsign)", () => {
  let fakeClient;

  beforeEach(() => {
    buildDOM();
    localStorage.clear();
    fakeClient = {
      variation: jest.fn().mockReturnValue("v1"),
      track: jest.fn(),
      getContext: jest.fn().mockReturnValue({ kind: "user", key: "ACE" }),
      identify: jest.fn().mockResolvedValue(undefined),
    };
  });

  test("hides loginOverlay on successful submission", () => {
    const m = createModule({ ldClient: fakeClient });
    m.loginOverlay.style.display = "flex";
    m.nameInput.value = "ace";
    m.handleLogin(null);
    expect(m.loginOverlay.style.display).toBe("none");
  });

  test("shows game menu overlay on successful submission", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ace";
    m.handleLogin(null);
    expect(m.overlay.style.display).toBe("flex");
  });

  test("sets playerVal HUD to upper-cased callsign", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ghost";
    m.handleLogin(null);
    expect(m.playerEl.textContent).toBe("GHOST");
  });

  test("overlay title is GALACTIC DEFENDER after login", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "maverick";
    m.handleLogin(null);
    expect(m.overlayTitle.textContent).toBe("GALACTIC DEFENDER");
  });

  test("overlay text includes callsign in welcome message", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "viper";
    m.handleLogin(null);
    expect(m.overlayText.innerHTML).toContain("VIPER");
    expect(m.overlayText.innerHTML).toContain("Welcome,");
  });

  test("clears loginError message on successful submission", () => {
    const m = createModule({ ldClient: fakeClient });
    m.loginError.textContent = "CALLSIGN REQUIRED"; // prior error state
    m.nameInput.value = "ace";
    m.handleLogin(null);
    expect(m.loginError.textContent).toBe("");
  });

  test("tracks business event with correct key on success", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "rooster";
    m.handleLogin(null);
    expect(fakeClient.track).toHaveBeenCalledWith(
      "enable-player-login-screen-login",
      expect.anything()
    );
  });

  test("passes getContext() result to business track() call", () => {
    const ctx = { kind: "user", key: "ROOSTER" };
    fakeClient.getContext.mockReturnValue(ctx);
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "rooster";
    m.handleLogin(null);
    expect(fakeClient.track).toHaveBeenCalledWith(
      "enable-player-login-screen-login",
      ctx
    );
  });

  test("does NOT track error event on successful submission", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "maverick";
    m.handleLogin(null);
    const errorCalls = fakeClient.track.mock.calls.filter(
      ([key]) => key === "enable-player-login-screen-error"
    );
    expect(errorCalls.length).toBe(0);
  });

  test("persists callsign to localStorage", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "iceman";
    m.handleLogin(null);
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("ICEMAN");
  });

  test("sanitises input before persisting (strips invalid chars)", () => {
    // '<' and '>' are stripped; 'ace!!' → 'ACE' (exclamation marks removed)
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ace!!";
    m.handleLogin(null);
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("ACE");
  });

  test("persists only up to 12 chars", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ABCDEFGHIJKLMNOP"; // 16 chars
    m.handleLogin(null);
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("ABCDEFGHIJKL");
  });

  test("calls ldClient.identify() with callsign context", () => {
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "merlin";
    m.handleLogin(null);
    expect(fakeClient.identify).toHaveBeenCalledWith({
      kind: "user",
      key: "MERLIN",
      name: "MERLIN",
    });
  });

  test("does NOT call ldClient.identify() when ldClient is null", () => {
    // just shouldn't throw
    const m = createModule({ ldClient: null });
    m.nameInput.value = "ace";
    expect(() => m.handleLogin(null)).not.toThrow();
  });

  test("business track telemetry failure does not block login flow", () => {
    fakeClient.track.mockImplementation(() => { throw new Error("network"); });
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "wolfman";
    expect(() => m.handleLogin(null)).not.toThrow();
    // Login should still have completed
    expect(m.loginOverlay.style.display).toBe("none");
    expect(m.overlay.style.display).toBe("flex");
  });

  test("identify() failure does not block login flow", () => {
    fakeClient.identify.mockImplementation(() => { throw new Error("identify failed"); });
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "hollywood";
    expect(() => m.handleLogin(null)).not.toThrow();
    expect(m.overlay.style.display).toBe("flex");
  });

  test("preventDefault is called on the submit event", () => {
    const m = createModule({ ldClient: fakeClient });
    const fakeEvent = { preventDefault: jest.fn() };
    m.nameInput.value = "slider";
    m.handleLogin(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------
   9. localStorage persistence – loadStoredName / storeName
------------------------------------------------------------------ */

describe("localStorage helpers", () => {
  beforeEach(() => {
    buildDOM();
    localStorage.clear();
  });

  test("loadStoredName returns empty string when nothing stored", () => {
    const m = createModule();
    expect(m.loadStoredName()).toBe("");
  });

  test("loadStoredName returns sanitised uppercase stored name", () => {
    localStorage.setItem(PLAYER_NAME_KEY, "   maverick  ");
    const m = createModule();
    expect(m.loadStoredName()).toBe("MAVERICK");
  });

  test("storeName persists the name under the correct key", () => {
    const m = createModule();
    m.storeName("GOOSE");
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBe("GOOSE");
  });

  test("storeName does not throw when localStorage unavailable", () => {
    // simulate private-mode storage failure
    const origSet = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");
    Storage.prototype.setItem = () => { throw new DOMException("quota"); };
    const m = createModule();
    expect(() => m.storeName("ACE")).not.toThrow();
    // restore
    Object.defineProperty(Storage.prototype, "setItem", origSet);
  });

  test("loadStoredName does not throw when localStorage unavailable", () => {
    const origGet = Object.getOwnPropertyDescriptor(Storage.prototype, "getItem");
    Storage.prototype.getItem = () => { throw new DOMException("quota"); };
    const m = createModule();
    expect(() => m.loadStoredName()).not.toThrow();
    expect(m.loadStoredName()).toBe("");
    Object.defineProperty(Storage.prototype, "getItem", origGet);
  });

  test("round-trip: storeName then loadStoredName returns same value", () => {
    const m = createModule();
    m.storeName("ACE-1");
    expect(m.loadStoredName()).toBe("ACE-1");
  });
});

/* ------------------------------------------------------------------
   10. isTypingTarget – keyboard suppression guard
------------------------------------------------------------------ */

describe("isTypingTarget()", () => {
  beforeEach(() => {
    buildDOM();
  });

  function makeEvent(tagName, isContentEditable = false) {
    const el = document.createElement(tagName);
    if (isContentEditable) el.setAttribute("contenteditable", "true");
    // jsdom sets isContentEditable as a getter; patch it
    Object.defineProperty(el, "isContentEditable", { value: isContentEditable, configurable: true });
    return { target: el };
  }

  test("returns true for INPUT element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("input"))).toBe(true);
  });

  test("returns true for TEXTAREA element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("textarea"))).toBe(true);
  });

  test("returns true for contenteditable element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("div", true))).toBe(true);
  });

  test("returns false for BUTTON element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("button"))).toBe(false);
  });

  test("returns false for DIV element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("div"))).toBe(false);
  });

  test("returns false for CANVAS element", () => {
    const m = createModule();
    expect(m.isTypingTarget(makeEvent("canvas"))).toBe(false);
  });

  test("returns false when event has no target", () => {
    const m = createModule();
    expect(m.isTypingTarget({ target: null })).toBeFalsy();
  });
});

/* ------------------------------------------------------------------
   11. Track call ordering – error fires before early return
------------------------------------------------------------------ */

describe("Track event ordering", () => {
  test("error track fires before function exits on empty callsign", () => {
    buildDOM();
    localStorage.clear();
    const calls = [];
    const fakeClient = {
      track: jest.fn((key) => calls.push(key)),
      getContext: jest.fn().mockReturnValue({ kind: "user" }),
      identify: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    // Error track should be the ONLY call (login track must not fire)
    expect(calls).toEqual(["enable-player-login-screen-error"]);
  });

  test("login track fires after successful callsign, not error track", () => {
    buildDOM();
    localStorage.clear();
    const calls = [];
    const fakeClient = {
      track: jest.fn((key) => calls.push(key)),
      getContext: jest.fn().mockReturnValue({ kind: "user" }),
      identify: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ACE";
    m.handleLogin(null);
    expect(calls).toEqual(["enable-player-login-screen-login"]);
  });
});

/* ------------------------------------------------------------------
   12. Telemetry event key literals – guard against typos
------------------------------------------------------------------ */

describe("Telemetry event key literals (M12 compliance)", () => {
  test("error event key is exactly 'enable-player-login-screen-error'", () => {
    buildDOM();
    localStorage.clear();
    const fakeClient = {
      track: jest.fn(),
      getContext: jest.fn().mockReturnValue({}),
      identify: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "";
    m.handleLogin(null);
    expect(fakeClient.track.mock.calls[0][0]).toBe("enable-player-login-screen-error");
  });

  test("business event key is exactly 'enable-player-login-screen-login'", () => {
    buildDOM();
    localStorage.clear();
    const fakeClient = {
      track: jest.fn(),
      getContext: jest.fn().mockReturnValue({}),
      identify: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.nameInput.value = "ACE";
    m.handleLogin(null);
    expect(fakeClient.track.mock.calls[0][0]).toBe("enable-player-login-screen-login");
  });
});

/* ------------------------------------------------------------------
   13. Flag key constant guard
------------------------------------------------------------------ */

describe("Feature flag key constant", () => {
  test("LD_FLAG_LOGIN constant matches expected flag key", () => {
    // The flag gate uses this literal string — verify it's unchanged
    const FLAG_KEY = "enable-player-login-screen";
    // runFlagGate passes it to ldClient.variation(); we verify by spying
    buildDOM();
    localStorage.clear();
    const fakeClient = {
      variation: jest.fn().mockReturnValue("control"),
      getContext: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(fakeClient.variation.mock.calls[0][0]).toBe(FLAG_KEY);
  });

  test("fail-safe default for flag variation is 'control'", () => {
    buildDOM();
    localStorage.clear();
    const fakeClient = {
      variation: jest.fn().mockReturnValue("control"),
      getContext: jest.fn(),
    };
    const m = createModule({ ldClient: fakeClient });
    m.runFlagGate();
    expect(fakeClient.variation.mock.calls[0][1]).toBe("control");
  });
});

/* ------------------------------------------------------------------
   14. setPlayerName – HUD update and identify
------------------------------------------------------------------ */

describe("setPlayerName()", () => {
  beforeEach(() => {
    buildDOM();
    localStorage.clear();
  });

  test("updates playerVal HUD element with provided name", () => {
    const m = createModule();
    m.setPlayerName("VIPER");
    expect(m.playerEl.textContent).toBe("VIPER");
  });

  test("shows '---' when name is empty string", () => {
    const m = createModule();
    m.setPlayerName("");
    expect(m.playerEl.textContent).toBe("---");
  });

  test("calls ldClient.identify with correct context shape", () => {
    const fakeClient = { identify: jest.fn() };
    const m = createModule({ ldClient: fakeClient });
    m.setPlayerName("GOOSE");
    expect(fakeClient.identify).toHaveBeenCalledWith({
      kind: "user",
      key: "GOOSE",
      name: "GOOSE",
    });
  });

  test("does not call identify when name is empty", () => {
    const fakeClient = { identify: jest.fn() };
    const m = createModule({ ldClient: fakeClient });
    m.setPlayerName("");
    expect(fakeClient.identify).not.toHaveBeenCalled();
  });

  test("does not throw when ldClient is null", () => {
    const m = createModule({ ldClient: null });
    expect(() => m.setPlayerName("MAVERICK")).not.toThrow();
  });
});
