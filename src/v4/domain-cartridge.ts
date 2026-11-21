// src/v4/domain-cartridge.ts
// Pluggable domain-agnostic DomainCartridge<TTask, TArtifact> interface and registry
// for Axiom-HOPE (Ablation v4).

import { extractRequiredTokens as defaultLexicalExtract } from './lexical-token-extractor.js';
import type { PrerequisiteGraph } from './prerequisite-retriever.js';

export interface CanonicalRule {
  readonly id: string;
  readonly statement: string;
  readonly active: boolean;
  readonly status?: string;
  readonly check?: string;
  readonly applicability?: Readonly<Record<string, unknown>>;
  readonly requiredTokens?: readonly string[];
  readonly prerequisites?: readonly string[];
}

export interface CanonicalRuleSet {
  readonly version: string;
  readonly rules: readonly CanonicalRule[];
  readonly prerequisiteGraph: PrerequisiteGraph;
}

export interface OracleEvaluationResult {
  readonly committed: boolean;
  readonly boundFacts: readonly string[];
  readonly passedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly stderr?: string;
}

export interface DomainCartridge<TTask = unknown, TArtifact = string> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  /** Loads held-out evaluation tasks for this domain cartridge. */
  loadTasks(): TTask[];

  /** Loads canonical domain invariants and their prerequisite dependency graph. */
  loadCanonicalRules(): CanonicalRuleSet;

  /**
   * Deterministically extracts mandatory operational tokens from a canonical rule
   * (defaults to Module 1's `extractRequiredTokens()`).
   */
  extractRequiredTokens(rule: CanonicalRule, stderrHint?: string): string[];

  /**
   * Deterministic execution oracle grading `artifact` against `task`.
   * Authority Separation (Invariant 0): never invokes an LLM.
   */
  evaluate(
    task: TTask,
    artifact: TArtifact
  ): OracleEvaluationResult | Promise<OracleEvaluationResult>;

  /** Optional deterministic static failure-mode tagger for forensic attribution. */
  classifyForensics?(task: TTask, artifact: TArtifact): Record<string, boolean>;
}

/**
 * Default deterministic token extractor for cartridges that do not override lexical extraction.
 */
export function defaultExtractRequiredTokens(
  rule: CanonicalRule,
  stderrHint?: string
): string[] {
  return defaultLexicalExtract(rule.statement, stderrHint);
}

/**
 * In-memory registry for pluggable Axiom-HOPE DomainCartridges.
 */
export class DomainCartridgeRegistry {
  private readonly cartridges = new Map<string, DomainCartridge<unknown, unknown>>();

  register<TTask, TArtifact>(cartridge: DomainCartridge<TTask, TArtifact>): void {
    if (!cartridge.id || cartridge.id.trim().length === 0) {
      throw new Error('DomainCartridge must declare a non-empty id.');
    }
    if (this.cartridges.has(cartridge.id)) {
      throw new Error(`DomainCartridge "${cartridge.id}" is already registered.`);
    }
    this.cartridges.set(
      cartridge.id,
      cartridge as unknown as DomainCartridge<unknown, unknown>
    );
  }

  get<TTask = unknown, TArtifact = string>(
    id: string
  ): DomainCartridge<TTask, TArtifact> | undefined {
    return this.cartridges.get(id) as
      | DomainCartridge<TTask, TArtifact>
      | undefined;
  }

  require<TTask = unknown, TArtifact = string>(
    id: string
  ): DomainCartridge<TTask, TArtifact> {
    const found = this.get<TTask, TArtifact>(id);
    if (!found) {
      throw new Error(`DomainCartridge "${id}" is not registered.`);
    }
    return found;
  }

  has(id: string): boolean {
    return this.cartridges.has(id);
  }

  list(): readonly DomainCartridge<unknown, unknown>[] {
    return Array.from(this.cartridges.values());
  }

  unregister(id: string): boolean {
    return this.cartridges.delete(id);
  }

  clear(): void {
    this.cartridges.clear();
  }
}
