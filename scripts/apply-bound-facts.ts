import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertScopedCleanGitTree } from './calibration-common.js';

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function applyBoundFacts(
  proposalPath: string,
  tasksPath: string,
  changelogPath: string,
  gitStatus: () => string = () =>
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      encoding: 'utf8',
    })
): string {
  assertScopedCleanGitTree({ gitStatus, context: 'applying bound facts' });
  const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8')) as {
    tasksSha256: string;
    boundFacts: Record<string, string[]>;
  };
  const before = sha256(tasksPath);
  if (proposal.tasksSha256 !== before) {
    throw new Error(`Proposal tasks SHA-256 ${proposal.tasksSha256} does not match current ${before}.`);
  }
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as Record<string, Array<Record<string, unknown>>>;
  for (const split of ['train', 'dev', 'test']) {
    for (const task of tasks[split] ?? []) {
      const id = String(task.id);
      if (!proposal.boundFacts[id]) throw new Error(`Proposal is missing task ${id}.`);
      task.boundFacts = proposal.boundFacts[id];
    }
  }
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2) + '\n');
  const after = sha256(tasksPath);
  const date = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(
    changelogPath,
    `\n- ${date}, bound-fact regeneration, \`fixtures/task-v2/tasks.json\`, regenerated bound facts from the Train calibration with the committed deterministic rule; 49 bound-fact occurrences (F-12 x35, F-39 x14) were invalid; this happened before any test-split condition was run. SHA-256: ${before} -> ${after}.\n`
  );
  return after;
}

function main(): void {
  applyBoundFacts(
    path.resolve('out/proposed/bound-facts.proposed.json'),
    path.resolve('fixtures/task-v2/tasks.json'),
    path.resolve('docs/spec/oracle-changelog.md')
  );
}

if (process.argv[1]?.endsWith('apply-bound-facts.ts')) main();
