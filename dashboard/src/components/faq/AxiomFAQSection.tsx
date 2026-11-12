'use client';

import React, { useState, useMemo } from 'react';
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
    shortAnswer: 'Raw compiler error traces systematically beat natural language summaries by +13.97 to +17.36 pp.',
    fullAnswer: 'Natural language distillation introduces lossiness—dropping exact constraint naming formulas, string literals, and type specifications. Providing verbatim compiler error traces (Condition C0) outperforms distilled lessons (Condition C) by +14.39% on Nemotron 550B (p = 1.00e-5), +17.36% on Gemini 3.1 Flash Lite (p = 1.00e-5), and +16.53% on Qwen 3.8 27B (p = 1.00e-5). Overall, C0 statistically significantly beats C across 4 of 6 models under Holm-Bonferroni correction (p < 0.0001).',
    proofBadge: 'H3 CONFIRMED · p = 1.00 × 10⁻⁵',
    specCode: 'Δ(C0 − C) = +13.97% [95% CI: 10.1% .. 18.8%] · McNemar p = 9.26e-6',
  },
  {
    id: 'faq-context-meltdown',
    category: 'EMPIRICAL THEORIES',
    question: 'What is the Instruction Capacity Cliff and Prompt Bloat phenomenon?',
    shortAnswer: 'Injecting all organizational rules into prompts induces DDL syntax crashes on prompt-sensitive models.',
    fullAnswer: 'A common assumption is that "more context is always better." When all 34 database contract facts were injected into prompts (Condition B), large frontier models followed the instructions, but prompt-sensitive models suffered DDL syntax crashes (26 crashes on Gemini 3.1 Flash Lite; 83 crashes under Placebo on GLM-5.3). Selective failure-prioritized retrieval (Condition C0, top K=10 rules) rescues performance, beating Condition B on Gemini 3.1 Flash Lite by +7.93% while reducing prompt tokens by 51.3%.',
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
    shortAnswer: '6 confirmatory quality runs (720 trials each) + 1 live in-progress run.',
    fullAnswer: 'The fleet spans frontier and open architectures: Nemotron-3-Ultra-550B, Gemma-4-31B-Dense, GLM-5.3-Flash, Gemini-3.1-Flash-Lite, Gemini-3.5-Flash-Lite, Qwen-3.8-27B (all 720 trials completed), plus GPT-OSS-120B (live in-progress at 514/720 trials). Total completed trials across valid + live fleet: 4,834 trials (6,388 total historical trials). Every trial runs at temperature 0.0 with 30-second execution timeouts and SHA-256 disk cache deduplication.',
    proofBadge: '4,834 QUALITY TRIALS · MULTI-MODEL FLEET',
    specCode: 'Fleet: 6 Confirmatory + 1 Live Run · 4,834 Scored Trials · Ground-truth PG16',
  },
];

const CATEGORY_CONFIG: Record<string, { accent: string; bgColor: string; borderColor: string; tagColor: string }> = {
  'INVARIANT 0': { accent: '#00f0ff', bgColor: 'rgba(8, 16, 30, 0.96)', borderColor: 'rgba(0, 240, 255, 0.28)', tagColor: '#00f0ff' },
  'EMPIRICAL THEORIES': { accent: '#10b981', bgColor: 'rgba(8, 22, 18, 0.96)', borderColor: 'rgba(16, 185, 129, 0.28)', tagColor: '#10b981' },
  'DETERMINISTIC VERIFICATION': { accent: '#10b981', bgColor: 'rgba(8, 22, 18, 0.96)', borderColor: 'rgba(16, 185, 129, 0.28)', tagColor: '#10b981' },
  'SYSTEM ARCHITECTURE': { accent: '#f59e0b', bgColor: 'rgba(24, 18, 8, 0.96)', borderColor: 'rgba(245, 158, 11, 0.28)', tagColor: '#f59e0b' },
};

export function AxiomFAQSection() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string>('faq-distillation-penalty');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['ALL', 'INVARIANT 0', 'EMPIRICAL THEORIES', 'DETERMINISTIC VERIFICATION', 'SYSTEM ARCHITECTURE'] as const;

  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = activeCategory === 'ALL' || item.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.shortAnswer.toLowerCase().includes(q) ||
        item.fullAnswer.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeCategory, searchQuery]);

  return (
    <section id="faq" className="cortex-section" aria-labelledby="faq-title">
      <div className="cortex-bg-grid" aria-hidden="true" />
      <div className="cortex-bg-glow" aria-hidden="true" />
      <div className="cortex-bg-watermark" aria-hidden="true">
        <svg width="100%" height="100%" viewBox="0 0 100 100" className="cortex-bg-axiom-knot" aria-hidden="true">
          <path d="M50 10 C70 10 90 30 90 50 C90 70 70 90 50 90 C30 90 10 70 10 50 C10 30 30 10 50 10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M50 20 C70 20 80 30 80 50 C80 70 70 80 50 80 C30 80 20 70 30 50 C30 30 40 20 50 20" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      <div className="cortex-container">
        {/* Header */}
        <div className="cortex-header">
          <div className="cortex-chip">
            <span className="cortex-chip-dot" />
            <span>KNOWLEDGE BASE // FREQUENTLY ASKED QUESTIONS</span>
          </div>
          <h2 id="faq-title" className="cortex-title">Questions & Empirical Answers</h2>
          <p className="cortex-desc">
            Formal architectural explanations, empirical proofs, and operational mechanics of the Axiom Autonomous Engine.
          </p>
        </div>

        {/* Search + Category Filter Row */}
        <div className="cortex-decoder-block" style={{ maxWidth: '100%' }}>
          <div className="cortex-decoder-header">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
              <div className="cortex-decoder-header">
                <span className="cortex-decoder-eyebrow">// FILTER</span>
                <span className="cortex-decoder-hint">SEARCH & CATEGORY</span>
              </div>
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
          </div>

          {/* Category Chips */}
          <div className="cortex-cond-pills-row" role="tablist" aria-label="FAQ Category Filter">
            {categories.map((cat) => {
              const config = CATEGORY_CONFIG[cat] || { accent: '#00f0ff' };
              const isSelected = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveCategory(cat)}
                  className={`cortex-cond-pill ${isSelected ? 'is-active' : ''}`}
                  style={{ '--pill-accent': config.accent } as React.CSSProperties}
                >
                  <span className="cortex-cond-pill-code">{cat}</span>
                  <span className="cortex-cond-pill-name">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="cortex-freq-panel" style={{ marginTop: '48px' }}>
          <div className="cortex-freq-head">
            <div>
              <span className="cortex-chart-eyebrow">FAQ // EMPIRICAL KNOWLEDGE BASE</span>
              <h3 className="cortex-chart-title">Frequently Asked Questions & Verified Answers</h3>
            </div>
            <span className="cortex-chart-tag">
              {filteredItems.length} / {FAQ_ITEMS.length} QUESTIONS
            </span>
          </div>

          <div className="cortex-freq-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
            {filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const config = CATEGORY_CONFIG[item.category];
              
              return (
                <div
                  key={item.id}
                  id={item.id}
                  className={`cortex-freq-row cortex-faq-item ${isExpanded ? 'is-expanded' : ''}`}
                  style={{
                    '--faq-accent': config.accent,
                    '--faq-bg': config.bgColor,
                    '--faq-border': config.borderColor,
                    '--faq-tag': config.tagColor,
                  } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                    aria-expanded={isExpanded}
                    className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="cortex-layer-tag" style={{ color: config.accent, background: `color-mix(in srgb, ${config.accent} 16%, transparent)` }}>
                          {item.category}
                        </span>
                        <span className="cortex-cond-pill-code" style={{ background: `color-mix(in srgb, ${config.accent} 16%, transparent)`, color: config.accent }}>
                          {item.proofBadge}
                        </span>
                      </div>
                      <h3 className="cortex-chart-title" style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                        {item.question}
                      </h3>
                      {!isExpanded && (
                        <p className="cortex-cond-desc-text" style={{ fontSize: '13px', color: '#94a3b8' }}>
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
                        style={{ borderTopColor: 'rgba(255,255,255,0.1)' }}
                      >
                        <p className="leading-relaxed text-zinc-200 sm:text-sm">
                          {item.fullAnswer}
                        </p>

                        {item.specCode && (
                          <div className="cortex-cond-detail-card" style={{ 
                            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(9, 13, 24, 0.98) 100%)',
                            borderColor: config.accent,
                            boxShadow: `0 10px 30px rgba(0, 0, 0, 0.5), 0 0 24px color-mix(in srgb, ${config.accent} 15%, transparent)`
                          }}>
                            <span className="font-mono text-[10px] text-cyan-300">{item.specCode}</span>
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
        </div>
      </div>
    </section>
  );
}

export default AxiomFAQSection;