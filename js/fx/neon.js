/**
 * fx/neon.js — hand-drawn SVG neon lettering. THE BUZZING SIGN. (B8)
 * WHAT: neonSign(text) → single-stroke lettering as neon tube: 8px sodium
 *       glow at 18% under a 2px sodium-hot tube (double-stroke, zero
 *       filters). Covers A–Z, 0–9, space, apostrophe, and composed
 *       diacritics Ő Å Č É Ü Ń. TEST: neonSign('CŐMÅNČHÉ INJÜŃ') — every
 *       masthead glyph must render, diacritics intact.
 * WHY:  a font would be a font; a stroke skeleton with seeded ±2px
 *       baseline jitter and point waviness is a hand at 2am. Paths stay
 *       coarse and confident — 3–6 segments reads MORE hand-drawn.
 * HOW:  glyphs are polyline specs (cap y=20, base y=100), jittered per
 *       instance by rng 'neon:seed:i:ch' (Determinism Law). One bad
 *       filament per word via buzz.badFilamentIndex. wireOn() dash-draws
 *       letters (lengths from our own points — no getTotalLength, no
 *       layout); die() darkens filament by filament and REMOVES glow
 *       layers — dead mayors cost zero runtime (bible §9 / WALL-04).
 * GOTCHA: wireOn/die ride el.animate(); in the rAF-dead verification
 *       browser they never progress, so the DEFAULT render is fully lit —
 *       wireOn is decoration for real browsers. Reduced motion: both snap
 *       to end state (bible §8).
 */

import { makeRng } from '../core/rng.js';
import { badFilamentIndex } from './buzz.js';
import { tokens } from './flash.js';

const NS = 'http://www.w3.org/2000/svg';

/* Stroke font: strokes '|'-separated, points 'x,y' space-separated. */
const GLYPHS = {
  A: '2,100 28,20 54,100|12,68 44,68',
  B: '6,20 6,100|6,20 42,24 46,50 8,55|8,55 48,60 50,92 6,100',
  C: '52,34 34,20 12,28 4,60 12,92 34,100 52,86',
  D: '6,20 6,100|6,20 40,28 50,60 40,94 6,100',
  E: '52,20 6,20 6,100 52,100|6,58 38,58',
  F: '52,20 6,20 6,100|6,58 36,58',
  G: '52,30 32,20 8,32 4,64 12,94 38,100 52,88 52,62 32,62',
  H: '6,20 6,100|52,20 52,100|6,58 52,58',
  I: '10,20 10,100',
  J: '46,20 46,86 34,100 14,98 4,82',
  K: '6,20 6,100|52,20 8,60 52,100',
  L: '6,20 6,100 52,100',
  M: '4,100 6,20 31,64 56,20 58,100',
  N: '6,100 6,20 52,100 52,20',
  O: '28,20 8,34 4,64 14,94 40,98 54,68 50,32 28,20',
  P: '6,100 6,20 44,24 48,44 40,58 6,60',
  Q: '28,20 8,34 4,64 14,94 40,98 54,68 50,32 28,20|34,78 54,104',
  R: '6,100 6,20 44,24 46,46 8,56|12,56 52,100',
  S: '50,30 30,20 10,28 10,44 46,60 48,86 30,100 6,92',
  T: '4,20 52,20|28,20 28,100',
  U: '6,20 6,82 16,100 42,100 52,82 52,20',
  V: '4,20 28,100 52,20',
  W: '2,20 15,100 31,46 47,100 60,20',
  X: '6,20 52,100|52,20 6,100',
  Y: '4,20 28,58 52,20|28,58 28,100',
  Z: '6,20 50,20 4,100 52,100',
  0: '28,20 8,34 6,66 16,96 40,98 52,66 50,32 28,20|16,82 42,36',
  1: '14,36 28,20 28,100',
  2: '8,34 24,20 44,24 46,44 6,100 52,100',
  3: '8,28 34,20 46,32 38,54 22,56|38,56 50,70 42,96 8,96',
  4: '40,100 40,20 4,72 52,72',
  5: '48,20 12,20 10,54 36,52 50,70 42,96 8,96',
  6: '44,24 18,32 6,64 10,92 34,100 48,84 42,62 12,64',
  7: '6,20 52,20 22,100',
  8: '28,56 12,46 14,26 42,26 44,46 28,56|28,56 8,70 14,96 42,96 48,70 28,56',
  9: '44,58 16,56 10,34 36,20 46,34 44,72 32,100 12,96',
  "'": '8,20 6,38',
};

/* Diacritic marks above the cap (y 2..16): acute, double acute, ring
 * (drawn as a hand-loop), caron, diaeresis (two struck dots). */
const MARKS = {
  ac: '22,16 34,2',
  dac: '14,16 24,2|32,16 42,2',
  ring: '28,3 20,8 28,14 36,8 28,3',
  car: '17,2 28,14 39,2',
  uml: '19,4 20,10|37,4 38,10',
};

/* Composed glyphs → [base, mark]. Input is uppercased first, so the
 * masthead's lowercase ő å č é ü ń land here too. */
const COMPOSE = {
  'Ő': ['O', 'dac'], 'Å': ['A', 'ring'], 'Č': ['C', 'car'],
  'É': ['E', 'ac'], 'Ü': ['U', 'uml'], 'Ń': ['N', 'ac'],
};

const WIDTHS = { I: 20, "'": 16, M: 62, W: 62 };
const DEFAULT_W = 58;
const SPACE_W = 34;
const GAP = 16;
const FALLBACK = '16,60 42,60'; // unknown char → a low dash, not a crash

function rm() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

function parseStrokes(spec) {
  return spec.split('|').map((s) => s.split(' ').map((p) => p.split(',').map(Number)));
}

/** Jittered path + true length from our own points (no DOM measuring). */
function glyphPath(strokeSets, jr) {
  let d = '';
  let len = 0;
  for (const st of strokeSets) {
    const pts = st.map(([x, y]) => [x + (jr() - 0.5) * 3, y + (jr() - 0.5) * 3]);
    d += 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
  }
  return { d, len };
}

function mkPath(d, cls) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', cls);
  return p;
}

/**
 * Build a neon sign.
 * @param {string} text copy from strings.js/config — never hardcoded here
 * @param {{seed?: string, label?: string}} [opts] seed: stable jitter seed
 *        (default: the text); label: accessible name (role="img") —
 *        omitted → aria-hidden decoration
 * @returns {{el: SVGSVGElement, wireOn: (durationMs?: number) => void,
 *           die: () => void, letters: SVGGElement[], letterCount: number}}
 *          letters (also tagged [data-letter]) feed wall.js's WALL-04
 *          per-letter death; both handle paths in its normalizeNeonHandle()
 *          now resolve.
 */
export function neonSign(text, opts = {}) {
  const seed = opts.seed || String(text);
  const up = String(text).toUpperCase();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'neon-sign');
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  const letters = []; // {g, glow, tube, len, ch}
  const words = [];
  let word = [];
  let pen = 8;
  const flushWord = () => { if (word.length) { words.push(word); word = []; } };

  for (let i = 0; i < up.length; i++) {
    const ch = up[i];
    if (ch === ' ') { pen += SPACE_W; flushWord(); continue; }
    const comp = COMPOSE[ch];
    const base = comp ? comp[0] : ch;
    let strokeSets = parseStrokes(GLYPHS[base] || FALLBACK);
    if (comp) strokeSets = strokeSets.concat(parseStrokes(MARKS[comp[1]]));

    const jr = makeRng('neon:' + seed + ':' + i + ':' + ch);
    const { d, len } = glyphPath(strokeSets, jr);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'neon-letter');
    g.setAttribute('data-letter', ch); // wall.js reaches letters via [data-letter] (WALL-04)
    g.setAttribute('transform', 'translate(' + pen + ' ' + ((jr() - 0.5) * 4).toFixed(1) + ')');
    const glow = mkPath(d, 'neon-glow');
    const tube = mkPath(d, 'neon-tube');
    g.appendChild(glow);
    g.appendChild(tube);
    svg.appendChild(g);

    const rec = { g, glow, tube, len, ch };
    letters.push(rec);
    word.push(rec);
    pen += (WIDTHS[base] || DEFAULT_W) + GAP;
  }
  flushWord();

  // one designated bad filament per word, seeded on the word itself
  const badRecs = [];
  for (const wd of words) {
    const idx = Math.min(badFilamentIndex(wd.map((r) => r.ch).join('')), wd.length - 1);
    wd[idx].g.classList.add('fx-sign-buzz--bad-filament');
    badRecs.push(wd[idx]);
  }

  svg.setAttribute('viewBox', '0 -8 ' + Math.max(pen - GAP + 8, 24) + ' 122');

  /**
   * Dash-draws letters left to right (a sign being wired); the bad
   * filament misfires twice at ~40%/~75% progress (REWIRE phase 2).
   * No-op under reduced motion — default render is already lit.
   * @param {number} [durationMs] default 700 (--dur-rewire-wire)
   */
  function wireOn(durationMs = tokens.durRewireWireMs) {
    if (rm()) return;
    const n = letters.length || 1;
    letters.forEach((L, i) => {
      const delay = (i / n) * durationMs * 0.45;
      for (const p of [L.glow, L.tube]) {
        p.setAttribute('stroke-dasharray', L.len.toFixed(1));
        p.setAttribute('stroke-dashoffset', L.len.toFixed(1));
        const a = p.animate(
          [{ strokeDashoffset: L.len }, { strokeDashoffset: 0 }],
          { duration: durationMs * 0.55, delay, easing: tokens.easeInOutCubic, fill: 'backwards' },
        );
        a.onfinish = () => { // fully lit, zero dash cost after
          p.removeAttribute('stroke-dasharray');
          p.removeAttribute('stroke-dashoffset');
        };
      }
    });
    for (const rec of badRecs) {
      const a = rec.g.animate(
        [
          { opacity: 1, offset: 0 }, { opacity: 1, offset: 0.38 },
          { opacity: 0.3, offset: 0.40 }, { opacity: 1, offset: 0.44 },
          { opacity: 1, offset: 0.73 }, { opacity: 0.25, offset: 0.75 },
          { opacity: 1, offset: 0.79 }, { opacity: 0.85, offset: 1 },
        ],
        { duration: durationMs, easing: 'linear' },
      );
      a.onfinish = () => a.cancel(); // idle control back to the CSS class (85%)
    }
  }

  /**
   * Filament-by-filament death (WALL-04): 150ms/letter, 80ms stagger,
   * flash-decay curve — a light going out. End state: cold ember tube,
   * glow layers REMOVED (a dead sign costs zero runtime, forever).
   * Reduced motion: instant unlit.
   */
  function die() {
    const reduced = rm();
    letters.forEach((L, i) => {
      const kill = () => {
        L.g.classList.add('is-dead');
        L.g.classList.remove('fx-sign-buzz--bad-filament');
        if (L.glow.parentNode) L.glow.remove();
      };
      if (reduced) { kill(); return; }
      const a = L.g.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: tokens.durMayorLetterMs,
          delay: i * tokens.durMayorStaggerMs,
          easing: tokens.easeFlashDecay,
          fill: 'backwards',
        },
      );
      a.onfinish = () => { kill(); a.cancel(); }; // ember rest state comes from CSS
    });
  }

  return { el: svg, wireOn, die, letters: letters.map((L) => L.g), letterCount: letters.length };
}
