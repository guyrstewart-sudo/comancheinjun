/**
 * fx/afterhours.js — afterhours mutation applier (B8).
 * WHAT: fans afterhoursActive out to JS ambience consumers via getScales();
 *       CSS variants ride :root[data-afterhours="true"] in fx.css.
 * WHY:  bible §6 — afterhours slows AMBIENCE, never truth; canvas loops
 *       can't read CSS vars per frame, so the scalars live here as JS.
 * HOW:  init() (wired by B1 boot) seeds from the <html> attribute state.js
 *       stamps, then tracks `state:change` — never the clock directly.
 * GOTCHA: deliberately NO `fx:afterhours` bus event (catalog §3 is closed).
 *       Consumers poll getScales() at their own cadence — grain per tile
 *       frame, buzz per trigger. Cheap object read, zero DOM.
 */

import { bus } from '../core/bus.js';

/** Normal ambience scalars (see 02-motion.md §6 for each factor). */
const NORMAL = Object.freeze({
  buzz: 1, mirrorLag: 1, mirrorAlpha: 1, grainAlpha: 0.04, grainFps: 12, wobbleAmp: 1,
});
/** 00:00–06:00 set. Drunker with you, never sloppier. */
const LOOSE = Object.freeze({
  buzz: 1.6, mirrorLag: 2, mirrorAlpha: 2, grainAlpha: 0.08, grainFps: 8, wobbleAmp: 1.15,
});

let active = false;
let wired = false;

/** Current scale set. Frozen + identity-stable — compare by reference to detect swaps. */
export function getScales() { return active ? LOOSE : NORMAL; }

/** @returns {boolean} true while the afterhours mutation applies */
export function isActive() { return active; }

/** Wire the state subscription. Idempotent; safe before state.js boots. */
export function init() {
  if (wired) return;
  wired = true;
  active = document.documentElement.getAttribute('data-afterhours') === 'true';
  bus.on('state:change', (p) => {
    if (p && typeof p.afterhoursActive === 'boolean') active = p.afterhoursActive;
  });
}
