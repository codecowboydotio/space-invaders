'use strict';
/*
 * Flag-path tests for PR #37 — multivariate string flag "enable-player-login".
 *   "control" → original flow: straight to the START overlay (no login).
 *   "v1"      → ENTER CALLSIGN login screen before the START overlay.
 * Anything else (SDK missing / init failure / throw / unexpected value) must
 * fail safe to "control".
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FLAG_KEY, loadPage, makeFakeLD, flush } = require('./helpers/ld-page-harness');

const PLAYER_NAME_KEY = 'galactic-defender-player';
const EV_ERROR = 'enable-player-login-error';
const EV_GAME_STARTED = 'enable-player-login-game-started';
const EV_TIME_TO_START = 'enable-player-login-time-to-start';
const EV_LOGIN_COMPLETED = 'enable-player-login-login-completed';

function assertControlUi(page) {
  assert.equal(page.el('overlay').style.display, 'flex', 'START overlay visible');
  assert.equal(page.el('overlayTitle').textContent, 'GALACTIC DEFENDER');
  assert.match(page.el('overlayText').innerHTML, /Defend the last frontier\./);
  assert.equal(page.el('startBtn').textContent, '▶ START GAME');
  assert.equal(page.el('loginOverlay').style.display, 'none', 'login screen hidden');
  assert.equal(page.el('playerHud').style.display, 'none', 'player HUD hidden');
}

/* ------------------------------------------------------------------ */
/* control variation                                                   */
/* ------------------------------------------------------------------ */
describe(`${FLAG_KEY} = "control" (flag off)`, () => {
  it('evaluates the flag once with "control" as the code default', async () => {
    const ld = makeFakeLD({ loginVariation: 'control' });
    const page = await loadPage({ ld });
    page.el('startBtn').dispatch('click');
    assert.deepEqual(ld.loginEvaluations(), [['variation', FLAG_KEY, 'control']]);
  });

  it('shows the original START overlay; login screen and player HUD stay hidden', async () => {
    const ld = makeFakeLD({ loginVariation: 'control' });
    const page = await loadPage({ ld });
    assertControlUi(page);
    assert.deepEqual(ld.identifies(), []);
  });

  it('ignores a saved callsign: no identify(), HUD stays hidden, input not prefilled', async () => {
    const ld = makeFakeLD({ loginVariation: 'control' });
    const page = await loadPage({ ld, storage: { [PLAYER_NAME_KEY]: 'MAV' } });
    assertControlUi(page);
    assert.deepEqual(ld.identifies(), []);
    assert.equal(page.el('nameInput').value, '');
  });

  it('login form submission is a no-op (no tracking, identify, storage or overlay change)', async () => {
    const ld = makeFakeLD({ loginVariation: 'control' });
    const page = await loadPage({ ld });
    page.el('nameInput').value = 'ACE';
    const ev = page.el('loginForm').dispatch('submit');
    assert.equal(ev.defaultPrevented, true, 'native form submit is still prevented');
    assert.ok(!ld.trackedKeys().includes(EV_LOGIN_COMPLETED));
    assert.deepEqual(ld.identifies(), []);
    assert.equal(page.store.has(PLAYER_NAME_KEY), false);
    assert.equal(page.el('loginError').textContent, '');
    assertControlUi(page);
  });

  it('first START tracks game-started + time-to-start (ms) exactly once', async () => {
    const ld = makeFakeLD({ loginVariation: 'control' });
    const page = await loadPage({ ld, now: 1000 });
    page.clock.t = 3500;
    page.el('startBtn').dispatch('click');
    assert.equal(page.el('overlay').style.display, 'none', 'game is running');
    assert.deepEqual(ld.tracks(), [
      [EV_GAME_STARTED],
      [EV_TIME_TO_START, undefined, 2500],
    ]);
    // Restart via hotkey mid-game must not re-emit the first-start metrics.
    page.window.dispatch('keydown', { code: 'KeyR' });
    assert.deepEqual(ld.trackedKeys(), [EV_GAME_STARTED, EV_TIME_TO_START]);
  });
});

/* ------------------------------------------------------------------ */
/* v1 variation                                                        */
/* ------------------------------------------------------------------ */
describe(`${FLAG_KEY} = "v1" (flag on)`, () => {
  it('shows the ENTER CALLSIGN screen instead of the START overlay', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld });
    assert.equal(page.el('loginOverlay').style.display, 'flex');
    assert.equal(page.el('overlay').style.display, 'none');
    assert.equal(page.el('playerHud').style.display, '', 'player HUD revealed');
    assert.equal(page.doc.activeElement, page.el('nameInput'), 'callsign input focused');
    assert.deepEqual(ld.identifies(), [], 'no identify without a callsign');
    assert.deepEqual(ld.tracks(), [], 'nothing tracked before the player acts');
  });

  it('rejects an empty / fully-invalid callsign and stays on the login screen', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld });
    for (const raw of ['', '   ', '<>!!@#']) {
      page.el('nameInput').value = raw;
      const ev = page.el('loginForm').dispatch('submit');
      assert.equal(ev.defaultPrevented, true);
      assert.equal(page.el('loginError').textContent, 'CALLSIGN REQUIRED');
      assert.equal(page.el('loginOverlay').style.display, 'flex');
      assert.equal(page.el('overlay').style.display, 'none');
    }
    assert.deepEqual(ld.tracks(), []);
    assert.deepEqual(ld.identifies(), []);
    assert.equal(page.store.has(PLAYER_NAME_KEY), false);
  });

  it('valid callsign: sanitised, shown in HUD, persisted, identified, then START overlay', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld });
    page.el('nameInput').value = '  ma<v>rk! ';
    page.el('loginForm').dispatch('submit');
    assert.equal(page.el('loginError').textContent, '');
    assert.equal(page.el('playerVal').textContent, 'MAVRK');
    assert.equal(page.store.get(PLAYER_NAME_KEY), 'MAVRK');
    assert.deepEqual(ld.identifies(), [{ kind: 'user', key: 'MAVRK', name: 'MAVRK' }]);
    assert.equal(page.el('loginOverlay').style.display, 'none');
    assert.equal(page.el('overlay').style.display, 'flex');
    assert.equal(page.el('overlayTitle').textContent, 'GALACTIC DEFENDER');
    assert.match(page.el('overlayText').innerHTML, /^Welcome, MAVRK\./);
  });

  it('tracks login-completed BEFORE identify() switches the context', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld });
    page.el('nameInput').value = 'ACE';
    page.el('loginForm').dispatch('submit');
    const trackIdx = ld.indexOf((c) => c[0] === 'track' && c[1] === EV_LOGIN_COMPLETED);
    const identifyIdx = ld.indexOf((c) => c[0] === 'identify');
    assert.ok(trackIdx >= 0, 'login-completed tracked');
    assert.ok(identifyIdx > trackIdx, 'identify happens after login-completed');
    assert.deepEqual(ld.tracks().find((t) => t[0] === EV_LOGIN_COMPLETED), [EV_LOGIN_COMPLETED]);
  });

  it('login → START emits login-completed, game-started, time-to-start once each', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld, now: 2000 });
    page.clock.t = 6000;
    page.el('nameInput').value = 'ACE';
    page.el('loginForm').dispatch('submit');
    page.clock.t = 7250;
    page.el('startBtn').dispatch('click');
    assert.equal(page.el('overlay').style.display, 'none');
    assert.equal(page.el('loginOverlay').style.display, 'none');
    assert.deepEqual(ld.tracks(), [
      [EV_LOGIN_COMPLETED],
      [EV_GAME_STARTED],
      [EV_TIME_TO_START, undefined, 5250], // measured from when the login screen appeared
    ]);
    page.window.dispatch('keydown', { code: 'KeyR' });
    assert.equal(ld.trackedKeys().filter((k) => k === EV_GAME_STARTED).length, 1);
  });

  it('gate is evaluated exactly once, before any identify(), and cannot flip after identify', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld, storage: { [PLAYER_NAME_KEY]: 'goose' } });
    page.el('nameInput').value = 'ICEMAN';
    page.el('loginForm').dispatch('submit');
    page.el('startBtn').dispatch('click');
    assert.deepEqual(ld.loginEvaluations(), [['variation', FLAG_KEY, 'control']]);
    const evalIdx = ld.indexOf((c) => c[0] === 'variation' && c[1] === FLAG_KEY);
    const firstIdentify = ld.indexOf((c) => c[0] === 'identify');
    assert.ok(evalIdx >= 0 && firstIdentify > evalIdx);
  });

  it('saved callsign: prefilled, shown in HUD, identified at init — login screen still shown', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld, storage: { [PLAYER_NAME_KEY]: 'goose<>' } });
    assert.equal(page.el('nameInput').value, 'GOOSE');
    assert.equal(page.el('playerVal').textContent, 'GOOSE');
    assert.deepEqual(ld.identifies(), [{ kind: 'user', key: 'GOOSE', name: 'GOOSE' }]);
    assert.equal(page.el('loginOverlay').style.display, 'flex');
    assert.equal(page.el('overlay').style.display, 'none');
    assert.ok(!ld.trackedKeys().includes(EV_LOGIN_COMPLETED), 'login-completed only on submit');
  });

  it('typing in the callsign field does not trigger game hotkeys; R outside it never leaves login stuck', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld });
    const input = page.el('nameInput');
    page.window.dispatch('keydown', { code: 'KeyR', target: input });
    page.window.dispatch('keydown', { code: 'KeyP', target: input });
    assert.equal(page.el('loginOverlay').style.display, 'flex', 'still on login screen');
    assert.deepEqual(ld.tracks(), []);

    page.window.dispatch('keydown', { code: 'KeyR' });
    assert.equal(page.el('loginOverlay').style.display, 'none', 'login overlay cleared on start');
    assert.equal(page.el('overlay').style.display, 'none');
    assert.deepEqual(ld.trackedKeys(), [EV_GAME_STARTED, EV_TIME_TO_START]);
  });

  for (const mode of ['reject', 'throw']) {
    it(`identify() ${mode === 'reject' ? 'rejecting' : 'throwing'} tracks ${EV_ERROR} and login still completes`, async () => {
      const ld = makeFakeLD({ loginVariation: 'v1', identify: mode });
      const page = await loadPage({ ld });
      page.el('nameInput').value = 'ACE';
      page.el('loginForm').dispatch('submit');
      await flush();
      assert.ok(ld.trackedKeys().includes(EV_ERROR));
      assert.equal(page.el('playerVal').textContent, 'ACE');
      assert.equal(page.el('loginOverlay').style.display, 'none');
      assert.equal(page.el('overlay').style.display, 'flex');
    });
  }

  it('track() throwing never breaks login or game start', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1', trackThrows: true });
    const page = await loadPage({ ld });
    page.el('nameInput').value = 'ACE';
    assert.doesNotThrow(() => page.el('loginForm').dispatch('submit'));
    assert.equal(page.el('overlay').style.display, 'flex');
    assert.doesNotThrow(() => page.el('startBtn').dispatch('click'));
    assert.equal(page.el('overlay').style.display, 'none', 'game is running');
    assert.deepEqual(ld.trackedKeys(), [EV_LOGIN_COMPLETED, EV_GAME_STARTED, EV_TIME_TO_START]);
  });

  it('localStorage unavailable (private mode) does not block the v1 login flow', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1' });
    const page = await loadPage({ ld, storageThrows: true });
    assert.equal(page.el('loginOverlay').style.display, 'flex');
    page.el('nameInput').value = 'ACE';
    page.el('loginForm').dispatch('submit');
    assert.equal(page.el('playerVal').textContent, 'ACE');
    assert.equal(page.el('overlay').style.display, 'flex');
  });
});

/* ------------------------------------------------------------------ */
/* fail-safe to control                                                */
/* ------------------------------------------------------------------ */
describe(`${FLAG_KEY} fails safe to "control"`, () => {
  const cases = [
    ['LaunchDarkly SDK not loaded (LDClient undefined)', () => null],
    ['waitForInitialization rejects', () => makeFakeLD({ loginVariation: 'v1', initFails: true })],
    ['variation() throws', () => makeFakeLD({ variationThrows: true })],
    ['flag unset (SDK returns the default)', () => makeFakeLD({})],
    ['variation returns null', () => makeFakeLD({ loginVariation: null })],
    ['variation returns empty string', () => makeFakeLD({ loginVariation: '' })],
    ['variation returns a boolean true', () => makeFakeLD({ loginVariation: true })],
    ['variation returns a number', () => makeFakeLD({ loginVariation: 42 })],
    ['variation returns an unknown string ("v2")', () => makeFakeLD({ loginVariation: 'v2' })],
  ];

  for (const [name, mk] of cases) {
    it(`${name} → original START flow, START still works`, async () => {
      const ld = mk();
      const page = await loadPage({ ld });
      assertControlUi(page);
      page.el('nameInput').value = 'ACE';
      page.el('loginForm').dispatch('submit');
      assertControlUi(page);
      if (ld) {
        assert.deepEqual(ld.identifies(), []);
        assert.ok(!ld.trackedKeys().includes(EV_LOGIN_COMPLETED));
      }
      assert.doesNotThrow(() => page.el('startBtn').dispatch('click'));
      assert.equal(page.el('overlay').style.display, 'none', 'game is running');
    });
  }

  it('init failure nulls the client: no metric events are sent at all', async () => {
    const ld = makeFakeLD({ loginVariation: 'v1', initFails: true });
    const page = await loadPage({ ld });
    page.el('startBtn').dispatch('click');
    page.window.dispatch('error');
    assert.deepEqual(ld.tracks(), []);
    assert.deepEqual(ld.loginEvaluations(), []);
  });
});

/* ------------------------------------------------------------------ */
/* page-level error signal (both arms)                                 */
/* ------------------------------------------------------------------ */
describe(`${FLAG_KEY} error signal (both variations)`, () => {
  for (const variation of ['control', 'v1']) {
    it(`"${variation}": window error + unhandledrejection track ${EV_ERROR}`, async () => {
      const ld = makeFakeLD({ loginVariation: variation });
      const page = await loadPage({ ld });
      page.window.dispatch('error');
      page.window.dispatch('unhandledrejection');
      assert.deepEqual(ld.tracks(), [[EV_ERROR], [EV_ERROR]]);
    });

    it(`"${variation}": error tracking is observe-only and swallows track() failures`, async () => {
      const ld = makeFakeLD({ loginVariation: variation, trackThrows: true });
      const page = await loadPage({ ld });
      let ev;
      assert.doesNotThrow(() => { ev = page.window.dispatch('error'); });
      assert.equal(ev.defaultPrevented, false);
    });
  }

  it('no SDK: page errors do not throw', async () => {
    const page = await loadPage({ ld: null });
    assert.doesNotThrow(() => page.window.dispatch('error'));
    assert.doesNotThrow(() => page.window.dispatch('unhandledrejection'));
  });
});
