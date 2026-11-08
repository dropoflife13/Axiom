import { describe, expect, it } from 'vitest';

export interface Part {
  id: string;
  name: string;
  tag: string;
  desc: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  c: string;
}

export const PARTS: Part[] = [
  { id: '01', name: 'TASK GENERATOR', tag: '40 TRAIN · 40 DEV · 120 TEST', desc: 'Seeded tasks with strict schema variants. Never corrected SQL.', x: 0.4, y: 5.2, w: 2.4, d: 1.9, h: 1.2, c: '#a855f7' },
  { id: '02', name: 'EXECUTOR', tag: 'LLM · TEMP 0 · OPENAI COMPAT', desc: 'An LLM behind an OpenAI-compatible client, temperature 0.', x: 0.4, y: 2.4, w: 2.4, d: 1.9, h: 1.2, c: '#d946ef' },
  { id: '03', name: 'VERDICT', tag: 'FAILURES AS FACTS · NO SQL', desc: 'Reports each failure as a fact ID and one-line statement, never corrected SQL.', x: 3.4, y: 0.3, w: 2.4, d: 1.7, h: 1.0, c: '#f43f5e' },
  { id: '04', name: 'ADVISOR', tag: '1 LESSON PER RETRY PASS', desc: 'Writes one lesson from a failed verdict only when the retry passes.', x: 6.6, y: 0.3, w: 2.4, d: 1.7, h: 1.0, c: '#f59e0b' },
  { id: '05', name: 'RETRIEVAL', tag: 'TOP K=6 · FEATURE OVERLAP', desc: 'Picks the top k=6 lessons by feature-flag overlap before attempt 1.', x: 3.4, y: 5.9, w: 2.4, d: 1.7, h: 1.0, c: '#06b6d4' },
  { id: '06', name: 'ORACLE', tag: 'PG 16 · ROLE-SEPARATED CHECKS', desc: 'PostgreSQL 16 in a container with fresh databases and role-separated checks.', x: 3.8, y: 2.8, w: 2.4, d: 2.4, h: 1.8, c: '#38bdf8' },
  { id: '07', name: 'MEMORY', tag: 'EARNED LESSONS ONLY', desc: 'Stores the lessons that have earned their place.', x: 7.0, y: 2.9, w: 2.4, d: 1.9, h: 1.2, c: '#10b981' },
  { id: '08', name: 'GUARDRAILS', tag: 'BUDGET · BACKOFF · CACHE', desc: 'Fails closed on daily budget limits, backs off rate limits, and caches responses.', x: 6.6, y: 5.9, w: 2.4, d: 1.7, h: 1.0, c: '#eab308' },
  { id: '09', name: 'QUARANTINE', tag: 'CANDIDATES ONLY · NO DIRECT WRITE', desc: 'Keeps generated rules as candidates until a human promotes them.', x: 0.4, y: 0.1, w: 2.4, d: 1.9, h: 1.0, c: '#64748b' },
];

export const PART_MAP = Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<string, Part>;

export const ROUTES: Record<string, [number, number][]> = {
  '02': [[3.8, 3.35], [2.8, 3.35]],
  '01': [[3.8, 4.6], [3.1, 4.6], [3.1, 6.15], [2.8, 6.15]],
  '09': [[3.8, 3.0], [3.1, 3.0], [3.1, 1.05], [2.8, 1.05]],
  '03': [[4.6, 2.8], [4.6, 2.0]],
  '04': [[5.6, 2.8], [5.6, 2.4], [7.8, 2.4], [7.8, 2.0]],
  '07': [[6.2, 3.85], [7.0, 3.85]],
  '05': [[4.6, 5.2], [4.6, 5.9]],
  '08': [[5.6, 5.2], [5.6, 5.55], [7.8, 5.55], [7.8, 5.9]],
};

/**
 * Checks if a 2D line segment between p1 and p2 intersects the interior
 * of an axis-aligned box [x, x+w] x [y, y+d].
 * Endpoints touching the box perimeter are allowed (ports).
 */
export function segmentIntersectsBoxInterior(
  p1: [number, number],
  p2: [number, number],
  box: { x: number; y: number; w: number; d: number }
): boolean {
  const eps = 1e-6;
  const minBoxX = box.x + eps;
  const maxBoxX = box.x + box.w - eps;
  const minBoxY = box.y + eps;
  const maxBoxY = box.y + box.d - eps;

  if (minBoxX >= maxBoxX || minBoxY >= maxBoxY) return false;

  const [x1, y1] = p1;
  const [x2, y2] = p2;

  // Segment is vertical
  if (Math.abs(x1 - x2) < 1e-9) {
    const segX = x1;
    if (segX <= minBoxX || segX >= maxBoxX) return false;
    const segMinY = Math.min(y1, y2);
    const segMaxY = Math.max(y1, y2);
    return Math.max(segMinY, minBoxY) < Math.min(segMaxY, maxBoxY);
  }

  // Segment is horizontal
  if (Math.abs(y1 - y2) < 1e-9) {
    const segY = y1;
    if (segY <= minBoxY || segY >= maxBoxY) return false;
    const segMinX = Math.min(x1, x2);
    const segMaxX = Math.max(x1, x2);
    return Math.max(segMinX, minBoxX) < Math.min(segMaxX, maxBoxX);
  }

  // General diagonal segment
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);

  if (segMaxX <= minBoxX || segMinX >= maxBoxX || segMaxY <= minBoxY || segMinY >= maxBoxY) {
    return false;
  }

  // Line equation: y = m*x + c
  const m = (y2 - y1) / (x2 - x1);
  const c = y1 - m * x1;

  // Check intersections with vertical sides
  const yAtMinX = m * minBoxX + c;
  if (yAtMinX > minBoxY && yAtMinX < maxBoxY && minBoxX >= segMinX && minBoxX <= segMaxX) return true;
  const yAtMaxX = m * maxBoxX + c;
  if (yAtMaxX > minBoxY && yAtMaxX < maxBoxY && maxBoxX >= segMinX && maxBoxX <= segMaxX) return true;

  // Check intersections with horizontal sides
  const xAtMinY = (minBoxY - c) / m;
  if (xAtMinY > minBoxX && xAtMinY < maxBoxX && minBoxY >= segMinY && minBoxY <= segMaxY) return true;
  const xAtMaxY = (maxBoxY - c) / m;
  if (xAtMaxY > minBoxX && xAtMaxY < maxBoxX && maxBoxY >= segMinY && maxBoxY <= segMaxY) return true;

  return false;
}

describe('Anatomy Circuit Routes Specification', () => {
  const oracle = PART_MAP['06'];

  it('all destination ports coincide with the nearest edge midpoint of the destination block', () => {
    // 01: right edge midpoint (x = x + w = 0.4 + 2.4 = 2.8, y = 5.2 + 1.9/2 = 6.15)
    const p01 = PART_MAP['01'];
    expect(p01.x + p01.w).toBeCloseTo(2.8);
    expect(p01.y + p01.d / 2).toBeCloseTo(6.15);

    // 02: right edge midpoint (x = 2.8, y = 2.4 + 1.9/2 = 3.35)
    const p02 = PART_MAP['02'];
    expect(p02.x + p02.w).toBeCloseTo(2.8);
    expect(p02.y + p02.d / 2).toBeCloseTo(3.35);

    // 09: right edge midpoint (x = 2.8, y = 0.1 + 1.9/2 = 1.05)
    const p09 = PART_MAP['09'];
    expect(p09.x + p09.w).toBeCloseTo(2.8);
    expect(p09.y + p09.d / 2).toBeCloseTo(1.05);

    // 03: bottom edge midpoint (x = 3.4 + 2.4/2 = 4.6, y = y + d = 0.3 + 1.7 = 2.0)
    const p03 = PART_MAP['03'];
    expect(p03.x + p03.w / 2).toBeCloseTo(4.6);
    expect(p03.y + p03.d).toBeCloseTo(2.0);

    // 04: bottom edge midpoint (x = 6.6 + 2.4/2 = 7.8, y = 0.3 + 1.7 = 2.0)
    const p04 = PART_MAP['04'];
    expect(p04.x + p04.w / 2).toBeCloseTo(7.8);
    expect(p04.y + p04.d).toBeCloseTo(2.0);

    // 07: left edge midpoint (x = 7.0, y = 2.9 + 1.9/2 = 3.85)
    const p07 = PART_MAP['07'];
    expect(p07.x).toBeCloseTo(7.0);
    expect(p07.y + p07.d / 2).toBeCloseTo(3.85);

    // 05: top edge midpoint (x = 3.4 + 2.4/2 = 4.6, y = 5.9)
    const p05 = PART_MAP['05'];
    expect(p05.x + p05.w / 2).toBeCloseTo(4.6);
    expect(p05.y).toBeCloseTo(5.9);

    // 08: top edge midpoint (x = 6.6 + 2.4/2 = 7.8, y = 5.9)
    const p08 = PART_MAP['08'];
    expect(p08.x + p08.w / 2).toBeCloseTo(7.8);
    expect(p08.y).toBeCloseTo(5.9);
  });

  it('all starting points lie strictly on the perimeter of Oracle (06)', () => {
    Object.entries(ROUTES).forEach(([destId, pts]) => {
      const [sx, sy] = pts[0];
      const onWest = Math.abs(sx - oracle.x) < 1e-4 && sy >= oracle.y && sy <= oracle.y + oracle.d;
      const onEast = Math.abs(sx - (oracle.x + oracle.w)) < 1e-4 && sy >= oracle.y && sy <= oracle.y + oracle.d;
      const onNorth = Math.abs(sy - oracle.y) < 1e-4 && sx >= oracle.x && sx <= oracle.x + oracle.w;
      const onSouth = Math.abs(sy - (oracle.y + oracle.d)) < 1e-4 && sx >= oracle.x && sx <= oracle.x + oracle.w;
      expect(onWest || onEast || onNorth || onSouth, `Route to ${destId} start (${sx}, ${sy}) is not on Oracle perimeter`).toBe(true);
    });
  });

  it('no route segment intersects the interior of any block footprint', () => {
    Object.entries(ROUTES).forEach(([destId, pts]) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const segStart = pts[i];
        const segEnd = pts[i + 1];
        PARTS.forEach((part) => {
          const intersects = segmentIntersectsBoxInterior(segStart, segEnd, part);
          expect(
            intersects,
            `Route ${destId} segment [${segStart.join(',')}] -> [${segEnd.join(',')}] intersects block ${part.id} (${part.name})`
          ).toBe(false);
        });
      }
    });
  });
});
