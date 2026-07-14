/**
 * ghost/tape.js — THE GHOST TAPE engine. (OPERATION NIGHTSHIFT, builder B5)
 *
 * WHAT/WHY: TapeAPI (getDrops/getDurationS) + the replay scheduler turning
 *       data/ghost-tape.js's night into chat:message/drop:photo/chat:system
 *       bus events at CHAT pace (not hero's 400x canvas time) — the bunker
 *       needs to feel alive OFFLINE/AFTERHOURS. isGhost is always true.
 * HOW:  Chat + drops share ONE origMs-sorted timeline; gaps compress to
 *       <=8s (arch §7.2). One clock-subscribed accumulator fires entries in
 *       order, then loops, deterministic. Gated OFFLINE/AFTERHOURS both by
 *       connect()/disconnect() and an internal state:change listener.
 * GOTCHA: drop:photo.tapeTime is the ORIGINAL story position (hero map
 *       placement) — only WHEN it fires is chat-paced. See builder
 *       self-report for interpretive rulings this rests on.
 */

import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { t, BLOTTER, REGULARS } from '../data/strings.js';
import { GHOST_CHAT, GHOST_DROPS, TAPE_DURATION_S } from '../data/ghost-tape.js';

const LAST_CALL_START_MS = (TAPE_DURATION_S - 600) * 1000; // final 10 tape-minutes

/** Warm-band palette only (no blue/cyan — constitution §2), indexed deterministically by
 * colorSeed — the stable per-character seed strings.js hands us for exactly this. */
const WARM_HUES = ['#E8A659', '#D98C3F', '#C97A4A', '#E0B27A', '#D4915C', '#C08552', '#EAD9C0', '#C9B394'];
const colorByHandle = new Map(
  REGULARS.map((r) => [r.handle, WARM_HUES[r.colorSeed % WARM_HUES.length]]),
);

/** One origMs-sorted, silence-compressed (<=8s/gap) timeline. Built once, deterministic. */
function buildTimeline() {
  const items = [
    ...GHOST_CHAT.map((e) => ({ kind: 'chat', origMs: e.tOffsetMs, entry: e })),
    ...GHOST_DROPS.map((d) => ({ kind: 'drop', origMs: d.t * 1000, entry: d })),
  ].sort((a, b) => a.origMs - b.origMs);
  let playMs = 0;
  let prevOrig = 0;
  for (const item of items) {
    playMs += Math.min(item.origMs - prevOrig, 8000);
    item.playMs = playMs;
    prevOrig = item.origMs;
  }
  return { items, totalMs: playMs };
}
const TIMELINE = buildTimeline();

const caption = (idx) => { const b = BLOTTER[idx]; return `${b.time} · ${b.street} · ${b.lens} · ${b.line}`; };
const emitSystem = (text, kind) => bus.emit('chat:system', { text, ts: clock.now(), kind });

let cursor = 0;         // next TIMELINE.items index to fire
let elapsedMs = 0;       // compressed playback ms, wraps at TIMELINE.totalMs
let lap = 0;            // loop counter, keeps chat:message ids unique across laps
let connected = false;  // ChatAdapter latch
let active = false;     // connected AND surface OFFLINE/AFTERHOURS
let mode = 'normal';    // t() mode, mirrors afterhoursActive
let lastCallAnnounced = false;
let unsubClock = null;

bus.on('state:change', (payload) => {
  mode = payload.afterhoursActive ? 'afterhours' : 'normal';
  active = connected && (payload.surface === 'OFFLINE' || payload.surface === 'AFTERHOURS');
});

// Re-sync on hero scrub: resume the compressed schedule from wherever the map now sits.
bus.on('tape:seek', (payload) => {
  const targetOrigMs = Math.max(0, Math.min(payload.tapeTime, TAPE_DURATION_S - 1)) * 1000;
  let idx = TIMELINE.items.findIndex((it) => it.origMs >= targetOrigMs);
  if (idx === -1) idx = 0;
  cursor = idx;
  elapsedMs = TIMELINE.items[idx] ? TIMELINE.items[idx].playMs : TIMELINE.totalMs;
  lastCallAnnounced = targetOrigMs >= LAST_CALL_START_MS;
});

function emitEntry(item) {
  if (item.kind === 'chat') {
    const e = item.entry;
    bus.emit('chat:message', {
      id: `ghost-${lap}-${e.handle}-${e.tOffsetMs}`,
      user: {
        login: e.handle,
        displayName: e.handle,
        color: colorByHandle.get(e.handle) ?? null,
        badges: '',
      },
      text: e.text,
      emotes: [],
      ts: clock.now(),
      source: 'ghost',
      isGhost: true,
    });
  } else {
    const d = item.entry;
    bus.emit('drop:photo', {
      id: d.id,
      tapeTime: d.t,
      ts: clock.now(),
      caption: caption(d.blotterIdx),
      seed: `print:${d.id}`,
      isGhost: true,
    });
  }
}

function onTick(deltaMs) {
  if (!active) return;
  elapsedMs += deltaMs;
  while (cursor < TIMELINE.items.length && TIMELINE.items[cursor].playMs <= elapsedMs) {
    const item = TIMELINE.items[cursor];
    if (!lastCallAnnounced && item.origMs >= LAST_CALL_START_MS) {
      lastCallAnnounced = true;
      emitSystem(`${t('hud.earn.lastCall', mode)} ${t('hud.margins.lastCall', mode)}`, 'notice');
    }
    emitEntry(item);
    cursor += 1;
  }
  if (cursor >= TIMELINE.items.length) {
    lap += 1;
    emitSystem(t('osd.slate', mode), 'slate');
    cursor = 0;
    elapsedMs -= TIMELINE.totalMs;
    lastCallAnnounced = false;
  }
}

/** Start replay. Idempotent. `active` optimistically true on connect (self-corrects on
 * the next state:change — see self-report). */
function start() {
  if (connected) return;
  connected = true;
  active = true;
  if (!unsubClock) unsubClock = clock.subscribe(onTick);
  emitSystem(t('osd.slate', mode), 'slate');
}

/** Stop replay. Idempotent. */
function stop() {
  connected = false;
  active = false;
  if (unsubClock) { unsubClock(); unsubClock = null; }
}

function getDrops() {
  // ts:0 — static snapshot for pin placement; the live fire carries its own real ts.
  return GHOST_DROPS.map((d) => ({
    id: d.id, tapeTime: d.t, ts: 0, caption: caption(d.blotterIdx),
    seed: `print:${d.id}`, isGhost: true,
  }));
}
function getDurationS() { return TAPE_DURATION_S; }

/** @type {import('../core/contracts.js').TapeAPI} */
export const TapeAPI = { getDrops, getDurationS };

/** start/stop for ghost/demo-adapter.js (same builder, not a public contract). */
export const tape = { start, stop };
