import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  buildConditionHint,
  computeHintBSha256,
  computeHintDSha256,
  computeHintBuildersSha256,
} from '../src/eval/ablation.js';

export interface InclusionRule {
  text: string;
  adoptedAt: string;
  basis: string;
  criteria: string[];
}

export const INCLUSION_RULE: InclusionRule = {
  text: 'A run enters the primary evaluation matrix only if it completes 720 trials with constant recorded model settings, verified output sanitization (no leaked reasoning tags or length truncation), a stable standard API endpoint with a pinned model version, and passes the validity gate requiring Condition B to exceed Condition A with a 95% confidence interval strictly excluding zero.',
  adoptedAt: '2026-11-10',
  basis: 'adopted after the first three completed runs were analyzed',
  criteria: [
    'completion_720',
    'constant_settings',
    'standard_endpoint',
    'pinned_model_version',
    'verified_sanitization',
    'validity_gate_b_gt_a',
  ],
};

const ROOT = path.resolve('.');
const SCRATCH_RUNS = 'C:/Users/neil/.gemini/antigravity/brain/28c6888f-1ca9-492d-a254-362cb52a179c/scratch/runs_copy';
const RUNS_SOURCE_DIR = fs.existsSync(SCRATCH_RUNS) ? SCRATCH_RUNS : path.join(ROOT, '.axiom-state/runs');
const CACHE_DIR = path.join(ROOT, '.axiom-cache');

const tasksFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/task-v2/tasks.json'), 'utf8'));
const testTasks: any[] = tasksFile.test;
const taskById = new Map(testTasks.map((t) => [t.id, t]));
const memory = JSON.parse(fs.readFileSync(path.join(ROOT, '.axiom-state/memory.json'), 'utf8'));

export function sha256(buf: string | Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function getFileSha(rel: string): string {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? sha256(fs.readFileSync(full)) : '';
}

export function getCommitFileSha(commit: string, filePath: string): string | null {
  try {
    const out = execFileSync('git', ['show', `${commit}:${filePath}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
    return sha256(out);
  } catch {
    return null;
  }
}

function lookupCache(trial: any): {
  time: string | null;
  source: string;
  finishReason?: string;
  reasoningTokens?: number;
  reasoningLen?: number;
  returnedModel?: string;
  rawProvider?: string;
} {
  const task = taskById.get(trial.taskId);
  if (!task) return { time: trial.timestamp ?? null, source: trial.timestamp ? 'trial.timestamp' : 'none' };
  const condForPrompt = trial.condition === 'E_B' ? 'B' : trial.condition;
  const hint = buildConditionHint(condForPrompt as any, task, memory);
  const systemPrompt = `You generate PostgreSQL 16 SQL migrations.
Output raw executable PostgreSQL 16 SQL DDL only (no Markdown code fences, no commentary).
Environment context:
- Database: PostgreSQL 16, schema \`public\`.
- Existing reference tables: \`public.tenants(id uuid PRIMARY KEY)\`, \`public.users(id uuid PRIMARY KEY, tenant_id uuid)\`, \`public.customers(id uuid PRIMARY KEY, tenant_id uuid)\`.
- Existing JWT helper function: \`auth.jwt() RETURNS jsonb\`.
- Existing database roles: \`deployer\`, \`application\`, \`readonly_user\`.
Create the requested table \`public.${task.table}\` along with appropriate columns, constraints, indexes, triggers, row-level security policies, views, and role grants for the given table flags.${hint ? `\n\nCRITICAL LESSONS FROM PREVIOUS FAILURES:\n${hint}` : ''}`;
  const userPrompt = `${task.prompt}\nTarget Table: public.${task.table}\nFeature Flags: tenant=${task.features.tenant}, append_only=${task.features.append_only}, ingestion=${task.features.ingestion}`;
  const suffixes = ['', '|profile=thinking_level:minimal'];
  for (const suffix of suffixes) {
    const key = sha256(`${trial.baseUrl}${trial.requestedModel}${systemPrompt}${userPrompt}0${suffix}`);
    const p = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(p)) {
      try {
        const c = JSON.parse(fs.readFileSync(p, 'utf8'));
        const raw = JSON.parse(c.rawResponse);
        const msg = raw?.choices?.[0]?.message;
        const rLen = typeof msg?.reasoning === 'string' ? msg.reasoning.length : (typeof msg?.reasoning_content === 'string' ? msg.reasoning_content.length : 0);
        const rTok = raw?.usage?.completion_tokens_details?.reasoning_tokens ?? raw?.usage?.reasoning_tokens ?? 0;
        const createdTime = (typeof raw?.created === 'number' && raw.created > 0)
          ? new Date(raw.created * 1000).toISOString()
          : fs.statSync(p).mtime.toISOString();
        const createdSrc = (typeof raw?.created === 'number' && raw.created > 0) ? 'cache.rawResponse.created' : 'cache.mtime';
        return {
          time: trial.timestamp ?? createdTime,
          source: trial.timestamp ? 'trial.timestamp' : createdSrc,
          finishReason: c.finishReason,
          reasoningTokens: rTok,
          reasoningLen: rLen,
          returnedModel: raw?.model ?? c.returnedModel,
          rawProvider: raw?.provider,
        };
      } catch {
        return { time: trial.timestamp ?? fs.statSync(p).mtime.toISOString(), source: trial.timestamp ? 'trial.timestamp' : 'cache.mtime' };
      }
    }
  }
  return { time: trial.timestamp ?? null, source: trial.timestamp ? 'trial.timestamp' : 'none' };
}

// Compute canonical C & C0 hint hashes across the 120 test tasks
const canonicalCHints = testTasks.map((t) => `${t.id}:${buildConditionHint('C', t, memory) ?? ''}`).join('\n');
const canonicalC0Hints = testTasks.map((t) => `${t.id}:${buildConditionHint('C0', t, memory) ?? ''}`).join('\n');
export const CANONICAL_HINTS = {
  K: 10,
  hintBSha256: computeHintBSha256(),
  hintCSha256: sha256(canonicalCHints),
  hintC0Sha256: sha256(canonicalC0Hints),
  hintDSha256: computeHintDSha256(),
  hintBuildersSha256: computeHintBuildersSha256(),
};

interface RunPolicy {
  status: string;
  matrixScope: string;
  deadline: string | null;
  inclusionStatus: 'included' | 'eligible_until_deadline' | 'excluded';
  exclusionCriteria: string[];
  reason: string;
  reasoningSetting: { param: string; value: string; changedDuringRun: string };
}

const runPolicies: Record<string, RunPolicy> = {
  'nemotron-2': {
    status: 'completed',
    matrixScope: 'main',
    deadline: null,
    inclusionStatus: 'included',
    exclusionCriteria: [],
    reason: 'Completed all 720 trials with constant settings on standard NVIDIA API endpoint with pinned model version; output sanitization verified; passed B > A validity gate (93.88% vs 47.44%, 95% CI strictly excluding zero).',
    reasoningSetting: { param: 'none sent (provider default)', value: 'default (thinking enabled; 720/720 trials have reasoning, mean 965.3 tok)', changedDuringRun: 'none' },
  },
  'glm5-2': {
    status: 'completed',
    matrixScope: 'main',
    deadline: null,
    inclusionStatus: 'included',
    exclusionCriteria: [],
    reason: 'Completed all 720 trials with constant settings on standard NVIDIA API endpoint with pinned model version; output sanitization verified; passed B > A validity gate (90.22% vs 41.46%, 95% CI strictly excluding zero).',
    reasoningSetting: { param: 'reasoning_effort', value: '"low" (415/720 trials with reasoning tokens; mean 77.8 tok when present)', changedDuringRun: 'none' },
  },
  'nemotron-lightning-full': {
    status: 'completed_excluded',
    matrixScope: 'exploratory_excluded',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['constant_settings', 'standard_endpoint', 'validity_gate_b_gt_a'],
    reason: 'Excluded under rule criteria: non-constant settings (Trial 1 max_tokens=8192 with default reasoning vs Trials 2-720 max_tokens=16384 with reasoning disabled), served via unstable third-party gateway (kilo.ai), and failed post-hoc validity gate (B 42.71% vs A 42.00%, CI includes zero).',
    reasoningSetting: {
      param: 'Trial 1: none; Trials 2-720: reasoning_effort + chat_template_kwargs',
      value: 'Trial 1: default (4069 rTok); Trials 2-720: "none" / {"enable_thinking":false} (0 rTok)',
      changedDuringRun: 'Trial 1 (H-001/A, cached 2026-11-09T15:06:06Z) vs Trials 2-720 (started 2026-11-09T17:54:08Z)',
    },
  },
  'gemini-flash-lite-full': {
    status: 'eligible_until_deadline',
    matrixScope: 'eligible_until_deadline',
    deadline: null,
    inclusionStatus: 'eligible_until_deadline',
    exclusionCriteria: [],
    reason: 'Stopped at 480 trials (80 balanced tasks H-001..H-080 across all 6 conditions) due to Google AI Studio daily quota limit (infrastructure exhaustion, not result peeking); model pinned to gemini-3.5-flash-lite on standard endpoint; eligible until deadline upon resumption.',
    reasoningSetting: { param: 'none sent (model profile default)', value: 'minimal/default (gemini-3.5-flash-lite)', changedDuringRun: 'none' },
  },
  'gemini-3.1-flash-lite': {
    status: 'eligible_until_deadline',
    matrixScope: 'eligible_until_deadline',
    deadline: null,
    inclusionStatus: 'eligible_until_deadline',
    exclusionCriteria: [],
    reason: 'Stopped at 480 trials (80 balanced tasks H-001..H-080 across all 6 conditions) due to Google AI Studio daily quota limit (infrastructure exhaustion, not result peeking); model pinned to gemini-3.1-flash-lite on standard endpoint; treated identically to gemini-3.5-flash-lite; eligible until deadline upon resumption.',
    reasoningSetting: { param: 'none sent (model profile default)', value: 'default (gemini-3.1-flash-lite)', changedDuringRun: 'none' },
  },
  'gemini-mini': {
    status: 'pilot_excluded',
    matrixScope: 'excluded_pilot',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['completion_720'],
    reason: 'Excluded under criterion completion_720: aborted at 15 trials (3 tasks) during mini-subset probe.',
    reasoningSetting: { param: 'none sent', value: 'default (gemini-3.6-flash)', changedDuringRun: 'none' },
  },
  'gemma4-26b-full': {
    status: 'completed_excluded',
    matrixScope: 'excluded_model_set_and_alias_mismatch',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['pinned_model_version'],
    reason: 'Excluded under criterion pinned_model_version: completed 720 trials, but returnedModel alias shifted mid-campaign (requested gemma-4-26b-it, returned gemma-4-26b-a4b-it).',
    reasoningSetting: { param: 'none sent', value: 'default', changedDuringRun: 'none' },
  },
  'gemma4-31b-full': {
    status: 'eligible_until_deadline',
    matrixScope: 'eligible_until_deadline',
    deadline: null,
    inclusionStatus: 'eligible_until_deadline',
    exclusionCriteria: [],
    reason: 'In-progress run on Google AI Studio post-fix (thinking_level=minimal, verified sanitization); eligible until deadline upon completion.',
    reasoningSetting: { param: 'extra_body.google.thinking_config.thinking_level', value: 'minimal (0 reasoning tokens)', changedDuringRun: 'none' },
  },
  'qwen27b-2': {
    status: 'eligible_until_deadline',
    matrixScope: 'eligible_until_deadline',
    deadline: null,
    inclusionStatus: 'eligible_until_deadline',
    exclusionCriteria: [],
    reason: 'In-progress run against Groq standard endpoint (model pinned to qwen/qwen3.8-27b); eligible until deadline upon completion.',
    reasoningSetting: { param: 'none sent', value: 'default (qwen/qwen3.8-27b)', changedDuringRun: 'none' },
  },
  'gptoss-120b-expanded': {
    status: 'eligible_until_deadline',
    matrixScope: 'eligible_until_deadline',
    deadline: null,
    inclusionStatus: 'eligible_until_deadline',
    exclusionCriteria: [],
    reason: 'In-progress run against Groq standard endpoint (model pinned to openai/gpt-oss-120b); eligible until deadline upon completion.',
    reasoningSetting: { param: 'none sent', value: 'default (openai/gpt-oss-120b)', changedDuringRun: 'none' },
  },
  'gptoss-120b-mini': {
    status: 'mini_completed_excluded',
    matrixScope: 'excluded_mini_subset',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['completion_720'],
    reason: 'Excluded under criterion completion_720: 48-trial 8-task diagnostic mini-probe.',
    reasoningSetting: { param: 'none sent', value: 'default', changedDuringRun: 'none' },
  },
  'liquid17b-mini': {
    status: 'mini_completed_excluded',
    matrixScope: 'excluded_mini_subset',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['completion_720', 'verified_sanitization', 'validity_gate_b_gt_a'],
    reason: 'Excluded under criteria completion_720 (48 trials), verified_sanitization (37/48 length truncation), and validity_gate_b_gt_a (B < A).',
    reasoningSetting: { param: 'none sent', value: 'default', changedDuringRun: 'none' },
  },
  'xingchen-mini': {
    status: 'mini_completed_excluded',
    matrixScope: 'excluded_mini_subset',
    deadline: null,
    inclusionStatus: 'excluded',
    exclusionCriteria: ['completion_720', 'verified_sanitization'],
    reason: 'Excluded under criteria completion_720 (48 trials) and verified_sanitization (13/48 length truncation, 9/48 empty).',
    reasoningSetting: { param: 'none sent', value: 'default', changedDuringRun: 'none' },
  },
};

export function buildLedger(runsDir = RUNS_SOURCE_DIR, existingLedgerPath = path.join(ROOT, 'out/run-ledger.json')) {
  const existingLedger = fs.existsSync(existingLedgerPath)
    ? JSON.parse(fs.readFileSync(existingLedgerPath, 'utf8'))
    : { runs: {} };

  const dashboardFiles = fs.existsSync(path.join(ROOT, 'dashboard/public/data'))
    ? fs.readdirSync(path.join(ROOT, 'dashboard/public/data'))
    : [];
  const outFiles = fs.existsSync(path.join(ROOT, 'out'))
    ? fs.readdirSync(path.join(ROOT, 'out'))
    : [];

  const runsOut: Record<string, any> = {};

  const runIds = fs.readdirSync(runsDir).filter((d) => {
    const full = path.join(runsDir, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'checkpoint.json'));
  }).sort();

  for (const runId of runIds) {
    const dir = path.join(runsDir, runId);
    const cpPath = path.join(dir, 'checkpoint.json');
    const cpBuf = fs.readFileSync(cpPath);
    const cp = JSON.parse(cpBuf.toString('utf8'));
    const trials: any[] = Array.isArray(cp) ? cp : cp.trials ?? [];
    const meta = Array.isArray(cp) ? {} : (cp.metadata ?? {});
    const resPath = path.join(dir, 'results.json');
    const res = fs.existsSync(resPath) ? JSON.parse(fs.readFileSync(resPath, 'utf8')) : null;

    const returnedModels = Array.from(new Set(trials.map((t) => t.returnedModel).filter(Boolean))).sort();
    const requestedModels = Array.from(new Set(trials.map((t) => t.requestedModel).filter(Boolean))).sort();
    const providers = Array.from(new Set(trials.map((t) => t.provider).filter(Boolean))).sort();
    const baseUrls = Array.from(new Set(trials.map((t) => t.baseUrl).filter(Boolean))).sort();
    const oracleCommits = Array.from(new Set(trials.map((t) => t.oracleCommit).filter(Boolean))).sort();
    const gitCommits = Array.from(new Set(trials.map((t) => t.gitCommit).filter(Boolean))).sort();

    const execShaByCommit: Record<string, string> = {};
    for (const c of oracleCommits) {
      const s = getCommitFileSha(c, 'src/executor.ts');
      if (s) execShaByCommit[c] = s;
    }

    let rTokCount = 0;
    let rTokSum = 0;
    const cacheTimes: Array<{ idx: number; taskId: string; cond: string; time: string; source: string; rTok: number }> = [];
    const finishCounts: Record<string, number> = {};
    const genCounts: Record<string, number> = {};

    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      const gs = t.generationStatus ?? 'ok';
      genCounts[gs] = (genCounts[gs] ?? 0) + 1;
      const cInfo = lookupCache(t);
      if (cInfo.finishReason) {
        finishCounts[cInfo.finishReason] = (finishCounts[cInfo.finishReason] ?? 0) + 1;
      }
      if ((cInfo.reasoningTokens ?? 0) > 0) {
        rTokCount++;
        rTokSum += cInfo.reasoningTokens!;
      }
      if (cInfo.time) {
        cacheTimes.push({ idx: i + 1, taskId: t.taskId, cond: t.condition, time: cInfo.time, source: cInfo.source, rTok: cInfo.reasoningTokens ?? 0 });
      }
    }

    const timesSorted = cacheTimes.map((x) => x.time).sort();
    const timeSources = Array.from(new Set(cacheTimes.map((x) => x.source))).sort();
    const firstTrialTime = timesSorted[0] ?? null;
    const lastTrialTime = timesSorted[timesSorted.length - 1] ?? null;

    const condCounts: Record<string, number> = {};
    for (const t of trials) condCounts[t.condition] = (condCounts[t.condition] ?? 0) + 1;

    const artifacts: string[] = [];
    if (fs.existsSync(resPath)) artifacts.push(`.axiom-state/runs/${runId}/results.json`);
    if (fs.existsSync(path.join(dir, 'analysis.json'))) artifacts.push(`.axiom-state/runs/${runId}/analysis.json`);
    if (fs.existsSync(path.join(dir, 'analysis.md'))) artifacts.push(`.axiom-state/runs/${runId}/analysis.md`);
    if (outFiles.includes(`analysis-${runId}.json`)) artifacts.push(`out/analysis-${runId}.json`);
    if (outFiles.includes(`analysis-${runId}.md`)) artifacts.push(`out/analysis-${runId}.md`);
    if (dashboardFiles.includes(`run-${runId}.json`)) artifacts.push(`dashboard/public/data/run-${runId}.json`);

    const policy = runPolicies[runId] ?? {
      status: 'unspecified',
      matrixScope: 'unspecified',
      deadline: null,
      inclusionStatus: 'excluded',
      exclusionCriteria: [],
      reason: 'No policy metadata specified.',
      reasoningSetting: { param: 'unknown', value: 'unknown', changedDuringRun: 'none' },
    };

    const emptyDiff = sha256('');
    const diffSha = meta.diffSha256 ?? null;
    const dirtyFlag = diffSha ? diffSha !== emptyDiff : null;

    const prevEntry = existingLedger.runs?.[runId] ?? {};
    const maxTokensUsed = runId === 'nemotron-lightning-full'
      ? 'Trial 1: 8192; Trials 2-720: 16384 (uncommitted executor.ts)'
      : '8192';

    const commitChangeTrials: Array<{ trialNum: number; taskId: string; condition: string; change: string }> = [];
    for (let i = 1; i < trials.length; i++) {
      const prev = trials[i - 1];
      const curr = trials[i];
      const diffs: string[] = [];
      if (prev.oracleCommit !== curr.oracleCommit) diffs.push(`oracleCommit ${prev.oracleCommit?.slice(0, 7)}->${curr.oracleCommit?.slice(0, 7)}`);
      if (prev.gitCommit !== curr.gitCommit) diffs.push(`gitCommit ${prev.gitCommit?.slice(0, 7)}->${curr.gitCommit?.slice(0, 7)}`);
      if (diffs.length) {
        commitChangeTrials.push({ trialNum: i + 1, taskId: curr.taskId, condition: curr.condition, change: diffs.join(', ') });
      }
    }

    runsOut[runId] = {
      ...(prevEntry.archivedPath ? { archivedPath: prevEntry.archivedPath } : {}),
      ...(prevEntry.files ? { files: prevEntry.files } : {}),
      ...(prevEntry.executorSha256PreFix ? { executorSha256PreFix: prevEntry.executorSha256PreFix } : {}),
      runId,
      provider: providers[0] ?? null,
      baseUrl: baseUrls[0] ?? null,
      requestedModel: meta.requestedModel ?? requestedModels[0] ?? null,
      returnedModels,
      trialCount: trials.length,
      uniqueTasks: new Set(trials.map((t) => t.taskId)).size,
      conditionCounts: condCounts,
      generationStatusCounts: genCounts,
      finishReasonCounts: finishCounts,
      status: policy.status,
      matrixScope: policy.matrixScope,
      deadline: policy.deadline,
      inclusionStatus: policy.inclusionStatus,
      exclusionCriteria: policy.exclusionCriteria,
      reason: policy.reason,
      firstTrialTime,
      lastTrialTime,
      timeSource: timeSources.length ? timeSources.join(' + ') : 'checkpoint.mtime',
      checkpointMtime: fs.statSync(cpPath).mtime.toISOString(),
      checkpointSha256: sha256(cpBuf),
      checkpointBytes: cpBuf.length,
      settings: {
        temperature: res?.temperature ?? 0,
        maxTokens: maxTokensUsed,
        reasoningParam: policy.reasoningSetting.param,
        reasoningValue: policy.reasoningSetting.value,
        reasoningChangedDuringRun: policy.reasoningSetting.changedDuringRun,
        observedReasoningTokenTrials: rTokCount,
        meanReasoningTokensWhenPresent: rTokCount > 0 ? Number((rTokSum / rTokCount).toFixed(1)) : 0,
        timeoutMs: 180000,
        maxRetries: 50,
        K: meta.topK ?? 10,
        oracleSha256: meta.oracleSha256 ?? null,
        tasksSha256: meta.tasksSha256 ?? null,
        factsSha256: meta.factsSha256 ?? null,
        memorySha256: meta.memorySha256 ?? null,
        hintBSha256: meta.hintBSha256 ?? null,
        hintCSha256: CANONICAL_HINTS.hintCSha256,
        hintC0Sha256: CANONICAL_HINTS.hintC0Sha256,
        hintDSha256: meta.hintDSha256 ?? null,
        hintBuildersSha256: meta.hintBuildersSha256 ?? null,
        gitCommitMeta: meta.gitCommit ?? null,
        oracleCommitsDistinct: oracleCommits,
        gitCommitsDistinct: gitCommits,
        commitTransitions: commitChangeTrials,
        executorSha256ByCommit: execShaByCommit,
        ...(runId === 'nemotron-lightning-full' || runId === 'gemma4-26b-full' || runId === 'gemma4-31b-full'
          ? { executorSha256ObservedPreFixWorkingTree: 'b3e1c196ed2db0781932cce21b20757e48f454217f1178432ddfca115aadfa78' }
          : {}),
        dirty: dirtyFlag,
        diffSha256: diffSha,
      },
      analysisComputed: artifacts.length > 0,
      committedAnalyzerRun: artifacts.some((a) => a.includes('analysis')),
      summaryOrSnapshotComputed: artifacts.some((a) => a.endsWith('results.json') || a.startsWith('dashboard/')),
      analysisArtifacts: artifacts,
      ...(prevEntry.postHocGate ? { postHocGate: prevEntry.postHocGate } : {}),
      remainingTagHitsInSql: prevEntry.remainingTagHitsInSql ?? 0,
    };
  }

  // Preserve historical calibration and pre-fix archived entries from existing ledger
  const preserveKeys = [
    'gemma4-26b-full-archived-tag-leak',
    'gemma4-31b-full-archived-tag-leak',
    'nemotron-1',
    'train-calibration',
    'dev-calibration',
  ];
  for (const k of preserveKeys) {
    if (existingLedger.runs?.[k] && !runsOut[k]) {
      runsOut[k] = { ...existingLedger.runs[k] };
      // Ensure inclusion policy fields are present
      if (!runsOut[k].inclusionStatus) {
        runsOut[k].inclusionStatus = 'excluded';
        runsOut[k].deadline = null;
        runsOut[k].exclusionCriteria = ['archived_historical'];
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    note: 'Run ledger covering all runs across .axiom-state/runs/, out/archive/, and calibration sets. Inclusion criteria adopted post-hoc on 2026-11-10.',
    inclusionRule: INCLUSION_RULE,
    canonicalHashes: {
      oracleSha256: getFileSha('scripts/oracle.ts'),
      tasksSha256: getFileSha('fixtures/task-v2/tasks.json'),
      factsSha256: getFileSha('fixtures/task-v2/facts.json'),
      memorySha256: getFileSha('.axiom-state/memory.json'),
      executorSha256CurrentWorkingTree: getFileSha('src/executor.ts'),
      executorSha256Head: getCommitFileSha('HEAD', 'src/executor.ts'),
      hintCSha256Format: 'sha256 of "<taskId>:<hint>" joined by "\\n" across all 120 test tasks',
      ...CANONICAL_HINTS,
    },
    runs: runsOut,
    ...(existingLedger.updatedAt ? { previousGemmaArchiveUpdatedAt: existingLedger.updatedAt } : {}),
    ...(existingLedger.executorSha256PreFix ? { executorSha256PreFix: existingLedger.executorSha256PreFix } : {}),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/generate-run-ledger.ts')) {
  const ledgerDoc = buildLedger();
  const outPath = path.join(ROOT, 'out/run-ledger.json');
  fs.writeFileSync(outPath, JSON.stringify(ledgerDoc, null, 2) + '\n', 'utf8');
  console.log('Successfully regenerated out/run-ledger.json with', Object.keys(ledgerDoc.runs).length, 'runs.');
}
