'use client';

import React from 'react';
import { AxiomLogo } from '../AxiomLogo';
import './footer.css';

export function AxiomFooter() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="axm-footer" role="contentinfo" aria-label="Axiom System Footer">
      <div className="axm-footer-grid-bg" aria-hidden="true" />

      <div className="axm-footer-container">
        {/* Top Section */}
        <div className="axm-footer-top">
          {/* Brand Col */}
          <div className="axm-footer-brand">
            <div className="axm-footer-logo-row">
              <AxiomLogo size={34} variant="icon" title="Axiom Architectural Verifier" />
              <div className="axm-footer-logo-text">
                <span className="axm-footer-logo-title">AXIOM</span>
                <span className="axm-footer-logo-sub">ARCHITECTURAL VERIFIER</span>
              </div>
            </div>
            <p className="axm-footer-mission">
              A self-healing engine testing candidate migrations against behavioral invariants.
              The deterministic Verifier executes inside isolated PostgreSQL 16 Docker containers
              with zero LLM in the verification loop.
            </p>
            <div className="axm-footer-metrics-strip">
              <span className="axm-footer-metric-pill">720 TRIALS PROVEN</span>
              <span className="axm-footer-metric-pill">34 BOUND FACTS</span>
              <span className="axm-footer-metric-pill">p &lt; 0.0001</span>
            </div>
          </div>

          {/* Col 1: System Topology */}
          <div className="axm-footer-col">
            <h4 className="axm-footer-col-title">System Architecture</h4>
            <ul className="axm-footer-links">
              <li>
                <button type="button" className="axm-footer-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  Healing Loop Telemetry
                </button>
              </li>
              <li>
                <button type="button" className="axm-footer-link" onClick={() => scrollTo('anatomy-title')}>
                  360 Motherboard Workbench
                </button>
              </li>
              <li>
                <button type="button" className="axm-footer-link" onClick={() => scrollTo('cortex-vault')}>
                  Cortex Invariant Vault
                </button>
              </li>
              <li>
                <span className="axm-footer-link">
                  Reflexion Router &amp; Ring Buffer
                </span>
              </li>
            </ul>
          </div>

          {/* Col 2: Invariant Layers */}
          <div className="axm-footer-col">
            <h4 className="axm-footer-col-title">Invariant Layers</h4>
            <ul className="axm-footer-links">
              <li>
                <button type="button" className="axm-footer-link" onClick={() => scrollTo('cortex-vault')}>
                  Layer 01 · The Brain Vault
                </button>
              </li>
              <li>
                <button type="button" className="axm-footer-link" onClick={() => scrollTo('cortex-vault')}>
                  Layer 02 · 29 Knowledge Domains
                </button>
              </li>
              <li>
                <button type="button" className="axm-footer-link" onClick={() => scrollTo('cortex-vault')}>
                  Layer 03 · 8 Agents &amp; Arbiter
                </button>
              </li>
              <li>
                <span className="axm-footer-link">
                  PostgreSQL 16 Ground-Truth Reactor
                </span>
              </li>
            </ul>
          </div>

          {/* Col 3: Research & Specifications */}
          <div className="axm-footer-col">
            <h4 className="axm-footer-col-title">Research &amp; Docs</h4>
            <ul className="axm-footer-links">
              <li>
                <a
                  href="https://github.com/dropoflife13/Axiom/blob/main/docs/AXIOM-PAPER.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="axm-footer-link"
                >
                  Empirical Paper (AXIOM-PAPER.md) ↗
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dropoflife13/Axiom/blob/main/docs/PROJECT.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="axm-footer-link"
                >
                  System Specification (PROJECT.md) ↗
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dropoflife13/Axiom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="axm-footer-link"
                >
                  GitHub Repository (dropoflife13/Axiom) ↗
                </a>
              </li>
              <li>
                <span className="axm-footer-link">
                  Open Source · MIT / Apache 2.0
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="axm-footer-bottom">
          <div className="axm-footer-status">
            <span className="axm-status-dot" />
            <span>ORACLE CRUCIBLE NOMINAL · POSTGRESQL 16 ISOLATED</span>
          </div>

          <div className="axm-footer-copy">
            © 2026 Axiom Project. Deterministic architectural self-healing.
          </div>

          <div className="axm-footer-commit">
            PROTOCOL v2.4.0 · BUILD 0x7fa92e
          </div>
        </div>
      </div>
    </footer>
  );
}
