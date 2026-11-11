'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FAQItem {
  id: string;
  category: 'INVARIANT 0' | 'EMPIRICAL THEORIES' | 'DETERMINISTIC VERIFICATION' | 'SYSTEM ARCHITECTURE';
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  proofBadge: string;
  specCode?: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-invariant-0',
    category: 'INVARIANT 0',
    question: 'What is Invariant 0 and Authority Separation in Axiom?',
    shortAnswer: 'Strict separation of generation from verification: LLM generation ⊥ deterministic proof.',
    fullAnswer: 'LLM self-evaluation ("LLM-as-a-judge") in database systems suffers from correlated blind spots—models hallucinate compliance on subtle DDL flaws such as omitting FORCE ROW LEVEL SECURITY or creating unindexed foreign keys. Axiom enforces total separation: generative models are untrusted candidate producers with zero authority. Evaluation resides exclusively in an AST Verifier (100% mutation kill rate) and an isolated PostgreSQL 16 Docker Oracle.',
    proofBadge: 'INVARIANT 0 · ZERO LLM IN EVAL LOOP',
    specCode: 'AST.verify(sql) && Docker.probe(sql, role="application") === PASS',
  },
  {
    id: 'faq-distillation-penalty',
    category: 'EMPIRICAL THEORIES',
    question: 'What is the "Distillation Penalty" (Verbatim vs. Distilled Lessons)?',
    shortAnswer: 'Raw compiler error traces systematically beat natural language summaries by +14.4% to +21.9%.',
    fullAnswer: 'Classical reflexion architectures rely on a secondary LLM "Advisor" to compress compiler error outputs into concise natural language rules. Our empirical trials across 720 runs proved that natural language distillation introduces severe lossiness—dropping exact constraint naming formulas, string literals, and type specifications. Providing verbatim compiler error traces (Condition C0) outperforms distilled lessons (Condition C) by +14.39% on Nemotron 550B (p = 1.00e-5) and +21.90% on Nemotron Lightning.',
    proofBadge: 'H3 CONFIRMED · p = 1.00 × 10⁻⁵',
    specCode: 'Δ(C0 − C) = +14.39% [95% CI: 9.1% .. 19.7%] · McNemar p = 9.26e-6',
  },
  {
    id: 'faq-context-meltdown',
    category: 'EMPIRICAL THEORIES',
    question: 'What is the Instruction Capacity Cliff / Context Meltdown phenomenon?',
    shortAnswer: 'Injecting all organizational rules causes smaller models to suffer a 95.8% syntax crash rate.',
    fullAnswer: 'A common belief is that "more context is always better." When all 34 database contract facts were injected into prompts (Condition B), frontier 550B models digested the context (93.9% compliance). However, smaller distilled models (Nemotron Lightning) suffered catastrophic syntax collapse—crashing on 115 out of 120 migrations (95.8% crash rate). Selective retrieval (Condition C0, top K=10 rules) rescues smaller models, beating Condition B by +18.96% while reducing prompt tokens by 51.3%.',
    proofBadge: 'CAPACITY CLIFF · 51.3% TOKEN REDUCTION',
    specCode: 'Prompt Tokens: Cond B (1,139 tok) → Cond C0 (555 tok) · Retention: 95.3%',
  },
  {
    id: 'faq-ast-verifier',
    category: 'DETERMINISTIC VERIFICATION',
    question: 'How does the AST Verifier achieve a 100% mutation kill rate?',
    shortAnswer: 'By parsing raw SQL into relational abstract syntax trees and probing structural AST nodes directly.',
    fullAnswer: 'The AST Verifier parses candidate DDL without executing it, inspecting schema ASTs for strict organizational invariants. It enforces deterministic constraint naming formulas (chk_<table>_<column>, fk_<table>_<column>), verifies UUID primary key defaults, checks soft-delete column nullability, and inspects RLS policies for auth.jwt() -> app_metadata tokens. It achieved a 100% kill rate across 100 mutated schema fixtures.',
    proofBadge: 'AST PROBE · 100% MUTATION KILL',
    specCode: 'AST.TableDef.constraints.every(c => c.name.startsWith("chk_" + table))',
  },
  {
    id: 'faq-docker-oracle',
    category: 'DETERMINISTIC VERIFICATION',
    question: 'What role does the PostgreSQL 16 Docker Crucible play?',
    shortAnswer: 'Runtime behavioral verification under realistic application role constraints.',
    fullAnswer: 'Migrations execute inside a dedicated, fresh PostgreSQL 16 container under role deployer. Once applied, 34 behavioral contract probers query the tables under role application. These probers execute concurrent insertions, trigger validation checks, attempt tenant-hopping queries, and probe soft-delete behaviors to verify real database runtime semantics.',
    proofBadge: 'DOCKER PG16 · ISOLATED CRUCIBLE',
    specCode: 'docker run --rm postgres:16-alpine · probed as role "application"',
  },
  {
    id: 'faq-rule-bn00',
    category: 'SYSTEM ARCHITECTURE',
    question: 'What is Rule BN-00 and the Quarantine Gate?',
    shortAnswer: 'Generated axioms are strictly quarantined and never written to canonical files.',
    fullAnswer: 'Rule BN-00 mandates that generated axioms produced by the reflexion healing loop are candidate hypotheses only. They are stored in an isolated SHA-256 ledger vault (quarantine.json) and never written into canonical domain files until promoted by deterministic verifier test suites. The 8 canonical agent specifications in agents/ must remain perpetually present and unmodified.',
    proofBadge: 'RULE BN-00 · SHA-256 IMMUTABLE LEDGER',
    specCode: 'CANONICAL FILES: agents/* [PROTECTED // IMMUTABLE]',
  },
  {
    id: 'faq-fleet-telemetry',
    category: 'SYSTEM ARCHITECTURE',
    question: 'Which models have been evaluated in the Axiom fleet?',
    shortAnswer: '8 autonomous models across 720 trials each under identical deterministic conditions.',
    fullAnswer: 'The fleet spans frontier and distilled architectures: Nemotron-3-Ultra-550B, Nemotron-3.5-Lightning, GLM-5.3-Flash, Qwen-3.8-27B, Gemini-3.5-Flash-Lite, Gemma-4-31B-Dense, Llama-3.3-70B, and Liquid-1.7B-Mini. Every trial runs at temperature 0.0 with 30-second execution timeouts and SHA-256 disk cache deduplication.',
    proofBadge: '720 TRIALS PER MODEL · MULTI-MODEL FLEET',
    specCode: 'Fleet: 8 models · Total Evaluated Trials: 5,760 · Ground-truth PG16',
  },
];

export function AxiomFAQSection() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string>('faq-distillation-penalty');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['ALL', 'INVARIANT 0', 'EMPIRICAL THEORIES', 'DETERMINISTIC VERIFICATION', 'SYSTEM ARCHITECTURE'] as const;

  const filteredItems = FAQ_ITEMS.filter((item) => {
    const matchesCat = activeCategory === 'ALL' || item.category === activeCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      item.question.toLowerCase().includes(q) ||
      item.shortAnswer.toLowerCase().includes(q) ||
      item.fullAnswer.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  return (
    <section id="faq" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-16 space-y-8 select-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
            <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-400 uppercase font-semibold">
              KNOWLEDGE BASE // FREQUENTLY ASKED QUESTIONS
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
            Questions & Empirical Answers
          </h2>
          <p className="text-zinc-400 font-mono text-xs max-w-2xl leading-relaxed">
            Formal architectural explanations, empirical proofs, and operational mechanics of the Axiom Autonomous Engine.
          </p>
        </div>

        {/* Search */}
        <div className="w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2 font-mono text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60 shadow-inner"
          />
        </div>
      </div>

      {/* Filter Category Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono text-[9.5px]">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
              activeCategory === cat
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQ Accordion List (Compliant with UX-06) */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              id={item.id}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden backdrop-blur-2xl ${
                isExpanded
                  ? 'bg-gradient-to-b from-white/[0.08] to-black/90 border-cyan-400/50 shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(34,211,238,0.12),0_1px_0_0_rgba(255,255,255,0.2)_inset]'
                  : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/20'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                aria-expanded={isExpanded}
                className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[8.5px] px-2 py-0.5 rounded bg-black/60 border border-white/10 text-zinc-400 uppercase font-semibold">
                      {item.category}
                    </span>
                    <span className="font-mono text-[8.5px] px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold uppercase tracking-wider">
                      {item.proofBadge}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {item.question}
                  </h3>
                  {!isExpanded && (
                    <p className="text-zinc-400 text-xs line-clamp-1 font-sans">
                      {item.shortAnswer}
                    </p>
                  )}
                </div>

                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono text-xs border shrink-0 transition-transform duration-200 ${
                    isExpanded
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 rotate-180'
                      : 'bg-white/5 border-white/10 text-zinc-400'
                  }`}
                >
                  ▼
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/10 space-y-3 font-sans text-xs text-zinc-200"
                  >
                    <p className="leading-relaxed text-zinc-200 sm:text-sm">
                      {item.fullAnswer}
                    </p>

                    {item.specCode && (
                      <div className="bg-[#020306] p-3 rounded-xl border border-cyan-500/30 font-mono text-[10px] text-cyan-300 shadow-inner flex items-center justify-between">
                        <span className="font-semibold">{item.specCode}</span>
                        <span className="text-[9px] text-zinc-500 font-mono uppercase">AXIOM KERNEL SPEC</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default AxiomFAQSection;
