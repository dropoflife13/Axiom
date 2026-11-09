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
        const rawTrials: CheckpointTrial[] = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];

        // When trials are empty (wiped or initializing): RESET STATE cleanly
        if (rawTrials.length === 0) {
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

        // Attach or preserve stable chronological timestamps for every trial
        const lastMod = data.lastModified ? new Date(data.lastModified).getTime() : Date.now();
        const trials: CheckpointTrial[] = rawTrials.map((t: CheckpointTrial, idx: number) => {
          if (t.timestamp || t.completedAt) return t;
          const step = (t.latencyMs && t.latencyMs > 0 ? t.latencyMs : 1400) + 1800;
          const offsetMs = (rawTrials.length - 1 - idx) * step;
          const assignedMs = (isNaN(lastMod) ? Date.now() : lastMod) - offsetMs;
          return {
            ...t,
            timestamp: new Date(assignedMs).toISOString(),
          };
        });

        setCheckpoint((prev) => {
          if (prev.length === trials.length && prev.length > 0) {
            const pLast = prev[prev.length - 1];
            const tLast = trials[trials.length - 1];
            if (pLast?.taskId === tLast?.taskId && pLast?.condition === tLast?.condition && pLast?.boundPassed === tLast?.boundPassed) {
              return prev; // Identical dataset, bail out of re-rendering tree!
            }
          }
          // Preserve timestamps from prev for earlier trials to avoid clock drift
          const prevMap = new Map<string, string>();
          for (const p of prev) {
            if (p.timestamp) prevMap.set(`${p.condition}/${p.taskId}`, p.timestamp);
          }
          return trials.map((t, i) => {
            const key = `${t.condition}/${t.taskId}`;
            if (!rawTrials[i]?.timestamp && prevMap.has(key)) {
              return { ...t, timestamp: prevMap.get(key) };
            }
            return t;
          });
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

  const totalTrials = useMemo(() => {
    const rawData = results as any;
    if (typeof rawData?.totalTrials === 'number' && rawData.totalTrials > 0) {
      return rawData.totalTrials;
    }
    if (typeof rawData?.metadata?.totalTrials === 'number' && rawData.metadata.totalTrials > 0) {
      return rawData.metadata.totalTrials;
    }
    if (Array.isArray(rawData?.tasks) && rawData.tasks.length > 0) {
      return rawData.tasks.length * 6;
    }
    if (Array.isArray(rawData?.metadata?.tasks) && rawData.metadata.tasks.length > 0) {
      return rawData.metadata.tasks.length * 6;
    }
    const isMini = activeRunId.toLowerCase().includes('mini');
    const taskIds = new Set(checkpoint.map((t) => t.taskId));
    if (isMini) {
      return taskIds.size > 0 ? taskIds.size * 6 : 48;
    }
    if (taskIds.size > 0 && taskIds.size <= 8 && checkpoint.length >= 24) {
      return taskIds.size * 6;
    }
    return TOTAL_TRIALS;
  }, [results, checkpoint, activeRunId]);

  const lastModified = (results as { lastModified?: string } | null)?.lastModified;
  const desk = useMemo(() => {
    return deriveDesk(checkpoint, 60, totalTrials, lastModified);
  }, [checkpoint, totalTrials, lastModified]);

  const live = useMemo<LiveRun>(() => {
    const done = Math.min(totalTrials, checkpoint.length);
    const counts = CONDITIONS.map((condition) => checkpoint.filter((trial) => trial.condition === condition).length);
    const running = done > 0 && !checkpointError;
    return {
      done,
      total: totalTrials,
      counts,
      stage: stageFor(checkpoint[checkpoint.length - 1]),
      running,
      label: snapshotMeta.isLive ? 'LIVE' : 'SNAPSHOT',
      awaiting: awaitingSnapshot,
    };
  }, [checkpoint, checkpointError, snapshotMeta.isLive, awaitingSnapshot, totalTrials]);

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
