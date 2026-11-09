import { describe, expect, it } from 'vitest';
import { deriveDesk, TOTAL_TRIALS, type CheckpointTrial } from '../dashboard/src/lib/desk';

const trial = (o: Partial<CheckpointTrial>): CheckpointTrial => ({ condition: 'A', taskId: 'H-001', ...o });

describe('trading desk derivation', () => {
  it('reports an empty, honest state with no trials', () => {
    const d = deriveDesk([]);
    expect(d.done).toBe(0);
    expect(d.convergence).toBeNull();
    expect(d.latency).toBeNull();
    expect(d.cells).toHaveLength(TOTAL_TRIALS);
    expect(d.cells.every((c) => c === 'pending')).toBe(true);
  });

  it('computes mean bound fraction and places cells condition-major', () => {
    const d = deriveDesk([
      trial({ boundFactFraction: 0.2, failedFacts: ['F-03', 'F-15'], totalTokens: 852 }),
      trial({ condition: 'B', boundFactFraction: 1, boundPassed: true, totalTokens: 2022 }),
    ]);
    expect(d.convergence).toBeCloseTo(0.6);
    expect(d.cells[0]).toBe('fail');
    expect(d.cells[120]).toBe('pass');
    expect(d.passed).toBe(1);
    expect(d.totalTokens).toBe(2874);
    expect(d.log.map((l) => l.status)).toEqual(['OK', 'FAIL', 'OK', 'OK']);
  });

  it('only reports latency when every trial records it', () => {
    expect(deriveDesk([trial({ latencyMs: 10 }), trial({ taskId: 'H-002' })]).latency).toBeNull();
    expect(deriveDesk([trial({ latencyMs: 10 })]).latency).toEqual([10]);
  });

  it('lists active facts from the latest trial and counts memory hits', () => {
    const d = deriveDesk([trial({ failedFacts: ['F-19'], boundFacts: ['F-26', 'F-19'], retrievedFactIds: ['F-1', 'F-2'] })]);
    expect(d.activeFacts).toEqual(['F-19', 'F-26']);
    expect(d.memoryHits).toEqual([2]);
  });

  it('generates distinct sequential historical timestamps for log lines', () => {
    const d = deriveDesk([
      trial({ taskId: 'H-001', condition: 'A' }),
      trial({ taskId: 'H-002', condition: 'A' }),
    ], 60, TOTAL_TRIALS, '2026-11-10T02:00:00.000Z');
    expect(d.log.length).toBeGreaterThan(0);
    for (const line of d.log) {
      expect(line.stamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    }
    expect(d.log[0].stamp).toBeDefined();
    expect(d.log[d.log.length - 1].stamp).toBeDefined();
  });
});
