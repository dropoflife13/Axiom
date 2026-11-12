'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

const CY = '#22d3ee';
const VI = '#a855f7';
const FA = '#f43f5e';
const AM = '#fbbf24';
const PA = '#34d399';
const SL = '#94a3b8';
const DIM = '#7c819a';
const FG = '#e8eaf2';
const BOX = 'rgba(5,6,10,.6)';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const kk = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const sm = (x: number) => x * x * (3 - 2 * x);
const lp = (a: number, b: number, t: number) => a + (b - a) * t;
const win = (t: number, a: number, b: number) => sm(kk(t, a, a + 0.35)) * (1 - sm(kk(t, b - 0.35, b)));
const f1 = (n: number) => n.toFixed(1);
const op = (o?: number) => (o === undefined ? '1' : clamp(o).toFixed(2));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const T = (
  x: number,
  y: number,
  s: string | number,
  c?: string,
  sz?: number,
  w?: number,
  a?: string,
  o?: number
) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${sz || 10}" font-weight="${w || 400}" fill="${c || FG}"${
    a ? ` text-anchor="${a}"` : ''
  } opacity="${op(o)}">${s}</text>`;

const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  s: string,
  f: string,
  so?: number,
  fo?: number,
  sw?: number,
  rx?: number,
  dash?: string
) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" rx="${
    rx || 0
  }" fill="${f || 'none'}" fill-opacity="${op(fo)}" stroke="${s || 'none'}" stroke-opacity="${op(
    so
  )}" stroke-width="${sw || 1}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

const L = (x1: number, y1: number, x2: number, y2: number, s: string, so?: number, sw?: number, d?: string) =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${s}" stroke-opacity="${op(
    so
  )}" stroke-width="${sw || 1}"${d ? ` stroke-dasharray="${d}"` : ''}/>`;

const C = (x: number, y: number, r: number, f: string, fo?: number, s?: string, so?: number, sw?: number) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${f || 'none'}" fill-opacity="${op(fo)}" stroke="${
    s || 'none'
  }" stroke-opacity="${op(so)}" stroke-width="${sw || 1}"/>`;

const arrow = (x: number, y: number, dir: number, c: string, o?: number) =>
  `<path d="M${f1(x - 8 * dir)} ${f1(y - 5)}l${8 * dir} 5l${-8 * dir} 5" fill="none" stroke="${c}" stroke-opacity="${op(
    o
  )}"/>`;

/* ---------- 1 · AUTHORITY SEPARATION ---------- */
function s1(t: number): string {
  let h = '';
  const gx = 60;
  const gw = 290;
  const vx = 850;
  const vw = 290;
  const y0 = 185;
  const hh = 260;
  const wx = 600;
  const my = 315;
  const ry = 395;
  const gA = 0.3 + 0.7 * win(t, 0, 3.4);
  const vA = 0.3 + 0.7 * win(t, 3.4, 6.2);
  const wg = win(t, 6, 8);

  h += R(gx, y0, gw, hh, VI, BOX, gA, 1, 1, 3) + T(gx + 14, y0 + 24, 'GENERATOR · LLM', VI, 10, 700) + T(gx + 14, y0 + hh - 14, 'T=0 · probabilistic · untrusted', DIM, 9);
  [190, 120, 215, 90, 170, 205, 110, 150].forEach((w, i) => {
    const p = sm(kk(t, 0.3 + i * 0.18, 0.6 + i * 0.18));
    h += R(gx + 14, y0 + 44 + i * 22, w * p, 8, 'none', VI, 0, 0.55, 1, 1);
  });
  h += T(gx + 14, y0 + hh - 34, 'candidate migration SQL', VI, 9, 400, 'start', sm(kk(t, 1.4, 1.9)));

  h += R(vx, y0, vw, hh, CY, BOX, vA, 1, 1, 3) + T(vx + 14, y0 + 24, 'VERIFIER · NO LLM', CY, 10, 700) + T(vx + 14, y0 + hh - 14, 'deterministic · same verdict every run', DIM, 9);
  [
    ['AST GATES', '5 deterministic checks'],
    ['PG 16 PROBES', '34 behavioral facts'],
    ['VERDICT', 'fact IDs only'],
  ].forEach((r, j) => {
    const y = y0 + 44 + j * 58;
    const a = sm(kk(t, 4.1 + j * 0.5, 4.6 + j * 0.5));
    const b = sm(kk(t, 4.6 + j * 0.6, 5.0 + j * 0.6));
    const bad = j > 0 && b > 0.5;
    h +=
      R(vx + 14, y, vw - 28, 46, bad ? FA : CY, bad ? FA : CY, 0.3 + 0.7 * a, 0.1 * a, 1, 2) +
      T(vx + 26, y + 20, r[0], bad ? FA : CY, 9, 700, 'start', a) +
      T(vx + 26, y + 36, r[1], DIM, 9, 400, 'start', a);
    h += T(vx + vw - 26, y + 29, j === 0 ? '✓' : j === 1 ? '✕ F-19' : 'FAIL', j === 0 ? PA : FA, j === 0 ? 16 : 11, 700, 'end', b);
  });

  h += R(wx - 9, 170, 18, 300, SL, SL, 0.5 + 0.5 * wg, 0.08 + 0.14 * wg, 1, 2) + L(wx, 150, wx, 490, SL, 0.4, 1, '3 5');
  h += `<text x="${wx + 3}" y="320" transform="rotate(-90 ${wx + 3} 320)" text-anchor="middle" font-size="9" letter-spacing="3" fill="${SL}">AUTHORITY WALL · INVARIANT 0</text>`;
  h +=
    L(gx + gw, my, vx, my, DIM, 0.5, 1, '2 4') +
    arrow(vx - 2, my, 1, DIM, 0.8) +
    T(480, my - 12, 'candidate SQL →', DIM, 9, 400, 'middle') +
    T(725, my - 12, 'ONE WAY', DIM, 9, 400, 'middle');
  h +=
    L(gx + gw, ry, vx, ry, DIM, 0.5, 1, '2 4') +
    arrow(gx + gw + 8, ry, -1, DIM, 0.8) +
    T(725, ry - 12, '← fact ID only', DIM, 9, 400, 'middle');

  if (t > 1.9 && t < 3.9) {
    const p = sm(kk(t, 2, 3.6));
    const px = lp(gx + gw + 4, vx - 90, p);
    h += R(px, my - 11, 80, 22, VI, VI, 1, 0.25, 1, 2) + T(px + 40, my + 4, 'SQL', FG, 10, 700, 'middle');
  }
  if (t > 5.9 && t < 7.6) {
    const p = sm(kk(t, 6, 7.2));
    const px = lp(vx - 110, gx + gw + 4, p);
    h += R(px, ry - 11, 100, 22, FA, FA, 1, 0.2, 1, 2) + T(px + 50, ry + 4, 'F-19', FG, 10, 700, 'middle');
  }
  if (t > 6.1) {
    const by = 432;
    const x = t < 6.8 ? lp(vx - 130, wx + 60, sm(kk(t, 6.1, 6.8))) : lp(wx + 60, wx + 175, sm(kk(t, 6.8, 7.6)));
    const o = kk(t, 6.1, 6.3) * (1 - kk(t, 7.3, 7.8));
    h +=
      R(x, by - 11, 110, 22, FA, 'none', o, 0, 1, 2, '3 3') +
      `<text x="${f1(x + 55)}" y="${by + 4}" font-size="10" fill="${FA}" text-anchor="middle" text-decoration="line-through" opacity="${op(
        o
      )}">fixed SQL</text>`;
    h += T(wx + 20, by - 22, '✕ CORRECTED SQL IS NEVER RETURNED', FA, 9, 700, 'start', sm(kk(t, 6.7, 7.0)) * (1 - kk(t, 7.5, 7.9)));
  }

  h += T(600, 530, 'LLM  ⊥  VERIFIER', FG, 13, 700, 'middle') + T(600, 550, 'generation never grades itself', DIM, 10, 400, 'middle');
  h += T(60, 578, '100% MUTATION KILL RATE', PA, 10, 700) + T(1140, 578, 'ZERO LLM IN THE SCORING PATH', CY, 10, 700, 'end');
  return h;
}

/* ---------- 2 · DISTILLATION PENALTY ---------- */
function s2(t: number): string {
  let h = '';
  const lx = 30;
  const lw = 540;
  const aA = 0.3 + 0.7 * win(t, 0, 2.6);
  const bA = 0.3 + 0.7 * win(t, 2, 4.4);

  h += R(lx, 170, lw, 138, CY, BOX, aA, 1, 1, 3) + T(lx + 14, 194, 'C0 · VERBATIM', CY, 10, 700) + T(lx + lw - 14, 194, 'exact Oracle clause', DIM, 9, 400, 'end');
  ['F-20 · append-only-trigger', 'BEFORE UPDATE OR DELETE ON ledger', 'FOR EACH ROW → RAISE EXCEPTION'].forEach((s, i) => {
    const p = kk(t, 0.3 + i * 0.5, 1.1 + i * 0.5);
    h += T(lx + 14, 228 + i * 26, s.slice(0, Math.ceil(s.length * p)), FG, 12, i ? 400 : 700);
  });

  const ar = sm(kk(t, 2, 2.5));
  h +=
    L(lx + lw / 2, 312, lx + lw / 2, 336, AM, ar, 1.5) +
    `<path d="M${lx + lw / 2 - 5} 331l5 6l5 -6" fill="none" stroke="${AM}" stroke-opacity="${op(ar)}" stroke-width="1.5"/>` +
    T(lx + lw / 2 + 16, 328, 'Advisor compresses', AM, 9, 400, 'start', ar);

  h += R(lx, 340, lw, 108, AM, BOX, bA, 1, 1, 3) + T(lx + 14, 364, 'C · DISTILLED', AM, 10, 700) + T(lx + lw - 14, 364, 'Advisor paraphrase · under 24 words', DIM, 9, 400, 'end');
  const q = '“Ledger rows should not change.”';
  h += T(lx + 14, 394, q.slice(0, Math.ceil(q.length * kk(t, 2.3, 3.2))), FG, 12, 400);
  ['✕ trigger event', '✕ per-row scope', '✕ raise exception'].forEach((s, i) => {
    const a = sm(kk(t, 2.9 + i * 0.35, 3.3 + i * 0.35));
    h += R(lx + 14 + i * 172, 413, 160, 24, FA, FA, 0.5 * a, 0.1 * a, 1, 2) + T(lx + 94 + i * 172, 429, s, FA, 10, 700, 'middle', a);
  });
  h += T(lx, 478, 'same failure, two routes into the next prompt', DIM, 9);

  const ax0 = 650;
  const ax1 = 1150;
  const y = (v: number) => 500 - v * 3;
  h += T(ax0, 176, 'CONVERGENCE · 120 TASKS', DIM, 9, 700);
  [0, 50, 100].forEach((v) => {
    h += L(ax0, y(v), ax1, y(v), DIM, v ? 0.2 : 0.5, 1, v ? '2 4' : '') + T(ax0 - 8, y(v) + 3, v, DIM, 9, 400, 'end');
  });

  const G = [
    { c: 780, n: 'NEMOTRON 550B', v: [71.92, 86.31], e: sm(kk(t, 4, 5.4)), d: '+14.39', dt: 4.9 },
    { c: 1030, n: 'GEMINI 3.1 FLASH LITE', v: [66.08, 83.39], e: sm(kk(t, 6, 7.4)), d: '+17.31', dt: 6.5 },
  ];
  G.forEach((g) => {
    (
      [
        [g.c - 72, AM, 'C', g.v[0]],
        [g.c + 10, CY, 'C0', g.v[1]],
      ] as [number, string, string, number][]
    ).forEach((b) => {
      const bh = b[3] * 3 * g.e;
      h +=
        R(b[0], 500 - bh, 62, bh, b[1], b[1], 1, 0.35, 1, 1) +
        T(b[0] + 31, 500 - bh - 8, (b[3] * g.e).toFixed(2) + '%', b[1], 11, 700, 'middle', g.e) +
        T(b[0] + 31, 518, b[2], b[1], 9, 700, 'middle');
    });
    h += T(g.c, 538, g.n, DIM, 9, 400, 'middle') + T(g.c, 500 - g.v[1] * 3 - 30, 'Δ ' + g.d + ' pts', FG, 12, 700, 'middle', sm(kk(t, g.dt, g.dt + 0.5)));
  });

  h += T(780, 556, 'strict pass@1 29.17% → 55.00%', DIM, 9, 400, 'middle', sm(kk(t, 5.4, 5.9)));
  h += T(ax1, 574, 'p = 1.00e-5 · McNemar p = 9.26e-6', PA, 9, 700, 'end', sm(kk(t, 6.9, 7.4)));
  return h;
}

/* ---------- 3 · INSTRUCTION CAPACITY CLIFF ---------- */
function s3(t: number): string {
  let h = '';
  const bw = 210;
  const blk = 22;
  const pitch = 27;
  const base = 490;
  const N = 10;
  const cap = [10.6, 4];
  const X = [110, 640];
  const nm = ['NEMOTRON 550B', 'GEMINI 3.1 FLASH LITE'];
  const cr = [0.8, 21.7];
  const rA = [sm(kk(t, 2.3, 3)), sm(kk(t, 4.3, 5))];
  const cA = [kk(t, 2, 2.6), kk(t, 4, 4.6)];

  for (let m = 0; m < 2; m++) {
    const x = X[m];
    const col = m ? FA : PA;
    h += T(x, 172, nm[m], col, 11, 700) + T(x, 188, 'CONDITION B PROMPT · 1,852 tok', DIM, 9);
    for (let i = 0; i < N; i++) {
      const p = sm(kk(t, 0.2 + i * 0.16, 0.5 + i * 0.16));
      const y = base - (i + 1) * pitch;
      const over = i >= cap[m];
      const on = cA[m] > 0.5;
      const c = on ? (over ? FA : VI) : SL;
      const sh = over && on ? Math.sin(t * 28 + i * 2) * 1.6 * cA[m] : 0;
      h +=
        R(x + sh, y - (1 - p) * 12, bw, blk, c, c, p * 0.8, 0.16 * p, 1, 2) +
        T(x + 12 + sh, y + 15 - (1 - p) * 12, 'HINT ' + String(i + 1).padStart(2, '0'), c, 9, 400, 'start', p);
    }
    const yc = base - cap[m] * pitch - 2;
    h += L(x - 18, yc, x + bw + 18, yc, col, cA[m], 1.5, '5 3') + T(x + bw + 26, yc + 3, 'INSTRUCTION CAPACITY', col, 9, 700, 'start', cA[m]);
    const rx = x + bw + 36;
    const v = cr[m] * rA[m];
    h +=
      T(rx, 250, 'CONDITION B CRASH RATE', DIM, 9, 400, 'start', rA[m]) +
      T(rx, 296, v.toFixed(1) + '%', col, 38, 700, 'start', rA[m]) +
      R(rx, 310, 200, 5, 'none', col, 0, 0.12 * rA[m], 1, 0) +
      R(rx, 310, ((200 * cr[m]) / 100) * rA[m], 5, 'none', col, 0, 0.9 * rA[m], 1, 0) +
      T(rx, 334, m ? 'the run breaks' : 'the run holds', col, 10, 700, 'start', rA[m]);
  }
  h += T(628, 332, 'PAST CAPACITY ↗', FA, 9, 700, 'end', cA[1]);
  h +=
    T(600, 548, 'SAME PROMPT. DIFFERENT CAPACITY.', FG, 13, 700, 'middle', sm(kk(t, 6.1, 6.7))) +
    T(600, 568, 'the crash rate climbs from 0.8% to 95.8%', DIM, 10, 400, 'middle', sm(kk(t, 6.4, 7)));
  return h;
}

/* ---------- 4 · PARETO FRONTIER ---------- */
function s4(t: number): string {
  let h = '';
  const x0 = 110;
  const x1 = 800;
  const y0 = 520;
  const y1 = 190;
  const X = (v: number) => x0 + (v / 2000) * (x1 - x0);
  const Y = (v: number) => y0 - ((v - 40) / 60) * (y0 - y1);

  for (let v = 0; v <= 2000; v += 500) h += L(X(v), y0, X(v), y1, DIM, 0.12, 1) + T(X(v), y0 + 18, v, DIM, 9, 400, 'middle');
  for (let v = 40; v <= 100; v += 20) h += L(x0, Y(v), x1, Y(v), DIM, 0.12, 1) + T(x0 - 8, Y(v) + 3, v, DIM, 9, 400, 'end');
  h +=
    L(x0, y0, x1, y0, DIM, 0.5, 1) +
    L(x0, y0, x0, y1, DIM, 0.5, 1) +
    T(455, 562, 'PROMPT TOKENS →', DIM, 9, 400, 'middle') +
    T(x0, 176, 'COMPLIANCE %', DIM, 9, 700);

  const P = [
    { n: 'A · ZERO-SHOT', tok: 1138, c: 47.4, col: SL, at: 0.3, dx: 14, ly: 4, an: 'start' },
    { n: 'B · GOLDEN HINTS', tok: 1852, c: 93.9, col: VI, at: 2.2, dx: 0, ly: -18, an: 'middle' },
    { n: 'C0 · VERBATIM', tok: 554, c: 86.3, col: CY, at: 4.2, dx: 0, ly: -20, an: 'middle' },
  ];

  const c0x = X(554);
  const c0y = Y(86.3);
  const ax = X(1138);
  const ay = Y(47.4);
  const bx = X(1852);
  const by = Y(93.9);
  const dz = sm(kk(t, 4.7, 5.3));

  h += R(c0x, c0y, x1 - c0x, y0 - c0y, 'none', FA, 0, 0.07 * dz, 1, 0) + T(x1 - 8, y0 - 10, 'DOMINATED ZONE', FA, 9, 700, 'end', dz * 0.9);
  const ar = sm(kk(t, 5, 5.8));
  h +=
    L(ax, ay, lp(ax, c0x, ar), lp(ay, c0y, ar), AM, 0.9 * ar, 1.5, '4 3') +
    T(lp(ax, c0x, 0.5) + 14, lp(ay, c0y, 0.5), '−51.3% tokens', AM, 11, 700, 'start', ar);
  const fp = sm(kk(t, 6, 7));
  const fx = lp(c0x, bx, fp);
  const fy = lp(c0y, by, fp);
  h +=
    L(c0x, c0y, fx, fy, PA, 0.95 * fp, 2) +
    T((c0x + bx) / 2, c0y - 34, 'FRONTIER', PA, 10, 700, 'middle', fp) +
    T((c0x + bx) / 2, c0y + 8, 'last 7.6 pts cost +1,298 tok', DIM, 9, 400, 'middle', sm(kk(t, 6.6, 7.2)));

  P.forEach((p, i) => {
    const a = sm(kk(t, p.at, p.at + 0.6));
    const px = X(p.tok);
    const py = Y(p.c);
    h +=
      C(px, py, 7, p.col, a, p.col, a, 1) +
      (i === 2 ? C(px, py, 11 + 3 * Math.sin(t * 4), 'none', 0, p.col, 0.6 * a, 1) : '') +
      T(px + p.dx, py + p.ly, p.n, p.col, 10, 700, p.an, a);
  });

  h += T(860, 204, 'READOUT', DIM, 9, 700);
  P.forEach((p, i) => {
    const a = sm(kk(t, p.at + 0.2, p.at + 0.8));
    const yy = 236 + i * 58;
    h += T(860, yy, p.n, p.col, 10, 700, 'start', a) + T(860, yy + 20, p.tok.toLocaleString('en-US') + ' tok · ' + p.c + '%', FG, 13, 700, 'start', a);
  });
  const g = sm(kk(t, 6.2, 7));
  h +=
    T(860, 440, Math.round(84 * g) + '%', CY, 40, 700, 'start', g) +
    T(860, 462, 'OF THE A → B GAP RECOVERED BY C0', DIM, 9, 400, 'start', g) +
    T(860, 478, '(86.3 − 47.4) / (93.9 − 47.4)', DIM, 9, 400, 'start', g);
  return h;
}

/* ---------- 5 · DOMAIN CLUSTERING ---------- */
const F5: [string, string, number, number][] = [
  ['F-17', 'check-name', 0, 224],
  ['F-18', 'index-name', 0, 199],
  ['F-16', 'foreign-key-name', 0, 193],
  ['F-26', 'tenant-rls-behavior', 1, 208],
  ['F-20', 'append-only-trigger', 2, 189],
  ['F-36', 'append-only-supersedes', 2, 186],
  ['F-05', 'created-at', 3, 161],
  ['F-37', 'received-at-trigger', 4, 124],
];
const D5: [string, string][] = [
  ['IDENTITY', CY],
  ['MULTI-TENANCY', VI],
  ['IMMUTABILITY', FA],
  ['TEMPORAL', AM],
  ['INGESTION', PA],
];
const GB = [0, 0, 0, 1, 2, 2, 3, 4];
const TOT5 = F5.reduce((s, f) => s + f[3], 0);
const DS = D5.map((_, i) => F5.filter((f) => f[2] === i).reduce((s, f) => s + f[3], 0));

function s5(t: number): string {
  let h = '';
  const base = 500;
  const sc = 250 / 224;
  const bx = (i: number) => 90 + i * 110 + GB[i] * 34;

  h += L(70, base, 1130, base, DIM, 0.5, 1);
  F5.forEach((f, i) => {
    const col = D5[f[2]][1];
    const x = bx(i);
    const e = sm(kk(t, 0.2 + i * 0.2, 0.9 + i * 0.2));
    const bh = f[3] * sc * e;
    let al = 1;
    if (f[2] !== 0) al -= 0.55 * win(t, 2, 4);
    if (f[2] !== 1) al -= 0.7 * win(t, 4, 6);
    al = Math.max(0.2, al);
    h += R(x, base - bh, 64, bh, col, col, al, 0.3 * al, 1, 1) + T(x + 32, base - bh - 8, Math.round(f[3] * e), col, 11, 700, 'middle', al * e);
    const j = f[1].length > 11 ? f[1].lastIndexOf('-') + 1 : 0;
    const l1 = j ? f[1].slice(0, j) : f[1];
    const l2 = j ? f[1].slice(j) : '';
    h +=
      T(x + 32, 518, f[0], FG, 9, 700, 'middle', al * e) +
      T(x + 32, 531, l1, DIM, 8, 400, 'middle', al * e) +
      (l2 ? T(x + 32, 542, l2, DIM, 8, 400, 'middle', al * e) : '');
  });

  const ba = sm(kk(t, 2.1, 2.9));
  D5.forEach((d, di) => {
    const ix = F5.map((f, i) => (f[2] === di ? i : -1)).filter((i) => i >= 0);
    const a = bx(ix[0]);
    const b = bx(ix[ix.length - 1]) + 64;
    h += L(a, 556, lp(a, b, ba), 556, d[1], ba, 1.5) + T((a + b) / 2, 574, d[0] + ' · ' + DS[di], d[1], 10, 700, 'middle', ba);
  });

  const cw = win(t, 4, 6.4);
  if (cw > 0.01) {
    h += R(760, 168, 346, 94, VI, BOX, 0.6 * cw, 1, 1, 3);
    for (let c = 0; c < 8; c++) {
      const lit = c >= 4;
      h += R(776 + (c % 4) * 30, 190 + Math.floor(c / 4) * 34, 24, 28, VI, VI, lit ? 1 : 0.3, lit ? 0.35 * cw : 0, 1, 2);
    }
    h +=
      T(905, 196, 'TENANT FLAG · 4 OF 8 CELLS', VI, 9, 700, 'start', cw) +
      T(905, 216, 'F-26 tenant-rls-behavior', FG, 11, 700, 'start', cw) +
      T(905, 236, '208 faults · ' + ((208 / TOT5) * 100).toFixed(1) + '% of ' + TOT5.toLocaleString('en-US'), DIM, 9, 400, 'start', cw);
  }

  const sp = sm(kk(t, 6.1, 7));
  if (sp > 0.01) {
    let x = 90;
    DS.forEach((v, i) => {
      const w = (v / TOT5) * 1016 * sp;
      h +=
        R(x, 178, w, 26, D5[i][1], D5[i][1], 0.9, 0.3, 1, 0) +
        (sp > 0.95 ? T(x + w / 2, 195, D5[i][0].replace('MULTI-', '') + ' ' + ((v / TOT5) * 100).toFixed(1) + '%', FG, 9, 700, 'middle') : '');
      x += w;
    });
    h += T(90, 226, 'IDENTITY + TENANCY = ' + (((DS[0] + DS[1]) / TOT5) * 100).toFixed(1) + '% OF THE ' + TOT5.toLocaleString('en-US') + ' FAULTS SHOWN', FG, 11, 700, 'start', sp);
  }
  return h;
}

interface TheoryStageSpec {
  id: string;
  k: string;
  col: string;
  fn: (t: number) => string;
  full: string;
  t1: string;
  t2: string;
  cap: string;
  claim: string;
  proof: string;
  why: string;
  beats: [string, string][];
}

const TH: TheoryStageSpec[] = [
  {
    id: 'T1',
    k: '1 AUTHORITY',
    col: VI,
    fn: s1,
    full: 'Invariant 0 · Authority Separation',
    t1: 'Generation never grades itself.',
    t2: 'Verification is deterministic.',
    cap: 'INVARIANT 0 · LLM ⊥ VERIFIER',
    claim: 'Invariant 0: LLM generation ⊥ deterministic verification',
    proof: 'Footer of the dashboard panel: 100% mutation kill rate · PASS with zero LLM in the scoring path · AST verifier plus a Docker PostgreSQL 16 oracle.',
    why: 'If the model that writes the SQL could also grade it, every score would measure how well the model agrees with itself. The wall removes that loop.',
    beats: [
      ['GENERATE', 'The model writes a candidate migration at temperature 0. It is the only probabilistic part of the system, so nothing it says is trusted.'],
      ['CROSS', 'The SQL crosses the authority wall in one direction. The generator hands over a candidate and has no say in how it is judged.'],
      ['VERIFY', 'The verifier is plain code: AST gates first, then 34 behavioral probes against a fresh PostgreSQL 16 container. No language model scores anything.'],
      ['REPORT', 'Only a fact ID and a one-line statement come back. Corrected SQL never crosses the wall, so the model cannot copy a fix it did not work out itself.'],
    ],
  },
  {
    id: 'T2',
    k: '2 DISTILLATION',
    col: CY,
    fn: s2,
    full: 'The Distillation Penalty (Verbatim vs Distilled)',
    t1: 'Verbatim facts beat distilled advice.',
    t2: 'Paraphrase loses the contract.',
    cap: 'Δ(C0 − C) > 0 · p = 1.00e-5',
    claim: 'Δ(C0 − C) > 0  |  p = 1.00e-5 (McNemar p = 9.26e-6)',
    proof:
      'Nemotron-550B: verbatim C0 beats distilled C by +14.39% (86.31% vs 71.92%, p = 1.00e-5); Gemini 3.1 Flash Lite: C0 beats C by +17.36% (83.39% vs 66.08%, p = 1.00e-5). Significant across 4 of 6 models.',
    why: 'Reflexion setups usually put an Advisor model between the error and the next prompt. For rigid database contracts the exact trigger event, scope and error behavior are the lesson, and a summary drops them.',
    beats: [
      ['VERBATIM', 'C0 injects the Oracle’s failed fact word for word: the exact trigger event, scope and error behavior the contract demands.'],
      ['DISTILL', 'Condition C sends the same failure through an Advisor that rewrites it in under 24 words. The event, the scope and the exception are gone from the summary.'],
      ['550B', 'On Nemotron 550B the verbatim facts converge on 86.31% of tasks against 71.92% for distilled lessons, a gap of +14.39 points. Strict pass@1 rises from 29.17% to 55.00%.'],
      ['GEMINI-3.1', 'On Gemini 3.1 Flash Lite, verbatim facts reach 83.39% against 66.08% for distilled lessons (+17.31 pts, p = 1.00e-5). Qwen 27B similarly gains +16.53 pts.'],
    ],
  },
  {
    id: 'T3',
    k: '3 CAPACITY',
    col: FA,
    fn: s3,
    full: 'The Context Meltdown · Instruction Capacity Cliff',
    t1: 'More instructions is not more help.',
    t2: 'Prompt bloat triggers syntax crashes.',
    cap: 'CONDITION B CRASH RATE · 0.8% VS 21.7%',
    claim: 'Condition B crash rate: 550B (0.8%) vs Gemini 3.1 Flash Lite (21.7%)',
    proof: 'Condition B crash rate: Nemotron 550B 0.8%, Gemini 3.1 Flash Lite 21.7% (26 DDL crashes). Same prompt, 1,852 tokens, same 720-trial design.',
    why: 'Adding hints only helps while the model can still follow them. Past its instruction capacity the extra rules do harm, which is why compact verbatim facts matter more for prompt-sensitive models.',
    beats: [
      ['STACK', 'Condition B hands the model every static rule at once: 1,852 tokens of instructions, the same prompt for every model.'],
      ['550B', 'Nemotron 550B has room for all of it. Its crash rate under Condition B is 0.8%.'],
      ['GEMINI-3.1', 'Gemini 3.1 Flash Lite suffers 26 DDL syntax crashes under Condition B, dropping its score to 75.5% while C0 reaches 83.4%.'],
      ['CLIFF', 'Its crash rate under the identical prompt is 21.7%. Capacity behaves like a cliff: past a threshold, prompt overload actively impairs DDL generation.'],
    ],
  },
  {
    id: 'T4',
    k: '4 PARETO',
    col: PA,
    fn: s4,
    full: 'The Pareto Token-Compliance Frontier',
    t1: 'Half the tokens. Most of the gain.',
    t2: 'Zero-shot is a dominated choice.',
    cap: 'C0 · 554 TOK · 86.3% · −51.3% TOKENS',
    claim: 'Frontier: fewer prompt tokens and higher compliance, together',
    proof: 'Prompt tokens: A 1,138 · B 1,852 · C0 554 (−51.3% against zero-shot). Compliance: A 47.4% · C0 86.3% · B 93.9%. Recovery = (86.3 − 47.4) / (93.9 − 47.4) = 84% of the gap.',
    why: 'A good prompt is judged on two axes at once. C0 beats zero-shot on both, and gets within 7.6 points of the static reference for 70% fewer tokens than static hints.',
    beats: [
      ['ZERO-SHOT', 'Zero-shot (A) spends 1,138 prompt tokens and reaches 47.4% compliance. This is the baseline.'],
      ['STATIC', 'Static hints (B) reach 93.9% but cost 1,852 tokens.'],
      ['VERBATIM', 'Verbatim facts (C0) reach 86.3% with 554 tokens: −51.3% against zero-shot. Zero-shot now sits in the dominated zone, worse on both axes.'],
      ['FRONTIER', 'C0 recovers 84% of the distance from zero-shot to the static reference. The frontier runs from C0 to B, and the last 7.6 points cost 1,298 more tokens.'],
    ],
  },
  {
    id: 'T5',
    k: '5 DOMAINS',
    col: AM,
    fn: s5,
    full: 'Domain Difficulty Clustering & Multi-Tenancy',
    t1: 'Failures cluster by domain.',
    t2: 'Naming and tenancy lead.',
    cap: '8 FACTS · 1,484 FAULTS · 5 DOMAINS',
    claim: 'Faults concentrate in a few fact domains instead of spreading evenly',
    proof: 'Oracle telemetry, faults per fact: F-17 224 · F-26 208 · F-18 199 · F-16 193 · F-20 189 · F-36 186 · F-05 161 · F-37 124.',
    why: 'Difficulty is a property of the domain. A fact family that models keep breaking is where a verbatim lesson earns the most, and the 2³ task grid makes sure tenancy is tested in half of the cells.',
    beats: [
      ['FAULTS', 'Eight facts, ranked by how often models violated them under PostgreSQL 16. The counts are far from even: F-17 has 224 faults, F-37 has 124.'],
      ['DOMAINS', 'Grouped by domain, identity naming (F-16, F-17, F-18) leads with 616 faults, 41.5% of the 1,484 shown. Immutability follows with 375.'],
      ['TENANCY', 'Multi-tenancy is a single fact here, but F-26 tenant-rls-behavior is the second most violated, with 208 faults. 4 of the 8 task cells carry the tenant flag.'],
      ['SHARE', 'Identity and tenancy together account for 55.5% of the faults shown. A few domains carry most of the difficulty.'],
    ],
  },
];

const CYC = 8;
const N = TH.length;

function headSvg(th: number) {
  const d = TH[th];
  return `<text x="30" y="52" font-size="11" font-weight="500" fill="${d.col}">● THEORY ${th + 1} / ${N}</text><text x="30" y="92" font-size="27" font-weight="700" letter-spacing="-.5" fill="${FG}">${d.t1}</text><text x="30" y="124" font-size="27" font-weight="700" letter-spacing="-.5" fill="${DIM}">${d.t2}</text><text x="1170" y="52" font-size="10" text-anchor="end" fill="${DIM}">AXIOM v2 ENGINE</text><text x="1170" y="78" font-size="11" text-anchor="end" fill="${d.col}">${esc(
    d.cap
  )}</text>`;
}

export interface AxiomTheoriesFlowProps {
  selectedTheoryId?: string;
  onSelectTheory?: (theoryId: string) => void;
}

export const AxiomTheoriesFlow = memo(function AxiomTheoriesFlow({
  selectedTheoryId,
  onSelectTheory,
}: AxiomTheoriesFlowProps) {
  const hdRef = useRef<SVGGElement>(null);
  const scRef = useRef<SVGGElement>(null);

  const onSelectTheoryRef = useRef(onSelectTheory);
  onSelectTheoryRef.current = onSelectTheory;

  const [paused, setPaused] = useState(false);
  const [curTheory, setCurTheory] = useState(0);
  const [curBeat, setCurBeat] = useState(0);

  const ttRef = useRef(0);
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const lastHeadTheoryRef = useRef(-1);
  const lastStateKeyRef = useRef('');

  // Respond cleanly if parent accordion selects a theory card
  const prevPropTheoryRef = useRef<string | undefined>(selectedTheoryId);
  useEffect(() => {
    if (selectedTheoryId && selectedTheoryId !== prevPropTheoryRef.current) {
      prevPropTheoryRef.current = selectedTheoryId;
      const idx = TH.findIndex((t) => t.id === selectedTheoryId);
      if (idx >= 0) {
        ttRef.current = idx * CYC + 0.05;
        lastHeadTheoryRef.current = -1;
        lastStateKeyRef.current = '';
        setCurTheory(idx);
        setCurBeat(0);
      }
    }
  }, [selectedTheoryId]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      ttRef.current = 7.9;
      pausedRef.current = true;
      setPaused(true);
    }

    let animId = 0;

    function tick(now: number) {
      if (!lastRef.current) lastRef.current = now;
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      if (!pausedRef.current) {
        ttRef.current += dt;
      }

      const th = Math.floor(ttRef.current / CYC) % N;
      const lt = ttRef.current % CYC;
      const b = Math.min(3, Math.floor(lt / 2));

      if (th !== lastHeadTheoryRef.current) {
        lastHeadTheoryRef.current = th;
        if (hdRef.current) {
          hdRef.current.innerHTML = headSvg(th);
        }
      }

      if (scRef.current) {
        scRef.current.innerHTML = TH[th].fn(lt);
      }

      const sk = `${th}-${b}`;
      if (sk !== lastStateKeyRef.current) {
        lastStateKeyRef.current = sk;
        setCurTheory(th);
        setCurBeat(b);
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const jump = useCallback((th: number, b: number) => {
    const wrappedTh = ((th % N) + N) % N;
    ttRef.current = wrappedTh * CYC + b * 2 + 0.05;
    lastHeadTheoryRef.current = -1;
    lastStateKeyRef.current = '';
    setCurTheory(wrappedTh);
    setCurBeat(b);
    onSelectTheoryRef.current?.(TH[wrappedTh].id);
  }, []);

  const step = useCallback(
    (d: number) => {
      let th = Math.floor(ttRef.current / CYC) % N;
      let b = Math.min(3, Math.floor((ttRef.current % CYC) / 2)) + d;
      if (b > 3) {
        b = 0;
        th++;
      }
      if (b < 0) {
        b = 3;
        th--;
      }
      jump(th, b);
    },
    [jump]
  );

  const d = TH[curTheory] ?? TH[0];

  return (
    <div className="w-full max-w-7xl mx-auto font-mono text-[#e8eaf2] select-none pt-2">
      {/* Control Bar (Same frame as Taxonomy panel) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border border-[rgba(160,170,255,0.16)] bg-[#05060a] text-[10px] tracking-[0.14em] text-[#7c819a]">
        <span className="min-w-0">
          THEORIES · FIVE CORE EMPIRICAL INVARIANTS · DIAGRAMS ARE ILLUSTRATIONS, FIGURES ARE FROM THE RUNS
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="border border-[rgba(160,170,255,0.2)] text-[#e8eaf2] hover:border-white/50 px-2.5 py-1.5 text-[10px] tracking-[0.1em] uppercase transition-colors cursor-pointer"
          >
            {paused ? 'PLAY' : 'PAUSE'}
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous step"
            className="border border-[rgba(160,170,255,0.2)] text-[#e8eaf2] hover:border-white/50 px-2.5 py-1.5 text-[10px] transition-colors cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next step"
            className="border border-[rgba(160,170,255,0.2)] text-[#e8eaf2] hover:border-white/50 px-2.5 py-1.5 text-[10px] transition-colors cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>

      {/* Animated SVG Stage */}
      <div
        className="border border-[rgba(160,170,255,0.16)] border-t-0 overflow-x-auto"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, #120a24 0%, #05060a 70%)' }}
      >
        <svg
          viewBox="0 0 1200 600"
          className="block w-full min-w-[760px] h-auto font-mono"
          role="img"
          aria-label="Animated diagram of one Axiom theory at a time: authority separation, the distillation penalty, the instruction capacity cliff, the Pareto token-compliance frontier, and domain difficulty clustering."
        >
          <g ref={hdRef} />
          <g ref={scRef} />
        </svg>
      </div>

      {/* Two-Column Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] border border-[rgba(160,170,255,0.16)] border-t-0 bg-[#05060a] text-[10px]">
        <div className="p-4 sm:p-5 min-w-0 space-y-2.5">
          <p className="m-0 tracking-[0.18em] text-[#7c819a] uppercase">
            THEORY {curTheory + 1} / {N} · STEP {curBeat + 1} / 4 · {d.beats[curBeat]?.[0]}
          </p>
          <h2 className="m-0 text-[15px] font-bold tracking-[0.06em] text-[#e8eaf2]">{d.full}</h2>
          <p className="m-0 text-[12px] leading-[1.65] max-w-[600px] text-[#e8eaf2]" aria-live="polite">
            {d.beats[curBeat]?.[1]}
          </p>
          <p className="m-0 text-[11px] leading-[1.6]" style={{ color: d.col }}>
            {d.claim}
          </p>
          <div
            className="my-2.5 px-3 py-2.5 border border-[rgba(160,170,255,0.16)] bg-white/[0.025] text-[11px] leading-[1.6] text-[#c3c7da] max-w-[600px]"
            style={{ borderLeft: `2px solid ${d.col}` }}
          >
            <b className="block text-[#7c819a] font-medium tracking-[0.16em] text-[10px] mb-1">PROOF</b>
            <span>{d.proof}</span>
          </div>
          <p className="m-0 text-[11px] leading-[1.6] text-[#7c819a] max-w-[600px]">{d.why}</p>
        </div>

        <div className="p-4 sm:p-5 min-w-0 border-t md:border-t-0 md:border-l border-[rgba(160,170,255,0.16)]">
          <p className="m-0 mb-2 tracking-[0.18em] text-[#7c819a]">THEORIES · CLICK TO JUMP</p>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {TH.map((item, i) => (
              <button
                key={item.k}
                type="button"
                onClick={() => jump(i, 0)}
                style={{ color: item.col }}
                className={`border px-2.5 py-1.5 text-[10px] tracking-[0.1em] transition-colors cursor-pointer ${
                  curTheory === i
                    ? 'border-current bg-white/[0.06] font-bold'
                    : 'border-[rgba(160,170,255,0.16)] hover:border-white/40'
                }`}
              >
                {item.k}
              </button>
            ))}
          </div>

          <p className="m-0 mb-2 tracking-[0.18em] text-[#7c819a]">STEPS IN THIS THEORY</p>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {d.beats.map((b, i) => (
              <button
                key={b[0]}
                type="button"
                onClick={() => jump(curTheory, i)}
                style={{ color: d.col }}
                className={`border px-2.5 py-1.5 text-[10px] tracking-[0.1em] transition-colors cursor-pointer ${
                  curBeat === i
                    ? 'border-current bg-white/[0.06] font-bold'
                    : 'border-[rgba(160,170,255,0.16)] hover:border-white/40'
                }`}
              >
                {i + 1} {b[0]}
              </button>
            ))}
          </div>

          <p className="m-0 mb-2 tracking-[0.18em] text-[#7c819a]">COLOUR KEY</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[#7c819a]">
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: VI }} />
              model, generation
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: CY }} />
              verbatim, verified
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: FA }} />
              failure, blocked
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: AM }} />
              distilled, lossy
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: PA }} />
              efficient, pass
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: SL }} />
              baseline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AxiomTheoriesFlow;
