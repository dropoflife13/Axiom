import fs from 'node:fs';
import path from 'node:path';
import { FACTS, FACT_STATEMENTS } from './facts.js';
import { generateLesson } from '../src/advisor.js';
import {
  assertTaskContentSha256Matches,
  canonicalFactStatement,
  computeTaskContentSha256,
  sha256File,
} from './calibration-common.js';

export interface CalibrationInput {
  taskContentSha256?: string;
  tasksSha256?: string;
  factStats?: Array<{ factId: string; applicableCount: number; failedCount: number; passRate: number }>;
  perFactStats?: Array<{ factId: string; applicableCount: number; failedCount: number; passRate: number }>;
  taskReports?: Array<{
    applicableFacts?: string[];
    features?: Record<string, boolean>;
    derivedFlags?: Record<string, boolean>;
  }>;
}

export async function buildMemoryProposal(
  calibration: CalibrationInput,
  confirmLlm: boolean,
  distill: (factId: string, statement: string) => Promise<string> = generateLesson,
  tasksOrPath?: string | Record<string, unknown>
) {
  if (calibration.taskContentSha256 !== undefined) {
    assertTaskContentSha256Matches(
      calibration,
      tasksOrPath ?? path.resolve('fixtures/task-v2/tasks.json'),
      'Train calibration'
    );
  }
  const rows = calibration.factStats ?? calibration.perFactStats ?? [];
  const byId = new Map(rows.map((row) => [row.factId, row]));
  const observedByFact = new Map<string, Record<string, boolean>>();
  for (const report of calibration.taskReports ?? []) {
    const flagsSource = report.derivedFlags ?? report.features;
    for (const factId of report.applicableFacts ?? []) {
      if (flagsSource) {
        const existing = observedByFact.get(factId) ?? {};
        for (const [key, value] of Object.entries(flagsSource)) {
          existing[key] = Boolean(existing[key]) || Boolean(value);
        }
        observedByFact.set(factId, existing);
      }
    }
  }
  const lessons = [];
  for (const fact of FACTS) {
    const row = byId.get(fact.id);
    if (!row || row.applicableCount === 0) continue;
    const failed = row.failedCount > 0;
    if (failed && !confirmLlm) {
      throw new Error('Refusing Advisor calls without explicit --confirm-llm.');
    }
    const lesson = failed
      ? await distill(fact.id, canonicalFactStatement(fact.id))
      : FACT_STATEMENTS[fact.id];
    lessons.push({
      errorCode: fact.id,
      factId: fact.id,
      lesson,
      origin: failed ? 'distilled' : 'verbatim',
      features: observedByFact.get(fact.id) ?? {},
      trainFailureRate: failed ? row.failedCount / row.applicableCount : 0,
      utilityScore: failed ? row.failedCount : 0,
    });
  }
  lessons.sort(
    (a, b) =>
      b.trainFailureRate - a.trainFailureRate ||
      a.factId.localeCompare(b.factId)
  );
  return lessons;
}

export function installReviewedMemory(
  proposalPath = path.resolve('out/proposed/memory.proposed.json'),
  memoryPath = path.resolve('.axiom-state/memory.json'),
  logPath = path.resolve('out/proposed/memory-install-log.json')
): void {
  if (!fs.existsSync(proposalPath)) throw new Error(`Missing reviewed proposal: ${proposalPath}`);
  const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8')) as { lessons: unknown[] };
  if (!Array.isArray(proposal.lessons)) throw new Error('Memory proposal must contain a lessons array.');
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  fs.writeFileSync(memoryPath, JSON.stringify(proposal.lessons, null, 2));
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      { memoryPath, memorySha256: sha256File(memoryPath), proposalSha256: sha256File(proposalPath) },
      null,
      2
    )
  );
}

function main(): void {
  if (process.argv.includes('--install')) {
    installReviewedMemory();
    return;
  }
  const calibrationPath = path.resolve('out/train-calibration.json');
  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8')) as CalibrationInput;
  assertTaskContentSha256Matches(calibration, tasksPath, 'Train calibration');

  const confirmLlm = process.argv.includes('--confirm-llm');
  if (!confirmLlm) {
    const rows = calibration.factStats ?? calibration.perFactStats ?? [];
    if (rows.some((row) => row.failedCount > 0)) {
      throw new Error('Advisor distillation requires --confirm-llm; no proposal was written.');
    }
  }
  void buildMemoryProposal(calibration, confirmLlm, generateLesson, tasksPath).then((lessons) => {
    fs.mkdirSync(path.resolve('out/proposed'), { recursive: true });
    fs.writeFileSync(
      path.resolve('out/proposed/memory.proposed.json'),
      JSON.stringify(
        {
          lessons,
          provenance: {
            advisorModel: process.env.NVIDIA_ADVISOR_MODEL ?? 'deepseek-ai/deepseek-v4.1-flash',
            calibrationSha256: sha256File(calibrationPath),
            taskContentSha256: computeTaskContentSha256(tasksPath),
          },
        },
        null,
        2
      )
    );
  });
}

if (process.argv[1]?.endsWith('build-sql-memory.ts')) main();
