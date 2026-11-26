'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  Clock,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPct1, formatSignedPp } from '@/lib/v4-hope';
import type { FlowTraceEvent, FlowTraceStats } from '@/lib/v4-hope-flow';
import { HopeExecutionFlowView } from './HopeExecutionFlowView';

type MonitorViewMode = 'flow' | 'matrix';

interface LiveCompactRun {
  readonly id: string;
  readonly cartridgeId: 'policy-abac-v4' | 'ts-api-security-v4';
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly modelSlug: string;
  readonly shortName: string;
  readonly provider: string;
  readonly status: 'completed' | 'evaluating_hope' | 'slow_clock_replay' | 'queued';
  readonly totalTasks: number;
  readonly hopeCompletedTasks: number;
  readonly hopePassedTasks: number;
  readonly replayCacheTotal: number;
  readonly liveReplayCount: number;
  readonly baseline: {
    readonly fullTaskPassRate: number | null;
    readonly meanFactPassRate: number | null;
    readonly fullTaskPassCount: number | null;
  };
  readonly compact: {
    readonly fullTaskPassRate: number | null;
    readonly meanFactPassRate: number | null;
    readonly fullTaskPassCount: number | null;
  };
  readonly deltaPp: {
    readonly fullTask: number | null;
    readonly meanFact: number | null;
  };
  readonly compaction: {
    readonly enabled: boolean;
    readonly bundlesCompacted: number;
    readonly beforeTokens: number;
    readonly afterTokens: number;
    readonly savedTokens: number;
    readonly reductionPct: number;
    readonly preservedTokenCount: number;
    readonly totalRequiredTokens: number;
    readonly droppedRuleCount?: number;
  } | null;
  readonly governance: {
    readonly totalAudits: number;
    readonly approvedCount: number;
    readonly rejectedCount: number;
    readonly promotedRegressions: number;
    readonly finalSnapshotSha256: string | null;
  } | null;
  readonly lastUpdatedAt: string | null;
}

interface LiveReplayEvent {
  readonly cartridgeId: string;
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly shortName: string;
  readonly taskId: string;
  readonly retrievedRuleIds: string[];
  readonly fullTaskPass: boolean;
  readonly passedFactsCount: number;
  readonly boundFactsCount: number;
  readonly factPassRate: number;
  readonly failedFacts: string[];
  readonly latencyMs?: number;
  readonly source: string;
  readonly timestamp: string;
}

interface LiveCompactPayload {
  readonly polledAt: string;
  readonly totals: {
    readonly totalRuns: number;
    readonly completedRuns: number;
    readonly activeRuns: number;
    readonly queuedRuns: number;
    readonly totalCompletedTasks: number;
    readonly totalTargetTasks: number;
    readonly totalBeforeTokens: number;
    readonly totalAfterTokens: number;
    readonly savedTokens: number;
    readonly weightedReductionPct: number;
    readonly totalPreservedTokens: number;
    readonly totalRequiredTokens: number;
    readonly lexicalRetentionPct: number;
    readonly totalPromotedRegressions: number;
  };
  readonly runs: readonly LiveCompactRun[];
  readonly recentReplayEvents: readonly LiveReplayEvent[];
  readonly compiledSummaryAvailable: boolean;
  readonly traceStream?: readonly FlowTraceEvent[];
  readonly traceStats?: FlowTraceStats;
}

function statusPill(run: LiveCompactRun) {
  switch (run.status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald-700/60 bg-emerald-950/35 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          FINISHED
        </span>
      );
    case 'evaluating_hope':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-sky-700/60 bg-sky-950/40 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping" />
          TESTING ({run.hopeCompletedTasks}/{run.totalTasks})
        </span>
      );
    case 'slow_clock_replay':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-700/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
          SAFETY REPLAY ({run.replayCacheTotal})
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          <Clock className="h-3 w-3" aria-hidden="true" />
          WAITING
        </span>
      );
  }
}

function progressPercent(run: LiveCompactRun): number {
  if (run.status === 'completed') return 100;
  if (run.status === 'evaluating_hope') {
    return Math.min(98, 45 + Math.round((run.hopeCompletedTasks / Math.max(1, run.totalTasks)) * 55));
  }
  if (run.status === 'slow_clock_replay') {
    return Math.min(45, Math.max(12, Math.round((run.replayCacheTotal / 28) * 45)));
  }
  return 0;
}

export function HopeLiveCompactRunMonitor() {
  const [viewMode, setViewMode] = useState<MonitorViewMode>('flow');
  const [data, setData] = useState<LiveCompactPayload | null>(null);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [selectedRunFilter, setSelectedRunFilter] = useState<string | null>(null);
  const viewTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasInitialFetchRef = useRef<boolean>(false);

  const fetchLive = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/v4-hope/live-compact', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as LiveCompactPayload;
      setData(json);
    } catch {
      // ignore transient poll errors
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (autoPoll || !hasInitialFetchRef.current) {
      hasInitialFetchRef.current = true;
      void fetchLive();
    }
    if (!autoPoll) return;
    const id = window.setInterval(() => {
      void fetchLive();
    }, 3000);
    return () => window.clearInterval(id);
  }, [autoPoll, fetchLive]);

  const chartRows = useMemo(() => {
    if (!data) return [];
    return data.runs
      .filter((r) => r.baseline.fullTaskPassRate !== null)
      .map((r) => ({
        name: `${r.cartridgeId === 'policy-abac-v4' ? 'Access' : 'API'} · ${r.shortName.replace('Flash-Lite', 'FL')}`,
        standardPass: Number(((r.baseline.fullTaskPassRate ?? 0) * 100).toFixed(1)),
        shortenedPass:
          r.compact.fullTaskPassRate !== null
            ? Number((r.compact.fullTaskPassRate * 100).toFixed(1))
            : 0,
      }));
  }, [data]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (!selectedRunFilter) return data.recentReplayEvents;
    const targetRun = data.runs.find((r) => r.id === selectedRunFilter);
    if (!targetRun) return data.recentReplayEvents;
    return data.recentReplayEvents.filter(
      (ev) => ev.modelId === targetRun.modelId && ev.cartridgeId === targetRun.cartridgeId
    );
  }, [data, selectedRunFilter]);

  const isAnyRunning = (data?.totals.activeRuns ?? 0) > 0;

  return (
    <div
      id="hope-live-compact-monitor"
      aria-labelledby="hope-live-compact-heading"
      className="w-full border border-zinc-800/80 bg-[#0b0c10] rounded-[2px] overflow-hidden divide-y divide-zinc-800/80"
    >
      {/* Clear Plain-English Introduction & Live Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#0d0e13] px-5 py-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span
              className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                isAnyRunning
                  ? 'border-sky-700/60 bg-sky-950/40 text-sky-300'
                  : 'border-emerald-700/60 bg-emerald-950/35 text-emerald-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isAnyRunning ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'
                }`}
              />
              {isAnyRunning ? 'LIVE BENCHMARK RUNNING' : 'LIVE BENCHMARK COMPLETE'}
            </span>
            {data && (
              <span className="text-[10px] text-zinc-500 tabular-nums">
                Updated {new Date(data.polledAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <h2
            id="hope-live-compact-heading"
            className="text-base font-semibold tracking-tight text-zinc-50"
          >
            Live Prompt-Compression Test (Standard vs. Shortened Rules)
          </h2>
          <p className="text-xs leading-relaxed text-zinc-400">
            This live test checks whether trimming extra filler words out of our safety rules saves
            prompt tokens <strong className="text-zinc-200 font-medium">without losing accuracy</strong>.
            Every shortened rule is required to keep 100% of its exact code keywords and pass all
            existing safety checks across 3 AI models and 2 real-world coding domains (99 total tasks).
          </p>
        </div>

        {/* Polling Controls & View Mode Switch */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div
            role="tablist"
            aria-label="Live Monitor View Mode"
            onKeyDown={(e) => {
              const modes: readonly MonitorViewMode[] = ['flow', 'matrix'];
              const idx = modes.indexOf(viewMode);
              let nextIdx = idx;
              if (e.key === 'ArrowRight') nextIdx = (idx + 1) % modes.length;
              else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + modes.length) % modes.length;
              else if (e.key === 'Home') nextIdx = 0;
              else if (e.key === 'End') nextIdx = modes.length - 1;
              else return;
              e.preventDefault();
              setViewMode(modes[nextIdx]);
              viewTabRefs.current[nextIdx]?.focus();
            }}
            className="inline-flex items-center rounded-[2px] border border-zinc-800/80 bg-[#08090c] divide-x divide-zinc-800/80 font-mono"
          >
            {(
              [
                { value: 'flow', label: 'Flow Trace' },
                { value: 'matrix', label: 'Matrix' },
              ] as const
            ).map((opt, idx) => {
              const isSelected = viewMode === opt.value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    viewTabRefs.current[idx] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setViewMode(opt.value)}
                  className={`relative px-3 py-1.5 text-[11px] font-mono tracking-tight transition-colors whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900/90 text-zinc-50'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setAutoPoll((p) => !p)}
            className={`inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
              autoPoll
                ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/50'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {autoPoll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>{autoPoll ? 'Live Updates: On (3s)' : 'Live Updates: Paused'}</span>
          </button>
          <button
            type="button"
            onClick={() => void fetchLive()}
            className="inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-800 bg-[#08090c] px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {viewMode === 'flow' && (
        <HopeExecutionFlowView
          liveData={data}
          liveLock={autoPoll}
          onLiveLockChange={setAutoPoll}
          onRequestRefresh={fetchLive}
          isRefreshingExternal={isFetching}
        />
      )}

      {viewMode === 'matrix' && (
        <>
          {/* 4 Clear Summary Counters */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80 bg-[#0b0c10] font-mono tabular-nums">
          <div className="p-4 transition-colors hover:bg-zinc-900/35">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Models Completed
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold text-zinc-50">
                {data.totals.completedRuns} / {data.totals.totalRuns}
              </span>
              <span className="text-[10.5px] text-sky-400">
                {data.totals.activeRuns} running · {data.totals.queuedRuns} waiting
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-zinc-900 border border-zinc-800/80 rounded-[1px] overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500"
                initial={false}
                animate={{
                  width: `${Math.round(
                    ((data.totals.completedRuns + data.totals.activeRuns * 0.45) /
                      Math.max(1, data.totals.totalRuns)) *
                      100
                  )}%`,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="p-4 transition-colors hover:bg-zinc-900/35">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Coding Tasks Evaluated
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold text-sky-300">
                {data.totals.totalCompletedTasks} / {data.totals.totalTargetTasks}
              </span>
              <span className="text-[10.5px] text-zinc-400">
                {Math.round(
                  (data.totals.totalCompletedTasks / Math.max(1, data.totals.totalTargetTasks)) * 100
                )}
                % done
              </span>
            </div>
            <p className="mt-1.5 font-sans text-[11px] text-zinc-500">
              54 access-rule tasks + 45 TypeScript API tasks
            </p>
          </div>

          <div className="p-4 transition-colors hover:bg-zinc-900/35">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Prompt Size Saved
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold text-emerald-400">
                -{data.totals.savedTokens.toLocaleString()} tok
              </span>
              <span className="text-[10.5px] text-emerald-300">
                -{data.totals.weightedReductionPct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1.5 font-sans text-[11px] text-zinc-500">
              {data.totals.totalBeforeTokens.toLocaleString()} →{' '}
              {data.totals.totalAfterTokens.toLocaleString()} tokens sent to models
            </p>
          </div>

          <div className="p-4 transition-colors hover:bg-zinc-900/35">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Exact Keywords Kept
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold text-emerald-400">
                {data.totals.lexicalRetentionPct.toFixed(1)}%
              </span>
              <span className="rounded-[2px] border border-emerald-700/60 bg-emerald-950/35 px-1.5 py-0.5 text-[10px] text-emerald-300">
                {data.totals.totalPromotedRegressions} BROKEN TESTS
              </span>
            </div>
            <p className="mt-1.5 font-sans text-[11px] text-zinc-500">
              {data.totals.totalPreservedTokens} of {data.totals.totalRequiredTokens} code keywords
              preserved verbatim
            </p>
          </div>
        </div>
      )}

      {/* 6-Run Interactive Card Grid */}
      {data && (
        <div className="p-5 bg-[#08090c] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Model-by-Model Live Progress (6 Parallel Runs)
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Click any model card to filter the live task feed below. Green deltas mean shortened
                rules matched or beat the full-length rules.
              </p>
            </div>
            {selectedRunFilter && (
              <button
                type="button"
                onClick={() => setSelectedRunFilter(null)}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[10.5px] text-zinc-200 hover:border-zinc-500 transition-colors cursor-pointer"
              >
                <Filter className="h-3 w-3 text-sky-400" />
                <span>Clear model filter</span>
                <X className="h-3 w-3 text-zinc-400" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.runs.map((run, idx) => {
              const pct = progressPercent(run);
              const isAbac = run.cartridgeId === 'policy-abac-v4';
              const isSelected = selectedRunFilter === run.id;

              return (
                <motion.button
                  key={run.id}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: idx * 0.04 }}
                  onClick={() =>
                    setSelectedRunFilter((prev) => (prev === run.id ? null : run.id))
                  }
                  className={`text-left rounded-[2px] border p-4 flex flex-col justify-between gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-sky-500/80 bg-[#0d141d]'
                      : run.status === 'completed'
                        ? 'border-zinc-800/90 bg-[#0b0c10] hover:border-emerald-600/60 hover:bg-[#0d1112]'
                        : run.status === 'evaluating_hope' || run.status === 'slow_clock_replay'
                          ? 'border-sky-800/70 bg-[#0c1017] hover:border-sky-500/60'
                          : 'border-zinc-800/80 bg-[#0b0c10] hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-2.5 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase ${
                          isAbac
                            ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
                            : 'border-sky-800/60 bg-sky-950/30 text-sky-300'
                        }`}
                      >
                        {isAbac ? 'Access Rules · 18 tasks' : 'API Security · 15 tasks'}
                      </span>
                      {statusPill(run)}
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="font-mono text-xs font-semibold text-zinc-100">
                        {run.shortName}
                      </h4>
                      <span className="font-mono text-[10px] text-zinc-500">{run.provider}</span>
                    </div>

                    {/* Animated Progress Track */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 tabular-nums">
                        <span>
                          {run.status === 'completed'
                            ? `All ${run.totalTasks} tasks verified`
                            : run.status === 'slow_clock_replay'
                              ? `Checking safety replays (${run.replayCacheTotal} cached)`
                              : run.status === 'evaluating_hope'
                                ? `Evaluating tasks (${run.hopeCompletedTasks}/${run.totalTasks})`
                                : 'Waiting for available slot'}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-900 border border-zinc-800/80 rounded-[1px] overflow-hidden">
                        <motion.div
                          className={`h-full ${
                            run.status === 'completed'
                              ? 'bg-emerald-500'
                              : run.status === 'slow_clock_replay'
                                ? 'bg-amber-500'
                                : 'bg-sky-400'
                          }`}
                          initial={false}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Plain-English Head-to-Head Accuracy Box */}
                  <div className="w-full grid grid-cols-3 gap-2 rounded-[2px] border border-zinc-800/80 bg-[#08090c] p-2.5 font-mono text-[10.5px] tabular-nums">
                    <div>
                      <span className="text-[9px] text-zinc-500 block uppercase">Standard</span>
                      <span className="font-medium text-zinc-300">
                        {run.baseline.fullTaskPassRate !== null
                          ? formatPct1(run.baseline.fullTaskPassRate)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500 block uppercase">Shortened</span>
                      <span
                        className={`font-semibold ${
                          run.compact.fullTaskPassRate !== null
                            ? 'text-emerald-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {run.compact.fullTaskPassRate !== null
                          ? formatPct1(run.compact.fullTaskPassRate)
                          : 'Pending'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-zinc-500 block uppercase">Change</span>
                      <span
                        className={`font-semibold ${
                          run.deltaPp.fullTask === null
                            ? 'text-zinc-600'
                            : run.deltaPp.fullTask >= 0
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {run.deltaPp.fullTask !== null
                          ? formatSignedPp(run.deltaPp.fullTask)
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="w-full flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 font-mono text-[10px] text-zinc-400 tabular-nums">
                    {run.compaction ? (
                      <span className="text-emerald-400">
                        Saved {run.compaction.reductionPct.toFixed(1)}% tokens ·{' '}
                        {run.compaction.preservedTokenCount}/{run.compaction.totalRequiredTokens}{' '}
                        keywords
                      </span>
                    ) : (
                      <span className="text-zinc-500">
                        {run.replayCacheTotal > 0
                          ? `${run.liveReplayCount} live safety checks logged`
                          : 'Token savings calculated on finish'}
                      </span>
                    )}
                    {run.governance && (
                      <span className="text-zinc-500">
                        {run.governance.promotedRegressions} broken
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Split: Clear Accuracy Chart + Live Task Feed */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
          {/* Left: Accuracy Comparison Chart */}
          <div className="lg:col-span-6 p-5 bg-[#0b0c10] space-y-3">
            <div>
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                Accuracy Check: Standard vs. Shortened Rules
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Compares full-task pass rates before and after prompt compression. Bars update
                automatically as each model finishes.
              </p>
            </div>
            <div className="h-[245px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{
                      backgroundColor: '#0b0c10',
                      border: '1px solid #3f3f46',
                      borderRadius: '2px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)' }} />
                  <Bar
                    dataKey="standardPass"
                    name="Standard Rules (%)"
                    fill="#0284c7"
                    radius={[1, 1, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="shortenedPass"
                    name="Shortened Rules (%)"
                    fill="#10b981"
                    radius={[1, 1, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right: Live Task-by-Task Feed */}
          <div className="lg:col-span-6 p-5 bg-[#08090c] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  Live Task-by-Task Results Feed
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Most recent coding tasks graded deterministically against the test suite.
                </p>
              </div>
              <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                {filteredEvents.length} recent
              </span>
            </div>

            <div className="max-h-[245px] overflow-y-auto space-y-1.5 pr-1">
              {filteredEvents.length === 0 ? (
                <div className="rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] p-6 text-center font-mono text-xs text-zinc-500">
                  No recent task events match this filter yet.
                </div>
              ) : (
                filteredEvents.map((ev, idx) => (
                  <div
                    key={`${ev.modelId}-${ev.taskId}-${ev.timestamp}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] px-3 py-2 font-mono text-[10.5px] transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {ev.fullTaskPass ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-zinc-100">{ev.taskId}</span>
                      <span className="text-zinc-400 truncate">{ev.shortName}</span>
                      <span className="hidden sm:inline text-zinc-700">·</span>
                      <span className="text-[9.5px] text-sky-400 truncate">
                        Rules: {ev.retrievedRuleIds.join(', ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0 tabular-nums">
                      <span
                        className={
                          ev.fullTaskPass ? 'text-emerald-400 font-medium' : 'text-amber-400'
                        }
                      >
                        {ev.passedFactsCount}/{ev.boundFactsCount} checks
                      </span>
                      {ev.failedFacts.length > 0 && (
                        <span className="text-[9.5px] text-rose-400">
                          missed {ev.failedFacts.slice(0, 2).join(', ')}
                        </span>
                      )}
                      {ev.latencyMs !== undefined && (
                        <span className="text-[9.5px] text-zinc-500">{ev.latencyMs}ms</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default HopeLiveCompactRunMonitor;
