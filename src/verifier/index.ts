import type { VerificationKind, VerificationResult, VerificationContext } from '../schema/types.js';
import { verifyAgent } from './agent-verifier.js';
import { verifyDomain } from './domain-verifier.js';
import { verifyCandidate } from './candidate-verifier.js';
import { buildVaultIndex } from './vault-index.js';
import { verifyAgentRoster, EXPECTED_AGENT_ROSTER } from './roster.js';
import { checkDb01AppendOnly } from '../checks/l3/db-01-append-only.js';
import { checkSec03Secrets } from '../checks/l3/sec-03-secrets.js';
import type { CheckResult as L3CheckResult, L3CheckIssue } from '../checks/l3/types.js';

export function verify(
  fileText: string,
  kind: VerificationKind,
  ctx: VerificationContext
): VerificationResult {
  switch (kind) {
    case 'agent':
      return verifyAgent(fileText, ctx);
    case 'domain':
      return verifyDomain(fileText, ctx);
    case 'candidate':
      return verifyCandidate(fileText, ctx);
    default:
      throw new Error(`Unknown verification kind: ${kind}`);
  }
}

export type L3RuleId = 'DB-01' | 'SEC-03';
export type { L3CheckResult, L3CheckIssue };

export function verifyL3Check(ruleId: L3RuleId, content: string): L3CheckResult {
  switch (ruleId) {
    case 'DB-01':
      return checkDb01AppendOnly(content);
    case 'SEC-03':
      return checkSec03Secrets(content);
    default:
      throw new Error(`Unsupported L3 check: ${ruleId}`);
  }
}

export { buildVaultIndex, verifyAgentRoster, EXPECTED_AGENT_ROSTER };
export * from './vault-index.js';
export * from './roster.js';
export * from './agent-verifier.js';
export * from './domain-verifier.js';
export * from './candidate-verifier.js';
export * from './reference-extractor.js';
export * from '../checks/l3/db-01-append-only.js';
export * from '../checks/l3/sec-03-secrets.js';
export * from '../checks/l3/types.js';
