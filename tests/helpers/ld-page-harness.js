'use strict';
/*
 * Minimal, dependency-free harness for exercising the inline game script in
 * invaders.html under Node's built-in test runner.
 *
 * - Extracts the inline <script> (the one without a src attribute).
 * - Runs it in a `vm` context with a tiny fake DOM built from the element ids
 *   declared in the page markup (initial inline `display:none` is honoured).
 * - Stubs the LaunchDarkly JS client SDK global (`LDClient`) so tests control
 *   what `variation("enable-player-login", ...)` returns and can inspect every
 *   `track` / `identify` call in order.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', '..', 'invaders.html');
const FLAG_KEY = 'enable-player-login';

function readPage() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

function extractGameScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error('inline game <script> not found in invaders.html');
  return scripts[scripts.length - 1];
}

function parseElements(html) {
  const body = html.slice(html.indexOf('<body'));
  const out = [];
  for (const m of body.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const idm = m[2].match(/\bid="([^"]+)"/);
    if (!idm) continue;
    const stylem = m[2].match(/\bstyle="([^"]*)"/);
    const hidden = !!stylem && /display\s*:\s*none/.test(stylem[1]);
    out.push({ id: idm[1], tagName: m[1].toUpperCase(), display: hidden ? 'none' : '' });
  }
  return out;
}

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
  };
}

function makeCanvasContext() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, p) => (p in t ? t[p] : noop),
    set: (t, p, v) => { t[p] = v; return true; },
  });
}

function fire(listeners, type, defaultTarget, init) {
  const ev = { type, target: defaultTarget, defaultPrevented: false, ...init };
  ev.preventDefault = () => { ev.defaultPrevented = true; };
  for (const fn of (listeners[type] || []).slice()) fn(ev);
  return ev;
}

function makeElement(doc, spec) {
  const listeners = {};
  const el = {
    id: spec.id,
    tagName: spec.tagName,
    style: { display: spec.display },
    textContent: '',
    innerHTML: '',
    value: '',
    isContentEditable: false,
    width: 640,
    height: 480,
    classList: makeClassList(),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    focus() { doc.activeElement = el; },
    blur() { if (doc.activeElement === el) doc.activeElement = null; },
    getContext() { return makeCanvasContext(); },
    dispatch(type, init = {}) { return fire(listeners, type, el, init); },
  };
  return el;
}

/**
 * Fake LaunchDarkly JS client SDK.
 * @param {object} opts
 * @param {*} [opts.loginVariation] value returned for "enable-player-login"
 *        (undefined → the caller's default, like the real SDK when unset)
 * @param {boolean} [opts.variationThrows]
 * @param {boolean} [opts.initFails] waitForInitialization rejects
 * @param {boolean} [opts.trackThrows]
 * @param {'resolve'|'reject'|'throw'} [opts.identify]
 */
const GENERATED_ANON_KEY = 'generated-anon-key-1234';

function makeFakeLD(opts = {}) {
  const {
    loginVariation, variationThrows = false, initFails = false, trackThrows = false,
    identify = 'resolve', noGetContext = false,
  } = opts;
  const calls = [];
  let currentContext = null;
  const client = {
    getContext: noGetContext ? undefined : () => (currentContext ? { ...currentContext } : currentContext),
    async waitForInitialization() {
      calls.push(['waitForInitialization']);
      if (initFails) throw new Error('LD init timeout');
    },
    variation(key, def) {
      calls.push(['variation', key, def]);
      if (key === FLAG_KEY) {
        if (variationThrows) throw new Error('variation blew up');
        return loginVariation === undefined ? def : loginVariation;
      }
      return def;
    },
    track(...args) {
      calls.push(['track', ...args]);
      if (trackThrows) throw new Error('track failed');
    },
    identify(ctx) {
      calls.push(['identify', JSON.parse(JSON.stringify(ctx))]);
      if (identify === 'reject') return Promise.reject(new Error('identify failed'));
      if (identify === 'throw') throw new Error('identify threw');
      currentContext = { ...ctx };
      return Promise.resolve();
    },
    on() {},
  };
  const sdk = {
    initialize(id, ctx) {
      calls.push(['initialize', id, JSON.parse(JSON.stringify(ctx))]);
      // Like JS SDK v3: an anonymous context without a key gets a generated,
      // cached per-visitor key.
      currentContext = { ...ctx };
      if (ctx && ctx.anonymous && !ctx.key) currentContext.key = GENERATED_ANON_KEY;
      return client;
    },
  };
  return {
    sdk,
    calls,
    tracks: () => calls.filter((c) => c[0] === 'track').map((c) => c.slice(1)),
    trackedKeys: () => calls.filter((c) => c[0] === 'track').map((c) => c[1]),
    identifies: () => calls.filter((c) => c[0] === 'identify').map((c) => c[1]),
    loginEvaluations: () => calls.filter((c) => c[0] === 'variation' && c[1] === FLAG_KEY),
    indexOf: (pred) => calls.findIndex(pred),
  };
}

async function flush() {
  await new Promise((r) => setImmediate(r));
}

/**
 * Boot invaders.html's game script and wait for init() to finish.
 * @param {object} [o]
 * @param {ReturnType<typeof makeFakeLD>|null} [o.ld] fake SDK; null → LDClient undefined
 * @param {Record<string,string>} [o.storage] initial localStorage contents
 * @param {boolean} [o.storageThrows]
 * @param {number} [o.now] initial performance.now() value
 */
async function loadPage({ ld = null, storage = {}, storageThrows = false, now = 1000 } = {}) {
  const html = readPage();
  const doc = { activeElement: null, body: { classList: makeClassList() } };
  const els = new Map();
  for (const spec of parseElements(html)) els.set(spec.id, makeElement(doc, spec));
  doc.getElementById = (id) => els.get(id) || null;

  const winListeners = {};
  const clock = { t: now };
  const store = new Map(Object.entries(storage));
  const localStorage = {
    getItem(k) { if (storageThrows) throw new Error('storage disabled'); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { if (storageThrows) throw new Error('storage disabled'); store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
  let rafCount = 0;
  const logs = [];
  const quiet = (...a) => logs.push(a);

  const sandbox = {
    document: doc,
    localStorage,
    navigator: { maxTouchPoints: 0 },
    performance: { now: () => clock.t },
    console: { log: quiet, warn: quiet, error: quiet, info: quiet, debug: quiet },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    removeEventListener() {},
    requestAnimationFrame() { rafCount++; return rafCount; }, // never runs the loop
    fetch: () => Promise.reject(new Error('fetch disabled in tests')),
    Blob: class {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Image: class {},
  };
  sandbox.window = sandbox;
  if (ld) sandbox.LDClient = ld.sdk;

  vm.createContext(sandbox);
  vm.runInContext(extractGameScript(html), sandbox, { filename: 'invaders.html#inline-script' });

  // init() is async; it calls requestAnimationFrame(loop) as its last step.
  for (let i = 0; i < 200 && rafCount === 0; i++) await flush();
  if (rafCount === 0) throw new Error('init() did not complete');

  return {
    el: (id) => els.get(id),
    doc,
    clock,
    store,
    logs,
    flush,
    window: { dispatch: (type, init = {}) => fire(winListeners, type, sandbox, init) },
  };
}

module.exports = { FLAG_KEY, GENERATED_ANON_KEY, loadPage, makeFakeLD, flush };
