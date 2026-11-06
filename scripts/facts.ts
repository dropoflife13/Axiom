import fs from 'node:fs';
import path from 'node:path';

export type FactStatus =
  | 'CONFIRMED'
  | 'OWNER-ADOPTED'
  | 'UNCONFIRMED'
  | 'PROPOSED'
  | 'DROPPED';
export type FactFlags = Record<string, boolean | undefined>;

export interface FactPredicate {
  all?: Array<{ flag: string; equals: boolean }>;
  never?: boolean;
}

export interface FactDefinition {
  id: string;
  statement: string;
  applicability: FactPredicate;
  check: string;
  status: FactStatus;
}

interface FactsFile {
  version: string;
  facts: FactDefinition[];
}

const factsPath = path.resolve('fixtures/task-v2/facts.json');
const parsed = JSON.parse(fs.readFileSync(factsPath, 'utf-8')) as FactsFile;

const ids = new Set<string>();
const checks = new Set<string>();
for (const fact of parsed.facts) {
  if (!/^F-\d{2}$/.test(fact.id) || ids.has(fact.id)) {
    throw new Error(`facts.json must contain each valid fact ID exactly once: ${fact.id}`);
  }
  if (!fact.statement || !fact.check || !fact.applicability || checks.has(fact.check)) {
    throw new Error(`Invalid or duplicate fact definition for ${fact.id}`);
  }
  ids.add(fact.id);
  checks.add(fact.check);
}

export const FACTS = Object.freeze([...parsed.facts]);
export const FACT_BY_ID = new Map(FACTS.map((fact) => [fact.id, fact]));
export const FACT_STATEMENTS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FACTS.map((fact) => [fact.id, fact.statement]))
);

export function isFactApplicable(fact: FactDefinition, flags: FactFlags): boolean {
  if (fact.status !== 'CONFIRMED' && fact.status !== 'OWNER-ADOPTED') {
    return false;
  }
  if (fact.applicability.never) {
    return false;
  }
  return (fact.applicability.all ?? []).every(
    ({ flag, equals }) => Boolean(flags[flag]) === equals
  );
}

export function getApplicableFacts(flags: FactFlags): string[] {
  return FACTS.filter((fact) => isFactApplicable(fact, flags))
    .map((fact) => fact.id)
    .sort();
}

export function getFact(factId: string): FactDefinition {
  const fact = FACT_BY_ID.get(factId);
  if (!fact) {
    throw new Error(`Unknown fact ID: ${factId}`);
  }
  return fact;
}
