/**
 * take/banner.js (B6) — psychedelic sacred-geometry frame art for THE TAKE.
 *
 * CLIENT OVERRIDE (2026-07-14): the client asked the print "banners" (the
 * mats/frames the photos sit on) to be bass / EDM / sacred-geometry art
 * instead of the plain vapor torn mat. That means a psychedelic palette —
 * the very hues (magenta / violet / cyan) the neon-noir constitution bans.
 * Scope is deliberately contained: this palette is used ONLY on Take frames;
 * every other surface keeps the constitution.
 *
 * WHAT: sacredBanner(seed) → a seeded <svg> mandala (concentric sacred
 *       polygons, flower-of-life petals, radial spokes) in psychedelic neon.
 * WHY:  each frame is a unique glowing mandala the photo rests on; only the
 *       border strip shows around the photo, reading as an ornate frame.
 * HOW:  core/rng only (Determinism Law) — same seed, same mandala every
 *       night. Pure static SVG (no per-frame JS motion; the lightbox adds
 *       one slow CSS spin on its single open instance).
 * GOTCHA: the sacred-photograph law is intact — this is the FRAME, never the
 *       photo. Nothing here ever composites over photo pixels.
 */

import { makeRng, rangeInt, pick } from '../core/rng.js';

const SVGNS = 'http://www.w3.org/2000/svg';
/** psychedelic EDM palette — Take frames ONLY (client override, see header). */
const NEON = ['#FF2D95', '#B14BFF', '#00E5D0', '#FFC400', '#7CFF4B', '#FF6A00', '#2E8BFF'];
const TAU = Math.PI * 2;

function eln(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function polyPoints(cx, cy, r, sides, rot) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * Build a seeded sacred-geometry mandala SVG (viewBox 0..100, radial).
 * @param {string} seed stable per-print seed
 * @returns {SVGSVGElement}
 */
export function sacredBanner(seed) {
  const rng = makeRng(`banner:${seed}`);
  const rnd = (a, b) => a + rng() * (b - a);
  const hue0 = rangeInt(`banner:hue:${seed}`, 0, NEON.length - 1);
  const spin = rng() > 0.5 ? 1 : -1;
  const rotBase = rnd(0, Math.PI);

  const svg = eln('svg', {
    class: 'tt-banner-svg', viewBox: '0 0 100 100',
    preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true',
  });

  // dark radial base so the photo center stays readable through the mat
  const defs = eln('defs', {});
  const grad = eln('radialGradient', { id: `ttbg-${seed}`, cx: '50%', cy: '50%', r: '72%' });
  grad.append(
    eln('stop', { offset: '0%', 'stop-color': '#0E0A06', 'stop-opacity': '0.92' }),
    eln('stop', { offset: '58%', 'stop-color': '#160a20', 'stop-opacity': '0.86' }),
    eln('stop', { offset: '100%', 'stop-color': '#05030a', 'stop-opacity': '1' }),
  );
  defs.append(grad);
  svg.append(defs);
  svg.append(eln('rect', { x: 0, y: 0, width: 100, height: 100, fill: `url(#ttbg-${seed})` }));

  const g = eln('g', {});

  // concentric sacred polygons (+ every other one a ring), hue cycling outward
  const layers = rangeInt(`banner:layers:${seed}`, 6, 9);
  for (let i = 0; i < layers; i++) {
    const r = 8 + i * (46 / layers);
    const sides = pick(`banner:sides:${seed}:${i}`, [3, 6, 12, 6, 24]);
    const rot = rotBase + i * 0.32 * spin;
    g.append(eln('polygon', {
      points: polyPoints(50, 50, r, sides, rot), fill: 'none',
      stroke: NEON[(hue0 + i) % NEON.length],
      'stroke-width': (0.5 + rng() * 0.6).toFixed(2),
      'stroke-opacity': (0.5 + 0.4 * (i / layers)).toFixed(2),
      'stroke-linejoin': 'round',
    }));
    if (i % 2 === 0) {
      g.append(eln('circle', {
        cx: 50, cy: 50, r: r.toFixed(1), fill: 'none',
        stroke: NEON[(hue0 + i + 3) % NEON.length], 'stroke-width': 0.4, 'stroke-opacity': 0.35,
      }));
    }
  }

  // flower-of-life petals on one ring
  const petals = 12, pr = 30 + rng() * 10;
  for (let i = 0; i < petals; i++) {
    const a = rotBase + (i / petals) * TAU;
    g.append(eln('circle', {
      cx: (50 + pr * Math.cos(a)).toFixed(1), cy: (50 + pr * Math.sin(a)).toFixed(1),
      r: (10 + rng() * 4).toFixed(1), fill: 'none',
      stroke: NEON[(hue0 + i) % NEON.length], 'stroke-width': 0.35, 'stroke-opacity': 0.3,
    }));
  }

  // radial spokes
  const spokes = pick(`banner:spokes:${seed}`, [16, 24, 12]);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + rotBase;
    g.append(eln('line', {
      x1: 50, y1: 50, x2: (50 + 60 * Math.cos(a)).toFixed(1), y2: (50 + 60 * Math.sin(a)).toFixed(1),
      stroke: NEON[(hue0 + i) % NEON.length], 'stroke-width': 0.18, 'stroke-opacity': 0.22,
    }));
  }

  svg.append(g);
  return svg;
}

const TAB_S = 1000; // mask authoring scale (viewBox units; sub-pixel rounding headroom)

/**
 * perforatedTab(seed, aspect, bandFrac) — the blotter-acid tab edge as a CSS mask.
 * Returns a data:image/svg+xml URI to assign to style.maskImage / webkitMaskImage
 * (paired with maskSize:'100% 100%'). White = kept (the psychedelic art shows and
 * bleeds right up to the edge); transparent = the concave perforation bites, where
 * the bar-table surface shows through — exactly a hit torn from a perforated sheet.
 *
 * A real blotter tab's edge is the row of perforation pin-holes BISECTED by the
 * tear, i.e. even concave semicircular notches — not floating holes, not outward
 * bumps. THE ASPECT FIX: the viewBox is authored as (aspect*S) x S so
 * viewBox_aspect === element_aspect; with preserveAspectRatio="none" +
 * maskSize:100% 100% the stretch is uniform on both axes, so a circle stays a
 * circle on any portrait/landscape/square photo and a notch is the same physical
 * size on all four edges. Seeded via core/rng (Determinism Law).
 *
 * @param {string} seed     stable per-print seed
 * @param {number} aspect   element pixel aspect = offsetWidth / offsetHeight
 * @param {number} bandFrac mat-strip thickness as a fraction of element HEIGHT
 * @returns {string} data-URI mask
 */
export function perforatedTab(seed, aspect, bandFrac) {
  const A = Math.max(0.25, Math.min(4, aspect || 1)); // clamp degenerate ratios
  const W = A * TAB_S, H = TAB_S;
  const t = Math.max(24, (bandFrac || 0.07) * TAB_S); // mat-strip thickness (units)
  const rng = makeRng(`perf:${seed}`);
  const jit = (base, amp) => base * (1 + (rng() * 2 - 1) * amp);

  // Concave semicircular notches. Worst-case jittered inward reach ≈ 0.39t < t,
  // so a bite never crosses the mat strip into the photo (sacred-photograph law).
  const notchR = t * 0.34;     // half-chord along the edge
  const notchDepth = t * 0.34; // inward depth (≈ radius → semicircle)
  const pitch = t * 1.30;      // centre-to-centre spacing (dense = reads as blotter)

  const nTop = Math.max(5, Math.round(W / pitch));
  const nSide = Math.max(5, Math.round(H / pitch));
  const f = (v) => v.toFixed(1);

  // One closed clockwise boundary. (ax,ay) advances along the edge; (nx,ny) is the
  // inward normal so the cubic bulges inward and carves a concave bite. Between
  // notches the implicit straight run is the intact paper "bridge".
  const scallop = (len, n, ax, ay, nx, ny, ox, oy) => {
    let s = '';
    const p = len / n;
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * p; // corners stay solid: first/last centre sits p/2 in
      const r = jit(notchR, 0.14);
      const h = jit(notchDepth, 0.16);
      const a0 = c - r, a1 = c + r;
      const x0 = ox + ax * a0, y0 = oy + ay * a0;
      const x1 = ox + ax * a1, y1 = oy + ay * a1;
      s += ` L ${f(x0)} ${f(y0)}`
        + ` C ${f(x0 + nx * h * 1.33)} ${f(y0 + ny * h * 1.33)}`
        + ` ${f(x1 + nx * h * 1.33)} ${f(y1 + ny * h * 1.33)}`
        + ` ${f(x1)} ${f(y1)}`;
    }
    return s;
  };

  let d = 'M 0 0';
  d += scallop(W, nTop, 1, 0, 0, 1, 0, 0) + ` L ${f(W)} 0`;         // top
  d += scallop(H, nSide, 0, 1, -1, 0, W, 0) + ` L ${f(W)} ${f(H)}`; // right
  d += scallop(W, nTop, -1, 0, 0, -1, W, H) + ` L 0 ${f(H)}`;       // bottom
  d += scallop(H, nSide, 0, -1, 1, 0, 0, H) + ' Z';                 // left

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" preserveAspectRatio="none">`
    + `<path fill="#fff" d="${d}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
