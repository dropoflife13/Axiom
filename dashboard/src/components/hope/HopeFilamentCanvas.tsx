'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowNodeId, FlowTraceEvent } from '@/lib/v4-hope-flow';

export interface HopeFilamentCanvasProps {
  readonly events: readonly FlowTraceEvent[];
  readonly activeIndex: number;
  readonly selectedNode: FlowNodeId | null;
  readonly onSelectEventIndex: (index: number) => void;
  readonly onSelectNode: (nodeId: FlowNodeId | null) => void;
  readonly isPlaying?: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface CubicCurve {
  readonly p0: Point;
  readonly cp1: Point;
  readonly cp2: Point;
  readonly p1: Point;
}

interface NodeRect {
  readonly id: FlowNodeId;
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface DagLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: Record<FlowNodeId, NodeRect>;
}

interface SampledStrand {
  readonly eventIndex: number;
  readonly points: readonly Point[];
}

interface ActivePulse {
  readonly startTime: number;
  readonly durationMs: number;
  readonly pathNodes: readonly FlowNodeId[];
  readonly laneNorm: number;
  readonly outcome: FlowTraceEvent['outcome'];
  readonly kind: FlowTraceEvent['kind'];
}

interface HoverState {
  readonly kind: 'node' | 'strand';
  readonly nodeId?: FlowNodeId;
  readonly eventIndex?: number;
  readonly x: number;
  readonly y: number;
}

interface NodeMeta {
  readonly id: FlowNodeId;
  readonly title: string;
  readonly defaultSub: string;
  readonly accent: string;
}

interface RecentOutcomeSlot {
  readonly outcome: FlowTraceEvent['outcome'];
  readonly kind: FlowTraceEvent['kind'];
  readonly factPassRate: number;
  readonly boundFactsCount: number;
}

interface NodeMiniBin {
  readonly visits: number;
  readonly total: number;
  readonly passCount: number;
  readonly quarantineCount: number;
  readonly failCount: number;
}

interface QuarantinePulseBin {
  readonly quarCount: number;
  readonly totalCount: number;
}

interface GateAuditStats {
  readonly g1PassCount: number;
  readonly g1ExecCount: number;
  readonly g2PassCount: number;
  readonly g2ExecCount: number;
  readonly g3PassCount: number;
  readonly g3ExecCount: number;
  readonly resolvedCount: number;
}

interface CanvasTelemetryStats {
  readonly seenTotal: number;
  readonly totalEvents: number;
  readonly playbackPct: number;
  readonly nodeCounts: Record<FlowNodeId, number>;
  readonly verifiedCount: number;
  readonly quarantineEnteredCount: number;
  readonly gateTotal: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly stagedCount: number;
  readonly firstPassRate: number;
  readonly quarantineRate: number;
  readonly gateResolvedRate: number;
  readonly gateApprovedShare: number;
  readonly gateRejectedShare: number;
  readonly avgLexicalLockPct: number;
  readonly avgReductionPct: number;
  readonly recentOutcomeSlots: readonly RecentOutcomeSlot[];
  readonly quarantineBins: readonly QuarantinePulseBin[];
  readonly nodeBins: Record<FlowNodeId, readonly NodeMiniBin[]>;
  readonly gateStats: GateAuditStats;
}

const NODE_ORDER: readonly FlowNodeId[] = [
  'TASK_IN',
  'FAST_CLOCK',
  'ORACLE_VERIFIER',
  'VERIFIED_OUTPUT',
  'QUARANTINE_VAULT',
  'SLOW_CLOCK_GATE',
  'GATE_APPROVED',
  'GATE_REJECTED',
];

const NODE_META: Record<FlowNodeId, NodeMeta> = {
  TASK_IN: {
    id: 'TASK_IN',
    title: 'TASK / PROBE',
    defaultSub: 'INCOMING STREAM',
    accent: '#e4e4e7',
  },
  FAST_CLOCK: {
    id: 'FAST_CLOCK',
    title: 'FAST CLOCK',
    defaultSub: 'TOP-4 RULES · LOCKED',
    accent: '#e4e4e7',
  },
  ORACLE_VERIFIER: {
    id: 'ORACLE_VERIFIER',
    title: 'TEST VERIFIER',
    defaultSub: 'DETERMINISTIC CHECKS',
    accent: '#e4e4e7',
  },
  VERIFIED_OUTPUT: {
    id: 'VERIFIED_OUTPUT',
    title: 'PASSED',
    defaultSub: 'ALL CHECKS PASS',
    accent: '#10b981',
  },
  QUARANTINE_VAULT: {
    id: 'QUARANTINE_VAULT',
    title: 'QUARANTINE',
    defaultSub: 'ISOLATED ISSUES',
    accent: '#f59e0b',
  },
  SLOW_CLOCK_GATE: {
    id: 'SLOW_CLOCK_GATE',
    title: 'SAFETY GATE',
    defaultSub: 'G1 · G2 · G3 CHECKS',
    accent: '#f59e0b',
  },
  GATE_APPROVED: {
    id: 'GATE_APPROVED',
    title: 'APPROVED',
    defaultSub: 'SAFE FIX PROMOTED',
    accent: '#10b981',
  },
  GATE_REJECTED: {
    id: 'GATE_REJECTED',
    title: 'BLOCKED',
    defaultSub: 'UNSAFE FIX BLOCKED',
    accent: '#ef4444',
  },
};

const STRUCTURAL_EDGES: ReadonlyArray<readonly [FlowNodeId, FlowNodeId]> = [
  ['TASK_IN', 'FAST_CLOCK'],
  ['FAST_CLOCK', 'ORACLE_VERIFIER'],
  ['ORACLE_VERIFIER', 'VERIFIED_OUTPUT'],
  ['ORACLE_VERIFIER', 'QUARANTINE_VAULT'],
  ['QUARANTINE_VAULT', 'SLOW_CLOCK_GATE'],
  ['SLOW_CLOCK_GATE', 'GATE_APPROVED'],
  ['SLOW_CLOCK_GATE', 'GATE_REJECTED'],
];

const PALETTE = {
  bg: '#090b0f',
  gridMinor: '#10141c',
  gridMajor: '#171c27',
  cardBg: '#0d1016',
  cardBgActive: '#111620',
  border: '#27272a',
  borderHover: '#52525b',
  borderSelected: '#e4e4e7',
  rail: 'rgba(113, 113, 122, 0.24)',
  textPrimary: '#e4e4e7',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textDim: '#52525b',
  pass: '#10b981',
  quarantine: '#f59e0b',
  fail: '#ef4444',
  probe: '#38bdf8',
  neutral: '#e4e4e7',
} as const;

const FONT_MONO =
  '"SFMono-Regular", Consolas, "Liberation Mono", ui-monospace, Menlo, monospace';

const PASS_SUB_LANES = 8;
const QUARANTINE_SUB_LANES = 6;
const FAIL_SUB_LANES = 8;
const HIT_RADIUS_PX = 9;
const MAX_ACTIVE_PULSES = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(228, 228, 231, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function outcomeColor(outcome: FlowTraceEvent['outcome']): string {
  if (outcome === 'PASS') return PALETTE.pass;
  if (outcome === 'QUARANTINE') return PALETTE.quarantine;
  return PALETTE.fail;
}

function createNodeRect(id: FlowNodeId, cx: number, cy: number, w: number, h: number): NodeRect {
  return {
    id,
    cx,
    cy,
    w,
    h,
    left: cx - w / 2,
    right: cx + w / 2,
    top: cy - h / 2,
    bottom: cy + h / 2,
  };
}

function computeDagLayout(width: number, height: number): DagLayout {
  const w = Math.max(280, width);
  const h = Math.max(340, height);

  const topPad = 24;
  const bottomPad = 20;
  const usableH = Math.max(240, h - topPad - bottomPad);

  const isCompact = w < 560;
  const sidePad = isCompact ? 10 : 20;

  const nodeW = isCompact
    ? clamp(w * 0.215, 72, 114)
    : clamp(w * 0.19, 118, 178);
  const gateW = isCompact
    ? clamp(w * 0.145, 56, 86)
    : clamp(w * 0.138, 86, 134);

  // Maintain 4 clean rows on Column 3 with clear vertical breathing room
  const nodeH = clamp(usableH * 0.145, 42, 56);
  const gateH = clamp(usableH * 0.136, 40, 52);

  // Column 3 horizontal geometry (rightmost column holds QUARANTINE, SAFETY GATE, APPROVED|BLOCKED, PASSED)
  const minSplitHalf = gateW / 2 + (isCompact ? 4 : 8);
  const splitHalf = clamp(gateW * 0.56 + (isCompact ? 4 : 10), minSplitHalf, gateW * 0.72 + 12);
  const col3HalfSpan = Math.max(nodeW / 2, splitHalf + gateW / 2);

  // Column 1 (far left): TASK / PROBE
  const col1X = sidePad + nodeW / 2;

  // Column 3 anchored on right with room for APPROVED/BLOCKED pair
  const minCol12Gap = isCompact ? 22 : 44;
  const minCol23Gap = isCompact ? 28 : 54;
  const minCol3X =
    col1X + nodeW / 2 + minCol12Gap + nodeW + minCol23Gap + col3HalfSpan;
  const maxCol3X = w - sidePad - col3HalfSpan;
  const col3X = clamp(
    w * (isCompact ? 0.75 : 0.775),
    Math.min(minCol3X, maxCol3X),
    maxCol3X
  );

  // Column 2 (middle): FAST CLOCK & TEST VERIFIER placed closer to Column 1 so Column 2 -> 3 curves have wide horizontal stage
  const minCol2X = col1X + nodeW / 2 + minCol12Gap + nodeW / 2;
  const col3OuterLeft = col3X - col3HalfSpan;
  const maxCol2X = Math.max(minCol2X, col3OuterLeft - minCol23Gap - nodeW / 2);
  const col2X = clamp(w * (isCompact ? 0.42 : 0.395), minCol2X, maxCol2X);

  // Vertical rows:
  // Col 1: TASK / PROBE centered mid-left framing FAST CLOCK & TEST VERIFIER
  const col1Y = topPad + usableH * 0.46;

  // Col 2: 2 stacked middle cards
  const col2YTop = topPad + usableH * 0.25;
  const col2YBot = topPad + usableH * 0.67;

  // Col 3: 4 vertical tiers — QUARANTINE -> SAFETY GATE -> APPROVED|BLOCKED -> PASSED underneath
  const col3Y0 = topPad + usableH * 0.11;
  const col3Y1 = topPad + usableH * 0.37;
  const col3Y2 = topPad + usableH * 0.63;
  const col3Y3 = topPad + usableH * 0.89;

  // Give PASSED generous horizontal presence cleanly beneath APPROVED & BLOCKED
  const passedW = Math.max(nodeW, Math.round(gateW * 1.48));

  const nodes: Record<FlowNodeId, NodeRect> = {
    TASK_IN: createNodeRect('TASK_IN', col1X, col1Y, nodeW, nodeH),
    FAST_CLOCK: createNodeRect('FAST_CLOCK', col2X, col2YTop, nodeW, nodeH),
    ORACLE_VERIFIER: createNodeRect('ORACLE_VERIFIER', col2X, col2YBot, nodeW, nodeH),
    QUARANTINE_VAULT: createNodeRect('QUARANTINE_VAULT', col3X, col3Y0, nodeW, nodeH),
    SLOW_CLOCK_GATE: createNodeRect('SLOW_CLOCK_GATE', col3X, col3Y1, nodeW, nodeH),
    GATE_APPROVED: createNodeRect('GATE_APPROVED', col3X - splitHalf, col3Y2, gateW, gateH),
    GATE_REJECTED: createNodeRect('GATE_REJECTED', col3X + splitHalf, col3Y2, gateW, gateH),
    VERIFIED_OUTPUT: createNodeRect('VERIFIED_OUTPUT', col3X, col3Y3, passedW, nodeH),
  };

  return {
    width: w,
    height: h,
    nodes,
  };
}

interface StrandLaneInfo {
  readonly outcome: FlowTraceEvent['outcome'];
  readonly subLane: number;
  readonly laneNorm: number;
}

interface RepresentativeStrand {
  readonly eventIndex: number;
  readonly event: FlowTraceEvent;
  readonly laneNorm: number;
}

function getStrandLaneInfo(event: FlowTraceEvent, eventIndex: number): StrandLaneInfo {
  const safeIdx = Math.max(0, eventIndex);
  if (event.outcome === 'PASS') {
    const subLane = safeIdx % PASS_SUB_LANES;
    const laneNorm = -1.0 + (subLane / (PASS_SUB_LANES - 1)) * 0.64;
    return { outcome: 'PASS', subLane, laneNorm };
  }
  if (event.outcome === 'QUARANTINE') {
    const subLane = safeIdx % QUARANTINE_SUB_LANES;
    const laneNorm = -0.26 + (subLane / (QUARANTINE_SUB_LANES - 1)) * 0.52;
    return { outcome: 'QUARANTINE', subLane, laneNorm };
  }
  const subLane = safeIdx % FAIL_SUB_LANES;
  const laneNorm = 0.36 + (subLane / (FAIL_SUB_LANES - 1)) * 0.64;
  return { outcome: 'FAIL', subLane, laneNorm };
}

function collectRepresentativeStrands(
  events: readonly FlowTraceEvent[],
  clampedActiveIndex: number
): RepresentativeStrand[] {
  if (clampedActiveIndex < 0) return [];
  const bySlot = new Map<string, RepresentativeStrand>();
  for (let idx = 0; idx <= clampedActiveIndex; idx += 1) {
    const ev = events[idx];
    if (!ev || ev.pathNodes.length < 2) continue;
    const { outcome, subLane, laneNorm } = getStrandLaneInfo(ev, idx);
    const pathSignature = ev.pathNodes.join('>');
    bySlot.set(`${outcome}|${subLane}|${pathSignature}`, {
      eventIndex: idx,
      event: ev,
      laneNorm,
    });
  }
  return Array.from(bySlot.values());
}

function isKnownNodeId(nodeId: string): nodeId is FlowNodeId {
  return nodeId in NODE_META;
}

function buildWavyDownwardCurve(
  startX: number,
  startY: number,
  waistX: number,
  billowX: number,
  endX: number,
  endY: number
): CubicCurve {
  const dy = Math.max(8, endY - startY);
  return {
    p0: { x: startX, y: startY },
    cp1: { x: waistX, y: startY + dy * 0.48 },
    cp2: { x: billowX, y: endY - dy * 0.44 },
    p1: { x: endX, y: endY },
  };
}

function buildEdgeCurve(
  layout: DagLayout,
  fromId: FlowNodeId,
  toId: FlowNodeId,
  laneNorm: number
): CubicCurve {
  const from = layout.nodes[fromId];
  const to = layout.nodes[toId];

  // Column 1 (TASK_IN.right) -> Column 2 top (FAST_CLOCK.left): flowing wavy S-curve bundle
  if (fromId === 'TASK_IN' && toId === 'FAST_CLOCK') {
    const p0: Point = {
      x: from.right,
      y: from.cy + laneNorm * (from.h * 0.36),
    };
    const p1: Point = {
      x: to.left,
      y: to.cy + laneNorm * (to.h * 0.36),
    };
    const dx = p1.x - p0.x;
    const spreadY = laneNorm * clamp(layout.height * 0.06, 13, 26);
    return {
      p0,
      cp1: { x: p0.x + dx * 0.48, y: p0.y + spreadY },
      cp2: { x: p1.x - dx * 0.48, y: p1.y + spreadY },
      p1,
    };
  }

  // ORACLE_VERIFIER (upper-right) -> QUARANTINE_VAULT (left): climbs cleanly in open Col 2->3 corridor above APPROVED & SAFETY GATE
  if (fromId === 'ORACLE_VERIFIER' && toId === 'QUARANTINE_VAULT') {
    const p0: Point = {
      x: from.right,
      y: from.cy - from.h * 0.22 + laneNorm * (from.h * 0.13),
    };
    const p1: Point = {
      x: to.left,
      y: to.cy + laneNorm * (to.h * 0.28),
    };
    const approvedLeft = layout.nodes.GATE_APPROVED.left;
    const corridorX = Math.max(p0.x + 18, approvedLeft - 14);
    const colGap = corridorX - p0.x;
    const dx = p1.x - p0.x;
    const spreadY = laneNorm * clamp(layout.height * 0.06, 14, 30);
    const gateTopTarget = Math.min(
      layout.nodes.SLOW_CLOCK_GATE.top - clamp(layout.height * 0.035, 10, 20),
      layout.nodes.QUARANTINE_VAULT.bottom + 14
    );
    return {
      p0,
      cp1: {
        x: Math.min(p0.x + colGap * 0.72, p0.x + dx * 0.36),
        y: gateTopTarget + spreadY,
      },
      cp2: {
        x: p1.x - dx * 0.48,
        y: p1.y + spreadY * 0.65,
      },
      p1,
    };
  }

  // ORACLE_VERIFIER (lower-right) -> VERIFIED_OUTPUT / PASSED (left): sweeps below APPROVED & BLOCKED into bottom-right card
  if (fromId === 'ORACLE_VERIFIER' && toId === 'VERIFIED_OUTPUT') {
    const p0: Point = {
      x: from.right,
      y: from.cy + from.h * 0.22 + laneNorm * (from.h * 0.13),
    };
    const p1: Point = {
      x: to.left,
      y: to.cy + laneNorm * (to.h * 0.28),
    };
    const approvedLeft = layout.nodes.GATE_APPROVED.left;
    const corridorX = Math.max(p0.x + 18, approvedLeft - 12);
    const colGap = corridorX - p0.x;
    const dx = p1.x - p0.x;
    const spreadY = laneNorm * clamp(layout.height * 0.04, 10, 20);
    const underApprovedY = Math.max(
      layout.nodes.GATE_APPROVED.bottom + clamp(layout.height * 0.04, 12, 22),
      p1.y - clamp(layout.height * 0.025, 6, 14)
    );
    return {
      p0,
      cp1: {
        x: Math.min(p0.x + colGap * 0.68, p0.x + dx * 0.34),
        y: underApprovedY + spreadY,
      },
      cp2: {
        x: p1.x - dx * 0.42,
        y: p1.y + spreadY * 0.75,
      },
      p1,
    };
  }

  // Gate split: gathered softly near center pin, then wavy S-flare out into APPROVED / BLOCKED
  if (fromId === 'SLOW_CLOCK_GATE' && (toId === 'GATE_APPROVED' || toId === 'GATE_REJECTED')) {
    const spreadNorm =
      laneNorm === 0 ? 0 : clamp((laneNorm - 0.32) / 0.68, -0.92, 0.92);
    const branchBias = toId === 'GATE_APPROVED' ? -2.4 : 2.4;
    return buildWavyDownwardCurve(
      from.cx + branchBias + spreadNorm * (from.w * 0.035),
      from.bottom,
      from.cx + branchBias * 0.8 + spreadNorm * (from.w * 0.015),
      to.cx + spreadNorm * (to.w * 0.46),
      to.cx + spreadNorm * (to.w * 0.36),
      to.top
    );
  }

  // QUARANTINE_VAULT -> SLOW_CLOCK_GATE: narrow wavy waist tapering into billowing S-curve fan
  if (fromId === 'QUARANTINE_VAULT' && toId === 'SLOW_CLOCK_GATE') {
    const quarSpreadNorm =
      laneNorm === 0 ? 0 : clamp((laneNorm - 0.32) / 0.68, -0.95, 0.95);
    return buildWavyDownwardCurve(
      from.cx + quarSpreadNorm * (from.w * 0.06),
      from.bottom,
      from.cx + quarSpreadNorm * (from.w * 0.025),
      to.cx + quarSpreadNorm * (to.w * 0.52),
      to.cx + quarSpreadNorm * (to.w * 0.40),
      to.top
    );
  }

  // Column 2 vertical conduit (FAST_CLOCK -> ORACLE_VERIFIER): wavy tapered waist into wide billowing S-fan
  return buildWavyDownwardCurve(
    from.cx + laneNorm * (from.w * 0.06),
    from.bottom,
    from.cx + laneNorm * (from.w * 0.025),
    to.cx + laneNorm * (to.w * 0.54),
    to.cx + laneNorm * (to.w * 0.42),
    to.top
  );
}

function evalCubic(curve: CubicCurve, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * curve.p0.x + b * curve.cp1.x + c * curve.cp2.x + d * curve.p1.x,
    y: a * curve.p0.y + b * curve.cp1.y + c * curve.cp2.y + d * curve.p1.y,
  };
}

function evalCubicTangent(curve: CubicCurve, t: number): Point {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x:
      a * (curve.cp1.x - curve.p0.x) +
      b * (curve.cp2.x - curve.cp1.x) +
      c * (curve.p1.x - curve.cp2.x),
    y:
      a * (curve.cp1.y - curve.p0.y) +
      b * (curve.cp2.y - curve.cp1.y) +
      c * (curve.p1.y - curve.cp2.y),
  };
}

function traceCubicSubpath(ctx: CanvasRenderingContext2D, curve: CubicCurve): void {
  ctx.moveTo(curve.p0.x, curve.p0.y);
  ctx.bezierCurveTo(
    curve.cp1.x,
    curve.cp1.y,
    curve.cp2.x,
    curve.cp2.y,
    curve.p1.x,
    curve.p1.y
  );
}

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 0.0001) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / lenSq, 0, 1);
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 8) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo <= 0 ? ellipsis : text.slice(0, lo) + ellipsis;
}

function strandBaseColor(event: FlowTraceEvent): string {
  if (event.kind === 'redteam_probe') return PALETTE.probe;
  return outcomeColor(event.outcome);
}

function segmentSemanticColor(
  fromId: FlowNodeId,
  toId: FlowNodeId,
  event: FlowTraceEvent
): string {
  if (fromId === 'TASK_IN' && toId === 'FAST_CLOCK') {
    return PALETTE.probe;
  }
  if (fromId === 'FAST_CLOCK' && toId === 'ORACLE_VERIFIER') {
    return event.kind === 'redteam_probe' ? PALETTE.probe : outcomeColor(event.outcome);
  }
  if (fromId === 'ORACLE_VERIFIER' && toId === 'VERIFIED_OUTPUT') return PALETTE.pass;
  if (fromId === 'ORACLE_VERIFIER' && toId === 'QUARANTINE_VAULT') {
    if (event.kind === 'redteam_probe') return PALETTE.probe;
    return event.outcome === 'QUARANTINE' ? PALETTE.quarantine : PALETTE.fail;
  }
  if (fromId === 'QUARANTINE_VAULT' && toId === 'SLOW_CLOCK_GATE') {
    return event.kind === 'redteam_probe' ? PALETTE.probe : PALETTE.quarantine;
  }
  if (fromId === 'SLOW_CLOCK_GATE' && toId === 'GATE_APPROVED') return PALETTE.pass;
  if (fromId === 'SLOW_CLOCK_GATE' && toId === 'GATE_REJECTED') return PALETTE.fail;
  return PALETTE.neutral;
}

function strokeActiveSegment(
  ctx: CanvasRenderingContext2D,
  curve: CubicCurve,
  fromId: FlowNodeId,
  toId: FlowNodeId,
  event: FlowTraceEvent,
  lineWidth: number,
  alpha: number
): void {
  ctx.beginPath();
  traceCubicSubpath(ctx, curve);

  if (fromId === 'ORACLE_VERIFIER' && toId === 'QUARANTINE_VAULT') {
    const grad = ctx.createLinearGradient(curve.p0.x, curve.p0.y, curve.p1.x, curve.p1.y);
    grad.addColorStop(
      0,
      hexToRgba(event.kind === 'redteam_probe' ? PALETTE.probe : PALETTE.fail, alpha)
    );
    grad.addColorStop(
      1,
      hexToRgba(event.kind === 'redteam_probe' ? PALETTE.probe : PALETTE.quarantine, alpha)
    );
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = hexToRgba(segmentSemanticColor(fromId, toId, event), alpha);
  }

  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  events: readonly FlowTraceEvent[],
  clampedActiveIndex: number,
  selectedNode: FlowNodeId | null
): void {
  const { width, height } = layout;

  // 1. Matte dark background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle architectural precision grid (24px minor, 96px major)
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.gridMinor;
  ctx.beginPath();
  for (let x = 24; x < width; x += 24) {
    if (x % 96 !== 0) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
  }
  for (let y = 24; y < height; y += 24) {
    if (y % 96 !== 0) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = PALETTE.gridMajor;
  ctx.beginPath();
  for (let x = 96; x < width; x += 96) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 96; y < height; y += 96) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // 3. Sleek top-right outcome legend inside canvas
  if (width >= 430) {
    const legendItems: ReadonlyArray<{ label: string; color: string }> = [
      { label: 'PASS', color: PALETTE.pass },
      { label: 'QUARANTINE', color: PALETTE.quarantine },
      { label: 'FAIL', color: PALETTE.fail },
    ];
    let rx = width - 14;
    ctx.font = `500 9.5px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let i = legendItems.length - 1; i >= 0; i -= 1) {
      const item = legendItems[i];
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(item.label, rx, 13.5);
      const labelW = ctx.measureText(item.label).width;
      ctx.fillStyle = item.color;
      ctx.fillRect(rx - labelW - 10, 11, 5, 5);
      rx -= labelW + 22;
    }
  }

  // 4. Static structural guide rails across all 7 DAG conduits
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.rail;
  for (const [fromId, toId] of STRUCTURAL_EDGES) {
    const curve = buildEdgeCurve(layout, fromId, toId, 0);
    ctx.beginPath();
    traceCubicSubpath(ctx, curve);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle conduit branch micro-labels
  ctx.font = `600 9px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';

  const passCurve = buildEdgeCurve(layout, 'ORACLE_VERIFIER', 'VERIFIED_OUTPUT', 0);
  const passMid = evalCubic(passCurve, 0.34);
  ctx.textAlign = 'center';
  ctx.fillStyle = hexToRgba(PALETTE.pass, 0.72);
  ctx.fillText('PASS', passMid.x, passMid.y + 14);

  const stageCurve = buildEdgeCurve(layout, 'ORACLE_VERIFIER', 'QUARANTINE_VAULT', 0);
  const stageMid = evalCubic(stageCurve, 0.48);
  ctx.textAlign = 'right';
  ctx.fillStyle = hexToRgba(PALETTE.fail, 0.72);
  ctx.fillText('STAGE', stageMid.x - 10, stageMid.y - 10);

  const appCurve = buildEdgeCurve(layout, 'SLOW_CLOCK_GATE', 'GATE_APPROVED', 0);
  const appMid = evalCubic(appCurve, 0.56);
  ctx.textAlign = 'right';
  ctx.fillStyle = hexToRgba(PALETTE.pass, 0.7);
  ctx.fillText('PROMOTE', appMid.x - 10, appMid.y);

  const rejCurve = buildEdgeCurve(layout, 'SLOW_CLOCK_GATE', 'GATE_REJECTED', 0);
  const rejMid = evalCubic(rejCurve, 0.56);
  ctx.textAlign = 'left';
  ctx.fillStyle = hexToRgba(PALETTE.fail, 0.7);
  ctx.fillText('BLOCK', rejMid.x + 10, rejMid.y);

  // 5. Deduplicated outcome-separated filament strands (at most ~22 crisp strands + active on top)
  if (clampedActiveIndex >= 0) {
    const representatives = collectRepresentativeStrands(events, clampedActiveIndex);
    ctx.lineCap = 'round';

    for (const rep of representatives) {
      if (rep.eventIndex === clampedActiveIndex) continue;
      const ev = rep.event;
      const matchesFilter = selectedNode === null || ev.pathNodes.includes(selectedNode);
      const alpha = selectedNode === null ? 0.42 : matchesFilter ? 0.52 : 0.09;
      const color = strandBaseColor(ev);

      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = 0.95;

      ctx.beginPath();
      for (let s = 0; s < ev.pathNodes.length - 1; s += 1) {
        const fromId = ev.pathNodes[s];
        const toId = ev.pathNodes[s + 1];
        if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
        const curve = buildEdgeCurve(layout, fromId, toId, rep.laneNorm);
        traceCubicSubpath(ctx, curve);
      }
      ctx.stroke();
    }

    // Always draw clampedActiveIndex crisp on top at 1.6px / 0.92 alpha
    const activeEv = events[clampedActiveIndex];
    if (activeEv && activeEv.pathNodes.length >= 2) {
      const { laneNorm } = getStrandLaneInfo(activeEv, clampedActiveIndex);
      ctx.strokeStyle = hexToRgba(strandBaseColor(activeEv), 0.92);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let s = 0; s < activeEv.pathNodes.length - 1; s += 1) {
        const fromId = activeEv.pathNodes[s];
        const toId = activeEv.pathNodes[s + 1];
        if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
        const curve = buildEdgeCurve(layout, fromId, toId, laneNorm);
        traceCubicSubpath(ctx, curve);
      }
      ctx.stroke();
    }
  }
}

function getFailureBranchBadgeText(event: FlowTraceEvent): string | null {
  if (!event.pathNodes.includes('QUARANTINE_VAULT')) return null;
  if (event.kind === 'redteam_probe') {
    const id = event.redTeam?.factId || event.slowClockGate.factId || event.taskId;
    return `probe: ${id}`;
  }
  const primaryFail =
    event.failedFacts[0] ??
    event.slowClockGate.factId ??
    event.slowClockGate.triggerFlag ??
    event.activeForensicFlags[0];
  if (!primaryFail) return `fail: ${event.taskId}`;
  return event.failedFacts.length > 1
    ? `fail: ${primaryFail} +${event.failedFacts.length - 1}`
    : `fail: ${primaryFail}`;
}

function drawActiveFailureBadge(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  event: FlowTraceEvent
): void {
  const badgeText = getFailureBranchBadgeText(event);
  if (!badgeText) return;

  const curve = buildEdgeCurve(layout, 'ORACLE_VERIFIER', 'QUARANTINE_VAULT', 0);
  const mid = evalCubic(curve, 0.44);

  ctx.font = `600 9.5px ${FONT_MONO}`;
  const textW = ctx.measureText(badgeText).width;
  const boxW = Math.min(layout.width * 0.32, textW + 16);
  const boxH = 20;
  const minRightEdge = layout.nodes.GATE_APPROVED.left - 8;
  const maxAllowedBx = Math.max(8, minRightEdge - boxW);
  const bx = clamp(mid.x - boxW / 2, 8, Math.min(layout.width - boxW - 8, maxAllowedBx));
  const by = clamp(mid.y - boxH - 12, 26, layout.height - boxH - 8);

  const isQuarantine = event.outcome === 'QUARANTINE' || event.kind === 'redteam_probe';
  const strokeColor = isQuarantine ? PALETTE.quarantine : PALETTE.fail;

  roundedRectPath(ctx, bx, by, boxW, boxH, 2);
  ctx.fillStyle = PALETTE.cardBg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(strokeColor, 0.78);
  ctx.stroke();

  ctx.fillStyle = strokeColor;
  ctx.fillRect(bx + 5, by + 7.5, 4, 4);

  ctx.fillStyle = PALETTE.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncateText(ctx, badgeText, boxW - 18), bx + 13, by + boxH / 2 + 0.5);
}

function createEmptyMiniBins(count: number): Array<{
  visits: number;
  total: number;
  passCount: number;
  quarantineCount: number;
  failCount: number;
}> {
  return Array.from({ length: count }, () => ({
    visits: 0,
    total: 0,
    passCount: 0,
    quarantineCount: 0,
    failCount: 0,
  }));
}

function computeCanvasTelemetryStats(
  events: readonly FlowTraceEvent[],
  clampedActiveIndex: number
): CanvasTelemetryStats {
  const totalEvents = events.length;
  const seenTotal = clampedActiveIndex >= 0 ? clampedActiveIndex + 1 : 0;
  const playbackPct = totalEvents > 0 ? seenTotal / totalEvents : 0;

  const nodeCounts: Record<FlowNodeId, number> = {
    TASK_IN: 0,
    FAST_CLOCK: 0,
    ORACLE_VERIFIER: 0,
    VERIFIED_OUTPUT: 0,
    QUARANTINE_VAULT: 0,
    SLOW_CLOCK_GATE: 0,
    GATE_APPROVED: 0,
    GATE_REJECTED: 0,
  };

  const nodeBinsMutable: Record<
    FlowNodeId,
    Array<{
      visits: number;
      total: number;
      passCount: number;
      quarantineCount: number;
      failCount: number;
    }>
  > = {
    TASK_IN: createEmptyMiniBins(8),
    FAST_CLOCK: createEmptyMiniBins(8),
    ORACLE_VERIFIER: createEmptyMiniBins(8),
    VERIFIED_OUTPUT: createEmptyMiniBins(8),
    QUARANTINE_VAULT: createEmptyMiniBins(8),
    SLOW_CLOCK_GATE: createEmptyMiniBins(8),
    GATE_APPROVED: createEmptyMiniBins(8),
    GATE_REJECTED: createEmptyMiniBins(8),
  };

  const quarantineBins: Array<{ quarCount: number; totalCount: number }> = Array.from(
    { length: 6 },
    () => ({ quarCount: 0, totalCount: 0 })
  );

  let lockSum = 0;
  let reductionSum = 0;
  let compactionSamples = 0;
  let g1PassCount = 0;
  let g1ExecCount = 0;
  let g2PassCount = 0;
  let g2ExecCount = 0;
  let g3PassCount = 0;
  let g3ExecCount = 0;

  const recentStart = Math.max(0, clampedActiveIndex - 7);
  const recentOutcomeSlots: RecentOutcomeSlot[] = [];

  for (let i = 0; i <= clampedActiveIndex; i += 1) {
    const ev = events[i];
    if (!ev) continue;

    const bin8 = seenTotal <= 8 ? i : Math.min(7, Math.floor((i * 8) / seenTotal));
    const bin6 = seenTotal <= 6 ? i : Math.min(5, Math.floor((i * 6) / seenTotal));

    for (const nodeId of NODE_ORDER) {
      nodeBinsMutable[nodeId][bin8].total += 1;
    }

    let enteredQuarantine = false;
    for (const n of ev.pathNodes) {
      if (!isKnownNodeId(n)) continue;
      nodeCounts[n] += 1;
      const cell = nodeBinsMutable[n][bin8];
      cell.visits += 1;
      if (ev.outcome === 'PASS') cell.passCount += 1;
      else if (ev.outcome === 'QUARANTINE') cell.quarantineCount += 1;
      else cell.failCount += 1;
      if (n === 'QUARANTINE_VAULT') enteredQuarantine = true;
    }

    quarantineBins[bin6].totalCount += 1;
    if (enteredQuarantine) {
      quarantineBins[bin6].quarCount += 1;
    }

    if (ev.promptDelta.beforeTokens > 0) {
      lockSum += ev.promptDelta.lexicalLockPct;
      reductionSum += ev.promptDelta.reductionPct;
      compactionSamples += 1;
    }

    const gate = ev.slowClockGate;
    if (gate.status !== 'none') {
      if (gate.g1LexicalPassed !== undefined) {
        g1ExecCount += 1;
        if (gate.g1LexicalPassed) g1PassCount += 1;
      }
      if (gate.g2ConflictPassed !== undefined) {
        g2ExecCount += 1;
        if (gate.g2ConflictPassed) g2PassCount += 1;
      }
      if (gate.g3CanaryPassed !== undefined) {
        g3ExecCount += 1;
        if (gate.g3CanaryPassed) g3PassCount += 1;
      }
    }

    if (i >= recentStart) {
      recentOutcomeSlots.push({
        outcome: ev.outcome,
        kind: ev.kind,
        factPassRate: ev.factPassRate,
        boundFactsCount: ev.boundFactsCount,
      });
    }
  }

  const verifiedCount = nodeCounts.VERIFIED_OUTPUT;
  const quarantineEnteredCount = nodeCounts.QUARANTINE_VAULT;
  const approvedCount = nodeCounts.GATE_APPROVED;
  const rejectedCount = nodeCounts.GATE_REJECTED;
  const gateTotal = Math.max(nodeCounts.SLOW_CLOCK_GATE, approvedCount + rejectedCount);
  const resolvedCount = approvedCount + rejectedCount;
  const stagedCount = Math.max(0, gateTotal - resolvedCount);

  return {
    seenTotal,
    totalEvents,
    playbackPct,
    nodeCounts,
    verifiedCount,
    quarantineEnteredCount,
    gateTotal,
    approvedCount,
    rejectedCount,
    stagedCount,
    firstPassRate: seenTotal > 0 ? verifiedCount / seenTotal : 0,
    quarantineRate: seenTotal > 0 ? quarantineEnteredCount / seenTotal : 0,
    gateResolvedRate: gateTotal > 0 ? resolvedCount / gateTotal : 0,
    gateApprovedShare: gateTotal > 0 ? approvedCount / gateTotal : 0,
    gateRejectedShare: gateTotal > 0 ? rejectedCount / gateTotal : 0,
    avgLexicalLockPct: compactionSamples > 0 ? lockSum / compactionSamples : 100,
    avgReductionPct: compactionSamples > 0 ? reductionSum / compactionSamples : 0,
    recentOutcomeSlots,
    quarantineBins,
    nodeBins: nodeBinsMutable,
    gateStats: {
      g1PassCount,
      g1ExecCount,
      g2PassCount,
      g2ExecCount,
      g3PassCount,
      g3ExecCount,
      resolvedCount,
    },
  };
}

function drawTaskInIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  stats: CanvasTelemetryStats,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const pctLabel =
    stats.totalEvents > 0 ? `${Math.round(stats.playbackPct * 100)}%` : '--%';
  ctx.font = `600 8.5px ${FONT_MONO}`;
  const pctW = ctx.measureText(pctLabel).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle =
    stats.totalEvents === 0
      ? PALETTE.textDim
      : stats.playbackPct >= 0.999
        ? PALETTE.pass
        : PALETTE.probe;
  ctx.fillText(pctLabel, innerRight, indY);

  const availW = Math.max(24, innerRight - innerLeft - pctW - 6);
  const barCount = 8;
  const gap = availW >= 56 ? 2 : 1.5;
  const barW = clamp(Math.floor((availW - gap * (barCount - 1)) / barCount), 2, 7);
  const maxBarH = clamp(rect.h * 0.21, 8, 12);
  const barBottom = indY + maxBarH / 2;

  for (let i = 0; i < barCount; i += 1) {
    const bx = innerLeft + i * (barW + gap);
    const slot = stats.recentOutcomeSlots[i];
    if (!slot) {
      ctx.fillStyle = hexToRgba(PALETTE.borderHover, 0.35);
      ctx.fillRect(bx, barBottom - 2, barW, 2);
      continue;
    }

    let color: string;
    let hFrac: number;
    if (slot.outcome === 'PASS') {
      color = PALETTE.pass;
      hFrac = 0.72 + 0.28 * clamp(slot.boundFactsCount / 8, 0, 1);
    } else if (slot.outcome === 'QUARANTINE') {
      color = slot.kind === 'redteam_probe' ? PALETTE.probe : PALETTE.quarantine;
      hFrac = 0.54 + 0.28 * clamp(slot.factPassRate, 0, 1);
    } else {
      color = PALETTE.fail;
      hFrac = 0.3 + 0.38 * clamp(slot.factPassRate, 0, 1);
    }
    const bh = Math.max(3, Math.round(maxBarH * hFrac));
    ctx.fillStyle = hexToRgba(color, 0.92);
    ctx.fillRect(bx, barBottom - bh, barW, bh);
  }
}

function drawFastClockIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  stats: CanvasTelemetryStats,
  activeEvent: FlowTraceEvent | null,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const lockPct = clamp(
    activeEvent
      ? activeEvent.promptDelta.beforeTokens > 0
        ? activeEvent.promptDelta.lexicalLockPct
        : stats.avgLexicalLockPct
      : stats.avgLexicalLockPct,
    0,
    100
  );
  const innerW = innerRight - innerLeft;
  const lockLabel = innerW >= 112 ? `${Math.round(lockPct)}% LOCK` : `${Math.round(lockPct)}%`;

  ctx.font = `600 8.5px ${FONT_MONO}`;
  const labelW = ctx.measureText(lockLabel).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = stats.seenTotal > 0 ? PALETTE.probe : PALETTE.textDim;
  ctx.fillText(lockLabel, innerRight, indY);

  // 5 height-varied frequency ticks in #38bdf8
  const tickCount = 5;
  const tickW = innerW >= 120 ? 2.5 : 2;
  const tickGap = 2;
  const ticksTotalW = tickCount * tickW + (tickCount - 1) * tickGap;
  const maxTickH = clamp(rect.h * 0.2, 8, 12);
  const tickBottom = indY + maxTickH / 2;

  const baseProfile = [0.44, 0.78, 1.0, 0.66, 0.88];
  const reductionRef =
    activeEvent && activeEvent.promptDelta.beforeTokens > 0
      ? activeEvent.promptDelta.reductionPct
      : stats.avgReductionPct;
  const compScale = 0.68 + 0.32 * clamp(reductionRef / 15, 0, 1);
  const ruleBoost = activeEvent ? clamp(activeEvent.retrievedRuleIds.length / 4, 0.25, 1) : 0.4;

  for (let i = 0; i < tickCount; i += 1) {
    const tx = innerLeft + i * (tickW + tickGap);
    const mod = i % 2 === 0 ? compScale : ruleBoost;
    const th = Math.max(3, Math.round(maxTickH * baseProfile[i] * (0.55 + 0.45 * mod)));
    ctx.fillStyle = hexToRgba(PALETTE.probe, stats.seenTotal > 0 ? 0.92 : 0.35);
    ctx.fillRect(tx, tickBottom - th, tickW, th);
  }

  // Lexical lock % fill strip
  const stripLeft = innerLeft + ticksTotalW + 6;
  const stripRight = innerRight - labelW - 6;
  const stripW = stripRight - stripLeft;
  if (stripW >= 14) {
    const stripH = 4;
    const stripTop = indY - stripH / 2;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(stripLeft, stripTop, stripW, stripH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.border;
    ctx.strokeRect(stripLeft + 0.5, stripTop + 0.5, stripW - 1, stripH - 1);

    const fillW = Math.round((stripW - 2) * (lockPct / 100));
    if (fillW > 0 && stats.seenTotal > 0) {
      ctx.fillStyle = lockPct >= 99 ? PALETTE.probe : PALETTE.quarantine;
      ctx.fillRect(stripLeft + 1, stripTop + 1, fillW, stripH - 2);
    }
  }
}

function drawOracleVerifierIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  activeEvent: FlowTraceEvent | null,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const passRate = activeEvent ? clamp(activeEvent.factPassRate, 0, 1) : 0;
  const pctText = activeEvent ? `${Math.round(passRate * 100)}%` : '--%';

  ctx.font = `600 8.5px ${FONT_MONO}`;
  const pctW = ctx.measureText(pctText).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = !activeEvent
    ? PALETTE.textDim
    : passRate >= 0.999
      ? PALETTE.pass
      : passRate > 0
        ? PALETTE.quarantine
        : PALETTE.fail;
  ctx.fillText(pctText, innerRight, indY);

  const availW = Math.max(20, innerRight - innerLeft - pctW - 6);
  const rawTotal = activeEvent ? Math.max(1, activeEvent.boundFactsCount) : 4;
  const cellCount = Math.min(rawTotal, 12);
  const gap = cellCount > 8 ? 1.5 : 2;
  const cellW = clamp(Math.floor((availW - gap * (cellCount - 1)) / cellCount), 2, 10);
  const cellH = clamp(Math.round(rect.h * 0.11), 5, 7);
  const cellY = Math.round(indY - cellH / 2);

  const passedCells = activeEvent
    ? rawTotal <= 12
      ? clamp(activeEvent.passedFactsCount, 0, cellCount)
      : Math.round((activeEvent.passedFactsCount / rawTotal) * cellCount)
    : 0;

  for (let i = 0; i < cellCount; i += 1) {
    const cx = innerLeft + i * (cellW + gap);
    if (!activeEvent) {
      ctx.fillStyle = hexToRgba(PALETTE.borderHover, 0.35);
      ctx.fillRect(cx, cellY, cellW, cellH);
      continue;
    }
    const isPassed = i < passedCells;
    ctx.fillStyle = hexToRgba(isPassed ? PALETTE.pass : PALETTE.fail, 0.9);
    ctx.fillRect(cx, cellY, cellW, cellH);
  }
}

function drawVerifiedOutputIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  stats: CanvasTelemetryStats,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const r = rect.h >= 52 ? 7 : rect.h >= 47 ? 6 : 5;
  const cx = innerLeft + r + 1;
  const cy = indY;
  const share = clamp(stats.firstPassRate, 0, 1);

  // Track ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = hexToRgba(PALETTE.borderHover, 0.45);
  ctx.stroke();

  // Emerald arc gauge
  if (share > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * share;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = PALETTE.pass;
    ctx.stroke();
  }

  const pctText =
    stats.seenTotal > 0 ? `${(share * 100).toFixed(1)}%` : '0.0%';
  ctx.font = rect.h < 48 ? `600 8.5px ${FONT_MONO}` : `600 9px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = stats.verifiedCount > 0 ? PALETTE.pass : PALETTE.textMuted;
  ctx.fillText(pctText, cx + r + 6, indY + 0.5);

  // Secondary ratio on right if wide enough
  const ratioText = `${stats.verifiedCount}/${stats.seenTotal}`;
  ctx.font = `500 8px ${FONT_MONO}`;
  const pctW = ctx.measureText(pctText).width;
  const ratioW = ctx.measureText(ratioText).width;
  if (innerRight - (cx + r + 6 + pctW + 8) >= ratioW) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(ratioText, innerRight, indY + 0.5);
  }
}

function drawQuarantineVaultIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  stats: CanvasTelemetryStats,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const pctStr =
    stats.seenTotal > 0 ? `${(stats.quarantineRate * 100).toFixed(1)}%` : '0.0%';
  const innerW = innerRight - innerLeft;
  const pillText = innerW >= 132 ? `${pctStr} STAGED` : pctStr;

  ctx.font = rect.h < 48 ? `600 7.5px ${FONT_MONO}` : `600 8px ${FONT_MONO}`;
  const textW = ctx.measureText(pillText).width;
  const pillW = Math.min(innerW * 0.58, textW + 10);
  const pillH = rect.h >= 48 ? 13 : 11;
  const pillX = innerRight - pillW;
  const pillY = indY - pillH / 2;

  roundedRectPath(ctx, pillX, pillY, pillW, pillH, 2);
  ctx.fillStyle =
    stats.quarantineEnteredCount > 0
      ? hexToRgba(PALETTE.quarantine, 0.12)
      : PALETTE.bg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle =
    stats.quarantineEnteredCount > 0
      ? hexToRgba(PALETTE.quarantine, 0.5)
      : PALETTE.border;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle =
    stats.quarantineEnteredCount > 0 ? PALETTE.quarantine : PALETTE.textMuted;
  ctx.fillText(truncateText(ctx, pillText, pillW - 6), pillX + pillW / 2, indY + 0.5);

  // 6 amber step-frequency bars scaled to quarantine traffic share
  const availW = Math.max(20, pillX - innerLeft - 6);
  const barCount = 6;
  const gap = availW >= 42 ? 2.5 : 1.5;
  const barW = clamp(Math.floor((availW - gap * (barCount - 1)) / barCount), 2, 8);
  const maxBarH = clamp(rect.h * 0.2, 8, 12);
  const barBottom = indY + maxBarH / 2;

  for (let i = 0; i < barCount; i += 1) {
    const bx = innerLeft + i * (barW + gap);
    const bin = stats.quarantineBins[i];
    if (!bin || bin.totalCount === 0 || bin.quarCount === 0) {
      ctx.fillStyle = hexToRgba(PALETTE.borderHover, 0.35);
      ctx.fillRect(bx, barBottom - 2, barW, 2);
      continue;
    }
    const share = clamp(bin.quarCount / bin.totalCount, 0, 1);
    const bh = Math.max(3, Math.round(maxBarH * (0.22 + 0.78 * share)));
    ctx.fillStyle = hexToRgba(PALETTE.quarantine, 0.45 + 0.5 * share);
    ctx.fillRect(bx, barBottom - bh, barW, bh);
  }
}

function drawSlowClockGateIndicator(
  ctx: CanvasRenderingContext2D,
  rect: NodeRect,
  stats: CanvasTelemetryStats,
  activeEvent: FlowTraceEvent | null,
  isOnActivePath: boolean,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const resolvePct = Math.round(stats.gateResolvedRate * 100);
  const pctLabel = stats.gateTotal > 0 ? `${resolvePct}%` : '--%';

  ctx.font = `600 8.5px ${FONT_MONO}`;
  const pctW = ctx.measureText(pctLabel).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle =
    stats.gateTotal === 0
      ? PALETTE.textDim
      : resolvePct >= 85
        ? PALETTE.pass
        : PALETTE.quarantine;
  ctx.fillText(pctLabel, innerRight, indY + 0.5);

  const availW = Math.max(36, innerRight - innerLeft - pctW - 6);
  const gap = availW >= 68 ? 3 : 2;
  const pillW = clamp(Math.floor((availW - gap * 2) / 3), 12, 26);
  const pillH = clamp(Math.round(rect.h * 0.2), 11, 13);
  const pillY = indY - pillH / 2;

  const activeGate = isOnActivePath && activeEvent ? activeEvent.slowClockGate : null;
  const gates: ReadonlyArray<{
    readonly label: string;
    readonly activeVal: boolean | undefined;
    readonly passCount: number;
    readonly execCount: number;
  }> = [
    {
      label: 'G1',
      activeVal: activeGate?.g1LexicalPassed,
      passCount: stats.gateStats.g1PassCount,
      execCount: stats.gateStats.g1ExecCount,
    },
    {
      label: 'G2',
      activeVal: activeGate?.g2ConflictPassed,
      passCount: stats.gateStats.g2PassCount,
      execCount: stats.gateStats.g2ExecCount,
    },
    {
      label: 'G3',
      activeVal: activeGate?.g3CanaryPassed,
      passCount: stats.gateStats.g3PassCount,
      execCount: stats.gateStats.g3ExecCount,
    },
  ];

  ctx.font = `600 7.5px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < gates.length; i += 1) {
    const g = gates[i];
    const gx = innerLeft + i * (pillW + gap);

    let color: string = PALETTE.textDim;
    let activeTone = false;
    if (activeGate && activeGate.status !== 'none') {
      if (g.activeVal === true) {
        color = PALETTE.pass;
        activeTone = true;
      } else if (g.activeVal === false) {
        color = PALETTE.fail;
        activeTone = true;
      } else if (activeGate.status === 'staged') {
        color = PALETTE.quarantine;
        activeTone = true;
      }
    } else if (g.execCount > 0) {
      const rate = g.passCount / g.execCount;
      color = rate >= 0.85 ? PALETTE.pass : rate >= 0.45 ? PALETTE.quarantine : PALETTE.fail;
      activeTone = true;
    }

    roundedRectPath(ctx, gx, pillY, pillW, pillH, 1.5);
    ctx.fillStyle = activeTone ? hexToRgba(color, 0.14) : PALETTE.bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = activeTone ? hexToRgba(color, 0.68) : PALETTE.border;
    ctx.stroke();

    ctx.fillStyle = activeTone ? color : PALETTE.textMuted;
    ctx.fillText(g.label, gx + pillW / 2, indY + 0.5);
  }
}

function drawGateMeterIndicator(
  ctx: CanvasRenderingContext2D,
  numerator: number,
  denominator: number,
  color: string,
  showGuardTicks: boolean,
  innerLeft: number,
  innerRight: number,
  indY: number
): void {
  const ratio = denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
  const pctLabel = denominator > 0 ? `${Math.round(ratio * 100)}%` : '0%';

  ctx.font = `600 8.5px ${FONT_MONO}`;
  const pctW = ctx.measureText(pctLabel).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = numerator > 0 ? color : PALETTE.textMuted;
  ctx.fillText(pctLabel, innerRight, indY + 0.5);

  const trackW = Math.max(16, innerRight - innerLeft - pctW - 6);
  const trackH = 6;
  const trackY = Math.round(indY - trackH / 2);

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(innerLeft, trackY, trackW, trackH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.border;
  ctx.strokeRect(innerLeft + 0.5, trackY + 0.5, trackW - 1, trackH - 1);

  if (showGuardTicks && trackW >= 28) {
    ctx.fillStyle = hexToRgba(PALETTE.borderHover, 0.55);
    for (const frac of [0.25, 0.5, 0.75]) {
      const tx = Math.round(innerLeft + trackW * frac);
      ctx.fillRect(tx, trackY + 1, 1, trackH - 2);
    }
  }

  const fillW = Math.round((trackW - 2) * ratio);
  if (fillW > 0) {
    ctx.fillStyle = hexToRgba(color, 0.88);
    ctx.fillRect(innerLeft + 1, trackY + 1, fillW, trackH - 2);
    if (fillW >= 2) {
      ctx.fillStyle = color;
      ctx.fillRect(innerLeft + fillW, trackY + 1, 1, trackH - 2);
    }
  }
}

function drawNodeCards(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  stats: CanvasTelemetryStats,
  activeEvent: FlowTraceEvent | null,
  clampedActiveIndex: number,
  totalEvents: number,
  selectedNode: FlowNodeId | null,
  hoveredNode: FlowNodeId | null
): void {
  const activePathSet = new Set<FlowNodeId>(activeEvent?.pathNodes ?? []);
  const { nodeCounts } = stats;

  for (const nodeId of NODE_ORDER) {
    const rect = layout.nodes[nodeId];
    const meta = NODE_META[nodeId];
    const isSelected = selectedNode === nodeId;
    const isHovered = hoveredNode === nodeId;
    const isOnActivePath = activePathSet.has(nodeId);
    const isTerminal = activeEvent?.terminalNode === nodeId;
    const count = nodeCounts[nodeId];

    // Card background
    roundedRectPath(ctx, rect.left, rect.top, rect.w, rect.h, 2);
    ctx.fillStyle = isOnActivePath || isSelected ? PALETTE.cardBgActive : PALETTE.cardBg;
    ctx.fill();

    // Crisp 1px hairline border
    let borderColor: string = PALETTE.border;
    let borderWidth = 1;
    if (isSelected) {
      borderColor = PALETTE.borderSelected;
      borderWidth = 1.5;
    } else if (isTerminal && activeEvent) {
      borderColor = outcomeColor(activeEvent.outcome);
      borderWidth = 1.25;
    } else if (isHovered) {
      borderColor = PALETTE.borderHover;
    } else if (isOnActivePath) {
      borderColor = hexToRgba(meta.accent, 0.58);
    }

    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // Subtle 2px left architectural accent bar
    const barColor =
      isTerminal && activeEvent
        ? outcomeColor(activeEvent.outcome)
        : isOnActivePath || count > 0
          ? meta.accent
          : PALETTE.textDim;
    ctx.fillStyle = hexToRgba(barColor, isOnActivePath || isSelected ? 0.95 : 0.45);
    ctx.fillRect(rect.left + 1, rect.top + 1, 2, rect.h - 2);

    // Selection corner registration brackets (architectural CAD marker)
    if (isSelected) {
      const tick = 5;
      ctx.strokeStyle = PALETTE.textPrimary;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(rect.left - 3, rect.top + tick);
      ctx.lineTo(rect.left - 3, rect.top - 3);
      ctx.lineTo(rect.left + tick, rect.top - 3);
      ctx.moveTo(rect.right - tick, rect.top - 3);
      ctx.lineTo(rect.right + 3, rect.top - 3);
      ctx.lineTo(rect.right + 3, rect.top + tick);
      ctx.moveTo(rect.left - 3, rect.bottom - tick);
      ctx.lineTo(rect.left - 3, rect.bottom + 3);
      ctx.lineTo(rect.left + tick, rect.bottom + 3);
      ctx.moveTo(rect.right - tick, rect.bottom + 3);
      ctx.lineTo(rect.right + 3, rect.bottom + 3);
      ctx.lineTo(rect.right + 3, rect.bottom - tick);
      ctx.stroke();
    }

    // Port connection collars (crisp terminal pins)
    ctx.fillStyle = isOnActivePath ? meta.accent : PALETTE.borderHover;
    if (
      nodeId === 'ORACLE_VERIFIER' ||
      nodeId === 'SLOW_CLOCK_GATE' ||
      nodeId === 'GATE_APPROVED' ||
      nodeId === 'GATE_REJECTED'
    ) {
      ctx.fillRect(rect.cx - 2, rect.top - 1.5, 4, 3);
    }
    if (
      nodeId === 'FAST_CLOCK' ||
      nodeId === 'VERIFIED_OUTPUT' ||
      nodeId === 'QUARANTINE_VAULT'
    ) {
      ctx.fillRect(rect.left - 1.5, rect.cy - 2, 3, 4);
    }
    if (nodeId === 'TASK_IN') {
      ctx.fillRect(rect.right - 1.5, rect.cy - 2, 3, 4);
    }
    if (nodeId === 'ORACLE_VERIFIER') {
      ctx.fillRect(rect.right - 1.5, rect.cy - rect.h * 0.22 - 2, 3, 4);
      ctx.fillRect(rect.right - 1.5, rect.cy + rect.h * 0.22 - 2, 3, 4);
    } else if (
      nodeId === 'FAST_CLOCK' ||
      nodeId === 'QUARANTINE_VAULT' ||
      nodeId === 'SLOW_CLOCK_GATE'
    ) {
      ctx.fillRect(rect.cx - 2, rect.bottom - 1.5, 4, 3);
    }

    const innerLeft = rect.left + 9;
    const innerRight = rect.right - 8;
    const titleY = rect.top + Math.round(rect.h * 0.21);
    const subY = rect.top + Math.round(rect.h * 0.48);
    const indY = rect.top + Math.round(rect.h * 0.77);

    // Count pill on top-right
    const countLabel = `${count}`;
    ctx.font = rect.h < 48 ? `600 8.5px ${FONT_MONO}` : `600 9px ${FONT_MONO}`;
    const countW = ctx.measureText(countLabel).width;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle =
      count > 0 ? (isOnActivePath ? meta.accent : PALETTE.textSecondary) : PALETTE.textDim;
    ctx.fillText(countLabel, innerRight, titleY);

    // Node Title
    const titleMaxW = rect.w - 20 - countW;
    ctx.font =
      rect.h < 48
        ? `600 9px ${FONT_MONO}`
        : rect.h < 53
          ? `600 9.5px ${FONT_MONO}`
          : `600 10px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = isOnActivePath || isSelected ? PALETTE.textPrimary : PALETTE.textSecondary;
    ctx.fillText(truncateText(ctx, meta.title, titleMaxW), innerLeft, titleY);

    // Node Telemetry Subline
    const subMaxW = rect.w - 17;
    ctx.font = rect.h < 48 ? `500 8px ${FONT_MONO}` : `500 8.5px ${FONT_MONO}`;
    let subText = meta.defaultSub;
    let subColor: string = PALETTE.textMuted;

    if (activeEvent) {
      if (nodeId === 'TASK_IN') {
        subText = `${activeEvent.taskId} · ${clampedActiveIndex + 1}/${totalEvents}`;
        subColor = PALETTE.textSecondary;
      } else if (nodeId === 'FAST_CLOCK') {
        subText = `TOP-4 · -${activeEvent.promptDelta.reductionPct.toFixed(0)}% TOK`;
        subColor = PALETTE.textSecondary;
      } else if (nodeId === 'ORACLE_VERIFIER') {
        if (activeEvent.kind === 'redteam_probe') {
          subText = `PROBE · ${activeEvent.redTeam?.triggerFlag ?? activeEvent.taskId}`;
          subColor = PALETTE.quarantine;
        } else {
          subText = `${activeEvent.passedFactsCount}/${activeEvent.boundFactsCount} CHECKS · ${activeEvent.fullTaskPass ? 'PASS' : 'FAIL'}`;
          subColor = activeEvent.fullTaskPass ? PALETTE.pass : PALETTE.fail;
        }
      } else if (nodeId === 'VERIFIED_OUTPUT') {
        subText = `${count} PASSED`;
        subColor = count > 0 ? PALETTE.pass : PALETTE.textMuted;
      } else if (nodeId === 'QUARANTINE_VAULT') {
        const badge = isOnActivePath ? getFailureBranchBadgeText(activeEvent) : null;
        subText = badge ? `${count} STAGED · ${badge}` : `${count} STAGED`;
        subColor = count > 0 ? PALETTE.quarantine : PALETTE.textMuted;
      } else if (nodeId === 'SLOW_CLOCK_GATE') {
        if (isOnActivePath && activeEvent.slowClockGate.status !== 'none') {
          subText = `${activeEvent.slowClockGate.status.toUpperCase()} · ${count} AUDITS`;
          subColor =
            activeEvent.slowClockGate.status === 'approved'
              ? PALETTE.pass
              : activeEvent.slowClockGate.status === 'rejected'
                ? PALETTE.fail
                : PALETTE.quarantine;
        } else {
          subText = `${stats.gateStats.resolvedCount}/${stats.gateTotal} RESOLVED`;
          subColor = count > 0 ? PALETTE.quarantine : PALETTE.textMuted;
        }
      } else if (nodeId === 'GATE_APPROVED') {
        subText =
          stats.gateTotal > 0 ? `${count}/${stats.gateTotal} PROMOTED` : `${count} PROMOTED`;
        subColor = count > 0 ? PALETTE.pass : PALETTE.textMuted;
      } else if (nodeId === 'GATE_REJECTED') {
        subText =
          stats.gateTotal > 0 ? `${count}/${stats.gateTotal} BLOCKED` : `${count} BLOCKED`;
        subColor = count > 0 ? PALETTE.fail : PALETTE.textMuted;
      }
    }

    ctx.fillStyle = subColor;
    ctx.fillText(truncateText(ctx, subText, subMaxW), innerLeft, subY);

    // Unique per-node completeness / frequency micro-indicator row
    if (nodeId === 'TASK_IN') {
      drawTaskInIndicator(ctx, rect, stats, innerLeft, innerRight, indY);
    } else if (nodeId === 'FAST_CLOCK') {
      drawFastClockIndicator(ctx, rect, stats, activeEvent, innerLeft, innerRight, indY);
    } else if (nodeId === 'ORACLE_VERIFIER') {
      drawOracleVerifierIndicator(ctx, rect, activeEvent, innerLeft, innerRight, indY);
    } else if (nodeId === 'VERIFIED_OUTPUT') {
      drawVerifiedOutputIndicator(ctx, rect, stats, innerLeft, innerRight, indY);
    } else if (nodeId === 'QUARANTINE_VAULT') {
      drawQuarantineVaultIndicator(ctx, rect, stats, innerLeft, innerRight, indY);
    } else if (nodeId === 'SLOW_CLOCK_GATE') {
      drawSlowClockGateIndicator(
        ctx,
        rect,
        stats,
        activeEvent,
        isOnActivePath,
        innerLeft,
        innerRight,
        indY
      );
    } else if (nodeId === 'GATE_APPROVED') {
      drawGateMeterIndicator(
        ctx,
        stats.approvedCount,
        stats.gateTotal,
        PALETTE.pass,
        false,
        innerLeft,
        innerRight,
        indY
      );
    } else if (nodeId === 'GATE_REJECTED') {
      drawGateMeterIndicator(
        ctx,
        stats.rejectedCount,
        stats.gateTotal,
        PALETTE.fail,
        true,
        innerLeft,
        innerRight,
        indY
      );
    }
  }
}

function drawPulses(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  pulses: readonly ActivePulse[],
  activeEvent: FlowTraceEvent | null,
  now: number
): void {
  if (!activeEvent || pulses.length === 0) return;

  for (const pulse of pulses) {
    if (pulse.pathNodes.length < 2) continue;
    const u = clamp((now - pulse.startTime) / pulse.durationMs, 0, 1);
    const segCount = pulse.pathNodes.length - 1;

    const tailSpan = 0.17;
    const steps = 14;
    const tailPoints: Array<{ pt: Point; segIdx: number; frac: number }> = [];

    for (let i = 0; i <= steps; i += 1) {
      const sampleU = Math.max(0, u - tailSpan * (1 - i / steps));
      const scaled = sampleU * segCount;
      const segIdx = Math.min(segCount - 1, Math.floor(scaled));
      const localT = clamp(scaled - segIdx, 0, 1);
      const fromId = pulse.pathNodes[segIdx];
      const toId = pulse.pathNodes[segIdx + 1];
      if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
      const curve = buildEdgeCurve(layout, fromId, toId, pulse.laneNorm);
      tailPoints.push({
        pt: evalCubic(curve, localT),
        segIdx,
        frac: i / steps,
      });
    }

    ctx.lineCap = 'round';
    for (let i = 1; i < tailPoints.length; i += 1) {
      const prev = tailPoints[i - 1];
      const curr = tailPoints[i];
      const fromId = pulse.pathNodes[curr.segIdx];
      const toId = pulse.pathNodes[curr.segIdx + 1];
      let segColor: string = PALETTE.neutral;
      if (fromId === 'TASK_IN' && toId === 'FAST_CLOCK') {
        segColor = PALETTE.probe;
      } else if (fromId === 'FAST_CLOCK' && toId === 'ORACLE_VERIFIER') {
        segColor = pulse.kind === 'redteam_probe' ? PALETTE.probe : outcomeColor(pulse.outcome);
      } else if (fromId === 'ORACLE_VERIFIER' && toId === 'VERIFIED_OUTPUT') {
        segColor = PALETTE.pass;
      } else if (fromId === 'ORACLE_VERIFIER' && toId === 'QUARANTINE_VAULT') {
        segColor =
          pulse.kind === 'redteam_probe'
            ? PALETTE.probe
            : pulse.outcome === 'QUARANTINE'
              ? PALETTE.quarantine
              : PALETTE.fail;
      } else if (fromId === 'QUARANTINE_VAULT' && toId === 'SLOW_CLOCK_GATE') {
        segColor = pulse.kind === 'redteam_probe' ? PALETTE.probe : PALETTE.quarantine;
      } else if (fromId === 'SLOW_CLOCK_GATE' && toId === 'GATE_APPROVED') {
        segColor = PALETTE.pass;
      } else if (fromId === 'SLOW_CLOCK_GATE' && toId === 'GATE_REJECTED') {
        segColor = PALETTE.fail;
      }

      ctx.beginPath();
      ctx.moveTo(prev.pt.x, prev.pt.y);
      ctx.lineTo(curr.pt.x, curr.pt.y);
      ctx.strokeStyle = hexToRgba(segColor, 0.15 + curr.frac * 0.85);
      ctx.lineWidth = 1.2 + curr.frac * 1.8;
      ctx.stroke();
    }

    const headScaled = u * segCount;
    const headSegIdx = Math.min(segCount - 1, Math.floor(headScaled));
    const headLocalT = clamp(headScaled - headSegIdx, 0, 1);
    const headFrom = pulse.pathNodes[headSegIdx];
    const headTo = pulse.pathNodes[headSegIdx + 1];
    if (!isKnownNodeId(headFrom) || !isKnownNodeId(headTo)) continue;

    const headCurve = buildEdgeCurve(layout, headFrom, headTo, pulse.laneNorm);
    const headPt = evalCubic(headCurve, headLocalT);
    const tang = evalCubicTangent(headCurve, headLocalT);
    const angle = Math.atan2(tang.y, tang.x);

    ctx.save();
    ctx.translate(headPt.x, headPt.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-2.5, 3);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-2.5, -3);
    ctx.closePath();
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = outcomeColor(pulse.outcome);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  hover: HoverState,
  events: readonly FlowTraceEvent[],
  stats: CanvasTelemetryStats
): void {
  let line1 = '';
  let line2 = '';
  let accent: string = PALETTE.textPrimary;

  if (hover.kind === 'strand' && hover.eventIndex !== undefined) {
    const ev = events[hover.eventIndex];
    if (!ev) return;
    accent = outcomeColor(ev.outcome);
    if (ev.kind === 'redteam_probe') {
      const route = ev.redTeam ? `${ev.redTeam.method} ${ev.redTeam.route}` : ev.shortName;
      line1 = `${ev.taskId} · ${route} · ${ev.slowClockGate.status.toUpperCase()}`;
      line2 = `${ev.redTeam?.triggerFlag ?? 'probe'} · Click to inspect #${hover.eventIndex + 1}`;
    } else {
      line1 = `${ev.taskId} · ${ev.shortName} · ${ev.passedFactsCount}/${ev.boundFactsCount} facts`;
      line2 = `${ev.outcome} → ${NODE_META[ev.terminalNode].title} · Click to jump`;
    }
  } else if (hover.kind === 'node' && hover.nodeId) {
    const nodeId = hover.nodeId;
    const meta = NODE_META[nodeId];
    const count = stats.nodeCounts[nodeId];
    const activeBins = stats.nodeBins[nodeId].filter((b) => b.visits > 0).length;
    accent = meta.accent;

    if (nodeId === 'TASK_IN') {
      line1 = `${meta.title} · ${stats.seenTotal}/${stats.totalEvents} (${Math.round(stats.playbackPct * 100)}%)`;
      line2 = `${activeBins}/8 slices active · Click to filter`;
    } else if (nodeId === 'FAST_CLOCK') {
      line1 = `${meta.title} · ${count} traces · ${stats.avgLexicalLockPct.toFixed(1)}% lock`;
      line2 = `Avg -${stats.avgReductionPct.toFixed(1)}% tokens · Click to filter`;
    } else if (nodeId === 'ORACLE_VERIFIER') {
      line1 = `${meta.title} · ${count} verified runs`;
      line2 = `${(stats.firstPassRate * 100).toFixed(1)}% first-pass · Click to filter`;
    } else if (nodeId === 'VERIFIED_OUTPUT') {
      line1 = `${meta.title} · ${stats.verifiedCount}/${stats.seenTotal} (${(stats.firstPassRate * 100).toFixed(1)}%)`;
      line2 = `${activeBins}/8 slices active · Click to filter`;
    } else if (nodeId === 'QUARANTINE_VAULT') {
      line1 = `${meta.title} · ${stats.quarantineEnteredCount}/${stats.seenTotal} (${(stats.quarantineRate * 100).toFixed(1)}%)`;
      line2 = `${stats.stagedCount} pending gate · Click to filter`;
    } else if (nodeId === 'SLOW_CLOCK_GATE') {
      line1 = `${meta.title} · ${stats.gateTotal} audited (${Math.round(stats.gateResolvedRate * 100)}% resolved)`;
      line2 = `${stats.approvedCount} approved · ${stats.rejectedCount} blocked · Click to filter`;
    } else if (nodeId === 'GATE_APPROVED') {
      line1 = `${meta.title} · ${stats.approvedCount}/${stats.gateTotal} (${Math.round(stats.gateApprovedShare * 100)}%)`;
      line2 = `${meta.defaultSub} · Click to filter`;
    } else {
      line1 = `${meta.title} · ${stats.rejectedCount}/${stats.gateTotal} (${Math.round(stats.gateRejectedShare * 100)}%)`;
      line2 = `${meta.defaultSub} · Click to filter`;
    }
  } else {
    return;
  }

  ctx.font = `600 10.5px ${FONT_MONO}`;
  const w1 = ctx.measureText(line1).width;
  ctx.font = `500 9.5px ${FONT_MONO}`;
  const w2 = ctx.measureText(line2).width;

  const boxW = Math.min(layout.width - 20, Math.max(w1, w2) + 22);
  const boxH = 38;
  const tx = clamp(hover.x + 14, 10, layout.width - boxW - 10);
  const ty =
    hover.y - boxH - 12 >= 10
      ? hover.y - boxH - 12
      : clamp(hover.y + 16, 10, layout.height - boxH - 10);

  roundedRectPath(ctx, tx, ty, boxW, boxH, 2);
  ctx.fillStyle = 'rgba(13, 16, 22, 0.96)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(accent, 0.72);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(tx + 1, ty + 1, 2, boxH - 2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 10.5px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(truncateText(ctx, line1, boxW - 18), tx + 10, ty + 13);

  ctx.font = `500 9.5px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(truncateText(ctx, line2, boxW - 18), tx + 10, ty + 27);
}

export function HopeFilamentCanvas({
  events,
  activeIndex,
  selectedNode,
  onSelectEventIndex,
  onSelectNode,
  isPlaying = false,
}: HopeFilamentCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 720,
    height: 460,
  });

  const hoverRef = useRef<HoverState | null>(null);
  const pulsesRef = useRef<ActivePulse[]>([]);
  const prevSigRef = useRef<string | null>(null);
  const lastCyclePulseAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const clampedActiveIndex =
    events.length > 0
      ? clamp(Math.trunc(Number.isFinite(activeIndex) ? activeIndex : 0), 0, events.length - 1)
      : -1;

  const activeEvent = clampedActiveIndex >= 0 ? (events[clampedActiveIndex] ?? null) : null;

  const layout = useMemo(() => computeDagLayout(size.width, size.height), [size.width, size.height]);

  const telemetryStats = useMemo(
    () => computeCanvasTelemetryStats(events, clampedActiveIndex),
    [events, clampedActiveIndex]
  );
  const { nodeCounts } = telemetryStats;

  // Precompute sampled polylines for visible/active strands for crisp click & hover hit-testing
  const sampledStrands = useMemo<readonly SampledStrand[]>(() => {
    if (clampedActiveIndex < 0) return [];
    const representatives = collectRepresentativeStrands(events, clampedActiveIndex);
    const hasActive = representatives.some((r) => r.eventIndex === clampedActiveIndex);
    const activeEv = events[clampedActiveIndex];
    if (!hasActive && activeEv && activeEv.pathNodes.length >= 2) {
      representatives.push({
        eventIndex: clampedActiveIndex,
        event: activeEv,
        laneNorm: getStrandLaneInfo(activeEv, clampedActiveIndex).laneNorm,
      });
    }
    const list: SampledStrand[] = [];
    for (const rep of representatives) {
      const ev = rep.event;
      const pts: Point[] = [];
      for (let s = 0; s < ev.pathNodes.length - 1; s += 1) {
        const fromId = ev.pathNodes[s];
        const toId = ev.pathNodes[s + 1];
        if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
        const curve = buildEdgeCurve(layout, fromId, toId, rep.laneNorm);
        const segSteps = 12;
        for (let k = s === 0 ? 0 : 1; k <= segSteps; k += 1) {
          pts.push(evalCubic(curve, k / segSteps));
        }
      }
      list.push({ eventIndex: rep.eventIndex, points: pts });
    }
    return list;
  }, [events, clampedActiveIndex, layout]);

  // Observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateFromRect = (rect: DOMRectReadOnly) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextW = Math.max(280, Math.round(rect.width));
      const nextH = Math.max(340, Math.round(rect.height));
      setSize((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }
      );
    };

    updateFromRect(el.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateFromRect(entry.contentRect);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rebuild cached offscreen layer when topology, events up to activeIndex, or selection changes
  const rebuildStaticLayer = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCanvasRef.current;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    const targetW = Math.round(layout.width * dpr);
    const targetH = Math.round(layout.height * dpr);
    if (bgCanvas.width !== targetW || bgCanvas.height !== targetH) {
      bgCanvas.width = targetW;
      bgCanvas.height = targetH;
    }
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return;
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStaticLayer(bgCtx, layout, events, clampedActiveIndex, selectedNode);
  }, [layout, events, clampedActiveIndex, selectedNode]);

  useEffect(() => {
    rebuildStaticLayer();
  }, [rebuildStaticLayer]);

  // Spawn tracer pulse whenever active event or index changes
  useEffect(() => {
    const sig = activeEvent ? `${activeEvent.id}::${clampedActiveIndex}` : null;
    if (sig !== prevSigRef.current) {
      prevSigRef.current = sig;
      if (activeEvent && activeEvent.pathNodes.length >= 2) {
        const now = performance.now();
        const nextPulse: ActivePulse = {
          startTime: now,
          durationMs: isPlaying ? 460 : 880,
          pathNodes: activeEvent.pathNodes,
          laneNorm: getStrandLaneInfo(activeEvent, clampedActiveIndex).laneNorm,
          outcome: activeEvent.outcome,
          kind: activeEvent.kind,
        };
        pulsesRef.current = [...pulsesRef.current.slice(-(MAX_ACTIVE_PULSES - 1)), nextPulse];
        lastCyclePulseAtRef.current = now;
      } else {
        pulsesRef.current = [];
      }
    }
  }, [activeEvent, clampedActiveIndex, isPlaying]);

  const drawFrameRef = useRef<(now: number) => void>(() => {});

  const renderFrame = useCallback(
    (now: number) => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      const targetW = Math.round(layout.width * dpr);
      const targetH = Math.round(layout.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!bgCanvasRef.current) {
        rebuildStaticLayer();
      }

      // Blit cached historical density trails 1:1 physical pixels
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = PALETTE.bg;
        ctx.fillRect(0, 0, targetW, targetH);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Periodic ambient pulse during active playback
      if (isPlaying && activeEvent && activeEvent.pathNodes.length >= 2) {
        if (now - lastCyclePulseAtRef.current >= 640) {
          lastCyclePulseAtRef.current = now;
          pulsesRef.current = [
            ...pulsesRef.current.slice(-(MAX_ACTIVE_PULSES - 1)),
            {
              startTime: now,
              durationMs: 520,
              pathNodes: activeEvent.pathNodes,
              laneNorm: getStrandLaneInfo(activeEvent, clampedActiveIndex).laneNorm,
              outcome: activeEvent.outcome,
              kind: activeEvent.kind,
            },
          ];
        }
      }

      pulsesRef.current = pulsesRef.current.filter((p) => now - p.startTime < p.durationMs);

      const currentHover = hoverRef.current;

      // Hovered historical strand highlight
      if (currentHover?.kind === 'strand' && currentHover.eventIndex !== undefined) {
        const hoveredEv = events[currentHover.eventIndex];
        if (hoveredEv && hoveredEv.pathNodes.length >= 2) {
          const { laneNorm } = getStrandLaneInfo(hoveredEv, currentHover.eventIndex);
          ctx.lineCap = 'round';
          for (let s = 0; s < hoveredEv.pathNodes.length - 1; s += 1) {
            const fromId = hoveredEv.pathNodes[s];
            const toId = hoveredEv.pathNodes[s + 1];
            if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
            const curve = buildEdgeCurve(layout, fromId, toId, laneNorm);
            ctx.beginPath();
            traceCubicSubpath(ctx, curve);
            ctx.strokeStyle = hexToRgba(PALETTE.textPrimary, 0.72);
            ctx.lineWidth = 1.9;
            ctx.stroke();
          }
        }
      }

      // Active event highlighted spline + failure tag badge
      if (activeEvent && activeEvent.pathNodes.length >= 2) {
        const { laneNorm: activeLaneNorm } = getStrandLaneInfo(activeEvent, clampedActiveIndex);
        ctx.lineCap = 'round';
        for (let s = 0; s < activeEvent.pathNodes.length - 1; s += 1) {
          const fromId = activeEvent.pathNodes[s];
          const toId = activeEvent.pathNodes[s + 1];
          if (!isKnownNodeId(fromId) || !isKnownNodeId(toId)) continue;
          const curve = buildEdgeCurve(layout, fromId, toId, activeLaneNorm);
          strokeActiveSegment(ctx, curve, fromId, toId, activeEvent, 3.4, 0.16);
          strokeActiveSegment(ctx, curve, fromId, toId, activeEvent, 1.85, 0.94);
        }
        drawActiveFailureBadge(ctx, layout, activeEvent);
      }

      // Traveling tracer pulses
      drawPulses(ctx, layout, pulsesRef.current, activeEvent, now);

      // Node cards on top of splines
      drawNodeCards(
        ctx,
        layout,
        telemetryStats,
        activeEvent,
        clampedActiveIndex,
        events.length,
        selectedNode,
        currentHover?.kind === 'node' ? (currentHover.nodeId ?? null) : null
      );

      // Bottom subtle status line inside canvas
      ctx.font = `500 9.5px ${FONT_MONO}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.textDim;
      const footerLeft = activeEvent
        ? `ACTIVE #${clampedActiveIndex + 1}/${events.length} · ${activeEvent.taskId} · ${activeEvent.pathNodes
            .map((nodeId) => (isKnownNodeId(nodeId) ? NODE_META[nodeId].title : nodeId))
            .join(' → ')}`
        : 'WAITING FOR REAL TRACE TELEMETRY';
      ctx.fillText(truncateText(ctx, footerLeft, layout.width - 28), 14, layout.height - 12);

      // Hover tooltip
      if (currentHover) {
        drawTooltip(ctx, layout, currentHover, events, telemetryStats);
      }

      if (pulsesRef.current.length > 0 || (isPlaying && activeEvent !== null)) {
        rafRef.current = window.requestAnimationFrame((ts) => drawFrameRef.current(ts));
      }
    },
    [
      layout,
      events,
      activeEvent,
      clampedActiveIndex,
      selectedNode,
      nodeCounts,
      telemetryStats,
      isPlaying,
      rebuildStaticLayer,
    ]
  );

  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame((ts) => drawFrameRef.current(ts));
  }, []);

  useEffect(() => {
    drawFrameRef.current = renderFrame;
    requestDraw();
  }, [renderFrame, requestDraw]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const hitTest = useCallback(
    (clientX: number, clientY: number): HoverState | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // 1. Priority: Node cards
      const pad = 3;
      for (const nodeId of NODE_ORDER) {
        const n = layout.nodes[nodeId];
        if (x >= n.left - pad && x <= n.right + pad && y >= n.top - pad && y <= n.bottom + pad) {
          return { kind: 'node', nodeId, x, y };
        }
      }

      // 2. Filament strand proximity hit-test
      const maxDistSq = HIT_RADIUS_PX * HIT_RADIUS_PX;
      let bestIdx = -1;
      let bestScore = Infinity;

      for (const strand of sampledStrands) {
        const pts = strand.points;
        let minD = Infinity;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const d = distToSegmentSq(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
          if (d < minD) minD = d;
        }
        if (minD <= maxDistSq) {
          const score = minD - strand.eventIndex * 0.0005;
          if (score < bestScore) {
            bestScore = score;
            bestIdx = strand.eventIndex;
          }
        }
      }

      if (bestIdx >= 0) {
        return { kind: 'strand', eventIndex: bestIdx, x, y };
      }

      return null;
    },
    [layout, sampledStrands]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const hit = hitTest(e.clientX, e.clientY);
      hoverRef.current = hit;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hit ? 'pointer' : 'default';
      }
      requestDraw();
    },
    [hitTest, requestDraw]
  );

  const handlePointerLeave = useCallback(() => {
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
      requestDraw();
    }
  }, [requestDraw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.kind === 'node' && hit.nodeId) {
        onSelectNode(hit.nodeId === selectedNode ? null : hit.nodeId);
        return;
      }
      if (hit.kind === 'strand' && hit.eventIndex !== undefined) {
        onSelectEventIndex(hit.eventIndex);
      }
    },
    [hitTest, onSelectEventIndex, onSelectNode, selectedNode]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[360px] lg:min-h-0 bg-[#090b0f] select-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          activeEvent
            ? `HOPE v4 execution DAG trace: active event ${activeEvent.taskId} (${activeEvent.outcome}) routed to ${NODE_META[activeEvent.terminalNode].title}`
            : 'HOPE v4 execution DAG waiting for trace telemetry'
        }
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        className="absolute inset-0 block w-full h-full"
      />

      {/* Explicit deterministic waiting state when stream is empty (zero fake data) */}
      {events.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center px-4">
          <div className="rounded-[2px] border border-zinc-800 bg-[#0d1016]/95 px-3.5 py-2 font-mono text-[10.5px] text-zinc-400">
            <span className="text-zinc-200 font-semibold">NO TRACE EVENTS</span>
            <span className="mx-2 text-zinc-700">|</span>
            <span>Awaiting live telemetry or clear active filter</span>
          </div>
        </div>
      )}

      {/* Keyboard-accessible node filter controls mirroring canvas node clicks */}
      <div className="sr-only">
        {NODE_ORDER.map((nodeId) => (
          <button
            key={nodeId}
            type="button"
            aria-pressed={selectedNode === nodeId}
            onClick={() => onSelectNode(nodeId === selectedNode ? null : nodeId)}
          >
            Filter by {NODE_META[nodeId].title} ({nodeCounts[nodeId]} traces)
          </button>
        ))}
      </div>
    </div>
  );
}

export default HopeFilamentCanvas;
