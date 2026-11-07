"use client";

import * as React from "react";
import { Dots, IsoFigure, Line, Solid } from "./kit/react/draw";
import { asksForStillness, spring, useLoop, useReadout, type Spring } from "./kit/react/live";
import {
  CONDITIONS,
  DEFAULT_READOUT,
  EXPLODE_ORDER,
  STATION_BY_ID,
  STATIONS,
  TRIAL_DURATION,
  TRIAL_PHASES,
  type MachineState,
  type StationId,
  type TrialPhaseId,
} from "./model";
import { frameOf } from "./pose";
import { HEIGHT, WIDTH } from "./view";

export interface StationArtBundle {
  hitPath: string;
  body: React.ReactNode;
  moving?: React.ReactNode;
}

interface AxiomAnatomyLiveProps {
  stand: React.ReactNode;
  stations: Record<StationId, StationArtBundle>;
}

/**
 * Depth-sorted station order solved by kit/audit.mjs across rest, exploded,
 * spring, reversal, and prefix states (0 depth-order problems).
 */
const DRAW_ORDER: readonly StationId[] = [
  "memory",
  "task-generator",
  "guardrails",
  "retrieval",
  "executor",
  "advisor",
  "oracle",
  "quarantine",
  "verdict",
] as const;

const STAGGER_SECONDS = 0.035;
const SPRING_STIFFNESS = 64;
const SPRING_DAMPING = 14.2;

function initialShares(): Record<StationId, number> {
  return {
    "task-generator": 0,
    retrieval: 0,
    memory: 0,
    guardrails: 0,
    executor: 0,
    oracle: 0,
    quarantine: 0,
    advisor: 0,
    verdict: 0,
  };
}

interface PendingTarget {
  target: number;
  at: number;
}

export function AxiomAnatomyLive({ stand, stations }: AxiomAnatomyLiveProps) {
  const [state, setState] = React.useState<MachineState>(() => ({
    apart: false,
    shares: initialShares(),
    selectedStation: "oracle",
    hoveredStation: null,
    trialClock: null,
  }));
  const [trialRunning, setTrialRunning] = React.useState(false);
  const [hoverApart, setHoverApart] = React.useState(false);
  const [pinnedApart, setPinnedApart] = React.useState<boolean | null>(null);

  const wantApart = trialRunning ? false : (pinnedApart ?? hoverApart);

  const springsRef = React.useRef<Record<StationId, Spring>>({
    "task-generator": { at: 0, rate: 0 },
    retrieval: { at: 0, rate: 0 },
    memory: { at: 0, rate: 0 },
    guardrails: { at: 0, rate: 0 },
    executor: { at: 0, rate: 0 },
    oracle: { at: 0, rate: 0 },
    quarantine: { at: 0, rate: 0 },
    advisor: { at: 0, rate: 0 },
    verdict: { at: 0, rate: 0 },
  });
  const pendingRef = React.useRef<Record<StationId, PendingTarget | null>>({
    "task-generator": null,
    retrieval: null,
    memory: null,
    guardrails: null,
    executor: null,
    oracle: null,
    quarantine: null,
    advisor: null,
    verdict: null,
  });
  const targetsRef = React.useRef<Record<StationId, number>>(initialShares());
  const staggerClockRef = React.useRef(0);
  const trialClockRef = React.useRef<number | null>(null);
  const trialRunningRef = React.useRef(false);
  const [springsMoving, setSpringsMoving] = React.useState(false);

  const { anchor, say } = useReadout<HTMLDivElement>();

  // Schedule staggered assembly targets when wantApart changes
  React.useEffect(() => {
    const goal = wantApart ? 1 : 0;
    const calm = asksForStillness();
    if (calm) {
      for (const id of EXPLODE_ORDER) {
        springsRef.current[id] = { at: goal, rate: 0 };
        targetsRef.current[id] = goal;
        pendingRef.current[id] = null;
      }
      setState((prev) => ({
        ...prev,
        apart: wantApart,
        shares: { ...targetsRef.current },
      }));
      setSpringsMoving(false);
      return;
    }

    staggerClockRef.current = 0;
    const sequence = wantApart ? EXPLODE_ORDER : [...EXPLODE_ORDER].reverse();
    sequence.forEach((id, idx) => {
      pendingRef.current[id] = {
        target: goal,
        at: idx * STAGGER_SECONDS,
      };
    });
    setState((prev) => ({ ...prev, apart: wantApart }));
    setSpringsMoving(true);
  }, [wantApart]);

  const activeLoop = springsMoving || trialRunning;

  const kick = useLoop((dt, calm) => {
    let anySpringActive = false;
    staggerClockRef.current += dt;
    const nextShares = {} as Record<StationId, number>;

    for (const id of EXPLODE_ORDER) {
      const pending = pendingRef.current[id];
      if (pending && (calm || staggerClockRef.current >= pending.at)) {
        targetsRef.current[id] = pending.target;
        pendingRef.current[id] = null;
      }
      const sp = springsRef.current[id];
      const target = targetsRef.current[id];
      if (calm) {
        sp.at = target;
        sp.rate = 0;
      } else {
        const settled = spring(sp, target, dt, SPRING_STIFFNESS, SPRING_DAMPING, calm);
        if (!settled || pendingRef.current[id] !== null) {
          anySpringActive = true;
        }
      }
      nextShares[id] = sp.at;
    }

    let nextTrialClock = trialClockRef.current;
    let keepTrialRunning = trialRunningRef.current;

    if (keepTrialRunning) {
      if (calm) {
        // In reduced-motion mode, step cleanly to the final pass state without continuous motion
        nextTrialClock = TRIAL_DURATION - 0.05;
        trialClockRef.current = nextTrialClock;
        keepTrialRunning = false;
        trialRunningRef.current = false;
        setTrialRunning(false);
      } else {
        const current = (trialClockRef.current ?? 0) + dt * 0.95;
        if (current >= TRIAL_DURATION) {
          nextTrialClock = TRIAL_DURATION - 0.02;
          trialClockRef.current = nextTrialClock;
          keepTrialRunning = false;
          trialRunningRef.current = false;
          setTrialRunning(false);
        } else {
          nextTrialClock = current;
          trialClockRef.current = current;
        }
      }
    }

    if (!anySpringActive && springsMoving) {
      setSpringsMoving(false);
    }

    setState((prev) => {
      const phaseSample =
        nextTrialClock !== null
          ? TRIAL_PHASES[Math.min(TRIAL_PHASES.length - 1, Math.floor(Math.max(0, nextTrialClock)))]
          : null;
      return {
        ...prev,
        shares: nextShares,
        trialClock: nextTrialClock,
        selectedStation: phaseSample ? phaseSample.station : prev.selectedStation,
      };
    });

    return anySpringActive || keepTrialRunning;
  }, activeLoop);

  const frame = frameOf(state);

  React.useEffect(() => {
    say(frame.readout || DEFAULT_READOUT);
  }, [frame.readout, say]);

  const startOneTrial = React.useCallback(() => {
    setPinnedApart(false);
    setHoverApart(false);
    if (asksForStillness()) {
      trialRunningRef.current = false;
      trialClockRef.current = 0.5;
      setState((prev) => ({
        ...prev,
        apart: false,
        trialClock: 0.5,
        selectedStation: "executor",
      }));
      return;
    }
    trialClockRef.current = 0;
    trialRunningRef.current = true;
    setState((prev) => ({
      ...prev,
      apart: false,
      trialClock: 0,
      selectedStation: "executor",
    }));
    setTrialRunning(true);
    kick();
  }, [kick]);

  const jumpToPhase = React.useCallback((phaseIndex: number) => {
    trialRunningRef.current = false;
    setTrialRunning(false);
    setPinnedApart(false);
    setHoverApart(false);
    const clock = phaseIndex + 0.5;
    trialClockRef.current = clock;
    const spec = TRIAL_PHASES[phaseIndex];
    setState((prev) => ({
      ...prev,
      apart: false,
      trialClock: clock,
      selectedStation: spec ? spec.station : prev.selectedStation,
    }));
  }, []);

  const toggleApart = React.useCallback(() => {
    trialRunningRef.current = false;
    setTrialRunning(false);
    trialClockRef.current = null;
    setPinnedApart((prev) => !(prev ?? hoverApart));
    setState((prev) => ({ ...prev, trialClock: null }));
  }, [hoverApart]);

  const selectStation = React.useCallback((id: StationId) => {
    setState((prev) => ({
      ...prev,
      selectedStation: id,
    }));
  }, []);

  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " || event.key === "e" || event.key === "E") {
      event.preventDefault();
      toggleApart();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      startOneTrial();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const idx = STATIONS.findIndex((s) => s.id === state.selectedStation);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = STATIONS[(idx + delta + STATIONS.length) % STATIONS.length]!;
      selectStation(next.id);
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const idx = Number(event.key) - 1;
      const station = STATIONS[idx];
      if (station) selectStation(station.id);
    }
  };

  const activeStationId = state.hoveredStation ?? state.selectedStation;
  const activeStation = STATION_BY_ID[activeStationId];
  const activePhaseId: TrialPhaseId = frame.sample.phase;

  const movingTransformFor = (id: StationId): string => {
    switch (id) {
      case "retrieval":
        return frame.pickerTransform;
      case "executor":
        return frame.executorRamTransform;
      case "oracle":
        return frame.deployerRamTransform;
      case "advisor":
        return frame.advisorPressTransform;
      case "verdict":
        return frame.verdictPunchTransform;
      default:
        return "";
    }
  };

  return (
    <div
      ref={anchor}
      className="axiom-anatomy"
      data-apart={wantApart ? "true" : "false"}
      data-phase={activePhaseId}
      data-selected-station={activeStationId}
    >
      {/* Top interactive toolbar */}
      <div className="axiom-anatomy__toolbar" role="toolbar" aria-label="Anatomy machine controls">
        <div className="axiom-anatomy__actions">
          <button
            type="button"
            className="axiom-anatomy__btn axiom-anatomy__btn--primary"
            data-action="run-trial"
            onClick={startOneTrial}
          >
            <span className="axiom-anatomy__btn-dot" aria-hidden="true" />
            {trialRunning ? "Running trial…" : "Run one trial"}
          </button>
          <button
            type="button"
            className="axiom-anatomy__btn"
            data-action="toggle-apart"
            aria-pressed={wantApart}
            onClick={toggleApart}
          >
            {wantApart ? "Assemble bench" : "Take apart (9 assemblies)"}
          </button>
        </div>

        <div className="axiom-anatomy__phases" role="group" aria-label="Trial stages">
          {TRIAL_PHASES.map((phase, idx) => {
            const isCurrent = frame.sample.phase === phase.id;
            return (
              <button
                key={phase.id}
                type="button"
                className="axiom-anatomy__phase-pill"
                data-phase-pill={phase.id}
                data-accent={phase.accent}
                data-active={isCurrent ? "true" : undefined}
                onClick={() => jumpToPhase(idx)}
                title={phase.summary}
              >
                {phase.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Isometric SVG stage */}
      <div
        className="axiom-anatomy__stage-wrap"
        tabIndex={0}
        role="region"
        aria-label="Interactive isometric diagram of the Axiom verification and reflexion machine. Press Space to take apart, Arrow keys or 1 through 9 to inspect stations, or R to run one trial."
        onKeyDown={handleStageKeyDown}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && !trialRunning && pinnedApart === null) {
            setHoverApart(true);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && pinnedApart === null) {
            setHoverApart(false);
          }
        }}
      >
        <IsoFigure
          width={WIDTH}
          height={HEIGHT}
          label="Axiom verification and reflexion proving bench: 9 stations testing AI-generated PostgreSQL 16 migrations across 6 conditions and 120 test tasks (720 trials)."
        >
          {/* 1. Fixed Bedplate, Rails, 6-Condition Selector Bar & Pass Anvil */}
          {stand}

          {/* 2. Moving trial blank & dynamic tags/plates on the rail */}
          <g className="axiom-anatomy__trial-layer" data-tone={frame.blankTone}>
            <Solid
              paths={frame.blankPaths}
              tone="hi"
              lit
              halo
              inner={<Line d={frame.blankSeam} tone="faint" />}
            >
              <Line d={frame.blankSlot} tone="lit" />
              <Dots points={[frame.blankDot]} size={0.85} tone="hi" />
            </Solid>

            {frame.faultTagPaths ? (
              <Solid paths={frame.faultTagPaths} tone="hi" lit halo>
                <Line d={frame.faultTagOutline} tone="red" />
              </Solid>
            ) : null}

            {frame.lessonPlatePaths ? (
              <Solid paths={frame.lessonPlatePaths} tone="hi" lit halo />
            ) : null}
          </g>

          {/* 3. Depth-sorted 9 Station Assemblies */}
          {DRAW_ORDER.map((id) => {
            const spec = STATION_BY_ID[id];
            const bundle = stations[id];
            const isSelected = activeStationId === id;
            const transform = frame.stationTransforms[id];
            const movingTransform = movingTransformFor(id);

            return (
              <g
                key={id}
                className="axiom-anatomy__station"
                data-station={id}
                data-accent={spec.accent}
                data-selected={isSelected ? "true" : undefined}
                transform={transform || undefined}
                role="button"
                tabIndex={0}
                aria-label={`${spec.number} ${spec.title} (${spec.badge}): ${spec.role}`}
                aria-pressed={state.selectedStation === id}
                onClick={(e) => {
                  e.stopPropagation();
                  selectStation(id);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") {
                    setState((prev) => ({ ...prev, hoveredStation: id }));
                  }
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") {
                    setState((prev) =>
                      prev.hoveredStation === id ? { ...prev, hoveredStation: null } : prev,
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    selectStation(id);
                  }
                }}
              >
                <path className="axiom-anatomy__hit" d={bundle.hitPath} />
                {bundle.body}
                {bundle.moving ? (
                  <g transform={movingTransform || undefined}>{bundle.moving}</g>
                ) : null}
                {id === "oracle" ? (
                  <g className="axiom-anatomy__dial-needle">
                    <Line d={frame.oracleNeedlePath} tone={frame.oracleNeedleTone} free />
                    <Dots points={[frame.oraclePivotDot]} size={0.75} tone="hi" />
                  </g>
                ) : null}
              </g>
            );
          })}
        </IsoFigure>
      </div>

      {/* Station Readout Card + Station Index Bar */}
      <div className="axiom-anatomy__inspector" data-readout-card="" data-accent={activeStation.accent}>
        <div className="axiom-anatomy__readout-main">
          <div className="axiom-anatomy__readout-header">
            <span className="axiom-anatomy__station-num">{activeStation.number}</span>
            <h3 className="axiom-anatomy__station-title">{activeStation.title}</h3>
            <span className="axiom-anatomy__station-badge">{activeStation.badge}</span>
            {frame.sample.phaseSpec ? (
              <span
                className="axiom-anatomy__trial-badge"
                data-accent={frame.sample.phaseSpec.accent}
              >
                Trial stage: {frame.sample.phaseSpec.label}
              </span>
            ) : null}
          </div>
          <p className="axiom-anatomy__station-role">{activeStation.role}</p>
          {frame.sample.phaseSpec ? (
            <p className="axiom-anatomy__trial-summary">{frame.sample.phaseSpec.summary}</p>
          ) : null}
        </div>

        <div className="axiom-anatomy__station-strip" role="tablist" aria-label="Select station">
          {STATIONS.map((station) => {
            const selected = activeStation.id === station.id;
            return (
              <button
                key={station.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className="axiom-anatomy__station-chip"
                data-station-chip={station.id}
                data-accent={station.accent}
                data-active={selected ? "true" : undefined}
                onClick={() => selectStation(station.id)}
              >
                <span className="axiom-anatomy__chip-num">{station.number}</span>
                <span className="axiom-anatomy__chip-name">{station.title}</span>
              </button>
            );
          })}
        </div>

        <div className="axiom-anatomy__conditions-bar" aria-label="Experiment design constants">
          <span className="axiom-anatomy__conditions-title">
            Experiment: 6 conditions × 120 test tasks = 720 trials
          </span>
          <div className="axiom-anatomy__conditions-list">
            {CONDITIONS.map((cond) => (
              <span key={cond.code} className="axiom-anatomy__condition-tag">
                <strong>{cond.code}</strong> {cond.summary}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
