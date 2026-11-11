'use client';

import React, { memo, useEffect, useRef } from 'react';
import type { RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';

export interface FleetTelemetryGridProps {
  runOptions?: readonly RunOption[];
  fleet?: RunStatus[];
  activeRunId?: string;
  onSelectRun?: (runId: string) => void;
}

// Model data: Name, best compliance %, parameter size in billions (null when none), accent color, internal runId
const M: [string, number, number | null, string, string][] = [
  ['NEMOTRON 550B', 86.31, 550, '#22d3ee', 'nemotron-2'],
  ['GEMINI 3.5 FLASH LITE', 81.40, null, '#34d399', 'gemini-flash-lite-full'],
  ['LLAMA 3.3 70B', 79.20, 70, '#3b82f6', 'llama33-mini'],
  ['GLM-5.3 FLASH', 78.50, null, '#2dd4bf', 'glm5-2'],
  ['GEMMA 4 31B DENSE', 76.80, 31, '#c084fc', 'gemma4-31b-full'],
  ['QWEN 3.8 27B', 74.17, 27, '#fb923c', 'qwen27b-2'],
  ['NEMOTRON 3.5 LIGHTNING', 61.67, null, '#fbbf24', 'nemotron-lightning-full'],
  ['LIQUID 1.7B MINI', 52.10, 1.7, '#38bdf8', 'liquid17b-mini'],
];

const LEAD = M[0][1];
const MAXGAP = 35;
const FONT = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const DM = '#7c819a';
const FG = '#e8eaf2';
const CY = '#22d3ee';
const AM = '#fbbf24';
const GR = '#34d399';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const kk = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const sm = (x: number) => x * x * (3 - 2 * x);

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const R0 = rng(8);
const PT = Array.from({ length: 600 }, () => ({ u: R0(), v: R0(), w: R0() }));

export const FleetTelemetryGrid = memo(function FleetTelemetryGrid({
  runOptions = [],
  activeRunId = 'nemotron-2',
  onSelectRun,
}: FleetTelemetryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep latest props in refs to avoid restarting the 60FPS animation loop
  const runOptionsRef = useRef(runOptions);
  runOptionsRef.current = runOptions;
  const activeRunIdRef = useRef(activeRunId);
  activeRunIdRef.current = activeRunId;
  const onSelectRunRef = useRef(onSelectRun);
  onSelectRunRef.current = onSelectRun;
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    if (!cv || !container) return;

    const cx = cv.getContext('2d');
    if (!cx) return;

    let W = 0;
    let H = 0;
    let DP = 1;
    let hov = -1;
    let G: { cx: number; cy: number; R: number; P?: [number, number, number][] } = { cx: 0, cy: 0, R: 0 };
    let animId = 0;

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

    function size() {
      if (!cv || !container) return;
      const e = container.getBoundingClientRect();
      const w = Math.round(e.width);
      const h = Math.round(e.height);
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

    const rad = (g: number) => 34 + (g / MAXGAP) * (G.R - 34);
    const ps = (m: [string, number, number | null, string, string]) =>
      m[2] ? 5 + (Math.log10(m[2]) / Math.log10(550)) * 9 : 6;
    const ang = (i: number, t: number) => i * 2.399 + t * (0.5 / Math.sqrt(1 + i * 0.9));

    function draw(t: number) {
      if (!cx || W <= 0 || H <= 0) return;
      cx.setTransform(DP, 0, 0, DP, 0, 0);
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';

      const wide = W > 900;
      G = {
        cx: wide ? W * 0.37 : W / 2,
        cy: H * 0.56,
        R: Math.min(wide ? W * 0.33 : W * 0.44, H * 0.4),
      };
      const { cx: ox, cy: oy } = G;

      T('● FLEET TELEMETRY // ORBIT MAP', 24, 30, '#a78bfa', 11, 'left', 700);
      T('Distance is the gap to the leader.', 24, 66, FG, Math.min(30, W / 24), 'left', 700);
      T(
        'Closer means closer to Nemotron 550B’s ' +
          LEAD +
          '%. Size is parameter count. Angle and speed carry no meaning.',
        24,
        90,
        DM,
        10
      );

      // Gap rings
      [5, 10, 20, 30].forEach((g, i) => {
        const a = sm(kk(t, i * 0.2, i * 0.2 + 0.9));
        cx.globalAlpha = 0.3 * a;
        cx.strokeStyle = DM;
        cx.setLineDash([2, 5]);
        cx.beginPath();
        cx.arc(ox, oy, rad(g), 0, 6.3 * a);
        cx.stroke();
        cx.setLineDash([]);
        cx.globalAlpha = a;
        T(
          '−' + g + ' pts',
          ox + rad(g) * Math.SQRT1_2 + 4,
          oy - rad(g) * Math.SQRT1_2,
          DM,
          9
        );
      });

      // Leader: dense particle dust core
      const la = sm(kk(t, 0, 0.8));
      for (let i = 0; i < 260; i++) {
        const p = PT[i];
        const r = Math.pow(p.u, 0.7) * 24 * la;
        const a = p.v * 6.28 + t * 0.3 * (0.5 + p.w);
        cx.globalAlpha = (0.25 + 0.6 * p.w) * la;
        cx.fillStyle = CY;
        cx.fillRect(ox + Math.cos(a) * r, oy + Math.sin(a) * r, 1.6, 1.6);
      }
      cx.globalAlpha = la;
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(ox, oy, 3.5 + Math.sin(t * 3), 0, 6.3);
      cx.fill();
      T('NEMOTRON 550B · ' + LEAD + '%', ox, oy + 44, CY, 10, 'center', 700);

      G.P = [];
      M.forEach((m, i) => {
        if (!i) return;
        const gap = LEAD - m[1];
        const r = rad(gap);
        const a0 = ang(i, sm(kk(t, 0.4, 3)) * 0 + t);
        const a = sm(kk(t, 0.6 + i * 0.12, 1.4 + i * 0.12));
        const on = hov === i;
        const dim = hov >= 0 && !on ? 0.3 : 1;
        const s = ps(m);
        const px = ox + Math.cos(a0) * r;
        const py = oy + Math.sin(a0) * r;
        if (!G.P) G.P = [];
        G.P[i] = [px, py, s];

        // Particle comet trail
        cx.fillStyle = m[3];
        for (let k = 0; k < 46; k++) {
          const q = PT[(k * 13 + i * 41) % 600];
          const aa = a0 - k * 0.028;
          const rr = r + (q.v - 0.5) * 4;
          cx.globalAlpha = a * dim * (1 - k / 46) * 0.7 * (0.3 + 0.7 * q.w);
          cx.fillRect(ox + Math.cos(aa) * rr, oy + Math.sin(aa) * rr, 1.5, 1.5);
        }

        cx.globalAlpha = a * dim;
        cx.fillStyle = m[3];
        if (m[2]) {
          cx.beginPath();
          cx.arc(px, py, s * (on ? 1.25 : 1), 0, 6.3);
          cx.fill();
        } else {
          cx.strokeStyle = m[3];
          cx.setLineDash([2, 2]);
          cx.save();
          cx.translate(px, py);
          cx.rotate(Math.PI / 4);
          cx.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
          cx.restore();
          cx.setLineDash([]);
        }

        cx.globalAlpha = a * dim;
        T(
          m[0].split(' ').slice(0, 2).join(' '),
          px,
          py - s - 8,
          on ? FG : DM,
          9,
          'center',
          on ? 700 : 400
        );

        if (on) {
          cx.globalAlpha = 1;
          cx.strokeStyle = AM;
          cx.setLineDash([3, 3]);
          cx.beginPath();
          cx.moveTo(ox, oy);
          cx.lineTo(px, py);
          cx.stroke();
          cx.setLineDash([]);
          T('−' + gap.toFixed(1) + ' pts', (ox + px) / 2, (oy + py) / 2 - 8, AM, 11, 'center', 700);

          cx.strokeStyle = m[3];
          cx.beginPath();
          cx.arc(px, py, s + 6 + 2 * Math.sin(t * 5), 0, 6.3);
          cx.stroke();
        }
      });

      cx.globalAlpha = 1;

      // Table on wide screens
      if (wide) {
        const tx = W * 0.68;
        const ty = 150;
        const rh = 40;
        T('MODEL', tx, ty - 18, DM, 9);
        T('BEST', tx + W * 0.2, ty - 18, DM, 9, 'right');
        T('GAP', tx + W * 0.25, ty - 18, DM, 9, 'right');
        T('% OF LEADER', tx + W * 0.3, ty - 18, DM, 9, 'right');

        M.forEach((m, i) => {
          const a = sm(kk(t, 0.5 + i * 0.1, 1.2 + i * 0.1));
          const on = hov === i;
          const y = ty + i * rh;
          cx.globalAlpha = a * (hov >= 0 && !on ? 0.35 : 1);

          cx.fillStyle = m[3];
          cx.fillRect(tx - 14, y - 10, 3, 24);
          T(m[0], tx, y + 4, on ? m[3] : FG, 11, 'left', on ? 700 : 400);
          T(m[2] ? m[2] + 'B params' : 'size n/a', tx, y + 18, DM, 9);

          T(m[1].toFixed(2) + '%', tx + W * 0.2, y + 4, FG, 11, 'right', 700);
          T(i ? '−' + (LEAD - m[1]).toFixed(1) : '—', tx + W * 0.25, y + 4, AM, 11, 'right');
          T(
            i ? ((m[1] / LEAD) * 100).toFixed(0) + '%' : '100%',
            tx + W * 0.3,
            y + 4,
            m[1] / LEAD >= 0.9 ? GR : DM,
            11,
            'right',
            700
          );
        });
        cx.globalAlpha = 1;
      }

      cx.globalCompositeOperation = 'source-over';
      T(
        '◇ DASHED DIAMOND = NO SIZE IN THE MODEL NAME · BEST VALUES FROM THE CURRENT GRID · TRAILS ARE DECORATIVE',
        24,
        H - 14,
        DM,
        9
      );
    }

    size();
    const ro = new ResizeObserver(() => size());
    ro.observe(container);

    const onPointerMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let h = -1;
      let b = 30;

      (G.P || []).forEach((p, i) => {
        if (!p) return;
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < b) {
          b = d;
          h = i;
        }
      });

      if (W > 900 && x > W * 0.68 - 14 && y > 130) {
        const i = Math.floor((y - 140) / 40);
        if (i >= 0 && i < 8) h = i;
      }

      hov = h;
      cv.style.cursor = hov >= 0 ? 'pointer' : 'default';
    };

    const onPointerLeave = () => {
      hov = -1;
      cv.style.cursor = 'default';
    };

    const onClick = () => {
      if (hov >= 0 && hov < M.length && onSelectRunRef.current) {
        const targetModel = M[hov];
        const match = runOptionsRef.current.find(
          (r) =>
            r.id === targetModel[4] ||
            r.label.toUpperCase().includes(targetModel[0].split(' ')[0]) ||
            r.model.toUpperCase().includes(targetModel[0].split(' ')[0])
        );
        onSelectRunRef.current(match ? match.id : targetModel[4]);
      }
    };

    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerleave', onPointerLeave);
    cv.addEventListener('click', onClick);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frame(n: number) {
      if (t0Ref.current === null) t0Ref.current = n;
      draw(reduced ? 6 : Math.max(0, (n - t0Ref.current) / 1000));
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerleave', onPointerLeave);
      cv.removeEventListener('click', onClick);
    };
  }, []); // Run effect ONCE on mount so 60FPS loop never tears down or resets on re-renders

  return (
    <section className="w-full max-w-7xl mx-auto space-y-4">
      <div
        ref={containerRef}
        className="w-full h-[620px] sm:h-[680px] rounded-2xl overflow-hidden border border-white/10 relative shadow-[0_20px_50px_rgba(0,0,0,0.8)] select-none"
        style={{
          background: 'radial-gradient(ellipse at 40% 55%, #150a2a 0%, #05060a 70%)',
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            WebkitMaskImage: 'radial-gradient(ellipse at 40% 55%, #000 15%, transparent 72%)',
            maskImage: 'radial-gradient(ellipse at 40% 55%, #000 15%, transparent 72%)',
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-label="Orbit map: Nemotron 550B at the centre, seven other models orbiting at a distance equal to their gap to the leader in points, sized by parameter count. Hover a planet or a table row to inspect it."
        />
      </div>
    </section>
  );
});

export default FleetTelemetryGrid;
