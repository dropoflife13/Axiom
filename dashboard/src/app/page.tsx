'use client';

import { useEffect, useMemo, useState } from 'react';
import HealingLoopHero, { type LiveRun, type SnapshotMeta } from '@/components/HealingLoopHero';
import { AnatomySection } from '@/components/anatomy/AnatomySection';
import { CONDITIONS, deriveDesk, TOTAL_TRIALS, type CheckpointTrial } from '@/lib/desk';

const DEFAULT_RUN_ID = 'ablation-v2';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const stageFor = (t?: CheckpointTrial): number => {
  if (!t) return 1;
  if (t.boundPassed) return 5;
  return (t.failedFacts?.length ?? 0) > 0 ? 2 : 1;
};

export default function Page() {
  const [checkpoint, setCheckpoint] = useState<CheckpointTrial[]>([]);
  const [results, setResults] = useState<unknown>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotMeta>({
    runId: DEFAULT_RUN_ID,
    commit: 'unknown',
    isLive: false,
  });
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [stamp, setStamp] = useState('--:--:--');

  useEffect(() => {
    let controller = new AbortController();
    async function load() {
      controller.abort();
      controller = new AbortController();
      try {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const runId = params?.get('run') || DEFAULT_RUN_ID;
        const snapshotUrl = `/data/run-${runId}.json`;

        const response = await fetch(snapshotUrl, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          setCheckpointError(`Snapshot data was not found for run "${runId}". Check that dashboard/public/data/run-${runId}.json exists.`);
          return;
        }

        const data = await response.json();
        const trials = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];
        setCheckpoint(trials);
        setResults(data);

        const mtime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
        const isLive = Boolean(mtime && Date.now() - mtime < FIVE_MINUTES_MS);
        const commit = data.commit || (typeof data.gitCommit === 'string' ? data.gitCommit.slice(0, 7) : 'unknown');

        setSnapshotMeta({
          runId: data.id || data.runId || runId,
          commit,
          isLive,
        });
        setCheckpointError(null);
        setStamp(new Date().toLocaleTimeString('en-GB', { hour12: false }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCheckpointError('The dashboard could not fetch its run snapshot. Check that the snapshot file exists in public/data.');
      }
    }

    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  const desk = useMemo(() => deriveDesk(checkpoint), [checkpoint]);

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
    };
  }, [checkpoint, checkpointError, snapshotMeta.isLive]);

  const copyLogs = () => {
    const logs = JSON.stringify({ snapshotMeta, checkpoint, results, fetchedAt: new Date().toISOString() }, null, 2);
    void navigator.clipboard.writeText(logs);
    window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'success', message: 'Snapshot data copied to clipboard' } }));
  };

  return (
    <>
      <HealingLoopHero
        live={live}
        desk={desk}
        stamp={stamp}
        error={checkpointError}
        snapshot={snapshotMeta}
        onCopyLogs={copyLogs}
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
