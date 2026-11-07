import {
  cylinder,
  dotGrid,
  haloOf,
  insetPlan,
  iso,
  knurl,
  planOutline,
  radialTicks,
  ring,
  sideArc,
  sideMatrix,
  sideSeam,
  slabOf,
  topMatrix,
  topTicks,
  type Flat,
  type Plan,
  type SolidPaths,
  type Ticks,
} from "./kit/iso-kit";
import type { StationId } from "./model";
import { BED_PLAN, P, Z_BED_BOTTOM, Z_BED_TOP, Z_GROUND, Z_RAIL_TOP } from "./view";

export interface SlabPiece {
  id: string;
  plan: Plan;
  z: number;
  h: number;
  paths: SolidPaths;
  seam?: string;
  tone?: "hi" | "mid" | "lo";
  lit?: boolean;
  halo?: boolean;
}

export interface CylinderPiece {
  id: string;
  cx: number;
  cy: number;
  r: number;
  z: number;
  h: number;
  paths: SolidPaths;
  seam?: string;
  knurl?: string;
  topRing?: string;
  tone?: "hi" | "mid" | "lo";
  lit?: boolean;
}

function makeSlab(
  id: string,
  plan: Plan,
  z: number,
  h: number,
  options: {
    bevel?: number;
    seamAt?: number;
    tone?: "hi" | "mid" | "lo";
    lit?: boolean;
    halo?: boolean;
  } = {},
): SlabPiece {
  return {
    id,
    plan,
    z,
    h,
    paths: slabOf(plan, z, h, P, 8, options.bevel ?? 0.5),
    seam: options.seamAt !== undefined ? sideSeam(plan, z + h * options.seamAt, P) : undefined,
    tone: options.tone ?? "hi",
    lit: options.lit ?? false,
    halo: options.halo ?? false,
  };
}

function makeCyl(
  id: string,
  cx: number,
  cy: number,
  r: number,
  z: number,
  h: number,
  options: {
    bevel?: number;
    seamAt?: number;
    knurlCount?: number;
    topRingRatio?: number;
    tone?: "hi" | "mid" | "lo";
    lit?: boolean;
  } = {},
): CylinderPiece {
  return {
    id,
    cx,
    cy,
    r,
    z,
    h,
    paths: cylinder(cx, cy, r, z, h, P, 32, options.bevel ?? 0.35),
    seam: options.seamAt !== undefined ? sideArc(cx, cy, r, z + h * options.seamAt, P) : undefined,
    knurl: options.knurlCount ? knurl(cx, cy, r, z, z + h, options.knurlCount, P, 0) : undefined,
    topRing: options.topRingRatio ? ring(cx, cy, r * options.topRingRatio, z + h, P) : undefined,
    tone: options.tone ?? "hi",
    lit: options.lit ?? false,
  };
}

// ---------------------------------------------------------------------------
// 1. STAND (Fixed bedplate, feet, guideways, 6-condition bar, pass anvil)
// ---------------------------------------------------------------------------
export const STAND_FEET: SlabPiece[] = [
  makeSlab("footNW", { x: 8, y: 8, w: 22, d: 22, r: 4 }, Z_GROUND, Z_BED_BOTTOM, { tone: "lo", bevel: 0 }),
  makeSlab("footNE", { x: 270, y: 8, w: 22, d: 22, r: 4 }, Z_GROUND, Z_BED_BOTTOM, { tone: "lo", bevel: 0 }),
  makeSlab("footSW", { x: 8, y: 154, w: 22, d: 22, r: 4 }, Z_GROUND, Z_BED_BOTTOM, { tone: "lo", bevel: 0 }),
  makeSlab("footSE", { x: 270, y: 154, w: 22, d: 22, r: 4 }, Z_GROUND, Z_BED_BOTTOM, { tone: "lo", bevel: 0 }),
];

export const STAND_BED = makeSlab("bed", BED_PLAN, Z_BED_BOTTOM, Z_BED_TOP - Z_BED_BOTTOM, {
  bevel: 0.9,
  seamAt: 0.45,
  tone: "hi",
  halo: true,
});

export const STAND_BED_INSET = planOutline(insetPlan(BED_PLAN, 4), Z_BED_TOP, P);
export const STAND_BED_DOTS: Flat[] = dotGrid(66, 62, 16, 6, 9, Z_BED_TOP, P);

const BED_SCALE_PLAN: Plan = { x: 68, y: 175, w: 148, d: 4, r: 0.5 };
export const BED_SCALE_OUTLINE = planOutline(BED_SCALE_PLAN, Z_BED_TOP, P);
export const BED_SCALE_TICKS: Ticks = topTicks(72, 212, 4, 5, 175, Z_BED_TOP, [1.2, 2.2], P, "x");

export const STAND_RAILS: SlabPiece[] = [
  makeSlab("railMain", { x: 64, y: 82, w: 156, d: 12, r: 2 }, Z_BED_TOP, Z_RAIL_TOP - Z_BED_TOP, {
    tone: "mid",
    bevel: 0.3,
  }),
  makeSlab("railLeft", { x: 64, y: 98, w: 10, d: 34, r: 1.5 }, Z_BED_TOP, Z_RAIL_TOP - Z_BED_TOP, {
    tone: "mid",
    bevel: 0.25,
  }),
  makeSlab("railRight", { x: 210, y: 98, w: 10, d: 34, r: 1.5 }, Z_BED_TOP, Z_RAIL_TOP - Z_BED_TOP, {
    tone: "mid",
    bevel: 0.25,
  }),
  makeSlab("railReturn", { x: 80, y: 136, w: 140, d: 12, r: 2 }, Z_BED_TOP, Z_RAIL_TOP - Z_BED_TOP, {
    tone: "mid",
    bevel: 0.3,
  }),
];

export const MAIN_RAIL_GROOVE = planOutline({ x: 68, y: 85, w: 148, d: 6, r: 1 }, Z_RAIL_TOP, P);
export const RETURN_RAIL_GROOVE = planOutline({ x: 84, y: 139, w: 132, d: 6, r: 1 }, Z_RAIL_TOP, P);

// 6-Condition Selector Bar (6 conditions x 120 test tasks = 720 trials)
export const COND_BASE = makeSlab("condBase", { x: 10, y: 132, w: 52, d: 40, r: 3 }, Z_BED_TOP, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  tone: "hi",
});

export const COND_STOPS: Array<{ code: string; piece: CylinderPiece; labelMatrix: string }> = [
  { code: "A", cx: 20, cy: 142 },
  { code: "B", cx: 36, cy: 142 },
  { code: "C", cx: 52, cy: 142 },
  { code: "C0", cx: 20, cy: 156 },
  { code: "D", cx: 36, cy: 156 },
  { code: "E_B", cx: 52, cy: 156 },
].map(({ code, cx, cy }) => ({
  code,
  piece: makeCyl(`cond${code}`, cx, cy, 2.8, 15, 5, {
    bevel: 0.25,
    topRingRatio: 0.58,
    lit: code === "C",
  }),
  labelMatrix: topMatrix([cx, cy + 5.2], 15, P, "x"),
}));

export const COND_TEXT_MATRIX = topMatrix([14, 168], 15, P, "x");
export const COND_FRONT_MATRIX = sideMatrix([14, 172], 13.8, P, "left");

// Pass Discharge Anvil (front-right)
export const PASS_BASE = makeSlab("passBase", { x: 238, y: 126, w: 50, d: 46, r: 3 }, Z_BED_TOP, 5, {
  bevel: 0.5,
  seamAt: 0.5,
});
export const PASS_PLATEN = makeSlab("passPlaten", { x: 244, y: 132, w: 38, d: 28, r: 2 }, 15, 4, {
  bevel: 0.4,
  lit: true,
});
export const PASS_POST = makeCyl("passPost", 263, 146, 5.5, 19, 6, {
  knurlCount: 14,
  topRingRatio: 0.62,
});
export const PASS_TEXT_MATRIX = topMatrix([247, 166], 15, P, "x");

// ---------------------------------------------------------------------------
// 2. STATION 01: TASK GENERATOR (Seeded; 40 train / 40 dev / 120 test)
// ---------------------------------------------------------------------------
export const TG_BASE = makeSlab("tg.base", { x: 10, y: 10, w: 50, d: 46, r: 3 }, 10, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  halo: true,
});
export const TG_MANIFOLD = makeSlab("tg.manifold", { x: 14, y: 14, w: 42, d: 22, r: 2 }, 15, 5, {
  bevel: 0.4,
});
export const TG_HOPPERS: Array<{ label: string; piece: SlabPiece; slotOutline: string; textMatrix: string }> = [
  { label: "40", x: 16, h: 10, lit: false },
  { label: "40", x: 30, h: 10, lit: false },
  { label: "120", x: 44, h: 14, lit: true },
].map(({ label, x, h, lit }, idx) => {
  const plan: Plan = { x, y: 16, w: 10, d: 16, r: 1.5 };
  return {
    label,
    piece: makeSlab(`tg.hopper${idx}`, plan, 20, h, { bevel: 0.35, seamAt: 0.5, lit }),
    slotOutline: planOutline(insetPlan(plan, 1.8), 20 + h, P),
    textMatrix: topMatrix([x + 5, 25], 20 + h, P, "x"),
  };
});
export const TG_SEED_DRUM = makeCyl("tg.seedDrum", 35, 45, 6.5, 15, 9, {
  knurlCount: 16,
  topRingRatio: 0.6,
});
export const TG_TEXT_MATRIX = topMatrix([14, 52], 15, P, "x");
export const TG_HALO = haloOf({ x: 10, y: 10, w: 50, d: 46, r: 3 }, 10, 24, P);

// ---------------------------------------------------------------------------
// 3. STATION 02: RETRIEVAL (Top k=6 lessons by feature-flag overlap)
// ---------------------------------------------------------------------------
export const RET_BASE = makeSlab("ret.base", { x: 76, y: 10, w: 56, d: 46, r: 3 }, 10, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  halo: true,
});
export const RET_RACK = makeSlab("ret.rack", { x: 82, y: 14, w: 44, d: 20, r: 2 }, 15, 6, {
  bevel: 0.4,
});
export const RET_COMB = makeSlab("ret.comb", { x: 86, y: 18, w: 36, d: 12, r: 1.5 }, 21, 6, {
  bevel: 0.35,
  lit: true,
});
const RET_SCALE_PLAN: Plan = { x: 88, y: 20, w: 32, d: 8, r: 0.8 };
export const RET_SCALE_OUTLINE = planOutline(RET_SCALE_PLAN, 27, P);
export const RET_SCALE_TICKS: Ticks = topTicks(91, 116, 5, 5, 20, 27, [1.5, 2.5], P, "x");
export const RET_POST_L = makeCyl("ret.postL", 86, 44, 4, 15, 14, { seamAt: 0.5 });
export const RET_POST_R = makeCyl("ret.postR", 122, 44, 4, 15, 14, { seamAt: 0.5 });
export const RET_BEAM = makeSlab("ret.beam", { x: 80, y: 39, w: 48, d: 10, r: 2 }, 29, 5, {
  bevel: 0.4,
  lit: true,
});
export const RET_TEXT_MATRIX = topMatrix([86, 45], 34, P, "x");
export const RET_HALO = haloOf({ x: 76, y: 10, w: 56, d: 46, r: 3 }, 10, 24, P);

// ---------------------------------------------------------------------------
// 4. STATION 03: MEMORY (The lesson store; k=6 indexed plates)
// ---------------------------------------------------------------------------
export const MEM_BASE = makeSlab("mem.base", { x: 148, y: 10, w: 60, d: 46, r: 3 }, 10, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  halo: true,
});
export const MEM_TRAY = makeSlab("mem.tray", { x: 152, y: 14, w: 52, d: 26, r: 2 }, 15, 5, {
  bevel: 0.4,
});
export const MEM_PLATES: SlabPiece[] = [155, 163, 171, 179, 187, 195].map((x, idx) =>
  makeSlab(
    `mem.plate${idx + 1}`,
    { x, y: 17, w: 4, d: 20, r: 0.8 },
    20,
    idx === 5 ? 11 : 9,
    { bevel: 0.2, lit: idx === 5 },
  ),
);
export const MEM_CAP = makeCyl("mem.cap", 178, 47, 4.5, 15, 7, {
  knurlCount: 12,
  topRingRatio: 0.55,
});
export const MEM_TEXT_MATRIX = topMatrix([152, 51], 15, P, "x");
export const MEM_HALO = haloOf({ x: 148, y: 10, w: 60, d: 46, r: 3 }, 10, 21, P);

// ---------------------------------------------------------------------------
// 5. STATION 04: GUARDRAILS (Budget fails closed, backoff, cache)
// ---------------------------------------------------------------------------
export const GR_BASE = makeSlab("gr.base", { x: 10, y: 68, w: 50, d: 50, r: 3 }, 10, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  halo: true,
});
export const GR_MANIFOLD = makeSlab("gr.manifold", { x: 14, y: 72, w: 42, d: 24, r: 2 }, 15, 6, {
  bevel: 0.4,
});
export const GR_BUDGET_VALVE = makeCyl("gr.budgetValve", 25, 84, 6.5, 21, 10, {
  seamAt: 0.5,
});
export const GR_BUDGET_CAP = makeCyl("gr.budgetCap", 25, 84, 8, 31, 3.5, {
  knurlCount: 16,
  topRingRatio: 0.55,
  lit: true,
});
export const GR_BACKOFF_POT = makeCyl("gr.backoffPot", 45, 84, 5.5, 21, 8, {
  seamAt: 0.5,
  topRingRatio: 0.6,
});
export const GR_CACHE_BLOCK = makeSlab("gr.cacheBlock", { x: 16, y: 100, w: 38, d: 14, r: 1.5 }, 15, 6, {
  bevel: 0.35,
});
export const GR_CACHE_OUTLINE = planOutline({ x: 18, y: 102, w: 34, d: 10, r: 0.8 }, 21, P);
export const GR_CACHE_TICKS = topTicks(24, 46, 11, 1, 102, 21, [1.5, 2.2], P, "x");
export const GR_TEXT_MATRIX = topMatrix([19, 109], 21, P, "x");
export const GR_HALO = haloOf({ x: 10, y: 68, w: 50, d: 50, r: 3 }, 10, 24, P);

// ---------------------------------------------------------------------------
// 6. STATION 05: EXECUTOR (OpenAI-compatible client, temperature 0)
// ---------------------------------------------------------------------------
export const EX_PIER_BACK = makeSlab("ex.pierBack", { x: 80, y: 64, w: 48, d: 14, r: 2.5 }, 10, 18, {
  bevel: 0.4,
  seamAt: 0.5,
});
export const EX_PIER_FRONT = makeSlab("ex.pierFront", { x: 80, y: 98, w: 48, d: 14, r: 2.5 }, 10, 18, {
  bevel: 0.4,
  seamAt: 0.5,
});
export const EX_ANVIL = makeSlab("ex.anvil", { x: 88, y: 83, w: 32, d: 10, r: 1.5 }, 13, 4, {
  bevel: 0.3,
});
export const EX_CROWN = makeSlab("ex.crown", { x: 78, y: 62, w: 52, d: 52, r: 3 }, 28, 7, {
  bevel: 0.6,
  seamAt: 0.5,
  lit: true,
  halo: true,
});
export const EX_TURRET = makeCyl("ex.turret", 104, 88, 9, 35, 9, {
  knurlCount: 18,
  seamAt: 0.5,
});
export const EX_CAP = makeCyl("ex.cap", 104, 88, 6.5, 44, 4, {
  topRingRatio: 0.58,
  lit: true,
});
export const EX_TEXT_MATRIX = topMatrix([82, 108], 35, P, "x");
export const EX_SIDE_MATRIX = sideMatrix([82, 114], 32.5, P, "left");
export const EX_HALO = haloOf({ x: 78, y: 62, w: 52, d: 52, r: 3 }, 10, 38, P);

// ---------------------------------------------------------------------------
// 7. STATION 06: ORACLE (PostgreSQL 16; deployer + application checks)
// ---------------------------------------------------------------------------
export const OR_PIER_BACK = makeSlab("or.pierBack", { x: 150, y: 64, w: 54, d: 14, r: 2.5 }, 10, 20, {
  bevel: 0.4,
  seamAt: 0.5,
});
export const OR_PIER_FRONT = makeSlab("or.pierFront", { x: 150, y: 98, w: 54, d: 14, r: 2.5 }, 10, 20, {
  bevel: 0.4,
  seamAt: 0.5,
});
export const OR_CRADLE = makeSlab("or.cradle", { x: 158, y: 83, w: 38, d: 10, r: 1.5 }, 13, 4, {
  bevel: 0.3,
});
export const OR_DECK = makeSlab("or.deck", { x: 148, y: 62, w: 58, d: 52, r: 3 }, 30, 7, {
  bevel: 0.6,
  seamAt: 0.5,
  lit: true,
  halo: true,
});
export const OR_DEPLOYER_RAM = makeCyl("or.deployerRam", 164, 88, 7, 37, 10, {
  seamAt: 0.5,
  knurlCount: 14,
});
export const OR_DEPLOYER_CAP = makeCyl("or.deployerCap", 164, 88, 5, 47, 3.5, {
  topRingRatio: 0.55,
  lit: true,
});
export const OR_APP_GAUGE = makeCyl("or.appGauge", 190, 88, 9.5, 37, 9, {
  seamAt: 0.45,
  lit: true,
});
export const OR_DIAL_OUTER = ring(190, 88, 7.8, 46, P);
export const OR_DIAL_INNER = ring(190, 88, 1.8, 46, P);
export const OR_DIAL_TICKS: Ticks = radialTicks(190, 88, 7.8, 24, 6, 46, [1.0, 1.8], P);
export const OR_TEXT_MATRIX = topMatrix([152, 108], 37, P, "x");
export const OR_SIDE_MATRIX = sideMatrix([152, 114], 34.5, P, "left");
export const OR_HALO = haloOf({ x: 148, y: 62, w: 58, d: 52, r: 3 }, 10, 40, P);

// ---------------------------------------------------------------------------
// 8. STATION 07: QUARANTINE & PROMOTION GATE (Candidates only; human promotes)
// ---------------------------------------------------------------------------
export const QU_BASE = makeSlab("qu.base", { x: 226, y: 14, w: 62, d: 90, r: 3.5 }, 10, 5, {
  bevel: 0.5,
  seamAt: 0.5,
  halo: true,
});
export const QU_BIN = makeSlab("qu.bin", { x: 232, y: 20, w: 50, d: 24, r: 2 }, 15, 8, {
  bevel: 0.4,
});
export const QU_CANDIDATE_1 = makeSlab("qu.candidate1", { x: 236, y: 24, w: 18, d: 14, r: 1.5 }, 23, 4, {
  bevel: 0.25,
});
export const QU_CANDIDATE_2 = makeSlab("qu.candidate2", { x: 258, y: 24, w: 18, d: 14, r: 1.5 }, 23, 4, {
  bevel: 0.25,
  lit: true,
});
export const QU_GATE_WALL = makeSlab("qu.gateWall", { x: 230, y: 50, w: 54, d: 12, r: 2 }, 15, 14, {
  bevel: 0.5,
  seamAt: 0.5,
  lit: true,
});
export const QU_LOCK_CYL = makeCyl("qu.lockCyl", 257, 56, 5.5, 29, 6, {
  knurlCount: 14,
  topRingRatio: 0.55,
});
export const QU_SHELF = makeSlab("qu.shelf", { x: 232, y: 68, w: 50, d: 28, r: 2 }, 15, 5, {
  bevel: 0.4,
});
export const QU_SHELF_INSET = planOutline(insetPlan({ x: 232, y: 68, w: 50, d: 28, r: 2 }, 3), 20, P);
export const QU_TEXT_MATRIX = topMatrix([236, 91], 20, P, "x");
export const QU_GATE_MATRIX = topMatrix([234, 59], 29, P, "x");
export const QU_HALO = haloOf({ x: 226, y: 14, w: 62, d: 90, r: 3.5 }, 10, 25, P);

// ---------------------------------------------------------------------------
// 9. STATION 08: ADVISOR (1 lesson per fact id; saved only if retry passes)
// ---------------------------------------------------------------------------
export const AD_PIER_BACK = makeSlab("ad.pierBack", { x: 84, y: 120, w: 54, d: 12, r: 2 }, 10, 14, {
  bevel: 0.35,
  seamAt: 0.5,
});
export const AD_PIER_FRONT = makeSlab("ad.pierFront", { x: 84, y: 152, w: 54, d: 18, r: 2 }, 10, 14, {
  bevel: 0.35,
  seamAt: 0.5,
});
export const AD_ANVIL = makeSlab("ad.anvil", { x: 92, y: 137, w: 38, d: 10, r: 1.5 }, 13, 4, {
  bevel: 0.3,
});
export const AD_BRIDGE = makeSlab("ad.bridge", { x: 82, y: 118, w: 58, d: 54, r: 3 }, 24, 6, {
  bevel: 0.5,
  seamAt: 0.5,
  lit: true,
  halo: true,
});
export const AD_INTERLOCK = makeCyl("ad.interlock", 98, 144, 6.5, 30, 8, {
  seamAt: 0.5,
  topRingRatio: 0.58,
});
export const AD_EMBOSSER = makeCyl("ad.embosser", 124, 144, 8, 30, 10, {
  knurlCount: 16,
  topRingRatio: 0.62,
  lit: true,
});
export const AD_TEXT_MATRIX = topMatrix([86, 166], 30, P, "x");
export const AD_HALO = haloOf({ x: 82, y: 118, w: 58, d: 54, r: 3 }, 10, 30, P);

// ---------------------------------------------------------------------------
// 10. STATION 09: VERDICT ("<fact id>: one-line statement", never SQL)
// ---------------------------------------------------------------------------
export const VE_PIER_BACK = makeSlab("ve.pierBack", { x: 154, y: 120, w: 50, d: 12, r: 2 }, 10, 14, {
  bevel: 0.35,
  seamAt: 0.5,
});
export const VE_PIER_FRONT = makeSlab("ve.pierFront", { x: 154, y: 152, w: 50, d: 18, r: 2 }, 10, 14, {
  bevel: 0.35,
  seamAt: 0.5,
});
export const VE_CHUTE = makeSlab("ve.chute", { x: 160, y: 137, w: 38, d: 10, r: 1.5 }, 13, 4, {
  bevel: 0.3,
});
export const VE_BRIDGE = makeSlab("ve.bridge", { x: 152, y: 118, w: 54, d: 54, r: 3 }, 24, 6, {
  bevel: 0.5,
  seamAt: 0.5,
  lit: true,
  halo: true,
});
export const VE_PUNCH = makeCyl("ve.punch", 170, 144, 7.5, 30, 10, {
  knurlCount: 16,
  topRingRatio: 0.58,
  lit: true,
});
export const VE_TAG_TRAY = makeSlab("ve.tagTray", { x: 184, y: 132, w: 18, d: 24, r: 1.5 }, 30, 4, {
  bevel: 0.25,
});
export const VE_TAG_OUTLINE = planOutline({ x: 186, y: 135, w: 14, d: 18, r: 0.8 }, 34, P);
export const VE_TEXT_MATRIX = topMatrix([156, 166], 30, P, "x");
export const VE_HALO = haloOf({ x: 152, y: 118, w: 54, d: 54, r: 3 }, 10, 30, P);

// ---------------------------------------------------------------------------
// 11. SIGNAL WIRES ON THE BEDPLATE (rooted with ends="both")
// ---------------------------------------------------------------------------
export const BED_WIRES: Array<{
  id: string;
  from: Flat;
  to: Flat;
  via: Flat[];
  tone: "lo" | "mid" | "blue" | "green" | "red";
  dashed?: boolean;
  flow?: boolean;
}> = [
  {
    id: "wire.seedToGuard",
    from: iso([35, 56, 10], P),
    via: [iso([35, 62, 10], P)],
    to: iso([35, 68, 10], P),
    tone: "mid",
    flow: true,
  },
  {
    id: "wire.memToRet",
    from: iso([148, 30, 10], P),
    via: [iso([140, 30, 10], P)],
    to: iso([132, 30, 10], P),
    tone: "blue",
    flow: true,
  },
  {
    id: "wire.retToExec",
    from: iso([104, 56, 10], P),
    via: [iso([104, 60, 10], P)],
    to: iso([104, 64, 10], P),
    tone: "blue",
    flow: true,
  },
  {
    id: "wire.advToMem",
    from: iso([138, 126, 10], P),
    via: [iso([143, 126, 10], P), iso([143, 56, 10], P)],
    to: iso([148, 56, 10], P),
    tone: "green",
    dashed: true,
  },
  {
    id: "wire.orToQuar",
    from: iso([204, 72, 10], P),
    via: [iso([215, 72, 10], P)],
    to: iso([226, 72, 10], P),
    tone: "green",
    flow: true,
  },
];

export const STATION_HALOS: Record<StationId, string> = {
  "task-generator": TG_HALO,
  retrieval: RET_HALO,
  memory: MEM_HALO,
  guardrails: GR_HALO,
  executor: EX_HALO,
  oracle: OR_HALO,
  quarantine: QU_HALO,
  advisor: AD_HALO,
  verdict: VE_HALO,
};
