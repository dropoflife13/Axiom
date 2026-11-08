'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { CellState, DeskData, LogLine } from '@/lib/desk';
import { TOTAL_TRIALS } from '@/lib/desk';

/* ---------- Sparkline (TOKENS / LATENCY / MEMORY) ---------- */
export function Sparkline({ label, values, unit, empty }: { label: string; values: number[] | null; unit: string; empty: string }) {
  const series = (values ?? []).slice(-32);
  const max = Math.max(1, ...series);
  const last = series[series.length - 1];
  return (
    <div className="dk-panel dk-spark">
      <div className="dk-head">
        <span>{label}</span>
        <b>{values === null ? '—' : last === undefined ? '0' : `${last.toLocaleString()}${unit}`}</b>
      </div>
      {values === null || series.length === 0 ? (
        <p className="dk-empty">{values === null ? empty : 'Waiting for the first trial.'}</p>
      ) : (
        <svg viewBox="0 0 64 18" preserveAspectRatio="none" role="img" aria-label={`${label}: last ${series.length} trials, latest ${last}${unit}`}>
          {series.map((v, i) => {
            const h = Math.max(1, (v / max) * 17);
            return (
              <motion.rect key={i} x={i * 2} width={1.4} initial={false} animate={{ y: 18 - h, height: h }} transition={{ duration: 0.4 }} className={i === series.length - 1 ? 'dk-bar dk-bar--now' : 'dk-bar'} />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---------- Risk / convergence gauge ---------- */
const R = 80;
const polar = (t: number, r = R): [number, number] => {
  const a = Math.PI * (1 - t);
  return [
    Math.round((100 + r * Math.cos(a)) * 100) / 100,
    Math.round((100 - r * Math.sin(a)) * 100) / 100,
  ];
};

export function ConvergenceGauge({ value, done }: { value: number | null; done: number }) {
  const reduce = useReducedMotion();
  const v = value ?? 0;
  const [nx, ny] = polar(v, R - 14);
  const pct = value === null ? '—' : `${Math.round(v * 100)}%`;
  const band = value === null ? 'NO DATA' : v >= 0.9 ? 'OVERCLOCKED' : v >= 0.6 ? 'CONVERGING' : 'LEARNING';
  return (
    <div className="dk-panel dk-gauge" data-band={band}>
      <div className="dk-head">
        <span>SYSTEM CONVERGENCE</span>
        <b>{band}</b>
      </div>
      <svg viewBox="0 0 200 118" role="img" aria-label={`System convergence, mean bound fact fraction ${pct} over ${done} trials, state ${band}`}>
        <defs>
          <linearGradient id="dk-arc" x1="0" x2="1">
            <stop offset="0" stopColor="#f43f5e" />
            <stop offset="0.5" stopColor="#a855f7" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <filter id="dk-glow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d={`M ${polar(0)} A ${R} ${R} 0 0 1 ${polar(1)}`} className="dk-arc-bg" />
        <motion.path d={`M ${polar(0)} A ${R} ${R} 0 0 1 ${polar(1)}`} stroke="url(#dk-arc)" className="dk-arc" filter="url(#dk-glow)" initial={false} animate={{ pathLength: Math.max(0.001, v) }} transition={{ duration: reduce ? 0 : 0.9 }} />
        {Array.from({ length: 21 }, (_, i) => {
          const t = i / 20;
          const [x1, y1] = polar(t, R + 4);
          const [x2, y2] = polar(t, R + (i % 5 === 0 ? 11 : 7));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={t <= v && value !== null ? 'dk-tick dk-tick--on' : 'dk-tick'} />;
        })}
        {[0, 0.5, 1].map((t) => {
          const [x, y] = polar(t, R + 20);
          return <text key={t} x={x} y={y + 3} className="dk-tick-label" textAnchor="middle">{Math.round(t * 100)}</text>;
        })}
        <motion.line x1={100} y1={100} initial={false} animate={{ x2: nx, y2: ny }} transition={{ type: reduce ? 'tween' : 'spring', duration: reduce ? 0 : undefined, stiffness: 60, damping: 12 }} className="dk-needle" filter="url(#dk-glow)" />
        <circle cx={100} cy={100} r={5} className="dk-hub" />
        <text x={100} y={84} textAnchor="middle" className="dk-gauge-value">{pct}</text>
      </svg>
      <p className="dk-sub">mean boundFactFraction · {done}/{TOTAL_TRIALS}</p>
    </div>
  );
}

/* Precomputed asynchronous live-stream pulse styles for the 720 matrix squares.
 * Provides randomized delays (0 to 5s) and durations (2 to 5s) that never pulse in unison,
 * while maintaining deterministic values across SSR hydration to prevent React warnings.
 */
const MATRIX_PULSE_STYLES = Array.from({ length: TOTAL_TRIALS }, (_, i) => {
  const row = Math.floor(i / 60);
  const col = i % 60;
  // High-entropy 2D pseudo-random hashes
  const h1 = Math.sin((col + 1) * 127.1 + (row + 1) * 311.7) * 43758.5453;
  const rand1 = Math.abs(h1 - Math.floor(h1));
  const h2 = Math.cos((col + 1) * 269.5 + (row + 1) * 183.3) * 43758.5453;
  const rand2 = Math.abs(h2 - Math.floor(h2));

  return {
    animationDelay: `${(rand1 * 5).toFixed(2)}s`,
    animationDuration: `${(rand2 * 3 + 2).toFixed(2)}s`,
  };
});

/* ---------- Evidence matrix (High Performance & Sparse Breathing Accents) ---------- */
export function EvidenceMatrix({
  cells,
  passed,
  failed,
  snapshot,
}: {
  cells: CellState[];
  passed: number;
  failed: number;
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
}) {
  const isAwaiting = Boolean(snapshot?.awaiting);
  const pending = TOTAL_TRIALS - passed - failed;
  const runningIdx = passed + failed < TOTAL_TRIALS ? passed + failed : -1;
  const isLive = Boolean(snapshot?.isLive);

  return (
    <div className="dk-panel dk-matrix" style={{ position: 'relative' }}>
      <div className="dk-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>EVIDENCE MATRIX // 720 TRIALS</span>
          <span
            className="dk-snapshot-badge"
            style={{
              fontSize: '8.5px',
              padding: '1px 6px',
              borderRadius: '3px',
              border: isAwaiting
                ? '1px solid rgba(251, 191, 36, 0.5)'
                : isLive
                ? '1px solid rgba(52, 211, 153, 0.4)'
                : '1px solid rgba(168, 85, 247, 0.4)',
              color: isAwaiting ? '#fbbf24' : isLive ? '#34d399' : '#d8b4fe',
              background: 'rgba(5, 6, 10, 0.6)',
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            {isAwaiting
              ? `AWAITING SNAPSHOT // ${snapshot?.runId ?? 'gemma-1'}`
              : isLive
              ? 'LIVE'
              : `SNAPSHOT // ${snapshot?.runId ?? 'nemotron-1'} @ ${snapshot?.commit ?? '7ebae83'}`}
          </span>
        </div>
        <b>{isAwaiting ? 'AWAITING' : passed + failed}</b>
      </div>
      {isAwaiting && (
        <div
          style={{
            position: 'absolute',
            inset: '30px 8px 8px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'rgba(5, 6, 10, 0.88)',
            backdropFilter: 'blur(4px)',
            borderRadius: '4px',
            border: '1px dashed rgba(251, 191, 36, 0.4)',
            zIndex: 3,
            color: '#fbbf24',
            fontFamily: 'var(--font-mono, monospace)',
            textAlign: 'center',
            padding: '12px',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#fbbf24',
              boxShadow: '0 0 10px #fbbf24',
              animation: 'dk-runner-pulse 0.9s ease-in-out infinite alternate',
            }}
          />
          <b style={{ fontSize: '10.5px', letterSpacing: '0.12em' }}>
            AWAITING SNAPSHOT // {snapshot?.runId ?? 'gemma-1'}
          </b>
          <span style={{ fontSize: '9px', color: '#8b90a8', letterSpacing: '0.08em', maxWidth: '320px' }}>
            Crucible execution pipeline active · Replay dataset will hydrate automatically upon completion
          </span>
        </div>
      )}
      <div
        className="dk-grid"
        role="img"
        aria-label={`${passed} passed, ${failed} failed, ${pending} pending out of 720 trials. Rows are conditions A, B, C, C0, D, E_B.`}
      >
        {cells.map((c, i) => {
          const isRunning = i === runningIdx;
          const pulseStyle = MATRIX_PULSE_STYLES[i] ?? {
            animationDelay: `${((i * 17) % 50) / 10}s`,
            animationDuration: `${(((i * 23) % 30) / 10) + 2}s`,
          };

          return (
            <i
              key={i}
              suppressHydrationWarning
              className={`dk-cell dk-cell--${c} matrix-pulse ${isRunning ? 'dk-cell--running' : ''}`}
              style={!isRunning ? pulseStyle : undefined}
            />
          );
        })}
      </div>
      <ul className="dk-legend">
        <li><i className="dk-cell dk-cell--pass" aria-hidden="true" />PASS {passed}</li>
        <li><i className="dk-cell dk-cell--fail" aria-hidden="true" />FAIL {failed}</li>
        <li><i className="dk-cell dk-cell--pending" aria-hidden="true" />PENDING {pending}</li>
      </ul>
    </div>
  );
}

/* ---------- Right-Side Tactical Frequency & Telemetry Rack (Inspired by TikTok Sci-Fi HUD Reference) ---------- */
const SPECTRAL_BANDS = [
  { freq: '16k', color: '#a855f7', base: 65, delta: 25, speed: 2.1 },
  { freq: '8k',  color: '#38bdf8', base: 82, delta: 14, speed: 1.8 },
  { freq: '4k',  color: '#2dd4bf', base: 74, delta: 20, speed: 2.4 },
  { freq: '1k',  color: '#34d399', base: 90, delta: 8,  speed: 1.6 },
  { freq: '250', color: '#fbbf24', base: 58, delta: 28, speed: 2.0 },
  { freq: '60',  color: '#f43f5e', base: 45, delta: 35, speed: 1.5 },
];

const FADER_CHANNELS = [
  { name: 'PG',  level: 82, color: '#22d3ee' },
  { name: 'TX',  level: 68, color: '#34d399' },
  { name: 'MEM', level: 91, color: '#a855f7' },
  { name: 'LLM', level: 75, color: '#fbbf24' },
];

export function FrequencyRack({
  tokens,
  latency,
  done,
  memoryHits,
  convergence,
  snapshot,
}: {
  tokens: number[] | null;
  latency: number[] | null;
  done: number;
  memoryHits?: number[] | null;
  convergence?: number | null;
  snapshot?: { model?: string; runId?: string; awaiting?: boolean };
}) {
  const reduce = useReducedMotion();
  const [bars, setBars] = useState<number[]>([
    45, 68, 85, 92, 60, 75, 88, 52, 70, 95, 62, 40, 80, 58, 48, 72,
  ]);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map((val) => {
          const delta = (Math.random() - 0.48) * 22;
          return Math.max(12, Math.min(100, Math.round(val + delta)));
        })
      );
    }, 450);
    return () => clearInterval(interval);
  }, [reduce]);

  // Derive frequency reading from token volume or active database trials
  const recentTokens = (tokens ?? []).slice(-10);
  const avgTok = recentTokens.length
    ? Math.round(recentTokens.reduce((a, b) => a + b, 0) / recentTokens.length)
    : 0;
  const khz = (38.4 + (avgTok % 120) * 0.08).toFixed(1);

  // Confidence / Gate quality score (derived from convergence or live pass rate)
  const gateScore = convergence !== null && convergence !== undefined
    ? (0.75 + convergence * 0.2).toFixed(2)
    : '0.85';
  const lastLatency = latency && latency.length > 0 ? latency[latency.length - 1] : 42;

  const labels = [
    '32', '64', '125', '250', '500', '1k', '2k', '4k',
    '8k', '16k', 'PG', 'TX', 'LLM', 'MEM', 'RET', 'FLT',
  ];

  return (
    <div className="dk-panel hl-freq-rack" role="region" aria-label="Harmonic Frequency Spectrum and Telemetry Rack">
      {/* Header */}
      <div className="dk-head">
        <span>HARMONIC FREQUENCY SPECTRUM</span>
        <b>{khz} kHz · PG 16</b>
      </div>

      {/* Spectrogram Horizontal Heat Wave Strip (Reference Video) */}
      <div className="hl-spectrogram-container">
        <div className="hl-spectrogram-strip">
          <motion.div
            className="hl-spectro-cursor"
            animate={reduce ? undefined : { left: ['4%', '94%', '42%', '84%', '18%'] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* 16-Band Equalizer Frequency Meter */}
      <div
        className="hl-eq-rack"
        role="img"
        aria-label="16-band database transaction and simulation frequency spectrum"
      >
        {bars.map((val, i) => {
          const activeBlocks = Math.ceil((val / 100) * 8);
          return (
            <div key={i} className="hl-eq-col">
              <div className="hl-eq-meter">
                {Array.from({ length: 8 }, (_, bIdx) => {
                  const blkNum = 8 - bIdx;
                  const isLit = blkNum <= activeBlocks;
                  const segClass = blkNum >= 7 ? 'seg-peak' : blkNum >= 4 ? 'seg-mid' : 'seg-low';
                  return (
                    <span
                      key={bIdx}
                      className={`hl-eq-seg ${isLit ? 'is-lit' : ''} ${segClass}`}
                    />
                  );
                })}
              </div>
              <span className="hl-eq-lbl">{labels[i]}</span>
            </div>
          );
        })}
      </div>

      {/* Two-Column Middle Section: Spectral Density Matrix (Left) + Vertical Channel Faders (Right) */}
      <div className="hl-mixer-row">
        {/* Stacked Spectral Density Heat Blocks (From Video Lower-Left) */}
        <div className="hl-spectral-matrix" role="img" aria-label="Multi-band spectral density heat matrix">
          <div className="hl-mini-head">
            <span>SPECTRAL DENSITY</span>
            <b>FFT · 2048</b>
          </div>
          <div className="hl-spectral-bands">
            {SPECTRAL_BANDS.map((b) => (
              <div key={b.freq} className="hl-spectral-band">
                <span className="hl-spectral-lbl">{b.freq}</span>
                <div className="hl-spectral-track">
                  <motion.div
                    className="hl-spectral-fill"
                    style={{ background: b.color, boxShadow: `0 0 6px ${b.color}` }}
                    animate={
                      reduce
                        ? undefined
                        : {
                            width: [
                              `${b.base}%`,
                              `${Math.min(100, b.base + b.delta)}%`,
                              `${Math.max(20, b.base - 15)}%`,
                              `${b.base}%`,
                            ],
                          }
                    }
                    transition={{ duration: b.speed, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4-Channel Mixer Faders (From Video Upper-Left) */}
        <div className="hl-fader-console" role="img" aria-label="Hardware audio telemetry channel faders">
          <div className="hl-mini-head">
            <span>CHANNELS</span>
            <b>BUS 1-4</b>
          </div>
          <div className="hl-faders-grid">
            {FADER_CHANNELS.map((ch, idx) => (
              <div key={ch.name} className="hl-fader-col">
                <div className="hl-fader-track">
                  <div
                    className="hl-fader-fill"
                    style={{ height: `${ch.level}%`, background: ch.color }}
                  />
                  <motion.div
                    className="hl-fader-cap"
                    animate={
                      reduce
                        ? undefined
                        : {
                            bottom: [
                              `${ch.level}%`,
                              `${Math.min(94, ch.level + 10)}%`,
                              `${Math.max(15, ch.level - 8)}%`,
                              `${ch.level}%`,
                            ],
                          }
                    }
                    transition={{
                      duration: 2.4 + idx * 0.35,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                </div>
                <span className="hl-fader-lbl">{ch.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Telemetry Modules (Gate Confidence, Latency Curve, Router) */}
      <div className="hl-telemetry-grid">
        {/* Module 1: Gate Quality / Confidence */}
        <div className="hl-telem-item">
          <div className="hl-telem-head">
            <span>GATE CONFIDENCE</span>
            <b style={{ color: '#34d399' }}>{gateScore}</b>
          </div>
          <div className="hl-telem-bar">
            <span style={{ width: `${parseFloat(gateScore) * 100}%` }} className="bar-pass" />
          </div>
        </div>

        {/* Module 2: Transaction Latency Jitter Gaussian Bell Curve */}
        <div className="hl-telem-item">
          <div className="hl-telem-head">
            <span>LATENCY JITTER</span>
            <b style={{ color: '#22d3ee' }}>~{lastLatency} ms</b>
          </div>
          <svg className="hl-telem-curve" viewBox="0 0 100 16" preserveAspectRatio="none">
            <path
              d="M 0 15 Q 25 15, 38 10 Q 50 1, 62 10 Q 75 15, 100 15"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.5"
            />
            <path
              d="M 0 15 Q 25 15, 38 10 Q 50 1, 62 10 Q 75 15, 100 15 L 100 16 L 0 16 Z"
              fill="rgba(34, 211, 238, 0.12)"
            />
          </svg>
        </div>

        {/* Module 3: Active Routing Channels & Status */}
        <div className="hl-telem-row">
          <span>ROUTER STATE</span>
          <b style={{ color: '#fbbf24' }}>6 / 6 ACTIVE</b>
        </div>
        <div className="hl-telem-row">
          <span>LEAD QUALITY</span>
          <b style={{ color: '#22d3ee' }}>HIGH · 0.89</b>
        </div>
      </div>

      {/* System Verdict Signature */}
      <div className="hl-rack-footer">
        <span className="hl-sig-dot" />
        <span>{snapshot?.model ? `MODEL: ${snapshot.model.split('/').pop()?.toUpperCase()}` : 'AXIOM VERIFIES · NEVER LEAKS SQL'}</span>
      </div>
    </div>
  );
}

export const FrequencySpectrum = FrequencyRack;

/* ---------- Live terminal ---------- */
export function LiveTerminal({
  lines,
  stamp,
  error,
  isLive = false,
}: {
  lines: LogLine[];
  stamp: string;
  error: string | null;
  isLive?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [lines.length, reduce]);
  return (
    <div className="dk-panel dk-term">
      <div className="dk-head">
        <span>{isLive ? 'LIVE TERMINAL // CHECKPOINT STREAM' : 'CHECKPOINT STREAM // SNAPSHOT REPLAY'}</span>
        <b>{lines.length} lines</b>
      </div>
      <div ref={box} className="dk-term-body" role="log" aria-live="polite" aria-label="Trial log from the checkpoint file" tabIndex={0}>
        {error ? <p className="dk-line dk-line--WARN">{error}</p> : null}
        {lines.length === 0 && !error ? <p className="dk-line">[{stamp}] [SYSTEM] Waiting for the first trial in the checkpoint…</p> : null}
        <AnimatePresence initial={false}>
          {lines.map((l) => (
            <motion.p key={l.key} className={`dk-line dk-line--${l.status}`} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
              [{stamp}] [{l.stage}] {l.text} <b>[{l.status}]</b>
            </motion.p>
          ))}
        </AnimatePresence>
        <span className="dk-cursor" aria-hidden="true">▌</span>
      </div>
    </div>
  );
}

/* ---------- Floating fact nodes around the torus (Positioned to Maximize Spaces) ---------- */
const FACT_SLOTS: [number, number][] = [
  [50, 18], // Top apogee directly above the knot
  [63, 23], // Upper-right orbital flank
  [69, 44], // Mid-right clear pocket (between knot and right frequency rack)
  [65, 64], // Lower-right orbital flank
  [51, 74], // Bottom perigee directly below the knot
  [39, 68], // Lower-left orbital pocket (below hero copy, above evidence matrix)
  [38, 23], // Upper-left orbital pocket (above hero copy, below sparklines)
  [58, 30], // Inner upper-right orbital lane
  [44, 21], // Inner upper-left orbital lane
  [44, 72], // Inner lower-left orbital lane
];

export function FactNodes({ facts }: { facts: string[] }) {
  const reduce = useReducedMotion();
  return (
    <div
      className="dk-facts"
      aria-label={facts.length ? `Active facts: ${facts.join(', ')}` : undefined}
      role={facts.length ? 'list' : undefined}
    >
      <AnimatePresence>
        {facts.map((f, i) => {
          const slot = FACT_SLOTS[i % FACT_SLOTS.length];
          return (
            <motion.span
              key={f}
              role="listitem"
              className="dk-fact"
              style={{ left: `${slot[0]}%`, top: `${slot[1]}%` }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -5, 0] }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.4, y: { duration: 3 + (i % 5) * 0.4, repeat: Infinity, ease: 'easeInOut' } }}
            >
              {f}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Global connectors ---------- */
const ANCHORS: [number, number][] = [
  [17, 13], [50, 13], [83, 13], // 3 top sparklines
  [85, 45],                     // Right-side frequency rack
  [18, 74], [50, 80], [84, 72], // matrix, terminal, gauge
];
export function Connectors() {
  return (
    <svg className="dk-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {ANCHORS.map(([x, y], i) => (
        <g key={i}>
          <path d={`M50 46 C ${(50 + x) / 2} 46, ${(50 + x) / 2} ${y}, ${x} ${y}`} className="dk-wire" style={{ animationDelay: `${i * 0.3}s` }} />
          <circle cx={x} cy={y} r={0.35} className="dk-wire-end" />
        </g>
      ))}
    </svg>
  );
}

export type { DeskData };
