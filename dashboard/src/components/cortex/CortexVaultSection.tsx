'use client';

import React, { useState } from 'react';
import { AxiomLogo } from '../AxiomLogo';
import './cortex.css';

interface TagItem {
  id: string;
  name: string;
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
    keyFinding: 'Fails on 69.1% of enterprise contracts, proving raw LLMs cannot infer unstated architectural invariants without guidance.',
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
    keyFinding: 'Yields negligible gain (+6.5%), proving Axiom gains are causal from semantic invariant guidance—not prompt-length artifacts.',
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
    keyFinding: 'Statistically significant compliance jump (McNemar p = 1.00e-5), demonstrating durable self-healing across held-out tasks.',
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
    keyFinding: 'Cuts token consumption by 51.3% while exceeding distilled lessons by +9.4% in primary compliance.',
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
    keyFinding: 'High compliance (85.7%) but causes extreme prompt bloat (+102% token overhead), making it cost-prohibitive in production.',
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
    keyFinding: 'Highest benchmark pass rate. Proves that pairing architectural invariants with deterministic fixers seals 88.2% of edge cases.',
    isLeader: true,
  },
];

const MEMORY_VAULT_FILES: TagItem[] = [
  { id: 'memory', name: 'MEMORY.JSON', role: 'Cryptographic FIFO ring buffer (cap 25). Stores distilled Reflexion lessons.' },
  { id: 'checkpoint', name: 'CHECKPOINT.JSON', role: 'Twin ledger committing trial records and SHA-256 hashes immediately after execution.' },
  { id: 'quarantine', name: 'QUARANTINE.JSON', role: 'Isolated security holding gate for candidates failing invariant or AST checks.' },
  { id: 'provenance', name: 'RUN-PROVENANCE.JSON', role: 'Full execution environment capture: git commit, diffSha256, model ID, and timestamps.' },
  { id: 'task-bank', name: 'TASK-BANK.JSON', role: 'Seeded problem synthesizer across 40 train, 40 dev, and 120 held-out test tasks.' },
  { id: 'facts', name: 'FACTS.JSON', role: '34 active behavioral contracts probed as application user in PostgreSQL 16.' },
  { id: 'ast-cache', name: 'AST-CACHE.JSON', role: 'SHA-256 disk cache for deterministic static AST parsing and mechanical fixer diffs.' },
];

const INITIAL_CONTRACTS: TagItem[] = [
  { id: 'tenant-rls', name: 'TENANT-RLS', role: 'F-10 / F-39: Cross-tenant row-level security boundaries verified with stubbed JWT claims.', spec: 'Security' },
  { id: 'zero-downtime', name: 'ZERO-DOWNTIME-DDL', role: 'F-01..F-04: Non-blocking column additions, concurrent index creation, and safe backfills.', spec: 'DDL Safety' },
  { id: 'role-separation', name: 'ROLE-SEPARATION', role: 'F-08 / F-09: Administrative deployer migration role strictly isolated from application user.', spec: 'Access' },
  { id: 'sec-definer', name: 'SECURITY-DEFINER', role: 'F-12: Explicit schema search_path enforcement on SECURITY DEFINER functions to prevent hijacking.', spec: 'Security' },
  { id: 'acid-tx', name: 'ACID-TRANSACTIONS', role: 'F-15: Strict atomic DDL rollbacks and transactional savepoints on schema migration failure.', spec: 'Integrity' },
  { id: 'index-locks', name: 'INDEX-LOCKS', role: 'F-18: Prevention of table-exclusive locks during peak hours via CREATE INDEX CONCURRENTLY.', spec: 'Performance' },
  { id: 'immutable-audit', name: 'IMMUTABLE-AUDIT', role: 'F-22: Append-only ledger triggers banning raw UPDATE and DELETE on audit trail tables.', spec: 'Governance' },
  { id: 'foreign-keys', name: 'FOREIGN-KEYS', role: 'F-25: Mandatory indexed foreign keys and NOT VALID constraint additions with follow-up validation.', spec: 'Integrity' },
  { id: 'schema-isolation', name: 'SCHEMA-ISOLATION', role: 'F-30: Strict multi-tenant schema partitioning and cross-database search path sanitization.', spec: 'Access' },
];

const EXTRA_CONTRACTS: TagItem[] = [
  { id: 'enum-evolution', name: 'ENUM-EVOLUTION', role: 'F-05: Non-blocking ALTER TYPE ADD VALUE statement safety in multi-step migrations.', spec: 'DDL Safety' },
  { id: 'check-constraints', name: 'CHECK-CONSTRAINTS', role: 'F-06: Adding CHECK constraints as NOT VALID followed by background VALIDATE CONSTRAINT.', spec: 'DDL Safety' },
  { id: 'default-values', name: 'DEFAULT-VALUES', role: 'F-07: PostgreSQL 11+ metadata-only default value assignment without table rewrite.', spec: 'Performance' },
  { id: 'drop-columns', name: 'DROP-COLUMNS', role: 'F-11: Two-phase column deprecation pattern banning sudden column removals.', spec: 'Integrity' },
  { id: 'partition-routing', name: 'PARTITION-ROUTING', role: 'F-14: Range and list partitioning boundaries for historical metrics tables.', spec: 'Scalability' },
  { id: 'trigger-ordering', name: 'TRIGGER-ORDERING', role: 'F-16: Alphabetical trigger execution ordering and idempotency safeguards.', spec: 'Integrity' },
  { id: 'view-stability', name: 'VIEW-STABILITY', role: 'F-19: Materialized view refresh safety without blocking concurrent read transactions.', spec: 'Performance' },
  { id: 'type-casting', name: 'TYPE-CASTING', role: 'F-21: Zero-downtime column type alterations using shadow columns and dual-writing.', spec: 'Integrity' },
  { id: 'grant-revocation', name: 'GRANT-REVOCATION', role: 'F-24: Principle of least privilege enforcement on public schema default privileges.', spec: 'Access' },
  { id: 'sequence-gaps', name: 'SEQUENCE-GAPS', role: 'F-27: Bigint identity column migrations preventing 32-bit integer overflow.', spec: 'Integrity' },
];

const OPERATIONAL_CIRCUIT: TagItem[] = [
  { id: 'st-01', name: '01 GENERATE (Temp=0)', role: 'Zero-temperature candidate migration compiler with strictly deterministic decoding parameters.' },
  { id: 'st-02', name: '02 VERIFY (Deterministic)', role: 'Zero LLM in verification loop. PostgreSQL 16 containerized Oracle probing behavioral facts.' },
  { id: 'st-03', name: '03 FAIL (Fact IDs)', role: 'Discrete invariant violation reporting with canonical error IDs, never leaking ground-truth SQL.' },
  { id: 'st-04', name: '04 ADVISE (K=10)', role: 'Reflexion retrieval engine extracting targeted invariant memory from historical trial bank.' },
  { id: 'st-05', name: '05 RETRY (Reflexion)', role: 'Feedback injection conditioning candidate retry with distilled contractual lessons.' },
  { id: 'st-06', name: '06 PASS (Multiplicity Gate)', role: 'Strict Holm-Bonferroni primary and secondary statistical significance validation (p < 0.0001).' },
  { id: 'st-arb', name: 'ARBITER', role: 'Deterministic ground-truth supreme court adjudicating cross-domain invariant conflicts.' },
];

export function CortexVaultSection() {
  const [showAllContracts, setShowAllContracts] = useState(false);
  const [activeItem, setActiveItem] = useState<TagItem | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string>('C0');

  const displayedContracts = showAllContracts
    ? [...INITIAL_CONTRACTS, ...EXTRA_CONTRACTS]
    : INITIAL_CONTRACTS;

  const activeCondition =
    CONDITIONS_DATA.find((c) => c.code === selectedCondition) ?? CONDITIONS_DATA[3];

  return (
    <section className="cortex-section" id="cortex-vault" aria-labelledby="cortex-title">
      <div className="cortex-bg-grid" aria-hidden="true" />
      <div className="cortex-bg-glow" aria-hidden="true" />

      <div className="cortex-container">
        {/* =========================================================================
            PART 1: SCALE & EFFICIENCY TELEMETRY CARD (Image 1 Replica & Elevation)
            ========================================================================= */}
        <div className="cortex-scale-block">
          <p className="cortex-scale-eyebrow">// SCALE &amp; EFFICIENCY · AXIOM EMPIRICAL PROVENANCE</p>
          <h2 className="cortex-scale-title">Built to heal. Built to be cheap.</h2>
          <p className="cortex-scale-subtitle">
            Local-first deterministic routing keeps heavy models for heavy work while slashing token inflation.
          </p>

          <div className="cortex-scale-card">
            {/* Top 3 Metric Stat Callouts (Directly inspired by Image 1) */}
            <div className="cortex-metrics-row">
              <div className="cortex-metric-stat">
                <span className="cortex-metric-number">39</span>
                <span className="cortex-metric-label">ENTERPRISE CONTRACTS</span>
              </div>
              <div className="cortex-metric-stat">
                <span className="cortex-metric-number cortex-metric-number--cyan">720</span>
                <span className="cortex-metric-label">SCORED TRIALS PROVEN</span>
              </div>
              <div className="cortex-metric-stat">
                <span className="cortex-metric-number">51.3%</span>
                <span className="cortex-metric-label">TOKEN COST REDUCTION</span>
              </div>
            </div>

            {/* Bottom Dual Interactive Charts (Exact Mathematical Alignment) */}
            <div className="cortex-charts-row">
              {/* Chart Left: Token Cost Optimization Line Chart */}
              <div className="cortex-chart-box">
                <div className="cortex-chart-head">
                  <span className="cortex-chart-title">TOKEN COST OPTIMIZATION</span>
                  <span className="cortex-chart-tag">[ EMPIRICAL TELEMETRY ]</span>
                </div>

                <svg className="cortex-svg-chart" viewBox="0 0 360 148" preserveAspectRatio="none">
                  {/* Horizontal Reference Grid Lines */}
                  <line x1="20" y1="28" x2="340" y2="28" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />
                  <line x1="20" y1="72" x2="340" y2="72" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />
                  <line x1="20" y1="112" x2="340" y2="112" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />

                  {/* Vertical Alignment Drop Lines Matching Labels */}
                  <line x1="50" y1="28" x2="50" y2="124" stroke="rgba(160, 170, 255, 0.16)" strokeDasharray="3 3" />
                  <line x1="180" y1="72" x2="180" y2="124" stroke="rgba(160, 170, 255, 0.16)" strokeDasharray="3 3" />
                  <line x1="310" y1="112" x2="310" y2="124" stroke="rgba(34, 211, 238, 0.35)" strokeDasharray="3 3" />

                  {/* Gradient Area under Curve */}
                  <defs>
                    <linearGradient id="token-curve-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 50 28 C 95 36, 140 56, 180 72 C 220 88, 265 106, 310 112 L 310 124 L 50 124 Z"
                    fill="url(#token-curve-grad)"
                  />

                  {/* Continuous Smooth Cubic Bezier Curve */}
                  <path
                    d="M 50 28 C 95 36, 140 56, 180 72 C 220 88, 265 106, 310 112"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Token Values Above Nodes */}
                  <text x="50" y="16" textAnchor="middle" fill="#9ca3af" fontSize="9.5" fontFamily="monospace">1,852 tok</text>
                  <text x="180" y="60" textAnchor="middle" fill="#9ca3af" fontSize="9.5" fontFamily="monospace">915 tok</text>
                  <text x="310" y="98" textAnchor="middle" fill="#22d3ee" fontSize="9.5" fontFamily="monospace" fontWeight="700">554 tok (-51.3%)</text>

                  {/* Nodes Directly on the Line */}
                  <circle cx="50" cy="28" r="4.5" fill="#ffffff" />
                  <circle cx="180" cy="72" r="4.5" fill="#ffffff" />

                  {/* Active Lowest Cost Endpoint */}
                  <circle cx="310" cy="112" r="6.5" fill="#22d3ee" filter="drop-shadow(0 0 8px #22d3ee)" />
                  <circle cx="310" cy="112" r="2.5" fill="#ffffff" />

                  {/* X-Axis Labels Precisely Centered Beneath Each Node in SVG */}
                  <text x="50" y="139" textAnchor="middle" fill="#7b819a" fontSize="9.5" fontFamily="monospace">Golden Hints</text>
                  <text x="180" y="139" textAnchor="middle" fill="#7b819a" fontSize="9.5" fontFamily="monospace">Zero-Shot</text>
                  <text x="310" y="139" textAnchor="middle" fill="#22d3ee" fontSize="9.5" fontFamily="monospace" fontWeight="700">Reflexion C0</text>
                </svg>

                <div className="cortex-chart-caption">
                  <span>Theoretical Oracle ceiling (+102% bloat)</span>
                  <span>Unassisted base</span>
                  <span className="is-active">Axiom Verbatim (-51.3% cost)</span>
                </div>
              </div>

              {/* Chart Right: Knowledge Expansion & Pass Rate Bar Chart */}
              <div className="cortex-chart-box">
                <div className="cortex-chart-head">
                  <span className="cortex-chart-title">COMPLIANCE ACROSS 6 CONDITIONS</span>
                  <span className="cortex-chart-tag">[ CLICK BAR TO DECODE ]</span>
                </div>

                <svg className="cortex-svg-chart" viewBox="0 0 360 148" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="16" y1="30" x2="344" y2="30" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />
                  <line x1="16" y1="65" x2="344" y2="65" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />
                  <line x1="16" y1="100" x2="344" y2="100" stroke="rgba(160, 170, 255, 0.08)" strokeWidth="1" />

                  {/* 6 Condition Bars with Precise Spacing */}
                  {CONDITIONS_DATA.map((item, idx) => {
                    const barWidth = 32;
                    const spacing = 24;
                    const x = spacing + idx * (barWidth + spacing);
                    const center = x + barWidth / 2;
                    const maxHeight = 85;
                    const height = (item.pct / 100) * maxHeight;
                    const y = 115 - height;
                    const isSelected = selectedCondition === item.code;
                    const isCyan = item.isLeader;

                    return (
                      <g
                        key={item.code}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedCondition(item.code)}
                        onMouseEnter={() => setSelectedCondition(item.code)}
                      >
                        {/* Interactive Click Target Area */}
                        <rect
                          x={x - 4}
                          y={20}
                          width={barWidth + 8}
                          height={120}
                          fill="transparent"
                        />

                        {/* Bar Rect */}
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={height}
                          rx="4"
                          fill={
                            isSelected
                              ? '#22d3ee'
                              : isCyan
                              ? '#38bdf8'
                              : '#475569'
                          }
                          stroke={isSelected ? '#ffffff' : 'none'}
                          strokeWidth={isSelected ? 1.5 : 0}
                          filter={
                            isSelected
                              ? 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.8))'
                              : isCyan
                              ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))'
                              : undefined
                          }
                          opacity={isSelected ? 1 : isCyan ? 0.95 : 0.75}
                        />

                        {/* Percentage Label Above Bar */}
                        <text
                          x={center}
                          y={y - 6}
                          textAnchor="middle"
                          fill={isSelected ? '#22d3ee' : isCyan ? '#38bdf8' : '#8b90a8'}
                          fontSize="9.5"
                          fontFamily="monospace"
                          fontWeight={isSelected || isCyan ? '700' : '500'}
                        >
                          {item.pct}%
                        </text>

                        {/* Condition Code Label Below Bar */}
                        <text
                          x={center}
                          y={134}
                          textAnchor="middle"
                          fill={isSelected ? '#22d3ee' : '#9ca3af'}
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight={isSelected ? '700' : '500'}
                        >
                          {item.code}
                        </text>

                        {/* Active Indicator Under Selected Condition */}
                        {isSelected && (
                          <circle cx={center} cy={142} r="2" fill="#22d3ee" />
                        )}
                      </g>
                    );
                  })}
                </svg>

                <div className="cortex-chart-caption cortex-chart-caption--bars">
                  <span>Baseline</span>
                  <span>Distractor</span>
                  <span>Reflexion</span>
                  <span className="is-active">Verbatim</span>
                  <span>Oracle</span>
                  <span>Stress (88%)</span>
                </div>
              </div>
            </div>

            {/* =====================================================================
                CONDITION DECODER PANEL: Rigorous Explanation of A, B, C, C0, D, E_B
                ===================================================================== */}
            <div className="cortex-decoder-block">
              <div className="cortex-decoder-header">
                <span className="cortex-decoder-eyebrow">// ABLATION MATRIX DECODER · PRE-REGISTERED DESIGN CHOICES</span>
                <span className="cortex-decoder-hint">SELECT CONDITION TO INSPECT CAUSAL ROLE &amp; IMPACT</span>
              </div>

              {/* 6 Condition Selector Tabs */}
              <div className="cortex-cond-pills-row" role="tablist" aria-label="Ablation Condition Selector">
                {CONDITIONS_DATA.map((c) => {
                  const isSelected = selectedCondition === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`cortex-cond-pill ${isSelected ? 'is-active' : ''}`}
                      onClick={() => setSelectedCondition(c.code)}
                    >
                      <span className="cortex-cond-pill-code">{c.code}</span>
                      <span className="cortex-cond-pill-name">{c.shortName}</span>
                      <span className="cortex-cond-pill-pct">{c.pct}%</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Condition Detailed Explainer Card */}
              <div
                className="cortex-cond-detail-card"
                style={
                  {
                    '--cond-accent':
                      activeCondition.isLeader
                        ? '#22d3ee'
                        : activeCondition.code === 'C0' || activeCondition.code === 'C'
                        ? '#38bdf8'
                        : '#a855f7',
                  } as React.CSSProperties
                }
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
                      <span className="cortex-cond-metric-val cortex-cond-metric-val--cyan">
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
        </div>

        {/* =========================================================================
            PART 2: AXIOM KERNEL & 3-TIER INVARIANT VAULT (Elevated from Image 2)
            ========================================================================= */}
        <div className="cortex-kernel-block">
          <div className="cortex-header">
            <div className="cortex-chip">
              <span className="cortex-chip-dot" />
              <span>TOPOLOGY // ARCHITECTURAL KNOWLEDGE VAULT</span>
            </div>
            <p className="cortex-eyebrow">The Invariant Core Behind the Machine</p>
            <h2 className="cortex-title">Axiom Autonomous Kernel &amp; Invariant Vault</h2>
            <p className="cortex-desc">
              Axiom strictly decouples LLM generation from deterministic ground truth. The Autonomous Kernel
              routes candidate SQL migrations through three verified invariant tiers: cryptographic dual ledgers,
              39 enterprise PostgreSQL contracts, and a 6-stage operational circuit under the Arbiter.
            </p>
          </div>

          {/* Interactive Layout Stage */}
          <div className="cortex-stage">
            {/* Column 1: Axiom Kernel Sphere (Transparent Vector Mark - No Dark Square Container) */}
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
                      role: 'Deterministic ground-truth reactor. Evaluates all candidate migrations inside PostgreSQL 16 Docker containers.',
                    })
                  }
                >
                  <AxiomLogo size={68} variant="mark" className="cortex-axiom-knot-icon" title="Axiom Kernel" />
                </div>
                <span className="cortex-core-label">AXIOM KERNEL</span>
              </div>
            </div>

            {/* Column 2: Animated SVG Connecting Bus Lines */}
            <div className="cortex-bus-col" aria-hidden="true">
              <svg className="cortex-bus-svg" viewBox="0 0 100 480" preserveAspectRatio="none">
                {/* Bus Line to Layer 01 */}
                <path d="M 0 240 C 50 240, 50 80, 100 80" className="cortex-bus-path" />
                <circle cx="100" cy="80" r="3.5" className="cortex-bus-node" />

                {/* Bus Line to Layer 02 */}
                <path d="M 0 240 C 50 240, 50 240, 100 240" className="cortex-bus-path cortex-bus-path--active" />
                <circle cx="100" cy="240" r="4" className="cortex-bus-node" />

                {/* Bus Line to Layer 03 */}
                <path d="M 0 240 C 50 240, 50 400, 100 400" className="cortex-bus-path" />
                <circle cx="100" cy="400" r="3.5" className="cortex-bus-node" />
              </svg>
            </div>

            {/* Column 3: The 3 Stacked Cards (Real Axiom Architecture) */}
            <div className="cortex-cards-col">
              {/* LAYER 01: Cryptographic Memory Vault */}
              <div className="cortex-card" style={{ '--card-accent': '#38bdf8' } as React.CSSProperties}>
                <div className="cortex-card-head">
                  <div>
                    <span className="cortex-layer-tag">LAYER 01</span>
                    <h3 className="cortex-card-title">Cryptographic Memory Vault</h3>
                  </div>
                  <div className="cortex-card-icon" title="SHA-256 Provenance & Ledgers">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">FIFO Ring-Buffer (cap 25). SHA-256 immutable trial records.</p>
                <div className="cortex-chips-wrap">
                  {MEMORY_VAULT_FILES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`cortex-tag ${activeItem?.id === f.id ? 'is-active' : ''}`}
                      onClick={() => setActiveItem(f)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* LAYER 02: 39 Enterprise Database Contracts */}
              <div className="cortex-card" style={{ '--card-accent': '#22d3ee' } as React.CSSProperties}>
                <div className="cortex-card-head">
                  <div>
                    <span className="cortex-layer-tag">LAYER 02</span>
                    <h3 className="cortex-card-title">39 Enterprise Database Contracts</h3>
                  </div>
                  <div className="cortex-card-icon" title="PostgreSQL 16 Docker Behavioral Probes">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">Probed in fresh PostgreSQL 16 Docker containers across 3 enterprise roles.</p>
                <div className="cortex-chips-wrap">
                  {displayedContracts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`cortex-tag ${activeItem?.id === c.id ? 'is-active' : ''}`}
                      onClick={() => setActiveItem(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cortex-tag cortex-tag-more"
                    onClick={() => setShowAllContracts(!showAllContracts)}
                    aria-expanded={showAllContracts}
                  >
                    {showAllContracts ? 'COLLAPSE ⌃' : '+25 CONTRACTS'}
                  </button>
                </div>
              </div>

              {/* LAYER 03: 6-Stage Operational Circuit */}
              <div className="cortex-card" style={{ '--card-accent': '#a855f7' } as React.CSSProperties}>
                <div className="cortex-card-head">
                  <div>
                    <span className="cortex-layer-tag">LAYER 03</span>
                    <h3 className="cortex-card-title">6-Stage Operational Circuit</h3>
                  </div>
                  <div className="cortex-card-icon" title="Deterministic Invariant Gate & Arbiter">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 11 14 15 10" />
                    </svg>
                  </div>
                </div>
                <p className="cortex-card-sub">Deterministic authority separation. Zero LLM in verification loop.</p>
                <div className="cortex-chips-wrap">
                  {OPERATIONAL_CIRCUIT.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`cortex-tag ${activeItem?.id === a.id ? 'is-active' : ''}`}
                      onClick={() => setActiveItem(a)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Detail Inspector Banner */}
              {activeItem && (
                <div className="cortex-detail-banner" role="status">
                  <div className="cortex-detail-info">
                    <b>{activeItem.name}:</b> {activeItem.role}
                  </div>
                  <div className="cortex-detail-badge">PROVENANCE VERIFIED</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
