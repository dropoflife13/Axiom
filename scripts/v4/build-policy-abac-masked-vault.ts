// scripts/v4/build-policy-abac-masked-vault.ts
// Generates the deterministic Reverse-Masked Necessity Vault (.axiom-state/v4/policy-abac-cid-masked.json)
// from the 12 canonical PolicyAbacCartridge rules (P-01..P-12):
//   - Strips/replaces EVERY operational token returned by extractRequiredTokens() (0/78 = 0.0% retention)
//     with semantically equivalent generic prose while preserving the full verbatim rule structure
//     and controlling for token/character length vs. policy-abac-cid-auto.json.
//   - Zero LLM calls; 100% deterministic. Never touches frozen v2/v3 state or src/v4/hope/*.

import fs from 'node:fs';
import path from 'node:path';
import { PolicyAbacCartridge } from '../../src/v4/cartridges/policy-abac-cartridge.js';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  computeCanonicalJsonSha256,
  containsOperationalToken,
  evaluateLexicalIdentifierLock,
} from '../../src/v4/hope/index.js';
import { extractRequiredTokens } from '../../src/v4/lexical-token-extractor.js';
import type { PolicyAbacVaultFile } from './build-policy-abac-vaults.js';

export interface PolicyMaskedVaultLesson {
  readonly factId: string;
  readonly lesson: string;
  readonly origin: 'deterministic-reverse-masked';
  readonly canonicalStatement: string;
  readonly requiredTokens: readonly string[];
  readonly retainedTokens: readonly string[];
  readonly missingTokens: readonly string[];
  readonly retentionRate: number;
  readonly canonicalCharCount: number;
  readonly maskedCharCount: number;
  readonly canonicalWordCount: number;
  readonly maskedWordCount: number;
  readonly cidAutoCharCount?: number;
  readonly cidAutoWordCount?: number;
  readonly createdAt: string;
}

export interface PolicyAbacMaskedVaultFile {
  readonly schemaVersion: '4.0.0-policy-vault';
  readonly cartridgeId: 'policy-abac-v4';
  readonly variant: 'C_ID_masked';
  readonly maskingStrategy: 'deterministic-reverse-mask';
  readonly canonicalRulesSha256: string;
  readonly lexicalLockAudit: {
    readonly totalRequiredTokens: number;
    readonly totalRetainedTokens: number;
    readonly overallRetentionRate: number;
    readonly rulesWithZeroTokensRetained: number;
    readonly totalRules: number;
  };
  readonly lengthAudit: {
    readonly totalCanonicalChars: number;
    readonly totalMaskedChars: number;
    readonly totalCanonicalWords: number;
    readonly totalMaskedWords: number;
    readonly charRatioVsCanonical: number;
    readonly wordRatioVsCanonical: number;
    readonly totalCidAutoChars?: number;
    readonly totalCidAutoWords?: number;
    readonly charRatioVsCidAuto?: number;
    readonly wordRatioVsCidAuto?: number;
  };
  readonly lessons: readonly PolicyMaskedVaultLesson[];
  readonly generatedAt: string;
}

export const POLICY_VAULT_CID_AUTO_PATH = path.resolve(
  '.axiom-state',
  'v4',
  'policy-abac-cid-auto.json'
);
export const POLICY_VAULT_CID_MASKED_PATH = path.resolve(
  '.axiom-state',
  'v4',
  'policy-abac-cid-masked.json'
);

/**
 * Ordered semantic reverse-masking substitution table (most specific composite expressions first).
 * Replaces every concrete Cedar identifier, entity literal, role name, keyword, and numeric threshold
 * with equivalent domain-accurate generic prose while preserving the verbatim rule structure.
 */
const REVERSE_MASK_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['Emergency Action::"break_glass_read"', 'Emergency override access actions'],
  ['Administrative Action::"rotate_kms_key"', 'Administrative key rotation actions'],
  ['Action::"approve_payout"', 'the payout approval action'],
  ['Action::"export_audit_log"', 'the audit export action'],
  ['Action::"rotate_kms_key"', 'the key rotation action'],
  ['Action::"read_patient_record"', 'the patient record read action'],
  ['Action::"break_glass_read"', 'the override access action'],
  ['Resource::"LedgerEntry"', 'ledger entry resources'],
  ['Resource::"ChangeRequest"', 'change request resources'],
  ['Resource::"PatientRecord"', 'patient record resources'],
  ['Resource::"AuditLog"', 'audit log resources'],
  ['Resource::"KmsKey"', 'encryption key resources'],
  [
    'principal.tenant_id == resource.tenant_id',
    "the actor's tenant attribute matches the resource's tenant attribute",
  ],
  [
    'principal.is_suspended == true',
    "the actor's suspension indicator is active",
  ],
  [
    'resource.is_locked == true',
    "the resource's freeze indicator is active",
  ],
  [
    'context.mfa_verified == true',
    'the multi-factor verification flag to be confirmed',
  ],
  [
    'principal.id != resource.created_by',
    "the actor's identity to differ from the resource's creator attribute",
  ],
  [
    'principal.role == "finance_approver"',
    "the actor's role is treasury approver",
  ],
  [
    'resource.amount_cents <= 10000000',
    'the disbursement amount remaining within the authorized cap',
  ],
  [
    'context.session_age_seconds <= 900',
    'the elapsed session age remaining within the short-lived recency threshold',
  ],
  [
    'context.ip_trusted == true',
    'the network trust indicator to be verified',
  ],
  [
    'context.risk_score <= 30',
    'the evaluated threat rating to stay below the low-risk ceiling',
  ],
  [
    'principal.role == "clinician"',
    "the actor's role is medical practitioner",
  ],
  [
    'resource.consent_granted == true',
    'patient consent is confirmed active',
  ],
  [
    'context.break_glass_ticket != ""',
    'the emergency ticket reference to be non-empty',
  ],
  [
    'principal.role == "security_auditor"',
    "the actor's role is compliance auditor",
  ],
  [
    'principal.clearance_level >= resource.min_clearance',
    "the actor's clearance tier meeting or exceeding the resource's minimum sensitivity tier",
  ],
  [
    'principal.role == "tenant_admin"',
    "the actor's role is organization administrator",
  ],
  [
    'principal.is_service_account == true',
    "the actor's machine-account flag is active",
  ],
  ["'permit'", 'positive allow-access'],
  ["'forbid'", 'deny-override'],
  ["'unless'", 'negative-exception'],
];

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Deterministically strips every concrete operational token (`extractRequiredTokens()`)
 * from a canonical ABAC rule while preserving sentence structure and equivalent prose length.
 */
export function reverseMaskAbacRule(
  rule: CanonicalRule,
  allRules: readonly CanonicalRule[]
): {
  readonly maskedLesson: string;
  readonly requiredTokens: readonly string[];
  readonly retainedTokens: readonly string[];
  readonly missingTokens: readonly string[];
} {
  let masked = rule.statement;

  for (const [needle, replacement] of REVERSE_MASK_REPLACEMENTS) {
    if (masked.includes(needle)) {
      masked = masked.split(needle).join(replacement);
    }
  }

  // Fallback sweep over any remaining extractRequiredTokens() literal (longest first)
  const requiredTokens = extractRequiredTokens(rule.statement);
  const byLenDesc = [...requiredTokens].sort((a, b) => b.length - a.length);
  for (const tok of byLenDesc) {
    if (containsOperationalToken(masked, tok)) {
      const startsAlphaNum = /^[a-zA-Z0-9]/.test(tok);
      const endsAlphaNum = /[a-zA-Z0-9]$/.test(tok);
      const pattern = `${startsAlphaNum ? '(?<![a-zA-Z0-9_])' : ''}${escapeRegex(tok)}${
        endsAlphaNum ? '(?![a-zA-Z0-9_])' : ''
      }`;
      masked = masked.replace(new RegExp(pattern, 'gi'), 'the designated policy element');
    }
  }

  masked = masked.replace(/\s+/g, ' ').trim();

  const audit = evaluateLexicalIdentifierLock(
    {
      candidateId: `MASK-AUDIT-${rule.id}`,
      factId: rule.id,
      triggerFlag: 'reverse-mask',
      proposedRuleText: masked,
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

  return {
    maskedLesson: masked,
    requiredTokens: audit.requiredTokens,
    retainedTokens: audit.retainedTokens,
    missingTokens: audit.missingTokens,
  };
}

export function buildPolicyAbacMaskedVault(
  options: { writeToDisk?: boolean } = {}
): PolicyAbacMaskedVaultFile {
  const writeToDisk = options.writeToDisk ?? true;
  const cartridge = new PolicyAbacCartridge();
  const { rules } = cartridge.loadCanonicalRules();

  let cidAutoById = new Map<string, string>();
  if (fs.existsSync(POLICY_VAULT_CID_AUTO_PATH)) {
    const cidAutoVault = JSON.parse(
      fs.readFileSync(POLICY_VAULT_CID_AUTO_PATH, 'utf8')
    ) as PolicyAbacVaultFile;
    cidAutoById = new Map(cidAutoVault.lessons.map((l) => [l.factId, l.lesson]));
  }

  const lessons: PolicyMaskedVaultLesson[] = [];
  let totalRequiredTokens = 0;
  let totalRetainedTokens = 0;
  let rulesWithZeroTokensRetained = 0;

  let totalCanonicalChars = 0;
  let totalMaskedChars = 0;
  let totalCanonicalWords = 0;
  let totalMaskedWords = 0;
  let totalCidAutoChars = 0;
  let totalCidAutoWords = 0;
  const hasCidAutoBaseline = cidAutoById.size === rules.length;

  for (const rule of rules) {
    const res = reverseMaskAbacRule(rule, rules);
    if (res.retainedTokens.length > 0) {
      throw new Error(
        `Reverse-masked rule ${rule.id} unexpectedly retained operational token(s): ${res.retainedTokens.join(', ')}`
      );
    }

    totalRequiredTokens += res.requiredTokens.length;
    totalRetainedTokens += res.retainedTokens.length;
    if (res.retainedTokens.length === 0) rulesWithZeroTokensRetained++;

    const canonicalCharCount = rule.statement.length;
    const maskedCharCount = res.maskedLesson.length;
    const canonicalWordCount = countWords(rule.statement);
    const maskedWordCount = countWords(res.maskedLesson);

    totalCanonicalChars += canonicalCharCount;
    totalMaskedChars += maskedCharCount;
    totalCanonicalWords += canonicalWordCount;
    totalMaskedWords += maskedWordCount;

    const cidAutoLesson = cidAutoById.get(rule.id);
    const cidAutoCharCount = cidAutoLesson ? cidAutoLesson.length : undefined;
    const cidAutoWordCount = cidAutoLesson ? countWords(cidAutoLesson) : undefined;
    if (cidAutoCharCount !== undefined && cidAutoWordCount !== undefined) {
      totalCidAutoChars += cidAutoCharCount;
      totalCidAutoWords += cidAutoWordCount;
    }

    lessons.push({
      factId: rule.id,
      lesson: res.maskedLesson,
      origin: 'deterministic-reverse-masked',
      canonicalStatement: rule.statement,
      requiredTokens: res.requiredTokens,
      retainedTokens: res.retainedTokens,
      missingTokens: res.missingTokens,
      retentionRate:
        res.requiredTokens.length > 0
          ? res.retainedTokens.length / res.requiredTokens.length
          : 0,
      canonicalCharCount,
      maskedCharCount,
      canonicalWordCount,
      maskedWordCount,
      ...(cidAutoCharCount !== undefined ? { cidAutoCharCount } : {}),
      ...(cidAutoWordCount !== undefined ? { cidAutoWordCount } : {}),
      createdAt: new Date().toISOString(),
    });
  }

  if (totalRetainedTokens !== 0 || rulesWithZeroTokensRetained !== rules.length) {
    throw new Error(
      `Expected 0/${totalRequiredTokens} retained operational tokens in C_ID_masked vault, got ${totalRetainedTokens}.`
    );
  }

  const vault: PolicyAbacMaskedVaultFile = {
    schemaVersion: '4.0.0-policy-vault',
    cartridgeId: 'policy-abac-v4',
    variant: 'C_ID_masked',
    maskingStrategy: 'deterministic-reverse-mask',
    canonicalRulesSha256: computeCanonicalJsonSha256(
      rules.map((r) => ({ id: r.id, statement: r.statement }))
    ),
    lexicalLockAudit: {
      totalRequiredTokens,
      totalRetainedTokens,
      overallRetentionRate:
        totalRequiredTokens > 0 ? totalRetainedTokens / totalRequiredTokens : 0,
      rulesWithZeroTokensRetained,
      totalRules: lessons.length,
    },
    lengthAudit: {
      totalCanonicalChars,
      totalMaskedChars,
      totalCanonicalWords,
      totalMaskedWords,
      charRatioVsCanonical: Number((totalMaskedChars / totalCanonicalChars).toFixed(4)),
      wordRatioVsCanonical: Number((totalMaskedWords / totalCanonicalWords).toFixed(4)),
      ...(hasCidAutoBaseline
        ? {
            totalCidAutoChars,
            totalCidAutoWords,
            charRatioVsCidAuto: Number((totalMaskedChars / totalCidAutoChars).toFixed(4)),
            wordRatioVsCidAuto: Number((totalMaskedWords / totalCidAutoWords).toFixed(4)),
          }
        : {}),
    },
    lessons,
    generatedAt: new Date().toISOString(),
  };

  if (writeToDisk) {
    fs.mkdirSync(path.dirname(POLICY_VAULT_CID_MASKED_PATH), { recursive: true });
    fs.writeFileSync(
      POLICY_VAULT_CID_MASKED_PATH,
      `${JSON.stringify(vault, null, 2)}\n`,
      'utf8'
    );
  }

  return vault;
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('build-policy-abac-masked-vault.ts');

if (isEntrypoint) {
  const vault = buildPolicyAbacMaskedVault({ writeToDisk: true });
  console.log(`[v4-masked-vault] Wrote ${POLICY_VAULT_CID_MASKED_PATH}`);
  for (const l of vault.lessons) {
    console.log(
      `  [C_ID_masked] ${l.factId}: ${l.retainedTokens.length}/${l.requiredTokens.length} tokens retained | chars=${l.maskedCharCount} (canon=${l.canonicalCharCount}${
        l.cidAutoCharCount ? `, cidAuto=${l.cidAutoCharCount}` : ''
      }) -> ${l.lesson}`
    );
  }
  console.log('\n=== Policy-as-Code Reverse-Masked Vault Audit ===');
  console.log(
    `Operational tokens retained: ${vault.lexicalLockAudit.totalRetainedTokens}/${vault.lexicalLockAudit.totalRequiredTokens} (${(
      vault.lexicalLockAudit.overallRetentionRate * 100
    ).toFixed(1)}%) | ${vault.lexicalLockAudit.rulesWithZeroTokensRetained}/${vault.lexicalLockAudit.totalRules} rules at 0.0%`
  );
  console.log(
    `Length vs. Canonical:        ${vault.lengthAudit.totalMaskedChars}/${vault.lengthAudit.totalCanonicalChars} chars (${vault.lengthAudit.charRatioVsCanonical.toFixed(
      2
    )}x), ${vault.lengthAudit.totalMaskedWords}/${vault.lengthAudit.totalCanonicalWords} words (${vault.lengthAudit.wordRatioVsCanonical.toFixed(
      2
    )}x)`
  );
  if (vault.lengthAudit.totalCidAutoChars && vault.lengthAudit.charRatioVsCidAuto) {
    console.log(
      `Length vs. C_ID_auto:        ${vault.lengthAudit.totalMaskedChars}/${vault.lengthAudit.totalCidAutoChars} chars (${vault.lengthAudit.charRatioVsCidAuto.toFixed(
        2
      )}x), ${vault.lengthAudit.totalMaskedWords}/${vault.lengthAudit.totalCidAutoWords} words (${vault.lengthAudit.wordRatioVsCidAuto?.toFixed(
        2
      )}x)`
    );
  }
}
