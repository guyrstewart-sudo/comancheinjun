/**
 * wall/legends.js — THE WALL's data layer. (OPERATION NIGHTSHIFT, builder B7)
 *
 * WHAT: normalizes the 8 seeded LEGENDS into wall-ready entries, and
 *       resolves the one live entry this browser can speak for: the local
 *       viewer, built from storage + tab bus events.
 * WHY:  keeps wall.js pure rendering — it shouldn't care whether a name is
 *       frozen lore or a browser earning WATTS right now.
 * HOW:  LEGEND_ENTRIES is precomputed once (LEGENDS never changes at
 *       runtime — Honesty Law: lore, not live users; wall.legendsSlate is
 *       the on-screen label that says so). getViewerSnapshot() reads
 *       storage for the current picture; onTabEvents() wires live updates.
 * GOTCHA: contracts.js pins TabState.mayor and the tab:* payloads but not
 *       a viewer identity record. We read storage.get('identity','visitor')
 *       as {id,name} best-effort (storage.js's own docstring confirms
 *       'tab'/'state' for TabState) and fall back to the current rank's
 *       own name — already strings.js-sourced, so "zero hardcoded copy"
 *       holds without inventing placeholder text. Flagged for orchestrator
 *       confirmation once tab/engine.js lands (see B7 self-report).
 */

import { LEGENDS, t } from '../data/strings.js';
import { storage } from '../core/storage.js';
import { bus } from '../core/bus.js';

/** Rank ladder is mode-invariant (afterhours never overrides `ranks`). */
const RANKS = t('ranks');
const RANK_INDEX = new Map(RANKS.map((r, i) => [r.name, i]));
export const RANK_COUNT = RANKS.length;

/**
 * @param {import('../data/strings.js').Legend} l
 * @returns {Object} normalized wall entry
 */
function normalizeLegend(l) {
  const dethroned = l.rank.startsWith('NIGHT MAYOR');
  const rankIndex = dethroned ? RANK_COUNT - 1 : (RANK_INDEX.get(l.rank) ?? 0);
  return {
    id: 'legend:' + l.handle,
    handle: l.handle,
    watts: l.watts,
    rankIndex,
    rankName: dethroned ? RANKS[RANK_COUNT - 1].name : l.rank,
    isLegend: true,
    isViewer: false,
    dethroned,
    sharpieTag: l.sharpieTag,
    oneLineStory: l.oneLineStory,
  };
}

/** The 8 seeded legends, labeled lore (render under STRINGS.wall.legendsSlate). */
export const LEGEND_ENTRIES = Object.freeze(LEGENDS.map(normalizeLegend));

/**
 * Best-effort snapshot of the local viewer's own wall card. Returns null
 * before they've earned anything — they're not "on the wall" yet, same
 * spirit as the empty states elsewhere on the site.
 * @returns {Promise<Object|null>}
 */
export async function getViewerSnapshot() {
  let identity = null, tabState = null, avatar = null;
  try {
    [identity, tabState, avatar] = await Promise.all([
      storage.get('identity', 'visitor'),
      storage.get('tab', 'state'),
      storage.get('identity', 'avatar'),
    ]);
  } catch { /* storage blocked — no viewer card this session */ }
  if (!tabState || !(tabState.total > 0)) return null;
  const id = (identity && identity.id) || 'visitor:local';
  const rankIndex = tabState.rankIndex || 0;
  const rankName = RANKS[rankIndex]?.name || RANKS[0].name;
  return {
    id,
    handle: (identity && identity.name) || rankName,
    watts: tabState.total,
    rankIndex,
    rankName,
    isLegend: false,
    isViewer: true,
    dethroned: false,
    sharpieTag: null,
    oneLineStory: null,
    avatar: avatar || null,
  };
}

/**
 * Wire live tab events to callbacks without forcing a storage re-read.
 * @param {{onEarn?:Function, onRankup?:Function, onMayor?:Function}} h
 * @returns {() => void} unsubscribe all
 */
export function onTabEvents(h) {
  const offs = [];
  if (h.onEarn) offs.push(bus.on('tab:earn', h.onEarn));
  if (h.onRankup) offs.push(bus.on('tab:rankup', h.onRankup));
  if (h.onMayor) offs.push(bus.on('tab:mayor', h.onMayor));
  return () => offs.forEach((off) => off());
}
