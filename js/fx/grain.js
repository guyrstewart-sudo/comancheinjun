/**
 * fx/grain.js — grain tile factory + overlay. (B8)
 * WHAT: 8 pre-rendered 256px seeded noise tiles cycled at 12fps (8fps
 *       afterhours) on a clock subscription. attachGrain(el) drops a
 *       canvas overlay into a positioned host; getTiles() hands raw tiles
 *       to canvas engines that blit grain themselves.
 * WHY:  grain is rendered ONCE (constitution §5 layer 0), never per frame;
 *       seeds 'grain:tile-N' make it the same noise every night. Alpha/fps
 *       read fx/afterhours getScales() at tile cadence (4%→8%, 12→8fps).
 * GOTCHA: contracts.js declares NO GrainAPI — these exports are documented
 *       pending orchestrator blessing for B2 (flagged in self-report).
 *       Grain CONTINUES under reduced motion (bible §8 — ambient texture,
 *       not vestibular). Canvas sized in CSS pixels, no DPR scaling: 1:1
 *       grain is the honest texture at half the fill cost.
 */

import { clock } from '../core/clock.js';
import { makeRng } from '../core/rng.js';
import { getScales } from './afterhours.js';

const TILE_PX = 256;
const TILE_COUNT = 8;

/** @type {HTMLCanvasElement[]|null} built once, shared by every consumer */
let tiles = null;

function buildTiles() {
  tiles = [];
  for (let t = 0; t < TILE_COUNT; t++) {
    const r = makeRng('grain:tile-' + t);
    const cv = document.createElement('canvas');
    cv.width = TILE_PX;
    cv.height = TILE_PX;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (r() * 255) | 0; // grayscale noise; alpha applied at draw time
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tiles.push(cv);
  }
  return tiles;
}

/** The 8 seeded tiles (lazy-built), each 256×256. */
export function getTiles() {
  return tiles || buildTiles();
}

/**
 * Attach a cycling grain overlay to a positioned element.
 * @param {Element} [target] host (position:relative etc.); default body
 * @returns {{el: HTMLCanvasElement, detach: () => void}}
 */
export function attachGrain(target) {
  const host = target || document.body;
  const cv = document.createElement('canvas');
  cv.className = 'fx-grain';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  const pats = getTiles().map((t) => ctx.createPattern(t, 'repeat'));
  let idx = 0;
  let accMs = 0;
  let w = 0;
  let h = 0;

  function draw() {
    // size check rides the ≤12fps tile cadence, not a per-frame loop,
    // and is only acted on when changed
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    if (cw !== w || ch !== h) { w = cw; h = ch; cv.width = w; cv.height = h; }
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = getScales().grainAlpha;
    ctx.fillStyle = pats[idx];
    ctx.fillRect(0, 0, w, h);
  }

  const unsub = clock.subscribe((deltaMs) => {
    accMs += deltaMs;
    const frameMs = 1000 / getScales().grainFps;
    if (accMs < frameMs) return;
    accMs %= frameMs; // at most one redraw per tick, even across forceTick chunks
    idx = (idx + 1) % TILE_COUNT;
    draw();
  });

  draw(); // first paint now — no blank frame while waiting on a tick
  return {
    el: cv,
    detach() { unsub(); cv.remove(); },
  };
}
