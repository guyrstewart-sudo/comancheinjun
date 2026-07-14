/**
 * wall/wall.js — THE WALL: dive-bar polaroids + lineup-poster hierarchy.
 * (OPERATION NIGHTSHIFT, builder B7)
 *
 * WHAT: #wall = 8 frozen legends + the local viewer (once they've earned
 *       anything), loudest to quietest. NIGHT MAYOR gets real neon above
 *       their polaroid; dethroned mayors accrete below, unlit, forever.
 * WHY:  constitution §6 — "the wall is the town's memory, not a scoreboard."
 * HOW:  init(rootEl) builds the shell once; re-renders on a dirty flag
 *       flushed through clock ticks only (CLOCK LAW, no setTimeout). Every
 *       seeded value (tilt/thumbnail/rim phase) is rng-keyed to a stable
 *       entry id — same wall, every load (Determinism Law).
 * GOTCHA: neonSign() (fx/neon.js) returns `{el, wireOn, die, letterCount}`,
 *       not a `letters` array; per-letter groups live inside `.el` as
 *       `<g class="neon-letter">`. normalizeNeonHandle() queries `.neon-letter`
 *       to recover them for WALL-04's per-letter death.
 */

import { t } from '../data/strings.js';
import { storage } from '../core/storage.js';
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { range, rangeInt } from '../core/rng.js';
import { neonSign } from '../fx/neon.js';
import { LEGEND_ENTRIES, RANK_COUNT, getViewerSnapshot, onTabEvents } from './legends.js';

const WALL_NS = 'wall', DEAD_KEY = 'deadMayors';
// WAAPI can't read CSS vars, so these mirror motion.md's --dur-mayor-letter
// / --dur-mayor-stagger / --ease-flash-decay / --dur-rim-breathe verbatim.
const MAYOR_LETTER_MS = 150, MAYOR_STAGGER_MS = 80;
const EASE_FLASH_DECAY = 'cubic-bezier(0.05, 0.9, 0.1, 1)';
const RIM_CYCLE_MS = 4800;
const THROTTLE_MS = 500;         // updates throttle through clock ticks
const RIM_BATCH_THRESHOLD = 40;  // §9 perf note (WALL-01): batch past this

let mode = 'normal';
let reducedMotion = false;
let entries = [];      // legends (live) + local viewer; excludes the seated mayor
let mayor = null;      // {id, name, total} | null
let deadSigns = [];    // lore-dethroned legend(s) + live-session dethronements
let els = {};
let dirty = false, msSinceFlush = 0;
let mayorNeonHandle = null;

const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const markDirty = () => { dirty = true; };
const normalizeStoredDead = (d) => ({ id: d.id, handle: d.name, watts: d.total, isLegend: false, oneLineStory: null });
const wattsIntensity = (w) => Math.min(1, Math.max(0.12, Math.log10(Math.max(w, 1) + 1) / Math.log10(100001)));

// see file GOTCHA for the assumed neonSign() return shape
function normalizeNeonHandle(r) {
  if (r instanceof Element) return { el: r, letters: Array.from(r.querySelectorAll('.neon-letter')) };
  const el = r?.el;
  return { el, letters: r?.letters || (el ? Array.from(el.querySelectorAll('.neon-letter')) : []) };
}

/** Mount into the zone root; append-only (B1's zone heading already lives in #wall). */
export async function init(rootEl) {
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    mq.addEventListener?.('change', (e) => { reducedMotion = e.matches; });
    mode = document.documentElement.dataset.afterhours === 'true' ? 'afterhours' : 'normal';

    buildShell(rootEl);

    const legendDead = LEGEND_ENTRIES.filter((e) => e.dethroned);
    entries = LEGEND_ENTRIES.filter((e) => !e.dethroned);
    let storedDead = [], tabState = null, viewer = null;
    try {
      storedDead = (await storage.get(WALL_NS, DEAD_KEY)) || [];
      tabState = await storage.get('tab', 'state');
      viewer = await getViewerSnapshot();
    } catch { /* storage blocked — legends-only wall this session */ }
    deadSigns = [...legendDead, ...storedDead.map(normalizeStoredDead)];
    mayor = (tabState && tabState.mayor) || null;
    if (viewer) entries.push(viewer);

    bus.on('state:change', handleStateChange);
    // the visitor (re)named themselves — show it on their card immediately
    bus.on('identity:name', ({ name }) => {
      const v = entries.find((e) => e.isViewer);
      if (v) { v.handle = (name || '').trim() || v.rankName || null; markDirty(); }
    });
    // the visitor set/changed their photo — show it on their card (and the
    // mayor marquee if they hold the seat). Stored on the entry so a re-render
    // keeps it even before the next getViewerSnapshot.
    bus.on('identity:avatar', ({ avatar }) => {
      const v = entries.find((e) => e.isViewer);
      if (v) { v.avatar = avatar || null; markDirty(); }
    });
    clock.subscribe(onTick);
    onTabEvents({ onEarn: handleEarn, onRankup: handleRankup, onMayor: handleMayorEvt });
    render();
  } catch (err) {
    console.error('[wall] init failed', err); // one dead lamp doesn't close the bar
  }
}

function buildShell(rootEl) {
  els.body = document.createElement('div');
  els.body.className = 'wall-body';
  els.body.innerHTML =
    `<p class="wall-slate">${esc(t('wall.legendsSlate'))}</p>` +
    `<div class="wall-marquee" hidden></div>` +
    `<ul class="wall-grid" aria-label="${esc(t('aria.wallList'))}"></ul>` +
    `<div class="wall-dead-wrap" hidden><ul class="wall-dead"></ul></div>` +
    `<p class="wall-empty" hidden></p>`;
  rootEl.appendChild(els.body);
  els.marquee = els.body.querySelector('.wall-marquee');
  els.grid = els.body.querySelector('.wall-grid');
  els.deadWrap = els.body.querySelector('.wall-dead-wrap');
  els.dead = els.body.querySelector('.wall-dead');
  els.empty = els.body.querySelector('.wall-empty');
}

/* ---------------------------------------------------------------- events */

function handleEarn(payload) {
  let v = entries.find((e) => e.isViewer);
  if (!v) {
    v = { id: 'visitor:pending', handle: null, watts: 0, rankIndex: 0, rankName: '', isViewer: true, isLegend: false, dethroned: false, sharpieTag: null, oneLineStory: null };
    entries.push(v);
  }
  v.watts = payload.total;
  // Pull the viewer's identity (chosen name + rank) from storage. The snapshot
  // can be null on the very FIRST earn (state not persisted yet), so keep
  // retrying each earn until the card actually has a handle — otherwise a named
  // visitor's card would show blank forever.
  if (!v.handle || v.id === 'visitor:pending') {
    getViewerSnapshot().then((snap) => { if (snap) Object.assign(v, snap); markDirty(); }).catch(() => {});
  }
  markDirty();
}

function handleRankup(payload) {
  const v = entries.find((e) => e.isViewer);
  if (v) { v.rankIndex = payload.rank.index; v.rankName = payload.rank.name; markDirty(); }
}

async function handleMayorEvt(payload) {
  mayor = payload.newMayor;
  if (payload.oldMayor) {
    const rec = { ...payload.oldMayor, dethronedAt: clock.now() };
    try { await storage.set(WALL_NS, DEAD_KEY, ((await storage.get(WALL_NS, DEAD_KEY)) || []).concat(rec)); }
    catch { /* archive is best-effort; the wall still shows it this session */ }
    deadSigns = [...deadSigns, normalizeStoredDead(rec)];
  }
  markDirty();
}

function handleStateChange(payload) {
  const next = payload.afterhoursActive ? 'afterhours' : 'normal';
  if (next !== mode) { mode = next; markDirty(); }
}

/** CLOCK LAW: throttle re-renders through clock ticks, never setTimeout. */
function onTick(deltaMs) {
  if (!dirty) return;
  msSinceFlush += deltaMs;
  if (msSinceFlush >= THROTTLE_MS) { msSinceFlush = 0; dirty = false; render(); }
}

/* --------------------------------------------------------------- render */

function render() {
  els.marquee.hidden = !mayor;
  if (mayor) renderMarquee();

  const list = entries.filter((e) => !mayor || e.id !== mayor.id);
  const showEmpty = list.length === 0 && !mayor;
  els.empty.hidden = !showEmpty;
  if (showEmpty) els.empty.textContent = t('empty.wall', mode);

  const sorted = [...list].sort((a, b) => b.watts - a.watts);
  const batchRim = sorted.length > RIM_BATCH_THRESHOLD;
  els.grid.innerHTML = '';
  sorted.forEach((e) => els.grid.appendChild(cardEl(e, batchRim)));

  els.deadWrap.hidden = deadSigns.length === 0;
  els.dead.innerHTML = '';
  deadSigns.forEach((d) => els.dead.appendChild(deadCardEl(d)));
}

/** One polaroid: seeded thumbnail/tilt, sharpie handle, mono watts, corner rank stamp. */
function cardEl(e, suppressBreathe) {
  const li = document.createElement('li');
  li.className = 'wall-card' + (e.isViewer ? ' is-viewer' : '');
  const breathe = !suppressBreathe && !reducedMotion;
  if (breathe) li.classList.add('fx-rim-breathe');
  li.setAttribute('style',
    `--tilt:${range('wall:tilt:' + e.id, -3, 4).toFixed(1)}deg;` +
    `--flash-pos:${range('wall:tx:' + e.id, 18, 82).toFixed(0)}% ${range('wall:ty:' + e.id, 12, 55).toFixed(0)}%;` +
    `--flash-r:${range('wall:tr:' + e.id, 42, 85).toFixed(0)}%;` +
    `--watts-intensity:${wattsIntensity(e.watts).toFixed(2)};` +
    `--name-scale:${(0.78 + e.rankIndex * 0.16).toFixed(2)}` +
    (breathe ? `;--rim-phase:${rangeInt('wall:rim:' + e.id, 0, RIM_CYCLE_MS)}ms` : ''));
  li.innerHTML =
    `<div class="wall-card__thumb" aria-hidden="true">` +
      (e.avatar ? `<img class="wall-card__photo" src="${esc(e.avatar)}" alt="">` : '') +
    `</div>` +
    `<span class="wall-card__pin" aria-hidden="true"></span>` +
    `<p class="wall-card__handle">${esc(e.handle)}</p>` +
    (e.sharpieTag ? `<p class="wall-card__tag">${esc(e.sharpieTag)}</p>` : '') +
    `<p class="wall-card__watts">${Math.round(e.watts).toLocaleString()} ${esc(t('hud.wattsUnit'))}</p>` +
    `<p class="wall-card__rank">${esc(e.rankName)}</p>`;
  return li;
}

function deadCardEl(d) {
  const li = document.createElement('li');
  li.className = 'wall-dead__item';
  const caption = d.isLegend ? d.oneLineStory : t('dethrone.deadMayorCaption', mode);
  li.innerHTML = `<p class="wall-dead__name">${esc(d.handle)}</p><p class="wall-dead__caption">${esc(caption)}</p>`;
  return li;
}

function renderMarquee() {
  const known = entries.find((e) => e.id === mayor.id);
  const mayorEntry = known || {
    id: mayor.id, handle: mayor.name, watts: mayor.total, rankIndex: RANK_COUNT - 1,
    rankName: t('ranks')[RANK_COUNT - 1].name, isLegend: false, isViewer: false, dethroned: false,
  };
  if (els.marquee.dataset.mayorId !== mayor.id) {
    const had = !!els.marquee.dataset.mayorId;
    els.marquee.dataset.mayorId = mayor.id;
    wireMayorSign(mayorEntry.handle, had);
  }
  const fresh = cardEl(mayorEntry, false);
  fresh.classList.add('wall-card--mayor');
  if (els.marqueeCard) els.marqueeCard.replaceWith(fresh); else els.marquee.appendChild(fresh);
  els.marqueeCard = fresh;
}

/** WALL-03: new mayor's neon wires on (or WALL-04 death-by-filament first, if one held the seat). */
function wireMayorSign(handle, hadPrevious) {
  const handleObj = normalizeNeonHandle(neonSign(handle, { seed: 'mayor:' + handle }));
  const mount = () => {
    let wrap = els.marquee.querySelector('.wall-mayor__sign');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'wall-mayor__sign'; els.marquee.prepend(wrap); }
    wrap.style.setProperty('--tilt', range('wall:mayor-tilt:' + handle, -4, 3).toFixed(1) + 'deg');
    wrap.innerHTML = '';
    wrap.appendChild(handleObj.el);
    handleObj.wireOn(900); // WALL-03: 900ms stroke-dashoffset wire-on (no-op under reduced motion, per neon.js)
    mayorNeonHandle = handleObj;
  };
  if (hadPrevious && mayorNeonHandle) deathByFilament(mayorNeonHandle, mount);
  else mount();
}

/** WALL-04: filaments die letter by letter; dead sign costs zero after (no glow layer left ticking). */
function deathByFilament(handleObj, onComplete) {
  const finish = () => { handleObj.el.classList.remove('fx-sign-buzz'); handleObj.el.querySelector?.('.neon-glow')?.remove(); onComplete(); };
  const rm = reducedMotion;
  const targets = rm ? [handleObj.el] : (handleObj.letters.length ? handleObj.letters : [handleObj.el]);
  Promise.all(targets.map((el, i) =>
    el.animate([{ opacity: 1 }, { opacity: rm ? 0.35 : 0 }], {
      duration: rm ? 150 : MAYOR_LETTER_MS, delay: rm ? 0 : i * MAYOR_STAGGER_MS, easing: EASE_FLASH_DECAY, fill: 'forwards',
    }).finished
  )).then(finish, finish);
}
