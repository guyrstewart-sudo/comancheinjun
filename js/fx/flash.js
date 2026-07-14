/**
 * fx/flash.js — FLASH POP + shared FX helpers (FxAPI home). (B8)
 * WHAT: flashPop() viewport flash with the every-7th double-fire, rippleAt()
 *       puddle-ripple spawner, scrim() the one shared dim, countUp() numeric
 *       tween, and `tokens` — the JS mirror of tokens.css for canvas rows
 *       (bible §5.2: import the numbers, not the CSS).
 * WHY:  one module owns the pop counter so the rhythm break is deterministic
 *       by call order site-wide. Re-triggerables use el.animate() handles
 *       (Law 4); the 90ms double-fire gap rides core/clock (CLOCK LAW), so
 *       forceTick drives it deterministically.
 * GOTCHA: BOTH pops of a 7th pair emit fx:flash with doubleFire:true (the
 *       mirror echoes each real flash); the counter counts CALLS, not
 *       emissions. Reduced motion: pair collapses to one 150ms fade, one
 *       event, doubleFire flag intact — the count is the truth.
 */

import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';

/** JS-readable motion tokens, value-identical to tokens.css (B1). */
export const tokens = Object.freeze({
  durInstantMs: 90,
  durFlashHoldMs: 48,
  durFlashDecayMs: 600,
  durWobbleMs: 420,
  durRippleMs: 480,
  durSignBuzzMs: 900,
  durDriftDecayMs: 800,
  durBloomLampMs: 400,
  durBloomPuddleInMs: 250,
  durBloomPuddleOutMs: 600,
  durRewindImplosionMs: 33,
  durMirrorLagMs: 400,
  durMirrorDevelopMs: 2000,
  durRewireWireMs: 700,
  durMayorLetterMs: 150,
  durMayorStaggerMs: 80,
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeInOutCubic: 'cubic-bezier(0.65, 0, 0.35, 1)',
  easeWobble: 'cubic-bezier(0.34, 1.28, 0.44, 0.96)',
  easeFlashDecay: 'cubic-bezier(0.05, 0.9, 0.1, 1)',
  easeRipple: 'cubic-bezier(0.16, 0.84, 0.28, 1)',
  easeBloom: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeOutSoft: 'cubic-bezier(0.22, 1, 0.36, 1)',
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const DOUBLE_EVERY = 7;
const DOUBLE_GAP_MS = 90;

/** live check — the user can flip the OS toggle mid-visit */
function rm() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* clock-driven micro-scheduler: subscribed only while work is queued */
const pending = [];
let unsubPump = null;
function schedule(delayMs, fn) {
  pending.push({ at: clock.now() + delayMs, fn });
  if (!unsubPump) unsubPump = clock.subscribe(pump);
}
function pump() {
  const now = clock.now();
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].at <= now) pending.splice(i, 1)[0].fn();
  }
  if (!pending.length && unsubPump) { unsubPump(); unsubPump = null; }
}

let overlayEl = null;
let popCount = 0;
/** per-container scoped overlays (WeakMap so detached zones are GC'd). */
const scopedOverlays = new WeakMap();

/**
 * The flash surface. With a `container`, the flash is an absolute overlay
 * INSIDE it — clipped to that zone and scrolling away with it, so a hero
 * camera flash never washes the rest of the site (client request). Without a
 * container, it's the site-wide fixed viewport overlay (deliberate moments).
 */
function overlay(container) {
  if (container) {
    let el = scopedOverlays.get(container);
    if (!el || !el.isConnected) {
      el = document.createElement('div');
      el.className = 'fx-flash-surface'; // absolute inset:0 (fx.css) — clipped by the zone
      el.setAttribute('aria-hidden', 'true');
      container.appendChild(el);
      scopedOverlays.set(container, el);
    }
    return el;
  }
  if (!overlayEl || !overlayEl.isConnected) {
    if (!document.body) return null; // pre-boot: still emit, skip visual
    overlayEl = document.createElement('div');
    overlayEl.className = 'fx-flash-surface fx-flash-surface--viewport';
    overlayEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
}

/** one visual pop + its bus event; never touches the counter */
function fire(intensity, doubleFire, container) {
  const el = overlay(container);
  if (el) {
    if (rm()) {
      el.animate([{ opacity: 0 }, { opacity: intensity * 0.6 }, { opacity: 0 }],
        { duration: 150, easing: tokens.easeStandard });
    } else {
      const totalMs = tokens.durFlashHoldMs + tokens.durFlashDecayMs;
      el.animate([
        { opacity: intensity, offset: 0 },
        { opacity: intensity, offset: tokens.durFlashHoldMs / totalMs, easing: tokens.easeFlashDecay },
        { opacity: 0, offset: 1 },
      ], { duration: totalMs }); // fill none: base opacity 0 resumes after
    }
  }
  bus.emit('fx:flash', { intensity, doubleFire, ts: clock.now() });
}

/**
 * FLASH POP: 48ms hold + 600ms decay; every 7th call double-fires 90ms apart.
 * @param {number} [intensityFraction=1] 0..1 peak overlay alpha
 * @param {Element} [container] scope the flash to this zone (clipped, scrolls
 *        away with it) instead of the site-wide fixed overlay
 * @returns {number} global pop count after this call
 */
export function flashPop(intensityFraction = 1, container = null) {
  const intensity = Math.max(0, Math.min(1, Number(intensityFraction) || 0));
  popCount += 1;
  const seventh = popCount % DOUBLE_EVERY === 0;
  fire(intensity, seventh, container);
  if (seventh && !rm()) schedule(DOUBLE_GAP_MS, () => fire(intensity, true, container));
  return popCount;
}

/**
 * PUDDLE RIPPLE spawner. Spawn ONLY per bible §7 (door buttons, print
 * corner, wall polaroid, gutter release) — never a generic click ripple.
 * Self-removes on animationend; container must be positioned.
 * @param {number} x px in container space
 * @param {number} y px in container space
 * @param {Element} container
 * @returns {SVGElement|null}
 */
export function rippleAt(x, y, container) {
  const host = container || document.body;
  if (!host) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'fx-puddle-ripple');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--x', x + 'px');
  svg.style.setProperty('--y', y + 'px');
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '50');
  ring.setAttribute('cy', '50');
  ring.setAttribute('r', '46');
  svg.appendChild(ring);
  host.appendChild(svg);
  svg.addEventListener('animationend', () => svg.remove(), { once: true });
  return svg;
}

let scrimAnim = null;

/**
 * Ramp the shared .fx-scrim (B1's node). REWIRE: (0.45, 120); lightbox:
 * (0.7, 280). One handle at a time — a new call cancels the last; the end
 * value is committed inline, so cancel() snaps to destination (Law 4).
 * @param {number} targetOpacity 0..1
 * @param {number} durationMs
 * @param {string} [easing]
 * @returns {Animation|null} cancellable handle (null: RM/instant/no node)
 */
export function scrim(targetOpacity, durationMs, easing = tokens.easeOutSoft) {
  const el = document.querySelector('.fx-scrim');
  if (!el) return null;
  if (scrimAnim) { scrimAnim.cancel(); scrimAnim = null; }
  const from = parseFloat(getComputedStyle(el).opacity) || 0;
  el.style.opacity = String(targetOpacity);
  if (rm() || !(durationMs > 0)) return null; // covenant: instant set
  scrimAnim = el.animate([{ opacity: from }, { opacity: targetOpacity }],
    { duration: durationMs, easing });
  return scrimAnim;
}

/**
 * Clock-driven numeric count-up (BUNKER-06/07), easeInOutCubic, integers.
 * @param {Element} el
 * @param {number} from
 * @param {number} to
 * @param {number} durationMs
 * @param {{wobbleOnLand?: boolean}} [opts] REWIRE landing wobble
 * @returns {() => void} cancel — snaps to the final value (Law 4)
 */
export function countUp(el, from, to, durationMs, opts = {}) {
  if (rm() || !(durationMs > 0)) { // covenant: counter snaps
    el.textContent = String(Math.round(to));
    return () => {};
  }
  const startMs = clock.now();
  let live = true;
  const unsub = clock.subscribe(() => {
    if (!live) return;
    const t = Math.min(1, (clock.now() - startMs) / durationMs);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    el.textContent = String(Math.round(from + (to - from) * e));
    if (t >= 1) {
      live = false;
      unsub();
      if (opts.wobbleOnLand) {
        el.classList.add('fx-drunk-wobble');
        for (const a of el.getAnimations()) {
          if (a.animationName === 'fxDrunkWobble') { a.cancel(); a.play(); } // restart, no reflow hack
        }
        el.addEventListener('animationend', () => el.classList.remove('fx-drunk-wobble'), { once: true });
      }
    }
  });
  return () => {
    if (live) { live = false; unsub(); el.textContent = String(Math.round(to)); }
  };
}
