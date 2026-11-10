'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import type { CellState, DeskData, LogLine } from '@/lib/desk';
import { TOTAL_TRIALS } from '@/lib/desk';

/* ---------- Sparkline (TOKENS / LATENCY / MEMORY) ---------- */
export const Sparkline = memo(function Sparkline({ label, values, unit, empty }: { label: string; values: number[] | null; unit: string; empty: string }) {
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
});

/* ---------- Risk / convergence gauge ---------- */
const R = 80;
const polar = (t: number, r = R): [number, number] => {
  const a = Math.PI * (1 - t);
  return [
    Math.round((100 + r * Math.cos(a)) * 100) / 100,
    Math.round((100 - r * Math.sin(a)) * 100) / 100,
  ];
};

export const ConvergenceGauge = memo(function ConvergenceGauge({
  value,
  done,
  totalTrials = TOTAL_TRIALS,
}: {
  value: number | null;
  done: number;
  totalTrials?: number;
}) {
  const reduce = useReducedMotion();
  const v = value ?? 0;
  const angleDeg = (v - 0.5) * 180;
  const pct = value === null ? '—' : `${Math.round(v * 100)}%`;
  const band = value === null ? 'NO DATA' : v >= 0.9 ? 'OVERCLOCKED' : v >= 0.6 ? 'CONVERGING' : 'LEARNING';
  const tierColor =
    v >= 0.9
      ? '#c084fc'
      : v >= 0.6
      ? '#22d3ee'
      : v >= 0.35
      ? '#e879f9'
      : '#f43f5e';

  return (
    <div className="dk-panel dk-gauge" data-band={band}>
      <div className="dk-head">
        <span>SYSTEM CONVERGENCE</span>
        <b>{band}</b>
      </div>
      <svg viewBox="0 0 200 118" role="img" aria-label={`System convergence, mean bound fact fraction ${pct} over ${done} trials, state ${band}`}>
        <defs>
          <linearGradient id="dk-arc" x1="0" x2="1">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="35%" stopColor="#ec4899" />
            <stop offset="65%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="dk-needle-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#475569" stopOpacity="0.95" />
            <stop offset="100%" stopColor={tierColor} />
          </linearGradient>
          <filter id="dk-glow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dk-needle-tip-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Telemetry reticle & radar guide arcs */}
        <path d={`M ${polar(0, 56)} A 56 56 0 0 1 ${polar(1, 56)}`} fill="none" stroke="rgba(160,170,255,0.07)" strokeDasharray="2 4" strokeWidth="1" />
        <path d={`M ${polar(0, 38)} A 38 38 0 0 1 ${polar(1, 38)}`} fill="none" stroke="rgba(160,170,255,0.05)" strokeDasharray="1 3" strokeWidth="1" />
        <line x1={polar(0.5, 42)[0]} y1={polar(0.5, 42)[1]} x2={polar(0.5, 72)[0]} y2={polar(0.5, 72)[1]} stroke="rgba(160,170,255,0.12)" strokeDasharray="1 3" strokeWidth="1" />

        {/* Track background and animated value arc */}
        <path d={`M ${polar(0)} A ${R} ${R} 0 0 1 ${polar(1)}`} className="dk-arc-bg" />
        <motion.path
          d={`M ${polar(0)} A ${R} ${R} 0 0 1 ${polar(1)}`}
          stroke="url(#dk-arc)"
          className="dk-arc"
          filter="url(#dk-glow)"
          initial={false}
          animate={{ pathLength: Math.max(0.001, v) }}
          transition={{ duration: reduce ? 0 : 0.9 }}
        />

        {/* Radial perimeter ticks */}
        {Array.from({ length: 21 }, (_, i) => {
          const t = i / 20;
          const isMajor = i % 5 === 0;
          const [x1, y1] = polar(t, R + 4);
          const [x2, y2] = polar(t, R + (isMajor ? 11 : 7));
          const isOn = t <= v && value !== null;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={isOn ? 'dk-tick dk-tick--on' : 'dk-tick'}
              style={isOn ? { stroke: tierColor } : undefined}
            />
          );
        })}

        {/* Cardinal tick labels */}
        {[0, 0.5, 1].map((t) => {
          const [x, y] = polar(t, R + 20);
          return <text key={t} x={x} y={y + 3} className="dk-tick-label" textAnchor="middle">{Math.round(t * 100)}</text>;
        })}

        {/* Dynamic rotating aerospace pointer */}
        <motion.g
          style={{ transformOrigin: '100px 100px', transformBox: 'view-box' }}
          initial={false}
          animate={{ rotate: angleDeg }}
          transition={{
            type: reduce ? 'tween' : 'spring',
            duration: reduce ? 0 : undefined,
            stiffness: 90,
            damping: 18,
            mass: 0.75,
          }}
        >
          {/* Centering bounding anchor to guarantee exact (100, 100) origin across all SVG renderers */}
          <circle cx={100} cy={100} r={72} fill="none" stroke="none" pointerEvents="none" />

          {/* Counterweight rear tail */}
          <path
            d="M 98.4 104 L 98 112 A 2 2 0 0 0 102 112 L 101.6 104 Z"
            fill="#090d19"
            stroke={tierColor}
            strokeWidth="0.8"
            opacity="0.85"
          />
          <circle cx={100} cy={108} r={1.1} fill="#1e293b" />

          {/* Tapered needle blade */}
          <path
            d="M 98.2 96 L 99.3 35 L 100 29 L 100.7 35 L 101.8 96 Z"
            fill="url(#dk-needle-grad)"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="0.6"
            filter="url(#dk-glow)"
          />

          {/* Razor illuminated center spine */}
          <line
            x1={100}
            y1={96}
            x2={100}
            y2={31}
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* Laser contact pip at pointer apex */}
          <circle
            cx={100}
            cy={29}
            r={4.2}
            fill={tierColor}
            opacity={0.4}
            filter="url(#dk-needle-tip-glow)"
          />
          <circle
            cx={100}
            cy={29}
            r={1.8}
            fill="#ffffff"
          />
        </motion.g>

        {/* Layered precision cockpit pivot hub */}
        <circle cx={100} cy={100} r={8} fill="#060810" stroke="rgba(160,170,255,0.25)" strokeWidth="1" />
        <circle cx={100} cy={100} r={5.2} fill="#0d111d" stroke={tierColor} strokeWidth="1.5" filter="url(#dk-glow)" />
        <circle cx={100} cy={100} r={2.4} fill="#ffffff" />
        <circle cx={99.3} cy={99.3} r={0.7} fill={tierColor} />

        {/* Digital Telemetry Readout */}
        <text x={100} y={76} textAnchor="middle" className="dk-gauge-value">{pct}</text>
        <text x={100} y={88} textAnchor="middle" className="dk-gauge-sub" style={{ fill: tierColor }}>{band}</text>
      </svg>
      <p className="dk-sub">mean boundFactFraction · {done}/{totalTrials}</p>
    </div>
  );
});

/* Precomputed asynchronous live-stream pulse styles for the 720 matrix squares.
 * Provides randomized delays (0 to 7s) and calm, natural blinking durations (4.5 to 7.5s)
 * with zero harsh white shadows, while maintaining deterministic SSR hydration consistency.
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
    animationDelay: `${(rand1 * 7).toFixed(2)}s`,
    animationDuration: `${(rand2 * 3 + 4.5).toFixed(2)}s`,
  };
});

/* ---------- Evidence matrix (High Performance & Sparse Breathing Accents) ---------- */
export const EvidenceMatrix = memo(function EvidenceMatrix({
  cells,
  passed,
  failed,
  totalTrials,
  snapshot,
}: {
  cells: CellState[];
  passed: number;
  failed: number;
  totalTrials?: number;
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
}) {
  const isAwaiting = Boolean(snapshot?.awaiting);
  const total = totalTrials ?? (cells.length > 0 ? cells.length : TOTAL_TRIALS);
  const pending = Math.max(0, total - passed - failed);
  const runningIdx = passed + failed < total ? passed + failed : -1;
  const isLive = Boolean(snapshot?.isLive);
  const isMini = total <= 60;
  const tasksPerCondition = Math.max(1, Math.round(total / 6));

  return (
    <div className="dk-panel dk-matrix" style={{ position: 'relative' }}>
      <div className="dk-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>EVIDENCE MATRIX // {total} TRIALS</span>
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
              ? `AWAITING SNAPSHOT // ${snapshot?.runId ?? 'qwen27b-1'}`
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
            AWAITING SNAPSHOT // {snapshot?.runId ?? 'qwen27b-1'}
          </b>
          <span style={{ fontSize: '9px', color: '#8b90a8', letterSpacing: '0.08em', maxWidth: '320px' }}>
            Crucible execution pipeline active · Replay dataset will hydrate automatically upon completion
          </span>
        </div>
      )}
      <div
        className="dk-grid"
        role="img"
        aria-label={`${passed} passed, ${failed} failed, ${pending} pending out of ${total} trials. Rows are conditions A, B, C, C0, D, E_B.`}
        style={isMini ? { gridTemplateColumns: `repeat(${tasksPerCondition}, minmax(0, 1fr))`, maxWidth: `${tasksPerCondition * 28}px`, margin: '0 auto' } : undefined}
      >
        {cells.map((c, i) => {
          // Pending squares must remain dark gray and completely static (zero animation, zero pulse)
          if (c === 'pending') {
            return (
              <i
                key={i}
                suppressHydrationWarning
                className="dk-cell dk-cell--pending"
              />
            );
          }

          // Asynchronous live-stream pulse on a calibrated subset (~20-25 active pulses at any given moment)
          // ONLY apply to squares with status PASS or FAIL
          const shouldPulse = (c === 'pass' || c === 'fail') && ((i * 11) % 5 === 0 || (i * 7) % 13 === 0);
          const pulseStyle = MATRIX_PULSE_STYLES[i] ?? {
            animationDelay: `${((i * 17) % 50) / 10}s`,
            animationDuration: `${(((i * 23) % 30) / 10) + 2}s`,
          };

          return (
            <i
              key={i}
              suppressHydrationWarning
              className={`dk-cell dk-cell--${c} ${shouldPulse ? 'matrix-pulse' : ''}`}
              style={shouldPulse ? pulseStyle : undefined}
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
});

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

export const FrequencyRack = memo(function FrequencyRack({
  tokens,
  latency,
  done,
  passed = 0,
  failed = 0,
  activeFacts,
  memoryHits,
  convergence,
  snapshot,
  total = TOTAL_TRIALS,
}: {
  tokens: number[] | null;
  latency: number[] | null;
  done: number;
  passed?: number;
  failed?: number;
  activeFacts?: string[];
  memoryHits?: number[] | null;
  convergence?: number | null;
  snapshot?: { model?: string; runId?: string; awaiting?: boolean };
  total?: number;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 360);
    }, 450);
    return () => clearInterval(interval);
  }, [reduce]);

  // Accurate telemetry derivations from real checkpoint trials
  const recentTokens = (tokens ?? []).slice(-10);
  const avgTok = recentTokens.length
    ? Math.round(recentTokens.reduce((a, b) => a + b, 0) / recentTokens.length)
    : 1296;
  const convVal = convergence !== null && convergence !== undefined ? convergence : 0.684;
  const strictPassRate = done > 0 ? passed / done : 0.602;
  const failRate = done > 0 ? failed / done : 0.398;
  const memArr = memoryHits ?? [];
  const memHitRatio =
    memArr.length > 0
      ? memArr.filter((m) => m > 0).length / memArr.length
      : 0.833;
  const tokEfficiency = Math.max(0.25, Math.min(0.96, 1 - (avgTok - 500) / 1800));

  // Derive frequency reading from active database trials & convergence
  const khz = (36.0 + convVal * 8.4 + (done % 12) * 0.1).toFixed(1);

  // Gate quality & system convergence readout
  const gateScore = (0.72 + convVal * 0.25).toFixed(2);
  const convPct = `${(convVal * 100).toFixed(1)}%`;
  const lastLatency = latency && latency.length > 0 ? latency[latency.length - 1] : Math.round(34 + (avgTok / 60));

  // 16-band telemetry spectrum anchored to real token stream + system channels
  const bars = Array.from({ length: 16 }, (_, i) => {
    let base: number;
    if (i < 10) {
      const tokSample = recentTokens[i % Math.max(1, recentTokens.length)] ?? avgTok;
      base = Math.max(22, Math.min(94, ((tokSample % 1400) / 1400) * 72 + 22));
    } else if (i === 10) {
      base = convVal * 100; // PG (Oracle Bound Fact Convergence)
    } else if (i === 11) {
      base = strictPassRate * 100; // TX (Strict Pass@1)
    } else if (i === 12) {
      base = tokEfficiency * 100; // LLM (Token Efficiency)
    } else if (i === 13) {
      base = memHitRatio * 100; // MEM (Memory Retrieval Hit Rate)
    } else if (i === 14) {
      base = Math.min(96, 48 + (activeFacts?.length ?? 4) * 8); // RET (Active Fact Probes)
    } else {
      base = Math.max(18, Math.min(92, failRate * 100)); // FLT (Fault Containment Rate)
    }
    const harmonic = reduce ? 0 : Math.sin((phase + i * 29) * 0.12) * 5;
    return Math.max(14, Math.min(100, Math.round(base + harmonic)));
  });

  const dynamicFaders = [
    { name: 'PG',  level: Math.round(convVal * 100), color: '#22d3ee' },
    { name: 'TX',  level: Math.max(18, Math.round(strictPassRate * 100)), color: '#34d399' },
    { name: 'MEM', level: Math.round(memHitRatio * 100), color: '#38bdf8' },
    { name: 'LLM', level: Math.round(tokEfficiency * 100), color: '#fbbf24' },
  ];

  const dynamicSpectral = [
    { freq: '16k', color: '#38bdf8', base: Math.round(convVal * 100), delta: 8, speed: 2.1 },
    { freq: '8k',  color: '#22d3ee', base: Math.round(memHitRatio * 100), delta: 6, speed: 1.8 },
    { freq: '4k',  color: '#2dd4bf', base: Math.round(tokEfficiency * 100), delta: 8, speed: 2.4 },
    { freq: '1k',  color: '#34d399', base: Math.max(24, Math.round(strictPassRate * 100)), delta: 6, speed: 1.6 },
    { freq: '250', color: '#fbbf24', base: Math.min(95, Math.round((avgTok / 2000) * 100)), delta: 10, speed: 2.0 },
    { freq: '60',  color: '#f43f5e', base: Math.max(16, Math.round(failRate * 100)), delta: 10, speed: 1.5 },
  ];

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
            {dynamicSpectral.map((b) => (
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
            {dynamicFaders.map((ch, idx) => (
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

        {/* Module 3: Active Routing Channels & Convergence */}
        <div className="hl-telem-row">
          <span>CONVERGENCE</span>
          <b style={{ color: '#22d3ee' }}>{convPct} ({done}/{total})</b>
        </div>
        <div className="hl-telem-row">
          <span>AVG TOKENS</span>
          <b style={{ color: '#fbbf24' }}>{avgTok.toLocaleString()} tok</b>
        </div>
      </div>

      {/* System Verdict Signature */}
      <div className="hl-rack-footer">
        <span className="hl-sig-dot" />
        <span>{snapshot?.model ? `MODEL: ${snapshot.model.split('/').pop()?.toUpperCase()}` : 'AXIOM VERIFIES · NEVER LEAKS SQL'}</span>
      </div>
    </div>
  );
});

export const FrequencySpectrum = FrequencyRack;

/* ---------- Live terminal ---------- */
export const LiveTerminal = memo(function LiveTerminal({
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
              [{l.stamp ?? stamp}] [{l.stage}] {l.text} <b>[{l.status}]</b>
            </motion.p>
          ))}
        </AnimatePresence>
        <span className="dk-cursor" aria-hidden="true">▌</span>
      </div>
    </div>
  );
});

/* ---------- Floating fact nodes around the torus (Calibrated Orbit - Zero HUD Collision) ---------- */
const FACT_SLOTS: [number, number][] = [
  [52, 23], // Upper center apogee (safely below dk-top sparklines, above knot)
  [61, 26], // Upper-right orbital flank
  [66, 38], // Mid-upper right clear pocket (left of frequency rack)
  [66, 52], // Mid-lower right clear pocket (left of frequency rack)
  [61, 63], // Lower-right orbital flank (safely above dk-bottom gauge)
  [52, 65], // Lower center perigee (safely above live terminal)
  [43, 63], // Lower-left orbital flank (safely above evidence matrix)
  [38, 52], // Mid-lower left clear pocket (right of hero copy)
  [38, 38], // Mid-upper left clear pocket (right of hero copy)
  [43, 26], // Upper-left orbital flank (safely below dk-top sparklines)
];

export const FactNodes = memo(function FactNodes({ facts }: { facts: string[] }) {
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
});

/* ---------- Global connectors ---------- */
const ANCHORS: [number, number][] = [
  [17, 13], [50, 13], [83, 13], // 3 top sparklines
  [85, 45],                     // Right-side frequency rack
  [18, 74], [50, 80], [84, 72], // matrix, terminal, gauge
];
export const Connectors = memo(function Connectors() {
  return (
    <svg className="dk-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {ANCHORS.map(([x, y], i) => (
        <g key={i}>
          <path d={`M52 45 C ${(52 + x) / 2} 45, ${(52 + x) / 2} ${y}, ${x} ${y}`} className="dk-wire" style={{ animationDelay: `${i * 0.3}s` }} />
          <circle cx={x} cy={y} r={0.35} className="dk-wire-end" />
        </g>
      ))}
    </svg>
  );
});

export type { DeskData };
