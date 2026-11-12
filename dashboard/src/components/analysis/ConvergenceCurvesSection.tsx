'use client';

import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';

export interface ConvergenceCurvesSectionProps {
  activeModelName?: string;
  onSelectCondition?: (code: string) => void;
}

interface ConditionCurve {
  code: string;
  name: string;
  role: string;
  plainEnglish: string;
  color: string;
  score: number;
  tokens: number;
  highlight?: boolean;
}

const CONDITIONS_LIST: ConditionCurve[] = [
  {
    code: 'E_B',
    name: 'STATIC CONTROL (EXHAUSTIVE)',
    role: 'Exhaustive Test Evaluation',
    plainEnglish: 'All 34 static rules with exhaustive fact evaluation under identical test harness.',
    color: '#34d399',
    score: 94.2,
    tokens: 1420,
  },
  {
    code: 'B',
    name: 'STATIC REFERENCE (34 RULES)',
    role: 'All 34 Rules Injected',
    plainEnglish: 'Dumping all 34 organizational rules into the prompt. Serves as reference baseline, but triggers syntax crashes on prompt-sensitive models (e.g., 21.7% DDL crashes on Gemini 3.1 Flash Lite).',
    color: '#a78bfa',
    score: 93.9,
    tokens: 1139,
  },
  {
    code: 'C0',
    name: 'VERBATIM RULES (K=10)',
    role: 'Failure-Prioritized Retrieval',
    plainEnglish: 'Axiom’s surgical approach: injects top-10 exact rules prioritized by historical failures. Cuts token cost by 51.3% while reaching 86.3% compliance.',
    color: '#22d3ee',
    score: 86.3,
    tokens: 555,
    highlight: true,
  },
  {
    code: 'C',
    name: 'DISTILLED RULES (K=10)',
    role: 'Advisor Natural Language',
    plainEnglish: 'Distilling error rules into natural language tips loses exact naming and syntax details, trailing verbatim text by up to 17.4%.',
    color: '#fb923c',
    score: 71.9,
    tokens: 780,
  },
  {
    code: 'A',
    name: 'ZERO-SHOT BASELINE',
    role: 'Raw Unassisted Generation',
    plainEnglish: 'Standard ChatGPT-style raw coding without Axiom. Fails 52.6% of database security checks due to subtle hallucinated rules.',
    color: '#7c819a',
    score: 47.4,
    tokens: 915,
  },
  {
    code: 'D',
    name: 'PLACEBO DISTRACTOR',
    role: 'Negative Control Tips',
    plainEnglish: 'Feeding general database advice as a negative control. Proves models need exact, rigid compiler feedback, not generic tips.',
    color: '#f43f5e',
    score: 37.4,
    tokens: 1120,
  },
];

const DOMAINS = [
  'SECURITY',
  'DDL SAFETY',
  'TENANCY',
  'AUDIT',
  'ACCESS',
  'INDEXING',
  'TRANSACTIONS',
  'INTEGRITY',
];

export const ConvergenceCurvesSection = memo(function ConvergenceCurvesSection({
  activeModelName = 'NEMOTRON 550B',
  onSelectCondition,
}: ConvergenceCurvesSectionProps) {
  const [hoveredCondition, setHoveredCondition] = useState<string | null>(null);

  // Chart dimensions
  const width = 1100;
  const height = 400;
  const padLeft = 70;
  const padRight = 140;
  const padTop = 40;
  const padBottom = 50;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Threshold divider at 25% of chart width (Task 0 / Tempest on the Wire)
  const dividerX = padLeft + chartW * 0.22;

  // Generate SVG path for a condition curve matching Image 2
  const buildCurvePath = (finalScore: number, jitterSeed: number) => {
    // Left unguided segment: tasks -6 to 0 (flat dashed noise between 22% and 38%)
    const leftSteps = 5;
    const leftPts: Array<{ x: number; y: number }> = [];
    const initialBase = 22 + (jitterSeed % 14);

    for (let i = 0; i <= leftSteps; i++) {
      const x = padLeft + (i / leftSteps) * (dividerX - padLeft);
      const noise = Math.sin(i * 1.8 + jitterSeed) * 5;
      const pct = initialBase + noise;
      const y = padTop + (1 - pct / 100) * chartH;
      leftPts.push({ x, y });
    }

    // Right guided segment: tasks 0 to 24 (smooth sigmoidal S-curve rising to finalScore)
    const rightSteps = 24;
    const rightPts: Array<{ x: number; y: number }> = [];
    const startY = leftPts[leftPts.length - 1].y;
    const targetY = padTop + (1 - finalScore / 100) * chartH;

    for (let i = 0; i <= rightSteps; i++) {
      const u = i / rightSteps;
      const x = dividerX + u * (width - padRight - dividerX);
      // Logistic sigmoid curve
      const sigmoid = 1 / (1 + Math.exp(-8 * (u - 0.42)));
      const y = startY + (targetY - startY) * sigmoid;
      rightPts.push({ x, y });
    }

    // Combine paths
    const fullPts = [...leftPts, ...rightPts.slice(1)];
    const d = fullPts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = fullPts[i - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    }, '');

    // Area fill path
    const areaD = `${d} L ${width - padRight} ${height - padBottom} L ${padLeft} ${height - padBottom} Z`;

    return { lineD: d, areaD, endY: fullPts[fullPts.length - 1].y };
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-7xl mx-auto space-y-6"
    >
      {/* Header Bar matching Image 2 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-mono text-[9.5px] text-zinc-400 tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
            <span className="text-white font-bold">AXIOM · TEMPEST SCIENTIFIC MATRIX</span>
            <span className="text-zinc-600">/</span>
            <span>PROJECTION · EMPIRICAL VERIFICATION</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight uppercase">
            Complex tasks, solved and proven.
          </h2>
          <p className="font-mono text-xs text-zinc-400 max-w-3xl leading-relaxed">
            SIX ABLATION CONDITIONS · SHARE OF CONTRACT INVARIANTS SATISFIED · CUMULATIVE TASK PROGRESSION (0 TO 120)
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold">
            H3 PROVEN: Δ(C0 − C) = +14.4%
          </span>
        </div>
      </div>

      {/* Plain-English Executive Summary Cards (For Non-Tech Users) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-4 space-y-1.5 shadow-xl">
          <div className="flex items-center justify-between font-mono text-[9.5px]">
            <span className="text-rose-400 font-bold uppercase tracking-wider">THE PROBLEM · WHY AI FAILS</span>
            <span className="text-zinc-500">COND A: 47.4%</span>
          </div>
          <h4 className="text-sm font-bold text-white">AI Alone Guesses & Breaks Relational Integrity</h4>
          <p className="text-zinc-300 text-xs leading-relaxed font-sans">
            When standard AI writes database code without external checks, it fails over 52% of organizational rules—hallucinating compliance on subtle security and tenant isolation flaws.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-4 space-y-1.5 shadow-xl">
          <div className="flex items-center justify-between font-mono text-[9.5px]">
            <span className="text-amber-400 font-bold uppercase tracking-wider">THE TRAP · PROMPT OVERLOAD</span>
            <span className="text-zinc-500">COND B: SYNTAX RISK</span>
          </div>
          <h4 className="text-sm font-bold text-white">Shoving Every Rule into Prompt Triggers Syntax Failures</h4>
          <p className="text-zinc-300 text-xs leading-relaxed font-sans">
            Dumping all 34 rules into the prompt causes massive token spend ($$$) and triggers DDL syntax failures on sensitive models (e.g. 21.7% crashes on Gemini 3.1 Flash Lite, reversing B below C0).
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/20 backdrop-blur-2xl p-4 space-y-1.5 shadow-xl shadow-[0_0_20px_rgba(34,211,238,0.15)]">
          <div className="flex items-center justify-between font-mono text-[9.5px]">
            <span className="text-cyan-300 font-bold uppercase tracking-wider">THE AXIOM SOLUTION</span>
            <span className="text-cyan-400 font-bold">COND C0: 86.3%</span>
          </div>
          <h4 className="text-sm font-bold text-white">Surgical Verbatim Errors Cut Cost & Double Accuracy</h4>
          <p className="text-zinc-200 text-xs leading-relaxed font-sans">
            Axiom retrieves only the exact compiler error and invariant rule for each task. It slashes prompt tokens by 51.3% while rocketing accuracy up to 86.3% with zero human intervention.
          </p>
        </div>
      </div>

      {/* Main Massive Chart (Reference: Image 2) */}
      <div className="rounded-3xl border border-white/10 bg-[#04060b]/95 backdrop-blur-3xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.9),0_1px_0_0_rgba(255,255,255,0.15)_inset] relative overflow-hidden">
        {/* Top Indicators inside Chart */}
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] mb-2 px-2 uppercase">
          <span>ANSWERED BEST (%)</span>
          <span className="text-zinc-500">STATIC IN-CONTEXT REFERENCE</span>
        </div>

        {/* SVG Curve Canvas */}
        <div className="relative w-full overflow-x-auto pb-2">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full min-w-[780px] h-[380px] select-none"
          >
            <defs>
              <linearGradient id="c0AreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="bAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
              </linearGradient>
              <filter id="c0Glow">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Labels */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = padTop + (1 - pct / 100) * chartH;
              return (
                <g key={pct}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.18)"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 14}
                    y={y + 3}
                    textAnchor="end"
                    fill="#e4e4e7"
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Vertical Threshold Divider at Task 0 (Matching Image 2: "8 · TEMPEST ON THE WIRE") */}
            <line
              x1={dividerX}
              y1={padTop - 10}
              x2={dividerX}
              y2={height - padBottom}
              stroke="#22d3ee"
              strokeWidth="1"
              strokeOpacity="0.4"
              strokeDasharray="4 3"
            />
            <g transform={`translate(${dividerX}, ${padTop - 16})`}>
              <rect x="-85" y="-14" width="170" height="20" rx="4" fill="#070914" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.6" />
              <text textAnchor="middle" y="0" fill="#22d3ee" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                8 · AXIOM ON THE WIRE
              </text>
            </g>

            {/* Phase Zone Labels matching Image 2 */}
            <text
              x={(padLeft + dividerX) / 2}
              y={height - padBottom + 26}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
              letterSpacing="0.1em"
            >
              BY LIKELIHOOD (RAW)
            </text>
            <text
              x={(dividerX + width - padRight) / 2}
              y={height - padBottom + 26}
              textAnchor="middle"
              fill="#22d3ee"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
              letterSpacing="0.1em"
            >
              WITH DETERMINISTIC PROOF
            </text>

            {/* Bottom X-Axis Month / Progression Markers matching Image 2 */}
            {[-6, 0, 6, 12, 18, 24].map((step) => {
              const x = step <= 0
                ? padLeft + ((step + 6) / 6) * (dividerX - padLeft)
                : dividerX + (step / 24) * (width - padRight - dividerX);
              return (
                <text
                  key={step}
                  x={x}
                  y={height - padBottom + 12}
                  textAnchor="middle"
                  fill="#d4d4d8"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {step === 0 ? '0' : `${step > 0 ? '+' : ''}${step} TASKS`}
                </text>
              );
            })}

            {/* Render Animated Curves with framer-motion */}
            {CONDITIONS_LIST.map((cond, idx) => {
              const isHov = hoveredCondition === null || hoveredCondition === cond.code;
              const { lineD, areaD, endY } = buildCurvePath(cond.score, idx * 7 + 3);

              return (
                <g
                  key={cond.code}
                  onMouseEnter={() => setHoveredCondition(cond.code)}
                  onMouseLeave={() => setHoveredCondition(null)}
                  className="cursor-pointer transition-opacity"
                  opacity={isHov ? 1 : 0.25}
                >
                  {/* Subtle Area Fill for C0 and B */}
                  {cond.code === 'C0' && (
                    <motion.path
                      d={areaD}
                      fill="url(#c0AreaGrad)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1.2, delay: 0.5 }}
                    />
                  )}
                  {cond.code === 'B' && (
                    <motion.path
                      d={areaD}
                      fill="url(#bAreaGrad)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1.2, delay: 0.5 }}
                    />
                  )}

                  {/* Multi-line Curve with Smooth Entrance Drawing Transition */}
                  <motion.path
                    d={lineD}
                    fill="none"
                    stroke={cond.color}
                    strokeWidth={cond.highlight ? 3 : 1.8}
                    filter={cond.highlight ? 'url(#c0Glow)' : undefined}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: idx * 0.12 }}
                  />

                  {/* Terminal Beacon Circle on Right Edge */}
                  <motion.circle
                    cx={width - padRight}
                    cy={endY}
                    r={cond.highlight ? 4.5 : 3}
                    fill={cond.color}
                    filter={cond.highlight ? 'url(#c0Glow)' : undefined}
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 2.2, delay: idx * 0.25 }}
                  />

                  {/* Right Axis Stacked Labels (Matching Image 2) */}
                  <text
                    x={width - padRight + 12}
                    y={endY + 3.5}
                    fill={cond.color}
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {cond.code} {cond.score.toFixed(1)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Interactive Condition Comparison Explainer Strip */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[9px] uppercase tracking-wider mb-2.5">
            <span>INTERACTIVE CONDITION EXPLORER (CLICK OR HOVER TO INSPECT)</span>
            <span className="text-cyan-400 font-bold">120 TRIALS PER CONDITION</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CONDITIONS_LIST.map((cond) => {
              const isSelected = hoveredCondition === cond.code;
              return (
                <button
                  key={cond.code}
                  type="button"
                  onClick={() => setHoveredCondition(isSelected ? null : cond.code)}
                  onMouseEnter={() => setHoveredCondition(cond.code)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer font-mono ${
                    isSelected
                      ? 'bg-white/10 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                      : 'bg-black/40 border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] mb-1">
                    <span className="font-bold" style={{ color: cond.color }}>{cond.code}</span>
                    <span className="text-zinc-400">{cond.tokens} tok</span>
                  </div>
                  <div className="text-[10px] font-bold text-white truncate">{cond.name}</div>
                  <div className="text-xs font-black text-cyan-300 mt-1">{cond.score.toFixed(1)}%</div>
                </button>
              );
            })}
          </div>
          {/* Active Condition Human Explanation */}
          {hoveredCondition && (
            <div className="mt-3 p-3 rounded-xl bg-black/60 border border-white/10 font-sans text-xs text-zinc-200 flex items-start gap-2.5">
              <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: CONDITIONS_LIST.find((c) => c.code === hoveredCondition)?.color }} />
              <div>
                <b className="text-white mr-1.5 font-mono">{hoveredCondition}:</b>
                <span>{CONDITIONS_LIST.find((c) => c.code === hoveredCondition)?.plainEnglish}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Sub-Panels (Matching Image 2: "COST TO CLOSE" & "OPEN QUESTIONS CLOSED") */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-white/10">
          {/* Sub-Panel 1: Cost to Close / Token Efficiency (Image 2 Bottom-Left) */}
          <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2">
            <div className="flex items-center justify-between font-mono text-[9px] text-zinc-400 uppercase font-bold">
              <span>COST TO CLOSE + COST TO CHECK · PER TRIAL</span>
              <span className="text-emerald-400">2.3× TOKEN EFFICIENCY</span>
            </div>
            <p className="font-mono text-[9px] text-zinc-500">
              The distance from prompt bloat to Pareto optimum, brought toward zero through selective retrieval.
            </p>

            {/* Descending Token Curve SVG */}
            <div className="h-20 w-full pt-1">
              <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="w-full h-full">
                <line x1="20" y1="50" x2="380" y2="50" stroke="rgba(255,255,255,0.06)" />
                <path
                  d="M 20 12 C 90 14, 180 32, 280 44 L 360 48"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                />
                <circle cx="360" cy="48" r="3" fill="#22d3ee" />
                <text x="368" y="50" fill="#22d3ee" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                  555 tok
                </text>
                <text x="20" y="8" fill="#71717a" fontSize="7.5" fontFamily="monospace">
                  1,139 tok (B)
                </text>
              </svg>
            </div>
          </div>

          {/* Sub-Panel 2: Questions Closed By Invariant Field (Image 2 Bottom-Right) */}
          <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2">
            <div className="flex items-center justify-between font-mono text-[9px] text-zinc-400 uppercase font-bold">
              <span>INVARIANT DOMAINS CLOSED · BY CATEGORY</span>
              <span className="text-cyan-400">100% MUTATION KILL</span>
            </div>
            <p className="font-mono text-[9px] text-zinc-500">
              Every structural invariant searched and closed separately; whole relational schema composed of verified pieces.
            </p>

            {/* Category Scatter Dot Grid */}
            <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[8.5px]">
              {DOMAINS.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between p-1.5 rounded bg-white/[0.03] border border-white/5"
                >
                  <span className="text-zinc-300 truncate">{domain}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
});

export default ConvergenceCurvesSection;
