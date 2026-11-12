'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AxiomLogo } from './AxiomLogo';

interface WhitePaperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhitePaperModal({ isOpen, onClose }: WhitePaperModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 md:p-10 select-text">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="relative w-full max-w-4xl max-h-[88vh] rounded-2xl border border-white/15 bg-[#05060a]/95 backdrop-blur-2xl shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(34,211,238,0.15)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <AxiomLogo size={22} variant="icon" title="Axiom" />
              <div>
                <span className="font-mono text-[9px] tracking-[0.2em] text-cyan-400 uppercase font-bold block">
                  TECHNICAL WHITE PAPER & FORMAL SPECIFICATION
                </span>
                <h3 className="font-sans font-bold text-base sm:text-lg text-white">
                  Axiom: Self-Healing Architectural Invariants
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="font-mono text-xs px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              ESC / CLOSE
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-zinc-300 font-sans text-xs sm:text-sm leading-relaxed scrollbar-thin">
            {/* Title Block */}
            <div className="space-y-2 border-b border-white/10 pb-5">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold">
                  AXIOM TECHNICAL REPORT 2026.01
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">720 TRIALS · 8 FLEET ARCHITECTURES</span>
                <span className="text-zinc-500">·</span>
                <span className="text-emerald-400 font-semibold">100% AST MUTATION KILL RATE</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                Deterministic Authority Separation in Autonomous Relational Engineering
              </h1>
              <p className="text-zinc-400 text-xs font-mono">
                Axiom Research Group · Deterministic Software Verification Lab
              </p>
            </div>

            {/* Abstract */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 sm:p-5 space-y-2">
              <span className="font-mono text-[9.5px] uppercase tracking-widest text-cyan-400 font-bold block">
                ABSTRACT
              </span>
              <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed">
                Autonomous schema migrations in production database environments cannot rely on stochastic self-evaluation (&ldquo;LLM-as-a-judge&rdquo;), which exhibits correlated blind spots on subtle relational invariants such as unindexed foreign keys and bypassable row-level security. We present <strong className="text-white">Axiom</strong>, an autonomous engine enforcing <strong className="text-cyan-300">Invariant 0</strong>: strict authority separation where generative language models act as untrusted candidate producers, and verification authority resides exclusively in external deterministic engines (relational AST parser and isolated PostgreSQL 16 Docker containers).
              </p>
            </div>

            {/* Key Empirical Discoveries */}
            <div className="space-y-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">
                CORE EMPIRICAL DISCOVERIES
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-300">H3: THE DISTILLATION PENALTY</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">p &lt; 0.0001</span>
                  </div>
                  <p className="text-zinc-300">
                    Raw compiler error traces systematically outperform natural language summaries by <strong className="text-white">+14.39%</strong> on Nemotron 550B and <strong className="text-white">+17.36%</strong> on Gemini 3.1 Flash Lite (p &lt; 0.0001, confirmed in 4 of 6 models). Distillation drops exact constraint formulas.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-fuchsia-300">PROMPT BLOAT &amp; SYNTAX SENSITIVITY</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-950/60 text-fuchsia-300 border border-fuchsia-500/30">21.7% DDL CRASHES</span>
                  </div>
                  <p className="text-zinc-300">
                    Injecting all 34 organizational rules into prompts induces DDL syntax crashes on prompt-sensitive models (26 crashes on Gemini 3.1 Flash Lite; 83 crashes under Placebo on GLM-5.3). Selective retrieval of top-10 rules avoids bloat and rescues performance (C0 beats B by <strong className="text-white">+7.93%</strong> on Gemini 3.1 Flash Lite).
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-cyan-300">AST VERIFIER RELIABILITY</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">100% KILL RATE</span>
                  </div>
                  <p className="text-zinc-300">
                    The AST Verifier parses candidate DDL into relational trees without execution, detecting constraint naming violations and UUID defaults with zero mutation escape across 100 test fixtures.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-300">PARETO TOKEN EFFICIENCY</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">51.3% SAVINGS</span>
                  </div>
                  <p className="text-zinc-300">
                    Prompt tokens drop from 1,139.2 (Condition B) down to 554.8 (Condition C0) while preserving over 84% of the compliance gain from zero-shot to full static hints.
                  </p>
                </div>
              </div>
            </div>

            {/* Formal Invariant 0 Specification */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">
                FORMAL SPECIFICATION // INVARIANT 0
              </span>
              <pre className="bg-[#020306] p-4 rounded-xl border border-cyan-500/30 text-cyan-300 font-mono text-[11px] overflow-x-auto shadow-inner leading-normal">
{`∀ candidate ∈ LLM.generate(task):
  AST_PASS  = AST.verify(candidate.sql, schema_rules)
  EXEC_PASS = Docker.execute(candidate.sql, role="deployer")
  PROBE_PASS = ∀ fact ∈ BOUND_FACTS: Docker.probe(fact, role="application")
  
  DECISION = AST_PASS ∧ EXEC_PASS ∧ PROBE_PASS
  AUTHORITY(LLM) := ∅
  AUTHORITY(VERIFIER) := {ACCEPT, REJECT}`}
              </pre>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="font-mono text-[10px] text-zinc-500">
              SHA-256 PROVENANCE: 98f10d8e2a... · AXIOM AUTONOMOUS ENGINE
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('Axiom Research Group (2026). Deterministic Authority Separation in Autonomous Relational Engineering.');
                }}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                COPY CITATION
              </button>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-xs font-bold px-4 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              >
                CLOSE SPECIFICATION
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
