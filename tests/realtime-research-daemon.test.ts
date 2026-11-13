import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { runDaemonOnce } from '../scripts/v3/realtime-research-daemon.js';
import { REQUIRED_PROVENANCE_HASHES } from '../scripts/v3/analyze-ablation-v3.js';
import { V3_CONDITIONS, type ConditionV3Id } from '../src/eval/ablation-v3.js';

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

describe('Step 2: realtime-research-daemon', () => {
  it('transitions a checkpoint from 16/960 to 960/960, stages verified quarantine candidates, finalizes analysis + ledger + dossier, and leaves frozen inputs untouched', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-daemon-test-'));
    const runsDir = path.join(tmp, 'runs-v3');
    const outDir = path.join(tmp, 'out-v3');
    const dashboardFile = path.join(tmp, 'dashboard', 'ablation-v3-live.json');
    const quarantineFile = path.join(tmp, 'quarantine', 'v3-candidates.json');
    const dossierFile = path.join(tmp, 'docs', 'AXIOM-V3-LIVE-DOSSIER.md');
    const templateFile = path.resolve('docs', 'AXIOM-V3-LIVE-DOSSIER.template.md');
    const tasksFile = path.join(tmp, 'tasks.json');

    const frozenFactsPath = path.resolve('fixtures', 'task-v3', 'facts.json');
    const frozenCidPath = path.resolve('.axiom-state', 'memory-v3-cid.json');
    const factsHashBefore = sha256File(frozenFactsPath);
    const cidHashBefore = sha256File(frozenCidPath);

    const cellCombos = [
      { tenant: true, append_only: true, ingestion: true },
      { tenant: true, append_only: true, ingestion: false },
      { tenant: true, append_only: false, ingestion: true },
      { tenant: true, append_only: false, ingestion: false },
      { tenant: false, append_only: true, ingestion: true },
      { tenant: false, append_only: true, ingestion: false },
      { tenant: false, append_only: false, ingestion: true },
      { tenant: false, append_only: false, ingestion: false },
    ];

    const tasks = [];
    const allTrials = [];
    const scoreByCond: Record<ConditionV3Id, number> = {
      A: 0.30,
      D_safe: 0.32,
      C: 0.55,
      C0: 0.65,
      C_ID: 0.78,
      C0_rand: 0.45,
      C0_clean: 0.84,
      B: 0.92,
    };

    for (let i = 0; i < 120; i++) {
      const taskId = `V3-H-${String(i + 1).padStart(3, '0')}`;
      const features = cellCombos[i % 8];
      const boundFacts = ['F-01', 'F-05', 'F-16', 'F-18', 'F-24'];
      tasks.push({
        id: taskId,
        split: 'test',
        cohortId: `C${(i % 8) + 1}`,
        table: `orders_${i + 1}s`,
        features,
        prompt: `Create orders_${i + 1}s`,
        goldenSql: `CREATE TABLE public.orders_${i + 1}s (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());`,
        boundFacts,
      });

      for (const cond of V3_CONDITIONS) {
        const thresh = scoreByCond[cond];
        const failedFacts = boundFacts.filter((_, idx) => (idx + (i % 3)) / 6 > thresh);
        const sql =
          cond === 'C_ID' && i === 0
            ? `CREATE TABLE public.orders_1s (id uuid PRIMARY KEY, created_at timestamptz); CREATE INDEX idx_orders_1s_tenant_id ON public.orders_1s (tenant_id, created_at DESC);`
            : `CREATE TABLE public.orders_${i + 1}s (id uuid PRIMARY KEY, created_at timestamptz);`;
        allTrials.push({
          condition: cond,
          taskId,
          boundFacts,
          boundPassed: failedFacts.length === 0,
          boundFactFraction: (boundFacts.length - failedFacts.length) / boundFacts.length,
          failedFacts,
          retrievedFactIds: ['F-01', 'F-16', 'F-18'],
          promptTokens: cond === 'B' ? 1800 : 500,
          totalTokens: 900,
          requestedModel: 'synthetic-model',
          returnedModel: 'synthetic-model',
          sanitizedSql: sql,
          tableMissing: false,
          migrationExitNonZero: false,
        });
      }
    }

    fs.writeFileSync(tasksFile, JSON.stringify({ test: tasks }), 'utf8');
    const metadata = Object.fromEntries(
      REQUIRED_PROVENANCE_HASHES.map((k) => [k, 'abc123'])
    );
    const runId = 'synthetic-v3';
    const cpPath = path.join(runsDir, runId, 'checkpoint.json');
    fs.mkdirSync(path.dirname(cpPath), { recursive: true });

    // Phase 1: Partial 16/960 checkpoint
    fs.writeFileSync(
      cpPath,
      JSON.stringify({ metadata, trials: allTrials.slice(0, 16) }),
      'utf8'
    );
    // Phase 1a: Blind mode on partial 16/960 checkpoint omits interim condition means and quarantine candidates
    const blindPartialRes = runDaemonOnce({
      runsDir,
      outDir,
      dashboardFile,
      quarantineFile,
      dossierFile,
      templateFile,
      tasksFile,
      runIds: [runId],
      blind: true,
    });
    expect(blindPartialRes.telemetry.blindMode).toBe(true);
    expect(blindPartialRes.telemetry.runs[runId].blinded).toBe(true);
    expect(blindPartialRes.telemetry.runs[runId].conditionMeans.A.meanBoundPct).toBe(0);
    expect(blindPartialRes.quarantine.candidates).toEqual([]);

    // Phase 1b: Unblinded partial 16/960 checkpoint
    const partialRes = runDaemonOnce({
      runsDir,
      outDir,
      dashboardFile,
      quarantineFile,
      dossierFile,
      templateFile,
      tasksFile,
      runIds: [runId],
    });
    expect(partialRes.telemetry.runs[runId].trialsCompleted).toBe(16);
    expect(partialRes.finalizedRuns).toEqual([]);
    expect(fs.existsSync(path.join(outDir, 'live-telemetry.json'))).toBe(true);
    expect(fs.existsSync(dashboardFile)).toBe(true);
    expect(partialRes.quarantine.candidates.length).toBeGreaterThanOrEqual(1);
    const f18Cand = partialRes.quarantine.candidates.find((c) => c.factId === 'F-18');
    expect(f18Cand).toBeDefined();
    expect(f18Cand!.scope).toBe('v4-only');
    expect(f18Cand!.readyForNextGenerationPromotion).toBe(true);

    // Phase 2: Complete 960/960 checkpoint
    fs.writeFileSync(
      cpPath,
      JSON.stringify({ metadata, trials: allTrials }),
      'utf8'
    );
    const fullRes = runDaemonOnce({
      runsDir,
      outDir,
      dashboardFile,
      quarantineFile,
      dossierFile,
      templateFile,
      tasksFile,
      runIds: [runId],
    });
    expect(fullRes.telemetry.runs[runId].trialsCompleted).toBe(960);
    expect(fullRes.finalizedRuns).toEqual([runId]);
    expect(fs.existsSync(path.join(outDir, `analysis-${runId}.json`))).toBe(true);

    const ledger = JSON.parse(
      fs.readFileSync(path.join(outDir, 'run-ledger-v3.json'), 'utf8')
    ) as Record<string, { passed: boolean; modelMatchPassed: boolean; provenanceVerified: boolean }>;
    expect(ledger[runId].passed).toBe(true);
    expect(ledger[runId].modelMatchPassed).toBe(true);
    expect(ledger[runId].provenanceVerified).toBe(true);

    const dossier = fs.readFileSync(dossierFile, 'utf8');
    expect(dossier).toContain('960/960');
    expect(dossier).toContain('C_ID_vs_C');
    expect(dossier).toContain('Q-F-18-hasSingularCompositeIndexName');

    // Verify frozen vault files remained 100% untouched
    expect(sha256File(frozenFactsPath)).toBe(factsHashBefore);
    expect(sha256File(frozenCidPath)).toBe(cidHashBefore);

    // Also verify CLI --once flag works cleanly
    const cliOut = execFileSync(
      'npx',
      ['tsx', 'scripts/v3/realtime-research-daemon.ts', '--once'],
      { encoding: 'utf8', shell: true }
    );
    expect(cliOut).toContain('nemotron-v3=');

    fs.rmSync(tmp, { recursive: true, force: true });
  }, 40_000);
});
