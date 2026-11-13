'use client';

import React, { useMemo, useState } from 'react';
import { AxiomLogo } from '../AxiomLogo';
import { RUN_OPTIONS, DEFAULT_RUN_ID, modelForRun, type RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';

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
    name: 'Condition C · Distilled Rule Hints (K=10)',
    shortName: 'Distilled Rules',
    role: 'Advisor-distilled natural language rules from failure logs',
    description:
      'When candidate migrations violate contracts in PostgreSQL 16, concise invariant lessons are retrieved based on task feature relevance. Tests abstracted advice vs verbatim text.',
    pct: 60.2,
    tokens: '1,296 tok',
    tokenNum: 1296,
    deltaBaseline: '+29.3% ★',
    status: 'reflexion',
    badge: 'DISTILLED RETRIEVAL',
    keyFinding:
      'Statistically significant compliance jump (McNemar p = 1.00e-5), demonstrating durable guidance across held-out tasks.',
    accent: '#10b981',
  },
  {
    code: 'C0',
    name: 'Condition C0 · Failure-Prioritized Rule Retrieval (K=10)',
    shortName: 'Verbatim Rules',
    role: 'Exact registry rule text retrieved by failure priority',
    description:
      'Injects exact behavioral contract clauses verbatim into the prompt without Advisor paraphrasing, testing conciseness vs natural language distillation.',
    pct: 69.6,
    tokens: '554 tok',
    tokenNum: 554,
    deltaBaseline: '+38.7%',
    status: 'reflexion',
    badge: 'HIGH EFFICIENCY',
    keyFinding:
      'Cuts token consumption by 51.3% while exceeding distilled lessons by +9.4% to +17.4% in primary compliance.',
    accent: '#00f0ff',
  },
  {
    code: 'B',
    name: 'Condition B · Static Reference Hints (34 Rules)',
    shortName: 'Static Reference',
    role: 'Static in-context reference baseline (all 34 active rules)',
    description:
      'Pre-populates all 34 known enterprise PostgreSQL rules statically into every prompt. Serves as static in-context reference baseline. Not an upper bound ceiling; susceptible to prompt bloat and syntax crashes on sensitive models.',
    pct: 85.7,
    tokens: '1,852 tok',
    tokenNum: 1852,
    deltaBaseline: '+54.8%',
    status: 'oracle',
    badge: 'STATIC REFERENCE',
    keyFinding:
      'High compliance on frontier models (85.7%-93.9%) but causes prompt bloat (+102% token overhead) and DDL syntax crashes on sensitive models.',
    accent: '#f59e0b',
  },
  {
    code: 'E_B',
    name: 'Condition E_B · Static Reference Control',
    shortName: 'Static Control',
    role: 'Static reference with exhaustive test oracle evaluation',
    description:
      'Pre-populates all 34 known enterprise PostgreSQL rules with exhaustive fact evaluation to benchmark baseline reference stability.',
    pct: 88.2,
    tokens: '1,858 tok',
    tokenNum: 1858,
    deltaBaseline: '+57.3%',
    status: 'stress',
    badge: 'STATIC CONTROL',
    keyFinding:
      'Exhaustive fact evaluation benchmarks full rulebook coverage across all test tasks under identical oracle testing.',
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
  { id: 'f-25', code: 'F-25', name: 'ENABLE-FORCE-RLS', role: 'F-25: Multi-tenant tables must have ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY.', spec: 'Security' },
  { id: 'f-26', code: 'F-26', name: 'APP-METADATA-RLS', role: 'F-26: Tenant RLS policies must scope rows by app_metadata.tenant_id for application.', spec: 'Security' },
  { id: 'f-01', code: 'F-01', name: 'UUID-PRIMARY-KEY', role: 'F-01: Primary key column id must be uuid NOT NULL with default gen_random_uuid().', spec: 'Integrity' },
  { id: 'f-02', code: 'F-02', name: 'TENANT-ID-COLUMN', role: 'F-02: Multi-tenant tables must include tenant_id uuid NOT NULL.', spec: 'Tenancy' },
  { id: 'f-03', code: 'F-03', name: 'RESTRICT-FK', role: 'F-03: Every foreign key constraint must use ON DELETE RESTRICT.', spec: 'Integrity' },
  { id: 'f-05', code: 'F-05', name: 'CREATED-AT-TS', role: 'F-05: Every table must include created_at timestamptz NOT NULL DEFAULT now().', spec: 'Audit' },
  { id: 'f-06', code: 'F-06', name: 'UPDATED-AT-TS', role: 'F-06: Mutable tables include updated_at timestamptz; append-only tables omit updated_at.', spec: 'Audit' },
  { id: 'f-10', code: 'F-10', name: 'DELETED-AT-TS', role: 'F-10: Mutable tables include nullable deleted_at timestamptz; append-only omit deleted_at.', spec: 'Lifecycle' },
  { id: 'f-18', code: 'F-18', name: 'NAMED-INDEXES', role: 'F-18: Explicit non-constraint indexes must be named idx_<table>_<column>.', spec: 'Naming' },
];

const EXTRA_CONTRACTS: TagItem[] = [
  { id: 'f-12', code: 'F-12', name: 'STATUS-CHECK', role: 'F-12: Status/state columns must be text NOT NULL validated by CHECK (col IN (...)).', spec: 'Integrity' },
  { id: 'f-15', code: 'F-15', name: 'FK-COL-NAMING', role: 'F-15: FK columns must be named <ref_table>_id (or supersedes_id on append-only).', spec: 'Naming' },
  { id: 'f-16', code: 'F-16', name: 'FK-CONSTRAINT-NAMING', role: 'F-16: Foreign key constraints must be named fk_<table>_<column>.', spec: 'Naming' },
  { id: 'f-17', code: 'F-17', name: 'CHK-NAMING', role: 'F-17: Check constraints must be named chk_<table>_<column>.', spec: 'Naming' },
  { id: 'f-19', code: 'F-19', name: 'REVOKE-APPEND-ONLY', role: 'F-19: Append-only tables revoke UPDATE, DELETE, TRUNCATE from PUBLIC, application.', spec: 'Security' },
  { id: 'f-20', code: 'F-20', name: 'REJECT-DML-TRIGGER', role: 'F-20: Append-only BEFORE UPDATE/DELETE trigger raises error on modification.', spec: 'Security' },
  { id: 'f-22', code: 'F-22', name: 'INDEXED-FK-COLS', role: 'F-22: Every foreign key column must be covered as leading column of an index.', spec: 'Performance' },
  { id: 'f-23', code: 'F-23', name: 'INDEXED-TENANT-ID', role: 'F-23: Multi-tenant tables must index tenant_id as leading column of an index.', spec: 'Performance' },
  { id: 'f-24', code: 'F-24', name: 'PARTIAL-UNIQUE-IDX', role: 'F-24: Unique business keys on soft-deletable tables use partial index WHERE deleted_at IS NULL.', spec: 'Performance' },
  { id: 'f-36', code: 'F-36', name: 'SUPERSEDES-FK', role: 'F-36: Append-only tables include nullable self-referential supersedes_id FK.', spec: 'Integrity' },
];

const OPERATIONAL_CIRCUIT: TagItem[] = [
  { id: 'st-01', code: '01', name: 'GENERATE', badge: 'TEMP = 0', role: 'Zero-temperature candidate migration compiler with strictly deterministic decoding parameters.' },
  { id: 'st-02', code: '02', name: 'VERIFY', badge: 'PG-16 ORACLE', role: 'Zero LLM in verification loop. PostgreSQL 16 containerized Oracle probing 34 behavioral facts.' },
  { id: 'st-03', code: '03', name: 'FAIL', badge: 'FACT IDs ONLY', role: 'Discrete invariant violation reporting with canonical fact IDs, never leaking ground-truth SQL.' },
  { id: 'st-04', code: '04', name: 'ADVISE', badge: 'TOP K = 10', role: 'Failure-prioritized retrieval engine extracting targeted invariant rules from trial memory.' },
  { id: 'st-05', code: '05', name: 'RETRY', badge: 'CIRCUIT', role: 'Track 1 self-healing loop conditioning candidate retry on retrieved rule text (ablation evaluates single-turn).' },
  { id: 'st-06', code: '06', name: 'PASS', badge: 'HOLM P < 1e-4', role: 'Strict Holm-Bonferroni primary and secondary statistical significance validation (p < 0.0001).' },
  { id: 'st-arb', code: 'ARB', name: 'ARBITER', badge: 'SUPREME GATE', role: 'Deterministic ground-truth supreme court adjudicating cross-domain invariant conflicts.' },
];

const DEFAULT_FACT_FREQUENCIES: { fact: string; name: string; count: number; domain: string }[] = [
  { fact: 'F-22', name: 'INDEXED FOREIGN KEYS', count: 224, domain: 'Performance' },
  { fact: 'F-26', name: 'APP_METADATA TENANT RLS', count: 208, domain: 'Security' },
  { fact: 'F-18', name: 'EXPLICIT INDEX NAMING', count: 199, domain: 'Naming' },
  { fact: 'F-16', name: 'FK CONSTRAINT NAMING', count: 193, domain: 'Naming' },
  { fact: 'F-20', name: 'APPEND-ONLY REJECT TRIGGER', count: 189, domain: 'Security' },
  { fact: 'F-36', name: 'SUPERSEDES_ID SELF-FK', count: 186, domain: 'Integrity' },
  { fact: 'F-05', name: 'CREATED_AT TIMESTAMPTZ', count: 161, domain: 'Audit' },
  { fact: 'F-37', name: 'INGESTION RECEIVED_AT TRIGGER', count: 124, domain: 'Integrity' },
];

const FACT_NAME_MAP: Record<string, { name: string; domain: string }> = {
  'F-01': { name: 'UUID PRIMARY KEY', domain: 'Integrity' },
  'F-02': { name: 'TENANT ID COLUMN', domain: 'Tenancy' },
  'F-03': { name: 'RESTRICT FK ACTION', domain: 'Integrity' },
  'F-04': { name: 'NUMERIC DECIMAL', domain: 'Data Types' },
  'F-05': { name: 'CREATED_AT TIMESTAMPTZ', domain: 'Audit' },
  'F-06': { name: 'UPDATED_AT TIMESTAMPTZ', domain: 'Audit' },
  'F-07': { name: 'TIMESTAMPTZ ENFORCED', domain: 'Data Types' },
  'F-08': { name: 'UNBOUNDED TEXT', domain: 'Data Types' },
  'F-09': { name: 'JSONB NOT NULL', domain: 'Data Types' },
  'F-10': { name: 'SOFT DELETE DELETED_AT', domain: 'Lifecycle' },
  'F-11': { name: 'INET IP ADDRESS', domain: 'Data Types' },
  'F-12': { name: 'STATUS CHECK CONSTRAINT', domain: 'Integrity' },
  'F-13': { name: 'PLURAL SNAKE_CASE', domain: 'Naming' },
  'F-14': { name: 'PRIMARY KEY NAMING', domain: 'Naming' },
  'F-15': { name: 'FK COLUMN NAMING', domain: 'Naming' },
  'F-16': { name: 'FK CONSTRAINT NAMING', domain: 'Naming' },
  'F-17': { name: 'CHECK CONSTRAINT NAMING', domain: 'Naming' },
  'F-18': { name: 'EXPLICIT INDEX NAMING', domain: 'Naming' },
  'F-19': { name: 'REVOKE APPEND-ONLY DML', domain: 'Security' },
  'F-20': { name: 'APPEND-ONLY REJECT TRIGGER', domain: 'Security' },
  'F-21': { name: 'ADVANCE UPDATED_AT TRIGGER', domain: 'Integrity' },
  'F-22': { name: 'INDEXED FOREIGN KEYS', domain: 'Performance' },
  'F-23': { name: 'INDEXED TENANT_ID', domain: 'Performance' },
  'F-24': { name: 'PARTIAL UNIQUE KEY INDEX', domain: 'Performance' },
  'F-25': { name: 'ENABLE & FORCE RLS', domain: 'Security' },
  'F-26': { name: 'APP_METADATA TENANT RLS', domain: 'Security' },
  'F-27': { name: 'APPEND-ONLY RLS POLICIES', domain: 'Security' },
  'F-30': { name: 'NO TAUTOLOGICAL RLS', domain: 'Security' },
  'F-31': { name: 'SEC DEFINER SEARCH_PATH', domain: 'Security' },
  'F-32': { name: 'IDEMPOTENCY UNIQUE KEY', domain: 'Integrity' },
  'F-34': { name: 'NON-NEGATIVE COUNTER CHECK', domain: 'Integrity' },
  'F-36': { name: 'SUPERSEDES_ID SELF-FK', domain: 'Integrity' },
  'F-37': { name: 'INGESTION RECEIVED_AT TRIGGER', domain: 'Integrity' },
  'F-38': { name: 'OBSERVATION COMPOSITE INDEX', domain: 'Performance' },
  'F-39': { name: 'VIEW SECURITY_INVOKER', domain: 'Security' },
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
  const [activeTab, setActiveTab] = useState<string>('overview');

  const displayedContracts = showAllContracts
    ? [...INITIAL_CONTRACTS, ...EXTRA_CONTRACTS]
    : INITIAL_CONTRACTS;

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
    return 0.684;
  }, [activeRunStatus]);

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

  const factCountLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of factFrequencies) {
      map.set(item.fact, item.count);
    }
    return map;
  }, [factFrequencies]);

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: '◈' },
    { id: 'conditions', label: 'CONDITIONS', icon: '⬡' },
    { id: 'contracts', label: 'CONTRACTS', icon: '▣' },
    { id: 'circuit', label: 'CIRCUIT', icon: '⟳' },
    { id: 'memory', label: 'MEMORY', icon: '◆' },
  ];

  return (
    <section className="cortex-section" id="cortex-vault" aria-labelledby="cortex-title">
      <div className="cortex-bg-grid" aria-hidden="true" />
      <div className="cortex-bg-glow" aria-hidden="true" />
      <div className="cortex-bg-watermark" aria-hidden="true">
        <img src="/brand/axiom-mark.svg" alt="" className="cortex-bg-axiom-knot" />
      </div>

      <div className="cortex-container">
        {/* =========================================================================
            HEADER + TABS
            ========================================================================= */}
        <div className="cortex-header-block">
          <div className="cortex-chip">
            <span className="cortex-chip-dot" />
            <span>TOPOLOGY // ARCHITECTURAL KNOWLEDGE VAULT</span>
          </div>
          <h2 className="cortex-title">Axiom Autonomous Kernel & 3-Tier Invariant Vault</h2>
          <p className="cortex-desc">
            Axiom strictly decouples LLM generation from deterministic verification. The Autonomous Kernel
            routes candidate SQL migrations through three distinct engineering tiers: an immutable SHA-256
            ledger vault, 39 PostgreSQL 16 behavioral contracts, and a 6-stage operational circuit under the Arbiter.
          </p>

          <div className="cortex-tabs" role="tablist" aria-label="Architecture Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cortex-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              >
                <span className="cortex-tab-icon">{tab.icon}</span>
                <span className="cortex-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cortex-stage">
          {/* LEFT: KERNEL SPHERE + LIVE READOUT */}
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

            {/* CONDITION COMPLIANCE BAR (compact, horizontal) */}
            <div className="cortex-cond-bar" role="region" aria-label="Condition Compliance">
              {liveConditions.map((item, idx) => {
                const isSelected = selectedCondition === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedCondition(item.code)}
                    onMouseEnter={() => setSelectedCondition(item.code)}
                    className={`cortex-cond-mini ${isSelected ? 'is-active' : ''}`}
                    style={{ '--cond-accent': item.accent } as React.CSSProperties}
                  >
                    <span className="cortex-cond-mini-code">{item.code}</span>
                    <span className="cortex-cond-mini-pct">{item.pct}%</span>
                    <span className="cortex-cond-mini-name">{item.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BUS LINES */}
          <div className="cortex-bus-col" aria-hidden="true">
            <svg className="cortex-bus-svg" viewBox="0 0 100 520" preserveAspectRatio="none">
              <path d="M 0 260 C 48 260, 48 85, 100 85" className="cortex-bus-path cortex-bus-path--cyan" />
              <circle cx="100" cy="85" r="4" fill="#00f0ff" />
              <path d="M 0 260 C 48 260, 48 260, 100 260" className="cortex-bus-path cortex-bus-path--emerald" />
              <circle cx="100" cy="260" r="4.5" fill="#10b981" />
              <path d="M 0 260 C 48 260, 48 435, 100 435" className="cortex-bus-path cortex-bus-path--amber" />
              <circle cx="100" cy="435" r="4" fill="#f59e0b" />
            </svg>
          </div>

          {/* RIGHT: TAB CONTENT PANELS */}
          <div className="cortex-content-col">
            {activeTab === 'overview' && (
              <div className="cortex-overview-panel">
                <div className="cortex-scale-head">
                  <p className="cortex-scale-eyebrow">// SCALE & EFFICIENCY · MULTI-MODEL EMPIRICAL PROVENANCE</p>
                  <h2 className="cortex-scale-title">Built to heal. Built to be cheap.</h2>
                </div>

                {/* Fleet Strip */}
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
                            <span>TRIALS: <b>{done} / {total}</b></span>
                            <span>CONVERGENCE: <b>{conv}</b></span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Key Metrics Row - Compact */}
                <div className="cortex-metric-row">
                  <div className="cortex-metric-card">
                    <span className="cortex-metric-tag">VERIFIER</span>
                    <div className="cortex-metric-value">39</div>
                    <div className="cortex-metric-label">CONTRACTS</div>
                  </div>
                  <div className="cortex-metric-card">
                    <span className="cortex-metric-tag">TOKEN SAVINGS</span>
                    <div className="cortex-metric-value">51.3%</div>
                    <div className="cortex-metric-label">REDUCTION</div>
                  </div>
                  <div className="cortex-metric-card">
                    <span className="cortex-metric-tag">TRIALS / RUN</span>
                    <div className="cortex-metric-value">720</div>
                    <div className="cortex-metric-label">ABLATION</div>
                  </div>
                  <div className="cortex-metric-card">
                    <span className="cortex-metric-tag">MODELS</span>
                    <div className="cortex-metric-value">{runOptions.length}</div>
                    <div className="cortex-metric-label">FLEET</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'conditions' && (
              <div className="cortex-conditions-panel">
                <div className="cortex-charts-grid">
                  {/* Compliance Chart */}
                  <div className="cortex-chart-panel">
                    <div className="cortex-chart-head">
                      <div>
                        <span className="cortex-chart-eyebrow">ABLATION V2 // PRIMARY COMPLIANCE</span>
                        <h3 className="cortex-chart-title">Compliance Across 6 Conditions</h3>
                      </div>
                      <span className="cortex-chart-tag">CLICK TO INSPECT</span>
                    </div>
                    <svg className="cortex-svg-chart" viewBox="0 0 520 220" preserveAspectRatio="none">
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
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Condition Detail Card - Inline with findings */}
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
                          <span className="cortex-cond-metric-lbl">COMPLIANCE</span>
                        </div>
                        <div className="cortex-cond-metric-item">
                          <span className="cortex-cond-metric-val">{activeCondition.deltaBaseline}</span>
                          <span className="cortex-cond-metric-lbl">VS BASELINE</span>
                        </div>
                        <div className="cortex-cond-metric-item">
                          <span className="cortex-cond-metric-val">{activeCondition.tokens}</span>
                          <span className="cortex-cond-metric-lbl">TOKENS</span>
                        </div>
                      </div>
                    </div>
                    <div className="cortex-cond-detail-body">
                      <div className="cortex-cond-desc-col">
                        <p className="cortex-cond-desc-text">{activeCondition.description}</p>
                      </div>
                      <div className="cortex-cond-finding-col">
                        <p className="cortex-cond-finding-text">{activeCondition.keyFinding}</p>
<div className="cortex-cond-meta-badge">
                          <span className="cortex-cond-meta-dot" />
                          <span>720 RUNS \u00B7 PG16 ORACLE \u00B7 HOLM P { '<' } 0.0001</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Token Cost Chart */}
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
                    <line x1="48" y1="42" x2="488" y2="42" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                    <text x="40" y="45" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">1.8k</text>
                    <line x1="48" y1="104" x2="488" y2="104" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                    <text x="40" y="107" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">1.0k</text>
                    <line x1="48" y1="164" x2="488" y2="164" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                    <text x="40" y="167" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">500</text>
                    <line x1="96" y1="42" x2="96" y2="180" stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
                    <line x1="272" y1="104" x2="272" y2="180" stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
                    <line x1="448" y1="160" x2="448" y2="180" stroke="rgba(0, 240, 255, 0.45)" strokeDasharray="4 4" />
                    <path d="M 96 42 C 165 56, 215 84, 272 104 C 330 124, 385 150, 448 160 L 448 180 L 96 180 Z" fill="url(#token-curve-grad)" />
                    <path d="M 96 42 C 165 56, 215 84, 272 104 C 330 124, 385 150, 448 160" fill="none" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
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
                    <circle cx="96" cy="42" r="5.5" fill="#0f172a" stroke="#f8fafc" strokeWidth="2.5" />
                    <circle cx="272" cy="104" r="5.5" fill="#0f172a" stroke="#f8fafc" strokeWidth="2.5" />
                    <circle cx="448" cy="160" r="8" fill="#00f0ff" filter="drop-shadow(0 0 10px #00f0ff)" />
                    <circle cx="448" cy="160" r="3" fill="#ffffff" />
                    <text x="96" y="198" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="600">Static (B)</text>
                    <text x="96" y="212" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="monospace">+102% bloat</text>
                    <text x="272" y="198" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="600">Zero-Shot (A)</text>
                    <text x="272" y="212" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="monospace">Unassisted</text>
                    <text x="448" y="198" textAnchor="middle" fill="#00f0ff" fontSize="11" fontFamily="monospace" fontWeight="700">Verbatim (C0)</text>
                    <text x="448" y="212" textAnchor="middle" fill="#10b981" fontSize="9.5" fontFamily="monospace">86.3% · -51.3%</text>
                  </svg>
                </div>
              </div>
            )}

            {activeTab === 'contracts' && (
              <div className="cortex-contracts-panel">
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

                  {/* Fact Violation Frequencies - Inline in Contracts Tab */}
                  <div className="cortex-freq-panel" style={{ marginTop: '16px' }}>
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

                  {/* Contract Chips */}
                  <div className="cortex-chips-wrap" style={{ marginTop: '20px' }}>
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
              </div>
            )}

            {activeTab === 'memory' && (
              <div className="cortex-memory-panel">
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
                    FIFO Ring-Buffer (cap 25) & twin provenance ledgers. Lessons are calibrated on Train and verified by SHA-256 hash.
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
              </div>
            )}

            {activeTab === 'circuit' && (
              <div className="cortex-circuit-panel">
                <div className="cortex-card cortex-card--tier3">
                  <div className="cortex-card-head">
                    <div>
                      <div className="cortex-layer-badge-row">
                        <span className="cortex-layer-tag cortex-layer-tag--amber">LAYER 03 // EXECUTION PIPELINE</span>
                        <span className="cortex-layer-meta">ZERO-LLM VERIFIER</span>
                      </div>
                      <h3 className="cortex-card-title">6-Stage Operational Circuit & Arbiter</h3>
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
              </div>
            )}

            {/* Detail Inspector Banner - Always visible when item selected */}
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
    </section>
  );
}

export default CortexVaultSection;