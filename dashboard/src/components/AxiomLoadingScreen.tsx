'use client';

import * as React from 'react';
import { AxiomKnotLoader } from './loader/AxiomKnotLoader';

export interface AxiomLoadingScreenProps {
  onComplete?: () => void;
  runId?: string;
  model?: string;
  isReady?: boolean;
}

export function AxiomLoadingScreen({
  onComplete,
  runId = 'nemotron-1',
  model = 'nvidia/nemotron-3-ultra-550b-a55b',
  isReady = false,
}: AxiomLoadingScreenProps) {
  const [isExiting, setIsExiting] = React.useState(false);
  const [isDone, setIsDone] = React.useState(false);

  // Check prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mq.matches);
    }
  }, []);

  // When website is ready/loaded, transition out gracefully
  React.useEffect(() => {
    if (!isReady || isExiting || isDone) return;

    // Grace period so the initial loop doesn't flash if data loaded instantly
    const timer = window.setTimeout(() => {
      setIsExiting(true);
      window.setTimeout(() => {
        setIsDone(true);
        onComplete?.();
      }, reducedMotion ? 250 : 850);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [isReady, isExiting, isDone, onComplete, reducedMotion]);

  // Handle immediate skip with Space, Enter, Escape, or Click
  const handleSkip = React.useCallback(() => {
    if (isExiting || isDone) return;
    setIsExiting(true);
    window.setTimeout(() => {
      setIsDone(true);
      onComplete?.();
    }, reducedMotion ? 150 : 700);
  }, [isExiting, isDone, onComplete, reducedMotion]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  if (isDone) return null;

  const activeModelDisplay = model.split('/').pop()?.toUpperCase() ?? 'QWEN 3.8 27B';

  return (
    <aside
      className={`axiom-loader-shroud ${isExiting ? 'is-exiting' : ''} ${reducedMotion ? 'reduced-motion' : ''}`}
      onClick={handleSkip}
      role="status"
      aria-label="Axiom loading"
    >
      <style>{`
        .axiom-loader-shroud {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #05060a;
          color: #f1f5f9;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          overflow: hidden;
          cursor: pointer;
          user-select: none;
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), filter 0.8s ease-out;
        }

        .axiom-loader-shroud.is-exiting {
          opacity: 0;
          filter: blur(14px);
          pointer-events: none;
        }

        .axiom-loader-shroud.reduced-motion.is-exiting {
          opacity: 0;
          filter: none;
          transition: opacity 0.25s linear;
        }

        /* Ambient Cyber Grid & Radial Glow */
        .axiom-loader-bg-glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 45%, rgba(34, 211, 238, 0.16) 0%, rgba(168, 85, 247, 0.1) 35%, transparent 70%),
            radial-gradient(circle at 50% 80%, rgba(217, 70, 239, 0.08) 0%, transparent 60%);
          pointer-events: none;
        }

        .axiom-loader-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 80%);
          pointer-events: none;
        }

        .axiom-loader-scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.25) 0px,
            rgba(0, 0, 0, 0.25) 1px,
            transparent 1px,
            transparent 3px
          );
          pointer-events: none;
          opacity: 0.6;
        }

        /* Central Axiom Core Stage */
        .axiom-loader-core {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 2;
          transform: translateZ(0);
          transition: transform 0.85s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.75s ease-out;
        }

        /* The signature Axiom Zoom-Out animation */
        .axiom-loader-shroud.is-exiting .axiom-loader-core {
          transform: scale(0.32) translateZ(0);
          opacity: 0;
        }

        .axiom-loader-shroud.reduced-motion.is-exiting .axiom-loader-core {
          transform: none;
          opacity: 0;
        }

        .axiom-loader-shroud.reduced-motion .axiom-reticle-outer,
        .axiom-loader-shroud.reduced-motion .axiom-reticle-mid,
        .axiom-loader-shroud.reduced-motion .axiom-reticle-inner,
        .axiom-loader-shroud.reduced-motion .axiom-sonar-pulse {
          animation: none;
          transform: translate(-50%, -50%);
        }

        .axiom-loader-shroud.reduced-motion .axiom-knot-loader {
          animation: none;
        }

        /* Central Brand Mark Container with Concentric Holographic Reticles */
        .axiom-logo-wrapper {
          position: relative;
          width: 170px;
          height: 170px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 76px;
        }

        /* Perfectly Centered Rotating HUD Reticles */
        .axiom-reticle-outer,
        .axiom-reticle-mid,
        .axiom-reticle-inner,
        .axiom-sonar-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .axiom-reticle-outer {
          width: 270px;
          height: 270px;
          border-radius: 50%;
          border: 1px dashed rgba(34, 211, 238, 0.26);
          animation: axiom-spin-cw 24s linear infinite;
        }

        .axiom-reticle-mid {
          width: 215px;
          height: 215px;
          border-radius: 50%;
          border: 1px solid rgba(168, 85, 247, 0.32);
          border-left-color: transparent;
          border-right-color: transparent;
          animation: axiom-spin-ccw 14s linear infinite;
        }

        .axiom-reticle-inner {
          width: 165px;
          height: 165px;
          border-radius: 50%;
          border: 1px dotted rgba(34, 211, 238, 0.45);
          animation: axiom-spin-cw 9s linear infinite;
        }

        .axiom-sonar-pulse {
          width: 130px;
          height: 130px;
          border-radius: 50%;
          border: 1.5px solid rgba(34, 211, 238, 0.65);
          animation: axiom-sonar 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }

        @keyframes axiom-spin-cw {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        @keyframes axiom-spin-ccw {
          from { transform: translate(-50%, -50%) rotate(360deg); }
          to { transform: translate(-50%, -50%) rotate(0deg); }
        }

        @keyframes axiom-sonar {
          0% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
        }

        .axiom-knot-loader {
          position: relative;
          z-index: 3;
          display: block;
          filter: drop-shadow(0 0 25px rgba(34, 211, 238, 0.65)) drop-shadow(0 0 50px rgba(168, 85, 247, 0.45));
          animation: axiom-core-breathe 2.6s ease-in-out infinite alternate;
        }

        @keyframes axiom-core-breathe {
          0% {
            transform: scale(0.97);
            filter: drop-shadow(0 0 20px rgba(34, 211, 238, 0.55)) drop-shadow(0 0 35px rgba(168, 85, 247, 0.35));
          }
          100% {
            transform: scale(1.05);
            filter: drop-shadow(0 0 32px rgba(34, 211, 238, 0.85)) drop-shadow(0 0 65px rgba(168, 85, 247, 0.65));
          }
        }

        /* Brand Typography */
        .axiom-loader-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.38em;
          padding-left: 0.38em;
          color: #ffffff;
          margin: 0;
          text-shadow: 0 0 16px rgba(34, 211, 238, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .axiom-loader-tagline {
          font-size: 10px;
          color: #7dd3fc;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          margin-top: 6px;
          opacity: 0.85;
          text-align: center;
        }

        /* Bottom Corner Telemetry */
        .axiom-loader-footer {
          position: absolute;
          bottom: 24px;
          left: 32px;
          right: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 9px;
          color: #64748b;
          letter-spacing: 0.16em;
          z-index: 2;
        }

        .axiom-skip-prompt {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          transition: color 0.2s;
        }

        .axiom-skip-prompt kbd {
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 3px;
          color: #22d3ee;
          font-size: 8.5px;
        }

        .axiom-loader-shroud:hover .axiom-skip-prompt {
          color: #38bdf8;
        }
      `}</style>

      <div className="axiom-loader-bg-glow" />
      <div className="axiom-loader-grid" />
      <div className="axiom-loader-scanlines" />

      {/* Central Holographic Axiom Stage */}
      <div className="axiom-loader-core">
        <div className="axiom-logo-wrapper">
          <div className="axiom-reticle-outer" />
          <div className="axiom-reticle-mid" />
          <div className="axiom-reticle-inner" />
          <div className="axiom-sonar-pulse" />
          <AxiomKnotLoader
            reducedMotion={reducedMotion}
            size={170}
          />
        </div>

        <h1 className="axiom-loader-title">AXIOM</h1>
        <span className="axiom-loader-tagline">Self-Healing Architectural Verifier</span>
      </div>

      {/* Bottom Corner Telemetry */}
      <footer className="axiom-loader-footer">
        <div>
          <span>SYS//AXIOM-REFLX-V2</span> · <span>TARGET: {activeModelDisplay}</span>
        </div>
        <div className="axiom-skip-prompt">
          <kbd>SPACE</kbd> OR <span>CLICK TO ENTER</span>
        </div>
      </footer>
    </aside>
  );
}

export default AxiomLoadingScreen;
