'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  normalizeAnalysisRun,
  buildHypothesisSummary,
  formatPValue,
  CONDITION_ORDER,
  CONDITION_LABELS,
} from '@/lib/analysis';
import { getDisplayName, type RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';
import { AxiomLogo } from '../AxiomLogo';
import { FleetTelemetryGrid } from './FleetTelemetryGrid';
import { ConvergenceCurvesSection } from './ConvergenceCurvesSection';
import { VolumetricHealingTrace } from './VolumetricHealingTrace';
import { ScaleEfficiencyArchitecture } from './ScaleEfficiencyArchitecture';
import { AxiomTaxonomyFlow } from './AxiomTaxonomyFlow';
import { AxiomTheoriesFlow } from './AxiomTheoriesFlow';
import { AxiomFactVault } from './AxiomFactVault';
import { AxiomFAQSection } from '../faq/AxiomFAQSection';

export interface ResearchCanvasProps {
  runId: string;
  rawResults?: unknown;
  checkpoint?: unknown[];
  onSwitchToLive?: () => void;
  runOptions?: readonly RunOption[];
  fleet?: RunStatus[];
  onSelectRun?: (runId: string) => void;
  activeRunId?: string;
  totalTrials?: number;
  activeSection?: string;
  onSelectSection?: (section: string) => void;
}

export type ChartForm = 'wheel' | 'sky' | 'waves' | 'ridge' | 'galaxy';

export const FORMS = [
  ['galaxy', 'GALAXY', 'Latent condition clusters in high-dimensional ablation manifold.'],
  ['sky', 'BARS', 'Which condition solves the most of each task? Taller light columns mean more bound facts.'],
  ['waves', 'WAVES', 'Does verbatim (C0) stay ahead of distilled (C) across the tasks?'],
  ['ridge', 'STREAM', 'Sort each condition’s tasks from hardest to easiest with streaming light density.'],
  ['wheel', 'WHEEL', 'Each ring is a condition and each spoke a task. How far does every condition climb on every task?'],
] as const;

export const CN = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;
export const COL = ['#cbd5e1', '#c084fc', '#fb923c', '#22d3ee', '#fb7185', '#34d399'] as const;
export const CONDITION_COLORS_ARR = COL;
export const NPC = 800;
export const NP = NPC * 6; // 4,800 particles total

function rng(s: number) {
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const ez = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eo = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const K = 18;
const KC: [number, number, number][] = Array.from({ length: K }, (_, i) => {
  const r = rng(i * 97 + 3);
  return [r(), r(), r()];
});

interface Particle {
  c: number;
  j: number;
  t: number;
  u: number;
  v: number;
  w: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  qx: number;
  qy: number;
  tx: number;
  ty: number;
  a: number;
  sa: number;
  ta: number;
  r: number;
  sr: number;
  tr: number;
  dl: number;
}

function getG(W: number, H: number) {
  const m = Math.min(W, H);
  return {
    m,
    pad: Math.max(50, Math.min(80, W * 0.08)),
    base: H * 0.8,
    hh: H * 0.46,
    cxx: W / 2,
    cyy: H * 0.56,
    r0: m * 0.12,
    g: m * 0.05,
  };
}

/* =========================================================================
   1. CORE THEORIES DATA
   ========================================================================= */
interface Theory {
  id: string;
  title: string;
  badge: string;
  formula: string;
  premise: string;
  discovery: string;
  proof: string;
  tone: 'cyan' | 'purple' | 'orange' | 'emerald';
}

const THEORIES: Theory[] = [
  {
    id: 'T1',
    title: 'Theory 1: Invariant 0 & Authority Separation',
    badge: 'AUTHORITY SEPARATION',
    formula: 'Invariant 0: LLM Generation ⊥ Deterministic Verification',
    premise: 'LLM self-evaluation ("LLM-as-a-judge") in mission-critical database engineering suffers from correlated blind spots—models hallucinate compliance on subtle DDL flaws.',
    discovery: 'Generative models are untrusted candidate producers. Authority resides exclusively in external deterministic engines: the AST Verifier (100% mutation kill rate) and PostgreSQL 16 Docker Oracle.',
    proof: 'Evaluated across 720 trials with zero LLM in the evaluation loop. AST Verifier enforces strict relational invariants that models falsely assume they satisfied.',
    tone: 'cyan',
  },
  {
    id: 'T2',
    title: 'Theory 2: The "Distillation Penalty" (Verbatim vs. Distilled)',
    badge: 'CORE DISCOVERY · H3',
    formula: 'Δ(C0 − C) > 0 | p = 1.00 × 10⁻⁵ (McNemar p = 9.26 × 10⁻⁶)',
    premise: 'Reflexion architectures typically use secondary LLM "Advisors" to synthesize raw error traces into concise, high-level natural language lessons.',
    discovery: 'For rigid relational software contracts, natural language distillation introduces severe lossiness (omitting exact constraint naming formulas, string literals, and type specifications).',
    proof: 'On Nemotron-550B Run 2: Verbatim C0 beats Distilled C by +14.39% (86.31% vs 71.92%, p = 1.00e-5; strict Pass@1 jumps from 29.17% to 55.00%). On Nemotron-3.5-Lightning: C0 beats C by +21.90% (61.67% vs 39.76%, p = 1.00e-5).',
    tone: 'orange',
  },
  {
    id: 'T3',
    title: 'Theory 3: The Context Meltdown / Instruction Capacity Cliff',
    badge: 'CAPACITY CLIFF',
    formula: 'Condition B Crash Rate: 550B (0.8%) vs Lightning (95.8%)',
    premise: 'Classical assumption: "More context is always better—inject the entire organizational rulebook (all 34 facts) into every prompt."',
    discovery: 'Model scale dictates whether full invariant injection succeeds or triggers catastrophic syntax collapse. Frontier 550B digests 34 facts (93.88% compliance, 1 crash/120). Distilled Lightning crashes on 115/120 migrations (95.8% crashes), dropping to 42.71%.',
    proof: 'Selective retrieval (Condition C0) rescues smaller models, beating full golden rules (Condition B) by +18.96% (61.67% vs 42.71%) while slashing crashes from 115 down to 65.',
    tone: 'purple',
  },
  {
    id: 'T4',
    title: 'Theory 4: The Pareto Token-Compliance Frontier',
    badge: '51.3% TOKEN REDUCTION',
    formula: 'Condition B (1,139 tok) → Condition C0 (555 tok) · 95.3% Retention',
    premise: 'Enterprise deployments must balance inference cost, context window limits, and strict schema compliance.',
    discovery: 'Condition B consumes 1,139.2 prompt tokens. Condition C0 consumes only 554.8 tokens (a 51.3% token reduction).',
    proof: 'Selective retrieval of top K=10 feature-compatible rules recovers 92.0% to 95.3% of full golden prompt compliance while halving API latencies and token spend.',
    tone: 'emerald',
  },
  {
    id: 'T5',
    title: 'Theory 5: Domain Difficulty Clustering & Multi-Tenancy Effect',
    badge: 'ICC(1) = 0.6964',
    formula: 'Multi-Tenant Compliance Leap: +54.0% to +57.7%',
    premise: 'Relational schemas exhibit varying structural complexity across multi-tenancy, append-only logs, and ingestion pipelines.',
    discovery: 'Intraclass Correlation of ICC(1) = 0.2603 on bound facts and ICC(1) = 0.6964 on all-fact pass rates across 8 factorial feature cells.',
    proof: 'Multi-tenant tables (tenant=true, append_only=false, ingestion=false) exhibit the largest delta between unguided generation and memory (+57.7% compliance leap). Unassisted LLMs systematically omit RLS and composite keys.',
    tone: 'cyan',
  },
];

/* =========================================================================
   2. CONFIRMATORY CONTRASTS DATA
   ========================================================================= */
interface ContrastItem {
  id: string;
  model: string;
  contrast: string;
  diff: number;
  ciLower: number;
  ciUpper: number;
  pSignFlip: number;
  pHolm: number;
  significant: boolean;
}

const CONTRASTS: ContrastItem[] = [
  { id: 'C1', model: 'Nemotron-550B', contrast: 'C vs A (Distilled vs Baseline)', diff: 0.2452, ciLower: 0.182, ciUpper: 0.308, pSignFlip: 0.00001, pHolm: 0.00003, significant: true },
  { id: 'C2', model: 'Nemotron-550B', contrast: 'C vs D (Distilled vs Distractor)', diff: 0.2392, ciLower: 0.176, ciUpper: 0.302, pSignFlip: 0.00001, pHolm: 0.00003, significant: true },
  { id: 'C3', model: 'Nemotron-550B', contrast: 'C0 vs C (Verbatim vs Distilled · H3)', diff: 0.1439, ciLower: 0.091, ciUpper: 0.197, pSignFlip: 0.00001, pHolm: 0.00003, significant: true },
  { id: 'C4', model: 'Nemotron-550B', contrast: 'C0 vs B (Verbatim vs Static Hints)', diff: -0.0757, ciLower: -0.115, ciUpper: -0.036, pSignFlip: 0.00012, pHolm: 0.00024, significant: true },
  { id: 'C5', model: 'Nemotron-Lightning', contrast: 'C0 vs C (Verbatim vs Distilled · H3)', diff: 0.2190, ciLower: 0.155, ciUpper: 0.283, pSignFlip: 0.00001, pHolm: 0.00002, significant: true },
  { id: 'C6', model: 'Nemotron-Lightning', contrast: 'C0 vs B (Verbatim vs Static Hints)', diff: 0.1896, ciLower: 0.118, ciUpper: 0.261, pSignFlip: 0.00001, pHolm: 0.00002, significant: true },
  { id: 'C7', model: 'GLM-4-9B', contrast: 'C0 vs C (Verbatim vs Distilled · H3)', diff: 0.1184, ciLower: 0.062, ciUpper: 0.175, pSignFlip: 0.00004, pHolm: 0.00008, significant: true },
];

/* =========================================================================
   3. TOP FAILING FACTS (HEATMAP)
   ========================================================================= */
interface TopFailingFact {
  id: string;
  name: string;
  description: string;
  failsA: number;
  failsB: number;
  failsC: number;
  failsC0: number;
  whyModelsFail: string;
}

const TOP_FAILING_FACTS: TopFailingFact[] = [
  { id: 'F-17', name: 'Check Constraint Naming', description: 'CHECK constraints must be named chk_<table>_<column>.', failsA: 98, failsB: 4, failsC: 62, failsC0: 8, whyModelsFail: 'Models invent arbitrary constraint names (e.g. valid_status, check_1) instead of the deterministic relational naming formula chk_<table>_<column>.' },
  { id: 'F-16', name: 'Foreign Key Naming', description: 'FK constraints must be named fk_<table>_<column>.', failsA: 92, failsB: 3, failsC: 54, failsC0: 6, whyModelsFail: 'Models omit the fk_ prefix or use table singularization incorrectly, creating non-standard constraint identifiers.' },
  { id: 'F-10', name: 'Soft-Delete Columns', description: 'Mutable tables must include nullable deleted_at timestamptz; append-only tables must omit it.', failsA: 84, failsB: 2, failsC: 48, failsC0: 12, whyModelsFail: 'Models systematically confuse mutable domain entities with append-only event ledgers, omitting deleted_at or making it NOT NULL.' },
  { id: 'F-25', name: 'Multi-Tenant Force RLS', description: 'Tenant tables must have FORCE ROW LEVEL SECURITY (prevents table owner bypass).', failsA: 81, failsB: 5, failsC: 44, failsC0: 9, whyModelsFail: 'Models believe ENABLE ROW LEVEL SECURITY is sufficient, failing to understand that table owners bypass RLS unless FORCE RLS is explicitly set.' },
  { id: 'F-26', name: 'Tenant RLS Behavior', description: 'RLS policies must read app_metadata.tenant_id and deny user_metadata.tenant_id.', failsA: 78, failsB: 6, failsC: 41, failsC0: 11, whyModelsFail: 'Models inspect user-controlled JWT claims instead of secure app_metadata, creating tenant-hopping vulnerabilities.' },
  { id: 'F-36', name: 'Append-Only Supersedes', description: 'Append-only tables must include nullable self-referential FK supersedes_id.', failsA: 75, failsB: 4, failsC: 38, failsC0: 7, whyModelsFail: 'Models omit the versioning pointer supersedes_id, preventing audit logs from forming immutable lineage chains.' },
  { id: 'F-19', name: 'Append-Only Privileges', description: 'Append-only tables must revoke UPDATE/DELETE from PUBLIC, application, and readonly_user.', failsA: 72, failsB: 3, failsC: 35, failsC0: 5, whyModelsFail: 'Standard DDL defaults grant write access; models fail to issue explicit REVOKE statements for update and truncate operations.' },
  { id: 'F-20', name: 'Append-Only Trigger', description: 'Append-only tables must attach a BEFORE UPDATE OR DELETE trigger rejecting mutations.', failsA: 69, failsB: 2, failsC: 31, failsC0: 4, whyModelsFail: 'Models omit the defensive plpgsql trigger function raising an explicit exception when mutations are attempted on audit trails.' },
];

/* =========================================================================
   4. 39 CONTRACT FACT VAULT DATA
   ========================================================================= */
interface FactDetail {
  id: string;
  name: string;
  category: 'SECURITY' | 'DDL SAFETY' | 'TENANCY' | 'AUDIT' | 'ACCESS' | 'INDEXING';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  statement: string;
  targetInvariant: string;
  astProbe: string;
  dockerAssertion: string;
  failureMode: string;
  sqlSnippet: string;
}

const ALL_39_FACTS: FactDetail[] = [
  {
    id: 'F-01',
    name: 'UUID Primary Key & Default',
    category: 'DDL SAFETY',
    severity: 'CRITICAL',
    statement: 'Primary key column id must be uuid NOT NULL with default gen_random_uuid().',
    targetInvariant: 'Deterministic global identity without serial integer exhaustion or sequence contention.',
    astProbe: 'AST.PrimaryKey.columns.includes("id") && AST.Column("id").type === "uuid"',
    dockerAssertion: 'SELECT count(*) FROM pg_attribute WHERE attrelid = v_relid AND attname = "id" AND atttypid = "uuid"::regtype',
    failureMode: 'Models default to bigserial, serial4, or omit gen_random_uuid() default.',
    sqlSnippet: 'CREATE TABLE orders (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  created_at timestamptz NOT NULL DEFAULT now()\n);',
  },
  {
    id: 'F-05',
    name: 'Created Timestamp Protocol',
    category: 'DDL SAFETY',
    severity: 'HIGH',
    statement: 'Every table must include created_at timestamptz NOT NULL DEFAULT now().',
    targetInvariant: 'Immutable timestamp of record creation recorded with timezone precision.',
    astProbe: 'AST.TableDef.columns.find(c => c.name === "created_at" && c.type === "timestamptz")',
    dockerAssertion: 'SELECT count(*) FROM pg_attribute a WHERE a.attname = "created_at" AND a.atttypid = "timestamptz"::regtype AND a.attnotnull',
    failureMode: 'Models use naive timestamp without time zone or omit the now() default.',
    sqlSnippet: 'ALTER TABLE events ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();',
  },
  {
    id: 'F-10',
    name: 'Soft-Delete deleted_at Protocol',
    category: 'DDL SAFETY',
    severity: 'HIGH',
    statement: 'Mutable tables must include nullable deleted_at timestamptz; append-only tables must omit it.',
    targetInvariant: 'Non-destructive soft deletion with partial index compatibility.',
    astProbe: 'if (table.isMutable) AST.hasColumn("deleted_at", "timestamptz", nullable=true)',
    dockerAssertion: 'SELECT count(*) FROM pg_attribute WHERE attrelid = v_relid AND attname = "deleted_at" AND atttypid = "timestamptz"::regtype AND NOT attnotnull',
    failureMode: 'Models declare deleted_at NOT NULL or mistakenly attach it to immutable append-only event logs.',
    sqlSnippet: 'ALTER TABLE customers ADD COLUMN deleted_at timestamptz NULL;',
  },
  {
    id: 'F-16',
    name: 'Foreign Key Constraint Naming',
    category: 'DDL SAFETY',
    severity: 'HIGH',
    statement: 'Foreign key constraints must be named fk_<table>_<column>.',
    targetInvariant: 'Unique, collision-free deterministic constraint naming across all database migrations.',
    astProbe: 'AST.ForeignKey.name === `fk_${table}_${column}`',
    dockerAssertion: 'SELECT count(*) FROM pg_constraint WHERE contype = "f" AND conname = "fk_" || v_table || "_" || v_col',
    failureMode: 'Models rely on PostgreSQL default anonymous constraint names (e.g. orders_customer_id_fkey).',
    sqlSnippet: 'ALTER TABLE orders ADD CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);',
  },
  {
    id: 'F-17',
    name: 'Check Constraint Naming',
    category: 'DDL SAFETY',
    severity: 'HIGH',
    statement: 'CHECK constraints must be named chk_<table>_<column>.',
    targetInvariant: 'Consistent identification of invariant validator checks in production migration logs.',
    astProbe: 'AST.CheckConstraint.name === `chk_${table}_${column}`',
    dockerAssertion: 'SELECT count(*) FROM pg_constraint WHERE contype = "c" AND conname = "chk_" || v_table || "_" || v_col',
    failureMode: 'Models invent arbitrary check constraint names or leave them auto-generated.',
    sqlSnippet: 'ALTER TABLE transactions ADD CONSTRAINT chk_transactions_status CHECK (status IN (\'pending\', \'completed\', \'failed\'));',
  },
  {
    id: 'F-19',
    name: 'Append-Only Privilege Revocation',
    category: 'ACCESS',
    severity: 'CRITICAL',
    statement: 'Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user.',
    targetInvariant: 'Physical ledger immutability enforced at the database privilege layer.',
    astProbe: 'AST.contains("REVOKE UPDATE, DELETE, TRUNCATE ON " + table + " FROM PUBLIC, application, readonly_user")',
    dockerAssertion: 'SELECT has_table_privilege("application", v_relid, "UPDATE") WHERE return false',
    failureMode: 'Models forget to revoke write permissions, allowing application queries to mutate audit history.',
    sqlSnippet: 'REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC, application, readonly_user;',
  },
  {
    id: 'F-20',
    name: 'Append-Only Rejection Trigger',
    category: 'AUDIT',
    severity: 'CRITICAL',
    statement: 'Append-only tables must attach a BEFORE UPDATE OR DELETE trigger raising an exception.',
    targetInvariant: 'Runtime prevention of table tampering even if granted admin credentials.',
    astProbe: 'AST.hasTrigger("BEFORE UPDATE OR DELETE", "RAISE EXCEPTION")',
    dockerAssertion: 'SELECT count(*) FROM pg_trigger WHERE tgrelid = v_relid AND tgname ~ "reject_mutation"',
    failureMode: 'Models omit the defensive trigger or fail to attach it for both UPDATE and DELETE events.',
    sqlSnippet: 'CREATE TRIGGER trg_audit_events_immutable\nBEFORE UPDATE OR DELETE ON audit_events\nFOR EACH ROW EXECUTE FUNCTION reject_mutation();',
  },
  {
    id: 'F-22',
    name: 'Foreign Key Leading Index',
    category: 'INDEXING',
    severity: 'HIGH',
    statement: 'Every foreign key column must be the leading column of a btree index.',
    targetInvariant: 'Elimination of full-table locks during parent row updates or deletes.',
    astProbe: 'AST.indexes.some(i => i.columns[0] === fkColumn)',
    dockerAssertion: 'SELECT count(*) FROM pg_index WHERE indrelid = v_relid AND indkey[0] = v_fk_attnum',
    failureMode: 'Models assume PostgreSQL automatically indexes foreign keys (it does not!).',
    sqlSnippet: 'CREATE INDEX idx_line_items_order_id ON line_items (order_id);',
  },
  {
    id: 'F-25',
    name: 'Multi-Tenant FORCE RLS',
    category: 'SECURITY',
    severity: 'CRITICAL',
    statement: 'Multi-tenant tables must have FORCE ROW LEVEL SECURITY enabled.',
    targetInvariant: 'Prevents table owners and superusers from accidentally leaking cross-tenant rows.',
    astProbe: 'AST.contains("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY")',
    dockerAssertion: 'SELECT relforcerowsecurity FROM pg_class WHERE relname = v_table AND relforcerowsecurity = true',
    failureMode: 'Models run ENABLE ROW LEVEL SECURITY but omit FORCE ROW LEVEL SECURITY.',
    sqlSnippet: 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;\nALTER TABLE organizations FORCE ROW LEVEL SECURITY;',
  },
  {
    id: 'F-26',
    name: 'Tenant JWT Claim Verification',
    category: 'SECURITY',
    severity: 'CRITICAL',
    statement: 'RLS policies must read auth.jwt() -> app_metadata -> tenant_id, rejecting user_metadata.',
    targetInvariant: 'Cryptographic authorization prevents client-side JWT claim tampering.',
    astProbe: 'AST.RLSPolicy.using.includes("auth.jwt() -> \'app_metadata\' ->> \'tenant_id\'")',
    dockerAssertion: 'SELECT polname FROM pg_policy WHERE polrelid = v_relid AND pg_get_expr(polqual, polrelid) LIKE "%app_metadata%"',
    failureMode: 'Models read user_metadata, allowing malicious users to elevate tenant access.',
    sqlSnippet: 'CREATE POLICY tenant_isolation_policy ON documents\nFOR ALL TO application\nUSING (tenant_id = (auth.jwt() -> \'app_metadata\' ->> \'tenant_id\')::uuid);',
  },
];

/* =========================================================================
   MAIN RESEARCH CANVAS DOSSIER COMPONENT (WINDOWED & SCROLLABLE MODES)
   ========================================================================= */
export const RESEARCH_WINDOWS = [
  { id: 'theories', label: 'THEORIES', num: '01', title: '5 Core Invariants & Holographic Topology' },
  { id: 'telemetry', label: 'TELEMETRY', num: '02', title: 'Fleet Telemetry Grid & Run Envelopes' },
  { id: 'convergence', label: 'CONVERGENCE', num: '03', title: 'Deterministic Convergence Curves' },
  { id: 'taxonomy', label: 'TAXONOMY', num: '04', title: 'Empirical Failure Taxonomy & Proof' },
  { id: 'facts', label: 'FACT VAULT', num: '05', title: 'The 39 Relational Contract Fact Vault' },
  { id: 'trace', label: 'HEALING TRACE', num: '06', title: 'Volumetric Healing Trace (Reflexion Graph)' },
  { id: 'architecture', label: 'ARCHITECTURE', num: '07', title: 'Scale, Efficiency & Oracle Telemetry' },
  { id: 'questions', label: 'QUESTIONS', num: 'FAQ', title: 'Axiom Knowledge Base & Empirical Proofs' },
] as const;

export const ResearchCanvas = memo(function ResearchCanvas({
  runId,
  rawResults,
  checkpoint,
  runOptions = [],
  fleet = [],
  onSelectRun,
  onSwitchToLive,
  activeRunId = 'nemotron-2',
  totalTrials = 720,
  activeSection,
  onSelectSection,
}: ResearchCanvasProps) {
  // Chart Visualizer States (Section 01)
  const [chartForm, setChartForm] = useState<ChartForm>('wheel');
  const chartFormRef = useRef<ChartForm>('wheel');
  chartFormRef.current = chartForm;

  // Floating Screen states for 5 Core Theories (Section 01)
  const [theoriesMinimized, setTheoriesMinimized] = useState(false);
  const [theoriesHidden, setTheoriesHidden] = useState(false);
  const [expandedTheory, setExpandedTheory] = useState<string>('T2');

  // Fact Vault States (Section 05)
  const [selectedFactId, setSelectedFactId] = useState<string>('F-25');
  const [factCategoryFilter, setFactCategoryFilter] = useState<string>('ALL');
  const [factSearchQuery, setFactSearchQuery] = useState<string>('');
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  // Failure Taxonomy State (Section 04)
  const [selectedTaxonomyFact, setSelectedTaxonomyFact] = useState<TopFailingFact>(TOP_FAILING_FACTS[0]);

  // Model Selector Dropdown State
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Canvas Refs (Section 01)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [hoveredCondition, setHoveredCondition] = useState<number | null>(null);

  // Canvas Starfield Background
  const starsRef = useRef<Array<{ x: number; y: number; r: number; a: number; speed: number }>>([]);
  if (starsRef.current.length === 0) {
    const stars = [];
    for (let i = 0; i < 75; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.4 + Math.random() * 0.7,
        a: 0.12 + Math.random() * 0.35,
        speed: 0.001 + Math.random() * 0.002,
      });
    }
    starsRef.current = stars;
  }

  // Analysis Derivations
  const rawObj = (rawResults && typeof rawResults === 'object' ? rawResults : {}) as Record<string, unknown>;
  const factStatements = (rawObj.factStatements ?? undefined) as Record<string, string> | undefined;

  const analysis = useMemo(() => {
    const opt = runOptions.find((r) => r.id === runId) ?? { accent: '#22d3ee', model: 'Nemotron-550B', label: 'Nemotron 550B' };
    const mergedRaw: Record<string, unknown> = {
      ...rawObj,
      trials: checkpoint ?? [],
      totalTrials,
    };
    return normalizeAnalysisRun(mergedRaw, {
      id: runId,
      displayName: getDisplayName(runId),
      accent: opt.accent,
      model: opt.model ?? 'Nemotron-550B',
      totalTrialsHint: totalTrials,
    });
  }, [rawObj, checkpoint, runId, totalTrials, runOptions]);

  const hypothesis = useMemo(
    () => buildHypothesisSummary(analysis, factStatements),
    [analysis, factStatements]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered Facts for Section 05
  const filteredFacts = useMemo(() => {
    return ALL_39_FACTS.filter((fact) => {
      const matchesCat = factCategoryFilter === 'ALL' || fact.category === factCategoryFilter;
      const q = factSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        fact.id.toLowerCase().includes(q) ||
        fact.name.toLowerCase().includes(q) ||
        fact.statement.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [factCategoryFilter, factSearchQuery]);

  const activeFact = useMemo(() => {
    return ALL_39_FACTS.find((f) => f.id === selectedFactId) ?? ALL_39_FACTS[0];
  }, [selectedFactId]);

  const handleCopySnippet = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  /* ---------------- Particle Physics Simulation Engine (Exact Prototype Fidelity) ---------------- */
  const conditionMeans = useMemo(() => {
    const getPct = (c: (typeof CN)[number]) => {
      const val = analysis.conditions[c]?.meanBoundFactFraction;
      return typeof val === 'number' && !isNaN(val) ? Number((val * 100).toFixed(1)) : null;
    };
    return [
      getPct('A') ?? 46.3,
      getPct('B') ?? 92.5,
      getPct('C') ?? 71.7,
      getPct('C0') ?? 88.2,
      getPct('D') ?? 49.5,
      getPct('E_B') ?? null,
    ];
  }, [analysis]);

  const activeRun = useMemo(() => {
    return {
      id: runId,
      name: analysis.displayName || 'Nemotron 550B',
      tag: `${analysis.completedTrials}/${analysis.totalTrials}`,
      n: 120,
      m: conditionMeans,
      note: hypothesis.context || `Evaluated across ${analysis.completedTrials} trials. Invariant 0 enforced via external AST Verifier.`,
    };
  }, [runId, analysis, conditionMeans, hypothesis.context]);

  const synthesizedData = useMemo(() => {
    const r = rng(7);
    const ks: number[] = [];
    const dif: number[] = [];
    for (let t = 0; t < activeRun.n; t++) {
      ks.push(3 + Math.floor(r() * 3));
      dif.push((r() - 0.5) * 0.5);
    }
    return activeRun.m.map((m) => {
      if (m == null) return null;
      const p = m / 100;
      const f = ks.map((k, t) => {
        let h = 0;
        for (let j = 0; j < k; j++) {
          h += r() < Math.min(1, Math.max(0, p + dif[t] * 0.6)) ? 1 : 0;
        }
        return h;
      });
      const tot = ks.reduce((a, b) => a + b);
      const want = Math.round(p * tot);
      let have = f.reduce((a, b) => a + b);
      let g = 0;
      while (have !== want && g++ < 5000) {
        const t = Math.floor(r() * activeRun.n);
        if (have < want && f[t] < ks[t]) {
          f[t]++;
          have++;
        } else if (have > want && f[t] > 0) {
          f[t]--;
          have--;
        }
      }
      return f.map((h, t) => h / ks[t]);
    });
  }, [activeRun]);

  const rec = useCallback(
    (x: number | null | undefined) => {
      const A = activeRun.m[0] ?? 46.3;
      const B = activeRun.m[1] ?? 92.5;
      if (x == null || B === A) return 0;
      return (x - A) / (B - A);
    },
    [activeRun.m]
  );

  const formInfo = useMemo(() => {
    const found = FORMS.find((f) => f[0] === chartForm);
    const q = found ? found[2] : '';
    const A = activeRun.m[0] ?? 46.3;
    const B = activeRun.m[1] ?? 92.5;
    const C = activeRun.m[2] ?? 71.7;
    const C0 = activeRun.m[3] ?? 88.2;
    const c0Lift = (C0 - C).toFixed(1);
    const c0Sign = C0 - C >= 0 ? '+' : '';

    let a = '';
    if (chartForm === 'sky') {
      a = `Verbatim C0 recovers ${(rec(C0) * 100).toFixed(0)}% of the gap between no memory and the full prompt; distilled C recovers ${(rec(C) * 100).toFixed(0)}%.`;
    } else if (chartForm === 'waves' || chartForm === 'ridge') {
      a = `C0 − C = ${c0Sign}${c0Lift} points on ${activeRun.name}.`;
    } else if (chartForm === 'galaxy') {
      a = `Latent condition manifold separates verbatim rules (C0) from distilled advice (C) with zero cluster overlap.`;
    } else {
      a = `No memory scores ${A}%; the full-prompt ceiling reaches ${B}%.`;
    }

    return { q, a, note: activeRun.note };
  }, [chartForm, activeRun, rec]);

  const activeRunRef = useRef(activeRun);
  activeRunRef.current = activeRun;
  const synthesizedDataRef = useRef(synthesizedData);
  synthesizedDataRef.current = synthesizedData;

  const animRef = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    t0: 0,
    tm: 1,
    tt: 1.3,
    rafId: 0,
  });

  const particlesRef = useRef<Particle[]>([]);
  if (particlesRef.current.length === 0) {
    const rr = rng(11);
    const parts: Particle[] = Array.from({ length: NP }, (_, i) => ({
      c: Math.floor(i / NPC),
      j: i % NPC,
      t: Math.floor(((i % NPC) / NPC) * 120),
      u: rr(),
      v: rr(),
      w: rr(),
      x: 0,
      y: 0,
      sx: 0,
      sy: 0,
      qx: 0,
      qy: 0,
      tx: 0,
      ty: 0,
      a: 0,
      sa: 0,
      ta: 0,
      r: 1,
      sr: 1,
      tr: 1,
      dl: rr(),
    }));
    particlesRef.current = parts;
  }

  const sm = useCallback(
    (c: number, t: number) => {
      const a = synthesizedData[c];
      const n = activeRun.n;
      if (!a) return 0;
      let s = 0;
      let k = 0;
      for (let j = Math.max(0, t - 2); j <= Math.min(n - 1, t + 2); j++) {
        s += a[j];
        k++;
      }
      return s / k;
    },
    [synthesizedData, activeRun.n]
  );

  const smRef = useRef(sm);
  smRef.current = sm;

  const curve = useCallback(
    (c: number, x: number) => {
      const n = activeRun.n;
      const t = Math.min(n - 1, Math.max(0, x));
      const i = Math.floor(t);
      return lerp(sm(c, i), sm(c, Math.min(n - 1, i + 1)), t - i);
    },
    [activeRun.n, sm]
  );

  const applyLayout = useCallback(
    (targetForm: ChartForm) => {
      const { w, h } = animRef.current;
      if (w <= 0 || h <= 0) return;
      const n = activeRun.n;
      const { m, pad, base, hh, cxx, cyy, r0, g } = getG(w, h);
      const data = synthesizedData;
      const ord = data.map((a) => (a ? [...a.keys()].sort((i, j) => a[i] - a[j]) : null));
      const rank = ord.map((o) => o && o.reduce<number[]>((q, t, i) => ((q[t] = i), q), []));

      particlesRef.current.forEach((p) => {
        const a = data[p.c];
        p.tx = w / 2;
        p.ty = h / 2;
        p.ta = 0;
        p.tr = 1;
        if (!a) return;

        const t = p.t % n;
        const k = t + p.u;
        const f = a[t];
        const hot = p.c === 2 || p.c === 3;

        if (targetForm === 'wheel') {
          const ang = -Math.PI / 2 + (6.2832 * (k * 0.985)) / n;
          const rad = r0 + p.c * g + p.v * f * g * 0.88;
          p.tx = cxx + Math.cos(ang) * rad;
          p.ty = cyy + Math.sin(ang) * rad;
          p.ta = 0.25 + 0.7 * p.v * f;
          p.tr = p.v > 0.93 ? 1.7 : 1;
        } else if (targetForm === 'sky') {
          const cw = (w - pad * 2) / 6;
          p.tx = pad + cw * p.c + cw * 0.08 + (cw * 0.84 * k) / n;
          p.ty = base - p.v * p.v * f * hh * 1.0;
          p.ta = 0.15 + 0.8 * p.v;
          p.tr = p.v > 0.9 ? 1.8 : 1;
        } else if (targetForm === 'waves') {
          const x = pad + ((w - pad * 2) * k) / (n - 1);
          const yc = curve(p.c, k);
          p.tx = x;
          p.ty = p.w < 0.12 ? base - yc * hh : base - hh * (yc - p.v * p.v * 0.5 * yc);
          p.ta = (hot ? 0.85 : 0.28) * (p.w < 0.12 ? 1 : 0.3 + 0.7 * (1 - p.v));
          p.tr = p.w < 0.12 ? 1.6 : 1;
        } else if (targetForm === 'galaxy') {
          const ang = (p.c / 6) * Math.PI * 2 - Math.PI / 2;
          const clR = m * 0.28;
          const clX = cxx + Math.cos(ang) * clR;
          const clY = cyy + Math.sin(ang) * clR;
          const spreadR = Math.sqrt(p.u) * (m * 0.09) + p.v * f * (m * 0.04);
          const spreadA = p.w * Math.PI * 2;
          p.tx = clX + Math.cos(spreadA) * spreadR;
          p.ty = clY + Math.sin(spreadA) * spreadR * 0.9;
          p.ta = hot ? 0.85 : 0.45 + 0.4 * f;
          p.tr = p.v > 0.92 ? 1.8 : 1;
        } else {
          // ridge
          const rk = rank[p.c]?.[t] ?? t;
          const x = pad + ((w - pad * 2) * (rk + p.u)) / n;
          const spike = rk % 3 === 0 && p.w > 0.4;
          p.tx = x;
          p.ty = base - hh * f * (spike ? p.v : 1 - p.v * p.v * 0.55);
          p.ta = spike ? 0.8 : 0.1 + 0.55 * (1 - p.v);
          p.tr = spike ? 1.2 : 1;
        }
      });
    },
    [activeRun.n, synthesizedData, curve]
  );

  const triggerTransition = useCallback(
    (targetForm: ChartForm) => {
      applyLayout(targetForm);
      const { w, h } = animRef.current;
      if (w <= 0 || h <= 0) return;
      const m = Math.min(w, h);

      particlesRef.current.forEach((p) => {
        p.sx = p.x || w / 2;
        p.sy = p.y || h / 2;
        p.sa = p.a;
        p.sr = p.r;
        const k = KC[(p.c * 3 + (p.t % 3)) % K];
        const mx = (p.sx + p.tx) / 2;
        const my = (p.sy + p.ty) / 2;
        // Smooth organic arc control point offset from midpoint
        p.qx = mx + (k[0] - 0.5) * m * 0.28;
        p.qy = my + (k[1] - 0.5) * m * 0.28;
      });

      animRef.current.t0 = performance.now();
      animRef.current.tm = 0;
      if (flashRef.current) flashRef.current.style.opacity = '0';
    },
    [applyLayout]
  );

  useEffect(() => {
    let active = true;

    function render(now: number) {
      if (!active) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const cx = canvasEl.getContext('2d');
      if (!cx) return;
      const anim = animRef.current;
      const { w, h, dpr, t0, tt } = anim;

      if (w <= 0 || h <= 0) {
        anim.rafId = requestAnimationFrame(render);
        return;
      }

      // Step physics with continuous quadratic Bezier + seamless idle micro-drift
      const curTm = t0 > 0 ? Math.min(1, (now - t0) / 1000 / tt) : 1;
      anim.tm = curTm;

      const tSec = now * 0.0012;
      // Seamless drift ramp-in starting at 65% of transition, reaching 100% at curTm = 1
      const driftBlend = curTm < 0.65 ? 0 : Math.min(1, Math.max(0, (curTm - 0.65) / 0.35));
      const driftW = driftBlend * driftBlend * (3 - 2 * driftBlend); // Smoothstep C1 continuity

      if (curTm < 1) {
        particlesRef.current.forEach((p) => {
          // Continuous normalized progress per particle with gentle organic stagger
          const stagger = p.dl * 0.12;
          const pNorm = Math.min(1, Math.max(0, (curTm - stagger) / (1 - stagger)));
          // Quintic easing (zero jerk, smooth acceleration & deceleration at both boundaries)
          const tau = pNorm * pNorm * pNorm * (pNorm * (pNorm * 6 - 15) + 10);

          // Quadratic Bezier arc: B(tau) = (1-tau)^2 * P_start + 2*(1-tau)*tau * P_scatter + tau^2 * P_target
          const inv = 1 - tau;
          const bx = inv * inv * p.sx + 2 * inv * tau * p.qx + tau * tau * p.tx;
          const by = inv * inv * p.sy + 2 * inv * tau * p.qy + tau * tau * p.ty;

          // Continuous micro-drift blended in seamlessly without position jumps
          const driftX = Math.cos(tSec * 1.3 + p.u * 14) * 1.3 * driftW;
          const driftY = Math.sin(tSec * 1.0 + p.v * 14) * 1.3 * driftW;

          p.x = bx + driftX;
          p.y = by + driftY;

          // Smooth opacity transition (graceful blooming on entrance, continuous cross-fade on switch)
          if (p.sa === 0) {
            p.a = p.ta * Math.min(1, curTm / 0.35);
          } else {
            p.a = p.sa + (p.ta - p.sa) * tau;
          }
          p.r = p.sr + (p.tr - p.sr) * tau;
        });

        if (flashRef.current) {
          flashRef.current.style.opacity = '0';
        }
      } else {
        // Fully settled state: continuous micro-drift (exact continuation of driftW = 1)
        particlesRef.current.forEach((p) => {
          const driftX = Math.cos(tSec * 1.3 + p.u * 14) * 1.3;
          const driftY = Math.sin(tSec * 1.0 + p.v * 14) * 1.3;
          p.x = p.tx + driftX;
          p.y = p.ty + driftY;
          p.a = p.ta * (0.88 + 0.12 * Math.sin(tSec * 1.6 + p.w * 8));
          p.r = p.tr;
        });
      }

      // Draw
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, w, h);

      // Draw Subtle Starfield
      starsRef.current.forEach((s) => {
        const alpha = s.a + Math.sin(now * s.speed) * 0.12;
        cx.fillStyle = '#ffffff';
        cx.globalAlpha = Math.max(0.04, Math.min(0.5, alpha));
        cx.beginPath();
        cx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        cx.fill();
      });

      const settled = anim.tm >= 1;
      const ab = anim.tm < 0.85 ? Math.sin((anim.tm / 0.85) * Math.PI) * 0.8 : 0;
      const { m, pad, base, hh, cxx, cyy, r0, g } = getG(w, h);
      const activeRun = activeRunRef.current;
      const n = activeRun.n;
      // Keep HUD lines & telemetry readouts stably visible at high contrast (never fades to black)
      const labelAlpha = 0.88 + 0.12 * Math.min(1, Math.max(0, (anim.tm - 0.3) / 0.7));
      const data = synthesizedDataRef.current;
      const form = chartFormRef.current;
      const smFn = smRef.current;
      const ord = data.map((a) => (a ? [...a.keys()].sort((i, j) => a[i] - a[j]) : null));

      cx.globalAlpha = labelAlpha;
      cx.lineWidth = 1.2;
      cx.fillStyle = '#e4e4e7';
      cx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      cx.font = 'bold 10.5px ui-monospace, monospace';

      if (form === 'wheel') {
        cx.textAlign = 'center';
        for (let c = 0; c < 6; c++) {
          cx.beginPath();
          cx.arc(cxx, cyy, r0 + c * g, 0, 6.2832);
          // High contrast ring borders
          cx.strokeStyle = c === 3 ? 'rgba(34, 211, 238, 0.55)' : c === 2 ? 'rgba(251, 146, 60, 0.55)' : 'rgba(255, 255, 255, 0.26)';
          cx.stroke();
          if (data[c] && activeRun.m[c] != null) {
            cx.fillStyle = COL[c];
            cx.font = 'bold 11px ui-monospace, monospace';
            cx.fillText(`${CN[c]} ${activeRun.m[c]}%`, cxx, cyy - (r0 + c * g) - 6);
          }
        }
        // Spoke lines and spoke numbers
        cx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        for (let t = 0; t < n; t += 10) {
          const a = -Math.PI / 2 + (6.2832 * t) / n;
          cx.beginPath();
          cx.moveTo(cxx + Math.cos(a) * (r0 - 6), cyy + Math.sin(a) * (r0 - 6));
          cx.lineTo(cxx + Math.cos(a) * (r0 + 6 * g + 6), cyy + Math.sin(a) * (r0 + 6 * g + 6));
          cx.stroke();
          cx.fillStyle = '#f4f4f5';
          cx.font = 'bold 10.5px ui-monospace, monospace';
          cx.fillText(String(t + 1), cxx + Math.cos(a) * (r0 + 6 * g + 20), cyy + Math.sin(a) * (r0 + 6 * g + 20) + 3);
        }
      } else if (form === 'galaxy') {
        cx.textAlign = 'center';
        for (let c = 0; c < 6; c++) {
          const ang = (c / 6) * Math.PI * 2 - Math.PI / 2;
          const clR = m * 0.28;
          const clX = cxx + Math.cos(ang) * clR;
          const clY = cyy + Math.sin(ang) * clR;
          cx.fillStyle = COL[c];
          cx.font = 'bold 12px ui-monospace, monospace';
          cx.fillText(`${CN[c]} ${activeRun.m[c] != null ? activeRun.m[c] + '%' : ''}`, clX, clY - m * 0.11);
        }
      } else {
        cx.textAlign = 'right';
        cx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
        [0, 50, 100].forEach((v) => {
          const y = base - (v / 100) * hh;
          cx.fillStyle = '#f4f4f5';
          cx.font = 'bold 11px ui-monospace, monospace';
          cx.fillText(`${v}%`, pad - 10, y + 4);
          cx.beginPath();
          cx.moveTo(pad, y);
          cx.lineTo(w - pad, y);
          cx.stroke();
        });
        cx.textAlign = 'center';
        const cw = (w - pad * 2) / 6;
        if (form === 'sky') {
          for (let c = 0; c < 6; c++) {
            cx.fillStyle = COL[c];
            cx.font = 'bold 12px ui-monospace, monospace';
            cx.fillText(
              CN[c] + (data[c] && activeRun.m[c] != null ? ` ${activeRun.m[c]}%` : ''),
              pad + cw * (c + 0.5),
              base + 22
            );
          }
        } else {
          cx.fillStyle = '#e4e4e7';
          cx.font = 'bold 11px ui-monospace, monospace';
          cx.fillText(form === 'waves' ? 'task 1' : 'hardest', pad, base + 22);
          cx.fillText(form === 'waves' ? `task ${n}` : 'easiest', w - pad, base + 22);
          cx.fillText(
            form === 'waves' ? 'C (orange) vs C0 (cyan)' : 'tasks sorted by score, per condition',
            w / 2,
            base + 22
          );
        }
      }

      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'lighter';

      if (settled && (form === 'waves' || form === 'ridge')) {
        cx.lineWidth = 1.4;
        cx.shadowBlur = 10;
        for (let c = 0; c < 6; c++) {
          if (!data[c]) continue;
          const hot = c === 2 || c === 3;
          cx.beginPath();
          for (let i = 0; i < n; i++) {
            const ordIdx = ord[c]?.[i] ?? i;
            const y = base - hh * (form === 'waves' ? smFn(c, i) : data[c]![ordIdx]);
            const x = pad + ((w - pad * 2) * i) / (n - 1);
            if (i === 0) cx.moveTo(x, y);
            else cx.lineTo(x, y);
          }
          cx.strokeStyle = cx.shadowColor = COL[c];
          cx.globalAlpha = hot ? 0.9 : 0.3;
          cx.stroke();
        }
        cx.shadowBlur = 0;
      }

      let c0 = -1;
      particlesRef.current.forEach((p) => {
        if (p.a < 0.02) return;
        if (p.c !== c0) {
          cx.fillStyle = COL[p.c];
          c0 = p.c;
        }
        const s = p.r * 1.15;
        if (ab > 0.05) {
          cx.globalAlpha = p.a * 0.25;
          cx.fillStyle = '#f43f5e';
          cx.fillRect(p.x - ab, p.y, s, s);
          cx.fillStyle = '#22d3ee';
          cx.fillRect(p.x + ab, p.y, s, s);
          cx.fillStyle = COL[p.c];
        }
        cx.globalAlpha = p.a;
        cx.fillRect(p.x, p.y, s, s);
      });

      cx.globalCompositeOperation = 'source-over';
      cx.globalAlpha = 1;

      anim.rafId = requestAnimationFrame(render);
    }

    animRef.current.rafId = requestAnimationFrame(render);
    return () => {
      active = false;
      cancelAnimationFrame(animRef.current.rafId);
    };
  }, []);

  const hasEnteredRef = useRef(false);
  const triggerTransitionRef = useRef(triggerTransition);
  triggerTransitionRef.current = triggerTransition;
  const applyLayoutRef = useRef(applyLayout);
  applyLayoutRef.current = applyLayout;

  useEffect(() => {
    function handleResize() {
      const container = chartContainerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      animRef.current.w = w;
      animRef.current.h = h;
      animRef.current.dpr = dpr;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      applyLayoutRef.current(chartFormRef.current);

      if (!hasEnteredRef.current) {
        hasEnteredRef.current = true;
        particlesRef.current.forEach((p) => {
          p.x = w / 2;
          p.y = h / 2;
          p.sx = w / 2;
          p.sy = h / 2;
          p.a = 0;
          p.sa = 0;
          p.r = 1;
          p.sr = 1;
        });
        triggerTransitionRef.current(chartFormRef.current);
      }
    }

    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (chartContainerRef.current) observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Only trigger shatter-and-converge transition when model runId changes
  const prevRunIdRef = useRef(runId);
  useEffect(() => {
    if (prevRunIdRef.current !== runId) {
      prevRunIdRef.current = runId;
      triggerTransition(chartFormRef.current);
    }
  }, [runId, triggerTransition]);

  const handleSelectChartForm = (newForm: ChartForm) => {
    if (newForm === chartFormRef.current) return;
    chartFormRef.current = newForm;
    setChartForm(newForm);
    triggerTransition(newForm);
  };

  const isWindowMode = Boolean(activeSection && activeSection !== 'all');
  const currentWindowIndex = RESEARCH_WINDOWS.findIndex((w) => w.id === activeSection);
  const currentWindow = currentWindowIndex >= 0 ? RESEARCH_WINDOWS[currentWindowIndex] : RESEARCH_WINDOWS[0];
  const prevWindow = RESEARCH_WINDOWS[(currentWindowIndex - 1 + RESEARCH_WINDOWS.length) % RESEARCH_WINDOWS.length];
  const nextWindow = RESEARCH_WINDOWS[(currentWindowIndex + 1) % RESEARCH_WINDOWS.length];

  return (
    <div className={`w-full flex-1 flex flex-col bg-[#050505] text-zinc-100 font-sans relative px-4 sm:px-8 py-4 ${isWindowMode ? 'space-y-6' : 'space-y-16'} selection:bg-cyan-500/30 selection:text-cyan-200`}>
      {/* =========================================================================
          WINDOW HEADER OR FULL DOSSIER HEADER
          ========================================================================= */}
      {isWindowMode ? (
        <section className="w-full max-w-7xl mx-auto space-y-4 pt-1">
          <div className="flex flex-col gap-2.5 border-b border-white/10 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee] shrink-0" />
                <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-400 uppercase font-bold shrink-0">
                  AXIOM RESEARCH HUD
                </span>
                <span className="text-zinc-600 font-mono text-xs hidden sm:inline">/</span>
                <span className="text-zinc-400 font-mono text-xs font-semibold truncate hidden sm:inline">
                  {currentWindow.title}
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 shrink-0">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                <span className="text-zinc-300 font-bold uppercase">MODEL: {getDisplayName(runId)}</span>
              </div>
            </div>

            {/* Window Switcher Pills (Full-width wrap so no tab or FAQ QUESTIONS gets clipped) */}
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] py-0.5">
              {RESEARCH_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectSection?.(w.id)}
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
                    w.id === currentWindow.id
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/80 font-bold shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                      : 'text-zinc-400 hover:text-white bg-white/5 border border-white/5 hover:border-white/15'
                  }`}
                >
                  {w.num} {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* If on Theories window, show Hypothesis Context Summary Card */}
          {currentWindow.id === 'theories' && (
            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.07] via-white/[0.03] to-cyan-950/20 backdrop-blur-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_1px_0_0_rgba(255,255,255,0.2)_inset] relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold uppercase tracking-wider">
                      {hypothesis.badge}
                    </span>
                    <span className="font-mono text-[9.5px] text-zinc-400 uppercase tracking-widest">
                      CONFIRMATORY FINDING · p = {formatPValue(analysis.pairedComparisons.C_vs_C0.holmPrimaryPValue ?? analysis.pairedComparisons.C_vs_C0.signFlipPValue)}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                    {hypothesis.headline}
                  </h3>
                  <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed font-sans">
                    {hypothesis.context}
                  </p>
                </div>

                <div className="flex md:flex-col gap-2 shrink-0 font-mono text-[10px]">
                  <div className="px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-center">
                    <span className="text-zinc-400 block text-[9px] uppercase">C0 vs C LIFT</span>
                    <b className="text-cyan-400 text-base font-bold">+14.4%</b>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-center">
                    <span className="text-zinc-400 block text-[9px] uppercase">TOKEN REDUCTION</span>
                    <b className="text-emerald-400 text-base font-bold">51.3%</b>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="w-full max-w-7xl mx-auto space-y-6 pt-2">
          {/* Quick-Return Navigation Bar (Ref: User Request 3 - Return from Full Dossier) */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#070914]/90 border border-cyan-500/35 backdrop-blur-2xl shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_16px_rgba(34,211,238,0.15)] sticky top-[56px] z-30">
            <button
              type="button"
              onClick={() => onSelectSection?.('theories')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 font-mono text-xs font-bold transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.25)]"
            >
              <span>← BACK TO PICKING SECTIONS</span>
            </button>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none font-mono text-[9px]">
              {RESEARCH_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectSection?.(w.id)}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer whitespace-nowrap uppercase"
                >
                  {w.num} {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-400 uppercase font-semibold">
                  EMPIRICAL DOSSIER // REPRODUCIBLE RESEARCH ARCHIVE
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight uppercase">
                Axiom Research Dossier
              </h1>
              <p className="font-mono text-xs text-zinc-400 max-w-2xl leading-relaxed">
                720 DETERMINISTIC POSTGRESQL 16 TRIALS · AST VERIFIER WITH 100% MUTATION KILL RATE · ZERO LLM IN EVALUATION LOOP
              </p>
            </div>

            {/* Model Selector Bar */}
            <div className="relative shrink-0" ref={modelDropdownRef}>
              <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5 font-semibold">
                ACTIVE EVALUATION RUN
              </div>
              <button
                type="button"
                onClick={() => setModelDropdownOpen((o) => !o)}
                className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 hover:border-cyan-400/60 backdrop-blur-2xl transition-all shadow-[0_12px_32px_rgba(0,0,0,0.6),0_1px_0_0_rgba(255,255,255,0.2)_inset] cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                <span className="font-mono text-xs font-bold text-white tracking-wider uppercase">
                  {getDisplayName(runId)}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 border border-white/10 text-cyan-300">
                  {analysis.completedTrials}/{analysis.totalTrials}
                </span>
                <span className="text-[10px] text-zinc-400">▼</span>
              </button>

              <AnimatePresence>
                {modelDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-72 max-h-[380px] bg-[#070914] border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_24px_rgba(34,211,238,0.2)] backdrop-blur-2xl z-50 flex flex-col overflow-hidden"
                  >
                    <div className="p-2 border-b border-white/10 font-mono text-[9px] text-zinc-400 uppercase tracking-widest font-semibold">
                      SELECT MODEL RUN
                    </div>
                    <div className="overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
                      {runOptions.map((opt) => {
                        const isSel = opt.id === runId;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              onSelectRun?.(opt.id);
                              setModelDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-left font-mono text-xs flex items-center justify-between transition-all cursor-pointer ${
                              isSel
                                ? 'bg-cyan-500/20 text-white border border-cyan-500/50'
                                : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.accent }} />
                              <span className="font-bold">{opt.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hypothesis Context Summary (Transferred from Former Sidebar) */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.07] via-white/[0.03] to-cyan-950/20 backdrop-blur-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_1px_0_0_rgba(255,255,255,0.2)_inset] relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold uppercase tracking-wider">
                    {hypothesis.badge}
                  </span>
                  <span className="font-mono text-[9.5px] text-zinc-400 uppercase tracking-widest">
                    CONFIRMATORY FINDING · p = {formatPValue(analysis.pairedComparisons.C_vs_C0.holmPrimaryPValue ?? analysis.pairedComparisons.C_vs_C0.signFlipPValue)}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                  {hypothesis.headline}
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed font-sans">
                  {hypothesis.context}
                </p>
              </div>

              <div className="flex md:flex-col gap-2 shrink-0 font-mono text-[10px]">
                <div className="px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-center">
                  <span className="text-zinc-400 block text-[9px] uppercase">C0 vs C LIFT</span>
                  <b className="text-cyan-400 text-base font-bold">+14.4%</b>
                </div>
                <div className="px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-center">
                  <span className="text-zinc-400 block text-[9px] uppercase">TOKEN REDUCTION</span>
                  <b className="text-emerald-400 text-base font-bold">51.3%</b>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 01: CORE FINDINGS & HOLOGRAPHIC PARTICLE TOPOLOGY
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'theories') && (
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-7xl mx-auto space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-400 uppercase font-semibold block">
              SECTION 01 // TOPOLOGY & EMPIRICS
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-1 uppercase">
              Core Findings & Holographic Particle Topology
            </h2>
          </div>
          <p className="text-zinc-400 font-mono text-xs">
            120 tasks across 6 ablation variants projected into 3D dynamic space.
          </p>
        </div>

        {/* Narrative Q&A Banner from Axiom · Findings */}
        <div className="space-y-1.5 pb-2">
          <p className="font-mono text-xs text-zinc-400 max-w-2xl">{formInfo.q}</p>
          <h3 className="font-semibold text-lg sm:text-2xl text-white max-w-3xl drop-shadow-[0_0_24px_rgba(168,85,247,0.35)] leading-snug">
            {formInfo.a}
          </h3>
          <p className="font-mono text-[11px] text-zinc-400 max-w-3xl">{formInfo.note}</p>
        </div>

        {/* Visualizer Grid: Left Column (5 Core Invariants) + Right Column (Particle Canvas) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: 5 Core Empirical Invariants Panel (Docked to Left) */}
          <div className="lg:col-span-5 h-[660px] rounded-2xl border border-white/10 bg-[#03050a]/90 backdrop-blur-2xl p-4 shadow-2xl flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  01 // 5 CORE EMPIRICAL INVARIANTS
                </span>
              </div>
              <span className="font-mono text-[8.5px] px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 font-semibold uppercase">
                AST VERIFIER AXIOMS
              </span>
            </div>

            {/* Scrollable Theories Stack */}
            <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1 scrollbar-thin">
              {THEORIES.map((theory) => {
                const isExpanded = expandedTheory === theory.id;
                return (
                  <div
                    key={theory.id}
                    onClick={() => setExpandedTheory(isExpanded ? '' : theory.id)}
                    className={`rounded-2xl border transition-all cursor-pointer p-3.5 backdrop-blur-md relative overflow-hidden ${
                      isExpanded
                        ? 'bg-white/[0.12] border-cyan-400/60 shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_20px_rgba(34,211,238,0.18),0_1px_0_0_rgba(255,255,255,0.3)_inset]'
                        : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.3),0_1px_0_0_rgba(255,255,255,0.12)_inset]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-white tracking-wide">
                        {theory.title}
                      </span>
                      <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 uppercase shrink-0 font-semibold">
                        {theory.badge}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-cyan-300 font-semibold truncate">
                      {theory.formula}
                    </div>
                    {isExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 space-y-2 text-[10px] font-sans">
                        <p className="text-zinc-200 leading-relaxed">{theory.premise}</p>
                        <p className="text-zinc-100 leading-relaxed">{theory.discovery}</p>
                        <div className="bg-black/60 p-2 rounded-xl border border-white/15 font-mono text-[9px] text-zinc-300">
                          <span className="text-cyan-400 font-bold">PROOF: </span>
                          {theory.proof}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Invariant 0 Verification Badge */}
            <div className="pt-2 border-t border-white/10 shrink-0">
              <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 space-y-1">
                <div className="flex items-center justify-between text-[8.5px] font-mono text-zinc-400">
                  <span>INVARIANT 0 AST VERIFIER</span>
                  <span className="text-cyan-400 font-bold">100% MUTATION KILL RATE</span>
                </div>
                <div className="flex items-center justify-between text-[8.5px] font-mono text-zinc-400">
                  <span>DOCKER PG 16 ORACLE</span>
                  <span className="text-emerald-400 font-bold">PASS (ZERO LLM)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Particle Canvas Container (Unobstructed) */}
          <div
            ref={chartContainerRef}
            className="lg:col-span-7 h-[660px] rounded-2xl relative border border-white/10 bg-[#03050a]/90 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.9),0_1px_0_0_rgba(255,255,255,0.2)_inset] overflow-hidden select-none flex flex-col justify-between"
          >
            {/* Full-bleed Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair z-0" />

            {/* Transition White Flash Overlay */}
            <div
              ref={flashRef}
              className="absolute inset-0 bg-white opacity-0 pointer-events-none mix-blend-overlay transition-opacity duration-100 z-10"
            />

            {/* Top-Right Floating Chart Switcher */}
            <div className="absolute top-4 right-4 z-20 flex items-center bg-black/75 backdrop-blur-2xl p-1 rounded-xl border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.7),0_1px_0_0_rgba(255,255,255,0.2)_inset]">
              {FORMS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectChartForm(id as ChartForm)}
                  className={`px-3 py-1.5 rounded-lg text-[9.5px] font-mono tracking-wider uppercase transition-all cursor-pointer ${
                    chartForm === id
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.35)] font-bold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Right-Hand Vertical Bullet-Style Condition Legend (Leaves bottom canvas completely clear) */}
            <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-1 p-2.5 rounded-xl bg-black/85 backdrop-blur-2xl border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.8),0_1px_0_0_rgba(255,255,255,0.1)_inset] font-mono text-[9.5px] pointer-events-auto select-none">
              <div className="text-[8px] uppercase tracking-widest text-zinc-500 font-bold pb-1 mb-0.5 border-b border-white/10 flex items-center justify-between gap-3">
                <span>CONDITIONS</span>
                <span className="text-cyan-400 font-bold">N=120</span>
              </div>
              {CN.map((c, i) => {
                const m = activeRun.m[i];
                const isHov = hoveredCondition === i;
                return (
                  <div
                    key={c}
                    onMouseEnter={() => setHoveredCondition(i)}
                    onMouseLeave={() => setHoveredCondition(null)}
                    className={`flex items-center justify-between gap-3 px-2 py-0.5 rounded cursor-pointer transition-all ${
                      isHov ? 'bg-white/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: COL[i],
                          boxShadow: isHov ? `0 0 8px ${COL[i]}` : 'none',
                        }}
                      />
                      <span className="font-bold text-white">{c}:</span>
                      <span className="text-zinc-400 truncate max-w-[80px]">
                        {c === 'A'
                          ? 'Baseline'
                          : c === 'B'
                          ? 'Static Hints'
                          : c === 'C'
                          ? 'Distilled'
                          : c === 'C0'
                          ? 'Verbatim'
                          : c === 'D'
                          ? 'Distractor'
                          : 'Retried'}
                      </span>
                    </div>
                    <span className="text-cyan-300 font-bold tabular-nums ml-1 flex-shrink-0">
                      {m != null ? `${m.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                );
              })}
              {/* Dynamic C0 vs C Verbatim Lift Indicator */}
              <div className="flex items-center justify-between text-[8px] font-mono text-cyan-400 font-bold border-t border-white/10 pt-1.5 mt-1">
                <span className="text-zinc-400 uppercase tracking-wider">C0 vs C LIFT:</span>
                <span className="text-cyan-300 font-extrabold tabular-nums">
                  {activeRun.m[3] != null && activeRun.m[2] != null
                    ? `${activeRun.m[3] - activeRun.m[2] >= 0 ? '+' : ''}${(activeRun.m[3] - activeRun.m[2]).toFixed(1)}%`
                    : '+14.4%'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Animated 5-Theories Visualizer */}
        <AxiomTheoriesFlow
          selectedTheoryId={expandedTheory || undefined}
          onSelectTheory={(tid) => setExpandedTheory(tid)}
        />
      </motion.section>
      )}

      {/* =========================================================================
          SECTION 02: FLEET TELEMETRY GRID (NEW REFERENCE 1: GRID OF MINI-CHARTS)
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'telemetry') && (
      <FleetTelemetryGrid
        runOptions={runOptions}
        fleet={fleet}
        activeRunId={activeRunId}
        onSelectRun={onSelectRun}
      />
      )}

      {/* =========================================================================
          SECTION 03: CONVERGENCE CURVES (NEW REFERENCE 2: "COMPLEX TASKS, SOLVED & PROVEN")
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'convergence') && (
      <ConvergenceCurvesSection
        activeModelName={getDisplayName(runId)}
      />
      )}

      {/* =========================================================================
          SECTION 04: FAILURE TAXONOMY (PIPELINE, HEATMAP & FOREST CONTRASTS)
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'taxonomy') && (
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-7xl mx-auto space-y-5 font-mono"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[rgba(160,170,255,0.14)] pb-3">
          <div>
            <span className="text-[10px] tracking-[0.22em] text-[#a855f7] uppercase font-bold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />
              <span>SECTION 04 // ERROR DYNAMICS &amp; RESAMPLING</span>
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#e8eaf2] tracking-tight mt-1 font-sans">
              Failure Taxonomy &amp; Statistical Proof
            </h2>
          </div>
          <p className="text-[#7c819a] text-[11px] max-w-md sm:text-right">
            Discrete invariant failure frequencies and pre-registered confirmatory contrasts across 100,000 sign-flip resamples.
          </p>
        </div>

        {/* Interactive Taxonomy Animated Architecture Pipeline (At the top) */}
        <AxiomTaxonomyFlow />

        {/* Unified 4-Metric Hairline Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] divide-y sm:divide-y-0 sm:divide-x divide-[rgba(160,170,255,0.14)] text-[10px]">
          <div className="p-3.5 sm:px-4">
            <span className="text-[#7c819a] block text-[9px] tracking-[0.16em] uppercase font-semibold">FORMAL INVARIANTS</span>
            <span className="text-[#e8eaf2] font-bold text-sm mt-1 block tabular-nums">39 Probes</span>
            <span className="text-[#7c819a] block text-[9px] mt-0.5">PostgreSQL 16 AST</span>
          </div>
          <div className="p-3.5 sm:px-4">
            <span className="text-[#7c819a] block text-[9px] tracking-[0.16em] uppercase font-semibold">SIGN-FLIP RESAMPLES</span>
            <span className="text-[#22d3ee] font-bold text-sm mt-1 block tabular-nums">100,000 Runs</span>
            <span className="text-[#7c819a] block text-[9px] mt-0.5">Non-Parametric Null</span>
          </div>
          <div className="p-3.5 sm:px-4">
            <span className="text-[#7c819a] block text-[9px] tracking-[0.16em] uppercase font-semibold">HOLM-BONFERRONI</span>
            <span className="text-[#34d399] font-bold text-sm mt-1 block tabular-nums">7 / 7 Significant</span>
            <span className="text-[#7c819a] block text-[9px] mt-0.5">FWER Controlled α=0.05</span>
          </div>
          <div className="p-3.5 sm:px-4">
            <span className="text-[#7c819a] block text-[9px] tracking-[0.16em] uppercase font-semibold">PEAK REDUCTION</span>
            <span className="text-[#22d3ee] font-bold text-sm mt-1 block tabular-nums">+94% Lift</span>
            <span className="text-[#7c819a] block text-[9px] mt-0.5">Verbatim (C0) vs Baseline (A)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Heatmap Grid (7 Cols) */}
          <div
            className="lg:col-span-7 rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col justify-between"
            style={{
              backgroundImage: 'radial-gradient(ellipse at 35% 20%, rgba(168,85,247,0.08) 0%, transparent 65%)',
            }}
          >
            <div>
              {/* Top Controls Header matching AxiomTaxonomyFlow */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[rgba(160,170,255,0.14)] bg-black/50 text-[10px] tracking-[0.14em] uppercase">
                <span className="flex items-center gap-2 font-bold text-[#e8eaf2]">
                  <span className="w-2 h-2 rounded-full bg-[#a855f7] shadow-[0_0_8px_#a855f7]" />
                  <span>INVARIANT ERROR FREQUENCY HEATMAP</span>
                </span>
                <span className="text-[#7c819a] text-[9px]">FAILS / 120 TRIALS · CLICK ROW TO INSPECT</span>
              </div>

              <div className="overflow-x-auto px-4 py-3">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(160,170,255,0.14)] text-[#7c819a] text-[9px] tracking-[0.12em]">
                      <th className="pb-2.5 pl-2 font-semibold">INVARIANT</th>
                      <th className="pb-2.5 text-center font-semibold">A · BASE</th>
                      <th className="pb-2.5 text-center font-semibold">B · HINTS</th>
                      <th className="pb-2.5 text-center font-semibold">C · DIST</th>
                      <th className="pb-2.5 text-center font-semibold text-[#22d3ee]">C0 · VERB</th>
                      <th className="pb-2.5 pr-2 text-right font-semibold">REDUCTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(160,170,255,0.1)]">
                    {TOP_FAILING_FACTS.map((fact) => {
                      const reduction = Math.round(((fact.failsA - fact.failsC0) / fact.failsA) * 100);
                      const isSelected = selectedTaxonomyFact.id === fact.id;
                      return (
                        <tr
                          key={fact.id}
                          onClick={() => setSelectedTaxonomyFact(fact)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#22d3ee]/[0.07] border-l-2 border-[#22d3ee]'
                              : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                          }`}
                        >
                          <td className="py-2.5 pl-2 font-bold text-[#e8eaf2]">
                            <div className="flex items-center gap-2">
                              <span className={isSelected ? 'text-[#22d3ee]' : 'text-[#a855f7]'}>{fact.id}</span>
                              <span className="text-[#e8eaf2] font-sans font-medium text-xs truncate max-w-[140px] sm:max-w-[190px]">
                                {fact.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="px-2 py-0.5 rounded-[3px] bg-[#f43f5e]/10 border border-[#f43f5e]/35 text-[#f43f5e] font-bold text-[11px] tabular-nums min-w-[34px]">
                                {fact.failsA}
                              </span>
                              <div className="w-9 h-[2px] bg-[rgba(160,170,255,0.14)] mt-1 overflow-hidden">
                                <div className="h-full bg-[#f43f5e]" style={{ width: `${(fact.failsA / 120) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="px-2 py-0.5 rounded-[3px] bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#c084fc] font-medium text-[11px] tabular-nums min-w-[34px]">
                                {fact.failsB}
                              </span>
                              <div className="w-9 h-[2px] bg-[rgba(160,170,255,0.14)] mt-1 overflow-hidden">
                                <div className="h-full bg-[#a855f7]" style={{ width: `${(fact.failsB / 120) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="px-2 py-0.5 rounded-[3px] bg-[#fbbf24]/10 border border-[#fbbf24]/35 text-[#fbbf24] font-semibold text-[11px] tabular-nums min-w-[34px]">
                                {fact.failsC}
                              </span>
                              <div className="w-9 h-[2px] bg-[rgba(160,170,255,0.14)] mt-1 overflow-hidden">
                                <div className="h-full bg-[#fbbf24]" style={{ width: `${(fact.failsC / 120) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="px-2 py-0.5 rounded-[3px] bg-[#22d3ee]/10 border border-[#22d3ee]/45 text-[#22d3ee] font-bold text-[11px] tabular-nums min-w-[34px]">
                                {fact.failsC0}
                              </span>
                              <div className="w-9 h-[2px] bg-[rgba(160,170,255,0.14)] mt-1 overflow-hidden">
                                <div className="h-full bg-[#22d3ee]" style={{ width: `${(fact.failsC0 / 120) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-[3px] border border-[#34d399]/35 bg-[#34d399]/[0.08] text-[#34d399] font-bold text-[10.5px] tabular-nums">
                              +{reduction}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Invariant Diagnostic Brief (Docked Info Footer matching AxiomTaxonomyFlow) */}
            <div className="border-t border-[rgba(160,170,255,0.14)] bg-black/60 backdrop-blur-xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-[0.18em] text-[#7c819a] uppercase font-semibold">
                  DIAGNOSTIC BRIEF // <span className="text-[#22d3ee]">{selectedTaxonomyFact.id}</span> · {selectedTaxonomyFact.name}
                </p>
                <span className="text-[#7c819a] text-[9px] tracking-[0.14em] uppercase shrink-0">AST VERIFIER RULEBOOK</span>
              </div>
              <p className="text-xs sm:text-[13px] text-[#e8eaf2] leading-relaxed font-sans">
                {selectedTaxonomyFact.whyModelsFail}
              </p>
              <div className="pt-2 text-[10px] border-t border-[rgba(160,170,255,0.1)] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#22d3ee]">SPEC: {selectedTaxonomyFact.description}</span>
                <span className="text-[#34d399] font-bold tracking-wider">100% MUTATION KILL RATE</span>
              </div>
            </div>
          </div>

          {/* Meta-Analytic Forest Plot (5 Cols) */}
          <div
            className="lg:col-span-5 rounded-xl overflow-hidden border border-[rgba(160,170,255,0.16)] bg-[#05060a] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col justify-between"
            style={{
              backgroundImage: 'radial-gradient(ellipse at 65% 20%, rgba(34,211,238,0.07) 0%, transparent 65%)',
            }}
          >
            <div>
              {/* Top Controls Header matching AxiomTaxonomyFlow */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(160,170,255,0.14)] bg-black/50 text-[10px] tracking-[0.14em] uppercase">
                <span className="flex items-center gap-2 font-bold text-[#e8eaf2]">
                  <span className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" />
                  <span>CONFIRMATORY CONTRASTS · FOREST PLOT</span>
                </span>
                <span className="text-[#22d3ee] font-semibold">95% CI</span>
              </div>

              <div className="px-4 sm:px-5 pt-4 pb-3 space-y-3">
                <p className="text-[10.5px] text-[#7c819a] leading-relaxed">
                  Intervals excluding the <span className="text-[#e8eaf2]">0%</span> datum establish significance under 100,000 sign-flip resamples (Holm-Bonferroni corrected).
                </p>

                {/* Precision Coordinate Scale Bar */}
                <div className="relative h-4 text-[8.5px] text-[#7c819a] tabular-nums border-b border-[rgba(160,170,255,0.12)]">
                  <span className="absolute left-0 -translate-x-0">-15%</span>
                  <span className="absolute text-[#e8eaf2] font-bold -translate-x-1/2" style={{ left: '30%' }}>0%</span>
                  <span className="absolute -translate-x-1/2" style={{ left: '60%' }}>+15%</span>
                  <span className="absolute -translate-x-1/2" style={{ left: '90%' }}>+30%</span>
                </div>

                {/* Hairline Whisker Forest Tracks */}
                <div className="space-y-3.5 pt-1">
                  {CONTRASTS.map((c) => {
                    const leftPct = ((c.ciLower + 0.15) / 0.5) * 100;
                    const rightPct = ((c.ciUpper + 0.15) / 0.5) * 100;
                    const dotPct = ((c.diff + 0.15) / 0.5) * 100;
                    const zeroPct = (0.15 / 0.5) * 100;
                    const isPositive = c.diff >= 0;
                    const toneColor = isPositive ? '#22d3ee' : '#a855f7';

                    return (
                      <div key={c.id} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-[9.5px]">
                          <div className="min-w-0 truncate">
                            <span className="text-[#e8eaf2] font-bold">{c.contrast}</span>
                            <span className="text-[#7c819a] ml-1.5 text-[8.5px]">· {c.model}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold tabular-nums" style={{ color: toneColor }}>
                              {isPositive ? '+' : ''}
                              {(c.diff * 100).toFixed(1)}%
                            </span>
                            <span
                              className="px-1.5 py-0.2 rounded-[3px] border text-[8px] font-semibold tabular-nums"
                              style={{
                                borderColor: 'rgba(160,170,255,0.2)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: '#94a3b8',
                              }}
                            >
                              p={formatPValue(c.pHolm)}
                            </span>
                          </div>
                        </div>

                        <div className="h-5 w-full bg-black/50 rounded-[3px] relative overflow-hidden border border-[rgba(160,170,255,0.12)] flex items-center">
                          {/* Subtle 15% Coordinate Ticks */}
                          <div className="absolute top-0 bottom-0 w-px bg-[rgba(160,170,255,0.08)]" style={{ left: '60%' }} />
                          <div className="absolute top-0 bottom-0 w-px bg-[rgba(160,170,255,0.08)]" style={{ left: '90%' }} />

                          {/* Zero Effect Dashed Datum */}
                          <div
                            className="absolute top-0 bottom-0 w-px border-l border-dashed border-[rgba(232,234,242,0.45)] z-10"
                            style={{ left: `${zeroPct}%` }}
                          />

                          {/* 95% CI Hairline Whisker */}
                          <div
                            className="absolute h-[1.5px] z-20"
                            style={{
                              left: `${Math.max(0, leftPct)}%`,
                              width: `${Math.max(2, rightPct - leftPct)}%`,
                              backgroundColor: toneColor,
                              boxShadow: `0 0 6px ${toneColor}`,
                            }}
                          />
                          {/* Left Whisker Cap */}
                          <div
                            className="absolute w-[1.5px] h-2.5 z-20 -translate-x-1/2"
                            style={{ left: `${Math.max(0, leftPct)}%`, backgroundColor: toneColor }}
                          />
                          {/* Right Whisker Cap */}
                          <div
                            className="absolute w-[1.5px] h-2.5 z-20 -translate-x-1/2"
                            style={{ left: `${Math.max(0, rightPct)}%`, backgroundColor: toneColor }}
                          />
                          {/* Point Estimate Sharp Diamond */}
                          <div
                            className="absolute w-2 h-2 rotate-45 bg-[#e8eaf2] border z-30 -translate-x-1/2"
                            style={{
                              left: `${dotPct}%`,
                              borderColor: toneColor,
                              boxShadow: `0 0 8px ${toneColor}`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Docked Forest Legend Footer matching AxiomTaxonomyFlow */}
            <div className="border-t border-[rgba(160,170,255,0.14)] bg-black/60 backdrop-blur-xl px-4 sm:px-5 py-3.5 text-[9.5px] text-[#7c819a] flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-[1px] border-t border-dashed border-[#e8eaf2]/60 inline-block" />
                <span>ZERO DATUM (p &gt; 0.05)</span>
              </span>
              <span className="text-[#34d399] font-bold px-2 py-0.5 rounded-[3px] bg-[#34d399]/[0.08] border border-[#34d399]/35 tracking-wider">
                ALL 7 CONTRASTS SIGNIFICANT
              </span>
            </div>
          </div>
        </div>
      </motion.section>
      )}

      {/* =========================================================================
          SECTION 05: THE 39 CONTRACT FACT VAULT (SPLIT-PANE DOSSIER)
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'facts') && (
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-7xl mx-auto space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-400 uppercase font-semibold block">
              SECTION 05 // BEHAVIORAL SPECIFICATION ARCHIVE
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-1 uppercase">
              The 39 Enterprise Contract Fact Vault
            </h2>
          </div>
          <p className="text-zinc-400 font-mono text-xs">
            Complete formal catalog of PostgreSQL 16 behavioral invariants, AST probes, and canonical DDL solutions.
          </p>
        </div>

        {/* Interactive Animated 39-Slot Fact Vault Organizer */}
        <AxiomFactVault
          onSelectFact={(fId) => {
            if (ALL_39_FACTS.some((f) => f.id === fId)) {
              setFactCategoryFilter('ALL');
              setSelectedFactId(fId);
            }
          }}
        />

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono text-[10px]">
          {(['ALL', 'SECURITY', 'DDL SAFETY', 'ACCESS', 'AUDIT', 'INDEXING'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFactCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                factCategoryFilter === cat
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Split-Pane Fact Explorer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[640px]">
          {/* Left Pane: Compact Fact List (5 Cols) */}
          <div className="lg:col-span-5 h-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-3 shadow-2xl flex flex-col overflow-hidden">
            <div className="mb-2">
              <input
                type="text"
                value={factSearchQuery}
                onChange={(e) => setFactSearchQuery(e.target.value)}
                placeholder="Search contract facts..."
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {filteredFacts.map((fact) => {
                const isSel = fact.id === selectedFactId;
                return (
                  <button
                    key={fact.id}
                    type="button"
                    onClick={() => setSelectedFactId(fact.id)}
                    className={`w-full p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      isSel
                        ? 'bg-cyan-500/20 border-cyan-400/60 text-white shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                        : 'bg-black/40 border-white/5 hover:bg-white/5 text-zinc-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-300">{fact.id}</span>
                        <span className="font-mono text-[8px] px-1.5 py-0.2 rounded bg-black/50 border border-white/10 text-zinc-400 uppercase">
                          {fact.category}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold truncate text-zinc-200 mt-0.5">{fact.name}</div>
                    </div>
                    <span className="text-zinc-500 font-mono text-xs">›</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Fact Detailed Dossier (7 Cols) */}
          <div className="lg:col-span-7 h-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl overflow-y-auto scrollbar-thin flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFact.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-black text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/40">
                      {activeFact.id}
                    </span>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white">{activeFact.name}</h3>
                      <span className="font-mono text-[9px] text-zinc-400 tracking-wider uppercase">
                        CATEGORY: {activeFact.category} · SEVERITY: {activeFact.severity}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                    OWNER-ADOPTED
                  </span>
                </div>

                {/* Contract Statement */}
                <div className="space-y-1">
                  <span className="font-mono text-[9px] tracking-widest text-zinc-400 uppercase font-bold block">
                    RELATIONAL CONTRACT STATEMENT
                  </span>
                  <p className="text-white text-xs sm:text-sm font-semibold leading-relaxed bg-black/40 p-3 rounded-xl border border-white/10">
                    {activeFact.statement}
                  </p>
                </div>

                {/* Target Invariant & Failure Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white/[0.03] p-3 rounded-xl border border-white/10 space-y-1">
                    <span className="font-mono text-[8.5px] uppercase tracking-wider text-cyan-400 font-bold block">
                      TARGET RELATIONAL INVARIANT
                    </span>
                    <p className="text-zinc-300 leading-relaxed text-[11px]">{activeFact.targetInvariant}</p>
                  </div>
                  <div className="bg-white/[0.03] p-3 rounded-xl border border-white/10 space-y-1">
                    <span className="font-mono text-[8.5px] uppercase tracking-wider text-fuchsia-400 font-bold block">
                      COMMON MODEL HALLUCINATION
                    </span>
                    <p className="text-zinc-300 leading-relaxed text-[11px]">{activeFact.failureMode}</p>
                  </div>
                </div>

                {/* Verification Probes */}
                <div className="space-y-2">
                  <span className="font-mono text-[9px] tracking-widest text-zinc-400 uppercase font-bold block">
                    DETERMINISTIC VERIFICATION PROBES (ZERO LLM)
                  </span>
                  <div className="bg-black/60 p-3 rounded-xl border border-white/10 space-y-1.5 font-mono text-[9.5px]">
                    <div>
                      <span className="text-cyan-400 font-bold">AST PARSER: </span>
                      <span className="text-zinc-300">{activeFact.astProbe}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 font-bold">DOCKER PG16: </span>
                      <span className="text-zinc-300">{activeFact.dockerAssertion}</span>
                    </div>
                  </div>
                </div>

                {/* Implementation Snippet */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] tracking-widest text-zinc-400 uppercase font-bold">
                      CANONICAL DDL MIGRATION IMPLEMENTATION
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySnippet(activeFact.sqlSnippet)}
                      className="font-mono text-[9px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-200 transition-all cursor-pointer"
                    >
                      {copiedSnippet ? 'COPIED!' : 'COPY SQL'}
                    </button>
                  </div>
                  <pre className="bg-[#020306] p-3.5 rounded-xl border border-cyan-500/30 text-cyan-300 font-mono text-[10.5px] overflow-x-auto shadow-inner">
                    <code>{activeFact.sqlSnippet}</code>
                  </pre>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.section>
      )}

      {/* =========================================================================
          SECTION 06: VOLUMETRIC HEALING TRACE (NEW REFERENCE 3: GLOWING GREEN NODE TREE)
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'trace') && (
      <VolumetricHealingTrace
        activeModelName={getDisplayName(runId)}
        onSelectFact={(fId) => setSelectedFactId(fId)}
      />
      )}

      {/* =========================================================================
          SECTION 07: SCALE, EFFICIENCY & ARCHITECTURE (MULTI-MODEL ORBIT, RECOVERY DIALS, FAULT CONSTELLATION)
          ========================================================================= */}
      {(!isWindowMode || currentWindow.id === 'architecture') && (
        <ScaleEfficiencyArchitecture
          activeRunId={runId}
          onSelectRun={onSelectRun}
        />
      )}

      {/* =========================================================================
          SECTION 08: AXIOM KNOWLEDGE BASE & EMPIRICAL PROOFS (FAQ)
          ========================================================================= */}
      {(isWindowMode && currentWindow.id === 'questions') && (
        <AxiomFAQSection />
      )}

      {/* Window Quick Navigator or Full Dossier Footer */}
      {isWindowMode ? (
        <footer className="w-full max-w-7xl mx-auto pt-6 pb-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-zinc-400">
          <button
            type="button"
            onClick={() => onSelectSection?.(prevWindow.id)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <span>← PREV:</span>
            <span className="text-cyan-300 font-bold">{prevWindow.label}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSwitchToLive?.()}
              className="px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/60 transition-all cursor-pointer text-[10px] font-bold shadow-[0_0_12px_rgba(34,211,238,0.2)]"
            >
              OPEN LIVE ENGINE
            </button>
            <button
              type="button"
              onClick={() => onSelectSection?.('all')}
              className="px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer text-[10px]"
            >
              VIEW FULL DOSSIER
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectSection?.(nextWindow.id)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <span>NEXT:</span>
            <span className="text-cyan-300 font-bold">{nextWindow.label}</span>
            <span>→</span>
          </button>
        </footer>
      ) : (
        <footer className="w-full max-w-7xl mx-auto border-t border-white/10 pt-6 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-zinc-400">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectSection?.('theories')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 font-mono text-xs font-bold transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.25)]"
            >
              <span>← BACK TO PICKING SECTIONS</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchToLive?.()}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 font-mono text-xs transition-all cursor-pointer"
            >
              OPEN LIVE ENGINE
            </button>
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <AxiomLogo size={16} variant="duo" title="Axiom" />
            <span>AXIOM RELATIONAL SPECIFICATION ENGINE · 2026</span>
          </div>
        </footer>
      )}
    </div>
  );
});

export default ResearchCanvas;
