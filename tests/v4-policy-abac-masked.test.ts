import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POLICY_ABAC_CANONICAL_RULES } from '../src/v4/cartridges/policy-abac-cartridge.js';
import {
  buildPolicyAbacMaskedVault,
  POLICY_VAULT_CID_AUTO_PATH,
  reverseMaskAbacRule,
} from '../scripts/v4/build-policy-abac-masked-vault.js';

describe('Policy-as-Code ABAC Reverse-Masked Vault (C_ID_masked)', () => {
  it('strips 100% of operational tokens (0/78 retained) across all 12 canonical rules while controlling prose length', () => {
    const vault = buildPolicyAbacMaskedVault({ writeToDisk: false });

    expect(vault.cartridgeId).toBe('policy-abac-v4');
    expect(vault.variant).toBe('C_ID_masked');
    expect(vault.lexicalLockAudit.totalRequiredTokens).toBe(78);
    expect(vault.lexicalLockAudit.totalRetainedTokens).toBe(0);
    expect(vault.lexicalLockAudit.overallRetentionRate).toBe(0);
    expect(vault.lexicalLockAudit.rulesWithZeroTokensRetained).toBe(12);
    expect(vault.lessons).toHaveLength(12);

    for (const lesson of vault.lessons) {
      expect(lesson.retainedTokens).toEqual([]);
      expect(lesson.missingTokens).toEqual(lesson.requiredTokens);
      expect(lesson.lesson).not.toMatch(/\b(10000000|900|30)\b/);
      expect(lesson.lesson).not.toMatch(/(Action|Resource)::"/);
    }

    // Controlled verbosity: preserves full rule structure without truncating or exploding length
    expect(vault.lengthAudit.charRatioVsCanonical).toBeGreaterThanOrEqual(0.85);
    expect(vault.lengthAudit.wordRatioVsCanonical).toBeGreaterThanOrEqual(0.85);
    if (fs.existsSync(POLICY_VAULT_CID_AUTO_PATH)) {
      expect(vault.lengthAudit.charRatioVsCidAuto).toBeGreaterThanOrEqual(0.85);
      expect(vault.lengthAudit.charRatioVsCidAuto).toBeLessThanOrEqual(1.3);
      expect(vault.lengthAudit.wordRatioVsCidAuto).toBeGreaterThanOrEqual(0.85);
      expect(vault.lengthAudit.wordRatioVsCidAuto).toBeLessThanOrEqual(1.3);
    }
  });

  it('produces deterministic per-rule reverse masking with zero leaked identifiers', () => {
    for (const rule of POLICY_ABAC_CANONICAL_RULES) {
      const first = reverseMaskAbacRule(rule, POLICY_ABAC_CANONICAL_RULES);
      const second = reverseMaskAbacRule(rule, POLICY_ABAC_CANONICAL_RULES);
      expect(first).toEqual(second);
      expect(first.retainedTokens).toHaveLength(0);
      expect(first.requiredTokens.length).toBeGreaterThanOrEqual(3);
    }
  });
});
