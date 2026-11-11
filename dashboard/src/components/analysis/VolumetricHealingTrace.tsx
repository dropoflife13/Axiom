'use client';

import React, { memo, useEffect, useRef } from 'react';

export interface VolumetricHealingTraceProps {
  activeModelName?: string;
  onSelectFact?: (factId: string) => void;
}

const FONT = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const EM = '#10b981';
const CY = '#22d3ee';
const RE = '#f43f5e';
const AM = '#fbbf24';
const DM = '#7c819a';
const FG = '#e8eaf2';

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

const ST: [string, string, number, number, string | null][] = [
  ['REQUEST INGRESS', 'TASK INGRESS // SEED 0x7fa92e', 0.52, 0.86, null],
  ['AI CANDIDATE', 'CANDIDATE GENERATION // ZERO TEMP', 0.48, 0.72, null],
  ['AST GATE', 'F-10 SOFT DELETE PROTOCOL', 0.43, 0.58, 'F-10'],
  ['FORCE RLS', 'F-25 MULTI-TENANT FORCE RLS', 0.46, 0.47, 'F-25'],
  ['JWT ISOLATION', 'F-26 CRYPTOGRAPHIC JWT CHECK', 0.39, 0.35, 'F-26'],
  ['ORACLE CERTIFIED', 'ORACLE CRUCIBLE VERIFIED', 0.32, 0.2, null],
];

const A = [0.6, 2.0, 3.5, 6.0, 8.5, 11.2];
const D = [1.0, 2.5, 4.9, 7.4, 9.9, 99];
const L = 15;
const ROOTS: [string, string][] = [
  ['PDH-SHORT', '49.1k'],
  ['PDL-SHORT', '49.3k'],
  ['ORL-SHORT', '49.2k'],
  ['ORH-SHORT', '20,214 N'],
  ['ORL-SHORT', '49.0k'],
  ['DRH-SHORT', '49.4k'],
  ['PDH-SHORT', '49.2k'],
  ['PDL-SHORT', '49.5k'],
];

function cat(p: [number, number][], t: number): [number, number] {
  const n = p.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const a = p[Math.max(0, i - 1)];
  const b = p[i];
  const c = p[i + 1];
  const d = p[Math.min(n, i + 2)];
  return [
    0.5 *
      (2 * b[0] +
        (-a[0] + c[0]) * f +
        (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * f * f +
        (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * f * f * f),
    0.5 *
      (2 * b[1] +
        (-a[1] + c[1]) * f +
        (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * f * f +
        (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * f * f * f),
  ];
}

export const VolumetricHealingTrace = memo(function VolumetricHealingTrace({
  activeModelName = 'NEMOTRON 550B',
  onSelectFact,
}: VolumetricHealingTraceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep latest props in refs to avoid restarting the 60FPS animation loop
  const activeModelNameRef = useRef(activeModelName);
  activeModelNameRef.current = activeModelName;
  const onSelectFactRef = useRef(onSelectFact);
  onSelectFactRef.current = onSelectFact;
  const t0Ref = useRef(performance.now());

  useEffect(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    if (!cv || !container) return;

    const cx = cv.getContext('2d');
    if (!cx) return;

    let W = 0;
    let H = 0;
    let DP = 1;
    let tree: HTMLCanvasElement | null = null;
    let path: [number, number][] = [];
    let stI: number[] = [];
    let area = { x: 0, w: 0, y: 0, h: 0 };
    let animId = 0;

    const rr = rng(9);
    const P: { x: number; y: number; s: number; a: number }[] = [];
    for (let i = 0; i < 180; i++) {
      P.push({ x: rr(), y: rr(), s: 0.02 + rr() * 0.05, a: rr() });
    }

    function build() {
      if (!cv || !container) return;
      const e = container.getBoundingClientRect();
      const w = Math.round(e.width);
      const h = Math.round(e.height);
      const dp = Math.min(window.devicePixelRatio || 1, 2);
      if (w <= 0 || h <= 0) return;

      // Only rebuild offscreen tree if dimensions actually changed
      if (w === W && h === H && dp === DP && tree) return;

      W = w;
      H = h;
      DP = dp;
      cv.width = W * DP;
      cv.height = H * DP;

      area = {
        x: W * 0.2,
        w: W * (W > 900 ? 0.52 : 0.7),
        y: 84,
        h: H - 190,
      };

      const pts: [number, number][] = ST.map((s) => [
        area.x + s[2] * area.w,
        area.y + s[3] * area.h,
      ]);

      path = [];
      stI = [];
      for (let i = 0; i <= 200; i++) {
        path.push(cat(pts, i / 200));
      }
      ST.forEach((_, i) => stI.push(Math.round((i / 5) * 200)));

      // Trunk follows the six stages; branches sprout organically from it
      const r = rng(21);
      const segs: [number, number, number, number, number][] = [];
      function br(x: number, y: number, a: number, l: number, d: number) {
        if (d > 6 || segs.length > 3200) return;
        const x2 = x + Math.cos(a) * l;
        const y2 = y + Math.sin(a) * l;
        segs.push([x, y, x2, y2, d]);
        const n = 2 + (r() < 0.45 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          br(x2, y2, a + (r() - 0.5) * 1.1, l * (0.68 + r() * 0.1), d + 1);
        }
      }

      for (let j = 6; j < 200; j += 3) {
        const p = path[j];
        const h = 1 - j / 200;
        const up = -Math.PI / 2;
        for (const sd of [-1, 1]) {
          if (r() < 0.25) continue;
          br(
            p[0],
            p[1],
            up + sd * (0.5 + r() * 0.8),
            area.h *
              (0.03 + 0.08 * Math.sin(Math.PI * Math.min(1, h * 1.15))) *
              (0.6 + r() * 0.7),
            1
          );
        }
      }

      const tCanvas = document.createElement('canvas');
      tCanvas.width = W * DP;
      tCanvas.height = H * DP;
      const g = tCanvas.getContext('2d');
      if (g) {
        g.scale(DP, DP);
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        segs.forEach((s) => {
          g.strokeStyle = EM;
          g.globalAlpha = 0.08 + 0.5 / Math.pow(s[4], 1.2);
          g.lineWidth = Math.max(0.5, 2.2 - s[4] * 0.3);
          g.beginPath();
          g.moveTo(s[0], s[1]);
          g.lineTo(s[2], s[3]);
          g.stroke();
        });
        g.globalAlpha = 0.55;
        g.lineWidth = 3;
        g.strokeStyle = EM;
        g.beginPath();
        path.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
      }
      tree = tCanvas;
    }

    const T = (
      s: string,
      x: number,
      y: number,
      c: string,
      sz: number,
      al: CanvasTextAlign = 'left',
      w: number = 400
    ) => {
      cx.fillStyle = c;
      cx.font = `${w} ${sz}px ${FONT}`;
      cx.textAlign = al;
      cx.fillText(s, x, y);
    };

    const glow = (c: string, b: number) => {
      cx.shadowColor = c;
      cx.shadowBlur = b;
    };

    function pos(t: number): number {
      for (let i = 0; i < 5; i++) {
        if (t < A[i + 1]) {
          if (t < D[i]) return stI[i];
          return lp(stI[i], stI[i + 1], sm(kk(t, D[i], A[i + 1])));
        }
      }
      return stI[5];
    }

    function draw(t: number) {
      if (!cx || W <= 0 || H <= 0) return;
      cx.setTransform(DP, 0, 0, DP, 0, 0);
      cx.clearRect(0, 0, W, H);
      const fade = 1; // Stably visible at 100% (never fades to black or resets)
      const pi = pos(t);
      const big = W > 900;

      if (tree) {
        cx.globalAlpha = fade * (0.8 + 0.1 * Math.sin(t * 1.3));
        cx.globalCompositeOperation = 'lighter';
        cx.drawImage(tree, 0, 0, W, H);
      }

      P.forEach((p) => {
        const y = (((p.y - t * p.s) % 1) + 1) % 1;
        cx.fillStyle = EM;
        cx.globalAlpha = fade * 0.35 * p.a;
        cx.fillRect(p.x * W, y * H, 1.4, 1.4);
      });

      // Healed traveling path
      cx.globalAlpha = fade;
      cx.lineCap = 'round';
      glow(CY, 14);
      cx.strokeStyle = CY;
      cx.lineWidth = 2.4;
      cx.beginPath();
      for (let i = 0; i <= pi; i++) {
        const p = path[Math.min(200, Math.floor(i))];
        i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]);
      }
      if (pi < 200) {
        const q = cat(path, pi / 200);
        cx.lineTo(q[0], q[1]);
      }
      cx.stroke();
      glow('#fff', 0);

      const hp = cat(path, pi / 200);
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(hp[0], hp[1], 4, 0, 6.3);
      cx.fill();

      cx.globalCompositeOperation = 'source-over';

      // Stages
      ST.forEach((s, i) => {
        const p = path[stI[i]];
        const arr = t >= A[i];
        const gate = Boolean(s[4]);
        const fail = gate && t >= A[i] && t < A[i] + 0.7;
        const adv = gate && t >= A[i] + 0.7 && t < A[i] + 1.3;
        const last = i === 5;
        const c = fail ? RE : adv ? AM : last ? EM : arr ? CY : DM;

        cx.globalAlpha = fade;
        cx.fillStyle = c;
        cx.globalAlpha = fade * (arr ? 1 : 0.3);
        cx.beginPath();
        cx.arc(p[0], p[1], arr ? 5 : 3, 0, 6.3);
        cx.fill();

        if (arr) {
          const pr = sm(kk(t, A[i], A[i] + 1.2));
          cx.strokeStyle = c;
          cx.globalAlpha = fade * (1 - pr) * 0.7;
          cx.beginPath();
          cx.arc(p[0], p[1], 5 + pr * 28, 0, 6.3);
          cx.stroke();
        }

        // Failing branch sprouts, advises, then withers
        if (fail || adv) {
          const sd = i % 2 ? 1 : -1;
          const len =
            70 *
            (fail
              ? sm(kk(t, A[i], A[i] + 0.25))
              : 1 - sm(kk(t, A[i] + 0.7, A[i] + 1.3)));
          const bx = p[0] + sd * len * 0.9;
          const by = p[1] - len * 0.5;

          cx.globalAlpha = fade * (fail ? 1 : 0.6);
          cx.strokeStyle = RE;
          cx.lineWidth = 2;
          glow(RE, 10);
          cx.beginPath();
          cx.moveTo(p[0], p[1]);
          cx.lineTo(bx, by);
          cx.stroke();
          glow('#fff', 0);

          T(
            fail ? s[4] + ' ✕ TRIPPED' : 'ADVISE · RULE < 24 WORDS',
            bx + sd * 8,
            by,
            fail ? RE : AM,
            10,
            sd > 0 ? 'left' : 'right',
            700
          );
        }

        // Stage label card
        cx.globalAlpha = fade * (arr ? 1 : 0.35);
        const lx = p[0] + 18;
        const tx = '0' + (i + 1) + ' · ' + s[0];
        cx.font = `700 11px ${FONT}`;
        const w1 =
          Math.max(
            cx.measureText(tx).width,
            (() => {
              cx.font = `400 9px ${FONT}`;
              return cx.measureText(s[1]).width;
            })()
          ) + 22;

        cx.fillStyle = 'rgba(5,6,10,0.78)';
        cx.fillRect(lx, p[1] - 19, w1, 36);
        cx.fillStyle = c;
        cx.fillRect(lx, p[1] - 19, 2, 36);
        T(tx, lx + 10, p[1] - 4, FG, 11, 'left', 700);
        T(s[1], lx + 10, p[1] + 11, DM, 9);
      });

      cx.globalAlpha = fade;

      // Accuracy gauge: zero-shot 47.4% → best 86.31%, ceiling 93.88%
      const gx = Math.max(34, W * 0.07);
      const gy = area.y;
      const gh = area.h;
      const Y = (v: number) => gy + gh - ((v - 40) / 60) * gh;
      const prog = clamp(pi / 200);
      const val = lp(47.4, 86.31, sm(prog));

      cx.fillStyle = DM;
      cx.globalAlpha = fade * 0.5;
      cx.fillRect(gx, gy, 1, gh);

      (
        [
          [47.4, 'A · ZERO-SHOT', DM],
          [71.9, 'C · DISTILLED', DM],
          [86.31, 'C0 · BEST', CY],
          [93.88, 'B · BOUND', AM],
        ] as [number, string, string][]
      ).forEach(([v, l, c]) => {
        cx.globalAlpha = fade;
        cx.fillStyle = c;
        cx.fillRect(gx - 5, Y(v), 11, 1.5);
        T(v + '%', gx + 16, Y(v) + 4, c, 10, 'left', 700);
        T(l, gx + 16, Y(v) + 16, DM, 8);
      });

      for (let i = 0; i < 260; i++) {
        const u = (i * 0.6180339) % 1;
        const v = 47.4 + u * (val - 47.4);
        cx.fillStyle = CY;
        cx.globalAlpha = fade * (0.15 + 0.6 * (((i * 7) % 10) / 10));
        cx.fillRect(gx - 3 - ((i * 13) % 7), Y(v), 1.6, 1.6);
      }

      cx.globalAlpha = fade;
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(gx, Y(val), 4, 0, 6.3);
      cx.fill();

      const gp = sm(kk(t, 11.2, 12.4));
      if (gp > 0) {
        cx.strokeStyle = AM;
        cx.globalAlpha = fade * gp;
        cx.setLineDash([3, 3]);
        cx.beginPath();
        cx.moveTo(gx + 70, Y(93.88));
        cx.lineTo(gx + 70, Y(86.31));
        cx.stroke();
        cx.setLineDash([]);
        T(
          'GAP 7.57',
          gx + 80,
          (Y(93.88) + Y(86.31)) / 2 + 4,
          AM,
          11,
          'left',
          700
        );
      }

      // Healing Ledger on wide screens
      if (big) {
        const lx = W * 0.8;
        const ly = area.y + 10;
        cx.globalAlpha = fade;
        T('HEALING LEDGER', lx, ly, DM, 10, 'left', 700);
        T('single illustrative run', lx, ly + 14, DM, 9);

        ST.forEach((s, i) => {
          const arr = t >= A[i];
          const gate = Boolean(s[4]);
          const fail = gate && t >= A[i] && t < A[i] + 0.7;
          const adv = gate && t >= A[i] + 0.7 && t < A[i] + 1.3;
          const y = ly + 44 + i * 34;
          const act = t >= A[i] && (i === 5 || t < A[i + 1]);

          const g = !arr ? '○' : fail ? '✕' : adv ? '◇' : '✓';
          const c = !arr ? DM : fail ? RE : adv ? AM : i === 5 ? EM : CY;
          T(g, lx, y, c, 14, 'left', 700);
          T(s[0], lx + 22, y - 1, act ? FG : DM, 10, 'left', act ? 700 : 400);
          T(
            !arr
              ? 'pending'
              : fail
              ? 'tripped ' + s[4]
              : adv
              ? 'advising'
              : i === 5
              ? 'PASS'
              : gate
              ? 'healed'
              : 'ok',
            lx + 22,
            y + 12,
            c,
            9
          );
        });
      }

      // Top HUD readouts
      cx.globalAlpha = fade;
      T('● LENS · PATH // REFLEXION TRACE TOPOLOGY', 24, 30, EM, 11, 'left', 700);
      T(
        'VOLUMETRIC HEALING TRACE',
        24,
        60,
        FG,
        Math.min(26, W / 34),
        'left',
        700
      );

      if (big) {
        T(
          'NODES 13,023 · CUT 68% · CRITERION: RELATIONAL AST VERIFIER · PG 16 DOCKER · DEPTH 6 STAGES',
          W - 24,
          30,
          DM,
          10,
          'right'
        );
        T(
          `${activeModelNameRef.current || 'NEMOTRON 550B'} · AST KILL RATE 100% (56/56)`,
          W - 24,
          60,
          CY,
          11,
          'right',
          700
        );
      }

      // Bottom census of roots
      const by = H - 60;
      const sw = (W - 48) / 8;
      ROOTS.forEach((r, i) => {
        const x = 24 + i * sw;
        const on = i === 3;
        cx.globalAlpha = fade * (on ? 1 : 0.5);
        cx.strokeStyle = on ? EM : DM;
        cx.beginPath();
        cx.arc(x + sw / 2, by, on ? 7 : 4, Math.PI, 0);
        cx.stroke();
        T(r[0], x + sw / 2, by + 16, on ? EM : DM, 9, 'center', on ? 700 : 400);
        T(
          (on ? 'ENTERED · ' : 'OPEN · ') + r[1],
          x + sw / 2,
          by + 28,
          on ? EM : DM,
          9,
          'center'
        );
      });

      cx.globalAlpha = fade;
      T(
        'GAP · BOUND − BEST: 93.88 − 86.31 = 7.57 PTS · 6 STEPS TO THE BEST',
        24,
        H - 10,
        FG,
        10,
        'left',
        700
      );
      T(
        'ILLUSTRATIVE TOPOLOGY · TREE DRAWN AT REDUCED DENSITY',
        W - 24,
        H - 10,
        DM,
        9,
        'right'
      );
      cx.globalAlpha = 1;
    }

    build();
    const ro = new ResizeObserver(() => build());
    ro.observe(container);

    const onClick = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      // Check if clicking near any gate node to select fact
      ST.forEach((s, i) => {
        if (!s[4]) return;
        const p = path[stI[i]];
        if (!p) return;
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < 30 && onSelectFactRef.current) {
          onSelectFactRef.current(s[4]);
        }
      });
    };

    cv.addEventListener('click', onClick);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frame(n: number) {
      const elapsed = (n - t0Ref.current) / 1000;
      draw(reduced ? 13 : elapsed);
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      cv.removeEventListener('click', onClick);
    };
  }, []); // Run effect ONCE on mount so 60FPS loop never tears down or resets on re-renders

  const handleReplay = () => {
    t0Ref.current = performance.now();
  };

  return (
    <section className="w-full max-w-7xl mx-auto space-y-4">
      <div
        ref={containerRef}
        className="w-full h-[640px] sm:h-[720px] rounded-2xl overflow-hidden border border-emerald-500/20 relative shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_24px_rgba(16,185,129,0.1)] select-none cursor-pointer"
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, #0a1f1a 0%, #05060a 70%)',
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-label="Animated healing trace: a migration climbs six stages, three gates fail and heal, and the gauge rises from 47.4 to 86.31 percent."
        />
        {/* Replay Trace Control Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleReplay();
          }}
          className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 font-mono text-[10px] font-bold tracking-wider uppercase transition-all backdrop-blur-md cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
          title="Click to replay the 6-stage Reflexion healing traversal"
        >
          <span>↺ REPLAY TRACE</span>
        </button>
      </div>
    </section>
  );
});

export default VolumetricHealingTrace;
