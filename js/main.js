/**
 * main.js — boot sequence. (B1 / OPERATION NIGHTSHIFT)
 * WHAT: state.init() → paint B1 strings (nav/signage/door/footer/rules) →
 *       wire door check + scrollspy + signage buzz → mount every zone by
 *       dynamic import (own try/catch each) → select chat adapter →
 *       clock.start() → debug.freeze(). Architecture §10's boot sketch.
 * HOW:  sibling modules (hero/*, bunker/*, tab/*, take/*, wall/*, ghost/*,
 *       fx/*) are imported by path per the architecture tree though this is
 *       a parallel build and they may not exist yet — expected; isolated
 *       per-module try/catch so one dead lamp never closes the bar.
 * GOTCHA: no Date.now/setTimeout/rAF here (clock law) — staggers use CSS
 *       `animation-delay`, not JS timers.
 */

import { CONFIG } from './config.js';
import { bus } from './core/bus.js';
import { clock } from './core/clock.js';
import { storage } from './core/storage.js';
import { t } from './data/strings.js';
import { range } from './core/rng.js';
import * as state from './state.js';
import { freeze as freezeDebug } from './debug.js';
import { badFilamentIndex } from './fx/buzz.js';
import { rippleAt } from './fx/flash.js';

const ZONES = ['route', 'bunker', 'take', 'wall', 'rules']; // string-bank keys
const ANCHOR = { route: 'route', bunker: 'bunker', take: 'take', wall: 'wall', rules: 'code' }; // rules lives at #code

let mode = 'normal';
let currentName = ''; // the visitor's chosen display name (local, auto-remembered)

/**
 * Set the visitor's display name — a lightweight local "account": no password,
 * no Twitch needed, stored in localStorage and auto-loaded next visit. The name
 * flows to THE WALL and chat via the bus; the engine mirrors it into the WATTS
 * identity. Empty = they stay an anonymous ghost.
 */
function setVisitorName(raw) {
  currentName = (raw || '').trim().replace(/\s+/g, ' ').slice(0, 24).trim(); // trim again: a 24-char cut can land mid-space
  try { storage.set('identity', 'name', currentName); } catch (_) { /* private mode */ }
  bus.emit('identity:name', { name: currentName });
  paintIdentityFooter();
}

/** Footer "riding as X · change" — the local sign-in indicator. */
function paintIdentityFooter() {
  const riding = document.getElementById('footer-riding');
  const change = document.getElementById('footer-change-name');
  if (!riding || !change) return;
  riding.textContent = currentName
    // function replacement: a literal string arg would let a name like "$&"
    // be read as a replace-pattern token and mangle the footer copy.
    ? t('footer.ridingAs', mode).replace('{name}', () => currentName)
    : t('footer.ridingGhost', mode);
  change.textContent = currentName ? t('footer.changeAgain', mode) : t('footer.changeName', mode);
}

/* ---------------------------------------------------------- copy paint */

/** One letter per WORD is the designated bad filament (constitution §3;
 *  seeded via fx/buzz.badFilamentIndex — same pete every night). Arming
 *  the buzz animation itself is wireSignageBuzz's job, not paint's. */
function paintSignage(el, text) {
  if (el.dataset.signed === text) return; // already painted this exact text
  el.dataset.signed = text;
  el.textContent = '';
  for (const [w, word] of text.split(' ').entries()) {
    if (w > 0) el.appendChild(document.createTextNode(' '));
    if (!word) continue;
    const target = badFilamentIndex(word);
    for (const [i, ch] of [...word].entries()) {
      if (i === target) {
        const span = document.createElement('span');
        span.className = 'is-bad-filament fx-sign-buzz--bad-filament';
        span.textContent = ch;
        el.appendChild(span);
      } else {
        el.appendChild(document.createTextNode(ch));
      }
    }
  }
}

function fillList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.replaceChildren(...items.map((s) => { const li = document.createElement('li'); li.textContent = s; return li; }));
}

const TEXT_MAP = {
  'skip-link': 'aria.skipToContent',
  'door-headline': 'door.headline',
  'door-btn-good': 'door.btnGood',
  'door-btn-walk': 'door.btnWalk',
  'rules-plate-title': 'rules.plate',
  'rules-bio-title': 'rules.bioTitle',
  'rules-bio': 'rules.bio',
  'rules-closer': 'rules.closer',
  'footer-integrity': 'footer.integrity',
  'footer-signoff': 'footer.signoff',
};

/** Repaint every B1-owned string for the active mode. Safe to call repeatedly. */
function renderStrings() {
  document.title = t('meta.titles.home', mode);
  document.getElementById('meta-description')?.setAttribute('content', t('meta.description', mode));
  document.documentElement.lang = 'en';

  for (const [id, path] of Object.entries(TEXT_MAP)) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(path, mode);
  }

  for (const z of ZONES) {
    const signEl = document.getElementById(`${z}-sign`);
    const subEl = document.getElementById(`${z}-sub`);
    if (signEl) paintSignage(signEl, t(`zones.${z}.sign`, mode));
    if (subEl) subEl.textContent = t(`zones.${z}.sub`, mode);
  }

  const doorBody = document.getElementById('door-body');
  if (doorBody && !doorBody.dataset.walked) doorBody.textContent = t('door.body', mode);
  document.getElementById('door-dialog')?.setAttribute('aria-label', t('aria.doorDialog', mode));
  document.getElementById('site-nav')?.setAttribute('aria-label', t('nav.ariaLabel', mode));

  fillList('rules-code', t('rules.code', mode));
  fillList('rules-stack', t('rules.stack', mode));
  document.getElementById('bicycle-svg')?.setAttribute('aria-label', t('rules.bicycleAlt', mode));

  const ig = document.getElementById('footer-instagram');
  if (ig) { ig.href = CONFIG.SOCIAL.instagram; ig.textContent = t('footer.instagram.label', mode); }
  const fb = document.getElementById('footer-facebook');
  if (fb) { fb.href = CONFIG.SOCIAL.facebook; fb.textContent = t('footer.facebook.label', mode); }

  const nameLabel = document.getElementById('door-name-label');
  if (nameLabel) nameLabel.textContent = t('door.nameLabel', mode);
  const nameInput = document.getElementById('door-name');
  if (nameInput) nameInput.placeholder = t('door.namePlaceholder', mode);
  paintIdentityFooter();
}

/* -------------------------------------------------------------- nav */

function buildNav() {
  const list = document.getElementById('nav-list');
  if (!list) return [];
  const links = t('nav.waypoints', mode).map((wp) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'route-card__link';
    a.href = `#${ANCHOR[wp.id]}`;
    a.dataset.zone = ANCHOR[wp.id];
    a.textContent = wp.label;
    const underline = document.createElement('span');
    underline.className = 'route-card__underline fx-nav-underline';
    underline.setAttribute('aria-hidden', 'true');
    a.appendChild(underline);
    li.appendChild(a);
    list.appendChild(li);
    return a;
  });
  wireScrollspy(links);
  return links;
}

function wireScrollspy(links) {
  if (!('IntersectionObserver' in window) || !links.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      for (const a of links) {
        const active = a.dataset.zone === en.target.id;
        a.classList.toggle('is-active', active);
        a.querySelector('.route-card__underline')?.classList.toggle('is-active', active);
      }
    }
  }, { threshold: 0.5 });
  Object.values(ANCHOR).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* ---------------------------------------------------- signage flicker */

/** The zone signs flicker like sodium streetlamps (client request): a
 *  continuous, mostly-lit flicker with occasional quick dips. Each sign is
 *  seeded to a different phase (negative animation-delay) so no two flicker in
 *  unison. Reduced motion: steady, handled in fx.css. */
function wireSignageBuzz() {
  for (const h of document.querySelectorAll('.plate-heading')) {
    const seed = h.dataset.signed || h.textContent || 'plate';
    h.style.setProperty('--lamp-delay', `-${range('lamp:' + seed, 0, 6).toFixed(2)}s`);
    h.classList.add('fx-lamp-flicker');
  }
}

/** nav-waypoint jump makes the destination sign flicker/buzz on arrival —
 *  restart its lamp animation (a streetlamp catching when you look at it). */
function wireNavReplay() {
  document.getElementById('nav-list')?.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-zone]');
    const head = a && document.getElementById(a.dataset.zone)?.querySelector('.plate-heading');
    if (!head) return;
    for (const anim of head.getAnimations()) {
      if ((anim.animationName || '') === 'fxLampFlicker') anim.currentTime = 0;
    }
  });
}

/* -------------------------------------------------------- door check */

async function wireDoorCheck() {
  const dialog = document.getElementById('door-dialog');
  const good = document.getElementById('door-btn-good');
  const walk = document.getElementById('door-btn-walk');
  const scrim = document.getElementById('global-scrim');
  if (!dialog || !good || !walk) return;

  const nameInput = document.getElementById('door-name');

  const seal = () => {
    storage.set('ui', 'doorChecked', true);
    if (nameInput) setVisitorName(nameInput.value); // claim/keep the local name
    scrim?.classList.remove('is-visible');
    dialog.classList.add('is-closing');
    // Ride the clock, not `transitionend` — the exit fade is decorative and
    // must not gate a functional state change on the render pipeline
    // actually ticking (clock law's whole point: forceTick must be able to
    // drive this exactly like real playback, verification browser included).
    let elapsed = 0;
    const off = clock.subscribe((deltaMs) => {
      elapsed += deltaMs;
      if (elapsed < 300) return;
      off();
      if (dialog.open) dialog.close();
    });
  };

  // GLOBAL-10 spawn table: the door buttons are a sanctioned ripple site —
  // rain hitting the reflection right where the thumb said yes.
  dialog.addEventListener('pointerdown', (e) => {
    if (e.target === good || e.target === walk) {
      const r = dialog.getBoundingClientRect();
      try { rippleAt(e.clientX - r.left, e.clientY - r.top, dialog); } catch (_) { /* decorative */ }
    }
  });

  good.addEventListener('click', seal);
  walk.addEventListener('click', () => {
    const body = document.getElementById('door-body');
    if (!walk.dataset.confirmed) {
      if (body) { body.textContent = t('door.walkExit', mode); body.dataset.walked = '1'; }
      walk.textContent = t('door.btnGood', mode);
      walk.dataset.confirmed = '1';
      return;
    }
    seal();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); seal(); }); // ESC = I'M GOOD

  // footer "name yourself / not you?" reopens the door to (re)claim a name
  document.getElementById('footer-change-name')?.addEventListener('click', () => {
    if (dialog.open || typeof dialog.showModal !== 'function') return;
    if (nameInput) nameInput.value = currentName;
    scrim?.classList.add('is-visible');
    dialog.showModal();
    nameInput?.focus();
  });

  const already = await storage.get('ui', 'doorChecked');
  if (nameInput) nameInput.value = currentName; // prefill on reopen / return
  if (!already && typeof dialog.showModal === 'function') {
    scrim?.classList.add('is-visible');
    dialog.showModal();
  }
}

/* ------------------------------------------------------- reduced motion */

function wireReducedMotion() {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    document.documentElement.dataset.reducedMotion = String(mq.matches);
    storage.set('ui', 'reducedMotion', mq.matches);
  };
  apply();
  mq.addEventListener('change', apply);
}

/* ----------------------------------------------------------- zones */

async function mount(path, rootId, exportName = 'init') {
  try {
    const el = rootId ? document.getElementById(rootId) : undefined;
    const mod = await import(path);
    if (typeof mod[exportName] !== 'function') {
      throw new Error(`no ${exportName}() export — nothing mounted`);
    }
    await mod[exportName](el);
  } catch (err) {
    console.warn(`one lamp went dark tonight (${path}) — the rest of the bar stays open. ${err.message}`);
  }
}

async function mountZones() {
  await Promise.all([
    mount('./hero/route.js', 'route'),
    mount('./bunker/bunker.js', 'bunker'), // bunker mounts its own chat dock internally (B3)
    mount('./tab/receipt.js', 'tab-dock', 'initReceipt'), // receipt boots the engine idempotently (B4)
    mount('./take/gallery.js', 'take'),
    mount('./wall/wall.js', 'wall'),
    mount('./fx/afterhours.js', null),
  ]);
}

/** architecture §4 selection logic: empty handle → demo only; handle set →
 *  Twitch chat + live-detector, Demo still runs whenever surface !== LIVE. */
async function selectAdapters() {
  if (CONFIG.TWITCH_HANDLE) {
    try {
      const { TwitchAdapter } = await import('./tab/adapters/twitch.js');
      new TwitchAdapter().connect();
      const { initLiveDetector } = await import('./tab/live-detector.js');
      initLiveDetector();
    } catch (err) {
      console.warn('the twitch wire never got plugged in —', err.message);
    }
  }
  try {
    const { demoAdapter } = await import('./ghost/demo-adapter.js');
    const sync = (surface) => (surface === 'LIVE' ? demoAdapter.disconnect() : demoAdapter.connect());
    bus.on('state:change', (p) => sync(p.surface));
    sync(state.getSnapshot().surface);
  } catch (err) {
    console.warn('the ghost tape stayed in its sleeve —', err.message);
  }
}

/* -------------------------------------------------------------- boot */

async function boot() {
  state.init();
  mode = state.getSnapshot().afterhoursActive ? 'afterhours' : 'normal';
  try { currentName = (await storage.get('identity', 'name')) || ''; } catch (_) { /* private mode */ }
  renderStrings();
  buildNav();
  wireSignageBuzz();
  wireNavReplay();
  wireReducedMotion();
  await wireDoorCheck();

  // Any surface (the chat-side sign strip, the door, the footer) can REQUEST a
  // name; main.js is the sole writer — it persists + broadcasts 'identity:name'.
  bus.on('identity:set', ({ name }) => setVisitorName(name));

  bus.on('state:change', (payload) => {
    mode = payload.afterhoursActive ? 'afterhours' : 'normal';
    renderStrings();
  });

  await mountZones();
  await selectAdapters();

  clock.start();
  freezeDebug();
}

boot();
