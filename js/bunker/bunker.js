/**
 * bunker/bunker.js — THE BUNKER: embed plate + LIVE underline. (NIGHTSHIFT, B3)
 *
 * WHAT: mounts the embed plate inside #bunker — a real (lazy, LIVE-only)
 *       Twitch video iframe, or a pinned GHOST TAPE slate — and hands a
 *       rail container to chatdock.js (same builder, same zone).
 * WHY:  constitution §6: "a screen in a dark room has edges — never
 *       full-bleed." The plate is where the site tells the truth fastest:
 *       shows the real stream, or admits in writing that it can't.
 * HOW:  reads the initial surface off <html data-state>/<html
 *       data-afterhours> (state.js stamps those BEFORE zones mount —
 *       architecture §10 — so a state:change subscription alone would
 *       miss the first event), then subscribes for every transition
 *       after. Slate-vs-embed visibility + the LIVE underline's pulse are
 *       pure CSS keyed off the global html[data-state] attribute
 *       (architecture §2.4 names both as the textbook CSS-only case) —
 *       this file's JS only does what CSS can't: construct/destroy the
 *       actual <iframe> so demo mode makes zero external requests.
 * GOTCHA: never touches #tab-dock — B1 places that empty div inside
 *       #bunker for B4's receipt HUD. This file only appendChild()s its
 *       own new nodes, never clears/replaces #bunker's innerHTML.
 */

import { CONFIG } from '../config.js';
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { t } from '../data/strings.js';
import { initChatDock } from './chatdock.js';

let currentMode = 'normal';
let embedEl, statusEl;
let iframeEl = null;

// Twitch player src exactly per docs/twitch-protocol-brief.md §2.
function twitchSrc() {
  const params = new URLSearchParams({ channel: CONFIG.TWITCH_HANDLE, muted: 'true', autoplay: 'true' });
  let qs = params.toString();
  for (const host of CONFIG.EMBED_PARENTS) qs += `&parent=${encodeURIComponent(host)}`;
  return `https://player.twitch.tv/?${qs}`;
}

// Construct the iframe once, idempotently.
function mountIframe() {
  if (iframeEl) return;
  iframeEl = document.createElement('iframe');
  iframeEl.src = twitchSrc();
  iframeEl.allowFullscreen = true;
  iframeEl.title = CONFIG.ARTIST_NAME;
  embedEl.appendChild(iframeEl);
}

// Tear it down so OFFLINE/AFTERHOURS truly makes zero requests.
function unmountIframe() {
  if (!iframeEl) return;
  iframeEl.remove();
  iframeEl = null;
}

// The one thing CSS can't do: the real <iframe>'s presence, plus the
// status label text (also the aria live-status announcement).
function syncEmbed(surfaceLower) {
  const isLive = surfaceLower === 'live';
  statusEl.textContent = isLive ? t('osd.liveLabel', currentMode) : t('osd.ghostBadge', currentMode);
  if (isLive && CONFIG.TWITCH_HANDLE) mountIframe();
  else unmountIframe();
}

/** 'YYYY-MM-DD' → 'MM·DD', matching the strings.js worked example. */
function nightOfLine() {
  const [, mm, dd] = clock.nightKey().split('-');
  return `${t('osd.nightOf', currentMode)} ${mm}·${dd}`;
}

/**
 * Mount THE BUNKER into its zone root. Called once by main.js.
 * @param {HTMLElement} rootEl #bunker
 */
export function init(rootEl) {
  currentMode = document.documentElement.dataset.afterhours === 'true' ? 'afterhours' : 'normal';

  const plate = document.createElement('div');
  plate.className = 'bunker-plate';
  const inner = document.createElement('div');
  inner.className = 'bunker-plate-inner';

  // No aria-label here on purpose: aria-label wins accessible-name
  // computation over element content, which would freeze the
  // announcement. statusEl's own textContent (set by syncEmbed on every
  // transition) IS the accessible name, so role=status announces the
  // real LIVE/GHOST TAPE label each time it changes.
  statusEl = document.createElement('p');
  statusEl.className = 'bunker-status';
  statusEl.setAttribute('role', 'status');

  embedEl = document.createElement('div');
  embedEl.className = 'bunker-embed';

  const slateEl = document.createElement('div');
  slateEl.className = 'bunker-slate';
  const slateText = document.createElement('p');
  slateText.className = 'bunker-slate-text';
  slateText.textContent = t('osd.slate', currentMode);
  const slateNightOf = document.createElement('p');
  slateNightOf.className = 'bunker-slate-nightof';
  slateNightOf.textContent = nightOfLine();
  slateEl.append(slateText, slateNightOf);

  const underline = document.createElement('div');
  underline.className = 'bunker-live-underline';
  underline.setAttribute('aria-hidden', 'true');

  inner.append(statusEl, embedEl, slateEl, underline);
  plate.appendChild(inner);
  rootEl.appendChild(plate);

  const railHost = document.createElement('div');
  railHost.className = 'bunker-rail-host';
  rootEl.appendChild(railHost);
  initChatDock(railHost);

  // Bootstrap from the DOM attribute state.js already stamped (§10 boot
  // order), then follow every subsequent transition via the bus.
  syncEmbed(document.documentElement.getAttribute('data-state'));
  bus.on('state:change', (payload) => {
    currentMode = payload.afterhoursActive ? 'afterhours' : 'normal';
    slateText.textContent = t('osd.slate', currentMode);
    slateNightOf.textContent = nightOfLine();
    syncEmbed(payload.surface.toLowerCase());
  });
}
