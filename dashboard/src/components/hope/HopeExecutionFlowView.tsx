'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  GitCommitHorizontal,
  Lock,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';
import {
  fetchV4HopePayload,
  shortSha,
  type V4HopeDashboardPayload,
  type V4HopeReceipt,
} from '@/lib/v4-hope';
import {
  computeFlowTraceStats,
  type FlowNodeId,
  type FlowOutcome,
  type FlowTraceEvent,
  type FlowTraceStats,
} from '@/lib/v4-hope-flow';
import { HopeFilamentCanvas } from './HopeFilamentCanvas';

export interface LiveCompactFlowTotals {
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
}

export interface LiveCompactFlowPayload {
  readonly polledAt: string;
  readonly totals: LiveCompactFlowTotals;
  readonly traceStream?: readonly FlowTraceEvent[];
  readonly traceStats?: FlowTraceStats;
}

export interface HopeExecutionFlowViewProps {
  readonly liveData?: LiveCompactFlowPayload | null;
  readonly liveLock?: boolean;
  readonly onLiveLockChange?: (next: boolean) => void;
  readonly onRequestRefresh?: () => Promise<void> | void;
  readonly isRefreshingExternal?: boolean;
}

type CartridgeFilter =
  | 'all'
  | 'policy-abac-v4'
  | 'ts-api-security-v4'
  | 'redteam-v1-loopback';

type VerdictOutcomeFilter = 'ALL' | FlowOutcome;

const VERDICT_PAGE_SIZE = 20;

const FILTER_OPTIONS: ReadonlyArray<{
  readonly value: CartridgeFilter;
  readonly label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'policy-abac-v4', label: 'Access Rules' },
  { value: 'ts-api-security-v4', label: 'API Security' },
  { value: 'redteam-v1-loopback', label: 'Red-Team' },
];

const NODE_SHORT_LABELS: Record<FlowNodeId, string> = {
  TASK_IN: 'TASK IN',
  FAST_CLOCK: 'FAST CLOCK',
  ORACLE_VERIFIER: 'ORACLE',
  VERIFIED_OUTPUT: 'VERIFIED',
  QUARANTINE_VAULT: 'QUARANTINE',
  SLOW_CLOCK_GATE: 'SLOW GATE',
  GATE_APPROVED: 'APPROVED',
  GATE_REJECTED: 'REJECTED',
};

function outcomeColorText(outcome: FlowOutcome): string {
  switch (outcome) {
    case 'PASS':
      return 'text-[#10b981]';
    case 'FAIL':
      return 'text-[#ef4444]';
    case 'QUARANTINE':
      return 'text-[#f59e0b]';
  }
}

function outcomeBadgeClasses(outcome: FlowOutcome): string {
  switch (outcome) {
    case 'PASS':
      return 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]';
    case 'FAIL':
      return 'border-[#ef4444]/50 bg-[#ef4444]/10 text-[#ef4444]';
    case 'QUARANTINE':
      return 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]';
  }
}

function outcomeTickColor(outcome: FlowOutcome): string {
  switch (outcome) {
    case 'PASS':
      return '#10b981';
    case 'FAIL':
      return '#ef4444';
    case 'QUARANTINE':
      return '#f59e0b';
  }
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function GateCheckPill({
  label,
  passed,
}: {
  readonly label: string;
  readonly passed: boolean | undefined;
}) {
  if (passed === undefined) {
    return (
      <div className="rounded-[2px] border border-zinc-800/80 bg-[#090b0f] px-2 py-1.5 flex items-center justify-between gap-1.5">
        <span className="text-[10px] text-zinc-500">{label}</span>
        <span className="text-[10px] text-zinc-600">SKIP</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[2px] border px-2 py-1.5 flex items-center justify-between gap-1.5 ${
        passed
          ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]'
          : 'border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]'
      }`}
    >
      <span className="text-[10px]">{label}</span>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
        {passed ? (
          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
        ) : (
          <XCircle className="h-2.5 w-2.5" aria-hidden="true" />
        )}
        {passed ? 'PASS' : 'FAIL'}
      </span>
    </div>
  );
}

export function HopeExecutionFlowView({
  liveData: externalLiveData,
  liveLock: externalLiveLock,
  onLiveLockChange,
  onRequestRefresh,
  isRefreshingExternal,
}: HopeExecutionFlowViewProps) {
  const isControlledData = externalLiveData !== undefined;
  const isControlledLock =
    externalLiveLock !== undefined && onLiveLockChange !== undefined;

  const [internalLiveData, setInternalLiveData] =
    useState<LiveCompactFlowPayload | null>(null);
  const [internalLiveLock, setInternalLiveLock] = useState<boolean>(true);
  const [internalFetching, setInternalFetching] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [hopePayload, setHopePayload] = useState<V4HopeDashboardPayload | null>(
    null
  );
  const [hopeError, setHopeError] = useState<boolean>(false);

  const [cartridgeFilter, setCartridgeFilter] = useState<CartridgeFilter>('all');
  const [selectedNode, setSelectedNode] = useState<FlowNodeId | null>(null);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [verdictOutcomeFilter, setVerdictOutcomeFilter] =
    useState<VerdictOutcomeFilter>('ALL');
  const [verdictSearch, setVerdictSearch] = useState<string>('');
  const [verdictPage, setVerdictPage] = useState<number>(0);
  const [scrollActiveNonce, setScrollActiveNonce] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  const hasStandaloneFetchRef = useRef<boolean>(false);
  const mainStageRef = useRef<HTMLDivElement | null>(null);
  const verdictLogRef = useRef<HTMLElement | null>(null);
  const verdictTableScrollRef = useRef<HTMLDivElement | null>(null);
  const activeVerdictRowRef = useRef<HTMLTableRowElement | null>(null);

  const liveData = isControlledData ? externalLiveData : internalLiveData;
  const liveLock = isControlledLock ? externalLiveLock : internalLiveLock;
  const isFetching = isControlledData
    ? Boolean(isRefreshingExternal)
    : internalFetching;

  const setLiveLock = useCallback(
    (next: boolean) => {
      if (isControlledLock) {
        onLiveLockChange(next);
      } else {
        setInternalLiveLock(next);
      }
    },
    [isControlledLock, onLiveLockChange]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchVaultBaseline = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await fetchV4HopePayload(signal);
      if (!mountedRef.current) return;
      setHopePayload(payload);
      setHopeError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      setHopeError(true);
    }
  }, []);

  const fetchStandaloneLive = useCallback(async (signal?: AbortSignal) => {
    if (!mountedRef.current) return;
    setInternalFetching(true);
    try {
      const res = await fetch('/api/v4-hope/live-compact', {
        cache: 'no-store',
        signal,
      });
      if (!res.ok) {
        if (mountedRef.current) {
          setLiveError(`HTTP ${res.status}`);
        }
        return;
      }
      const json = (await res.json()) as LiveCompactFlowPayload;
      if (!mountedRef.current) return;
      setInternalLiveData(json);
      setLiveError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      setLiveError('Unable to reach live-compact telemetry endpoint');
    } finally {
      if (mountedRef.current) {
        setInternalFetching(false);
      }
    }
  }, []);

  // Load /api/v4-hope vault baseline & receipt snapshot telemetry on mount
  useEffect(() => {
    const controller = new AbortController();
    void fetchVaultBaseline(controller.signal);
    return () => controller.abort();
  }, [fetchVaultBaseline]);

  // Standalone /api/v4-hope/live-compact polling (ONLY runs if not controlled by parent, and ONLY polls every 3000ms when liveLock === true)
  useEffect(() => {
    if (isControlledData) return;
    const controller = new AbortController();
    if (liveLock || !hasStandaloneFetchRef.current) {
      hasStandaloneFetchRef.current = true;
      void fetchStandaloneLive(controller.signal);
    }
    if (!liveLock) {
      return () => controller.abort();
    }
    const intervalId = window.setInterval(() => {
      void fetchStandaloneLive(controller.signal);
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [isControlledData, liveLock, fetchStandaloneLive]);

  const allEvents = useMemo<readonly FlowTraceEvent[]>(
    () => liveData?.traceStream ?? [],
    [liveData]
  );

  const filterCounts = useMemo(() => {
    const counts: Record<CartridgeFilter, number> = {
      all: allEvents.length,
      'policy-abac-v4': 0,
      'ts-api-security-v4': 0,
      'redteam-v1-loopback': 0,
    };
    for (const ev of allEvents) {
      if (ev.cartridgeId in counts) {
        counts[ev.cartridgeId] += 1;
      }
    }
    return counts;
  }, [allEvents]);

  const visibleEvents = useMemo<readonly FlowTraceEvent[]>(() => {
    const byCartridge =
      cartridgeFilter === 'all'
        ? allEvents
        : allEvents.filter((ev) => ev.cartridgeId === cartridgeFilter);

    if (selectedNode === null) return byCartridge;
    return byCartridge.filter(
      (ev) =>
        ev.pathNodes.includes(selectedNode) || ev.terminalNode === selectedNode
    );
  }, [allEvents, cartridgeFilter, selectedNode]);

  // Auto-track latest event when LIVE lock is active; clamp cleanly otherwise
  const clampedIndex = useMemo(() => {
    if (visibleEvents.length === 0) return 0;
    if (liveLock) return visibleEvents.length - 1;
    return Math.min(Math.max(0, replayIndex), visibleEvents.length - 1);
  }, [visibleEvents.length, liveLock, replayIndex]);

  const activeEvent: FlowTraceEvent | null =
    visibleEvents.length > 0 ? visibleEvents[clampedIndex] ?? null : null;

  // Replay interval (~320ms) when Play is active
  useEffect(() => {
    if (!isPlaying || visibleEvents.length <= 1) return;
    const timer = window.setTimeout(() => {
      const next = clampedIndex + 1;
      if (next >= visibleEvents.length - 1) {
        setReplayIndex(visibleEvents.length - 1);
        setIsPlaying(false);
      } else {
        setReplayIndex(next);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [isPlaying, clampedIndex, visibleEvents.length]);

  // Scroll active row cleanly inside the bounded Verdict Log table only when requested (never scrolls window)
  useEffect(() => {
    if (scrollActiveNonce === 0) return;
    const container = verdictTableScrollRef.current;
    const row = activeVerdictRowRef.current;
    if (!container || !row) return;
    const rowTop = row.offsetTop;
    const rowHeight = row.offsetHeight;
    const viewHeight = container.clientHeight;
    const targetTop = Math.max(0, rowTop - viewHeight / 2 + rowHeight / 2);
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollActiveNonce, verdictPage]);

  const unlockToIndex = useCallback(
    (index: number) => {
      const safeIndex =
        visibleEvents.length > 0
          ? Math.min(Math.max(0, index), visibleEvents.length - 1)
          : 0;
      setIsPlaying(false);
      setLiveLock(false);
      setReplayIndex(safeIndex);
    },
    [setLiveLock, visibleEvents.length]
  );

  const handleSelectEvent = useCallback(
    (index: number) => {
      unlockToIndex(index);
    },
    [unlockToIndex]
  );

  const handleSelectNode = useCallback((nodeId: FlowNodeId | null) => {
    setIsPlaying(false);
    setReplayIndex(0);
    setVerdictPage(0);
    setSelectedNode(nodeId);
  }, []);

  const handleToggleLiveLock = useCallback(() => {
    if (liveLock) {
      setIsPlaying(false);
      setReplayIndex(Math.max(0, visibleEvents.length - 1));
      setLiveLock(false);
    } else {
      setIsPlaying(false);
      setLiveLock(true);
    }
  }, [liveLock, setLiveLock, visibleEvents.length]);

  const handleStepBack = useCallback(() => {
    if (visibleEvents.length === 0) return;
    unlockToIndex(Math.max(0, clampedIndex - 1));
  }, [clampedIndex, unlockToIndex, visibleEvents.length]);

  const handleStepForward = useCallback(() => {
    if (visibleEvents.length === 0) return;
    unlockToIndex(Math.min(visibleEvents.length - 1, clampedIndex + 1));
  }, [clampedIndex, unlockToIndex, visibleEvents.length]);

  const handleTogglePlay = useCallback(() => {
    if (visibleEvents.length <= 1) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setLiveLock(false);
    if (clampedIndex >= visibleEvents.length - 1) {
      setReplayIndex(0);
    } else {
      setReplayIndex(clampedIndex);
    }
    setIsPlaying(true);
  }, [clampedIndex, isPlaying, setLiveLock, visibleEvents.length]);

  const handleManualRefresh = useCallback(() => {
    void fetchVaultBaseline();
    if (onRequestRefresh) {
      void onRequestRefresh();
    } else {
      void fetchStandaloneLive();
    }
  }, [fetchStandaloneLive, fetchVaultBaseline, onRequestRefresh]);

  const vaultSummary = useMemo(() => {
    if (!hopePayload) return null;
    const allReceipts: readonly V4HopeReceipt[] = [
      ...(hopePayload.receipts ?? []),
      ...(hopePayload.tsApi?.receipts ?? []),
    ];
    let approved = 0;
    let rejected = 0;
    let regressions = 0;
    for (const r of allReceipts) {
      for (const dec of r.candidateDecisions) {
        if (dec.status === 'approved') {
          approved++;
          regressions += dec.gateAudit.canaryReplay.canaryRegressions;
        } else {
          rejected++;
        }
      }
    }
    const primaryReceipt =
      hopePayload.tsApi?.receipt ??
      hopePayload.receipts?.[0] ??
      allReceipts[0] ??
      null;
    const abacLock = hopePayload.cartridges.policyAbac.vaultAudits.cidAuto;
    const tsApiLock = hopePayload.cartridges.tsApiSecurity.vaultAudits.cidAuto;
    return {
      source: hopePayload.source ?? 'live-artifacts',
      approved,
      rejected,
      regressions,
      initialSha: primaryReceipt?.initialSnapshotSha256 ?? '',
      finalSha: primaryReceipt?.finalSnapshotSha256 ?? '',
      abacRetentionPct: abacLock.rate * 100,
      tsApiRetentionPct: tsApiLock.rate * 100,
    };
  }, [hopePayload]);

  const isUnfiltered = cartridgeFilter === 'all' && selectedNode === null;
  const telemetryCounters = useMemo<FlowTraceStats>(() => {
    if (isUnfiltered && liveData?.traceStats) {
      return liveData.traceStats;
    }
    return computeFlowTraceStats(
      visibleEvents,
      isUnfiltered ? liveData?.totals : undefined
    );
  }, [visibleEvents, isUnfiltered, liveData]);

  const scrubberPercent = useMemo(() => {
    if (visibleEvents.length <= 1) return visibleEvents.length === 1 ? 50 : 0;
    return ((clampedIndex + 0.5) / visibleEvents.length) * 100;
  }, [clampedIndex, visibleEvents.length]);

  const verdictOutcomeCounts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let quarantined = 0;
    for (const ev of visibleEvents) {
      if (ev.outcome === 'PASS') passed++;
      else if (ev.outcome === 'FAIL') failed++;
      else quarantined++;
    }
    return {
      all: visibleEvents.length,
      passed,
      failed,
      quarantined,
    };
  }, [visibleEvents]);

  const verdictFilteredEntries = useMemo(() => {
    const q = verdictSearch.trim().toLowerCase();
    const out: Array<{ readonly event: FlowTraceEvent; readonly streamIndex: number }> = [];
    for (let idx = visibleEvents.length - 1; idx >= 0; idx--) {
      const ev = visibleEvents[idx];
      if (verdictOutcomeFilter !== 'ALL' && ev.outcome !== verdictOutcomeFilter) {
        continue;
      }
      if (q.length > 0) {
        const matchesTask = ev.taskId.toLowerCase().includes(q);
        const matchesModel =
          ev.shortName.toLowerCase().includes(q) ||
          ev.modelId.toLowerCase().includes(q);
        const matchesDomain = ev.cartridgeLabel.toLowerCase().includes(q);
        const matchesRules = ev.retrievedRuleIds.some((r) =>
          r.toLowerCase().includes(q)
        );
        const matchesRoute =
          ev.redTeam?.route.toLowerCase().includes(q) ||
          ev.redTeam?.method.toLowerCase().includes(q) ||
          ev.redTeam?.triggerFlag.toLowerCase().includes(q);
        const matchesIndex = `#${idx + 1}`.includes(q) || String(idx + 1) === q;
        if (
          !matchesTask &&
          !matchesModel &&
          !matchesDomain &&
          !matchesRules &&
          !matchesRoute &&
          !matchesIndex
        ) {
          continue;
        }
      }
      out.push({ event: ev, streamIndex: idx });
    }
    return out;
  }, [visibleEvents, verdictOutcomeFilter, verdictSearch]);

  const totalVerdictPages = Math.max(
    1,
    Math.ceil(verdictFilteredEntries.length / VERDICT_PAGE_SIZE)
  );
  const safeVerdictPage = Math.min(verdictPage, totalVerdictPages - 1);

  const pagedVerdictEntries = useMemo(() => {
    const start = safeVerdictPage * VERDICT_PAGE_SIZE;
    return verdictFilteredEntries.slice(start, start + VERDICT_PAGE_SIZE);
  }, [verdictFilteredEntries, safeVerdictPage]);

  const activePosInFiltered = useMemo(
    () => verdictFilteredEntries.findIndex((entry) => entry.streamIndex === clampedIndex),
    [verdictFilteredEntries, clampedIndex]
  );

  const isActiveVisibleOnCurrentPage =
    activePosInFiltered >= 0 &&
    Math.floor(activePosInFiltered / VERDICT_PAGE_SIZE) === safeVerdictPage;

  const handleScrollToVerdictLog = useCallback(() => {
    verdictLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleVerdictRowClick = useCallback(
    (streamIndex: number) => {
      unlockToIndex(streamIndex);
      mainStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [unlockToIndex]
  );

  const handleJumpToActive = useCallback(() => {
    if (visibleEvents.length === 0) return;
    if (activePosInFiltered >= 0) {
      setVerdictPage(Math.floor(activePosInFiltered / VERDICT_PAGE_SIZE));
    } else {
      setVerdictOutcomeFilter('ALL');
      setVerdictSearch('');
      const newestFirstPos = Math.max(0, visibleEvents.length - 1 - clampedIndex);
      setVerdictPage(Math.floor(newestFirstPos / VERDICT_PAGE_SIZE));
    }
    setScrollActiveNonce((n) => n + 1);
  }, [activePosInFiltered, clampedIndex, visibleEvents.length]);

  const pageRangeStart =
    verdictFilteredEntries.length === 0
      ? 0
      : safeVerdictPage * VERDICT_PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(
    verdictFilteredEntries.length,
    (safeVerdictPage + 1) * VERDICT_PAGE_SIZE
  );

  return (
    <div
      aria-label="HOPE v4 Live Execution Flow Trace"
      className="w-full bg-[#090b0f] text-zinc-100 font-mono tabular-nums flex flex-col divide-y divide-zinc-800/80"
    >
      {/* ABOVE-THE-FOLD MAIN STAGE + REPLAY SCRUBBER */}
      <div
        ref={mainStageRef}
        className="flex flex-col divide-y divide-zinc-800/80 scroll-mt-2"
      >
        {/* Merged Single-Row Vault Baseline, Snapshot SHA, Domain Stream Filter & Verdict Anchor */}
        <div className="flex-shrink-0 bg-[#0d1016] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
              <ShieldCheck className="h-3 w-3 text-[#10b981]" aria-hidden="true" />
              <span>EXECUTION DAG</span>
              <span className="hidden xl:inline">TRACE</span>
            </span>

            {vaultSummary ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-400">
                  <Lock className="h-2.5 w-2.5 text-[#10b981]" aria-hidden="true" />
                  <span>
                    <span className="hidden xl:inline">VAULT: </span>
                    <span className="text-zinc-200">
                      {vaultSummary.source === 'live-artifacts'
                        ? 'LIVE ARTIFACTS'
                        : 'STATIC SNAPSHOT'}
                    </span>
                  </span>
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-400"
                  title={`${vaultSummary.initialSha} -> ${vaultSummary.finalSha}`}
                >
                  <GitCommitHorizontal className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                  <span className="hidden sm:inline">SHA</span>
                  <span className="text-zinc-200">
                    {shortSha(vaultSummary.initialSha, 6, 4)}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-[#10b981]">
                    {shortSha(vaultSummary.finalSha, 6, 4)}
                  </span>
                </span>
                <span className="hidden 2xl:inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-400">
                  <span>
                    BASE LOCK ABAC {vaultSummary.abacRetentionPct.toFixed(0)}% · API{' '}
                    {vaultSummary.tsApiRetentionPct.toFixed(0)}%
                  </span>
                  <span className="text-zinc-700">|</span>
                  <span className="text-[#10b981]">{vaultSummary.approved} PROMOTED</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-[#f59e0b]">{vaultSummary.rejected} BLOCKED</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-300">
                    {vaultSummary.regressions} REGRESSIONS
                  </span>
                </span>
              </>
            ) : (
              <span className="rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-500">
                {hopeError ? 'VAULT BASELINE UNAVAILABLE' : 'LOADING VAULT...'}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <div
              role="group"
              aria-label="Filter trace stream by domain"
              className="inline-flex flex-wrap items-center gap-1"
            >
              <span className="hidden xl:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 mr-0.5">
                <Filter className="h-3 w-3" aria-hidden="true" />
                STREAM
              </span>
              {FILTER_OPTIONS.map((opt) => {
                const isActive = cartridgeFilter === opt.value;
                const count = filterCounts[opt.value];
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setReplayIndex(0);
                      setVerdictPage(0);
                      setCartridgeFilter(opt.value);
                    }}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                      isActive
                        ? 'border-zinc-600 bg-zinc-900 text-zinc-50'
                        : 'border-zinc-800/80 bg-[#090b0f] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span
                      className={`text-[9.5px] ${
                        isActive ? 'text-[#10b981]' : 'text-zinc-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedNode && (
              <button
                type="button"
                onClick={() => handleSelectNode(null)}
                className="inline-flex items-center gap-1 rounded-[2px] border border-[#f59e0b]/50 bg-[#f59e0b]/10 px-2 py-0.5 text-[#f59e0b] hover:bg-[#f59e0b]/20 transition-colors cursor-pointer"
              >
                <span>NODE: {selectedNode}</span>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}

            <span className="text-zinc-500 whitespace-nowrap">
              {visibleEvents.length}/{allEvents.length}
              <span className="hidden xl:inline"> EVENTS</span>
            </span>

            <button
              type="button"
              onClick={handleScrollToVerdictLog}
              className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-700/80 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-200 hover:border-[#10b981]/60 hover:text-[#10b981] transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Verdict Log ({visibleEvents.length})</span>
              <ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />
            </button>

            {liveError && (
              <span className="rounded-[2px] border border-[#ef4444]/40 bg-[#ef4444]/10 px-1.5 py-0.5 text-[#ef4444]">
                {liveError}
              </span>
            )}

            {!isControlledData && liveData?.polledAt && (
              <span className="hidden xl:inline text-zinc-500 whitespace-nowrap">
                POLLED {formatEventTime(liveData.polledAt)}
              </span>
            )}

            {!isControlledData && (
              <button
                type="button"
                onClick={handleManualRefresh}
                className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800 bg-[#090b0f] px-2 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`h-2.5 w-2.5 ${isFetching ? 'animate-spin text-zinc-200' : ''}`}
                />
                <span>SYNC</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Live Test Stage: Left Inspector | Main Focus Center-Right Filament Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:h-[calc(100vh-215px)] lg:min-h-[380px] lg:max-h-[620px] divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80 bg-[#090b0f]">
          {/* LEFT PANEL: Live Payload / Rule Inspector */}
          <aside
            aria-label="Live Payload and Rule Inspector"
            className="min-h-0 lg:h-full max-h-[360px] lg:max-h-none flex flex-col overflow-hidden bg-[#090b0f] divide-y divide-zinc-800/80"
          >
          <div className="flex-shrink-0 bg-[#0d1016] px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Terminal className="h-3 w-3 text-zinc-400" aria-hidden="true" />
              PAYLOAD / RULE INSPECTOR
            </span>
            {activeEvent && (
              <span className="text-[10px] text-zinc-500">
                #{clampedIndex + 1}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-zinc-800/80 text-[11px]">
            {!activeEvent ? (
              <div className="h-full min-h-[160px] p-5 flex flex-col items-center justify-center text-center gap-2 text-xs text-zinc-500">
                <Activity className="h-4 w-4 text-zinc-600" aria-hidden="true" />
                <span>
                  {liveData === null
                    ? 'Loading live trace telemetry...'
                    : 'No trace events match the active filter.'}
                </span>
                {selectedNode && (
                  <button
                    type="button"
                    onClick={() => handleSelectNode(null)}
                    className="mt-1 rounded-[2px] border border-zinc-700 bg-[#0d1016] px-2.5 py-1 text-[10px] text-zinc-300 hover:border-zinc-500 cursor-pointer"
                  >
                    Clear node filter ({selectedNode})
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Header Badge & Event Metadata */}
              <div className="p-3.5 space-y-2 bg-[#0d1016]/50">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
                        activeEvent.kind === 'redteam_probe'
                          ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      {activeEvent.kind === 'redteam_probe'
                        ? 'REDTEAM PROBE'
                        : 'TRIAL'}
                    </span>
                    <span
                      className={`rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${outcomeBadgeClasses(
                        activeEvent.outcome
                      )}`}
                    >
                      {activeEvent.outcome}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {activeEvent.latencyMs !== undefined
                      ? `${activeEvent.latencyMs}ms`
                      : '—'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-50 tracking-tight">
                    {activeEvent.taskId}
                  </span>
                  <span className="text-[10.5px] text-zinc-300 truncate">
                    {activeEvent.shortName}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-zinc-500">
                  <span className="truncate">{activeEvent.cartridgeLabel}</span>
                  <span>{formatEventTime(activeEvent.timestamp)}</span>
                </div>
              </div>

              {/* Prompt Token Delta Block */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                  <span>PROMPT TOKEN DELTA</span>
                  <span className="text-[#10b981] font-semibold">
                    -{activeEvent.promptDelta.reductionPct.toFixed(1)}%
                  </span>
                </div>

                <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-zinc-400">
                      {activeEvent.promptDelta.beforeTokens.toLocaleString()} →{' '}
                      <span className="text-zinc-100 font-semibold">
                        {activeEvent.promptDelta.afterTokens.toLocaleString()}
                      </span>{' '}
                      tok
                    </span>
                    <span className="text-[#10b981]">
                      -{activeEvent.promptDelta.savedTokens.toLocaleString()} saved
                    </span>
                  </div>

                  {activeEvent.promptDelta.beforeTokens > 0 && (
                    <div className="h-1.5 w-full bg-zinc-900 border border-zinc-800/80 rounded-[1px] overflow-hidden">
                      <div
                        className="h-full bg-[#10b981] transition-all duration-200"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              4,
                              Math.round(
                                (activeEvent.promptDelta.afterTokens /
                                  activeEvent.promptDelta.beforeTokens) *
                                  100
                              )
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>
                      LEXICAL LOCK:{' '}
                      <span className="text-[#10b981]">
                        {activeEvent.promptDelta.lexicalLockPct.toFixed(1)}%
                      </span>
                    </span>
                    {activeEvent.promptDelta.promptChars !== undefined && (
                      <span>
                        PROMPT:{' '}
                        <span className="text-zinc-200">
                          {activeEvent.promptDelta.promptChars.toLocaleString()} ch
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Retrieved Top-K=4 Rule IDs */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                  <span>RETRIEVED TOP-K=4 RULES</span>
                  <span className="text-zinc-500">
                    {activeEvent.retrievedRuleIds.length}
                  </span>
                </div>
                {activeEvent.retrievedRuleIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeEvent.retrievedRuleIds.map((ruleId) => (
                      <span
                        key={ruleId}
                        className="rounded-[2px] border border-zinc-800 bg-[#0d1016] px-2 py-0.5 text-[10px] text-zinc-200"
                      >
                        {ruleId}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] px-2.5 py-1.5 text-[10px] text-zinc-500">
                    No Top-K rule bundle (direct loopback probe)
                  </div>
                )}
              </div>

              {/* Bound-Fact Checklist OR Red-Team Probe Route Details */}
              {activeEvent.kind === 'redteam_probe' && activeEvent.redTeam ? (
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                    <span className="inline-flex items-center gap-1 text-[#f59e0b]">
                      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                      RED-TEAM PROBE ROUTE
                    </span>
                    {activeEvent.redTeam.severity && (
                      <span
                        className={`rounded-[2px] border px-1.5 py-0.5 text-[9.5px] uppercase ${
                          activeEvent.redTeam.severity.toLowerCase() === 'high'
                            ? 'border-[#ef4444]/50 bg-[#ef4444]/10 text-[#ef4444]'
                            : activeEvent.redTeam.severity.toLowerCase() === 'medium'
                              ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {activeEvent.redTeam.severity}
                      </span>
                    )}
                  </div>

                  <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] p-2.5 space-y-1.5">
                    <div className="flex items-start gap-1.5 text-[10.5px] break-all">
                      <span className="rounded-[2px] border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-200 flex-shrink-0">
                        {activeEvent.redTeam.method}
                      </span>
                      <span className="text-zinc-100">{activeEvent.redTeam.route}</span>
                    </div>
                    {activeEvent.redTeam.title && (
                      <div className="font-sans text-[11px] text-zinc-300 leading-snug">
                        {activeEvent.redTeam.title}
                      </div>
                    )}
                    <div className="text-[10px] text-[#f59e0b]">
                      TRIGGER: {activeEvent.redTeam.triggerFlag}
                    </div>
                  </div>

                  {activeEvent.redTeam.expectedDefense && (
                    <div className="space-y-1">
                      <div className="text-[9.5px] uppercase tracking-wider text-zinc-500">
                        EXPECTED DEFENSE
                      </div>
                      <p className="font-sans text-[11px] text-zinc-300 leading-snug">
                        {activeEvent.redTeam.expectedDefense}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[9.5px] uppercase tracking-wider text-zinc-500">
                      STAGED CANDIDATE RULE
                    </div>
                    <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] p-2 font-sans text-[11px] text-zinc-200 leading-snug">
                      {activeEvent.redTeam.proposedRuleText}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>EVIDENCE HASH</span>
                    <span
                      className="text-zinc-300"
                      title={activeEvent.redTeam.evidenceHash}
                    >
                      {shortSha(activeEvent.redTeam.evidenceHash, 10, 6)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                    <span>BOUND-FACT CHECKLIST</span>
                    <span
                      className={
                        activeEvent.failedFacts.length === 0
                          ? 'text-[#10b981]'
                          : 'text-[#ef4444]'
                      }
                    >
                      {activeEvent.passedFactsCount}/{activeEvent.boundFactsCount} (
                      {Math.round(activeEvent.factPassRate * 100)}%)
                    </span>
                  </div>

                  {activeEvent.passedFacts.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[9.5px] uppercase text-zinc-500">
                        PASSED ({activeEvent.passedFacts.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activeEvent.passedFacts.map((fact) => (
                          <span
                            key={fact}
                            className="inline-flex items-center gap-1 rounded-[2px] border border-[#10b981]/40 bg-[#10b981]/10 px-1.5 py-0.5 text-[10px] text-[#10b981]"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeEvent.failedFacts.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[9.5px] uppercase text-[#ef4444]">
                        FAILED ({activeEvent.failedFacts.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activeEvent.failedFacts.map((fact) => (
                          <span
                            key={fact}
                            className="inline-flex items-center gap-1 rounded-[2px] border border-[#ef4444]/40 bg-[#ef4444]/10 px-1.5 py-0.5 text-[10px] text-[#ef4444]"
                          >
                            <XCircle className="h-2.5 w-2.5" aria-hidden="true" />
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeEvent.activeForensicFlags.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[9.5px] uppercase text-[#f59e0b]">
                        FORENSIC FLAGS
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activeEvent.activeForensicFlags.map((flag) => (
                          <span
                            key={flag}
                            className="inline-flex items-center gap-1 rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-1.5 py-0.5 text-[10px] text-[#f59e0b]"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeEvent.stderrSummary && (
                    <div className="space-y-1">
                      <div className="text-[9.5px] uppercase text-zinc-500">
                        VERIFIER STDERR
                      </div>
                      <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-[2px] border border-zinc-800/80 bg-[#0d1016] p-2 text-[10px] leading-relaxed text-zinc-300">
                        {activeEvent.stderrSummary}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Slow Clock Gate Audit Readout */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                  <span className="text-zinc-400">SLOW CLOCK GATE AUDIT</span>
                  <span
                    className={`rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
                      activeEvent.slowClockGate.status === 'approved'
                        ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                        : activeEvent.slowClockGate.status === 'rejected'
                          ? 'border-[#ef4444]/50 bg-[#ef4444]/10 text-[#ef4444]'
                          : activeEvent.slowClockGate.status === 'staged'
                            ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                            : 'border-zinc-800 bg-[#0d1016] text-zinc-500'
                    }`}
                  >
                    {activeEvent.slowClockGate.status === 'none'
                      ? 'BYPASSED'
                      : activeEvent.slowClockGate.status}
                  </span>
                </div>

                {activeEvent.slowClockGate.status === 'none' ? (
                  <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] px-2.5 py-2 text-[10px] text-zinc-500">
                    All bound facts passed Oracle verification — no quarantine candidate
                    triggered.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(activeEvent.slowClockGate.candidateId ||
                      activeEvent.slowClockGate.factId) && (
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-zinc-400">
                        <span>
                          CANDIDATE:{' '}
                          <span className="text-zinc-200">
                            {activeEvent.slowClockGate.candidateId ?? '—'}
                          </span>
                        </span>
                        <span>
                          FACT:{' '}
                          <span className="text-zinc-200">
                            {activeEvent.slowClockGate.factId ?? '—'}
                          </span>
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-1">
                      <GateCheckPill
                        label="G1 Lexical Lock"
                        passed={activeEvent.slowClockGate.g1LexicalPassed}
                      />
                      <GateCheckPill
                        label="G2 Conflicts"
                        passed={activeEvent.slowClockGate.g2ConflictPassed}
                      />
                      <GateCheckPill
                        label="G3 Canary"
                        passed={activeEvent.slowClockGate.g3CanaryPassed}
                      />
                    </div>

                    {(activeEvent.slowClockGate.canaryRegressions !== undefined ||
                      activeEvent.slowClockGate.targetDeltaPp !== undefined) && (
                      <div className="flex items-center justify-between text-[10px] rounded-[2px] border border-zinc-800/80 bg-[#0d1016] px-2 py-1.5">
                        <span className="text-zinc-400">
                          REGRESSIONS:{' '}
                          <span
                            className={
                              (activeEvent.slowClockGate.canaryRegressions ?? 0) === 0
                                ? 'text-[#10b981]'
                                : 'text-[#ef4444]'
                            }
                          >
                            {activeEvent.slowClockGate.canaryRegressions ?? 0}
                          </span>
                        </span>
                        {activeEvent.slowClockGate.targetDeltaPp !== undefined && (
                          <span className="text-zinc-400">
                            TARGET Δ:{' '}
                            <span
                              className={
                                activeEvent.slowClockGate.targetDeltaPp >= 0
                                  ? 'text-[#10b981]'
                                  : 'text-[#ef4444]'
                              }
                            >
                              {activeEvent.slowClockGate.targetDeltaPp >= 0 ? '+' : ''}
                              {activeEvent.slowClockGate.targetDeltaPp.toFixed(1)} pp
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {activeEvent.slowClockGate.reason && (
                      <div className="rounded-[2px] border border-zinc-800/80 bg-[#0d1016] p-2 font-sans text-[11px] leading-snug text-zinc-300">
                        {activeEvent.slowClockGate.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
              </>
            )}
          </div>
        </aside>

          {/* CENTER-RIGHT MAIN FOCUS PANEL: Live Counters + Path + Animated Bezier Filament Flow */}
          <div className="min-h-0 lg:h-full flex flex-col overflow-hidden bg-[#090b0f] min-w-0">
            {/* Compact Inline Live Counters + Active Path Breadcrumb Strip */}
            <div className="flex-shrink-0 border-b border-zinc-800/80 bg-[#0d1016] divide-y divide-zinc-800/70">
              <div className="px-3 py-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px]">
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      Passed
                    </span>
                    <span className="font-semibold text-[#10b981]">
                      {telemetryCounters.passed}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      Failed
                    </span>
                    <span className="font-semibold text-[#ef4444]">
                      {telemetryCounters.failed}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      Quarantined
                    </span>
                    <span className="font-semibold text-[#f59e0b]">
                      {telemetryCounters.quarantined}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      Token Δ
                    </span>
                    <span className="font-semibold text-[#10b981]">
                      {telemetryCounters.savedTokens > 0
                        ? `-${telemetryCounters.savedTokens.toLocaleString()} (-${telemetryCounters.weightedReductionPct.toFixed(1)}%)`
                        : '0 (0.0%)'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      Lock %
                    </span>
                    <span className="font-semibold text-zinc-100">
                      {telemetryCounters.lexicalRetentionPct.toFixed(1)}%
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                  {activeEvent && (
                    <span className="hidden sm:inline text-zinc-400">
                      #{clampedIndex + 1} · {activeEvent.shortName}
                    </span>
                  )}
                  <span className="text-zinc-500">
                    {visibleEvents.length} SHOWN
                  </span>
                </div>
              </div>

              {/* Slim PATH: Breadcrumb & Node Filter Clear Pill */}
              <div className="bg-[#0b0e14] px-3 py-1 flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
                <div className="flex flex-wrap items-center gap-1 text-[10px] min-w-0">
                  <span className="text-zinc-500 uppercase tracking-wider mr-1">
                    PATH:
                  </span>
                  {activeEvent ? (
                    activeEvent.pathNodes.map((nodeId, idx) => {
                      const isTerminal = nodeId === activeEvent.terminalNode;
                      const isNodeSelected = selectedNode === nodeId;
                      return (
                        <React.Fragment key={`${nodeId}-${idx}`}>
                          {idx > 0 && <span className="text-zinc-600">→</span>}
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectNode(selectedNode === nodeId ? null : nodeId)
                            }
                            className={`rounded-[2px] border px-1.5 py-0.5 text-[9.5px] transition-colors cursor-pointer ${
                              isNodeSelected
                                ? 'border-[#f59e0b]/60 bg-[#f59e0b]/15 text-[#f59e0b]'
                                : isTerminal
                                  ? outcomeBadgeClasses(activeEvent.outcome)
                                  : 'border-zinc-800 bg-[#090b0f] text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {NODE_SHORT_LABELS[nodeId]}
                          </button>
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <span className="text-zinc-600">Awaiting trace path...</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                  {selectedNode && (
                    <button
                      type="button"
                      onClick={() => handleSelectNode(null)}
                      className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-700 bg-[#090b0f] px-2 py-0.5 text-zinc-200 hover:border-zinc-500 transition-colors cursor-pointer"
                    >
                      <span>Clear node: {NODE_SHORT_LABELS[selectedNode]}</span>
                      <X className="h-3 w-3 text-zinc-400" aria-hidden="true" />
                    </button>
                  )}
                  {activeEvent && (
                    <span
                      className={`font-semibold ${outcomeColorText(activeEvent.outcome)}`}
                    >
                      {activeEvent.taskId}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Full-Width & Full-Height Filament Canvas Stage */}
            <div className="relative flex-1 min-h-[360px] lg:min-h-0 h-full w-full overflow-hidden bg-[#090b0f]">
              <HopeFilamentCanvas
                events={visibleEvents}
                activeIndex={clampedIndex}
                selectedNode={selectedNode}
                onSelectEventIndex={handleSelectEvent}
                onSelectNode={handleSelectNode}
                isPlaying={isPlaying}
              />
            </div>
          </div>
        </div>

        {/* PINNED SCRUBBER DOCK directly below the 2-Column Stage */}
        <div className="flex-shrink-0 bg-[#0d1016] px-3.5 py-1.5 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleToggleLiveLock}
              aria-pressed={liveLock}
              className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[10.5px] font-semibold transition-colors cursor-pointer ${
                liveLock
                  ? 'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20'
                  : 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b] hover:bg-[#f59e0b]/20'
              }`}
            >
              {liveLock ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                  <span>LIVE</span>
                  <span className="text-[9.5px] font-normal text-zinc-300 border-l border-[#10b981]/30 pl-1.5">
                    3s
                  </span>
                </>
              ) : (
                <>
                  <Radio className="h-3 w-3" aria-hidden="true" />
                  <span>REPLAY</span>
                  <span className="text-[9.5px] font-normal text-zinc-400 border-l border-[#f59e0b]/30 pl-1.5">
                    LOCK LIVE
                  </span>
                </>
              )}
            </button>

            {/* Playback Controls */}
            <div className="inline-flex items-center rounded-[2px] border border-zinc-800 bg-[#090b0f] divide-x divide-zinc-800">
              <button
                type="button"
                onClick={handleStepBack}
                disabled={visibleEvents.length === 0 || clampedIndex <= 0}
                aria-label="Step back one event"
                title="Step Back"
                className="p-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={visibleEvents.length <= 1}
                aria-label={isPlaying ? 'Pause trace replay' : 'Play trace replay'}
                title={isPlaying ? 'Pause' : 'Play Replay'}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-zinc-200 hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3 w-3 text-[#f59e0b]" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 text-[#10b981]" />
                    <span>PLAY</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStepForward}
                disabled={
                  visibleEvents.length === 0 || clampedIndex >= visibleEvents.length - 1
                }
                aria-label="Step forward one event"
                title="Step Forward"
                className="p-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Visual Event Tick Strip + Range Scrubber */}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="relative flex-1 h-7 rounded-[2px] border border-zinc-800/80 bg-[#090b0f] px-1 flex items-center overflow-hidden">
              {visibleEvents.length === 0 ? (
                <div className="w-full text-center text-[10px] text-zinc-600">
                  NO EVENTS IN STREAM
                </div>
              ) : (
                <>
                  <svg
                    viewBox="0 0 1000 20"
                    preserveAspectRatio="none"
                    className="w-full h-4 block"
                    aria-hidden="true"
                  >
                    {visibleEvents.map((ev, idx) => {
                      const count = visibleEvents.length;
                      const slot = 1000 / count;
                      const gap = count > 200 ? 0.45 : count > 40 ? 1.2 : 3;
                      const width = Math.max(0.9, slot - gap);
                      const x = idx * slot + gap * 0.5;
                      const isCursor = idx === clampedIndex;
                      const h = isCursor ? 18 : 11;
                      const y = isCursor ? 1 : 4.5;
                      return (
                        <rect
                          key={ev.id}
                          x={x}
                          y={y}
                          width={width}
                          height={h}
                          rx={0.5}
                          fill={outcomeTickColor(ev.outcome)}
                          opacity={isCursor ? 1 : idx <= clampedIndex ? 0.78 : 0.28}
                        />
                      );
                    })}
                  </svg>

                  {/* Crisp Playhead Marker */}
                  <div
                    aria-hidden="true"
                    style={{ left: `${scrubberPercent}%` }}
                    className="pointer-events-none absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-zinc-100"
                  />

                  {/* Accessible Scrubbing Range Input */}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, visibleEvents.length - 1)}
                    step={1}
                    value={clampedIndex}
                    disabled={visibleEvents.length <= 1}
                    aria-label="Replay timeline scrubber"
                    aria-valuetext={
                      activeEvent
                        ? `Event ${clampedIndex + 1} of ${visibleEvents.length}: ${activeEvent.taskId} ${activeEvent.outcome}`
                        : 'Empty trace stream'
                    }
                    onChange={(e) => unlockToIndex(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                  />
                </>
              )}
            </div>

            <div className="flex-shrink-0 text-right text-[11px] text-zinc-300 min-w-[74px]">
              {visibleEvents.length > 0 ? clampedIndex + 1 : 0} / {visibleEvents.length}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Bounded & Paginated Verdict Log */}
      <section
        id="hope-verdict-log"
        ref={verdictLogRef}
        aria-label="Verdict Log"
        className="w-full bg-[#090b0f] flex flex-col scroll-mt-2"
      >
        {/* Verdict Log Controls: Summary Counters + Outcome Filter + Search + Pagination */}
        <div className="bg-[#0d1016] border-b border-zinc-800/80 px-3.5 py-2 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-200">
              VERDICT LOG
            </span>
            <span className="text-[10px] text-zinc-500 hidden sm:inline">
              Click a row to replay in stage ↑
            </span>

            {/* Summary Counter Pills + Outcome Filter */}
            <div
              role="group"
              aria-label="Filter verdict log by outcome"
              className="inline-flex flex-wrap items-center gap-1"
            >
              {(
                [
                  {
                    value: 'ALL',
                    label: 'All',
                    count: verdictOutcomeCounts.all,
                    activeClass: 'border-zinc-500 bg-zinc-900 text-zinc-50',
                    countClass: 'text-zinc-300',
                  },
                  {
                    value: 'PASS',
                    label: 'Passed',
                    count: verdictOutcomeCounts.passed,
                    activeClass:
                      'border-[#10b981]/60 bg-[#10b981]/15 text-[#10b981]',
                    countClass: 'text-[#10b981]',
                  },
                  {
                    value: 'FAIL',
                    label: 'Failed',
                    count: verdictOutcomeCounts.failed,
                    activeClass:
                      'border-[#ef4444]/60 bg-[#ef4444]/15 text-[#ef4444]',
                    countClass: 'text-[#ef4444]',
                  },
                  {
                    value: 'QUARANTINE',
                    label: 'Quarantined',
                    count: verdictOutcomeCounts.quarantined,
                    activeClass:
                      'border-[#f59e0b]/60 bg-[#f59e0b]/15 text-[#f59e0b]',
                    countClass: 'text-[#f59e0b]',
                  },
                ] as const
              ).map((pill) => {
                const isActive = verdictOutcomeFilter === pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setVerdictOutcomeFilter(pill.value);
                      setVerdictPage(0);
                    }}
                    className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                      isActive
                        ? pill.activeClass
                        : 'border-zinc-800/80 bg-[#090b0f] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span className={isActive ? '' : pill.countClass}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Task / Model / Rule Search Input */}
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2 h-3 w-3 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                value={verdictSearch}
                onChange={(e) => {
                  setVerdictSearch(e.target.value);
                  setVerdictPage(0);
                }}
                placeholder="Filter task, model, rule..."
                aria-label="Filter verdict log by task, model, or rule"
                className="h-6 w-44 sm:w-52 rounded-[2px] border border-zinc-800/80 bg-[#090b0f] pl-6 pr-6 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
              {verdictSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setVerdictSearch('');
                    setVerdictPage(0);
                  }}
                  aria-label="Clear verdict search filter"
                  className="absolute right-1.5 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleJumpToActive}
              disabled={visibleEvents.length === 0}
              className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isActiveVisibleOnCurrentPage
                  ? 'border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]'
                  : 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b] hover:bg-[#f59e0b]/20'
              }`}
            >
              <span>
                Jump to Active{visibleEvents.length > 0 ? ` (#${clampedIndex + 1})` : ''}
              </span>
            </button>

            <span className="text-[10px] text-zinc-500 whitespace-nowrap">
              {pageRangeStart}–{pageRangeEnd} of {verdictFilteredEntries.length}
            </span>

            {/* Pagination Controls */}
            <div className="inline-flex items-center rounded-[2px] border border-zinc-800/80 bg-[#090b0f] divide-x divide-zinc-800/80 text-[10px]">
              <button
                type="button"
                onClick={() => setVerdictPage(Math.max(0, safeVerdictPage - 1))}
                disabled={safeVerdictPage <= 0}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                <span>Prev</span>
              </button>
              <span className="px-2 py-0.5 text-zinc-400 whitespace-nowrap">
                Page {safeVerdictPage + 1} of {totalVerdictPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setVerdictPage(Math.min(totalVerdictPages - 1, safeVerdictPage + 1))
                }
                disabled={safeVerdictPage >= totalVerdictPages - 1}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Bounded Structured Table (max-h-[380px] overflow-y-auto, 20 rows/page) */}
        <div
          ref={verdictTableScrollRef}
          className="max-h-[380px] overflow-y-auto overflow-x-auto scrollbar-thin bg-[#090b0f]"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-[10.5px] font-mono tabular-nums">
            <thead className="sticky top-0 z-10 bg-[#0d1016] text-[9.5px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium whitespace-nowrap">
                  #
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Verdict
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Task / Probe
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Domain
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Model
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Rules
                </th>
                <th scope="col" className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  Checks / Route
                </th>
                <th
                  scope="col"
                  className="px-2.5 py-1.5 font-medium text-right whitespace-nowrap"
                >
                  Latency
                </th>
                <th
                  scope="col"
                  className="px-3 py-1.5 font-medium text-right whitespace-nowrap"
                >
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-zinc-800/60">
              {pagedVerdictEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <span>No verdict entries match this filter.</span>
                      {(verdictOutcomeFilter !== 'ALL' || verdictSearch !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setVerdictOutcomeFilter('ALL');
                            setVerdictSearch('');
                            setVerdictPage(0);
                          }}
                          className="rounded-[2px] border border-zinc-700 bg-[#0d1016] px-2.5 py-1 text-[10px] text-zinc-300 hover:border-zinc-500 cursor-pointer"
                        >
                          Clear verdict filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedVerdictEntries.map(({ event: ev, streamIndex }) => {
                  const isActive = streamIndex === clampedIndex;
                  const shortOutcome =
                    ev.outcome === 'QUARANTINE' ? 'QUAR' : ev.outcome;
                  const rulesText =
                    ev.retrievedRuleIds.length > 0
                      ? ev.retrievedRuleIds.join(', ')
                      : ev.kind === 'redteam_probe'
                        ? 'Direct Probe'
                        : '—';
                  const checksOrRoute =
                    ev.kind === 'redteam_probe' && ev.redTeam
                      ? `${ev.redTeam.method} ${ev.redTeam.route}`
                      : `${ev.passedFactsCount}/${ev.boundFactsCount} facts`;

                  return (
                    <tr
                      key={ev.id}
                      ref={isActive ? activeVerdictRowRef : undefined}
                      tabIndex={0}
                      onClick={() => handleVerdictRowClick(streamIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleVerdictRowClick(streamIndex);
                        }
                      }}
                      className={`cursor-pointer transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 ${
                        isActive
                          ? 'bg-[#121722] text-zinc-50'
                          : 'bg-[#090b0f] hover:bg-[#0d1016] text-zinc-300'
                      }`}
                    >
                      <td
                        className={`px-3 py-1.5 whitespace-nowrap ${
                          isActive
                            ? 'border-l-2 border-l-[#10b981] text-[#10b981] font-semibold'
                            : 'text-zinc-500'
                        }`}
                      >
                        #{streamIndex + 1}
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${outcomeBadgeClasses(
                            ev.outcome
                          )}`}
                        >
                          {shortOutcome}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap font-semibold text-zinc-100">
                        <span>{ev.taskId}</span>
                        {ev.kind === 'redteam_probe' && (
                          <span className="ml-1.5 rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-1 py-0.2 text-[8.5px] font-medium text-[#f59e0b]">
                            PROBE
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-zinc-400">
                        {ev.cartridgeLabel}
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-zinc-300">
                        {ev.shortName}
                      </td>
                      <td
                        className="px-2.5 py-1.5 max-w-[180px] truncate text-zinc-400"
                        title={rulesText}
                      >
                        {rulesText}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 max-w-[220px] truncate ${
                          ev.kind === 'redteam_probe'
                            ? 'text-[#f59e0b]'
                            : ev.fullTaskPass
                              ? 'text-[#10b981]'
                              : 'text-[#ef4444]'
                        }`}
                        title={checksOrRoute}
                      >
                        {checksOrRoute}
                      </td>
                      <td className="px-2.5 py-1.5 text-right whitespace-nowrap text-zinc-400">
                        {ev.latencyMs !== undefined ? `${ev.latencyMs}ms` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap text-zinc-500">
                        {formatEventTime(ev.timestamp)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default HopeExecutionFlowView;
