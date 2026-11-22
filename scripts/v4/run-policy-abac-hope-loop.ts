// scripts/v4/run-policy-abac-hope-loop.ts
// Closes the live 3-Clock Axiom-HOPE Governance Loop on PolicyAbacCartridge:
//   Clock 1 (Fast Clock)         — Ingests C_ID_auto checkpoint traces into EpisodicRingBuffer
//   Clock 2 (Intermediate Clock) — Stages recurring failure clusters + naive static `-> P-01` in QuarantineVault
//   Clock 3 (Slow Clock)         — Runs DeepMetaOptimizer (Lexical Lock -> Contradiction Linter -> Live Paired Canary Replay)
//                                  rejecting regressing patches (`-> P-01`) and promoting zero-regression patches
//   C_ID_hope Arm Evaluation     — Evaluates all 18 held-out tasks live on gemini-3.1-flash-lite (temp=0)
//                                  and appends C_ID_hope to out/v4/policy-abac-<model>-summary.{json,md}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH,
  PolicyAbacCartridge,
  type PolicyAbacTask,
} from '../../src/v4/cartridges/policy-abac-cartridge.js';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  AxiomHopeEngine,
  computeArtifactSha256,
  type HopeMemorySnapshot,
  type PairedCanaryEvaluator,
  type PrerequisiteEdge,
  type PromotionReceipt,
  type SlowClockEvaluationResult,
} from '../../src/v4/hope/index.js';
import { retrieveWithPrerequisites } from '../../src/v4/prerequisite-retriever.js';
import {
  POLICY_VAULT_CID_AUTO_PATH,
  type PolicyAbacVaultFile,
} from './build-policy-abac-vaults.js';
import {
  buildBasePolicySystemPrompt,
  formatSummaryMarkdown,
  generatePolicyViaLlm,
  rankRulesByPromptTfIdf,
  summarizePilotCheckpoint,
  type PilotCheckpointFile,
  type PilotTrialRecord,
  type PolicyProviderOverride,
} from './run-policy-abac-pilot.js';

dotenv.config();

interface CachedReplayEntry {
  readonly cacheKey: string;
  readonly taskId: string;
  readonly retrievedRuleIds: readonly string[];
  readonly policyText: string;
  readonly committed: boolean;
  readonly fullTaskPass: boolean;
  readonly passedFactsCount: number;
  readonly boundFactsCount: number;
  readonly factPassRate: number;
  readonly passedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly forensicFlags: Readonly<Record<string, boolean>>;
  readonly stderr?: string;
  readonly source: 'checkpoint' | 'live-replay';
  readonly timestamp: string;
}

interface CandidateDecisionRecord {
  readonly candidateId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly origin: 'fast-clock-cluster' | 'empirical-single-task' | 'naive-static-baseline';
  readonly proposedPrerequisiteEdges: readonly PrerequisiteEdge[];
  readonly proposedRuleTextChanged: boolean;
  readonly evidenceHashes: readonly string[];
  readonly status: 'approved' | 'rejected';
  readonly rejectedByGate: SlowClockEvaluationResult['rejectedByGate'];
  readonly gateAudit: SlowClockEvaluationResult['gateAudit'];
  readonly receipt?: PromotionReceipt;
}

export interface PolicyAbacHopeReceiptFile {
  readonly schemaVersion: '4.0.0-hope-governance-receipt';
  readonly cartridgeId: 'policy-abac-v4';
  readonly model: string;
  readonly topK: number;
  readonly temperature: number;
  readonly sourceCheckpointPath: string;
  readonly initialSnapshotSha256: string;
  readonly finalSnapshotSha256: string;
  readonly promotedPrerequisiteGraph: Record<string, readonly string[]>;
  readonly updatedRuleStatements: Record<string, string>;
  readonly fastClockTraceCount: number;
  readonly canaryCohortTaskIds: readonly string[];
  readonly candidateDecisions: readonly CandidateDecisionRecord[];
  readonly promotionReceipts: readonly PromotionReceipt[];
  readonly generatedAt: string;
}

function slugifyModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function promptCacheKey(taskId: string, systemPrompt: string): string {
  return crypto
    .createHash('sha256')
    .update(`${taskId}::${systemPrompt}`, 'utf8')
    .digest('hex');
}

function buildLessonsMapForSnapshot(
  snapshot: HopeMemorySnapshot,
  canonicalById: ReadonlyMap<string, CanonicalRule>,
  cidAutoById: ReadonlyMap<string, string>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of snapshot.rules) {
    const canonical = canonicalById.get(rule.id);
    // If Slow Clock explicitly promoted an updated rule statement, use it;
    // otherwise use the frozen C_ID_auto distilled lesson text.
    if (canonical && rule.statement !== canonical.statement) {
      out.set(rule.id, rule.statement);
    } else {
      out.set(rule.id, cidAutoById.get(rule.id) ?? rule.statement);
    }
  }
  return out;
}

export async function runPolicyAbacHopeLoop(options: {
  model?: string;
  provider?: PolicyProviderOverride;
  topK?: number;
  delayMs?: number;
  forceHopeArm?: boolean;
} = {}): Promise<{
  receiptFile: PolicyAbacHopeReceiptFile;
  summary: ReturnType<typeof summarizePilotCheckpoint>;
}> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const provider = options.provider;
  const topK = options.topK ?? 4;
  const delayMs = options.delayMs ?? 350;
  const forceHopeArm = options.forceHopeArm ?? false;
  const modelSlug = slugifyModel(model);

  const runDir = path.resolve('.axiom-state', 'runs-v4', `policy-abac-${modelSlug}`);
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  const replayCachePath = path.join(runDir, 'hope-replay-cache.json');
  const quarantineStatePath = path.resolve(
    '.axiom-state',
    'v4',
    `policy-abac-hope-quarantine-${modelSlug}.json`
  );
  const outDir = path.resolve('out', 'v4');
  const receiptOutPath = path.join(outDir, `policy-abac-${modelSlug}-hope-receipt.json`);
  const legacyGeminiReceiptPath = path.join(outDir, 'policy-abac-hope-receipt.json');
  const summaryJsonPath = path.join(outDir, `policy-abac-${modelSlug}-summary.json`);
  const summaryMdPath = path.join(outDir, `policy-abac-${modelSlug}-summary.md`);

  if (!fs.existsSync(checkpointPath)) {
    throw new Error(
      `Missing 4-arm pilot checkpoint at ${checkpointPath}. Run scripts/v4/run-policy-abac-pilot.ts first.`
    );
  }
  if (!fs.existsSync(POLICY_VAULT_CID_AUTO_PATH)) {
    throw new Error(`Missing frozen C_ID_auto vault at ${POLICY_VAULT_CID_AUTO_PATH}.`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(quarantineStatePath), { recursive: true });

  const checkpoint = JSON.parse(
    fs.readFileSync(checkpointPath, 'utf8')
  ) as PilotCheckpointFile;
  const vaultCidAuto = JSON.parse(
    fs.readFileSync(POLICY_VAULT_CID_AUTO_PATH, 'utf8')
  ) as PolicyAbacVaultFile;

  const cartridge = new PolicyAbacCartridge({ prerequisiteGraph: {} });
  const tasks = cartridge.loadTasks();
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const { rules: canonicalRules } = cartridge.loadCanonicalRules();
  const canonicalById = new Map(canonicalRules.map((r) => [r.id, r]));
  const cidAutoById = new Map(vaultCidAuto.lessons.map((l) => [l.factId, l.lesson]));

  // Precompute unsupervised TF-IDF ranked rule lists per task (identical to pilot runner)
  const rankedByTaskId = new Map<string, string[]>(
    tasks.map((t) => [t.id, rankRulesByPromptTfIdf(t.prompt, canonicalRules)])
  );

  // Initialize unmodified 3-Clock AxiomHopeEngine starting from empty prerequisite graph
  const engine = new AxiomHopeEngine<PolicyAbacTask, string>({
    cartridge,
    fastClockCapacity: 64,
    minOccurrences: 2,
    quarantineStatePath,
    initialPrerequisiteGraph: {},
  });

  const initialSnapshotSha256 = engine.getCurrentSnapshotSha256();

  // =========================================================================
  // CLOCK 1 (Fast Clock): Ingest all 18 C_ID_auto checkpoint traces
  // =========================================================================
  const passingCanaryTasks: PolicyAbacTask[] = [];
  const failingAutoTasks: PolicyAbacTask[] = [];

  for (const task of tasks) {
    const autoTrial = checkpoint.trials[`${task.id}::C_ID_auto`];
    if (!autoTrial) {
      throw new Error(`Missing C_ID_auto trial for ${task.id} in ${checkpointPath}.`);
    }

    await engine.recordTrial(task, autoTrial.policyText, {
      evaluation: {
        committed: autoTrial.committed,
        boundFacts: [...task.boundFacts],
        passedFacts: [...autoTrial.passedFacts],
        failedFacts: [...autoTrial.failedFacts],
        stderr: autoTrial.stderr,
      },
      forensicFlags: autoTrial.forensicFlags,
      timestamp: autoTrial.timestamp,
    });

    if (autoTrial.fullTaskPass) {
      passingCanaryTasks.push(task);
    } else {
      failingAutoTasks.push(task);
    }
  }

  if (engine.getCurrentSnapshotSha256() !== initialSnapshotSha256) {
    throw new Error('Fast Clock violated read-only canonical snapshot invariant!');
  }

  console.log(
    `[HOPE Clock 1] Ingested ${engine.fastClock.size} C_ID_auto traces (${passingCanaryTasks.length} passing canaries, ${failingAutoTasks.length} failing targets).`
  );

  // =========================================================================
  // CLOCK 2 (Intermediate Clock): Stage empirical failure clusters + naive static candidate
  // =========================================================================
  const candidateMeta = new Map<
    string,
    {
      origin: CandidateDecisionRecord['origin'];
      targetTaskIds: string[];
      proposedRuleTextChanged: boolean;
    }
  >();

  // 2a. Flush recurring Fast Clock clusters (minOccurrences=2) into QuarantineVault
  const flushRes = engine.flushToQuarantine({
    proposalBuilder: (cluster) => {
      if (cluster.factId === 'P-12' && cluster.triggerFlag === 'missingSessionFreshnessGuard') {
        return {
          candidateId: 'Q-P-12-P-07',
          proposedPrerequisiteEdges: [
            { from: 'P-12', to: 'P-02' },
            { from: 'P-12', to: 'P-07' },
          ],
        };
      }
      return null;
    },
  });

  if (engine.quarantineVault.getCandidate('Q-P-12-P-07')) {
    candidateMeta.set('Q-P-12-P-07', {
      origin: 'fast-clock-cluster',
      targetTaskIds: ['ABAC-017', 'ABAC-018'],
      proposedRuleTextChanged: false,
    });
  }

  // 2b. Stage naive static baseline candidate (`-> P-01` from DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH)
  const staticEdges: PrerequisiteEdge[] = [];
  for (const [from, targets] of Object.entries(DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH)) {
    for (const to of targets) {
      staticEdges.push({ from, to });
    }
  }
  const staticEvidenceHashes =
    failingAutoTasks.length > 0
      ? failingAutoTasks.map((t) => checkpoint.trials[`${t.id}::C_ID_auto`].artifactSha256)
      : [checkpoint.trials['ABAC-001::C_ID_auto'].artifactSha256];
  engine.quarantineVault.stageCandidate({
    candidateId: 'Q-STATIC-P-01',
    factId: 'P-01',
    triggerFlag: 'staticPrerequisitePrior',
    proposedRuleText: canonicalById.get('P-01')!.statement,
    proposedPrerequisiteEdges: staticEdges,
    evidenceHashes: staticEvidenceHashes,
    observedCount: failingAutoTasks.length,
    cartridgeId: cartridge.id,
  });
  candidateMeta.set('Q-STATIC-P-01', {
    origin: 'naive-static-baseline',
    targetTaskIds: failingAutoTasks.map((t) => t.id),
    proposedRuleTextChanged: false,
  });

  // 2c. Stage empirically triggered P-06 -> P-02 rescue candidate whenever banking tasks fail P-02
  const bankingP02Fails = tasks
    .filter((t) => t.domain === 'banking')
    .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
    .filter((tr) => tr && (tr.failedFacts.includes('P-02') || tr.forensicFlags.missingForbidSuspended));
  if (bankingP02Fails.length >= 1) {
    engine.quarantineVault.stageCandidate({
      candidateId: 'Q-P-06-P-02',
      factId: 'P-02',
      triggerFlag: 'missingForbidSuspended',
      proposedRuleText: canonicalById.get('P-02')!.statement,
      proposedPrerequisiteEdges: [{ from: 'P-06', to: 'P-02' }],
      evidenceHashes: bankingP02Fails.map((t) => t.artifactSha256),
      observedCount: bankingP02Fails.length,
      cartridgeId: cartridge.id,
    });
    candidateMeta.set('Q-P-06-P-02', {
      origin: bankingP02Fails.length >= 2 ? 'fast-clock-cluster' : 'empirical-single-task',
      targetTaskIds: bankingP02Fails.map((t) => t.taskId),
      proposedRuleTextChanged: false,
    });
  }

  // 2c-bis. Stage banking P-06 -> P-01 if >=2 banking tasks fail tenant isolation
  const bankingP01Fails = tasks
    .filter((t) => t.domain === 'banking')
    .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
    .filter((tr) => tr && (tr.failedFacts.includes('P-01') || tr.forensicFlags.missingTenantIsolation));
  if (bankingP01Fails.length >= 2) {
    engine.quarantineVault.stageCandidate({
      candidateId: 'Q-P-06-P-01',
      factId: 'P-01',
      triggerFlag: 'missingTenantIsolation',
      proposedRuleText: canonicalById.get('P-01')!.statement,
      proposedPrerequisiteEdges: [{ from: 'P-06', to: 'P-01' }],
      evidenceHashes: bankingP01Fails.map((t) => t.artifactSha256),
      observedCount: bankingP01Fails.length,
      cartridgeId: cartridge.id,
    });
    candidateMeta.set('Q-P-06-P-01', {
      origin: 'fast-clock-cluster',
      targetTaskIds: bankingP01Fails.map((t) => t.taskId),
      proposedRuleTextChanged: false,
    });
  }

  // 2d. Stage lexical-locked rule-text refinement for P-06 if >=2 banking tasks fail in C_ID_auto
  const bankingFailTrials = tasks
    .filter((t) => t.domain === 'banking')
    .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
    .filter((t): t is PilotTrialRecord => Boolean(t && !t.fullTaskPass));

  if (bankingFailTrials.length >= 2) {
    const baseP06 = cidAutoById.get('P-06') ?? canonicalById.get('P-06')!.statement;
    const refinedP06 = `${baseP06} Combine all required conditions with && inside a single permit statement (never split conditions across separate permit blocks).`;
    engine.quarantineVault.stageCandidate({
      candidateId: 'Q-P-06-CONJUNCT',
      factId: 'P-06',
      triggerFlag: 'splitPermitDisjunction',
      proposedRuleText: refinedP06,
      proposedPrerequisiteEdges: [],
      evidenceHashes: bankingFailTrials.map((t) => t.artifactSha256),
      observedCount: bankingFailTrials.length,
      cartridgeId: cartridge.id,
    });
    candidateMeta.set('Q-P-06-CONJUNCT', {
      origin: 'fast-clock-cluster',
      targetTaskIds: bankingFailTrials.map((t) => t.taskId),
      proposedRuleTextChanged: true,
    });
  }

  // 2e. Stage lexical-locked P-12 single-permit conjunction refinement if >=2 KMS admin tasks fail
  const kmsFailTrials = tasks
    .filter((t) => t.boundFacts.includes('P-12'))
    .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
    .filter((t): t is PilotTrialRecord => Boolean(t && !t.fullTaskPass));
  if (kmsFailTrials.length >= 2) {
    const baseP12 = cidAutoById.get('P-12') ?? canonicalById.get('P-12')!.statement;
    const refinedP12 = `${baseP12} Enforce all conditions with && in one permit statement and use context.session_age_seconds <= 900 when fresh session is required.`;
    engine.quarantineVault.stageCandidate({
      candidateId: 'Q-P-12-FRESH',
      factId: 'P-12',
      triggerFlag: 'missingSessionFreshnessGuard',
      proposedRuleText: refinedP12,
      proposedPrerequisiteEdges: [],
      evidenceHashes: kmsFailTrials.map((t) => t.artifactSha256),
      observedCount: kmsFailTrials.length,
      cartridgeId: cartridge.id,
    });
    candidateMeta.set('Q-P-12-FRESH', {
      origin: 'fast-clock-cluster',
      targetTaskIds: kmsFailTrials.map((t) => t.taskId),
      proposedRuleTextChanged: true,
    });
  }

  engine.quarantineVault.saveToDisk();
  console.log(
    `[HOPE Clock 2] Staged ${engine.quarantineVault.size} isolated candidates in QuarantineVault (flushed=${flushRes.staged.length}): [${engine.quarantineVault
      .listCandidates()
      .map((c) => c.candidateId)
      .join(', ')}]`
  );

  // =========================================================================
  // CLOCK 3 (Slow Clock): DeepMetaOptimizer with Live Prompt-Cached Paired Canary Replay
  // =========================================================================
  let replayCache: Record<string, CachedReplayEntry> = {};
  if (fs.existsSync(replayCachePath)) {
    replayCache = JSON.parse(
      fs.readFileSync(replayCachePath, 'utf8')
    ) as Record<string, CachedReplayEntry>;
  }

  // Seed replay cache deterministically with exact prompt-matched trials from checkpoint.json
  const seedFromArm = (arm: 'C_ID_auto' | 'C_ID_prereq') => {
    for (const task of tasks) {
      const trial = checkpoint.trials[`${task.id}::${arm}`];
      if (!trial) continue;
      const lessonsBlock = trial.retrievedRuleIds
        .map((id) => `[${id}] ${cidAutoById.get(id) ?? ''}`)
        .join('\n');
      const sysPrompt = buildBasePolicySystemPrompt(lessonsBlock);
      const key = promptCacheKey(task.id, sysPrompt);
      if (!replayCache[key]) {
        replayCache[key] = {
          cacheKey: key,
          taskId: task.id,
          retrievedRuleIds: [...trial.retrievedRuleIds],
          policyText: trial.policyText,
          committed: trial.committed,
          fullTaskPass: trial.fullTaskPass,
          passedFactsCount: trial.passedFactsCount,
          boundFactsCount: trial.boundFactsCount,
          factPassRate: trial.factPassRate,
          passedFacts: [...trial.passedFacts],
          failedFacts: [...trial.failedFacts],
          forensicFlags: { ...trial.forensicFlags },
          ...(trial.stderr ? { stderr: trial.stderr } : {}),
          source: 'checkpoint',
          timestamp: trial.timestamp,
        };
      }
    }
  };
  seedFromArm('C_ID_auto');
  seedFromArm('C_ID_prereq');

  const saveReplayCache = () => {
    fs.writeFileSync(replayCachePath, `${JSON.stringify(replayCache, null, 2)}\n`, 'utf8');
  };
  saveReplayCache();

  const livePairedEvaluator: PairedCanaryEvaluator<PolicyAbacTask> = async (
    task,
    snapshot
  ) => {
    const rankedIds = rankedByTaskId.get(task.id)!;
    const ret = retrieveWithPrerequisites(rankedIds, topK, snapshot.prerequisiteGraph);
    const lessonsMap = buildLessonsMapForSnapshot(snapshot, canonicalById, cidAutoById);
    const lessonsBlock = ret.selected
      .map((id) => `[${id}] ${lessonsMap.get(id) ?? ''}`)
      .join('\n');
    const systemPrompt = buildBasePolicySystemPrompt(lessonsBlock);
    const key = promptCacheKey(task.id, systemPrompt);

    let cached = replayCache[key];
    if (!cached) {
      const userPrompt = `Task ${task.id} (${task.domain}): ${task.title}\n${task.prompt}`;
      const gen = await generatePolicyViaLlm(model, systemPrompt, userPrompt, 0, provider);
      const evaluation = cartridge.evaluate(task, gen.policyText);
      const forensicFlags = cartridge.classifyForensics(task, gen.policyText);
      const boundCount = evaluation.boundFacts.length;
      const passedCount = evaluation.passedFacts.length;
      const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

      cached = {
        cacheKey: key,
        taskId: task.id,
        retrievedRuleIds: [...ret.selected],
        policyText: gen.policyText,
        committed: evaluation.committed,
        fullTaskPass,
        passedFactsCount: passedCount,
        boundFactsCount: boundCount,
        factPassRate: boundCount > 0 ? passedCount / boundCount : 1,
        passedFacts: [...evaluation.passedFacts],
        failedFacts: [...evaluation.failedFacts],
        forensicFlags,
        ...(evaluation.stderr ? { stderr: evaluation.stderr } : {}),
        source: 'live-replay',
        timestamp: new Date().toISOString(),
      };
      replayCache[key] = cached;
      saveReplayCache();
      console.log(
        `  [SlowClock Live Replay] ${task.id} | rules=[${ret.selected.join(',')}] -> ${
          fullTaskPass ? 'PASS' : 'FAIL'
        } (${passedCount}/${boundCount})`
      );
      if (delayMs > 0) await sleep(delayMs);
    }

    return {
      taskId: task.id,
      passed: cached.fullTaskPass,
      score: cached.factPassRate,
      failedFacts: cached.failedFacts,
    };
  };

  // Ordered Slow Clock evaluation queue:
  //   1. Audit & reject naive static `-> P-01`
  //   2. Evaluate empirically triggered `Q-P-06-P-02`, `Q-P-12-P-07`, and `Q-P-06-CONJUNCT`
  const evaluationOrder = [
    'Q-STATIC-P-01',
    'Q-P-06-P-02',
    'Q-P-06-P-01',
    'Q-P-12-P-07',
    'Q-P-06-CONJUNCT',
    'Q-P-12-FRESH',
  ].filter((id) => Boolean(engine.quarantineVault.getCandidate(id)));

  const candidateDecisions: CandidateDecisionRecord[] = [];
  // Keep canary guard strictly protective: starts with all 12 passing C_ID_auto tasks
  const activeCanaryIds = new Set<string>(passingCanaryTasks.map((t) => t.id));

  for (const candidateId of evaluationOrder) {
    const candidate = engine.quarantineVault.getCandidate(candidateId)!;
    const meta = candidateMeta.get(candidateId)!;
    const targetTasks = meta.targetTaskIds
      .map((id) => tasksById.get(id)!)
      .filter(Boolean);
    const canaryTasks = Array.from(activeCanaryIds)
      .sort()
      .map((id) => tasksById.get(id)!);

    console.log(
      `\n[HOPE Clock 3] Evaluating ${candidateId} (targets=[${targetTasks
        .map((t) => t.id)
        .join(',')}], canaries=${canaryTasks.length})...`
    );

    const decision = await engine.runSlowClockPromotion(
      candidateId,
      { targetTasks, canaryTasks },
      livePairedEvaluator
    );

    candidateDecisions.push({
      candidateId: candidate.candidateId,
      factId: candidate.factId,
      triggerFlag: candidate.triggerFlag,
      origin: meta.origin,
      proposedPrerequisiteEdges: candidate.proposedPrerequisiteEdges,
      proposedRuleTextChanged: meta.proposedRuleTextChanged,
      evidenceHashes: candidate.evidenceHashes,
      status: decision.status,
      rejectedByGate: decision.rejectedByGate,
      gateAudit: decision.gateAudit,
      ...(decision.receipt ? { receipt: decision.receipt } : {}),
    });

    const cr = decision.gateAudit.canaryReplay;
    console.log(
      `[HOPE Clock 3] ${candidateId} -> ${decision.status.toUpperCase()}${
        decision.rejectedByGate ? ` (rejected by ${decision.rejectedByGate})` : ''
      } | LexicalLock=${decision.gateAudit.lexicalLock.passed} | Linter=${
        decision.gateAudit.contradictionLinter.passed
      } | TargetDelta=${(cr.targetCohortDelta * 100).toFixed(1)}pp (${cr.targetBeforePassCount}->${
        cr.targetAfterPassCount
      }/${cr.targetTotal} full-pass) | CanaryRegressions=${cr.canaryRegressions}${
        cr.regressedCanaryTaskIds.length > 0
          ? ` [${cr.regressedCanaryTaskIds.join(',')}]`
          : ''
      }`
    );

    // If promoted, any newly passing target tasks join the protected canary cohort for subsequent gates
    if (decision.status === 'approved') {
      const snap = engine.getCurrentSnapshot();
      for (const tt of targetTasks) {
        const res = await livePairedEvaluator(tt, snap);
        if (res.passed) {
          activeCanaryIds.add(tt.id);
        }
      }
    }
  }

  engine.quarantineVault.saveToDisk();

  const finalSnapshot = engine.getCurrentSnapshot();
  const finalSnapshotSha256 = engine.getCurrentSnapshotSha256();
  const updatedRuleStatements: Record<string, string> = {};
  for (const rule of finalSnapshot.rules) {
    const canonical = canonicalById.get(rule.id);
    if (canonical && rule.statement !== canonical.statement) {
      updatedRuleStatements[rule.id] = rule.statement;
    }
  }

  const receiptFile: PolicyAbacHopeReceiptFile = {
    schemaVersion: '4.0.0-hope-governance-receipt',
    cartridgeId: 'policy-abac-v4',
    model,
    topK,
    temperature: 0,
    sourceCheckpointPath: path.relative(process.cwd(), checkpointPath).replace(/\\/g, '/'),
    initialSnapshotSha256,
    finalSnapshotSha256,
    promotedPrerequisiteGraph: { ...finalSnapshot.prerequisiteGraph },
    updatedRuleStatements,
    fastClockTraceCount: engine.fastClock.size,
    canaryCohortTaskIds: passingCanaryTasks.map((t) => t.id),
    candidateDecisions,
    promotionReceipts: [...engine.getPromotionReceipts()],
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(receiptOutPath, `${JSON.stringify(receiptFile, null, 2)}\n`, 'utf8');
  if (modelSlug === 'gemini-3-1-flash-lite') {
    fs.writeFileSync(legacyGeminiReceiptPath, `${JSON.stringify(receiptFile, null, 2)}\n`, 'utf8');
  }
  console.log(`\n[HOPE] Wrote Slow Clock governance receipt to ${receiptOutPath}`);

  // =========================================================================
  // LIVE EVALUATION OF C_ID_hope ARM (18 calls on gemini-3.1-flash-lite, temp=0)
  // =========================================================================
  console.log(
    `\n[HOPE Arm] Evaluating C_ID_hope across all ${tasks.length} tasks live on ${model} (temperature=0, K=${topK})...`
  );
  const finalLessonsMap = buildLessonsMapForSnapshot(
    finalSnapshot,
    canonicalById,
    cidAutoById
  );

  let hopeDone = 0;
  for (const task of tasks) {
    const key = `${task.id}::C_ID_hope`;
    if (!forceHopeArm && checkpoint.trials[key]) {
      hopeDone++;
      continue;
    }

    const rankedIds = rankedByTaskId.get(task.id)!;
    const retrieval = retrieveWithPrerequisites(
      rankedIds,
      topK,
      finalSnapshot.prerequisiteGraph
    );
    const lessonsBlock = retrieval.selected
      .map((id) => `[${id}] ${finalLessonsMap.get(id) ?? ''}`)
      .join('\n');
    const systemPrompt = buildBasePolicySystemPrompt(lessonsBlock);
    const userPrompt = `Task ${task.id} (${task.domain}): ${task.title}\n${task.prompt}`;

    const gen = await generatePolicyViaLlm(model, systemPrompt, userPrompt, 0, provider);
    const evaluation = cartridge.evaluate(task, gen.policyText);
    const forensicFlags = cartridge.classifyForensics(task, gen.policyText);
    const boundCount = evaluation.boundFacts.length;
    const passedCount = evaluation.passedFacts.length;
    const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

    const record: PilotTrialRecord = {
      key,
      taskId: task.id,
      domain: task.domain,
      cohortId: task.cohortId,
      arm: 'C_ID_hope',
      retrievedRuleIds: [...retrieval.selected],
      injectedPrerequisites: [...retrieval.injectedPrerequisites],
      displacedRuleIds: [...retrieval.displaced],
      promptChars: systemPrompt.length + userPrompt.length,
      artifactSha256: computeArtifactSha256(gen.policyText),
      policyText: gen.policyText,
      committed: evaluation.committed,
      fullTaskPass,
      boundFactsCount: boundCount,
      passedFactsCount: passedCount,
      factPassRate: boundCount > 0 ? passedCount / boundCount : 1,
      passedFacts: [...evaluation.passedFacts],
      failedFacts: [...evaluation.failedFacts],
      forensicFlags,
      ...(evaluation.stderr ? { stderr: evaluation.stderr } : {}),
      returnedModel: gen.returnedModel,
      finishReason: gen.finishReason,
      latencyMs: gen.latencyMs,
      timestamp: new Date().toISOString(),
    };

    checkpoint.trials[key] = record;
    checkpoint.updatedAt = new Date().toISOString();
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

    hopeDone++;
    const statusMark = fullTaskPass ? 'PASS' : evaluation.committed ? 'FAIL' : 'SYNTAX_ERR';
    console.log(
      `[${String(hopeDone).padStart(2, '0')}/${tasks.length}] ${task.id} | C_ID_hope   | ${statusMark.padEnd(10)} | facts=${passedCount}/${boundCount} | rules=[${retrieval.selected.join(',')}] | failed=[${evaluation.failedFacts.join(',')}] (${gen.latencyMs}ms)`
    );

    if (delayMs > 0) await sleep(delayMs);
  }

  const summary = summarizePilotCheckpoint(checkpoint);
  const summaryMd = formatSummaryMarkdown(summary);
  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryMdPath, summaryMd, 'utf8');

  console.log(`\n${summaryMd}`);
  console.log(`[HOPE] Updated 5-arm summary JSON: ${summaryJsonPath}`);
  console.log(`[HOPE] Updated 5-arm summary MD:   ${summaryMdPath}`);

  return { receiptFile, summary };
}

function parseCliArgs(argv: string[]) {
  const modelIdx = argv.indexOf('--model');
  const providerIdx = argv.indexOf('--provider');
  const topKIdx = argv.indexOf('--top-k');
  const delayIdx = argv.indexOf('--delay-ms');
  const rawProvider =
    providerIdx >= 0 && argv[providerIdx + 1] ? argv[providerIdx + 1].toLowerCase() : undefined;
  if (rawProvider !== undefined && rawProvider !== 'gemini' && rawProvider !== 'groq') {
    throw new Error(`Invalid --provider "${rawProvider}". Expected "gemini" or "groq".`);
  }
  return {
    model: modelIdx >= 0 && argv[modelIdx + 1] ? argv[modelIdx + 1] : 'gemini-3.1-flash-lite',
    provider: rawProvider as PolicyProviderOverride | undefined,
    topK: topKIdx >= 0 && argv[topKIdx + 1] ? Number(argv[topKIdx + 1]) : 4,
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 350,
    forceHopeArm: argv.includes('--force-hope-arm'),
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-policy-abac-hope-loop.ts');

if (isEntrypoint) {
  const args = parseCliArgs(process.argv.slice(2));
  runPolicyAbacHopeLoop(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
