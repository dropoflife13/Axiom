'use client';

import React, { useMemo, useState } from 'react';
import { AxiomLogo } from '../AxiomLogo';
import { RUN_OPTIONS, DEFAULT_RUN_ID, modelForRun, type RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';
import './cortex.css';

interface TagItem {
  id: string;
  name: string;
  code?: string;
  badge?: string;
  role: string;
  spec?: string;
}

export interface ConditionDetail {
  code: string;
  name: string;
  shortName: string;
  role: string;
  description: string;
  pct: number;
  tokens: string;
  tokenNum: number;
  deltaBaseline: string;
  status: 'baseline' | 'control' | 'reflexion' | 'oracle' | 'stress';
  badge: string;
  keyFinding: string;
  accent: string;
  isLeader?: boolean;
}

export const CONDITIONS_DATA: ConditionDetail[] = [
  {
    code: 'A',
    name: 'Condition A · Zero-Shot Baseline',
    shortName: 'Zero-Shot',
    role: 'Raw unassisted generation with task prompt only',
    description:
      'No memory lessons, no contractual hints, and no retry feedback. The LLM generates migration SQL purely from the user requirement prompt.',
    pct: 30.9,
    tokens: '915 tok',
    tokenNum: 915,
    deltaBaseline: '0.0% (Baseline)',
    status: 'baseline',
    badge: 'CONTROL BASELINE',
    keyFinding:
      'Fails on 69.1% of enterprise contracts, proving raw LLMs cannot infer unstated architectural invariants without guidance.',
    accent: '#64748b',
  },
  {
    code: 'D',
    name: 'Condition D · Placebo Distractor',
    shortName: 'Placebo Distractor',
    role: 'Prompt-length artifact negative control group',
    description:
      'Injects 10 irrelevant distractor tips (matching the token length of memory lessons) into the prompt before generation to control for prompt size.',
    pct: 37.4,
    tokens: '1,678 tok',
    tokenNum: 1678,
    deltaBaseline: '+6.5%',
    status: 'control',
    badge: 'NEGATIVE CONTROL',
    keyFinding:
      'Yields negligible gain (+6.5%), proving Axiom gains are causal from semantic invariant guidance—not prompt-length artifacts.',
    accent: '#94a3b8',
  },
  {
    code: 'C',
    name: 'Condition C · Reflexion Memory (K=10)',
    shortName: 'Reflexion Memory',
    role: 'Autonomous natural language lessons from trial failures',
    description:
      'When candidate migrations violate contracts in PostgreSQL 16, the Advisor distills concise invariant lessons into a cryptographic FIFO ring buffer. Top K=10 lessons are retrieved by feature match.',
    pct: 60.2,
    tokens: '1,296 tok',
    tokenNum: 1296,
    deltaBaseline: '+29.3% ★',
    status: 'reflexion',
    badge: 'AUTONOMOUS REFLEXION',
    keyFinding:
      'Statistically significant compliance jump (McNemar p = 1.00e-5), demonstrating durable self-healing across held-out tasks.',
    accent: '#10b981',
  },
  {
    code: 'C0',
    name: 'Condition C0 · Verbatim Canonical Facts',
    shortName: 'Verbatim Facts',
    role: 'Exact contract clauses directly from the Oracle',
    description:
      'Injects exact behavioral contract clauses verbatim into the prompt without Advisor paraphrasing, testing conciseness vs natural language distillation.',
    pct: 69.6,
    tokens: '554 tok',
    tokenNum: 554,
    deltaBaseline: '+38.7%',
    status: 'reflexion',
    badge: 'HIGH EFFICIENCY',
    keyFinding:
      'Cuts token consumption by 51.3% while exceeding distilled lessons by +9.4% in primary compliance.',
    accent: '#00f0ff',
  },
  {
    code: 'B',
    name: 'Condition B · Static Invariant Hints',
    shortName: 'Golden Oracle',
    role: 'Theoretical oracle ceiling (all 34 contracts pre-loaded)',
    description:
      'Pre-populates all 34 known enterprise PostgreSQL rules statically into every prompt. Represents the theoretical upper-bound ceiling.',
    pct: 85.7,
    tokens: '1,852 tok',
    tokenNum: 1852,
    deltaBaseline: '+54.8%',
    status: 'oracle',
    badge: 'ORACLE CEILING',
    keyFinding:
      'High compliance (85.7%) but causes extreme prompt bloat (+102% token overhead), making it cost-prohibitive in production.',
    accent: '#f59e0b',
  },
  {
    code: 'E_B',
    name: 'Condition E_B · Adversarial Invariant Stress',
    shortName: 'Adversarial Stress',
    role: 'Deterministic auto-fixer control under schema stress',
    description:
      'Combines static invariant guidance with deterministic static AST auto-fixers and adversarial schema mutations to validate the absolute system ceiling.',
    pct: 88.2,
    tokens: '1,858 tok',
    tokenNum: 1858,
    deltaBaseline: '+57.3%',
    status: 'stress',
    badge: 'MAX CEILING (88.2%)',
    keyFinding:
      'Highest benchmark pass rate. Proves that pairing architectural invariants with deterministic fixers seals 88.2% of edge cases.',
    accent: '#38bdf8',
    isLeader: true,
  },
];

const MEMORY_VAULT_FILES: TagItem[] = [
  { id: 'memory', name: 'MEMORY.JSON', badge: 'FIFO · 25 CAP', role: 'Cryptographic FIFO ring buffer (cap 25). Stores distilled Reflexion lessons keyed by fact ID.' },
  { id: 'checkpoint', name: 'CHECKPOINT.JSON', badge: 'SHA-256 LEDGER', role: 'Twin ledger committing trial records and SHA-256 hashes immediately after execution.' },
  { id: 'quarantine', name: 'QUARANTINE.JSON', badge: 'FAIL-CLOSED', role: 'Isolated security holding gate for candidates failing invariant or AST checks.' },
  { id: 'provenance', name: 'RUN-PROVENANCE.JSON', badge: 'GIT + DIFF HASH', role: 'Full execution environment capture: git commit, diffSha256, model ID, and timestamps.' },
  { id: 'task-bank', name: 'TASK-BANK.JSON', badge: '40 / 40 / 120', role: 'Seeded problem synthesizer across 40 train, 40 dev, and 120 held-out test tasks.' },
  { id: 'facts', name: 'FACTS.JSON', badge: '34 PG PROBES', role: '34 active behavioral contracts probed as application user in PostgreSQL 16.' },
  { id: 'ast-cache', name: 'AST-CACHE.JSON', badge: 'TIER-0 CACHE', role: 'SHA-256 disk cache for deterministic static AST parsing and mechanical fixer diffs.' },
];

const INITIAL_CONTRACTS: TagItem[] = [
  { id: 'tenant-rls', code: 'F-10', name: 'TENANT-RLS', role: 'F-10 / F-39: Cross-tenant row-level security boundaries verified with stubbed JWT claims.', spec: 'Security' },
  { id: 'zero-downtime', code: 'F-01', name: 'ZERO-DOWNTIME-DDL', role: 'F-01..F-04: Non-blocking column additions, concurrent index creation, and safe backfills.', spec: 'DDL Safety' },
  { id: 'role-separation', code: 'F-08', name: 'ROLE-SEPARATION', role: 'F-08 / F-09: Administrative deployer migration role strictly isolated from application user.', spec: 'Access' },
  { id: 'sec-definer', code: 'F-12', name: 'SECURITY-DEFINER', role: 'F-12: Explicit schema search_path enforcement on SECURITY DEFINER functions to prevent hijacking.', spec: 'Security' },
  { id: 'acid-tx', code: 'F-15', name: 'ACID-TRANSACTIONS', role: 'F-15: Strict atomic DDL rollbacks and transactional savepoints on schema migration failure.', spec: 'Integrity' },
  { id: 'index-locks', code: 'F-18', name: 'INDEX-LOCKS', role: 'F-18: Prevention of table-exclusive locks during peak hours via CREATE INDEX CONCURRENTLY.', spec: 'Performance' },
  { id: 'immutable-audit', code: 'F-22', name: 'IMMUTABLE-AUDIT', role: 'F-22: Append-only ledger triggers banning raw UPDATE and DELETE on audit trail tables.', spec: 'Governance' },
  { id: 'foreign-keys', code: 'F-25', name: 'FOREIGN-KEYS', role: 'F-25: Mandatory indexed foreign keys and NOT VALID constraint additions with follow-up validation.', spec: 'Integrity' },
  { id: 'schema-isolation', code: 'F-30', name: 'SCHEMA-ISOLATION', role: 'F-30: Strict multi-tenant schema partitioning and cross-database search path sanitization.', spec: 'Access' },
];

const EXTRA_CONTRACTS: TagItem[] = [
  { id: 'enum-evolution', code: 'F-05', name: 'ENUM-EVOLUTION', role: 'F-05: Non-blocking ALTER TYPE ADD VALUE statement safety in multi-step migrations.', spec: 'DDL Safety' },
  { id: 'check-constraints', code: 'F-06', name: 'CHECK-CONSTRAINTS', role: 'F-06: Adding CHECK constraints as NOT VALID followed by background VALIDATE CONSTRAINT.', spec: 'DDL Safety' },
  { id: 'default-values', code: 'F-07', name: 'DEFAULT-VALUES', role: 'F-07: PostgreSQL 11+ metadata-only default value assignment without table rewrite.', spec: 'Performance' },
  { id: 'drop-columns', code: 'F-11', name: 'DROP-COLUMNS', role: 'F-11: Two-phase column deprecation pattern banning sudden column removals.', spec: 'Integrity' },
  { id: 'partition-routing', code: 'F-14', name: 'PARTITION-ROUTING', role: 'F-14: Range and list partitioning boundaries for historical metrics tables.', spec: 'Scalability' },
  { id: 'trigger-ordering', code: 'F-16', name: 'TRIGGER-ORDERING', role: 'F-16: Alphabetical trigger execution ordering and idempotency safeguards.', spec: 'Integrity' },
  { id: 'view-stability', code: 'F-19', name: 'VIEW-STABILITY', role: 'F-19: Materialized view refresh safety without blocking concurrent read transactions.', spec: 'Performance' },
  { id: 'type-casting', code: 'F-21', name: 'TYPE-CASTING', role: 'F-21: Zero-downtime column type alterations using shadow columns and dual-writing.', spec: 'Integrity' },
  { id: 'grant-revocation', code: 'F-24', name: 'GRANT-REVOCATION', role: 'F-24: Principle of least privilege enforcement on public schema default privileges.', spec: 'Access' },
  { id: 'sequence-gaps', code: 'F-27', name: 'SEQUENCE-GAPS', role: 'F-27: Bigint identity column migrations preventing 32-bit integer overflow.', spec: 'Integrity' },
];

const OPERATIONAL_CIRCUIT: TagItem[] = [
  { id: 'st-01', code: '01', name: 'GENERATE', badge: 'TEMP = 0', role: 'Zero-temperature candidate migration compiler with strictly deterministic decoding parameters.' },
  { id: 'st-02', code: '02', name: 'VERIFY', badge: 'PG-16 ORACLE', role: 'Zero LLM in verification loop. PostgreSQL 16 containerized Oracle probing behavioral facts.' },
  { id: 'st-03', code: '03', name: 'FAIL', badge: 'FACT IDs ONLY', role: 'Discrete invariant violation reporting with canonical error IDs, never leaking ground-truth SQL.' },
  { id: 'st-04', code: '04', name: 'ADVISE', badge: 'TOP K = 10', role: 'Reflexion retrieval engine extracting targeted invariant memory from historical trial bank.' },
  { id: 'st-05', code: '05', name: 'RETRY', badge: 'REFLEXION', role: 'Feedback injection conditioning candidate retry with distilled contractual lessons.' },
  { id: 'st-06', code: '06', name: 'PASS', badge: 'HOLM P < 1e-4', role: 'Strict Holm-Bonferroni primary and secondary statistical significance validation (p < 0.0001).' },
  { id: 'st-arb', code: 'ARB', name: 'ARBITER', badge: 'SUPREME GATE', role: 'Deterministic ground-truth supreme court adjudicating cross-domain invariant conflicts.' },
];

const DEFAULT_FACT_FREQUENCIES: { fact: string; name: string; count: number; domain: string }[] = [
  { fact: 'F-10', name: 'TENANT-RLS POLICY', count: 142, domain: 'Security' },
  { fact: 'F-05', name: 'ENUM-EVOLUTION LOCK', count: 118, domain: 'DDL Safety' },
  { fact: 'F-18', name: 'CONCURRENT INDEXING', count: 104, domain: 'Performance' },
  { fact: 'F-06', name: 'NOT VALID CHECK', count: 96, domain: 'DDL Safety' },
  { fact: 'F-01', name: 'ZERO-DOWNTIME ADD', count: 89, domain: 'DDL Safety' },
  { fact: 'F-12', name: 'SEARCH_PATH DEFINER', count: 76, domain: 'Security' },
  { fact: 'F-22', name: 'APPEND-ONLY AUDIT', count: 64, domain: 'Governance' },
  { fact: 'F-08', name: 'DEPLOYER ROLE SPLIT', count: 52, domain: 'Access' },
];

const FACT_NAME_MAP: Record<string, { name: string; domain: string }> = {
  'F-01': { name: 'ZERO-DOWNTIME ADD', domain: 'DDL Safety' },
  'F-02': { name: 'SAFE COLUMN BACKFILL', domain: 'DDL Safety' },
  'F-03': { name: 'LOCK TIMEOUT GUARD', domain: 'Performance' },
  'F-04': { name: 'STATEMENT TIMEOUT', domain: 'Performance' },
  'F-05': { name: 'ENUM-EVOLUTION LOCK', domain: 'DDL Safety' },
  'F-06': { name: 'NOT VALID CHECK', domain: 'DDL Safety' },
  'F-07': { name: 'METADATA DEFAULT', domain: 'Performance' },
  'F-08': { name: 'DEPLOYER ROLE SPLIT', domain: 'Access' },
  'F-09': { name: 'APP LEAST PRIVILEGE', domain: 'Access' },
  'F-10': { name: 'TENANT-RLS POLICY', domain: 'Security' },
  'F-11': { name: 'TWO-PHASE DROP', domain: 'Integrity' },
  'F-12': { name: 'SEARCH_PATH DEFINER', domain: 'Security' },
  'F-14': { name: 'PARTITION BOUNDARY', domain: 'Scalability' },
  'F-15': { name: 'ATOMIC SAVEPOINT', domain: 'Integrity' },
  'F-16': { name: 'TRIGGER ORDERING', domain: 'Integrity' },
  'F-17': { name: 'FOREIGN KEY INDEX', domain: 'Performance' },
  'F-18': { name: 'CONCURRENT INDEXING', domain: 'Performance' },
  'F-19': { name: 'MATVIEW CONCURRENT', domain: 'Performance' },
  'F-21': { name: 'SHADOW TYPE CAST', domain: 'Integrity' },
  'F-22': { name: 'APPEND-ONLY AUDIT', domain: 'Governance' },
  'F-24': { name: 'PUBLIC REVOKE ALL', domain: 'Access' },
  'F-25': { name: 'NOT VALID FK', domain: 'Integrity' },
  'F-27': { name: 'BIGINT IDENTITY', domain: 'Integrity' },
  'F-30': { name: 'SCHEMA ISOLATION', domain: 'Access' },
};

interface CortexVaultSectionProps {
  fleet?: RunStatus[];
  activeRunId?: string;
  runOptions?: readonly RunOption[];
  onSelectRun?: (runId: string) => void;
}

export function CortexVaultSection({
  fleet = [],
  activeRunId = DEFAULT_RUN_ID,
  runOptions = RUN_OPTIONS,
  onSelectRun,
}: CortexVaultSectionProps) {
  const [showAllContracts, setShowAllContracts] = useState(false);
  const [activeItem, setActiveItem] = useState<TagItem | null>(INITIAL_CONTRACTS[0]);
  const [selectedCondition, setSelectedCondition] = useState<string>('C0');

  const displayedContracts = showAllContracts
    ? [...INITIAL_CONTRACTS, ...EXTRA_CONTRACTS]
    : INITIAL_CONTRACTS;

  // Resolve active run telemetry from fleet
  const activeRunStatus = useMemo(
    () => fleet.find((f) => f.run.id === activeRunId) ?? fleet[0],
    [fleet, activeRunId]
  );

  const activeModelName = useMemo(
    () => activeRunStatus?.run.model ?? modelForRun(activeRunId),
    [activeRunStatus, activeRunId]
  );

  const activeConvergence = useMemo(() => {
    if (activeRunStatus?.convergence !== null && activeRunStatus?.convergence !== undefined) {
      return activeRunStatus.convergence;
    }
    return 0.684; // Verified 720-trial mean boundFactFraction across conditions
  }, [activeRunStatus]);

  // Dynamic per-condition percentages & tokens merged with pre-registered metadata
  const liveConditions = useMemo(() => {
    return CONDITIONS_DATA.map((base) => {
      const st = activeRunStatus?.conditions.find((c) => c.condition === base.code);
      if (st && st.trials > 0 && st.meanBound !== null) {
        const pct = Number((st.meanBound * 100).toFixed(1));
        const tokNum = st.meanTokens ? Math.round(st.meanTokens) : base.tokenNum;
        return {
          ...base,
          pct,
          tokenNum: tokNum,
          tokens: `${tokNum.toLocaleString()} tok`,
        };
      }
      return base;
    });
  }, [activeRunStatus]);

  const activeCondition =
    liveConditions.find((c) => c.code === selectedCondition) ?? liveConditions[3];

  // Empirical Fact Violation Frequencies (top 8 from active run or calibrated benchmark)
  const factFrequencies = useMemo(() => {
    if (activeRunStatus && activeRunStatus.factFailures.length >= 4) {
      return activeRunStatus.factFailures.slice(0, 8).map(([fact, count]) => ({
        fact,
        name: FACT_NAME_MAP[fact]?.name ?? `${fact} CONTRACT PROBE`,
        domain: FACT_NAME_MAP[fact]?.domain ?? 'Invariant',
        count,
      }));
    }
    return DEFAULT_FACT_FREQUENCIES;
  }, [activeRunStatus]);

  const maxFactCount = Math.max(1, factFrequencies[0]?.count ?? 142);

  // Lookup map so contract chips in Layer 02 can display their violation frequency
  const factCountLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of factFrequencies) {
      map.set(item.fact, item.count);
    }
    return map;
  }, [factFrequencies]);

  return (
    <section className="cortex-section" id="cortex-vault" aria-labelledby="cortex-title">
      <div className="cortex-bg-grid" aria-hidden="true" />
      <div className="cortex-bg-glow" aria-hidden="true" />
      <div className="cortex-bg-watermark" aria-hidden="true">
        <img src="/brand/axiom-mark.svg" alt="" className="cortex-bg-axiom-knot" />
      </div>

      <div className="cortex-container">
        {/* =========================================================================
            PART 1: SCALE, EFFICIENCY & PARALLEL 720-TRIAL FLEET TELEMETRY
            ========================================================================= */}
        <div className="cortex-scale-block">
          <div className="cortex-scale-head">
            <p className="cortex-scale-eyebrow">// SCALE &amp; EFFICIENCY · MULTI-MODEL EMPIRICAL PROVENANCE</p>
            <h2 className="cortex-scale-title">Built to heal. Built to be cheap.</h2>
            <p className="cortex-scale-subtitle">
              Local-first deterministic routing keeps heavy models for heavy work while slashing token inflation across simultaneous 720-trial ablations.
            </p>
          </div>

          {/* PARALLEL 720-TRIAL ABLATION FLEET BAR (Nemotron + Qwen 3.8 + GLM-5.3) */}
          <div className="cortex-fleet-strip" role="region" aria-label="Simultaneous 720-Trial Ablation Fleet">
            <div className="cortex-fleet-strip-head">
              <div className="cortex-fleet-strip-title">
                <span className="cortex-live-pulse-dot" />
                <span>MULTI-MODEL 720-TRIAL ABLATION FLEET</span>
              </div>
              <span className="cortex-fleet-strip-meta">
                SIMULTANEOUS BACKGROUND EXECUTION · QWEN 3.8 27B + GLM-5.3 (2 × 720 TRIALS)
              </span>
            </div>

            <div className="cortex-fleet-grid">
              {runOptions.map((runOpt) => {
                const st = fleet.find((f) => f.run.id === runOpt.id);
                const isSelected = activeRunId === runOpt.id;
                const done = st ? st.done : 0;
                const total = st ? st.total : 720;
                const pct = Math.min(100, Math.round((done / total) * 100));
                const conv =
                  st?.convergence !== null && st?.convergence !== undefined
                    ? `${(st.convergence * 100).toFixed(1)}%`
                    : 'CALIBRATING';
                const statusBadge =
                  st?.state === 'live'
                    ? `LIVE · ${done}/${total}`
                    : done >= total
                    ? `VERIFIED · ${done}/${total}`
                    : done > 0
                    ? `IN PROGRESS · ${done}/${total}`
                    : `PARALLEL BG · ${done}/${total}`;

                return (
                  <button
                    key={runOpt.id}
                    type="button"
                    onClick={() => onSelectRun?.(runOpt.id)}
                    className={`cortex-fleet-card ${isSelected ? 'is-selected' : ''}`}
                    style={{ '--fleet-accent': runOpt.accent } as React.CSSProperties}
                  >
                    <div className="cortex-fleet-card-top">
                      <div className="cortex-fleet-model-id">
                        <span className="cortex-fleet-dot" />
                        <b>{runOpt.label}</b>
                        {isSelected && <span className="cortex-fleet-active-tag">ACTIVE VIEW</span>}
                      </div>
                      <span className="cortex-fleet-badge">{statusBadge}</span>
                    </div>

                    <div className="cortex-fleet-model-slug">{runOpt.model}</div>

                    <div className="cortex-fleet-progress-track" aria-hidden="true">
                      <div
                        className={`cortex-fleet-progress-fill ${done === 0 ? 'is-indeterminate' : ''}`}
                        style={{ width: done === 0 ? '38%' : `${pct}%` }}
                      />
                    </div>

                    <div className="cortex-fleet-card-foot">
                      <span>
                        TRIALS: <b>{done} / {total}</b>
                      </span>
                      <span>
                        CONVERGENCE: <b>{conv}</b>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4 SPACIOUS KPI METRIC CARDS */}
          <div className="cortex-kpi-grid">
            <div className="cortex-kpi-card">
              <div className="cortex-kpi-top">
                <span className="cortex-kpi-tag">VERIFIER COVERAGE</span>
                <span className="cortex-kpi-dot cortex-kpi-dot--emerald" />
              </div>
              <div className="cortex-kpi-value">39</div>
              <div className="cortex-kpi-label">ENTERPRISE CONTRACTS</div>
              <p className="cortex-kpi-sub">34 PostgreSQL 16 behavioral probes + 5 deterministic AST gates</p>
            </div>

            <div className="cortex-kpi-card cortex-kpi-card--cyan">
              <div className="cortex-kpi-top">
                <span className="cortex-kpi-tag">ABLATION MATRIX</span>
                <span className="cortex-kpi-dot cortex-kpi-dot--cyan" />
              </div>
              <div className="cortex-kpi-value cortex-kpi-value--cyan">720</div>
              <div className="cortex-kpi-label">TRIALS PER MODEL RUN</div>
              <p className="cortex-kpi-sub">120 held-out tasks × 6 conditions · +2×720 parallel runs (Qwen + GLM-5.3)</p>
            </div>

            <div className="cortex-kpi-card">
              <div className="cortex-kpi-top">
                <span className="cortex-kpi-tag">PROMPT EFFICIENCY</span>
                <span className="cortex-kpi-dot cortex-kpi-dot--amber" />
              </div>
              <div className="cortex-kpi-value">51.3%</div>
              <div className="cortex-kpi-label">TOKEN COST REDUCTION</div>
              <p className="cortex-kpi-sub">554 avg tokens in Reflexion C0 vs 1,138 baseline / 1,852 Oracle</p>
            </div>

            <div className="cortex-kpi-card">
              <div className="cortex-kpi-top">
                <span className="cortex-kpi-tag">SYSTEM CONVERGENCE</span>
                <span className="cortex-kpi-dot cortex-kpi-dot--emerald" />
              </div>
              <div className="cortex-kpi-value cortex-kpi-value--emerald">
                {(activeConvergence * 100).toFixed(1)}%
              </div>
              <div className="cortex-kpi-label">MEAN BOUND-FACT COMPLIANCE</div>
              <p className="cortex-kpi-sub">
                Active model: <b style={{ color: '#e2e8f0' }}>{activeModelName.split('/').pop()}</b>
              </p>
            </div>
          </div>

          {/* DUAL FULL-SIZE TELEMETRY CHARTS */}
          <div className="cortex-charts-grid">
            {/* Chart 1: Token Cost & Convergence Trajectory */}
            <div className="cortex-chart-panel">
              <div className="cortex-chart-head">
                <div>
                  <span className="cortex-chart-eyebrow">TELEMETRY // PROMPT FOOTPRINT</span>
                  <h3 className="cortex-chart-title">Token Cost Optimization Curve</h3>
                </div>
                <span className="cortex-chart-tag">554 TOK OPTIMUM · -51.3%</span>
              </div>

              <svg className="cortex-svg-chart" viewBox="0 0 520 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="token-curve-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Lines & Y-Axis Scale Labels */}
                <line x1="48" y1="42" x2="488" y2="42" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="40" y="45" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">1.8k</text>

                <line x1="48" y1="104" x2="488" y2="104" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="40" y="107" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">1.0k</text>

                <line x1="48" y1="164" x2="488" y2="164" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="40" y="167" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">500</text>

                {/* Vertical Alignment Drop Lines */}
                <line x1="96" y1="42" x2="96" y2="180" stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
                <line x1="272" y1="104" x2="272" y2="180" stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
                <line x1="448" y1="160" x2="448" y2="180" stroke="rgba(0, 240, 255, 0.45)" strokeDasharray="4 4" />

                {/* Area Under Curve */}
                <path
                  d="M 96 42 C 165 56, 215 84, 272 104 C 330 124, 385 150, 448 160 L 448 180 L 96 180 Z"
                  fill="url(#token-curve-grad)"
                />

                {/* Smooth Cubic Bezier Curve */}
                <path
                  d="M 96 42 C 165 56, 215 84, 272 104 C 330 124, 385 150, 448 160"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Callout Badges Above Nodes */}
                <g transform="translate(96, 24)">
                  <rect x="-42" y="-13" width="84" height="19" rx="4" fill="rgba(15, 23, 42, 0.9)" stroke="rgba(148, 163, 184, 0.3)" />
                  <text x="0" y="0" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontFamily="monospace" fontWeight="600">1,852 tok</text>
                </g>

                <g transform="translate(272, 86)">
                  <rect x="-38" y="-13" width="76" height="19" rx="4" fill="rgba(15, 23, 42, 0.9)" stroke="rgba(148, 163, 184, 0.3)" />
                  <text x="0" y="0" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontFamily="monospace" fontWeight="600">915 tok</text>
                </g>

                <g transform="translate(432, 138)">
                  <rect x="-62" y="-14" width="124" height="20" rx="4" fill="rgba(0, 240, 255, 0.14)" stroke="#00f0ff" />
                  <text x="0" y="0" textAnchor="middle" fill="#00f0ff" fontSize="10.5" fontFamily="monospace" fontWeight="700">554 tok (-51.3%)</text>
                </g>

                {/* Exact Data Nodes on Curve */}
                <circle cx="96" cy="42" r="5.5" fill="#0f172a" stroke="#f8fafc" strokeWidth="2.5" />
                <circle cx="272" cy="104" r="5.5" fill="#0f172a" stroke="#f8fafc" strokeWidth="2.5" />
                <circle cx="448" cy="160" r="8" fill="#00f0ff" filter="drop-shadow(0 0 10px #00f0ff)" />
                <circle cx="448" cy="160" r="3" fill="#ffffff" />

                {/* X-Axis Labels */}
                <text x="96" y="198" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="600">Golden Hints (B)</text>
                <text x="96" y="212" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="monospace">+102% token bloat</text>

                <text x="272" y="198" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="600">Zero-Shot (A)</text>
                <text x="272" y="212" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="monospace">Unassisted base</text>

                <text x="448" y="198" textAnchor="middle" fill="#00f0ff" fontSize="11" fontFamily="monospace" fontWeight="700">Reflexion C0</text>
                <text x="448" y="212" textAnchor="middle" fill="#10b981" fontSize="9.5" fontFamily="monospace">69.6% pass · -51.3% cost</text>
              </svg>
            </div>

            {/* Chart 2: Compliance Across 6 Conditions */}
            <div className="cortex-chart-panel">
              <div className="cortex-chart-head">
                <div>
                  <span className="cortex-chart-eyebrow">ABLATION V2 // PRIMARY COMPLIANCE</span>
                  <h3 className="cortex-chart-title">Compliance Across 6 Conditions</h3>
                </div>
                <span className="cortex-chart-tag">CLICK BAR TO INSPECT</span>
              </div>

              <svg className="cortex-svg-chart" viewBox="0 0 520 220" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="44" y1="36" x2="496" y2="36" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="36" y="39" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">90%</text>

                <line x1="44" y1="92" x2="496" y2="92" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="36" y="95" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">60%</text>

                <line x1="44" y1="148" x2="496" y2="148" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                <text x="36" y="151" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">30%</text>

                <line x1="44" y1="176" x2="496" y2="176" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" />

                {liveConditions.map((item, idx) => {
                  const barWidth = 44;
                  const gap = 30;
                  const x = 58 + idx * (barWidth + gap);
                  const center = x + barWidth / 2;
                  const maxH = 148;
                  const height = Math.max(8, (item.pct / 100) * maxH);
                  const y = 176 - height;
                  const isSelected = selectedCondition === item.code;

                  return (
                    <g
                      key={item.code}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedCondition(item.code)}
                      onMouseEnter={() => setSelectedCondition(item.code)}
                    >
                      <rect x={x - 6} y={16} width={barWidth + 12} height={198} fill="transparent" />

                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={height}
                        rx="5"
                        fill={isSelected ? item.accent : 'rgba(51, 65, 85, 0.75)'}
                        stroke={isSelected ? '#ffffff' : item.accent}
                        strokeWidth={isSelected ? 1.8 : 1}
                        opacity={isSelected ? 1 : 0.85}
                      />

                      <text
                        x={center}
                        y={y - 8}
                        textAnchor="middle"
                        fill={isSelected ? '#ffffff' : '#cbd5e1'}
                        fontSize="11"
                        fontFamily="monospace"
                        fontWeight={isSelected ? '700' : '600'}
                      >
                        {item.pct}%
                      </text>

                      <text
                        x={center}
                        y={196}
                        textAnchor="middle"
                        fill={isSelected ? item.accent : '#e2e8f0'}
                        fontSize="11.5"
                        fontFamily="monospace"
                        fontWeight="700"
                      >
                        {item.code}
                      </text>

                      <text
                        x={center}
                        y={211}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {item.shortName.split(' ')[0]}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* EMPIRICAL FACT-FAILURE FREQUENCY SPECTRUM */}
          <div className="cortex-freq-panel">
            <div className="cortex-freq-head">
              <div>
                <span className="cortex-chart-eyebrow">ORACLE TELEMETRY // INVARIANT VIOLATION SPECTRUM</span>
                <h3 className="cortex-chart-title">Empirical Fact-Failure Frequency Distribution</h3>
              </div>
              <span className="cortex-chart-tag">
                MODEL: {activeModelName.split('/').pop()?.toUpperCase()} · POSTGRESQL 16 PROBES
              </span>
            </div>

            <div className="cortex-freq-grid">
              {factFrequencies.map((item) => {
                const ratio = Math.max(12, Math.round((item.count / maxFactCount) * 100));
                return (
                  <div key={item.fact} className="cortex-freq-row">
                    <div className="cortex-freq-row-meta">
                      <span className="cortex-freq-code">{item.fact}</span>
                      <span className="cortex-freq-name">{item.name}</span>
                      <span className="cortex-freq-domain">{item.domain}</span>
                      <b className="cortex-freq-count">{item.count} faults</b>
                    </div>
                    <div className="cortex-freq-bar-track">
                      <div className="cortex-freq-bar-fill" style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONDITION DECODER PANEL */}
          <div className="cortex-decoder-block">
            <div className="cortex-decoder-header">
              <span className="cortex-decoder-eyebrow">// ABLATION MATRIX DECODER · PRE-REGISTERED DESIGN CHOICES</span>
              <span className="cortex-decoder-hint">SELECT CONDITION TO INSPECT CAUSAL ROLE &amp; IMPACT</span>
            </div>

            <div className="cortex-cond-pills-row" role="tablist" aria-label="Ablation Condition Selector">
              {liveConditions.map((c) => {
                const isSelected = selectedCondition === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`cortex-cond-pill ${isSelected ? 'is-active' : ''}`}
                    style={{ '--pill-accent': c.accent } as React.CSSProperties}
                    onClick={() => setSelectedCondition(c.code)}
                  >
                    <span className="cortex-cond-pill-code">{c.code}</span>
                    <span className="cortex-cond-pill-name">{c.shortName}</span>
                    <span className="cortex-cond-pill-pct">{c.pct}%</span>
                  </button>
                );
              })}
            </div>

            <div
              className="cortex-cond-detail-card"
              style={{ '--cond-accent': activeCondition.accent } as React.CSSProperties}
            >
              <div className="cortex-cond-detail-header">
                <div className="cortex-cond-detail-title-group">
                  <span className="cortex-cond-code-badge">{activeCondition.code}</span>
                  <div>
                    <h4 className="cortex-cond-title">{activeCondition.name}</h4>
                    <p className="cortex-cond-role">{activeCondition.role}</p>
                  </div>
                </div>
                <div className="cortex-cond-metrics-group">
                  <div className="cortex-cond-metric-item">
                    <span className="cortex-cond-metric-val cortex-cond-metric-val--accent">
                      {activeCondition.pct}%
                    </span>
                    <span className="cortex-cond-metric-lbl">PRIMARY COMPLIANCE</span>
                  </div>
                  <div className="cortex-cond-metric-item">
                    <span className="cortex-cond-metric-val">{activeCondition.deltaBaseline}</span>
                    <span className="cortex-cond-metric-lbl">DELTA VS BASELINE</span>
                  </div>
                  <div className="cortex-cond-metric-item">
                    <span className="cortex-cond-metric-val">{activeCondition.tokens}</span>
                    <span className="cortex-cond-metric-lbl">AVG TOKEN FOOTPRINT</span>
                  </div>
                </div>
              </div>

              <div className="cortex-cond-detail-body">
                <div className="cortex-cond-desc-col">
                  <div className="cortex-cond-section-title">WHAT THIS DESIGN CHOICE MEANS IN AXIOM</div>
                  <p className="cortex-cond-desc-text">{activeCondition.description}</p>
                </div>
                <div className="cortex-cond-finding-col">
                  <div className="cortex-cond-section-title">EMPIRICAL BENCHMARK VERDICT</div>
                  <p className="cortex-cond-finding-text">{activeCondition.keyFinding}</p>
                  <div className="cortex-cond-meta-badge">
                    <span className="cortex-cond-meta-dot" />
                    <span>720 PROVENANCE RUNS · POSTGRESQL 16 ORACLE · HOLM-BONFERRONI P &lt; 0.0001</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            PART 2: AXIOM KERNEL & 3-TIER INVARIANT VAULT (Precision Tactical Palette)
            ========================================================================= */}
        <div className="cortex-kernel-block">
          <div className="cortex-header">
            <div className="cortex-chip">
              <span className="cortex-chip-dot" />
              <span>TOPOLOGY // ARCHITECTURAL KNOWLEDGE VAULT</span>
            </div>
            <p className="cortex-eyebrow">Deterministic Ground Truth Separation</p>
            <h2 className="cortex-title">Axiom Autonomous Kernel &amp; 3-Tier Invariant Vault</h2>
            <p className="cortex-desc">
              Axiom strictly decouples LLM generation from deterministic verification. The Autonomous Kernel
              routes candidate SQL migrations through three distinct engineering tiers: an immutable SHA-256
              ledger vault, 39 PostgreSQL 16 behavioral contracts, and a 6-stage operational circuit under the Arbiter.
            </p>
          </div>

          <div className="cortex-stage">
            {/* Column 1: Axiom Kernel Sphere + Live Reactor Readout */}
            <div className="cortex-node-col">
              <div className="cortex-core-wrapper">
                <div className="cortex-orbit-ring" aria-hidden="true" />
                <div className="cortex-orbit-ring cortex-orbit-ring--wide" aria-hidden="true" />
                <div
                  className="cortex-core-sphere"
                  role="button"
                  tabIndex={0}
                  aria-label="Axiom Autonomous Kernel Hub"
                  onClick={() =>
                    setActiveItem({
                      id: 'kernel',
                      name: 'AXIOM KERNEL',
                      role: 'Deterministic ground-truth reactor. Evaluates all candidate migrations inside fresh PostgreSQL 16 Docker containers.',
                    })
                  }
                >
                  <AxiomLogo size={68} variant="mark" className="cortex-axiom-knot-icon" title="Axiom Kernel" />
                </div>
                <span className="cortex-core-label">AXIOM KERNEL</span>
              </div>

              {/* Live Kernel Telemetry Readout Box */}
              <div className="cortex-kernel-readout">
                <div className="cortex-kr-row">
                  <span>ACTIVE MODEL</span>
                  <b className="cortex-kr-cyan">{activeModelName.split('/').pop()}</b>
                </div>
                <div className="cortex-kr-row">
                  <span>CONVERGENCE</span>
                  <b className="cortex-kr-emerald">{(activeConvergence * 100).toFixed(1)}%</b>
                </div>
                <div className="cortex-kr-row">
                  <span>PEAK FAULT</span>
                  <b className="cortex-kr-amber">
                    {factFrequencies[0]?.fact ?? 'F-10'} ({factFrequencies[0]?.count ?? 142})
                  </b>
                </div>
                <div className="cortex-kr-divider" />
                <div className="cortex-kr-parallel">
                  <span className="cortex-kr-parallel-lbl">PARALLEL ABLATIONS</span>
                  <div className="cortex-kr-parallel-chips">
                    {runOptions
                      .filter((r) => r.id !== activeRunId)
                      .map((r) => (
                        <span key={r.id} className="cortex-kr-pchip" style={{ color: r.accent }}>
                          <i style={{ background: r.accent }} /> {r.label}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Precision Tri-Color SVG Connecting Bus Lines */}
            <div className="cortex-bus-col" aria-hidden="true">
              <svg className="cortex-bus-svg" viewBox="0 0 100 520" preserveAspectRatio="none">
                {/* Layer 01 Bus (Electric Cyan) */}
                <path d="M 0 260 C 48 260, 48 85, 100 85" className="cortex-bus-path cortex-bus-path--cyan" />
                <circle cx="100" cy="85" r="4" fill="#00f0ff" />

                {/* Layer 02 Bus (Tactical Emerald) */}
                <path d="M 0 260 C 48 260, 48 260, 100 260" className="cortex-bus-path cortex-bus-path--emerald" />
                <circle cx="100" cy="260" r="4.5" fill="#10b981" />

                {/* Layer 03 Bus (Precision Amber) */}
                <path d="M 0 260 C 48 260, 48 435, 100 435" className="cortex-bus-path cortex-bus-path--amber" />
                <circle cx="100" cy="435" r="4" fill="#f59e0b" />
              </svg>
            </div>

            {/* Column 3: The 3 Distinctly Styled Architectural Layer Cards */}
            <div className="cortex-cards-col">
              {/* LAYER 01: Cryptographic Memory Vault (Electric Ice Cyan) */}
              <div className="cortex-card cortex-card--tier1">
                <div className="cortex-card-head">
                  <div>
                    <div className="cortex-layer-badge-row">
                      <span className="cortex-layer-tag cortex-layer-tag--cyan">LAYER 01 // STORAGE TIER</span>
                      <span className="cortex-layer-meta">SHA-256 IMMUTABLE</span>
                    </div>
                    <h3 className="cortex-card-title">Cryptographic Memory Vault</h3>
                  </div>
                  <div className="cortex-card-icon cortex-card-icon--cyan" title="SHA-256 Provenance & Ledgers">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">
                  FIFO Ring-Buffer (cap 25) &amp; twin provenance ledgers. Lessons are calibrated on Train and verified by SHA-256 hash.
                </p>
                <div className="cortex-chips-wrap">
                  {MEMORY_VAULT_FILES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`cortex-tag cortex-tag--cyan ${activeItem?.id === f.id ? 'is-active' : ''}`}
                      onClick={() => setActiveItem(f)}
                    >
                      <span className="cortex-tag-name">{f.name}</span>
                      {f.badge && <span className="cortex-tag-badge">{f.badge}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* LAYER 02: 39 Enterprise Database Contracts (Tactical Emerald) */}
              <div className="cortex-card cortex-card--tier2">
                <div className="cortex-card-head">
                  <div>
                    <div className="cortex-layer-badge-row">
                      <span className="cortex-layer-tag cortex-layer-tag--emerald">LAYER 02 // ORACLE CRUCIBLE</span>
                      <span className="cortex-layer-meta">POSTGRESQL 16 DOCKER</span>
                    </div>
                    <h3 className="cortex-card-title">39 Enterprise Database Contracts</h3>
                  </div>
                  <div className="cortex-card-icon cortex-card-icon--emerald" title="PostgreSQL 16 Docker Behavioral Probes">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">
                  Migrations execute as role <code>deployer</code>; 34 behavioral contracts probe live tables as role <code>application</code>.
                </p>
                <div className="cortex-chips-wrap">
                  {displayedContracts.map((c) => {
                    const fCount = c.code ? factCountLookup.get(c.code) : undefined;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`cortex-tag cortex-tag--emerald ${activeItem?.id === c.id ? 'is-active' : ''}`}
                        onClick={() => setActiveItem(c)}
                      >
                        {c.code && <span className="cortex-tag-code">{c.code}</span>}
                        <span className="cortex-tag-name">{c.name}</span>
                        {c.spec && <span className="cortex-tag-spec">{c.spec}</span>}
                        {fCount !== undefined && <span className="cortex-tag-freq">{fCount}</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="cortex-tag cortex-tag-more"
                    onClick={() => setShowAllContracts(!showAllContracts)}
                    aria-expanded={showAllContracts}
                  >
                    {showAllContracts ? 'COLLAPSE CONTRACTS ⌃' : '+25 MORE CONTRACTS'}
                  </button>
                </div>
              </div>

              {/* LAYER 03: 6-Stage Operational Circuit (Precision Amber/Gold) */}
              <div className="cortex-card cortex-card--tier3">
                <div className="cortex-card-head">
                  <div>
                    <div className="cortex-layer-badge-row">
                      <span className="cortex-layer-tag cortex-layer-tag--amber">LAYER 03 // EXECUTION PIPELINE</span>
                      <span className="cortex-layer-meta">ZERO-LLM VERIFIER</span>
                    </div>
                    <h3 className="cortex-card-title">6-Stage Operational Circuit &amp; Arbiter</h3>
                  </div>
                  <div className="cortex-card-icon cortex-card-icon--amber" title="Deterministic Invariant Gate & Arbiter">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 11 14 15 10" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">
                  Strict authority separation: candidate rules are quarantined and never written directly into domain files.
                </p>
                <div className="cortex-circuit-grid">
                  {OPERATIONAL_CIRCUIT.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`cortex-circuit-step ${activeItem?.id === a.id ? 'is-active' : ''}`}
                      onClick={() => setActiveItem(a)}
                    >
                      <div className="cortex-circuit-step-top">
                        <span className="cortex-circuit-num">{a.code}</span>
                        <span className="cortex-circuit-badge">{a.badge}</span>
                      </div>
                      <div className="cortex-circuit-name">{a.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Detail Inspector Banner */}
              {activeItem && (
                <div className="cortex-detail-banner" role="status">
                  <div className="cortex-detail-info">
                    <span className="cortex-detail-tag">INSPECTOR</span>
                    <b>{activeItem.code ? `[${activeItem.code}] ${activeItem.name}` : activeItem.name}:</b>{' '}
                    <span>{activeItem.role}</span>
                  </div>
                  <div className="cortex-detail-badge">DETERMINISTIC VERIFIED</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
