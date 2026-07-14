/**
 * core/clock.js — THE clock. Every millisecond on this site flows through here.
 * (OPERATION NIGHTSHIFT)
 *
 * WHAT: One shared virtual clock: now(), subscribe() tick loop, viewer-local
 *       hour helpers, and deterministic advancement via forceTick().
 * WHY:  THE CLOCK LAW (architecture §7.2): the verification browser may
 *       never tick requestAnimationFrame, so every time-based system —
 *       hero tapeTime, ghost tape scheduler, presence ticks, anti-spam
 *       windows, fx timelines, reconnect backoffs — must be a pure function
 *       of clock deltas. Then __NIGHT_DEBUG__.forceTick(ms) can advance the
 *       whole universe synchronously and deterministically.
 * HOW:  Real mode: a rAF loop drives ticks when rAF is alive, and a 250ms
 *       setTimeout watchdog keeps ticking when rAF is dead — both funnel
 *       into one step() keyed off the last wall timestamp, so there is no
 *       double counting. Deterministic mode (entered by forceTick/setClock):
 *       wall time is ignored; time advances ONLY via forceTick, chunked
 *       into ≤250ms sub-steps so sub-second logic behaves identically.
 * GOTCHA: NO file outside this one may call Date.now(), performance.now(),
 *       setTimeout, setInterval, or requestAnimationFrame for game/anim/
 *       scheduling time (P4 greps for it). CSS animations are exempt.
 *       Deltas clamp at 1000ms (tab-sleep protection). READ-ONLY file.
 */

import { bus } from './bus.js';

/** ms of virtual time that have elapsed since boot. */
let virtualNow = 0;
/** Wall timestamp of the last real-mode step (Date.now() domain). */
let lastWall = Date.now();
/** Wall-clock ms-of-day at boot (for hour helpers), before any override. */
const bootWallMsOfDay = (() => {
  const d = new Date();
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
})();
/** true once forceTick()/setClock() has been called — wall time ignored. */
let deterministic = false;
/** setClock override: ms-of-day at the moment of override, or null. */
let hourOverrideMsOfDay = null;
/** virtualNow at the moment the hour override (or boot) was anchored. */
let hourAnchorVirtual = 0;

/** @type {Set<(deltaMs: number, nowMs: number) => void>} */
const subs = new Set();

let lastMinuteIndex = -1;
let started = false;
let rafSeenAt = -1; // virtualNow when rAF last fired (watchdog suppression)

const MAX_DELTA_MS = 1000;   // clamp: tab sleep / debugger pauses
const WATCHDOG_MS = 250;     // setTimeout fallback cadence (rAF-dead browsers)
const FORCE_CHUNK_MS = 250;  // forceTick sub-step size

/* ------------------------------------------------------------------ */
/* internal engine                                                     */
/* ------------------------------------------------------------------ */

/** Advance virtual time by deltaMs and notify subscribers + minute events. */
function step(deltaMs) {
  if (deltaMs <= 0) return;
  virtualNow += deltaMs;
  for (const fn of [...subs]) {
    try { fn(deltaMs, virtualNow); }
    catch (err) { console.error('[clock] subscriber threw:', err); }
  }
  // Minute-crossing detection → canonical `clock:minute` bus event.
  const minuteIndex = Math.floor(msOfDay() / 60000);
  if (minuteIndex !== lastMinuteIndex) {
    lastMinuteIndex = minuteIndex;
    bus.emit('clock:minute', {
      hhmm: hhmm(),
      isAfterhours: isAfterhours(),
      isWitchingHour: isWitchingHour(),
      nightKey: nightKey(),
    });
  }
}

/** Real-mode tick from either pump; computes delta from the wall. */
function realTick() {
  if (deterministic) return;
  const wall = Date.now();
  const delta = Math.min(wall - lastWall, MAX_DELTA_MS);
  lastWall = wall;
  step(delta);
}

function rafPump() {
  requestAnimationFrame(() => {
    rafSeenAt = virtualNow;
    realTick();
    if (started) rafPump();
  });
}

function watchdogPump() {
  setTimeout(() => {
    // If rAF ticked recently, let it drive; otherwise we drive (rAF-dead).
    if (virtualNow - rafSeenAt > WATCHDOG_MS * 2 || rafSeenAt < 0) realTick();
    else lastWall = Date.now(); // keep wall anchor fresh so rAF deltas stay sane
    if (started) watchdogPump();
  }, WATCHDOG_MS);
}

/** Viewer-local midnight of the boot day, wall domain. Computed once. */
const bootMidnightMs = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();

/**
 * Absolute viewer-local virtual wall time in ms: boot midnight + the
 * anchored ms-of-day (boot wall time or setClock override) + virtual time
 * elapsed since that anchor. Single source for msOfDay() AND nightKey(),
 * so day boundaries carry correctly across long forceTick runs.
 */
function absVirtualWallMs() {
  const base = hourOverrideMsOfDay !== null ? hourOverrideMsOfDay : bootWallMsOfDay;
  return bootMidnightMs + base + (virtualNow - hourAnchorVirtual);
}

/** Current viewer-local ms-of-day, honoring setClock override. [0, 86400000) */
function msOfDay() {
  return ((absVirtualWallMs() - bootMidnightMs) % 86400000 + 86400000) % 86400000;
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Virtual now in ms (monotonic from boot). THE only timestamp source. */
function now() { return virtualNow; }

/** Viewer-local hour as a float, e.g. 01:30 → 1.5. Honors setClock. */
function hourFloat() { return msOfDay() / 3600000; }

/** 'HHMM' viewer-local, zero-padded. */
function hhmm() {
  const m = Math.floor(msOfDay() / 60000);
  const h = Math.floor(m / 60), mm = m % 60;
  return String(h).padStart(2, '0') + String(mm).padStart(2, '0');
}

/** AFTERHOURS window: 00:00 ≤ t < 06:00 viewer-local. */
function isAfterhours() { const h = hourFloat(); return h >= 0 && h < 6; }

/** WITCHING HOUR window: 00:00 ≤ t < 03:00 viewer-local. */
function isWitchingHour() { const h = hourFloat(); return h >= 0 && h < 3; }

/**
 * Night key: the calendar date shifted −6h, so 00:30 belongs to the
 * previous evening. Used for streaks and FIRST BLOOD (architecture §5.1).
 * Deterministic under setClock: derives from the same virtual ms-of-day.
 * @returns {string} 'YYYY-MM-DD'
 */
function nightKey() {
  const d = new Date(absVirtualWallMs() - 6 * 3600000); // shift −6h, then take the date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Subscribe to ticks. fn(deltaMs, nowMs) fires every pump step and every
 * forceTick sub-step. Cheap handlers only — this is the frame loop.
 * @param {(deltaMs: number, nowMs: number) => void} fn
 * @returns {() => void} unsubscribe
 */
function subscribe(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/**
 * DEBUG: advance all time deterministically. Synchronous — when this
 * returns, every subscriber has seen the full duration in ≤250ms chunks
 * and all minute events have fired. Enters deterministic mode (wall time
 * stops mattering) until resumeClock().
 * @param {number} ms
 */
function forceTick(ms) {
  deterministic = true;
  let remaining = Math.max(0, ms | 0);
  while (remaining > 0) {
    const chunk = Math.min(remaining, FORCE_CHUNK_MS);
    step(chunk);
    remaining -= chunk;
  }
}

/**
 * DEBUG: force viewer-local time-of-day ('HHMM' string) or null to clear.
 * Enters deterministic mode so the hour holds still under assertion.
 * @param {string|null} v
 */
function setClock(v) {
  if (v === null) {
    hourOverrideMsOfDay = null;
    hourAnchorVirtual = 0; // hour helpers re-anchor to boot wall time
    return;
  }
  deterministic = true;
  const h = parseInt(v.slice(0, 2), 10), m = parseInt(v.slice(2, 4), 10);
  hourOverrideMsOfDay = (h * 60 + m) * 60000;
  hourAnchorVirtual = virtualNow;
  lastMinuteIndex = -1;        // force a clock:minute on next step
  step(1);                     // publish the new hour immediately (1ms nudge)
}

/** DEBUG: leave deterministic mode; wall time resumes driving ticks. */
function resumeClock() {
  deterministic = false;
  lastWall = Date.now();
}

/** Boot the pumps. Called once by main.js. Idempotent. */
function start() {
  if (started) return;
  started = true;
  lastWall = Date.now();
  rafPump();
  watchdogPump();
}

/** Introspection for __NIGHT_DEBUG__.getClock(). */
function debugInfo() {
  return { now: virtualNow, hhmm: hhmm(), isAfterhours: isAfterhours(), isWitchingHour: isWitchingHour(), nightKey: nightKey(), deterministic };
}

export const clock = Object.freeze({
  now, hourFloat, hhmm, isAfterhours, isWitchingHour, nightKey,
  subscribe, forceTick, setClock, resumeClock, start, debugInfo,
});
