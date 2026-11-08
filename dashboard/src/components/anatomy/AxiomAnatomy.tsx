'use client';

import * as React from 'react';
import * as THREE from 'three';
import { animate, useReducedMotion } from 'framer-motion';
import type { CheckpointTrial, DeskData } from '@/lib/desk';
import './anatomy.css';

export interface AxiomAnatomyProps {
  checkpoint?: CheckpointTrial[];
  desk?: DeskData;
  running?: boolean;
  snapshot?: { runId: string; commit: string; isLive?: boolean };
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
  type:
    | 'silo'
    | 'matrix'
    | 'indexer'
    | 'vault'
    | 'substation'
    | 'turbine'
    | 'reactor'
    | 'guillotine'
    | 'column'
    | 'balance'
    | 'drum'
    | 'deck';
}

/* Palette: Axiom Core Functional Tones (Solid, crisp, zero violet-blue gradient slop) */
const C_GEN = '#a855f7';     // Executor / Generator (Violet)
const C_VER = '#22d3ee';     // Oracle / Retrieval / Inspection (Cyan)
const C_FAIL = '#f43f5e';    // Verdict / Invariant Failure (Carmine)
const C_ADV = '#fbbf24';     // Advisor / Distillation (Amber)
const C_PASS = '#34d399';    // Lesson Store / Checkpoint (Emerald)
const C_CHASSIS = '#94a3b8'; // Task Bank / Guardrails / Scorer (Milled Slate)

/* 12 Unique Assemblies positioned across the Centered Axiom Mainframe Chassis with Spacious Channels (+10px spacing) */
export const ASSEMBLIES: AssemblySpec[] = [
  // Tier 1: Intake & Knowledge (Top) - y = 1.4
  {
    id: '01',
    name: 'TASK BANK',
    badge: '40 · 40 · 120 SPLITS',
    desc: 'Seeded tasks partitioned into 40 Train, 40 Dev, and 120 Held-out Test tasks. Strict schema invariants, never corrected SQL.',
    fileLocation: 'fixtures/task-v2/tasks.json',
    x: 1.4,
    y: 1.4,
    w: 3.0,
    d: 2.2,
    h: 1.8,
    color: C_CHASSIS,
    type: 'silo',
  },
  {
    id: '04',
    name: 'CONDITIONS',
    badge: 'A B C C0 D E_B',
    desc: 'Assembles the prompt across 6 ablation conditions: baseline, static canonical hint, retrieved lessons, verbatim facts, placebo, and null Tier 0.',
    fileLocation: 'src/eval/ablation.ts',
    x: 6.2,
    y: 1.4,
    w: 3.2,
    d: 2.0,
    h: 1.2,
    color: C_VER,
    type: 'matrix',
  },
  {
    id: '02',
    name: 'RETRIEVAL',
    badge: 'K=6 · OVERLAP RANK',
    desc: 'Extracts incoming schema feature flags and ranks historical lessons by Jaccard overlap and Train failure frequency to pick top k=6 before Attempt 1.',
    fileLocation: 'src/memory.ts',
    x: 11.2,
    y: 1.4,
    w: 3.2,
    d: 2.0,
    h: 1.2,
    color: C_VER,
    type: 'indexer',
  },
  {
    id: '03',
    name: 'LESSON STORE',
    badge: 'READ-ONLY · SHA-256',
    desc: 'Immutable cryptographic memory vault. Lessons are calibrated on Train, loaded read-only, and verified by SHA-256 hash to prevent run-time leakage.',
    fileLocation: 'fixtures/memory.json',
    x: 16.2,
    y: 1.4,
    w: 2.8,
    d: 2.2,
    h: 1.6,
    color: C_PASS,
    type: 'vault',
  },

  // Tier 2: Compute, Crucible & Arbitration (Center) - y = 5.2 - 6.0 (+10px gap)
  {
    id: '06',
    name: 'GUARDRAILS',
    badge: 'FAIL-CLOSED · CACHE',
    desc: 'Fails closed on daily budget caps ($10/day), enforces exponential backoff on HTTP 429/503, and serves SHA-256 disk-cached model responses.',
    fileLocation: 'src/guardrails.ts',
    x: 1.4,
    y: 6.0,
    w: 2.8,
    d: 2.0,
    h: 1.4,
    color: C_CHASSIS,
    type: 'substation',
  },
  {
    id: '05',
    name: 'EXECUTOR',
    badge: 'NEMOTRON-3 · T=0',
    desc: 'The generative compute core. Invokes the model behind an OpenAI-compatible client at temperature 0 with strict token ceilings to produce candidate migration SQL.',
    fileLocation: 'src/executor.ts',
    x: 5.8,
    y: 5.6,
    w: 3.6,
    d: 2.8,
    h: 2.0,
    color: C_GEN,
    type: 'turbine',
  },
  {
    id: '07',
    name: 'ORACLE CRUCIBLE',
    badge: 'PG 16 · 34 FACTS',
    desc: 'The ground-truth execution reactor. PostgreSQL 16 in Docker. Runs migrations under role deployer, then probes 34 behavioral facts under role application.',
    fileLocation: 'scripts/oracle.ts',
    x: 11.0,
    y: 5.2,
    w: 4.4,
    d: 3.6,
    h: 2.4,
    color: C_VER,
    type: 'reactor',
  },
  {
    id: '08',
    name: 'VERDICT',
    badge: 'FACT IDS ONLY',
    desc: 'Precision behavioral arbitrator. Reports failures strictly as fact IDs (F-01..F-39) and single-line statements. Never leaks corrected SQL to the model.',
    fileLocation: 'scripts/facts.ts',
    x: 16.8,
    y: 6.0,
    w: 2.6,
    d: 2.2,
    h: 1.5,
    color: C_FAIL,
    type: 'guillotine',
  },

  // Tier 3: Distillation, Ledger & Analysis (Bottom) - y = 10.6 (+10px gap)
  {
    id: '12',
    name: 'ADVISOR',
    badge: '< 24 WORDS · GATED',
    desc: 'Distillation condensing column. Synthesizes a formatting rule under 24 words from failed verdicts. Held pending until the subsequent retry passes.',
    fileLocation: 'src/advisor.ts',
    x: 1.4,
    y: 10.6,
    w: 2.8,
    d: 2.2,
    h: 1.8,
    color: C_ADV,
    type: 'column',
  },
  {
    id: '09',
    name: 'SCORER',
    badge: 'BOUND FACTS · F-13',
    desc: 'Precision analytical balance. Scores each task by verifying all bound facts. Missing target table or schema violation scores zero.',
    fileLocation: 'src/eval/ablation.ts',
    x: 6.0,
    y: 10.6,
    w: 3.0,
    d: 2.2,
    h: 1.3,
    color: C_CHASSIS,
    type: 'balance',
  },
  {
    id: '10',
    name: 'CHECKPOINT',
    badge: '720 PROVENANCE TRIALS',
    desc: 'Twin magnetic drum ledger. Commits trial records and cryptographic hashes immediately after every trial. Enables interruption-proof resumption.',
    fileLocation: 'fixtures/checkpoint.json',
    x: 11.2,
    y: 10.6,
    w: 3.4,
    d: 2.2,
    h: 1.5,
    color: C_PASS,
    type: 'drum',
  },
  {
    id: '11',
    name: 'ANALYSIS',
    badge: 'SIGN-FLIP · HOLM',
    desc: 'Statistical verification deck. Runs paired randomization tests, exact McNemar calculations, and Holm-Bonferroni corrections after all 720 trials.',
    fileLocation: 'scripts/analyze-ablation-v2.ts',
    x: 16.4,
    y: 10.6,
    w: 2.8,
    d: 2.0,
    h: 1.1,
    color: C_VER,
    type: 'deck',
  },
];

export const ASSEMBLY_MAP = Object.fromEntries(
  ASSEMBLIES.map((a) => [a.id, a])
) as Record<string, AssemblySpec>;

/* True Sequential Pipeline Routes through Spacious Channels */
export interface BusRoute {
  id: string;
  fromId: string;
  toId: string;
  points: [number, number][];
  color: string;
}

export const BUS_ROUTES: BusRoute[] = [
  // 1. Task Ingestion: 01 TASK BANK -> 04 CONDITIONS
  {
    id: 'bus-01-04',
    fromId: '01',
    toId: '04',
    points: [[4.4, 2.45], [6.2, 2.45]],
    color: C_CHASSIS,
  },
  // 2. Condition Routing: 04 CONDITIONS -> 02 RETRIEVAL
  {
    id: 'bus-04-02',
    fromId: '04',
    toId: '02',
    points: [[9.4, 2.4], [11.2, 2.4]],
    color: C_VER,
  },
  // 3. Historical Index: 02 RETRIEVAL -> 03 LESSON STORE
  {
    id: 'bus-02-03',
    fromId: '02',
    toId: '03',
    points: [[14.4, 2.45], [16.2, 2.45]],
    color: C_PASS,
  },
  // 4. Memory Scan to Guardrails: 02 RETRIEVAL -> 06 GUARDRAILS (Avenue 1 at y = 4.6)
  {
    id: 'bus-02-06',
    fromId: '02',
    toId: '06',
    points: [[11.2, 3.4], [10.3, 3.4], [10.3, 4.6], [2.8, 4.6], [2.8, 6.0]],
    color: C_VER,
  },
  // 5. Safe Prompt Release: 06 GUARDRAILS -> 05 EXECUTOR
  {
    id: 'bus-06-05',
    fromId: '06',
    toId: '05',
    points: [[4.2, 7.0], [5.8, 7.0]],
    color: C_GEN,
  },
  // 6. Candidate Migration SQL: 05 EXECUTOR -> 07 ORACLE CRUCIBLE
  {
    id: 'bus-05-07',
    fromId: '05',
    toId: '07',
    points: [[9.4, 7.0], [11.0, 7.0]],
    color: C_GEN,
  },
  // 7. Behavioral Probe: 07 ORACLE CRUCIBLE -> 08 VERDICT
  {
    id: 'bus-07-08',
    fromId: '07',
    toId: '08',
    points: [[15.4, 7.0], [16.8, 7.0]],
    color: C_FAIL,
  },
  // 8. Reflexion Healing Failure Rail: 08 VERDICT -> 12 ADVISOR (Avenue 2 at y = 9.6)
  {
    id: 'rail-fail',
    fromId: '08',
    toId: '12',
    points: [[16.8, 7.6], [15.9, 7.6], [15.9, 9.6], [5.0, 9.6], [2.8, 9.6], [2.8, 10.6]],
    color: C_FAIL,
  },
  // 9. Reflexion Healing Retry Rail: 12 ADVISOR -> 05 EXECUTOR (Avenue 2 into Executor bottom)
  {
    id: 'rail-retry',
    fromId: '12',
    toId: '05',
    points: [[2.8, 10.6], [2.8, 9.6], [5.0, 9.6], [5.8, 8.4]],
    color: C_GEN,
  },
  // 10. Pass Provenance to Checkpoint: 08 VERDICT -> 10 CHECKPOINT (Avenue 2 into Checkpoint top)
  {
    id: 'rail-pass-checkpoint',
    fromId: '08',
    toId: '10',
    points: [[16.8, 8.0], [15.9, 8.0], [15.9, 9.6], [12.9, 9.6], [12.9, 10.6]],
    color: C_PASS,
  },
  // 11. Proven Memory Commit: 10 CHECKPOINT -> 03 LESSON STORE (Straight up Channel C at x = 15.9)
  {
    id: 'rail-pass-memory',
    fromId: '10',
    toId: '03',
    points: [[14.6, 11.7], [15.9, 11.7], [15.9, 2.5], [16.2, 2.5]],
    color: C_PASS,
  },
  // 12. Verification Analytics: 10 CHECKPOINT -> 11 ANALYSIS
  {
    id: 'bus-10-11',
    fromId: '10',
    toId: '11',
    points: [[14.6, 11.6], [16.4, 11.6]],
    color: C_VER,
  },
];

export const BUS_MAP = Object.fromEntries(
  BUS_ROUTES.map((b) => [b.id, b])
) as Record<string, BusRoute>;

/* Deep Space Starfield Map */
export const STARS = [
  { x: 54, y: 72, r: 1.0, o: 0.45 },
  { x: 120, y: 160, r: 1.4, o: 0.75, twinkle: true },
  { x: 210, y: 88, r: 0.8, o: 0.35 },
  { x: 310, y: 140, r: 1.6, o: 0.85, diamond: true },
  { x: 420, y: 64, r: 0.9, o: 0.4 },
  { x: 520, y: 92, r: 1.3, o: 0.65 },
  { x: 670, y: 55, r: 1.5, o: 0.8, twinkle: true },
  { x: 790, y: 84, r: 0.8, o: 0.35 },
  { x: 890, y: 130, r: 1.8, o: 0.9, diamond: true },
  { x: 990, y: 70, r: 1.1, o: 0.5 },
  { x: 1110, y: 110, r: 1.4, o: 0.7, twinkle: true },
  { x: 1220, y: 60, r: 0.8, o: 0.3 },
  { x: 1240, y: 180, r: 1.2, o: 0.6 },
  { x: 40, y: 260, r: 1.3, o: 0.65, twinkle: true },
  { x: 95, y: 350, r: 0.9, o: 0.4 },
  { x: 60, y: 480, r: 1.6, o: 0.85, diamond: true },
  { x: 130, y: 580, r: 1.1, o: 0.55 },
  { x: 80, y: 680, r: 0.8, o: 0.35 },
  { x: 190, y: 710, r: 1.4, o: 0.75, twinkle: true },
  { x: 320, y: 660, r: 0.9, o: 0.4 },
  { x: 440, y: 720, r: 1.5, o: 0.8, diamond: true },
  { x: 580, y: 690, r: 0.8, o: 0.35 },
  { x: 710, y: 730, r: 1.3, o: 0.65, twinkle: true },
  { x: 840, y: 680, r: 0.9, o: 0.45 },
  { x: 960, y: 715, r: 1.7, o: 0.85, diamond: true },
  { x: 1080, y: 670, r: 1.1, o: 0.5 },
  { x: 1190, y: 720, r: 0.8, o: 0.35 },
  { x: 1250, y: 620, r: 1.4, o: 0.7, twinkle: true },
  { x: 1210, y: 490, r: 0.9, o: 0.4 },
  { x: 1260, y: 380, r: 1.5, o: 0.8, diamond: true },
  { x: 1180, y: 280, r: 1.0, o: 0.5 },
  { x: 380, y: 210, r: 0.8, o: 0.3 },
  { x: 880, y: 230, r: 1.2, o: 0.6, twinkle: true },
  { x: 260, y: 450, r: 0.9, o: 0.35 },
  { x: 1020, y: 480, r: 1.1, o: 0.55 },
];

/* 6 Authentic Axiom Reflexion Healing Loop Stages */
export interface StageDefinition {
  name: string;
  primaryAssembly: string;
  inputAssembly?: string;
  activeRouteIds: string[];
  msg: string;
  statusKind: 'info' | 'warn' | 'fail' | 'pass';
  color: string;
}

export const STAGES: StageDefinition[] = [
  {
    name: 'GENERATE',
    primaryAssembly: '05',
    inputAssembly: '06',
    activeRouteIds: ['bus-06-05', 'bus-02-06'],
    msg: '[EXECUTOR] Model prompt compiled at T=0 · candidate SQL generated',
    statusKind: 'warn',
    color: '#a855f7',
  },
  {
    name: 'VERIFY',
    primaryAssembly: '07',
    inputAssembly: '05',
    activeRouteIds: ['bus-05-07'],
    msg: '[ORACLE CRUCIBLE] Fresh PG 16 container booted · migration deployed under role deployer',
    statusKind: 'info',
    color: '#22d3ee',
  },
  {
    name: 'FAIL',
    primaryAssembly: '08',
    inputAssembly: '07',
    activeRouteIds: ['bus-07-08', 'rail-fail'],
    msg: '[VERDICT] 34 facts probed · tripped invariants: F-05 F-19 F-20 [FAIL]',
    statusKind: 'fail',
    color: '#f43f5e',
  },
  {
    name: 'ADVISE',
    primaryAssembly: '12',
    inputAssembly: '08',
    activeRouteIds: ['rail-fail'],
    msg: '[ADVISOR] Distilled failure trace into lesson <24 words · queued for retry',
    statusKind: 'warn',
    color: '#fbbf24',
  },
  {
    name: 'RETRY',
    primaryAssembly: '05',
    inputAssembly: '12',
    activeRouteIds: ['rail-retry'],
    msg: '[EXECUTOR] Retry attempt with synthesized advice injected · re-generating migration SQL',
    statusKind: 'warn',
    color: '#a855f7',
  },
  {
    name: 'PASS',
    primaryAssembly: '10',
    inputAssembly: '03',
    activeRouteIds: ['rail-pass-memory', 'rail-pass-checkpoint'],
    msg: '[CHECKPOINT] Bound facts 100% verified · committed provenance hash to cryptographic ledger',
    statusKind: 'pass',
    color: '#34d399',
  },
];

/* Isometric Projection Math (Expanded Scale S=34, Calibrated Headroom >100px) */
const S = 34;
const OX = 538;
const OY = 88;
const K = 0.866; // cos(30°)
const BW = 21.6;
const BD = 14.8;
const SLAB_THICKNESS = 0.5;

export const P = (x: number, y: number, z: number = 0): [number, number] => [
  OX + (x - y) * K * S,
  OY + (x + y) * 0.5 * S - z * S,
];

export const pts = (a: [number, number][]): string =>
  a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/* Data Packet traveling along physical bus conductor */
export function BusPacket({
  route,
  active,
}: {
  route: BusRoute;
  active: boolean;
}) {
  const [pos, setPos] = React.useState<[number, number] | null>(null);

  React.useEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }

    const screenPoints = route.points.map((q) => P(q[0], q[1], 0.03));
    const start = screenPoints[0];
    setPos(start);

    let progress = 0;
    const controls = animate(0, 1, {
      duration: 0.85,
      ease: 'linear',
      onUpdate: (latest) => {
        progress = latest;
        const totalSegs = screenPoints.length - 1;
        const segIdx = Math.min(Math.floor(progress * totalSegs), totalSegs - 1);
        const segT = progress * totalSegs - segIdx;
        const pA = screenPoints[segIdx];
        const pB = screenPoints[segIdx + 1];
        setPos([
          pA[0] + (pB[0] - pA[0]) * segT,
          pA[1] + (pB[1] - pA[1]) * segT,
        ]);
      },
      onComplete: () => {
        setPos(null);
      },
    });

    return () => controls.stop();
  }, [active, route]);

  if (!pos || !active) return null;

  return (
    <circle
      cx={pos[0]}
      cy={pos[1]}
      r={3.8}
      fill="#ffffff"
      filter="url(#glow-cyan)"
      style={{ pointerEvents: 'none' }}
    />
  );
}

export function AxiomAnatomy({
  checkpoint,
  desk,
  running: initialRunning = true,
  snapshot,
}: AxiomAnatomyProps = {}) {
  const isLive = Boolean(snapshot?.isLive);
  const runId = snapshot?.runId ?? 'ablation-v2';
  const commit = snapshot?.commit ?? '7ebae83';

  const [running, setRunning] = React.useState(initialRunning);
  const [stageIdx, setStageIdx] = React.useState(0);
  const [selId, setSelId] = React.useState('07'); // Default select Oracle Crucible
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [exploded, setExploded] = React.useState(false);
  const [trial, setTrial] = React.useState(checkpoint?.length || 476);
  const [curCond, setCurCond] = React.useState(2); // Start on Condition C
  const [condCounts, setCondCounts] = React.useState([80, 80, 82, 80, 78, 76]);
  const [logs, setLogs] = React.useState<
    Array<{ text: string; kind: 'pass' | 'fail' | 'info' | 'warn' }>
  >([
    { text: '09:29:02 A/H-001 [ADVISOR] Distilling failure trace into lesson <24 words · queued for retry verification', kind: 'warn' },
    { text: '09:29:03 A/H-001 [CHECKPOINT] Bound facts 100% verified · writing trial provenance hash to ledger', kind: 'pass' },
    { text: '09:29:04 C/H-003 [TASK BANK] Ingesting seeded task · k=6 features flagged · T=0 armed', kind: 'info' },
    { text: '09:29:06 C/H-003 [RETRIEVAL] Scanning memory snapshot · rank Jaccard overlap vs Train fail rate', kind: 'info' },
    { text: '09:29:06 C/H-003 [EXECUTOR] Compiling condition prompt · model generating candidate migration SQL', kind: 'warn' },
    { text: '09:29:07 C/H-003 [ORACLE] Fresh PostgreSQL 16 container booted · migration executed under role deployer', kind: 'info' },
    { text: '09:29:08 C/H-003 [VERDICT] Probing 34 behavioral facts · role application schema isolation intact', kind: 'pass' },
    { text: '09:29:09 C/H-003 [CHECKPOINT] Trial C/H-003 completed · status: PASS · ledger hash 0x7fa92e committed', kind: 'pass' },
  ]);

  const reduce = useReducedMotion();
  const logRef = React.useRef<HTMLDivElement>(null);

  const COND_KEYS = ['A', 'B', 'C', 'C0', 'D', 'E_B'];

  // Dynamic 12-band frequency spectrum state (for Anatomy side panel)
  const [freqBars, setFreqBars] = React.useState<number[]>([
    45, 68, 85, 92, 60, 75, 88, 52, 70, 95, 62, 40,
  ]);
  const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', 'PG', 'TX', 'LLM', 'MEM'];

  React.useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setFreqBars((prev) =>
        prev.map((val) => {
          const delta = (Math.random() - 0.48) * 20;
          return Math.max(12, Math.min(100, Math.round(val + delta)));
        })
      );
    }, 220);
    return () => clearInterval(interval);
  }, [reduce]);

  // Current stage info
  const currentStage = STAGES[stageIdx];
  const activeRoutes = currentStage.activeRouteIds;
  const selectedAssembly = ASSEMBLY_MAP[selId] || ASSEMBLIES[6];

  // Autoscroll stream log to bottom
  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // Push log entry on stage step & dynamically advance simulation
  React.useEffect(() => {
    const time = new Date().toTimeString().slice(0, 8);
    const condName = COND_KEYS[curCond];
    const newEntry = {
      text: `${time} ${condName}/H-${String(trial).padStart(3, '0')} ${
        currentStage.msg
      }`,
      kind: currentStage.statusKind,
    };
    setLogs((prev) => [...prev.slice(-28), newEntry]);
  }, [stageIdx, trial, curCond]);

  // Automatic evaluation loop stepper
  React.useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setStageIdx((prev) => {
        const next = (prev + 1) % STAGES.length;
        if (next === 0) {
          // Complete trial on loop cycle
          setTrial((t) => t + 1);
          setCondCounts((prevCounts) => {
            const copy = [...prevCounts];
            copy[curCond] = Math.min(120, copy[curCond] + 1);
            return copy;
          });
          setCurCond((c) => (c + 1) % COND_KEYS.length);
        }
        return next;
      });
    }, 1350);

    return () => clearInterval(interval);
  }, [running, curCond, condCounts]);

  // Keyboard shortcut support (R to toggle run, Space to explode)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === ' ') {
        e.preventDefault();
        setExploded((exp) => !exp);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sort assemblies for painter's algorithm
  const sortedAssemblies = React.useMemo(() => {
    return [...ASSEMBLIES].sort((a, b) => a.x + a.y - (b.x + b.y));
  }, []);

  return (
    <div
      className="axiom-anatomy-root"
      role="region"
      aria-label="Axiom Architecture Anatomy Interactive Rig"
    >
      {/* ---------- Top Controls Toolbar ---------- */}
      <header className="axm-bar">
        <div className="axm-btn-group">
          <button
            type="button"
            className="axm-btn"
            data-running={running}
            onClick={() => setRunning(!running)}
            aria-label={running ? 'Halt trial loop' : 'Start trial loop'}
          >
            <span className="axm-dot" />
            <span>{running ? 'Halt trial' : 'Execute trial loop'}</span>
            <kbd>R</kbd>
          </button>

          <button
            type="button"
            className={`axm-btn ${exploded ? 'is-active' : ''}`}
            onClick={() => setExploded(!exploded)}
            aria-label="Toggle exploded view of assemblies"
          >
            <span>Take apart</span>
            <kbd>Space</kbd>
          </button>
        </div>

        {/* 7 Pipeline Stage Breadcrumbs */}
        <div className="axm-chips-group" role="tablist">
          {STAGES.map((s, idx) => {
            const isAct = idx === stageIdx;
            return (
              <button
                key={s.name}
                type="button"
                role="tab"
                aria-selected={isAct}
                className={`axm-chip ${isAct ? 'is-active' : ''}`}
                onClick={() => {
                  setRunning(false);
                  setStageIdx(idx);
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        {/* SNAPSHOT / LIVE Indicator Badge */}
        <div
          className="axm-snapshot-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            border: isLive ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(168, 85, 247, 0.4)',
            background: 'rgba(7, 9, 16, 0.8)',
            color: isLive ? '#34d399' : '#d8b4fe',
            fontSize: '10px',
            fontFamily: 'var(--axm-font-mono, monospace)',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#34d399' : '#a855f7' }} />
          <span>{isLive ? 'LIVE' : `SNAPSHOT // ${runId} @ ${commit}`}</span>
        </div>
      </header>

      {/* ---------- 3-Column Cockpit Layout (Full Width, Zero Dead Space) ---------- */}
      <div className="axm-layout">
        {/* Left HUD: Telemetry, Invariants, & Conditions */}
        <aside className="axm-side-col axm-side-left">
          {/* Card 1: TRIAL · VERIFIED RUN (Unique Blueprint Odometer Style) */}
          <div className="axm-card axm-trial-card">
            <div className="axm-card-label">
              <span>TRIAL · VERIFIED RUN</span>
              <span className="axm-badge-nominal">NOMINAL</span>
            </div>
            <div className="axm-counter mono">
              {String(trial).padStart(3, '0')} <small>/ 720</small>
            </div>
            <div className="axm-trial-foot mono">
              <span>SEED: 0x7fa92e</span>
              <span className="axm-trial-tag">AXM-V2</span>
            </div>
          </div>

          {/* Card 2: CONDITIONS ABLATION (Unique Logic Analyzer Style) */}
          <div className="axm-card axm-cond-card">
            <div className="axm-card-label">
              <span>CONDITIONS ABLATION</span>
              <span className="axm-cond-pill">6 BUSES</span>
            </div>
            <div className="axm-cond-list">
              {COND_KEYS.map((k, idx) => {
                const busColors = ['#22d3ee', '#38bdf8', '#fbbf24', '#2dd4bf', '#a855f7', '#f43f5e'];
                const busColor = busColors[idx % busColors.length];
                const isActive = curCond === idx;
                return (
                  <div
                    key={k}
                    className={`axm-cond-row ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="axm-cond-key" style={{ color: isActive ? busColor : undefined }}>{k}</span>
                    <span className="axm-cond-bar">
                      <span
                        className="axm-cond-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (condCounts[idx] / 120) * 100
                          )}%`,
                          background: isActive ? busColor : 'var(--axm-ver)',
                          boxShadow: isActive ? `0 0 8px ${busColor}` : undefined,
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Segmented Latency Step-Blocks matching Image */}
            <div className="axm-latency-module">
              <div className="axm-spark-head mono">
                <span>LATENCY TREND</span>
                <span className="axm-lat-badge">42 ms</span>
              </div>
              <div className="axm-lat-segments">
                <span className="lat-seg seg-1" />
                <span className="lat-seg seg-2" />
                <span className="lat-seg seg-3" />
                <span className="lat-seg seg-4" />
                <span className="lat-seg seg-5" />
                <span className="lat-seg seg-6" />
                <span className="lat-seg seg-7" />
                <span className="lat-seg seg-8" />
              </div>
            </div>
          </div>

          {/* Card 3: BENCH RIG SPECS (Unique Technical Specification Plate) */}
          <div className="axm-card axm-bench-card">
            <div className="axm-bench-corner tl" />
            <div className="axm-bench-corner tr" />
            <div className="axm-card-label">
              <span>BENCH RIG SPECS</span>
              <span className="axm-model-tag">LOCKED T=0</span>
            </div>
            <div className="axm-kv-row">
              <span>probed facts</span>
              <b>34 / 39 active</b>
            </div>
            <div className="axm-kv-row">
              <span>task splits</span>
              <b>40 · 40 · 120</b>
            </div>
            <div className="axm-kv-row">
              <span>temperature</span>
              <b style={{ color: 'var(--axm-adv)' }}>0 (deterministic)</b>
            </div>
            <div className="axm-kv-row">
              <span>model</span>
              <b style={{ color: 'var(--axm-ver)' }}>nemotron-3-ultra</b>
            </div>
          </div>
        </aside>

        {/* Center: 3D Isometric Motherboard with Celestial Outer Ring Layout & Starfield */}
        <main className="axm-stage-container">
          <svg
            viewBox="0 0 1280 760"
            className={`axm-svg-board ${exploded ? 'is-exploded' : ''}`}
            role="img"
            aria-label="3D Isometric schematic of Axiom architecture"
          >
            <defs>
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-violet" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* 1. Deep Space Starfield Background */}
            <g className="axm-starfield" pointerEvents="none">
              {STARS.map((star, idx) => {
                if (star.diamond) {
                  return (
                    <path
                      key={`star-${idx}`}
                      d={`M ${star.x} ${star.y - 4} L ${star.x + 1.4} ${star.y} L ${star.x} ${star.y + 4} L ${star.x - 1.4} ${star.y} Z`}
                      fill="#e2e8f0"
                      opacity={star.o}
                      className="axm-diamond-star"
                    />
                  );
                }
                return (
                  <circle
                    key={`star-${idx}`}
                    cx={star.x}
                    cy={star.y}
                    r={star.r}
                    fill={star.twinkle ? '#c7d2fe' : '#94a3b8'}
                    opacity={star.o}
                    className={star.twinkle ? 'axm-twinkle-star' : undefined}
                  />
                );
              })}
            </g>

            {/* 2. Tactical Celestial Outer Ring Layout */}
            <g className="axm-outer-rings" pointerEvents="none">
              {/* Outer Orbital Ellipse */}
              <ellipse
                cx={640}
                cy={390}
                rx={590}
                ry={300}
                fill="none"
                stroke="#1b2434"
                strokeWidth={1.2}
                strokeDasharray="8 8"
                opacity={0.5}
              />
              {/* Mid Orbital Range Ring */}
              <ellipse
                cx={640}
                cy={390}
                rx={470}
                ry={240}
                fill="none"
                stroke="#243147"
                strokeWidth={1.4}
                opacity={0.65}
              />
              {/* Inner Reactor Containment Ring */}
              <ellipse
                cx={640}
                cy={390}
                rx={360}
                ry={185}
                fill="none"
                stroke="#1e293b"
                strokeWidth={1}
                strokeDasharray="4 6"
                opacity={0.4}
              />

              {/* Cardinal Celestial Degree Markers */}
              <text x={640} y={82} fill="#475569" fontFamily="var(--axm-font-mono)" fontSize={9} textAnchor="middle" letterSpacing="0.2em">
                000° NORTH // APOGEE
              </text>
              <text x={640} y={704} fill="#475569" fontFamily="var(--axm-font-mono)" fontSize={9} textAnchor="middle" letterSpacing="0.2em">
                180° SOUTH // PERIGEE
              </text>
              <text x={42} y={394} fill="#475569" fontFamily="var(--axm-font-mono)" fontSize={9} textAnchor="start" letterSpacing="0.15em">
                270° WEST
              </text>
              <text x={1238} y={394} fill="#475569" fontFamily="var(--axm-font-mono)" fontSize={9} textAnchor="end" letterSpacing="0.15em">
                090° EAST
              </text>

              {/* Radial Trajectory Sightlines into Quadrant Fact Nodes */}
              <line x1={220} y1={175} x2={130} y2={130} stroke="#1f293d" strokeWidth={1} strokeDasharray="3 3" />
              <line x1={1060} y1={175} x2={1150} y2={130} stroke="#1f293d" strokeWidth={1} strokeDasharray="3 3" />
              <line x1={220} y1={605} x2={130} y2={650} stroke="#1f293d" strokeWidth={1} strokeDasharray="3 3" />
              <line x1={1060} y1={605} x2={1150} y2={650} stroke="#1f293d" strokeWidth={1} strokeDasharray="3 3" />

              {/* Tactical Quadrant Reticle HUD Pills (matching F-03, F-37, F-36, F-32) */}
              <g transform="translate(88, 120)">
                <rect x={-32} y={-10} width={64} height={20} rx={4} fill="#060911" stroke="#253347" strokeWidth={1} />
                <circle cx={-22} cy={0} r={2.5} fill="#22d3ee" />
                <text x={-14} y={3.5} fill="#94a3b8" fontFamily="var(--axm-font-mono)" fontSize={8.5} fontWeight={600} letterSpacing="0.08em">F-03</text>
              </g>
              <g transform="translate(1192, 120)">
                <rect x={-32} y={-10} width={64} height={20} rx={4} fill="#060911" stroke="#253347" strokeWidth={1} />
                <circle cx={-22} cy={0} r={2.5} fill="#a855f7" />
                <text x={-14} y={3.5} fill="#94a3b8" fontFamily="var(--axm-font-mono)" fontSize={8.5} fontWeight={600} letterSpacing="0.08em">F-37</text>
              </g>
              <g transform="translate(88, 660)">
                <rect x={-32} y={-10} width={64} height={20} rx={4} fill="#060911" stroke="#253347" strokeWidth={1} />
                <circle cx={-22} cy={0} r={2.5} fill="#fbbf24" />
                <text x={-14} y={3.5} fill="#94a3b8" fontFamily="var(--axm-font-mono)" fontSize={8.5} fontWeight={600} letterSpacing="0.08em">F-36</text>
              </g>
              <g transform="translate(1192, 660)">
                <rect x={-32} y={-10} width={64} height={20} rx={4} fill="#060911" stroke="#253347" strokeWidth={1} />
                <circle cx={-22} cy={0} r={2.5} fill="#34d399" />
                <text x={-14} y={3.5} fill="#94a3b8" fontFamily="var(--axm-font-mono)" fontSize={8.5} fontWeight={600} letterSpacing="0.08em">F-32</text>
              </g>

              {/* Orbiting Satellite Marker */}
              <circle cx={640 + 470 * Math.cos(1.2)} cy={390 + 240 * Math.sin(1.2)} r={4} fill="#060911" stroke="#22d3ee" strokeWidth={1.5} />
              <circle cx={640 + 470 * Math.cos(1.2)} cy={390 + 240 * Math.sin(1.2)} r={1.8} fill="#22d3ee" />
            </g>

            {/* Corner Alignment Reticles */}
            <g opacity={0.35} fontFamily="ui-monospace, monospace" fontSize={9} fill="#55627a">
              <path d="M 28 36 L 28 24 L 40 24" fill="none" stroke="#252e42" strokeWidth={1.5} />
              <text x={34} y={42}>SYS//AXM-REFLX-V2</text>
              <path d="M 1252 36 L 1252 24 L 1240 24" fill="none" stroke="#252e42" strokeWidth={1.5} />
              <text x={1246} y={42} textAnchor="end">RIG: 12 ASSEMBLIES</text>
              <path d="M 28 724 L 28 736 L 40 736" fill="none" stroke="#252e42" strokeWidth={1.5} />
              <text x={34} y={728}>ORACLE: DOCKER_PG16</text>
              <path d="M 1252 724 L 1252 736 L 1240 736" fill="none" stroke="#252e42" strokeWidth={1.5} />
              <text x={1246} y={728} textAnchor="end">EVAL_BUS: LOCKED T=0</text>
            </g>

            {/* Motherboard Base Slab */}
            <polygon
              points={pts([
                P(0, 0, 0),
                P(0, BD, 0),
                P(0, BD, -SLAB_THICKNESS),
                P(0, 0, -SLAB_THICKNESS),
              ])}
              fill="#06070a"
              stroke="#242c3d"
              strokeWidth={1.2}
            />
            <polygon
              points={pts([
                P(0, BD, 0),
                P(BW, BD, 0),
                P(BW, BD, -SLAB_THICKNESS),
                P(0, BD, -SLAB_THICKNESS),
              ])}
              fill="#040508"
              stroke="#242c3d"
              strokeWidth={1.2}
            />
            <polygon
              points={pts([P(0, 0), P(BW, 0), P(BW, BD), P(0, BD)])}
              fill="#08090d"
              stroke="#343f54"
              strokeWidth={1.4}
            />

            {/* Laser-Etched Coordinate Grid */}
            {Array.from({ length: Math.floor(BW) }, (_, i) => i + 1).map((i) => (
              <polyline
                key={`grid-x-${i}`}
                points={pts([P(i, 0), P(i, BD)])}
                stroke="#121622"
                strokeWidth={1}
                fill="none"
              />
            ))}
            {Array.from({ length: Math.floor(BD) }, (_, j) => j + 1).map((j) => (
              <polyline
                key={`grid-y-${j}`}
                points={pts([P(0, j), P(BW, j)])}
                stroke="#121622"
                strokeWidth={1}
                fill="none"
              />
            ))}

            {/* Recessed Mounting Bays for Each Assembly */}
            {ASSEMBLIES.map((a) => {
              const m = 0.18;
              const bPts = [
                P(a.x - m, a.y - m, 0.01),
                P(a.x + a.w + m, a.y - m, 0.01),
                P(a.x + a.w + m, a.y + a.d + m, 0.01),
                P(a.x - m, a.y + a.d + m, 0.01),
              ];
              return (
                <polygon
                  key={`bay-${a.id}`}
                  points={pts(bPts)}
                  fill="#050608"
                  stroke="#182030"
                  strokeWidth={1.2}
                />
              );
            })}

            {/* Bus Cable Conductors Running in Open Channels */}
            {BUS_ROUTES.map((route) => {
              const isAct = activeRoutes.includes(route.id);
              const pathPoints = route.points.map((q) => P(q[0], q[1], 0.03));
              const start = pathPoints[0];
              const end = pathPoints[pathPoints.length - 1];

              return (
                <g key={route.id} className="axm-bus-group">
                  <polyline
                    points={pts(pathPoints)}
                    className={`axm-bus-track ${isAct ? 'is-active' : ''}`}
                    stroke={route.color}
                    color={route.color}
                  />
                  <circle
                    cx={start[0]}
                    cy={start[1]}
                    r={3.2}
                    fill="#08090d"
                    stroke={route.color}
                    strokeWidth={1.8}
                  />
                  <circle
                    cx={end[0]}
                    cy={end[1]}
                    r={3.2}
                    fill="#08090d"
                    stroke={route.color}
                    strokeWidth={1.8}
                  />
                </g>
              );
            })}

            {/* Bus Signal Packets */}
            {!reduce &&
              BUS_ROUTES.map((route) => (
                <BusPacket
                  key={`pkt-${route.id}-${stageIdx}`}
                  route={route}
                  active={activeRoutes.includes(route.id)}
                />
              ))}

            {/* The 12 Distinct Architectural Buildings with Unique 3D Hardware */}
            {sortedAssemblies.map((a) => {
              const { id, name, badge, x, y, w, d, h, color, type } = a;
              const idx = ASSEMBLIES.indexOf(a) + 1;
              const isSel = selId === id;
              const isAct = currentStage.primaryAssembly === id;
              const isInput = currentStage.inputAssembly === id;

              // Top face vertices
              const topPoints = [
                P(x, y, h),
                P(x + w, y, h),
                P(x + w, y + d, h),
                P(x, y + d, h),
              ];
              const [cx, cy] = P(x + w / 2, y + d / 2, h);

              return (
                <g
                  key={id}
                  className={`axm-building ${isSel ? 'is-selected' : ''} ${
                    isAct ? 'is-active' : ''
                  } ${isInput ? 'is-input' : ''}`}
                  style={
                    {
                      '--building-color': color,
                      '--building-idx': idx,
                    } as React.CSSProperties
                  }
                  tabIndex={0}
                  role="button"
                  aria-label={`${name}: ${badge}`}
                  onClick={() => setSelId(id)}
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setSelId(id);
                    }
                  }}
                >
                  {/* Right Face (Shadow Side) */}
                  <polygon
                    points={pts([
                      P(x + w, y, h),
                      P(x + w, y + d, h),
                      P(x + w, y + d, 0),
                      P(x + w, y, 0),
                    ])}
                    fill="#0b0e14"
                    stroke={color}
                    strokeOpacity={0.45}
                    strokeWidth={1}
                  />

                  {/* Front Face (Light Side) */}
                  <polygon
                    points={pts([
                      P(x, y + d, h),
                      P(x + w, y + d, h),
                      P(x + w, y + d, 0),
                      P(x, y + d, 0),
                    ])}
                    fill="#0f131c"
                    stroke={color}
                    strokeOpacity={0.45}
                    strokeWidth={1}
                  />

                  {/* Solid Base Platform */}
                  <polygon points={pts(topPoints)} fill="#08090d" />

                  {/* Translucent Working Roof with Highlight Stroke */}
                  <polygon
                    points={pts(topPoints)}
                    className="axm-roof"
                    fill={color}
                    fillOpacity={0.12}
                    stroke={color}
                    strokeWidth={1.5}
                  />

                  {/* Unique 3D Mechanical Hardware Guts per Type (Inspired by Image 2!) */}
                  {type === 'silo' && (
                    /* 01 TASK BANK: 3 Cylindrical Storage Silos */
                    <g pointerEvents="none">
                      {[0, 1, 2].map((sIdx) => {
                        const sx = x + 0.6 + sIdx * 0.9;
                        const sy = y + d / 2;
                        const [scx, scy] = P(sx, sy, h);
                        return (
                          <g key={sIdx}>
                            <ellipse cx={scx} cy={scy} rx={7.5} ry={4.3} fill="#080a10" stroke={color} strokeWidth={1.4} />
                            <ellipse cx={scx} cy={scy - 4} rx={6} ry={3.4} fill="#141824" stroke={color} strokeWidth={1} />
                            <circle cx={scx} cy={scy - 4} r={2} fill={color} />
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {type === 'matrix' && (
                    /* 04 CONDITIONS: 6 Toggle Pins in 2x3 Grid */
                    <g pointerEvents="none">
                      {Array.from({ length: 6 }).map((_, cIdx) => {
                        const px = x + 0.6 + (cIdx % 3) * (w / 3.6);
                        const py = y + 0.5 + Math.floor(cIdx / 3) * (d / 2.2);
                        const [dx, dy] = P(px, py, h);
                        return (
                          <g key={cIdx}>
                            <ellipse cx={dx} cy={dy} rx={5} ry={3} fill="#080a12" stroke={color} strokeWidth={1} />
                            <circle cx={dx} cy={dy - 2.5} r={2.2} fill={color} filter="url(#glow-cyan)" />
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {type === 'indexer' && (
                    /* 02 RETRIEVAL: Stepped Optical Scanning Head */
                    <g pointerEvents="none">
                      <line
                        x1={P(x + 0.4, y + d / 2, h)[0]}
                        y1={P(x + 0.4, y + d / 2, h)[1]}
                        x2={P(x + w - 0.4, y + d / 2, h)[0]}
                        y2={P(x + w - 0.4, y + d / 2, h)[1]}
                        stroke="#182030"
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                      <ellipse cx={cx} cy={cy} rx={12} ry={7} fill="#0a0e18" stroke={color} strokeWidth={1.4} />
                      <circle cx={cx} cy={cy} r={3.5} fill={color} filter="url(#glow-cyan)" />
                    </g>
                  )}

                  {type === 'vault' && (
                    /* 03 LESSON STORE: Cryptographic Safe Vault Wheel */
                    <g pointerEvents="none">
                      <ellipse cx={cx} cy={cy} rx={16} ry={9.5} fill="#06080e" stroke={color} strokeWidth={1.8} />
                      <ellipse cx={cx} cy={cy} rx={9} ry={5.2} fill="#0b101c" stroke={color} strokeWidth={1.2} />
                      <circle cx={cx} cy={cy} r={2.8} fill={color} />
                      <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke={color} strokeWidth={1} opacity={0.6} />
                      <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} stroke={color} strokeWidth={1} opacity={0.6} />
                    </g>
                  )}

                  {type === 'substation' && (
                    /* 06 GUARDRAILS: 5 Vertical Heat-Sink Cooling Fins */
                    <g pointerEvents="none">
                      {Array.from({ length: 5 }).map((_, fin) => {
                        const fy = y + 0.35 + (d * fin) / 5.2;
                        const p1 = P(x + 0.3, fy, h);
                        const p2 = P(x + w - 0.3, fy, h);
                        return (
                          <g key={fin}>
                            <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
                            <line x1={p1[0]} y1={p1[1] - 4} x2={p2[0]} y2={p2[1] - 4} stroke={color} strokeWidth={1} opacity={0.6} />
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {type === 'turbine' && (
                    /* 05 EXECUTOR: Large Rotary Compute Knob with Stator (Violet in Image 2!) */
                    <g pointerEvents="none">
                      <ellipse cx={cx} cy={cy} rx={24} ry={14} fill="#080a14" stroke={color} strokeWidth={2} />
                      <ellipse cx={cx} cy={cy - 6} rx={15} ry={9} fill="#140f26" stroke={color} strokeWidth={1.4} />
                      <circle cx={cx} cy={cy - 6} r={4} fill="#ffffff" filter="url(#glow-violet)" />
                    </g>
                  )}

                  {type === 'reactor' && (
                    /* 07 ORACLE CRUCIBLE: Dual-Chamber Reactor with Dial Needle (Cyan in Image 2!) */
                    <g pointerEvents="none">
                      <ellipse cx={cx} cy={cy} rx={32} ry={18} fill="#050810" stroke={color} strokeWidth={2.4} />
                      <ellipse cx={cx} cy={cy - 8} rx={20} ry={11.5} fill="#071828" stroke={color} strokeWidth={1.6} />
                      <circle cx={cx} cy={cy - 8} r={4.5} fill="#ffffff" filter="url(#glow-cyan)" />
                      <line x1={cx} y1={cy - 8} x2={cx + 12} y2={cy - 14} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
                      <ellipse cx={cx - 28} cy={cy + 6} rx={7} ry={4} fill="#080e18" stroke={color} strokeWidth={1} />
                    </g>
                  )}

                  {type === 'guillotine' && (
                    /* 08 VERDICT: Optical Sensor Beam Guillotine */
                    <g pointerEvents="none">
                      <rect x={cx - 12} y={cy - 8} width={24} height={14} rx={2} fill="#16080c" stroke={color} strokeWidth={1.4} />
                      <circle cx={cx} cy={cy - 1} r={3} fill={color} filter="url(#glow-cyan)" />
                    </g>
                  )}

                  {type === 'column' && (
                    /* 12 ADVISOR: Twin Distillation Rotary Knobs (Amber in Image 2!) */
                    <g pointerEvents="none">
                      <ellipse cx={P(x + w * 0.35, y + d / 2, h)[0]} cy={P(x + w * 0.35, y + d / 2, h)[1]} rx={10} ry={6} fill="#140f06" stroke={color} strokeWidth={1.6} />
                      <circle cx={P(x + w * 0.35, y + d / 2, h)[0]} cy={P(x + w * 0.35, y + d / 2, h)[1] - 3} r={3} fill={color} />
                      <ellipse cx={P(x + w * 0.72, y + d / 2, h)[0]} cy={P(x + w * 0.72, y + d / 2, h)[1]} rx={10} ry={6} fill="#140f06" stroke={color} strokeWidth={1.6} />
                      <circle cx={P(x + w * 0.72, y + d / 2, h)[0]} cy={P(x + w * 0.72, y + d / 2, h)[1] - 3} r={3} fill={color} />
                    </g>
                  )}

                  {type === 'balance' && (
                    /* 09 SCORER: Stepped Dual Balance Platform */
                    <g pointerEvents="none">
                      <rect x={P(x + 0.7, y + d / 2, h)[0] - 7} y={P(x + 0.7, y + d / 2, h)[1] - 5} width={14} height={10} rx={2} fill="#0c1018" stroke={color} strokeWidth={1.2} />
                      <rect x={P(x + w - 0.7, y + d / 2, h)[0] - 7} y={P(x + w - 0.7, y + d / 2, h)[1] - 5} width={14} height={10} rx={2} fill="#0c1018" stroke={color} strokeWidth={1.2} />
                    </g>
                  )}

                  {type === 'drum' && (
                    /* 10 CHECKPOINT: Twin Magnetic Tape Drums */
                    <g pointerEvents="none">
                      <ellipse cx={P(x + w * 0.33, y + d / 2, h)[0]} cy={P(x + w * 0.33, y + d / 2, h)[1]} rx={12} ry={7} fill="#080e0c" stroke={color} strokeWidth={1.6} />
                      <circle cx={P(x + w * 0.33, y + d / 2, h)[0]} cy={P(x + w * 0.33, y + d / 2, h)[1]} r={3} fill={color} />
                      <ellipse cx={P(x + w * 0.68, y + d / 2, h)[0]} cy={P(x + w * 0.68, y + d / 2, h)[1]} rx={12} ry={7} fill="#080e0c" stroke={color} strokeWidth={1.6} />
                      <circle cx={P(x + w * 0.68, y + d / 2, h)[0]} cy={P(x + w * 0.68, y + d / 2, h)[1]} r={3} fill={color} />
                    </g>
                  )}

                  {type === 'deck' && (
                    /* 11 ANALYSIS: Low-Profile Status Display Slit */
                    <g pointerEvents="none">
                      <rect x={cx - 18} y={cy - 3} width={36} height={6} rx={2} fill="#060c14" stroke={color} strokeWidth={1.2} />
                      <circle cx={cx - 10} cy={cy} r={1.6} fill={color} />
                      <circle cx={cx} cy={cy} r={1.6} fill={color} />
                      <circle cx={cx + 10} cy={cy} r={1.6} fill={color} />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Floating Name Callout Badges (Hover / Active Callouts) */}
            {ASSEMBLIES.map((a) => {
              const { id, name, badge, x, y, w, d, h, color } = a;
              const [cx, cy] = P(x + w / 2, y + d / 2, h);
              const floatY = cy - 42;
              const isTarget = (id === hoverId) || (id === selId) || (id === currentStage.primaryAssembly);

              return (
                <g
                  key={`callout-${id}`}
                  className={`axm-floating-callout ${isTarget ? 'is-active' : 'is-idle'}`}
                >
                  <line
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={floatY + 14}
                    className="axm-callout-tether"
                    stroke={color}
                  />
                  <circle cx={cx} cy={cy} r={2.5} fill={color} />

                  <g transform={`translate(${cx}, ${floatY})`}>
                    <rect
                      x={-65}
                      y={-14}
                      width={130}
                      height={28}
                      rx={5}
                      className="axm-callout-card"
                      stroke={color}
                    />
                    <circle cx={-52} cy={0} r={3} fill={color} />
                    <text
                      x={-42}
                      y={-1}
                      fill="#ffffff"
                      fontFamily="var(--axm-font-sans)"
                      fontSize={10.5}
                      fontWeight={700}
                      letterSpacing="0.04em"
                    >
                      {id} · {name}
                    </text>
                    <text
                      x={-42}
                      y={9.5}
                      fill={color}
                      fontFamily="var(--axm-font-mono)"
                      fontSize={8}
                      fontWeight={600}
                      letterSpacing="0.06em"
                    >
                      {badge}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </main>

        {/* Right HUD: Cockpit Simulated Execution Stream, Evidence Matrix, Frequency Spectrum & Failed Facts Probe */}
        <aside className="axm-side-col axm-side-right">
          {/* Card 4: SIMULATED EXECUTION STREAM (Unique Phosphor CRT Scope Style) */}
          <div className="axm-card axm-stream-card">
            <div className="axm-card-label">
              <span>EXECUTION STREAM</span>
              <span className="axm-live-beacon">{isLive ? '● LIVE' : '● SIMULATED'}</span>
            </div>
            <div ref={logRef} className="axm-stream-log">
              {logs.map((l, i) => (
                <div key={i} className={`log-${l.kind}`}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>

          {/* Card 5: EVIDENCE MATRIX // 720 TRIALS (Unique Silicon Micro-Register Style) */}
          <div className="axm-card axm-matrix-card">
            <div className="axm-card-label">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>EVIDENCE MATRIX // 720 TRIALS</span>
                <span
                  style={{
                    fontSize: '8px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    border: isLive ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(168, 85, 247, 0.4)',
                    color: isLive ? '#34d399' : '#d8b4fe',
                    background: 'rgba(5, 6, 10, 0.6)',
                    fontWeight: 600,
                  }}
                >
                  {isLive ? 'LIVE' : `SNAPSHOT · ${runId} · ${commit}`}
                </span>
              </div>
              <b style={{ color: 'var(--axm-text)' }}>{trial}</b>
            </div>
            <div className="axm-matrix-grid" role="img" aria-label="Evidence matrix 6 condition channels">
              {COND_KEYS.map((k, rIdx) => {
                const isCurRow = curCond === rIdx;
                const rowPassed = Math.floor((condCounts[rIdx] / 120) * 22);
                return (
                  <div key={k} className={`axm-matrix-row ${isCurRow ? 'is-active-row' : ''}`}>
                    <span className="axm-matrix-row-key">{k}</span>
                    <div className="axm-matrix-cells">
                      {Array.from({ length: 22 }, (_, cIdx) => {
                        const isRun = isCurRow && cIdx === Math.min(21, rowPassed);
                        const isPass = cIdx < rowPassed && cIdx % 7 !== 4;
                        const isFail = cIdx < rowPassed && cIdx % 7 === 4;
                        const raw = Math.sin((cIdx + 1) * 127.1 + (rIdx + 1) * 311.7) * 43758.5453;
                        const rand = raw - Math.floor(raw);
                        const isPulse = (isPass || isFail) && !isRun && rand < 0.20;
                        const pulsePhase = isPulse ? (-rand * 4.2).toFixed(2) : undefined;
                        return (
                          <span
                            key={cIdx}
                            className={`axm-matrix-cell ${
                              isRun ? 'is-running' : isPass ? 'cell-pass' : isFail ? 'cell-fail' : 'cell-pending'
                            } ${isPulse ? 'is-pulse' : ''}`}
                            style={pulsePhase ? { animationDelay: `${pulsePhase}s` } : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="axm-matrix-legend">
              <span className="leg-item"><i className="leg-dot dot-pass" />PASS {trial > 50 ? trial - 18 : 0}</span>
              <span className="leg-item"><i className="leg-dot dot-fail" />FAIL {trial > 50 ? 18 : 0}</span>
              <span className="leg-item"><i className="leg-dot dot-pending" />PENDING {Math.max(0, 720 - trial)}</span>
            </div>
          </div>

          {/* Card 6: HARMONIC FREQUENCY SPECTRUM (Unique Tactical Frequency Scope Style) */}
          <div className="axm-card axm-freq-card">
            <div className="axm-card-label">
              <span>HARMONIC FREQUENCY SPECTRUM</span>
              <b style={{ color: 'var(--axm-ver)' }}>42.0 kHz · PG 16</b>
            </div>
            <div className="axm-spectrogram-strip">
              <div
                className="axm-spectro-cursor"
                style={{
                  left: `${((trial * 7) % 85) + 6}%`,
                }}
              />
            </div>
            <div className="axm-freq-rack" role="img" aria-label="12-band frequency spectrum equalizer">
              {freqBars.map((val, i) => {
                const activeSegs = Math.ceil((val / 100) * 7);
                return (
                  <div key={i} className="axm-freq-col">
                    <div className="axm-freq-meter">
                      {Array.from({ length: 7 }, (_, sIdx) => {
                        const segNum = 7 - sIdx;
                        const isLit = segNum <= activeSegs;
                        const segClass = segNum >= 6 ? 'seg-peak' : segNum >= 4 ? 'seg-mid' : 'seg-low';
                        return (
                          <span
                            key={sIdx}
                            className={`axm-freq-seg ${isLit ? 'is-lit' : ''} ${segClass}`}
                          />
                        );
                      })}
                    </div>
                    <span className="axm-freq-lbl">{FREQ_LABELS[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 7: FAILED FACTS PROBE (Unique Containment Interlock Style) */}
          <div className={`axm-card axm-facts-card ${currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? 'is-alert' : ''}`}>
            <div className="axm-card-label">
              <span>FAILED FACTS PROBE</span>
              {currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? (
                <span className="axm-facts-alert-tag">TRIPPED</span>
              ) : (
                <span className="axm-facts-secure-tag">NOMINAL</span>
              )}
            </div>
            <div className="axm-facts-rack">
              {currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? (
                <>
                  <span className="axm-fact-tag">F-05</span>
                  <span className="axm-fact-tag">F-19</span>
                  <span className="axm-fact-tag">F-20</span>
                  <span className="axm-fact-tag">F-36</span>
                </>
              ) : (
                <span className="axm-facts-nominal-msg">
                  No active invariant violations detected.
                </span>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ---------- Bottom Inspection Deck ---------- */}
      <footer className="axm-info-deck" aria-live="polite">
        <div className="axm-info-header">
          <span
            className="axm-info-id mono"
            style={{ color: selectedAssembly.color }}
          >
            ASSEMBLY {selectedAssembly.id}
          </span>
          <span className="axm-info-title">{selectedAssembly.name}</span>
          <span className="axm-info-tag mono">{selectedAssembly.badge}</span>
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--axm-text-muted)', marginLeft: 'auto' }}
          >
            [{selectedAssembly.fileLocation}]
          </span>
        </div>
        <p className="axm-info-desc">{selectedAssembly.desc}</p>
      </footer>
    </div>
  );
}

export default AxiomAnatomy;
