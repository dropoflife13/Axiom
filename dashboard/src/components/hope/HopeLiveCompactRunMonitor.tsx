'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import { formatPct1, formatSignedPp, shortSha } from '@/lib/v4-hope';

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
}

function statusPill(run: LiveCompactRun) {
  switch (run.status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          COMPLETED
        </span>
      );
    case 'evaluating_hope':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-cyan-500/45 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          C_ID_HOPE ({run.hopeCompletedTasks}/{run.totalTasks})
        </span>
      );
    case 'slow_clock_replay':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/45 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
          SLOW CLOCK REPLAY ({run.replayCacheTotal} cached)
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          <Clock className="h-3 w-3" />
          QUEUED
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
    // Replay cache typically accumulates ~15-35 entries before C_ID_hope eval starts
    return Math.min(45, Math.max(12, Math.round((run.replayCacheTotal / 28) * 45)));
  }
  return 0;
}

export function HopeLiveCompactRunMonitor() {
  const [data, setData] = useState<LiveCompactPayload | null>(null);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);

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
    void fetchLive();
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
        name: `${r.cartridgeId === 'policy-abac-v4' ? 'ABAC' : 'TS'} · ${r.shortName.replace('Flash-Lite', 'FL')}`,
        baselineTask: Number(((r.baseline.fullTaskPassRate ?? 0) * 100).toFixed(1)),
        compactTask:
          r.compact.fullTaskPassRate !== null
            ? Number((r.compact.fullTaskPassRate * 100).toFixed(1))
            : 0,
        baselineFact: Number(((r.baseline.meanFactPassRate ?? 0) * 100).toFixed(1)),
        compactFact:
          r.compact.meanFactPassRate !== null
            ? Number((r.compact.meanFactPassRate * 100).toFixed(1))
            : 0,
        status: r.status,
      }));
  }, [data]);

  const isAnyRunning = (data?.totals.activeRuns ?? 0) > 0;

  return (
    <section
      id="hope-live-compact-monitor"
      aria-labelledby="hope-live-compact-heading"
      className="rounded-lg border border-cyan-500/35 bg-[#0a0c12] overflow-hidden shadow-[0_0_40px_rgba(34,211,238,0.08)]"
    >
      {/* Top Live Header Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800 bg-gradient-to-r from-cyan-950/35 via-[#0d1018] to-emerald-950/25 px-5 py-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-cyan-500/45 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-cyan-300">
              <span
                className={`h-2 w-2 rounded-full ${
                  isAnyRunning ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'
                }`}
              />
              {isAnyRunning ? 'LIVE RUNNING · --COMPACT HOPE BENCHMARK' : 'PAIRED --COMPACT HOPE BENCHMARK'}
            </span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              Branch: feat/v4-compact-benchmark · K=4 · Temp=0
            </span>
            {data && (
              <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-500 tabular-nums">
                Polled: {new Date(data.polledAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <h2
            id="hope-live-compact-heading"
            className="text-base font-semibold tracking-tight text-zinc-50"
          >
            Real-Time Paired `--compact` vs. Baseline `C_ID_hope` Run Telemetry
          </h2>
          <p className="text-xs text-zinc-400">
            Live-polling <code className="font-mono text-[11px] text-zinc-300">.axiom-state/runs-v4/*-compact/</code>{' '}
            and <code className="font-mono text-[11px] text-zinc-300">out/v4/*-compact-*.json</code> across all 6
            runs (Policy-as-Code ABAC + TypeScript API Security × 3 models = 99 paired live trials).
          </p>
        </div>

        {/* Polling Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoPoll((p) => !p)}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
              autoPoll
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400'
            }`}
          >
            {autoPoll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>{autoPoll ? 'AUTO-POLL: 3s' : 'PAUSED'}</span>
          </button>
          <button
            type="button"
            onClick={() => void fetchLive()}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-cyan-500/50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin text-cyan-400' : ''}`} />
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {/* Top 4 Live Aggregate KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-zinc-800 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800 bg-[#0d1017]">
          <div className="p-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              LIVE RUN PROGRESS
            </span>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold text-zinc-50 tabular-nums">
                {data.totals.completedRuns}/{data.totals.totalRuns}
                <span className="ml-1 text-xs font-normal text-zinc-400">models</span>
              </span>
              <span className="font-mono text-xs text-cyan-400 tabular-nums">
                {data.totals.activeRuns} active · {data.totals.queuedRuns} queued
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.round(
                    ((data.totals.completedRuns + data.totals.activeRuns * 0.45) /
                      Math.max(1, data.totals.totalRuns)) *
                      100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              PAIRED C_ID_HOPE TRIALS
            </span>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold text-cyan-300 tabular-nums">
                {data.totals.totalCompletedTasks}/{data.totals.totalTargetTasks}
              </span>
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                {Math.round(
                  (data.totals.totalCompletedTasks / Math.max(1, data.totals.totalTargetTasks)) * 100
                )}
                % eval
              </span>
            </div>
            <p className="mt-1 text-[10.5px] font-mono text-zinc-500">
              54 ABAC + 45 TS-API paired live trials
            </p>
          </div>

          <div className="p-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              COMPACTION TOKEN SAVINGS
            </span>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold text-emerald-400 tabular-nums">
                -{data.totals.savedTokens.toLocaleString()} tok
              </span>
              <span className="font-mono text-xs text-emerald-300 tabular-nums">
                -{data.totals.weightedReductionPct.toFixed(2)}%
              </span>
            </div>
            <p className="mt-1 text-[10.5px] font-mono text-zinc-500 tabular-nums">
              {data.totals.totalBeforeTokens.toLocaleString()} →{' '}
              {data.totals.totalAfterTokens.toLocaleString()} prompt tokens
            </p>
          </div>

          <div className="p-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              LEXICAL LOCK &amp; CANARY SAFETY
            </span>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold text-emerald-400 tabular-nums">
                {data.totals.lexicalRetentionPct.toFixed(1)}%
              </span>
              <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                {data.totals.totalPromotedRegressions} REGRESSIONS
              </span>
            </div>
            <p className="mt-1 text-[10.5px] font-mono text-zinc-500 tabular-nums">
              {data.totals.totalPreservedTokens}/{data.totals.totalRequiredTokens} required tokens locked
            </p>
          </div>
        </div>
      )}

      {/* 6-Run Live Card Matrix (2 Cartridges x 3 Models) */}
      {data && (
        <div className="p-5 border-b border-zinc-800 bg-[#090b10] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              6-Run Parallel Execution Matrix (ABAC × 3 Models · TS-API × 3 Models)
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              Head-to-head vs. frozen non-compact C_ID_hope baselines
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.runs.map((run) => {
              const pct = progressPercent(run);
              const isAbac = run.cartridgeId === 'policy-abac-v4';
              return (
                <div
                  key={run.id}
                  className={`rounded-lg border p-4 flex flex-col justify-between gap-3 transition-all ${
                    run.status === 'completed'
                      ? 'border-emerald-500/35 bg-[#0d1314]/80'
                      : run.status === 'evaluating_hope' || run.status === 'slow_clock_replay'
                        ? 'border-cyan-500/45 bg-[#0c121a]/90 shadow-[0_0_20px_rgba(34,211,238,0.1)]'
                        : 'border-zinc-800/90 bg-[#0c0e14]/70'
                  }`}
                >
                  {/* Card Top */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase ${
                          isAbac
                            ? 'border-violet-500/35 bg-violet-500/10 text-violet-300'
                            : 'border-sky-500/35 bg-sky-500/10 text-sky-300'
                        }`}
                      >
                        {isAbac ? 'ABAC · 18T' : 'TS-API · 15T'}
                      </span>
                      {statusPill(run)}
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-mono text-xs font-bold text-zinc-100">
                        {run.shortName}
                      </h3>
                      <span className="font-mono text-[10px] text-zinc-500">{run.provider}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 tabular-nums">
                        <span>
                          {run.status === 'completed'
                            ? `${run.totalTasks}/${run.totalTasks} C_ID_hope trials`
                            : run.status === 'slow_clock_replay'
                              ? `Slow Clock Canary Replays: ${run.replayCacheTotal}`
                              : run.status === 'evaluating_hope'
                                ? `Evaluating C_ID_hope: ${run.hopeCompletedTasks}/${run.totalTasks}`
                                : 'Awaiting runner slot'}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            run.status === 'completed'
                              ? 'bg-emerald-400'
                              : run.status === 'slow_clock_replay'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-cyan-400 animate-pulse'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Paired Accuracy Comparison Box */}
                  <div className="grid grid-cols-3 gap-1.5 rounded border border-zinc-800/90 bg-[#07090e] p-2.5 font-mono text-[10.5px] tabular-nums">
                    <div>
                      <span className="text-[9px] text-zinc-500 block">BASELINE</span>
                      <span className="font-semibold text-zinc-300">
                        {run.baseline.fullTaskPassRate !== null
                          ? formatPct1(run.baseline.fullTaskPassRate)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500 block">COMPACT</span>
                      <span
                        className={`font-semibold ${
                          run.compact.fullTaskPassRate !== null
                            ? 'text-emerald-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {run.compact.fullTaskPassRate !== null
                          ? formatPct1(run.compact.fullTaskPassRate)
                          : 'pending'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-zinc-500 block">Δ TASK</span>
                      <span
                        className={`font-bold ${
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

                  {/* Compaction & Governance Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 font-mono text-[10px] text-zinc-400 tabular-nums">
                    {run.compaction ? (
                      <span className="text-emerald-300">
                        {run.compaction.beforeTokens}→{run.compaction.afterTokens} tok (-
                        {run.compaction.reductionPct.toFixed(1)}%) ·{' '}
                        {run.compaction.preservedTokenCount}/{run.compaction.totalRequiredTokens} lock
                      </span>
                    ) : (
                      <span className="text-zinc-500">
                        {run.replayCacheTotal > 0
                          ? `Replay cache active (${run.liveReplayCount} live)`
                          : 'Compaction stats pending'}
                      </span>
                    )}
                    {run.governance && (
                      <span className="text-zinc-400">
                        {run.governance.approvedCount}✓/{run.governance.rejectedCount}✕ ·{' '}
                        {run.governance.promotedRegressions} reg
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Split: Head-to-Head Chart + Real-Time Replay Stream */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
          {/* Left (6 cols): Paired Full-Task Comparison Bar Chart */}
          <div className="lg:col-span-6 p-4 bg-[#0b0d13] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Paired Non-Inferiority Chart: Baseline vs. --compact (Full-Task Pass %)
              </span>
              <span className="font-mono text-[10px] text-zinc-500">Auto-updates on completion</span>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
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
                    contentStyle={{
                      backgroundColor: '#0d0e13',
                      border: '1px solid #3f3f46',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)' }}
                  />
                  <Bar
                    dataKey="baselineTask"
                    name="Baseline C_ID_hope %"
                    fill="#38bdf8"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="compactTask"
                    name="--compact C_ID_hope %"
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right (6 cols): Real-Time Live Slow Clock Replay Stream */}
          <div className="lg:col-span-6 p-4 bg-[#07090e] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                Live Slow Clock Replay &amp; Evaluation Stream
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                Latest {data.recentReplayEvents.length} cached trials
              </span>
            </div>

            <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-1">
              {data.recentReplayEvents.length === 0 ? (
                <div className="rounded border border-zinc-800 bg-zinc-950/60 p-6 text-center font-mono text-xs text-zinc-500">
                  Waiting for first live replay entry in .axiom-state/runs-v4/*-compact/...
                </div>
              ) : (
                data.recentReplayEvents.map((ev, idx) => (
                  <div
                    key={`${ev.modelId}-${ev.taskId}-${ev.timestamp}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-zinc-800/80 bg-[#0b0d14] px-3 py-2 font-mono text-[10.5px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {ev.fullTaskPass ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                      )}
                      <span className="font-bold text-zinc-100">{ev.taskId}</span>
                      <span className="text-zinc-400 truncate">{ev.shortName}</span>
                      <span className="hidden sm:inline text-zinc-600">·</span>
                      <span className="text-[9.5px] text-cyan-300 truncate">
                        [{ev.retrievedRuleIds.join(', ')}]
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0 tabular-nums">
                      <span
                        className={
                          ev.fullTaskPass ? 'text-emerald-400 font-semibold' : 'text-amber-300'
                        }
                      >
                        {ev.passedFactsCount}/{ev.boundFactsCount} facts
                      </span>
                      {ev.failedFacts.length > 0 && (
                        <span className="text-[9.5px] text-rose-400">
                          fail: {ev.failedFacts.slice(0, 2).join(',')}
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
    </section>
  );
}

export default HopeLiveCompactRunMonitor;
