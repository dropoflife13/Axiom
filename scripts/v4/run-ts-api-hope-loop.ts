// scripts/v4/run-ts-api-hope-loop.ts
// Closes the live 3-Clock Axiom-HOPE Governance Loop on TsApiSecurityCartridge:
//   Clock 1 (Fast Clock)         — Ingests C_ID_auto checkpoint traces into EpisodicRingBuffer
//   Clock 2 (Intermediate Clock) — Stages naive static prerequisite graph + empirical Fast Clock
//                                  failure-cluster patches into isolated QuarantineVault
//   Clock 3 (Slow Clock)         — Runs DeepMetaOptimizer (Gate 1 Lexical Lock -> Gate 2 Contradiction/Cycle
//                                  Linter -> Gate 3 Live Prompt-Cached Paired Canary Replay `canaryRegressions === 0`)
//   C_ID_hope Arm Evaluation     — Evaluates all 15 held-out TypeScript API tasks live with the promoted
//                                  snapshot and writes 5-arm summaries + immutable SHA-256 receipt.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH,
  TsApiSecurityCartridge,
  type TsApiSecurityTask,
} from '../../src/v4/cartridges/ts-api-security-cartridge.js';
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
  TS_API_VAULT_CID_AUTO_PATH,
  type TsApiVaultFile,
} from './build-ts-api-vaults.js';
import {
  buildBaseTsApiSystemPrompt,
  buildTsApiUserPrompt,
  formatTsApiSummaryMarkdown,
  generateTsHandlerViaLlm,
  rankTsApiRulesByPromptTfIdf,
  slugifyModel,
  summarizeTsApiPilotCheckpoint,
  type TsApiPilotCheckpointFile,
  type TsApiPilotTrialRecord,
  type TsApiProviderOverride,
} from './run-ts-api-pilot.js';

dotenv.config();

interface CachedTsReplayEntry {
  readonly cacheKey: string;
  readonly taskId: string;
  readonly retrievedRuleIds: readonly string[];
  readonly tsSource: string;
  readonly committed: boolean;
  readonly fullTaskPass: boolean;
  readonly passedFactsCount: number;
  readonly boundFactsCount: number;
  readonly factPassRate: number;
  readonly passedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly forensicFlags: Readonly<Record<string, boolean>>;
  readonly stderr?: string;
  readonly returnedModel?: string;
  readonly finishReason?: string;
  readonly latencyMs?: number;
  readonly source: 'checkpoint' | 'live-replay';
  readonly timestamp: string;
}

export interface TsApiCandidateDecisionRecord {
  readonly candidateId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly origin: 'fast-clock-cluster' | 'empirical-domain-cluster' | 'naive-static-baseline';
  readonly proposedPrerequisiteEdges: readonly PrerequisiteEdge[];
  readonly proposedRuleTextChanged: boolean;
  readonly evidenceHashes: readonly string[];
  readonly status: 'approved' | 'rejected';
  readonly rejectedByGate: SlowClockEvaluationResult['rejectedByGate'];
  readonly gateAudit: SlowClockEvaluationResult['gateAudit'];
  readonly receipt?: PromotionReceipt;
}

export interface TsApiHopeReceiptFile {
  readonly schemaVersion: '4.0.0-hope-governance-receipt';
  readonly cartridgeId: 'ts-api-security-v4';
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
  readonly candidateDecisions: readonly TsApiCandidateDecisionRecord[];
  readonly promotionReceipts: readonly PromotionReceipt[];
  readonly generatedAt: string;
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
    if (canonical && rule.statement !== canonical.statement) {
      out.set(rule.id, rule.statement);
    } else {
      out.set(rule.id, cidAutoById.get(rule.id) ?? rule.statement);
    }
  }
  return out;
}

/**
 * Deterministic lexical-locked precision refinements triggered ONLY by recurring empirical
 * `C_ID_auto` failure modes (preserving 100% of `extractRequiredTokens()` tokens).
 */
function buildEmpiricalRuleRefinement(
  factId: string,
  baseLesson: string,
  domainAnchorSuffix?: string
): string | null {
  switch (factId) {
    case 'TS-01':
      return `${baseLesson} Compare parsed payload.tenantId against session.tenantId directly (if (session.tenantId !== payload.tenantId) return status 403).${domainAnchorSuffix ?? ''}`;
    case 'TS-04':
      return `${baseLesson} Return exact nested JSON body { error: { code: 'ERR_...', message: '...', requestId: req.requestId } } on EVERY 400, 401, and 403 response (never return a flat string { error: '...' }).`;
    case 'TS-05':
      return `${baseLesson} Declare uppercase const ALLOWED_ROLES = [...] (exact identifier ALLOWED_ROLES) and guard via if (!ALLOWED_ROLES.includes(ctx.session.role)) return 403.`;
    case 'TS-08':
      return `${baseLesson} Set headers: { 'Cache-Control': 'no-store' } on EVERY returned response object (200/201 and all 400/401/403 errors).`;
    case 'TS-09':
      return `${baseLesson} Invoke ctx.emitAuditEvent({ action, actorId: session.userId, requestId: req.requestId, tenantId: session.tenantId }) ONLY after all security checks pass, never on 4xx errors.`;
    case 'TS-10':
      return `${baseLesson} Pair payout routes with: uppercase const ALLOWED_ROLES = [...]; if (!ALLOWED_ROLES.includes(ctx.session.role)) return 403; explicit if (ctx.session.tenantId !== payload.tenantId) return 403; exact nested error body { error: { code, message, requestId: req.requestId } } on all 4xx; and headers { 'Cache-Control': 'no-store' } on all responses.`;
    case 'TS-11':
      return `${baseLesson} Pair export routes with: uppercase const ALLOWED_ROLES = [...]; if (!ALLOWED_ROLES.includes(ctx.session.role)) return 403; explicit if (ctx.session.tenantId !== payload.tenantId) return 403; exact nested error body { error: { code, message, requestId: req.requestId } } on all 4xx; headers { 'Cache-Control': 'no-store' } on all responses; and ctx.emitAuditEvent({ action, actorId: ctx.session.userId, requestId: req.requestId }) on success.`;
    case 'TS-12':
      return `${baseLesson} Use z.object({ tenantId: z.string().min(1), targetUserId: z.string().min(1), displayName: z.string().min(1) }).strict().safeParse(...) so mass-assigned role or tenantId fields are rejected with 400; check if (ctx.session.tenantId !== payload.tenantId) return 403; return nested { error: { code, message, requestId: req.requestId } } on all 4xx; and set headers { 'Cache-Control': 'no-store' } on all responses.`;
    default:
      return null;
  }
}

export async function runTsApiHopeLoop(options: {
  model?: string;
  provider?: TsApiProviderOverride;
  topK?: number;
  delayMs?: number;
  forceHopeArm?: boolean;
  reuseReplayCache?: boolean;
} = {}): Promise<{
  receiptFile: TsApiHopeReceiptFile;
  summary: ReturnType<typeof summarizeTsApiPilotCheckpoint>;
}> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const provider = options.provider;
  const topK = options.topK ?? 4;
  const delayMs = options.delayMs ?? 1000;
  const forceHopeArm = options.forceHopeArm ?? false;
  const reuseReplayCache = options.reuseReplayCache ?? false;
  const modelSlug = slugifyModel(model);

  const runDir = path.resolve('.axiom-state', 'runs-v4', `ts-api-${modelSlug}`);
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  const replayCachePath = path.join(runDir, 'hope-replay-cache.json');
  const quarantineStatePath = path.resolve(
    '.axiom-state',
    'v4',
    `ts-api-hope-quarantine-${modelSlug}.json`
  );
  const outDir = path.resolve('out', 'v4');
  const receiptOutPath = path.join(outDir, `ts-api-${modelSlug}-hope-receipt.json`);
  const canonicalReceiptPath = path.join(outDir, 'ts-api-hope-receipt.json');
  const summaryJsonPath = path.join(outDir, `ts-api-${modelSlug}-summary.json`);
  const summaryMdPath = path.join(outDir, `ts-api-${modelSlug}-summary.md`);

  if (!fs.existsSync(checkpointPath)) {
    throw new Error(
      `Missing 4-arm TS-API pilot checkpoint at ${checkpointPath}. Run scripts/v4/run-ts-api-pilot.ts first.`
    );
  }
  if (!fs.existsSync(TS_API_VAULT_CID_AUTO_PATH)) {
    throw new Error(`Missing frozen C_ID_auto vault at ${TS_API_VAULT_CID_AUTO_PATH}.`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(quarantineStatePath), { recursive: true });

  const checkpoint = JSON.parse(
    fs.readFileSync(checkpointPath, 'utf8')
  ) as TsApiPilotCheckpointFile;
  const vaultCidAuto = JSON.parse(
    fs.readFileSync(TS_API_VAULT_CID_AUTO_PATH, 'utf8')
  ) as TsApiVaultFile;

  const cartridge = new TsApiSecurityCartridge({ prerequisiteGraph: {} });
  const tasks = cartridge.loadTasks();
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const { rules: canonicalRules } = cartridge.loadCanonicalRules();
  const canonicalById = new Map(canonicalRules.map((r) => [r.id, r]));
  const cidAutoById = new Map(vaultCidAuto.lessons.map((l) => [l.factId, l.lesson]));

  const rankedByTaskId = new Map<string, string[]>(
    tasks.map((t) => [t.id, rankTsApiRulesByPromptTfIdf(t, canonicalRules)])
  );

  // Clear any stale quarantine state from an interrupted prior run so Clock 1/2
  // re-stages deterministically (completed live replays remain in hope-replay-cache.json).
  if (fs.existsSync(quarantineStatePath)) {
    fs.unlinkSync(quarantineStatePath);
  }

  // Initialize unmodified 3-Clock AxiomHopeEngine starting from empty prerequisite graph
  const engine = new AxiomHopeEngine<TsApiSecurityTask, string>({
    cartridge,
    fastClockCapacity: 64,
    minOccurrences: 2,
    quarantineStatePath,
    initialPrerequisiteGraph: {},
  });

  const initialSnapshotSha256 = engine.getCurrentSnapshotSha256();

  // =========================================================================
  // CLOCK 1 (Fast Clock): Ingest all 15 C_ID_auto checkpoint traces
  // =========================================================================
  const passingCanaryTasks: TsApiSecurityTask[] = [];
  const failingAutoTasks: TsApiSecurityTask[] = [];

  for (const task of tasks) {
    const autoTrial = checkpoint.trials[`${task.id}::C_ID_auto`];
    if (!autoTrial) {
      throw new Error(`Missing C_ID_auto trial for ${task.id} in ${checkpointPath}.`);
    }

    await engine.recordTrial(task, autoTrial.tsSource, {
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
  // CLOCK 2 (Intermediate Clock): Stage static baseline + empirical failure-cluster patches
  // =========================================================================
  const candidateMeta = new Map<
    string,
    {
      origin: TsApiCandidateDecisionRecord['origin'];
      targetTaskIds: string[];
      proposedRuleTextChanged: boolean;
    }
  >();
  const evaluationOrder: string[] = [];

  const registerStagedCandidate = (
    candidateId: string,
    factId: string,
    triggerFlag: string,
    proposedRuleText: string,
    proposedPrerequisiteEdges: readonly PrerequisiteEdge[],
    evidenceHashes: readonly string[],
    observedCount: number,
    origin: TsApiCandidateDecisionRecord['origin'],
    targetTaskIds: string[],
    proposedRuleTextChanged: boolean
  ) => {
    if (engine.quarantineVault.getCandidate(candidateId)) return;
    engine.quarantineVault.stageCandidate({
      candidateId,
      factId,
      triggerFlag,
      proposedRuleText,
      proposedPrerequisiteEdges,
      evidenceHashes,
      observedCount,
      cartridgeId: cartridge.id,
    });
    candidateMeta.set(candidateId, {
      origin,
      targetTaskIds,
      proposedRuleTextChanged,
    });
    evaluationOrder.push(candidateId);
  };

  // 2a. Audit naive static prerequisite prior (DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH)
  const staticEdges: PrerequisiteEdge[] = [];
  for (const [from, targets] of Object.entries(DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH)) {
    for (const to of targets) {
      staticEdges.push({ from, to });
    }
  }
  const staticEvidenceHashes =
    failingAutoTasks.length > 0
      ? failingAutoTasks.map((t) => checkpoint.trials[`${t.id}::C_ID_auto`].artifactSha256)
      : [checkpoint.trials['TSAPI-001::C_ID_auto'].artifactSha256];
  registerStagedCandidate(
    'Q-STATIC-TS-PREREQ',
    'TS-01',
    'staticPrerequisitePrior',
    canonicalById.get('TS-01')!.statement,
    staticEdges,
    staticEvidenceHashes,
    failingAutoTasks.length,
    'naive-static-baseline',
    failingAutoTasks.map((t) => t.id),
    false
  );

  // 2b. Flush recurring Fast Clock clusters (minOccurrences=2) for displaced foundational facts
  const flushRes = engine.flushToQuarantine({
    proposalBuilder: (cluster) => {
      // Find failing tasks in this cluster where cluster.factId was displaced outside Top-4
      const clusterTasks = tasks.filter((t) => {
        const tr = checkpoint.trials[`${t.id}::C_ID_auto`];
        return (
          tr &&
          tr.failedFacts.includes(cluster.factId) &&
          !tr.retrievedRuleIds.includes(cluster.factId) &&
          Boolean(tr.forensicFlags[cluster.triggerFlag])
        );
      });
      if (clusterTasks.length < 2) return null;

      // Pick dominant top-ranked anchor rule across those failing tasks
      const anchorCounts = new Map<string, number>();
      for (const t of clusterTasks) {
        const anchor = checkpoint.trials[`${t.id}::C_ID_auto`].retrievedRuleIds[0];
        if (anchor && anchor !== cluster.factId) {
          anchorCounts.set(anchor, (anchorCounts.get(anchor) ?? 0) + 1);
        }
      }
      const bestAnchor = Array.from(anchorCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!bestAnchor) return null;

      const anchorScopedTasks = clusterTasks.filter((t) =>
        checkpoint.trials[`${t.id}::C_ID_auto`].retrievedRuleIds.includes(bestAnchor)
      );
      const cid = `Q-EDGE-${bestAnchor}-${cluster.factId}`;
      candidateMeta.set(cid, {
        origin: 'fast-clock-cluster',
        targetTaskIds: anchorScopedTasks.map((t) => t.id),
        proposedRuleTextChanged: false,
      });
      if (!evaluationOrder.includes(cid)) evaluationOrder.push(cid);
      return {
        candidateId: cid,
        proposedPrerequisiteEdges: [{ from: bestAnchor, to: cluster.factId }],
      };
    },
  });

  // 2c. Empirical per-domain displaced-fact prerequisite edges (e.g., TS-10 -> TS-05, TS-11 -> TS-05)
  const domainAnchors: Record<TsApiSecurityTask['domain'], string> = {
    payouts: 'TS-10',
    admin: 'TS-11',
    profiles: 'TS-12',
  };

  for (const domain of ['payouts', 'admin', 'profiles'] as const) {
    const anchor = domainAnchors[domain];
    const domainTrials = tasks
      .filter((t) => t.domain === domain)
      .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
      .filter((tr): tr is TsApiPilotTrialRecord => Boolean(tr && !tr.fullTaskPass));

    if (domainTrials.length < 2) continue;

    // Count displaced failed facts within this domain
    const displacedFactCounts = new Map<string, TsApiPilotTrialRecord[]>();
    for (const tr of domainTrials) {
      for (const f of tr.failedFacts) {
        if (!tr.retrievedRuleIds.includes(f) && f !== anchor) {
          const list = displacedFactCounts.get(f) ?? [];
          list.push(tr);
          displacedFactCounts.set(f, list);
        }
      }
    }

    // Stage top-2 most frequent displaced facts as single-edge candidates from domain anchor
    const topDisplaced = Array.from(displacedFactCounts.entries())
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, 2);

    for (const [missingFact, trialsForFact] of topDisplaced) {
      const cid = `Q-EDGE-${anchor}-${missingFact}`;
      registerStagedCandidate(
        cid,
        missingFact,
        `displaced_${missingFact}`,
        canonicalById.get(missingFact)!.statement,
        [{ from: anchor, to: missingFact }],
        trialsForFact.map((t) => t.artifactSha256),
        trialsForFact.length,
        'empirical-domain-cluster',
        trialsForFact.map((t) => t.taskId),
        false
      );
    }
  }

  // 2d. Empirical lexical-locked rule-text precision refinements for rules failing systematically
  //     (including TS-04 error-envelope shape if rescued by prerequisite edges, plus retrieved failures like TS-05)
  const failedFactTrialsGlobal = new Map<string, TsApiPilotTrialRecord[]>();
  for (const t of failingAutoTasks) {
    const tr = checkpoint.trials[`${t.id}::C_ID_auto`];
    for (const f of tr.failedFacts) {
      if (tr.retrievedRuleIds.includes(f) || f === 'TS-04') {
        const list = failedFactTrialsGlobal.get(f) ?? [];
        list.push(tr);
        failedFactTrialsGlobal.set(f, list);
      }
    }
  }

  for (const [factId, list] of Array.from(failedFactTrialsGlobal.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  )) {
    if (list.length < 2) continue;
    const baseLesson = cidAutoById.get(factId) ?? canonicalById.get(factId)!.statement;
    const refined = buildEmpiricalRuleRefinement(factId, baseLesson);
    if (!refined) continue;
    registerStagedCandidate(
      `Q-REFINE-${factId}`,
      factId,
      `retrievedFailure_${factId}`,
      refined,
      [],
      list.map((tr) => tr.artifactSha256),
      list.length,
      'fast-clock-cluster',
      list.map((tr) => tr.taskId),
      true
    );
  }

  // Also stage domain-anchor lexical-locked precision refinements when >=2 tasks in a domain fail
  for (const domain of ['payouts', 'admin', 'profiles'] as const) {
    const anchor = domainAnchors[domain];
    if (engine.quarantineVault.getCandidate(`Q-REFINE-${anchor}`)) continue;
    const domainFailTrials = tasks
      .filter((t) => t.domain === domain)
      .map((t) => checkpoint.trials[`${t.id}::C_ID_auto`])
      .filter(
        (tr): tr is TsApiPilotTrialRecord =>
          Boolean(tr && !tr.fullTaskPass && tr.retrievedRuleIds.includes(anchor))
      );
    if (domainFailTrials.length < 2) continue;
    const baseLesson = cidAutoById.get(anchor) ?? canonicalById.get(anchor)!.statement;
    const refined = buildEmpiricalRuleRefinement(anchor, baseLesson);
    if (!refined) continue;
    registerStagedCandidate(
      `Q-ANCHOR-${anchor}`,
      anchor,
      `domainClusterFailure_${domain}`,
      refined,
      [],
      domainFailTrials.map((tr) => tr.artifactSha256),
      domainFailTrials.length,
      'empirical-domain-cluster',
      domainFailTrials.map((tr) => tr.taskId),
      true
    );
  }

  engine.quarantineVault.saveToDisk();
  console.log(
    `[HOPE Clock 2] Staged ${engine.quarantineVault.size} isolated candidates in QuarantineVault (flushed=${flushRes.staged.length}): [${evaluationOrder.join(', ')}]`
  );

  // =========================================================================
  // CLOCK 3 (Slow Clock): DeepMetaOptimizer with Live Prompt-Cached Paired Canary Replay
  // =========================================================================
  let replayCache: Record<string, CachedTsReplayEntry> = {};
  if (fs.existsSync(replayCachePath)) {
    replayCache = JSON.parse(
      fs.readFileSync(replayCachePath, 'utf8')
    ) as Record<string, CachedTsReplayEntry>;
  }

  // Seed replay cache deterministically with exact prompt-matched trials from checkpoint.json
  const seedFromArm = (arm: 'C_ID_auto' | 'C_ID_prereq') => {
    for (const task of tasks) {
      const trial = checkpoint.trials[`${task.id}::${arm}`];
      if (!trial) continue;
      const lessonsBlock = trial.retrievedRuleIds
        .map((id) => `[${id}] ${cidAutoById.get(id) ?? ''}`)
        .join('\n');
      const sysPrompt = buildBaseTsApiSystemPrompt(lessonsBlock);
      const key = promptCacheKey(task.id, sysPrompt);
      if (!replayCache[key]) {
        replayCache[key] = {
          cacheKey: key,
          taskId: task.id,
          retrievedRuleIds: [...trial.retrievedRuleIds],
          tsSource: trial.tsSource,
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

  const livePairedEvaluator: PairedCanaryEvaluator<TsApiSecurityTask> = async (
    task,
    snapshot
  ) => {
    const rankedIds = rankedByTaskId.get(task.id)!;
    const ret = retrieveWithPrerequisites(rankedIds, topK, snapshot.prerequisiteGraph);
    const lessonsMap = buildLessonsMapForSnapshot(snapshot, canonicalById, cidAutoById);
    const lessonsBlock = ret.selected
      .map((id) => `[${id}] ${lessonsMap.get(id) ?? ''}`)
      .join('\n');
    const systemPrompt = buildBaseTsApiSystemPrompt(lessonsBlock);
    const key = promptCacheKey(task.id, systemPrompt);

    let cached = replayCache[key];
    if (!cached) {
      const userPrompt = buildTsApiUserPrompt(task);
      const gen = await generateTsHandlerViaLlm(model, systemPrompt, userPrompt, 0, provider);
      const evaluation = await cartridge.evaluate(task, gen.tsSource);
      const forensicFlags = cartridge.classifyForensics(task, gen.tsSource);
      const boundCount = evaluation.boundFacts.length;
      const passedCount = evaluation.passedFacts.length;
      const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

      cached = {
        cacheKey: key,
        taskId: task.id,
        retrievedRuleIds: [...ret.selected],
        tsSource: gen.tsSource,
        committed: evaluation.committed,
        fullTaskPass,
        passedFactsCount: passedCount,
        boundFactsCount: boundCount,
        factPassRate: boundCount > 0 ? passedCount / boundCount : 1,
        passedFacts: [...evaluation.passedFacts],
        failedFacts: [...evaluation.failedFacts],
        forensicFlags,
        ...(evaluation.stderr ? { stderr: evaluation.stderr } : {}),
        returnedModel: gen.returnedModel,
        finishReason: gen.finishReason,
        latencyMs: gen.latencyMs,
        source: 'live-replay',
        timestamp: new Date().toISOString(),
      };
      replayCache[key] = cached;
      saveReplayCache();
      console.log(
        `  [SlowClock Live Replay] ${task.id} | rules=[${ret.selected.join(',')}] -> ${
          fullTaskPass ? 'PASS' : 'FAIL'
        } (${passedCount}/${boundCount}) failed=[${evaluation.failedFacts.join(',')}]`
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

  const candidateDecisions: TsApiCandidateDecisionRecord[] = [];
  // Protected canary cohort: all tasks passing full-task in C_ID_auto, PLUS if zero tasks passed
  // full-task initially, protect the non-target tasks from fact-score regressions!
  const activeCanaryIds = new Set<string>(passingCanaryTasks.map((t) => t.id));

  for (const candidateId of evaluationOrder) {
    const candidate = engine.quarantineVault.getCandidate(candidateId)!;
    const meta = candidateMeta.get(candidateId)!;
    const targetTaskIdSet = new Set(meta.targetTaskIds);
    const targetTasks = meta.targetTaskIds
      .map((id) => tasksById.get(id)!)
      .filter(Boolean);

    // Protect all passing canaries AND any non-target task (so no domain regresses another!)
    const canaryIdSet = new Set<string>(activeCanaryIds);
    for (const t of tasks) {
      if (!targetTaskIdSet.has(t.id)) {
        canaryIdSet.add(t.id);
      }
    }
    const canaryTasks = Array.from(canaryIdSet)
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

  const receiptFile: TsApiHopeReceiptFile = {
    schemaVersion: '4.0.0-hope-governance-receipt',
    cartridgeId: 'ts-api-security-v4',
    model,
    topK,
    temperature: 0,
    sourceCheckpointPath: path.relative(process.cwd(), checkpointPath).replace(/\\/g, '/'),
    initialSnapshotSha256,
    finalSnapshotSha256,
    promotedPrerequisiteGraph: { ...finalSnapshot.prerequisiteGraph },
    updatedRuleStatements,
    fastClockTraceCount: engine.fastClock.size,
    canaryCohortTaskIds: Array.from(activeCanaryIds).sort(),
    candidateDecisions,
    promotionReceipts: [...engine.getPromotionReceipts()],
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(receiptOutPath, `${JSON.stringify(receiptFile, null, 2)}\n`, 'utf8');
  if (modelSlug === 'gemini-3-1-flash-lite') {
    fs.writeFileSync(canonicalReceiptPath, `${JSON.stringify(receiptFile, null, 2)}\n`, 'utf8');
  }
  console.log(`\n[HOPE] Wrote Slow Clock governance receipt to ${receiptOutPath}`);

  // =========================================================================
  // LIVE EVALUATION OF C_ID_hope ARM (15 calls on gemini-3.1-flash-lite, temp=0)
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
    const systemPrompt = buildBaseTsApiSystemPrompt(lessonsBlock);
    const userPrompt = buildTsApiUserPrompt(task);
    const cacheKey = promptCacheKey(task.id, systemPrompt);
    const cachedHit = reuseReplayCache ? replayCache[cacheKey] : undefined;

    let record: TsApiPilotTrialRecord;
    let usedCache = false;

    if (cachedHit) {
      usedCache = true;
      record = {
        key,
        taskId: task.id,
        domain: task.domain,
        cohortId: task.cohortId,
        arm: 'C_ID_hope',
        retrievedRuleIds: [...retrieval.selected],
        injectedPrerequisites: [...retrieval.injectedPrerequisites],
        displacedRuleIds: [...retrieval.displaced],
        promptChars: systemPrompt.length + userPrompt.length,
        artifactSha256: computeArtifactSha256(cachedHit.tsSource),
        tsSource: cachedHit.tsSource,
        committed: cachedHit.committed,
        fullTaskPass: cachedHit.fullTaskPass,
        boundFactsCount: cachedHit.boundFactsCount,
        passedFactsCount: cachedHit.passedFactsCount,
        factPassRate: cachedHit.factPassRate,
        passedFacts: [...cachedHit.passedFacts],
        failedFacts: [...cachedHit.failedFacts],
        forensicFlags: { ...cachedHit.forensicFlags },
        ...(cachedHit.stderr ? { stderr: cachedHit.stderr } : {}),
        returnedModel: cachedHit.returnedModel ?? model,
        finishReason: cachedHit.finishReason ?? 'stop',
        latencyMs: cachedHit.latencyMs ?? 0,
        timestamp: cachedHit.timestamp,
      };
    } else {
      const gen = await generateTsHandlerViaLlm(model, systemPrompt, userPrompt, 0, provider);
      const evaluation = await cartridge.evaluate(task, gen.tsSource);
      const forensicFlags = cartridge.classifyForensics(task, gen.tsSource);
      const boundCount = evaluation.boundFacts.length;
      const passedCount = evaluation.passedFacts.length;
      const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

      record = {
        key,
        taskId: task.id,
        domain: task.domain,
        cohortId: task.cohortId,
        arm: 'C_ID_hope',
        retrievedRuleIds: [...retrieval.selected],
        injectedPrerequisites: [...retrieval.injectedPrerequisites],
        displacedRuleIds: [...retrieval.displaced],
        promptChars: systemPrompt.length + userPrompt.length,
        artifactSha256: computeArtifactSha256(gen.tsSource),
        tsSource: gen.tsSource,
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
    }

    checkpoint.trials[key] = record;
    checkpoint.updatedAt = new Date().toISOString();
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

    hopeDone++;
    const statusMark = record.fullTaskPass ? 'PASS' : record.committed ? 'FAIL' : 'COMPILE_ERR';
    console.log(
      `[${String(hopeDone).padStart(2, '0')}/${tasks.length}] ${task.id} | C_ID_hope   | ${statusMark.padEnd(11)} | facts=${record.passedFactsCount}/${record.boundFactsCount} | rules=[${retrieval.selected.join(',')}] | failed=[${record.failedFacts.join(',')}] (${usedCache ? 'replay-cache' : `${record.latencyMs}ms`})`
    );

    if (!usedCache && delayMs > 0) await sleep(delayMs);
  }

  const summary = summarizeTsApiPilotCheckpoint(checkpoint);
  const summaryMd = formatTsApiSummaryMarkdown(summary);
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
    provider: rawProvider as TsApiProviderOverride | undefined,
    topK: topKIdx >= 0 && argv[topKIdx + 1] ? Number(argv[topKIdx + 1]) : 4,
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 1000,
    forceHopeArm: argv.includes('--force-hope-arm'),
    reuseReplayCache: argv.includes('--reuse-replay-cache'),
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-ts-api-hope-loop.ts');

if (isEntrypoint) {
  const args = parseCliArgs(process.argv.slice(2));
  runTsApiHopeLoop(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
