import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SQL_V3_RETRIEVAL_TOP_K,
  V3_CONDITIONS,
  buildConditionV3Hint,
  fnv1a32,
  getRunMetadataV3,
  loadV3ContextAssets,
  sampleC0RandFactIds,
  type TaskV3File,
} from '../src/eval/ablation-v3.js';
import { DDL_KEYWORD_REGEX } from '../scripts/v3/d-safe-tips.js';

const ROOT = path.resolve('.');

describe('Ablation v3 Harness & Confirmatory Split', () => {
  const tasksV2 = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'fixtures', 'task-v2', 'tasks.json'), 'utf8')
  ) as TaskV3File;
  const tasksV3 = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'fixtures', 'task-v3', 'tasks.json'), 'utf8')
  ) as TaskV3File;
  const { assets } = loadV3ContextAssets(ROOT);

  it('preserves train and dev splits verbatim from v2 and creates 120 balanced V3-H-* test tasks with zero noun overlap', () => {
    expect(tasksV3.train).toEqual(tasksV2.train);
    expect(tasksV3.dev).toEqual(tasksV2.dev);
    expect(tasksV3.test).toHaveLength(120);
    expect(tasksV3.test[0].id).toBe('V3-H-001');
    expect(tasksV3.test[119].id).toBe('V3-H-120');

    // Strictly balanced at 15 tasks per cell across the 8 {tenant, append_only, ingestion} combinations
    const cellCounts = new Map<string, number>();
    for (const t of tasksV3.test) {
      const cellKey = `${Boolean(t.features.tenant)}|${Boolean(t.features.append_only)}|${Boolean(t.features.ingestion)}`;
      cellCounts.set(cellKey, (cellCounts.get(cellKey) ?? 0) + 1);
    }
    expect(cellCounts.size).toBe(8);
    for (const count of cellCounts.values()) {
      expect(count).toBe(15);
    }

    // Zero table-noun overlap with v2 test tasks (and all 200 v2 tasks)
    const v2TestNouns = new Set(tasksV2.test.map((t) => t.table));
    const v2AllNouns = new Set([
      ...tasksV2.train.map((t) => t.table),
      ...tasksV2.dev.map((t) => t.table),
      ...tasksV2.test.map((t) => t.table),
    ]);
    const v3TestNouns = tasksV3.test.map((t) => t.table);
    expect(new Set(v3TestNouns).size).toBe(120);
    for (const noun of v3TestNouns) {
      expect(v2TestNouns.has(noun)).toBe(false);
      expect(v2AllNouns.has(noun)).toBe(false);
      expect(noun).toMatch(/^[a-z]+(_[a-z]+)*s$/);
    }
  });

  it('retrieves the exact same Top-10 fact IDs across C, C0, C0_clean, and C_ID for every V3-H-* task', () => {
    for (const task of tasksV3.test) {
      const c = buildConditionV3Hint('C', task, assets);
      const c0 = buildConditionV3Hint('C0', task, assets);
      const c0Clean = buildConditionV3Hint('C0_clean', task, assets);
      const cId = buildConditionV3Hint('C_ID', task, assets);

      expect(c.retrievedFactIds.length).toBeGreaterThan(0);
      expect(c.retrievedFactIds.length).toBeLessThanOrEqual(SQL_V3_RETRIEVAL_TOP_K);
      expect(c0.retrievedFactIds).toEqual(c.retrievedFactIds);
      expect(c0Clean.retrievedFactIds).toEqual(c.retrievedFactIds);
      expect(cId.retrievedFactIds).toEqual(c.retrievedFactIds);
    }
  });

  it('samples K=10 distinct active v3 facts deterministically for C0_rand using FNV-1a', () => {
    const activeIds = assets.factsV3.activeFacts.map((f) => f.id);
    expect(activeIds).toHaveLength(34);

    const sample1 = sampleC0RandFactIds('V3-H-001', activeIds, 10);
    const sample2 = sampleC0RandFactIds('V3-H-001', activeIds, 10);
    const sampleOther = sampleC0RandFactIds('V3-H-002', activeIds, 10);

    expect(sample1).toHaveLength(10);
    expect(new Set(sample1).size).toBe(10);
    for (const id of sample1) {
      expect(assets.factsV3.activeIds.has(id)).toBe(true);
    }
    expect(sample1).toEqual(sample2);
    expect(sample1).not.toEqual(sampleOther);
    expect(fnv1a32('V3-H-001:C0_rand')).toBe(fnv1a32('V3-H-001:C0_rand'));
  });

  it('produces distinct hint hashes across conditions and keeps D_safe free of DDL keywords', () => {
    // Pick a task where repaired facts (e.g. F-16, F-18, F-19, F-36) are retrieved
    const taskWithRepaired =
      tasksV3.test.find((t) => t.features.append_only && t.features.tenant) ?? tasksV3.test[0];

    const hintsByCond = new Map<string, ReturnType<typeof buildConditionV3Hint>>();
    for (const cond of V3_CONDITIONS) {
      hintsByCond.set(cond, buildConditionV3Hint(cond, taskWithRepaired, assets));
    }

    expect(hintsByCond.get('A')?.hint).toBeUndefined();
    expect(hintsByCond.get('D_safe')?.hint).toBeDefined();
    expect(hintsByCond.get('D_safe')?.hint).not.toMatch(DDL_KEYWORD_REGEX);
    expect(hintsByCond.get('B')?.retrievedFactIds).toHaveLength(34);

    const uniqueHashes = new Set(
      Array.from(hintsByCond.values()).map((h) => h.hintSha256)
    );
    expect(uniqueHashes.size).toBe(V3_CONDITIONS.length);
  });

  it('computes complete v3 provenance hashes with topK=10', () => {
    const meta = getRunMetadataV3(ROOT, 'test-model', true);
    expect(meta.protocol).toBe('Ablation v3');
    expect(meta.topK).toBe(10);
    expect(meta.oracleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.tasksV3Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.factsV2Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.factsV3Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.memoryV2Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.memoryCidSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.dSafeSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
