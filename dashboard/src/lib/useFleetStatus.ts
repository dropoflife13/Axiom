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
  /** Exact sum of totalTokens across completed trials for this run. */
  totalTokens: number;
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
  let totalTokens = 0;
  trials.forEach((t, i) => {
    sum += t.boundFactFraction ?? 0;
    series.push(sum / (i + 1));
    totalTokens += t.totalTokens ?? 0;
  });
  const step = Math.max(1, Math.ceil(series.length / 60));
  const convergenceSeries = series.filter((_, i) => i % step === 0 || i === series.length - 1);

  return {
    conditions,
    factFailures,
    convergence: trials.length ? sum / trials.length : null,
    convergenceSeries,
    totalTokens,
  };
}

async function fetchRun(run: RunOption, signal: AbortSignal): Promise<RunStatus> {
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const defaultTotal = run.id.toLowerCase().includes('mini') ? 48 : TRIALS_PER_RUN;
  const empty: RunStatus = {
    run,
    state: 'awaiting',
    done: 0,
    total: defaultTotal,
    convergence: null,
    convergenceSeries: [],
    conditions: summarizeTrials([]).conditions,
    factFailures: [],
    lastModified: null,
    totalTokens: 0,
  };
  try {
    let res: Response | null = null;
    if (isLocal) {
      res = await fetch(`/api/ablation-checkpoint?run=${run.id}`, { signal, cache: 'no-store' });
    } else {
      res = await fetch(`/data/run-${run.id}.json`, { signal, cache: 'no-store' });
    }
    if (!res.ok) return empty;
    const data = await res.json();
    const trials: CheckpointTrial[] = Array.isArray(data.trials) ? data.trials : Array.isArray(data) ? data : [];
    let total = typeof data.totalTrials === 'number' && data.totalTrials > 0
      ? data.totalTrials
      : run.id.toLowerCase().includes('mini')
      ? 48
      : TRIALS_PER_RUN;
    if (trials.length > total || (!run.id.toLowerCase().includes('mini') && (trials.length > 240 || run.id.toLowerCase().includes('expanded')))) {
      total = Math.max(TRIALS_PER_RUN, Math.ceil(trials.length / 6) * 6);
    }
    const mtime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
    const isGptOssLive = run.id.includes('gptoss') && trials.length < total && trials.length > 0;
    const live = Boolean(isGptOssLive || (mtime && Date.now() - mtime < FIVE_MINUTES_MS && trials.length < total));
    return {
      ...empty,
      ...summarizeTrials(trials),
      state: trials.length === 0 ? 'awaiting' : live ? 'live' : 'snapshot',
      done: Math.min(total, trials.length),
      total,
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
    let active = true;
    const controller = new AbortController();
    let timer: number | null = null;
    const isLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const intervalMs = isLocal ? 5000 : 60000;

    const load = async () => {
      try {
        const results = await Promise.all(runs.map((r) => fetchRun(r, controller.signal)));
        if (active) setFleet(results);
      } catch {
        /* aborted */
      }
    };

    const pollLoop = async () => {
      await load();
      if (active) {
        timer = window.setTimeout(() => void pollLoop(), intervalMs);
      }
    };

    void pollLoop();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [runs]);

  return fleet;
}
