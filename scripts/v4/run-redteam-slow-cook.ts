// scripts/v4/run-redteam-slow-cook.ts
// Evaluates quarantined Red-Team candidates through the deterministic G1/G2/G3 Slow Clock
// gate and writes shadow-only SHA-256 governance receipts to
// .axiom-state/redteam-v1/slow-clock-receipts.json.

import fs from 'node:fs';
import path from 'node:path';
import {
  buildRedTeamSlowClockReceiptDocument,
  type RedTeamGateCandidateInput,
  type RedTeamGateThreatInput,
  type RedTeamProbeSummaryInput,
  type RedTeamSlowClockReceiptDocument,
} from '../../src/v4/redteam/slow-cook-gate.js';

const STATE_DIR = path.join('.axiom-state', 'redteam-v1');
const RECEIPTS_FILE = 'slow-clock-receipts.json';

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function runRedTeamSlowCook(rootDir = process.cwd()): {
  readonly receiptPath: string;
  readonly document: RedTeamSlowClockReceiptDocument;
} {
  const stateDir = path.join(rootDir, STATE_DIR);
  const candidatesDoc = readJson<{ candidates?: RedTeamGateCandidateInput[] }>(
    path.join(stateDir, 'quarantine-candidates.json'),
    {}
  );
  const threatsDoc = readJson<{ threats?: RedTeamGateThreatInput[] }>(
    path.join(stateDir, 'threat-matrix.json'),
    {}
  );
  const summariesDoc = readJson<Record<string, RedTeamProbeSummaryInput>>(
    path.join(stateDir, 'probe-results-summary.json'),
    {}
  );

  const candidates = Array.isArray(candidatesDoc.candidates) ? candidatesDoc.candidates : [];
  const threats = Array.isArray(threatsDoc.threats) ? threatsDoc.threats : [];
  const document = buildRedTeamSlowClockReceiptDocument(candidates, threats, summariesDoc);

  fs.mkdirSync(stateDir, { recursive: true });
  const receiptPath = path.join(stateDir, RECEIPTS_FILE);
  fs.writeFileSync(receiptPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { receiptPath, document };
}

export function formatSlowCookGovernanceTable(doc: RedTeamSlowClockReceiptDocument): string {
  const lines: string[] = [
    '| Candidate | Probe | G1 | G2 | G3 | Decision | Receipt Hash |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |',
  ];
  for (const r of doc.receipts) {
    lines.push(
      `| \`${r.candidateId}\` | \`${r.probeId}\` | ${r.gates.g1.pass ? 'PASS' : 'FAIL'} | ${r.gates.g2.pass ? 'PASS' : 'FAIL'} | ${r.gates.g3.pass ? 'PASS' : 'FAIL'} | **${r.decision}** | \`${r.receiptHash.slice(0, 8)}\` |`
    );
  }
  return lines.join('\n');
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-redteam-slow-cook.ts');

if (isEntrypoint) {
  const { receiptPath, document } = runRedTeamSlowCook();
  console.log(`[redteam-slow-cook] Wrote shadow receipts to ${receiptPath}`);
  console.log(formatSlowCookGovernanceTable(document));
}
