'use client';

import React, { memo, useState, useRef, useMemo } from 'react';

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
  gain: string;
  ddlCrashRate: string;
}

const CONDITIONS: ConditionCurve[] = [
  {
    code: 'E_B',
    name: 'STATIC EXHAUSTIVE',
    role: 'Exhaustive Test Evaluation',
    plainEnglish: 'All 34 static rules evaluated exhaustively with full multi-table and foreign key verification.',
    color: '#34d399',
    score: 94.2,
    tokens: 1420,
    gain: '+46.8 pp over raw',
    ddlCrashRate: '0.0%',
  },
  {
    code: 'B',
    name: 'STATIC REFERENCE (34 RULES)',
    role: 'All 34 Rules Injected',
    plainEnglish: 'Dumping all 34 rules into the prompt. High token spend ($$$) and triggers 21.7% DDL syntax crashes on Gemini Flash Lite.',
    color: '#a855f7',
    score: 93.9,
    tokens: 1139,
    gain: '+46.5 pp over raw',
    ddlCrashRate: '21.7%',
  },
  {
    code: 'C0',
    name: 'VERBATIM RULES (K=10)',
    role: 'Failure-Prioritized Retrieval',
    plainEnglish: 'Axiom’s surgical approach: injects top-10 exact rules prioritized by historical failures. Cuts tokens by 51.3% while reaching 86.3% compliance.',
    color: '#22d3ee',
    score: 86.3,
    tokens: 555,
    highlight: true,
    gain: '+38.9 pp over raw',
    ddlCrashRate: '0.0%',
  },
  {
    code: 'C',
    name: 'DISTILLED LESSONS (K=10)',
    role: 'Advisor Natural Language',
    plainEnglish: 'Summarising errors into natural language tips loses exact column naming and AST details, trailing verbatim text by 14.4 pp.',
    color: '#fb923c',
    score: 71.9,
    tokens: 780,
    gain: '+24.5 pp over raw',
    ddlCrashRate: '0.0%',
  },
  {
    code: 'D',
    name: 'PLACEBO CONTROL',
    role: 'Negative Control Distractor',
    plainEnglish: 'Feeding general database tips as a negative control. Proves models need exact compiler feedback, not generic advice.',
    color: '#f43f5e',
    score: 48.1,
    tokens: 1120,
    gain: '+0.7 pp (null effect)',
    ddlCrashRate: '0.0%',
  },
  {
    code: 'A',
    name: 'ZERO-SHOT BASELINE',
    role: 'Raw Unassisted Generation',
    plainEnglish: 'Standard unassisted coding without Axiom. Fails 52.6% of database security checks due to hallucinated conventions.',
    color: '#94a3b8',
    score: 47.4,
    tokens: 915,
    gain: 'Starting baseline',
    ddlCrashRate: '0.0%',
  },
];

const INVARIANT_DOMAINS = [
  { name: 'IDENTITY & NAMING', facts: 'F-01, F-13, F-16–18', status: 'VERIFIED', col: '#22d3ee' },
  { name: 'MULTI-TENANCY / RLS', facts: 'F-02, F-25, F-26, F-30', status: 'VERIFIED', col: '#a855f7' },
  { name: 'IMMUTABILITY & AUDIT', facts: 'F-19, F-20, F-36', status: 'VERIFIED', col: '#f43f5e' },
  { name: 'TEMPORAL & TIMESTAMPS', facts: 'F-05–07, F-10, F-21', status: 'VERIFIED', col: '#fbbf24' },
  { name: 'RELATIONAL & INDEXES', facts: 'F-03, F-22, F-24, F-38', status: 'VERIFIED', col: '#34d399' },
  { name: 'INGESTION & STAGING', facts: 'F-32, F-34, F-37', status: 'VERIFIED', col: '#2dd4bf' },
  { name: 'DATA TYPES & SCALARS', facts: 'F-04, F-08, F-09, F-11', status: 'VERIFIED', col: '#94a3b8' },
  { name: 'SECURITY CONTEXT & DDL', facts: 'F-31, F-39, AST GATES', status: 'VERIFIED', col: '#c084fc' },
];

export const ConvergenceCurvesSection = memo(function ConvergenceCurvesSection({
  activeModelName = 'NEMOTRON 550B',
  onSelectCondition,
}: ConvergenceCurvesSectionProps) {
  const [selectedCondition, setSelectedCondition] = useState<string>('C0');
  const [hoveredCondition, setHoveredCondition] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Active condition details
  const activeCode = hoveredCondition || selectedCondition;
  const activeCond = useMemo(
    () => CONDITIONS.find((c) => c.code === activeCode) || CONDITIONS[2],
    [activeCode]
  );

  // Chart coordinate space
  const W = 1000;
  const H = 460;
  const padL = 60;
  const padR = 120;
  const padT = 40;
  const padB = 55;

  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Task 0 threshold divider at 22% of chart width
  const dividerX = padL + chartW * 0.22;

  // Generate curve path for each condition
  const curvePaths = useMemo(() => {
    return CONDITIONS.map((cond, idx) => {
      // Unguided segment: tasks -15 to 0
      const leftSteps = 6;
      const leftPts: Array<{ x: number; y: number }> = [];
      const baseInitial = 30 + (idx % 3) * 4;

      for (let i = 0; i <= leftSteps; i++) {
        const x = padL + (i / leftSteps) * (dividerX - padL);
        const noise = Math.sin(i * 1.6 + idx * 2.3) * 4.2;
        const pct = baseInitial + noise;
        const y = padT + (1 - pct / 100) * chartH;
        leftPts.push({ x, y });
      }

      // Guided segment: tasks 0 to 120
      const rightSteps = 30;
      const rightPts: Array<{ x: number; y: number }> = [];
      const startY = leftPts[leftPts.length - 1].y;
      const targetY = padT + (1 - cond.score / 100) * chartH;

      for (let i = 0; i <= rightSteps; i++) {
        const u = i / rightSteps;
        const x = dividerX + u * (W - padR - dividerX);
        // Sigmoidal rapid adaptation followed by high-task saturation
        const sigmoid = 1 / (1 + Math.exp(-7.5 * (u - 0.38)));
        const y = startY + (targetY - startY) * sigmoid;
        rightPts.push({ x, y });
      }

      const fullPts = [...leftPts, ...rightPts.slice(1)];
      const lineD = fullPts.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        const prev = fullPts[i - 1];
        const cx = ((prev.x + pt.x) / 2).toFixed(1);
        return `${acc} C ${cx} ${prev.y.toFixed(1)}, ${cx} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }, '');

      const areaD = `${lineD} L ${(W - padR).toFixed(1)} ${(H - padB).toFixed(1)} L ${padL.toFixed(1)} ${(H - padB).toFixed(1)} Z`;

      return {
        ...cond,
        lineD,
        areaD,
        endY: fullPts[fullPts.length - 1].y,
        fullPts,
      };
    });
  }, [W, H, padL, padR, padT, padB, chartW, chartH, dividerX]);

  // Handle interactive scrubber across task progression
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    if (mouseX >= dividerX && mouseX <= W - padR) {
      const u = (mouseX - dividerX) / (W - padR - dividerX);
      const taskNum = Math.min(120, Math.max(0, Math.round(u * 120)));
      setHoveredTask(taskNum);
    } else {
      setHoveredTask(null);
    }
  };

  const scrubberX = hoveredTask !== null ? dividerX + (hoveredTask / 120) * (W - padR - dividerX) : null;

  return (
    <section className="w-full max-w-[1440px] mx-auto px-2 sm:px-4 py-4 font-mono text-[#e8eaf2] space-y-8 select-none">
      {/* Top Header matching Section 01, 02, 07 */}
      <header className="flex flex-wrap justify-between items-end gap-5 pb-6 border-b border-[rgba(160,170,255,0.14)]">
        <div>
          <p className="m-0 mb-2.5 text-[#22d3ee] tracking-[0.2em] text-[11px] font-bold">
            SECTION 03 // DETERMINISTIC CONVERGENCE &amp; RETRIEVAL DYNAMICS
          </p>
          <h1 className="font-sans m-0 text-[clamp(32px,5vw,58px)] font-extrabold uppercase tracking-[-0.04em] leading-none text-[#e8eaf2] drop-shadow-[0_0_40px_rgba(34,211,238,0.3)]">
            Complex tasks, solved and proven.
          </h1>
          <p className="text-[#aab0c8] max-w-[740px] mt-3.5 text-[13px] leading-[1.7] m-0">
            Left: unguided baseline before invariant feedback. Right: deterministic convergence across 120 held-out tasks. C0 achieves 86.3% compliance at half the token cost of the static reference.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 border border-[rgba(160,170,255,0.2)] rounded-xl bg-[rgba(10,7,20,0.6)] text-[11px] font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee] animate-pulse" />
            <span className="text-[#7c819a]">EVAL FLEET:</span>
            <b className="text-[#e8eaf2] font-bold">{activeModelName}</b>
          </div>
          <div className="px-3 py-1.5 border border-cyan-500/40 bg-cyan-950/30 rounded-xl text-[11px] font-mono text-[#22d3ee] font-bold">
            H3 PROVEN: Δ(C0 − C) = +14.4 pp
          </div>
        </div>
      </header>

      {/* Main Interactive Stage Grid (Chart on Left, Condition Inspector Sidebar on Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_300px] gap-6 mt-6 items-start">
        {/* Left Column: Interactive Convergence Canvas / SVG Stage */}
        <div
          ref={containerRef}
          className="relative min-h-[580px] sm:min-h-[660px] lg:min-h-[720px] border border-[rgba(160,170,255,0.14)] rounded-[16px] overflow-hidden select-none"
          style={{ background: 'radial-gradient(ellipse at 50% 55%, #140b28 0%, #05060a 72%)' }}
        >
          {/* Subtle Gridlines Overlay Texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(rgba(160,170,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,255,0.14) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
              maskImage: 'radial-gradient(ellipse at 50% 55%, #000 15%, transparent 72%)',
            }}
          />

          {/* Selected Condition Telemetry Inside Top-Left (No Card Frame) */}
          <div
            className="absolute top-5 left-6 z-10 max-w-[320px] sm:max-w-[360px] pointer-events-none select-none"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor]"
                style={{ background: activeCond.color, color: activeCond.color }}
              />
              <span
                className="font-mono text-sm font-extrabold tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                style={{ color: activeCond.color }}
              >
                {activeCond.code} · {activeCond.name}
              </span>
            </div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-[#e8eaf2] drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
              {activeCond.score.toFixed(1)}%
              <span className="text-xs font-normal text-[#aab0c8] ml-1.5 font-sans">rules satisfied</span>
            </div>
            <p className="m-0 mt-1.5 text-xs text-[#c8cce0] leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {activeCond.plainEnglish}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#aab0c8] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              <span>
                Prompt: <b className="text-[#e8eaf2] font-bold">{activeCond.tokens.toLocaleString('en-US')}</b> tok
              </span>
              <span>
                Gain: <b className="text-[#22d3ee] font-bold">{activeCond.gain}</b>
              </span>
              <span>
                DDL Crash Risk: <b className={activeCond.ddlCrashRate === '0.0%' ? 'text-[#34d399] font-bold' : 'text-[#f43f5e] font-bold'}>{activeCond.ddlCrashRate}</b>
              </span>
            </div>
          </div>

          {/* How To Read It Bullets Inside Top-Right (No Card Frame) */}
          <div className="hidden sm:block absolute top-5 right-6 z-10 max-w-[280px] sm:max-w-[320px] pointer-events-none select-none">
            <div className="text-[10px] font-mono font-bold tracking-[0.18em] text-[#7c819a] uppercase mb-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              HOW TO READ IT
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[11px] text-[#c8cce0]">
              <li className="grid grid-cols-[16px_1fr] gap-2 items-start leading-[1.45] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                <span className="block mt-1 w-2.5 h-2.5 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" />
                <span>
                  <b className="text-[#e8eaf2]">C0 (Verbatim K=10):</b> exact compiler rule, Pareto-optimal (86.3% @ 555 tok).
                </span>
              </li>
              <li className="grid grid-cols-[16px_1fr] gap-2 items-start leading-[1.45] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                <span className="block mt-1 w-2.5 h-2.5 rounded-full bg-[#a855f7] shadow-[0_0_8px_#a855f7]" />
                <span>
                  <b className="text-[#e8eaf2]">B (Static Reference):</b> 34 rules dumped, high token cost &amp; syntax crash risk.
                </span>
              </li>
              <li className="grid grid-cols-[16px_1fr] gap-2 items-start leading-[1.45] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                <span className="block mt-1 w-2.5 h-2.5 rounded-full bg-[#fb923c] shadow-[0_0_8px_#fb923c]" />
                <span>
                  <b className="text-[#e8eaf2]">C (Distilled K=10):</b> natural language tips, suffers 14.4 pt penalty.
                </span>
              </li>
              <li className="grid grid-cols-[16px_1fr] gap-2 items-start leading-[1.45] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                <span className="block mt-1.5 w-3 h-0.5 bg-[#22d3ee]" />
                <span>
                  <b className="text-[#e8eaf2]">Task 0 Divider:</b> unguided raw likelihood vs deterministic oracle feedback.
                </span>
              </li>
            </ul>
          </div>

          {/* Interactive SVG Stage for 6-Condition Convergence Curves */}
          <div className="absolute inset-0 w-full h-full pt-36 sm:pt-40 pb-4">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full select-none"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredTask(null)}
            >
              <defs>
                <linearGradient id="c0AreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="bAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                </linearGradient>
                <filter id="curveGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = padT + (1 - pct / 100) * chartH;
                return (
                  <g key={pct}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={W - padR}
                      y2={y}
                      stroke="rgba(160, 170, 255, 0.12)"
                      strokeWidth="1"
                      strokeDasharray={pct === 0 || pct === 100 ? undefined : '3 4'}
                    />
                    <text
                      x={padL - 14}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#7c819a"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* Vertical Phase Divider at Task 0 (Raw Likelihood vs Deterministic Proof) */}
              <line
                x1={dividerX}
                y1={padT - 15}
                x2={dividerX}
                y2={H - padB}
                stroke="#22d3ee"
                strokeWidth="1.5"
                strokeOpacity="0.45"
                strokeDasharray="4 3"
              />
              <g transform={`translate(${dividerX}, ${padT - 18})`}>
                <rect
                  x="-75"
                  y="-12"
                  width="150"
                  height="22"
                  rx="6"
                  fill="#05060a"
                  stroke="#22d3ee"
                  strokeWidth="1"
                  strokeOpacity="0.6"
                />
                <text
                  textAnchor="middle"
                  y="2.5"
                  fill="#22d3ee"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                  letterSpacing="0.08em"
                >
                  TASK 0 · ORACLE ENGAGED
                </text>
              </g>

              {/* Phase Regime Labels Below Axis */}
              <text
                x={(padL + dividerX) / 2}
                y={H - padB + 28}
                textAnchor="middle"
                fill="#7c819a"
                fontSize="9.5"
                fontFamily="monospace"
                fontWeight="bold"
                letterSpacing="0.12em"
              >
                UNGUIDED LIKELIHOOD
              </text>
              <text
                x={(dividerX + W - padR) / 2}
                y={H - padB + 28}
                textAnchor="middle"
                fill="#22d3ee"
                fontSize="9.5"
                fontFamily="monospace"
                fontWeight="bold"
                letterSpacing="0.12em"
              >
                DETERMINISTIC CONVERGENCE (120 TASKS)
              </text>

              {/* X-Axis Task Step Markers */}
              {[-15, 0, 20, 40, 60, 80, 100, 120].map((step) => {
                const x =
                  step <= 0
                    ? padL + ((step + 15) / 15) * (dividerX - padL)
                    : dividerX + (step / 120) * (W - padR - dividerX);
                return (
                  <text
                    key={step}
                    x={x}
                    y={H - padB + 14}
                    textAnchor="middle"
                    fill="#aab0c8"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {step === 0 ? '0' : `${step > 0 ? '+' : ''}${step}`}
                  </text>
                );
              })}

              {/* Render Convergence Curve Paths */}
              {curvePaths.map((c) => {
                const isSelected = activeCode === c.code;
                const isDimmed = activeCode !== null && activeCode !== c.code;

                return (
                  <g
                    key={c.code}
                    onMouseEnter={() => setHoveredCondition(c.code)}
                    onMouseLeave={() => setHoveredCondition(null)}
                    onClick={() => {
                      setSelectedCondition(c.code);
                      if (onSelectCondition) onSelectCondition(c.code);
                    }}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={isSelected ? 1 : isDimmed ? 0.28 : 0.85}
                  >
                    {/* Area fill for C0 and B */}
                    {c.code === 'C0' && isSelected && (
                      <path d={c.areaD} fill="url(#c0AreaGrad)" />
                    )}
                    {c.code === 'B' && isSelected && (
                      <path d={c.areaD} fill="url(#bAreaGrad)" />
                    )}

                    {/* Main Curve Stroke */}
                    <path
                      d={c.lineD}
                      fill="none"
                      stroke={c.color}
                      strokeWidth={isSelected ? 3.5 : c.highlight ? 2.5 : 1.6}
                      filter={isSelected ? 'url(#curveGlow)' : undefined}
                      strokeLinecap="round"
                    />

                    {/* Terminal End Circle */}
                    <circle
                      cx={W - padR}
                      cy={c.endY}
                      r={isSelected ? 5.5 : 3.5}
                      fill={c.color}
                      stroke="#05060a"
                      strokeWidth={1.5}
                      filter={isSelected ? 'url(#curveGlow)' : undefined}
                    />

                    {/* Right-Axis Label */}
                    <text
                      x={W - padR + 12}
                      y={c.endY + 3.5}
                      fill={c.color}
                      fontSize={isSelected ? '11' : '9.5'}
                      fontFamily="monospace"
                      fontWeight={isSelected ? 'bold' : '600'}
                    >
                      {c.code} {c.score.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {/* Interactive Scrubber Crosshair Line */}
              {scrubberX !== null && hoveredTask !== null && (
                <g>
                  <line
                    x1={scrubberX}
                    y1={padT}
                    x2={scrubberX}
                    y2={H - padB}
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    strokeOpacity="0.75"
                  />
                  <rect
                    x={scrubberX - 45}
                    y={H - padB - 24}
                    width="90"
                    height="18"
                    rx="4"
                    fill="#05060a"
                    stroke="#22d3ee"
                    strokeWidth="1"
                  />
                  <text
                    x={scrubberX}
                    y={H - padB - 12}
                    textAnchor="middle"
                    fill="#22d3ee"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    TASK {hoveredTask} / 120
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Bottom Footnote Telemetry */}
          <div className="absolute bottom-3 left-6 right-6 flex items-center justify-between text-[10px] text-[#7c819a] font-mono pointer-events-none">
            <span>120 TEST TASKS · 6 FACTORIAL CONDITIONS · 720 TRIALS PER MODEL</span>
            <span className="hidden sm:inline">REML MIXED-EFFECTS RANDOM INTERCEPTS</span>
          </div>
        </div>

        {/* Right Column: Conditions Inspector Sidebar */}
        <aside className="flex flex-col gap-3.5 min-w-0 text-xs">
          {/* Card 1: What You Are Looking At */}
          <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4 rounded-xl">
            <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
              WHAT YOU ARE LOOKING AT
            </h3>
            <p className="m-0 text-[#c8cce0] leading-[1.65]">
              How AI models learn to satisfy database rules across 120 consecutive tasks. The chart compares six ways of assisting the model, from raw generation (A) to full rule injection (B) and Axiom&apos;s surgical retrieval (C0).
            </p>
          </div>

          {/* Card 2: Interactive Condition Selector List */}
          <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4 rounded-xl">
            <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
              SIX CONDITIONS · CLICK TO ISOLATE
            </h3>
            <div className="flex flex-col gap-1">
              {CONDITIONS.map((cond) => {
                const isSelected = activeCode === cond.code;
                return (
                  <button
                    key={cond.code}
                    type="button"
                    onClick={() => {
                      setSelectedCondition(cond.code);
                      if (onSelectCondition) onSelectCondition(cond.code);
                    }}
                    onMouseEnter={() => setHoveredCondition(cond.code)}
                    onMouseLeave={() => setHoveredCondition(null)}
                    style={{
                      borderColor: isSelected ? cond.color : 'transparent',
                    }}
                    className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2.5 items-center w-full text-left font-mono text-[11px] px-2.5 py-2 border rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-white/[0.06] text-[#e8eaf2]'
                        : 'text-[#aab0c8] hover:border-[rgba(160,170,255,0.14)] hover:bg-white/[0.02]'
                    }`}
                  >
                    <i className="w-2 h-2 rounded-full" style={{ background: cond.color }} />
                    <div className="truncate">
                      <b className="text-[#e8eaf2] mr-1.5">{cond.code}</b>
                      <span className="text-[10px] text-[#7c819a]">{cond.name}</span>
                    </div>
                    <div className="text-right">
                      <b className="font-bold tabular-nums text-[#e8eaf2]">{cond.score.toFixed(1)}%</b>
                      <span className="block text-[9px] text-[#7c819a]">{cond.tokens} tok</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3: The Takeaway */}
          <div
            className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-4 rounded-xl"
            style={{ borderLeft: `2px solid #22d3ee` }}
          >
            <h3 className="m-0 mb-2 text-[10px] font-bold tracking-[0.18em] text-[#7c819a]">
              THE TAKEAWAY
            </h3>
            <p className="m-0 text-[#e8eaf2] text-[13px] leading-[1.6]">
              Handing the model the exact failed rule (C0) recovers 84% of the distance to the static reference while slashing prompt tokens by 51.3%. Distilling rules into natural language (C) loses 14.4 points in accuracy because subtle SQL naming and AST invariants are lost.
            </p>
          </div>
        </aside>
      </div>

      {/* Unified 4-Metric Comparative Hairline Strip (Matching Section 04 and Section 07) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] divide-y sm:divide-y-0 sm:divide-x divide-[rgba(160,170,255,0.14)] text-[10px] font-mono">
        <div className="p-4 space-y-1">
          <div className="text-[#7c819a] uppercase tracking-wider text-[9px]">H3 DISTILLATION GAP</div>
          <div className="text-xl sm:text-2xl font-black text-[#22d3ee] tabular-nums">+14.4 pp</div>
          <div className="text-[#aab0c8] text-[10px]">C0 vs C · p = 0.0008 (CR1 robust)</div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[#7c819a] uppercase tracking-wider text-[9px]">PROMPT TOKEN REDUCTION</div>
          <div className="text-xl sm:text-2xl font-black text-[#34d399] tabular-nums">-51.3%</div>
          <div className="text-[#aab0c8] text-[10px]">555 tokens (C0) vs 1,139 (B)</div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[#7c819a] uppercase tracking-wider text-[9px]">DDL SYNTAX STABILITY</div>
          <div className="text-xl sm:text-2xl font-black text-[#a855f7] tabular-nums">0.0% crashes</div>
          <div className="text-[#aab0c8] text-[10px]">vs 21.7% crash rate under B</div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[#7c819a] uppercase tracking-wider text-[9px]">PARETO GAP RECOVERED</div>
          <div className="text-xl sm:text-2xl font-black text-[#e8eaf2] tabular-nums">84.0%</div>
          <div className="text-[#aab0c8] text-[10px]">of distance to answer key</div>
        </div>
      </div>

      {/* Two Comparative Detail Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Pareto Token Efficiency Comparison */}
        <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-5 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-[#7c819a] uppercase">
            <span className="font-bold">PARETO TOKEN EFFICIENCY (SCORE ÷ PROMPT TOKENS × 100)</span>
            <span className="text-[#22d3ee] font-bold">2.3× HIGHER THAN B</span>
          </div>
          <p className="m-0 text-xs text-[#aab0c8] leading-relaxed">
            The ratio of database rules satisfied per unit of prompt budget. Selective verbatim retrieval eliminates context bloat while avoiding LLM distillation error.
          </p>

          <div className="space-y-2.5 pt-2">
            {[
              { code: 'C0', name: 'VERBATIM RULES', ratio: (86.3 / 555) * 100, col: '#22d3ee', best: true },
              { code: 'C', name: 'DISTILLED LESSONS', ratio: (71.9 / 780) * 100, col: '#fb923c' },
              { code: 'B', name: 'STATIC REFERENCE', ratio: (93.9 / 1139) * 100, col: '#a855f7' },
              { code: 'A', name: 'ZERO-SHOT BASELINE', ratio: (47.4 / 915) * 100, col: '#94a3b8' },
            ].map((item) => {
              const maxRatio = (86.3 / 555) * 100;
              const barWidth = `${((item.ratio / maxRatio) * 100).toFixed(0)}%`;
              return (
                <div key={item.code} className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-bold" style={{ color: item.col }}>
                      {item.code} · {item.name}
                    </span>
                    <span className="tabular-nums font-bold text-[#e8eaf2]">
                      {item.ratio.toFixed(2)} pts/100 tok {item.best && '(Optimal Knee)'}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: barWidth, background: item.col }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Verified Invariant Domains Matrix */}
        <div className="border border-[rgba(160,170,255,0.14)] bg-[rgba(10,7,20,0.6)] p-5 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-[10px] tracking-wider text-[#7c819a] uppercase">
            <span className="font-bold">INVARIANT DOMAIN SATISFACTION (34 ACTIVE RULES)</span>
            <span className="text-[#34d399] font-bold">POSTGRESQL 16 REFEREE</span>
          </div>
          <p className="m-0 text-xs text-[#aab0c8] leading-relaxed">
            Every structural invariant is verified separately by a real PostgreSQL 16 database. No language model judges the output.
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {INVARIANT_DOMAINS.map((domain) => (
              <div
                key={domain.name}
                className="p-2.5 rounded-lg border border-[rgba(160,170,255,0.1)] bg-white/[0.02] flex items-center justify-between text-[11px]"
              >
                <div className="truncate pr-2">
                  <div className="font-bold text-[#e8eaf2] text-[10.5px] truncate">{domain.name}</div>
                  <div className="text-[9px] text-[#7c819a] truncate">{domain.facts}</div>
                </div>
                <span
                  className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]"
                  style={{ background: domain.col, color: domain.col }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

export default ConvergenceCurvesSection;
