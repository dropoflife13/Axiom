import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyBoundFacts } from '../scripts/apply-bound-facts.js';
import { rescoreDevBaseline } from '../scripts/rescore-dev-baseline.js';
import { buildBoundFactProposal } from '../scripts/propose-bound-facts.js';
import { buildMemoryProposal } from '../scripts/build-sql-memory.js';
import {
  assertScopedCleanGitTree,
  computeTaskContentSha256,
  parseGuardedDirtyPaths,
} from '../scripts/calibration-common.js';
import { assertRunMetadataMatches, verifyCalibrationContentHashes } from '../src/eval/ablation.js';

describe('bound-fact preparation safeguards', () => {
  it('excludes non-applicable and non-view F-39 candidates', () => {
    const task = {
      id: 'T-001',
      split: 'train' as const,
      cohortId: 'C1',
      table: 'items',
      prompt: 'Create a table.',
      features: { tenant: false, append_only: false, ingestion: false },
      boundFacts: [],
      goldenSql: 'CREATE TABLE public.items (id uuid);',
    };
    const result = buildBoundFactProposal(
      { train: [task], dev: [], test: [] },
      { factStats: [
        { factId: 'F-12', applicableCount: 1, passRate: 0.5 },
        { factId: 'F-39', applicableCount: 1, passRate: 0.5 },
      ] }
    );
    expect(result.proposed['T-001']).not.toContain('F-12');
    expect(result.proposed['T-001']).not.toContain('F-39');
    expect(result.tasksWithFewerThanThreeValidCandidates).toEqual(['T-001']);
  });

  it('applies only a matching reviewed proposal and records the new hash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-bound-'));
    const tasksPath = path.join(dir, 'tasks.json');
    const proposalPath = path.join(dir, 'proposal.json');
    const changelogPath = path.join(dir, 'changelog.md');
    fs.writeFileSync(tasksPath, JSON.stringify({ train: [{ id: 'T-1', boundFacts: ['F-01'] }], dev: [], test: [] }));
    const hash = crypto.createHash('sha256').update(fs.readFileSync(tasksPath)).digest('hex');
    fs.writeFileSync(proposalPath, JSON.stringify({ tasksSha256: hash, boundFacts: { 'T-1': ['F-02'] } }));
    fs.writeFileSync(changelogPath, '');
    const after = applyBoundFacts(proposalPath, tasksPath, changelogPath, () => '');
    expect(after).not.toBe(hash);
    expect(JSON.parse(fs.readFileSync(tasksPath, 'utf8')).train[0].boundFacts).toEqual(['F-02']);
    expect(fs.readFileSync(changelogPath, 'utf8')).toMatch(/49 bound-fact occurrences/);
  });

  it('rescores current bound facts offline', () => {
    const result = rescoreDevBaseline(
      { taskReports: [{ taskId: 'D-1', failedFacts: ['F-01'] }, { taskId: 'D-2', failedFacts: [] }] },
      { dev: [{ id: 'D-1', boundFacts: ['F-01', 'F-02'] }, { id: 'D-2', boundFacts: ['F-01'] }] }
    );
    expect(result.n).toBe(2);
    expect(result.meanBoundFactFraction).toBe(0.75);
    expect(result.strictPassAt1).toBe(0.5);
  });

  it('rejects mismatched checkpoint provenance', () => {
    const metadata = { oracleSha256: 'a', tasksSha256: 'b', factsSha256: 'c', memorySha256: 'd', gitCommit: 'e' };
    expect(() => assertRunMetadataMatches(metadata, { ...metadata, tasksSha256: 'changed' })).toThrow(/tasksSha256/);
  });

  it('enforces scoped dirty-tree guard on mocked git status outputs', () => {
    // 1. Clean git status
    expect(() =>
      assertScopedCleanGitTree({ gitStatus: () => '' })
    ).not.toThrow();

    // 2. Modified src/ file trips guard
    expect(() =>
      assertScopedCleanGitTree({ gitStatus: () => ' M src/executor.ts\n' })
    ).toThrow(/src\/executor\.ts/);

    // 3. Untracked script under scripts/ trips guard
    expect(() =>
      assertScopedCleanGitTree({ gitStatus: () => '?? scripts/untracked-helper.ts\n' })
    ).toThrow(/scripts\/untracked-helper\.ts/);

    // 4. Output files under out/, .axiom-state/, and .axiom-cache/ do NOT trip guard
    const unguardedOutput = [
      '?? out/dev-calibration.json',
      ' D out/condition-a-dev-calibration-old.json',
      ' M .axiom-state/memory.json',
      '?? .axiom-cache/entry.json',
    ].join('\n');
    expect(parseGuardedDirtyPaths(unguardedOutput)).toEqual([]);
    expect(() =>
      assertScopedCleanGitTree({ gitStatus: () => unguardedOutput })
    ).not.toThrow();
  });

  it('preserves taskContentSha256 across boundFacts-only edits and invalidates on prompt change', async () => {
    const baseTasks = {
      train: [
        {
          id: 'T-001',
          split: 'train' as const,
          cohortId: 'C1',
          table: 'items',
          prompt: 'Create an items table.',
          features: { tenant: false, append_only: false, ingestion: false },
          boundFacts: ['F-01', 'F-02', 'F-03'],
          goldenSql: 'CREATE TABLE public.items (id uuid PRIMARY KEY);',
        },
      ],
      dev: [
        {
          id: 'D-001',
          split: 'dev' as const,
          cohortId: 'C1',
          table: 'orders',
          prompt: 'Create an orders table.',
          features: { tenant: false, append_only: false, ingestion: false },
          boundFacts: ['F-01', 'F-02', 'F-03'],
          goldenSql: 'CREATE TABLE public.orders (id uuid PRIMARY KEY);',
        },
      ],
      test: [],
    };
    const boundFactsUpdatedTasks = {
      ...baseTasks,
      train: [{ ...baseTasks.train[0], boundFacts: ['F-04', 'F-05', 'F-06'] }],
      dev: [{ ...baseTasks.dev[0], boundFacts: ['F-01', 'F-04', 'F-05'] }],
    };
    const promptUpdatedTasks = {
      ...baseTasks,
      train: [{ ...baseTasks.train[0], prompt: 'Create an items table with a status column.' }],
    };

    const contentHashBase = computeTaskContentSha256(baseTasks);
    const contentHashBoundOnly = computeTaskContentSha256(boundFactsUpdatedTasks);
    const contentHashPromptChanged = computeTaskContentSha256(promptUpdatedTasks);

    expect(contentHashBoundOnly).toBe(contentHashBase);
    expect(contentHashPromptChanged).not.toBe(contentHashBase);

    const fullHashBase = crypto.createHash('sha256').update(JSON.stringify(baseTasks)).digest('hex');
    const fullHashBoundOnly = crypto.createHash('sha256').update(JSON.stringify(boundFactsUpdatedTasks)).digest('hex');
    expect(fullHashBoundOnly).not.toBe(fullHashBase);

    // Calibration recorded against baseTasks remains valid when only boundFacts change
    const calibration = {
      taskContentSha256: contentHashBase,
      tasksSha256: fullHashBase,
      factStats: [{ factId: 'F-01', applicableCount: 1, failedCount: 0, passRate: 1 }],
      taskReports: [
        {
          taskId: 'D-001',
          failedFacts: ['F-01'],
          applicableFacts: ['F-01'],
          features: { tenant: false, append_only: false, ingestion: false },
        },
      ],
    };

    expect(() => buildBoundFactProposal(boundFactsUpdatedTasks, calibration)).not.toThrow();
    await expect(
      buildMemoryProposal(calibration, false, undefined, boundFactsUpdatedTasks)
    ).resolves.toHaveLength(1);
    expect(() => rescoreDevBaseline(calibration, boundFactsUpdatedTasks)).not.toThrow();
    expect(() =>
      verifyCalibrationContentHashes(boundFactsUpdatedTasks, [calibration])
    ).not.toThrow();

    // Prompt change invalidates calibration across all consumers
    expect(() => buildBoundFactProposal(promptUpdatedTasks, calibration)).toThrow(/taskContentSha256/);
    await expect(
      buildMemoryProposal(calibration, false, undefined, promptUpdatedTasks)
    ).rejects.toThrow(/taskContentSha256/);
    expect(() => rescoreDevBaseline(calibration, promptUpdatedTasks)).toThrow(/taskContentSha256/);
    expect(() =>
      verifyCalibrationContentHashes(promptUpdatedTasks, [calibration])
    ).toThrow(/taskContentSha256/);
  });
});
