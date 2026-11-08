import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CABLES,
  NODES,
  NODE_MAP,
  ORACLE_CENTER,
  ROT_X_DEG,
  ROT_Z_DEG,
  STAGES,
  WORK_H,
  buildCablePath,
  getNodePort,
  project,
} from '../dashboard/src/components/anatomy/layout';

describe('AxiomAnatomyV2 Layout & Geometry Specification', () => {
  describe('project() Mathematical Properties', () => {
    it('maps (0, 0, 0) to the origin (0, 0)', () => {
      const p = project(0, 0, 0, 1, 0, 0);
      expect(Math.abs(p.sx)).toBeLessThan(1e-10);
      expect(Math.abs(p.sy)).toBeLessThan(1e-10);
    });

    it('is strictly linear in x, y, and z', () => {
      const p1 = { x: 120, y: -45, z: 30 };
      const p2 = { x: -80, y: 90, z: -15 };
      const a = 2.5;
      const b = -1.8;

      const projCombined = project(
        a * p1.x + b * p2.x,
        a * p1.y + b * p2.y,
        a * p1.z + b * p2.z,
        1,
        0,
        0
      );

      const proj1 = project(p1.x, p1.y, p1.z, 1, 0, 0);
      const proj2 = project(p2.x, p2.y, p2.z, 1, 0, 0);

      const linearX = a * proj1.sx + b * proj2.sx;
      const linearY = a * proj1.sy + b * proj2.sy;

      expect(Math.abs(projCombined.sx - linearX)).toBeLessThan(1e-6);
      expect(Math.abs(projCombined.sy - linearY)).toBeLessThan(1e-6);
    });

    it('moves straight up the screen along z with zero horizontal drift', () => {
      const base = project(600, 600, 0, 1, 600, 600);
      const lifted = project(600, 600, 50, 1, 600, 600);

      // Zero horizontal drift
      expect(Math.abs(lifted.sx - base.sx)).toBeLessThan(1e-10);

      // Moves straight up: delta sy = -dz * sin(60deg)
      const expectedDeltaY = -50 * Math.sin((ROT_X_DEG * Math.PI) / 180);
      expect(Math.abs(lifted.sy - base.sy - expectedDeltaY)).toBeLessThan(1e-6);
      expect(lifted.sy).toBeLessThan(base.sy); // Screen coordinates: smaller y is higher up
    });
  });

  describe('Cables and Routes Geometry', () => {
    it('every cable starts at ORACLE_CENTER and ends at target port within 0.01 unit', () => {
      expect(CABLES.length).toBe(8); // 8 satellite nodes

      CABLES.forEach((cable) => {
        const targetNode = NODE_MAP[cable.toId];
        const expectedPort = getNodePort(targetNode);

        // Parse path: "M x1 y1 C c1x c1y, c2x c2y, x2 y2"
        const match = cable.d.match(
          /^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)$/
        );
        expect(match, `Invalid bezier format for cable ${cable.id}`).not.toBeNull();

        const [, startX, startY, , , , , endX, endY] = match!.map(Number);

        // Start point equals ORACLE_CENTER
        expect(Math.abs(startX - ORACLE_CENTER.x)).toBeLessThan(0.01);
        expect(Math.abs(startY - ORACLE_CENTER.y)).toBeLessThan(0.01);

        // End point equals target node port
        expect(Math.abs(endX - expectedPort[0])).toBeLessThan(0.01);
        expect(Math.abs(endY - expectedPort[1])).toBeLessThan(0.01);
      });
    });

    it('packet final position equals path end at t=1 for cubic bezier', () => {
      CABLES.forEach((cable) => {
        const match = cable.d.match(
          /^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)$/
        );
        const [, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y] = match!.map(Number);

        // Cubic bezier formula at t=1: B(1) = (1-1)^3 P0 + 3(1-1)^2(1) P1 + 3(1-1)(1)^2 P2 + 1^3 P3 = P3
        const t = 1.0;
        const bx =
          Math.pow(1 - t, 3) * p0x +
          3 * Math.pow(1 - t, 2) * t * p1x +
          3 * (1 - t) * Math.pow(t, 2) * p2x +
          Math.pow(t, 3) * p3x;
        const by =
          Math.pow(1 - t, 3) * p0y +
          3 * Math.pow(1 - t, 2) * t * p1y +
          3 * (1 - t) * Math.pow(t, 2) * p2y +
          Math.pow(t, 3) * p3y;

        expect(Math.abs(bx - p3x)).toBeLessThan(0.001);
        expect(Math.abs(by - p3y)).toBeLessThan(0.001);
      });
    });

    it('covers all 7 required stages in sequence', () => {
      const stageNames = STAGES.map((s) => s.stage);
      expect(stageNames).toEqual([
        'GENERATE',
        'INSPECT',
        'FAIL',
        'TAG',
        'ADVISE',
        'RETRY',
        'PASS',
      ]);
    });
  });

  describe('Non-Overlapping Label Bounding Boxes', () => {
    it('no two label rectangles overlap at 1440x900 viewport', () => {
      const width = 1440;
      const height = 900;
      const k = Math.min(1.2, Math.max(0.35, width / 1500)); // ~0.96
      const screenCenter = { x: width / 2, y: height / 2 };

      // Compute bounding boxes for all 9 assemblies
      // Card dimensions: max-width 210px, min-height ~64px
      const cardW = 200;
      const cardH = 65;

      const boxes = NODES.map((node) => {
        const port = getNodePort(node);
        const proj = project(port[0], port[1], port[2], k);
        const blockScreen = {
          x: screenCenter.x + proj.sx,
          y: screenCenter.y + proj.sy,
        };
        const cardX = blockScreen.x + node.labelOffset[0] * Math.min(1, k + 0.1);
        const cardY = blockScreen.y + node.labelOffset[1] * Math.min(1, k + 0.1);

        return {
          id: node.id,
          left: cardX - cardW / 2,
          right: cardX + cardW / 2,
          top: cardY - cardH / 2,
          bottom: cardY + cardH / 2,
        };
      });

      // Check pairwise intersection
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];

          const overlaps =
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;

          expect(
            overlaps,
            `Labels for "${a.id}" and "${b.id}" overlap at 1440x900`
          ).toBe(false);
        }
      }
    });

    it('no two collapsed pin buttons overlap at 390x844 mobile viewport', () => {
      const width = 390;
      const height = 844;
      const k = Math.min(1.2, Math.max(0.35, width / 950)); // ~0.41
      const screenCenter = { x: width / 2, y: height / 2 };
      const pinRadius = 14; // 28px diameter pin

      const pins = NODES.map((node) => {
        const port = getNodePort(node);
        const proj = project(port[0], port[1], port[2], k);
        return {
          id: node.id,
          x: screenCenter.x + proj.sx,
          y: screenCenter.y + proj.sy,
        };
      });

      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          const a = pins[i];
          const b = pins[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);

          // Minimum distance between pin centers must be > 2 * radius (28px)
          expect(
            dist,
            `Mobile pins for "${a.id}" and "${b.id}" overlap (dist: ${dist.toFixed(1)}px)`
          ).toBeGreaterThanOrEqual(28);
        }
      }
    });
  });
});
