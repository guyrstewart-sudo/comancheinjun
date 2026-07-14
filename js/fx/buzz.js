/**
 * fx/buzz.js — SIGN BUZZ controller. (B8)
 * WHAT: arms signage with the fx.css buzz vocabulary — seeded per-plate
 *       phase offset + seeded bad-filament pick — and re-triggers cycles
 *       on deliberate arrivals (GLOBAL-01: load cascade / nav jump only,
 *       never ambient scroll).
 * WHY:  no two plates flicker alike, but the SAME plate flickers the same
 *       way every night (Determinism Law): the seed is the plate's name.
 * GOTCHA: buzz(el) is clock-gated per element for one afterhours-scaled
 *       cycle — calls mid-cycle are dropped, not queued. Under reduced
 *       motion fx.css renders signs lit/static, getAnimations() finds
 *       nothing, so buzz() is a natural no-op.
 */

import { clock } from '../core/clock.js';
import { range, rangeInt } from '../core/rng.js';
import { getScales } from './afterhours.js';
import { tokens } from './flash.js';

const PHASE_MAX_MS = 220; // max seeded stagger across a plate cascade

/** @type {WeakMap<Element, number>} element → clock ms its cycle ends */
const busyUntil = new WeakMap();

/**
 * Which letter of a word is the bad filament — seeded on the word itself,
 * identical every visit. (Every one of them is named pete; see LEGENDS.)
 * @param {string} word letters only
 * @returns {number} 0-based index
 */
export function badFilamentIndex(word) {
  return word.length ? rangeInt('filament:' + word, 0, word.length - 1) : 0;
}

/**
 * Arm a signage element: adds .fx-sign-buzz + a seeded animation-delay so
 * a cascade never fires in unison. First cycle plays on mount. For the
 * 404 plate, add .fx-sign-buzz--flickering after this call (GLOBAL-08).
 * @param {Element} el signage root (neon.js SVG or plate element)
 * @param {string} plateName stable seed — the plate's own signage text
 * @returns {{phaseMs: number}}
 */
export function initBuzz(el, plateName) {
  const phaseMs = Math.round(range('buzz:phase:' + plateName, 0, PHASE_MAX_MS));
  el.style.animationDelay = phaseMs + 'ms';
  el.classList.add('fx-sign-buzz');
  return { phaseMs };
}

/**
 * Re-fire one buzz cycle (nav arrival, rank-up). Restarts the CSS
 * animations via their handles — no remove-class/reflow/re-add hack.
 * @param {Element} el previously armed via initBuzz()
 * @returns {boolean} true if a cycle (re)started, false if gated off
 */
export function buzz(el) {
  const now = clock.now();
  if (now < (busyUntil.get(el) || 0)) return false;
  busyUntil.set(el, now + tokens.durSignBuzzMs * getScales().buzz);
  for (const a of el.getAnimations({ subtree: true })) {
    const name = a.animationName || '';
    if (name.indexOf('fxSignBuzz') === 0 || name.indexOf('fxBadFilament') === 0) {
      a.cancel();
      a.play();
    }
  }
  return true;
}
