/**
 * hero/route.js — THE ROUTE: hero canvas engine, layers 0–4, OSD, jog.
 * (NIGHTSHIFT · B2)
 * WHAT: renders the night from ONE float, tapeTime (tape-s since 23:00,
 *       0..18000): grain L0, puddles L1, grid L2, ride/head/spokes L3,
 *       time-addressed drop pins L4, DOM OSD, horizontal jog. Boots mirror.js.
 * WHY:  constitution §5 — VHS chassis, noir skin; pure function of tapeTime
 *       so __NIGHT_DEBUG__.forceTick/seek drive it in the rAF-dead browser.
 * HOW:  all time via core/clock.js; tapeTime += delta × CONFIG.TAPE_RATE
 *       (arch §7.2). Static layers pre-rendered at boot/resize; per-frame =
 *       blits + one prefix stroke + sprites, zero allocation. Pins: x,y =
 *       pointAtTapeTime(drop.t) (R8). Draw-in plants pins visually with no
 *       bus emission; later bus drop:photo re-strobes the matching pin (R9).
 * GOTCHA: the clock pump IS the frame loop — mirror.js must subscribe AFTER
 *       us (see init order). Tick-side DOM writes are OSD-only, and only on
 *       minute crossings or user-driven seeks.
 */

import { CONFIG } from '../config.js';
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { makeRng } from '../core/rng.js';
import { t as str } from '../data/strings.js';
import {
  MAP_W, MAP_H, RIVER, RIVER_LABEL, STREETS, LAMPS, PUDDLES, RIDE,
  RIDE_DURATION_S, pointAtTapeTime, nearestPuddleIndex,
} from '../data/route-data.js';
import { TapeAPI } from '../ghost/tape.js';
const { getDrops, getDurationS } = TapeAPI;
import { flashPop } from '../fx/flash.js';
import { neonSign } from '../fx/neon.js';
import { registerDebug } from '../debug.js';
import { initMirror } from './mirror.js';

const MIRROR_H_PX = 72;         // constitution §5: bottom 72px is water
const LAMP_NEAR_MAP = 70;       // map-units: lamp counts as on-route
const LAMP_LEAD_TAPE_S = 250;   // ignite ~one block ahead (HERO-01)
const PUDDLE_NEAR_MAP = 60;     // light within 60 ignites (HERO-02)
const DUR_BLOOM_MS = 400, DUR_PUDDLE_IN_MS = 250, DUR_PUDDLE_OUT_MS = 600;
const DUR_WOBBLE_MS = 420, DUR_IMPLODE_MS = 33, DUR_DRIFT_DECAY_MS = 800;
const DUR_STROBE_MS = 648;      // HERO-06 hold+decay envelope, canvas-side
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, Menlo, "Roboto Mono", "Courier New", monospace';

let root = null, stage = null, cv = null, ctx = null;
let cssW = 0, cssH = 0, dpr = 1;
let staticCv = null;            // river+streets+labels+puddle bases+dead lamps
let lampSprite = null, lampFogSprite = null, wedgeSprite = null, smearSprite = null;
let grainPatterns = null;
let colors = null;              // palette read from CSS tokens ONCE at boot

let tapeTime = 0;               // THE float
let tapeDurationS = RIDE_DURATION_S;
let playing = true, lastTapeMinute = -1;
let needsResize = true, lastResizeAtMs = -1e9;
let reducedMotion = false, afterhoursActive = false, mode = 'normal';
let grainAlpha = 0.04, grainFps = 12, driftHz = 0.3; // 02-motion §6 scalars
let driftPhase = 0, driftEnv = 0, spokePhase = 0;
let grainClockMs = 0, grainFrame = 0; // grain NEVER reverses (rewind truth)
let headMoving = false, prevTapeTime = 0, popUsedThisTick = false;

/** @type {Array<{id:string,tapeTime:number,x:number,y:number,puddleIdx:number,flashed:boolean,plantedAtMs:number,implodeAtMs:number,strobeAtMs:number,seed:string,caption:string}>} */
let pins = [];
const puddleLevel = new Float32Array(PUDDLES.length);
const puddleFlash = new Float32Array(PUDDLES.length);
const pendingPuddle = [];       // flashes NEXT frame — "one frame later" canon
const lampIgniteT = new Float64Array(LAMPS.length); // tape-s; Infinity = dead lamp
const lampLitAtMs = new Float64Array(LAMPS.length);
const headPt = { x: 0, y: 0, angleRad: 0 };   // reusable out-objects (zero alloc)
const scratchPt = { x: 0, y: 0, angleRad: 0 };
let mapSX = 1, mapSY = 1, mapOX = 0, mapOY = 0;

let osdCounter = null, osdNight = null, hintEl = null;
let hintDefault = '', hintCurrent = '', hintUntilMs = 0;
let pendingSeekEmit = null, lastSeekEmitMs = -1e9;

/** Shadow-tracked hint write so the tick never READS the DOM. */
function setHint(text, untilMs) {
  if (text !== hintCurrent) { hintCurrent = text; hintEl.textContent = text; }
  hintUntilMs = untilMs;
}

// Canvas approximations of the motion-bible curves (02-motion §5.2 licenses
// re-implementing the shape; the durations above are the contract numbers).
function easeBloom(p) { const q = 1 - p; return 1 - q * q * q; }           // ~--ease-bloom
function easeFlashDecay(p) { const q = 1 - p; return 1 - q * q * q * q; }  // ~--ease-flash-decay
/** fxDrunkWobble scale: 0.94 → 1.03 @55% → 1. */
function wobbleScale(p) {
  if (p >= 1) return 1;
  if (p < 0.55) return 0.94 + 0.09 * easeBloom(p / 0.55);
  return 1.03 - 0.03 * ((p - 0.55) / 0.45);
}

/** Palette from :root tokens, read ONCE (never in the tick). Falls back to
 *  constitution §2 hex so the hero renders before tokens.css lands. */
function readTokens() {
  const gs = getComputedStyle(document.documentElement);
  const tk = (n, fb) => (gs.getPropertyValue(n) || '').trim() || fb;
  colors = {
    sodium: tk('--sodium', '#FF9F1C'), sodiumHot: tk('--sodium-hot', '#FFC46B'),
    ember: tk('--sodium-ember', '#B36A0A'), vapor: tk('--vapor', '#EAD9C0'),
    vaporGhost: tk('--vapor-ghost', '#8F7B60'), asphaltDeep: tk('--asphalt-deep', '#0E0A06'),
    flash: tk('--flash', '#FFF8EC'),
    puddle: '#1C130B', // constitution §5 L1 literal — not a palette token
  };
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function buildDom() {
  // a11y: the masthead <h1> below is the page's top-level heading, so the
  // stage must PRECEDE the zone's <h2> plate in DOM order or heading
  // navigation starts at h2. Prepend, don't append — paint is unchanged
  // (the stage is positioned, the plate is not; hero.css §masthead).
  // The hero is an ambient, always-roaming night-map now (the drag-to-scrub
  // gesture is gone). The stage is a plain container; the canvas below carries
  // the image role and the sr-only drop list carries the content for AT.
  stage = el('div', 'route-stage');
  root.prepend(stage);

  cv = el('canvas', 'route-canvas', stage);
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', str('aria.heroCanvas', mode));
  ctx = cv.getContext('2d');

  const masthead = el('header', 'route-masthead', stage);
  const h1 = el('h1', 'route-sign', masthead);
  // Constitution §3: the logotype IS the buzzing sign — hand-drawn SVG neon,
  // never plain text. Name lives in the aria-label; the tube is decoration.
  try {
    const sign = neonSign(CONFIG.ARTIST_NAME, { label: CONFIG.ARTIST_NAME });
    h1.setAttribute('aria-label', CONFIG.ARTIST_NAME);
    sign.el.setAttribute('aria-hidden', 'true');
    h1.appendChild(sign.el);
    sign.wireOn();
  } catch (err) {
    console.error('[masthead neon] fell back to text —', err);
    h1.textContent = CONFIG.ARTIST_NAME; // a dead sign still says the name
  }
  el('p', 'route-tagline', masthead).textContent = str('hero.tagline', mode);

  const osd = el('div', 'route-osd', stage);
  const badges = el('div', 'route-osd__badges', osd);
  el('span', 'route-osd__play', badges).textContent = str('osd.play', mode);
  el('span', 'route-osd__ghost', badges).textContent = str('osd.ghostBadge', mode);
  el('span', 'route-osd__rec', badges).textContent = str('osd.rec', mode);
  osdNight = el('div', 'route-osd__night', osd);
  osdCounter = el('div', 'route-osd__counter', osd);

  const hints = el('div', 'route-hints', stage);
  hintEl = el('p', 'route-hint', hints);
  hintDefault = ''; // no scrub hint — the ride just roams; only the mirror hint shows
  setHint(hintDefault, 0);
  el('p', 'route-hint route-hint--hold', hints).textContent = str('osd.holdPuddleHint', mode);

  // a11y: every drop is also plain text (aria.heroCanvas promises this).
  const list = el('ol', 'route-sr', stage);
  for (const p of pins) el('li', '', list).textContent = p.caption;

  const nk = clock.nightKey(); // the tape is "last night" = current nightKey
  osdNight.textContent = `${str('osd.nightOf', mode)} ${nk.slice(5, 7)}·${nk.slice(8, 10)}`;
  updateOsdCounter();
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Radial glow sprite (lamp bloom / fog halo / puddle smear). */
function makeGlow(sizePx, inner, mid) {
  const c = makeCanvas(sizePx, sizePx), g = c.getContext('2d');
  const r = sizePx / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, sizePx, sizePx);
  return c;
}

function makeSprites() {
  lampSprite = makeGlow(64, 'rgba(255,196,107,0.9)', 'rgba(255,159,28,0.35)');
  lampFogSprite = makeGlow(128, 'rgba(255,196,107,0.55)', 'rgba(255,159,28,0.18)'); // afterhours fog halo
  smearSprite = makeGlow(96, 'rgba(255,196,107,0.5)', 'rgba(255,159,28,0.22)');

  // Headlight wedge — warm-white cone, drawn rotated, composite 'lighter'.
  wedgeSprite = makeCanvas(160, 160);
  const w = wedgeSprite.getContext('2d');
  const grad = w.createLinearGradient(20, 80, 152, 80);
  grad.addColorStop(0, 'rgba(255,248,236,0.55)'); grad.addColorStop(1, 'rgba(255,248,236,0)');
  w.fillStyle = grad;
  w.beginPath(); w.moveTo(20, 80); w.lineTo(152, 34); w.lineTo(152, 126); w.closePath(); w.fill();

  // L0 — 8 seeded 256px noise tiles (Determinism Law). fx/grain.js is not a
  // contracts.js public API, so this is our own cycler on core/rng seeds.
  grainPatterns = [];
  for (let k = 0; k < 8; k++) {
    const c = makeCanvas(256, 256), g = c.getContext('2d');
    const img = g.createImageData(256, 256), d = img.data;
    const rng = makeRng('grain:tile-' + k);
    for (let i = 0; i < d.length; i += 4) {
      const v = (rng() * 255) | 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainPatterns.push(ctx.createPattern(c, 'repeat'));
  }
}

function mapX(x) { return mapOX + x * mapSX; }
function mapY(y) { return mapOY + y * mapSY; }

/** Fit 1000×1000 map to canvas; ≤1.5× axis distortion (stylized, not GIS),
 *  letterbox beyond that, river pinned to the west edge. */
function computeMapTransform(heroHPx) {
  mapSX = cssW / MAP_W;
  mapSY = Math.min(Math.max(heroHPx / MAP_H, mapSX * 0.66), mapSX * 1.5);
  mapOX = 0;
  mapOY = (heroHPx - MAP_H * mapSY) / 2;
}

/** Pre-render everything that never changes (perf covenant: 1 blit/frame). */
function renderStatic(heroHPx) {
  staticCv = makeCanvas(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(heroHPx * dpr)));
  const g = staticCv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = colors.asphaltDeep; // the French Broad: a void, not a shape
  g.beginPath();
  g.moveTo(mapX(RIVER[0][0]), mapY(RIVER[0][1]));
  for (let i = 1; i < RIVER.length; i++) g.lineTo(mapX(RIVER[i][0]), mapY(RIVER[i][1]));
  g.closePath(); g.fill();

  g.fillStyle = colors.puddle; // L1 bases
  for (const pd of PUDDLES) {
    g.beginPath();
    g.moveTo(mapX(pd.pts[0][0]), mapY(pd.pts[0][1]));
    for (let i = 1; i < pd.pts.length; i++) g.lineTo(mapX(pd.pts[i][0]), mapY(pd.pts[i][1]));
    g.closePath(); g.fill();
  }

  g.strokeStyle = colors.ember; // L2 grid: 1px ember, 25% alpha, drawn ONCE
  g.globalAlpha = 0.25; g.lineWidth = 1; g.lineCap = 'round';
  for (const st of STREETS) {
    g.beginPath();
    g.moveTo(mapX(st.pts[0][0]), mapY(st.pts[0][1]));
    for (let i = 1; i < st.pts.length; i++) g.lineTo(mapX(st.pts[i][0]), mapY(st.pts[i][1]));
    g.stroke();
  }

  g.globalAlpha = 0.5; g.fillStyle = colors.ember; // dead-lamp dots
  for (const [lx, ly] of LAMPS) {
    g.beginPath(); g.arc(mapX(lx), mapY(ly), 1.5, 0, Math.PI * 2); g.fill();
  }

  g.globalAlpha = 0.8; g.fillStyle = colors.vaporGhost; // real street names, tiny mono
  g.font = '9px ' + MONO;
  const label = (name, x, y, a) => {
    g.save(); g.translate(mapX(x), mapY(y)); g.rotate(a); g.fillText(name, 0, 0); g.restore();
  };
  for (const st of STREETS) if (st.label) label(st.name, st.label.x, st.label.y, st.label.angleRad);
  label(RIVER_LABEL.name, RIVER_LABEL.x, RIVER_LABEL.y, RIVER_LABEL.angleRad);
  g.globalAlpha = 1;
}

function doResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (w === 0 || h === 0) return;
  cssW = w; cssH = h;
  dpr = Math.min(window.devicePixelRatio || 1, 2); // DPR ≤2 (perf covenant)
  const heroH = cssH - MIRROR_H_PX;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(heroH * dpr);
  cv.style.height = heroH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeMapTransform(heroH);
  renderStatic(heroH);
  for (const p of pins) { // pin x,y live in canvas px — remap
    pointAtTapeTime(p.tapeTime, scratchPt);
    p.x = mapX(scratchPt.x); p.y = mapY(scratchPt.y);
  }
}

/** Each lamp's ignite tape-time = first ride pass within range minus a
 *  one-block lead (HERO-01). Sampled every 30 tape-s, boot only. */
function computeLampIgniteTimes() {
  const near2 = LAMP_NEAR_MAP * LAMP_NEAR_MAP;
  lampIgniteT.fill(Infinity);
  for (let s = 0; s <= tapeDurationS; s += 30) {
    pointAtTapeTime(s, scratchPt);
    for (let l = 0; l < LAMPS.length; l++) {
      if (lampIgniteT[l] !== Infinity) continue;
      const dx = LAMPS[l][0] - scratchPt.x, dy = LAMPS[l][1] - scratchPt.y;
      if (dx * dx + dy * dy < near2) lampIgniteT[l] = Math.max(0, s - LAMP_LEAD_TAPE_S);
    }
  }
  lampLitAtMs.fill(-1);
}

/** Pins from the tape's TIME-addressed drops (R8). Tolerates {tapeTime}
 *  (contracts.js DropPhoto) and {t} (P3 ruling shorthand). Survives a
 *  missing/broken tape — dive-bar rule. */
function buildPins() {
  let drops = [];
  try { drops = getDrops() || []; } catch (_) { drops = []; }
  try { tapeDurationS = getDurationS() || RIDE_DURATION_S; } catch (_) { tapeDurationS = RIDE_DURATION_S; }
  pins = drops.map((d, i) => {
    const tS = Math.min(Math.max(d.tapeTime != null ? d.tapeTime : d.t, 0), tapeDurationS);
    pointAtTapeTime(tS, scratchPt);
    return {
      id: d.id != null ? String(d.id) : 'drop-' + i,
      tapeTime: tS, x: scratchPt.x, y: scratchPt.y,
      puddleIdx: nearestPuddleIndex(scratchPt.x, scratchPt.y),
      flashed: false, plantedAtMs: -1, implodeAtMs: -1, strobeAtMs: -1,
      seed: d.seed || ('drop-' + i), caption: d.caption || '',
    };
  });
  pins.sort((a, b) => a.tapeTime - b.tapeTime);
}

/** FxAPI call (arch §10: hero "calls flashPop(0.12)"), guarded so a broken
 *  fx module can't kill the hero. */
function safeFlash(intensity) {
  // scope the camera flash to the hero stage (#route, overflow:hidden) so the
  // bike's flashing NEVER washes the rest of the site as you scroll — it lives
  // on the front page only (client request).
  try { flashPop(intensity, stage); } catch (_) { /* one dead lamp ≠ closed bar */ }
}

function plantPin(pin, withPop) {
  pin.flashed = true;
  pin.plantedAtMs = clock.now();
  pin.implodeAtMs = -1;
  if (withPop && !reducedMotion && !popUsedThisTick) {
    popUsedThisTick = true; // cap pop spam during fast scrub
    safeFlash(0.12);        // HERO-06, 12% canvas-wide
  }
  pendingPuddle.push(pin.puddleIdx); // puddle flashes ONE FRAME LATER (canon)
}

function unplantPin(pin) {
  pin.flashed = false;
  pin.implodeAtMs = reducedMotion ? -1 : clock.now(); // HERO-08 implosion
  pin.plantedAtMs = -1; pin.strobeAtMs = -1;
}

/**
 * Move tapeTime honoring rewind truths: forward crossings plant, backward
 * crossings un-flash (grainClockMs elsewhere only ever accumulates).
 * @param {number} newT tape-s
 * @param {boolean} instant debug/RM seek — no pops, no ceremony
 * @param {boolean} emit queue a tape:seek bus emission
 */
function applySeek(newT, instant, emit) {
  const clamped = Math.min(Math.max(newT, 0), tapeDurationS);
  const oldT = tapeTime;
  if (clamped === oldT && !emit) return;
  const dir = clamped >= oldT ? 1 : -1;
  for (const p of pins) {
    if (dir > 0 && !p.flashed && p.tapeTime > oldT && p.tapeTime <= clamped) {
      plantPin(p, !instant);
      if (instant) { p.plantedAtMs = -1; pendingPuddle.length = 0; } // pre-lit
    } else if (dir < 0 && p.flashed && p.tapeTime > clamped) {
      unplantPin(p);
      if (instant) p.implodeAtMs = -1;
    }
  }
  if (dir < 0) { // rewind re-darkens lamps the ride hasn't reached
    for (let l = 0; l < LAMPS.length; l++) if (lampIgniteT[l] > clamped) lampLitAtMs[l] = -1;
  }
  tapeTime = clamped;
  playing = clamped < tapeDurationS;
  if (dir < 0 && !instant) setHint(str('osd.rewindHint', mode), clock.now() + 2000);
  if (emit) {
    pendingSeekEmit = { tapeTime: clamped, direction: dir };
    updateOsdCounter(); // user/debug-driven only; play advance updates per minute
  }
}

function fmtTapeClock(tS) {
  const total = 23 * 60 + Math.floor(tS / 60);
  return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function updateOsdCounter() {
  osdCounter.textContent = `${str('osd.counterLabel', mode)} ${fmtTapeClock(tapeTime)}`;
}

function refreshModeStrings() {
  cv.setAttribute('aria-label', str('aria.heroCanvas', mode));
}

/** New lap: the ride loops the night, so re-arm everything for a fresh pass. */
function resetNight() {
  for (const p of pins) { p.flashed = false; p.plantedAtMs = -1; p.implodeAtMs = -1; p.strobeAtMs = -1; }
  lampLitAtMs.fill(-1);
  puddleLevel.fill(0); puddleFlash.fill(0); pendingPuddle.length = 0;
  tapeTime = 0;
  lastTapeMinute = -1;
}

function tick(deltaMs, nowMs) {
  popUsedThisTick = false;
  if (needsResize && nowMs - lastResizeAtMs > 250) { // resize through clock-throttle
    needsResize = false; lastResizeAtMs = nowMs;
    doResize();
  }
  if (!staticCv) return;

  grainClockMs += deltaMs; // forward only — the noise never rewinds (canon)
  grainFrame = Math.floor(grainClockMs / (1000 / grainFps)) % 8;

  prevTapeTime = tapeTime;
  if (!reducedMotion) { // the ride roams continuously, looping the night — no scrub
    let next = tapeTime + (deltaMs / 1000) * CONFIG.TAPE_RATE;
    if (next >= tapeDurationS && tapeDurationS > 0) {
      resetNight();            // new lap: tapeTime→0, pins un-flashed, lamps unlit
      next %= tapeDurationS;   // carry the remainder into the fresh pass
    }
    applySeek(next, false, false);
  }
  headMoving = tapeTime !== prevTapeTime;

  const tapeMin = Math.floor(tapeTime / 60); // bus is not a frame loop:
  if (tapeMin !== lastTapeMinute) {          // progress on minute crossings only
    lastTapeMinute = tapeMin;
    bus.emit('tape:progress', { tapeTime });
    updateOsdCounter();
  }
  if (pendingSeekEmit && nowMs - lastSeekEmitMs > 250) { // jog seeks ≤4/s
    lastSeekEmitMs = nowMs;
    bus.emit('tape:seek', pendingSeekEmit);
    pendingSeekEmit = null;
  }
  if (nowMs >= hintUntilMs && hintCurrent !== hintDefault) setHint(hintDefault, hintUntilMs);

  if (!reducedMotion) { // HERO-10 drift ±0.4° / HERO-04 spokes 2Hz
    driftEnv = headMoving ? Math.min(1, driftEnv + deltaMs / 200)
      : Math.max(0, driftEnv - deltaMs / DUR_DRIFT_DECAY_MS);
    if (driftEnv > 0) driftPhase += (deltaMs / 1000) * driftHz * Math.PI * 2;
    if (headMoving) spokePhase += (deltaMs / 1000) * 2 * Math.PI * 2;
  }
  render(nowMs, deltaMs);
}

function render(nowMs, deltaMs) {
  const heroH = cssH - MIRROR_H_PX;
  ctx.clearRect(0, 0, cssW, heroH);

  const driftRad = reducedMotion ? 0 : (0.4 * Math.PI / 180) * Math.sin(driftPhase) * driftEnv;
  ctx.save();
  if (driftRad !== 0) {
    ctx.translate(cssW / 2, heroH / 2); ctx.rotate(driftRad); ctx.translate(-cssW / 2, -heroH / 2);
  }

  ctx.drawImage(staticCv, 0, 0, cssW, heroH); // L1+L2 in one blit

  pointAtTapeTime(tapeTime, headPt);
  const hx = mapX(headPt.x), hy = mapY(headPt.y);

  // Lamps — bloom 400ms as the ride approaches (HERO-01); RM: pre-lit.
  const sprite = afterhoursActive ? lampFogSprite : lampSprite;
  const spriteBase = afterhoursActive ? 96 : 64;
  for (let l = 0; l < LAMPS.length; l++) {
    if (lampIgniteT[l] > tapeTime) continue;
    if (lampLitAtMs[l] < 0) lampLitAtMs[l] = nowMs;
    const e = reducedMotion ? 1 : easeBloom(Math.min(1, (nowMs - lampLitAtMs[l]) / DUR_BLOOM_MS));
    const s = spriteBase * e;
    ctx.globalAlpha = e;
    ctx.drawImage(sprite, mapX(LAMPS[l][0]) - s / 2, mapY(LAMPS[l][1]) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  // Puddles — ignite ≤60 map-units from the headlight (HERO-02); drop echo 600ms.
  for (let p = 0; p < PUDDLES.length; p++) {
    const pd = PUDDLES[p];
    const dx = pd.cx - headPt.x, dy = pd.cy - headPt.y;
    const near = headMoving && (dx * dx + dy * dy) < PUDDLE_NEAR_MAP * PUDDLE_NEAR_MAP;
    puddleLevel[p] = near ? Math.min(1, puddleLevel[p] + deltaMs / DUR_PUDDLE_IN_MS)
      : Math.max(0, puddleLevel[p] - deltaMs / DUR_PUDDLE_OUT_MS);
    if (puddleFlash[p] > 0) puddleFlash[p] = Math.max(0, puddleFlash[p] - deltaMs / DUR_PUDDLE_OUT_MS);
    const a = Math.min(1, puddleLevel[p] * 0.55 + puddleFlash[p] * 0.9);
    if (a <= 0.01) continue;
    const w = 44 + puddleFlash[p] * 20;
    ctx.globalAlpha = a;
    ctx.drawImage(smearSprite, mapX(pd.cx) - w / 2, mapY(pd.cy) - w / 4, w, w / 2);
  }
  ctx.globalAlpha = 1;
  while (pendingPuddle.length) puddleFlash[pendingPuddle.pop()] = 1; // arms NEXT frame

  // L3 ride prefix — the active route, sodium 2.5px.
  ctx.strokeStyle = colors.sodium;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(mapX(RIDE[0][0]), mapY(RIDE[0][1]));
  for (let i = 1; i < RIDE.length && RIDE[i][2] <= tapeTime; i++) ctx.lineTo(mapX(RIDE[i][0]), mapY(RIDE[i][1]));
  ctx.lineTo(hx, hy);
  ctx.stroke();

  if (headMoving || reducedMotion) { // HERO-03; RM: static wedge, final position
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(hx, hy); ctx.rotate(headPt.angleRad);
    ctx.drawImage(wedgeSprite, -20, -80, 160, 160);
    ctx.restore();
    if (!reducedMotion) drawSpokes(hx, hy); // HERO-04 — RM: none drawn
  }

  drawPins(nowMs);
  ctx.restore(); // end drift

  // L0 grain LAST, outside the drift — the grain is the tape, not the city.
  ctx.globalAlpha = grainAlpha;
  ctx.fillStyle = grainPatterns[grainFrame];
  ctx.fillRect(0, 0, cssW, heroH);
  ctx.globalAlpha = 1;
}

/** HERO-04: two counter-rotating 6-segment arcs + a short decaying streak. */
function drawSpokes(hx, hy) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = colors.vapor;
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 2; ring++) {
    const dirSign = ring === 0 ? 1 : -1, r = ring === 0 ? 7 : 10;
    for (let pass = 0; pass < 2; pass++) { // pass 1 = the streak ghost
      const phase = dirSign * (spokePhase - pass * 0.35);
      ctx.globalAlpha = pass === 0 ? 0.4 : 0.14;
      for (let s = 0; s < 6; s++) {
        const a0 = phase + (s * Math.PI) / 3;
        ctx.beginPath(); ctx.arc(hx, hy, r, a0, a0 + 0.28); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawPins(nowMs) {
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    if (p.implodeAtMs >= 0) { // HERO-08: 2 frames of white, then dark
      const age = nowMs - p.implodeAtMs;
      if (age <= DUR_IMPLODE_MS) {
        ctx.fillStyle = colors.flash;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(6 * (1 - age / DUR_IMPLODE_MS), 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else p.implodeAtMs = -1;
      continue;
    }
    if (!p.flashed) continue;

    let scale = 1; // HERO-05 plant wobble
    if (p.plantedAtMs >= 0 && !reducedMotion) {
      const age = nowMs - p.plantedAtMs;
      if (age < DUR_WOBBLE_MS) scale = wobbleScale(age / DUR_WOBBLE_MS);
      else p.plantedAtMs = -1;
    }
    // idle 2px sodium pulse, deterministic phase per pin index
    let alpha = reducedMotion ? 0.9 : 0.55 + 0.45 * Math.sin(nowMs / 460 + i * 1.7);
    if (p.strobeAtMs >= 0) { // drop:photo re-strobe (RM: gentle 150ms bump)
      const age = nowMs - p.strobeAtMs, dur = reducedMotion ? 150 : DUR_STROBE_MS;
      if (age < dur) alpha = Math.max(alpha, 1 - easeFlashDecay(age / dur) * 0.6);
      else p.strobeAtMs = -1;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors.sodiumHot;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.sodium;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Ghost tape fires drop:photo at CHAT pace (R9) — re-strobe the pin. */
function onDropPhoto(payload) {
  if (!payload) return;
  let pin = null;
  for (const p of pins) if (p.id === String(payload.id)) { pin = p; break; }
  if (!pin && payload.tapeTime != null) { // fall back to nearest-in-time
    let bestD = Infinity;
    for (const p of pins) {
      const d = Math.abs(p.tapeTime - payload.tapeTime);
      if (d < bestD) { bestD = d; pin = p; }
    }
  }
  if (!pin) return;
  if (!pin.flashed) { pin.flashed = true; pin.plantedAtMs = reducedMotion ? -1 : clock.now(); }
  pin.strobeAtMs = clock.now();
  if (!reducedMotion) safeFlash(0.12);
  pendingPuddle.push(pin.puddleIdx);
}

function onStateChange(s) {
  // Surface (REC ●/ghost badge) is CSS-only via :root[data-state]; JS only
  // needs the afterhours ambience scalars (02-motion §6, JS-side, no DOM reads).
  if (!s) return;
  afterhoursActive = !!s.afterhoursActive;
  mode = afterhoursActive ? 'afterhours' : 'normal';
  grainAlpha = afterhoursActive ? 0.08 : 0.04;
  grainFps = afterhoursActive ? 8 : 12;
  driftHz = afterhoursActive ? 0.18 : 0.3;
  refreshModeStrings();
}

/**
 * Mount THE ROUTE into its zone root. Called once by main.js (B1).
 * @param {HTMLElement} rootEl the #route zone anchor
 */
export function init(rootEl) {
  root = rootEl;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = mq.matches;
  mq.addEventListener('change', (e) => { reducedMotion = e.matches; });

  buildPins();
  readTokens();
  buildDom();
  makeSprites();
  computeLampIgniteTimes();

  window.addEventListener('resize', () => { needsResize = true; });
  bus.on('drop:photo', onDropPhoto);
  bus.on('state:change', onStateChange);

  // RM covenant: route pre-drawn, pins lit, scrub = instant seek.
  if (reducedMotion) applySeek(tapeDurationS, true, false);

  // Render subscribes FIRST, mirror second — clock subscribers run in
  // insertion order and the mirror must capture the frame just drawn.
  clock.subscribe(tick);
  initMirror({
    stage,
    heroCanvas: cv,
    isReducedMotion: () => reducedMotion,
    getLatestDropSeed: () => {
      let seed = null;
      for (const p of pins) if (p.flashed && p.tapeTime <= tapeTime) seed = p.seed;
      return seed;
    },
  });

  registerDebug({
    /** @param {number} tS tape-s — synchronous: emits tape:seek + re-renders
     *  before returning (assertable in the rAF-dead browser). */
    seek: (tS) => {
      applySeek(tS, true, true);
      if (pendingSeekEmit) { bus.emit('tape:seek', pendingSeekEmit); pendingSeekEmit = null; }
      if (staticCv) render(clock.now(), 0);
    },
    /** @returns {Array<{id:string,tapeTime:number,x:number,y:number,flashed:boolean}>} */
    listPins: () => pins.map((p) => ({ id: p.id, tapeTime: p.tapeTime, x: p.x, y: p.y, flashed: p.flashed })),
  });
}
