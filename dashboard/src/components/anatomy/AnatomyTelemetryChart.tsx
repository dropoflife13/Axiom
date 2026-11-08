'use client';

import React, { useMemo, useState } from 'react';
import type { CheckpointTrial } from '@/lib/desk';

interface ConditionBenchmark {
  condition: string;
  name: string;
  role: string;
  compliance: number; // percentage (0-100)
  strictPass: number; // percentage (0-100)
  tokens: number;
  color: string;
  accent: string;
  delta: string;
  isHero?: boolean;
}

const BENCHMARK_DEFAULTS: ConditionBenchmark[] = [
  {
    condition: 'A',
    name: 'Zero-Shot Baseline',
    role: 'Raw model · No memory · No hints',
    compliance: 46.31,
    strictPass: 3.33,
    tokens: 247,
    color: '#94a3b8',
    accent: 'rgba(148, 163, 184, 0.25)',
    delta: 'BASELINE',
  },
  {
    condition: 'B',
    name: 'Static Invariant Hints',
    role: 'Full rule text · Fixed context',
    compliance: 65.2,
    strictPass: 18.33,
    tokens: 512,
    color: '#38bdf8',
    accent: 'rgba(56, 189, 248, 0.25)',
    delta: '+18.89%',
  },
  {
    condition: 'C',
    name: 'Reflexion Memory (K=10)',
    role: 'Targeted retrieval · FIFO ring buffer',
    compliance: 71.65,
    strictPass: 25.0,
    tokens: 488,
    color: '#22d3ee',
    accent: 'rgba(34, 211, 238, 0.35)',
    delta: '+25.35% ★',
    isHero: true,
  },
  {
    condition: 'C0',
    name: 'Ephemeral Reflexion',
    role: 'Retry loop · Non-persisted lessons',
    compliance: 62.4,
    strictPass: 14.17,
    tokens: 492,
    color: '#fbbf24',
    accent: 'rgba(251, 191, 36, 0.25)',
    delta: '+16.09%',
  },
  {
    condition: 'D',
    name: 'Placebo Distractor',
    role: 'Generic Postgres tips · Controls prompt volume',
    compliance: 49.5,
    strictPass: 3.33,
    tokens: 849,
    color: '#a855f7',
    accent: 'rgba(168, 85, 247, 0.25)',
    delta: '+3.19%',
  },
  {
    condition: 'E_B',
    name: 'Adversarial Invariant Stress',
    role: 'Negative control & schema perturbations',
    compliance: 58.75,
    strictPass: 11.67,
    tokens: 530,
    color: '#f43f5e',
    accent: 'rgba(244, 63, 94, 0.25)',
    delta: '+12.44%',
  },
];

export interface AnatomyTelemetryChartProps {
  checkpoint?: CheckpointTrial[];
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
  activeModel?: string;
}

export function AnatomyTelemetryChart({
  checkpoint = [],
  snapshot,
  activeModel,
}: AnatomyTelemetryChartProps) {
  const [activeTab, setActiveTab] = useState<'conditions' | 'delta'>('conditions');

  // Dynamically calculate live condition stats if checkpoint trials exist
  const conditionStats = useMemo(() => {
    if (!checkpoint || checkpoint.length === 0) {
      return BENCHMARK_DEFAULTS;
    }

    const counts: Record<string, { total: number; passed: number; fractionSum: number; tokenSum: number }> = {};
    for (const b of BENCHMARK_DEFAULTS) {
      counts[b.condition] = { total: 0, passed: 0, fractionSum: 0, tokenSum: 0 };
    }

    for (const t of checkpoint) {
      if (counts[t.condition]) {
        counts[t.condition].total++;
        if (t.boundPassed) counts[t.condition].passed++;
        counts[t.condition].fractionSum += t.boundFactFraction ?? 0;
        counts[t.condition].tokenSum += t.totalTokens ?? 0;
      }
    }

    const hasLiveConditionData = Object.values(counts).some((c) => c.total > 0);
    if (!hasLiveConditionData) {
      return BENCHMARK_DEFAULTS;
    }

    const baseCompliance =
      counts['A'] && counts['A'].total > 0
        ? (counts['A'].fractionSum / counts['A'].total) * 100
        : BENCHMARK_DEFAULTS[0].compliance;

    return BENCHMARK_DEFAULTS.map((b) => {
      const live = counts[b.condition];
      if (!live || live.total === 0) return b;

      const compliance = (live.fractionSum / live.total) * 100;
      const strictPass = (live.passed / live.total) * 100;
      const avgTokens = Math.round(live.tokenSum / live.total);
      const diff = compliance - baseCompliance;
      const deltaStr =
        b.condition === 'A'
          ? 'BASELINE'
          : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%${b.isHero ? ' ★' : ''}`;

      return {
        ...b,
        compliance: Math.round(compliance * 10) / 10,
        strictPass: Math.round(strictPass * 10) / 10,
        tokens: avgTokens || b.tokens,
        delta: deltaStr,
      };
    });
  }, [checkpoint]);

  const modelLabel =
    activeModel?.split('/').pop()?.toUpperCase() ??
    (snapshot?.runId === 'qwen27b-1' ? 'QWEN 3.8 27B' : 'NEMOTRON 550B');

  const isLive = snapshot?.isLive;
  const isAwaiting = snapshot?.awaiting;

  return (
    <div className="axm-telemetry-box" role="region" aria-label="Axiom Empirical Benchmark Telemetry">
      <div className="axm-telemetry-head">
        <div className="axm-telemetry-badge-wrap">
          <span className="axm-telemetry-pill">
            <span className={`axm-pill-dot ${isLive ? 'is-live' : ''}`} />
            {isAwaiting ? 'AWAITING RUN' : isLive ? 'LIVE REPLAY STREAM' : 'VERIFIED 720 PROTOCOL'}
          </span>
          <span className="axm-telemetry-model">{modelLabel}</span>
        </div>

        {/* View Switcher */}
        <div className="axm-telemetry-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'conditions'}
            className={`axm-tab-btn ${activeTab === 'conditions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('conditions')}
          >
            CONDITIONS (6)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'delta'}
            className={`axm-tab-btn ${activeTab === 'delta' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('delta')}
          >
            DELTA (+25.4%)
          </button>
        </div>
      </div>

      {activeTab === 'conditions' ? (
        <div className="axm-cond-grid">
          {conditionStats.map((item) => (
            <div
              key={item.condition}
              className={`axm-cond-row ${item.isHero ? 'is-hero' : ''}`}
              style={{ '--cond-color': item.color, '--cond-accent': item.accent } as React.CSSProperties}
            >
              <div className="axm-cond-meta">
                <div className="axm-cond-tag-wrap">
                  <span className="axm-cond-tag">{item.condition}</span>
                  <span className="axm-cond-name">{item.name}</span>
                </div>
                <div className="axm-cond-stats">
                  <span className="axm-cond-tok">{item.tokens} tok</span>
                  <span className="axm-cond-val">{item.compliance.toFixed(1)}%</span>
                  <span className={`axm-cond-delta ${item.isHero ? 'is-hero' : ''}`}>{item.delta}</span>
                </div>
              </div>

              {/* Progress Bar with Cap Glow */}
              <div className="axm-cond-bar-track">
                <div
                  className="axm-cond-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(5, item.compliance))}%` }}
                >
                  <span className="axm-cond-bar-glow" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Delta Comparison Mode: Visualizing H1 and H2 Statistical Gains */
        <div className="axm-delta-panel">
          <div className="axm-delta-headline">
            <div className="axm-delta-stat">
              <span className="axm-delta-label">PRIMARY EMPIRICAL GAIN</span>
              <b className="axm-delta-big">+25.35%</b>
              <span className="axm-delta-sub">Bound-fact compliance (71.7% vs 46.3%)</span>
            </div>
            <div className="axm-delta-stat">
              <span className="axm-delta-label">STRICT PASS@1 MULTIPLIER</span>
              <b className="axm-delta-big" style={{ color: '#34d399' }}>7.5×</b>
              <span className="axm-delta-sub">3.33% zero-shot → 25.00% Reflexion</span>
            </div>
            <div className="axm-delta-stat">
              <span className="axm-delta-label">SYNTAX FAILURES</span>
              <b className="axm-delta-big" style={{ color: '#fbbf24' }}>-76%</b>
              <span className="axm-delta-sub">Non-zero exits drop 34 → 8</span>
            </div>
          </div>

          {/* SVG Comparative Lift Histogram */}
          <div className="axm-delta-svg-wrap">
            <svg viewBox="0 0 460 76" className="axm-delta-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="axm-grad-lift" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="40%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
                <linearGradient id="axm-grad-distract" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Baseline A bar */}
              <rect x="10" y="8" width="185" height="14" rx="2" fill="#94a3b8" fillOpacity="0.4" />
              <text x="200" y="19" fill="#94a3b8" fontSize="10" fontFamily="monospace">46.3% · COND A (Zero-Shot)</text>

              {/* Distractor D bar */}
              <rect x="10" y="30" width="198" height="14" rx="2" fill="url(#axm-grad-distract)" />
              <text x="213" y="41" fill="#c084fc" fontSize="10" fontFamily="monospace">49.5% · COND D (+3.2% Placebo Tokens)</text>

              {/* Reflexion C bar */}
              <rect x="10" y="52" width="286" height="16" rx="2" fill="url(#axm-grad-lift)" />
              <text x="302" y="64" fill="#22d3ee" fontSize="11" fontWeight="bold" fontFamily="monospace">
                71.7% · COND C (+25.4% Axiom)
              </text>
            </svg>
          </div>

          <div className="axm-delta-proof">
            <span>PROOF: p = 1.00e-5 (paired sign-flip) · Holm p = 4.00e-5 · Exact McNemar p = 6.16e-6</span>
          </div>
        </div>
      )}

      {/* Footer Metrics Row */}
      <div className="axm-telemetry-foot">
        <div className="axm-foot-item">
          <span className="axm-foot-dot" style={{ background: '#22d3ee' }} />
          <span>INVARIANTS: <b>34 PROBED</b></span>
        </div>
        <div className="axm-foot-item">
          <span className="axm-foot-dot" style={{ background: '#34d399' }} />
          <span>CONFIDENCE: <b>p &lt; 0.0001</b></span>
        </div>
        <div className="axm-foot-item">
          <span className="axm-foot-dot" style={{ background: '#fbbf24' }} />
          <span>MEMORY CAP: <b>25 RING BUFFER</b></span>
        </div>
        <div className="axm-foot-item">
          <span className="axm-foot-dot" style={{ background: '#a855f7' }} />
          <span>ORACLE: <b>POSTGRES 16 DOCKER</b></span>
        </div>
      </div>
    </div>
  );
}
