/**
 * state.js — the surface state machine. (B1 / OPERATION NIGHTSHIFT)
 * WHAT: derives `SurfaceState` ('LIVE'|'OFFLINE'|'AFTERHOURS') from three
 *       inputs (broadcast, afterhoursClock, override), stamps
 *       `<html data-state data-afterhours>`, emits `state:change`.
 * WHY:  architecture §2 — one pure, no-hysteresis derivation every zone
 *       and every CSS rule trusts, recomputed on any input change.
 * HOW:  init() wires `clock:minute` + `live:online`/`live:offline`, derives
 *       once at boot (source:'boot', prev:null), then on every real change.
 *       setOverride() is debug.js's only way to force a state.
 * GOTCHA: precedence is override > broadcast-live > clock (§2.3).
 *       AFTERHOURS composes over LIVE via `afterhoursActive` — never
 *       demotes a genuine broadcast off the LIVE label (honesty law).
 */

import { bus } from './core/bus.js';
import { clock } from './core/clock.js';

/** @type {'LIVE'|'OFFLINE'} */
let broadcast = 'OFFLINE';
/** @type {import('./core/contracts.js').SurfaceState|null} */
let override = null;
let afterhoursClock = false;
/** @type {import('./core/contracts.js').SurfaceState|null} */
let surface = null;
let afterhoursActive = false;
let initialized = false;

function stamp() {
  const root = document.documentElement;
  root.dataset.state = surface.toLowerCase();
  root.dataset.afterhours = String(afterhoursActive);
}

/**
 * Pure re-derivation (architecture §2.2). Emits `state:change` ONLY when
 * surface or afterhoursActive actually changed (or this is the boot call).
 * @param {'boot'|'clock'|'live-detector'|'debug'} source
 */
function derive(source) {
  const nextSurface = override ?? (broadcast === 'LIVE' ? 'LIVE' : afterhoursClock ? 'AFTERHOURS' : 'OFFLINE');
  const nextActive = nextSurface === 'AFTERHOURS' || clock.isAfterhours();
  const isBoot = surface === null;
  const changed = isBoot || nextSurface !== surface || nextActive !== afterhoursActive;
  const prev = surface;
  surface = nextSurface;
  afterhoursActive = nextActive;
  if (!changed) return;
  stamp();
  bus.emit('state:change', { surface, prev, broadcast, afterhoursActive, source });
}

/** Boot: wire listeners, derive once (prev:null, source:'boot'). Idempotent. */
export function init() {
  if (initialized) return;
  initialized = true;
  afterhoursClock = clock.isAfterhours();
  bus.on('clock:minute', () => {
    afterhoursClock = clock.isAfterhours();
    derive('clock'); // no-ops internally unless surface/afterhoursActive actually changed
  });
  bus.on('live:online', () => { broadcast = 'LIVE'; derive('live-detector'); });
  bus.on('live:offline', () => { broadcast = 'OFFLINE'; derive('live-detector'); });
  derive('boot');
}

/**
 * debug.js's setState(): manual override, or null to return to automatic.
 * @param {import('./core/contracts.js').SurfaceState|null} v
 */
export function setOverride(v) {
  override = v;
  derive('debug');
}

/** @returns {{surface:string,broadcast:string,afterhoursActive:boolean,override:string|null}} */
export function getSnapshot() {
  return { surface, broadcast, afterhoursActive, override };
}
