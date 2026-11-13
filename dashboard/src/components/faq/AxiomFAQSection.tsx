'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FAQItem {
  id: string;
  code: string;
  category: 'INVARIANT 0' | 'EMPIRICAL THEORIES' | 'DETERMINISTIC VERIFICATION' | 'SYSTEM ARCHITECTURE';
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  proofBadge: string;
  specCode: string;
  sourceFile: string;
  metrics: [string, string][];
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-invariant-0',
    code: '01',
    category: 'INVARIANT 0',
    question: 'What is Invariant 0 and Authority Separation in Axiom?',
    shortAnswer: 'Strict separation of generation from verification: LLM generation ⊥ deterministic proof.',
    fullAnswer:
      'LLM self-evaluation ("LLM-as-a-judge") in database systems suffers from correlated blind spots—models hallucinate compliance on subtle DDL flaws such as omitting FORCE ROW LEVEL SECURITY or creating unindexed foreign keys. Axiom enforces total authority separation: generative models are untrusted candidate producers with zero verification authority. Evaluation resides exclusively in a deterministic AST Verifier (100% mutation kill rate) and an isolated PostgreSQL 16 Docker Oracle.',
    proofBadge: 'INVARIANT 0 · ZERO LLM IN EVAL LOOP',
    specCode: 'AST.verify(sql) && Docker.probe(sql, role="application") === PASS',
    sourceFile: 'src/verifier.ts · scripts/oracle.ts',
    metrics: [
      ['EVALUATION LLM CALLS', '0 (DETERMINISTIC)'],
      ['MUTATION KILL RATE', '100% (100/100)'],
      ['ORACLE ISOLATION', 'POSTGRESQL 16 DOCKER'],
    ],
  },
  {
    id: 'faq-distillation-penalty',
    code: '02',
    category: 'EMPIRICAL THEORIES',
    question: 'What is the "Distillation Penalty" (Verbatim vs. Distilled Lessons)?',
    shortAnswer: 'Raw compiler error traces systematically beat natural language summaries by +13.97 to +17.36 pp.',
    fullAnswer:
      'Reflexion architectures typically use secondary LLM "Advisors" to synthesize raw error traces into concise, high-level natural language lessons. For rigid relational software contracts, natural language distillation introduces severe lossiness—dropping exact constraint naming formulas, string literals, and type specifications. Providing verbatim Oracle contract text (Condition C0) outperforms distilled lessons (Condition C) by +14.39% on Nemotron 550B (p = 1.00e-5), +17.36% on Gemini 3.1 Flash Lite (p = 1.00e-5), and +16.53% on Qwen 3.8 27B (p = 1.00e-5).',
    proofBadge: 'H3 CONFIRMED · p = 1.00 × 10⁻⁵',
    specCode: 'Δ(C0 − C) = +14.39% on Nemotron 550B · McNemar p = 9.26e-6 · Holm-Bonferroni p < 0.0001',
    sourceFile: 'scripts/analyze-ablation-v2.ts',
    metrics: [
      ['NEMOTRON 550B LIFT', '+14.39% (86.3% vs 71.9%)'],
      ['GEMINI 3.1 FL LIFT', '+17.36% (p = 1.00e-5)'],
      ['QWEN 3.8 27B LIFT', '+16.53% (p = 1.00e-5)'],
    ],
  },
  {
    id: 'faq-context-meltdown',
    code: '03',
    category: 'EMPIRICAL THEORIES',
    question: 'What is the Instruction Capacity Cliff and Prompt Bloat phenomenon?',
    shortAnswer: 'Injecting all organizational rules into prompts induces DDL syntax crashes on prompt-sensitive models.',
    fullAnswer:
      'A common assumption is that "more context is always better." When all 34 database contract facts were injected into prompts (Condition B), high-capacity models followed the instructions, but prompt-sensitive models suffered catastrophic DDL syntax crashes (26 crashes on Gemini 3.1 Flash Lite; 83 crashes under Placebo on GLM-5.3). Selective failure-prioritized retrieval (Condition C0, top K=10 rules) rescues performance, beating Condition B on Gemini 3.1 Flash Lite by +7.93% while reducing prompt tokens by 51.3%.',
    proofBadge: 'CAPACITY CLIFF · 51.3% TOKEN REDUCTION',
    specCode: 'Prompt Tokens: Cond B (1,139 tok) → Cond C0 (555 tok) · Compliance Retention: 95.3%',
    sourceFile: 'src/eval/ablation.ts · src/memory.ts',
    metrics: [
      ['PROMPT TOKEN REDUCTION', '51.3% (1,139 → 555 TOK)'],
      ['COMPLIANCE RETENTION', '95.3% OF CEILING'],
      ['GEMINI 3.1 C0 vs B', '+7.93% NET GAIN'],
    ],
  },
  {
    id: 'faq-v2-vs-v3',
    code: '04',
    category: 'EMPIRICAL THEORIES',
    question: 'How does Confirmatory Ablation v3 (960 trials) extend Ablation v2 (720 trials)?',
    shortAnswer: 'Expands from 6 conditions (720 trials) to 8 orthogonal conditions (960 trials) to isolate formatting, IDs, and selection.',
    fullAnswer:
      'Confirmatory Ablation v2 evaluated 120 held-out tasks across 6 conditions (A, B, C, C0, D, E_B = 720 trials/model). Ablation v3 tests 120 hardened v3 tasks across 8 conditions (960 trials/model): A (Baseline), D_safe (length-matched benign SQL checklist without schema-qualification traps), C (Distilled lessons), C0 (Verbatim JSON lines), C0_clean (plain-bullet verbatim statements stripping JSON syntax), C_ID (distilled lessons augmented with [F-XX] fact IDs), C0_rand (10 randomly sampled verbatim facts), and B (full-catalog ceiling). This cleanly isolates wording lossiness from JSON syntax, fact ID tokens, and retrieval ranking.',
    proofBadge: 'V3 PROTOCOL · 8 CONDITIONS × 120 TASKS',
    specCode: 'V3_CONDITIONS = ["A", "D_safe", "C", "C0", "C0_clean", "C_ID", "C0_rand", "B"] // 960 trials',
    sourceFile: 'scripts/run-ablation-v3.ts · fixtures/task-v3/tasks.json',
    metrics: [
      ['V2 MATRIX', '6 COND × 120 = 720 TRIALS'],
      ['V3 MATRIX', '8 COND × 120 = 960 TRIALS'],
      ['ACTIVE PROBES', '34 (V2) → 39 (V3 HARDENED)'],
    ],
  },
  {
    id: 'faq-ast-verifier',
    code: '05',
    category: 'DETERMINISTIC VERIFICATION',
    question: 'How does the AST Verifier achieve a 100% mutation kill rate?',
    shortAnswer: 'By parsing raw SQL into relational abstract syntax trees and probing structural AST nodes directly.',
    fullAnswer:
      'The AST Verifier parses candidate DDL without executing an LLM, inspecting schema ASTs for strict organizational invariants. It enforces deterministic constraint naming formulas (chk_<table>_<column>, fk_<table>_<column>), verifies UUIDv4 primary key defaults, checks soft-delete column nullability, and inspects RLS policies for current_setting("app.current_tenant_id", true) isolation tokens. It achieved a 100% kill rate across 100 mutated schema fixtures.',
    proofBadge: 'AST PROBE · 100% MUTATION KILL',
    specCode: 'AST.TableDef.constraints.every(c => c.name.startsWith("chk_" + table))',
    sourceFile: 'src/verifier.ts',
    metrics: [
      ['MUTATION FIXTURES', '100 / 100 KILLED'],
      ['EXECUTION LATENCY', '< 4ms PER MIGRATION'],
      ['FALSE POSITIVE RATE', '0.00% (DETERMINISTIC)'],
    ],
  },
  {
    id: 'faq-docker-oracle',
    code: '06',
    category: 'DETERMINISTIC VERIFICATION',
    question: 'What role does the PostgreSQL 16 Docker Crucible play?',
    shortAnswer: 'Runtime behavioral verification under role-separated PostgreSQL 16 execution.',
    fullAnswer:
      'Static syntax checks cannot catch runtime semantic bugs (such as RLS policies that compile cleanly but fail to block cross-tenant reads by non-superusers). Migrations execute inside an isolated PostgreSQL 16 container under role deployer (schema owner). Once applied, behavioral contract probers query the tables under role application (unprivileged read/write). These probers execute concurrent insertions, trigger validation checks, attempt tenant-hopping queries, and probe soft-delete views.',
    proofBadge: 'DOCKER PG16 · ISOLATED CRUCIBLE',
    specCode: 'docker run --rm postgres:16-alpine · DDL as role "deployer" · Probed as role "application"',
    sourceFile: 'scripts/oracle.ts · scripts/facts.ts',
    metrics: [
      ['MIGRATION ROLE', 'deployer (SCHEMA OWNER)'],
      ['PROBE ROLE', 'application (NON-SUPERUSER)'],
      ['BEHAVIORAL FACTS', '34 V2 / 39 V3 PROBES'],
    ],
  },
  {
    id: 'faq-rule-bn00',
    code: '07',
    category: 'SYSTEM ARCHITECTURE',
    question: 'What is Rule BN-00 and the Quarantine Gate?',
    shortAnswer: 'Generated axioms are strictly quarantined and never written into canonical domain files.',
    fullAnswer:
      'Rule BN-00 mandates that generated axioms produced by the reflexion healing loop are candidate hypotheses only. They are held in an isolated SHA-256 ledger vault (quarantine.json) and are never written directly into canonical domain files until verified by deterministic test suites and explicitly promoted. The 8 canonical agent specification files in agents/ are cryptographically guarded and must remain perpetually present.',
    proofBadge: 'RULE BN-00 · SHA-256 IMMUTABLE LEDGER',
    specCode: 'CANONICAL_AGENT_FILES = 8 // agents/* [QUARANTINE ISOLATED · NEVER DIRECTLY WRITTEN]',
    sourceFile: 'src/promote.ts · AGENTS.md',
    metrics: [
      ['CANONICAL AGENT FILES', '8 / 8 PROTECTED (BN-00)'],
      ['CANDIDATE STORAGE', 'quarantine.json (ISOLATED)'],
      ['LEDGER INTEGRITY', 'SHA-256 PROVENANCE HASH'],
    ],
  },
  {
    id: 'faq-fleet-telemetry',
    code: '08',
    category: 'SYSTEM ARCHITECTURE',
    question: 'Which models and protocols are evaluated in the Axiom multi-model fleet?',
    shortAnswer: '6 confirmatory architectures evaluated across both v2 (720 trials) and v3 (960 trials) protocols.',
    fullAnswer:
      'The Axiom confirmatory fleet spans 6 diverse frontier and open-weight architectures: Nemotron-3-Ultra-550B (NVIDIA NIM), Gemma-4-31B-Dense (Google AI Studio), Qwen-3.8-27B (Groq), GLM-5.3-Flash (NVIDIA NIM), Gemini-3.1-Flash-Lite, and Gemini-3.5-Flash-Lite, plus exploratory runs on GPT-OSS-120B. Every model is evaluated at strict temperature 0.0 with all 7 SHA-256 provenance hashes locked (oracle, tasks, facts, memory, and distractor manifests) and matched top-10 retrieval.',
    proofBadge: '6 CONFIRMATORY MODELS · V2 & V3 FLEET',
    specCode: '6 Models × (720 V2 + 960 V3 Trials) · Temp = 0.0 · 7 SHA-256 Provenance Hashes Locked',
    sourceFile: 'dashboard/src/lib/runs.ts · src/executor.ts',
    metrics: [
      ['CONFIRMATORY FLEET', '6 ARCHITECTURES (27B–550B)'],
      ['DECODING TEMPERATURE', '0.0 (DETERMINISTIC)'],
      ['PROVENANCE HASHES', '7 SHA-256 MANIFESTS LOCKED'],
    ],
  },
];

const CATEGORY_CONFIG: Record<
  string,
  { accent: string; badgeBg: string; borderCol: string; label: string }
> = {
  ALL: {
    accent: '#22d3ee',
    badgeBg: 'rgba(34, 211, 238, 0.10)',
    borderCol: 'rgba(34, 211, 238, 0.35)',
    label: 'ALL ENTRIES',
  },
  'INVARIANT 0': {
    accent: '#22d3ee',
    badgeBg: 'rgba(34, 211, 238, 0.10)',
    borderCol: 'rgba(34, 211, 238, 0.35)',
    label: 'INVARIANT 0',
  },
  'EMPIRICAL THEORIES': {
    accent: '#a855f7',
    badgeBg: 'rgba(168, 85, 247, 0.12)',
    borderCol: 'rgba(168, 85, 247, 0.38)',
    label: 'EMPIRICAL THEORIES',
  },
  'DETERMINISTIC VERIFICATION': {
    accent: '#34d399',
    badgeBg: 'rgba(52, 211, 153, 0.10)',
    borderCol: 'rgba(52, 211, 153, 0.35)',
    label: 'DETERMINISTIC VERIFICATION',
  },
  'SYSTEM ARCHITECTURE': {
    accent: '#fbbf24',
    badgeBg: 'rgba(251, 191, 36, 0.10)',
    borderCol: 'rgba(251, 191, 36, 0.35)',
    label: 'SYSTEM ARCHITECTURE',
  },
};

export function AxiomFAQSection() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string>('faq-distillation-penalty');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = [
    'ALL',
    'INVARIANT 0',
    'EMPIRICAL THEORIES',
    'DETERMINISTIC VERIFICATION',
    'SYSTEM ARCHITECTURE',
  ] as const;

  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = activeCategory === 'ALL' || item.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.shortAnswer.toLowerCase().includes(q) ||
        item.fullAnswer.toLowerCase().includes(q) ||
        item.specCode.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeCategory, searchQuery]);

  const activeItem = useMemo(() => {
    return (
      filteredItems.find((i) => i.id === expandedId) ??
      filteredItems[0] ??
      FAQ_ITEMS[0]
    );
  }, [filteredItems, expandedId]);

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-10 font-mono text-[#e8eaf2] space-y-5"
    >
      {/* Section Header — Unified Blueprint Aesthetic */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[rgba(160,170,255,0.16)] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#22d3ee] text-[10px] tracking-[0.18em] uppercase font-bold">
            <span className="w-2 h-2 rounded-full bg-[#22d3ee] animate-pulse shadow-[0_0_8px_#22d3ee]" />
            <span>SECTION 08 // EMPIRICAL KNOWLEDGE BASE &amp; ARCHITECTURAL PROOFS</span>
          </div>
          <h2
            id="faq-title"
            className="text-2xl sm:text-3xl font-extrabold text-[#e8eaf2] tracking-tight mt-1 font-sans"
          >
            Questions &amp; Empirical Answers
          </h2>
        </div>
        <p className="text-[#7c819a] text-[11px] max-w-md leading-relaxed">
          Formal architectural explanations, statistical proofs, and operational mechanics of the
          Axiom Autonomous Engine.
        </p>
      </div>

      {/* 4-Metric Hairline Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-[rgba(160,170,255,0.16)] bg-[#05060a] divide-y lg:divide-y-0 lg:divide-x divide-[rgba(160,170,255,0.16)]">
        <div className="p-3.5 sm:p-4">
          <div className="text-[9px] text-[#7c819a] uppercase tracking-[0.16em]">
            INVARIANT 0 AUTHORITY
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#22d3ee] mt-1">
            Zero LLM
          </div>
          <div className="text-[10px] text-[#7c819a] mt-0.5">
            100% deterministic evaluation loop
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-[9px] text-[#7c819a] uppercase tracking-[0.16em]">
            DISTILLATION PENALTY (H3)
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#a855f7] mt-1">
            +14.4% .. +17.4%
          </div>
          <div className="text-[10px] text-[#7c819a] mt-0.5">
            Verbatim C0 lift over distilled C
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-[9px] text-[#7c819a] uppercase tracking-[0.16em]">
            AST + DOCKER CRUCIBLE
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#34d399] mt-1">
            39 Probes
          </div>
          <div className="text-[10px] text-[#7c819a] mt-0.5">
            PostgreSQL 16 role-separated checks
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-[9px] text-[#7c819a] uppercase tracking-[0.16em]">
            QUARANTINE GATE
          </div>
          <div className="text-lg sm:text-xl font-bold text-[#fbbf24] mt-1">
            Rule BN-00
          </div>
          <div className="text-[10px] text-[#7c819a] mt-0.5">
            8 canonical agent files protected
          </div>
        </div>
      </div>

      {/* Main Blueprint Frame */}
      <div className="border border-[rgba(160,170,255,0.16)] bg-[#05060a]">
        {/* Top Control Bar: Category Filter & Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(160,170,255,0.16)] bg-[#05060a]">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.14em] text-[#7c819a] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" />
            <span>
              KNOWLEDGE BASE LEDGER · {filteredItems.length} / {FAQ_ITEMS.length} VERIFIED ENTRIES
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            {/* Category Tabs */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="tablist"
              aria-label="FAQ Category Filter"
            >
              {categories.map((cat) => {
                const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.ALL;
                const isSelected = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      color: isSelected ? '#ffffff' : cfg.accent,
                      borderColor: isSelected ? cfg.accent : 'rgba(160,170,255,0.18)',
                      backgroundColor: isSelected ? cfg.badgeBg : 'transparent',
                    }}
                    className="border px-2.5 py-1 text-[9.5px] tracking-[0.12em] uppercase transition-colors cursor-pointer font-bold rounded-[2px]"
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter questions or specs..."
                aria-label="Filter FAQ questions"
                className="w-full bg-[#080a12] border border-[rgba(160,170,255,0.2)] rounded-[2px] px-3 py-1 text-[10.5px] font-mono text-[#e8eaf2] placeholder-[#7c819a] focus:outline-none focus:border-[#22d3ee] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#7c819a] hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Blueprint Dossier Grid */}
        <div
          className="p-4 sm:p-5 space-y-3"
          style={{
            background:
              'radial-gradient(ellipse at 50% 30%, rgba(18, 10, 36, 0.55) 0%, rgba(5, 6, 10, 0.98) 75%)',
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[rgba(160,170,255,0.16)] text-[#7c819a] text-xs">
              No empirical entries matched &ldquo;{searchQuery}&rdquo; in [{activeCategory}].
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.id;
                const cfg = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.ALL;

                return (
                  <div
                    key={item.id}
                    id={item.id}
                    style={{
                      borderColor: isExpanded ? cfg.accent : 'rgba(160,170,255,0.16)',
                      boxShadow: isExpanded
                        ? `0 0 24px -6px ${cfg.borderCol}`
                        : 'none',
                    }}
                    className={`border rounded-[3px] bg-[#070911]/95 transition-all duration-200 flex flex-col justify-between ${
                      isExpanded ? 'md:col-span-2' : 'hover:border-[rgba(160,170,255,0.34)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                      aria-expanded={isExpanded}
                      className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-4 cursor-pointer"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        {/* Top Row: Code + Category Badge + Proof Tag */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-[11px] font-bold tracking-[0.14em]"
                              style={{ color: cfg.accent }}
                            >
                              {item.code}
                            </span>
                            <span
                              style={{
                                color: cfg.accent,
                                borderColor: cfg.borderCol,
                                backgroundColor: cfg.badgeBg,
                              }}
                              className="border px-2 py-0.5 rounded-[2px] text-[9px] tracking-[0.14em] uppercase font-bold"
                            >
                              {item.category}
                            </span>
                          </div>

                          <span
                            style={{
                              color: cfg.accent,
                              borderColor: cfg.borderCol,
                              backgroundColor: 'rgba(255,255,255,0.02)',
                            }}
                            className="border px-2 py-0.5 rounded-full text-[9px] tracking-[0.12em] uppercase font-bold"
                          >
                            {item.proofBadge}
                          </span>
                        </div>

                        {/* Question Title */}
                        <h3 className="text-sm sm:text-[15px] font-bold text-[#e8eaf2] tracking-tight font-sans pt-0.5">
                          {item.question}
                        </h3>

                        {/* Short Summary Subtitle */}
                        <p
                          className="text-[11px] leading-relaxed font-mono"
                          style={{ color: isExpanded ? cfg.accent : '#7c819a' }}
                        >
                          {item.shortAnswer}
                        </p>
                      </div>

                      {/* Expand Indicator */}
                      <div
                        style={{
                          borderColor: isExpanded ? cfg.accent : 'rgba(160,170,255,0.2)',
                          color: isExpanded ? cfg.accent : '#7c819a',
                          backgroundColor: isExpanded ? cfg.badgeBg : 'rgba(255,255,255,0.02)',
                        }}
                        className={`w-6 h-6 rounded-[2px] flex items-center justify-center font-mono text-[10px] border shrink-0 transition-transform duration-200 mt-0.5 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▼
                      </div>
                    </button>

                    {/* Expanded Empirical Proof & Spec Inspector */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden border-t border-[rgba(160,170,255,0.14)]"
                        >
                          <div className="p-4 sm:p-5 space-y-4 bg-[#05060a]/90">
                            <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
                              {/* Left: Full Empirical Answer + Proof Box */}
                              <div className="space-y-3">
                                <p className="text-xs sm:text-[13px] leading-[1.7] text-[#c3c7da] font-sans">
                                  {item.fullAnswer}
                                </p>

                                <div
                                  className="px-3.5 py-2.5 border border-[rgba(160,170,255,0.16)] bg-white/[0.025] text-[11px] leading-[1.6] text-[#e8eaf2]"
                                  style={{ borderLeft: `2px solid ${cfg.accent}` }}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <b className="text-[#7c819a] font-bold tracking-[0.16em] text-[9.5px] uppercase">
                                      PROOF // AXIOM KERNEL SPECIFICATION
                                    </b>
                                    <span className="text-[9.5px] text-[#7c819a] font-mono">
                                      [{item.sourceFile}]
                                    </span>
                                  </div>
                                  <code
                                    className="block font-mono text-[11px] break-all"
                                    style={{ color: cfg.accent }}
                                  >
                                    {item.specCode}
                                  </code>
                                </div>
                              </div>

                              {/* Right: Verification Telemetry Key-Value Table */}
                              <div className="border border-[rgba(160,170,255,0.14)] bg-[#080a12] p-3.5 flex flex-col justify-between space-y-3">
                                <div className="flex items-center justify-between border-b border-[rgba(160,170,255,0.12)] pb-2">
                                  <span className="text-[9.5px] tracking-[0.16em] text-[#7c819a] uppercase font-bold">
                                    VERIFICATION METRICS // ENTRY {item.code}
                                  </span>
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: cfg.accent }}
                                  />
                                </div>

                                <div className="space-y-2">
                                  {item.metrics.map(([k, v]) => (
                                    <div
                                      key={k}
                                      className="flex items-center justify-between gap-3 text-[10.5px] border-b border-white/[0.04] pb-1.5 last:border-b-0 last:pb-0"
                                    >
                                      <span className="text-[#7c819a] uppercase tracking-wider">
                                        {k}
                                      </span>
                                      <span className="text-[#e8eaf2] font-bold text-right">
                                        {v}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                <div className="pt-1 flex items-center justify-between text-[9.5px] text-[#7c819a]">
                                  <span>STATUS: EMPIRICALLY LOCKED</span>
                                  <span style={{ color: cfg.accent }}>SHA-256 VERIFIED</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Assembly Inspector Bar (matching Assembly 03 // Crucible bar in Anatomy) */}
        <div
          className="border-t border-[rgba(160,170,255,0.16)] bg-[#05060a] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px]"
          style={{
            borderLeft: `2px solid ${(CATEGORY_CONFIG[activeItem.category] ?? CATEGORY_CONFIG.ALL).accent}`,
          }}
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="font-bold tracking-[0.14em] uppercase"
              style={{
                color: (CATEGORY_CONFIG[activeItem.category] ?? CATEGORY_CONFIG.ALL).accent,
              }}
            >
              ENTRY {activeItem.code} // {activeItem.category}
            </span>
            <span className="text-[#e8eaf2] font-bold">{activeItem.question}</span>
          </div>
          <span className="text-[#7c819a] font-mono shrink-0">[{activeItem.sourceFile}]</span>
        </div>
      </div>
    </section>
  );
}

export default AxiomFAQSection;
