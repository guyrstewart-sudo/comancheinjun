/**
 * tab/ranks.js — the WATTS ladder + the NIGHT MAYOR seat law. (NIGHTSHIFT, B4)
 *
 * WHAT: The 7 rank thresholds (architecture §5.3, canonical) and the pure
 *       seat-change math for the positional NIGHT MAYOR rung (ruling R1:
 *       floor 30,000, strictly-greater dethrone).
 * WHY:  engine.js needs rank math with zero DOM; the receipt and the Wall
 *       need the same numbers. One table, one owner, no drift.
 * HOW:  ladder() zips STRINGS rank names (copy law — no name literals here)
 *       with the constitutional thresholds. rankIndexFor() never returns
 *       the mayor rung on its own; callers pass holdsSeat when the entry
 *       owns the seat record.
 * GOTCHA: NIGHT MAYOR is positional, not a threshold: 30,000 WATTS with a
 *       richer sitting mayor is still GUTTER SAINT. evaluateMayor() is the
 *       only door to the seat.
 */
import { t } from '../data/strings.js';

/** Total-WATTS thresholds, index-aligned with STRINGS.normal.ranks (arch §5.3). */
const THRESHOLDS = [0, 500, 1500, 3500, 8000, 20000, 30000];

/** The seat cannot be taken below this total (ruling R1). */
export const MAYOR_FLOOR = 30000;

/** Ladder index of the one positional rung. */
export const NIGHT_MAYOR_INDEX = 6;

/**
 * The full ladder, built fresh from the string table (names are copy).
 * @returns {import('../core/contracts.js').RankDef[]} index-aligned RankDefs
 */
export function ladder() {
  return t('ranks').map((r, i) => ({
    name: r.name,
    index: i,
    threshold: THRESHOLDS[i],
    positional: i === NIGHT_MAYOR_INDEX,
  }));
}

/**
 * Highest rung a total qualifies for. Thresholds only (0..5) unless the
 * entry currently holds the seat AND clears the floor.
 * @param {number} total  lifetime WATTS
 * @param {boolean} [holdsSeat=false]  entry owns the current mayor record
 * @returns {number} ladder index 0..6
 */
export function rankIndexFor(total, holdsSeat = false) {
  if (holdsSeat && total >= MAYOR_FLOOR) return NIGHT_MAYOR_INDEX;
  let idx = 0;
  for (let k = 1; k < NIGHT_MAYOR_INDEX; k++) if (total >= THRESHOLDS[k]) idx = k;
  return idx;
}

/**
 * DebugAPI.getRank() shape (core/contracts.js).
 * @param {number} total
 * @param {boolean} [holdsSeat=false]
 * @returns {{name:string,index:number,threshold:number,next:number|null,progress:number}}
 */
export function rankInfo(total, holdsSeat = false) {
  const defs = ladder();
  const idx = rankIndexFor(total, holdsSeat);
  const next = idx + 1 < defs.length ? defs[idx + 1].threshold : null;
  return {
    name: defs[idx].name,
    index: idx,
    threshold: defs[idx].threshold,
    next,
    progress: next === null ? 1 : Math.min(1, (total - defs[idx].threshold) / (next - defs[idx].threshold)),
  };
}

/**
 * Seat law (R1): challenger takes the neon only at ≥ MAYOR_FLOOR and a
 * STRICTLY greater total than the sitting mayor. Pure — no mutation; the
 * engine records the new seat and emits tab:mayor. A reigning mayor
 * growing their own total is NOT a seat change (returns null).
 * @param {{id:string,name:string,total:number}|null} mayor  current seat
 * @param {{id:string,name:string,total:number}} challenger
 * @returns {{id:string,name:string,total:number}|null} new seat record or null
 */
export function evaluateMayor(mayor, challenger) {
  if (challenger.total < MAYOR_FLOOR) return null;
  if (mayor && challenger.id === mayor.id) return null;
  if (mayor && challenger.total <= mayor.total) return null;
  return { id: challenger.id, name: challenger.name, total: challenger.total };
}
