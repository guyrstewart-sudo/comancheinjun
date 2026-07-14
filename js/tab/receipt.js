/**
 * tab/receipt.js — the HUD receipt + THE REWIRE. (NIGHTSHIFT, B4)
 *
 * WHAT: Mounts the tab receipt into #tab-dock (B1 places the div inside
 *       #bunker): header, line items printed per tab:earn, ×2/×3 margin
 *       stamps, running WATTS total with micro count-up (BUNKER-06),
 *       perforation growth per stream-hour (BUNKER-05), and the full
 *       REWIRE sequence on tab:rankup (motion bible §5.4 phase table).
 * WHY:  the receipt is the only place the tab is visible; everything else
 *       the engine does is bus traffic.
 * HOW:  All sequencing runs on ONE clock-subscribed scheduler (after(ms,fn)
 *       + a number tween) — zero browser timers, so __NIGHT_DEBUG__.forceTick
 *       drives the whole REWIRE deterministically in the rAF-dead browser.
 *       Visual easing lives in tab.css (CSS animations are clock-law
 *       exempt); JS only flips classes and tweens the counter text.
 * GOTCHA: The REWIRE dim uses the receipt's OWN overlay backdrop, not the
 *       shared .fx-scrim/NightFX.scrim the motion bible sketches — B4's
 *       sanctioned fx imports are flashPop + neonSign only (swarm order).
 *       Flagged in the build report; swapping to NightFX.scrim later is a
 *       ~6-line change confined to onRankup/cleanupOverlay.
 */
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { t } from '../data/strings.js';
import { registerDebug } from '../debug.js';
import { flashPop } from '../fx/flash.js';
import { neonSign } from '../fx/neon.js';
import { initTabEngine, getTab, getRank, stringsMode } from './engine.js';

/* Motion-bible numbers (02-motion.md §2.1 / §5.4) — JS-side copies because
 * B4 has no sanctioned import of the fx token module. IDs in comments. */
const DUR_WATTS_TICK_MS = 260;    // BUNKER-06
const DUR_REWIRE_COUNTUP_MS = 480; // BUNKER-07 phase 5
const REWIRE = { sign: 120, pop: 820, shake: 868, count: 1028, release: 1928, cleanup: 2128, toastOut: 5028 };
const TOAST_HOLD_MS = 4000;
const MAX_LINES = 30;

const RM = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {Array<{at:number, fn:() => void}>} clock-driven one-shot timers */
let pending = [];
/** @type {{el:HTMLElement,from:number,to:number,t0:number,dur:number,done?:() => void}|null} */
let tween = null;

function after(ms, fn) { const h = { at: clock.now() + ms, fn }; pending.push(h); return h; }
function cancelAll(handles) { pending = pending.filter((p) => !handles.includes(p)); }

clock.subscribe((deltaMs, now) => {
  if (pending.length) {
    const due = pending.filter((p) => now >= p.at);
    if (due.length) {
      pending = pending.filter((p) => now < p.at);
      for (const p of due) { try { p.fn(); } catch (err) { console.error('[receipt]', err); } }
    }
  }
  if (tween) {
    const p = Math.min(1, (now - tween.t0) / tween.dur);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic (recon §4)
    tween.el.textContent = String(Math.round(tween.from + (tween.to - tween.from) * e));
    if (p >= 1) { const done = tween.done; tween = null; if (done) done(); }
  }
});

/** Tween a counter's text old→new; RM snaps instantly (dignity path). */
function countTo(el, from, to, durMs, done) {
  if (RM() || durMs <= 0 || from === to) { el.textContent = String(to); if (done) done(); return; }
  tween = { el, from, to, t0: clock.now(), dur: durMs, done };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* One of 4 canonical torn-edge paths, selected by hour % 4 (Determinism Law). */
const PERF_PATHS = [
  'M0 5 L14 3 L26 6 L40 2 L57 5 L72 3 L90 6 L108 2 L124 5 L141 3 L158 6 L176 3 L200 5',
  'M0 3 L18 6 L33 2 L52 5 L69 3 L88 6 L102 3 L121 5 L138 2 L157 6 L174 4 L200 3',
  'M0 4 L11 6 L29 3 L45 6 L63 2 L80 5 L99 3 L115 6 L133 3 L150 5 L169 2 L186 6 L200 4',
  'M0 6 L16 3 L31 5 L49 2 L66 6 L84 4 L101 2 L119 5 L136 3 L155 6 L172 3 L190 5 L200 4',
];

let root = null, linesEl, totalEl, stampEl, perfEl, overlay, panel, signHost, toastEl;
let shownTotal = 0, prevShown = 0, minuteCount = 0, hourCount = 0;
let rewireActive = false;
/** @type {Array<{at:number, fn:() => void}>} handles belonging to the active REWIRE */
let seq = [];

function buildDom(mount) {
  const rc = el('section', 'tab-receipt');
  rc.setAttribute('aria-label', t('aria.hudReceipt'));
  const head = el('header', 'tab-receipt__head');
  for (const line of t('hud.receipt.header')) head.append(el('div', 'tab-receipt__head-line', line));
  stampEl = el('div', 'tab-receipt__stamp', t('hud.receipt.stamp', stringsMode()));
  linesEl = el('ol', 'tab-receipt__lines');
  linesEl.setAttribute('role', 'log');
  const totalRow = el('div', 'tab-receipt__total');
  totalEl = el('span', 'tab-receipt__total-num', '0');
  totalRow.append(totalEl, el('span', 'tab-receipt__total-unit', t('hud.wattsUnit')));
  perfEl = el('div', 'tab-perf');
  const foot = el('footer', 'tab-receipt__foot', t('hud.receipt.footer'));
  rc.append(head, stampEl, linesEl, totalRow, perfEl, foot);

  overlay = el('div', 'rewire');
  overlay.hidden = true;
  const backdrop = el('div', 'rewire__backdrop');
  panel = el('div', 'rewire__panel');
  signHost = el('div', 'rewire__sign');
  panel.append(signHost);
  overlay.append(backdrop, panel);

  toastEl = el('div', 'tab-toast');
  toastEl.hidden = true;
  toastEl.setAttribute('role', 'status');

  mount.append(rc, overlay, toastEl);
}

/* ------------------------------------------------------------------ */
/* line items                                                          */
/* ------------------------------------------------------------------ */

function onEarn(e) {
  if (e.lineItem) {
    // engine formats lineItem as 'LABEL[ · GHOST TAPE] .... N' — split for layout
    const dots = e.lineItem.lastIndexOf(' .... ');
    const li = el('li', 'tab-line');
    li.append(
      el('span', 'tab-line__label', dots >= 0 ? e.lineItem.slice(0, dots) : e.lineItem),
      el('span', 'tab-line__dots'),
      el('span', 'tab-line__amt', String(e.delta)),
    );
    if (e.multiplier) {
      // ×2/×3 margin stamp — the bartender comped you (constitution §6)
      li.append(el('span', 'tab-line__stamp', e.multiplier.split(' ').pop()));
    }
    linesEl.append(li);
    while (linesEl.children.length > MAX_LINES) linesEl.firstChild.remove();
  }
  prevShown = shownTotal;
  if (!rewireActive) {
    countTo(totalEl, shownTotal, e.total, DUR_WATTS_TICK_MS); // BUNKER-06 micro tick
  }
  shownTotal = e.total;
}

/* ------------------------------------------------------------------ */
/* perforation — one torn row per stream-hour (BUNKER-05)              */
/* ------------------------------------------------------------------ */

function addPerforation(hour) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 8');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PERF_PATHS[hour % 4]);
  path.setAttribute('class', 'tab-perf__seg');
  svg.append(path);
  perfEl.append(svg);
}

/* ------------------------------------------------------------------ */
/* toast                                                               */
/* ------------------------------------------------------------------ */

function showToast(text) {
  if (!text) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  void toastEl.offsetWidth; // restart the CSS transition from its hidden state
  toastEl.classList.add('is-in');
}

function hideToast() {
  toastEl.classList.remove('is-in');
  after(300, () => { toastEl.hidden = true; });
}

/* ------------------------------------------------------------------ */
/* THE REWIRE (BUNKER-07) — phase offsets are the motion bible's law   */
/* ------------------------------------------------------------------ */

/**
 * Build the rank's neon sign via B8, or a lawful text-plate fallback.
 * Returns { node, wireOn } — wireOn is B8's phase-2 dash draw-in (no-op
 * for the fallback plate; neon.js no-ops it itself under reduced motion).
 */
function makeSign(name, preLit) {
  const noop = () => {};
  try {
    // label: without it B8 renders the sign aria-hidden — the neon IS the
    // only place the rank name appears, so screen readers must get it too
    const out = neonSign(name, { seed: 'rank:' + name, label: name, reducedMotion: preLit });
    if (out instanceof Element) return { node: out, wireOn: noop };
    if (out && out.el instanceof Element) {
      return { node: out.el, wireOn: typeof out.wireOn === 'function' ? out.wireOn : noop };
    }
  } catch (err) {
    console.error('[receipt] neonSign unavailable, falling back:', err);
  }
  return { node: el('div', 'rewire__fallback' + (preLit ? '' : ' fx-sign-buzz'), name), wireOn: noop };
}

function cleanupOverlay() {
  panel.classList.remove('fx-rewire-shake');
  totalEl.classList.remove('fx-drunk-wobble');
  signHost.textContent = '';
  overlay.classList.remove('is-dim', 'is-release', 'is-rm');
  overlay.hidden = true;
  rewireActive = false;
}

/** Law 4 (interruptibility): a second rank-up mid-sequence snap-finishes the first. */
function snapFinish() {
  if (!seq.length && !rewireActive) return;
  cancelAll(seq);
  seq = [];
  tween = null;
  cleanupOverlay();
  hideToast();
  shownTotal = getTab().total;
  totalEl.textContent = String(shownTotal);
}

function onRankup(ev) {
  snapFinish();
  rewireActive = true;
  const defs = t('ranks');
  const rankDef = defs[ev.rank.index] || { name: ev.rank.name, toast: '' };
  overlay.hidden = false;

  if (RM()) {
    // Dignity path (motion §8): sign lit instantly, dim as instant set,
    // no flash, no shake, counter snaps, toast still holds its 4 seconds.
    overlay.classList.add('is-rm', 'is-dim');
    signHost.append(makeSign(rankDef.name, true).node);
    totalEl.textContent = String(ev.total);
    shownTotal = ev.total;
    showToast(rankDef.toast);
    seq = [
      after(REWIRE.cleanup, cleanupOverlay),
      after(TOAST_HOLD_MS, hideToast),
    ];
    return;
  }

  void overlay.offsetWidth; // ensure the 120ms dim transition runs from 0
  overlay.classList.add('is-dim');
  const startFrom = prevShown;
  seq = [
    after(REWIRE.sign, () => {
      const sign = makeSign(rankDef.name, false);
      signHost.append(sign.node);
      // phase 2 WIRE (motion §5.4): 700ms dash draw-in + bad-filament
      // misfires — duration is neon.js's own token default, ending at pop
      try { sign.wireOn(); } catch (err) { console.error('[receipt] wireOn:', err); }
    }),
    after(REWIRE.pop, () => { try { flashPop(1); } catch (err) { console.error('[receipt] flashPop:', err); } }),
    after(REWIRE.shake, () => { panel.classList.add('fx-rewire-shake'); }),
    after(REWIRE.count, () => {
      countTo(totalEl, startFrom, ev.total, DUR_REWIRE_COUNTUP_MS, () => {
        totalEl.classList.add('fx-drunk-wobble'); // phase 6 LAND
      });
      shownTotal = ev.total;
      showToast(rankDef.toast);
    }),
    after(REWIRE.release, () => { overlay.classList.add('is-release'); overlay.classList.remove('is-dim'); }),
    after(REWIRE.cleanup, cleanupOverlay),
    after(REWIRE.toastOut, hideToast),
  ];
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

/**
 * Mount the receipt HUD. Call with the #tab-dock element (B1 places it in
 * #bunker; B3 never touches it). Idempotently boots the engine first.
 * @param {HTMLElement|null} mount
 */
export function initReceipt(mount) {
  if (!mount || root) return;
  root = mount;
  initTabEngine(); // idempotent; fire-and-forget hydration
  buildDom(mount);

  bus.on('tab:earn', onEarn);
  bus.on('tab:rankup', onRankup);
  bus.on('state:change', () => { stampEl.textContent = t('hud.receipt.stamp', stringsMode()); });
  bus.on('clock:minute', () => {
    minuteCount += 1;
    if (minuteCount >= 60) { minuteCount = 0; hourCount += 1; addPerforation(hourCount); }
  });
  // hydration is async — sync the displayed total on the next clock tick
  after(0, () => { shownTotal = getTab().total; prevShown = shownTotal; totalEl.textContent = String(shownTotal); });

  try { registerDebug({ getTab, getRank }); }
  catch (err) { console.error('[receipt] registerDebug failed:', err); }
}
