import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadReadOnlyMemorySnapshot,
  retrieveLessonsByFeatures,
  type FeatureFlags,
} from '../src/memory.js';
import {
  collectTransitivePrerequisites,
  DEFAULT_POSTGRES_PREREQUISITE_GRAPH,
  retrieveWithPrerequisites,
  type PrerequisiteGraph,
} from '../src/v4/prerequisite-retriever.js';

interface V3TaskFixture {
  id: string;
  cohortId: string;
  features: FeatureFlags;
  applicableFacts: string[];
  boundFacts: string[];
}

describe('v4 Prerequisite-Aware Retrieval (src/v4/prerequisite-retriever.ts)', () => {
  it('strictly enforces Top-K budget with zero duplicates and evicts lowest-ranked non-prerequisites', () => {
    const graph: PrerequisiteGraph = {
      'F-36': ['F-01', 'F-05'],
      'F-37': ['F-01', 'F-05'],
    };
    const ranked = [
      'F-19', 'F-20', 'F-25', 'F-26', 'F-36',
      'F-37', 'F-03', 'F-16', 'F-18', 'F-17',
      'F-05', 'F-01',
    ];

    const res = retrieveWithPrerequisites(ranked, 10, graph);

    expect(res.selected.length).toBe(10);
    expect(new Set(res.selected).size).toBe(10);
    expect(res.selected).toContain('F-01');
    expect(res.selected).toContain('F-05');
    expect(res.injectedPrerequisites).toEqual(['F-01', 'F-05']);
    // Lowest-ranked tail items F-17 and F-18 must be displaced to keep K=10
    expect(res.displaced).toEqual(['F-17', 'F-18']);
    expect(res.selected).not.toContain('F-17');
    expect(res.selected).not.toContain('F-18');
  });

  it('handles zero budget, duplicate ranked inputs, and saturated tiny budgets safely', () => {
    const graph: PrerequisiteGraph = {
      A: ['P1', 'P2', 'P3'],
    };

    expect(retrieveWithPrerequisites(['A', 'B'], 0, graph)).toEqual({
      selected: [],
      injectedPrerequisites: [],
      displaced: [],
    });

    // Deduplicates input IDs and never exceeds budget K=2 even if 3 prerequisites are declared
    const small = retrieveWithPrerequisites(['A', 'A', 'B', 'C'], 2, graph);
    expect(small.selected.length).toBe(2);
    expect(new Set(small.selected).size).toBe(2);
  });

  it('eliminates F-05 (created_at) displacement across all 33 v3 held-out tasks where F-05 was previously non-retrieved', () => {
    const tasksPath = path.resolve('fixtures', 'task-v3', 'tasks.json');
    const tasks = (
      JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as { test: V3TaskFixture[] }
    ).test;
    const { memory } = loadReadOnlyMemorySnapshot(
      path.resolve('.axiom-state', 'memory-v3-cid.json')
    );

    let baselineDisplacedBoundF05 = 0;
    let v4DisplacedBoundF05 = 0;
    let v4DisplacedAnyF05 = 0;

    for (const task of tasks) {
      const fullRanked = retrieveLessonsByFeatures(
        task.features,
        [...memory],
        memory.length,
        task.applicableFacts,
        true
      ).map((l) => l.factId ?? l.errorCode);

      const baselineTop10 = fullRanked.slice(0, 10);
      const isF05Bound = task.boundFacts.includes('F-05');
      if (isF05Bound && !baselineTop10.includes('F-05')) {
        baselineDisplacedBoundF05++;
      }

      const v4Result = retrieveWithPrerequisites(
        fullRanked,
        10,
        DEFAULT_POSTGRES_PREREQUISITE_GRAPH,
        new Set(task.applicableFacts)
      );

      // Exact K=10 budget enforcement & zero duplicates on every task
      expect(v4Result.selected.length).toBe(Math.min(10, fullRanked.length));
      expect(new Set(v4Result.selected).size).toBe(v4Result.selected.length);

      if (isF05Bound && !v4Result.selected.includes('F-05')) {
        v4DisplacedBoundF05++;
      }
      if (!v4Result.selected.includes('F-05')) {
        v4DisplacedAnyF05++;
      }
    }

    // Confirm we reproduced the exact 33-task v3 displacement baseline and reduced it to 0
    expect(baselineDisplacedBoundF05).toBe(33);
    expect(v4DisplacedBoundF05).toBe(0);
    expect(v4DisplacedAnyF05).toBe(0);
  });

  it('is cycle-safe on self-cycles, 2-cycles, and multi-node circular dependency graphs', () => {
    const cyclicGraph: PrerequisiteGraph = {
      A: ['B', 'A'],
      B: ['C'],
      C: ['A', 'D'],
      D: ['B'],
    };

    const prereqsOfA = collectTransitivePrerequisites('A', cyclicGraph);
    expect(new Set(prereqsOfA)).toEqual(new Set(['B', 'C', 'D']));
    expect(prereqsOfA).not.toContain('A');

    const res = retrieveWithPrerequisites(['A', 'X1', 'X2', 'X3', 'X4'], 4, cyclicGraph);
    expect(res.selected.length).toBe(4);
    expect(new Set(res.selected).size).toBe(4);
    expect(res.selected).toContain('B');
    expect(res.selected).toContain('C');
    expect(res.selected).toContain('D');
  });
});
