/**
 * data/ghost-tape.js — THE SCRIPTED NIGHT. (OPERATION NIGHTSHIFT, builder B5)
 *
 * WHAT: Composes one deterministic night of Ghost Tape chat + photo drops
 *       from strings.js's REGULARS lineBanks and BLOTTER, at module init.
 * WHY:  Determinism Law — seeded by clock.nightKey() so drop selection (14
 *       of 24 BLOTTER prints) and its reaction lines vary nightly, while
 *       zero new prose is invented: every `text` below is read straight out
 *       of a REGULAR's existing lineBank (some fire twice — a running bit
 *       recurring, an evergreen line echoed — never a new sentence).
 * HOW:  SCHEDULE hand-places each regular's 10 lines on the tape-second
 *       axis (23:00 = 0). Sentinels mean "reaction, resolve WHEN once
 *       tonight's drops are picked": R4/R19 → the two forced, namechecked
 *       drops (Eagle St eulogy, CANON meter); RG/RG2 → generic flash
 *       reactions, round-robined onto whichever other drops got picked.
 * GOTCHA: Drop `t` is tape-seconds since 23:00 from the blotter's own time
 *       field — the pin's true map position, never the compressed playback
 *       time it fires at (see ghost/tape.js).
 */

import { REGULARS, BLOTTER } from './strings.js';
import { clock } from '../core/clock.js';
import { shuffle } from '../core/rng.js';

/** Tape length, tape-seconds (contracts.js TapeAPI, canonical). */
export const TAPE_DURATION_S = 18000;

/** 'HH:MM' (23:00-anchored, wraps midnight) → tape-seconds, clamped into range. */
function hmToTapeSec(h, m) {
  const totalMin = ((h - 23 + 24) % 24) * 60 + m;
  return Math.min(totalMin * 60, TAPE_DURATION_S - 1);
}
function blotterTapeSec(idx) {
  const [h, m] = BLOTTER[idx].time.split(':').map(Number);
  return hmToTapeSec(h, m);
}

const byHandle = new Map(REGULARS.map((r) => [r.handle, r]));

/** Per-regular schedule, index i == that regular's lineBank[i]: a tape-second, or a
 * reaction sentinel (see file docstring). */
const SCHEDULE = {
  stool_51: [900, 'RG', 5400, 8100, 9900, 'R19', 10500, 12000, 16200, 17700],
  wrenchpigeon: [600, 4200, 4260, 7800, 7860, 11400, 11460, 13800, 13860, 16800],
  nightshiftRN_deb: [0, 90, 3600, 3690, 7200, 7290, 10800, 10890, 14400, 14490],
  iwasthere_iswear: ['R19', 16920, 5100, 1500, 'R4', 5760, 2100, 10200, 8700, 17000],
  xmayor_gladys: [6000, 8100, 10200, 12300, 14200, 14260, 15100, 16860, 17100, 17400],
  frenchbroadjoe: [300, 'RG', 17800, 2400, 10800, 10860, 'R19', 7500, 9000, 16500],
  lastbus_charlene: [6300, 6420, 6480, 'RG', 6660, 6720, 6900, 9300, 9360, 9420],
  doorguy_teo: [1200, 13680, 5700, 12600, 2100, 16200, 8500, 'R19', 'RG', 7700],
  moth_no_1: [1200, 1400, 4800, 7250, 9100, 9300, 11200, 13300, 15500, 17600],
  onemorekenny: [1800, 2400, 10020, 10080, 11700, 11760, 12300, 'R4', 14400, 15600],
  puddlewatcher: [600, 'RG', 5700, 'RG', 10500, 12900, 13000, 15800, 16700, 17999],
};

/** [handle, lineIndex, tOrSentinel] — a SECOND firing of an EXISTING lineBank line,
 * zero new copy (a running bit recurring, or an evergreen observation echoed). */
const ECHOES = [
  ['frenchbroadjoe', 0, 13500], ['frenchbroadjoe', 8, 15500],
  ['puddlewatcher', 4, 6000], ['puddlewatcher', 0, 14800],
  ['stool_51', 4, 16000], ['wrenchpigeon', 0, 9500],
  ['xmayor_gladys', 0, 11000], ['iwasthere_iswear', 6, 13000],
  ['onemorekenny', 0, 16400], ['doorguy_teo', 8, 'RG2'],
];

/** idx4/idx19 have direct chat callbacks that must always land; idx23 ("end of tape")
 * forced for closing mood. */
const FORCED_DROPS = [4, 19, 23];

function selectDropIndices(nightKey) {
  const rest = BLOTTER.map((_, i) => i).filter((i) => !FORCED_DROPS.includes(i));
  const shuffled = shuffle(`ghost:drops:${nightKey}`, rest);
  return [...FORCED_DROPS, ...shuffled.slice(0, 11)].sort((a, b) => a - b);
}

const chosenIdx = selectDropIndices(clock.nightKey());

/** @type {Array<{id:string, t:number, blotterIdx:number}>} tapeTime-sorted, per TapeAPI. */
export const GHOST_DROPS = chosenIdx
  .map((idx) => ({ id: `drop-${idx}`, t: blotterTapeSec(idx), blotterIdx: idx }))
  .sort((a, b) => a.t - b.t);

const drop4 = GHOST_DROPS.find((d) => d.blotterIdx === 4);
const drop19 = GHOST_DROPS.find((d) => d.blotterIdx === 19);
const otherChosen = GHOST_DROPS.filter((d) => d.blotterIdx !== 4 && d.blotterIdx !== 19);

let r4n = 0, r19n = 0, genericCursor = 0;
function resolveSentinel(sentinel) {
  if (sentinel === 'R4') return drop4.t + 30 + (r4n++) * 20;
  if (sentinel === 'R19') return drop19.t + 40 + (r19n++) * 20;
  const d = otherChosen[genericCursor % otherChosen.length]; // RG/RG2: round-robin
  genericCursor += 1;
  return d.t + 30;
}

const entries = [];
for (const [handle, offsets] of Object.entries(SCHEDULE)) {
  const regular = byHandle.get(handle);
  offsets.forEach((slot, lineIndex) => {
    const isReaction = typeof slot === 'string';
    const t = isReaction ? resolveSentinel(slot) : slot;
    entries.push({
      tOffsetMs: Math.round(t * 1000), handle, text: regular.lineBank[lineIndex],
      kind: isReaction ? 'reaction' : 'chat',
    });
  });
}
for (const [handle, lineIndex, slot] of ECHOES) {
  const regular = byHandle.get(handle);
  const isReaction = slot === 'RG2';
  const t = isReaction ? resolveSentinel('RG2') : slot;
  entries.push({
    tOffsetMs: Math.round(t * 1000), handle, text: regular.lineBank[lineIndex],
    kind: isReaction ? 'reaction' : 'chat',
  });
}
entries.sort((a, b) => a.tOffsetMs - b.tOffsetMs);

/** @type {Array<{tOffsetMs:number, handle:string, text:string, kind:'chat'|'reaction'}>} */
export const GHOST_CHAT = entries;
