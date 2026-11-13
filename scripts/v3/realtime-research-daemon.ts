import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  analyzeAblationV3Trials,
  type AblationV3Report,
} from './analyze-ablation-v3.js';
import { hasUnnamedInlineReferencesPrescription } from './lint-rule-contradictions.js';
import { REQUIRED_FACT_TOKENS } from './verify-cid-vault.js';
import {
  classifySqlForensics,
  SQL_FORENSIC_FLAG_NAMES,
  type ForensicTaskContext,
  type SqlForensicFlagName,
} from '../../src/verifier/sql-forensics.js';
import {
  V3_CONDITIONS,
  type ConditionV3Id,
  type RunMetadataV3,
  type TrialV3,
} from '../../src/eval/ablation-v3.js';
import type { TaskV2Item } from '../../src/eval/ablation.js';

export const DEFAULT_V3_RUN_IDS = [
  'nemotron-v3',
  'gemma4-31b-v3',
  'qwen27b-v3',
  'glm5-v3',
  'gemini-3.1-flash-lite-v3',
  'gemini-3.5-flash-lite-v3',
] as const;

export interface QuarantineCandidate {
  candidateId: string;
  factId: string;
  triggerFlag: SqlForensicFlagName;
  triggerConditions: Array<'C0_clean' | 'C_ID'>;
  observedCount: number;
  exampleTasks: string[];
  proposedLesson: string;
  verification: {
    linterPassed: boolean;
    requiredTokensPassed: boolean;
    missingTokens: string[];
    linterIssues: string[];
  };
  readyForNextGenerationPromotion: boolean;
  updatedAt: string;
}

export interface QuarantineFile {
  version: string;
  invariantZeroNotice: string;
  generatedAt: string;
  candidates: QuarantineCandidate[];
}

export interface ValidityGateV3Result {
  runId: string;
  totalTrials: number;
  modelMatchPassed: boolean;
  modelMismatchCount: number;
  provenanceVerified: boolean;
  missingProvenanceHashes: string[];
  bVsAPositiveWithCiExcludingZero: boolean;
  bVsAMeanDiffPts: number | null;
  bVsACi95Pts: [number, number] | null;
  passed: boolean;
  checkpointSha256: string;
  analyzedAt: string;
}

export interface RunTelemetrySummary {
  runId: string;
  trialsCompleted: number;
  targetTrials: number;
  progressPct: number;
  checkpointSha256: string | null;
  finalized: boolean;
  lastTaskId: string | null;
  lastCondition: string | null;
  conditionMeans: Record<
    ConditionV3Id,
    {
      n: number;
      meanBoundPct: number;
      strictPassPct: number;
      crashes: number;
      tableMissing: number;
    }
  >;
  forensicCounts: Record<SqlForensicFlagName, number>;
}

export interface LiveTelemetrySnapshot {
  generatedAt: string;
  protocol: 'Ablation v3';
  runs: Record<string, RunTelemetrySummary>;
}

export interface DaemonOptions {
  runsDir?: string;
  outDir?: string;
  dashboardFile?: string;
  quarantineFile?: string;
  dossierFile?: string;
  templateFile?: string;
  tasksFile?: string;
  runIds?: readonly string[];
}

interface DaemonState {
  lastTrialCountByRun: Record<string, number>;
  finalizedHashByRun: Record<string, string>;
}

interface CandidateBlueprint {
  factId: string;
  proposedLesson: string;
}

const QUARANTINE_BLUEPRINTS: Partial<Record<SqlForensicFlagName, CandidateBlueprint>> = {
  hasSingularCompositeIndexName: {
    factId: 'F-18',
    proposedLesson:
      'Name explicit non-constraint indexes idx_<table>_<col1>[_<col2>...] joining all indexed columns in order (including multi-column indexes); skip constraint-backed indexes.',
  },
  hasRevokeWithoutPositiveGrant: {
    factId: 'F-19',
    proposedLesson:
      'Append-only tables must REVOKE UPDATE, DELETE, TRUNCATE from PUBLIC, application, readonly_user, and explicitly GRANT SELECT to readonly_user and GRANT SELECT, INSERT to application.',
  },
  hasDuplicatePrimaryKey: {
    factId: 'F-01',
    proposedLesson:
      'Declare id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY once; never combine an inline PRIMARY KEY with a second table-level PRIMARY KEY.',
  },
  hasPublicConstraintQualifier: {
    factId: 'F-16',
    proposedLesson:
      'Name foreign key constraints explicitly as fk_<table>_<column> without schema-qualifying the constraint name (never CONSTRAINT public.fk_...).',
  },
  hasInlineSupersedesFk: {
    factId: 'F-36',
    proposedLesson:
      'Append-only tables require supersedes_id uuid NULL with table-level CONSTRAINT fk_<table>_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.<table>(id) ON DELETE RESTRICT (never inline REFERENCES).',
  },
  hasHallucinatedLineageCol: {
    factId: 'F-36',
    proposedLesson:
      'Append-only tables must use exact column name supersedes_id uuid NULL (never parent_id/previous_id/prior_id) with CONSTRAINT fk_<table>_supersedes_id ON DELETE RESTRICT.',
  },
  hasPublicAuthJwt: {
    factId: 'F-26',
    proposedLesson:
      "Tenant RLS policies must use auth.jwt() -> 'app_metadata' ->> 'tenant_id' for application (never public.auth.jwt() or user_metadata).",
  },
  hasUserMetadataLeak: {
    factId: 'F-26',
    proposedLesson:
      "Tenant RLS policies must scope by app_metadata.tenant_id for application and grant zero access to user_metadata.tenant_id.",
  },
  missingCreatedAtColumn: {
    factId: 'F-05',
    proposedLesson:
      'Every table must include created_at timestamptz NOT NULL DEFAULT now().',
  },
  missingDeletedAtOnMutable: {
    factId: 'F-10',
    proposedLesson:
      'Mutable tables must include nullable deleted_at timestamptz; append-only tables must omit deleted_at.',
  },
};

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function verifyCandidateRule(
  factId: string,
  proposedLesson: string
): QuarantineCandidate['verification'] {
  const linterIssues: string[] = [];
  if (hasUnnamedInlineReferencesPrescription(proposedLesson)) {
    linterIssues.push(`${factId} prescribes unnamed inline REFERENCES.`);
  }
  if (factId === 'F-18' && !/_<col1>\[_<col2>/i.test(proposedLesson)) {
    linterIssues.push('F-18 must explicitly allow _<col1>[_<col2>...] multi-column naming.');
  }
  if (
    factId === 'F-19' &&
    (!/\bREVOKE\b/i.test(proposedLesson) ||
      !/\bGRANT\s+SELECT\b/i.test(proposedLesson) ||
      !/\bGRANT\s+SELECT\s*,\s*INSERT\b/i.test(proposedLesson))
  ) {
    linterIssues.push('F-19 must include both REVOKE and positive GRANT SELECT / GRANT SELECT, INSERT.');
  }

  const requiredTokens = REQUIRED_FACT_TOKENS[factId] ?? [];
  const lower = proposedLesson.toLowerCase();
  const missingTokens = requiredTokens.filter((tok) => !lower.includes(tok.toLowerCase()));

  return {
    linterPassed: linterIssues.length === 0,
    requiredTokensPassed: missingTokens.length === 0,
    missingTokens,
    linterIssues,
  };
}

export function evaluateValidityGateV3(
  runId: string,
  trials: readonly TrialV3[],
  report: AblationV3Report,
  checkpointSha256: string
): ValidityGateV3Result {
  const modelMismatchCount = trials.filter(
    (t) => !t.returnedModel || !t.requestedModel || t.returnedModel !== t.requestedModel
  ).length;
  const modelMatchPassed = trials.length === 960 && modelMismatchCount === 0;
  const bVsA = report.referenceContrasts.find((c) => c.name === 'B_vs_A');
  const bVsAPositiveWithCiExcludingZero = Boolean(
    bVsA && bVsA.meanDifference > 0 && bVsA.ci95[0] > 0
  );

  return {
    runId,
    totalTrials: trials.length,
    modelMatchPassed,
    modelMismatchCount,
    provenanceVerified: report.provenanceVerified,
    missingProvenanceHashes: report.missingProvenanceHashes,
    bVsAPositiveWithCiExcludingZero,
    bVsAMeanDiffPts: bVsA ? bVsA.meanDifference * 100 : null,
    bVsACi95Pts: bVsA ? [bVsA.ci95[0] * 100, bVsA.ci95[1] * 100] : null,
    passed: modelMatchPassed && report.provenanceVerified && bVsAPositiveWithCiExcludingZero,
    checkpointSha256,
    analyzedAt: new Date().toISOString(),
  };
}

function compileDossierFromTemplate(
  templatePath: string,
  dossierPath: string,
  telemetry: LiveTelemetrySnapshot,
  ledger: Record<string, ValidityGateV3Result>,
  analyses: Record<string, AblationV3Report>,
  quarantine: QuarantineFile
): void {
  if (!fs.existsSync(templatePath)) return;
  const template = fs.readFileSync(templatePath, 'utf8');

  const runIds = Object.keys(telemetry.runs);
  const finalizedIds = Object.keys(ledger);
  const readyCount = quarantine.candidates.filter((c) => c.readyForNextGenerationPromotion).length;

  const fleetLines = [
    '| Run ID | Progress | Latest Trial | A % | D_safe % | C % | C0 % | C0_clean % | C_ID % | C0_rand % | B % |',
    '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const id of runIds) {
    const r = telemetry.runs[id];
    const fmt = (c: ConditionV3Id) => `${r.conditionMeans[c].meanBoundPct.toFixed(1)}%`;
    fleetLines.push(
      `| ${id} | ${r.trialsCompleted}/${r.targetTrials} | ${r.lastTaskId ?? '-'} ${r.lastCondition ?? ''} | ${fmt('A')} | ${fmt('D_safe')} | ${fmt('C')} | ${fmt('C0')} | ${fmt('C0_clean')} | ${fmt('C_ID')} | ${fmt('C0_rand')} | ${fmt('B')} |`
    );
  }

  const ledgerLines = [
    '| Run ID | Trials | Model Match (960/960) | Provenance (7 SHA-256) | B - A [95% CI] (pp) | Gate |',
    '|---|---:|:---:|:---:|---:|:---:|',
  ];
  if (finalizedIds.length === 0) {
    ledgerLines.push('| *(no 960/960 runs finalized yet)* | - | - | - | - | - |');
  } else {
    for (const id of finalizedIds) {
      const g = ledger[id];
      const bStr =
        g.bVsAMeanDiffPts !== null && g.bVsACi95Pts !== null
          ? `${g.bVsAMeanDiffPts.toFixed(2)} [${g.bVsACi95Pts[0].toFixed(2)}, ${g.bVsACi95Pts[1].toFixed(2)}]`
          : '-';
      ledgerLines.push(
        `| ${id} | ${g.totalTrials} | ${g.modelMatchPassed ? 'PASS' : 'FAIL'} | ${g.provenanceVerified ? 'PASS' : 'FAIL'} | ${bStr} | **${g.passed ? 'PASS' : 'FAIL'}** |`
      );
    }
  }

  const contrastLines = [
    '| Run ID | Contrast | Diff (pp) | 95% Bootstrap CI (pp) | Sign-Flip p | Holm p |',
    '|---|---|---:|---:|---:|---:|',
  ];
  if (finalizedIds.length === 0) {
    contrastLines.push('| *(pending 960/960 finalization)* | - | - | - | - | - |');
  } else {
    for (const id of finalizedIds) {
      const rep = analyses[id];
      if (!rep) continue;
      for (const c of rep.primaryContrasts) {
        contrastLines.push(
          `| ${id} | ${c.name} | ${(c.meanDifference * 100).toFixed(2)} | [${(c.ci95[0] * 100).toFixed(2)}, ${(c.ci95[1] * 100).toFixed(2)}] | ${c.signFlipPValue.toExponential(2)} | ${(c.holmAdjustedPValue ?? 1).toExponential(2)} |`
        );
      }
    }
  }

  const forensicLines = [
    '| Run ID | Inline `supersedes_id` | Explicit `fk_supersedes` | Hallucinated Lineage | Duplicate PK | `public.auth.jwt()` | Singular Composite Idx |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const id of runIds) {
    const fc = telemetry.runs[id].forensicCounts;
    forensicLines.push(
      `| ${id} | ${fc.hasInlineSupersedesFk} | ${fc.hasExplicitSupersedesFk} | ${fc.hasHallucinatedLineageCol} | ${fc.hasDuplicatePrimaryKey} | ${fc.hasPublicAuthJwt} | ${fc.hasSingularCompositeIndexName} |`
    );
  }

  const qLines = [
    '| Candidate ID | Fact | Trigger Flag | Observed | Linter | Tokens | Ready |',
    '|---|---|---|---:|:---:|:---:|:---:|',
  ];
  if (quarantine.candidates.length === 0) {
    qLines.push('| *(none staged yet)* | - | - | 0 | - | - | - |');
  } else {
    for (const c of quarantine.candidates) {
      qLines.push(
        `| ${c.candidateId} | ${c.factId} | ${c.triggerFlag} | ${c.observedCount} | ${c.verification.linterPassed ? 'PASS' : 'FAIL'} | ${c.verification.requiredTokensPassed ? 'PASS' : 'FAIL'} | ${c.readyForNextGenerationPromotion ? 'YES' : 'NO'} |`
      );
    }
  }

  const vars: Record<string, string> = {
    generated_at: telemetry.generatedAt,
    finalized_run_count: String(finalizedIds.length),
    total_tracked_runs: String(runIds.length),
    quarantine_total_candidates: String(quarantine.candidates.length),
    quarantine_ready_count: String(readyCount),
    fleet_progress_table: fleetLines.join('\n'),
    run_ledger_table: ledgerLines.join('\n'),
    primary_contrasts_table: contrastLines.join('\n'),
    forensic_summary_table: forensicLines.join('\n'),
    quarantine_candidates_table: qLines.join('\n'),
  };

  const rendered = template.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key: string) => vars[key] ?? '');
  fs.mkdirSync(path.dirname(dossierPath), { recursive: true });
  fs.writeFileSync(dossierPath, rendered, 'utf8');
}

export function runDaemonOnce(options?: DaemonOptions): {
  telemetry: LiveTelemetrySnapshot;
  quarantine: QuarantineFile;
  finalizedRuns: string[];
} {
  const root = path.resolve('.');
  const runsDir = options?.runsDir ?? path.join(root, '.axiom-state', 'runs-v3');
  const outDir = options?.outDir ?? path.join(root, 'out', 'v3');
  const dashboardFile =
    options?.dashboardFile ?? path.join(root, 'dashboard', 'public', 'data', 'ablation-v3-live.json');
  const quarantineFile =
    options?.quarantineFile ?? path.join(root, '.axiom-state', 'quarantine', 'v3-candidates.json');
  const dossierFile =
    options?.dossierFile ?? path.join(root, 'docs', 'AXIOM-V3-LIVE-DOSSIER.md');
  const templateFile =
    options?.templateFile ?? path.join(root, 'docs', 'AXIOM-V3-LIVE-DOSSIER.template.md');
  const tasksFile = options?.tasksFile ?? path.join(root, 'fixtures', 'task-v3', 'tasks.json');

  const taskLookup = new Map<string, TaskV2Item>();
  const forensicLookup = new Map<string, ForensicTaskContext>();
  if (fs.existsSync(tasksFile)) {
    const parsed = JSON.parse(fs.readFileSync(tasksFile, 'utf8')) as { test?: TaskV2Item[] };
    for (const t of parsed.test ?? []) {
      taskLookup.set(t.id, t);
      forensicLookup.set(t.id, { table: t.table, features: t.features });
    }
  }

  const statePath = path.join(outDir, 'daemon-state.json');
  const state: DaemonState = fs.existsSync(statePath)
    ? (JSON.parse(fs.readFileSync(statePath, 'utf8')) as DaemonState)
    : { lastTrialCountByRun: {}, finalizedHashByRun: {} };

  const ledgerPath = path.join(outDir, 'run-ledger-v3.json');
  const ledger: Record<string, ValidityGateV3Result> = fs.existsSync(ledgerPath)
    ? (JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Record<string, ValidityGateV3Result>)
    : {};

  const discoveredRuns = new Set<string>(options?.runIds ?? DEFAULT_V3_RUN_IDS);
  if (fs.existsSync(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) discoveredRuns.add(entry.name);
    }
  }

  const runsTelemetry: Record<string, RunTelemetrySummary> = {};
  const defectAgg = new Map<
    SqlForensicFlagName,
    { count: number; conditions: Set<'C0_clean' | 'C_ID'>; tasks: Set<string> }
  >();
  const analyses: Record<string, AblationV3Report> = {};
  const finalizedRuns: string[] = [];

  for (const runId of discoveredRuns) {
    const cpPath = path.join(runsDir, runId, 'checkpoint.json');
    const emptyMeans = Object.fromEntries(
      V3_CONDITIONS.map((c) => [c, { n: 0, meanBoundPct: 0, strictPassPct: 0, crashes: 0, tableMissing: 0 }])
    ) as RunTelemetrySummary['conditionMeans'];
    const emptyForensic = Object.fromEntries(
      SQL_FORENSIC_FLAG_NAMES.map((f) => [f, 0])
    ) as Record<SqlForensicFlagName, number>;

    if (!fs.existsSync(cpPath)) {
      runsTelemetry[runId] = {
        runId,
        trialsCompleted: 0,
        targetTrials: 960,
        progressPct: 0,
        checkpointSha256: null,
        finalized: false,
        lastTaskId: null,
        lastCondition: null,
        conditionMeans: emptyMeans,
        forensicCounts: emptyForensic,
      };
      continue;
    }

    const cpBuf = fs.readFileSync(cpPath);
    const cpSha = sha256Buffer(cpBuf);
    const cp = JSON.parse(cpBuf.toString('utf8')) as {
      metadata?: Partial<RunMetadataV3>;
      runMetadata?: Partial<RunMetadataV3>;
      provenance?: Partial<RunMetadataV3>;
      trials?: TrialV3[];
    };
    const trials = cp.trials ?? [];
    const metadata: Partial<RunMetadataV3> = {
      ...(cp.metadata ?? {}),
      ...(cp.runMetadata ?? {}),
      ...(cp.provenance ?? {}),
    };

    const byCond = new Map<ConditionV3Id, TrialV3[]>();
    for (const c of V3_CONDITIONS) byCond.set(c, []);
    const forensicCounts = { ...emptyForensic };

    for (const tr of trials) {
      byCond.get(tr.condition)?.push(tr);
      const ctx = forensicLookup.get(tr.taskId) ?? {
        table: '',
        features: { tenant: false, append_only: false, ingestion: false },
      };
      const flags = classifySqlForensics(tr.sanitizedSql ?? tr.generatedSql ?? '', ctx);
      for (const fname of SQL_FORENSIC_FLAG_NAMES) {
        if (flags[fname]) {
          forensicCounts[fname]++;
          if (
            (tr.condition === 'C0_clean' || tr.condition === 'C_ID') &&
            QUARANTINE_BLUEPRINTS[fname]
          ) {
            let bucket = defectAgg.get(fname);
            if (!bucket) {
              bucket = { count: 0, conditions: new Set(), tasks: new Set() };
              defectAgg.set(fname, bucket);
            }
            bucket.count++;
            bucket.conditions.add(tr.condition);
            if (bucket.tasks.size < 5) bucket.tasks.add(`${runId}:${tr.taskId}`);
          }
        }
      }
    }

    const conditionMeans = { ...emptyMeans };
    for (const c of V3_CONDITIONS) {
      const list = byCond.get(c) ?? [];
      const n = list.length;
      conditionMeans[c] = {
        n,
        meanBoundPct: n ? (100 * list.reduce((s, r) => s + r.boundFactFraction, 0)) / n : 0,
        strictPassPct: n ? (100 * list.filter((r) => r.boundPassed).length) / n : 0,
        crashes: list.filter((r) => Boolean(r.migrationExitNonZero)).length,
        tableMissing: list.filter((r) => Boolean(r.tableMissing)).length,
      };
    }

    state.lastTrialCountByRun[runId] = trials.length;

    const analysisPath = path.join(outDir, `analysis-${runId}.json`);
    if (trials.length === 960) {
      if (state.finalizedHashByRun[runId] !== cpSha || !fs.existsSync(analysisPath)) {
        const report = analyzeAblationV3Trials(trials, {
          metadata,
          tasks: [...taskLookup.values()],
          allowPartial: false,
        });
        fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
        fs.writeFileSync(analysisPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
        ledger[runId] = evaluateValidityGateV3(runId, trials, report, cpSha);
        state.finalizedHashByRun[runId] = cpSha;
        analyses[runId] = report;
        finalizedRuns.push(runId);
      } else if (fs.existsSync(analysisPath)) {
        analyses[runId] = JSON.parse(fs.readFileSync(analysisPath, 'utf8')) as AblationV3Report;
      }
    }

    const last = trials[trials.length - 1];
    runsTelemetry[runId] = {
      runId,
      trialsCompleted: trials.length,
      targetTrials: 960,
      progressPct: Number(((100 * trials.length) / 960).toFixed(2)),
      checkpointSha256: cpSha,
      finalized: trials.length === 960 && Boolean(ledger[runId]),
      lastTaskId: last?.taskId ?? null,
      lastCondition: last?.condition ?? null,
      conditionMeans,
      forensicCounts,
    };
  }

  const nowIso = new Date().toISOString();
  const telemetry: LiveTelemetrySnapshot = {
    generatedAt: nowIso,
    protocol: 'Ablation v3',
    runs: runsTelemetry,
  };

  // Stage self-healing candidates in quarantine (never mutating frozen facts/memory)
  const candidates: QuarantineCandidate[] = [];
  for (const [flagName, bucket] of defectAgg.entries()) {
    const bp = QUARANTINE_BLUEPRINTS[flagName];
    if (!bp) continue;
    const verification = verifyCandidateRule(bp.factId, bp.proposedLesson);
    candidates.push({
      candidateId: `Q-${bp.factId}-${flagName}`,
      factId: bp.factId,
      triggerFlag: flagName,
      triggerConditions: [...bucket.conditions].sort(),
      observedCount: bucket.count,
      exampleTasks: [...bucket.tasks],
      proposedLesson: bp.proposedLesson,
      verification,
      readyForNextGenerationPromotion:
        verification.linterPassed && verification.requiredTokensPassed,
      updatedAt: nowIso,
    });
  }
  candidates.sort((a, b) => b.observedCount - a.observedCount);

  const quarantine: QuarantineFile = {
    version: 'v3-quarantine-1',
    invariantZeroNotice:
      'Authority Separation: Candidates are quarantined only and never written to frozen fixtures/task-v3/facts.json or .axiom-state/memory-v3-cid.json.',
    generatedAt: nowIso,
    candidates,
  };

  for (const target of [
    path.join(outDir, 'live-telemetry.json'),
    dashboardFile,
    quarantineFile,
    ledgerPath,
    statePath,
  ]) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }
  fs.writeFileSync(
    path.join(outDir, 'live-telemetry.json'),
    JSON.stringify(telemetry, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(dashboardFile, JSON.stringify(telemetry, null, 2) + '\n', 'utf8');
  fs.writeFileSync(quarantineFile, JSON.stringify(quarantine, null, 2) + '\n', 'utf8');
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  compileDossierFromTemplate(templateFile, dossierFile, telemetry, ledger, analyses, quarantine);

  return { telemetry, quarantine, finalizedRuns };
}

function main(): void {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const watch = args.includes('--watch');
  const intervalIdx = args.indexOf('--interval-ms');
  const intervalMs = intervalIdx >= 0 && args[intervalIdx + 1] ? Number(args[intervalIdx + 1]) : 15_000;

  if (!once && !watch) {
    console.error(
      'Usage: npx tsx scripts/v3/realtime-research-daemon.ts (--once | --watch [--interval-ms 15000])'
    );
    process.exit(1);
  }

  const tick = () => {
    const res = runDaemonOnce();
    const summary = Object.values(res.telemetry.runs)
      .map((r) => `${r.runId}=${r.trialsCompleted}/960`)
      .join(' ');
    console.log(
      `[${res.telemetry.generatedAt}] ${summary} | quarantine=${res.quarantine.candidates.length} | newlyFinalized=${res.finalizedRuns.join(',') || 'none'}`
    );
  };

  tick();
  if (watch && !once) {
    setInterval(tick, intervalMs);
  }
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('realtime-research-daemon.ts');

if (isEntrypoint) {
  main();
}
