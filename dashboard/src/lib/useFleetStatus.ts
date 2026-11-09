'use client';

import { useEffect, useState } from 'react';
import { CONDITIONS, type CheckpointTrial } from './desk';
import { TRIALS_PER_RUN, type RunOption } from './runs';

export interface ConditionStat {
  condition: string;
  trials: number;
  /** Mean bound-fact fraction (0..1), null with no trials. */
  meanBound: number | null;
  /** Strict pass@1 over bound facts (0..1), null with no trials. */
  passRate: number | null;
  meanTokens: number | null;
}

export interface RunStatus {
  run: RunOption;
  state: 'live' | 'snapshot' | 'awaiting';
  done: number;
  total: number;
  /** Mean bound-fact fraction over all completed trials. */
  convergence: number | null;
  /** Running convergence after each completed trial, downsampled to <= 60 points. */
  convergenceSeries: number[];
  conditions: ConditionStat[];
  /** Fact id -> number of trials in which it failed, descending. */
  factFailures: [string, number][];
  lastModified: string | null;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function summarizeTrials(trials: CheckpointTrial[]) {
  const conditions: ConditionStat[] = CONDITIONS.map((condition) => {
    const subset = trials.filter((t) => t.condition === condition);
    const n = subset.length;
    if (!n) return { condition, trials: 0, meanBound: null, passRate: null, meanTokens: null };
    const bound = subset.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0) / n;
    const pass = subset.filter((t) => t.boundPassed).length / n;
    const tokTrials = subset.filter((t) => typeof t.totalTokens === 'number');
    const tok = tokTrials.length
      ? tokTrials.reduce((s, t) => s + (t.totalTokens ?? 0), 0) / tokTrials.length
      : null;
    return { condition, trials: n, meanBound: bound, passRate: pass, meanTokens: tok };
  });

  const counts = new Map<string, number>();
  for (const t of trials) for (const f of t.failedFacts ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
  const factFailures = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const series: number[] = [];
  let sum = 0;
  trials.forEach((t, i) => {
    sum += t.boundFactFraction ?? 0;
    series.push(sum / (i + 1));
  });
  const step = Math.max(1, Math.ceil(series.length / 60));
  const convergenceSeries = series.filter((_, i) => i % step === 0 || i === series.length - 1);

  return {
    conditions,
    factFailures,
    convergence: trials.length ? sum / trials.length : null,
    convergenceSeries,
  };
}

async function fetchRun(run: RunOption, signal: AbortSignal): Promise<RunStatus> {
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const empty: RunStatus = {
    run,
    state: 'awaiting',
    done: 0,
    total: TRIALS_PER_RUN,
    convergence: null,
    convergenceSeries: [],
    conditions: summarizeTrials([]).conditions,
    factFailures: [],
    lastModified: null,
  };
  try {
    let res: Response | null = null;
    if (isLocal) {
      res = await fetch(`/api/ablation-checkpoint?run=${run.id}`, { signal, cache: 'no-store' });
    }
    if (!res || !res.ok) {
      res = await fetch(`/data/run-${run.id}.json`, { signal, cache: 'no-store' });
    }
    if (!res.ok) return empty;
    const data = await res.json();
    const trials: CheckpointTrial[] = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];
    const mtime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
    const live = Boolean(mtime && Date.now() - mtime < FIVE_MINUTES_MS && trials.length < TRIALS_PER_RUN);
    return {
      ...empty,
      ...summarizeTrials(trials),
      state: trials.length === 0 ? 'awaiting' : live ? 'live' : 'snapshot',
      done: Math.min(TRIALS_PER_RUN, trials.length),
      lastModified: data.lastModified ?? null,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return empty;
  }
}

/** Polls every configured run so parallel ablations can be tracked side by side. */
export function useFleetStatus(runs: readonly RunOption[]): RunStatus[] {
  const [fleet, setFleet] = useState<RunStatus[]>([]);

  useEffect(() => {
    let controller = new AbortController();
    const load = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        const results = await Promise.all(runs.map((r) => fetchRun(r, controller.signal)));
        setFleet(results);
      } catch {
        /* aborted */
      }
    };
    void load();
    const isLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const timer = window.setInterval(load, isLocal ? 5000 : 60000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [runs]);

  return fleet;
}
