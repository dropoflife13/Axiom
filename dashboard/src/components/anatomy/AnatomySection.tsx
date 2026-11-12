'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { CheckpointTrial, DeskData } from '@/lib/desk';
import { AIModelsMarquee } from './AIModelsMarquee';

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
  return (
    <section className="anatomy-section" aria-labelledby="anatomy-title">
      {/* Background Cyber Coordinate Grid & Ambient Axiom Knot Watermark */}
      <div className="anatomy-section__bg-grid" aria-hidden="true" />
      <div className="anatomy-section__bg-watermark" aria-hidden="true">
        <img src="/brand/axiom-mark.svg" alt="" className="anatomy-section__bg-axiom-knot" />
      </div>

      {/* ---------- Header Row with Intro Title & AI Models Marquee ---------- */}
      <div className="anatomy-section__header-row">
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

        {/* Open, borderless AI models marquee */}
        <AIModelsMarquee />
      </div>

      {/* ---------- 3D Motherboard Workbench Stage ---------- */}
      <div className="anatomy-frame">
        <AxiomAnatomy checkpoint={checkpoint} desk={desk} running={running} snapshot={snapshot} />
      </div>
    </section>
  );
}
