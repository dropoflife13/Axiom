/**
 * SINGLE SOURCE OF TRUTH for AxiomAnatomyV2.
 * All blocks, ports, cables, packets, labels, floor and exploded offsets
 * are generated from this file. No hand-typed pixel positions anywhere else.
 */

export const ROT_X_DEG = 60;
export const ROT_Z_DEG = -45;
export const TILT_RAD = (ROT_X_DEG * Math.PI) / 180;
export const YAW_RAD = (ROT_Z_DEG * Math.PI) / 180;

// Board dimensions in board units
export const BOARD = {
  w: 1200,
  d: 1200,
} as const;

export const WORK_H = 24; // Height of the shared working plane

export const ORACLE_CENTER = {
  x: BOARD.w / 2,
  y: BOARD.d / 2,
  z: WORK_H,
} as const;

export type AssemblyId =
  | 'oracle'
  | 'task-generator'
  | 'retrieval'
  | 'memory'
  | 'guardrails'
  | 'executor'
  | 'verdict'
  | 'advisor'
  | 'quarantine';

export type LabelSide = 'left' | 'right' | 'up' | 'down';

export interface NodeSpec {
  id: AssemblyId;
  number: string;
  title: string;
  badge: string;
  role: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: string;
  labelSide: LabelSide;
  labelOffset: [number, number]; // [dx, dy] in 2D projected pixels
  explodeOffset: [number, number, number]; // [dx, dy, dz] in 3D board units
}

const R_ORBIT = 430; // Orbit radius giving ~3x footprint spacing
const SAT_SIZE = 110; // Satellite pad size

function orbitPos(deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.round(ORACLE_CENTER.x + R_ORBIT * Math.cos(rad) - SAT_SIZE / 2),
    y: Math.round(ORACLE_CENTER.y + R_ORBIT * Math.sin(rad) - SAT_SIZE / 2),
  };
}

export const NODES: NodeSpec[] = [
  {
    id: 'oracle',
    number: '03',
    title: 'Oracle',
    badge: 'PG 16 DUAL-ROLE',
    role: 'PostgreSQL 16 in a container; fresh database per task; migration runs as role deployer; behavioural checks run as role application.',
    x: ORACLE_CENTER.x - 80,
    y: ORACLE_CENTER.y - 80,
    w: 160,
    d: 160,
    h: WORK_H,
    color: '#22d3ee', // Cyan
    labelSide: 'up',
    labelOffset: [0, -110],
    explodeOffset: [0, 0, 48],
  },
  {
    id: 'task-generator',
    number: '01',
    title: 'Task generator',
    badge: '40 / 40 / 120',
    role: 'Seeded tasks: 40 train, 40 dev, and 120 test tasks.',
    ...orbitPos(202.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#a855f7', // Violet
    labelSide: 'left',
    labelOffset: [-200, 0],
    explodeOffset: [-95, -40, 36],
  },
  {
    id: 'retrieval',
    number: '07',
    title: 'Retrieval',
    badge: 'k=6',
    role: 'Picks the top k=6 lessons by feature-flag overlap before attempt 1.',
    ...orbitPos(247.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#22d3ee', // Cyan
    labelSide: 'up',
    labelOffset: [-80, -90],
    explodeOffset: [-40, -95, 36],
  },
  {
    id: 'memory',
    number: '06',
    title: 'Memory',
    badge: '1 / fact id',
    role: 'Stores the lessons that have earned their place.',
    ...orbitPos(292.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#fbbf24', // Amber
    labelSide: 'up',
    labelOffset: [80, -90],
    explodeOffset: [40, -95, 36],
  },
  {
    id: 'guardrails',
    number: '08',
    title: 'Guardrails',
    badge: 'FAIL-CLOSED',
    role: 'Fails closed on daily budget limits, backs off rate limits, and caches responses.',
    ...orbitPos(337.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#fb7185', // Rose
    labelSide: 'right',
    labelOffset: [200, -20],
    explodeOffset: [95, -40, 36],
  },
  {
    id: 'quarantine',
    number: '09',
    title: 'Quarantine & promotion gate',
    badge: 'HUMAN GATE',
    role: 'Keeps generated rules as candidates until a human promotes them.',
    ...orbitPos(22.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#34d399', // Emerald
    labelSide: 'right',
    labelOffset: [200, 30],
    explodeOffset: [95, 40, 36],
  },
  {
    id: 'advisor',
    number: '05',
    title: 'Advisor',
    badge: 'PASS-GATED',
    role: 'Writes one lesson from a failed verdict only when the retry passes.',
    ...orbitPos(67.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#fbbf24', // Amber
    labelSide: 'down',
    labelOffset: [80, 95],
    explodeOffset: [40, 95, 36],
  },
  {
    id: 'verdict',
    number: '04',
    title: 'Verdict',
    badge: '<fact id>',
    role: 'Reports each failure as a fact ID and one-line statement, never corrected SQL.',
    ...orbitPos(112.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#fb7185', // Rose
    labelSide: 'down',
    labelOffset: [-80, 95],
    explodeOffset: [-40, 95, 36],
  },
  {
    id: 'executor',
    number: '02',
    title: 'Executor',
    badge: 'T=0',
    role: 'An LLM behind an OpenAI-compatible client, temperature 0.',
    ...orbitPos(157.5),
    w: SAT_SIZE,
    d: SAT_SIZE,
    h: WORK_H,
    color: '#a855f7', // Violet
    labelSide: 'left',
    labelOffset: [-200, 40],
    explodeOffset: [-95, 40, 36],
  },
];

export const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<AssemblyId, NodeSpec>;

export interface CableRoute {
  id: string;
  fromId: AssemblyId;
  toId: AssemblyId;
  from: [number, number, number];
  to: [number, number, number];
  d: string;
}

export function getNodePort(node: NodeSpec): [number, number, number] {
  return [node.x + node.w / 2, node.y + node.d / 2, WORK_H];
}

/**
 * Computes a smooth cubic bezier cable path on the working plane.
 * Every cable starts at ORACLE_CENTER and ends at target port.
 */
export function buildCablePath(
  from: [number, number, number],
  to: [number, number, number]
): string {
  const [x1, y1] = [from[0], from[1]];
  const [x2, y2] = [to[0], to[1]];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * 0.16;

  const c1x = Math.round((x1 + dx * 0.32 + nx * bend) * 100) / 100;
  const c1y = Math.round((y1 + dy * 0.32 + ny * bend) * 100) / 100;
  const c2x = Math.round((x2 - dx * 0.32 + nx * bend) * 100) / 100;
  const c2y = Math.round((y2 - dy * 0.32 + ny * bend) * 100) / 100;

  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

export const CABLES: CableRoute[] = NODES.filter((n) => n.id !== 'oracle').map((target) => {
  const from: [number, number, number] = [ORACLE_CENTER.x, ORACLE_CENTER.y, WORK_H];
  const to = getNodePort(target);
  return {
    id: `cable-${target.id}`,
    fromId: 'oracle',
    toId: target.id,
    from,
    to,
    d: buildCablePath(from, to),
  };
});

export const CABLE_MAP = Object.fromEntries(CABLES.map((c) => [c.toId, c])) as Record<
  Exclude<AssemblyId, 'oracle'>,
  CableRoute
>;

export type TrialStage = 'GENERATE' | 'INSPECT' | 'FAIL' | 'TAG' | 'ADVISE' | 'RETRY' | 'PASS';

export interface StageSpec {
  stage: TrialStage;
  label: string;
  nodeId: AssemblyId;
  readout: string;
  activeCableIds: string[];
}

export const STAGES: StageSpec[] = [
  {
    stage: 'GENERATE',
    label: 'Generate',
    nodeId: 'task-generator',
    readout: 'Seeded test task drops into queue · k=6 lessons retrieved from memory · T=0 armed',
    activeCableIds: ['cable-task-generator', 'cable-retrieval'],
  },
  {
    stage: 'INSPECT',
    label: 'Inspect',
    nodeId: 'executor',
    readout: 'Migration SQL deployed to PostgreSQL 16 · role deployer isolation active',
    activeCableIds: ['cable-executor'],
  },
  {
    stage: 'FAIL',
    label: 'Fail',
    nodeId: 'oracle',
    readout: 'Application role query trips hidden rule check · failure verdict triggered',
    activeCableIds: [],
  },
  {
    stage: 'TAG',
    label: 'Tag',
    nodeId: 'verdict',
    readout: 'Verdict reports failure as <fact id>: one-line statement · corrected SQL withheld',
    activeCableIds: ['cable-verdict'],
  },
  {
    stage: 'ADVISE',
    label: 'Advise',
    nodeId: 'advisor',
    readout: 'Advisor drafts candidate lesson from failed verdict · held in quarantine pending retry',
    activeCableIds: ['cable-advisor'],
  },
  {
    stage: 'RETRY',
    label: 'Retry',
    nodeId: 'executor',
    readout: 'Retry attempt re-evaluates migration with advisory against fresh database container',
    activeCableIds: ['cable-executor'],
  },
  {
    stage: 'PASS',
    label: 'Pass',
    nodeId: 'quarantine',
    readout: 'Dual-role check clears · candidate rule promoted through human gate to memory',
    activeCableIds: ['cable-quarantine', 'cable-memory'],
  },
];

export const DESIGN_CONSTANTS = {
  conditions: 6,
  testTasks: 120,
  totalTrials: 720,
  retrievalK: 6,
  splits: '40 / 40 / 120',
  temperature: 0,
  postgresMajor: 16,
  lessonsPerFact: 1,
} as const;

/**
 * Isometric Parallel Projection (No perspective).
 *
 * CSS transform: rotateX(60deg) rotateZ(-45deg).
 * In CSS, a point (u, v) centered at board center undergoes:
 *   X1 = (u + v) / sqrt(2)
 *   Y1 = (v - u) / sqrt(2)
 *   Z1 = z
 * Followed by rotateX(60deg):
 *   X2 = X1 = (u + v) / sqrt(2)
 *   Y2 = Y1 * cos(60deg) - z * sin(60deg) = (v - u) / (2 * sqrt(2)) - z * sin(60deg)
 *
 * Linearity in (x, y, z):
 *   project(0, 0, 0) == (0, 0) when centered.
 *   z axis moves straight up the screen (-sy) by z * sin(60deg) with ZERO horizontal drift (sx = 0).
 */
export function project(
  x: number,
  y: number,
  z: number,
  k = 1,
  cx = ORACLE_CENTER.x,
  cy = ORACLE_CENTER.y
): { sx: number; sy: number } {
  const u = x - cx;
  const v = y - cy;
  const c = Math.SQRT1_2; // 1 / sqrt(2)
  const x1 = (u + v) * c;
  const y1 = (v - u) * c;
  const y2 = y1 * Math.cos(TILT_RAD) - z * Math.sin(TILT_RAD);
  return {
    sx: x1 * k,
    sy: y2 * k,
  };
}
