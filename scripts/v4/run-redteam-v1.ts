// scripts/v4/run-redteam-v1.ts
// CLI entrypoint for Axiom Red-Team v1 (strictly loopback-locked).

import path from 'node:path';
import dotenv from 'dotenv';
import {
  DEFAULT_PROBE_MODEL,
  DEFAULT_TARGET_BASE_URL,
  DEFAULT_THREAT_MODEL,
  runRedTeamV1,
} from '../../src/v4/redteam/orchestrator.js';

dotenv.config();

export function parseRedTeamCliArgs(argv: string[]) {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
  };

  return {
    targetBaseUrl: getArg('--target') ?? DEFAULT_TARGET_BASE_URL,
    threatModel: getArg('--threat-model') ?? DEFAULT_THREAT_MODEL,
    probeModel: getArg('--probe-model') ?? DEFAULT_PROBE_MODEL,
    dryRun: argv.includes('--dry-run'),
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-redteam-v1.ts');

if (isEntrypoint) {
  const args = parseRedTeamCliArgs(process.argv.slice(2));
  runRedTeamV1(args)
    .then((result) => {
      console.log(
        `[redteam-v1] Completed (dryRun=${result.dryRun}, target=${result.targetBaseUrl}, threats=${result.threatMatrix.threats.length}, probes=${result.generatedProbes.length}, stagedCandidates=${result.quarantineCandidates.length})`
      );
      console.log(`[redteam-v1] Threat matrix: ${result.artifacts.threatMatrixPath}`);
      console.log(`[redteam-v1] Quarantine bridge: ${result.artifacts.quarantinePath}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
