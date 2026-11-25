'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  GitCommitHorizontal,
  ShieldAlert,
  ShieldCheck,
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
import {
  fetchV4HopePayload,
  formatPct1,
  formatSignedPp,
  shortSha,
  type V4CandidateDecision,
  type V4HopeDashboardPayload,
  type V4HopeReceipt,
  type V4ModelSummaryEntry,
  type V4PilotArm,
} from '@/lib/v4-hope';
import { ThreeClockCore3D } from './ThreeClockCore3D';
import { HopeLiveCompactRunMonitor } from './HopeLiveCompactRunMonitor';

type HopeSubTab = 'overview' | 'live' | 'proof';
type CartridgeKey = 'policyAbac' | 'tsApiSecurity' | 'postgresV3';
type ComparisonMetric = 'fullTask' | 'meanFact';

const ARM_ORDER: readonly V4PilotArm[] = ['A', 'C', 'C_ID_prereq', 'C_ID_auto', 'C_ID_hope'];

const ARM_META: Record<V4PilotArm, { label: string; shortLabel: string; color: string }> = {
  A: { label: 'A (Zero-Shot)', shortLabel: 'A', color: '#52525b' },
  C: { label: 'C (Unconstrained)', shortLabel: 'C', color: '#71717a' },
  C_ID_prereq: { label: 'C_ID_prereq (Static)', shortLabel: 'C_ID_prereq', color: '#b45309' },
  C_ID_auto: { label: 'C_ID_auto (Lexical Lock)', shortLabel: 'C_ID_auto', color: '#0284c7' },
  C_ID_hope: { label: 'C_ID_hope (3-Clock HOPE)', shortLabel: 'C_ID_hope', color: '#059669' },
};

const MODEL_SHORT_NAMES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemma-4-31b-it': 'Gemma 4 31B',
  'qwen/qwen3.8-27b': 'Qwen 3.8 27B',
};

function describeCandidatePatch(dec: V4CandidateDecision): string {
  if (dec.candidateId === 'Q-STATIC-P-01') {
    return 'Naive static prerequisite prior (7 domain rules -> P-01, P-02)';
  }
  if (dec.candidateId === 'Q-STATIC-TS-PREREQ') {
    return 'Naive static prerequisite prior (14 edges across 6 domain rules)';
  }
  const parts: string[] = [];
  if (dec.proposedPrerequisiteEdges.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const e of dec.proposedPrerequisiteEdges) {
      const list = grouped.get(e.from) ?? [];
      list.push(e.to);
      grouped.set(e.from, list);
    }
    const edgeText = Array.from(grouped.entries())
      .map(([from, tos]) => `${from} -> [${tos.join(', ')}]`)
      .join('; ');
    parts.push(`Edges: ${edgeText}`);
  }
  if (dec.proposedRuleTextChanged) {
    parts.push(`${dec.factId} lexical-locked rule refinement`);
  }
  return parts.length > 0 ? parts.join(' · ') : `${dec.factId} (${dec.triggerFlag})`;
}

interface SegmentedTabOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly sublabel?: string;
}

function AccessibleSegmentedTabs<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const prevValueRef = useRef<T>(value);

  useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      buttonRefs.current[idx]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        ...({ container: 'nearest' } as ScrollIntoViewOptions),
      });
    }
  }, [options, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;

    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = options.length - 1;
    else return;

    e.preventDefault();
    onChange(options[nextIdx].value);
    buttonRefs.current[nextIdx]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="inline-flex items-center overflow-x-auto max-w-full rounded-[2px] border border-zinc-800/80 bg-[#08090c] divide-x divide-zinc-800/80"
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className="relative flex-none px-3 py-1.5 text-[11px] font-mono tracking-tight transition-colors whitespace-nowrap cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/70 aria-selected:bg-zinc-900 aria-selected:text-zinc-50 aria-selected:after:content-[''] aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:border-b-2 aria-selected:after:border-emerald-500"
          >
            <span>{opt.label}</span>
            {opt.sublabel && (
              <span className="ml-1.5 font-mono text-[10px] text-zinc-500 tabular-nums">
                {opt.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface PooledModelMetrics {
  readonly count: number;
  readonly fullTask: Record<V4PilotArm, number>;
  readonly meanFact: Record<V4PilotArm, number>;
  readonly contrasts: {
    readonly autoMinusC_task: number;
    readonly hopeMinusC_task: number;
    readonly hopeMinusPrereq_task: number;
    readonly autoMinusC_fact: number;
    readonly hopeMinusC_fact: number;
    readonly hopeMinusPrereq_fact: number;
  };
}

function computePooledFromModels(models: readonly V4ModelSummaryEntry[]): PooledModelMetrics | null {
  if (models.length === 0) return null;
  const avg = (fn: (m: V4ModelSummaryEntry) => number) =>
    models.reduce((acc, m) => acc + fn(m), 0) / models.length;

  const fullTask: Record<V4PilotArm, number> = {
    A: avg((m) => m.summary.arms.A.fullTaskPassRate),
    C: avg((m) => m.summary.arms.C.fullTaskPassRate),
    C_ID_prereq: avg((m) => m.summary.arms.C_ID_prereq.fullTaskPassRate),
    C_ID_auto: avg((m) => m.summary.arms.C_ID_auto.fullTaskPassRate),
    C_ID_hope: avg((m) => m.summary.arms.C_ID_hope.fullTaskPassRate),
  };
  const meanFact: Record<V4PilotArm, number> = {
    A: avg((m) => m.summary.arms.A.meanFactPassRate),
    C: avg((m) => m.summary.arms.C.meanFactPassRate),
    C_ID_prereq: avg((m) => m.summary.arms.C_ID_prereq.meanFactPassRate),
    C_ID_auto: avg((m) => m.summary.arms.C_ID_auto.meanFactPassRate),
    C_ID_hope: avg((m) => m.summary.arms.C_ID_hope.meanFactPassRate),
  };

  return {
    count: models.length,
    fullTask,
    meanFact,
    contrasts: {
      autoMinusC_task: (fullTask.C_ID_auto - fullTask.C) * 100,
      hopeMinusC_task: (fullTask.C_ID_hope - fullTask.C) * 100,
      hopeMinusPrereq_task: (fullTask.C_ID_hope - fullTask.C_ID_prereq) * 100,
      autoMinusC_fact: (meanFact.C_ID_auto - meanFact.C) * 100,
      hopeMinusC_fact: (meanFact.C_ID_hope - meanFact.C) * 100,
      hopeMinusPrereq_fact: (meanFact.C_ID_hope - meanFact.C_ID_prereq) * 100,
    },
  };
}

function summarizeReceiptAudits(receipts: readonly V4HopeReceipt[]) {
  let total = 0;
  let approved = 0;
  let rejected = 0;
  let promotedRegressions = 0;
  for (const r of receipts) {
    for (const dec of r.candidateDecisions) {
      total++;
      if (dec.status === 'approved') {
        approved++;
        promotedRegressions += dec.gateAudit.canaryReplay.canaryRegressions;
      } else {
        rejected++;
      }
    }
  }
  return { total, approved, rejected, promotedRegressions };
}

function GatePill({
  label,
  executed,
  passed,
}: {
  label: string;
  executed: boolean;
  passed: boolean;
}) {
  if (!executed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800/80 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        {label}: SKIP
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] ${
        passed
          ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-400'
          : 'border-rose-700/60 bg-rose-950/30 text-rose-400'
      }`}
    >
      {passed ? (
        <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

function DecisionBadge({ decision }: { decision: V4CandidateDecision }) {
  if (decision.status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald-700/60 bg-emerald-950/30 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        APPROVED
      </span>
    );
  }
  const hasRegressions = decision.gateAudit.canaryReplay.canaryRegressions > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-medium ${
        hasRegressions
          ? 'border-rose-700/60 bg-rose-950/30 text-rose-400'
          : 'border-amber-700/60 bg-amber-950/30 text-amber-400'
      }`}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      REJECTED
    </span>
  );
}

function CopyHashButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy full ${label} SHA-256`}
      aria-label={`Copy full ${label} SHA-256`}
      className="inline-flex items-center gap-1 rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 transition-colors cursor-pointer tabular-nums"
    >
      <span>{value ? shortSha(value, 10, 6) : '—'}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 text-zinc-500" aria-hidden="true" />
      )}
    </button>
  );
}

export interface AxiomHopeV4ViewProps {
  onOpenV3Research?: () => void;
  /** Optional GLB URL forwarded to the center ThreeClockCore3D viewport. */
  glbUrl?: string;
}

export function AxiomHopeV4View({ onOpenV3Research, glbUrl }: AxiomHopeV4ViewProps) {
  const [payload, setPayload] = useState<V4HopeDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HopeSubTab>('overview');
  const [cartridgeKey, setCartridgeKey] = useState<CartridgeKey>('policyAbac');
  const [metric, setMetric] = useState<ComparisonMetric>('fullTask');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.1-flash-lite');

  const [liveClockSignal, setLiveClockSignal] = useState<{
    progress: number | null;
    quarantineActive: boolean;
  }>({
    progress: null,
    quarantineActive: false,
  });

  const comparisonCaptionId = useId();
  const ledgerCaptionId = useId();

  useEffect(() => {
    const controller = new AbortController();
    fetchV4HopePayload(controller.signal)
      .then((data) => {
        setPayload(data);
        if (data.receipts.length > 0) {
          setSelectedModelId((prev) =>
            data.receipts.some((r) => r.model === prev) ? prev : data.receipts[0].model
          );
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/v4-hope/live-compact', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const json = await res.json();
        const t = json?.totals;
        const runs = Array.isArray(json?.runs) ? json.runs : [];
        const hasReplay = runs.some((r: any) => r?.status === 'slow_clock_replay');
        if (t && active) {
          const prog =
            t.totalTargetTasks > 0 ? t.totalCompletedTasks / t.totalTargetTasks : null;
          setLiveClockSignal({
            progress: prog,
            quarantineActive: hasReplay || Number(t.activeRuns ?? 0) > 0,
          });
        }
      } catch {
        // ignore when offline / static snapshot
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const abacPooled = useMemo(
    () => computePooledFromModels(payload?.crossModel.models ?? []),
    [payload]
  );

  const tsApiPooled = useMemo(
    () => computePooledFromModels(payload?.tsApi?.crossModel?.models ?? []),
    [payload]
  );

  const abacAudits = useMemo(
    () => summarizeReceiptAudits(payload?.receipts ?? []),
    [payload]
  );

  const tsApiAudits = useMemo(
    () => summarizeReceiptAudits(payload?.tsApi?.receipts ?? []),
    [payload]
  );

  const activeCrossModel = useMemo(
    () => (cartridgeKey === 'tsApiSecurity' ? payload?.tsApi?.crossModel : payload?.crossModel),
    [cartridgeKey, payload]
  );

  const activePooled = cartridgeKey === 'tsApiSecurity' ? tsApiPooled : abacPooled;

  const chartData = useMemo(() => {
    if (!activeCrossModel || !activePooled) return [];
    const pick = (
      arms: Record<V4PilotArm, { fullTaskPassRate: number; meanFactPassRate: number }>,
      arm: V4PilotArm
    ) =>
      Number(
        (
          (metric === 'fullTask'
            ? arms[arm].fullTaskPassRate
            : arms[arm].meanFactPassRate) * 100
        ).toFixed(1)
      );

    const rows = activeCrossModel.models.map((m) => ({
      name: MODEL_SHORT_NAMES[m.modelId] ?? m.modelId,
      modelId: m.modelId,
      A: pick(m.summary.arms, 'A'),
      C: pick(m.summary.arms, 'C'),
      C_ID_prereq: pick(m.summary.arms, 'C_ID_prereq'),
      C_ID_auto: pick(m.summary.arms, 'C_ID_auto'),
      C_ID_hope: pick(m.summary.arms, 'C_ID_hope'),
    }));

    const pooledSrc = metric === 'fullTask' ? activePooled.fullTask : activePooled.meanFact;
    rows.push({
      name: `Pooled (n=${activePooled.count})`,
      modelId: 'pooled',
      A: Number((pooledSrc.A * 100).toFixed(1)),
      C: Number((pooledSrc.C * 100).toFixed(1)),
      C_ID_prereq: Number((pooledSrc.C_ID_prereq * 100).toFixed(1)),
      C_ID_auto: Number((pooledSrc.C_ID_auto * 100).toFixed(1)),
      C_ID_hope: Number((pooledSrc.C_ID_hope * 100).toFixed(1)),
    });

    return rows;
  }, [activeCrossModel, activePooled, metric]);

  const activeReceiptsList: readonly V4HopeReceipt[] = useMemo(
    () =>
      cartridgeKey === 'tsApiSecurity'
        ? payload?.tsApi?.receipts ?? []
        : payload?.receipts ?? [],
    [cartridgeKey, payload]
  );

  const activeReceipt: V4HopeReceipt | undefined = useMemo(
    () => activeReceiptsList.find((r) => r.model === selectedModelId) ?? activeReceiptsList[0],
    [activeReceiptsList, selectedModelId]
  );

  const receiptModelTabs = useMemo(() => {
    return activeReceiptsList.map((r) => ({
      value: r.model,
      label: MODEL_SHORT_NAMES[r.model] ?? r.model,
    }));
  }, [activeReceiptsList]);

  const renderTooltip = useCallback(({ active, payload: items, label }: any) => {
    if (!active || !items || items.length === 0) return null;
    return (
      <div className="rounded-[2px] border border-zinc-700 bg-[#0b0c10] px-3 py-2 text-xs">
        <p className="mb-1.5 font-mono text-[11px] font-medium text-zinc-100">{label}</p>
        <div className="flex flex-col gap-1">
          {items.map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10.5px]">
                <span
                  className="h-2 w-2 rounded-[1px]"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.dataKey}
              </span>
              <span className="font-mono font-medium text-zinc-100 tabular-nums">
                {Number(entry.value).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }, []);

  if (error) {
    return (
      <div className="w-full min-h-[60vh] bg-[#08090c] text-zinc-100 p-6">
        <div className="w-full rounded-[2px] border border-rose-800/70 bg-[#0f1014] p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-rose-400">
            Axiom-HOPE v4 Artifact Load Error
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload || !abacPooled || !tsApiPooled || !activeCrossModel || !activePooled) {
    return (
      <div className="w-full min-h-[70vh] bg-[#08090c] text-zinc-100 divide-y divide-zinc-800/80">
        <div className="h-12 w-full bg-[#0b0c10] animate-pulse" />
        <div className="h-[60vh] w-full bg-[#08090c] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-zinc-800/80">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[#0b0c10] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const abac = payload.cartridges.policyAbac;
  const tsApiCartridge = payload.cartridges.tsApiSecurity;
  const pg = payload.cartridges.postgresV3;

  const isTsApi = cartridgeKey === 'tsApiSecurity';
  const isPostgres = cartridgeKey === 'postgresV3';
  const pipelineAuditStats = isTsApi ? tsApiAudits : abacAudits;

  const activeVaultLock = isPostgres
    ? {
        retained: pg.lexicalRecallMatched,
        total: pg.lexicalRecallTotal,
        rate: pg.lexicalRecallTotal > 0 ? pg.lexicalRecallMatched / pg.lexicalRecallTotal : 0,
      }
    : isTsApi
      ? tsApiCartridge.vaultAudits.cidAuto
      : abac.vaultAudits.cidAuto;

  const slowClockLocked =
    pipelineAuditStats.promotedRegressions === 0 &&
    activeVaultLock.total > 0 &&
    activeVaultLock.retained === activeVaultLock.total;

  const promotedEdgeSummary = activeReceipt
    ? Object.entries(activeReceipt.promotedPrerequisiteGraph)
        .map(([from, targets]) => `${from} → [${targets.join(', ')}]`)
        .join(' · ') || 'None'
    : '—';

  // Overview 4-Number Readouts
  const overviewFullTask = isPostgres
    ? `${pg.f05V4DisplacedBoundTasks}/${pg.f05BaselineDisplacedBoundTasks} F-05`
    : formatPct1(activePooled.fullTask.C_ID_hope);

  const overviewLift = isPostgres
    ? `+${pg.v3PooledHeadline.cidMinusC_remlPp.toFixed(1)} pp`
    : formatSignedPp(activePooled.contrasts.hopeMinusC_task);

  const overviewLexicalLock =
    activeVaultLock.total > 0
      ? `${formatPct1(activeVaultLock.rate)} · ${activeVaultLock.retained}/${activeVaultLock.total}`
      : '—';

  const overviewRegressions = isPostgres ? '0' : String(pipelineAuditStats.promotedRegressions);

  return (
    <div className="w-full flex-1 bg-[#08090c] text-zinc-100 flex flex-col">
      {/* ================================================================
          SINGLE SLIM TOP BAR: Brand + 3 Sub-Tabs | Cartridge Switcher
         ================================================================ */}
      <header className="w-full border-b border-zinc-800/80 bg-[#0b0c10] px-5 py-2.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-zinc-100 uppercase">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            <span>AXIOM HOPE v4</span>
          </div>

          <AccessibleSegmentedTabs<HopeSubTab>
            ariaLabel="HOPE v4 View Tabs"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'live', label: 'Live Run' },
              { value: 'proof', label: 'Proof & Ledger' },
            ]}
          />
        </div>

        {activeTab !== 'live' && (
          <AccessibleSegmentedTabs<CartridgeKey>
            ariaLabel="Domain Cartridge Selector"
            value={cartridgeKey}
            onChange={setCartridgeKey}
            options={[
              { value: 'policyAbac', label: 'Policy ABAC' },
              { value: 'tsApiSecurity', label: 'TS-API Sec' },
              { value: 'postgresV3', label: 'PG16 DDL' },
            ]}
          />
        )}
      </header>

      {/* ================================================================
          TAB 1 — OVERVIEW (Spacious Unobstructed 3D Stage + 4-Number Strip)
         ================================================================ */}
      {activeTab === 'overview' && (
        <div className="w-full flex-1 flex flex-col">
          {/* Unobstructed 3D Viewport — zero floating text, zero SVG lines, zero badges */}
          <ThreeClockCore3D
            glbUrl={glbUrl}
            fastClockProgress={liveClockSignal.progress}
            quarantineActive={liveClockSignal.quarantineActive}
            slowClockLocked={slowClockLocked}
          />

          {/* Minimal Bottom Metric Strip — 4 Numbers Only */}
          <section
            aria-label="Key governance metrics"
            className="w-full border-t border-b border-zinc-800/80 bg-[#0b0c10] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80 font-mono tabular-nums"
          >
            <div className="px-6 py-5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                {isPostgres ? 'F-05 Displacements' : 'Full-Task Pass'}
              </div>
              <div className="mt-1.5 text-xl font-semibold text-zinc-100">{overviewFullTask}</div>
            </div>

            <div className="px-6 py-5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Lift vs. Unconstrained
              </div>
              <div className="mt-1.5 text-xl font-semibold text-emerald-400">{overviewLift}</div>
            </div>

            <div className="px-6 py-5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Lexical Lock
              </div>
              <div className="mt-1.5 text-xl font-semibold text-zinc-100">
                {overviewLexicalLock}
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Canary Regressions
              </div>
              <div className="mt-1.5 text-xl font-semibold text-emerald-400">
                {overviewRegressions}
              </div>
            </div>
          </section>

          {isPostgres && onOpenV3Research && (
            <div className="w-full px-6 py-4 flex items-center justify-end bg-[#08090c]">
              <button
                type="button"
                onClick={onOpenV3Research}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] px-3 py-1.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <span>Open frozen v3.0-final benchmark</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================
          TAB 2 — LIVE RUN (--compact Benchmark Monitor)
         ================================================================ */}
      {activeTab === 'live' && (
        <div className="w-full flex-1 p-5 sm:p-6">
          <HopeLiveCompactRunMonitor />
        </div>
      )}

      {/* ================================================================
          TAB 3 — PROOF & LEDGER (Single Source of Truth, Zero Duplication)
         ================================================================ */}
      {activeTab === 'proof' && (
        <div className="w-full flex-1 divide-y divide-zinc-800/80">
          {/* 1. Bidirectional Causal Identification (Policy ABAC) */}
          {cartridgeKey === 'policyAbac' && payload.maskedSummary && (
            <section
              aria-labelledby="hope-masked-causal-heading"
              className="w-full bg-[#0b0c10]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
                <h2
                  id="hope-masked-causal-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
                >
                  Bidirectional Causal Identification
                </h2>
                <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">
                  C_ID_masked vs. C_ID_auto vs. C · 54 live trials
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80 border-b border-zinc-800/80 font-mono tabular-nums">
                <div className="px-5 py-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Sufficiency (C_ID_auto − C)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-emerald-400">
                    +
                    {payload.maskedSummary.pooled.contrastsPp.sufficiency_C_ID_auto_minus_C_task.toFixed(
                      1
                    )}{' '}
                    pp
                  </div>
                </div>
                <div className="px-5 py-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Necessity (C_ID_masked − C_ID_auto)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-rose-400">
                    {payload.maskedSummary.pooled.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_task.toFixed(
                      1
                    )}{' '}
                    pp
                  </div>
                </div>
                <div className="px-5 py-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Structure Control (C_ID_masked − C)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-300">
                    {payload.maskedSummary.pooled.contrastsPp.masked_minus_C_task.toFixed(1)} pp
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-xs font-mono tabular-nums">
                  <thead className="bg-[#0d0e13] text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">
                        Model
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        A
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        C
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-rose-400">
                        C_ID_masked
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-sky-400">
                        C_ID_auto
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-emerald-400">
                        Sufficiency
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-rose-400">
                        Necessity
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">
                        Structure
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
                    {payload.maskedSummary.models.map((m) => {
                      const taskMode = metric === 'fullTask';
                      const aVal = taskMode
                        ? m.baselineArms.A.fullTaskPassRate
                        : m.baselineArms.A.meanFactPassRate;
                      const cVal = taskMode
                        ? m.baselineArms.C.fullTaskPassRate
                        : m.baselineArms.C.meanFactPassRate;
                      const maskedVal = taskMode
                        ? m.maskedStats.fullTaskPassRate
                        : m.maskedStats.meanFactPassRate;
                      const autoVal = taskMode
                        ? m.baselineArms.C_ID_auto.fullTaskPassRate
                        : m.baselineArms.C_ID_auto.meanFactPassRate;
                      const suff = taskMode
                        ? m.contrastsPp.sufficiency_C_ID_auto_minus_C_task
                        : m.contrastsPp.sufficiency_C_ID_auto_minus_C_fact;
                      const nec = taskMode
                        ? m.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_task
                        : m.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_fact;
                      const ctrl = taskMode
                        ? m.contrastsPp.masked_minus_C_task
                        : m.contrastsPp.masked_minus_C_fact;

                      return (
                        <tr key={m.modelId} className="hover:bg-zinc-900/50 transition-colors">
                          <th scope="row" className="px-5 py-2.5 font-medium text-zinc-100 whitespace-nowrap">
                            {MODEL_SHORT_NAMES[m.modelId] ?? m.modelId}
                          </th>
                          <td className="px-3 py-2.5 text-right text-zinc-400">{formatPct1(aVal)}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400">{formatPct1(cVal)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-rose-400">
                            {formatPct1(maskedVal)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sky-300">{formatPct1(autoVal)}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400">
                            {formatSignedPp(suff)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-rose-400">{formatSignedPp(nec)}</td>
                          <td className="px-5 py-2.5 text-right text-zinc-300">{formatSignedPp(ctrl)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 2. 3-Model 5-Arm Comparison */}
          <section aria-labelledby="hope-comparison-heading" className="w-full bg-[#0b0c10]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
              <h2
                id="hope-comparison-heading"
                className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
              >
                {isTsApi
                  ? '3-Model 5-Arm Comparison · TS-API Sec'
                  : '3-Model 5-Arm Comparison · Policy ABAC'}
              </h2>
              <AccessibleSegmentedTabs<ComparisonMetric>
                ariaLabel="Comparison Metric Toggle"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'fullTask', label: 'Full Task %' },
                  { value: 'meanFact', label: 'Mean Fact %' },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-zinc-800/80">
              <div className="xl:col-span-5 px-4 py-5 bg-[#08090c]">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
                      barGap={2}
                      barCategoryGap="20%"
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
                        width={42}
                      />
                      <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Legend
                        wrapperStyle={{
                          paddingTop: '8px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                      {ARM_ORDER.map((arm) => (
                        <Bar
                          key={arm}
                          dataKey={arm}
                          name={ARM_META[arm].shortLabel}
                          fill={ARM_META[arm].color}
                          radius={[1, 1, 0, 0]}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div
                tabIndex={0}
                role="region"
                aria-labelledby={comparisonCaptionId}
                className="xl:col-span-7 overflow-x-auto bg-[#0b0c10]"
              >
                <table className="w-full border-separate border-spacing-0 text-left text-xs font-mono tabular-nums">
                  <caption id={comparisonCaptionId} className="sr-only">
                    3-Model 5-Arm performance comparison table
                  </caption>
                  <thead className="sticky top-0 z-10 bg-[#0d0e13] text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                    <tr>
                      <th scope="col" className="sticky left-0 z-20 bg-[#0d0e13] px-5 py-2.5 font-medium">
                        Model
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        A
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        C
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-amber-400">
                        Prereq
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-sky-400">
                        Auto
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-emerald-400">
                        HOPE
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        HOPE−C
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">
                        HOPE−Stat
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
                    {activeCrossModel.models.map((m) => {
                      const val = (arm: V4PilotArm) =>
                        metric === 'fullTask'
                          ? m.summary.arms[arm].fullTaskPassRate
                          : m.summary.arms[arm].meanFactPassRate;
                      const hopeMinusC =
                        metric === 'fullTask'
                          ? m.summary.contrastsPp.C_ID_hope_minus_C_task
                          : m.summary.contrastsPp.C_ID_hope_minus_C_fact;
                      const hopeMinusStatic =
                        metric === 'fullTask'
                          ? m.summary.contrastsPp.C_ID_hope_minus_C_ID_prereq_task
                          : m.summary.contrastsPp.C_ID_hope_minus_C_ID_prereq_fact;

                      return (
                        <tr key={m.modelId} className="hover:bg-zinc-900/50 transition-colors">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-[#0b0c10] px-5 py-2.5 font-medium text-zinc-100 whitespace-nowrap"
                          >
                            {MODEL_SHORT_NAMES[m.modelId] ?? m.modelId}
                          </th>
                          <td className="px-3 py-2.5 text-right text-zinc-400">{formatPct1(val('A'))}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400">{formatPct1(val('C'))}</td>
                          <td className="px-3 py-2.5 text-right text-amber-300/90">
                            {formatPct1(val('C_ID_prereq'))}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sky-300">
                            {formatPct1(val('C_ID_auto'))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">
                            {formatPct1(val('C_ID_hope'))}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-400">
                            {formatSignedPp(hopeMinusC)}
                          </td>
                          <td className="px-5 py-2.5 text-right text-emerald-400">
                            {formatSignedPp(hopeMinusStatic)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#0d0e13] font-semibold">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[#0d0e13] px-5 py-2.5 text-zinc-50 whitespace-nowrap"
                      >
                        Pooled Mean (n={activePooled.count})
                      </th>
                      <td className="px-3 py-2.5 text-right text-zinc-300">
                        {formatPct1(
                          metric === 'fullTask' ? activePooled.fullTask.A : activePooled.meanFact.A
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-300">
                        {formatPct1(
                          metric === 'fullTask' ? activePooled.fullTask.C : activePooled.meanFact.C
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-amber-300">
                        {formatPct1(
                          metric === 'fullTask'
                            ? activePooled.fullTask.C_ID_prereq
                            : activePooled.meanFact.C_ID_prereq
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sky-300">
                        {formatPct1(
                          metric === 'fullTask'
                            ? activePooled.fullTask.C_ID_auto
                            : activePooled.meanFact.C_ID_auto
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-400">
                        {formatPct1(
                          metric === 'fullTask'
                            ? activePooled.fullTask.C_ID_hope
                            : activePooled.meanFact.C_ID_hope
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-400">
                        {formatSignedPp(
                          metric === 'fullTask'
                            ? activePooled.contrasts.hopeMinusC_task
                            : activePooled.contrasts.hopeMinusC_fact
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right text-emerald-400">
                        {formatSignedPp(
                          metric === 'fullTask'
                            ? activePooled.contrasts.hopeMinusPrereq_task
                            : activePooled.contrasts.hopeMinusPrereq_fact
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. Immutable Slow Clock Governance Ledger */}
          <section aria-labelledby="hope-ledger-heading" className="w-full bg-[#0b0c10]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
              <h2
                id="hope-ledger-heading"
                className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
              >
                Immutable Slow Clock Governance Ledger
              </h2>

              <AccessibleSegmentedTabs<string>
                ariaLabel="Slow Clock Receipt Model Selector"
                value={activeReceipt?.model ?? selectedModelId}
                onChange={setSelectedModelId}
                options={receiptModelTabs}
              />
            </div>

            {activeReceipt && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 bg-[#090a0e] px-5 py-2.5 font-mono text-[10.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-500 uppercase">SHA-256</span>
                    <CopyHashButton
                      value={activeReceipt.initialSnapshotSha256}
                      label="beforeSnapshot"
                    />
                    <GitCommitHorizontal className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                    <CopyHashButton
                      value={activeReceipt.finalSnapshotSha256}
                      label="afterSnapshot"
                    />
                  </div>
                  <div className="text-emerald-400 truncate max-w-xl">
                    <span className="text-zinc-500 uppercase mr-2">Promoted Graph</span>
                    {promotedEdgeSummary}
                  </div>
                </div>

                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby={ledgerCaptionId}
                  className="overflow-x-auto"
                >
                  <table className="w-full border-separate border-spacing-0 text-left text-xs">
                    <caption id={ledgerCaptionId} className="sr-only">
                      Slow Clock candidate governance audit ledger
                    </caption>
                    <thead className="sticky top-0 z-10 bg-[#0d0e13] font-mono text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                      <tr>
                        <th scope="col" className="sticky left-0 z-20 bg-[#0d0e13] px-5 py-2.5 font-medium">
                          Candidate
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Proposed Patch
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Gates (G1 · G2 · G3)
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">
                          Target Δ
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Canary Reg
                        </th>
                        <th scope="col" className="px-5 py-2.5 text-right font-medium">
                          Decision
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
                      {activeReceipt.candidateDecisions.map((dec) => {
                        const cr = dec.gateAudit.canaryReplay;
                        const deltaPp = cr.targetCohortDelta * 100;
                        return (
                          <tr key={dec.candidateId} className="hover:bg-zinc-900/50 transition-colors align-top">
                            <th
                              scope="row"
                              className="sticky left-0 z-10 bg-[#0b0c10] px-5 py-2.5 font-mono text-xs font-medium text-zinc-100 whitespace-nowrap"
                            >
                              <div>{dec.candidateId}</div>
                              <div className="mt-0.5 text-[10px] font-normal text-zinc-500">
                                {dec.factId} · {dec.origin}
                              </div>
                            </th>
                            <td className="px-3 py-2.5 text-zinc-300 min-w-[220px]">
                              <p className="text-xs leading-snug">{describeCandidatePatch(dec)}</p>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex flex-wrap items-center gap-1">
                                <GatePill
                                  label="G1"
                                  executed={dec.gateAudit.lexicalLock.executed}
                                  passed={dec.gateAudit.lexicalLock.passed}
                                />
                                <GatePill
                                  label="G2"
                                  executed={dec.gateAudit.contradictionLinter.executed}
                                  passed={dec.gateAudit.contradictionLinter.passed}
                                />
                                <GatePill
                                  label="G3"
                                  executed={cr.executed}
                                  passed={cr.passed}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              <span
                                className={
                                  deltaPp > 0
                                    ? 'text-emerald-400 font-medium'
                                    : deltaPp < 0
                                      ? 'text-rose-400 font-medium'
                                      : 'text-zinc-400'
                                }
                              >
                                {formatSignedPp(deltaPp)}
                              </span>
                              <div className="text-[10px] text-zinc-500">
                                {cr.targetBeforePassCount}→{cr.targetAfterPassCount}/{cr.targetTotal}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
                              {cr.canaryRegressions === 0 ? (
                                <span className="text-emerald-400">0</span>
                              ) : (
                                <div>
                                  <span className="font-medium text-rose-400">
                                    {cr.canaryRegressions}
                                  </span>
                                  <span className="ml-1.5 text-[10px] text-zinc-400">
                                    ({cr.regressedCanaryTaskIds.join(', ')})
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right whitespace-nowrap">
                              <DecisionBadge decision={dec} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
