// scripts/v4/run-policy-abac-masked.ts
// Reverse-Masked Necessity Arm (C_ID_masked) Runner & Bidirectional Summary Compiler
// for PolicyAbacCartridge across our 3-model matrix (18 tasks x 3 models = 54 live calls,
// temperature = 0, K = 4).
//
// Evaluates C_ID_masked using the EXACT same Top-4 TF-IDF retrievedRuleIds as C and C_ID_auto,
// and compiles the bidirectional causal summary:
//   - Sufficiency: C_ID_auto - C         (restoring exact identifiers to distilled prose)
//   - Necessity:   C_ID_masked - C_ID_auto (stripping exact identifiers from verbatim rules)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { getModelProfile, normalizeModelName } from '../../src/executor.js';
import {
  PolicyAbacCartridge,
  type PolicyAbacTask,
} from '../../src/v4/cartridges/policy-abac-cartridge.js';
import { computeArtifactSha256 } from '../../src/v4/hope/index.js';
import {
  POLICY_VAULT_CID_MASKED_PATH,
  type PolicyAbacMaskedVaultFile,
} from './build-policy-abac-masked-vault.js';
import {
  DEFAULT_CROSS_MODEL_TARGETS,
  type CrossModelTargetSpec,
} from './compile-policy-abac-cross-model-summary.js';
import {
  buildBasePolicySystemPrompt,
  rankRulesByPromptTfIdf,
  resolvePolicyProviderEndpoint,
  stripPolicyFences,
  type PilotSummaryReport,
  type PilotTrialRecord,
  type PolicyProviderOverride,
} from './run-policy-abac-pilot.js';

dotenv.config();

export type MaskedTrialRecord = Omit<PilotTrialRecord, 'arm'> & {
  readonly arm: 'C_ID_masked';
};

export interface PolicyAbacMaskedCheckpointFile {
  readonly schemaVersion: '4.0.0-policy-masked-pilot';
  readonly cartridgeId: 'policy-abac-v4';
  readonly arm: 'C_ID_masked';
  readonly requestedModel: string;
  readonly modelSlug: string;
  readonly topK: number;
  readonly temperature: number;
  readonly totalPlannedTrials: number;
  readonly tasksSha256: string;
  readonly vaultCidMaskedSha256: string;
  readonly startedAt: string;
  updatedAt: string;
  trials: Record<string, MaskedTrialRecord>;
}

export interface MaskedArmStats {
  readonly modelId: string;
  readonly provider: string;
  readonly completedTrials: number;
  readonly totalTasks: number;
  readonly fullTaskPassCount: number;
  readonly fullTaskPassRate: number;
  readonly meanFactPassRate: number;
  readonly committedCount: number;
  readonly committedRate: number;
  readonly p01RetrievedCount: number;
  readonly p02RetrievedCount: number;
  readonly forensicDefectCounts: Record<string, number>;
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

async function generateMaskedPolicyViaLlm(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0,
  providerOverride?: PolicyProviderOverride
): Promise<{
  policyText: string;
  returnedModel: string;
  finishReason: string;
  latencyMs: number;
}> {
  const endpoint = resolvePolicyProviderEndpoint(model, providerOverride);
  const effectiveModel = normalizeModelName(model);
  const profile = getModelProfile(model);
  const MAX_RETRIES = 4;
  let rateLimitAttempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const response = await fetch(endpoint.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: profile.maxTokens,
          ...profile.extraRequestBody,
        }),
        signal: AbortSignal.timeout(Math.max(90_000, profile.timeoutMs)),
      });

      if (response.status === 429 || response.status === 503) {
        const errBody = await response.text().catch(() => '');
        const retryAfterRaw = response.headers.get('retry-after');
        const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : 10;
        const isPerMinuteQuota = /PerMinute|per minute|RPM|TPM/i.test(errBody);
        const isDailyQuotaMsg = /tokens per day|requests per day|PerDay|daily.*limit/i.test(errBody);
        const isUnrecoverableDailyQuota =
          !isPerMinuteQuota &&
          ((isDailyQuotaMsg && (Number.isNaN(retryAfter) || retryAfter > 1200)) ||
            (!Number.isNaN(retryAfter) && retryAfter > 1200));
        if (isUnrecoverableDailyQuota) {
          throw new Error(
            `[RATE_LIMIT_QUOTA] ${endpoint.provider.toUpperCase()} HTTP ${response.status} (retry-after=${retryAfterRaw ?? 'n/a'}): ${errBody.slice(0, 300)}`
          );
        }

        rateLimitAttempts++;
        if (rateLimitAttempts > 25) {
          throw new Error(
            `[RATE_LIMIT_EXHAUSTED] Exceeded rate-limit retries (HTTP ${response.status}): ${errBody.slice(0, 200)}`
          );
        }
        const retryDelayMatch = errBody.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
        const parsedHintSec = retryDelayMatch ? Math.ceil(parseFloat(retryDelayMatch[1])) : NaN;
        const baseDelay =
          !Number.isNaN(parsedHintSec) && parsedHintSec > 0
            ? parsedHintSec + 2
            : !Number.isNaN(retryAfter) && retryAfter > 0
              ? retryAfter
              : 15;
        const maxCapMs = isDailyQuotaMsg ? 1_215_000 : 65_000;
        const delayMs = Math.min((baseDelay + Math.min(rateLimitAttempts * 3, 15)) * 1000, maxCapMs);
        console.warn(
          `[v4-masked] ${endpoint.provider} HTTP ${response.status}; waiting ${(delayMs / 1000).toFixed(1)}s before retry (${rateLimitAttempts}/25)...`
        );
        await sleep(delayMs);
        attempt--;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(
            `[NON_RETRYABLE] ${endpoint.provider.toUpperCase()} executor HTTP ${response.status}: ${errText}`
          );
        }
        throw new Error(
          `${endpoint.provider.toUpperCase()} executor 5xx HTTP ${response.status}: ${errText}`
        );
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string };
        }>;
      };
      const choice = data.choices?.[0];
      const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const policyText = stripPolicyFences(rawContent);
      return {
        policyText,
        returnedModel: data.model ?? effectiveModel,
        finishReason: choice?.finish_reason ?? 'unknown',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('[RATE_LIMIT_QUOTA]') ||
        msg.includes('[RATE_LIMIT_EXHAUSTED]') ||
        msg.includes('[NON_RETRYABLE]')
      ) {
        throw err;
      }
      if (attempt >= MAX_RETRIES) throw err;
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.warn(
        `[v4-masked] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${backoffMs}ms...`
      );
      await sleep(backoffMs);
    }
  }

  throw new Error('Masked policy generation exhausted retries.');
}

function summarizeMaskedCheckpoint(
  spec: CrossModelTargetSpec,
  checkpoint: PolicyAbacMaskedCheckpointFile
): MaskedArmStats {
  const subset = Object.values(checkpoint.trials);
  const totalTasks = subset.length;
  const fullTaskPassCount = subset.filter((t) => t.fullTaskPass).length;
  const committedCount = subset.filter((t) => t.committed).length;
  const meanFactPassRate =
    totalTasks > 0 ? subset.reduce((acc, t) => acc + t.factPassRate, 0) / totalTasks : 0;
  const p01RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('P-01')).length;
  const p02RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('P-02')).length;

  const defectCounts: Record<string, number> = {};
  for (const t of subset) {
    for (const [flag, val] of Object.entries(t.forensicFlags)) {
      if (defectCounts[flag] === undefined) defectCounts[flag] = 0;
      if (val) defectCounts[flag]++;
    }
  }

  return {
    modelId: spec.modelId,
    provider: spec.provider,
    completedTrials: totalTasks,
    totalTasks,
    fullTaskPassCount,
    fullTaskPassRate: totalTasks > 0 ? fullTaskPassCount / totalTasks : 0,
    meanFactPassRate,
    committedCount,
    committedRate: totalTasks > 0 ? committedCount / totalTasks : 0,
    p01RetrievedCount,
    p02RetrievedCount,
    forensicDefectCounts: defectCounts,
  };
}

export async function runPolicyAbacMasked(options: {
  model?: string;
  provider?: PolicyProviderOverride;
  topK?: number;
  delayMs?: number;
  vaultMaskedPath?: string;
} = {}): Promise<MaskedArmStats> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const provider = options.provider;
  const topK = options.topK ?? 4;
  const delayMs = options.delayMs ?? 450;
  const modelSlug = slugifyModel(model);

  const vaultPath = path.resolve(options.vaultMaskedPath ?? POLICY_VAULT_CID_MASKED_PATH);
  if (!fs.existsSync(vaultPath)) {
    throw new Error(
      `Missing reverse-masked vault at ${vaultPath}. Run "npx tsx scripts/v4/build-policy-abac-masked-vault.ts" first.`
    );
  }

  const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')) as PolicyAbacMaskedVaultFile;
  if (
    vault.lexicalLockAudit.totalRetainedTokens !== 0 ||
    vault.lexicalLockAudit.rulesWithZeroTokensRetained !== 12
  ) {
    throw new Error(
      `Reverse-masked vault integrity failure: expected 0 retained tokens, found ${vault.lexicalLockAudit.totalRetainedTokens}.`
    );
  }

  const cartridge = new PolicyAbacCartridge();
  const tasks = cartridge.loadTasks();
  const { rules: canonicalRules } = cartridge.loadCanonicalRules();
  const maskedById = new Map(vault.lessons.map((l) => [l.factId, l.lesson]));

  const runDir = path.resolve('.axiom-state', 'runs-v4', `policy-abac-masked-${modelSlug}`);
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  fs.mkdirSync(runDir, { recursive: true });

  const tasksPath = path.resolve('fixtures', 'v4', 'policy-abac-tasks.json');
  const tasksSha256 = sha256File(tasksPath);
  const vaultCidMaskedSha256 = sha256File(vaultPath);

  let checkpoint: PolicyAbacMaskedCheckpointFile;
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf8')
    ) as PolicyAbacMaskedCheckpointFile;
    console.log(
      `[v4-masked] Resuming ${checkpointPath} (${Object.keys(checkpoint.trials).length}/${checkpoint.totalPlannedTrials} completed)`
    );
  } else {
    const now = new Date().toISOString();
    checkpoint = {
      schemaVersion: '4.0.0-policy-masked-pilot',
      cartridgeId: 'policy-abac-v4',
      arm: 'C_ID_masked',
      requestedModel: model,
      modelSlug,
      topK,
      temperature: 0,
      totalPlannedTrials: tasks.length,
      tasksSha256,
      vaultCidMaskedSha256,
      startedAt: now,
      updatedAt: now,
      trials: {},
    };
  }

  const saveCheckpoint = () => {
    checkpoint.updatedAt = new Date().toISOString();
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  };

  let completedCount = Object.keys(checkpoint.trials).length;
  const totalCount = tasks.length;

  for (const task of tasks) {
    const key = `${task.id}::C_ID_masked`;
    if (checkpoint.trials[key]) {
      continue;
    }

    // Exact same Top-4 TF-IDF ranking over canonical rules as C and C_ID_auto
    const rankedRuleIds = rankRulesByPromptTfIdf(task.prompt, canonicalRules);
    const retrievedRuleIds = rankedRuleIds.slice(0, topK);
    const lessonsBlock = retrievedRuleIds
      .map((id) => `[${id}] ${maskedById.get(id) ?? ''}`)
      .join('\n');

    const systemPrompt = buildBasePolicySystemPrompt(lessonsBlock);
    const userPrompt = `Task ${task.id} (${task.domain}): ${task.title}\n${task.prompt}`;

    const gen = await generateMaskedPolicyViaLlm(model, systemPrompt, userPrompt, 0, provider);
    const evaluation = cartridge.evaluate(task, gen.policyText);
    const forensicFlags = cartridge.classifyForensics(task, gen.policyText);
    const boundCount = evaluation.boundFacts.length;
    const passedCount = evaluation.passedFacts.length;
    const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

    checkpoint.trials[key] = {
      key,
      taskId: task.id,
      domain: task.domain,
      cohortId: task.cohortId,
      arm: 'C_ID_masked',
      retrievedRuleIds: [...retrievedRuleIds],
      injectedPrerequisites: [],
      displacedRuleIds: [],
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
    saveCheckpoint();

    completedCount++;
    const statusMark = fullTaskPass ? 'PASS' : evaluation.committed ? 'FAIL' : 'SYNTAX_ERR';
    console.log(
      `[${String(completedCount).padStart(2, '0')}/${totalCount}] ${task.id} | C_ID_masked | ${statusMark.padEnd(10)} | facts=${passedCount}/${boundCount} | rules=[${retrievedRuleIds.join(',')}] | failed=[${evaluation.failedFacts.join(',')}] (${gen.latencyMs}ms)`
    );

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const matchedSpec =
    DEFAULT_CROSS_MODEL_TARGETS.find((t) => t.modelId === model) ?? {
      modelId: model,
      slug: modelSlug,
      provider: provider ?? 'unknown',
    };
  return summarizeMaskedCheckpoint(matchedSpec, checkpoint);
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtSignedPp(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
}

function pp(a: number, b: number): number {
  return Number(((a - b) * 100).toFixed(2));
}

export function compilePolicyAbacMaskedSummary(
  targets: readonly CrossModelTargetSpec[] = DEFAULT_CROSS_MODEL_TARGETS
): { markdown: string; jsonPath: string; mdPath: string } {
  const crossModelPath = path.resolve('out', 'v4', 'policy-abac-cross-model-summary.json');
  if (!fs.existsSync(crossModelPath)) {
    throw new Error(`Missing ${crossModelPath} baseline summary.`);
  }
  const crossModel = JSON.parse(fs.readFileSync(crossModelPath, 'utf8')) as {
    models: Array<{
      modelId: string;
      provider: string;
      summary: PilotSummaryReport | null;
    }>;
  };
  const vault = fs.existsSync(POLICY_VAULT_CID_MASKED_PATH)
    ? (JSON.parse(
        fs.readFileSync(POLICY_VAULT_CID_MASKED_PATH, 'utf8')
      ) as PolicyAbacMaskedVaultFile)
    : null;

  const entries = targets.map((spec) => {
    const baseline = crossModel.models.find((m) => m.modelId === spec.modelId)?.summary ?? null;
    const cpPath = path.resolve(
      '.axiom-state',
      'runs-v4',
      `policy-abac-masked-${spec.slug}`,
      'checkpoint.json'
    );
    const maskedStats = fs.existsSync(cpPath)
      ? summarizeMaskedCheckpoint(
          spec,
          JSON.parse(fs.readFileSync(cpPath, 'utf8')) as PolicyAbacMaskedCheckpointFile
        )
      : null;

    const complete = Boolean(baseline && maskedStats && maskedStats.completedTrials === 18);
    const contrasts =
      baseline && maskedStats && maskedStats.totalTasks > 0
        ? {
            sufficiency_C_ID_auto_minus_C_task: baseline.contrastsPp.C_ID_auto_minus_C_task,
            sufficiency_C_ID_auto_minus_C_fact: baseline.contrastsPp.C_ID_auto_minus_C_fact,
            necessity_C_ID_masked_minus_C_ID_auto_task: pp(
              maskedStats.fullTaskPassRate,
              baseline.arms.C_ID_auto.fullTaskPassRate
            ),
            necessity_C_ID_masked_minus_C_ID_auto_fact: pp(
              maskedStats.meanFactPassRate,
              baseline.arms.C_ID_auto.meanFactPassRate
            ),
            masked_minus_C_task: pp(
              maskedStats.fullTaskPassRate,
              baseline.arms.C.fullTaskPassRate
            ),
            masked_minus_C_fact: pp(
              maskedStats.meanFactPassRate,
              baseline.arms.C.meanFactPassRate
            ),
            masked_minus_A_task: pp(
              maskedStats.fullTaskPassRate,
              baseline.arms.A.fullTaskPassRate
            ),
            masked_minus_A_fact: pp(
              maskedStats.meanFactPassRate,
              baseline.arms.A.meanFactPassRate
            ),
          }
        : null;

    return {
      spec,
      complete,
      baseline,
      maskedStats,
      contrasts,
    };
  });

  const completeEntries = entries.filter((e) => e.complete && e.baseline && e.maskedStats && e.contrasts);
  const pooled =
    completeEntries.length >= 2
      ? (() => {
          const n = completeEntries.length;
          const avg = (fn: (e: (typeof completeEntries)[number]) => number) =>
            completeEntries.reduce((acc, e) => acc + fn(e), 0) / n;
          const armA_task = avg((e) => e.baseline!.arms.A.fullTaskPassRate);
          const armC_task = avg((e) => e.baseline!.arms.C.fullTaskPassRate);
          const armAuto_task = avg((e) => e.baseline!.arms.C_ID_auto.fullTaskPassRate);
          const armMasked_task = avg((e) => e.maskedStats!.fullTaskPassRate);
          const armA_fact = avg((e) => e.baseline!.arms.A.meanFactPassRate);
          const armC_fact = avg((e) => e.baseline!.arms.C.meanFactPassRate);
          const armAuto_fact = avg((e) => e.baseline!.arms.C_ID_auto.meanFactPassRate);
          const armMasked_fact = avg((e) => e.maskedStats!.meanFactPassRate);
          return {
            modelCount: n,
            totalMaskedTrials: completeEntries.reduce(
              (acc, e) => acc + e.maskedStats!.completedTrials,
              0
            ),
            arms: {
              A: { fullTaskPassRate: armA_task, meanFactPassRate: armA_fact },
              C: { fullTaskPassRate: armC_task, meanFactPassRate: armC_fact },
              C_ID_masked: { fullTaskPassRate: armMasked_task, meanFactPassRate: armMasked_fact },
              C_ID_auto: { fullTaskPassRate: armAuto_task, meanFactPassRate: armAuto_fact },
            },
            contrastsPp: {
              sufficiency_C_ID_auto_minus_C_task: pp(armAuto_task, armC_task),
              sufficiency_C_ID_auto_minus_C_fact: pp(armAuto_fact, armC_fact),
              necessity_C_ID_masked_minus_C_ID_auto_task: pp(armMasked_task, armAuto_task),
              necessity_C_ID_masked_minus_C_ID_auto_fact: pp(armMasked_fact, armAuto_fact),
              masked_minus_C_task: pp(armMasked_task, armC_task),
              masked_minus_C_fact: pp(armMasked_fact, armC_fact),
              masked_minus_A_task: pp(armMasked_task, armA_task),
              masked_minus_A_fact: pp(armMasked_fact, armA_fact),
            },
          };
        })()
      : null;

  const lines: string[] = [
    '# Axiom-HOPE v4 Reverse-Masked Necessity Arm (`C_ID_masked`) Summary',
    '',
    '- **Cartridge:** `policy-abac-v4` (`18` held-out Cedar-style ABAC tasks, exact same Top-`4` TF-IDF `retrievedRuleIds` as `C` and `C_ID_auto`, `temperature = 0`)',
    `- **Reverse-Masked Vault:** \`.axiom-state/v4/policy-abac-cid-masked.json\` (${
      vault
        ? `${vault.lexicalLockAudit.totalRetainedTokens}/${vault.lexicalLockAudit.totalRequiredTokens} (${(
            vault.lexicalLockAudit.overallRetentionRate * 100
          ).toFixed(1)}%) operational tokens retained; ${vault.lengthAudit.totalMaskedChars} chars (${vault.lengthAudit.charRatioVsCidAuto?.toFixed(2) ?? vault.lengthAudit.charRatioVsCanonical.toFixed(2)}x vs. C_ID_auto)`
        : 'not built'
    })`,
    '- **Bidirectional Identification:**',
    '  - **Sufficiency (`C_ID_auto - C`):** Restoring exact operational tokens to distilled prose.',
    '  - **Necessity (`C_ID_masked - C_ID_auto`):** Stripping exact operational tokens from full-length canonical rules while controlling prose structure and length.',
    '',
    '## 1. Bidirectional Full-Task Pass Rate Comparison (`C_ID_auto` vs. `C_ID_masked` vs. `C`)',
    '',
    '| Model | Provider | `A` | `C` | `C_ID_masked` | `C_ID_auto` | Sufficiency (`C_ID_auto - C`) | Necessity (`C_ID_masked - C_ID_auto`) | Structure Control (`C_ID_masked - C`) |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const e of entries) {
    if (!e.baseline || !e.maskedStats || !e.contrasts) {
      lines.push(
        `| \`${e.spec.modelId}\` | ${e.spec.provider} | — | — | ${e.maskedStats?.completedTrials ?? 0}/18 | — | — | — | — |`
      );
      continue;
    }
    const b = e.baseline.arms;
    const m = e.maskedStats;
    const c = e.contrasts;
    lines.push(
      `| \`${e.spec.modelId}\` | ${e.spec.provider} | ${fmtPct(b.A.fullTaskPassRate)} | ${fmtPct(b.C.fullTaskPassRate)} | **${fmtPct(m.fullTaskPassRate)}** (${m.fullTaskPassCount}/18) | ${fmtPct(b.C_ID_auto.fullTaskPassRate)} (${b.C_ID_auto.fullTaskPassCount}/18) | ${fmtSignedPp(c.sufficiency_C_ID_auto_minus_C_task)} | **${fmtSignedPp(c.necessity_C_ID_masked_minus_C_ID_auto_task)}** | ${fmtSignedPp(c.masked_minus_C_task)} |`
    );
  }

  if (pooled) {
    lines.push(
      `| **Pooled Mean (n=${pooled.modelCount})** | Multi-Provider | ${fmtPct(pooled.arms.A.fullTaskPassRate)} | ${fmtPct(pooled.arms.C.fullTaskPassRate)} | **${fmtPct(pooled.arms.C_ID_masked.fullTaskPassRate)}** | ${fmtPct(pooled.arms.C_ID_auto.fullTaskPassRate)} | ${fmtSignedPp(pooled.contrastsPp.sufficiency_C_ID_auto_minus_C_task)} | **${fmtSignedPp(pooled.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_task)}** | ${fmtSignedPp(pooled.contrastsPp.masked_minus_C_task)} |`
    );
  }

  lines.push(
    '',
    '## 2. Bidirectional Mean Bound-Fact Pass Rate Comparison',
    '',
    '| Model | `A` | `C` | `C_ID_masked` | `C_ID_auto` | Sufficiency (`C_ID_auto - C`) | Necessity (`C_ID_masked - C_ID_auto`) | Structure Control (`C_ID_masked - C`) |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
  );

  for (const e of entries) {
    if (!e.baseline || !e.maskedStats || !e.contrasts) continue;
    const b = e.baseline.arms;
    const m = e.maskedStats;
    const c = e.contrasts;
    lines.push(
      `| \`${e.spec.modelId}\` | ${fmtPct(b.A.meanFactPassRate)} | ${fmtPct(b.C.meanFactPassRate)} | **${fmtPct(m.meanFactPassRate)}** | ${fmtPct(b.C_ID_auto.meanFactPassRate)} | ${fmtSignedPp(c.sufficiency_C_ID_auto_minus_C_fact)} | **${fmtSignedPp(c.necessity_C_ID_masked_minus_C_ID_auto_fact)}** | ${fmtSignedPp(c.masked_minus_C_fact)} |`
    );
  }

  if (pooled) {
    lines.push(
      `| **Pooled Mean (n=${pooled.modelCount})** | ${fmtPct(pooled.arms.A.meanFactPassRate)} | ${fmtPct(pooled.arms.C.meanFactPassRate)} | **${fmtPct(pooled.arms.C_ID_masked.meanFactPassRate)}** | ${fmtPct(pooled.arms.C_ID_auto.meanFactPassRate)} | ${fmtSignedPp(pooled.contrastsPp.sufficiency_C_ID_auto_minus_C_fact)} | **${fmtSignedPp(pooled.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_fact)}** | ${fmtSignedPp(pooled.contrastsPp.masked_minus_C_fact)} |`
    );
  }

  if (vault) {
    lines.push(
      '',
      '## 3. Length & Operational Token Control (`policy-abac-cid-masked.json`)',
      '',
      '| Vault | Tokens Retained | Retention % | Total Chars | Total Words | Char Ratio vs. `C_ID_auto` | Word Ratio vs. `C_ID_auto` |',
      '| :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
      `| Canonical Rules (\`P-01..P-12\`) | \`${vault.lexicalLockAudit.totalRequiredTokens}/${vault.lexicalLockAudit.totalRequiredTokens}\` | 100.0% | ${vault.lengthAudit.totalCanonicalChars} | ${vault.lengthAudit.totalCanonicalWords} | ${(vault.lengthAudit.totalCanonicalChars / (vault.lengthAudit.totalCidAutoChars ?? vault.lengthAudit.totalCanonicalChars)).toFixed(2)}x | ${(vault.lengthAudit.totalCanonicalWords / (vault.lengthAudit.totalCidAutoWords ?? vault.lengthAudit.totalCanonicalWords)).toFixed(2)}x |`,
      ...(vault.lengthAudit.totalCidAutoChars
        ? [
            `| \`C_ID_auto\` (Lexical-Locked) | \`78/78\` | 100.0% | ${vault.lengthAudit.totalCidAutoChars} | ${vault.lengthAudit.totalCidAutoWords} | 1.00x | 1.00x |`,
          ]
        : []),
      `| **\`C_ID_masked\` (Reverse-Masked)** | **\`${vault.lexicalLockAudit.totalRetainedTokens}/${vault.lexicalLockAudit.totalRequiredTokens}\`** | **0.0%** | **${vault.lengthAudit.totalMaskedChars}** | **${vault.lengthAudit.totalMaskedWords}** | **${vault.lengthAudit.charRatioVsCidAuto?.toFixed(2) ?? vault.lengthAudit.charRatioVsCanonical.toFixed(2)}x** | **${vault.lengthAudit.wordRatioVsCidAuto?.toFixed(2) ?? vault.lengthAudit.wordRatioVsCanonical.toFixed(2)}x** |`
    );
  }

  lines.push(
    '',
    '## 4. `C_ID_masked` Forensic Defect Counts (out of 18 tasks per model)',
    '',
    '| Forensic Flag | `gemini-3.1-flash-lite` (`C_ID_masked` / `C_ID_auto`) | `gemma-4-31b-it` (`C_ID_masked` / `C_ID_auto`) | `qwen/qwen3.8-27b` (`C_ID_masked` / `C_ID_auto`) |',
    '| :--- | :---: | :---: | :---: |'
  );

  const flagNames = Object.keys(
    entries[0]?.baseline?.arms.A.forensicDefectCounts ?? {}
  ).sort();
  for (const flag of flagNames) {
    const cells = entries.map((e) => {
      const mVal = e.maskedStats?.forensicDefectCounts[flag] ?? '—';
      const aVal = e.baseline?.arms.C_ID_auto.forensicDefectCounts[flag] ?? '—';
      return `${mVal} / ${aVal}`;
    });
    lines.push(`| \`${flag}\` | ${cells.join(' | ')} |`);
  }

  const outDir = path.resolve('out', 'v4');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'policy-abac-cid-masked-summary.md');
  const jsonPath = path.join(outDir, 'policy-abac-cid-masked-summary.json');
  const markdown = `${lines.join('\n')}\n`;

  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        schemaVersion: '4.0.0-policy-cid-masked-summary',
        cartridgeId: 'policy-abac-v4',
        generatedAt: new Date().toISOString(),
        vaultAudit: vault
          ? {
              lexicalLockAudit: vault.lexicalLockAudit,
              lengthAudit: vault.lengthAudit,
            }
          : null,
        pooled,
        models: entries.map((e) => ({
          modelId: e.spec.modelId,
          provider: e.spec.provider,
          complete: e.complete,
          maskedStats: e.maskedStats,
          baselineArms: e.baseline
            ? {
                A: e.baseline.arms.A,
                C: e.baseline.arms.C,
                C_ID_auto: e.baseline.arms.C_ID_auto,
                C_ID_prereq: e.baseline.arms.C_ID_prereq,
                C_ID_hope: e.baseline.arms.C_ID_hope ?? null,
              }
            : null,
          contrastsPp: e.contrasts,
        })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return { markdown, jsonPath, mdPath };
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
    model: modelIdx >= 0 && argv[modelIdx + 1] ? argv[modelIdx + 1] : undefined,
    provider: rawProvider as PolicyProviderOverride | undefined,
    topK: topKIdx >= 0 && argv[topKIdx + 1] ? Number(argv[topKIdx + 1]) : 4,
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 450,
    compileOnly: argv.includes('--compile-only'),
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-policy-abac-masked.ts');

if (isEntrypoint) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.compileOnly) {
    const { markdown, mdPath, jsonPath } = compilePolicyAbacMaskedSummary();
    console.log(markdown);
    console.log(`[v4-masked] Wrote ${mdPath}`);
    console.log(`[v4-masked] Wrote ${jsonPath}`);
  } else {
    const targets: readonly { model: string; provider: PolicyProviderOverride; delayMs: number }[] =
      args.model
        ? [
            {
              model: args.model,
              provider:
                args.provider ?? (args.model.startsWith('qwen/') ? 'groq' : 'gemini'),
              delayMs: args.delayMs,
            },
          ]
        : [
            { model: 'gemini-3.1-flash-lite', provider: 'gemini', delayMs: 450 },
            { model: 'gemma-4-31b-it', provider: 'gemini', delayMs: 4200 },
            { model: 'qwen/qwen3.8-27b', provider: 'groq', delayMs: 2500 },
          ];

    (async () => {
      for (const target of targets) {
        console.log(`\n=== Running C_ID_masked for ${target.model} (${target.provider}) ===`);
        await runPolicyAbacMasked(target);
      }
      const { markdown, mdPath, jsonPath } = compilePolicyAbacMaskedSummary();
      console.log(`\n${markdown}`);
      console.log(`[v4-masked] Wrote ${mdPath}`);
      console.log(`[v4-masked] Wrote ${jsonPath}`);
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
