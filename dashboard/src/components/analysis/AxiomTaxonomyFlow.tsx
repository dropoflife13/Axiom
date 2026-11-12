'use client';

import React, { memo, useEffect, useRef, useState } from 'react';

const CY = '#22d3ee';
const VI = '#a855f7';
const FA = '#f43f5e';
const PA = '#34d399';
const SL = '#94a3b8';
const DIM = '#7c819a';

const XS = [30, 225, 420, 615, 810, 1005];
const NW = 165;
const NY = 170;
const NH = 190;

const NODES: [string, string, string, [number, number]][] = [
  ['TASK PROMPT', '3 feature flags', SL, [0, 1.5]],
  ['CELL', '2³ = 8 · N=15 each', VI, [1.4, 2.4]],
  ['RETRIEVE', 'top K=10 facts', CY, [2.3, 3.4]],
  ['LLM · T=0', 'candidate SQL', VI, [3.3, 4.2]],
  ['VERIFIER', 'no LLM in scoring', FA, [4.1, 5.1]],
  ['MEMORY VAULT', 'failure memory', PA, [5.0, 6.3]],
];

const CELLS: [number, number, number][] = [
  [1, 0, 1],
  [1, 1, 0],
  [0, 1, 1],
];
const FAILS = [2, 0, 1];
const FN = ['tableMissing', 'exit ≠ 0', 'oracle assertion'];
const FLAGS = ['tenant', 'append_only', 'ingestion'];

const DOM: [string, string, number | null][] = [
  ['IDENTITY · NAMING', 'F-01 F-13 F-16–18', null],
  ['TEMPORAL · LIFECYCLE', 'F-05 F-06 F-07 F-10 F-21', null],
  ['RELATIONAL · INDEX', 'F-03 F-22 F-24', null],
  ['MULTI-TENANCY', 'F-02 F-25 F-26 F-30', 0],
  ['IMMUTABILITY', 'F-19 F-20 F-36', 1],
  ['IDEMPOTENCY · INGEST', 'F-32 F-34 F-37', 2],
];

const STG: [string, string][] = [
  [
    'Task prompt',
    'The task text is reduced to three yes/no flags: tenant, append_only and ingestion. The flags come from the task generator, never from the model.',
  ],
  [
    'Cell',
    'Three flags give 2³ = 8 cells. Each cell holds N = 15 tasks, so the 120 test tasks cover every combination equally.',
  ],
  [
    'Retrieve',
    'Only the facts whose applicability rule matches this cell are fetched, up to K = 10, so the model is not shown rules that cannot apply.',
  ],
  [
    'LLM · T = 0',
    'The model writes candidate SQL at temperature 0 with the retrieved facts in its prompt.',
  ],
  [
    'Verifier',
    'A deterministic oracle runs the SQL in PostgreSQL 16. No language model scores it. A failure is labelled with one of three classes.',
  ],
  [
    'Memory vault',
    'The failure is stored as a lesson (verbatim in C0, distilled in C) and feeds the next retrieval.',
  ],
];

const FAILD = [
  'tableMissing: the expected table was never created.',
  'exit ≠ 0: PostgreSQL 16 rejected the migration.',
  'oracle assertion: the SQL ran but broke a fact, such as tenant isolation or a trigger.',
];

const ST0 = [0.95, 2.1, 3.05, 3.95, 4.8, 5.85];
const CYC = 6.6;

function clamp(x: number, a = 0, b = 1) {
  return Math.min(b, Math.max(a, x));
}
function kk(t: number, a: number, b: number) {
  return clamp((t - a) / (b - a));
}
function sm(x: number) {
  return x * x * (3 - 2 * x);
}
function win(t: number, a: number, b: number) {
  return sm(kk(t, a, a + 0.35)) * (1 - sm(kk(t, b - 0.35, b)));
}
function act(lt: number) {
  let b = 0;
  let v = -1;
  NODES.forEach((n, i) => {
    const a = win(lt, n[3][0], n[3][1] + 0.4);
    if (a > v) {
      v = a;
      b = i;
    }
  });
  return b;
}

export const AxiomTaxonomyFlow = memo(function AxiomTaxonomyFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [paused, setPaused] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [activeCellIdx, setActiveCellIdx] = useState(0);

  const [stageKey, setStageKey] = useState('STAGE 1 / 6 · CELL 101');
  const [stageTitle, setStageTitle] = useState(STG[0][0].toUpperCase());
  const [stageDesc, setStageDesc] = useState(STG[0][1]);
  const [stageExtra, setStageExtra] = useState('');

  const timeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Build static SVG markup inside the SVG element once
  useEffect(() => {
    const s = svgRef.current;
    if (!s) return;

    let h = '';
    const T = (
      x: number,
      y: number,
      t: string,
      c?: string,
      sz?: number,
      w?: number,
      a?: string
    ) =>
      `<text x="${x}" y="${y}" font-size="${sz || 12}" font-weight="${w || 400}" fill="${c || '#e8eaf2'}" ${
        a ? `text-anchor="${a}"` : ''
      }>${t}</text>`;

    // Header
    h +=
      T(30, 52, '● TAXONOMY', VI, 11, 700) +
      `<text x="30" y="92" font-size="27" font-weight="700" fill="#ffffff" letter-spacing="-.5">Classify the task. Retrieve the facts.</text><text x="30" y="124" font-size="27" font-weight="700" fill="${SL}" letter-spacing="-.5">Verify without an LLM.</text>`;
    h +=
      T(1170, 52, 'AXIOM v2 ENGINE', DIM, 10, 600, 'end') +
      `<text id="cap" x="1170" y="78" font-size="11" text-anchor="end" fill="${CY}"></text>`;

    // Feedback path (vault -> retrieve)
    const fx1 = XS[5] + NW / 2;
    const fx0 = XS[2] + NW / 2;
    h += `<path d="M${fx1} ${NY} C${fx1} 135 ${fx0} 135 ${fx0} ${NY}" fill="none" stroke="${DIM}" stroke-opacity=".25" stroke-dasharray="2 4"/><path id="fb" d="M${fx1} ${NY} C${fx1} 135 ${fx0} 135 ${fx0} ${NY}" fill="none" stroke="${PA}" stroke-width="1.6" pathLength="1" stroke-dasharray="1 2" stroke-dashoffset="1"/>`;
    h += `<text id="fbl" x="${(fx0 + fx1) / 2}" y="148" font-size="9" text-anchor="middle" fill="${PA}" opacity="0" letter-spacing="2">LESSON STORED</text>`;

    // Spine
    h += `<line x1="${XS[0] + NW}" y1="275" x2="${XS[5]}" y2="275" stroke="${DIM}" stroke-opacity=".3"/>`;
    for (let i = 0; i < 5; i++) {
      h += `<path d="M${XS[i] + NW + 14} 270l8 5l-8 5" fill="none" stroke="${DIM}" stroke-opacity=".5"/>`;
    }

    // Nodes
    NODES.forEach((n, i) => {
      const x = XS[i];
      h += `<rect id="nr${i}" x="${x}" y="${NY}" width="${NW}" height="${NH}" rx="3" fill="rgba(5,6,10,.75)" stroke="${DIM}" stroke-opacity=".3"/>`;
      h += `<text x="${x + 14}" y="${NY + 24}" font-size="10" font-weight="700" letter-spacing="2" id="nt${i}" fill="${DIM}">${n[0]}</text>`;
      h += `<text x="${x + 14}" y="${NY + NH - 14}" font-size="9" fill="${DIM}">${n[1]}</text>`;
    });

    // 0 Flags
    FLAGS.forEach((f, j) => {
      const y = NY + 58 + j * 30;
      const x = XS[0] + 14;
      h += `<rect id="fg${j}" x="${x}" y="${y - 10}" width="12" height="12" fill="none" stroke="${SL}" stroke-opacity=".5"/><text x="${x + 22}" y="${y}" font-size="10" fill="${SL}">${f}</text><text id="fv${j}" x="${XS[0] + NW - 14}" y="${y}" font-size="10" text-anchor="end" fill="${SL}" opacity="0"></text>`;
    });

    // 1 Cells
    for (let c = 0; c < 8; c++) {
      const x = XS[1] + 16 + (c % 4) * 34;
      const y = NY + 52 + Math.floor(c / 4) * 40;
      h += `<rect id="ce${c}" x="${x}" y="${y}" width="28" height="32" fill="none" stroke="${VI}" stroke-opacity=".35"/><text x="${x + 14}" y="${y + 20}" font-size="8" text-anchor="middle" fill="${DIM}">${c.toString(2).padStart(3, '0')}</text>`;
    }

    // 2 Ticks
    for (let k = 0; k < 10; k++) {
      const x = XS[2] + 16 + k * 13;
      h += `<rect id="tk${k}" x="${x}" y="${NY + 60}" width="6" height="${34 + (k % 3) * 10}" fill="${CY}" opacity=".15"/>`;
    }
    h += `<text id="rk" x="${XS[2] + 14}" y="${NY + 128}" font-size="9" fill="${CY}" opacity="0">MATCH 0/10</text>`;

    // 3 LLM
    const lx = XS[3] + NW / 2;
    const ly = NY + 96;
    h += `<circle cx="${lx}" cy="${ly}" r="30" fill="none" stroke="${VI}" stroke-opacity=".25"/><path id="arc" d="M${lx} ${ly - 30}A30 30 0 0 1 ${lx + 30} ${ly}" fill="none" stroke="${VI}" stroke-width="2" stroke-linecap="round" opacity="0"/><circle cx="${lx}" cy="${ly}" r="3" fill="${VI}"/>`;

    // 4 Verifier
    FN.forEach((f, j) => {
      const y = NY + 50 + j * 34;
      const x = XS[4] + 14;
      h += `<rect id="fc${j}" x="${x}" y="${y}" width="${NW - 28}" height="24" fill="none" stroke="${FA}" stroke-opacity=".3"/><text id="ft${j}" x="${x + 10}" y="${y + 16}" font-size="10" fill="${DIM}">${f}</text>`;
    });

    // 5 Vault
    const vx = XS[5] + NW / 2;
    h += `<ellipse cx="${vx}" cy="${NY + 130}" rx="34" ry="9" fill="none" stroke="${PA}" stroke-opacity=".5"/><path d="M${vx - 34} ${NY + 130}V${NY + 66}M${vx + 34} ${NY + 130}V${NY + 66}" stroke="${PA}" stroke-opacity=".5"/><ellipse cx="${vx}" cy="${NY + 66}" rx="34" ry="9" fill="none" stroke="${PA}" stroke-opacity=".5"/><rect id="vf" x="${vx - 34}" y="${NY + 130}" width="68" height="0" fill="${PA}" opacity=".35"/>`;

    // Packet
    for (let k = 0; k < 7; k++) {
      h += `<circle id="pk${k}" r="${k ? 2.2 - k * 0.2 : 3.4}" cy="275" fill="#fff" opacity="0"/>`;
    }

    // Domains
    DOM.forEach((d, i) => {
      const x = 30 + i * 193;
      const y = 450;
      h += `<line id="dl${i}" x1="${x}" y1="${y}" x2="${x + 170}" y2="${y}" stroke="${DIM}" stroke-opacity=".55"/><text id="dt${i}" x="${x}" y="${y + 22}" font-size="9" font-weight="700" letter-spacing="1.5" fill="${SL}">${d[0]}</text><text x="${x}" y="${y + 40}" font-size="9" fill="${SL}" opacity=".82">${d[1]}</text>`;
    });
    h += T(30, 420, 'FACT DOMAINS · F-01 … F-40', SL, 9, 600);

    s.innerHTML = h;
  }, []);

  // Real-time animation loop
  useEffect(() => {
    let animId = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPaused(true);
      timeRef.current = 4.9;
    }

    const $ = (id: string) => document.getElementById(id);

    function render(t: number) {
      const ci = Math.floor(t / CYC) % 3;
      const lt = t % CYC;
      const cell = CELLS[ci];
      const idx = cell[0] * 4 + cell[1] * 2 + cell[2];
      const fail = FAILS[ci];

      const cap = $('cap');
      if (cap) {
        cap.textContent = `CELL ${cell.join('')} · tenant ${cell[0] ? '✓' : '—'}  append_only ${
          cell[1] ? '✓' : '—'
        }  ingestion ${cell[2] ? '✓' : '—'}`;
      }

      NODES.forEach((n, i) => {
        const a = win(lt, n[3][0], n[3][1] + 0.4);
        const nr = $('nr' + i);
        const nt = $('nt' + i);
        if (nr) {
          nr.setAttribute('stroke', n[2]);
          nr.setAttribute('stroke-opacity', String(0.28 + 0.72 * a));
        }
        if (nt) {
          nt.setAttribute('fill', a > 0.4 ? n[2] : DIM);
        }
      });

      FLAGS.forEach((_, j) => {
        const on = lt > 0.3 + 0.35 * j;
        const fg = $('fg' + j);
        const v = $('fv' + j);
        if (fg) fg.setAttribute('fill', on && cell[j] ? SL : 'none');
        if (v) {
          v.textContent = cell[j] ? 'true' : 'false';
          v.setAttribute('opacity', on ? '1' : '0');
        }
      });

      for (let c = 0; c < 8; c++) {
        const lit = lt > 1.5 && c === idx;
        const e = $('ce' + c);
        if (e) {
          e.setAttribute('fill', lit ? VI : 'none');
          e.setAttribute('fill-opacity', String(lit ? 0.35 + 0.2 * Math.sin(lt * 6) : 0));
          e.setAttribute('stroke-opacity', lit ? '1' : '0.3');
        }
      }

      const nm = Math.floor(kk(lt, 2.4, 3.3) * 10);
      for (let q = 0; q < 10; q++) {
        const tk = $('tk' + q);
        if (tk) tk.setAttribute('opacity', q < nm ? '0.95' : '0.15');
      }
      const rk = $('rk');
      if (rk) {
        rk.textContent = `MATCH ${nm}/10`;
        rk.setAttribute('opacity', nm > 0 ? '1' : '0');
      }

      const la = win(lt, 3.3, 4.3);
      const arc = $('arc');
      if (arc) {
        arc.setAttribute('opacity', String(la));
        arc.setAttribute('transform', `rotate(${lt * 420} ${XS[3] + NW / 2} ${NY + 96})`);
      }

      for (let j = 0; j < 3; j++) {
        const hit = j === fail && lt > 4.3;
        const c = $('fc' + j);
        const ft = $('ft' + j);
        if (c) {
          c.setAttribute('fill', hit ? FA : 'none');
          c.setAttribute('fill-opacity', hit ? '0.25' : '0');
          c.setAttribute('stroke-opacity', hit ? '1' : '0.3');
        }
        if (ft) {
          ft.setAttribute('fill', hit ? '#fff' : DIM);
        }
      }

      const vf = $('vf');
      if (vf) {
        vf.setAttribute('height', String(64 * sm(kk(lt, 5.1, 5.9))));
        vf.setAttribute('y', String(NY + 130 - 64 * sm(kk(lt, 5.1, 5.9))));
      }

      const fb = $('fb');
      const fbl = $('fbl');
      if (fb) fb.setAttribute('stroke-dashoffset', String(1 - sm(kk(lt, 5.2, 6.2))));
      if (fbl) fbl.setAttribute('opacity', String(sm(kk(lt, 5.6, 6))));

      const p = sm(kk(lt, 0.2, 5.2));
      const x0 = XS[0] + NW / 2;
      const x1 = XS[5] + NW / 2;
      for (let q = 0; q < 7; q++) {
        const pp = Math.max(0, p - q * 0.012);
        const pk = $('pk' + q);
        if (pk) {
          pk.setAttribute('cx', String(x0 + (x1 - x0) * pp));
          pk.setAttribute('opacity', String(p > 0 && p < 1 ? 1 - q * 0.14 : 0));
        }
      }

      DOM.forEach((d, i) => {
        const on = lt > 2.4 && (d[2] === null || Boolean(cell[d[2]]));
        const a = on ? 1 : 0.62;
        const dl = $('dl' + i);
        const dt = $('dt' + i);
        if (dl) {
          dl.setAttribute('stroke', on ? CY : DIM);
          dl.setAttribute('stroke-opacity', String(on ? 1 : 0.45));
        }
        if (dt) {
          dt.setAttribute('fill', on ? CY : SL);
          dt.setAttribute('opacity', String(a));
        }
      });
    }

    let lastKey = '';
    function updateInfo(t: number) {
      const ci = Math.floor(t / CYC) % 3;
      const lt = t % CYC;
      const a = act(lt);
      const kkStr = ci + '-' + a;
      if (kkStr === lastKey) return;
      lastKey = kkStr;

      const cell = CELLS[ci];
      const n = DOM.filter((d) => d[2] === null || Boolean(cell[d[2]])).length;

      setActiveStage(a);
      setActiveCellIdx(ci);
      setStageKey(`STAGE ${a + 1} / 6 · CELL ${cell.join('')}`);
      setStageTitle(STG[a][0].toUpperCase());
      setStageDesc(STG[a][1]);
      setStageExtra(
        a === 1
          ? `Cell ${cell.join('')}: ${n} of ${DOM.length} fact domains apply.`
          : a === 4
          ? `This example fails as: ${FAILD[FAILS[ci]]}`
          : a === 2
          ? `${n} of ${DOM.length} fact domains are active for this cell (highlighted below).`
          : ''
      );
    }

    function frame(now: number) {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (!pausedRef.current) {
        timeRef.current += dt;
      }
      render(timeRef.current);
      updateInfo(timeRef.current);
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, []);

  const jump = (ci: number, a: number) => {
    timeRef.current = ((ci % 3 + 3) % 3) * CYC + ST0[a] + 0.05;
  };

  const step = (delta: number) => {
    let ci = Math.floor(timeRef.current / CYC) % 3;
    let a = act(timeRef.current % CYC) + delta;
    if (a > 5) {
      a = 0;
      ci++;
    }
    if (a < 0) {
      a = 5;
      ci--;
    }
    jump(ci, a);
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-7xl mx-auto rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] shadow-[0_20px_50px_rgba(0,0,0,0.85)] font-mono select-none"
    >
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(160,170,255,0.14)] bg-black/50 text-[10px] tracking-[0.14em] text-[#94a3b8]">
        <span className="flex items-center gap-2 font-semibold">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          <span>TAXONOMY · FROM TASK TO VERDICT · ARCHITECTURAL PROOF</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="px-2.5 py-1 rounded-[3px] border border-[rgba(160,170,255,0.2)] bg-white/5 hover:bg-white/10 text-[#e8eaf2] font-bold tracking-wider uppercase transition-all cursor-pointer"
          >
            {paused ? 'PLAY' : 'PAUSE'}
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous stage"
            className="px-2.5 py-1 rounded-[3px] border border-[rgba(160,170,255,0.2)] bg-white/5 hover:bg-white/10 text-[#e8eaf2] font-bold transition-all cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next stage"
            className="px-2.5 py-1 rounded-[3px] border border-[rgba(160,170,255,0.2)] bg-white/5 hover:bg-white/10 text-[#e8eaf2] font-bold transition-all cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>

      {/* SVG Canvas Stage */}
      <div
        className="w-full relative overflow-x-auto"
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, #120a24 0%, #05060a 70%)',
        }}
      >
        {/* Subtle blueprint grid overlay matching Fleet Orbit & Scale Architecture */}
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
          aria-label="Animated Axiom taxonomy flow: a task prompt is classified into one of eight cells, matching facts are retrieved, the model runs, a deterministic verifier classifies the failure, and the lesson returns to the memory vault."
        />
      </div>

      {/* Bottom Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 border-t border-[rgba(160,170,255,0.14)] bg-black/60 backdrop-blur-xl">
        <div className="md:col-span-7 p-4 sm:p-5 border-b md:border-b-0 md:border-r border-[rgba(160,170,255,0.14)] space-y-2">
          <p className="text-[10px] tracking-[0.18em] text-[#7c819a] uppercase font-semibold">
            {stageKey}
          </p>
          <h3 className="text-base sm:text-lg font-bold text-[#e8eaf2] tracking-wide">
            {stageTitle}
          </h3>
          <p className="text-xs sm:text-[13px] text-zinc-300 leading-relaxed max-w-xl">
            {stageDesc}
          </p>
          {stageExtra && (
            <p className="text-xs text-[#22d3ee] leading-relaxed font-medium pt-1">
              {stageExtra}
            </p>
          )}
        </div>

        <div className="md:col-span-5 p-4 sm:p-5 space-y-3 text-[10px]">
          <div>
            <p className="text-[9px] tracking-[0.18em] text-[#7c819a] uppercase mb-1.5 font-semibold">
              STAGES · CLICK TO JUMP
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STG.map((s, i) => (
                <button
                  key={s[0]}
                  type="button"
                  onClick={() => jump(activeCellIdx, i)}
                  style={{
                    color: activeStage === i ? '#ffffff' : NODES[i][2],
                    borderColor: activeStage === i ? NODES[i][2] : 'rgba(160,170,255,0.16)',
                    backgroundColor: activeStage === i ? 'rgba(255,255,255,0.08)' : 'transparent',
                  }}
                  className="px-2 py-1 rounded-[3px] border text-[9.5px] font-bold tracking-wider uppercase transition-all cursor-pointer"
                >
                  {i + 1} {s[0].split(' ')[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.18em] text-[#7c819a] uppercase mb-1.5 font-semibold">
              EXAMPLE CELLS · tenant / append_only / ingestion
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CELLS.map((c, i) => (
                <button
                  key={c.join('')}
                  type="button"
                  onClick={() => jump(i, 0)}
                  className={`px-2.5 py-1 rounded-[3px] border text-[10px] font-mono tracking-wider transition-all cursor-pointer ${
                    activeCellIdx === i
                      ? 'border-[#a855f7] bg-[#a855f7]/20 text-white font-bold shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                      : 'border-[rgba(160,170,255,0.16)] hover:border-white/25 text-[#7c819a] hover:text-zinc-200'
                  }`}
                >
                  {c.join('')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.18em] text-zinc-500 uppercase mb-1 font-semibold">
              COLOUR KEY
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-zinc-400 text-[9.5px]">
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: SL }} />
                <span>input</span>
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: VI }} />
                <span>classify, model</span>
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: CY }} />
                <span>retrieval</span>
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: FA }} />
                <span>verification</span>
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: PA }} />
                <span>memory</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
