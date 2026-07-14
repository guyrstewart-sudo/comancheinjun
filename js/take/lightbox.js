/**
 * take/lightbox.js (B6) — the interrogation lamp. Opening a print dims the
 * room via B1's shared scrim (fx/flash.js scrim()), lays the photo at its
 * ORIGINAL size on a psychedelic sacred-geometry banner, and hands it over
 * already lit — arrow keys / horizontal drag ride the brightness UP or DOWN
 * (motion bible TAKE-03..05; ruling R3 — brightness is the one sanctioned
 * filter on a photo). Closes on ESC, on a click anywhere off the photo, or
 * via the big X on the banner. init(rootEl) once from gallery.js.
 * GOTCHA: no setTimeout/rAF (Clock Law) — close waits on the scrim
 * Animation's real `.finished` promise, never a timer. Brightness starts at
 * 1.0 (the photo as shot) for everyone — client request 2026-07-14.
 */

import { t } from '../data/strings.js';
import { paintPrint } from './prints.js';
import { sacredBanner, perforatedTab } from './banner.js';
import { scrim } from '../fx/flash.js';

const GEN_W = 480, GEN_H = 360;             // generative-print canvas size
const BRIGHT_MIN = 0.25, BRIGHT_MAX = 1.9;  // brightness travel (1.0 = as shot)
const BRIGHT_STEP = 0.12;

let container = null, root = null, frame = null, photoEl = null;
let bannerEl = null, captionEl = null, closeBtn = null;
let bright = 1, lastTrigger = null;
let dragging = false, dragStartX = 0, dragStartBright = 1;
let inertedEls = [];
let frameMaskSeed = null, frameMaskResize = null; // blotter edge, reapplied on resize

const clamp = (v) => Math.max(BRIGHT_MIN, Math.min(BRIGHT_MAX, v));

/** Cut the perforated blotter edge on the lightbox frame at its current aspect.
 *  The frame's aspect changes with the viewport (photo is max-w/h bound), so this
 *  is re-run on resize to keep the notches round. */
function applyFrameMask() {
  if (!frame || !frameMaskSeed) return;
  const w = frame.offsetWidth, h = frame.offsetHeight;
  if (!w || !h) return;
  const padPx = parseFloat(getComputedStyle(frame).paddingTop) || w * 0.03;
  const uri = perforatedTab(frameMaskSeed, w / h, padPx / h);
  frame.style.webkitMaskImage = frame.style.maskImage = `url("${uri}")`;
  frame.style.webkitMaskSize = frame.style.maskSize = '100% 100%';
  frame.style.webkitMaskRepeat = frame.style.maskRepeat = 'no-repeat';
  // Size the spinning mandala to ALWAYS cover this frame as it rotates: a
  // rectangle of aspect `a` needs scale ≥ √(1+a²) to cover its own box at every
  // angle; +12% margin kills sub-pixel seams. No corner gap ever shows the page.
  if (bannerEl) {
    const a = Math.max(w / h, h / w);
    bannerEl.style.setProperty('--banner-scale', (Math.sqrt(1 + a * a) * 1.12).toFixed(3));
  }
}

function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

export function init(rootEl) { container = rootEl; }

function ensureRoot() {
  if (root) return root;

  root = el('div', 'tt-lightbox', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tt-lightbox-caption' });
  root.hidden = true;

  const stage = el('div', 'tt-lightbox__stage');
  const cone = el('div', 'tt-lightbox__cone', { 'aria-hidden': 'true' });
  frame = el('div', 'tt-lightbox__frame'); // banner + photo mount here per-open

  closeBtn = el('button', 'tt-lightbox__close', { type: 'button', 'aria-label': t('aria.closeLightbox') });
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  captionEl = el('p', 'tt-lightbox__caption', { id: 'tt-lightbox-caption' });
  const hint = el('p', 'tt-lightbox__hint');
  hint.textContent = t('aria.developScrub');

  stage.append(cone, frame, closeBtn);
  root.append(stage, captionEl, hint);

  root.addEventListener('keydown', onKeydown);
  // click anywhere that isn't the photo (backdrop, banner mat, caption) closes
  root.addEventListener('pointerdown', (ev) => {
    if (photoEl && (ev.target === photoEl || photoEl.contains(ev.target))) return; // photo = scrub, not close
    if (ev.target === closeBtn) return; // its own handler closes
    close();
  });

  (container || document.body).appendChild(root);
  return root;
}

function setBright(v, eased) {
  bright = clamp(v);
  if (photoEl) {
    photoEl.classList.toggle('tt-lightbox__photo--snap', !!eased);
    photoEl.style.setProperty('--bright', String(bright));
    photoEl.setAttribute('aria-valuenow', String(Math.round(bright * 100)));
  }
}

/** A11Y: hide everything outside the dialog from AT while open (see original). */
function setBackgroundInert(on) {
  if (on) {
    inertedEls = [];
    let node = root;
    while (node && node !== document.body && node.parentNode) {
      const parent = node.parentNode;
      for (const sib of parent.children) {
        if (sib !== node && !sib.hasAttribute('inert')) { sib.setAttribute('inert', ''); inertedEls.push(sib); }
      }
      node = parent;
    }
  } else {
    for (const sib of inertedEls) sib.removeAttribute('inert');
    inertedEls = [];
  }
}

/** @param {{seed:string, caption:string, img?:string, triggerEl?:Element}} o */
export function open({ seed, caption, img, triggerEl }) {
  ensureRoot();
  lastTrigger = triggerEl || document.activeElement;

  // fresh banner + photo each open; clear any stale mask so a previous seed's
  // shape never flashes at the wrong aspect before the new one is applied
  frame.textContent = '';
  frame.style.webkitMaskImage = frame.style.maskImage = '';
  bannerEl = sacredBanner(seed);
  bannerEl.classList.add('tt-lightbox__banner');
  frame.appendChild(bannerEl);

  if (img) {
    photoEl = el('img', 'tt-lightbox__photo', { alt: '', src: img });
  } else {
    photoEl = el('canvas', 'tt-lightbox__photo', { 'aria-hidden': 'false' });
    photoEl.width = GEN_W;
    photoEl.height = GEN_H;
    paintPrint(photoEl.getContext('2d'), GEN_W, GEN_H, seed);
  }
  photoEl.classList.add('tt-lightbox__photo');
  photoEl.setAttribute('role', 'slider');
  photoEl.setAttribute('aria-label', t('aria.developScrub'));
  photoEl.setAttribute('aria-valuemin', String(Math.round(BRIGHT_MIN * 100)));
  photoEl.setAttribute('aria-valuemax', String(Math.round(BRIGHT_MAX * 100)));
  photoEl.tabIndex = 0;
  photoEl.style.touchAction = 'none'; // own the horizontal drag (TAKE-04)
  photoEl.addEventListener('pointerdown', onPointerDown);
  frame.appendChild(photoEl);

  captionEl.textContent = caption;
  setBright(1, false); // client request: every photo starts fully lit

  root.hidden = false; // show FIRST so the frame has real layout below
  setBackgroundInert(true);
  scrim(0.7, 280);
  closeBtn.focus();

  // Cut the perforated blotter edge + size the spinning mandala to cover the
  // frame — only valid now the frame is visible (offsetWidth/Height are real).
  // A cached <img> is already loaded; otherwise wait for load, then reapply on
  // resize so the notches stay round and the mandala keeps covering.
  frameMaskSeed = seed;
  frameMaskResize = () => applyFrameMask();
  if (photoEl.tagName === 'IMG' && !(photoEl.complete && photoEl.naturalHeight)) {
    photoEl.addEventListener('load', frameMaskResize, { once: true });
  } else {
    applyFrameMask();
  }
  window.addEventListener('resize', frameMaskResize);
}

function close() {
  if (!root || root.hidden) return;
  const finish = () => { root.hidden = true; };
  const anim = scrim(0, 280);
  if (anim && anim.finished) anim.finished.then(finish).catch(finish); else finish();
  setBackgroundInert(false);
  if (frameMaskResize) { window.removeEventListener('resize', frameMaskResize); frameMaskResize = null; }
  frameMaskSeed = null;
  if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
}

function onKeydown(ev) {
  if (ev.key === 'Escape') { close(); return; }
  if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { ev.preventDefault(); setBright(bright + BRIGHT_STEP, true); return; }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { ev.preventDefault(); setBright(bright - BRIGHT_STEP, true); return; }
  if (ev.key === 'Tab') { // trap: only two stops, photo <-> close
    if (ev.shiftKey && document.activeElement === photoEl) { ev.preventDefault(); closeBtn.focus(); }
    else if (!ev.shiftKey && document.activeElement === closeBtn) { ev.preventDefault(); photoEl.focus(); }
  }
}

function onPointerDown(ev) {
  dragging = true;
  dragStartX = ev.clientX;
  dragStartBright = bright;
  photoEl.classList.remove('tt-lightbox__photo--snap');
  photoEl.setPointerCapture(ev.pointerId);
  photoEl.addEventListener('pointermove', onPointerMove);
  photoEl.addEventListener('pointerup', onPointerUp, { once: true });
  photoEl.addEventListener('pointercancel', onPointerUp, { once: true });
}

function onPointerMove(ev) {
  if (!dragging) return;
  // drag right = brighter; full width of the photo spans the whole travel
  const span = photoEl.clientWidth || GEN_W;
  setBright(dragStartBright + ((ev.clientX - dragStartX) / span) * (BRIGHT_MAX - BRIGHT_MIN), false);
}

function onPointerUp() {
  dragging = false;
  photoEl.removeEventListener('pointermove', onPointerMove);
}
