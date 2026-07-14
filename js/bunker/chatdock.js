/**
 * bunker/chatdock.js — THE RAIL: chat rendering + input. (NIGHTSHIFT, B3)
 *
 * WHAT: renders chat:message/chat:system/chat:status onto a capped, pruned
 *       log, plus the send form. Adapter-agnostic — only knows the bus.
 * WHY:  architecture §4 — adapters publish, consumers render.
 * HOW:  initChatDock(hostEl) builds the DOM once, subscribes to the bus,
 *       and drains an internal queue on clock ticks (never per-message DOM
 *       writes inside the bus handler). Bootstraps ghost/live copy off
 *       <html data-state> since state:change already fired once before
 *       zones mount (architecture §10 boot order).
 * GOTCHA: never emits chat:message — the event catalog (architecture §3)
 *       lists only TwitchAdapter/DemoAdapter as emitters. A ghost-mode
 *       send is a LOCAL echo + system note only ("your words stay on your
 *       side of the glass") — see handleGhostSubmit. Flagged in self-report.
 */

import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { makeRng } from '../core/rng.js';
import { storage } from '../core/storage.js';
import { t } from '../data/strings.js';

const STORM_MSGS_PER_SEC = 8; // P5 tests this exact number — motion bible BUNKER-01
const STORM_WINDOW_MS = 500;
const STORM_COUNT_THRESHOLD = (STORM_MSGS_PER_SEC * STORM_WINDOW_MS) / 1000;
const MAX_ROWS = 150; // DOM cap, prune oldest

let currentMode = 'normal';
let isLiveSurface = false;
let localName = ''; // the visitor's chosen name (their line shows it, not 'you')
let editingSign = false; // "change" clicked while named → show the input again
let logEl, formEl, inputEl, sendEl, errorBannerEl, emptyStateEl;
let signWrap, signForm, signLabel, signInput, signGo, signHint, signAsEl, signAsLabel, signNameEl, signChangeEl;
let rows = [];
let queue = [];
let recentRenderTimes = []; // clock.now() of recent renders, rolling storm window

// Deterministic per-user color, ignoring any hex the adapter reports — the
// accent ceiling is a site law, not a per-streamer setting: every handle
// is re-derived into a low-saturation tint that can never read as sodium.
// Hue is also clamped to the warm/sodium band (constitution §2 bans
// blue/red/purple/cyan outright) — same law ghost/tape.js's WARM_HUES
// enforces for its seeded cast; this is the one surface with live,
// user-driven handles, so the clamp has to happen here at derive-time.
function deriveHandleColor(seedKey) {
  const rnd = makeRng('bunker-handle-color:' + seedKey);
  const hue = 15 + Math.floor(rnd() * 45); // 15-60deg, amber-to-gold only
  const sat = 22 + Math.floor(rnd() * 18); // 22-40%, well under sodium's ~100%
  const light = 68 + Math.floor(rnd() * 14); // 68-82%, reads like vapor
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function clearEmptyState() {
  if (emptyStateEl) { emptyStateEl.remove(); emptyStateEl = null; }
}

function appendRow(row) {
  clearEmptyState();
  logEl.appendChild(row);
  rows.push(row);
  if (rows.length > MAX_ROWS) rows.shift().remove();
}

// Reading scrollHeight forces a synchronous layout flush — call this once
// per batch (drainQueue, after its splice loop) or once per standalone row
// (renderSystem), never inside a per-row loop. A 200-message burst used to
// force up to 200 reflows here; now it forces one.
function scrollToBottom() {
  logEl.scrollTop = logEl.scrollHeight;
}

// storming skips the entrance animation (motion bible: at/above 8/sec, free).
function renderMessage(msg, storming) {
  const row = document.createElement('div');
  row.className = 'bunker-chat-msg' + (msg.isGhost ? ' is-ghost' : '') + (storming ? '' : ' bunker-chat-msg--enter');

  const handle = document.createElement('span');
  handle.className = 'bunker-chat-handle';
  handle.style.color = deriveHandleColor(msg.user.login);
  handle.textContent = msg.user.displayName;

  const text = document.createElement('span');
  text.className = 'bunker-chat-text';
  text.textContent = msg.text;

  const ts = document.createElement('time');
  ts.className = 'bunker-chat-ts';
  ts.textContent = clock.hhmm(); // render-time stamp — msg.ts has no HH:MM conversion API
  row.append(handle, text, ts);
  appendRow(row);
}

// DOM-only half of renderSystem, reused by drainQueue so a queued notice
// (see handleGhostSubmit) renders through the exact same row-building path
// as a live chat:system event — no separate copy of the markup to drift.
function renderSystemRow(sys) {
  const row = document.createElement('div');
  row.className = 'bunker-chat-system bunker-chat-system--' + sys.kind;
  row.textContent = sys.text;
  appendRow(row);
  if (sys.kind === 'disconnect') showError();
  else if (sys.kind === 'connect') hideError();
}

function renderSystem(sys) {
  renderSystemRow(sys);
  scrollToBottom();
}

function showError() {
  errorBannerEl.textContent = t('errors.chatLost', currentMode);
  errorBannerEl.hidden = false;
}
function hideError() {
  errorBannerEl.hidden = true;
}

// Queuing (vs. rendering inside the bus handler) keeps a 200-message replay
// burst off one call stack frame; storm status recomputes per message as
// the batch drains, so a burst falls into the zero-animation path live.
function drainQueue() {
  if (!queue.length) return;
  const nowMs = clock.now();
  recentRenderTimes = recentRenderTimes.filter((ts) => nowMs - ts < STORM_WINDOW_MS);
  for (const item of queue.splice(0, queue.length)) {
    if (item && item.__notice) {
      renderSystemRow(item.sys); // drains in emission order, after the message it annotates
      continue;
    }
    renderMessage(item, recentRenderTimes.length >= STORM_COUNT_THRESHOLD);
    recentRenderTimes.push(nowMs);
  }
  scrollToBottom();
}

function applyState(surfaceLower, afterhoursActive) {
  currentMode = afterhoursActive ? 'afterhours' : 'normal';
  isLiveSurface = surfaceLower === 'live';
  inputEl.placeholder = isLiveSurface ? t('chat.placeholderLive', currentMode) : t('chat.placeholderGhost', currentMode);
  // Anonymous Twitch IRC (arch §4) can't publish PRIVMSG — LIVE has nowhere
  // to send a typed message. Disable the control itself rather than accept
  // input and drop it silently; the placeholder still reads as an invite,
  // but a disabled field can't be typed into so nothing is lost unseen.
  inputEl.disabled = isLiveSurface;
  sendEl.disabled = isLiveSurface;
  sendEl.textContent = t('chat.send', currentMode);
  if (emptyStateEl) emptyStateEl.textContent = t('empty.chat', currentMode);
  if (!errorBannerEl.hidden) errorBannerEl.textContent = t('errors.chatLost', currentMode);
  applySignStrings(); // strip copy follows mode too (no-op until built)
}

// Integration ruling: ghost-mode typing rides the bus as a counted 'debug'
// message (hanging out feeds the sign — B4 credits 'debug', never 'ghost'),
// so the dock renders it via its own chat:message subscription — no local
// double-render. The honest ghost note still prints beneath.
function handleGhostSubmit(value) {
  const shown = localName || 'you';
  bus.emit('chat:message', {
    id: 'local-' + clock.now(),
    user: { login: localName ? localName.toLowerCase().replace(/\s+/g, '_') : 'you', displayName: shown, color: null, badges: '' },
    text: value,
    emotes: [],
    ts: clock.now(),
    source: 'debug',
    isGhost: false,
  });
  // Queue the note (rather than rendering it synchronously) so it drains on
  // the same clock tick as the chat:message above and lands after it in the
  // log — the notice annotates that message, so it must not out-race it.
  queue.push({ __notice: true, sys: { text: t('chat.ghostLocalNote', currentMode), ts: clock.now(), kind: 'notice' } });
}

/* ---------------------------------------------------------- the sign-in strip
 * A lightweight local "account": pick a name (no password, no Twitch), and it
 * rides just above the chat box so you can claim it right where you talk. The
 * name is a REQUEST — chatdock never writes identity itself; it emits
 * 'identity:set' and main.js (the sole identity writer) persists + broadcasts
 * 'identity:name' back, which every surface (footer, wall, this strip, chat
 * handle) listens to. Keeps one writer, zero drift. */
function buildSign() {
  signWrap = document.createElement('div');
  signWrap.className = 'bunker-sign';
  signWrap.setAttribute('role', 'group');
  signWrap.setAttribute('aria-label', t('chat.sign.aria', currentMode));

  signForm = document.createElement('form');
  signForm.className = 'bunker-sign__form';
  signLabel = document.createElement('label');
  signLabel.className = 'bunker-sign__label';
  signLabel.htmlFor = 'bunker-name';
  const row = document.createElement('div');
  row.className = 'bunker-sign__row';
  signInput = document.createElement('input');
  signInput.type = 'text';
  signInput.id = 'bunker-name';
  signInput.className = 'bunker-sign__input';
  signInput.maxLength = 24;
  signInput.autocomplete = 'off';
  signInput.spellcheck = false;
  signGo = document.createElement('button');
  signGo.type = 'submit';
  signGo.className = 'bunker-sign__go';
  row.append(signInput, signGo);
  signHint = document.createElement('p');
  signHint.className = 'bunker-sign__hint';
  signForm.append(signLabel, row, signHint);

  signAsEl = document.createElement('p');
  signAsEl.className = 'bunker-sign__as';
  // aria-live: announce "on the tab as NAME" when the name is claimed, since
  // the visual state change (form → this line) is otherwise silent to AT.
  signAsEl.setAttribute('aria-live', 'polite');
  signAsEl.hidden = true;
  signAsLabel = document.createElement('span');
  signAsLabel.className = 'bunker-sign__aslabel';
  signNameEl = document.createElement('span');
  signNameEl.className = 'bunker-sign__name';
  signChangeEl = document.createElement('button');
  signChangeEl.type = 'button';
  signChangeEl.className = 'bunker-sign__change';
  signAsEl.append(signAsLabel, signNameEl, signChangeEl);

  signWrap.append(signForm, signAsEl);

  applySignStrings();

  signForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = signInput.value.trim();
    editingSign = false;
    // Ask main.js to claim the name; the 'identity:name' echo re-renders us
    // synchronously, hiding this form. If focus is still on the input/button
    // inside it, the browser would drop focus to <body> — so if we're now in
    // the named state, land focus on the visible "change" control instead.
    bus.emit('identity:set', { name });
    if (localName && !editingSign) signChangeEl.focus();
  });

  signChangeEl.addEventListener('click', () => {
    editingSign = true;
    renderSign();
    signInput.focus();
    signInput.select();
  });

  return signWrap;
}

// Text-only repaint (label/button/placeholder) — split out so mode changes can
// refresh copy without rebuilding the strip.
function applySignStrings() {
  if (!signWrap) return;
  signLabel.textContent = t('chat.sign.label', currentMode);
  signInput.placeholder = t('chat.sign.placeholder', currentMode);
  signGo.textContent = t('chat.sign.go', currentMode);
  signHint.textContent = t('chat.sign.hint', currentMode);
  signAsLabel.textContent = t('chat.sign.as', currentMode);
  signChangeEl.textContent = t('chat.sign.change', currentMode);
  signWrap.setAttribute('aria-label', t('chat.sign.aria', currentMode));
}

// Toggle between the "pick a name" form and the "on the tab as NAME" line.
function renderSign() {
  if (!signWrap) return;
  const named = !!localName && !editingSign;
  signForm.hidden = named;
  signAsEl.hidden = !named;
  if (named) signNameEl.textContent = localName;
  else signInput.value = localName; // prefill so editing tweaks rather than retypes
}

/**
 * Mount THE RAIL into a host element bunker.js created inside #bunker.
 * @param {HTMLElement} hostEl
 */
export function initChatDock(hostEl) {
  logEl = document.createElement('div');
  logEl.className = 'bunker-chat-log';
  logEl.setAttribute('role', 'log');
  logEl.setAttribute('aria-live', 'polite');
  logEl.setAttribute('aria-label', t('aria.chatLog'));

  emptyStateEl = document.createElement('p');
  emptyStateEl.className = 'bunker-chat-empty';
  logEl.appendChild(emptyStateEl);

  errorBannerEl = document.createElement('p');
  errorBannerEl.className = 'bunker-chat-error';
  // role="alert" (implicit aria-live="assertive") — a disconnect is the one
  // state the polite log (line 176) can't be trusted to announce, since the
  // banner toggles outside any row it renders.
  errorBannerEl.setAttribute('role', 'alert');
  errorBannerEl.hidden = true;

  formEl = document.createElement('form');
  formEl.className = 'bunker-chat-form';
  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'bunker-chat-input';
  inputEl.setAttribute('aria-label', t('aria.chatInput'));
  inputEl.autocomplete = 'off';
  sendEl = document.createElement('button');
  sendEl.type = 'submit';
  sendEl.className = 'bunker-chat-send';
  formEl.append(inputEl, sendEl);
  hostEl.append(errorBannerEl, logEl, buildSign(), formEl);
  renderSign();

  formEl.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const value = inputEl.value.trim();
    inputEl.value = '';
    if (!value || isLiveSurface) return; // LIVE: read-only reality, nothing to send
    handleGhostSubmit(value);
  });

  // Bootstrap off the DOM attrs state.js already stamped pre-mount — a
  // state:change subscription alone would miss that first event.
  applyState(document.documentElement.getAttribute('data-state'), document.documentElement.dataset.afterhours === 'true');

  bus.on('state:change', (payload) => applyState(payload.surface.toLowerCase(), payload.afterhoursActive));
  bus.on('chat:message', (msg) => queue.push(msg));
  bus.on('chat:system', renderSystem);
  bus.on('chat:status', (status) => { if (status.connected) hideError(); });
  storage.get('identity', 'name').then((n) => { localName = (n || '').trim(); renderSign(); }).catch(() => {});
  bus.on('identity:name', ({ name }) => { localName = (name || '').trim(); editingSign = false; renderSign(); });
  clock.subscribe(drainQueue);
}
