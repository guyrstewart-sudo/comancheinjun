/**
 * debug.js — window.__NIGHT_DEBUG__ assembly. (B1 / OPERATION NIGHTSHIFT)
 *
 * WHAT: the deterministic-testing surface (architecture §7.1). Every other
 *       module registers its own slice via `registerDebug(slice)`; this
 *       file owns forceTick/setState/setClock/seedChat/getState/getClock/
 *       resumeClock/getEvents/snapshot and freezes the assembled object.
 * WHY:  the verification browser never ticks rAF (recon §2) — every
 *       assertion has to be a synchronous DOM/state read after a
 *       deterministic `forceTick`, not a screenshot or a wall-clock wait.
 * HOW:  `import { registerDebug } from '../debug.js'` (or `./debug.js` from
 *       site/js/*.js directly) is SANCTIONED FOR EVERY BUILDER — B2
 *       registers `{seek, listPins}`, B4 registers `{getTab, getRank}`,
 *       etc. Call it any time before boot finishes; `freeze()` (called by
 *       main.js after `clock.start()`) locks the object and rejects any
 *       later registration with a console warning.
 * GOTCHA: `getEvents`/`snapshot` degrade gracefully if a slice hasn't
 *       registered yet (a builder's module not present in this isolated
 *       build) — they read whatever's on the assembled object, never throw.
 */

import { bus } from './core/bus.js';
import { clock } from './core/clock.js';
import { hashString } from './core/rng.js';
import * as state from './state.js';

const RING_SIZE = 300;
/** @type {Array<{type:string,payload:any}>} */
const ring = [];
bus.on('*', (payload, type) => {
  ring.push({ type, payload });
  if (ring.length > RING_SIZE) ring.shift();
});

/** @type {Record<string, Function>} */
const api = {};
let frozen = false;

/**
 * Register a slice of the debug API. Sanctioned for every builder.
 * @param {Record<string, Function>} slice
 */
export function registerDebug(slice) {
  if (frozen) {
    console.warn('[debug] registerDebug called after freeze, ignored:', Object.keys(slice));
    return;
  }
  Object.assign(api, slice);
}

/** @param {number} n @returns {Array<{type:string,payload:any}>} */
function getEvents(n = 50) {
  return ring.slice(Math.max(0, ring.length - n));
}

/**
 * seedChat: inject chat as if it arrived over the wire (source 'debug').
 * Fires zero-delay entries synchronously; delayed entries ride the clock
 * (never setTimeout — clock law) so forceTick() drives them deterministically.
 * @param {Array<{user:string,text:string,emotes?:Array,delayMs?:number}>|string} script
 */
function seedChat(script) {
  const entries = typeof script === 'string' ? [{ user: 'debug', text: script }] : script;
  let cursor = clock.now();
  const queue = entries.map((e) => {
    cursor += e.delayMs || 0;
    return { ...e, fireAt: cursor };
  });
  const fireDue = () => {
    while (queue.length && clock.now() >= queue[0].fireAt) emit(queue.shift());
  };
  const emit = (e) => {
    const login = String(e.user || 'debug').toLowerCase();
    bus.emit('chat:message', {
      id: `debug-${hashString(login + '|' + e.text + '|' + clock.now())}`,
      user: { login, displayName: e.user || 'debug', color: null, badges: '' },
      text: e.text,
      emotes: e.emotes || [],
      ts: clock.now(),
      source: 'debug',
      isGhost: false,
    });
  };
  fireDue();
  if (queue.length) {
    const off = clock.subscribe(() => {
      fireDue();
      if (!queue.length) off();
    });
  }
}

registerDebug({
  forceTick: (ms) => clock.forceTick(ms),
  setState: (v) => state.setOverride(v),
  setClock: (v) => clock.setClock(v),
  seedChat,
  getState: () => state.getSnapshot(),
  getClock: () => clock.debugInfo(),
  resumeClock: () => clock.resumeClock(),
  getEvents,
  snapshot: () => ({
    state: state.getSnapshot(),
    clock: clock.debugInfo(),
    tab: api.getTab ? api.getTab() : undefined,
    rank: api.getRank ? api.getRank() : undefined,
    pins: api.listPins ? api.listPins() : undefined,
    chatEvents: getEvents(500).filter((e) => e.type === 'chat:message').length,
  }),
});

/** Freeze the assembled API onto `window.__NIGHT_DEBUG__`. Called once by main.js. */
export function freeze() {
  if (frozen) return;
  frozen = true;
  window.__NIGHT_DEBUG__ = Object.freeze({ ...api });
}
