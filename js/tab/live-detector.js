/**
 * tab/live-detector.js — the honest LIVE/OFFLINE oracle. (NIGHTSHIFT, B4)
 *
 * WHAT: Lazily injects Twitch's first-party player script ONLY when
 *       CONFIG.TWITCH_HANDLE is set, mounts an invisible 0×0 probe player,
 *       and translates Twitch.Player ONLINE/OFFLINE into bus live:online /
 *       live:offline (consumed by state.js ONLY — arch §2.3).
 * WHY:  Anonymous IRC cannot tell live state (protocol brief §3.2); the
 *       player events are the only tokenless truth Twitch exposes. Demo
 *       mode (empty handle) loads NOTHING external — not even this script.
 * HOW:  initLiveDetector() → <script src=player.twitch.tv/js/embed/v1.js>
 *       → onload constructs the probe → events dedupe through emitOnce so
 *       state.js never sees repeats. Script blocked / global missing /
 *       constructor throw → permanent honest OFFLINE: we emit nothing and
 *       broadcast stays at its default (never a fake badge).
 * GOTCHA: Brief flag #4 — Twitch does not promise an initial ONLINE event
 *       on READY. We also map PLAYING → online as a defensive second
 *       signal, and we never time out into a guessed state.
 */
import { bus } from '../core/bus.js';
import { CONFIG } from '../config.js';

let injected = false;
let lastSignal = '';

function emitOnce(kind) {
  if (kind === lastSignal) return;
  lastSignal = kind;
  bus.emit(kind === 'online' ? 'live:online' : 'live:offline', { source: 'twitch-player' });
}

function mountProbe() {
  const TP = typeof window !== 'undefined' && window.Twitch && window.Twitch.Player;
  if (!TP) return; // script loaded but global missing → honest OFFLINE
  const holder = document.createElement('div');
  holder.id = 'night-live-probe';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  document.body.appendChild(holder);
  let player;
  try {
    player = new TP('night-live-probe', {
      channel: CONFIG.TWITCH_HANDLE,
      parent: [...CONFIG.EMBED_PARENTS],
      width: 1,
      height: 1,
      autoplay: false,
      muted: true,
    });
  } catch (err) {
    console.error('[live-detector] probe construction failed — staying OFFLINE:', err);
    holder.remove();
    return;
  }
  player.addEventListener(TP.ONLINE, () => emitOnce('online'));
  player.addEventListener(TP.PLAYING, () => emitOnce('online'));
  player.addEventListener(TP.OFFLINE, () => emitOnce('offline'));
}

/**
 * Boot the detector. No-op in demo mode (empty handle). Idempotent.
 * Called by main.js during adapter selection (arch §4).
 */
export function initLiveDetector() {
  if (!CONFIG.TWITCH_HANDLE || injected) return;
  injected = true;
  const script = document.createElement('script');
  script.src = 'https://player.twitch.tv/js/embed/v1.js';
  script.async = true;
  script.onload = mountProbe;
  script.onerror = () => {
    // Ad-blocker or network said no: permanent honest OFFLINE (brief §3.4).
    console.error('[live-detector] player script blocked — staying OFFLINE forever.');
  };
  document.head.appendChild(script);
}
