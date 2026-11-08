'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import type { CheckpointTrial, DeskData } from '@/lib/desk';

const AxiomAnatomy = dynamic(
  () => import('./AxiomAnatomy').then((mod) => mod.AxiomAnatomy),
  {
    ssr: false,
    loading: () => (
      <div className="axm-360-fallback">
        <span>INITIALIZING AXIOM 360 WEBGL CORE...</span>
      </div>
    ),
  }
);
export { AxiomAnatomy };

interface Subsystem {
  id: string;
  name: string;
  badge: string;
  role: string;
  desc: string;
  file: string;
  color: string;
  accent: string;
  spec: {
    key: string;
    val: string;
  }[];
  codeSnippet: string;
}

const SUBSYSTEMS: Subsystem[] = [
  {
    id: '01',
    name: 'Task Ingress & Bank',
    badge: 'INGRESS',
    role: 'Seeded Problem Synthesizer',
    desc: 'Seeded tasks across train, dev, and test splits with strict schema invariants. Never leaks ground-truth SQL.',
    file: 'scripts/task-bank.ts',
    color: '#a855f7',
    accent: 'rgba(168, 85, 247, 0.2)',
    spec: [
      { key: 'splits', val: '40 train · 40 dev · 120 test' },
      { key: 'seed', val: '0x7fa92e · deterministic' },
      { key: 'features', val: 'k=6 flagged per task' },
    ],
    codeSnippet: 'task = taskBank.sample(split="train", seed=42)\nfeatures = extractFlags(task.schema)',
  },
  {
    id: '02',
    name: 'Model Executor',
    badge: 'GENERATOR',
    role: 'Zero-Temperature Compiler',
    desc: 'An LLM behind an OpenAI-compatible client compiling candidate migration SQL under strict zero temperature.',
    file: 'src/executor.ts',
    color: '#d946ef',
    accent: 'rgba(217, 70, 239, 0.2)',
    spec: [
      { key: 'model', val: 'nemotron-3-ultra' },
      { key: 'temperature', val: '0 (deterministic)' },
      { key: 'timeout', val: '30s per execution' },
    ],
    codeSnippet: 'response = client.chat.completions.create(\n  model="nemotron-3-ultra", temp=0.0\n)',
  },
  {
    id: '03',
    name: 'Oracle Crucible',
    badge: 'CRUCIBLE',
    role: 'Isolated Docker Reactor',
    desc: 'Ground-truth execution reactor. Fresh PostgreSQL 16 container booted per trial with role-separated checks.',
    file: 'scripts/oracle.ts',
    color: '#22d3ee',
    accent: 'rgba(34, 211, 238, 0.2)',
    spec: [
      { key: 'engine', val: 'PostgreSQL 16 in Docker' },
      { key: 'migration role', val: 'deployer (schema DDL)' },
      { key: 'probe role', val: 'application (read/write)' },
    ],
    codeSnippet: 'docker run --rm -e POSTGRES_PASSWORD=secret \\\n  -v /tmp/migration.sql:/init.sql postgres:16',
  },
  {
    id: '04',
    name: 'Verdict Engine',
    badge: 'GATE',
    role: 'Deterministic Fact Prober',
    desc: 'Probes 34 behavioral facts against ground truth. Reports failures as discrete fact IDs and one-line statements, never corrected SQL.',
    file: 'src/verifier.ts',
    color: '#f43f5e',
    accent: 'rgba(244, 63, 94, 0.2)',
    spec: [
      { key: 'probed facts', val: '34 active facts (F-01..F-39)' },
      { key: 'mode', val: 'deterministic (no LLM)' },
      { key: 'output', val: 'fact ID + violation summary' },
    ],
    codeSnippet: 'for fact in BOUND_FACTS:\n  result = probe(fact, role="application")\n  if not result.ok: fail(fact.id)',
  },
  {
    id: '05',
    name: 'Reflexion Advisor',
    badge: 'HEALER',
    role: 'Lesson Distillation Unit',
    desc: 'Distills failure traces into concise architectural rules (<24 words). Written to memory only when retry verification passes.',
    file: 'src/advisor.ts',
    color: '#fbbf24',
    accent: 'rgba(251, 191, 36, 0.2)',
    spec: [
      { key: 'grammar', val: 'WHEN condition -> DO directive' },
      { key: 'max length', val: '< 24 words per lesson' },
      { key: 'criterion', val: 'must pass retry verification' },
    ],
    codeSnippet: 'lesson = advisor.distill(trace, maxWords=24)\nverifyRetry(lesson) or discard(lesson)',
  },
  {
    id: '06',
    name: 'Hygienic Memory',
    badge: 'STORAGE',
    role: 'FIFO Ring Buffer Vault',
    desc: 'Stores only earned lessons that have survived verification. Strictly capped at 25 lessons with LRU eviction and error-code deduplication.',
    file: 'src/memory.ts',
    color: '#34d399',
    accent: 'rgba(52, 211, 153, 0.2)',
    spec: [
      { key: 'capacity', val: '25 lessons (ring buffer)' },
      { key: 'dedup', val: '1 lesson per error code' },
      { key: 'eviction', val: 'oldest by lastUsedAt' },
    ],
    codeSnippet: 'if len(memory.lessons) >= 25:\n  memory.evictOldest(by="lastUsedAt")\nmemory.append(lesson)',
  },
  {
    id: '07',
    name: 'Feature Retrieval',
    badge: 'RETRIEVER',
    role: 'Flag-Overlap Matcher',
    desc: 'Scans the memory snapshot and retrieves the top k=6 lessons ranked by Jaccard overlap against task feature flags before attempt 1.',
    file: 'src/memory.ts',
    color: '#38bdf8',
    accent: 'rgba(56, 189, 248, 0.2)',
    spec: [
      { key: 'top-k', val: 'top 6 lessons injected' },
      { key: 'metric', val: 'Jaccard flag overlap' },
      { key: 'timing', val: 'prior to attempt 1 prompt' },
    ],
    codeSnippet: 'ranked = rankByOverlap(memory, task.flags)\ninjected = ranked[:6]',
  },
  {
    id: '08',
    name: 'Guardrail Pipeline',
    badge: 'FIREWALL',
    role: 'Safety & Budget Interceptor',
    desc: 'Fails closed on daily token budgets, backs off exponential rate limits, and caches model responses via SHA-256 disk hashes.',
    file: 'src/guardrails.ts',
    color: '#eab308',
    accent: 'rgba(234, 179, 8, 0.2)',
    spec: [
      { key: 'disk cache', val: 'sha256(model+sys+usr+temp)' },
      { key: 'budget', val: 'fail-closed daily limit' },
      { key: 'rate limits', val: 'exponential jitter backoff' },
    ],
    codeSnippet: 'cacheKey = sha256(model + system + prompt)\nif hit := cache.get(cacheKey): return hit',
  },
  {
    id: '09',
    name: 'Quarantine Gate',
    badge: 'AUDIT',
    role: 'Candidate Vault Isolation',
    desc: 'Keeps generated rules in quarantine as candidates. Never writes into canonical domain files directly until verified and promoted.',
    file: 'src/promote.ts',
    color: '#94a3b8',
    accent: 'rgba(148, 163, 184, 0.2)',
    spec: [
      { key: 'isolation', val: 'candidates held in isolation' },
      { key: 'rule BN-00', val: '8 canonical agent files invariant' },
      { key: 'promotion', val: 'verifier pass + human approval' },
    ],
    codeSnippet: 'assert rule not in CANONICAL_VAULT\nquarantine.hold(candidate, conf=clamp(conf,2))',
  },
];

export function AnatomySection({
  checkpoint,
  desk,
  running,
  snapshot,
}: {
  checkpoint?: CheckpointTrial[];
  desk?: DeskData;
  running?: boolean;
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
} = {}) {
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('03'); // Default to Oracle Crucible

  const activeModel = snapshot?.model ?? (snapshot?.runId === 'gemma-1' ? 'google/gemma-4-31b-it' : 'nvidia/nemotron-3-ultra-550b-a55b');

  const subsystems = React.useMemo(() => {
    return SUBSYSTEMS.map((sub) => {
      if (sub.id === '02') {
        return {
          ...sub,
          spec: [
            { key: 'model', val: activeModel },
            { key: 'temperature', val: '0 (deterministic)' },
            { key: 'timeout', val: '30s per execution' },
          ],
          codeSnippet: `response = client.chat.completions.create(\n  model="${activeModel}", temp=0.0\n)`,
        };
      }
      return sub;
    });
  }, [activeModel]);

  return (
    <section className="anatomy-section" aria-labelledby="anatomy-title">
      {/* ---------- Intro Title ---------- */}
      <div className="anatomy-section__intro">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '4px',
            border: snapshot?.awaiting
              ? '1px solid rgba(251, 191, 36, 0.5)'
              : snapshot?.isLive
              ? '1px solid rgba(52, 211, 153, 0.4)'
              : '1px solid rgba(168, 85, 247, 0.4)',
            color: snapshot?.awaiting ? '#fbbf24' : snapshot?.isLive ? '#34d399' : '#d8b4fe',
            background: 'rgba(5, 6, 10, 0.7)',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}>
            {snapshot?.awaiting
              ? `AWAITING SNAPSHOT // ${snapshot.runId}`
              : snapshot?.isLive
              ? '● LIVE RUN'
              : `SNAPSHOT // ${snapshot?.runId ?? 'nemotron-1'} @ ${snapshot?.commit ?? '7ebae83'}`}
          </span>
        </div>
        <p className="anatomy-section__eyebrow">The system behind the signal</p>
        <h2 id="anatomy-title">Anatomy of Axiom</h2>
        <p>Axiom is a machine for testing generated migrations against rules that are not visible to the model.</p>
        <p>Every failure becomes evidence, and only evidence that survives a retry can become memory.</p>
      </div>

      {/* ---------- 3D Motherboard Workbench Stage ---------- */}
      <div className="anatomy-frame">
        <AxiomAnatomy checkpoint={checkpoint} desk={desk} running={running} snapshot={snapshot} />
      </div>

      {/* =========================================================================
          HIGH-TECH PIPELINE BREAKDOWN (Directly Inspired by User Reference Images)
          ========================================================================= */}
      <div className="axm-pipeline-card" role="region" aria-label="Axiom 3-Tier Policy & Execution Pipeline">
        <div className="axm-pipeline-head">
          <div className="axm-pipe-tag">
            <span className="axm-pipe-dot" />
            <span>SYS//AXIOM-REFLX-V2 · ARCHITECTURAL EXECUTION PIPELINE</span>
          </div>
          <div className="axm-pipe-status">
            <span>DETERMINISTIC VERIFICATION</span>
            <b>ZERO SQL LEAKS</b>
          </div>
        </div>

        {/* 3-Box Flow Grid (Image 2 Replica) */}
        <div className="axm-pipe-flow">
          {/* BOX 01: INGRESS */}
          <div className="axm-pipe-box axm-box-ingress">
            <div className="axm-pipe-chip">
              <span>&gt;_ INGRESS &amp; TASK BANK</span>
              <span className="axm-chip-dot" />
            </div>
            <div className="axm-pipe-label">BOX 01 // INGRESS</div>
            <h3 className="axm-pipe-title">Task Ingress &amp; Seed Synthesizer</h3>
            <p className="axm-pipe-desc">
              Partitioned seeded tasks with strict schema variants and role-separated execution contexts.
            </p>

            <div className="axm-pipe-codeblock">
              <div className="axm-code-comment">// Task Ingress Spec:</div>
              <div className="axm-code-line"><span>splits:</span> <b className="tok-str">&quot;40 train · 40 dev · 120 test&quot;</b></div>
              <div className="axm-code-line"><span>isolation:</span> <b className="tok-val">&quot;docker-pg16-isolated&quot;</b></div>
              <div className="axm-code-line"><span>guardrails:</span> <b className="tok-key">&quot;sha256-cache + budget&quot;</b></div>
            </div>

            <div className="axm-pipe-footer">
              <span className="axm-check-icon">✓</span>
              <span>Enforcing Point Active</span>
            </div>
          </div>

          {/* Dotted Signal Bus Line 1 */}
          <div className="axm-pipe-bus">
            <div className="axm-bus-line">
              <span className="axm-bus-pulse pulse-1" />
            </div>
          </div>

          {/* BOX 02: POLICY DECISION POINT (Center Diamond Hub) */}
          <div className="axm-pipe-center">
            <div className="axm-diamond-hub">
              <div className="axm-diamond-inner">
                <div className="axm-diamond-content">
                  <div className="axm-diamond-icon">⚡</div>
                  <div className="axm-diamond-sub">AXIOM KERNEL</div>
                  <div className="axm-diamond-title">Reflexion Router</div>
                  <div className="axm-diamond-desc">Cost &amp; Invariant Matrix</div>
                </div>
              </div>
            </div>
            <div className="axm-diamond-label">BOX 02 // POLICY DECISION POINT</div>
          </div>

          {/* Dotted Signal Bus Line 2 */}
          <div className="axm-pipe-bus">
            <div className="axm-bus-line">
              <span className="axm-bus-pulse pulse-2" />
            </div>
          </div>

          {/* BOX 03: 3-TIER EXECUTION */}
          <div className="axm-pipe-box axm-box-execution">
            <div className="axm-pipe-exec-head">
              <span className="axm-pipe-label">BOX 03 // 3-TIER EXECUTION</span>
              <span className="axm-exec-sub">TARGET RESOLUTION</span>
            </div>

            {/* Stack of 3 High-Tech Tier Cards */}
            <div className="axm-tiers-stack">
              {/* Tier 1: Local Deterministic Oracle */}
              <div className="axm-tier-card tier-1">
                <div className="axm-tier-head">
                  <b>Tier 1 · Deterministic Oracle</b>
                  <span className="axm-tier-metric">&lt;15ms · $0.00</span>
                </div>
                <p>PostgreSQL 16 in Docker. Fresh database per trial; role deployer migration, role application probe.</p>
              </div>

              {/* Tier 2: Fast Reflexion Advisor */}
              <div className="axm-tier-card tier-2">
                <div className="axm-tier-head">
                  <b>Tier 2 · Fast Reflexion Advisor</b>
                  <span className="axm-tier-metric">~1.2s · Low</span>
                </div>
                <p>Distills failure traces into compact lessons (&lt;24 words). Tested on retry before candidate admission.</p>
              </div>

              {/* Tier 3: Quarantine & Promotion Gate */}
              <div className="axm-tier-card tier-3">
                <div className="axm-tier-head">
                  <b>Tier 3 · Quarantine Gate</b>
                  <span className="axm-tier-metric">Deep Audit</span>
                </div>
                <p>Candidates held in strict quarantine. Only promoted into canonical vault after human sign-off (BN-00).</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          9-SUBSYSTEM ARCHITECTURAL BREAKDOWN CARDS (Replacing Plain Text List)
          ========================================================================= */}
      <div className="axm-breakdown-section">
        <div className="axm-breakdown-header">
          <div>
            <span className="axm-breakdown-tag">// MODULAR SUBSYSTEM BREAKDOWN</span>
            <h3>Nine Invariant Assemblies of Axiom</h3>
          </div>
          <p className="axm-breakdown-lead">
            Every assembly is decoupled, testable, and guaranteed against non-deterministic drift. Select any subsystem to inspect specs and execution commands.
          </p>
        </div>

        {/* 9 Subsystem Architectural Cards in a Sleek, Compact 3x3 Grid */}
        <div className="axm-subsystems-grid">
          {subsystems.map((sub) => {
            const isSelected = selectedSubsystem === sub.id;
            return (
              <div
                key={sub.id}
                className={`axm-sub-card ${isSelected ? 'is-selected' : ''}`}
                style={{
                  borderColor: isSelected ? sub.color : undefined,
                  boxShadow: isSelected ? `0 0 18px ${sub.accent}` : undefined,
                }}
                onClick={() => setSelectedSubsystem(sub.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedSubsystem(sub.id);
                }}
              >
                {/* Header Row */}
                <div className="axm-sub-head">
                  <div className="axm-sub-num" style={{ color: sub.color }}>
                    {sub.id}
                  </div>
                  <span
                    className="axm-sub-badge"
                    style={{
                      color: sub.color,
                      borderColor: sub.color,
                      background: sub.accent,
                    }}
                  >
                    {sub.badge}
                  </span>
                </div>

                {/* Subsystem Name & Role */}
                <h4 className="axm-sub-title">{sub.name}</h4>
                <div className="axm-sub-role">{sub.role}</div>

                {/* Description */}
                <p className="axm-sub-desc">{sub.desc}</p>

                {/* Key Metric Chips */}
                <div className="axm-sub-chips">
                  {sub.spec.slice(0, 2).map((sp) => (
                    <span key={sp.key} className="axm-sub-chip">
                      {sp.val}
                    </span>
                  ))}
                  <span className="axm-sub-chip mono" style={{ color: sub.color }}>
                    {sub.file}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Contextual Inspector Console for Selected Subsystem */}
        {(() => {
          const activeSub = subsystems.find((s) => s.id === selectedSubsystem) || subsystems[2];
          return (
            <div
              className="axm-inspector-console"
              style={{
                borderColor: activeSub.color,
                boxShadow: `0 0 24px ${activeSub.accent}`,
              }}
            >
              <div className="axm-inspector-head">
                <span className="axm-inspector-id" style={{ color: activeSub.color }}>
                  ASSEMBLY {activeSub.id} // {activeSub.badge}
                </span>
                <span className="axm-inspector-name">
                  {activeSub.name} · {activeSub.role}
                </span>
                <span className="axm-inspector-file mono">[{activeSub.file}]</span>
              </div>

              <div className="axm-inspector-body">
                <div className="axm-inspector-specs">
                  {activeSub.spec.map((sp) => (
                    <div key={sp.key} className="axm-spec-row">
                      <span>{sp.key}</span>
                      <b>{sp.val}</b>
                    </div>
                  ))}
                </div>
                <div className="axm-sub-code">
                  <div className="axm-sub-code-head">
                    <span>EXECUTION SPECIFICATION</span>
                    <span className="axm-code-dot" style={{ background: activeSub.color }} />
                  </div>
                  <pre className="mono">{activeSub.codeSnippet}</pre>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
