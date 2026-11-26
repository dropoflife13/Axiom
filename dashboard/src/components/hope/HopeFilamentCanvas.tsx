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
    title: 'TASK / PROBE IN',
    defaultSub: 'DISPATCH STREAM',
    accent: '#e4e4e7',
  },
  FAST_CLOCK: {
    id: 'FAST_CLOCK',
    title: 'FAST CLOCK',
    defaultSub: 'TOP-K=4 · COMPACT LOCK',
    accent: '#e4e4e7',
  },
  ORACLE_VERIFIER: {
    id: 'ORACLE_VERIFIER',
    title: 'ORACLE / VERIFIER',
    defaultSub: 'DETERMINISTIC CHECK',
    accent: '#e4e4e7',
  },
  VERIFIED_OUTPUT: {
    id: 'VERIFIED_OUTPUT',
    title: 'VERIFIED OUTPUT',
    defaultSub: 'ALL BOUND FACTS PASS',
    accent: '#10b981',
  },
  QUARANTINE_VAULT: {
    id: 'QUARANTINE_VAULT',
    title: 'QUARANTINE VAULT',
    defaultSub: 'CANDIDATES STAGED',
    accent: '#f59e0b',
  },
  SLOW_CLOCK_GATE: {
    id: 'SLOW_CLOCK_GATE',
    title: 'SLOW CLOCK GATE',
    defaultSub: 'G1 LEX · G2 CON · G3 CAN',
    accent: '#f59e0b',
  },
  GATE_APPROVED: {
    id: 'GATE_APPROVED',
    title: 'APPROVED',
    defaultSub: 'PROMOTED FIX',
    accent: '#10b981',
  },
  GATE_REJECTED: {
    id: 'GATE_REJECTED',
    title: 'REJECTED',
    defaultSub: 'BLOCKED REGRESSION',
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

  const topPad = 36;
  const bottomPad = 28;
  const usableH = Math.max(240, h - topPad - bottomPad);

  const isCompact = w < 520;
  const spineW = isCompact
    ? clamp(w * 0.29, 96, 140)
    : clamp(w * 0.245, 134, 196);
  const gateW = isCompact
    ? clamp(w * 0.195, 70, 106)
    : clamp(w * 0.165, 92, 146);

  const nodeH = clamp(usableH * 0.145, 42, 58);
  const gateH = clamp(usableH * 0.135, 40, 54);

  const leftX = clamp(w * 0.225, spineW / 2 + 12, w * 0.32);
  const minRightX = leftX + spineW / 2 + (isCompact ? 30 : 62) + spineW / 2;
  const maxRightX = w - gateW - (isCompact ? 12 : 24);
  const rightCenterX = clamp(w * 0.715, Math.min(minRightX, maxRightX), maxRightX);

  const minSplitHalf = gateW / 2 + (isCompact ? 5 : 10);
  const maxSplitByRightEdge = w - rightCenterX - gateW / 2 - (isCompact ? 8 : 16);
  const maxSplitByLeftSpine =
    rightCenterX - (leftX + spineW / 2 + (isCompact ? 14 : 28) + gateW / 2);
  const splitHalf = clamp(
    gateW * 0.62 + (isCompact ? 5 : 10),
    minSplitHalf,
    Math.max(minSplitHalf, Math.min(maxSplitByRightEdge, maxSplitByLeftSpine))
  );

  const y0 = topPad + usableH * 0.085;
  const y1 = topPad + usableH * 0.355;
  const y2 = topPad + usableH * 0.635;
  const y3 = topPad + usableH * 0.905;

  const nodes: Record<FlowNodeId, NodeRect> = {
    TASK_IN: createNodeRect('TASK_IN', leftX, y0, spineW, nodeH),
    FAST_CLOCK: createNodeRect('FAST_CLOCK', leftX, y1, spineW, nodeH),
    ORACLE_VERIFIER: createNodeRect('ORACLE_VERIFIER', leftX, y2, spineW, nodeH),
    VERIFIED_OUTPUT: createNodeRect('VERIFIED_OUTPUT', leftX, y3, spineW, nodeH),
    QUARANTINE_VAULT: createNodeRect('QUARANTINE_VAULT', rightCenterX, y1, spineW, nodeH),
    SLOW_CLOCK_GATE: createNodeRect('SLOW_CLOCK_GATE', rightCenterX, y2, spineW, nodeH),
    GATE_APPROVED: createNodeRect('GATE_APPROVED', rightCenterX - splitHalf, y3, gateW, gateH),
    GATE_REJECTED: createNodeRect('GATE_REJECTED', rightCenterX + splitHalf, y3, gateW, gateH),
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

function buildEdgeCurve(
  layout: DagLayout,
  fromId: FlowNodeId,
  toId: FlowNodeId,
  laneNorm: number
): CubicCurve {
  const from = layout.nodes[fromId];
  const to = layout.nodes[toId];

  // Lateral Quarantine bridge: wide, airy edge port spread & vertical Bezier arc
  if (fromId === 'ORACLE_VERIFIER' && toId === 'QUARANTINE_VAULT') {
    const p0: Point = { x: from.right, y: from.cy + laneNorm * (from.h * 0.38) };
    const p1: Point = { x: to.left, y: to.cy + laneNorm * (to.h * 0.38) };
    const dx = p1.x - p0.x;
    const arcSpread = laneNorm * clamp(layout.height * 0.085, 22, 42);
    return {
      p0,
      cp1: { x: p0.x + dx * 0.52, y: p0.y + arcSpread },
      cp2: { x: p1.x - dx * 0.52, y: p1.y + arcSpread },
      p1,
    };
  }

  // Gate split: fan across ±(gate.w * 0.34) with crisp Bezier separation
  if (fromId === 'SLOW_CLOCK_GATE' && (toId === 'GATE_APPROVED' || toId === 'GATE_REJECTED')) {
    const portSpread = Math.min(18, from.w * 0.14);
    const portBias = toId === 'GATE_APPROVED' ? -portSpread : portSpread;
    const p0: Point = { x: from.cx + portBias + laneNorm * (to.w * 0.24), y: from.bottom };
    const p1: Point = { x: to.cx + laneNorm * (to.w * 0.34), y: to.top };
    const dy = p1.y - p0.y;
    return {
      p0,
      cp1: { x: p0.x + laneNorm * (to.w * 0.30), y: p0.y + dy * 0.48 },
      cp2: { x: to.cx + laneNorm * (to.w * 0.38), y: p1.y - dy * 0.48 },
      p1,
    };
  }

  // ORACLE_VERIFIER -> VERIFIED_OUTPUT: wide emerald green filament fan
  if (fromId === 'ORACLE_VERIFIER' && toId === 'VERIFIED_OUTPUT') {
    const p0: Point = { x: from.cx + laneNorm * (from.w * 0.34), y: from.bottom };
    const p1: Point = { x: to.cx + laneNorm * (to.w * 0.34), y: to.top };
    const dy = p1.y - p0.y;
    return {
      p0,
      cp1: { x: from.cx + laneNorm * (from.w * 0.42), y: p0.y + dy * 0.42 },
      cp2: { x: to.cx + laneNorm * (to.w * 0.42), y: p1.y - dy * 0.42 },
      p1,
    };
  }

  // QUARANTINE_VAULT -> SLOW_CLOCK_GATE: separate Quarantine & Fail strands
  if (fromId === 'QUARANTINE_VAULT' && toId === 'SLOW_CLOCK_GATE') {
    const p0: Point = { x: from.cx + laneNorm * (from.w * 0.38), y: from.bottom };
    const p1: Point = { x: to.cx + laneNorm * (to.w * 0.38), y: to.top };
    const dy = p1.y - p0.y;
    return {
      p0,
      cp1: { x: from.cx + laneNorm * (from.w * 0.44), y: p0.y + dy * 0.42 },
      cp2: { x: to.cx + laneNorm * (to.w * 0.44), y: p1.y - dy * 0.42 },
      p1,
    };
  }

  // Vertical spine conduits (TASK_IN -> FAST_CLOCK, FAST_CLOCK -> ORACLE_VERIFIER)
  const p0: Point = { x: from.cx + laneNorm * (from.w * 0.40), y: from.bottom };
  const p1: Point = { x: to.cx + laneNorm * (to.w * 0.40), y: to.top };
  const dy = p1.y - p0.y;
  return {
    p0,
    cp1: { x: from.cx + laneNorm * (from.w * 0.46), y: p0.y + dy * 0.42 },
    cp2: { x: to.cx + laneNorm * (to.w * 0.46), y: p1.y - dy * 0.42 },
    p1,
  };
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
  ctx.moveTo(curve.p0.x, curve.p0.y);
  ctx.bezierCurveTo(
    curve.cp1.x,
    curve.cp1.y,
    curve.cp2.x,
    curve.cp2.y,
    curve.p1.x,
    curve.p1.y
  );

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

  // 3. Top header strip inside canvas
  ctx.font = `600 10px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText('HOPE v4 // BEZIER FILAMENT DAG', 14, 17);

  if (width >= 430) {
    const legendItems: ReadonlyArray<{ label: string; color: string }> = [
      { label: 'PASS', color: PALETTE.pass },
      { label: 'QUARANTINE', color: PALETTE.quarantine },
      { label: 'FAIL', color: PALETTE.fail },
    ];
    let rx = width - 14;
    ctx.font = `500 9.5px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    for (let i = legendItems.length - 1; i >= 0; i -= 1) {
      const item = legendItems[i];
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(item.label, rx, 17);
      const labelW = ctx.measureText(item.label).width;
      ctx.fillStyle = item.color;
      ctx.fillRect(rx - labelW - 10, 14.5, 5, 5);
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
    ctx.moveTo(curve.p0.x, curve.p0.y);
    ctx.bezierCurveTo(
      curve.cp1.x,
      curve.cp1.y,
      curve.cp2.x,
      curve.cp2.y,
      curve.p1.x,
      curve.p1.y
    );
    ctx.stroke();
  }
  ctx.restore();

  // Subtle conduit branch micro-labels
  ctx.font = `600 9px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';

  const passCurve = buildEdgeCurve(layout, 'ORACLE_VERIFIER', 'VERIFIED_OUTPUT', 0);
  const passMid = evalCubic(passCurve, 0.5);
  ctx.textAlign = 'right';
  ctx.fillStyle = hexToRgba(PALETTE.pass, 0.72);
  ctx.fillText('PASS', passMid.x - 12, passMid.y);

  const stageCurve = buildEdgeCurve(layout, 'ORACLE_VERIFIER', 'QUARANTINE_VAULT', 0);
  const stageStart = evalCubic(stageCurve, 0.16);
  ctx.textAlign = 'left';
  ctx.fillStyle = hexToRgba(PALETTE.fail, 0.72);
  ctx.fillText('STAGE', stageStart.x + 4, stageStart.y + 12);

  const appCurve = buildEdgeCurve(layout, 'SLOW_CLOCK_GATE', 'GATE_APPROVED', 0);
  const appMid = evalCubic(appCurve, 0.52);
  ctx.textAlign = 'right';
  ctx.fillStyle = hexToRgba(PALETTE.pass, 0.7);
  ctx.fillText('PROMOTE', appMid.x - 10, appMid.y);

  const rejCurve = buildEdgeCurve(layout, 'SLOW_CLOCK_GATE', 'GATE_REJECTED', 0);
  const rejMid = evalCubic(rejCurve, 0.52);
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
  const mid = evalCubic(curve, 0.5);

  ctx.font = `600 9.5px ${FONT_MONO}`;
  const textW = ctx.measureText(badgeText).width;
  const boxW = Math.min(layout.width * 0.34, textW + 16);
  const boxH = 20;
  const bx = clamp(mid.x - boxW / 2, 8, layout.width - boxW - 8);
  const by = clamp(mid.y - boxH - 10, 26, layout.height - boxH - 8);

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

function drawNodeCards(
  ctx: CanvasRenderingContext2D,
  layout: DagLayout,
  nodeCounts: Record<FlowNodeId, number>,
  activeEvent: FlowTraceEvent | null,
  clampedActiveIndex: number,
  totalEvents: number,
  selectedNode: FlowNodeId | null,
  hoveredNode: FlowNodeId | null
): void {
  const activePathSet = new Set<FlowNodeId>(activeEvent?.pathNodes ?? []);

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
    if (nodeId !== 'TASK_IN' && nodeId !== 'QUARANTINE_VAULT') {
      ctx.fillRect(rect.cx - 2, rect.top - 1.5, 4, 3);
    }
    if (nodeId === 'QUARANTINE_VAULT') {
      ctx.fillRect(rect.left - 1.5, rect.cy - 2, 3, 4);
    }
    if (nodeId === 'ORACLE_VERIFIER') {
      ctx.fillRect(rect.right - 1.5, rect.cy - 2, 3, 4);
      ctx.fillRect(rect.cx - 2, rect.bottom - 1.5, 4, 3);
    } else if (
      nodeId === 'TASK_IN' ||
      nodeId === 'FAST_CLOCK' ||
      nodeId === 'QUARANTINE_VAULT' ||
      nodeId === 'SLOW_CLOCK_GATE'
    ) {
      ctx.fillRect(rect.cx - 2, rect.bottom - 1.5, 4, 3);
    }

    const innerLeft = rect.left + 9;
    const innerRight = rect.right - 8;
    const titleY = rect.top + rect.h * 0.35;
    const subY = rect.top + rect.h * 0.71;

    // Count pill on top-right
    const countLabel = `${count}`;
    ctx.font = `600 9px ${FONT_MONO}`;
    const countW = ctx.measureText(countLabel).width;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle =
      count > 0 ? (isOnActivePath ? meta.accent : PALETTE.textSecondary) : PALETTE.textDim;
    ctx.fillText(countLabel, innerRight, titleY);

    // Node Title
    const titleMaxW = rect.w - 20 - countW;
    ctx.font = `600 10px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = isOnActivePath || isSelected ? PALETTE.textPrimary : PALETTE.textSecondary;
    ctx.fillText(truncateText(ctx, meta.title, titleMaxW), innerLeft, titleY);

    // Node Telemetry Subline
    const subMaxW = rect.w - 17;
    ctx.font = `500 9px ${FONT_MONO}`;
    let subText = meta.defaultSub;
    let subColor: string = PALETTE.textMuted;

    if (activeEvent) {
      if (nodeId === 'TASK_IN') {
        subText = `${activeEvent.taskId} · ${clampedActiveIndex + 1}/${totalEvents}`;
        subColor = PALETTE.textSecondary;
      } else if (nodeId === 'FAST_CLOCK') {
        subText = `K=4 · -${activeEvent.promptDelta.reductionPct.toFixed(0)}% TOK · ${activeEvent.promptDelta.lexicalLockPct.toFixed(0)}% LOCK`;
        subColor = PALETTE.textSecondary;
      } else if (nodeId === 'ORACLE_VERIFIER') {
        if (activeEvent.kind === 'redteam_probe') {
          subText = `PROBE · ${activeEvent.redTeam?.triggerFlag ?? activeEvent.taskId}`;
          subColor = PALETTE.quarantine;
        } else {
          subText = `${activeEvent.passedFactsCount}/${activeEvent.boundFactsCount} FACTS · ${activeEvent.fullTaskPass ? 'PASS' : 'FAIL'}`;
          subColor = activeEvent.fullTaskPass ? PALETTE.pass : PALETTE.fail;
        }
      } else if (nodeId === 'VERIFIED_OUTPUT') {
        subText = `${count} VERIFIED PASS`;
        subColor = count > 0 ? PALETTE.pass : PALETTE.textMuted;
      } else if (nodeId === 'QUARANTINE_VAULT') {
        const badge = isOnActivePath ? getFailureBranchBadgeText(activeEvent) : null;
        subText = badge ? `${count} STAGED · ${badge}` : `${count} STAGED`;
        subColor = count > 0 ? PALETTE.quarantine : PALETTE.textMuted;
      } else if (nodeId === 'SLOW_CLOCK_GATE') {
        if (
          isOnActivePath &&
          (activeEvent.slowClockGate.g1LexicalPassed !== undefined ||
            activeEvent.slowClockGate.g2ConflictPassed !== undefined ||
            activeEvent.slowClockGate.g3CanaryPassed !== undefined)
        ) {
          const g1 = activeEvent.slowClockGate.g1LexicalPassed === false ? '✕' : '✓';
          const g2 = activeEvent.slowClockGate.g2ConflictPassed === false ? '✕' : '✓';
          const g3 = activeEvent.slowClockGate.g3CanaryPassed === false ? '✕' : '✓';
          subText = `G1${g1} G2${g2} G3${g3} · ${activeEvent.slowClockGate.status.toUpperCase()}`;
          subColor =
            activeEvent.slowClockGate.status === 'approved'
              ? PALETTE.pass
              : activeEvent.slowClockGate.status === 'rejected'
                ? PALETTE.fail
                : PALETTE.quarantine;
        } else {
          subText = `G1·G2·G3 · ${count} AUDITS`;
          subColor = count > 0 ? PALETTE.quarantine : PALETTE.textMuted;
        }
      } else if (nodeId === 'GATE_APPROVED') {
        subText = `${count} PROMOTED`;
        subColor = count > 0 ? PALETTE.pass : PALETTE.textMuted;
      } else if (nodeId === 'GATE_REJECTED') {
        subText = `${count} BLOCKED`;
        subColor = count > 0 ? PALETTE.fail : PALETTE.textMuted;
      }
    }

    ctx.fillStyle = subColor;
    ctx.fillText(truncateText(ctx, subText, subMaxW), innerLeft, subY);
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
  nodeCounts: Record<FlowNodeId, number>
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
    const meta = NODE_META[hover.nodeId];
    accent = meta.accent;
    line1 = `${meta.title} · ${nodeCounts[hover.nodeId]} traces`;
    line2 = `${meta.defaultSub} · Click to filter`;
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

  const nodeCounts = useMemo(() => {
    const counts: Record<FlowNodeId, number> = {
      TASK_IN: 0,
      FAST_CLOCK: 0,
      ORACLE_VERIFIER: 0,
      VERIFIED_OUTPUT: 0,
      QUARANTINE_VAULT: 0,
      SLOW_CLOCK_GATE: 0,
      GATE_APPROVED: 0,
      GATE_REJECTED: 0,
    };
    for (let i = 0; i <= clampedActiveIndex; i += 1) {
      const ev = events[i];
      if (!ev) continue;
      for (const n of ev.pathNodes) {
        if (isKnownNodeId(n)) {
          counts[n] += 1;
        }
      }
    }
    return counts;
  }, [events, clampedActiveIndex]);

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
        const segSteps = 8;
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
            ctx.moveTo(curve.p0.x, curve.p0.y);
            ctx.bezierCurveTo(
              curve.cp1.x,
              curve.cp1.y,
              curve.cp2.x,
              curve.cp2.y,
              curve.p1.x,
              curve.p1.y
            );
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
        nodeCounts,
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
        ? `ACTIVE #${clampedActiveIndex + 1}/${events.length} · ${activeEvent.taskId} · ${activeEvent.pathNodes.join(' → ')}`
        : 'WAITING FOR REAL TRACE TELEMETRY';
      ctx.fillText(truncateText(ctx, footerLeft, layout.width - 28), 14, layout.height - 13);

      // Hover tooltip
      if (currentHover) {
        drawTooltip(ctx, layout, currentHover, events, nodeCounts);
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
      className="relative w-full h-full min-h-[420px] bg-[#090b0f] select-none overflow-hidden"
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
