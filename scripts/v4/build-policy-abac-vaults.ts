// scripts/v4/build-policy-abac-vaults.ts
// Generates two frozen distillation vaults under .axiom-state/v4/ from the 12 canonical
// PolicyAbacCartridge rules:
//   1. policy-abac-c.json        — Unconstrained prose distillation (no lexical token lock)
//   2. policy-abac-cid-auto.json — Lexical-locked distillation gated by extractRequiredTokens() (100% retention)

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ADVISOR_SYSTEM_PROMPT } from '../../src/advisor.js';
import { resolveEndpoint, sanitizeReasoningTags } from '../../src/executor.js';
import {
  PolicyAbacCartridge,
} from '../../src/v4/cartridges/policy-abac-cartridge.js';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  computeCanonicalJsonSha256,
  evaluateLexicalIdentifierLock,
} from '../../src/v4/hope/index.js';
import { extractRequiredTokens } from '../../src/v4/lexical-token-extractor.js';

dotenv.config();

export interface PolicyVaultLesson {
  readonly factId: string;
  readonly lesson: string;
  readonly origin: 'distilled' | 'distilled-fallback-canonical';
  readonly canonicalStatement: string;
  readonly requiredTokens: readonly string[];
  readonly retainedTokens: readonly string[];
  readonly missingTokens: readonly string[];
  readonly retentionRate: number;
  readonly distillAttempts: number;
  readonly createdAt: string;
}

export interface PolicyAbacVaultFile {
  readonly schemaVersion: '4.0.0-policy-vault';
  readonly cartridgeId: 'policy-abac-v4';
  readonly variant: 'C' | 'C_ID_auto';
  readonly distillerModel: string;
  readonly temperature: number;
  readonly canonicalRulesSha256: string;
  readonly lexicalLockAudit: {
    readonly totalRequiredTokens: number;
    readonly totalRetainedTokens: number;
    readonly overallRetentionRate: number;
    readonly rulesAt100Pct: number;
    readonly totalRules: number;
  };
  readonly lessons: readonly PolicyVaultLesson[];
  readonly generatedAt: string;
}

export const POLICY_VAULT_C_PATH = path.resolve(
  '.axiom-state',
  'v4',
  'policy-abac-c.json'
);
export const POLICY_VAULT_CID_AUTO_PATH = path.resolve(
  '.axiom-state',
  'v4',
  'policy-abac-cid-auto.json'
);

const LEXICAL_LOCKED_SYSTEM_PROMPT = [
  'You are a terse Policy-as-Code (Cedar ABAC) compliance distiller.',
  'Distill the canonical authorization rule into one crisp operational lesson under 35 words.',
  'CRITICAL: You MUST preserve EVERY required literal token listed by the user verbatim (exact spelling, underscores, quotes, namespaces, and numeric bounds).',
  'Output ONLY the single-line distilled lesson text with no Markdown bullets or commentary.',
].join(' ');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callDistillerLlm(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0
): Promise<string> {
  const endpoint = resolveEndpoint(model);
  const MAX_RETRIES = 4;
  let rateLimitAttempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (response.status === 429 || response.status === 503) {
        rateLimitAttempts++;
        if (rateLimitAttempts > 12) {
          throw new Error(`Rate limited (${response.status}) too many times while distilling.`);
        }
        const retryAfter = parseInt(response.headers.get('retry-after') || '4', 10);
        const delayMs = Math.min((retryAfter + rateLimitAttempts * 2) * 1000, 30_000);
        console.warn(
          `[v4-vault] HTTP ${response.status}; waiting ${(delayMs / 1000).toFixed(1)}s before retry...`
        );
        await sleep(delayMs);
        attempt--;
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        if (response.status < 500) {
          throw new Error(`Non-retryable distiller HTTP ${response.status}: ${body}`);
        }
        throw new Error(`Distiller 5xx HTTP ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? '';
      const sanitized = sanitizeReasoningTags(raw, { sqlAware: false }).sanitizedText;
      const cleaned = sanitized
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) {
        throw new Error('Distiller returned empty lesson text.');
      }
      return cleaned;
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const waitMs = Math.pow(2, attempt) * 1000;
      console.warn(
        `[v4-vault] Attempt ${attempt}/${MAX_RETRIES} failed: ${
          err instanceof Error ? err.message : String(err)
        }. Retrying in ${waitMs}ms...`
      );
      await sleep(waitMs);
    }
  }

  throw new Error('Distiller exhausted retries.');
}

function auditLessonRetention(
  rule: CanonicalRule,
  allRules: readonly CanonicalRule[],
  lessonText: string
) {
  return evaluateLexicalIdentifierLock(
    {
      candidateId: `AUDIT-${rule.id}`,
      factId: rule.id,
      triggerFlag: 'distill',
      proposedRuleText: lessonText,
      proposedPrerequisiteEdges: [],
      evidenceHashes: [],
      observedCount: 1,
      status: 'staged',
      gateAudit: null,
      createdAt: '',
      updatedAt: '',
    },
    allRules
  );
}

function buildVaultFile(
  variant: 'C' | 'C_ID_auto',
  model: string,
  canonicalRules: readonly CanonicalRule[],
  lessons: readonly PolicyVaultLesson[]
): PolicyAbacVaultFile {
  let totalRequiredTokens = 0;
  let totalRetainedTokens = 0;
  let rulesAt100Pct = 0;

  for (const item of lessons) {
    totalRequiredTokens += item.requiredTokens.length;
    totalRetainedTokens += item.retainedTokens.length;
    if (item.missingTokens.length === 0) rulesAt100Pct++;
  }

  return {
    schemaVersion: '4.0.0-policy-vault',
    cartridgeId: 'policy-abac-v4',
    variant,
    distillerModel: model,
    temperature: 0,
    canonicalRulesSha256: computeCanonicalJsonSha256(
      canonicalRules.map((r) => ({ id: r.id, statement: r.statement }))
    ),
    lexicalLockAudit: {
      totalRequiredTokens,
      totalRetainedTokens,
      overallRetentionRate:
        totalRequiredTokens > 0 ? totalRetainedTokens / totalRequiredTokens : 1,
      rulesAt100Pct,
      totalRules: lessons.length,
    },
    lessons,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildPolicyAbacVaults(options: {
  model?: string;
  force?: boolean;
  delayMs?: number;
} = {}): Promise<{ vaultC: PolicyAbacVaultFile; vaultCidAuto: PolicyAbacVaultFile }> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const force = options.force ?? false;
  const delayMs = options.delayMs ?? 350;

  const cartridge = new PolicyAbacCartridge();
  const { rules } = cartridge.loadCanonicalRules();

  fs.mkdirSync(path.dirname(POLICY_VAULT_C_PATH), { recursive: true });

  // --- 1. Unconstrained Prose Distillation Vault (policy-abac-c.json) ---
  let vaultC: PolicyAbacVaultFile;
  if (!force && fs.existsSync(POLICY_VAULT_C_PATH)) {
    vaultC = JSON.parse(fs.readFileSync(POLICY_VAULT_C_PATH, 'utf8')) as PolicyAbacVaultFile;
    console.log(`[v4-vault] Loaded existing frozen ${POLICY_VAULT_C_PATH}`);
  } else {
    console.log(`[v4-vault] Distilling unconstrained vault (C) via ${model}...`);
    const lessonsC: PolicyVaultLesson[] = [];
    for (const rule of rules) {
      const userPrompt = `Error code: ${rule.id}\nError detail: Policy failed authorization check (${rule.check ?? rule.id}). Required invariant: ${rule.statement}`;
      const distilled = await callDistillerLlm(model, ADVISOR_SYSTEM_PROMPT, userPrompt, 0);
      const audit = auditLessonRetention(rule, rules, distilled);
      lessonsC.push({
        factId: rule.id,
        lesson: distilled,
        origin: 'distilled',
        canonicalStatement: rule.statement,
        requiredTokens: audit.requiredTokens,
        retainedTokens: audit.retainedTokens,
        missingTokens: audit.missingTokens,
        retentionRate: audit.retentionRate,
        distillAttempts: 1,
        createdAt: new Date().toISOString(),
      });
      console.log(
        `  [C] ${rule.id}: ${(audit.retentionRate * 100).toFixed(0)}% tokens (${audit.retainedTokens.length}/${audit.requiredTokens.length}) -> ${distilled}`
      );
      if (delayMs > 0) await sleep(delayMs);
    }
    vaultC = buildVaultFile('C', model, rules, lessonsC);
    fs.writeFileSync(POLICY_VAULT_C_PATH, `${JSON.stringify(vaultC, null, 2)}\n`, 'utf8');
    console.log(`[v4-vault] Wrote ${POLICY_VAULT_C_PATH}`);
  }

  // --- 2. Automated Lexical-Locked Distillation Vault (policy-abac-cid-auto.json) ---
  let vaultCidAuto: PolicyAbacVaultFile;
  if (!force && fs.existsSync(POLICY_VAULT_CID_AUTO_PATH)) {
    vaultCidAuto = JSON.parse(
      fs.readFileSync(POLICY_VAULT_CID_AUTO_PATH, 'utf8')
    ) as PolicyAbacVaultFile;
    console.log(`[v4-vault] Loaded existing frozen ${POLICY_VAULT_CID_AUTO_PATH}`);
  } else {
    console.log(`[v4-vault] Distilling lexical-locked vault (C_ID_auto) via ${model}...`);
    const lessonsCid: PolicyVaultLesson[] = [];
    for (const rule of rules) {
      const requiredTokens = extractRequiredTokens(rule.statement);
      let finalLesson = rule.statement;
      let finalOrigin: PolicyVaultLesson['origin'] = 'distilled-fallback-canonical';
      let finalAudit = auditLessonRetention(rule, rules, rule.statement);
      let attemptsUsed = 0;
      let lastMissing: readonly string[] = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        attemptsUsed = attempt;
        const missingHint =
          lastMissing.length > 0
            ? `\nPrevious attempt dropped these mandatory tokens — you MUST include them verbatim: ${lastMissing.join(', ')}`
            : '';
        const userPrompt = [
          `Rule ID: ${rule.id}`,
          `Canonical invariant: ${rule.statement}`,
          `Required literal tokens (MUST all appear verbatim): ${requiredTokens.join(', ')}`,
          missingHint,
        ]
          .filter(Boolean)
          .join('\n');

        const candidateText = await callDistillerLlm(
          model,
          LEXICAL_LOCKED_SYSTEM_PROMPT,
          userPrompt,
          0
        );
        const audit = auditLessonRetention(rule, rules, candidateText);
        if (audit.passed) {
          finalLesson = candidateText;
          finalOrigin = 'distilled';
          finalAudit = audit;
          break;
        }
        lastMissing = audit.missingTokens;
        if (delayMs > 0) await sleep(delayMs);
      }

      if (!finalAudit.passed) {
        throw new Error(
          `[v4-vault] Lexical Lock invariant failed unexpectedly on ${rule.id}: missing ${finalAudit.missingTokens.join(', ')}`
        );
      }

      lessonsCid.push({
        factId: rule.id,
        lesson: finalLesson,
        origin: finalOrigin,
        canonicalStatement: rule.statement,
        requiredTokens: finalAudit.requiredTokens,
        retainedTokens: finalAudit.retainedTokens,
        missingTokens: finalAudit.missingTokens,
        retentionRate: finalAudit.retentionRate,
        distillAttempts: attemptsUsed,
        createdAt: new Date().toISOString(),
      });
      console.log(
        `  [C_ID_auto] ${rule.id}: ${(finalAudit.retentionRate * 100).toFixed(0)}% tokens (${finalAudit.retainedTokens.length}/${finalAudit.requiredTokens.length}, ${finalOrigin}, attempts=${attemptsUsed}) -> ${finalLesson}`
      );
      if (delayMs > 0) await sleep(delayMs);
    }

    vaultCidAuto = buildVaultFile('C_ID_auto', model, rules, lessonsCid);
    fs.writeFileSync(
      POLICY_VAULT_CID_AUTO_PATH,
      `${JSON.stringify(vaultCidAuto, null, 2)}\n`,
      'utf8'
    );
    console.log(`[v4-vault] Wrote ${POLICY_VAULT_CID_AUTO_PATH}`);
  }

  console.log('\n=== Policy-as-Code Distillation Vault Token Retention Summary ===');
  console.log(
    `C (unconstrained):   ${vaultC.lexicalLockAudit.totalRetainedTokens}/${vaultC.lexicalLockAudit.totalRequiredTokens} (${(
      vaultC.lexicalLockAudit.overallRetentionRate * 100
    ).toFixed(1)}%) | ${vaultC.lexicalLockAudit.rulesAt100Pct}/${vaultC.lexicalLockAudit.totalRules} rules at 100%`
  );
  console.log(
    `C_ID_auto (locked):  ${vaultCidAuto.lexicalLockAudit.totalRetainedTokens}/${vaultCidAuto.lexicalLockAudit.totalRequiredTokens} (${(
      vaultCidAuto.lexicalLockAudit.overallRetentionRate * 100
    ).toFixed(1)}%) | ${vaultCidAuto.lexicalLockAudit.rulesAt100Pct}/${vaultCidAuto.lexicalLockAudit.totalRules} rules at 100%`
  );

  return { vaultC, vaultCidAuto };
}

function parseCliArgs(argv: string[]) {
  const modelIdx = argv.indexOf('--model');
  const delayIdx = argv.indexOf('--delay-ms');
  return {
    model: modelIdx >= 0 && argv[modelIdx + 1] ? argv[modelIdx + 1] : 'gemini-3.1-flash-lite',
    force: argv.includes('--force'),
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 350,
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('build-policy-abac-vaults.ts');

if (isEntrypoint) {
  const args = parseCliArgs(process.argv.slice(2));
  buildPolicyAbacVaults(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
