/**
 * core/rng.js — seeded randomness. THE DETERMINISM LAW lives here.
 * (OPERATION NIGHTSHIFT)
 *
 * WHAT: mulberry32 PRNG + string hashing + seeded pick/range helpers.
 * WHY:  Constitution law #1: `Math.random()` appears NOWHERE in the render
 *       path. Every tear, rotation, flicker pattern, grain tile, jitter,
 *       and blotter-caption pick derives from a seed keyed to STABLE
 *       content (name hashes, indices, drop ids). Same input → same night,
 *       every time. Reproducibility is also what makes the rAF-dead
 *       verification browser assertable.
 * HOW:  const r = makeRng('wall:' + login); r() → [0,1).
 *       Or one-shot helpers: pick(seedStr, arr), range(seedStr, 0, 6).
 *       Seed strings are namespaced by convention: 'plate:THE TAKE',
 *       'tear:print-07', 'flicker:FIXTURE' — collisions are design bugs.
 * GOTCHA: mulberry32 is NOT crypto — it's an art PRNG, exactly what we
 *       want. hashString is xmur3-style: identical across sessions and
 *       platforms (no locale, no Date). READ-ONLY to all builders.
 *       The ONE sanctioned Math.random() escape hatch in the whole site:
 *       nothing. Even the justinfan digits come from here (seed 'irc').
 */

/**
 * xmur3 string hash → 32-bit uint. Stable across sessions/platforms.
 * @param {string} str
 * @returns {number} unsigned 32-bit hash
 */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * mulberry32 — tiny, fast, good-enough-distribution PRNG.
 * @param {number} seed 32-bit uint
 * @returns {() => number} next() → float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make a reusable seeded generator from a namespaced seed string.
 * @param {string} seedStr e.g. 'grain:tile-3', 'wobble:pin-broadway'
 * @returns {() => number}
 */
export function makeRng(seedStr) {
  return mulberry32(hashString(seedStr));
}

/**
 * One-shot: deterministic float in [min, max) for a seed string.
 * @param {string} seedStr
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function range(seedStr, min, max) {
  return min + makeRng(seedStr)() * (max - min);
}

/**
 * One-shot: deterministic integer in [min, max] (inclusive) for a seed.
 * @param {string} seedStr
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function rangeInt(seedStr, min, max) {
  return min + Math.floor(makeRng(seedStr)() * (max - min + 1));
}

/**
 * One-shot: deterministic array pick for a seed string.
 * @template T
 * @param {string} seedStr
 * @param {T[]} arr non-empty
 * @returns {T}
 */
export function pick(seedStr, arr) {
  return arr[Math.floor(makeRng(seedStr)() * arr.length)];
}

/**
 * Deterministic Fisher–Yates shuffle (returns a NEW array).
 * @template T
 * @param {string} seedStr
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffle(seedStr, arr) {
  const r = makeRng(seedStr);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
