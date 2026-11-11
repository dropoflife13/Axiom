'use client';

import { memo, useMemo, useState } from 'react';
import type { CheckpointTrial } from '@/lib/desk';
import { getDisplayName, inferRunOption, type RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';
import {
  CONDITION_ORDER,
  buildHypothesisSummary,
  formatPValue,
  normalizeAnalysisRun,
} from '@/lib/analysis';

export interface DataIntelSidebarProps {
  activeRunId: string;
  displayRunId: string;
  pendingRunId?: string | null;
  runOptions: readonly RunOption[];
  fleet?: RunStatus[];
  checkpoint: CheckpointTrial[];
  results: unknown;
  totalTrials: number;
  open: boolean;
  onToggle: () => void;
  onSelectRun: (runId: string) => void;
}

export const DataIntelSidebar = memo(function DataIntelSidebar({
  activeRunId,
  displayRunId,
  pendingRunId,
  runOptions,
  fleet,
  checkpoint,
  results,
  totalTrials,
  open,
  onToggle,
  onSelectRun,
}: DataIntelSidebarProps) {
  const [failScope, setFailScope] = useState<'ALL' | 'C' | 'C0'>('ALL');
  const [expandedFact, setExpandedFact] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState('');

  const rawObj = (results && typeof results === 'object' ? results : {}) as Record<string, unknown>;
  const factStatements = (rawObj.factStatements ?? undefined) as Record<string, string> | undefined;

  const analysis = useMemo(() => {
    const opt = inferRunOption(displayRunId);
    const mergedRaw: Record<string, unknown> = {
      ...rawObj,
      trials: checkpoint,
      totalTrials,
    };
    return normalizeAnalysisRun(mergedRaw, {
      id: displayRunId,
      displayName: getDisplayName(displayRunId),
      accent: opt.accent,
      model: opt.model,
      totalTrialsHint: totalTrials,
    });
  }, [rawObj, checkpoint, displayRunId, totalTrials]);

  const hypothesis = useMemo(
    () => buildHypothesisSummary(analysis, factStatements),
    [analysis, factStatements],
  );

  // Top 3 failed facts for the active model (scoped ALL | C | C0)
  const topFailures = useMemo(() => {
    const counts = new Map<string, number>();
    if (failScope === 'ALL') {
      for (const t of checkpoint) {
        for (const f of t.failedFacts ?? []) {
          counts.set(f, (counts.get(f) ?? 0) + 1);
        }
      }
      if (counts.size === 0 && analysis.failuresByFact) {
        for (const fMap of Object.values(analysis.failuresByFact)) {
          for (const [f, n] of Object.entries(fMap)) {
            counts.set(f, (counts.get(f) ?? 0) + n);
          }
        }
      }
    } else {
      const fMap = analysis.failuresByFact[failScope] ?? {};
      for (const [f, n] of Object.entries(fMap)) {
        if (n > 0) counts.set(f, n);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3);
  }, [checkpoint, analysis.failuresByFact, failScope]);

  const maxFailCount = topFailures[0]?.[1] ?? 1;
  const c0Comp = analysis.pairedComparisons.C_vs_C0;

  return (
    <>
      {/* Reopen handle when sidebar is collapsed */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls="axiom-data-intel-sidebar"
          title="Show Data Intel sidebar"
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-[#070913] border border-r-0 border-zinc-800 hover:border-cyan-400 text-cyan-400 px-1.5 py-3 font-mono text-[10px] tracking-[0.2em] uppercase cursor-pointer transition-colors shadow-2xl"
          style={{ writingMode: 'vertical-rl' }}
        >
          ‹ DATA INTEL
        </button>
      )}

      <aside
        id="axiom-data-intel-sidebar"
        aria-label="Data Intel Sidebar"
        aria-hidden={!open}
        className={`fixed top-12 right-0 bottom-0 z-40 w-[360px] max-w-[90vw] bg-black/70 backdrop-blur-2xl text-zinc-200 border-l border-white/10 shadow-[-16px_0_40px_rgba(0,0,0,0.95),0_0_24px_rgba(34,211,238,0.12)] transition-transform duration-300 ease-in-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="w-full h-full overflow-y-auto flex flex-col divide-y divide-white/10 scrollbar-thin">
          {/* Sidebar Header */}
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-white/5 backdrop-blur-md sticky top-0 z-10 border-b border-white/10">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[0.2em] text-cyan-400 uppercase font-semibold flex items-center gap-2">
                <span>AXIOM DATA INTEL</span>
                {pendingRunId && (
                  <span className="text-[9px] text-cyan-300 animate-pulse">SYNC…</span>
                )}
              </div>
              <div className="font-mono text-[11px] text-white font-bold truncate">
                {analysis.displayName} · {analysis.completedTrials}/{analysis.totalTrials}
              </div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls="axiom-data-intel-sidebar"
              title="Collapse Data Intel sidebar"
              className="shrink-0 border border-white/10 hover:border-cyan-400 bg-white/5 hover:bg-cyan-500/10 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-zinc-300 hover:text-cyan-300 uppercase cursor-pointer transition-colors rounded shadow-sm"
            >
              HIDE ›
            </button>
          </div>

          {/* SECTION 1: ACTIVE RUN & MODELS */}
          <section className="px-3.5 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[9.5px] tracking-[0.18em] text-zinc-400 uppercase">
              <span>01 // ACTIVE MODEL / RUN</span>
              <span>{runOptions.length} MODELS</span>
            </div>

            {/* Quick search input */}
            <div className="relative flex items-center">
              <input
                type="text"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Filter models..."
                className="w-full bg-white/5 text-zinc-100 placeholder-zinc-500 text-[10px] font-mono px-2.5 py-1 rounded border border-white/10 focus:outline-none focus:border-cyan-500/60 shadow-inner"
              />
              {modelQuery && (
                <button
                  type="button"
                  onClick={() => setModelQuery('')}
                  className="absolute right-2 text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-col border border-white/10 divide-y divide-white/5 bg-white/[0.02] rounded-lg max-h-[200px] overflow-y-auto scrollbar-thin shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              {runOptions
                .filter((opt) =>
                  !modelQuery.trim()
                    ? true
                    : opt.label.toLowerCase().includes(modelQuery.toLowerCase()) ||
                      opt.id.toLowerCase().includes(modelQuery.toLowerCase()),
                )
                .map((opt) => {
                  const st = fleet?.find((f) => f.run.id === opt.id);
                  const isSelected = activeRunId === opt.id;
                  const isLoadingTarget = pendingRunId === opt.id;
                  const rTotal =
                    isSelected && displayRunId === opt.id
                      ? totalTrials
                      : st?.total ?? (opt.id.toLowerCase().includes('mini') ? 48 : 720);
                  const rDone =
                    isSelected && displayRunId === opt.id ? checkpoint.length : st?.done ?? 0;
                  const isLive = st?.state === 'live';

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectRun(opt.id)}
                      aria-pressed={isSelected}
                      className={`w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left font-mono text-[10.5px] cursor-pointer transition-all border-l-2 ${
                        isSelected
                          ? 'bg-cyan-500/15 text-white border-l-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                          : 'bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border-l-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            isLive ? 'animate-pulse' : ''
                          }`}
                          style={{
                            backgroundColor: opt.accent,
                            boxShadow: isSelected ? `0 0 8px ${opt.accent}` : undefined,
                          }}
                        />
                        <span className="truncate font-medium tracking-wide">{opt.label}</span>
                      </span>
                      <span
                        className={`shrink-0 text-[9.5px] tabular-nums ${
                          isLoadingTarget
                            ? 'text-cyan-400 animate-pulse'
                            : isSelected
                            ? 'text-cyan-300 font-bold'
                            : rDone > 0 && rDone < rTotal
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {isLoadingTarget ? 'LOADING' : `${rDone}/${rTotal}`}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>

          {/* SECTION 2: HYPOTHESIS CONTEXT */}
          <section className="px-3.5 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] tracking-[0.18em] text-zinc-400 uppercase">
              <span>02 // HYPOTHESIS CONTEXT</span>
              <span
                className={`px-1.5 py-0.5 border text-[8.5px] tracking-[0.14em] rounded ${
                  hypothesis.tone === 'cyan'
                    ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                    : hypothesis.tone === 'orange'
                    ? 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300'
                    : hypothesis.tone === 'amber'
                    ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                }`}
              >
                {hypothesis.badge}
              </span>
            </div>

            <div
              className={`border border-white/10 border-l-2 bg-white/5 backdrop-blur-md rounded-lg p-3 flex flex-col gap-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ${
                hypothesis.tone === 'cyan'
                  ? 'border-l-cyan-400'
                  : hypothesis.tone === 'orange'
                  ? 'border-l-fuchsia-400'
                  : hypothesis.tone === 'amber'
                  ? 'border-l-amber-400'
                  : 'border-l-zinc-500'
              }`}
            >
              <p className="m-0 text-[12px] font-semibold text-white leading-snug font-sans">
                {hypothesis.headline}
              </p>
              <p className="m-0 text-[11px] text-zinc-300 leading-relaxed font-sans">
                {hypothesis.context}
              </p>
              <div className="pt-2 mt-0.5 border-t border-white/10 flex items-center justify-between font-mono text-[9.5px] text-zinc-400 tabular-nums">
                <span>
                  p={formatPValue(c0Comp.holmPrimaryPValue ?? c0Comp.signFlipPValue)}
                </span>
                <span className="truncate max-w-[175px] text-zinc-400" title={analysis.model}>
                  {analysis.model}
                </span>
              </div>
            </div>
          </section>

          {/* SECTION 3: CONDITION STATS */}
          <section className="px-3.5 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[9.5px] tracking-[0.18em] text-zinc-400 uppercase">
              <span>03 // CONDITION STATS</span>
              <span className="text-[9px]">
                <b className="text-cyan-400 font-normal">C0</b> ·{' '}
                <b className="text-fuchsia-400 font-normal">C</b>
              </span>
            </div>
            <div className="border border-white/10 divide-y divide-white/5 bg-white/5 backdrop-blur-md rounded-lg font-mono overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              {CONDITION_ORDER.map((cond) => {
                const st = analysis.conditions[cond];
                const pctVal = st.n > 0 ? st.meanBoundFactFraction * 100 : 0;
                const isC0 = cond === 'C0';
                const isC = cond === 'C';

                const rowAccentClass = isC0
                  ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400'
                  : isC
                  ? 'bg-fuchsia-500/10 border-l-2 border-l-fuchsia-400'
                  : 'border-l-2 border-l-transparent';

                const labelColor = isC0
                  ? 'text-cyan-300 font-bold'
                  : isC
                  ? 'text-fuchsia-300 font-bold'
                  : 'text-zinc-300 font-semibold';

                const barColor = isC0
                  ? '#22d3ee'
                  : isC
                  ? '#e879f9'
                  : cond === 'B' || cond === 'E_B'
                  ? '#34d399'
                  : '#52525b';

                return (
                  <div
                    key={cond}
                    className={`px-2.5 py-1.5 flex flex-col gap-1 ${rowAccentClass}`}
                  >
                    <div className="flex items-center justify-between text-[10.5px] tabular-nums">
                      <span className="flex items-center gap-2">
                        <span className={`w-6 ${labelColor}`}>{cond}</span>
                        <span className="text-[9.5px] text-zinc-500">
                          {isC0 ? 'VERBATIM' : isC ? 'DISTILLED' : `n=${st.n}`}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5">
                        <span className="text-[9.5px] text-zinc-500">
                          {st.n > 0 ? `${st.strictPassCount}/${st.n}` : '—'}
                        </span>
                        <span
                          className={`w-12 text-right font-semibold ${
                            isC0 ? 'text-cyan-300' : isC ? 'text-fuchsia-300' : 'text-zinc-100'
                          }`}
                        >
                          {st.n > 0 ? `${pctVal.toFixed(1)}%` : '—'}
                        </span>
                      </span>
                    </div>
                    <div className="h-[3px] w-full bg-zinc-900 overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, pctVal)}%`,
                          backgroundColor: barColor,
                          boxShadow:
                            isC0 || isC ? `0 0 6px ${barColor}` : undefined,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 4: TOP FAILURES (Top 3) */}
          <section className="px-3.5 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] tracking-[0.18em] text-zinc-500 uppercase">
              <span>04 // TOP FAILURES</span>
              <div className="inline-flex border border-zinc-800 bg-[#080808]">
                {(['ALL', 'C', 'C0'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setFailScope(sc)}
                    aria-pressed={failScope === sc}
                    className={`px-1.5 py-0.5 text-[8.5px] tracking-[0.1em] cursor-pointer ${
                      failScope === sc
                        ? 'bg-fuchsia-500/20 text-fuchsia-300 font-semibold'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            </div>

            {topFailures.length === 0 ? (
              <p className="m-0 font-mono text-[10.5px] text-zinc-500 py-2">
                No failures recorded in {failScope}.
              </p>
            ) : (
              <ol className="m-0 p-0 list-none flex flex-col gap-1.5 font-mono">
                {topFailures.map(([factId, count], idx) => {
                  const stmt = factStatements?.[factId];
                  const isOpen = expandedFact === factId;
                  return (
                    <li
                      key={factId}
                      className="border border-zinc-800 bg-[#080808] transition-colors hover:border-zinc-700"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFact(isOpen ? null : factId)}
                        title={stmt ?? factId}
                        aria-expanded={isOpen}
                        className="w-full px-2.5 py-2 flex flex-col gap-1.5 text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-[10.5px] tabular-nums">
                          <span className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-600">#{idx + 1}</span>
                            <span className="font-bold text-fuchsia-300">{factId}</span>
                          </span>
                          <span className="text-zinc-200 font-semibold">
                            {count} {count === 1 ? 'failure' : 'failures'}
                          </span>
                        </div>
                        <div className="h-[3px] w-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full bg-fuchsia-400"
                            style={{
                              width: `${Math.max(4, (count / maxFailCount) * 100)}%`,
                              boxShadow: '0 0 6px rgba(232,121,249,0.5)',
                            }}
                          />
                        </div>
                        {stmt && (
                          <p
                            className={`m-0 font-sans text-[10.5px] text-zinc-400 leading-snug ${
                              isOpen ? '' : 'line-clamp-1'
                            }`}
                          >
                            {stmt}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </>
  );
});
