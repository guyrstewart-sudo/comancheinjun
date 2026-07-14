/**
 * take/gallery.js (B6) — the bar-table print scatter. Mounts THE TAKE zone:
 * one seeded ring stain, seeded rotations, a 61/39 two-column layout, every
 * 7th print overlapping its neighbor (constitution §6; motion bible
 * TAKE-01/02). Renders the static BLOTTER roster at mount, then appends
 * live prints as `drop:photo` fires. export init(rootEl) is the zone entry.
 * GOTCHA: everything, incl. the lightbox, mounts inside rootEl — never
 * another zone's subtree. IntersectionObserver fires once per print then
 * unobserves. No rAF/setTimeout anywhere (Clock Law).
 */

import { bus } from '../core/bus.js';
import { t } from '../data/strings.js';
import { range } from '../core/rng.js';
import { loadDrops, getGenerativeRoster, paintPrint } from './prints.js';
import { sacredBanner, perforatedTab } from './banner.js';
import { init as lightboxInit, open as openLightbox } from './lightbox.js';

const PHOTO_W = 480, PHOTO_H = 360;
const PAGE_SIZE = 15; // client: 15 photos, then a SEE MORE button

// single chronological column — newest at top, oldest at bottom (client: strict
// chronological order + no empty columns; a masonry split scrambled both).
let col, announceEl, io, dropCount = 0;
let fullRoster = [], shown = 0, seeMoreBtn = null;

/** el() — tiny DOM factory to keep node construction terse. */
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/** Cut the blotter-acid perforated edge once the button has real layout (the
 *  notches stay round because perforatedTab bakes the box aspect into its
 *  viewBox — see banner.js). Called after image load so the box height is final. */
function applyBlotterMask(btn, seed) {
  const w = btn.offsetWidth, h = btn.offsetHeight; // layout box; transform/opacity don't affect it
  if (!w || !h) return;
  const padPx = parseFloat(getComputedStyle(btn).paddingTop) || w * 0.07;
  const uri = perforatedTab(seed, w / h, padPx / h);
  btn.style.webkitMaskImage = btn.style.maskImage = `url("${uri}")`;
  btn.style.webkitMaskSize = btn.style.maskSize = '100% 100%';
  btn.style.webkitMaskRepeat = btn.style.maskRepeat = 'no-repeat';
}

/** Zone entry point — main.js calls this with the #take root. Async: the real
 *  photo manifest (drops.json) loads first, generative prints are the fallback. */
export async function init(rootEl) {
  lightboxInit(rootEl);

  const table = el('div', 'tt-table');
  const ring = el('div', 'tt-ring', { 'aria-hidden': 'true' });
  ring.style.setProperty('--ring-x', `${range('take:ring:x', 12, 82).toFixed(1)}%`);
  ring.style.setProperty('--ring-y', `${range('take:ring:y', 15, 78).toFixed(1)}%`);
  ring.style.setProperty('--ring-r', `${range('take:ring:r', 46, 78).toFixed(0)}px`);

  col = el('div', 'tt-col');
  table.append(ring, col);

  seeMoreBtn = el('button', 'tt-seemore', { type: 'button', hidden: '' });
  seeMoreBtn.textContent = t('zones.take.seeMore');
  seeMoreBtn.addEventListener('click', showNextPage);

  announceEl = el('div', 'tt-announce', { role: 'status', 'aria-live': 'polite' });
  rootEl.append(table, seeMoreBtn, announceEl);

  fullRoster = (await loadDrops()) || getGenerativeRoster();
  if (fullRoster.length === 0) { table.textContent = t('empty.take'); return; }
  showNextPage(); // first 15 + reveals the SEE MORE button if more remain

  // live ghost-tape drops jump the queue: they mount immediately, on top.
  bus.on('drop:photo', (drop) => {
    fullRoster.unshift({ seed: drop.seed, caption: drop.caption, img: drop.img });
    shown += 1; // keep the pagination window consistent
    mountPrint({ seed: drop.seed, caption: drop.caption, img: drop.img, live: true });
    announceEl.textContent = `${t('aria.print')} ${drop.caption}`;
  });
}

/** Render the next page of prints (PAGE_SIZE), then show/hide SEE MORE. */
function showNextPage() {
  const slice = fullRoster.slice(shown, shown + PAGE_SIZE);
  for (const item of slice) mountPrint(item); // {seed, caption, img?}
  shown += slice.length;
  const remaining = fullRoster.length - shown;
  seeMoreBtn.hidden = remaining <= 0;
  if (remaining > 0) {
    seeMoreBtn.textContent = t('zones.take.seeMore');
    announceEl.textContent = `${slice.length} more prints on the table — ${remaining} still in the box.`;
  } else {
    announceEl.textContent = `${slice.length} more prints — that's the whole roll.`;
  }
}

function mountPrint({ seed, caption, live, img }) {
  dropCount += 1;
  const overlap = dropCount % 7 === 0; // TAKE-02 rhythm break

  const fig = el('figure', `tt-print${overlap ? ' tt-print--overlap' : ''}`);
  fig.style.setProperty('--rot', `${range(`print:rot:${seed}`, -3, 4).toFixed(2)}deg`);

  const btn = el('button', 'tt-print__open', {
    // caption folded in so each print announces distinctly, not 24+ identical labels (A11Y)
    type: 'button', 'aria-label': `${t('aria.print')} ${caption}`,
  });
  btn.addEventListener('click', (ev) => {
    openLightbox({ seed, caption, img, viaKeyboard: ev.detail === 0, triggerEl: btn }); // detail:0 = keyboard activation
  });

  // psychedelic sacred-geometry mat behind the photo (client override) — only
  // the border strip shows around the photo, reading as an ornate glowing frame
  const banner = sacredBanner(seed);
  banner.classList.add('tt-print__banner');
  btn.appendChild(banner);

  // Real drops render the untouched photo at its ORIGINAL size (full frame, no
  // crop — the torn edge is the mat's clip, never the pixels; sacred-photograph
  // law); generative prints paint a canvas.
  let realPhoto = null;
  if (img) {
    realPhoto = el('img', 'tt-print__photo tt-print__photo--real', { alt: '', loading: 'lazy', src: img });
    btn.appendChild(realPhoto);
  } else {
    const canvas = el('canvas', 'tt-print__photo', { 'aria-hidden': 'true' });
    canvas.width = PHOTO_W;
    canvas.height = PHOTO_H;
    paintPrint(canvas.getContext('2d'), PHOTO_W, PHOTO_H, seed);
    btn.appendChild(canvas);
  }

  const cap = el('figcaption', 'tt-print__caption');
  cap.textContent = caption;
  fig.append(btn, cap);

  if (live) col.prepend(fig); // live drops jump to the top (newest first)
  else col.appendChild(fig);  // paged drops append in chronological order

  // cut the perforated blotter edge — after the photo's aspect is known (real
  // images set the button height on load; the generative canvas is 4/3 at once).
  if (realPhoto) {
    if (realPhoto.complete && realPhoto.naturalHeight) applyBlotterMask(btn, seed);
    else realPhoto.addEventListener('load', () => applyBlotterMask(btn, seed), { once: true });
  } else {
    applyBlotterMask(btn, seed);
  }

  if (live) landPrint(fig, btn); // live drops land immediately, no scroll-wait
  else getObserver().observe(fig);
}

function getObserver() {
  if (!io) {
    io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        landPrint(entry.target, entry.target.querySelector('.tt-print__open'));
        io.unobserve(entry.target);
      }
    }, { threshold: 0.15 });
  }
  return io;
}

/** TAKE-01: 30% FLASH POP + DRUNK WOBBLE settle, once per print, never re-triggered. */
function landPrint(fig, btn) {
  fig.classList.add('tt-print--landed');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // CSS RM fallback handles the fade
  btn.classList.add('fx-flash-pop--soft');
  fig.classList.add('fx-drunk-wobble');
}
