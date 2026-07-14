/**
 * data/route-data.js — the map. (NIGHTSHIFT · B2)
 * WHAT: stylized downtown Asheville: named street polylines, the French Broad
 *       west-edge void, 33 lamps, 11 puddles, and the night's ride with
 *       cumulative tape-seconds (0→18000 = 23:00→04:00). Constitution §5 L2.
 * WHY:  drops are TIME-addressed (arch §11.4 R8) — the hero maps a drop's t
 *       onto this polyline; B5 never sees coordinates. Real names only.
 * HOW:  one 1000×1000 map space; hero owns the map→canvas transform.
 *       pointAtTapeTime writes into a caller out-object (zero alloc in tick).
 * GOTCHA: RIDE rows are [x, y, tTapeS]; t MUST stay strictly ascending with
 *       t[0]=0 and t[last]=18000 or clamping silently pins the head.
 */

export const MAP_W = 1000;
export const MAP_H = 1000;

/** The French Broad — void polygon, filled --asphalt-deep. @type {number[][]} */
export const RIVER = [[96, 0], [150, 0], [125, 120], [155, 260], [120, 400],
  [160, 540], [130, 680], [170, 820], [140, 1000], [96, 1000]];

/**
 * Named street polylines; `label` = where the blotter-mono name renders on
 * the static layer (null = unlabeled connector).
 * @type {Array<{name:string, pts:number[][], label:{x:number,y:number,angleRad:number}|null}>}
 */
export const STREETS = [
  { name: 'HAYWOOD RD', pts: [[8, 470], [60, 505], [110, 540], [205, 595]], label: { x: 28, y: 462, angleRad: 0.55 } },
  { name: 'PATTON AVE', pts: [[205, 595], [330, 585], [480, 568], [560, 562], [720, 556], [960, 552]], label: { x: 760, y: 542, angleRad: -0.03 } },
  { name: 'BROADWAY', pts: [[558, 30], [566, 180], [562, 330], [560, 470], [560, 562]], label: { x: 576, y: 120, angleRad: 1.52 } },
  { name: 'BILTMORE AVE', pts: [[560, 562], [566, 700], [558, 850], [562, 990]], label: { x: 578, y: 880, angleRad: 1.55 } },
  { name: 'LEXINGTON AVE', pts: [[478, 120], [488, 260], [484, 400], [486, 562]], label: { x: 464, y: 200, angleRad: 1.55 } },
  { name: 'RANKIN AVE', pts: [[522, 180], [526, 330], [523, 470]], label: null },
  { name: 'WALNUT ST', pts: [[432, 338], [520, 332], [562, 330], [640, 326]], label: { x: 448, y: 322, angleRad: -0.05 } },
  { name: 'COLLEGE ST', pts: [[560, 600], [700, 592], [850, 586]], label: { x: 730, y: 610, angleRad: -0.04 } },
  { name: 'MARKET ST', pts: [[610, 300], [616, 440], [612, 600]], label: null },
  { name: 'EAGLE ST', pts: [[560, 700], [650, 712], [720, 722]], label: { x: 628, y: 736, angleRad: 0.12 } },
  { name: 'COXE AVE', pts: [[480, 568], [462, 690], [445, 800]], label: { x: 424, y: 700, angleRad: 1.42 } },
  { name: 'DEPOT ST', pts: [[300, 830], [380, 860], [450, 885]], label: { x: 318, y: 852, angleRad: 0.34 } },
  { name: 'CLINGMAN AVE', pts: [[365, 640], [330, 730], [305, 810]], label: { x: 300, y: 700, angleRad: 1.2 } },
  { name: 'RIVERSIDE DR', pts: [[190, 80], [170, 240], [195, 400], [178, 560]], label: { x: 202, y: 280, angleRad: 1.5 } },
  { name: 'SOUTHSIDE AVE', pts: [[470, 810], [560, 800], [660, 792]], label: { x: 590, y: 816, angleRad: -0.06 } },
];

/** Label for the void itself, along the west bank. */
export const RIVER_LABEL = { name: 'FRENCH BROAD', x: 118, y: 340, angleRad: 1.45 };

/** 33 lamp nodes, seeded along the ride's streets (far ones stay dead — canon). @type {number[][]} */
export const LAMPS = [
  [478, 120], [488, 260], [484, 400], [486, 520], [486, 562], [558, 30], [566, 180],
  [562, 330], [560, 470], [560, 562], [566, 700], [558, 850], [330, 585], [420, 574],
  [640, 558], [800, 554], [940, 552], [60, 505], [110, 540], [520, 332], [640, 326],
  [700, 592], [850, 586], [650, 712], [462, 690], [445, 800], [380, 860], [330, 730],
  [612, 440], [523, 330], [560, 800], [190, 80], [178, 560],
];

/** 11 puddle blobs with centroids for O(1) proximity/sprite placement.
 * @type {Array<{cx:number, cy:number, pts:number[][]}>} */
export const PUDDLES = [
  { cx: 472, cy: 300, pts: [[456, 294], [468, 288], [486, 292], [490, 304], [478, 312], [460, 308]] },
  { cx: 580, cy: 346, pts: [[566, 340], [578, 334], [594, 340], [596, 352], [582, 358], [568, 354]] },
  { cx: 612, cy: 570, pts: [[596, 564], [610, 558], [628, 564], [626, 576], [610, 580], [598, 576]] },
  { cx: 228, cy: 612, pts: [[212, 606], [226, 600], [242, 606], [244, 618], [228, 624], [214, 618]] },
  { cx: 82, cy: 522, pts: [[68, 516], [80, 510], [96, 516], [96, 528], [82, 534], [70, 528]] },
  { cx: 688, cy: 722, pts: [[672, 716], [686, 710], [702, 716], [704, 728], [688, 734], [674, 728]] },
  { cx: 456, cy: 742, pts: [[442, 736], [454, 730], [470, 736], [470, 748], [456, 754], [444, 748]] },
  { cx: 574, cy: 782, pts: [[560, 776], [572, 770], [588, 776], [588, 788], [574, 794], [562, 788]] },
  { cx: 782, cy: 594, pts: [[768, 588], [780, 582], [796, 588], [796, 600], [782, 606], [770, 600]] },
  { cx: 497, cy: 508, pts: [[482, 502], [494, 496], [510, 502], [512, 514], [498, 520], [484, 514]] },
  { cx: 350, cy: 588, pts: [[336, 582], [348, 576], [364, 582], [364, 594], [350, 600], [338, 594]] },
];

/** The ride — [x, y, tTapeS], strictly ascending t. Walks the BLOTTER's
 * itinerary: Lexington → Broadway&Walnut → Patton → the bridge → Haywood →
 * back over → Coxe → Depot → Clingman → home past Eagle St. @type {number[][]} */
export const RIDE = [
  [490, 130, 0], [486, 260, 700], [484, 400, 1500], [486, 470, 2100],
  [486, 540, 2600], [486, 562, 2900], [522, 565, 3300], [560, 562, 3700],
  [561, 470, 4200], [562, 330, 4900], [562, 180, 5600], [562, 330, 6300],
  [520, 332, 6700], [432, 338, 7300], [486, 400, 7900], [486, 562, 8600],
  [480, 568, 8800], [330, 585, 9700], [205, 595, 10400], [110, 540, 11000],
  [60, 505, 11400], [110, 540, 11900], [205, 595, 12500], [330, 585, 13100],
  [462, 690, 13900], [445, 800, 14500], [450, 885, 15000], [380, 860, 15400],
  [305, 810, 15900], [365, 640, 16600], [480, 568, 17100], [560, 562, 17500],
  [560, 600, 17700], [560, 700, 17900], [562, 720, 18000],
];

/** Tape length the polyline covers, tape-seconds. */
export const RIDE_DURATION_S = RIDE[RIDE.length - 1][2];

// Monotonic-access cache — the head moves a little per frame, so lookup is O(1).
let lastSegIdx = 0;

/**
 * Position + heading on the ride at tape-time (clamped). Writes into `out`.
 * @param {number} tTapeS
 * @param {{x:number,y:number,angleRad:number}} out mutated in place
 * @returns {{x:number,y:number,angleRad:number}} out
 */
export function pointAtTapeTime(tTapeS, out) {
  const last = RIDE.length - 1;
  const t = tTapeS <= 0 ? 0 : (tTapeS >= RIDE[last][2] ? RIDE[last][2] : tTapeS);
  let i = Math.min(lastSegIdx, last - 1);
  while (i > 0 && RIDE[i][2] > t) i--;             // rewind scrub
  while (i < last - 1 && RIDE[i + 1][2] <= t) i++; // forward
  lastSegIdx = i;
  const a = RIDE[i], b = RIDE[i + 1];
  const span = b[2] - a[2];
  const f = span > 0 ? (t - a[2]) / span : 0;
  out.x = a[0] + (b[0] - a[0]) * f;
  out.y = a[1] + (b[1] - a[1]) * f;
  out.angleRad = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return out;
}

/**
 * Nearest puddle to a map point (the "one frame later" flash target).
 * Boot/event-time use only.
 * @param {number} x @param {number} y @returns {number} PUDDLES index
 */
export function nearestPuddleIndex(x, y) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PUDDLES.length; i++) {
    const dx = PUDDLES[i].cx - x, dy = PUDDLES[i].cy - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
