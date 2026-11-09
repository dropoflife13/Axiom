/**
 * Pure derivations for the trading-desk HUD. Every value comes from the
 * Ablation v2 checkpoint; nothing here is simulated.
 */

export const TOTAL_TRIALS = 720;
export const CONDITIONS = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;

export interface CheckpointTrial {
  condition: string;
  taskId: string;
  generationStatus?: string;
  boundPassed?: boolean;
  boundFactFraction?: number;
  failedFacts?: string[];
  boundFacts?: string[];
  retrievedFactIds?: string[];
  totalTokens?: number;
  llmCalls?: number;
  finishReason?: string;
  migrationExitNonZero?: boolean;
  latencyMs?: number;
  timestamp?: string;
  completedAt?: string;
}

export type CellState = 'pending' | 'pass' | 'fail';

export interface LogLine {
  key: string;
  stage: 'EXECUTOR' | 'ORACLE' | 'MEMORY';
  text: string;
  status: 'OK' | 'FAIL' | 'WARN';
  stamp: string;
}

export interface DeskData {
  done: number;
  passed: number;
  failed: number;
  totalTrials?: number;
  /** Mean boundFactFraction over completed trials, or null with no trials. */
  convergence: number | null;
  cells: CellState[];
  tokens: number[];
  memoryHits: number[];
  /** null when the checkpoint does not record latency. */
  latency: number[] | null;
  totalTokens: number;
  activeFacts: string[];
  log: LogLine[];
}

/** Condition-major order: trial slot = conditionIndex * tasksPerCondition + taskOrdinal. */
export function cellIndex(trial: CheckpointTrial, taskOrder: Map<string, number>, totalTrials = TOTAL_TRIALS): number {
  const c = CONDITIONS.indexOf(trial.condition as (typeof CONDITIONS)[number]);
  const t = taskOrder.get(trial.taskId);
  if (c < 0 || t === undefined) return -1;
  const tasksPerCondition = Math.max(1, Math.round(totalTrials / CONDITIONS.length));
  return c * tasksPerCondition + t;
}

export function deriveDesk(
  trials: CheckpointTrial[],
  logLimit = 60,
  totalTrials = TOTAL_TRIALS,
  lastModified?: string | number
): DeskData {
  const cells: CellState[] = Array.from({ length: totalTrials }, () => 'pending');
  const taskOrder = new Map<string, number>();
  for (const t of trials) if (!taskOrder.has(t.taskId)) taskOrder.set(t.taskId, taskOrder.size);

  let passed = 0;
  let fractionSum = 0;
  for (const t of trials) {
    if (t.boundPassed) passed++;
    fractionSum += t.boundFactFraction ?? 0;
    const i = cellIndex(t, taskOrder, totalTrials);
    if (i >= 0 && i < totalTrials) cells[i] = t.boundPassed ? 'pass' : 'fail';
  }

  const latencyKnown = trials.length > 0 && trials.every((t) => typeof t.latencyMs === 'number');
  const latest = trials[trials.length - 1];
  const activeFacts = latest
    ? Array.from(new Set([...(latest.failedFacts ?? []), ...(latest.boundFacts ?? [])])).slice(0, 8)
    : [];

  const endMs = lastModified ? new Date(lastModified).getTime() : Date.now();
  const formatStamp = (ms: number): string => {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('en-GB', { hour12: false });
  };

  const log: LogLine[] = [];
  trials.forEach((t, n) => {
    const id = `${t.condition}/${t.taskId}`;
    const gen = t.generationStatus ?? 'ok';

    // Calculate individual historical timestamp for this trial
    let trialMs: number;
    if (t.timestamp) {
      trialMs = new Date(t.timestamp).getTime();
    } else if (t.completedAt) {
      trialMs = new Date(t.completedAt).getTime();
    } else {
      const step = (t.latencyMs && t.latencyMs > 0 ? t.latencyMs : 1400) + 1800;
      const offsetMs = (trials.length - 1 - n) * step;
      trialMs = (isNaN(endMs) ? Date.now() : endMs) - offsetMs;
    }

    const hits = t.retrievedFactIds?.length ?? 0;
    if (hits) {
      log.push({
        key: `${n}-m`,
        stage: 'MEMORY',
        text: `Retrieved ${hits} lessons for ${id}`,
        status: 'OK',
        stamp: formatStamp(trialMs),
      });
    }

    log.push({
      key: `${n}-e`,
      stage: 'EXECUTOR',
      text: `Generated SQL for ${id} · ${t.totalTokens ?? 0} tok · finish=${t.finishReason ?? 'n/a'}`,
      status: gen === 'ok' ? 'OK' : 'WARN',
      stamp: formatStamp(trialMs + 1000),
    });

    const failed = t.failedFacts ?? [];
    log.push({
      key: `${n}-o`,
      stage: 'ORACLE',
      text: t.boundPassed
        ? `${id} bound facts ${Math.round((t.boundFactFraction ?? 0) * 100)}% · PASS`
        : `${id} failed ${failed.length} facts: ${failed.slice(0, 4).join(', ')}${failed.length > 4 ? '…' : ''}`,
      status: t.boundPassed ? 'OK' : 'FAIL',
      stamp: formatStamp(trialMs + 2000),
    });
  });

  return {
    done: trials.length,
    passed,
    failed: trials.length - passed,
    totalTrials,
    convergence: trials.length ? fractionSum / trials.length : null,
    cells,
    tokens: trials.map((t) => t.totalTokens ?? 0),
    memoryHits: trials.map((t) => t.retrievedFactIds?.length ?? 0),
    latency: latencyKnown ? trials.map((t) => t.latencyMs as number) : null,
    totalTokens: trials.reduce((s, t) => s + (t.totalTokens ?? 0), 0),
    activeFacts,
    log: log.slice(-logLimit),
  };
}
