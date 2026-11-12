'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HealingLoopHero, { STAGES, hex, type LiveRun, type SnapshotMeta } from '@/components/HealingLoopHero';
import { AxiomLogo } from '@/components/AxiomLogo';
import { ResearchCanvas } from '@/components/analysis/ResearchCanvas';
import { AnatomySection } from '@/components/anatomy/AnatomySection';
import { AxiomAutonomousKernel } from '@/components/cortex/AxiomAutonomousKernel';
import { AxiomFAQSection } from '@/components/faq/AxiomFAQSection';
import { AxiomFooter } from '@/components/footer/AxiomFooter';
import { AxiomLoadingScreen } from '@/components/AxiomLoadingScreen';
import { CONDITIONS, deriveDesk, TOTAL_TRIALS, type CheckpointTrial } from '@/lib/desk';
import { DEFAULT_RUN_ID, DEFAULT_RUN_OPTIONS, inferRunOption, modelForRun, getDisplayName, type RunOption } from '@/lib/runs';
import { useFleetStatus } from '@/lib/useFleetStatus';

export type AxiomWindow =
  | 'engine'
  | 'theories'
  | 'telemetry'
  | 'convergence'
  | 'taxonomy'
  | 'facts'
  | 'trace'
  | 'architecture'
  | 'questions';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

interface SettledRunState {
  runId: string;
  checkpoint: CheckpointTrial[];
  results: unknown;
  snapshotMeta: SnapshotMeta;
  awaitingSnapshot: boolean;
}

const stageFor = (t?: CheckpointTrial): number => {
  if (!t) return 1;
  if (t.boundPassed) return 5;
  return (t.failedFacts?.length ?? 0) > 0 ? 2 : 1;
};

function enrichTimestamps(
  rawTrials: CheckpointTrial[],
  data: Record<string, unknown>,
  prev: CheckpointTrial[],
): CheckpointTrial[] {
  const lastMod = typeof data.lastModified === 'string' ? new Date(data.lastModified).getTime() : Date.now();
  const startMod = typeof data.startedAt === 'string' ? new Date(data.startedAt).getTime() : NaN;
  const minRealisticDuration = Math.max(15000, rawTrials.length * 8000);
  const totalDuration =
    !isNaN(startMod) && lastMod > startMod && lastMod - startMod >= minRealisticDuration
      ? lastMod - startMod
      : rawTrials.length * 20000;
  const trialSpanMs = totalDuration / Math.max(1, rawTrials.length);

  const prevMap = new Map<string, string>();
  for (const p of prev) {
    if (p.timestamp) prevMap.set(`${p.condition}/${p.taskId}`, p.timestamp);
  }

  return rawTrials.map((t: CheckpointTrial, idx: number) => {
    if (t.timestamp || t.completedAt) return t;
    const key = `${t.condition}/${t.taskId}`;
    if (prevMap.has(key)) {
      return { ...t, timestamp: prevMap.get(key) };
    }
    const assignedMs =
      !isNaN(startMod) && lastMod - startMod >= minRealisticDuration
        ? startMod + (idx + 1) * trialSpanMs
        : lastMod - (rawTrials.length - 1 - idx) * trialSpanMs;
    return {
      ...t,
      timestamp: new Date(assignedMs).toISOString(),
    };
  });
}

export default function Page() {
  const [discoveredRuns, setDiscoveredRuns] = useState<RunOption[]>(() => [...DEFAULT_RUN_OPTIONS]);

  const [activeRunId, setActiveRunId] = useState<string>(DEFAULT_RUN_ID);

  const [viewMode, setViewMode] = useState<'engine' | 'research'>('engine');
  const [activeResearchSection, setActiveResearchSection] = useState<string>('theories');
  const [intelOpen, setIntelOpen] = useState(true);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const runCacheRef = useRef<Map<string, SettledRunState>>(new Map());

  // Ensure window scroll snaps to top when switching view windows
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [viewMode, activeResearchSection]);

  const [settled, setSettled] = useState<SettledRunState>(() => ({
    runId: DEFAULT_RUN_ID,
    checkpoint: [],
    results: null,
    awaitingSnapshot: false,
    snapshotMeta: {
      runId: DEFAULT_RUN_ID,
      commit: 'live',
      isLive: true,
      model: modelForRun(DEFAULT_RUN_ID),
      awaiting: false,
    },
  }));

  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [stamp, setStamp] = useState('--:--:--');
  const [showLoading, setShowLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [dropdownOpen]);

  const handleSelectRun = useCallback((runId: string, targetViewMode?: 'engine' | 'research') => {
    setActiveRunId(runId);
    if (targetViewMode) {
      setViewMode(targetViewMode);
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('run', runId);
      window.history.replaceState(null, '', url.toString());
    }
    const cached = runCacheRef.current.get(runId);
    if (cached) {
      setSettled(cached);
      setPendingRunId(null);
    } else {
      setPendingRunId(runId);
    }
  }, []);

  const handleSwitchToLive = useCallback(() => {
    setViewMode('engine');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);

  const handleSelectSection = useCallback((sec: string) => {
    if (sec === 'engine') {
      setViewMode('engine');
    } else {
      setActiveResearchSection(sec);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);

  // Sync with URL query parameter on initial client mount without causing SSR hydration mismatch
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('run');
    const w = new URLSearchParams(window.location.search).get('window') || new URLSearchParams(window.location.search).get('tab');
    if (p && p !== DEFAULT_RUN_ID) {
      handleSelectRun(p);
    }
    if (w) {
      if (w === 'engine' || w === 'live') {
        setViewMode('engine');
      } else {
        setViewMode('research');
        if (w !== 'research') {
          setActiveResearchSection(w);
        }
      }
    }
  }, [handleSelectRun]);

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

  // Poll active run checkpoint/results data cleanly with non-overlapping timeouts
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer: number | null = null;

    const pollInterval =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 2000
        : 30000;

    async function load(): Promise<void> {
      const targetRunId = activeRunId;
      const currentStamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setStamp((prev) => (prev !== currentStamp ? currentStamp : prev));

      const isLocal =
        typeof window !== 'undefined'
          ? window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          : process.env.NODE_ENV === 'development';

      try {
        let response: Response;
        if (isLocal) {
          response = await fetch(`/api/ablation-checkpoint?run=${encodeURIComponent(targetRunId)}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
        } else {
          response = await fetch(`/data/run-${encodeURIComponent(targetRunId)}.json`, {
            signal: controller.signal,
            cache: 'no-store',
          });
        }
        if (!active) return;

        let data: Record<string, unknown> | null = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
        if (!active) return;

        let rawTrials: CheckpointTrial[] = data
          ? Array.isArray(data.trials)
            ? (data.trials as CheckpointTrial[])
            : Array.isArray(data)
            ? (data as CheckpointTrial[])
            : []
          : [];

        // If local API returned 0 trials, try static snapshot /data/run-[id].json fallback cleanly
        if (isLocal && rawTrials.length === 0) {
          try {
            const snapRes = await fetch(`/data/run-${encodeURIComponent(targetRunId)}.json`, {
              signal: controller.signal,
              cache: 'no-store',
            });
            if (snapRes.ok && active) {
              const snapJson = (await snapRes.json()) as Record<string, unknown>;
              if (Array.isArray(snapJson.trials) && snapJson.trials.length > 0) {
                data = {
                  ...snapJson,
                  factStatements: data?.factStatements ?? snapJson.factStatements,
                };
                rawTrials = snapJson.trials as CheckpointTrial[];
              }
            }
          } catch {
            // Keep initializing empty state
          }
        }
        if (!active) return;

        const commitEmpty = (): SettledRunState => ({
          runId: targetRunId,
          checkpoint: [],
          results: data,
          awaitingSnapshot: false,
          snapshotMeta: {
            runId: String(data?.id || data?.runId || targetRunId),
            commit: 'live',
            isLive: true,
            model: String(data?.model || modelForRun(targetRunId)),
            awaiting: false,
          },
        });

        if (!data || rawTrials.length === 0) {
          const nextState = commitEmpty();
          runCacheRef.current.set(targetRunId, nextState);
          setSettled(nextState);
          setPendingRunId(null);
          setCheckpointError(null);
          return;
        }

        const mtime = typeof data.lastModified === 'string' ? new Date(data.lastModified).getTime() : 0;
        const isLive = Boolean(mtime && Date.now() - mtime < FIVE_MINUTES_MS);
        const commit = String(
          data.commit || (typeof data.gitCommit === 'string' ? data.gitCommit.slice(0, 7) : 'live'),
        );
        const snapMeta: SnapshotMeta = {
          runId: String(data.id || data.runId || targetRunId),
          commit,
          isLive,
          model: String(data.model || modelForRun(targetRunId)),
          awaiting: false,
        };

        setSettled((prev) => {
          const prevTrials = prev.runId === targetRunId ? prev.checkpoint : [];
          if (prev.runId === targetRunId && prevTrials.length === rawTrials.length && prevTrials.length > 0) {
            const pLast = prevTrials[prevTrials.length - 1];
            const tLast = rawTrials[rawTrials.length - 1];
            if (
              pLast?.taskId === tLast?.taskId &&
              pLast?.condition === tLast?.condition &&
              pLast?.boundPassed === tLast?.boundPassed &&
              prev.snapshotMeta.isLive === isLive
            ) {
              return prev;
            }
          }
          const trials = enrichTimestamps(rawTrials, data!, prevTrials);
          const nextState: SettledRunState = {
            runId: targetRunId,
            checkpoint: trials,
            results: data,
            awaitingSnapshot: false,
            snapshotMeta: snapMeta,
          };
          runCacheRef.current.set(targetRunId, nextState);
          return nextState;
        });
        setPendingRunId(null);
        setCheckpointError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!active) return;
        const fallbackState: SettledRunState = {
          runId: targetRunId,
          checkpoint: [],
          results: null,
          awaitingSnapshot: false,
          snapshotMeta: {
            runId: targetRunId,
            commit: 'live',
            isLive: true,
            model: modelForRun(targetRunId),
            awaiting: false,
          },
        };
        setSettled(fallbackState);
        setPendingRunId(null);
        setCheckpointError(null);
      } finally {
        if (active) setIsDataLoaded(true);
      }
    }

    async function pollLoop() {
      await load();
      if (active) {
        timer = window.setTimeout(() => void pollLoop(), pollInterval);
      }
    }

    void pollLoop();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRunId]);

  const { runId: displayRunId, checkpoint, results, snapshotMeta, awaitingSnapshot } = settled;

  const totalTrials = useMemo(() => {
    const rawData = results as Record<string, unknown> | null;
    const md = rawData?.metadata as Record<string, unknown> | undefined;

    if (Array.isArray(md?.targetTasks) && md.targetTasks.length > 0) {
      return md.targetTasks.length * 6;
    }
    if (Array.isArray(rawData?.targetTasks) && rawData.targetTasks.length > 0) {
      return rawData.targetTasks.length * 6;
    }
    if (typeof rawData?.totalTrials === 'number' && rawData.totalTrials > 0) {
      if (checkpoint.length > (rawData.totalTrials as number)) {
        return Math.max(720, Math.ceil(checkpoint.length / 6) * 6);
      }
      return rawData.totalTrials;
    }
    const isMini = displayRunId.toLowerCase().includes('mini');
    const isExpanded = displayRunId.toLowerCase().includes('expanded');
    if (typeof md?.totalTrials === 'number' && md.totalTrials > 0) {
      if (checkpoint.length > (md.totalTrials as number)) {
        return Math.max(720, Math.ceil(checkpoint.length / 6) * 6);
      }
      return md.totalTrials;
    }
    if (Array.isArray(rawData?.tasks) && rawData.tasks.length > 0) {
      return rawData.tasks.length * 6;
    }
    if (Array.isArray(md?.tasks) && md.tasks.length > 0) {
      return md.tasks.length * 6;
    }
    const taskIds = new Set(checkpoint.map((t) => t.taskId));
    if (isMini) {
      return taskIds.size > 0 ? taskIds.size * 6 : 48;
    }
    if (taskIds.size > 0 && taskIds.size <= 8 && checkpoint.length >= 24 && !isExpanded) {
      return taskIds.size * 6;
    }
    if (checkpoint.length > 240 || isExpanded) {
      return 720;
    }
    return TOTAL_TRIALS;
  }, [results, checkpoint, displayRunId]);

  const lastModified = (results as { lastModified?: string } | null)?.lastModified;
  const startedAt = (results as { startedAt?: string } | null)?.startedAt;
  const desk = useMemo(() => {
    return deriveDesk(checkpoint, 60, totalTrials, lastModified, startedAt);
  }, [checkpoint, totalTrials, lastModified, startedAt]);

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
  const stage = Math.max(0, Math.min(STAGES.length - 1, live.stage));
  const activeOption = discoveredRuns.find((r) => r.id === activeRunId) ?? inferRunOption(activeRunId);

  return (
    <div className="w-full min-h-screen bg-[#050505] relative flex flex-col">
      {showLoading && (
        <AxiomLoadingScreen
          isReady={isDataLoaded}
          runId={activeRunId}
          model={snapshotMeta.model}
          onComplete={() => setShowLoading(false)}
        />
      )}

      {/* Primary Dynamic Canvas Viewport */}
      <div className="w-full flex-1 flex flex-col bg-[#050505] relative">
        {/* Unified Global HUD Header Bar (Reverted to Sci-Fi HUD matching Image 3) */}
        <header className="flex items-center justify-between px-3 sm:px-6 py-2 border-b border-zinc-800/80 bg-[#07080d]/95 backdrop-blur-xl z-30 sticky top-0 min-h-[52px] gap-2 sm:gap-4 select-none">
          {/* Left: Brand Logo & Active Model Selector */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setShowLoading(true)}
              title="Click to replay boot intro sequence"
            >
              <AxiomLogo size={20} variant="duo" title="Axiom" />
              <b className="font-mono text-xs tracking-wider text-white">AXIOM</b>
            </div>

            <span className="text-zinc-700 font-mono text-xs hidden sm:inline">/</span>
            <span className="text-zinc-500 font-mono text-[9.5px] tracking-wider uppercase hidden md:inline">
              ACTIVE MODEL / RUN
            </span>

            {/* Model Selector Dropdown Pill */}
            <div className="relative flex items-center gap-2" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#090b14] border transition-all text-left select-none cursor-pointer ${
                  dropdownOpen
                    ? 'border-cyan-500/70 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-[#0c0e1a]'
                }`}
                style={{
                  borderColor: dropdownOpen ? activeOption.accent : undefined,
                }}
                title="Click to switch active model / run"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${snapshotMeta.isLive ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: activeOption.accent }}
                />
                <span className="text-[11px] font-mono text-zinc-100 font-bold tracking-wider uppercase truncate max-w-[110px] sm:max-w-[160px]">
                  {getDisplayName(displayRunId)}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded font-medium tabular-nums hidden sm:inline">
                  {live.done}/{totalTrials}
                </span>
                <span className={`text-[9px] text-zinc-500 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-cyan-400' : ''}`}>
                  ▼
                </span>
              </button>

              {/* Dropdown Menu Modal */}
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute top-full left-0 mt-2 w-80 max-h-[460px] bg-[#070913] border border-cyan-500/35 rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.95),0_0_20px_rgba(34,211,238,0.15)] backdrop-blur-xl z-50 flex flex-col overflow-hidden"
                  >
                    {/* Header with Search Filter */}
                    <div className="p-2 border-b border-zinc-800/80 bg-zinc-950/60">
                      <div className="flex items-center justify-between mb-1.5 px-1">
                        <span className="text-[9px] font-mono text-zinc-400 tracking-wider font-semibold uppercase">
                          SELECT ACTIVE RUN
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 tabular-nums">
                          {discoveredRuns.length} MODELS
                        </span>
                      </div>
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder="Filter models..."
                        className="w-full bg-[#05060b] border border-zinc-800 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                        autoFocus
                      />
                    </div>

                    {/* Model List */}
                    <div className="overflow-y-auto p-1.5 flex flex-col gap-1 max-h-[360px] scrollbar-thin">
                      {discoveredRuns
                        .filter((r) => {
                          if (!modelSearchQuery.trim()) return true;
                          const q = modelSearchQuery.toLowerCase();
                          return r.id.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
                        })
                        .map((r) => {
                          const isSelected = r.id === activeRunId;
                          const fs = fleet?.find((f) => f.run.id === r.id);
                          const doneCount = fs ? fs.done : r.id === activeRunId ? live.done : 0;
                          const totalCount = fs ? fs.total : r.id.toLowerCase().includes('mini') ? 48 : 720;
                          const isLiveModel = fs?.state === 'live' || (r.id === activeRunId && snapshotMeta.isLive);

                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                handleSelectRun(r.id);
                                setDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between px-2.5 py-2 rounded text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-950/30 border border-cyan-500/40 text-white'
                                  : 'hover:bg-zinc-900/70 border border-transparent text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full flex-shrink-0 ${isLiveModel ? 'animate-pulse' : ''}`}
                                  style={{ backgroundColor: r.accent }}
                                />
                                <span className="font-mono text-[10.5px] font-bold tracking-wider uppercase truncate">
                                  {r.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isLiveModel && (
                                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                    LIVE
                                  </span>
                                )}
                                <span className="font-mono text-[9px] text-zinc-400 tabular-nums">
                                  {doneCount}/{totalCount}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Snapshot Hash Chip */}
            <div className="hidden xl:flex items-center px-2 py-0.5 rounded bg-zinc-900/60 border border-zinc-800 font-mono text-[9px] text-zinc-400">
              <span className="text-zinc-500 mr-1">SNAPSHOT //</span>
              <span className="text-cyan-400 font-bold">{snapshotMeta.commit}</span>
            </div>
          </div>

          {/* Center: Real-Time HUD Status Telemetry (Matching Image 3) */}
          <div className="hidden lg:flex items-center gap-3.5 px-3 py-1 font-mono text-[10px] text-zinc-400 border-x border-zinc-800/60">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 uppercase">ORACLE</span>
              <span className="text-cyan-400 font-bold tracking-wider">LOCKED</span>
            </div>
            <span className="text-zinc-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 uppercase">TEMP</span>
              <span className="text-zinc-200 font-bold">0</span>
            </div>
            <span className="text-zinc-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 uppercase">CONDITIONS</span>
              <span className="text-zinc-200 font-bold">06</span>
            </div>
            <span className="text-zinc-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 uppercase">STAGE</span>
              <span className="text-emerald-400 font-bold tracking-wider">PASS</span>
            </div>
          </div>

            {/* Right: Engine / Research View Switcher Tabs */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="flex items-center gap-1 p-0.5 sm:p-1 rounded-lg bg-zinc-900/90 border border-zinc-800/90 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('engine');
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded text-[10.5px] font-mono tracking-wider transition-all uppercase cursor-pointer ${
                    viewMode === 'engine'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.25)] font-bold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${viewMode === 'engine' ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <span>LIVE ENGINE</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('research');
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded text-[10.5px] font-mono tracking-wider transition-all uppercase cursor-pointer ${
                    viewMode === 'research'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-[0_0_12px_rgba(251,191,36,0.25)] font-bold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${viewMode === 'research' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <span>RESEARCH FINDINGS</span>
                </button>
              </div>
            </div>
          </header>

        {/* Dynamic Center Canvas: Switches between Live Engine (with Anatomy & FAQ) and Dedicated Research Windows */}
        <div className="flex-1 min-w-0 relative w-full flex flex-col transition-all duration-300">
          {/* Live Engine Canvas (Full-Screen Torus + Anatomy + FAQ + Footer) */}
          <div
            className={`w-full transition-opacity duration-200 ease-out ${
              viewMode === 'engine'
                ? 'opacity-100 relative z-10 block'
                : 'opacity-0 pointer-events-none hidden z-0'
            }`}
            aria-hidden={viewMode !== 'engine'}
          >
            <HealingLoopHero
              live={live}
              desk={desk}
              stamp={stamp}
              error={checkpointError}
              snapshot={snapshotMeta}
              activeRunId={activeRunId}
              displayRunId={displayRunId}
              runOptions={discoveredRuns}
              fleet={fleet}
              intelOpen={false}
              onSelectRun={handleSelectRun}
              onCopyLogs={copyLogs}
              onReplayIntro={() => setShowLoading(true)}
            />
            {/* Restored Anatomy Section: Eliminates scrolling into black void */}
            <AnatomySection
              checkpoint={checkpoint}
              desk={desk}
              running={snapshotMeta.isLive}
              snapshot={snapshotMeta}
            />
            {/* Autonomous Kernel & 3-Tier Invariant Vault */}
            <AxiomAutonomousKernel />
            {/* Restored Axiom FAQ Knowledge Base */}
            <AxiomFAQSection />
            {/* System Footer */}
            <AxiomFooter />
          </div>

          {/* Dedicated Research Windows Canvas (Theories, Telemetry, Convergence, Taxonomy, Facts, Trace, Architecture, Questions) */}
          <div
            className={`w-full flex-1 flex flex-col transition-opacity duration-200 ease-out ${
              viewMode !== 'engine'
                ? 'opacity-100 relative z-10 block'
                : 'opacity-0 pointer-events-none hidden z-0'
            }`}
            aria-hidden={viewMode === 'engine'}
          >
            <ResearchCanvas
              runId={displayRunId}
              rawResults={results}
              checkpoint={checkpoint}
              onSwitchToLive={handleSwitchToLive}
              runOptions={discoveredRuns}
              fleet={fleet}
              onSelectRun={handleSelectRun}
              activeRunId={activeRunId}
              totalTrials={totalTrials}
              activeSection={activeResearchSection}
              onSelectSection={handleSelectSection}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
