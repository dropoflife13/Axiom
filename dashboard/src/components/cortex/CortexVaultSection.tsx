'use client';

import React, { useState } from 'react';
import './cortex.css';

interface TagItem {
  id: string;
  name: string;
  role: string;
  spec?: string;
}

const BRAIN_VAULT_FILES: TagItem[] = [
  { id: 'about-me', name: 'ABOUT-ME.MD', role: 'Identity, operational parameters & system owner mandate' },
  { id: 'taste', name: 'TASTE.MD', role: 'Architectural aesthetics, elegance constraints & code density' },
  { id: 'principles', name: 'OPERATING-PRINCIPLES.MD', role: 'Core operating axioms & non-negotiable directives' },
  { id: 'heuristics', name: 'HEURISTICS.MD', role: 'Fast decision trees for trade-offs & edge cases' },
  { id: 'patterns', name: 'PATTERNS.MD', role: 'Proven structural motifs & schema invariants' },
  { id: 'red-flags', name: 'RED-FLAGS.MD', role: 'Anti-patterns, destructive DDL rules & immediate failure triggers' },
  { id: 'conventions', name: 'CONVENTIONS.MD', role: 'Strict schema naming standards & migration metadata rules' },
];

const INITIAL_DOMAINS: TagItem[] = [
  { id: 'cybersec', name: 'CYBERSEC', role: 'CS-01..CS-12: Zero trust network boundary & secret sanitization', spec: 'Cluster A' },
  { id: 'solutions', name: 'SOLUTIONS', role: 'SO-01..SO-15: Scalable schema migration patterns & rollback safety', spec: 'Cluster A' },
  { id: 'ui-frontend', name: 'UI-FRONTEND', role: 'UI-01..UI-16: High-density cockpit telemetry & layout coherence', spec: 'Cluster A' },
  { id: 'law', name: 'LAW', role: 'LAW-01..LAW-08: Statutory compliance, audit trail & legal provenance', spec: 'Cluster B' },
  { id: 'finance', name: 'FINANCE', role: 'FIN-01..FIN-10: ACID transactional integrity & double-entry precision', spec: 'Cluster B' },
  { id: 'economy', name: 'ECONOMY', role: 'ECO-01..ECO-06: Resource allocation, token budget & game theoretic equilibrium', spec: 'Cluster B' },
  { id: 'psychology', name: 'PSYCHOLOGY', role: 'PSY-01..PSY-08: Cognitive load limits & operator feedback cadence', spec: 'Cluster C' },
  { id: 'philosophy', name: 'PHILOSOPHY', role: 'PHI-01..PHI-05: Epistemological ground-truth & deterministic verification', spec: 'Cluster C' },
  { id: 'medicine', name: 'MEDICINE', role: 'MED-01..MED-06: High-reliability safety margins & fail-closed states', spec: 'Cluster C' },
  { id: 'science', name: 'SCIENCE', role: 'SCI-01..SCI-09: Empirical hypothesis falsification & reproducible evidence', spec: 'Cluster C' },
  { id: 'history', name: 'HISTORY', role: 'HIS-01..HIS-04: Version provenance & historical migration lineage', spec: 'Cluster C' },
  { id: 'crypto', name: 'CRYPTO', role: 'CRY-01..CRY-07: Cryptographic SHA-256 verification & immutable ledgers', spec: 'Cluster D' },
  { id: 'geopolitics', name: 'GEOPOLITICS', role: 'GEO-01..GEO-05: Sovereign tenant isolation & cross-border boundary rules', spec: 'Cluster D' },
  { id: 'authorization', name: 'AUTHORIZATION', role: 'AUTH-01..AUTH-12: Role-separated deployer vs application RBAC', spec: 'Cluster D' },
];

const EXTRA_DOMAINS: TagItem[] = [
  { id: 'arbiter', name: 'ARBITER', role: 'ARB-01..ARB-08: Cross-domain conflict resolution & final truth arbiter', spec: 'Cluster A' },
  { id: 'art', name: 'ART', role: 'ART-01..ART-03: Visual hierarchy, contrast ratio & typography discipline', spec: 'Cluster C' },
  { id: 'business', name: 'BUSINESS', role: 'BIZ-01..BIZ-06: Unit economics, SLA thresholds & operational velocity', spec: 'Cluster B' },
  { id: 'business-analysis', name: 'BUSINESS-ANALYSIS', role: 'BA-01..BA-08: Requirement formalization & requirement traceability', spec: 'Cluster B' },
  { id: 'data-science', name: 'DATA-SCIENCE', role: 'DS-01..DS-09: Statistical significance testing & Holm-Bonferroni correction', spec: 'Cluster C' },
  { id: 'education', name: 'EDUCATION', role: 'EDU-01..EDU-05: Distilled Reflexion memory onboarding & lesson retention', spec: 'Cluster C' },
  { id: 'empathy-personas', name: 'EMPATHY-PERSONAS', role: 'EMP-01..EMP-04: Operator mental models & error diagnostics empathy', spec: 'Cluster C' },
  { id: 'environment', name: 'ENVIRONMENT', role: 'ENV-01..ENV-04: Clean sandbox teardown & ephemeral container life-cycles', spec: 'Cluster D' },
  { id: 'health', name: 'HEALTH', role: 'HLT-01..HLT-05: Circuit breaker state monitoring & heartbeat telemetry', spec: 'Cluster C' },
  { id: 'literature', name: 'LITERATURE', role: 'LIT-01..LIT-03: Precise grammatical specifications & unambiguous docstrings', spec: 'Cluster C' },
  { id: 'management', name: 'MANAGEMENT', role: 'MGT-01..MGT-06: Task dependency trees & parallel execution queues', spec: 'Cluster B' },
  { id: 'marketing', name: 'MARKETING', role: 'MKT-01..MKT-04: Clear signal transmission & zero-hype technical transparency', spec: 'Cluster B' },
  { id: 'news', name: 'NEWS', role: 'NWS-01..NWS-03: Real-time checkpoint event broadcasting & telemetry streaming', spec: 'Cluster C' },
  { id: 'politics', name: 'POLITICS', role: 'POL-01..POL-05: Multi-agent consensus mechanisms & quorum voting', spec: 'Cluster D' },
  { id: 'rhetoric', name: 'RHETORIC', role: 'RHE-01..RHE-04: Crisp rationale articulation & refusal justification', spec: 'Cluster C' },
];

const AGENTS: TagItem[] = [
  { id: 'pm', name: 'PM', role: 'Product Manager Agent — Mandates user empathy, scope constraints & problem formulation' },
  { id: 'ux', name: 'UX', role: 'UI/UX Agent — Enforces the 5-second cognitive rule, ergonomic telemetry & accessibility' },
  { id: 'gr', name: 'GR', role: 'Growth Agent — Guards viral loops, conversion funnels & latency benchmarks' },
  { id: 'sd', name: 'SD', role: 'Systems Design Agent — Architect of distributed reliability, partition tolerance & caches' },
  { id: 'ir', name: 'IR', role: 'Integration Agent — Manages third-party APIs, contract testing & idempotent webhooks' },
  { id: 'db', name: 'DB', role: 'Database Administrator Agent — Zero-downtime DDL, locking boundaries & index safety' },
  { id: 'sec', name: 'SEC', role: 'Security Agent — Role-separated RBAC, secret containment & SQL injection gates' },
  { id: 'rs', name: 'RS', role: 'Research Agent — Literature baseline validation, p-value verification & citations' },
  { id: 'arb', name: 'ARB', role: 'The Arbiter — Deterministic supreme court that adjudicates cross-domain rule conflicts' },
];

export function CortexVaultSection() {
  const [showAllDomains, setShowAllDomains] = useState(false);
  const [activeItem, setActiveItem] = useState<TagItem | null>(null);

  const displayedDomains = showAllDomains
    ? [...INITIAL_DOMAINS, ...EXTRA_DOMAINS]
    : INITIAL_DOMAINS;

  return (
    <section className="cortex-section" id="cortex-vault" aria-labelledby="cortex-title">
      <div className="cortex-bg-grid" aria-hidden="true" />
      <div className="cortex-bg-glow" aria-hidden="true" />

      <div className="cortex-container">
        {/* Section Header */}
        <div className="cortex-header">
          <div className="cortex-chip">
            <span className="cortex-chip-dot" />
            <span>TOPOLOGY // ARCHITECTURAL KNOWLEDGE VAULT</span>
          </div>
          <p className="cortex-eyebrow">The Invariant Core Behind the Signal</p>
          <h2 className="cortex-title" id="cortex-title">Cortex Architecture &amp; Invariant Vault</h2>
          <p className="cortex-desc">
            Axiom decouples LLM generation from deterministic truth. The Cortex core organizes
            declarative architectural knowledge into three strict layers: the ground-truth Markdown Vault,
            29 invariant knowledge domains, and 8 specialist gatekeeper agents under the Arbiter.
          </p>
        </div>

        {/* Interactive Layout Stage */}
        <div className="cortex-stage">
          {/* Column 1: Cortex Core Node */}
          <div className="cortex-node-col">
            <div className="cortex-core-wrapper">
              <div className="cortex-orbit-ring" aria-hidden="true" />
              <div className="cortex-orbit-ring cortex-orbit-ring--wide" aria-hidden="true" />
              <div
                className="cortex-core-sphere"
                role="button"
                tabIndex={0}
                aria-label="Cortex Core Central Hub"
                onClick={() =>
                  setActiveItem({
                    id: 'core',
                    name: 'CORTEX CORE',
                    role: 'Autonomous knowledge graph linking plain Markdown to deterministic runtime verification.',
                  })
                }
              >
                {/* Clean Brain SVG Icon */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="cortex-brain-icon"
                >
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" />
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" />
                </svg>
              </div>
              <span className="cortex-core-label">CORTEX CORE</span>
            </div>
          </div>

          {/* Column 2: Animated SVG Connecting Bus Lines (Desktop) */}
          <div className="cortex-bus-col" aria-hidden="true">
            <svg className="cortex-bus-svg" viewBox="0 0 100 480" preserveAspectRatio="none">
              {/* Bus Line to Layer 01 (top) */}
              <path d="M 0 240 C 50 240, 50 80, 100 80" className="cortex-bus-path" />
              <circle cx="100" cy="80" r="3.5" className="cortex-bus-node" />

              {/* Bus Line to Layer 02 (middle) */}
              <path d="M 0 240 C 50 240, 50 240, 100 240" className="cortex-bus-path cortex-bus-path--active" />
              <circle cx="100" cy="240" r="4" className="cortex-bus-node" />

              {/* Bus Line to Layer 03 (bottom) */}
              <path d="M 0 240 C 50 240, 50 400, 100 400" className="cortex-bus-path" />
              <circle cx="100" cy="400" r="3.5" className="cortex-bus-node" />
            </svg>
          </div>

          {/* Column 3: The 3 Stacked Cards (Exact replica of User Design) */}
          <div className="cortex-cards-col">
            {/* LAYER 01: The Brain Vault */}
            <div className="cortex-card" style={{ '--card-accent': '#38bdf8' } as React.CSSProperties}>
              <div className="cortex-card-head">
                <div>
                  <span className="cortex-layer-tag">LAYER 01</span>
                  <h3 className="cortex-card-title">The Brain Vault</h3>
                </div>
                <div className="cortex-card-icon" title="Markdown Vault Documents">
                  {/* File/Doc SVG */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
              </div>
              <p className="cortex-card-sub">Plain Markdown. Your files are the database.</p>
              <div className="cortex-chips-wrap">
                {BRAIN_VAULT_FILES.map((f) => (
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

            {/* LAYER 02: The 29 Domains */}
            <div className="cortex-card" style={{ '--card-accent': '#22d3ee' } as React.CSSProperties}>
              <div className="cortex-card-head">
                <div>
                  <span className="cortex-layer-tag">LAYER 02</span>
                  <h3 className="cortex-card-title">The 29 Domains</h3>
                </div>
                <div className="cortex-card-icon" title="Invariant Domain Clusters">
                  {/* Stacked Layers SVG */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
              </div>
              <p className="cortex-card-sub">4 clusters of invariants.</p>
              <div className="cortex-chips-wrap">
                {displayedDomains.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`cortex-tag ${activeItem?.id === d.id ? 'is-active' : ''}`}
                    onClick={() => setActiveItem(d)}
                  >
                    {d.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="cortex-tag cortex-tag-more"
                  onClick={() => setShowAllDomains(!showAllDomains)}
                  aria-expanded={showAllDomains}
                >
                  {showAllDomains ? 'COLLAPSE ⌃' : '+15 MORE'}
                </button>
              </div>
            </div>

            {/* LAYER 03: 8 Agents & the Arbiter */}
            <div className="cortex-card" style={{ '--card-accent': '#a855f7' } as React.CSSProperties}>
              <div className="cortex-card-head">
                <div>
                  <span className="cortex-layer-tag">LAYER 03</span>
                  <h3 className="cortex-card-title">8 Agents &amp; the Arbiter</h3>
                </div>
                <div className="cortex-card-icon" title="Deterministic Gate Enforcement">
                  {/* Shield / Gate SVG */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
              </div>
              <p className="cortex-card-sub">Gate Mode. Violations output GATE: FAIL.</p>
              <div className="cortex-chips-wrap">
                {AGENTS.map((a) => (
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
                <div className="cortex-detail-badge">INVARIANT ACTIVE</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
