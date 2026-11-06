import fs from 'node:fs';
import path from 'node:path';
import { FACTS } from './facts.js';

function formatApplicability(fact: (typeof FACTS)[number]): string {
  if (fact.applicability.never) return 'Never (excluded)';
  const clauses = fact.applicability.all ?? [];
  if (clauses.length === 0) return 'All tables';
  return clauses.map(({ flag, equals }) => `\`${flag} = ${equals}\``).join(' and ');
}

const activeFacts = FACTS.filter(
  ({ status }) => status === 'CONFIRMED' || status === 'OWNER-ADOPTED'
);
const rows = FACTS.map(
  (fact) =>
    `| ${fact.id} | ${formatApplicability(fact)} | ${fact.status} | \`${fact.check}\` | ${fact.statement} |`
).join('\n');

const document = `# PostgreSQL Environment Facts Specification (generated)\n\n` +
  `This file is generated from [fixtures/task-v2/facts.json](../../fixtures/task-v2/facts.json). Do not edit it directly.\n\n` +
  `| Fact ID | Applies when | Status | Check key | Statement |\n` +
  `| :--- | :--- | :--- | :--- | :--- |\n${rows}\n\n` +
  `## Experiment eligibility\n\n` +
  `- Facts in the primary experiment: ${activeFacts.length}\n` +
  `- Unconfirmed facts: ${FACTS.filter(({ status }) => status === 'UNCONFIRMED').map(({ id }) => id).join(', ') || 'none'}\n` +
  `- Proposed facts: ${FACTS.filter(({ status }) => status === 'PROPOSED').map(({ id }) => id).join(', ') || 'none'}\n` +
  `- Dropped facts retained only for historical ID validation: ${FACTS.filter(({ status }) => status === 'DROPPED').map(({ id }) => id).join(', ') || 'none'}\n`;

fs.writeFileSync(path.resolve('docs/spec/env-facts.md'), document, 'utf-8');
