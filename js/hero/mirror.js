/**
 * hero/mirror.js — THE GUTTER MIRROR: the wet street remembers. (NIGHTSHIFT · B2)
 * WHAT: bottom 72px — quarter-res flipped reflection of the hero running
 *       400ms behind through a 12-slot ring buffer; 3 smear passes; sine
 *       column displacement keyed to scroll velocity; delayed fx:flash
 *       echoes; press-and-hold develops the latest drop print (HERO-11/12).
 * WHY:  constitution §5: "every flash echoes in the gutter AFTER it fires
 *       in the sky." The lag is a fixed mechanism (400ms, ×2 afterhours) —
 *       never randomized, so it reads as memory, not noise.
 * HOW:  clock-driven only (CLOCK LAW): capture cadence = lagMs/12 per slot;
 *       displaying the slot about to be overwritten = exactly the full lag.
 *       ~94×18 backing store scaled up is the free blur. Scroll position is
 *       read inside the clock tick, never via a scroll handler doing layout.
 * GOTCHA: initMirror() MUST run after route.js subscribes its render tick —
 *       clock subscribers run in insertion order and the mirror wants the
 *       frame just drawn. RM: static flipped reflection; press-develop
 *       disabled outright (02-motion §8). The aria label promises the hold,
 *       so the canvas is focusable and Enter/Space drive the same develop
 *       (R2 spirit: a11y outranks) — keyboard holds ripple from center.
 */

import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { makeRng } from '../core/rng.js';
import { t as str } from '../data/strings.js';

const SLOT_COUNT = 12, SLOT_W = 94, SLOT_H = 18; // ~94×18 backing (constitution)
const MIRROR_H_PX = 72;
const LAG_BASE_MS = 400;      // --dur-mirror-lag (HERO-11)
const DUR_DEVELOP_MS = 2000;  // --dur-mirror-develop (HERO-12)
const DUR_RIPPLE_MS = 480;    // --dur-ripple, canvas twin
const DUR_ECHO_MS = 600;      // echo decay — flash-decay family
const COLUMNS = 12;           // displacement slices: cheap but liquid
// Constitution hex fallbacks, mirroring route.js readTokens rationale.
const FLASH_HEX = '#FFF8EC', VAPOR_HEX = '#EAD9C0';

let cv = null, ctx = null, hero = null, cssW = 0;
let slots = null, writeIdx = 0, captureAccumMs = 0;
let lagMs = LAG_BASE_MS, smearScale = 1;
let lastScrollY = 0, scrollVelPxS = 0, rmStaticAccumMs = 0;
let isRM = null, getSeed = null;
let needsSize = true; // layout read on the resize flag only, not per tick

// Flash echo queue — preallocated ring (fx:flash → +lagMs echo in the water).
const ECHO_MAX = 8;
const echoAtMs = new Float64Array(ECHO_MAX);
const echoIntensity = new Float32Array(ECHO_MAX);
const echoStartedMs = new Float64Array(ECHO_MAX).fill(-1);
let echoWrite = 0;

const HOLD_PTR_KEYBOARD = -2; // sentinel pointerId: hold driven by keys, not a pointer
let holdActive = false, holdStartMs = 0, holdX = 0, holdY = 0, holdPtrId = -1;
let developAlpha = 0, dissolveAtMs = -1, rippleAtMs = -1;
let printCv = null, printSeed = null;

/**
 * Mount the gutter mirror. Called once by hero/route.js.
 * @param {{stage: HTMLElement, heroCanvas: HTMLCanvasElement,
 *          isReducedMotion: () => boolean,
 *          getLatestDropSeed: () => (string|null)}} opts
 */
export function initMirror(opts) {
  hero = opts.heroCanvas;
  isRM = opts.isReducedMotion;
  getSeed = opts.getLatestDropSeed;

  cv = document.createElement('canvas');
  cv.className = 'route-mirror';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', str('aria.gutterMirror', 'normal'));
  cv.tabIndex = 0; // the label promises the hold — keyboard must be able to keep it
  // MOBILE: the 2s develop hold must not lose to native pan arbitration —
  // override hero.css pan-y on this 72px band only (HERO-12; TAKE-04 precedent).
  cv.style.touchAction = 'none';
  opts.stage.appendChild(cv);
  ctx = cv.getContext('2d');

  slots = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const c = document.createElement('canvas');
    c.width = SLOT_W; c.height = SLOT_H;
    slots.push({ cv: c, g: c.getContext('2d') });
  }

  window.addEventListener('resize', () => { needsSize = true; });
  cv.addEventListener('pointerdown', onHoldStart);
  cv.addEventListener('pointerup', onHoldEnd);
  cv.addEventListener('pointercancel', onHoldEnd);
  cv.addEventListener('pointerleave', onHoldEnd);
  cv.addEventListener('keydown', onHoldKeyDown);
  cv.addEventListener('keyup', onHoldKeyUp);
  cv.addEventListener('blur', beginDissolve); // tab away mid-hold = let go

  bus.on('fx:flash', onFxFlash);
  bus.on('tape:seek', onTapeSeek);
  bus.on('state:change', (s) => {
    // AFTERHOURS: lag ×2, smear alpha ×2 (02-motion §6) — JS scalars only.
    const on = !!(s && s.afterhoursActive);
    lagMs = on ? LAG_BASE_MS * 2 : LAG_BASE_MS;
    smearScale = on ? 2 : 1;
    cv.setAttribute('aria-label', str('aria.gutterMirror', on ? 'afterhours' : 'normal'));
  });

  clock.subscribe(tick); // AFTER route's render subscription — see gotcha
}

function onFxFlash(payload) {
  if (!payload || isRM()) return;
  echoAtMs[echoWrite] = clock.now() + lagMs; // echo lands exactly lagMs later;
  echoIntensity[echoWrite] = Math.min(1, (payload.intensity != null ? payload.intensity : 0.12) * 2);
  echoStartedMs[echoWrite] = -1;             // a double-fire arrives as its own event
  echoWrite = (echoWrite + 1) % ECHO_MAX;
}

/** A seek is a cut, not a memory — flush the ring so the gutter doesn't
 *  replay 400ms of a timeline that no longer exists. */
function onTapeSeek() {
  if (!slots) return;
  for (const s of slots) s.g.clearRect(0, 0, SLOT_W, SLOT_H);
  captureAccumMs = 0;
}

function onHoldStart(e) {
  startHold(e.pointerId, e.clientX, e.clientY);
}

function startHold(ptrId, clientX, clientY) {
  if (isRM() || holdActive) return; // RM: feature disabled outright
  if (ptrId >= 0) {
    // GESTURE LOCK: capture the pointer so tremor-drift can't hand the hold
    // to scroll (pointercancel) or off-band exit (pointerleave) mid-develop.
    try { cv.setPointerCapture(ptrId); } catch (_) { /* best-effort */ }
  }
  holdActive = true;
  holdPtrId = ptrId;
  holdStartMs = clock.now();
  const r = cv.getBoundingClientRect(); // event-time layout read, not tick-time
  holdX = clientX - r.left; holdY = clientY - r.top;
  dissolveAtMs = -1; rippleAtMs = -1; developAlpha = 0;
  const seed = getSeed();
  if (seed !== printSeed) { printSeed = seed; printCv = seed ? makePrint(seed) : null; }
}

function onHoldEnd(e) {
  if (!holdActive || (e.pointerId !== undefined && e.pointerId !== holdPtrId)) return;
  beginDissolve();
}

/** Keyboard path for HERO-12 — hold Enter/Space, same state machine as the
 *  pointer, ripple anchored at the water's center. */
function onHoldKeyDown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (isRM()) return; // feature off under RM — leave Space to scroll the page
  e.preventDefault(); // held Space must not scroll while developing
  if (e.repeat) return;
  const r = cv.getBoundingClientRect(); // event-time layout read, not tick-time
  startHold(HOLD_PTR_KEYBOARD, r.left + r.width / 2, r.top + r.height / 2);
}

function onHoldKeyUp(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (holdPtrId !== HOLD_PTR_KEYBOARD) return; // a pointer owns this hold
  beginDissolve();
}

function beginDissolve() {
  if (!holdActive) return;
  holdActive = false;
  if (developAlpha > 0.02) {
    dissolveAtMs = clock.now();
    rippleAtMs = dissolveAtMs; // PUDDLE RIPPLE dissolve — GLOBAL-10 hero-gutter spawn
  }
}

/** Faint generative "print" — flash-blown blobs in a vapor border. The real
 *  photograph lives in THE TAKE (B6); the water only remembers light. */
function makePrint(seed) {
  const c = document.createElement('canvas');
  c.width = SLOT_W; c.height = SLOT_H;
  const g = c.getContext('2d');
  const rng = makeRng('mirrorprint:' + seed); // Determinism Law
  g.fillStyle = 'rgba(14,10,6,0.85)';
  g.fillRect(0, 0, SLOT_W, SLOT_H);
  for (let i = 0; i < 5; i++) {
    const x = 8 + rng() * (SLOT_W - 16), y = 3 + rng() * (SLOT_H - 6), r = 2 + rng() * 5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grad.addColorStop(0, 'rgba(255,248,236,0.9)');
    grad.addColorStop(1, 'rgba(255,248,236,0)');
    g.fillStyle = grad;
    g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  }
  g.strokeStyle = 'rgba(234,217,192,0.8)'; // vapor print border
  g.lineWidth = 1;
  g.strokeRect(1.5, 1.5, SLOT_W - 3, SLOT_H - 3);
  return c;
}

function tick(deltaMs, nowMs) {
  if (needsSize) {
    needsSize = false;
    cssW = cv.clientWidth;        // the ONE layout read, resize-flagged
    cv.width = Math.max(1, cssW); // 1:1 css px — the up-scaled slots ARE the blur
    cv.height = MIRROR_H_PX;
  }
  if (cssW === 0 || hero.width === 0) { needsSize = cssW === 0; return; }
  if (isRM()) { renderReducedMotion(deltaMs); return; }

  const sy = window.scrollY; // scroll velocity, read here per the covenant
  if (deltaMs > 0) scrollVelPxS = scrollVelPxS * 0.85 + (Math.abs(sy - lastScrollY) / (deltaMs / 1000)) * 0.15;
  lastScrollY = sy;

  captureAccumMs += deltaMs; // one slot per lagMs/12 → oldest = full lag
  const interval = lagMs / SLOT_COUNT;
  while (captureAccumMs >= interval) {
    captureAccumMs -= interval;
    captureInto(slots[writeIdx]);
    writeIdx = (writeIdx + 1) % SLOT_COUNT;
  }
  const past = slots[writeIdx].cv; // about to be overwritten = ~lagMs old

  ctx.clearRect(0, 0, cssW, MIRROR_H_PX);

  // Pass 1 — displaced columns, sine keyed to scroll velocity.
  const amp = Math.min(6, scrollVelPxS / 120);
  const colW = cssW / COLUMNS, srcColW = SLOT_W / COLUMNS, phase = nowMs / 900;
  ctx.globalAlpha = Math.min(1, 0.5 * smearScale);
  for (let i = 0; i < COLUMNS; i++) {
    const off = amp * Math.sin(phase + i * 0.9);
    ctx.drawImage(past, i * srcColW, 0, srcColW, SLOT_H, i * colW + off, 0, colW + 1, MIRROR_H_PX);
  }
  // Passes 2+3 — offset smears at falling alpha (the wet drag).
  ctx.globalAlpha = Math.min(1, 0.22 * smearScale);
  ctx.drawImage(past, 0, 3, cssW, MIRROR_H_PX);
  ctx.globalAlpha = Math.min(1, 0.1 * smearScale);
  ctx.drawImage(past, 0, 7, cssW, MIRROR_H_PX);
  ctx.globalAlpha = 1;

  drawEchoes(nowMs);
  drawDevelop(deltaMs, nowMs);
}

function captureInto(slot) {
  const g = slot.g;
  g.clearRect(0, 0, SLOT_W, SLOT_H);
  g.save();
  g.scale(1, -1); // the flip: sky into water; lower ~38% of the hero reflects
  g.drawImage(hero, 0, hero.height * 0.62, hero.width, hero.height * 0.38, 0, -SLOT_H, SLOT_W, SLOT_H);
  g.restore();
}

function drawEchoes(nowMs) {
  for (let i = 0; i < ECHO_MAX; i++) {
    if (echoAtMs[i] <= 0) continue;
    if (echoStartedMs[i] < 0) {
      if (nowMs < echoAtMs[i]) continue;
      echoStartedMs[i] = nowMs;
    }
    const p = (nowMs - echoStartedMs[i]) / DUR_ECHO_MS;
    if (p >= 1) { echoAtMs[i] = 0; echoStartedMs[i] = -1; continue; }
    const q = 1 - p;
    ctx.globalAlpha = echoIntensity[i] * q * q; // fast-drop decay, flash family
    ctx.fillStyle = FLASH_HEX;
    ctx.fillRect(0, 0, cssW, MIRROR_H_PX);
  }
  ctx.globalAlpha = 1;
}

function drawDevelop(deltaMs, nowMs) {
  if (holdActive) {
    const heldMs = nowMs - holdStartMs;
    if (heldMs > 200 && printCv) {
      developAlpha = Math.min(0.4, developAlpha + deltaMs / 1000); // ~400ms fade-in
      if (heldMs >= DUR_DEVELOP_MS + 200) beginDissolve();         // 2s, then let go
    }
  } else if (dissolveAtMs >= 0) {
    const p = (nowMs - dissolveAtMs) / DUR_RIPPLE_MS;
    if (p >= 1) { dissolveAtMs = -1; developAlpha = 0; }
    else developAlpha *= 1 - p * 0.12;
  }

  if (developAlpha > 0.01 && printCv) {
    ctx.globalAlpha = developAlpha;
    const w = Math.min(cssW * 0.6, 220), h = w * (SLOT_H / SLOT_W);
    ctx.drawImage(printCv, (cssW - w) / 2, (MIRROR_H_PX - h) / 2, w, h);
    ctx.globalAlpha = 1;
  }

  if (rippleAtMs >= 0) {
    const p = (nowMs - rippleAtMs) / DUR_RIPPLE_MS;
    if (p >= 1) rippleAtMs = -1;
    else {
      const q = 1 - p, ease = 1 - q * q * q; // ~--ease-ripple expansion
      ctx.globalAlpha = 0.5 * (1 - p);       // stroke opacity .5 → 0 (canon)
      ctx.strokeStyle = VAPOR_HEX;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(holdX, Math.min(holdY, MIRROR_H_PX - 2), 8 + ease * 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** RM covenant: a static flipped reflection refreshed at 2fps — a still,
 *  not a show. No smear, no lag, no displacement, no echoes, no develop. */
function renderReducedMotion(deltaMs) {
  rmStaticAccumMs += deltaMs;
  if (rmStaticAccumMs < 500) return;
  rmStaticAccumMs = 0;
  captureInto(slots[0]);
  ctx.clearRect(0, 0, cssW, MIRROR_H_PX);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(slots[0].cv, 0, 0, cssW, MIRROR_H_PX);
  ctx.globalAlpha = 1;
}
