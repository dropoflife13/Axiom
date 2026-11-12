'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { AxiomLogo } from '@/components/AxiomLogo';
import type { CheckpointTrial, DeskData } from '@/lib/desk';
import { modelForRun, DEFAULT_RUN_ID } from '@/lib/runs';

export interface AxiomAnatomyProps {
  checkpoint?: CheckpointTrial[];
  desk?: DeskData;
  running?: boolean;
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
}

export interface AssemblyNode {
  id: string;
  name: string;
  badge: string;
  color: number;
  file: string;
  desc: string;
  ring: number;
  ang: number;
  pos: [number, number, number];
  size: [number, number, number];
  top?: number;
}

export interface AssemblySpec {
  id: string;
  name: string;
  badge: string;
  desc: string;
  fileLocation: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: string;
  type: string;
}

/* Palette: Flat functional tones from Axiom Core */
const C_GEN = 0xa855f7;     // Violet
const C_VER = 0x22d3ee;     // Cyan
const C_FAIL = 0xf43f5e;    // Rose
const C_ADV = 0xfbbf24;     // Amber
const C_PASS = 0x34d399;    // Emerald
const C_CHASSIS = 0x94a3b8; // Slate

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/* The Three Orbits of the Orrery */
export const RINGS = [
  { name: 'RING I · EXECUTION LOOP', R: 3.9, w: 0.10, tilt: [0.0, 0.0], lblA: 0.0, ids: ['05', '08', '12'] },
  { name: 'RING II · MEMORY & GATES', R: 6.1, w: 0.06, tilt: [-0.09, 0.1], lblA: 2.1, ids: ['06', '02', '03', '10'] },
  { name: 'RING III · INTAKE & EVIDENCE', R: 8.4, w: 0.035, tilt: [0.12, -0.07], lblA: 4.2, ids: ['01', '04', '09', '11'] },
];

/* The 12 Axiom Assemblies. Ring 0 = Central Sun (Oracle Crucible), Rings 1..3 = Orbiting Planetary Bodies */
export const NODES: AssemblyNode[] = [
  {
    id: '07',
    ring: 0,
    ang: 0,
    name: 'ORACLE CRUCIBLE',
    badge: 'PG 16 · 34 FACTS',
    color: C_VER,
    file: 'scripts/oracle.ts',
    desc: 'The ground-truth reactor and central sun of Axiom. Generating system energy, PostgreSQL 16 in Docker runs migrations as deployer and probes 34 behavioral facts.',
    pos: [0, 0, 0],
    size: [2.1, 2.1, 2.1],
  },
  {
    id: '05',
    ring: 1,
    ang: 200,
    name: 'EXECUTOR',
    badge: 'NEMOTRON-3 · T=0',
    color: C_GEN,
    file: 'src/executor.ts',
    desc: 'The generative core. Calls the model through an OpenAI-compatible client at temperature 0 with token budgets and produces candidate migration SQL.',
    pos: [-3.6, 0, -1.3],
    size: [1.8, 1.8, 1.8],
  },
  {
    id: '08',
    ring: 1,
    ang: 320,
    name: 'VERDICT',
    badge: 'FACT IDS ONLY',
    color: C_FAIL,
    file: 'scripts/facts.ts',
    desc: 'Reports failures strictly as fact IDs and one-line statements. It never leaks corrected SQL back to the model.',
    pos: [3.0, 0, -2.5],
    size: [1.4, 1.4, 1.4],
  },
  {
    id: '12',
    ring: 1,
    ang: 80,
    name: 'ADVISOR',
    badge: '< 24 WORDS · GATED',
    color: C_ADV,
    file: 'src/advisor.ts',
    desc: 'Distills a failed verdict into a rule under 24 words. The lesson stays pending until the next retry passes.',
    pos: [0.7, 0, 3.8],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '06',
    ring: 2,
    ang: 160,
    name: 'GUARDRAILS',
    badge: 'FAIL-CLOSED · CACHE',
    color: C_CHASSIS,
    file: 'src/guardrails.ts',
    desc: 'Fails closed on the daily budget cap, backs off exponentially on HTTP 429 and 503, and serves SHA-256 disk-cached model responses.',
    pos: [-5.7, 0, 2.1],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '02',
    ring: 2,
    ang: 235,
    name: 'RETRIEVAL',
    badge: 'K=10 · OVERLAP RANK',
    color: C_VER,
    file: 'src/memory.ts',
    desc: 'Reads the task feature flags and ranks stored lessons by train failure frequency and feature match, then picks the top K before attempt 1.',
    pos: [-3.5, 0, -5.0],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '03',
    ring: 2,
    ang: 320,
    name: 'LESSON STORE',
    badge: 'READ-ONLY · SHA-256',
    color: C_PASS,
    file: 'fixtures/memory.json',
    desc: 'Immutable memory vault. Lessons are calibrated on Train, loaded read-only and checked by SHA-256 hash so nothing leaks in at run time.',
    pos: [4.7, 0, -3.9],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '10',
    ring: 2,
    ang: 40,
    name: 'CHECKPOINT',
    badge: '720 PROVENANCE TRIALS',
    color: C_PASS,
    file: 'fixtures/checkpoint.json',
    desc: 'Twin ledger. Commits every trial record and its hash right after the trial, so a run can resume after an interruption.',
    pos: [4.7, 0, 3.9],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '01',
    ring: 3,
    ang: 200,
    name: 'TASK BANK',
    badge: '40 · 40 · 120 SPLITS',
    color: C_CHASSIS,
    file: 'fixtures/task-v2/tasks.json',
    desc: 'Seeded tasks split into 40 Train, 40 Dev and 120 held-out Test tasks. Strict schema invariants, never corrected SQL.',
    pos: [-7.9, 0, -2.9],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '04',
    ring: 3,
    ang: 255,
    name: 'CONDITIONS',
    badge: 'A B C C0 D E_B',
    color: C_VER,
    file: 'src/eval/ablation.ts',
    desc: 'Assembles the prompt for the six ablation conditions: baseline, golden rules, retrieved lessons, verbatim facts, placebo and the Tier 0 control.',
    pos: [-2.2, 0, -8.1],
    size: [1.4, 1.4, 1.4],
  },
  {
    id: '09',
    ring: 3,
    ang: 30,
    name: 'SCORER',
    badge: 'BOUND FACTS · F-13',
    color: C_CHASSIS,
    file: 'src/eval/ablation.ts',
    desc: 'Scores each task on its bound facts only. A missing target table (F-13) scores zero.',
    pos: [7.3, 0, 4.2],
    size: [1.3, 1.3, 1.3],
  },
  {
    id: '11',
    ring: 3,
    ang: 335,
    name: 'ANALYSIS',
    badge: 'SIGN-FLIP · HOLM',
    color: C_VER,
    file: 'scripts/analyze-ablation-v2.ts',
    desc: 'Offline statistics after all 720 trials: paired sign-flip tests, bootstrap intervals, exact McNemar and Holm-Bonferroni correction.',
    pos: [7.6, 0, -3.5],
    size: [1.3, 1.3, 1.3],
  },
];

export const BY_ID: Record<string, AssemblyNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const RING_NAME = (n: AssemblyNode) => (n.ring === 0 ? 'CORE · THE SUN' : RINGS[n.ring - 1].name);

export const ASSEMBLIES: AssemblySpec[] = NODES.map((n) => {
  const r = n.ring === 0 ? 0 : RINGS[n.ring - 1].R;
  const rad = (n.ang * Math.PI) / 180;
  return {
    id: n.id,
    name: n.name,
    badge: n.badge,
    desc: n.desc,
    fileLocation: n.file,
    x: Math.cos(rad) * r,
    y: Math.sin(rad) * r,
    w: 1.2,
    d: 1.2,
    h: 1.2,
    color: hex(n.color),
    type: n.ring === 0 ? 'sun' : 'planet',
  };
});

/* The 12 Buses */
export const EDGES: [string, string, number][] = [
  ['01', '04', C_CHASSIS],
  ['04', '02', C_VER],
  ['02', '03', C_PASS],
  ['02', '06', C_VER],
  ['06', '05', C_GEN],
  ['05', '07', C_GEN],
  ['07', '08', C_FAIL],
  ['08', '12', C_FAIL],
  ['12', '05', C_ADV],
  ['08', '10', C_PASS],
  ['10', '03', C_PASS],
  ['10', '11', C_VER],
];

const ek = (a: string, b: string) => `${a}-${b}`;

/* The Healing Loop Stages */
export const STAGES = [
  {
    name: 'GENERATE',
    node: '05',
    edges: ['01-04', '04-02', '02-03', '02-06', '06-05'],
    color: C_GEN,
    msg: '[EXECUTOR] Task ingress from 01 Task Bank -> 04 Conditions -> 02 Retrieval -> 06 Guardrails -> 05 Executor compiles SQL',
  },
  {
    name: 'VERIFY',
    node: '07',
    edges: ['05-07'],
    color: C_VER,
    msg: '[ORACLE CRUCIBLE · THE SUN] Fresh PG 16 container · solar core generates ground truth · migration verified',
  },
  {
    name: 'FAIL',
    node: '08',
    edges: ['07-08'],
    color: C_FAIL,
    msg: '[VERDICT] 34 facts probed under role application · tripped invariants: F-05 F-19 F-20',
  },
  {
    name: 'ADVISE',
    node: '12',
    edges: ['08-12'],
    color: C_ADV,
    msg: '[ADVISOR] Failure distilled into a lesson under 24 words · queued for retry',
  },
  {
    name: 'RETRY',
    node: '05',
    edges: ['12-05', '05-07'],
    color: C_GEN,
    msg: '[EXECUTOR] Retry with advice injected · regenerating migration SQL to Oracle Crucible',
  },
  {
    name: 'PASS',
    node: '10',
    edges: ['07-08', '08-10', '10-03', '10-11'],
    color: C_PASS,
    msg: '[CHECKPOINT] Bound facts 100% verified · provenance hash committed to ledger & memory vault',
  },
];

/* ---------------------------------------------------------------------------
   Procedural Noise & Texture Generators (Self-Contained Canvas PBR Textures)
   --------------------------------------------------------------------------- */
function hash(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, per: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % per) + per) % per;
  const x1 = (x0 + 1) % per;
  const a = hash(x0, iy);
  const b = hash(x1, iy);
  const c = hash(x0, iy + 1);
  const d = hash(x1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, fx: number, fy: number, oct: number): number {
  let s = 0;
  let a = 0.5;
  let t = 0;
  for (let i = 0; i < oct; i++) {
    const f = 1 << i;
    s += a * vnoise(u * fx * f, v * fy * f, fx * f);
    t += a;
    a *= 0.5;
  }
  return s / t;
}

type RGB = [number, number, number];

function mixc(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function ramp(pal: RGB[], t: number): RGB {
  const clamped = Math.min(0.9999, Math.max(0, t)) * (pal.length - 1);
  const i = Math.floor(clamped);
  return mixc(pal[i], pal[i + 1], clamped - i);
}

const PAL: Record<string, RGB[]> = {
  violet:  [[26, 12, 62], [64, 28, 138], [124, 58, 237], [168, 85, 247], [224, 200, 255]],
  cyan:    [[5, 34, 50], [8, 88, 118], [30, 160, 196], [34, 211, 238], [196, 248, 255]],
  rose:    [[38, 6, 16], [104, 14, 38], [184, 24, 58], [244, 63, 94], [253, 170, 180]],
  amber:   [[54, 30, 6], [136, 78, 12], [214, 148, 20], [251, 191, 36], [254, 243, 205]],
  emerald: [[6, 38, 28], [12, 98, 68], [22, 156, 108], [52, 211, 153], [196, 250, 228]],
  slate:   [[22, 28, 40], [54, 64, 82], [98, 114, 138], [148, 163, 184], [226, 232, 242]],
};

function mk(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d')!;
  const im = cx.createImageData(w, h);
  return { cv, cx, im, d: im.data };
}

function tex(o: { cv: HTMLCanvasElement }, maxAniso = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(o.cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

interface SurfResult {
  c: RGB;
  h: number;
  e?: RGB | null;
}

function surf(w: number, h: number, fn: (u: number, v: number) => SurfResult, maxAniso = 4) {
  const C = mk(w, h);
  const H = mk(w, h);
  const E = mk(w, h);
  let hasE = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = fn((x + 0.5) / w, (y + 0.5) / h);
      const i = (y * w + x) * 4;
      const g = r.h * 255;
      C.d[i] = r.c[0];
      C.d[i + 1] = r.c[1];
      C.d[i + 2] = r.c[2];
      C.d[i + 3] = 255;
      H.d[i] = g;
      H.d[i + 1] = g;
      H.d[i + 2] = g;
      H.d[i + 3] = 255;
      if (r.e) {
        hasE = true;
        E.d[i] = r.e[0];
        E.d[i + 1] = r.e[1];
        E.d[i + 2] = r.e[2];
      }
      E.d[i + 3] = 255;
    }
  }
  C.cx.putImageData(C.im, 0, 0);
  H.cx.putImageData(H.im, 0, 0);
  const out: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; emi: THREE.CanvasTexture | null } = {
    map: tex(C, maxAniso),
    bump: tex(H, maxAniso),
    emi: null,
  };
  if (hasE) {
    E.cx.putImageData(E.im, 0, 0);
    out.emi = tex(E, maxAniso);
  }
  return out;
}

function gasFn(pal: RGB[], bands: number, storm: [number, number] | null) {
  return (u: number, v: number): SurfResult => {
    const w = fbm(u, v, 4, 6, 3);
    const b = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * bands + w * 7);
    const t = b * 0.62 + fbm(u, v, 10, 20, 3) * 0.38;
    let c = ramp(pal, t);
    if (storm) {
      const dx = (u - storm[0]) / 0.07;
      const dy = (v - storm[1]) / 0.045;
      const d = dx * dx + dy * dy;
      if (d < 1) c = mixc(c, pal[4], (1 - d) * 0.85);
    }
    return { c, h: t };
  };
}

function plasmaFn(pal: RGB[]) {
  return (u: number, v: number): SurfResult => {
    const t = Math.pow(fbm(u, v, 6, 6, 5), 1.3) * 1.28;
    const c = ramp(pal, t);
    return { c, h: t, e: c };
  };
}

function crackedFn(pal: RGB[], glow: RGB) {
  return (u: number, v: number): SurfResult => {
    const n = fbm(u, v, 6, 6, 4);
    const ridge = 1 - Math.abs(n * 2 - 1);
    const cr = Math.max(0, Math.min(1, (ridge - 0.9) / 0.07));
    const base = ramp(pal, 0.12 + 0.5 * fbm(u, v, 12, 12, 3));
    const c = mixc(base, pal[0], cr);
    return { c, h: 0.7 - cr * 0.5, e: [glow[0] * cr, glow[1] * cr, glow[2] * cr] };
  };
}

function mod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

function hexFn(pal: RGB[], cols: number, asp: number) {
  return (u: number, v: number): SurfResult => {
    const px = u * cols;
    const py = v * cols * asp;
    const ax = mod(px, 1) - 0.5;
    const ay = mod(py, 1.7320508) - 0.8660254;
    const bx = mod(px - 0.5, 1) - 0.5;
    const by = mod(py - 0.8660254, 1.7320508) - 0.8660254;
    let gx = ax;
    let gy = ay;
    if (bx * bx + by * by < ax * ax + ay * ay) {
      gx = bx;
      gy = by;
    }
    const cVal = Math.max(0.5 * Math.abs(gx) + 0.8660254 * Math.abs(gy), Math.abs(gx));
    const edge = 0.5 - cVal;
    const id = hash(Math.floor((px - gx) * 4), Math.floor((py - gy) * 4));
    let col = ramp(pal, 0.34 + 0.38 * id + 0.12 * fbm(u, v, 8, 8, 2));
    const line = edge < 0.04;
    if (line) col = mixc(col, pal[0], 0.85);
    const e: RGB | null = line
      ? [pal[4][0] * 0.5, pal[4][1] * 0.5, pal[4][2] * 0.5]
      : id > 0.94
      ? [pal[3][0] * 0.7, pal[3][1] * 0.7, pal[3][2] * 0.7]
      : null;
    return { c: col, h: line ? 0.15 : 0.55 + id * 0.2, e };
  };
}

function steelFn(pal: RGB[], pan: number) {
  return (u: number, v: number): SurfResult => {
    const s = fbm(u, v, 2, 90, 3);
    const t = 0.42 + 0.4 * s;
    const line =
      Math.abs(mod(u * pan, 1) - 0.5) > 0.486 ||
      Math.abs(mod(v * pan * 0.5, 1) - 0.5) > 0.482;
    let c = ramp(pal, t);
    if (line) c = mixc(c, pal[0], 0.72);
    return { c, h: line ? 0.12 : 0.5 + s * 0.2 };
  };
}

function circuitFn(pal: RGB[]) {
  return (u: number, v: number): SurfResult => {
    const cu = u * 24;
    const cv = v * 12;
    const iu = Math.floor(cu);
    const iv = Math.floor(cv);
    const fu = cu - iu;
    const fv = cv - iv;
    const hh = hash(iu, iv);
    const vert = hh > 0.55 && Math.abs(fu - 0.5) < 0.07;
    const horiz = hh < 0.45 && Math.abs(fv - 0.5) < 0.12;
    const pad = Math.hypot(fu - 0.5, fv - 0.5) < 0.17 && hash(iu + 7, iv + 3) > 0.62;
    const base = ramp(pal, 0.1 + 0.22 * fbm(u, v, 8, 8, 3));
    const trace = vert || horiz || pad;
    const c = trace ? ramp(pal, 0.86) : base;
    return {
      c,
      h: trace ? 0.85 : 0.3,
      e: trace ? [pal[3][0] * 0.8, pal[3][1] * 0.8, pal[3][2] * 0.8] : null,
    };
  };
}

function ringTex(pal: RGB[], maxAniso = 4): THREE.CanvasTexture {
  const w = 256;
  const o = mk(w, 4);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const s = 0.5 + 0.5 * Math.sin(t * 70 + fbm(t, 0.5, 8, 1, 3) * 9);
    const a = Math.max(0, Math.min(1, 0.18 + 0.85 * s)) * (t < 0.04 || t > 0.97 ? 0.4 : 1);
    const c = ramp(pal, 0.35 + 0.55 * s);
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      o.d[i] = c[0];
      o.d[i + 1] = c[1];
      o.d[i + 2] = c[2];
      o.d[i + 3] = a * 255;
    }
  }
  o.cx.putImageData(o.im, 0, 0);
  return tex(o, maxAniso);
}

/* Material & Geometry Helpers */
interface BodyContext {
  anim: ((dt: number, t: number) => void)[];
  mats: THREE.Material[];
  R: number;
  factPts?: THREE.Points;
  factCol?: Float32Array;
  corona?: THREE.Mesh;
}

function pbr(ctx: BodyContext, s: any, o: any = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: s.map,
    bumpMap: s.bump,
    bumpScale: o.bump == null ? 0.9 : o.bump,
    roughness: o.rough == null ? 0.5 : o.rough,
    metalness: o.metal == null ? 0.2 : o.metal,
    flatShading: Boolean(o.flat),
  });
  if (s.emi) {
    m.emissiveMap = s.emi;
    m.emissive = new THREE.Color(0xffffff);
    m.userData.ei0 = o.ei == null ? 1 : o.ei;
  } else {
    m.emissive = new THREE.Color(o.tint == null ? 0x000000 : o.tint);
    m.userData.ei0 = o.ei == null ? 0.08 : o.ei;
  }
  m.emissiveIntensity = m.userData.ei0;
  if (o.color != null) m.color.setHex(o.color);
  ctx.mats.push(m);
  return m;
}

function plain(ctx: BodyContext, color: number, o: any = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough == null ? 0.35 : o.rough,
    metalness: o.metal == null ? 0.55 : o.metal,
    emissive: color,
    flatShading: Boolean(o.flat),
  });
  m.userData.ei0 = o.ei == null ? 0.25 : o.ei;
  m.emissiveIntensity = m.userData.ei0;
  ctx.mats.push(m);
  return m;
}

function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos?: [number, number, number],
  rot?: [number, number, number]
) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

function rbox(w: number, h: number, d: number, r: number) {
  const g = new THREE.BoxGeometry(w, h, d, 8, 8, 8);
  const p = g.attributes.position;
  const nm = g.attributes.normal;
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(
      Math.max(-hx, Math.min(hx, v.x)),
      Math.max(-hy, Math.min(hy, v.y)),
      Math.max(-hz, Math.min(hz, v.z))
    );
    const o = v.clone().sub(q);
    if (o.lengthSq() > 1e-8) {
      o.normalize();
      v.copy(q).addScaledVector(o, r);
      nm.setXYZ(i, o.x, o.y, o.z);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function hexPrism(r: number, depth: number, bevel: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 6,
  });
  g.rotateX(Math.PI / 2);
  g.center();
  return g;
}

function ringMesh(
  ctx: BodyContext,
  parent: THREE.Object3D,
  R: number,
  tube: number,
  color: number,
  tilt: [number, number, number]
) {
  const m = mesh(parent, new THREE.TorusGeometry(R, tube, 14, 100), plain(ctx, color, { ei: 0.5 }));
  m.rotation.set(tilt[0], tilt[1], tilt[2]);
  return m;
}

/* ---------------------------------------------------------------------------
   Procedural 3D Builders for All 12 Assemblies (The Orrery Bodies)
   --------------------------------------------------------------------------- */
const BUILD: Record<string, (g: THREE.Group, color: number, ctx: BodyContext, maxAniso: number) => void> = {};

// 01 TASK BANK: steel core with a ring cut 20 / 20 / 60 (train / dev / test)
BUILD['01'] = (g, _c, ctx, maxAniso) => {
  const steel = surf(256, 128, steelFn(PAL.slate, 8), maxAniso);
  mesh(g, new THREE.SphereGeometry(0.58, 40, 28), pbr(ctx, steel, { metal: 0.55, rough: 0.38, tint: 0x94a3b8 }));
  let acc = 0;
  const tint = [0x7c869a, 0xb4bfd0, 0xffffff];
  [0.2, 0.2, 0.6].forEach((p, i) => {
    const L = p * Math.PI * 2;
    const len = L - 0.16;
    const tg = new THREE.TorusGeometry(1.0, 0.075, 14, Math.max(10, Math.round(len * 14)), len);
    tg.rotateZ(acc + 0.08);
    acc += L;
    const m = mesh(g, tg, pbr(ctx, steel, { metal: 0.6, rough: 0.34, color: tint[i], tint: 0x94a3b8 }));
    m.rotation.x = 1.15;
  });
  ctx.R = 1.3;
};

// 04 CONDITIONS: soft hex core with circuit skin and six orbiting satellites
BUILD['04'] = (g, _c, ctx, maxAniso) => {
  const cir = surf(128, 128, circuitFn(PAL.cyan), maxAniso);
  mesh(g, hexPrism(0.5, 0.42, 0.07), pbr(ctx, cir, { metal: 0.45, rough: 0.35, bump: 0.5 }));
  const orb = new THREE.Group();
  g.add(orb);
  const sm = pbr(ctx, cir, { metal: 0.5, rough: 0.3, bump: 0.4 });
  const ring = mesh(orb, new THREE.TorusGeometry(0.98, 0.012, 6, 70), plain(ctx, C_VER, { ei: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    mesh(orb, rbox(0.22, 0.22, 0.22, 0.05), sm, [Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98], [0.3 * i, 0.5 * i, 0]);
  }
  ctx.anim.push((dt) => {
    orb.rotation.y += dt * 0.6;
  });
  ctx.R = 1.35;
};

// 02 RETRIEVAL: glowing circuit sphere inside a solid targeting reticle
BUILD['02'] = (g, _c, ctx, maxAniso) => {
  const cir = surf(256, 128, circuitFn(PAL.cyan), maxAniso);
  mesh(g, new THREE.SphereGeometry(0.36, 36, 24), pbr(ctx, cir, { metal: 0.4, rough: 0.35, bump: 0.5 }));
  const r = new THREE.Group();
  g.add(r);
  mesh(r, new THREE.TorusGeometry(0.82, 0.04, 14, 70), plain(ctx, C_VER, { ei: 0.4 }));
  const inner = mesh(r, new THREE.TorusGeometry(0.55, 0.022, 10, 56), plain(ctx, C_VER, { ei: 0.5 }));
  inner.rotation.x = Math.PI / 2.6;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    mesh(
      r,
      rbox(0.07, 0.3, 0.07, 0.025),
      plain(ctx, 0xcffafe, { ei: 0.5 }),
      [Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0],
      [0, 0, a - Math.PI / 2]
    );
  }
  r.rotation.x = 0.9;
  ctx.anim.push((dt) => {
    r.rotation.z += dt * 0.5;
  });
  ctx.R = 1.15;
};

// 03 LESSON STORE: sealed emerald vault with hex panels, steel flanges and corner posts
BUILD['03'] = (g, _c, ctx, maxAniso) => {
  const hx = surf(256, 256, hexFn(PAL.emerald, 6, 1), maxAniso);
  const st = surf(128, 128, steelFn(PAL.slate, 4), maxAniso);
  mesh(g, hexPrism(0.5, 0.72, 0.07), pbr(ctx, hx, { metal: 0.35, rough: 0.35, bump: 1.1 }));
  [0.5, -0.5].forEach((y) => {
    mesh(g, hexPrism(0.64, 0.06, 0.03), pbr(ctx, st, { metal: 0.6, rough: 0.35, tint: 0x34d399, ei: 0.1 }), [0, y, 0]);
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 1.08, 14), plain(ctx, C_PASS, { ei: 0.35 }), [
      Math.cos(a) * 0.66,
      0,
      Math.sin(a) * 0.66,
    ]);
  }
  ctx.anim.push((dt) => {
    g.rotation.y += dt * 0.22;
  });
  ctx.R = 1.25;
};

// 06 GUARDRAILS: octagonal steel gate with an energy membrane
BUILD['06'] = (g, _c, ctx, maxAniso) => {
  const st = surf(256, 128, steelFn(PAL.slate, 8), maxAniso);
  mesh(g, new THREE.TorusGeometry(0.72, 0.15, 18, 8), pbr(ctx, st, { metal: 0.6, rough: 0.35, tint: 0x94a3b8, bump: 0.8 }));
  const cir = surf(128, 128, circuitFn(PAL.slate), maxAniso);
  const mem = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 8),
    new THREE.MeshBasicMaterial({
      map: cir.emi || cir.map,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  g.add(mem);
  [-1, 1].forEach((s) => {
    mesh(g, rbox(0.16, 0.34, 0.16, 0.05), pbr(ctx, st, { metal: 0.6, rough: 0.35 }), [s * 0.9, -0.5, 0]);
  });
  ctx.anim.push((_dt, t) => {
    g.rotation.y = Math.sin(t * 0.5) * 0.9;
  });
  ctx.R = 1.2;
};

// 05 EXECUTOR: banded violet gas giant with a planetary ring system and orbiting moon
BUILD['05'] = (g, _c, ctx, maxAniso) => {
  const gas = surf(256, 128, gasFn(PAL.violet, 7, [0.3, 0.56]), maxAniso);
  const s = mesh(g, new THREE.SphereGeometry(0.82, 56, 40), pbr(ctx, gas, { metal: 0.05, rough: 0.55, bump: 0.35, tint: 0x6d28d9 }));
  const rg = new THREE.RingGeometry(1.1, 1.75, 96, 1);
  const pos = rg.attributes.position;
  const uv = rg.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    uv.setXY(i, (v3.length() - 1.1) / 0.65, 0.5);
  }
  const ringG = new THREE.Group();
  ringG.rotation.z = 0.35;
  g.add(ringG);
  const ring = mesh(
    ringG,
    rg,
    new THREE.MeshStandardMaterial({
      map: ringTex(PAL.violet, maxAniso),
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.1,
      depthWrite: false,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.25,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.material.userData.ei0 = 0.25;
  ctx.mats.push(ring.material);

  const moonO = new THREE.Group();
  g.add(moonO);
  const rock = surf(128, 64, gasFn(PAL.violet, 3, null), maxAniso);
  mesh(moonO, new THREE.SphereGeometry(0.14, 20, 14), pbr(ctx, rock, { rough: 0.6, bump: 0.5 }), [2.0, 0.2, 0]);
  ctx.anim.push((dt) => {
    s.rotation.y += dt * 0.4;
    moonO.rotation.y += dt * 0.5;
  });
  ctx.R = 1.9;
};

// 08 VERDICT: glossy cracked obsidian crystal with fault lines that glow, plus three orbiting fact shards
BUILD['08'] = (g, _c, ctx, maxAniso) => {
  const ob = surf(256, 128, crackedFn(PAL.rose, [255, 70, 100]), maxAniso);
  const cg = new THREE.OctahedronGeometry(0.62, 0);
  cg.scale(1, 1.65, 1);
  const c = mesh(g, cg, pbr(ctx, ob, { metal: 0.45, rough: 0.22, flat: true, bump: 0.6, ei: 1.0 }));
  const sh = new THREE.Group();
  g.add(sh);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sg = new THREE.OctahedronGeometry(0.14, 0);
    sg.scale(1, 1.6, 1);
    mesh(sh, sg, pbr(ctx, ob, { metal: 0.45, rough: 0.22, flat: true, ei: 1.0 }), [
      Math.cos(a) * 1.1,
      0.05 * i,
      Math.sin(a) * 1.1,
    ]);
  }
  ctx.anim.push((dt) => {
    c.rotation.y += dt * 0.5;
    sh.rotation.y -= dt * 0.9;
  });
  ctx.R = 1.4;
};

// 12 ADVISOR: banded amber distillation flask with a glowing levitating droplet
BUILD['12'] = (g, _c, ctx, maxAniso) => {
  const br = surf(256, 128, gasFn(PAL.amber, 9, null), maxAniso);
  const prof = [
    [0.001, -0.62],
    [0.42, -0.58],
    [0.66, -0.4],
    [0.72, -0.14],
    [0.62, 0.1],
    [0.4, 0.28],
    [0.26, 0.46],
    [0.24, 0.7],
    [0.3, 0.8],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  mesh(g, new THREE.LatheGeometry(prof, 44), pbr(ctx, br, { metal: 0.5, rough: 0.3, bump: 0.5, tint: 0xb45309 }));
  mesh(g, new THREE.TorusGeometry(0.27, 0.045, 10, 36), plain(ctx, 0xfde68a, { ei: 0.3 }), [0, 0.62, 0], [Math.PI / 2, 0, 0]);
  const d = mesh(g, new THREE.SphereGeometry(0.11, 20, 14), plain(ctx, 0xfef3c7, { ei: 1.2, rough: 0.2, metal: 0.1 }), [0, 1.0, 0]);
  ctx.anim.push((_dt, t) => {
    d.position.y = 1.0 + Math.sin(t * 3) * 0.07;
  });
  ctx.R = 1.25;
};

// 09 SCORER: steel balance scale with a beam that settles and tips
BUILD['09'] = (g, _c, ctx, maxAniso) => {
  const st = surf(256, 128, steelFn(PAL.slate, 8), maxAniso);
  const sm = pbr(ctx, st, { metal: 0.65, rough: 0.33, tint: 0x94a3b8 });
  const base = [
    [0.001, -0.56],
    [0.44, -0.54],
    [0.46, -0.5],
    [0.3, -0.42],
    [0.1, -0.3],
    [0.001, -0.3],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  mesh(g, new THREE.LatheGeometry(base, 32), sm);
  mesh(g, new THREE.CylinderGeometry(0.06, 0.09, 0.95, 18), sm, [0, -0.02, 0]);
  const bg = new THREE.Group();
  bg.position.y = 0.46;
  g.add(bg);
  mesh(bg, rbox(1.55, 0.09, 0.09, 0.035), sm);
  mesh(bg, new THREE.SphereGeometry(0.075, 16, 12), plain(ctx, 0xe2e8f0, { ei: 0.3 }));
  const pan = [
    [0.001, -0.05],
    [0.24, -0.03],
    [0.3, 0.0],
    [0.26, 0.02],
    [0.001, -0.02],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  [-0.7, 0.7].forEach((x) => {
    mesh(bg, new THREE.LatheGeometry(pan, 28), sm, [x, -0.44, 0]);
    const lg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0, 0),
      new THREE.Vector3(x - 0.22, -0.43, 0),
      new THREE.Vector3(x, 0, 0),
      new THREE.Vector3(x + 0.22, -0.43, 0),
    ]);
    bg.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xcbd5e1 })));
  });
  ctx.anim.push((dt, t) => {
    bg.rotation.z = Math.sin(t * 1.3) * 0.13;
    g.rotation.y += dt * 0.2;
  });
  ctx.R = 1.35;
};

// 10 CHECKPOINT: twin ledger drums in a steel cradle, counter-rotating
BUILD['10'] = (g, _c, ctx, maxAniso) => {
  const hx = surf(256, 128, hexFn(PAL.emerald, 14, 0.5), maxAniso);
  const st = surf(128, 128, steelFn(PAL.slate, 4), maxAniso);
  const sideM = pbr(ctx, hx, { metal: 0.4, rough: 0.35, bump: 1.0 });
  const capM = pbr(ctx, st, { metal: 0.65, rough: 0.3, tint: 0x34d399, ei: 0.1 });
  const drums: THREE.Mesh[] = [];
  [-1, 1].forEach((s) => {
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.98, 36);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, [sideM, capM, capM]);
    m.position.set(0, 0, s * 0.45);
    g.add(m);
    drums.push(m);
    mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 1.16, 16).rotateZ(Math.PI / 2), capM, [0, 0, s * 0.45]);
  });
  mesh(g, rbox(1.1, 0.09, 1.3, 0.04), capM, [0, -0.46, 0]);
  ctx.anim.push((dt) => {
    drums[0].rotation.x += dt * 0.8;
    drums[1].rotation.x -= dt * 0.8;
  });
  ctx.R = 1.25;
};

// 11 ANALYSIS: distribution of glossy histogram bars on a steel plate
BUILD['11'] = (g, _c, ctx, maxAniso) => {
  const st = surf(128, 64, steelFn(PAL.slate, 4), maxAniso);
  mesh(g, rbox(1.85, 0.07, 0.56, 0.03), pbr(ctx, st, { metal: 0.6, rough: 0.35 }), [0, -0.46, 0]);
  [0.15, 0.3, 0.55, 0.85, 1, 0.85, 0.55, 0.3, 0.15].forEach((h, i) => {
    const hh = h * 0.95;
    const c = ramp(PAL.cyan, 0.25 + 0.7 * h);
    const col = (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    mesh(
      g,
      rbox(0.15, hh, 0.15, 0.04),
      plain(ctx, col, { ei: 0.28, rough: 0.25, metal: 0.35 }),
      [(i - 4) * 0.2, -0.425 + hh / 2, 0]
    );
  });
  ctx.anim.push((dt) => {
    g.rotation.y += dt * 0.25;
  });
  ctx.R = 1.3;
};

// 07 ORACLE CRUCIBLE: THE CENTRAL SUN GENERATING SYSTEM ENERGY
BUILD['07'] = (g, color, ctx, maxAniso) => {
  // Boiling solar plasma surface
  const pl = surf(256, 128, plasmaFn(PAL.cyan), maxAniso);
  const core = mesh(g, new THREE.SphereGeometry(1.05, 56, 40), new THREE.MeshBasicMaterial({ map: pl.map }));

  // Radiant Solar Corona Atmosphere (Additive blending energy aura)
  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const corona = mesh(g, new THREE.SphereGeometry(1.25, 32, 24), coronaMat);

  // Dynamic solar containment & flare rings
  const ring1 = ringMesh(ctx, g, 1.58, 0.04, C_VER, [Math.PI / 2.4, 0, 0]);
  const ring2 = ringMesh(ctx, g, 1.84, 0.026, 0xcffafe, [0, 0, Math.PI / 3]);
  const ringEquator = mesh(
    g,
    new THREE.TorusGeometry(1.36, 0.015, 8, 80),
    plain(ctx, 0x38bdf8, { ei: 0.6 })
  );
  ringEquator.rotation.x = Math.PI / 2;

  // 34 Fact Energy Points orbiting the sun like coronal mass ejections / solar flares
  const pos = new Float32Array(34 * 3);
  const factCol = new Float32Array(34 * 3);
  const cc = new THREE.Color(color);
  for (let i = 0; i < 34; i++) {
    const y = 1 - (i / 33) * 2;
    const rr = Math.sqrt(1 - y * y);
    const ph = i * 2.39996;
    pos[i * 3] = Math.cos(ph) * rr * 2.22;
    pos[i * 3 + 1] = y * 2.22;
    pos[i * 3 + 2] = Math.sin(ph) * rr * 2.22;
    factCol[i * 3] = cc.r;
    factCol[i * 3 + 1] = cc.g;
    factCol[i * 3 + 2] = cc.b;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(factCol, 3));
  const factPts = new THREE.Points(
    pg,
    new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
    })
  );
  g.add(factPts);

  ctx.factPts = factPts;
  ctx.factCol = factCol;
  ctx.corona = corona;

  ctx.anim.push((dt, t) => {
    core.rotation.y -= dt * 0.12;
    factPts.rotation.y += dt * 0.08;
    factPts.rotation.x += dt * 0.04;
    ring1.rotation.z += dt * 0.2;
    ring2.rotation.y -= dt * 0.18;
    const pulse = 1.0 + Math.sin(t * 3.0) * 0.05;
    corona.scale.setScalar(pulse);
    coronaMat.opacity = 0.26 + Math.sin(t * 4.0) * 0.08;
  });
  ctx.R = 1.7;
};

function getAdj(id: string) {
  const from: string[] = [];
  const to: string[] = [];
  EDGES.forEach((e) => {
    if (e[1] === id && BY_ID[e[0]]) from.push(`${e[0]} ${BY_ID[e[0]].name}`);
    if (e[0] === id && BY_ID[e[1]]) to.push(`${e[1]} ${BY_ID[e[1]].name}`);
  });
  return {
    from: from.join(' · ') || 'task prompt',
    to: to.join(' · ') || 'end of pipeline',
  };
}

const FREQ_LABELS = ['60', '125', '250', '500', '1k', '2k', '4k', '8k', '12k', '16k', '24k', '32k'];
const CONDITIONS = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;

export const AxiomAnatomy = React.memo(function AxiomAnatomy({
  checkpoint,
  desk,
  running: initialRunning = true,
  snapshot,
}: AxiomAnatomyProps = {}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const labelsRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [selId, setSelId] = React.useState('07'); // Default: Oracle Crucible (The Sun)
  const [stageIdx, setStageIdx] = React.useState(0);
  const [looping, setLooping] = React.useState(initialRunning);
  const [orbiting, setOrbiting] = React.useState(true);
  const [rotating, setRotating] = React.useState(false);
  const [exploded, setExploded] = React.useState(false);
  const [webglError, setWebglError] = React.useState(false);

  // Fast direct DOM readout refs
  const azRef = React.useRef<HTMLElement>(null);
  const elRef = React.useRef<HTMLElement>(null);
  const turnSliderRef = React.useRef<HTMLInputElement>(null);
  const turnOutRef = React.useRef<HTMLOutputElement>(null);

  // State ref for high-frequency animation loop
  const stateRef = React.useRef({
    selId: '07',
    hoverId: null as string | null,
    stageIdx: 0,
    looping: initialRunning,
    orbiting: true,
    rotating: false,
    exploded: false,
    draggingSlider: false,
    targetView: null as { theta: number; phi: number; r: number } | null,
  });

  stateRef.current.selId = selId;
  stateRef.current.stageIdx = stageIdx;
  stateRef.current.looping = looping;
  stateRef.current.orbiting = orbiting;
  stateRef.current.rotating = rotating;
  stateRef.current.exploded = exploded;

  // Active Model & Metadata
  const activeRunId = snapshot?.runId ?? DEFAULT_RUN_ID;
  const activeCommit = snapshot?.commit ?? 'live';
  const isLive = Boolean(snapshot?.isLive);
  const activeModel = snapshot?.model ?? modelForRun(activeRunId);

  // Compute live telemetry from checkpoint
  const trialCount = checkpoint && checkpoint.length > 0 ? checkpoint.length : 0;

  const convergenceVal = React.useMemo(() => {
    if (desk?.convergence !== null && desk?.convergence !== undefined) return desk.convergence;
    if (checkpoint && checkpoint.length > 0) {
      const sum = checkpoint.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0);
      return sum / checkpoint.length;
    }
    return 0;
  }, [desk?.convergence, checkpoint]);

  const conditionCounts = React.useMemo(() => {
    return CONDITIONS.map((c) => {
      if (checkpoint && checkpoint.length > 0) {
        return checkpoint.filter((t) => t.condition === c).length;
      }
      return 0;
    });
  }, [checkpoint]);

  // Preset Views (Targeting the central Oracle Sun at [0, 0, 0])
  const setCameraView = React.useCallback((view: 'front' | 'side' | 'top' | 'iso') => {
    const dist = window.innerWidth / window.innerHeight < 0.9 ? 34 : 24;
    const VIEWS = {
      front: { theta: 0, phi: Math.PI / 2 },
      side:  { theta: Math.PI / 2, phi: Math.PI / 2 },
      top:   { theta: 0, phi: 0.12 },
      iso:   { theta: 0.62, phi: 1.12 },
    };
    const v = VIEWS[view];
    stateRef.current.rotating = false;
    setRotating(false);
    stateRef.current.targetView = { theta: v.theta, phi: v.phi, r: dist };
  }, []);

  // Three.js Mount & Animation Loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const labelsEl = labelsRef.current;
    const container = containerRef.current;
    if (!canvas || !labelsEl || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x05060a, 0);
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const labelRenderer = new CSS2DRenderer({ element: labelsEl });

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcdd6ff, 0x1a1030, 0.95));

    // THE ORACLE SUN LIGHTING: The central Oracle Crucible lights every other body in the system!
    const sunLight = new THREE.PointLight(0xe8fcff, 2.5, 75);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const sunCoronaLight = new THREE.PointLight(0x22d3ee, 1.8, 32);
    sunCoronaLight.position.set(0, 0, 0);
    scene.add(sunCoronaLight);

    const topLight = new THREE.DirectionalLight(0xbfc8ff, 0.5);
    topLight.position.set(5, 10, 8);
    scene.add(topLight);

    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
    const ctl = new OrbitControls(cam, canvas);
    ctl.enablePan = false;
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 9;
    ctl.maxDistance = 44;
    ctl.minPolarAngle = 0.05;
    ctl.maxPolarAngle = Math.PI / 2 + 0.3;
    ctl.autoRotateSpeed = 1.4;
    ctl.target.set(0, 0, 0);

    const T = { value: 0 };
    const FLOOR = -4.0;
    const TR = 12.6;

    // Floor Astrolabe: Turntable degree ring, celestial grid & starfield
    const p: number[] = [];
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const isLong = d % 30 === 0;
      const r2 = TR + (isLong ? 0.4 : 0.18);
      p.push(Math.sin(a) * TR, FLOOR, Math.cos(a) * TR, Math.sin(a) * r2, FLOOR, Math.cos(a) * r2);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(floorGeo, new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.55 })));

    const circ: THREE.Vector3[] = [];
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      circ.push(new THREE.Vector3(Math.sin(t) * TR, FLOOR, Math.cos(t) * TR));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.4 })));

    const frontPointer = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.24), new THREE.MeshBasicMaterial({ color: 0xe8eaf2 }));
    frontPointer.position.set(0, FLOOR, TR + 0.9);
    frontPointer.rotation.y = Math.PI / 4;
    scene.add(frontPointer);

    const grid = new THREE.GridHelper(60, 60, 0x2a3160, 0x141936);
    grid.position.y = FLOOR - 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    scene.add(grid);

    // Deep Cosmic Starfield
    const starCount = 700;
    const starP = new Float32Array(starCount * 3);
    for (let k = 0; k < starCount; k++) {
      const u = Math.random() * 2 - 1;
      const tt = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 20;
      const s = Math.sqrt(1 - u * u);
      starP[k * 3] = r * s * Math.cos(tt);
      starP[k * 3 + 1] = r * u;
      starP[k * 3 + 2] = r * s * Math.sin(tt);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starP, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xa0aaff, size: 0.2, transparent: true, opacity: 0.5, sizeAttenuation: true })));

    // Vertical Floor Drop Indicator
    const drop = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 1, 0.012),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    drop.visible = false;
    scene.add(drop);

    // Scene Graph: Bodies, Orbits, Picks, Labels
    const rec: Record<
      string,
      {
        n: AssemblyNode;
        g: THREE.Group;
        ctx: BodyContext;
        selMesh: THREE.Mesh;
        el: HTMLDivElement;
        wp: THREE.Vector3;
      }
    > = {};
    const picks: THREE.Mesh[] = [];
    const ringsObj: any[] = [];

    const makeLabel = (n: AssemblyNode, y: number) => {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.style.setProperty('--c', hex(n.color));
      el.innerHTML = `<span>${n.id} · ${n.name}</span><small>${n.badge}</small>`;
      const obj = new CSS2DObject(el);
      obj.position.set(0, y, 0);
      return { el, obj };
    };

    const makeBody = (n: AssemblyNode, parent: THREE.Object3D) => {
      const g = new THREE.Group();
      parent.add(g);
      const body = new THREE.Group();
      g.add(body);
      const ctx: BodyContext = { anim: [], mats: [], R: 1.2 };
      BUILD[n.id](body, n.color, ctx, maxAniso);
      const hitR = ctx.R * 0.9;

      // Invisible hit area for crisp pointer raycasting
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(hitR, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.userData.id = n.id;
      g.add(hit);
      picks.push(hit);

      // Glowing selection orbit ring
      const selMesh = new THREE.Mesh(
        new THREE.TorusGeometry(hitR * 1.12, 0.018, 4, 32),
        new THREE.MeshBasicMaterial({ color: n.color })
      );
      selMesh.rotation.x = Math.PI / 2;
      selMesh.visible = false;
      g.add(selMesh);

      // Floating CSS2D Nameplate
      const lb = makeLabel(n, hitR + 0.35);
      g.add(lb.obj);

      rec[n.id] = {
        n,
        g,
        ctx,
        selMesh,
        el: lb.el,
        wp: new THREE.Vector3(),
      };
    };

    // Mount 07 ORACLE CRUCIBLE directly to scene at the center (THE SUN)
    makeBody(BY_ID['07'], scene);

    // Build the 3 Planetary Orbit Rings
    RINGS.forEach((rg, ri) => {
      const tilt = new THREE.Group();
      tilt.rotation.set(rg.tilt[0], 0, rg.tilt[1]);
      scene.add(tilt);
      const spin = new THREE.Group();
      tilt.add(spin);

      const cp: THREE.Vector3[] = [];
      for (let i = 0; i < 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        cp.push(new THREE.Vector3(Math.cos(t) * rg.R, 0, Math.sin(t) * rg.R));
      }
      const cmat = new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.32 });
      const circle = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(cp), cmat);
      tilt.add(circle);

      const tp: number[] = [];
      for (let d = 0; d < 360; d += 10) {
        const a = (d * Math.PI) / 180;
        const L = d % 30 === 0 ? 0.22 : 0.1;
        tp.push(
          Math.cos(a) * rg.R, 0, Math.sin(a) * rg.R,
          Math.cos(a) * (rg.R + L), 0, Math.sin(a) * (rg.R + L)
        );
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
      const ticks = new THREE.LineSegments(
        tg,
        new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.4 })
      );
      tilt.add(ticks);

      const rl = document.createElement('div');
      rl.className = 'rlbl';
      rl.textContent = rg.name;
      const rlo = new CSS2DObject(rl);
      tilt.add(rlo);

      const entry = {
        ...rg,
        spin,
        circle,
        ticks,
        cmat,
        lblObj: rlo,
      };
      ringsObj.push(entry);

      NODES.forEach((n) => {
        if (n.ring === ri + 1) makeBody(n, spin);
      });
    });

    // 12 Buses: 3D Arcs with travelling packet photons
    const SEG = 28;
    const leadBoxGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const leadCoreGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const followBoxGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const followCoreGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);

    const buses = EDGES.map((e, i) => {
      const pos = new Float32Array((SEG + 1) * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: e[2],
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      scene.add(line);

      // Lead packet: outer luminous colored envelope + bright white photon core
      const pkMat1 = new THREE.MeshBasicMaterial({
        color: e[2],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pk1 = new THREE.Mesh(leadBoxGeo, pkMat1);
      const pkCoreMat1 = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pkCore1 = new THREE.Mesh(leadCoreGeo, pkCoreMat1);
      pk1.add(pkCore1);
      pk1.visible = false;
      scene.add(pk1);

      // Follower packet: streaming trailing pulse offset along conduit
      const pkMat2 = new THREE.MeshBasicMaterial({
        color: e[2],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pk2 = new THREE.Mesh(followBoxGeo, pkMat2);
      const pkCoreMat2 = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pkCore2 = new THREE.Mesh(followCoreGeo, pkCoreMat2);
      pk2.add(pkCore2);
      pk2.visible = false;
      scene.add(pk2);

      return {
        a: e[0],
        b: e[1],
        key: ek(e[0], e[1]),
        baseColor: e[2],
        pos,
        geom,
        mat,
        line,
        pk1,
        pkMat1,
        pkCoreMat1,
        pk2,
        pkMat2,
        pkCoreMat2,
        progress: i / EDGES.length,
        pkOpacity: 0,
        phase: i / EDGES.length,
        C: new THREE.Vector3(),
      };
    });

    // Spherical Camera Helpers
    const wrap = (a: number) => {
      const t = Math.PI * 2;
      return ((a + Math.PI) % t + t) % t - Math.PI;
    };
    const sph = new THREE.Spherical();
    const tmp = new THREE.Vector3();

    const readSph = () => {
      tmp.copy(cam.position).sub(ctl.target);
      sph.setFromVector3(tmp);
      return sph;
    };

    const applySph = () => {
      tmp.setFromSpherical(sph).add(ctl.target);
      cam.position.copy(tmp);
      cam.lookAt(ctl.target);
    };

    const getCamDist = () => (container.clientWidth / container.clientHeight < 0.9 ? 34 : 24);

    // Initial Camera Setup
    cam.position.set(0, 0, getCamDist());
    const s0 = readSph();
    s0.theta = 0.62; // Iso
    s0.phi = 1.12;
    applySph();
    ctl.update();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let isVisible = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.02 }
    );
    visibilityObserver.observe(container);

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Raycaster Picking
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;

    const pick = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(picks, false)[0];
      return hit ? (hit.object.userData.id as string) : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const id = pick(e);
      if (id) {
        setLooping(false);
        stateRef.current.looping = false;
        setSelId(id);
        const matchIdx = STAGES.findIndex((s) => s.node === id);
        if (matchIdx >= 0) setStageIdx(matchIdx);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const id = pick(e);
      stateRef.current.hoverId = id;
      canvas.style.cursor = id ? 'pointer' : '';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    // Turntable Scrub Slider
    const slider = turnSliderRef.current;
    const onSliderInput = () => {
      if (!slider) return;
      stateRef.current.rotating = false;
      setRotating(false);
      stateRef.current.targetView = null;
      const s = readSph();
      s.theta = wrap((parseFloat(slider.value) * Math.PI) / 180);
      applySph();
      ctl.update();
      if (turnOutRef.current) turnOutRef.current.textContent = `${slider.value}°`;
    };

    const onSliderDown = () => {
      stateRef.current.draggingSlider = true;
    };

    const onSliderUp = () => {
      stateRef.current.draggingSlider = false;
    };

    if (slider) {
      slider.addEventListener('input', onSliderInput);
      slider.addEventListener('pointerdown', onSliderDown);
      window.addEventListener('pointerup', onSliderUp);
    }

    ctl.addEventListener('start', () => {
      stateRef.current.targetView = null;
    });

    // Main 60FPS Render Loop
    let animId: number;
    let last = performance.now();
    let factor = 1;
    let lastAzR = -1;
    let lastElR = -999;

    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);

      if (!isVisible || document.hidden) {
        last = now;
        return;
      }

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T.value += dt;

      const {
        selId: curSel,
        hoverId: curHov,
        stageIdx: curStage,
        orbiting: isOrb,
        rotating: isRot,
        exploded: isExp,
        draggingSlider,
        targetView,
      } = stateRef.current;

      factor += ((isExp ? 1.35 : 1) - factor) * 0.08;
      ctl.autoRotate = isRot;

      const st = STAGES[curStage];
      const active: Record<string, boolean> = {};
      st.edges.forEach((k) => {
        active[k] = true;
      });

      // Solar Energy Surges: When Oracle Crucible is verifying or passing, solar core flares with radiant power!
      const isSunActive = curStage === 1 || curStage === 5;
      const sunBaseIntensity = 2.4 + 0.3 * Math.sin(T.value * 3.5);
      sunLight.intensity = isSunActive ? sunBaseIntensity * 1.35 : sunBaseIntensity;
      sunCoronaLight.intensity = isSunActive ? 2.4 : 1.7;

      // Update Planetary Orbit Rings
      ringsObj.forEach((rg) => {
        if (isOrb) rg.spin.rotation.y += rg.w * dt;
        rg.circle.scale.set(factor, 1, factor);
        rg.ticks.scale.set(factor, 1, factor);
        rg.lblObj.position.set(
          Math.cos(rg.lblA) * (rg.R * factor + 0.7),
          0,
          Math.sin(rg.lblA) * (rg.R * factor + 0.7)
        );
        const has = rg.ids.indexOf(curSel) >= 0;
        rg.cmat.opacity += ((has ? 0.75 : 0.32) - rg.cmat.opacity) * 0.12;
      });

      // Update All 12 Assembly Bodies
      NODES.forEach((n, i) => {
        const r = rec[n.id];
        if (!r) return;
        const isSel = n.id === curSel;
        const isHov = n.id === curHov;
        const isAct = n.id === st.node;

        if (n.ring > 0) {
          const a = (n.ang * Math.PI) / 180;
          const R = RINGS[n.ring - 1].R * factor;
          r.g.position.set(
            Math.cos(a) * R,
            Math.sin(T.value * 0.9 + i) * 0.06,
            Math.sin(a) * R
          );
        } else {
          // Central Sun (Oracle Crucible) generates truth at the core of the system
          r.g.position.set(0, Math.sin(T.value * 0.6) * 0.03, 0);
        }

        const boost = isSel ? 0.55 : isAct ? 0.42 : isHov ? 0.28 : 0;
        r.ctx.mats.forEach((m: any) => {
          m.emissiveIntensity += (m.userData.ei0 + boost - m.emissiveIntensity) * 0.12;
        });
        r.ctx.anim.forEach((f) => f(dt, T.value));

        if (r.selMesh.visible !== isSel) r.selMesh.visible = isSel;
        if (isSel) r.selMesh.rotation.z += dt * 0.7;

        const nextCls = `lbl ${isSel ? 'sel' : ''} ${isAct ? 'act' : ''}`;
        if (r.el.className !== nextCls) {
          r.el.className = nextCls;
        }
      });

      // Synchronize 3D World Positions
      scene.updateMatrixWorld(true);
      NODES.forEach((n) => {
        if (rec[n.id]) rec[n.id].g.getWorldPosition(rec[n.id].wp);
      });

      // Floor Drop Line to Selected Body
      if (rec[curSel]) {
        const sw = rec[curSel].wp;
        drop.position.set(sw.x, (FLOOR + sw.y) / 2, sw.z);
        drop.scale.y = Math.max(0.01, sw.y - FLOOR);
        (drop.material as THREE.MeshBasicMaterial).color.setHex(BY_ID[curSel].color);
        drop.visible = true;
      }

      // Update 3D Curved Conduit Buses & Photon Packets
      buses.forEach((b) => {
        if (!rec[b.a] || !rec[b.b]) return;
        const A = rec[b.a].wp;
        const B = rec[b.b].wp;
        const C = b.C;
        const p = b.pos;
        const len = A.distanceTo(B);
        C.set((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.6 + len * 0.2, (A.z + B.z) / 2);

        for (let i = 0; i <= SEG; i++) {
          const u = i / SEG;
          const m = 1 - u;
          p[i * 3] = m * m * A.x + 2 * m * u * C.x + u * u * B.x;
          p[i * 3 + 1] = m * m * A.y + 2 * m * u * C.y + u * u * B.y;
          p[i * 3 + 2] = m * m * A.z + 2 * m * u * C.z + u * u * B.z;
        }
        b.geom.attributes.position.needsUpdate = true;

        const isAct = Boolean(active[b.key]);
        const touches = curSel !== null && (b.a === curSel || b.b === curSel);
        const isPassingData = isAct || touches;

        // Dynamic Color: On 07-08 (Crucible -> Verdict), switch between PASS (Emerald) and FAIL (Rose)
        let activeColor = b.baseColor;
        if (b.key === '07-08') {
          activeColor = curStage === 5 ? C_PASS : C_FAIL;
        }
        b.mat.color.setHex(activeColor);
        b.pkMat1.color.setHex(activeColor);
        b.pkMat2.color.setHex(activeColor);

        // Accurate Conduit Opacity: active conduits glow luminous; inactive rest faint
        const targetLineOpacity = isAct ? 0.95 : touches ? 0.65 : 0.15;
        b.mat.opacity += (targetLineOpacity - b.mat.opacity) * 0.14;

        // Accurate Data Sending: only active stage or selected conduits transmit packets
        const targetPkOpacity = isPassingData ? 1.0 : 0.0;
        b.pkOpacity += (targetPkOpacity - b.pkOpacity) * (isPassingData ? 0.22 : 0.08);

        if (b.pkOpacity > 0.01) {
          b.pk1.visible = true;
          b.pk2.visible = true;

          // Continuous integration: progress strictly advances forward along parabolic arc
          const speed = isAct ? 0.85 : 0.45;
          b.progress = (b.progress + dt * speed) % 1.0;

          // Lead packet: travels from A (u=0) to B (u=1) along the 3D parabolic curve
          const q1 = b.progress;
          const mq1 = 1.0 - q1;
          b.pk1.position.set(
            mq1 * mq1 * A.x + 2 * mq1 * q1 * C.x + q1 * q1 * B.x,
            mq1 * mq1 * A.y + 2 * mq1 * q1 * C.y + q1 * q1 * B.y,
            mq1 * mq1 * A.z + 2 * mq1 * q1 * C.z + q1 * q1 * B.z
          );
          b.pk1.rotation.y += dt * 3.5;
          b.pk1.rotation.x += dt * 2.2;
          const pulse1 = 1.0 + 0.15 * Math.sin(T.value * 8 + b.phase * 5);
          b.pk1.scale.setScalar((isAct ? 1.35 : 1.0) * pulse1);

          b.pkMat1.opacity = b.pkOpacity * (0.85 + 0.15 * Math.sin(T.value * 7));
          b.pkCoreMat1.opacity = b.pkOpacity * 0.95;

          // Follower packet: streaming pulse offset by 0.42 along conduit
          const q2 = (b.progress + 0.42) % 1.0;
          const mq2 = 1.0 - q2;
          b.pk2.position.set(
            mq2 * mq2 * A.x + 2 * mq2 * q2 * C.x + q2 * q2 * B.x,
            mq2 * mq2 * A.y + 2 * mq2 * q2 * C.y + q2 * q2 * B.y,
            mq2 * mq2 * A.z + 2 * mq2 * q2 * C.z + q2 * q2 * B.z
          );
          b.pk2.rotation.y -= dt * 2.8;
          b.pk2.rotation.z += dt * 2.0;
          b.pk2.scale.setScalar((isAct ? 0.95 : 0.7) * pulse1);

          b.pkMat2.opacity = b.pkOpacity * 0.65;
          b.pkCoreMat2.opacity = b.pkOpacity * 0.75;
        } else {
          b.pk1.visible = false;
          b.pk2.visible = false;
        }
      });

      // Update Oracle Sun Fact Flares (tripped facts flare red during FAIL stage)
      if (rec['07']?.ctx?.factPts && rec['07']?.ctx?.factCol) {
        const factPts = rec['07'].ctx.factPts;
        const factCol = rec['07'].ctx.factCol;
        const tripped = curStage === 2 || curStage === 3; // FAIL or ADVISE
        const base = new THREE.Color(C_VER);
        const bad = new THREE.Color(C_FAIL);
        for (let i = 0; i < 34; i++) {
          const c = tripped && (i === 4 || i === 18 || i === 19) ? bad : base;
          factCol[i * 3] = c.r;
          factCol[i * 3 + 1] = c.g;
          factCol[i * 3 + 2] = c.b;
        }
        factPts.geometry.attributes.color.needsUpdate = true;
      }

      // Smooth Tween to Camera Presets
      if (targetView) {
        const s = readSph();
        const dT = wrap(targetView.theta - s.theta);
        s.theta += dT * 0.14;
        s.phi += (targetView.phi - s.phi) * 0.14;
        s.radius += (targetView.r - s.radius) * 0.14;
        applySph();
        if (Math.abs(dT) < 0.003 && Math.abs(targetView.phi - s.phi) < 0.003 && Math.abs(targetView.r - s.radius) < 0.03) {
          stateRef.current.targetView = null;
        }
      }

      ctl.update();

      const az = ((ctl.getAzimuthalAngle() * 180) / Math.PI + 360) % 360;
      const el = 90 - (ctl.getPolarAngle() * 180) / Math.PI;
      const azR = Math.round(az) % 360;
      const elR = Math.round(el);

      if (azR !== lastAzR) {
        lastAzR = azR;
        if (azRef.current) azRef.current.textContent = `${String(azR).padStart(3, '0')}°`;
        if (!draggingSlider && slider && turnOutRef.current) {
          slider.value = String(azR);
          turnOutRef.current.textContent = `${azR}°`;
        }
      }

      if (elR !== lastElR) {
        lastElR = elR;
        if (elRef.current) elRef.current.textContent = `${elR < 0 ? '−' : ''}${String(Math.abs(elR)).padStart(2, '0')}°`;
      }

      renderer.render(scene, cam);
      labelRenderer.render(scene, cam);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      if (slider) {
        slider.removeEventListener('input', onSliderInput);
        slider.removeEventListener('pointerdown', onSliderDown);
        window.removeEventListener('pointerup', onSliderUp);
      }
      ctl.dispose();
      renderer.dispose();
      buses.forEach((b) => {
        b.geom.dispose();
        b.mat.dispose();
        b.pkMat1.dispose();
        b.pkCoreMat1.dispose();
        b.pkMat2.dispose();
        b.pkCoreMat2.dispose();
      });
      leadBoxGeo.dispose();
      leadCoreGeo.dispose();
      followBoxGeo.dispose();
      followCoreGeo.dispose();
      floorGeo.dispose();
    };
  }, []);

  // Stage Cycle Timer (1.8s per step when loop is active)
  React.useEffect(() => {
    if (!looping) return;
    const interval = setInterval(() => {
      setStageIdx((prev) => {
        const next = (prev + 1) % STAGES.length;
        setSelId(STAGES[next].node);
        return next;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, [looping]);

  // Keyboard Shortcuts (L, O, R, Space)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target && /input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'r') {
        setRotating((r) => !r);
        stateRef.current.targetView = null;
      } else if (k === 'o') {
        setOrbiting((o) => !o);
      } else if (k === 'l') {
        setLooping((l) => {
          const next = !l;
          if (next) setSelId(STAGES[stageIdx].node);
          return next;
        });
      } else if (e.code === 'Space' || k === ' ') {
        e.preventDefault();
        setExploded((exp) => !exp);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stageIdx]);

  const selectedNode = BY_ID[selId] || NODES[0];
  const selectedAdj = getAdj(selId);
  const currentStage = STAGES[stageIdx];
  const selectedBadge =
    selId === '05' && activeModel
      ? activeModel.split('/').pop()?.toUpperCase()
      : selectedNode.badge;

  // Harmonic Frequency EQ levels anchored to real checkpoint compliance & fact-failure distribution
  const freqLevels = React.useMemo(() => {
    const empiricalProfile = [31, 60, 70, 86, 37, 88, 74, 82, 68, 91, 64, 79];
    if (checkpoint && checkpoint.length > 0) {
      const condRates = CONDITIONS.map((c) => {
        const sub = checkpoint.filter((t) => t.condition === c);
        if (!sub.length) return 55;
        const avg = sub.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0) / sub.length;
        return Math.round(avg * 100);
      });
      const factCounts = new Map<string, number>();
      for (const t of checkpoint) {
        for (const f of t.failedFacts ?? []) {
          factCounts.set(f, (factCounts.get(f) ?? 0) + 1);
        }
      }
      const topFacts = [...factCounts.values()].sort((a, b) => b - a).slice(0, 6);
      const maxFact = Math.max(1, topFacts[0] ?? 1);
      const factBands = Array.from({ length: 6 }, (_, idx) =>
        topFacts[idx] ? Math.round((topFacts[idx] / maxFact) * 85 + 15) : empiricalProfile[idx + 6]
      );
      const combined = [...condRates, ...factBands];
      return FREQ_LABELS.map((_, i) => {
        const isPeakBand = i % 6 === stageIdx;
        return Math.min(100, Math.max(18, (combined[i] ?? 60) + (isPeakBand ? 12 : 0)));
      });
    }
    return FREQ_LABELS.map((_, i) => {
      const isPeakBand = i % 6 === stageIdx;
      return Math.min(100, Math.max(18, empiricalProfile[i] + (isPeakBand ? 14 : 0)));
    });
  }, [checkpoint, stageIdx]);

  return (
    <div
      ref={containerRef}
      className="axm-360-root"
      role="region"
      aria-label="Axiom Architecture Anatomy 360 Interactive Rig"
    >
      {/* Blueprint Grid Vignette */}
      <div className="axm-360-grid" />

      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="axm-360-canvas"
        aria-label="Interactive 3D orrery of the Axiom system. The Oracle Crucible is the sun generating system energy, and the other eleven assemblies orbit it as solid textured bodies. Drag to orbit, scroll to zoom, click a body to inspect it."
      />

      {/* CSS 2D Labels Container */}
      <div ref={labelsRef} className="axm-360-labels" />

      {/* WebGL Fallback */}
      {webglError && (
        <div className="axm-360-fallback">
          WebGL is not available in this browser, so the 3D anatomy cannot be shown.
        </div>
      )}

      {/* High-Tech HUD Layer */}
      <div className="axm-360-hud">
        {/* Top Header */}
        <header className="axm-360-header">
          <div className="axm-360-brand">
            <AxiomLogo size={24} />
            <b>AXIOM</b>
            <span>Orrery / 360 view</span>
            <span
              style={{
                marginLeft: '6px',
                fontSize: '8.5px',
                padding: '1px 6px',
                borderRadius: '3px',
                border: isLive ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(168, 85, 247, 0.4)',
                color: isLive ? '#34d399' : '#d8b4fe',
                background: 'rgba(5, 6, 10, 0.6)',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {isLive ? '● LIVE' : `SNAPSHOT // ${activeRunId} @ ${activeCommit}`}
            </span>
          </div>

          <div className="axm-360-readout" aria-live="off">
            <div>
              AZIMUTH<b ref={azRef}>000°</b>
            </div>
            <div>
              ELEVATION<b ref={elRef}>00°</b>
            </div>
            <div className="hide-sm">
              BODIES<b>12 · 3 orbits · 12 buses</b>
            </div>
          </div>
        </header>

        {/* Mid Row: Left Instruments (Live Data & Frequencies) & Right Inspector */}
        <div className="axm-360-mid">
          {/* Left Instruments Rack */}
          <aside className="axm-360-inst" aria-label="Run instruments and frequency spectrum">
            {/* Box 1: Trial & Active Model */}
            <div className="box">
              <h3>
                TRIAL <i>{isLive ? 'LIVE STREAM' : 'SIMULATED'}</i>
              </h3>
              <div className="axm-360-big">
                {trialCount} <small>/ {desk?.totalTrials ?? (checkpoint && checkpoint.length > 0 && new Set(checkpoint.map((t) => t.taskId)).size <= 8 ? 48 : 720)}</small>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto', marginTop: 6 }}>
                <span>active model</span>
                <b style={{ color: 'var(--cya)', fontSize: 9 }}>{activeModel.split('/').pop()}</b>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>system convergence</span>
                <b style={{ color: '#34d399', fontSize: 9 }}>{(convergenceVal * 100).toFixed(1)}%</b>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>parallel 2×720 bg</span>
                <b style={{ color: '#ff8a3d', fontSize: 8.5 }}>QWEN 3.8 · <span style={{ color: '#2dd4bf' }}>GLM-5.3</span></b>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>split train : dev : test</span>
                <b style={{ color: 'var(--fg)', fontSize: 9.5 }}>1 : 1 : 3</b>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>conditions x tasks</span>
                <b style={{ color: 'var(--fg)', fontSize: 9.5 }}>6 x 120</b>
              </div>
            </div>

            {/* Box 2: Harmonic Frequency Spectrum */}
            <div className="box">
              <h3>
                HARMONIC FREQUENCIES <i>39.6 kHz · Pb 16</i>
              </h3>
              <div className="axm-360-freq-strip">
                <div
                  className="axm-360-freq-cursor"
                  style={{ left: `clamp(0%, ${(stageIdx / 5) * 94}%, 94%)` }}
                />
              </div>
              <div className="axm-360-freq-grid">
                {freqLevels.map((lvl, idx) => {
                  const isCurrent = idx % 6 === stageIdx;
                  return (
                    <div key={FREQ_LABELS[idx]} className="axm-360-freq-col">
                      <div className="axm-360-freq-meter">
                        {[4, 3, 2, 1].map((seg) => {
                          const isLit = lvl >= seg * 24;
                          const segClass = seg === 4 ? 'seg-peak' : seg >= 2 ? 'seg-mid' : 'seg-low';
                          return (
                            <div
                              key={seg}
                              className={`axm-360-freq-seg ${isLit ? `is-lit ${segClass}` : ''}`}
                              style={{ opacity: isCurrent ? 1 : 0.65 }}
                            />
                          );
                        })}
                      </div>
                      <span
                        className="axm-360-freq-lbl"
                        style={{ color: isCurrent ? 'var(--fg)' : 'var(--dim)', fontWeight: isCurrent ? 700 : 400 }}
                      >
                        {FREQ_LABELS[idx]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box 3: Condition Progress (/120 each) */}
            <div className="box">
              <h3>
                CONDITIONS <i>/ 120 EACH</i>
              </h3>
              {CONDITIONS.map((c, i) => {
                const count = conditionCounts[i] ?? 0;
                const pct = Math.min(100, Math.round((count / 120) * 100));
                return (
                  <div key={c} className="axm-360-rw">
                    <span>{c}</span>
                    <div className="axm-360-bar">
                      <b style={{ width: `${pct}%` }} />
                    </div>
                    <span>{count}/120</span>
                  </div>
                );
              })}
            </div>

            {/* Box 4: Loop Sequence Indicators */}
            <div className="box">
              <h3>
                LOOP SEQUENCE <i>{stageIdx + 1}/6</i>
              </h3>
              <div className="axm-360-seq">
                {STAGES.map((s, i) => (
                  <span
                    key={s.name}
                    className={i === stageIdx ? 'on' : ''}
                    style={{ '--cc': hex(s.color) } as React.CSSProperties}
                    title={s.name}
                  >
                    {s.name.slice(0, 3)}
                  </span>
                ))}
              </div>
            </div>

            {/* Box 5: Failed Invariants Containment Probe */}
            <div className="box">
              <h3>
                FAILED FACTS PROBE <i>ROLE: APP</i>
              </h3>
              <div className="axm-360-facts-rack">
                {stageIdx === 2 || stageIdx === 3 ? (
                  <>
                    <span className="axm-360-fact-tag">F-05 [TRIPPED]</span>
                    <span className="axm-360-fact-tag">F-19 [TRIPPED]</span>
                    <span className="axm-360-fact-tag">F-20 [TRIPPED]</span>
                  </>
                ) : (
                  <span className="axm-360-facts-nominal">
                    34 / 34 facts locked under deployer isolation · 0 leaks
                  </span>
                )}
              </div>
            </div>
          </aside>

          {/* Right Inspector Drawer */}
          <aside
            className="axm-360-insp"
            style={{ '--c': hex(selectedNode.color) } as React.CSSProperties}
            aria-live="polite"
          >
            <div className="id">ASSEMBLY {selectedNode.id}</div>
            <h2 className="axm-360-insp-title">{selectedNode.name}</h2>
            <div className="badge">{selectedBadge}</div>
            <p>{selectedNode.desc}</p>
            <div className="file">[{selectedNode.file}]</div>
            <dl>
              <dt>ORBIT</dt>
              <dd>{RING_NAME(selectedNode)}</dd>
              <dt>FROM</dt>
              <dd>{selectedAdj.from}</dd>
              <dt>TO</dt>
              <dd>{selectedAdj.to}</dd>
            </dl>
          </aside>
        </div>

        {/* Bottom Control Deck */}
        <div className="axm-360-panel">
          <div className="axm-360-hint">
            DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A BODY TO INSPECT
          </div>

          {/* Stage Chips */}
          <div className="axm-360-chips" role="tablist" aria-label="Healing loop stage">
            {STAGES.map((s, i) => (
              <button
                key={s.name}
                type="button"
                className="axm-360-chip"
                role="tab"
                aria-selected={i === stageIdx}
                style={{ '--cc': hex(s.color) } as React.CSSProperties}
                onClick={() => {
                  setLooping(false);
                  stateRef.current.looping = false;
                  setStageIdx(i);
                  setSelId(s.node);
                }}
              >
                {s.name}
              </button>
            ))}
            <div className="msg">{currentStage.msg}</div>
          </div>

          {/* Turntable Degree Scrubber */}
          <div className="axm-360-scrub">
            <label htmlFor="turn-slider">TURNTABLE</label>
            <input
              id="turn-slider"
              ref={turnSliderRef}
              type="range"
              min="0"
              max="360"
              step="1"
              defaultValue="0"
              aria-label="Turntable angle in degrees"
            />
            <output ref={turnOutRef} htmlFor="turn-slider">
              0°
            </output>
          </div>

          {/* Controls & Preset Camera Views */}
          <div className="axm-360-row">
            <button
              id="bLoop"
              type="button"
              className="axm-360-btn"
              aria-pressed={looping}
              onClick={() => {
                setLooping((l) => {
                  const next = !l;
                  if (next) setSelId(STAGES[stageIdx].node);
                  return next;
                });
              }}
            >
              Run loop<kbd>L</kbd>
            </button>
            <button
              id="bOrb"
              type="button"
              className="axm-360-btn"
              aria-pressed={orbiting}
              onClick={() => setOrbiting((o) => !o)}
            >
              Orbit<kbd>O</kbd>
            </button>
            <button
              id="bRot"
              type="button"
              className="axm-360-btn"
              aria-pressed={rotating}
              onClick={() => {
                setRotating((r) => !r);
                stateRef.current.targetView = null;
              }}
            >
              Rotate<kbd>R</kbd>
            </button>
            <button
              id="bExp"
              type="button"
              className="axm-360-btn"
              aria-pressed={exploded}
              onClick={() => setExploded((e) => !e)}
            >
              Take apart<kbd>Space</kbd>
            </button>
            <span className="sp" />
            <button type="button" className="axm-360-btn" onClick={() => setCameraView('front')}>
              Front
            </button>
            <button type="button" className="axm-360-btn" onClick={() => setCameraView('side')}>
              Side
            </button>
            <button type="button" className="axm-360-btn" onClick={() => setCameraView('top')}>
              Top
            </button>
            <button type="button" className="axm-360-btn" onClick={() => setCameraView('iso')}>
              Iso
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
