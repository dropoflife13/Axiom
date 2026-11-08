'use client';

import { useEffect, useMemo, useState } from 'react';
import HealingLoopHero, { type LiveRun, type SnapshotMeta } from '@/components/HealingLoopHero';
import { AnatomySection } from '@/components/anatomy/AnatomySection';
import { AxiomLoadingScreen } from '@/components/AxiomLoadingScreen';
import { CONDITIONS, deriveDesk, TOTAL_TRIALS, type CheckpointTrial, type LogLine } from '@/lib/desk';

interface RunOption {
  id: string;
  label: string;
  model: string;
}

const RUN_OPTIONS: RunOption[] = [
  { id: 'nemotron-1', label: 'NEMOTRON 550B', model: 'nvidia/nemotron-3-ultra-550b-a55b' },
  { id: 'qwen27b-1', label: 'QWEN 3.8 27B', model: 'qwen/qwen3.8-27b' },
];

const DEFAULT_RUN_ID = 'nemotron-1';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const stageFor = (t?: CheckpointTrial): number => {
  if (!t) return 1;
  if (t.boundPassed) return 5;
  return (t.failedFacts?.length ?? 0) > 0 ? 2 : 1;
};

export default function Page() {
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
    commit: 'unknown',
    isLive: false,
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    awaiting: false,
  });
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [stamp, setStamp] = useState('--:--:--');
  const [showLoading, setShowLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

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
          // Fallback to static snapshot if local live checkpoint does not exist for this run
          if (!response.ok && response.status === 404) {
            response = await fetch(`/data/run-${activeRunId}.json`, {
              signal: controller.signal,
              cache: 'no-store',
            });
          }
        } else {
          // Vercel / Production: static snapshot only
          response = await fetch(`/data/run-${activeRunId}.json`, {
            signal: controller.signal,
            cache: 'no-store',
          });
        }

        if (!response.ok) {
          // If 404 (or file missing), graceful sci-fi fallback: Awaiting Snapshot mode
          if (response.status === 404 || response.status === 0) {
            setAwaitingSnapshot(true);
            setCheckpoint([]);
            setResults(null);
            setSnapshotMeta({
              runId: activeRunId,
              commit: 'pending',
              isLive: false,
              model: activeRunId === 'qwen27b-1' ? 'qwen/qwen3.8-27b' : 'nvidia/nemotron-3-ultra-550b-a55b',
              awaiting: true,
            });
            setCheckpointError(null);
            return;
          }
          setCheckpointError(`Snapshot data not available for "${activeRunId}" (HTTP ${response.status}).`);
          return;
        }

        const data = await response.json();
        const trials: CheckpointTrial[] = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];
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
        setResults((prev: unknown) => (prev ? prev : data));
        setAwaitingSnapshot(false);

        const mtime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
        const isLive = Boolean(mtime && Date.now() - mtime < FIVE_MINUTES_MS);
        const commit = data.commit || (typeof data.gitCommit === 'string' ? data.gitCommit.slice(0, 7) : 'unknown');

        setSnapshotMeta({
          runId: data.id || data.runId || activeRunId,
          commit,
          isLive,
          model: data.model || (activeRunId === 'qwen27b-1' ? 'qwen/qwen3.8-27b' : 'nvidia/nemotron-3-ultra-550b-a55b'),
          awaiting: false,
        });
        setCheckpointError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Graceful fallback on network or missing JSON for Qwen
        if (activeRunId === 'qwen27b-1') {
          setAwaitingSnapshot(true);
          setCheckpoint([]);
          setSnapshotMeta({
            runId: activeRunId,
            commit: 'pending',
            isLive: false,
            model: 'qwen/qwen3.8-27b',
            awaiting: true,
          });
          setCheckpointError(null);
        } else {
          setCheckpointError('Failed to fetch snapshot. Check public/data directory.');
        }
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
    if (awaitingSnapshot) {
      const activeModel = activeRunId === 'qwen27b-1' ? 'qwen/qwen3.8-27b' : activeRunId;
      const awaitingLog: LogLine[] = [
        { key: 'aw-1', stage: 'ORACLE', text: `Target run: ${activeRunId} (${activeModel})`, status: 'OK' },
        { key: 'aw-2', stage: 'EXECUTOR', text: `Awaiting run snapshot at /data/run-${activeRunId}.json...`, status: 'WARN' },
        { key: 'aw-3', stage: 'ORACLE', text: `Crucible test reactor running in background execution pipeline...`, status: 'OK' },
        { key: 'aw-4', stage: 'MEMORY', text: `Telemetry stream active · Replay will hydrate automatically upon completion`, status: 'OK' },
      ];
      return {
        ...deriveDesk([]),
        log: awaitingLog,
      };
    }
    return deriveDesk(checkpoint);
  }, [checkpoint, awaitingSnapshot, activeRunId]);

  const live = useMemo<LiveRun>(() => {
    if (awaitingSnapshot) {
      return {
        done: 0,
        counts: [0, 0, 0, 0, 0, 0],
        stage: 1, // VERIFY
        running: true,
        label: `AWAITING // ${activeRunId}`,
        awaiting: true,
      };
    }
    const done = Math.min(TOTAL_TRIALS, checkpoint.length);
    const counts = CONDITIONS.map((condition) => checkpoint.filter((trial) => trial.condition === condition).length);
    const running = done > 0 && !checkpointError;
    return {
      done,
      counts,
      stage: stageFor(checkpoint[checkpoint.length - 1]),
      running,
      label: snapshotMeta.isLive ? 'LIVE' : 'SNAPSHOT',
      awaiting: false,
    };
  }, [checkpoint, checkpointError, snapshotMeta.isLive, awaitingSnapshot, activeRunId]);

  const copyLogs = () => {
    const logs = JSON.stringify({ snapshotMeta, checkpoint, results, fetchedAt: new Date().toISOString() }, null, 2);
    void navigator.clipboard.writeText(logs);
    window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'success', message: 'Snapshot data copied to clipboard' } }));
  };

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
    </>
  );
}
