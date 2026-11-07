import {
  iso,
  lineOnTop,
  planOutline,
  sideSeam,
  slabOf,
  translateAlong,
  type Flat,
  type Plan,
  type Point3,
  type SolidPaths,
} from "./kit/iso-kit";
import {
  readoutForState,
  sampleTrial,
  STATIONS,
  type AccentTone,
  type MachineState,
  type StationId,
  type TrialSample,
} from "./model";
import { P } from "./view";

export interface DynamicFrame {
  stationTransforms: Record<StationId, string>;
  pickerTransform: string;
  executorRamTransform: string;
  deployerRamTransform: string;
  verdictPunchTransform: string;
  advisorPressTransform: string;
  oracleNeedlePath: string;
  oraclePivotDot: Flat;
  oracleNeedleTone: "lit" | "red" | "green";
  blankPaths: SolidPaths;
  blankSeam: string;
  blankSlot: string;
  blankDot: Flat;
  blankTone: AccentTone;
  faultTagPaths: SolidPaths | null;
  faultTagOutline: string;
  lessonPlatePaths: SolidPaths | null;
  readout: string;
  sample: TrialSample;
}

const mul3 = ([x, y, z]: Point3, s: number): Point3 => [x * s, y * s, z * s];

export function frameOf(state: MachineState): DynamicFrame {
  const sample = sampleTrial(state.trialClock);

  const stationTransforms = Object.fromEntries(
    STATIONS.map((station) => {
      const share = state.shares[station.id] ?? 0;
      const offset = mul3(station.move, share);
      return [station.id, share === 0 ? "" : translateAlong(P, offset)];
    }),
  ) as Record<StationId, string>;

  const pickerTransform =
    sample.pickerStroke > 1e-3 ? translateAlong(P, [0, sample.pickerStroke * 3.2, 0]) : "";
  const executorRamTransform =
    sample.executorStroke > 1e-3 ? translateAlong(P, [0, 0, -sample.executorStroke * 4.2]) : "";
  const deployerRamTransform =
    sample.deployerStroke > 1e-3 ? translateAlong(P, [0, 0, -sample.deployerStroke * 4.2]) : "";
  const verdictPunchTransform =
    sample.verdictStroke > 1e-3 ? translateAlong(P, [0, 0, -sample.verdictStroke * 4.2]) : "";
  const advisorPressTransform =
    sample.advisorStroke > 1e-3 ? translateAlong(P, [0, 0, -sample.advisorStroke * 4.2]) : "";

  // Oracle application behavioural gauge needle at (190, 88, z = 46)
  const sx = Math.sin(sample.dialAngle);
  const sy = -Math.cos(sample.dialAngle);
  const oracleNeedlePath = lineOnTop(
    [190 - sx * 1.6, 88 - sy * 1.6],
    [190 + sx * 6.8, 88 + sy * 6.8],
    46,
    P,
  );
  const oraclePivotDot = iso([190, 88, 46], P);
  const oracleNeedleTone: "lit" | "red" | "green" =
    sample.phase === "fail" || sample.phase === "tag"
      ? "red"
      : sample.phase === "pass"
        ? "green"
        : "lit";

  // Moving migration trial blank on the track
  const [bx, by, bz] = sample.partPos;
  const blankPlan: Plan = { x: bx - 6, y: by - 3.5, w: 12, d: 7, r: 1.2 };
  const blankPaths = slabOf(blankPlan, bz, 3.2, P, 6, 0.25);
  const blankSeam = sideSeam(blankPlan, bz + 1.6, P);
  const blankSlot = planOutline({ x: bx - 4, y: by - 1.8, w: 8, d: 3.6, r: 0.5 }, bz + 3.2, P);
  const blankDot = iso([bx, by, bz + 3.2], P);

  // Fault tag ("<fact id>: one-line statement") punched during tag / advise / retry
  let faultTagPaths: SolidPaths | null = null;
  let faultTagOutline = "";
  if (sample.tagSlide > 0.02) {
    const tx = 170 - sample.tagSlide * 42;
    const ty = 144;
    const tagPlan: Plan = { x: tx - 5, y: ty - 2.5, w: 10, d: 5, r: 0.8 };
    faultTagPaths = slabOf(tagPlan, 17.2, 1.6, P, 4, 0.15);
    faultTagOutline = planOutline({ x: tx - 3.5, y: ty - 1.2, w: 7, d: 2.4, r: 0.4 }, 18.8, P);
  }

  // Candidate lesson plate ("1 lesson / fact id") embossed at Advisor and filed into Memory on pass
  let lessonPlatePaths: SolidPaths | null = null;
  if (sample.plateSlide > 0.02) {
    const px = 124 + sample.plateSlide * 71;
    const py = 144 - sample.plateSlide * 116;
    const pz = 18 + Math.sin(sample.plateSlide * Math.PI) * 14;
    const platePlan: Plan = { x: px - 2, y: py - 8, w: 4, d: 16, r: 0.6 };
    lessonPlatePaths = slabOf(platePlan, pz, 6, P, 4, 0.15);
  }

  return {
    stationTransforms,
    pickerTransform,
    executorRamTransform,
    deployerRamTransform,
    verdictPunchTransform,
    advisorPressTransform,
    oracleNeedlePath,
    oraclePivotDot,
    oracleNeedleTone,
    blankPaths,
    blankSeam,
    blankSlot,
    blankDot,
    blankTone: sample.partTone,
    faultTagPaths,
    faultTagOutline,
    lessonPlatePaths,
    readout: readoutForState(state, sample),
    sample,
  };
}
