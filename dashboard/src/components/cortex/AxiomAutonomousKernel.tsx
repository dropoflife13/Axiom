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
  rx?: number
) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" rx="${
    rx || 0
  }" fill="${f || 'none'}" fill-opacity="${op(fo)}" stroke="${s || 'none'}" stroke-opacity="${op(
    so
  )}" stroke-width="${sw || 1}"/>`;

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

const grp = (w: number, s: string) => (w > 0.01 ? `<g opacity="${op(w)}">${s}</g>` : '');
const bez = (a: number, b: number, c: number, d: number, u: number) => {
  const m = 1 - u;
  return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d;
};
const pk = (x: number, y: number, c: string, o: number) =>
  C(x, y, 9, c, 0.2 * o, 'none', 0) + C(x, y, 4.5, '#fff', o, 'none', 0);

/* ---------- 1 · KERNEL ---------- */
function v1(t: number): string {
  let h = '';
  const kx = 440;
  const ky = 340;
  const kr = 62;
  const TX = 780;
  const TW = 360;
  const TY = [185, 309, 433];
  const TH_ = 84;
  const tiers: [string, string, string][] = [
    ['TIER 1 · DETERMINISTIC ORACLE', '< 15 ms · $0.00 per check', PA],
    ['TIER 2 · FAST REFLEXION ADVISOR', 'about 1.2 s', AM],
    ['TIER 3 · QUARANTINE GATE', 'fail-closed · rule BN-00', FA],
  ];

  h += T(40, 172, 'MIGRATION TRIALS', DIM, 9, 700);
  for (let i = 0; i < 6; i++) {
    const y = 190 + i * 48;
    const on = i === 2;
    h +=
      R(40, y, 130, 34, on ? VI : DIM, on ? VI : 'none', on ? 1 : 0.4, on ? 0.18 : 0, 1, 2) +
      T(54, y + 22, 'TRIAL 0' + (i + 1), on ? FG : DIM, 10, on ? 700 : 400);
  }

  const act = [win(t, 2, 4.4), win(t, 4, 6.4), win(t, 6, 8)];
  const xm = (kx + kr + TX) / 2;
  tiers.forEach((tr, i) => {
    const y = TY[i] + TH_ / 2;
    h += `<path d="M${kx + kr} ${ky}C${f1(xm)} ${ky} ${f1(xm)} ${y} ${TX} ${y}" fill="none" stroke="${
      tr[2]
    }" stroke-opacity="${op(0.22 + 0.78 * act[i])}" stroke-width="1.5" stroke-dasharray="${
      act[i] > 0.1 ? 'none' : '3 4'
    }"/>`;
    h +=
      R(TX, TY[i], TW, TH_, tr[2], BOX, 0.3 + 0.7 * act[i], 1, 1, 3) +
      T(TX + 16, TY[i] + 30, tr[0], tr[2], 10, 700) +
      T(TX + 16, TY[i] + 50, tr[1], DIM, 9);
  });

  h += T(TX + TW - 16, TY[0] + 70, 'verdict: F-19 ✕ · fact IDs only', FA, 9, 700, 'end', sm(kk(t, 3.2, 3.6)));
  h += T(TX + TW - 16, TY[1] + 70, 'candidate lesson · under 24 words', AM, 9, 700, 'end', sm(kk(t, 5.2, 5.6)));
  h += T(TX + TW - 16, TY[2] + 70, 'held · never reaches memory', FA, 9, 700, 'end', sm(kk(t, 7, 7.4)));
  h +=
    C(kx, ky, kr, VI, 0.08, VI, 1, 1.5) +
    `<circle cx="${kx}" cy="${ky}" r="${kr + 14}" fill="none" stroke="${VI}" stroke-opacity=".5" stroke-dasharray="3 6" stroke-dashoffset="${f1(
      -t * 14
    )}"/>`;
  h +=
    T(kx, ky + 6, 'PDP', FG, 18, 700, 'middle') +
    T(kx, ky + kr + 40, 'AXIOM KERNEL', VI, 11, 700, 'middle') +
    T(kx, ky + kr + 58, 'policy decision point · reflexion router', DIM, 9, 400, 'middle') +
    T(kx, ky + kr + 78, 'routes by evidence, not by the generator', DIM, 9, 400, 'middle', sm(kk(t, 1.2, 1.8)));

  if (t > 0.2 && t < 1.8) {
    const u = sm(kk(t, 0.2, 1.7));
    h += pk(lp(170, kx - kr, u), lp(307, ky, u), VI, 1);
  }
  [
    [2.2, 3.6, 0],
    [4.2, 5.6, 1],
    [6.2, 7.6, 2],
  ].forEach((r) => {
    if (t > r[0] && t < r[1] + 0.15) {
      const u = sm(kk(t, r[0], r[1]));
      const y = TY[r[2]] + TH_ / 2;
      h += pk(bez(kx + kr, xm, xm, TX, u), bez(ky, ky, y, y, u), tiers[r[2]][2], 1 - kk(t, r[1], r[1] + 0.15));
    }
  });
  h += T(600, 574, 'INVARIANT 0 · GROUND-TRUTH REFERENCE SQL IS NEVER EXPOSED TO THE LLM', DIM, 9, 400, 'middle');
  return h;
}

/* ---------- 2 · VAULT ---------- */
const VF: [string, string, string][] = [
  ['MEMORY.JSON', 'FIFO · 25 CAP', CY],
  ['CHECKPOINT.JSON', 'SHA-256 LEDGER', CY],
  ['QUARANTINE.JSON', 'FAIL-CLOSED', FA],
  ['RUN-PROVENANCE.JSON', 'GIT + DIFF HASH', CY],
  ['TASK-BANK.JSON', '40 / 40 / 120', SL],
  ['FACTS.JSON', '34 PG PROBES', SL],
  ['AST-CACHE.JSON', 'TIER-0 CACHE', SL],
];
const VFOC = [[0], [1, 3], [2], [4, 5, 6]];

function v2(t: number): string {
  let h = '';
  VF.forEach((f, i) => {
    const a = VFOC.reduce((m, l, bi) => (l.includes(i) ? Math.max(m, win(t, bi * 2, bi * 2 + 2)) : m), 0);
    const y = 172 + i * 52;
    h +=
      R(30, y, 400, 42, f[2], f[2], 0.3 + 0.7 * a, 0.14 * a, 1, 3) +
      T(46, y + 26, f[0], a > 0.4 ? FG : DIM, 11, 700) +
      T(414, y + 26, f[1], f[2], 9, 700, 'end', 0.7 + 0.3 * a);
  });

  let g = '';
  const cx = 820;
  const cy = 350;
  const Rr = 118;
  const n = Math.floor(kk(t, 0.2, 1.5) * 25);
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2 - Math.PI / 2;
    const ev = i === 0 && t > 1.6 && t < 1.9;
    g += C(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr, 10, ev ? FA : CY, i < n ? 0.5 : 0.06, CY, 0.5, 1);
  }
  g +=
    T(cx, cy + 10, '25', FG, 40, 700, 'middle') +
    T(cx, cy + 32, 'LESSON CAP', DIM, 9, 400, 'middle') +
    T(cx, cy + Rr + 46, 'FIFO ring buffer · keyed by fact ID', DIM, 9, 400, 'middle') +
    T(cx, cy - Rr - 24, 'oldest lesson evicted when full', FA, 9, 700, 'middle', sm(kk(t, 1.6, 1.8)));
  h += grp(win(t, 0, 2), g);

  g = '';
  for (let i = 0; i < 4; i++) {
    const x = 490 + i * 165;
    const y = 235;
    const a = sm(kk(t, 2.2 + i * 0.35, 2.6 + i * 0.35));
    g +=
      R(x, y, 135, 80, CY, BOX, a, 1, 1, 3) +
      T(x + 14, y + 26, 'TRIAL ' + (i + 1), CY, 10, 700, 'start', a) +
      T(x + 14, y + 46, 'record', DIM, 9, 400, 'start', a) +
      T(x + 14, y + 64, 'sha256(prev ‖ trial)', DIM, 8, 400, 'start', a);
    if (i < 3) g += L(x + 135, y + 40, x + 165, y + 40, CY, a * 0.8, 1.2) + arrow(x + 165, y + 40, 1, CY, a * 0.8);
  }
  g += T(490, 372, 'RUN-PROVENANCE.JSON PINS', DIM, 9, 700);
  ['gitCommit', 'diffSha256', 'oracleSha256', 'factsSha256', 'executorSha256'].forEach((s, i) => {
    const a = sm(kk(t, 3.2 + i * 0.12, 3.5 + i * 0.12));
    g += R(490 + i * 135, 384, 125, 28, CY, CY, 0.5 * a, 0.08 * a, 1, 2) + T(552.5 + i * 135, 402, s, FG, 9, 700, 'middle', a);
  });
  h += grp(win(t, 2, 4), g);

  g = '';
  const cu = sm(kk(t, 4.2, 5.0));
  const dr = sm(kk(t, 5.4, 5.9));
  const cxp = dr > 0 ? lp(640, 880, dr) : lp(480, 640, cu);
  const cyp = lp(250, 392, dr);
  g +=
    R(850, 205, 280, 50, CY, BOX, 0.35, 1, 1, 3) +
    T(866, 236, 'MEMORY.JSON', DIM, 11, 700) +
    L(800, 230, 850, 230, FA, 0.8, 1.5, '3 3') +
    T(990, 282, 'never reaches memory', FA, 9, 700, 'middle', sm(kk(t, 5.4, 5.8)));
  g += R(796, 200, 8, 200, FA, FA, 0.8, 0.25, 1, 1) + T(800, 190, 'QUARANTINE GATE', FA, 9, 700, 'middle');
  g +=
    T(480, 350, '✕ fails invariant check', FA, 10, 700, 'start', sm(kk(t, 4.7, 5.0))) +
    T(480, 372, '✕ fails AST check', FA, 10, 700, 'start', sm(kk(t, 4.9, 5.2)));
  g +=
    R(850, 400, 280, 70, FA, BOX, 0.9, 1, 1, 3) +
    T(866, 430, 'QUARANTINE.JSON', FG, 11, 700) +
    T(866, 452, 'held under rule BN-00 · fail-closed', FA, 9);
  const co = 1 - sm(kk(t, 5.7, 6));
  g += R(cxp, cyp, 150, 56, AM, AM, co, 0.15 * co, 1, 3) + T(cxp + 75, cyp + 33, 'candidate lesson', FG, 10, 700, 'middle', co);
  h += grp(win(t, 4, 6), g);

  g = '';
  const e = sm(kk(t, 6.1, 6.8));
  g += T(490, 212, 'TASK BANK · SPLITS', DIM, 9, 700);
  let x = 490;
  (
    [
      ['TRAIN 40', 40, CY],
      ['DEV 40', 40, AM],
      ['TEST 120', 120, PA],
    ] as [string, number, string][]
  ).forEach((s) => {
    const w = (s[1] / 200) * 660 * e;
    g += R(x, 222, w, 30, s[2], s[2], 0.9, 0.25, 1, 0) + (e > 0.95 ? T(x + w / 2, 242, s[0], FG, 9, 700, 'middle') : '');
    x += w;
  });
  g += T(490, 312, 'FACTS.JSON · 39 CLAUSES', DIM, 9, 700);
  x = 490;
  (
    [
      [34, CY],
      [1, AM],
      [4, FA],
    ] as [number, string][]
  ).forEach((s) => {
    const w = (s[0] / 39) * 660 * e;
    g += R(x, 322, w, 30, s[1], s[1], 0.9, 0.25, 1, 0);
    x += w;
  });
  g +=
    T(490, 376, '■', CY, 10, 700, 'start', e) +
    T(506, 376, '34 active PG16 probes', DIM, 9, 400, 'start', e) +
    T(700, 376, '■', AM, 10, 700, 'start', e) +
    T(716, 376, '1 unconfirmed', DIM, 9, 400, 'start', e) +
    T(850, 376, '■', FA, 10, 700, 'start', e) +
    T(866, 376, '4 dropped', DIM, 9, 400, 'start', e);
  g +=
    T(490, 432, 'AST-CACHE.JSON · TIER-0', DIM, 9, 700) +
    R(490, 442, 660, 40, SL, BOX, 0.6 * e, 1, 1, 3) +
    T(506, 467, 'key = sha256(model + system + user + temperature)', FG, 12, 400, 'start', e);
  h += grp(win(t, 6, 8), g);
  return h;
}

/* ---------- 3 · CRUCIBLE ---------- */
const TRIP = [4, 18, 19];
function v3(t: number): string {
  let h = '';
  const cx0 = 300;
  const cy0 = 175;
  const cw = 580;
  const ch = 330;
  const per = 2 * (cw + ch);
  const draw = sm(kk(t, 0.2, 1.5));
  const fade = 1 - 0.6 * sm(kk(t, 7, 7.8));

  h += T(40, 172, 'CANDIDATE MIGRATION', DIM, 9, 700);
  [150, 100, 190, 70, 160, 120, 90].forEach((w, i) => {
    h += R(40, 190 + i * 26, w, 8, 'none', VI, 0, 0.5, 1, 1);
  });
  h += R(40, 380, 210, 50, VI, BOX, 0.4, 1, 1, 3) + T(54, 402, 'generated by the LLM', VI, 9, 700) + T(54, 418, 'not trusted', DIM, 9);
  if (t > 2.2 && t < 3.2) {
    const u = sm(kk(t, 2.2, 3.0));
    h += pk(lp(250, cx0, u), 330, VI, 1);
  }
  h += `<g opacity="${op(fade)}"><rect x="${cx0}" y="${cy0}" width="${cw}" height="${ch}" rx="4" fill="${BOX}" stroke="${PA}" stroke-width="1.2" stroke-dasharray="${f1(
    per * draw
  )} ${f1(per)}"/>`;
  h += T(cx0 + 20, cy0 + 26, 'DOCKER · POSTGRES 16', PA, 10, 700, 'start', draw) + T(cx0 + cw - 20, cy0 + 26, 'one per trial', DIM, 9, 400, 'end', draw);
  h +=
    R(cx0 + 20, cy0 + 46, 240, 262, VI, 'none', 0.35 * draw, 0, 1, 3) +
    T(cx0 + 36, cy0 + 68, 'ROLE · deployer', VI, 10, 700, 'start', draw) +
    R(cx0 + 280, cy0 + 46, 280, 262, PA, 'none', 0.35 * draw, 0, 1, 3) +
    T(cx0 + 296, cy0 + 68, 'ROLE · application', PA, 10, 700, 'start', draw);
  ['TABLE', 'TRIGGER', 'RLS POLICY'].forEach((s, i) => {
    const a = sm(kk(t, 2.6 + i * 0.4, 3 + i * 0.4));
    h += R(cx0 + 36, cy0 + 90 + i * 66, 208, 50, VI, VI, a, 0.14 * a, 1, 2) + T(cx0 + 52, cy0 + 120 + i * 66, s, FG, 10, 700, 'start', a);
  });
  let lit = 0;
  for (let i = 0; i < 34; i++) {
    const c = Math.floor(i % 6);
    const r = Math.floor(i / 6);
    const on = t > 4.2 + i * 0.05;
    const bad = TRIP.includes(i) && on;
    if (on) lit++;
    h += R(cx0 + 296 + c * 40, cy0 + 86 + r * 36, 30, 28, bad ? FA : PA, bad ? FA : PA, on ? 0.9 : 0.2, on ? 0.3 : 0, 1, 2);
  }
  h += T(cx0 + 296, cy0 + 318, lit + ' / 34 PROBES RUN', PA, 9, 700, 'start', sm(kk(t, 4.2, 4.5))) + T(cx0 + 560, cy0 + 318, '3 TRIPPED', FA, 9, 700, 'end', sm(kk(t, 5.9, 6.2))) + '</g>';
  h += T(cx0 + cw / 2, cy0 + ch + 30, 'container discarded after the verdict', DIM, 9, 400, 'middle', sm(kk(t, 7.2, 7.7)));
  h += R(920, 200, 250, 260, FA, BOX, 0.5, 1, 1, 3) + T(936, 226, 'VERDICT · FACT IDS ONLY', FA, 10, 700);
  [
    ['F-05', 'created-at'],
    ['F-19', 'append-only-view'],
    ['F-20', 'append-only-trigger'],
  ].forEach((f, i) => {
    const u = sm(kk(t, 6.2 + i * 0.3, 6.8 + i * 0.3));
    const x = lp(cx0 + cw - 60, 936, u);
    if (u > 0) h += R(x, 250 + i * 50, 214, 36, FA, FA, u, 0.16 * u, 1, 2) + T(x + 12, 273 + i * 50, f[0] + ' ' + f[1], FG, 10, 700, 'start', u);
  });
  h += T(936, 430, 'no corrected SQL leaves the container', DIM, 9, 400, 'start', sm(kk(t, 7, 7.5)));
  return h;
}

/* ---------- 4 · CIRCUIT ---------- */
const XS = [30, 225, 420, 615, 810, 1005];
const NW = 165;
const ND: [string, string, string, string][] = [
  ['01 GENERATE', 'TEMP = 0', 'src/executor.ts', VI],
  ['02 VERIFY', 'PG-16 ORACLE', 'zero LLM in scoring', PA],
  ['03 FAIL', 'FACT IDs ONLY', 'no ground-truth SQL', FA],
  ['04 ADVISE', 'TOP K = 10', 'base K = 6', AM],
  ['05 RETRY', 'REFLEXION', 'C distilled · C0 verbatim', VI],
  ['06 PASS', 'HOLM p < 1e-4', 'sign-flip resampling', CY],
];

function v4(t: number): string {
  let h = '';
  const ny = 190;
  const nh = 120;
  const A = [win(t, 0, 1.2), win(t, 0.8, 2), win(t, 1.4, 2.2), win(t, 2, 4.4), win(t, 4, 6.4), win(t, 6, 8)];
  const x4 = XS[4] + NW / 2;
  const x1 = XS[1] + NW / 2;
  const lo = sm(kk(t, 4.1, 5.2));
  h +=
    `<path d="M${x4} ${ny}C${x4} 140 ${x1} 140 ${x1} ${ny}" fill="none" stroke="${AM}" stroke-opacity=".25" stroke-dasharray="2 4"/><path d="M${x4} ${ny}C${x4} 140 ${x1} 140 ${x1} ${ny}" fill="none" stroke="${AM}" stroke-width="1.6" pathLength="1" stroke-dasharray="${lo.toFixed(
      3
    )} 1" opacity="${op(win(t, 4, 6.4))}"/>` + T((x1 + x4) / 2, 172, 'RETRY WITH LESSON', AM, 9, 400, 'middle', win(t, 4.2, 6.4));
  h += L(XS[0] + NW, 250, XS[5], 250, DIM, 0.3, 1);
  for (let i = 0; i < 5; i++) h += arrow(XS[i] + NW + 22, 250, 1, DIM, 0.5);

  ND.forEach((n, i) => {
    const a = A[i];
    const x = XS[i];
    h +=
      R(x, ny, NW, nh, n[3], BOX, 0.28 + 0.72 * a, 1, 1, 3) +
      T(x + 14, ny + 26, n[0], a > 0.4 ? n[3] : DIM, 10, 700) +
      T(x + 14, ny + 62, n[1], FG, 13, 700) +
      T(x + 14, ny + 88, n[2], DIM, 9);
    h += L(x + NW / 2, ny + nh, x + NW / 2, 345, SL, 0.15 + 0.7 * win(t, 6, 8), 1);
  });

  if (t > 0.2 && t < 2) {
    const u = sm(kk(t, 0.2, 1.9));
    h += pk(lp(XS[0] + NW / 2, XS[2] + NW / 2, u), 250, VI, 1);
  }
  h +=
    R(30, 345, 1140, 60, SL, BOX, 0.3 + 0.6 * win(t, 6, 8), 1, 1, 3) +
    T(50, 370, 'ARBITER · SUPREME GATE', FG, 11, 700) +
    T(50, 390, 'adjudicates cross-domain conflicts · fails closed on budget caps (src/guardrails.ts)', DIM, 9) +
    T(1150, 380, 'daily cap · 429 / 503 backoff · SHA-256 cache', DIM, 9, 400, 'end');
  h += grp(win(t, 0, 2), T(600, 470, 'GENERATE writes SQL at T = 0 → VERIFY runs it in PostgreSQL 16 → FAIL returns fact IDs only', FG, 11, 400, 'middle'));
  h += grp(
    win(t, 2, 4),
    T(600, 470, 'ADVISE ranks stored lessons by feature overlap and keeps the top K = 10 (base K = 6)', FG, 11, 400, 'middle') +
      T(600, 494, 'lessons are keyed by fact ID in a FIFO buffer of 25', DIM, 9, 400, 'middle')
  );
  h += grp(
    win(t, 4, 6),
    R(330, 440, 260, 70, AM, BOX, 0.7, 1, 1, 3) +
      T(346, 466, 'C · DISTILLED', AM, 10, 700) +
      T(346, 488, 'under 24 words · 71.9%', DIM, 9) +
      R(610, 440, 260, 70, CY, BOX, 0.7, 1, 1, 3) +
      T(626, 466, 'C0 · VERBATIM', CY, 10, 700) +
      T(626, 488, 'exact contract facts · 86.3%', DIM, 9)
  );
  h += grp(
    win(t, 6, 8),
    T(600, 470, 'PASS commits the trial hash to checkpoint.json · 720 trials confirmed with Holm p < 1e-4', FG, 11, 400, 'middle') +
      T(600, 494, 'only evidence that survives verification is eligible for memory', DIM, 9, 400, 'middle')
  );
  return h;
}

interface KernelViewSpec {
  k: string;
  kick: string;
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

const TH: KernelViewSpec[] = [
  {
    k: '1 KERNEL',
    kick: 'THE KERNEL',
    col: VI,
    fn: v1,
    full: 'The Axiom Autonomous Kernel',
    t1: 'Route every trial.',
    t2: 'Trust no generator.',
    cap: 'POLICY DECISION POINT · INVARIANT 0',
    claim: 'A deterministic Policy Decision Point and reflexion router built on Invariant 0',
    proof:
      '“The generator never grades itself, generated rules never write directly into canonical domain files (AGENTS.md), and only evidence that survives deterministic verification is eligible for memory.”',
    why: 'The kernel decides where each trial goes from evidence. Only the Oracle’s verdict can change what the system remembers.',
    beats: [
      ['TRIAL', 'A migration trial (01–06) arrives at the kernel. The kernel owns the routing decision, and the generator that wrote the SQL has no say in it.'],
      ['TIER 1', 'Tier 1 is the deterministic Oracle: under 15 ms and $0.00 per check. Ground-truth reference SQL is never exposed to the model, only the verdict.'],
      ['TIER 2', 'When a trial fails, the fast reflexion Advisor (about 1.2 s) turns the verdict into a candidate lesson.'],
      ['TIER 3', 'A candidate that fails an invariant or AST check goes to the Quarantine Gate under rule BN-00. It stays there and never reaches memory.'],
    ],
  },
  {
    k: '2 VAULT',
    kick: 'LAYER 01',
    col: CY,
    fn: v2,
    full: 'Layer 01 · Cryptographic Memory Vault',
    t1: 'Memory only accepts',
    t2: 'what verification proves.',
    cap: 'LAYER 01 · SHA-256 IMMUTABLE',
    claim: 'Only evidence that survives deterministic verification is eligible for memory',
    proof:
      'memory.json: FIFO ring buffer, MAX_STORED_LESSONS = 25 (src/memory.ts) · checkpoint.json: twin SHA-256 ledgers · quarantine.json: fail-closed · run-provenance.json: gitCommit, diffSha256, oracleSha256, factsSha256, executorSha256.',
    why: 'Lessons are calibrated on Train and checked by SHA-256 hash, so nothing leaks in at run time and any change to a record is detectable.',
    beats: [
      ['MEMORY', 'memory.json is a FIFO ring buffer capped at 25 lessons, keyed and de-duplicated by fact ID. When it is full the oldest lesson is evicted.'],
      ['LEDGER', 'checkpoint.json commits each trial record and its hash right after execution. run-provenance.json pins the git commit and the hashes of the diff, Oracle, facts and Executor.'],
      ['QUARANTINE', 'quarantine.json is a fail-closed holding gate. Candidates that fail an invariant or AST check are kept there instead of in memory.'],
      ['SEALED INPUTS', 'Inputs are fixed before a run: a task bank split 40 / 40 / 120, facts.json with 39 clauses (34 active probes, 1 unconfirmed, 4 dropped), and a Tier-0 SHA-256 cache keyed on model, prompts and temperature.'],
    ],
  },
  {
    k: '3 CRUCIBLE',
    kick: 'LAYER 02',
    col: PA,
    fn: v3,
    full: 'Layer 02 · Oracle Crucible',
    t1: 'A fresh PostgreSQL 16',
    t2: 'for every trial.',
    cap: 'LAYER 02 · 34 PROBES · ZERO LLM',
    claim: '34 active behavioral probes, zero LLM in scoring',
    proof: 'scripts/oracle.ts: the migration runs as role deployer, behavior is probed as role application. facts.json holds 39 clauses: 34 active PG16 probes, 1 UNCONFIRMED, 4 DROPPED.',
    why: 'Deploying and probing under different roles lets the Oracle test row-level security, privileges and triggers the way an application would meet them.',
    beats: [
      ['BOOT', 'Each trial gets its own PostgreSQL 16 Docker container. Nothing carries over from the previous trial.'],
      ['DEPLOY', 'The candidate migration runs as role deployer, which creates the tables, triggers and policies.'],
      ['PROBE', '34 behavioral probes then run as role application, the way a real service would hit the database. Each probe either holds or trips a fact.'],
      ['VERDICT', 'Only the tripped fact IDs leave the container, never the SQL that would fix them. The container is then discarded.'],
    ],
  },
  {
    k: '4 CIRCUIT',
    kick: 'LAYER 03',
    col: AM,
    fn: v4,
    full: 'Layer 03 · 6-Stage Operational Circuit & Arbiter',
    t1: 'Six stages, one arbiter.',
    t2: 'Fail closed.',
    cap: 'LAYER 03 · GENERATE → PASS',
    claim: 'GENERATE → VERIFY → FAIL → ADVISE → RETRY → PASS, under the Arbiter',
    proof:
      'TEMP = 0 · PG-16 oracle · fact IDs only · SQL_RETRIEVAL_TOP_K = 10 (LESSON_TOP_K = 6) · Advisor under 24 words · Holm p < 1e-4 by sign-flip resampling · Arbiter: src/guardrails.ts. Condition scores on nemotron-2: C 71.9%, C0 86.3%.',
    why: 'Every stage has one parameter fixed in code. The Arbiter sits above all six and fails closed when a cap is hit.',
    beats: [
      ['LOOP', 'The model compiles SQL at temperature 0, the Oracle verifies it in PostgreSQL 16, and a failure comes back as fact IDs only.'],
      ['ADVISE', 'Before the retry, stored lessons are ranked by feature overlap with the task and the top K = 10 are kept (the base K is 6).'],
      ['RETRY', 'The retry carries either a distilled lesson under 24 words (C) or the verbatim contract facts (C0). Verbatim scores higher: 86.3% against 71.9%.'],
      ['PASS', 'A passing trial is committed to the ledger. Across the 720-trial run, results are confirmed with Holm-corrected sign-flip tests at p < 1e-4, with the Arbiter above all of it.'],
    ],
  },
];

const CYC = 8;
const N = TH.length;

function headSvg(th: number) {
  const d = TH[th];
  return `<text x="30" y="52" font-size="11" font-weight="500" fill="${d.col}">● ${d.kick}</text><text x="30" y="92" font-size="27" font-weight="700" letter-spacing="-.5" fill="${FG}">${d.t1}</text><text x="30" y="124" font-size="27" font-weight="700" letter-spacing="-.5" fill="${DIM}">${d.t2}</text><text x="1170" y="52" font-size="10" text-anchor="end" fill="${DIM}">AXIOM v2 ENGINE</text><text x="1170" y="78" font-size="11" text-anchor="end" fill="${d.col}">${esc(
    d.cap
  )}</text>`;
}

export const AxiomAutonomousKernel = memo(function AxiomAutonomousKernel() {
  const hdRef = useRef<SVGGElement>(null);
  const scRef = useRef<SVGGElement>(null);

  const [paused, setPaused] = useState(false);
  const [curView, setCurView] = useState(0);
  const [curBeat, setCurBeat] = useState(0);

  const ttRef = useRef(0);
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const lastHeadViewRef = useRef(-1);
  const lastStateKeyRef = useRef('');

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

      if (th !== lastHeadViewRef.current) {
        lastHeadViewRef.current = th;
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
        setCurView(th);
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
    lastHeadViewRef.current = -1;
    lastStateKeyRef.current = '';
    setCurView(wrappedTh);
    setCurBeat(b);
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

  const d = TH[curView] ?? TH[0];

  return (
    <section
      id="cortex-vault"
      aria-label="Axiom Autonomous Kernel & 3-Tier Invariant Vault"
      className="w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-10 font-mono text-[#e8eaf2] select-none"
    >
      {/* Top Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border border-[rgba(160,170,255,0.16)] bg-[#05060a] text-[10px] tracking-[0.14em] text-[#7c819a]">
        <span className="min-w-0">
          AUTONOMOUS KERNEL &amp; 3-TIER INVARIANT VAULT · DIAGRAMS ARE ILLUSTRATIONS, FIGURES ARE FROM THE CODEBASE
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
          aria-label="Animated diagram of the Axiom Autonomous Kernel: how it routes a trial across three tiers, the cryptographic memory vault, the PostgreSQL 16 oracle crucible, and the six-stage circuit under the Arbiter."
        >
          <g ref={hdRef} />
          <g ref={scRef} />
        </svg>
      </div>

      {/* Two-Column Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] border border-[rgba(160,170,255,0.16)] border-t-0 bg-[#05060a] text-[10px]">
        {/* Left: Explanation & Codebase Proof */}
        <div className="p-4 sm:p-5 min-w-0 space-y-2.5">
          <p className="m-0 tracking-[0.18em] text-[#7c819a] uppercase">
            {d.kick} · STEP {curBeat + 1} / 4 · {d.beats[curBeat]?.[0]}
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
            <b className="block text-[#7c819a] font-medium tracking-[0.16em] text-[10px] mb-1">FROM THE CODEBASE</b>
            <span>{d.proof}</span>
          </div>
          <p className="m-0 text-[11px] leading-[1.6] text-[#7c819a] max-w-[600px]">{d.why}</p>
        </div>

        {/* Right: Views, Steps & Colour Key */}
        <div className="p-4 sm:p-5 min-w-0 border-t md:border-t-0 md:border-l border-[rgba(160,170,255,0.16)]">
          <p className="m-0 mb-2 tracking-[0.18em] text-[#7c819a]">VIEWS · CLICK TO JUMP</p>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {TH.map((item, i) => (
              <button
                key={item.k}
                type="button"
                onClick={() => jump(i, 0)}
                style={{ color: item.col }}
                className={`border px-2.5 py-1.5 text-[10px] tracking-[0.1em] transition-colors cursor-pointer ${
                  curView === i
                    ? 'border-current bg-white/[0.06] font-bold'
                    : 'border-[rgba(160,170,255,0.16)] hover:border-white/40'
                }`}
              >
                {item.k}
              </button>
            ))}
          </div>

          <p className="m-0 mb-2 tracking-[0.18em] text-[#7c819a]">STEPS IN THIS VIEW</p>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {d.beats.map((b, i) => (
              <button
                key={b[0]}
                type="button"
                onClick={() => jump(curView, i)}
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
              kernel, generation
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: CY }} />
              vault, verbatim
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: FA }} />
              failure, quarantine
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: AM }} />
              advisor, lesson
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: PA }} />
              oracle, pass
            </span>
            <span className="flex items-center">
              <i className="inline-block w-2 h-2 mr-1.5" style={{ background: SL }} />
              fixed input
            </span>
          </div>
        </div>
      </div>
    </section>
  );
});

export default AxiomAutonomousKernel;
