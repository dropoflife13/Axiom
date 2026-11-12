'use client';

import React, { memo, useEffect, useRef, useState } from 'react';

export interface ScaleEfficiencyArchitectureProps {
  activeRunId?: string;
  onSelectRun?: (runId: string) => void;
}

const FONT = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const DM = '#7c819a';
const FG = '#e8eaf2';
const CY = '#22d3ee';
const VI = '#a855f7';
const AM = '#fbbf24';
const GR = '#34d399';
const RS = '#f43f5e';
const OR = '#fb923c';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const kk = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const sm = (x: number) => x * x * (3 - 2 * x);
const lp = (a: number, b: number, t: number) => a + (b - a) * t;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const R0 = rng(5);
const PT = Array.from({ length: 1200 }, () => ({ u: R0(), v: R0(), w: R0() }));

const T = (
  cx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  c: string,
  sz: number,
  al: CanvasTextAlign = 'left',
  w = 400
) => {
  cx.fillStyle = c;
  cx.font = `${w} ${sz}px ${FONT}`;
  cx.textAlign = al;
  cx.fillText(s, x, y);
};

const TW = (cx: CanvasRenderingContext2D, s: string, sz: number, w = 400) => {
  cx.font = `${w} ${sz}px ${FONT}`;
  return cx.measureText(s).width;
};

/* ---------- DATA ---------- */
interface FleetModelItem {
  n: string;
  c: number;
  s: number | null;
  col: string;
  d: number;
  t: number;
  runId: string;
}

const FL: FleetModelItem[] = [
  { n: 'NEMOTRON 550B', c: 73.6, s: 550, col: '#84cc16', d: 720, t: 720, runId: 'nemotron-2' },
  { n: 'QWEN 3.8 27B', c: 72.3, s: 27, col: '#fb923c', d: 720, t: 720, runId: 'qwen27b-2' },
  { n: 'GEMMA 4 31B', c: 68.3, s: 31, col: '#c084fc', d: 720, t: 720, runId: 'gemma4-31b-full' },
  { n: 'GLM-5.3', c: 66.4, s: null, col: '#2dd4bf', d: 720, t: 720, runId: 'glm5-2' },
  { n: 'GEMINI 3.1 FL', c: 65.7, s: null, col: '#10b981', d: 720, t: 720, runId: 'gemini-3.1-flash-lite' },
  { n: 'GEMINI 3.5 FL', c: 63.0, s: null, col: '#22c55e', d: 720, t: 720, runId: 'gemini-flash-lite-full' },
  { n: 'GPT-OSS 120B (LIVE)', c: 38.9, s: 120, col: '#38bdf8', d: 514, t: 720, runId: 'gptoss-120b-expanded' },
  { n: 'GEMMA 4 26B (EXCL)', c: 61.5, s: 26, col: '#a78bfa', d: 720, t: 720, runId: 'gemma4-26b-full' },
  { n: 'NEMOTRON 3.5 LTG (EXCL)', c: 45.8, s: null, col: '#fbbf24', d: 720, t: 720, runId: 'nemotron-lightning-full' },
  { n: 'GEMINI 3.6 MINI', c: 55.3, s: null, col: '#3b82f6', d: 18, t: 18, runId: 'gemini-mini' },
  { n: 'XINGCHEN MINI', c: 23.0, s: null, col: '#f472b6', d: 48, t: 48, runId: 'xingchen-mini' },
  { n: 'LIQUID 1.7B', c: 7.0, s: 1.7, col: '#e2e8f0', d: 48, t: 48, runId: 'liquid17b-mini' },
];

interface ConditionSetupItem {
  id: string;
  n: string;
  v: number;
  tok: number | null;
  col: string;
  p: string;
}

const COND: ConditionSetupItem[] = [
  { id: 'A', n: 'ZERO-SHOT', v: 47.4, tok: 1138, col: '#94a3b8', p: 'The model gets the task and nothing else. This is the starting line.' },
  { id: 'D', n: 'DECOY HINTS', v: 48.1, tok: null, col: '#94a3b8', p: 'The model gets hints that look useful but are unrelated. The score barely moves, so extra text alone does not help.' },
  { id: 'C', n: 'SUMMARISED LESSONS', v: 71.9, tok: null, col: OR, p: 'After a failure, a second model summarises the lesson in under 24 words and passes it on.' },
  { id: 'C0', n: 'EXACT RULES', v: 86.3, tok: 554, col: CY, p: 'The checker’s exact wording of the broken rule is handed back unchanged, with nobody paraphrasing it.' },
  { id: 'B', n: 'ANSWER KEY', v: 93.9, tok: 1852, col: VI, p: 'The model gets a hand-written cheat sheet of the rules up front. This is the best case, and it costs the longest prompt.' },
];

interface FaultSpectrumItem {
  id: string;
  n: string;
  pl: string;
  d: string;
  n2: number;
  col: string;
  p: string;
}

const FAULT: FaultSpectrumItem[] = [
  { id: 'F-17', n: 'check-name', pl: 'check names', d: 'IDENTITY', n2: 224, col: CY, p: 'Constraints that check a value were given the wrong name. Naming conventions make a database predictable.' },
  { id: 'F-26', n: 'tenant-rls-behavior', pl: 'tenant data', d: 'TENANCY', n2: 208, col: VI, p: 'The database does not keep one customer’s rows hidden from another customer. This is the most serious kind of mistake.' },
  { id: 'F-18', n: 'index-name', pl: 'index names', d: 'IDENTITY', n2: 199, col: CY, p: 'Indexes, which make searches fast, were given the wrong name.' },
  { id: 'F-16', n: 'foreign-key-name', pl: 'link names', d: 'IDENTITY', n2: 193, col: CY, p: 'The links between tables (foreign keys) were given the wrong name.' },
  { id: 'F-20', n: 'append-only-trigger', pl: 'history edits', d: 'IMMUTABILITY', n2: 189, col: RS, p: 'A record that must only ever be added to can still be edited or deleted, because the guarding trigger is missing or wrong.' },
  { id: 'F-36', n: 'append-only-supersedes', pl: 'correction links', d: 'IMMUTABILITY', n2: 186, col: RS, p: 'A correction must link back to the record it replaces, so history stays intact. Here that link is missing.' },
  { id: 'F-05', n: 'created-at', pl: 'created stamp', d: 'TEMPORAL', n2: 161, col: AM, p: 'The “created at” timestamp that records when a row was made is missing or set up wrongly.' },
  { id: 'F-37', n: 'received-at-trigger', pl: 'arrival stamp', d: 'INGESTION', n2: 124, col: GR, p: 'Incoming data is not stamped with its arrival time by the database itself.' },
];

const TOT = FAULT.reduce((s, f) => s + f.n2, 0);
const LEAD = FL[0].c;
const GA = 47.4;
const GB = 93.9;

interface InteractionState {
  hov: number;
  sel: number;
}

const PTA = (
  cx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  col: string,
  n: number,
  seed: number,
  alpha: number,
  sp: number
) => {
  cx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const p = PT[(i * 7 + seed) % 1200];
    const a = lp(a0, a1, p.u);
    const rr = r + (p.v - 0.5) * sp;
    cx.globalAlpha = alpha * (0.2 + 0.8 * p.w);
    cx.fillRect(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.6, 1.6);
  }
};

/* ==========================================
   MODULE 1: ORBIT CANVAS
   ========================================== */
function OrbitCanvas({
  interaction,
  onSync,
}: {
  interaction: React.MutableRefObject<InteractionState>;
  onSync: (idx: number, isAuto: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    if (!cv || !container) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let animId = 0;
    let visible = true;
    let W = 0;
    let H = 0;
    let DP = 1;
    let P: [number, number][] = [];
    let lastIdx = -1;
    let lastAuto: boolean | null = null;

    function size() {
      if (!cv || !container) return;
      const r = container.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const dp = Math.min(window.devicePixelRatio || 1, 2);
      if (w <= 0 || h <= 0) return;
      if (w !== W || h !== H || dp !== DP) {
        W = w;
        H = h;
        DP = dp;
        cv.width = W * DP;
        cv.height = H * DP;
      }
    }

    size();
    const ro = new ResizeObserver(() => size());
    ro.observe(container);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onPointerMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let h = -1;
      let b = 30;
      P.forEach((p, i) => {
        if (!p) return;
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < b) {
          b = d;
          h = i;
        }
      });
      interaction.current.hov = h;
      cv.style.cursor = h >= 0 ? 'pointer' : '';
    };

    const onPointerLeave = () => {
      interaction.current.hov = -1;
      cv.style.cursor = '';
    };

    const onClick = () => {
      const h = interaction.current.hov;
      if (h >= 0) {
        interaction.current.sel = interaction.current.sel === h ? -1 : h;
      }
    };

    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerleave', onPointerLeave);
    cv.addEventListener('click', onClick);

    function render(now: number) {
      if (visible && W > 0 && H > 0 && cx) {
        cx.setTransform(DP, 0, 0, DP, 0, 0);
        cx.clearRect(0, 0, W, H);
        cx.globalCompositeOperation = 'lighter';
        cx.globalAlpha = 1;
        cx.lineWidth = 1;

        if (t0Ref.current === null) t0Ref.current = now;
        const t = reduced ? 9 : Math.max(0, (now - t0Ref.current) / 1000);
        const st = interaction.current;
        const isAuto = st.hov < 0 && st.sel < 0;
        const rawAct = st.hov >= 0 ? st.hov : st.sel >= 0 ? st.sel : reduced ? 1 : Math.floor(t / 3) % FL.length;
        const act = ((rawAct % FL.length) + FL.length) % FL.length;

        if (act !== lastIdx || isAuto !== lastAuto) {
          lastIdx = act;
          lastAuto = isAuto;
          onSyncRef.current(act, isAuto);
        }

        const ox = W / 2;
        const oy = H * 0.5;
        const R = Math.min(W * 0.47, H * 0.47);
        const rad = (g: number) => 40 + (g / 70) * (R - 52);
        const ps = (m: FleetModelItem) => (m.s ? 5 + (Math.log10(m.s) / Math.log10(550)) * 9 : 6);

        [10, 30, 50].forEach((g, j) => {
          const a = sm(kk(t, j * 0.2, j * 0.2 + 0.9));
          cx.globalAlpha = 0.3 * a;
          cx.strokeStyle = DM;
          cx.setLineDash([2, 5]);
          cx.beginPath();
          cx.arc(ox, oy, rad(g), 0, 6.3 * a);
          cx.stroke();
          cx.setLineDash([]);
          cx.globalAlpha = a;
          T(cx, '−' + g + ' pts', ox + rad(g) * 0.71 + 4, oy - rad(g) * 0.71, DM, 9);
        });

        const la = sm(kk(t, 0, 0.8));
        for (let k = 0; k < 300; k++) {
          const p = PT[k];
          const r = Math.pow(p.u, 0.7) * 26 * la;
          const a = p.v * 6.28 + t * 0.3 * (0.5 + p.w);
          cx.globalAlpha = (0.25 + 0.6 * p.w) * la * (act === 0 ? 1 : 0.8);
          cx.fillStyle = '#84cc16';
          cx.fillRect(ox + Math.cos(a) * r, oy + Math.sin(a) * r, 1.6, 1.6);
        }

        const rects: [number, number, number, number][] = [];
        const lab: Array<{ j: number; px: number; py: number; s: number; a: number; on: boolean; dim: number }> = [];
        P = [];
        P[0] = [ox, oy];

        FL.forEach((m, j) => {
          if (!j) return;
          const r = rad(LEAD - m.c);
          const a0 = j * 2.399 + t * (0.35 / Math.sqrt(1 + j * 0.7));
          const a = sm(kk(t, 0.5 + j * 0.1, 1.3 + j * 0.1));
          const on = act === j;
          const dim = on || act < 0 ? 1 : 0.35;
          const s = ps(m);
          const px = ox + Math.cos(a0) * r;
          const py = oy + Math.sin(a0) * r;
          const live = m.d < m.t;
          const pu = live ? 0.75 + 0.25 * Math.sin(t * 5) : 1;
          P[j] = [px, py];

          cx.fillStyle = m.col;
          for (let k = 0; k < 40; k++) {
            const q = PT[(k * 13 + j * 41) % 1200];
            const aa = a0 - k * 0.026;
            cx.globalAlpha = a * dim * (1 - k / 40) * 0.6 * (0.3 + 0.7 * q.w);
            cx.fillRect(ox + Math.cos(aa) * (r + (q.v - 0.5) * 4), oy + Math.sin(aa) * (r + (q.v - 0.5) * 4), 1.5, 1.5);
          }

          cx.globalAlpha = a * dim * pu;
          cx.beginPath();
          cx.arc(px, py, s * (on ? 1.25 : 1), 0, 6.3);
          cx.fill();

          if (live) {
            cx.globalAlpha = a;
            cx.strokeStyle = m.col;
            cx.lineWidth = 1.5;
            cx.beginPath();
            cx.arc(px, py, s + 5, -1.5708, -1.5708 + (6.2832 * m.d) / m.t);
            cx.stroke();
            cx.lineWidth = 1;
          }

          if (on) {
            cx.globalAlpha = 1;
            cx.strokeStyle = '#e8eaf2';
            cx.setLineDash([3, 3]);
            cx.beginPath();
            cx.moveTo(ox, oy);
            cx.lineTo(px, py);
            cx.stroke();
            cx.setLineDash([]);
            cx.strokeStyle = m.col;
            cx.beginPath();
            cx.arc(px, py, s + 9 + 2 * Math.sin(t * 5), 0, 6.3);
            cx.stroke();
          }

          lab.push({ j, px, py, s, a, on, dim });
        });

        const place = (txt: string, x: number, y: number, col: string, sz: number, wt: number, force: boolean) => {
          const wd = TW(cx, txt, sz, wt);
          const rc: [number, number, number, number] = [x - wd / 2 - 3, y - sz, wd + 6, sz + 4];
          if (!force && rects.some((q) => rc[0] < q[0] + q[2] && rc[0] + rc[2] > q[0] && rc[1] < q[1] + q[3] && rc[1] + rc[3] > q[1])) {
            return;
          }
          rects.push(rc);
          T(cx, txt, x, y, col, sz, 'center', wt);
        };

        cx.globalAlpha = la;
        place(`${FL[0].n} · ${LEAD}%`, ox, oy + 46, '#84cc16', 10, 700, true);
        lab
          .sort((p, q) => (q.on ? 1 : 0) - (p.on ? 1 : 0))
          .forEach((o) => {
            cx.globalAlpha = o.a * o.dim;
            const m = FL[o.j];
            place(m.n, o.px, o.py - o.s - 9, o.on ? FG : DM, 9, o.on ? 700 : 400, o.on);
            if (o.on) {
              cx.globalAlpha = 1;
              T(cx, '−' + (LEAD - m.c).toFixed(1) + ' pts · ' + m.c + '%', o.px, o.py + o.s + 20, AM, 11, 'center', 700);
            }
          });

        cx.globalAlpha = 1;
        cx.globalCompositeOperation = 'source-over';
        T(cx, 'DISTANCE = HOW FAR BEHIND THE LEADER · SIZE = PARAMETERS · ANGLE MEANS NOTHING', 20, H - 12, DM, 9);
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerleave', onPointerLeave);
      cv.removeEventListener('click', onClick);
    };
  }, [interaction]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[480px] sm:min-h-[540px] border border-[rgba(160,170,255,0.14)] rounded-[14px] overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 60%, #140b28 0%, #05060a 72%)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-55"
        style={{
          backgroundImage:
            'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
          maskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-manipulation"
        aria-label="Orbit map of twelve AI models around the leader, Nemotron 550B. Distance from the centre shows how many points a model scores behind the leader."
      />
    </div>
  );
}

/* ==========================================
   MODULE 2: DIALS & TOKEN RINGS CANVAS
   ========================================== */
function DialsCanvas({
  interaction,
  onSync,
}: {
  interaction: React.MutableRefObject<InteractionState>;
  onSync: (idx: number, isAuto: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    if (!cv || !container) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let animId = 0;
    let visible = true;
    let W = 0;
    let H = 0;
    let DP = 1;
    let lastIdx = -1;
    let lastAuto: boolean | null = null;

    function size() {
      if (!cv || !container) return;
      const r = container.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const dp = Math.min(window.devicePixelRatio || 1, 2);
      if (w <= 0 || h <= 0) return;
      if (w !== W || h !== H || dp !== DP) {
        W = w;
        H = h;
        DP = dp;
        cv.width = W * DP;
        cv.height = H * DP;
      }
    }

    size();
    const ro = new ResizeObserver(() => size());
    ro.observe(container);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render(now: number) {
      if (visible && W > 0 && H > 0 && cx) {
        cx.setTransform(DP, 0, 0, DP, 0, 0);
        cx.clearRect(0, 0, W, H);
        cx.globalCompositeOperation = 'lighter';
        cx.lineWidth = 1;

        if (t0Ref.current === null) t0Ref.current = now;
        const t = reduced ? 9 : Math.max(0, (now - t0Ref.current) / 1000);
        const st = interaction.current;
        const isAuto = st.hov < 0 && st.sel < 0;
        const rawAct = st.hov >= 0 ? st.hov : st.sel >= 0 ? st.sel : reduced ? 3 : Math.floor(t / 3) % COND.length;
        const act = ((rawAct % COND.length) + COND.length) % COND.length;

        if (act !== lastIdx || isAuto !== lastAuto) {
          lastIdx = act;
          lastAuto = isAuto;
          onSyncRef.current(act, isAuto);
        }

        const wide = W > 700;
        const cy = H * 0.56;
        const r1 = Math.min(wide ? W * 0.18 : W * 0.38, H * 0.36);
        const x1 = wide ? W * 0.3 : W / 2;
        const f = (v: number) => (v - GA) / (GB - GA);
        const ang = (v: number) => Math.PI + Math.PI * f(v);

        cx.globalAlpha = 0.3;
        cx.strokeStyle = DM;
        cx.beginPath();
        cx.arc(x1, cy, r1, Math.PI, 2 * Math.PI);
        cx.stroke();

        const g = sm(kk(t, 0.3, 2.4));
        const vC0 = lp(GA, 86.3, g);
        PTA(cx, x1, cy, r1, Math.PI, ang(vC0), CY, 700, 1, 0.85, 14);

        const MK: [number, string, string, number][] = [
          [47.4, 'A', DM, 0],
          [48.1, 'D', DM, 1],
          [71.9, 'C', OR, 2],
          [86.3, 'C0', CY, 3],
          [93.9, 'B', VI, 4],
        ];
        MK.forEach(([v, l, c, ci], j) => {
          const a = ang(v);
          const on = sm(kk(t, 0.6 + j * 0.2, 1.2 + j * 0.2));
          const sel = act === ci;
          cx.globalAlpha = on;
          cx.strokeStyle = c;
          cx.lineWidth = sel ? 2.5 : 1;
          cx.beginPath();
          cx.moveTo(x1 + Math.cos(a) * (r1 - (sel ? 16 : 10)), cy + Math.sin(a) * (r1 - (sel ? 16 : 10)));
          cx.lineTo(x1 + Math.cos(a) * (r1 + (sel ? 18 : 12)), cy + Math.sin(a) * (r1 + (sel ? 18 : 12)));
          cx.stroke();
          cx.lineWidth = 1;
          const lr = r1 + (j === 1 ? 44 : 28);
          const al: CanvasTextAlign = Math.cos(a) < -0.2 ? 'right' : Math.cos(a) > 0.2 ? 'left' : 'center';
          T(cx, l + ' ' + v + '%', x1 + Math.cos(a) * lr, cy + Math.sin(a) * lr + 4, sel ? FG : c, sel ? 12 : 10, al, sel ? 700 : 400);
        });

        cx.globalAlpha = 1;
        cx.strokeStyle = '#fff';
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.moveTo(x1, cy);
        cx.lineTo(x1 + Math.cos(ang(vC0)) * (r1 - 16), cy + Math.sin(ang(vC0)) * (r1 - 16));
        cx.stroke();
        cx.lineWidth = 1;

        T(cx, Math.round(f(vC0) * 100) + '%', x1, cy + 4, CY, Math.min(46, r1 * 0.42), 'center', 700);
        T(cx, 'OF THE GAP RECOVERED BY C0', x1, cy + 28, DM, 10, 'center');
        T(cx, '(X − A) ÷ (B − A) · C recovers ' + Math.round(f(71.9) * 100) + '%', x1, cy + 46, DM, 9, 'center');

        const A = COND[act] ?? COND[0];
        cx.globalAlpha = 1;
        T(cx, A.id + ' · ' + A.n, x1, cy + 72, A.col, 11, 'center', 700);

        if (wide) {
          const x2 = W * 0.77;
          const rs: [number, string, number, string][] = [
            [r1, 'B · ANSWER KEY', 1852, VI],
            [r1 - 30, 'A · ZERO-SHOT', 1138, '#94a3b8'],
            [r1 - 60, 'C0 · EXACT RULES', 554, CY],
          ];
          const hi = act === 4 ? 0 : act === 0 ? 1 : act === 3 ? 2 : -1;
          rs.forEach(([r, l, v, c], j) => {
            const e = sm(kk(t, 1 + j * 0.3, 2.6 + j * 0.3));
            const a1 = -Math.PI / 2 + ((6.2832 * v) / 1852) * e;
            cx.globalAlpha = 0.18;
            cx.strokeStyle = DM;
            cx.beginPath();
            cx.arc(x2, cy, r, 0, 6.3);
            cx.stroke();
            PTA(cx, x2, cy, r, -Math.PI / 2, a1, c, Math.floor(((r * 5 * v) / 1852) * e) + 30, j * 90, hi === j ? 1 : 0.75, 8);
            cx.globalAlpha = e;
            T(cx, l + '  ' + v.toLocaleString('en-US') + ' tok', x2 - 8, cy - r + 4, hi === j ? FG : c, 10, 'right', j === 2 || hi === j ? 700 : 400);
          });
          cx.globalAlpha = 1;
          T(cx, '−51.3%', x2, cy + 10, CY, Math.min(38, r1 * 0.34), 'center', 700);
          T(cx, 'PROMPT TOKENS, C0 VS ZERO-SHOT', x2, cy + 30, DM, 9, 'center');
        }

        ['39 ENTERPRISE CONTRACTS', '720 TRIALS PER MODEL', '73.6% MEAN CONVERGENCE'].forEach((s, j) => {
          cx.globalAlpha = sm(kk(t, 2 + j * 0.2, 3 + j * 0.2));
          T(cx, s, 20 + (j * (W - 40)) / 3, H - 12, DM, 9);
        });
        cx.globalAlpha = 1;
        cx.globalCompositeOperation = 'source-over';
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      io.disconnect();
    };
  }, [interaction]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[480px] sm:min-h-[540px] border border-[rgba(160,170,255,0.14)] rounded-[14px] overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 60%, #140b28 0%, #05060a 72%)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-55"
        style={{
          backgroundImage:
            'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
          maskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-manipulation"
        aria-label="A half-circle dial showing how much of the gap between zero-shot and the static reference each condition recovers, and concentric rings showing prompt tokens per condition."
      />
    </div>
  );
}

/* ==========================================
   MODULE 3: FAULT CONSTELLATION CANVAS
   ========================================== */
function ConstellationCanvas({
  interaction,
  onSync,
}: {
  interaction: React.MutableRefObject<InteractionState>;
  onSync: (idx: number, isAuto: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    if (!cv || !container) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let animId = 0;
    let visible = true;
    let W = 0;
    let H = 0;
    let DP = 1;
    let CON: { key: string; N: { r: number; x: number; y: number }[]; cx: number; cy: number } = {
      key: '',
      N: [],
      cx: 0,
      cy: 0,
    };
    let lastIdx = -1;
    let lastAuto: boolean | null = null;

    function computeLayout(w: number, h: number) {
      const k = `${w}x${h}`;
      if (CON.key === k || w <= 0 || h <= 0) return;
      const cx0 = w / 2;
      const cy0 = h * 0.5;
      const U = Math.min(h * 0.075, w * 0.055) / Math.sqrt(224);
      const N = FAULT.map((f, i) => ({
        r: Math.sqrt(f.n2) * U * 1.6,
        x: cx0 + Math.cos(i * 0.785) * Math.min(w, h) * 0.3,
        y: cy0 + Math.sin(i * 0.785) * Math.min(w, h) * 0.3,
      }));
      for (let it = 0; it < 400; it++) {
        N.forEach((a, i) => {
          a.x += (cx0 - a.x) * 0.01;
          a.y += (cy0 - a.y) * 0.012;
          N.forEach((b, j) => {
            if (i === j) return;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            const m = a.r + b.r + 34;
            if (d < m) {
              a.x += (dx / d) * (m - d) * 0.5;
              a.y += (dy / d) * (m - d) * 0.5;
            }
          });
          const dx = a.x - cx0;
          const dy = a.y - cy0;
          const d = Math.hypot(dx, dy) || 1;
          const m = a.r + 52;
          if (d < m) {
            a.x = cx0 + (dx / d) * m;
            a.y = cy0 + (dy / d) * m;
          }
          a.x = clamp(a.x, a.r + 10, w - a.r - 10);
          a.y = clamp(a.y, a.r + 22, h - a.r - 52);
        });
      }
      CON = { key: k, N, cx: cx0, cy: cy0 };
    }

    function size() {
      if (!cv || !container) return;
      const r = container.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const dp = Math.min(window.devicePixelRatio || 1, 2);
      if (w <= 0 || h <= 0) return;
      if (w !== W || h !== H || dp !== DP) {
        W = w;
        H = h;
        DP = dp;
        cv.width = W * DP;
        cv.height = H * DP;
        computeLayout(W, H);
      }
    }

    size();
    const ro = new ResizeObserver(() => size());
    ro.observe(container);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const onPointerMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let h = -1;
      CON.N.forEach((n, i) => {
        if (Math.hypot(n.x - x, n.y - y) < n.r + 10) h = i;
      });
      interaction.current.hov = h;
      cv.style.cursor = h >= 0 ? 'pointer' : '';
    };

    const onPointerLeave = () => {
      interaction.current.hov = -1;
      cv.style.cursor = '';
    };

    const onClick = () => {
      const h = interaction.current.hov;
      if (h >= 0) {
        interaction.current.sel = interaction.current.sel === h ? -1 : h;
      }
    };

    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerleave', onPointerLeave);
    cv.addEventListener('click', onClick);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render(now: number) {
      if (visible && W > 0 && H > 0 && cx) {
        cx.setTransform(DP, 0, 0, DP, 0, 0);
        cx.clearRect(0, 0, W, H);
        cx.globalCompositeOperation = 'lighter';
        cx.lineWidth = 1;

        if (t0Ref.current === null) t0Ref.current = now;
        const t = reduced ? 9 : Math.max(0, (now - t0Ref.current) / 1000);
        const st = interaction.current;
        const isAuto = st.hov < 0 && st.sel < 0;
        const rawHv = st.hov >= 0 ? st.hov : st.sel >= 0 ? st.sel : reduced ? 3 : Math.floor(t / 3) % FAULT.length;
        const hv = ((rawHv % FAULT.length) + FAULT.length) % FAULT.length;

        if (hv !== lastIdx || isAuto !== lastAuto) {
          lastIdx = hv;
          lastAuto = isAuto;
          onSyncRef.current(hv, isAuto);
        }

        const { N, cx: ox, cy: oy } = CON;
        const oa = sm(kk(t, 0, 0.8));
        for (let k = 0; k < 220; k++) {
          const p = PT[k];
          const r = Math.pow(p.u, 0.6) * 20 * oa;
          const a = p.v * 6.28 + t * 0.4 * (0.5 + p.w);
          cx.globalAlpha = (0.2 + 0.7 * p.w) * oa;
          cx.fillStyle = '#fff';
          cx.fillRect(ox + Math.cos(a) * r, oy + Math.sin(a) * r, 1.5, 1.5);
        }
        cx.globalAlpha = oa;
        T(cx, 'ORACLE', ox, oy + 36, DM, 9, 'center', 700);
        T(cx, 'real PostgreSQL 16', ox, oy + 49, DM, 8, 'center');

        N.forEach((n, j) => {
          const f = FAULT[j];
          const a = sm(kk(t, 0.3 + j * 0.12, 1.3 + j * 0.12));
          const on = j === hv;
          const dim = on ? 1 : 0.45;

          cx.globalAlpha = a * (on ? 0.7 : 0.25);
          cx.strokeStyle = f.col;
          cx.setLineDash([2, 4]);
          cx.beginPath();
          cx.moveTo(ox, oy);
          cx.lineTo(n.x, n.y);
          cx.stroke();
          cx.setLineDash([]);

          const pu = (t * 0.5 + j * 0.13) % 1;
          cx.globalAlpha = a * 0.9;
          cx.fillStyle = f.col;
          cx.fillRect(lp(n.x, ox, pu) - 1, lp(n.y, oy, pu) - 1, 3, 3);

          const cnt = Math.floor(f.n2 * 2.2 * a);
          for (let k = 0; k < cnt; k++) {
            const p = PT[(k * 11 + j * 97) % 1200];
            const r = Math.pow(p.u, 0.55) * n.r * (on ? 1.08 : 1);
            const an = p.v * 6.28 + t * (0.15 + p.w * 0.2) * (j % 2 ? 1 : -1);
            cx.globalAlpha = dim * a * (0.25 + 0.75 * (1 - p.u) * 0.8 + 0.2 * p.w);
            cx.fillStyle = f.col;
            cx.fillRect(n.x + Math.cos(an) * r, n.y + Math.sin(an) * r, on ? 2 : 1.5, on ? 2 : 1.5);
          }

          cx.globalAlpha = a * (on ? 1 : 0.75);
          T(cx, f.id, n.x, n.y + 4, '#fff', on ? 14 : 11, 'center', 700);
          T(cx, Math.round(f.n2 * a).toString(), n.x, n.y + n.r + 16, f.col, 11, 'center', 700);
          T(cx, f.pl, n.x, n.y + n.r + 29, on ? FG : DM, 9, 'center', on ? 700 : 400);
        });

        cx.globalAlpha = 1;
        cx.globalCompositeOperation = 'source-over';
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerleave', onPointerLeave);
      cv.removeEventListener('click', onClick);
    };
  }, [interaction]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[480px] sm:min-h-[540px] border border-[rgba(160,170,255,0.14)] rounded-[14px] overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 60%, #140b28 0%, #05060a 72%)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-55"
        style={{
          backgroundImage:
            'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
          maskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-manipulation"
        aria-label="Constellation of eight database rules, each drawn as a cloud sized by how many faults it caused, around the Oracle."
      />
    </div>
  );
}

/* ==========================================
   MAIN COMPONENT: AXIOM SYSTEM ARCHITECTURE
   ========================================== */
export const ScaleEfficiencyArchitecture = memo(function ScaleEfficiencyArchitecture({
  onSelectRun,
}: ScaleEfficiencyArchitectureProps) {
  const [activeTab, setActiveTab] = useState<'all' | '0' | '1' | '2'>('all');

  const st0Ref = useRef<InteractionState>({ hov: -1, sel: -1 });
  const st1Ref = useRef<InteractionState>({ hov: -1, sel: -1 });
  const st2Ref = useRef<InteractionState>({ hov: -1, sel: -1 });

  const [read0, setRead0] = useState<{ idx: number; auto: boolean; sel: number }>({ idx: 0, auto: true, sel: -1 });
  const [read1, setRead1] = useState<{ idx: number; auto: boolean; sel: number }>({ idx: 3, auto: true, sel: -1 });
  const [read2, setRead2] = useState<{ idx: number; auto: boolean; sel: number }>({ idx: 0, auto: true, sel: -1 });

  const scrollToSection = (id: '0' | '1' | '2') => {
    setActiveTab('all');
    requestAnimationFrame(() => {
      document.getElementById(`arch-s${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Active readout builders
  const m0 = FL[read0.idx] ?? FL[0];
  const gap0 = (LEAD - m0.c).toFixed(1);
  const m0Desc =
    (read0.idx === 0
      ? 'The leader. Every other model is placed by how far it falls behind this score.'
      : `${gap0} points behind the leader. ${
          m0.c > LEAD * 0.85 ? 'A close second tier.' : m0.c > LEAD * 0.55 ? 'Solid, with room to improve.' : 'Well behind.'
        }`) +
    (m0.d < m0.t
      ? ` Run still in progress: ${m0.d} of ${m0.t} trials done.`
      : m0.t < 720
      ? ` Short run (${m0.t} trials), so treat the score with care.`
      : ` Run complete: ${m0.d} of ${m0.t} trials.`);

  const m1 = COND[read1.idx] ?? COND[3];
  const gap1 = Math.round(((m1.v - GA) / (GB - GA)) * 100);
  const m1Desc =
    m1.p +
    (m1.id === 'A' ? '' : ` It covers ${gap1}% of the distance from no help to the answer key.`) +
    (m1.tok ? ` Prompt length: ${m1.tok.toLocaleString('en-US')} tokens.` : '');

  const m2 = FAULT[read2.idx] ?? FAULT[0];

  return (
    <section className="w-full max-w-[1280px] mx-auto px-1 sm:px-2 py-4 font-mono text-[#e8eaf2] space-y-6">
      {/* Top Header & Section Switcher */}
      <header className="flex flex-wrap justify-between items-end gap-5 pb-6 border-b border-[rgba(160,170,255,0.14)]">
        <div>
          <p className="m-0 mb-2.5 text-[#a78bfa] tracking-[0.2em] text-[11px] font-bold">
            SECTION 07 // SCALE, EFFICIENCY &amp; ORACLE TELEMETRY
          </p>
          <h1 className="font-sans m-0 text-[clamp(32px,5vw,58px)] font-extrabold uppercase tracking-[-0.04em] leading-none text-[#e8eaf2]">
            Axiom system architecture
          </h1>
          <p className="text-[#aab0c8] max-w-[680px] mt-3.5 text-[13px] leading-[1.7] m-0">
            AI models can write database changes, but nobody should trust them unchecked. Axiom checks every change in a real database and counts exactly what goes wrong. This page shows what that testing found.
          </p>
        </div>

        <div
          className="flex flex-wrap gap-1 p-1.5 border border-[rgba(160,170,255,0.14)] rounded-[12px] bg-[rgba(10,7,20,0.6)]"
          role="group"
          aria-label="Show sections"
        >
          {(
            [
              ['all', 'All 3 sections'],
              ['0', '01 · Models'],
              ['1', '02 · What helps'],
              ['2', '03 · What breaks'],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              aria-pressed={activeTab === val}
              onClick={() => setActiveTab(val)}
              className={`border-0 rounded-[8px] font-mono text-[10px] tracking-[0.1em] px-3.5 py-2 uppercase transition-all cursor-pointer ${
                activeTab === val
                  ? 'bg-[#2a1647] text-[#e8eaf2] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.5)] font-bold'
                  : 'bg-transparent text-[#7c819a] hover:text-[#e8eaf2]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </header>

      {/* One-Minute Primer & 3 Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-5 my-6">
        <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.55)] p-5 min-w-0">
          <h3 className="m-0 mb-3 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">HOW AXIOM WORKS, IN ONE MINUTE</h3>
          <ol className="m-0 p-0 list-none flex flex-col gap-3">
            <li className="grid grid-cols-[26px_1fr] gap-3 items-start text-[#c8cce0] leading-[1.6] text-xs">
              <span className="flex items-center justify-center w-6 h-6 border border-[#a855f7] text-[#d8b4fe] font-bold text-[11px]">
                1
              </span>
              <span>
                An AI model is given a task and writes a <b className="text-[#e8eaf2]">database change</b> (a SQL migration).
              </span>
            </li>
            <li className="grid grid-cols-[26px_1fr] gap-3 items-start text-[#c8cce0] leading-[1.6] text-xs">
              <span className="flex items-center justify-center w-6 h-6 border border-[#a855f7] text-[#d8b4fe] font-bold text-[11px]">
                2
              </span>
              <span>
                Axiom runs that change in a <b className="text-[#e8eaf2]">real PostgreSQL 16 database</b> and tests it against a fixed rulebook of 39 contracts. No AI is involved in the grading.
              </span>
            </li>
            <li className="grid grid-cols-[26px_1fr] gap-3 items-start text-[#c8cce0] leading-[1.6] text-xs">
              <span className="flex items-center justify-center w-6 h-6 border border-[#a855f7] text-[#d8b4fe] font-bold text-[11px]">
                3
              </span>
              <span>
                If a rule is broken, the model is told <b className="text-[#e8eaf2]">which rule</b> and nothing more. It tries again, and every result is recorded.
              </span>
            </li>
          </ol>
        </div>

        <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.55)] p-5 min-w-0">
          <h3 className="m-0 mb-3 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THIS PAGE ANSWERS THREE QUESTIONS</h3>
          <div className="flex flex-col gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => scrollToSection('0')}
              className="grid grid-cols-[34px_1fr] gap-2.5 text-left text-[#c8cce0] p-2.5 border border-[rgba(160,170,255,0.14)] hover:border-[#a78bfa] transition-colors cursor-pointer"
            >
              <i className="not-italic text-[#a78bfa] font-bold">01</i>
              <span>
                <b className="text-[#e8eaf2]">Which models do this best?</b> Twelve models, same tests.
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('1')}
              className="grid grid-cols-[34px_1fr] gap-2.5 text-left text-[#c8cce0] p-2.5 border border-[rgba(160,170,255,0.14)] hover:border-[#a78bfa] transition-colors cursor-pointer"
            >
              <i className="not-italic text-[#a78bfa] font-bold">02</i>
              <span>
                <b className="text-[#e8eaf2]">What helps a model most?</b> And what does it cost?
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('2')}
              className="grid grid-cols-[34px_1fr] gap-2.5 text-left text-[#c8cce0] p-2.5 border border-[rgba(160,170,255,0.14)] hover:border-[#a78bfa] transition-colors cursor-pointer"
            >
              <i className="not-italic text-[#a78bfa] font-bold">03</i>
              <span>
                <b className="text-[#e8eaf2]">Which rules do models break most?</b> Where do they fail?
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 01 · MULTI-MODEL ORBIT */}
      {(activeTab === 'all' || activeTab === '0') && (
        <section id="arch-s0" className="pt-12 mt-4 border-t border-[rgba(160,170,255,0.14)]">
          <p className="m-0 mb-2 text-[#a78bfa] tracking-[0.2em] text-[11px] font-bold">// 01 · SCALE &amp; EFFICIENCY · MULTI-MODEL PROVENANCE</p>
          <h2 className="font-sans m-0 text-[clamp(28px,4vw,48px)] font-extrabold tracking-[-0.04em] leading-none text-[#e8eaf2] drop-shadow-[0_0_40px_rgba(168,85,247,0.35)]">
            Built to heal. Built to be cheap.
          </h2>
          <p className="text-[#aab0c8] max-w-[680px] mt-3.5 text-[13px] leading-[1.7] m-0">
            Every model sat the same test. The closer a model sits to the centre, the closer it gets to the best model&apos;s score.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 mt-6 items-start">
            <OrbitCanvas
              interaction={st0Ref}
              onSync={(idx, auto) => setRead0({ idx, auto, sel: st0Ref.current.sel })}
            />

            <aside className="flex flex-col gap-3.5 min-w-0 text-xs">
              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WHAT YOU ARE LOOKING AT</h3>
                <p className="m-0 text-[#c8cce0] leading-[1.65]">
                  A scoreboard drawn as a solar system. The sun is the best model, Nemotron 550B. Each planet is another AI model, placed by how far its score falls short of the sun&apos;s.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">HOW TO READ IT</h3>
                <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[#c8cce0]">
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full bg-[#84cc16]" />
                    <span>
                      <b className="text-[#e8eaf2]">Distance from the centre</b> is the gap to the leader. Closer means a better score. The dotted rings mark 10, 30 and 50 points behind.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full bg-[#c084fc]" />
                    <span>
                      <b className="text-[#e8eaf2]">Planet size</b> is the model&apos;s parameter count in billions, when it is known. Bigger planet, bigger model.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full border-[1.5px] border-dashed border-[#fb923c]" />
                    <span>
                      <b className="text-[#e8eaf2]">A partial ring</b> around a planet means its run is still going. The ring fills as trials finish.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-2 w-4 h-1 bg-[#7c819a]" />
                    <span>
                      <b className="text-[#e8eaf2]">Angle means nothing.</b> Planets only drift for show.
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className="border border-[rgba(160,170,255,0.14)] bg-white/[0.03] p-4"
                style={{ borderLeft: `2px solid ${m0.col}` }}
                aria-live="polite"
              >
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
                  NOW HIGHLIGHTED{read0.auto ? ' · AUTO' : ''}
                </h3>
                <p className="m-0 font-bold text-[13px] tracking-[0.04em]" style={{ color: m0.col }}>
                  {m0.n}
                </p>
                <p className="my-1 font-bold text-[28px] leading-[1.1] tabular-nums text-[#e8eaf2]">
                  {m0.c}%<small className="text-xs font-normal text-[#7c819a]"> of rules satisfied</small>
                </p>
                <p className="m-0 text-[#c8cce0] leading-[1.6]">{m0Desc}</p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">ALL MODELS · BEST FIRST · CLICK ONE</h3>
                <div className="flex flex-col gap-0.5">
                  {FL.map((m, j) => {
                    const isOn = read0.idx === j;
                    const isSel = read0.sel === j;
                    return (
                      <button
                        key={m.n}
                        type="button"
                        aria-pressed={isSel}
                        onClick={() => {
                          const next = st0Ref.current.sel === j ? -1 : j;
                          st0Ref.current.sel = next;
                          setRead0({ idx: next >= 0 ? next : j, auto: next < 0, sel: next });
                          if (next >= 0 && onSelectRun) onSelectRun(m.runId);
                        }}
                        onMouseEnter={() => {
                          st0Ref.current.hov = j;
                        }}
                        onMouseLeave={() => {
                          st0Ref.current.hov = -1;
                        }}
                        style={{ '--c': m.col, borderColor: isOn ? m.col : 'transparent' } as React.CSSProperties}
                        className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2.5 items-center w-full text-left font-mono text-[11px] px-2 py-1.5 border transition-colors cursor-pointer ${
                          isOn ? 'bg-white/[0.05] text-[#e8eaf2]' : 'text-[#aab0c8] hover:border-[rgba(160,170,255,0.14)]'
                        }`}
                      >
                        <i className="w-2 h-2 rounded-full" style={{ background: m.col }} />
                        <span className="truncate">{m.n}</span>
                        <b className="font-medium tabular-nums text-[#e8eaf2]">{m.c}%</b>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4" style={{ borderLeft: `2px solid ${VI}` }}>
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THE TAKEAWAY</h3>
                <p className="m-0 text-[#e8eaf2] text-[13px] leading-[1.6]">
                  Same tests, same rules, twelve models. The leader satisfies 73.6% of the rules that apply to a task. The smallest model reaches 7.0%. Axiom measures that gap instead of guessing at it.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WORDS USED HERE</h3>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                  <dt className="text-[#e8eaf2] font-bold">Convergence</dt>
                  <dd className="m-0 text-[#aab0c8]">On average, the share of the applicable rules that the model&apos;s final SQL satisfies.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Trial</dt>
                  <dd className="m-0 text-[#aab0c8]">One attempt by one model at one task under one setup. A full run is 720 trials (120 tasks × 6 setups).</dd>
                  <dt className="text-[#e8eaf2] font-bold">Parameters</dt>
                  <dd className="m-0 text-[#aab0c8]">A rough size measure for an AI model. Billions are common.</dd>
                </dl>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* SECTION 02 · RECOVERY AND TOKENS */}
      {(activeTab === 'all' || activeTab === '1') && (
        <section id="arch-s1" className="pt-12 mt-4 border-t border-[rgba(160,170,255,0.14)]">
          <p className="m-0 mb-2 text-[#a78bfa] tracking-[0.2em] text-[11px] font-bold">// 02 · EFFICIENCY · RECOVERY AND TOKENS</p>
          <h2 className="font-sans m-0 text-[clamp(28px,4vw,48px)] font-extrabold tracking-[-0.04em] leading-none text-[#e8eaf2] drop-shadow-[0_0_40px_rgba(168,85,247,0.35)]">
            Most of the gap. Half the tokens.
          </h2>
          <p className="text-[#aab0c8] max-w-[680px] mt-3.5 text-[13px] leading-[1.7] m-0">
            Left: how much of the distance between &ldquo;no help&rdquo; and &ldquo;the answer key&rdquo; each way of helping the model wins back. Right: how much text each approach puts in the prompt.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 mt-6 items-start">
            <DialsCanvas
              interaction={st1Ref}
              onSync={(idx, auto) => setRead1({ idx, auto, sel: st1Ref.current.sel })}
            />

            <aside className="flex flex-col gap-3.5 min-w-0 text-xs">
              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WHAT YOU ARE LOOKING AT</h3>
                <p className="m-0 text-[#c8cce0] leading-[1.65]">
                  The same model, Nemotron 550B, tested five ways. What changes between them is the help it gets. The half-circle shows the score each setup earns. The rings show how long the prompt is.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">HOW TO READ IT</h3>
                <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[#c8cce0]">
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-2 w-4 h-1 bg-[#22d3ee]" />
                    <span>
                      <b className="text-[#e8eaf2]">Half-circle dial:</b> the left end is the score with no help (47.4%). The right end is the best possible score with an answer key (93.9%). A tick shows where each setup lands.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full bg-[#22d3ee]" />
                    <span>
                      <b className="text-[#e8eaf2]">The big percentage</b> is how far along that path the setup gets. 100% would match the answer key.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full border-[1.5px] border-dashed border-[#a855f7]" />
                    <span>
                      <b className="text-[#e8eaf2]">Rings on the right:</b> a longer ring is a longer prompt. A tidy prompt is cheaper and faster to read.
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className="border border-[rgba(160,170,255,0.14)] bg-white/[0.03] p-4"
                style={{ borderLeft: `2px solid ${m1.col}` }}
                aria-live="polite"
              >
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
                  NOW HIGHLIGHTED{read1.auto ? ' · AUTO' : ''}
                </h3>
                <p className="m-0 font-bold text-[13px] tracking-[0.04em]" style={{ color: m1.col }}>
                  {m1.id} · {m1.n}
                </p>
                <p className="my-1 font-bold text-[28px] leading-[1.1] tabular-nums text-[#e8eaf2]">
                  {m1.v}%<small className="text-xs font-normal text-[#7c819a]"> of rules satisfied</small>
                </p>
                <p className="m-0 text-[#c8cce0] leading-[1.6]">{m1Desc}</p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THE FIVE SETUPS · CLICK ONE</h3>
                <div className="flex flex-col gap-0.5">
                  {COND.map((c, j) => {
                    const isOn = read1.idx === j;
                    const isSel = read1.sel === j;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={isSel}
                        onClick={() => {
                          const next = st1Ref.current.sel === j ? -1 : j;
                          st1Ref.current.sel = next;
                          setRead1({ idx: next >= 0 ? next : j, auto: next < 0, sel: next });
                        }}
                        onMouseEnter={() => {
                          st1Ref.current.hov = j;
                        }}
                        onMouseLeave={() => {
                          st1Ref.current.hov = -1;
                        }}
                        style={{ borderColor: isOn ? c.col : 'transparent' }}
                        className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2.5 items-center w-full text-left font-mono text-[11px] px-2 py-1.5 border transition-colors cursor-pointer ${
                          isOn ? 'bg-white/[0.05] text-[#e8eaf2]' : 'text-[#aab0c8] hover:border-[rgba(160,170,255,0.14)]'
                        }`}
                      >
                        <i className="w-2 h-2 rounded-full" style={{ background: c.col }} />
                        <span className="truncate">
                          {c.id} · {c.n}
                        </span>
                        <b className="font-medium tabular-nums text-[#e8eaf2]">{c.v}%</b>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4" style={{ borderLeft: `2px solid ${VI}` }}>
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THE TAKEAWAY</h3>
                <p className="m-0 text-[#e8eaf2] text-[13px] leading-[1.6]">
                  Handing the model the exact failed rule (C0) wins back 84% of the distance to the answer key and uses 51.3% fewer prompt tokens than starting with no help.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WORDS USED HERE</h3>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                  <dt className="text-[#e8eaf2] font-bold">Zero-shot</dt>
                  <dd className="m-0 text-[#aab0c8]">The model gets the task and nothing else.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Token</dt>
                  <dd className="m-0 text-[#aab0c8]">A chunk of text, roughly three quarters of a word. Models read and are billed by tokens.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Static reference</dt>
                  <dd className="m-0 text-[#aab0c8]">The score when the model is given all 34 rules statically in prompt (Condition B).</dd>
                  <dt className="text-[#e8eaf2] font-bold">Gap recovered</dt>
                  <dd className="m-0 text-[#aab0c8]">(score − no help) ÷ (reference − no help).</dd>
                </dl>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* SECTION 03 · FAULT CONSTELLATION */}
      {(activeTab === 'all' || activeTab === '2') && (
        <section id="arch-s2" className="pt-12 mt-4 border-t border-[rgba(160,170,255,0.14)]">
          <p className="m-0 mb-2 text-[#a78bfa] tracking-[0.2em] text-[11px] font-bold">// 03 · ORACLE TELEMETRY · INVARIANT SPECTRUM</p>
          <h2 className="font-sans m-0 text-[clamp(28px,4vw,48px)] font-extrabold tracking-[-0.04em] leading-none text-[#e8eaf2] drop-shadow-[0_0_40px_rgba(168,85,247,0.35)]">
            Where the models fail.
          </h2>
          <p className="text-[#aab0c8] max-w-[680px] mt-3.5 text-[13px] leading-[1.7] m-0">
            Each cloud is one database rule. The bigger the cloud, the more often models broke it. The tests are run by a real PostgreSQL 16 database, the Oracle.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 mt-6 items-start">
            <ConstellationCanvas
              interaction={st2Ref}
              onSync={(idx, auto) => setRead2({ idx, auto, sel: st2Ref.current.sel })}
            />

            <aside className="flex flex-col gap-3.5 min-w-0 text-xs">
              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WHAT YOU ARE LOOKING AT</h3>
                <p className="m-0 text-[#c8cce0] leading-[1.65]">
                  The eight rules models broke most often, drawn as clouds around the Oracle in the middle. The Oracle is the real database that tests every change. Each label F-xx is the rule&apos;s ID.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">HOW TO READ IT</h3>
                <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[#c8cce0]">
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full bg-[#22d3ee]" />
                    <span>
                      <b className="text-[#e8eaf2]">Cloud size and the number under it</b> is how many times a model broke that rule (a fault).
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-1 w-3 h-3 rounded-full bg-[#f43f5e]" />
                    <span>
                      <b className="text-[#e8eaf2]">Cloud colour</b> is the kind of rule: naming, tenant data, history that cannot change, timestamps, or incoming data.
                    </span>
                  </li>
                  <li className="grid grid-cols-[22px_1fr] gap-2.5 items-start leading-[1.55]">
                    <span className="block mt-2 w-4 h-1 bg-[#7c819a]" />
                    <span>
                      <b className="text-[#e8eaf2]">The dashed lines and moving dots</b> are the Oracle sending each verdict. Position means nothing.
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className="border border-[rgba(160,170,255,0.14)] bg-white/[0.03] p-4"
                style={{ borderLeft: `2px solid ${m2.col}` }}
                aria-live="polite"
              >
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
                  NOW HIGHLIGHTED{read2.auto ? ' · AUTO' : ''}
                </h3>
                <p className="m-0 font-bold text-[13px] tracking-[0.04em]" style={{ color: m2.col }}>
                  {m2.id} · {m2.d}
                </p>
                <p className="my-1 font-bold text-[28px] leading-[1.1] tabular-nums text-[#e8eaf2]">
                  {m2.n2}
                  <small className="text-xs font-normal text-[#7c819a]">
                    {' '}
                    faults · {((m2.n2 / TOT) * 100).toFixed(1)}% of {TOT.toLocaleString('en-US')}
                  </small>
                </p>
                <p className="m-0 text-[#c8cce0] leading-[1.6]">
                  <b className="text-[#e8eaf2]">{m2.n}</b>. {m2.p}
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THE EIGHT RULES · MOST BROKEN FIRST · CLICK ONE</h3>
                <div className="flex flex-col gap-0.5">
                  {FAULT.map((f, j) => {
                    const isOn = read2.idx === j;
                    const isSel = read2.sel === j;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={isSel}
                        onClick={() => {
                          const next = st2Ref.current.sel === j ? -1 : j;
                          st2Ref.current.sel = next;
                          setRead2({ idx: next >= 0 ? next : j, auto: next < 0, sel: next });
                        }}
                        onMouseEnter={() => {
                          st2Ref.current.hov = j;
                        }}
                        onMouseLeave={() => {
                          st2Ref.current.hov = -1;
                        }}
                        style={{ borderColor: isOn ? f.col : 'transparent' }}
                        className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2.5 items-center w-full text-left font-mono text-[11px] px-2 py-1.5 border transition-colors cursor-pointer ${
                          isOn ? 'bg-white/[0.05] text-[#e8eaf2]' : 'text-[#aab0c8] hover:border-[rgba(160,170,255,0.14)]'
                        }`}
                      >
                        <i className="w-2 h-2 rounded-full" style={{ background: f.col }} />
                        <span className="truncate">
                          {f.id} · {f.pl}
                        </span>
                        <b className="font-medium tabular-nums text-[#e8eaf2]">{f.n2}</b>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4" style={{ borderLeft: `2px solid ${VI}` }}>
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">THE TAKEAWAY</h3>
                <p className="m-0 text-[#e8eaf2] text-[13px] leading-[1.6]">
                  Failures are not random. Naming mistakes alone are 41.5% of the 1,484 faults shown, and adding the tenant-data rule brings it to 55.5%. That is where a model needs the most help.
                </p>
              </div>

              <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4">
                <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">WORDS USED HERE</h3>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                  <dt className="text-[#e8eaf2] font-bold">Fact</dt>
                  <dd className="m-0 text-[#aab0c8]">One database rule the checker tests, such as &ldquo;index names must follow the convention&rdquo;.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Fault</dt>
                  <dd className="m-0 text-[#aab0c8]">One time a model&apos;s SQL broke a rule.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Oracle</dt>
                  <dd className="m-0 text-[#aab0c8]">A real PostgreSQL 16 database used as the referee. No AI judges the result.</dd>
                  <dt className="text-[#e8eaf2] font-bold">Tenant / RLS</dt>
                  <dd className="m-0 text-[#aab0c8]">Row-level security keeps each customer&apos;s rows invisible to other customers.</dd>
                </dl>
              </div>

              <p className="m-0 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
                The plain-English names for each rule are a reading aid, not the official rule text.
              </p>
            </aside>
          </div>
        </section>
      )}
    </section>
  );
});

export default ScaleEfficiencyArchitecture;
