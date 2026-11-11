'use client';

import * as React from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  BOARD,
  CABLES,
  DESIGN_CONSTANTS,
  NODES,
  NODE_MAP,
  ORACLE_CENTER,
  ROT_X_DEG,
  ROT_Z_DEG,
  STAGES,
  WORK_H,
  project,
  type AssemblyId,
  type NodeSpec,
} from './layout';

/* ---------- Dev-Only Projection Probe (Requirement 10.b) ---------- */
const PROBE_POINTS = [
  { x: 600, y: 600, z: WORK_H },
  { x: 300, y: 300, z: 0 },
  { x: 900, y: 300, z: WORK_H },
  { x: 300, y: 900, z: WORK_H },
  { x: 900, y: 900, z: 48 },
] as const;

function DevProjectionProbe({
  k,
  boardRef,
}: {
  k: number;
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const board = boardRef.current;
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const boardCenter = {
      x: boardRect.left + boardRect.width / 2,
      y: boardRect.top + boardRect.height / 2,
    };

    let maxErr = 0;
    PROBE_POINTS.forEach((pt, i) => {
      const probeEl = document.getElementById(`axmv2-probe-${i}`);
      if (!probeEl) return;
      const r = probeEl.getBoundingClientRect();
      const actualCenter = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };

      const projected = project(pt.x, pt.y, pt.z, k);
      const expectedCenter = {
        x: boardCenter.x + projected.sx,
        y: boardCenter.y + projected.sy,
      };

      const err = Math.hypot(
        actualCenter.x - expectedCenter.x,
        actualCenter.y - expectedCenter.y
      );
      if (err > maxErr) maxErr = err;

      if (err > 1.0) {
        console.error(
          `[AxiomAnatomyV2 Probe Error] Point ${i} (${pt.x}, ${pt.y}, ${pt.z}) differs by ${err.toFixed(2)}px: actual=(${actualCenter.x.toFixed(2)}, ${actualCenter.y.toFixed(2)}) expected=(${expectedCenter.x.toFixed(2)}, ${expectedCenter.y.toFixed(2)})`
        );
      }
    });
  }, [k, boardRef]);

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div
      className="axmv2-probes-container"
      style={{
        position: 'absolute',
        inset: 0,
        transformStyle: 'preserve-3d',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {PROBE_POINTS.map((pt, i) => (
        <div
          key={i}
          id={`axmv2-probe-${i}`}
          style={{
            position: 'absolute',
            left: pt.x,
            top: pt.y,
            width: 1,
            height: 1,
            transform: `translateZ(${pt.z}px)`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

/* ---------- 3D Block Landing Platform Component ---------- */
function Block3D({
  node,
  active,
  explosion,
  onPick,
}: {
  node: NodeSpec;
  active: boolean;
  explosion: number; // 0..1
  onPick: () => void;
}) {
  const exX = node.x + node.explodeOffset[0] * explosion;
  const exY = node.y + node.explodeOffset[1] * explosion;
  const exZ = node.explodeOffset[2] * explosion;

  const hex = node.color;
  const style = {
    '--w': `${node.w}px`,
    '--d': `${node.d}px`,
    '--h': `${node.h}px`,
    '--color': hex,
    '--color-alpha-70': `${hex}b3`,
    '--color-alpha-50': `${hex}80`,
    '--color-alpha-35': `${hex}59`,
    '--color-alpha-30': `${hex}4d`,
    '--color-alpha-20': `${hex}33`,
    '--color-alpha-15': `${hex}26`,
    '--color-alpha-08': `${hex}14`,
    '--color-alpha-05': `${hex}0d`,
    '--color-alpha-03': `${hex}08`,
    transform: `translate3d(${exX}px, ${exY}px, ${exZ}px)`,
  } as React.CSSProperties;

  return (
    <div
      className={`axmv2-block ${active ? 'is-active' : ''}`}
      style={style}
      onClick={onPick}
      role="button"
      tabIndex={0}
      aria-label={`${node.number} ${node.title}: ${node.role}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
    >
      <i className="axmv2-face-left" />
      <i className="axmv2-face-right" />
      <i className="axmv2-face-top">
        {node.id === 'oracle' ? (
          <b className="axmv2-hole" />
        ) : (
          <b className="axmv2-target" />
        )}
      </i>
    </div>
  );
}

/* ---------- Packet Animation on Real SVG Path Component ---------- */
function CablePacket({
  pathD,
  color,
  active,
}: {
  pathD: string;
  color: string;
  active: boolean;
}) {
  const circleRef = React.useRef<SVGCircleElement>(null);

  React.useEffect(() => {
    if (!active) return;
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    probe.setAttribute('d', pathD);
    const totalLen = probe.getTotalLength();

    if (circleRef.current) {
      const p0 = probe.getPointAtLength(0);
      circleRef.current.setAttribute('cx', String(p0.x));
      circleRef.current.setAttribute('cy', String(p0.y));
      circleRef.current.style.opacity = '1';
    }

    const run = animate(0, 1, {
      duration: 1.1,
      ease: 'easeInOut',
      onUpdate: (t) => {
        const p = probe.getPointAtLength(totalLen * t);
        circleRef.current?.setAttribute('cx', String(p.x));
        circleRef.current?.setAttribute('cy', String(p.y));
      },
    });

    return () => run.stop();
  }, [pathD, active]);

  if (!active) return null;

  return (
    <circle
      ref={circleRef}
      r={8}
      cx={ORACLE_CENTER.x}
      cy={ORACLE_CENTER.y}
      fill={color}
      className="axmv2-packet"
      style={{ opacity: 0, transition: 'opacity 0.15s ease-in' }}
    />
  );
}

/* ---------- AxiomAnatomyV2 Main Component ---------- */
export function AxiomAnatomyV2() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const reduceMotion = useReducedMotion();

  const [width, setWidth] = React.useState(1100);
  const [stageIndex, setStageIndex] = React.useState<number | null>(null);
  const [running, setRunning] = React.useState(false);
  const [exploded, setExploded] = React.useState(false);
  const [explosionProgress, setExplosionProgress] = React.useState(0);
  const [inspectedId, setInspectedId] = React.useState<AssemblyId | null>(null);

  // ResizeObserver for uniform board scaling
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animate explosion progress linearly without layout jumps
  React.useEffect(() => {
    const target = exploded ? 1 : 0;
    if (reduceMotion) {
      setExplosionProgress(target);
      return;
    }
    const run = animate(explosionProgress, target, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setExplosionProgress(v),
    });
    return () => run.stop();
  }, [exploded, reduceMotion]);

  // Trial runner sequence through all 7 stages
  React.useEffect(() => {
    if (!running) return;
    const isLast = stageIndex !== null && stageIndex >= STAGES.length - 1;
    const timer = window.setTimeout(
      () => {
        if (isLast) {
          setRunning(false);
          setStageIndex(null);
        } else {
          setStageIndex((prev) => (prev === null ? 0 : prev + 1));
        }
      },
      isLast ? 2200 : 1800
    );
    return () => window.clearTimeout(timer);
  }, [running, stageIndex]);

  const toggleRun = React.useCallback(() => {
    if (running) {
      setRunning(false);
      setStageIndex(null);
    } else {
      setInspectedId(null);
      setStageIndex(0);
      setRunning(true);
    }
  }, [running]);

  const toggleExploded = React.useCallback(() => {
    setExploded((prev) => !prev);
  }, []);

  // Keyboard navigation
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleRun();
      } else if (e.code === 'Space') {
        e.preventDefault();
        toggleExploded();
      } else if (e.key === 'Escape') {
        setInspectedId(null);
        setRunning(false);
        setStageIndex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleRun, toggleExploded]);

  const compact = width < 760;
  // Uniform board scaling capped at 1.2
  const k = Math.min(1.2, Math.max(0.35, width / (compact ? 950 : 1500)));
  const stageHeight = Math.max(480, Math.round(920 * k));

  const activeStage = stageIndex !== null ? STAGES[stageIndex] : null;
  const activeNodeId = activeStage ? activeStage.nodeId : inspectedId;

  // Active status readout
  const statusText = activeStage
    ? `${activeStage.label}: ${activeStage.readout}`
    : inspectedId
    ? `${NODE_MAP[inspectedId].number} ${NODE_MAP[inspectedId].title}: ${NODE_MAP[inspectedId].role}`
    : exploded
    ? 'Exploded view: 9 verified assemblies separated along 3D normals'
    : `Axiom bench · ${DESIGN_CONSTANTS.conditions} conditions × ${DESIGN_CONSTANTS.testTasks} test tasks = ${DESIGN_CONSTANTS.totalTrials} trials · k=${DESIGN_CONSTANTS.retrievalK}`;

  return (
    <div className="axmv2-root" ref={containerRef}>
      {/* ---------- Top Toolbar ---------- */}
      <div className="axmv2-bar" role="toolbar" aria-label="Axiom Anatomy controls">
        <div className="axmv2-actions">
          <button
            type="button"
            className="axmv2-btn axmv2-btn--run"
            onClick={toggleRun}
            data-running={running}
            aria-pressed={running}
          >
            <span className="axmv2-btn__dot" aria-hidden="true" />
            {running ? 'Stop trial' : 'Run one trial'}
            <kbd>R</kbd>
          </button>
          <button
            type="button"
            className={`axmv2-btn ${exploded ? 'axmv2-btn--active' : ''}`}
            onClick={toggleExploded}
            aria-pressed={exploded}
          >
            {exploded ? 'Assemble' : 'Take apart'}
            <kbd>Space</kbd>
          </button>
          {inspectedId && (
            <button
              type="button"
              className="axmv2-btn"
              onClick={() => setInspectedId(null)}
            >
              Clear inspection <kbd>Esc</kbd>
            </button>
          )}
        </div>

        <ol className="axmv2-stages" aria-label="Trial stages">
          {STAGES.map((s, idx) => {
            const isCurrent = stageIndex === idx;
            const isDone = stageIndex !== null && stageIndex > idx;
            return (
              <li
                key={s.stage}
                data-state={isCurrent ? 'active' : isDone ? 'done' : 'idle'}
              >
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ---------- 3D Stage (Isometric Parallel Projection) ---------- */}
      <div className="axmv2-stage" style={{ height: stageHeight }}>
        <div className="axmv2-scene">
          <div
            ref={boardRef}
            className="axmv2-board"
            style={{
              width: BOARD.w,
              height: BOARD.d,
              transform: `scale3d(${k}, ${k}, ${k}) rotateX(${ROT_X_DEG}deg) rotateZ(${ROT_Z_DEG}deg)`,
            }}
          >
            {/* Blueprint Floor Grid (Leaf element with 0 3D children) */}
            <div className="axmv2-floor" />

            {/* 3D Blocks Platforms */}
            {NODES.map((node) => (
              <Block3D
                key={node.id}
                node={node}
                active={activeNodeId === node.id}
                explosion={explosionProgress}
                onPick={() => {
                  setRunning(false);
                  setStageIndex(null);
                  setInspectedId((prev) => (prev === node.id ? null : node.id));
                }}
              />
            ))}

            {/* Cables SVG on Working Plane (WORK_H) */}
            <svg
              className="axmv2-cables-svg"
              viewBox={`0 0 ${BOARD.w} ${BOARD.d}`}
              style={{
                transform: `translateZ(${WORK_H}px)`,
                opacity: exploded ? 0 : 1,
                transition: 'opacity 0.4s ease',
              }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="axiomGradient"
                  gradientUnits="userSpaceOnUse"
                  x1={0}
                  y1={0}
                  x2={BOARD.w}
                  y2={BOARD.d}
                >
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>

              {CABLES.map((cable, idx) => {
                const isCableActive =
                  activeStage !== null && activeStage.activeCableIds.includes(cable.id);
                return (
                  <g key={cable.id}>
                    {/* Faint always-on base stroke */}
                    <path d={cable.d} className="axmv2-cable-base" />

                    {/* Staggered animated gradient cable */}
                    <motion.path
                      d={cable.d}
                      fill="none"
                      stroke="url(#axiomGradient)"
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0, strokeWidth: 3 }}
                      animate={{
                        pathLength: isInView ? 1 : 0,
                        opacity: isInView ? (isCableActive ? 1 : 0.65) : 0,
                        strokeWidth: isCableActive ? 5 : 3,
                      }}
                      transition={{
                        pathLength: {
                          duration: reduceMotion ? 0 : 1.2,
                          delay: reduceMotion ? 0 : 0.2 + idx * 0.1,
                          ease: 'easeInOut',
                        },
                        opacity: { duration: 0.3 },
                        strokeWidth: { duration: 0.25 },
                      }}
                    />

                    {/* Target Port Endpoint */}
                    <circle
                      cx={cable.to[0]}
                      cy={cable.to[1]}
                      r={5}
                      className="axmv2-cable-port-dot"
                    />

                    {/* Stage Packet Animation along Cable Path */}
                    <CablePacket
                      pathD={cable.d}
                      color={NODE_MAP[cable.toId].color}
                      active={isCableActive && !reduceMotion}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Dev Projection Probe Points */}
            <DevProjectionProbe k={k} boardRef={boardRef} />
          </div>
        </div>

        {/* ---------- Unrotated 2D HTML Labels & Leader Lines Overlay ---------- */}
        <div className="axmv2-labels-layer">
          <svg className="axmv2-leader-svg" aria-hidden="true">
            {!compact &&
              NODES.map((node) => {
                // Compute block anchor with explosion offset
                const exX = node.x + node.w / 2 + node.explodeOffset[0] * explosionProgress;
                const exY = node.y + node.d / 2 + node.explodeOffset[1] * explosionProgress;
                const exZ = WORK_H + node.explodeOffset[2] * explosionProgress;

                const proj = project(exX, exY, exZ, k);
                const screenCenter = { x: width / 2, y: stageHeight / 2 };
                const blockScreen = {
                  x: screenCenter.x + proj.sx,
                  y: screenCenter.y + proj.sy,
                };

                const cardPos = {
                  x: blockScreen.x + node.labelOffset[0] * Math.min(1, k + 0.1),
                  y: blockScreen.y + node.labelOffset[1] * Math.min(1, k + 0.1),
                };

                const isTargetActive = activeNodeId === node.id;

                return (
                  <line
                    key={node.id}
                    x1={blockScreen.x}
                    y1={blockScreen.y}
                    x2={cardPos.x}
                    y2={cardPos.y}
                    className={`axmv2-leader-line ${isTargetActive ? 'is-active' : ''}`}
                  />
                );
              })}
          </svg>

          {NODES.map((node) => {
            const exX = node.x + node.w / 2 + node.explodeOffset[0] * explosionProgress;
            const exY = node.y + node.d / 2 + node.explodeOffset[1] * explosionProgress;
            const exZ = WORK_H + node.explodeOffset[2] * explosionProgress;

            const proj = project(exX, exY, exZ, k);
            const screenCenter = { x: width / 2, y: stageHeight / 2 };
            const blockScreen = {
              x: screenCenter.x + proj.sx,
              y: screenCenter.y + proj.sy,
            };

            const isTargetActive = activeNodeId === node.id;

            // Small screens: collapse to numbered pins
            if (compact) {
              return (
                <button
                  key={node.id}
                  type="button"
                  className="axmv2-pin"
                  style={{
                    left: blockScreen.x,
                    top: blockScreen.y,
                  }}
                  onClick={() => {
                    setRunning(false);
                    setStageIndex(null);
                    setInspectedId((prev) => (prev === node.id ? null : node.id));
                  }}
                  aria-label={`${node.number} ${node.title}`}
                >
                  {node.number}
                </button>
              );
            }

            const cardPos = {
              x: blockScreen.x + node.labelOffset[0] * Math.min(1, k + 0.1),
              y: blockScreen.y + node.labelOffset[1] * Math.min(1, k + 0.1),
            };

            return (
              <button
                key={node.id}
                type="button"
                className={`axmv2-lbl ${isTargetActive ? 'is-active' : ''}`}
                style={{
                  left: cardPos.x,
                  top: cardPos.y,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => {
                  setRunning(false);
                  setStageIndex(null);
                  setInspectedId((prev) => (prev === node.id ? null : node.id));
                }}
                aria-pressed={inspectedId === node.id}
              >
                <span className="axmv2-lbl__head">
                  <span className="axmv2-lbl__title">{node.title}</span>
                  <span className="axmv2-lbl__badge">{node.badge}</span>
                </span>
                <span className="axmv2-lbl__role">
                  {inspectedId === node.id ? node.role : node.role.split(';')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Status Readout Bar & Caption ---------- */}
      <footer className="axmv2-readout" aria-live="polite">
        <span className="axmv2-readout__chip">STATUS</span>
        <span>{statusText}</span>
      </footer>
      <p className="axmv2-caption">Fig. 1 · Illustration, not telemetry</p>
    </div>
  );
}

export default AxiomAnatomyV2;
