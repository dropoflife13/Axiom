// scripts/v4/reflexion-promote.ts
// Slow Clock Promoter for the Antigravity `axiom-self-reflexion` skill.
// Zero LLM calls:
//   1. Extracts required operational tokens (`extractRequiredTokens`) and compacts prose (`compactRuleText`)
//      with strict 100% lexical lock.
//   2. Checks redundancy against existing promoted rules via `detectContextRot()` (blocks Jaccard >= 0.65).
//   3. Runs deterministic canary gate (`npx tsc --noEmit` + `npm test`, unless `--skip-tests`).
//   4. Appends approved rules to `.agents/skills/axiom-self-reflexion/LEARNED_RULES.md` and writes
//      immutable SHA-256 receipts to `.axiom-state/v4/reflexion-receipts.jsonl`.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  compactRuleText,
  computeArtifactSha256,
  computeCanonicalJsonSha256,
  detectContextRot,
} from '../../src/v4/hope/index.js';
import { extractRequiredTokens } from '../../src/v4/lexical-token-extractor.js';
import {
  getReflexionPaths,
  readReflexionQuarantine,
  writeReflexionQuarantine,
  type ReflexionQuarantineCandidate,
} from './reflexion-capture.js';

export interface LearnedRuleEntry {
  readonly id: string;
  readonly signature: string;
  readonly statement: string;
}

export interface ReflexionPromotionReceipt {
  readonly receiptId: string;
  readonly candidateId: string;
  readonly ruleId: string;
  readonly signature: string;
  readonly promotedAt: string;
  readonly compactedRuleText: string;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionPct: number;
  readonly requiredTokens: readonly string[];
  readonly evidenceHashes: readonly string[];
  readonly beforeFileSha256: string;
  readonly afterFileSha256: string;
  readonly receiptSha256: string;
  readonly gateExecuted: boolean;
}

export interface RejectedReflexionCandidate {
  readonly candidateId: string;
  readonly signature: string;
  readonly reason: string;
}

export interface PromoteReflexionOptions {
  readonly rootDir?: string;
  readonly dryRun?: boolean;
  readonly skipTests?: boolean;
  readonly similarityThreshold?: number;
  readonly timestamp?: string;
  /** Optional deterministic canary gate override (defaults to `npx tsc --noEmit` + `npm test`). */
  readonly canaryGateRunner?: (rootDir: string) => { readonly ok: boolean; readonly error?: string };
}

export interface PromoteReflexionResult {
  readonly evaluatedCount: number;
  readonly promoted: readonly ReflexionPromotionReceipt[];
  readonly rejected: readonly RejectedReflexionCandidate[];
  readonly gateExecuted: boolean;
  readonly gatePassed: boolean;
  readonly gateError?: string;
  readonly dryRun: boolean;
}

const DEFAULT_LEARNED_RULES_HEADER = `# Axiom Self-Reflexion — Learned Rules

> Deterministically promoted, lexical-locked workspace rules verified by \`scripts/v4/reflexion-promote.ts\` (\`extractRequiredTokens\` + \`compactRuleText\` + \`detectContextRot\` + \`npx tsc --noEmit\` + \`npm test\`).
> Do not hand-edit receipt hashes; promote new rules via \`scripts/v4/reflexion-capture.ts\` and \`scripts/v4/reflexion-promote.ts\`.

`;

const LEARNED_RULE_LINE_RE = /^- \*\*([A-Z0-9-]+)\*\* \(`([^`]+)`\):\s+(.+)$/;

export function parseLearnedRulesMarkdown(markdown: string): LearnedRuleEntry[] {
  const entries: LearnedRuleEntry[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(LEARNED_RULE_LINE_RE);
    if (!m) continue;
    entries.push({
      id: m[1].trim(),
      signature: m[2].trim(),
      statement: m[3].trim(),
    });
  }
  return entries;
}

function nextLearnedRuleId(existing: readonly LearnedRuleEntry[]): string {
  let maxNum = 0;
  for (const entry of existing) {
    const m = entry.id.match(/^LR-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `LR-${String(maxNum + 1).padStart(3, '0')}`;
}

function runDefaultCanaryGate(rootDir: string): { readonly ok: boolean; readonly error?: string } {
  try {
    execSync('npx tsc --noEmit', { cwd: rootDir, stdio: 'pipe' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `npx tsc --noEmit failed: ${msg}` };
  }
  try {
    execSync('npm test', { cwd: rootDir, stdio: 'pipe' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `npm test failed: ${msg}` };
  }
  return { ok: true };
}

export function promoteReflexionCandidates(
  options: PromoteReflexionOptions = {}
): PromoteReflexionResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const dryRun = options.dryRun ?? false;
  const skipTests = options.skipTests ?? false;
  const similarityThreshold = options.similarityThreshold ?? 0.65;
  const timestamp = options.timestamp ?? new Date().toISOString();

  const { quarantinePath, receiptsPath, learnedRulesPath } = getReflexionPaths(rootDir);
  const quarantine = readReflexionQuarantine(quarantinePath);
  const staged = quarantine.candidates.filter((c) => c.status === 'staged');

  if (staged.length === 0) {
    return {
      evaluatedCount: 0,
      promoted: [],
      rejected: [],
      gateExecuted: false,
      gatePassed: true,
      dryRun,
    };
  }

  const existingMarkdown = fs.existsSync(learnedRulesPath)
    ? fs.readFileSync(learnedRulesPath, 'utf8')
    : DEFAULT_LEARNED_RULES_HEADER;
  const existingEntries = parseLearnedRulesMarkdown(existingMarkdown);

  const activeCanonicalRules: CanonicalRule[] = existingEntries.map((e) => ({
    id: e.id,
    statement: e.statement,
    active: true,
    requiredTokens: extractRequiredTokens(e.statement),
  }));

  interface PreparedPromotion {
    readonly candidate: ReflexionQuarantineCandidate;
    readonly ruleId: string;
    readonly compactedText: string;
    readonly beforeTokens: number;
    readonly afterTokens: number;
    readonly reductionPct: number;
    readonly requiredTokens: readonly string[];
  }

  const prepared: PreparedPromotion[] = [];
  const rejected: RejectedReflexionCandidate[] = [];
  const workingEntries = [...existingEntries];

  for (const candidate of staged) {
    // 1. Extract required operational tokens & compact with 100% lexical lock
    const requiredTokens = extractRequiredTokens(candidate.proposedRuleText);
    const compacted = compactRuleText(candidate.proposedRuleText, requiredTokens);
    if (compacted.preservedTokenCount !== compacted.totalRequiredTokens) {
      rejected.push({
        candidateId: candidate.candidateId,
        signature: candidate.signature,
        reason: `Lexical lock failed (${compacted.preservedTokenCount}/${compacted.totalRequiredTokens} tokens preserved).`,
      });
      continue;
    }

    // 2. Redundancy / context-rot check via detectContextRot() (Jaccard >= similarityThreshold)
    const probeId = `CANDIDATE::${candidate.candidateId}`;
    const probeRule: CanonicalRule = {
      id: probeId,
      statement: compacted.compactedText,
      active: true,
      requiredTokens: compacted.requiredTokens,
    };
    const rotReport = detectContextRot([...activeCanonicalRules, probeRule], [], {
      similarityThreshold,
      maxRuleTokens: 100_000,
    });
    const collision = rotReport.redundantPairs.find(
      (p) => p.ruleIdA === probeId || p.ruleIdB === probeId
    );
    if (collision) {
      const otherId = collision.ruleIdA === probeId ? collision.ruleIdB : collision.ruleIdA;
      rejected.push({
        candidateId: candidate.candidateId,
        signature: candidate.signature,
        reason: `Blocked by context-rot deduplication: Jaccard similarity ${collision.jaccardSimilarity.toFixed(2)} >= ${similarityThreshold.toFixed(2)} against existing rule ${otherId}.`,
      });
      continue;
    }

    const ruleId = nextLearnedRuleId(workingEntries);
    const newEntry: LearnedRuleEntry = {
      id: ruleId,
      signature: candidate.signature,
      statement: compacted.compactedText,
    };
    workingEntries.push(newEntry);
    activeCanonicalRules.push({
      id: ruleId,
      statement: compacted.compactedText,
      active: true,
      requiredTokens: compacted.requiredTokens,
    });

    prepared.push({
      candidate,
      ruleId,
      compactedText: compacted.compactedText,
      beforeTokens: compacted.beforeTokens,
      afterTokens: compacted.afterTokens,
      reductionPct: compacted.reductionPct,
      requiredTokens: compacted.requiredTokens,
    });
  }

  // 3. Deterministic canary gate (`npx tsc --noEmit` + `npm test`)
  let gateExecuted = false;
  let gatePassed = true;
  let gateError: string | undefined;

  if (prepared.length > 0 && !skipTests) {
    gateExecuted = true;
    const runner = options.canaryGateRunner ?? runDefaultCanaryGate;
    const gateRes = runner(rootDir);
    gatePassed = gateRes.ok;
    gateError = gateRes.error;
    if (!gatePassed) {
      return {
        evaluatedCount: staged.length,
        promoted: [],
        rejected,
        gateExecuted,
        gatePassed: false,
        gateError,
        dryRun,
      };
    }
  }

  // 4. Append approved rules to LEARNED_RULES.md and emit SHA-256 receipts
  let currentContent = existingMarkdown.endsWith('\n')
    ? existingMarkdown
    : `${existingMarkdown}\n`;
  const receipts: ReflexionPromotionReceipt[] = [];

  for (const item of prepared) {
    const beforeFileSha256 = computeArtifactSha256(currentContent);
    const bulletLine = `- **${item.ruleId}** (\`${item.candidate.signature}\`): ${item.compactedText}\n`;
    const nextContent = `${currentContent}${bulletLine}`;
    const afterFileSha256 = computeArtifactSha256(nextContent);

    const receiptPayload = {
      candidateId: item.candidate.candidateId,
      ruleId: item.ruleId,
      signature: item.candidate.signature,
      promotedAt: timestamp,
      compactedRuleText: item.compactedText,
      beforeTokens: item.beforeTokens,
      afterTokens: item.afterTokens,
      reductionPct: item.reductionPct,
      requiredTokens: item.requiredTokens,
      evidenceHashes: item.candidate.evidenceHashes,
      beforeFileSha256,
      afterFileSha256,
      gateExecuted,
    };
    const receiptSha256 = computeCanonicalJsonSha256(receiptPayload);

    receipts.push({
      receiptId: `RR-${receiptSha256.slice(0, 12)}`,
      ...receiptPayload,
      receiptSha256,
    });

    currentContent = nextContent;
  }

  if (!dryRun) {
    if (receipts.length > 0) {
      fs.mkdirSync(path.dirname(learnedRulesPath), { recursive: true });
      fs.writeFileSync(learnedRulesPath, currentContent, 'utf8');

      fs.mkdirSync(path.dirname(receiptsPath), { recursive: true });
      for (const receipt of receipts) {
        fs.appendFileSync(receiptsPath, `${JSON.stringify(receipt)}\n`, 'utf8');
      }
    }

    const approvedIds = new Set(prepared.map((p) => p.candidate.candidateId));
    const rejectedById = new Map(rejected.map((r) => [r.candidateId, r.reason]));

    const updatedCandidates: ReflexionQuarantineCandidate[] = quarantine.candidates.map((c) => {
      if (approvedIds.has(c.candidateId)) {
        return { ...c, status: 'approved', updatedAt: timestamp };
      }
      const rejReason = rejectedById.get(c.candidateId);
      if (rejReason) {
        return {
          ...c,
          status: 'rejected',
          rejectionReason: rejReason,
          updatedAt: timestamp,
        };
      }
      return c;
    });

    writeReflexionQuarantine(quarantinePath, {
      ...quarantine,
      candidates: updatedCandidates,
    });
  }

  return {
    evaluatedCount: staged.length,
    promoted: receipts,
    rejected,
    gateExecuted,
    gatePassed,
    dryRun,
  };
}

export function parseReflexionPromoteArgs(argv: readonly string[]): PromoteReflexionOptions {
  const thresholdIdx = argv.indexOf('--similarity-threshold');
  let similarityThreshold: number | undefined;
  if (thresholdIdx >= 0 && argv[thresholdIdx + 1]) {
    const parsed = Number(argv[thresholdIdx + 1]);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      throw new Error(
        `Invalid --similarity-threshold "${argv[thresholdIdx + 1]}". Expected a number in (0, 1].`
      );
    }
    similarityThreshold = parsed;
  }
  return {
    dryRun: argv.includes('--dry-run'),
    skipTests: argv.includes('--skip-tests'),
    ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
  };
}

function main(): void {
  const options = parseReflexionPromoteArgs(process.argv.slice(2));
  const result = promoteReflexionCandidates(options);

  console.log(
    `[reflexion-promote] Evaluated ${result.evaluatedCount} staged candidate(s) (dryRun=${result.dryRun}, gateExecuted=${result.gateExecuted}, gatePassed=${result.gatePassed})`
  );
  if (!result.gatePassed) {
    console.error(`[reflexion-promote] Canary gate FAILED: ${result.gateError}`);
    process.exit(1);
  }
  for (const r of result.promoted) {
    console.log(
      `  [PROMOTED] ${r.ruleId} (${r.candidateId}): ${r.beforeTokens} -> ${r.afterTokens} tokens (-${r.reductionPct.toFixed(2)}%), receipt=${r.receiptId} (sha256=${r.receiptSha256.slice(0, 12)}...)`
    );
  }
  for (const rej of result.rejected) {
    console.log(`  [REJECTED] ${rej.candidateId}: ${rej.reason}`);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main();
}
