// src/v4/cartridges/postgres-v3-adapter.ts
// Non-destructive read-only DomainCartridge adapter wrapping the frozen v3
// PostgreSQL 16 oracle and fixtures/task-v3/ corpus for zero-regression compatibility.

import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateMigrationSqlInContainer,
  type MigrationMeta,
  type OracleReport,
} from '../../../scripts/oracle.js';
import {
  retrieveLessonsByFeatures,
  type FeatureFlags,
  type Lesson,
} from '../../memory.js';
import { classifySqlForensics } from '../../verifier/sql-forensics.js';
import {
  defaultExtractRequiredTokens,
  type CanonicalRule,
  type CanonicalRuleSet,
  type DomainCartridge,
  type OracleEvaluationResult,
} from '../domain-cartridge.js';
import {
  DEFAULT_POSTGRES_PREREQUISITE_GRAPH,
  retrieveWithPrerequisites,
  type PrerequisiteGraph,
  type PrerequisiteRetrievalResult,
} from '../prerequisite-retriever.js';

export interface PostgresV3Task {
  readonly id: string;
  readonly split: 'train' | 'dev' | 'test';
  readonly cohortId: string;
  readonly table: string;
  readonly prompt: string;
  readonly features: FeatureFlags;
  readonly applicableFacts: readonly string[];
  readonly boundFacts: readonly string[];
}

export type PostgresOracleEvaluatorFn = (
  sql: string,
  meta: MigrationMeta,
  testIdSuffix: string
) => OracleReport;

export interface PostgresV3CartridgeOptions {
  /** Workspace root directory (defaults to process.cwd()). */
  readonly rootDir?: string;
  /** Which split to expose from tasks.json (defaults to held-out 'test'). */
  readonly split?: 'train' | 'dev' | 'test';
  /** Active Docker container name running PostgreSQL 16 (required if using live Docker evaluation). */
  readonly containerName?: string;
  /** Optional prerequisite graph override (defaults to DEFAULT_POSTGRES_PREREQUISITE_GRAPH). */
  readonly prerequisiteGraph?: PrerequisiteGraph;
  /** Optional deterministic evaluator override for offline/mock testing without Docker. */
  readonly evaluator?: PostgresOracleEvaluatorFn;
}

interface RawFactsJson {
  version: string;
  facts: Array<{
    id: string;
    statement: string;
    applicability?: Record<string, unknown>;
    check?: string;
    status?: string;
  }>;
}

interface RawTasksJson {
  train: PostgresV3Task[];
  dev: PostgresV3Task[];
  test: PostgresV3Task[];
}

const INACTIVE_STATUSES = new Set(['DROPPED', 'UNCONFIRMED', 'PROPOSED']);

export class PostgresV3Cartridge implements DomainCartridge<PostgresV3Task, string> {
  readonly id = 'postgres-v3';
  readonly name = 'PostgreSQL 16 Relational Schema Migration (Ablation v3)';
  readonly version = '1.1.0-v3';

  private readonly rootDir: string;
  private readonly split: 'train' | 'dev' | 'test';
  private readonly containerName?: string;
  private readonly prerequisiteGraph: PrerequisiteGraph;
  private readonly evaluator?: PostgresOracleEvaluatorFn;

  constructor(options: PostgresV3CartridgeOptions = {}) {
    this.rootDir = path.resolve(options.rootDir ?? '.');
    this.split = options.split ?? 'test';
    this.containerName = options.containerName;
    this.prerequisiteGraph =
      options.prerequisiteGraph ?? DEFAULT_POSTGRES_PREREQUISITE_GRAPH;
    this.evaluator = options.evaluator;
  }

  private get tasksPath(): string {
    return path.join(this.rootDir, 'fixtures', 'task-v3', 'tasks.json');
  }

  private get factsPath(): string {
    return path.join(this.rootDir, 'fixtures', 'task-v3', 'facts.json');
  }

  loadTasks(): PostgresV3Task[] {
    const raw = JSON.parse(fs.readFileSync(this.tasksPath, 'utf8')) as RawTasksJson;
    const list = raw[this.split] ?? [];
    return list.map((t) => ({
      ...t,
      features: { ...t.features },
      applicableFacts: [...t.applicableFacts],
      boundFacts: [...(t.boundFacts ?? [])],
    }));
  }

  loadCanonicalRules(): CanonicalRuleSet {
    const raw = JSON.parse(fs.readFileSync(this.factsPath, 'utf8')) as RawFactsJson;
    const rules: CanonicalRule[] = raw.facts.map((f) => {
      const neverApplicable = Boolean(
        f.applicability && (f.applicability as { never?: boolean }).never === true
      );
      const active =
        !neverApplicable && !INACTIVE_STATUSES.has((f.status ?? '').toUpperCase());
      const baseRule: CanonicalRule = {
        id: f.id,
        statement: f.statement,
        active,
        status: f.status,
        check: f.check,
        applicability: f.applicability,
        prerequisites: this.prerequisiteGraph[f.id]
          ? [...this.prerequisiteGraph[f.id]]
          : undefined,
      };
      return {
        ...baseRule,
        requiredTokens: active ? this.extractRequiredTokens(baseRule) : [],
      };
    });

    return {
      version: raw.version,
      rules,
      prerequisiteGraph: this.prerequisiteGraph,
    };
  }

  extractRequiredTokens(rule: CanonicalRule, stderrHint?: string): string[] {
    return defaultExtractRequiredTokens(rule, stderrHint);
  }

  evaluate(task: PostgresV3Task, artifact: string): OracleEvaluationResult {
    const meta: MigrationMeta = {
      table: task.table,
      tenant: Boolean(task.features.tenant),
      append_only: Boolean(task.features.append_only),
      ingestion: Boolean(task.features.ingestion),
      status: Boolean(task.features.status),
      view: Boolean(task.features.view),
      sec_definer: Boolean(task.features.sec_definer),
      latest_per_key: Boolean(task.features.latest_per_key),
    };

    let report: OracleReport;
    if (this.evaluator) {
      report = this.evaluator(artifact, meta, task.id);
    } else {
      if (!this.containerName) {
        throw new Error(
          'PostgresV3Cartridge.evaluate() requires either `containerName` (live PostgreSQL 16 Docker container) or an injected `evaluator`.'
        );
      }
      report = evaluateMigrationSqlInContainer(
        this.containerName,
        artifact,
        meta,
        task.id
      );
    }

    const failedSet = new Set(report.failedFacts);
    const tableMissing = failedSet.has('F-13');
    const committed = !report.migrationExitNonZero && !tableMissing;
    const boundFacts = [...task.boundFacts];

    // Match v2/v3 F-13 scoring semantics: if table is missing, all bound facts fail
    const passedFacts = tableMissing
      ? []
      : boundFacts.filter((fid) => !failedSet.has(fid));
    const failedBoundOrAll = tableMissing
      ? Array.from(new Set([...report.failedFacts, ...boundFacts])).sort()
      : [...report.failedFacts];

    const stderr =
      report.failureDetails && report.failureDetails.length > 0
        ? report.failureDetails.join('\n')
        : report.pass
          ? undefined
          : report.details;

    return {
      committed,
      boundFacts,
      passedFacts,
      failedFacts: failedBoundOrAll,
      stderr,
    };
  }

  classifyForensics(task: PostgresV3Task, artifact: string): Record<string, boolean> {
    const flags = classifySqlForensics(artifact, {
      table: task.table,
      features: {
        tenant: Boolean(task.features.tenant),
        append_only: Boolean(task.features.append_only),
        ingestion: Boolean(task.features.ingestion),
      },
    });
    return { ...flags };
  }

  /**
   * Convenience helper combining v3 feature-aware lesson ranking with v4
   * Prerequisite-Aware Retrieval under an exact Top-K budget (non-mutating / read-only).
   */
  retrieveRulesWithPrerequisites(
    task: PostgresV3Task,
    memorySnapshot: readonly Lesson[],
    budgetK = 10
  ): PrerequisiteRetrievalResult {
    const rankedLessons = retrieveLessonsByFeatures(
      task.features,
      [...memorySnapshot],
      memorySnapshot.length,
      [...task.applicableFacts],
      true
    );
    const rankedIds = rankedLessons.map((l) => l.factId ?? l.errorCode);
    return retrieveWithPrerequisites(
      rankedIds,
      budgetK,
      this.prerequisiteGraph,
      new Set(task.applicableFacts)
    );
  }
}
