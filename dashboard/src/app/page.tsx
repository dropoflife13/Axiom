'use client';

import { useEffect, useMemo, useState } from 'react';
import HealingLoopHero, { type LiveRun } from '@/components/HealingLoopHero';

const CHECKPOINT_API = '/api/ablation-checkpoint';
const RESULTS_API = '/api/ablation-results';
const TOTAL_TRIALS = 720;
const CONDITIONS = ['A', 'B', 'C', 'C0', 'D', 'E_B'];

interface Trial {
  condition: string;
  taskId: string;
  generationStatus?: string;
}

const stageFor = (status?: string): number => {
  switch (status?.toLowerCase()) {
    case 'generate': return 0;
    case 'verify': return 1;
    case 'fail': return 2;
    case 'advise': return 3;
    case 'retry': return 4;
    case 'pass': return 5;
    default: return 1;
  }
};

export default function Page() {
  const [checkpoint, setCheckpoint] = useState<Trial[]>([]);
  const [results, setResults] = useState<unknown>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [checkpointResponse, resultsResponse] = await Promise.all([
          fetch(CHECKPOINT_API, { signal: controller.signal, cache: 'no-store' }),
          fetch(RESULTS_API, { signal: controller.signal, cache: 'no-store' }),
        ]);

        if (!checkpointResponse.ok) {
          const body = await checkpointResponse.json().catch(() => ({}));
          setCheckpointError(body.error || 'Checkpoint data not found.');
        } else {
          const data = await checkpointResponse.json();
          setCheckpoint(Array.isArray(data) ? data : data.trials ?? []);
        }

        if (resultsResponse.ok) setResults(await resultsResponse.json());
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCheckpointError('Unable to reach the dashboard API.');
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const live = useMemo<LiveRun>(() => {
    const done = Math.min(TOTAL_TRIALS, checkpoint.length);
    const counts = CONDITIONS.map((condition) => checkpoint.filter((trial) => trial.condition === condition).length);
    const latest = checkpoint[checkpoint.length - 1];
    const running = done > 0 && !checkpointError;
    return {
      done,
      counts,
      stage: stageFor(latest?.generationStatus),
      running,
      label: running ? 'LIVE' : 'SIGNAL INTERRUPTED',
    };
  }, [checkpoint, checkpointError]);

  const logs = JSON.stringify({ checkpoint, results, fetchedAt: new Date().toISOString() }, null, 2);
  const copyLogs = () => {
    void navigator.clipboard.writeText(logs);
    window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'success', message: 'Logs copied to clipboard' } }));
  };

  return <HealingLoopHero live={live} onCopyLogs={copyLogs} />;
}
