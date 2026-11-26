// Produces read-only Red-Team Slow Clock receipts from recorded local telemetry.

import fs from 'node:fs';
import path from 'node:path';
import {
  buildRedTeamSlowCookReceiptDocument,
  type RedTeamLiveProbeSummary,
  type RedTeamSlowCookCandidate,
  type RedTeamSlowCookThreat,
} from '../../src/v4/redteam/slow-cook.js';

const STATE_DIR = path.join('.axiom-state', 'redteam-v1');
const RECEIPTS_FILE = 'slow-cook-receipts.json';

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCandidates(value: unknown): RedTeamSlowCookCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).filter(
    (entry): entry is Record<string, unknown> & RedTeamSlowCookCandidate =>
      typeof entry.candidateId === 'string' &&
      typeof entry.cartridgeId === 'string' &&
      typeof entry.factId === 'string' &&
      typeof entry.triggerFlag === 'string' &&
      typeof entry.route === 'string' &&
      typeof entry.proposedRuleText === 'string' &&
      Array.isArray(entry.evidenceHashes) &&
      entry.evidenceHashes.every((hash) => typeof hash === 'string') &&
      typeof entry.status === 'string' &&
      typeof entry.stagedAt === 'string'
  );
}

function asThreats(value: unknown): RedTeamSlowCookThreat[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).filter(
    (entry): entry is Record<string, unknown> & RedTeamSlowCookThreat =>
      typeof entry.id === 'string' &&
      typeof entry.category === 'string' &&
      typeof entry.route === 'string' &&
      typeof entry.method === 'string'
  );
}

function asSummaries(value: unknown): Readonly<Record<string, RedTeamLiveProbeSummary>> {
  if (!isRecord(value)) return {};
  const summaries: Record<string, RedTeamLiveProbeSummary> = {};
  for (const [factId, summary] of Object.entries(value)) {
    if (
      isRecord(summary) &&
      typeof summary.probeId === 'string' &&
      (summary.status === 'pass' || summary.status === 'fail') &&
      typeof summary.passedAssertions === 'number' &&
      typeof summary.failedAssertions === 'number' &&
      typeof summary.durationMs === 'number' &&
      typeof summary.executedAt === 'string'
    ) {
      summaries[factId] = summary as RedTeamLiveProbeSummary;
    }
  }
  return summaries;
}

/** Writes shadow receipts only; it never changes quarantine or canonical/domain files. */
export function runRedTeamSlowCook(rootDir = process.cwd()): string {
  const stateDir = path.join(rootDir, STATE_DIR);
  const candidatesDoc = readJson<Record<string, unknown>>(
    path.join(stateDir, 'quarantine-candidates.json'),
    {}
  );
  const threatsDoc = readJson<Record<string, unknown>>(path.join(stateDir, 'threat-matrix.json'), {});
  const summaries = asSummaries(
    readJson<unknown>(path.join(stateDir, 'probe-results-summary.json'), {})
  );
  const document = buildRedTeamSlowCookReceiptDocument(
    asCandidates(candidatesDoc.candidates),
    asThreats(threatsDoc.threats),
    summaries
  );
  const receiptPath = path.join(stateDir, RECEIPTS_FILE);
  fs.writeFileSync(receiptPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return receiptPath;
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-redteam-slow-cook.ts');

if (isEntrypoint) {
  const receiptPath = runRedTeamSlowCook();
  console.log(`[redteam-slow-cook] wrote ${receiptPath}`);
}
