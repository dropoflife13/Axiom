'use client';

import { useEffect, useMemo, useState } from 'react';
import HealingLoopHero, { type LiveRun, type SnapshotMeta } from '@/components/HealingLoopHero';
import { AnatomySection } from '@/components/anatomy/AnatomySection';
import { CortexVaultSection } from '@/components/cortex/CortexVaultSection';
import { AxiomFooter } from '@/components/footer/AxiomFooter';
import { AxiomLoadingScreen } from '@/components/AxiomLoadingScreen';
import { CONDITIONS, deriveDesk, TOTAL_TRIALS, type CheckpointTrial } from '@/lib/desk';
import { DEFAULT_RUN_ID, DEFAULT_RUN_OPTIONS, inferRunOption, modelForRun, type RunOption } from '@/lib/runs';
import { useFleetStatus } from '@/lib/useFleetStatus';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const stageFor = (t?: CheckpointTrial): number => {
  if (!t) return 1;
  if (t.boundPassed) return 5;
  return (t.failedFacts?.length ?? 0) > 0 ? 2 : 1;
};

export default function Page() {
  const [discoveredRuns, setDiscoveredRuns] = useState<RunOption[]>(() => [...DEFAULT_RUN_OPTIONS]);

  const [activeRunId, setActiveRunId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('run');
      if (p) return p;
    }
    return DEFAULT_RUN_ID;
  });

  const [checkpoint, setCheckpoint] = useState<CheckpointTrial[]>([]);
  const [results, setResults] = useState<unknown>(null);
  const [awaitingSnapshot, setAwaitingSnapshot] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotMeta>({
    runId: DEFAULT_RUN_ID,
    commit: 'live',
    isLive: true,
    model: modelForRun(DEFAULT_RUN_ID),
    awaiting: false,
  });
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [stamp, setStamp] = useState('--:--:--');
  const [showLoading, setShowLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Dynamic Run Discovery: Fetch run folders from /api/runs on mount and periodically
  useEffect(() => {
    let active = true;
    async function discoverRuns() {
      try {
        const res = await fetch('/api/runs', { cache: 'no-store' });
        if (res.ok) {
          const runIds: string[] = await res.json();
          if (active && Array.isArray(runIds) && runIds.length > 0) {
            const mapped = runIds.map((id) => inferRunOption(id));
            setDiscoveredRuns(mapped);
            setActiveRunId((current) => (runIds.includes(current) ? current : runIds[0]));
          }
        }
      } catch {
        // Fallback to DEFAULT_RUN_OPTIONS
      }
    }

    void discoverRuns();
    const interval = setInterval(discoverRuns, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Poll active run checkpoint data
  useEffect(() => {
    let controller = new AbortController();

    async function load() {
      controller.abort();
      controller = new AbortController();
      const currentStamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setStamp(currentStamp);

      const isLocal =
        typeof window !== 'undefined'
          ? window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          : process.env.NODE_ENV === 'development';

      try {
        let response: Response;
        if (isLocal) {
          // Local Live Mode: query active checkpoint from .axiom-state via local API route
          response = await fetch(`/api/ablation-checkpoint?run=${activeRunId}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
        } else {
          // Vercel / Production: static snapshot only
          response = await fetch(`/data/run-${activeRunId}.json`, {
            signal: controller.signal,
            cache: 'no-store',
          });
        }

        if (!response.ok) {
          // When a run file is missing or wiped: RESET STATE cleanly (no error toast)
          setCheckpoint([]);
          setResults(null);
          setAwaitingSnapshot(false);
          setSnapshotMeta({
            runId: activeRunId,
            commit: 'live',
            isLive: true,
            model: modelForRun(activeRunId),
            awaiting: false,
          });
          setCheckpointError(null);
          return;
        }

        const data = await response.json();
        const trials: CheckpointTrial[] = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];

        // When trials are empty (wiped or initializing): RESET STATE cleanly
        if (trials.length === 0) {
          setCheckpoint([]);
          setResults(null);
          setAwaitingSnapshot(false);
          setSnapshotMeta({
            runId: data.id || data.runId || activeRunId,
            commit: 'live',
            isLive: true,
            model: data.model || modelForRun(activeRunId),
            awaiting: false,
          });
          setCheckpointError(null);
          return;
        }

        setCheckpoint((prev) => {
          if (prev.length === trials.length && prev.length > 0) {
            const pLast = prev[prev.length - 1];
            const tLast = trials[trials.length - 1];
            if (pLast?.taskId === tLast?.taskId && pLast?.condition === tLast?.condition && pLast?.boundPassed === tLast?.boundPassed) {
              return prev; // Identical dataset, bail out of re-rendering tree!
            }
          }
          return trials;
        });
        setResults(data);
        setAwaitingSnapshot(false);

        const mtime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
        const isLive = Boolean(mtime && Date.now() - mtime < FIVE_MINUTES_MS);
        const commit = data.commit || (typeof data.gitCommit === 'string' ? data.gitCommit.slice(0, 7) : 'live');

        setSnapshotMeta({
          runId: data.id || data.runId || activeRunId,
          commit,
          isLive,
          model: data.model || modelForRun(activeRunId),
          awaiting: false,
        });
        setCheckpointError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Wiped / initializing state: reset state without error toast
        setCheckpoint([]);
        setResults(null);
        setAwaitingSnapshot(false);
        setSnapshotMeta({
          runId: activeRunId,
          commit: 'live',
          isLive: true,
          model: modelForRun(activeRunId),
          awaiting: false,
        });
        setCheckpointError(null);
      } finally {
        setIsDataLoaded(true);
      }
    }

    load();
    const pollInterval =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 2000
        : 30000;
    const timer = window.setInterval(load, pollInterval);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [activeRunId]);

  const desk = useMemo(() => {
    return deriveDesk(checkpoint);
  }, [checkpoint]);

  const live = useMemo<LiveRun>(() => {
    const done = Math.min(TOTAL_TRIALS, checkpoint.length);
    const counts = CONDITIONS.map((condition) => checkpoint.filter((trial) => trial.condition === condition).length);
    const running = done > 0 && !checkpointError;
    return {
      done,
      counts,
      stage: stageFor(checkpoint[checkpoint.length - 1]),
      running,
      label: snapshotMeta.isLive ? 'LIVE' : 'SNAPSHOT',
      awaiting: awaitingSnapshot,
    };
  }, [checkpoint, checkpointError, snapshotMeta.isLive, awaitingSnapshot]);

  const copyLogs = () => {
    const logs = JSON.stringify({ snapshotMeta, checkpoint, results, fetchedAt: new Date().toISOString() }, null, 2);
    void navigator.clipboard.writeText(logs);
    window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'success', message: 'Snapshot data copied to clipboard' } }));
  };

  const fleet = useFleetStatus(discoveredRuns);

  return (
    <>
      {showLoading && (
        <AxiomLoadingScreen
          isReady={isDataLoaded}
          runId={activeRunId}
          model={snapshotMeta.model}
          onComplete={() => setShowLoading(false)}
        />
      )}
      <HealingLoopHero
        live={live}
        desk={desk}
        stamp={stamp}
        error={checkpointError}
        snapshot={snapshotMeta}
        activeRunId={activeRunId}
        runOptions={discoveredRuns}
        fleet={fleet}
        onSelectRun={setActiveRunId}
        onCopyLogs={copyLogs}
        onReplayIntro={() => setShowLoading(true)}
      />
      <AnatomySection
        checkpoint={checkpoint}
        desk={desk}
        running={live.running}
        snapshot={snapshotMeta}
      />
      <CortexVaultSection
        fleet={fleet}
        activeRunId={activeRunId}
        runOptions={discoveredRuns}
        onSelectRun={setActiveRunId}
      />
      <AxiomFooter />
    </>
  );
}
