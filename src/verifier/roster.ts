import fs from 'node:fs';
import path from 'node:path';
import type { VerificationResult, VerificationIssue } from '../schema/types.js';

export const EXPECTED_AGENT_ROSTER = [
  'dbaagent.md',
  'growthagent.md',
  'integrationagent.md',
  'productmanageragent.md',
  'researchagent.md',
  'securityagent.md',
  'systemsdesignagent.md',
  'uiuxagent.md'
];

export function verifyAgentRoster(repoRoot: string): VerificationResult {
  const errors: VerificationIssue[] = [];
  const agentsDir = path.join(repoRoot, 'agents');

  if (!fs.existsSync(agentsDir)) {
    return {
      verdict: 'FAIL',
      errors: [{ code: 'BN-00', line: 1, detail: 'Directory agents/ does not exist' }],
      warnings: []
    };
  }

  for (const agentFile of EXPECTED_AGENT_ROSTER) {
    const filePath = path.join(agentsDir, agentFile);
    if (!fs.existsSync(filePath)) {
      errors.push({
        code: 'BN-00',
        line: 1,
        detail: `Required agent file "${agentFile}" is missing from agents/ roster`
      });
    }
  }

  return {
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    warnings: []
  };
}

