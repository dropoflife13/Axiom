import type { VerificationKind, VerificationResult, VerificationContext } from '../schema/types.js';
import { verifyAgent } from './agent-verifier.js';
import { verifyDomain } from './domain-verifier.js';
import { verifyCandidate } from './candidate-verifier.js';
import { buildVaultIndex } from './vault-index.js';
import { verifyAgentRoster, EXPECTED_AGENT_ROSTER } from './roster.js';

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

export { buildVaultIndex, verifyAgentRoster, EXPECTED_AGENT_ROSTER };
export * from './vault-index.js';
export * from './roster.js';
export * from './agent-verifier.js';
export * from './domain-verifier.js';
export * from './candidate-verifier.js';
export * from './reference-extractor.js';
