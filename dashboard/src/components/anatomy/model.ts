import type { Point3 } from "./kit/iso-kit";

export type StationId =
  | "task-generator"
  | "retrieval"
  | "memory"
  | "guardrails"
  | "executor"
  | "oracle"
  | "quarantine"
  | "advisor"
  | "verdict";

export type AccentTone = "violet" | "cyan" | "amber" | "rose" | "emerald";

export type TrialPhaseId =
  | "idle"
  | "generate"
  | "inspect"
  | "fail"
  | "tag"
  | "advise"
  | "retry"
  | "pass";

export interface StationSpec {
  id: StationId;
  number: string;
  title: string;
  shortLabel: string;
  badge: string;
  accent: AccentTone;
  role: string;
  move: Point3;
}

export interface ConditionSpec {
  code: "A" | "B" | "C" | "C0" | "D" | "E_B";
  summary: string;
}

export interface TrialPhaseSpec {
  id: Exclude<TrialPhaseId, "idle">;
  label: string;
  station: StationId;
  accent: AccentTone;
  readout: string;
  summary: string;
}

export const DESIGN_CONSTANTS = {
  conditions: 6,
  testTasks: 120,
  totalTrials: 720,
  retrievalK: 6,
  splits: "40 / 40 / 120",
  temperature: 0,
  postgresMajor: 16,
  lessonsPerFact: 1,
} as const;

export const CONDITIONS: readonly ConditionSpec[] = [
  { code: "A", summary: "no memory, no hints" },
  { code: "B", summary: "all facts in the prompt" },
  { code: "C", summary: "retrieved lessons (k=6)" },
  { code: "C0", summary: "oracle messages verbatim (no Advisor)" },
  { code: "D", summary: "placebo tips" },
  { code: "E_B", summary: "static hints + deterministic auto-fixer" },
] as const;

export const STATIONS: readonly StationSpec[] = [
  {
    id: "task-generator",
    number: "01",
    title: "Task generator",
    shortLabel: "SEED HOPPER",
    badge: "40 / 40 / 120",
    accent: "violet",
    role: "Seeded; 40 train / 40 dev / 120 test tasks.",
    move: [-16, -16, 18],
  },
  {
    id: "retrieval",
    number: "02",
    title: "Retrieval",
    shortLabel: "PICKER k=6",
    badge: "k=6",
    accent: "cyan",
    role: "Picks the top k=6 lessons by feature-flag overlap before attempt 1.",
    move: [-4, -18, 24],
  },
  {
    id: "memory",
    number: "03",
    title: "Memory",
    shortLabel: "LESSON STORE",
    badge: "1 / fact id",
    accent: "amber",
    role: "The lesson store.",
    move: [8, -16, 26],
  },
  {
    id: "guardrails",
    number: "04",
    title: "Guardrails",
    shortLabel: "GOVERNOR VALVE",
    badge: "FAIL-CLOSED",
    accent: "cyan",
    role: "Daily call budget that fails closed, rate-limit backoff, response cache keyed by provider+model+prompt.",
    move: [-18, 4, 24],
  },
  {
    id: "executor",
    number: "05",
    title: "Executor",
    shortLabel: "STAMP T=0",
    badge: "T = 0",
    accent: "violet",
    role: "An LLM behind an OpenAI-compatible client, temperature 0.",
    move: [0, 0, 30],
  },
  {
    id: "oracle",
    number: "06",
    title: "Oracle",
    shortLabel: "PG 16 GATE",
    badge: "PG 16",
    accent: "cyan",
    role: "PostgreSQL 16 in a container; fresh database per task; migration runs as role deployer; behavioural checks run as role application.",
    move: [10, 4, 34],
  },
  {
    id: "quarantine",
    number: "07",
    title: "Quarantine and promotion gate",
    shortLabel: "PROMOTION LOCK",
    badge: "CANDIDATES ONLY",
    accent: "emerald",
    role: "Generated rules are candidates only; a human promotes them.",
    move: [22, -4, 30],
  },
  {
    id: "advisor",
    number: "08",
    title: "Advisor",
    shortLabel: "LESSON PRESS",
    badge: "1 / FACT ID",
    accent: "amber",
    role: "Writes a lesson only from a failed verdict; a lesson is saved only if the retry then passes; one lesson per fact id.",
    move: [-6, 18, 28],
  },
  {
    id: "verdict",
    number: "09",
    title: "Verdict",
    shortLabel: "FAULT PUNCH",
    badge: "<fact id>",
    accent: "rose",
    role: 'Each failure is reported as "<fact id>: one-line statement", never the corrected SQL.',
    move: [14, 18, 32],
  },
] as const;

export const STATION_BY_ID: Record<StationId, StationSpec> = Object.fromEntries(
  STATIONS.map((station) => [station.id, station]),
) as Record<StationId, StationSpec>;

/**
 * Stagger order from front-most/uppermost assemblies to back-most assemblies,
 * ensuring front assemblies lift clear first when taking the machine apart.
 */
export const EXPLODE_ORDER: readonly StationId[] = [
  "verdict",
  "advisor",
  "quarantine",
  "oracle",
  "executor",
  "guardrails",
  "memory",
  "retrieval",
  "task-generator",
] as const;

export const TRIAL_PHASES: readonly TrialPhaseSpec[] = [
  {
    id: "generate",
    label: "1 · generate",
    station: "executor",
    accent: "violet",
    readout: "generate · 40/40/120 hopper feeds blank · k=6 lessons · T=0 stamp",
    summary: "Seeded task blank feeds past the k=6 retrieval comb and Guardrails valve into the T=0 Executor press.",
  },
  {
    id: "inspect",
    label: "2 · inspect",
    station: "oracle",
    accent: "cyan",
    readout: "inspect · PG 16 container · role deployer then role application",
    summary: "Oracle probes the migration in a fresh PostgreSQL 16 database: deployer ram runs DDL, application gauge checks behaviour.",
  },
  {
    id: "fail",
    label: "3 · fail",
    station: "oracle",
    accent: "rose",
    readout: "fail · behavioural gauge trips hidden house rule · shunted to reject",
    summary: "Behavioural gauge pins trip on a hidden house rule; the diverter gate shunts the rejected migration blank off the main rail.",
  },
  {
    id: "tag",
    label: "4 · tag",
    station: "verdict",
    accent: "rose",
    readout: 'tag · Verdict punches "<fact id>: one-line statement" · no SQL fix',
    summary: 'Verdict punches a fault tag carrying "<fact id>: one-line statement" (never the corrected SQL) onto the return shuttle.',
  },
  {
    id: "advise",
    label: "5 · advise",
    station: "advisor",
    accent: "amber",
    readout: "advise · Advisor drafts 1 candidate lesson from failed verdict",
    summary: "Advisor embosses a candidate lesson plate from the failed verdict and holds it at the pass interlock until the retry succeeds.",
  },
  {
    id: "retry",
    label: "6 · retry",
    station: "executor",
    accent: "violet",
    readout: "retry · Executor T=0 re-stamps migration with candidate lesson",
    summary: "The blank returns to the T=0 Executor press with the candidate lesson and re-enters the PG 16 Oracle gate.",
  },
  {
    id: "pass",
    label: "7 · pass",
    station: "quarantine",
    accent: "emerald",
    readout: "pass · retry passes PG 16 · 1 lesson saved · candidate held at gate",
    summary: "Retry passes deployer and application checks: the 1 lesson per fact id is filed in Memory, and the candidate rule waits at the human promotion gate.",
  },
] as const;

export const TRIAL_DURATION = TRIAL_PHASES.length; // 7.0 seconds (1.0s per stage)

export const DEFAULT_READOUT = "6 conditions × 120 test tasks = 720 trials · k=6";

export interface MachineState {
  apart: boolean;
  shares: Record<StationId, number>;
  selectedStation: StationId;
  hoveredStation: StationId | null;
  trialClock: number | null; // null when idle, 0..7 when running/completed
}

export interface TrialSample {
  phase: TrialPhaseId;
  phaseSpec: TrialPhaseSpec | null;
  phaseProgress: number; // 0..1 within current phase
  partPos: Point3; // World position of the moving migration blank
  partTone: AccentTone;
  pickerStroke: number; // 0..1 k=6 picker comb travel
  executorStroke: number; // 0..1 T=0 press ram stroke
  deployerStroke: number; // 0..1 PG 16 deployer ram stroke
  applicationStroke: number; // 0..1 PG 16 application gauge stroke
  dialAngle: number; // radians for Oracle gauge needle
  diverterOpen: number; // 0..1 reject diverter gate
  verdictStroke: number; // 0..1 <fact id> punch stroke
  tagSlide: number; // 0..1 fault tag travel
  advisorStroke: number; // 0..1 lesson embosser stroke
  plateSlide: number; // 0..1 lesson plate filing into Memory
}

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

const pulseDownUp = (t: number, start = 0.15, peak = 0.5, end = 0.85) => {
  if (t <= start || t >= end) return 0;
  if (t <= peak) return smoothstep((t - start) / (peak - start));
  return 1 - smoothstep((t - peak) / (end - peak));
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerp3 = (a: Point3, b: Point3, t: number): Point3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

// Key waypoints on the proving bench rail (world coordinates, sitting at z = 13 on the track)
const WP_HOPPER_EXIT: Point3 = [60, 88, 13];
const WP_EXECUTOR: Point3 = [104, 88, 13];
const WP_ORACLE: Point3 = [176, 88, 13];
const WP_VERDICT: Point3 = [186, 142, 13];
const WP_ADVISOR: Point3 = [116, 142, 13];
const WP_RETURN_TURN: Point3 = [82, 142, 13];
const WP_PASS_ANVIL: Point3 = [256, 142, 13];

export function sampleTrial(trialClock: number | null): TrialSample {
  if (trialClock === null || trialClock < 0) {
    return {
      phase: "idle",
      phaseSpec: null,
      phaseProgress: 0,
      partPos: WP_EXECUTOR,
      partTone: "violet",
      pickerStroke: 0,
      executorStroke: 0,
      deployerStroke: 0,
      applicationStroke: 0,
      dialAngle: -0.55,
      diverterOpen: 0,
      verdictStroke: 0,
      tagSlide: 0,
      advisorStroke: 0,
      plateSlide: 0,
    };
  }

  const clamped = Math.max(0, Math.min(TRIAL_DURATION - 1e-6, trialClock));
  const index = Math.min(TRIAL_PHASES.length - 1, Math.floor(clamped));
  const u = smoothstep(clamped - index);
  const rawU = clamped - index;
  const phaseSpec = TRIAL_PHASES[index]!;

  switch (phaseSpec.id) {
    case "generate":
      return {
        phase: "generate",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_HOPPER_EXIT, WP_EXECUTOR, u),
        partTone: "violet",
        pickerStroke: pulseDownUp(rawU, 0.05, 0.4, 0.85),
        executorStroke: pulseDownUp(rawU, 0.45, 0.72, 0.96),
        deployerStroke: 0,
        applicationStroke: 0,
        dialAngle: -0.55,
        diverterOpen: 0,
        verdictStroke: 0,
        tagSlide: 0,
        advisorStroke: 0,
        plateSlide: 0,
      };
    case "inspect":
      return {
        phase: "inspect",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_EXECUTOR, WP_ORACLE, smoothstep(rawU / 0.45)),
        partTone: "cyan",
        pickerStroke: 0,
        executorStroke: 0,
        deployerStroke: pulseDownUp(rawU, 0.35, 0.55, 0.78),
        applicationStroke: pulseDownUp(rawU, 0.58, 0.8, 0.98),
        dialAngle: lerp(-0.55, 0.35, smoothstep((rawU - 0.4) / 0.55)),
        diverterOpen: 0,
        verdictStroke: 0,
        tagSlide: 0,
        advisorStroke: 0,
        plateSlide: 0,
      };
    case "fail":
      return {
        phase: "fail",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_ORACLE, WP_VERDICT, smoothstep((rawU - 0.2) / 0.8)),
        partTone: "rose",
        pickerStroke: 0,
        executorStroke: 0,
        deployerStroke: 0,
        applicationStroke: pulseDownUp(rawU, 0.0, 0.2, 0.45),
        dialAngle: lerp(0.35, 1.05, smoothstep(rawU / 0.35)),
        diverterOpen: smoothstep(rawU / 0.4),
        verdictStroke: 0,
        tagSlide: 0,
        advisorStroke: 0,
        plateSlide: 0,
      };
    case "tag":
      return {
        phase: "tag",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_VERDICT, WP_ADVISOR, smoothstep((rawU - 0.35) / 0.65)),
        partTone: "rose",
        pickerStroke: 0,
        executorStroke: 0,
        deployerStroke: 0,
        applicationStroke: 0,
        dialAngle: 0.95,
        diverterOpen: 1 - smoothstep(rawU / 0.6),
        verdictStroke: pulseDownUp(rawU, 0.08, 0.32, 0.62),
        tagSlide: smoothstep((rawU - 0.25) / 0.7),
        advisorStroke: 0,
        plateSlide: 0,
      };
    case "advise":
      return {
        phase: "advise",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_ADVISOR, WP_RETURN_TURN, smoothstep((rawU - 0.4) / 0.6)),
        partTone: "amber",
        pickerStroke: 0,
        executorStroke: 0,
        deployerStroke: 0,
        applicationStroke: 0,
        dialAngle: lerp(0.95, -0.35, u),
        diverterOpen: 0,
        verdictStroke: 0,
        tagSlide: 1,
        advisorStroke: pulseDownUp(rawU, 0.12, 0.45, 0.82),
        plateSlide: 0.35 * smoothstep((rawU - 0.3) / 0.6),
      };
    case "retry": {
      const toExec = rawU < 0.45 ? lerp3(WP_RETURN_TURN, WP_EXECUTOR, smoothstep(rawU / 0.45)) : lerp3(WP_EXECUTOR, WP_ORACLE, smoothstep((rawU - 0.45) / 0.55));
      return {
        phase: "retry",
        phaseSpec,
        phaseProgress: rawU,
        partPos: toExec,
        partTone: "violet",
        pickerStroke: pulseDownUp(rawU, 0.05, 0.25, 0.5),
        executorStroke: pulseDownUp(rawU, 0.32, 0.5, 0.7),
        deployerStroke: pulseDownUp(rawU, 0.68, 0.84, 0.98),
        applicationStroke: 0,
        dialAngle: -0.25,
        diverterOpen: 0,
        verdictStroke: 0,
        tagSlide: 1 - smoothstep(rawU / 0.5),
        advisorStroke: 0,
        plateSlide: 0.35,
      };
    }
    case "pass":
      return {
        phase: "pass",
        phaseSpec,
        phaseProgress: rawU,
        partPos: lerp3(WP_ORACLE, WP_PASS_ANVIL, smoothstep((rawU - 0.2) / 0.75)),
        partTone: "emerald",
        pickerStroke: 0,
        executorStroke: 0,
        deployerStroke: 0,
        applicationStroke: pulseDownUp(rawU, 0.0, 0.2, 0.45),
        dialAngle: lerp(-0.25, -0.85, smoothstep(rawU / 0.4)),
        diverterOpen: 0,
        verdictStroke: 0,
        tagSlide: 0,
        advisorStroke: 0,
        plateSlide: lerp(0.35, 1, smoothstep((rawU - 0.15) / 0.75)),
      };
  }
}

export function readoutForState(state: MachineState, sample: TrialSample): string {
  if (sample.phaseSpec) return sample.phaseSpec.readout;
  const activeId = state.hoveredStation ?? state.selectedStation;
  const station = STATION_BY_ID[activeId];
  if (state.apart) {
    return `exploded view · ${station.number} ${station.title.toUpperCase()} (${station.badge}) · 6 × 120 = 720 trials`;
  }
  return `${station.number} ${station.title} · ${station.badge} · 6 conditions × 120 test tasks = 720 trials`;
}
