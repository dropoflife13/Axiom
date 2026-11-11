'use client';

import React, { memo, useEffect, useRef, useState } from 'react';

const CY = '#22d3ee';
const VI = '#a855f7';
const DM = '#7c819a';
const SL = '#94a3b8';

type FactStatus = 'C' | 'O' | 'X';
type ApplicabilityCond = [string, number];
type FactSlot = [string, number, FactStatus, ApplicabilityCond[] | null];

const T1: ApplicabilityCond[] = [['tenant', 1]];
const AP1: ApplicabilityCond[] = [['append_only', 1]];
const AP0: ApplicabilityCond[] = [['append_only', 0]];
const IN: ApplicabilityCond[] = [['ingestion', 1]];

// [id, category index, status (C confirmed, O owner-adopted, X inactive), applicability]
const F: FactSlot[] = [
  ['01', 0, 'O', []],
  ['13', 0, 'O', []],
  ['16', 0, 'O', []],
  ['17', 0, 'O', []],
  ['18', 0, 'C', []],
  ['04', 1, 'O', []],
  ['07', 1, 'O', []],
  ['08', 1, 'O', []],
  ['09', 1, 'O', IN],
  ['11', 1, 'O', []],
  ['12', 1, 'C', [['status', 1]]],
  ['05', 2, 'O', []],
  ['06', 2, 'O', AP0],
  ['10', 2, 'O', AP0],
  ['21', 2, 'O', AP0],
  ['03', 3, 'C', []],
  ['15', 3, 'O', []],
  ['22', 3, 'C', []],
  ['24', 3, 'C', [['tenant', 1], ['append_only', 0]]],
  ['38', 3, 'C', [['latest_per_key', 1]]],
  ['02', 4, 'C', T1],
  ['23', 4, 'C', T1],
  ['25', 4, 'C', T1],
  ['26', 4, 'C', T1],
  ['30', 4, 'C', T1],
  ['19', 5, 'C', AP1],
  ['20', 5, 'C', AP1],
  ['27', 5, 'C', AP1],
  ['36', 5, 'C', AP1],
  ['32', 6, 'C', IN],
  ['34', 6, 'C', IN],
  ['37', 6, 'C', IN],
  ['31', 7, 'C', [['sec_definer', 1]]],
  ['39', 7, 'C', [['view', 1]]],
  ['14', 8, 'X', null],
  ['28', 8, 'X', null],
  ['29', 8, 'X', null],
  ['33', 8, 'X', null],
  ['35', 8, 'X', null],
];

const CATS = [
  'IDENTITY · NAMING',
  'DATA TYPES',
  'TEMPORAL',
  'RELATIONAL · INDEX',
  'TENANCY · RLS',
  'IMMUTABILITY',
  'INGESTION',
  'SECURITY CTX',
  'ARCHIVE',
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const FLAGS = ['tenant', 'append_only', 'ingestion', 'status', 'latest_per_key', 'sec_definer', 'view'];

const PROF: Array<{ label: string; flags: Record<string, number> }> = [
  { label: 'LEDGER · TENANT', flags: { tenant: 1, append_only: 1 } },
  { label: 'MUTABLE · TENANT', flags: { tenant: 1, append_only: 0 } },
  { label: 'INGEST PIPELINE', flags: { tenant: 1, append_only: 1, ingestion: 1 } },
  { label: 'STATEFUL TABLE', flags: { append_only: 0, status: 1 } },
  { label: 'SEC DEFINER VIEW', flags: { view: 1, sec_definer: 1 } },
];

const CNT: Record<FactStatus, number> = { C: 0, O: 0, X: 0 };
F.forEach((f) => {
  CNT[f[2]]++;
});
const ACTIVE_COUNT = F.filter((f) => f[2] !== 'X').length;
const STATUS_COL: Record<FactStatus, string> = { C: CY, O: VI, X: DM };

const posA = (i: number): [number, number] => [210 + (i % 13) * 60 + 30, 282 + Math.floor(i / 13) * 34];
const SEQ_IDX = F.map((f) => +f[0] - 1);
const STACK = CATS.map(() => 0);
const posB: [number, number][] = F.map((f) => {
  const c = f[1];
  const r = STACK[c]++;
  return [70 + c * 132, 262 + r * 32];
});

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const kk = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const sm = (x: number) => x * x * (3 - 2 * x);
const lp = (a: number, b: number, t: number) => a + (b - a) * t;
const bound = (f: FactSlot, p: Record<string, number>) =>
  f[2] !== 'X' && f[3] !== null && f[3].every(([n, v]) => (p[n] ? 1 : 0) === v);

const P0 = 9.2;
const PT = 2.4;

export interface AxiomFactVaultProps {
  onSelectFact?: (factId: string) => void;
}

export const AxiomFactVault = memo(function AxiomFactVault({ onSelectFact }: AxiomFactVaultProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onSelectFactRef = useRef(onSelectFact);
  onSelectFactRef.current = onSelectFact;

  const [paused, setPaused] = useState(false);
  const [activeProfileIdx, setActiveProfileIdx] = useState(0);

  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const manualProfileRef = useRef<number | null>(null);
  const profileTransitionRef = useRef<{ prev: number; next: number; startT: number } | null>(null);

  // Build SVG skeleton once on mount
  useEffect(() => {
    const s = svgRef.current;
    if (!s) return;

    const T = (
      x: number,
      y: number,
      t: string,
      c?: string | null,
      sz?: number,
      w?: number,
      a?: string | null,
      cls?: string | null,
      o?: number
    ) =>
      `<text ${cls ? `data-id="${cls}"` : ''} x="${x}" y="${y}" font-size="${sz}" font-weight="${w || 400}" fill="${
        c || '#e8eaf2'
      }" ${a ? `text-anchor="${a}"` : ''} ${o != null ? `opacity="${o}"` : ''}>${t}</text>`;

    let h = '';
    h +=
      T(30, 52, '● FACT VAULT', VI, 11, 700) +
      T(30, 92, '39 slots. 34 enforceable.', '#ffffff', 27, 700) +
      T(30, 124, 'facts.json v1.0.1 · F-01 … F-39', SL, 12);
    h += T(1170, 52, 'STATUS', DM, 10, 600, 'end');

    (['C', 'O', 'X'] as FactStatus[]).forEach((k, i) => {
      const y = 74 + i * 18;
      const lbl = k === 'C' ? 'CONFIRMED' : k === 'O' ? 'OWNER-ADOPTED' : 'INACTIVE';
      h +=
        `<rect x="1000" y="${y - 8}" width="9" height="9" fill="none" stroke="${STATUS_COL[k]}"/>` +
        T(1016, y, lbl, SL, 10) +
        T(1170, y, '0', STATUS_COL[k], 11, 700, 'end', `cn${k}`, 0);
    });

    CATS.forEach((c, i) => {
      const x = 70 + i * 132;
      h +=
        T(x, 214, ROMAN[i], VI, 10, 700, 'middle', `cl${i}`, 0) +
        T(x, 230, c.split(' · ')[0], SL, 8, 600, 'middle', `cm${i}`, 0) +
        (c.includes(' · ') ? T(x, 241, c.split(' · ')[1], DM, 8, 500, 'middle', `cn2${i}`, 0) : '');
    });

    F.forEach((f, i) => {
      h += `<g data-id="f${i}" data-fact="F-${f[0]}" style="cursor:pointer" opacity="0"><rect x="-26" y="-11" width="52" height="22" rx="2" fill="none" stroke="${SL}" stroke-opacity=".5"/><rect data-id="fc${i}" x="-26" y="-11" width="52" height="22" rx="2" fill="${
        STATUS_COL[f[2]]
      }" fill-opacity=".15" stroke="${STATUS_COL[f[2]]}" opacity="0" ${
        f[2] === 'X' ? 'stroke-dasharray="3 3"' : ''
      }/><text x="0" y="3.5" font-size="10" text-anchor="middle" fill="#e8eaf2">F-${f[0]}</text></g>`;
    });

    const fy = 546;
    FLAGS.forEach((f, i) => {
      const x = 30 + i * 158;
      h +=
        `<rect data-id="cr${i}" x="${x}" y="${fy - 14}" width="148" height="24" rx="2" fill="none" stroke="${DM}" stroke-opacity=".35"/>` +
        T(x + 74, fy + 2, f, DM, 10, 500, 'middle', `ct${i}`);
    });
    h += T(30, 508, 'APPLICABILITY', SL, 9, 600, null, null, 0.9) + T(1170, 508, '', CY, 12, 700, 'end', 'cap');

    s.innerHTML = h;

    const handleSvgClick = (e: MouseEvent) => {
      const g = (e.target as Element | null)?.closest('g[data-fact]');
      const factId = g?.getAttribute('data-fact');
      if (factId && onSelectFactRef.current) {
        onSelectFactRef.current(factId);
      }
    };
    s.addEventListener('click', handleSvgClick);

    const byId = new Map<string, Element>();
    s.querySelectorAll('[data-id]').forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) byId.set(id, el);
    });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPaused(true);
      timeRef.current = P0 + 0.6;
    }

    let animId = 0;
    let lastReportedProf = -1;

    function render(t: number) {
      const m = sm(kk(t, 4, 6.2));
      const st = sm(kk(t, 6.8, 7.8));
      const pm = sm(kk(t, 8.8, 9.4));

      const inP = t >= P0;
      const autoPi = inP ? Math.floor((t - P0) / PT) % PROF.length : 0;
      const pi = manualProfileRef.current !== null ? manualProfileRef.current : autoPi;

      if (inP && pi !== lastReportedProf) {
        lastReportedProf = pi;
        setActiveProfileIdx(pi);
      }

      let w = 1;
      let prevIdx = pi;
      if (profileTransitionRef.current && manualProfileRef.current !== null) {
        const tr = profileTransitionRef.current;
        prevIdx = tr.prev;
        w = sm(kk(t - tr.startT, 0, 0.45));
      } else if (inP && manualProfileRef.current === null) {
        const elapsedSinceP0 = t - P0;
        const cycleIdx = Math.floor(elapsedSinceP0 / PT);
        const lt = elapsedSinceP0 - cycleIdx * PT;
        prevIdx = cycleIdx > 0 ? (cycleIdx - 1) % PROF.length : 0;
        w = sm(kk(lt, 0, 0.45));
      }

      const cur = PROF[pi].flags;
      const prev = inP ? PROF[prevIdx].flags : null;

      F.forEach((f, i) => {
        const a = SEQ_IDX[i];
        const A = posA(a);
        const B = posB[i];
        const a0 = sm(kk(t, 0.2 + a * 0.045, 0.7 + a * 0.045));
        const el = byId.get(`f${i}`);
        if (el) {
          el.setAttribute('transform', `translate(${lp(A[0], B[0], m)} ${lp(A[1], B[1], m)})`);
          const bc = bound(f, cur) ? 1 : 0;
          const bp = prev ? (bound(f, prev) ? 1 : 0) : 1;
          const bw = inP ? lp(bp, bc, w) : 1;
          const dimOp = f[2] === 'X' ? 0.14 : 0.18;
          el.setAttribute('opacity', String(a0 * lp(1, lp(dimOp, 1, bw), pm)));
          const cEl = byId.get(`fc${i}`);
          if (cEl) {
            cEl.setAttribute('opacity', String(st));
            cEl.setAttribute('fill-opacity', String(0.15 + 0.4 * bw * pm * (f[2] === 'X' ? 0 : 1)));
          }
        }
      });

      CATS.forEach((_, i) => {
        const o = sm(kk(t, 5.2 + i * 0.08, 6));
        byId.get(`cl${i}`)?.setAttribute('opacity', String(o));
        byId.get(`cm${i}`)?.setAttribute('opacity', String(o));
        byId.get(`cn2${i}`)?.setAttribute('opacity', String(o));
      });

      (['C', 'O', 'X'] as FactStatus[]).forEach((q) => {
        const e = byId.get(`cn${q}`);
        if (e) {
          e.setAttribute('opacity', String(st));
          e.textContent = String(Math.round(CNT[q] * sm(kk(t, 7, 8.6))));
        }
      });

      FLAGS.forEach((f, i) => {
        const on = inP && cur[f] !== undefined;
        const cr = byId.get(`cr${i}`);
        const ct = byId.get(`ct${i}`);
        if (cr) {
          cr.setAttribute('stroke', on ? CY : DM);
          cr.setAttribute('stroke-opacity', on ? '1' : '0.35');
        }
        if (ct) {
          ct.setAttribute('fill', on ? CY : DM);
          ct.textContent = on ? `${f} = ${cur[f] ? 'true' : 'false'}` : f;
        }
      });

      const nb = F.filter((f) => bound(f, cur)).length;
      const cap = byId.get('cap');
      if (cap) {
        cap.textContent = inP ? `${nb} / ${ACTIVE_COUNT} BOUND` : '';
        cap.setAttribute('opacity', inP ? '1' : '0');
      }
    }

    function frame(now: number) {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (!pausedRef.current) {
        timeRef.current += dt;
      }
      render(reduced ? P0 + 1 : timeRef.current);
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animId);
      s.removeEventListener('click', handleSvgClick);
    };
  }, []);

  const handleSelectProfile = (idx: number) => {
    if (timeRef.current < P0) {
      timeRef.current = P0 + 0.5;
    }
    const prev = manualProfileRef.current ?? activeProfileIdx;
    manualProfileRef.current = idx;
    profileTransitionRef.current = { prev, next: idx, startT: timeRef.current };
    setActiveProfileIdx(idx);
  };

  const handleReplaySort = () => {
    manualProfileRef.current = null;
    profileTransitionRef.current = null;
    timeRef.current = 0;
    setActiveProfileIdx(0);
    setPaused(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] shadow-[0_20px_50px_rgba(0,0,0,0.85)] font-mono select-none">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(160,170,255,0.14)] bg-black/50 text-[10px] tracking-[0.14em] text-[#94a3b8]">
        <span className="flex items-center gap-2 font-semibold">
          <span className="w-2 h-2 rounded-full bg-[#a855f7] animate-pulse shadow-[0_0_8px_#a855f7]" />
          <span>FACT VAULT · 39 CONTRACT SLOTS · 34 ACTIVE POSTGRESQL 16 PROBES</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {PROF.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleSelectProfile(i)}
              className={`px-2 py-1 rounded-[3px] border text-[9px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                activeProfileIdx === i
                  ? 'border-[#22d3ee] bg-[#22d3ee]/15 text-[#22d3ee]'
                  : 'border-[rgba(160,170,255,0.16)] bg-white/[0.03] text-[#7c819a] hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              manualProfileRef.current = null;
              setPaused((p) => !p);
            }}
            className="px-2.5 py-1 rounded-[3px] border border-[rgba(160,170,255,0.2)] bg-white/5 hover:bg-white/10 text-[#e8eaf2] font-bold tracking-wider uppercase transition-all cursor-pointer"
          >
            {paused ? 'PLAY' : 'PAUSE'}
          </button>
          <button
            type="button"
            onClick={handleReplaySort}
            className="px-2.5 py-1 rounded-[3px] border border-[rgba(160,170,255,0.2)] bg-white/5 hover:bg-white/10 text-[#22d3ee] font-bold tracking-wider uppercase transition-all cursor-pointer"
            title="Replay 39-slot category sort"
          >
            ↺ REPLAY
          </button>
        </div>
      </div>

      {/* SVG Canvas Stage */}
      <div
        className="w-full relative overflow-x-auto"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, #120a24 0%, #05060a 70%)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, #000 20%, transparent 78%)',
            maskImage: 'radial-gradient(ellipse at 50% 50%, #000 20%, transparent 78%)',
          }}
        />
        <svg
          ref={svgRef}
          viewBox="0 0 1200 600"
          className="w-full h-auto min-w-[760px] max-h-[580px] block relative z-10"
          role="img"
          aria-label="Animated fact vault: 39 fact slots sort into nine categories, are coloured by status, then light up according to a task's feature flags."
        />
      </div>
    </div>
  );
});

export default AxiomFactVault;
