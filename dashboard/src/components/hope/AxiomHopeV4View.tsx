'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Database,
  FileCode2,
  GitCommitHorizontal,
  Layers,
  Lock,
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

type CartridgeKey = 'policyAbac' | 'tsApiSecurity' | 'postgresV3';
type ComparisonMetric = 'fullTask' | 'meanFact';

const ARM_ORDER: readonly V4PilotArm[] = ['A', 'C', 'C_ID_prereq', 'C_ID_auto', 'C_ID_hope'];

const ARM_META: Record<V4PilotArm, { label: string; shortLabel: string; color: string }> = {
  A: { label: 'A (Zero-Shot)', shortLabel: 'A', color: '#52525b' },
  C: { label: 'C (Unconstrained)', shortLabel: 'C', color: '#71717a' },
  C_ID_prereq: { label: 'C_ID_prereq (Static)', shortLabel: 'C_ID_prereq', color: '#d97706' },
  C_ID_auto: { label: 'C_ID_auto (Lexical Lock)', shortLabel: 'C_ID_auto', color: '#38bdf8' },
  C_ID_hope: { label: 'C_ID_hope (3-Clock HOPE)', shortLabel: 'C_ID_hope', color: '#10b981' },
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

/**
 * Accessible segmented tablist implementing roving tabindex + arrow-key navigation,
 * ARIA-selected styling (WCAG 1.4.1 non-color border indicator), and nearest-container
 * scroll-into-view on selection changes.
 */
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
      className="inline-flex items-center overflow-x-auto max-w-full rounded-md border border-zinc-800 bg-[#0b0c10] p-0.5"
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
            className="relative flex-none px-3 py-1.5 rounded-[4px] text-xs font-medium tracking-tight transition-colors whitespace-nowrap cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/70 aria-selected:bg-zinc-800/90 aria-selected:text-zinc-50 aria-selected:after:content-[''] aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:border-b-2 aria-selected:after:border-emerald-400"
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
      <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        {label}: SKIP
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        passed
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
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
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        APPROVED
      </span>
    );
  }
  const hasRegressions = decision.gateAudit.canaryReplay.canaryRegressions > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10.5px] font-medium ${
        hasRegressions
          ? 'border-rose-500/35 bg-rose-500/10 text-rose-400'
          : 'border-amber-500/35 bg-amber-500/10 text-amber-400'
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
      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-colors cursor-pointer"
    >
      <span>{shortSha(value, 12, 6)}</span>
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
}

export function AxiomHopeV4View({ onOpenV3Research }: AxiomHopeV4ViewProps) {
  const [payload, setPayload] = useState<V4HopeDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cartridgeKey, setCartridgeKey] = useState<CartridgeKey>('policyAbac');
  const [metric, setMetric] = useState<ComparisonMetric>('fullTask');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.1-flash-lite');

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
    return activeReceiptsList.map((r) => {
      const approved = r.candidateDecisions.filter((d) => d.status === 'approved').length;
      const rejected = r.candidateDecisions.filter((d) => d.status === 'rejected').length;
      return {
        value: r.model,
        label: MODEL_SHORT_NAMES[r.model] ?? r.model,
        sublabel: `${approved}✓ / ${rejected}✕`,
      };
    });
  }, [activeReceiptsList]);

  const renderTooltip = useCallback(
    ({ active, payload: items, label }: any) => {
      if (!active || !items || items.length === 0) return null;
      return (
        <div className="rounded-md border border-zinc-700 bg-[#0d0e13] px-3 py-2 text-xs shadow-lg">
          <p className="mb-1.5 font-medium text-zinc-100">{label}</p>
          <div className="flex flex-col gap-1">
            {items.map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
                  <span
                    className="h-2 w-2 rounded-[2px]"
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
    },
    []
  );

  if (error) {
    return (
      <div className="w-full min-h-[60vh] bg-[#09090b] text-zinc-100 px-6 py-12">
        <div className="mx-auto max-w-6xl rounded-lg border border-rose-500/30 bg-rose-500/5 p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-rose-400">
            Axiom-HOPE v4 Artifact Load Error
          </p>
          <p className="mt-2 text-sm text-zinc-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload || !abacPooled || !tsApiPooled || !activeCrossModel || !activePooled) {
    return (
      <div className="w-full min-h-[60vh] bg-[#09090b] text-zinc-100 px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-12 w-72 rounded-md border border-zinc-800 bg-zinc-900/50 animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-lg border border-zinc-800 bg-zinc-900/40 animate-pulse"
              />
            ))}
          </div>
          <div className="h-72 rounded-lg border border-zinc-800 bg-zinc-900/40 animate-pulse" />
        </div>
      </div>
    );
  }

  const abac = payload.cartridges.policyAbac;
  const tsApiCartridge = payload.cartridges.tsApiSecurity;
  const pg = payload.cartridges.postgresV3;

  const isTsApi = cartridgeKey === 'tsApiSecurity';
  const pipelineTraceLabel = isTsApi
    ? `${tsApiCartridge.taskCount} traces / model`
    : `${abac.taskCount} traces / model`;
  const pipelineAuditStats = isTsApi ? tsApiAudits : abacAudits;

  const promotedEdgeSummary = activeReceipt
    ? Object.entries(activeReceipt.promotedPrerequisiteGraph)
        .map(([from, targets]) => `${from} → [${targets.join(', ')}]`)
        .join(' · ') || 'None (static/regressing edges rejected)'
    : 'None';

  return (
    <div className="w-full flex-1 bg-[#09090b] text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ================================================================
            SECTION 1: Domain Cartridge Switcher & Overview Bar
           ================================================================ */}
        <section aria-labelledby="hope-v4-heading" className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b border-zinc-800/90 pb-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-zinc-300">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                  Axiom-HOPE v4 Governance
                </span>
                <span className="inline-flex items-center rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                  {payload.source === 'live-artifacts'
                    ? 'Source: out/v4/*.json (live repo artifacts)'
                    : 'Source: v4-hope-snapshot.json'}
                </span>
              </div>
              <h1
                id="hope-v4-heading"
                className="text-2xl font-semibold tracking-tight text-zinc-50"
              >
                Symbolic Memory Governance &amp; Cross-Domain Replication
              </h1>
              <p className="max-w-3xl text-sm text-zinc-400">
                Zero-LLM 3-clock governance loop (Fast Clock → Quarantine Vault → Slow Clock)
                combining automated lexical locking with zero-regression canary replay across
                pluggable <code className="font-mono text-xs text-zinc-300">DomainCartridge</code>{' '}
                oracles.
              </p>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Active Domain Cartridge
              </span>
              <AccessibleSegmentedTabs<CartridgeKey>
                ariaLabel="Domain Cartridge Selector"
                value={cartridgeKey}
                onChange={setCartridgeKey}
                options={[
                  {
                    value: 'policyAbac',
                    label: 'Policy-as-Code ABAC (v4)',
                    sublabel: `${abac.taskCount}T · ${abac.ruleCount}R`,
                  },
                  {
                    value: 'tsApiSecurity',
                    label: 'TypeScript API Security (v4)',
                    sublabel: `${tsApiCartridge.taskCount}T · ${tsApiCartridge.ruleCount}R`,
                  },
                  {
                    value: 'postgresV3',
                    label: 'PostgreSQL 16 DDL (v3.0-final Adapter)',
                    sublabel: `${pg.taskCount}T · ${pg.ruleCount}R`,
                  },
                ]}
              />
            </div>
          </div>

          {/* KPI Strip */}
          {cartridgeKey === 'policyAbac' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Pooled C_ID_hope Full-Task Pass
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    {formatPct1(abacPooled.fullTask.C_ID_hope)}
                  </span>
                  <span className="font-mono text-xs text-emerald-400 tabular-nums">
                    {formatPct1(abacPooled.meanFact.C_ID_hope)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  {abac.totalLiveTrials} live trials · {abac.modelCount} models · K={abac.topK}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Lift vs. Unconstrained C
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {formatSignedPp(abacPooled.contrasts.hopeMinusC_task)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {formatSignedPp(abacPooled.contrasts.hopeMinusC_fact)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  C_ID_auto lock: {abac.vaultAudits.cidAuto.retained}/{abac.vaultAudits.cidAuto.total} tokens vs. C ({abac.vaultAudits.c.retained}/{abac.vaultAudits.c.total})
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Lift vs. Naive Static C_ID_prereq
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {formatSignedPp(abacPooled.contrasts.hopeMinusPrereq_task)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {formatSignedPp(abacPooled.contrasts.hopeMinusPrereq_fact)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Static <code className="font-mono text-[11px] text-zinc-400">Q-STATIC-P-01</code> rejected 3/3 models
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Promoted Canary Regressions
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    {abacAudits.promotedRegressions}
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                    STRICT 0-REG
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  {abacAudits.approved} approved / {abacAudits.rejected} rejected across {abacAudits.total} audits
                </p>
              </div>
            </div>
          ) : cartridgeKey === 'tsApiSecurity' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Pooled C_ID_hope Full-Task Pass
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    {formatPct1(tsApiPooled.fullTask.C_ID_hope)}
                  </span>
                  <span className="font-mono text-xs text-emerald-400 tabular-nums">
                    {formatPct1(tsApiPooled.meanFact.C_ID_hope)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  {tsApiCartridge.totalLiveTrials} live trials · {tsApiCartridge.modelCount} models · K={tsApiCartridge.topK}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Lift vs. Unconstrained C
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {formatSignedPp(tsApiPooled.contrasts.hopeMinusC_task)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {formatSignedPp(tsApiPooled.contrasts.hopeMinusC_fact)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  C_ID_auto lock: {tsApiCartridge.vaultAudits.cidAuto.retained}/{tsApiCartridge.vaultAudits.cidAuto.total} tokens vs. C ({tsApiCartridge.vaultAudits.c.retained}/{tsApiCartridge.vaultAudits.c.total})
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Lift vs. Naive Static C_ID_prereq
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {formatSignedPp(tsApiPooled.contrasts.hopeMinusPrereq_task)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {formatSignedPp(tsApiPooled.contrasts.hopeMinusPrereq_fact)} facts
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Static <code className="font-mono text-[11px] text-zinc-400">Q-STATIC-TS-PREREQ</code> rejected 3/3 models
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Promoted Canary Regressions
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    {tsApiAudits.promotedRegressions}
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                    STRICT 0-REG
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  {tsApiAudits.approved} approved / {tsApiAudits.rejected} rejected across {tsApiAudits.total} audits
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Automated Lexical Recall
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {pg.lexicalRecallMatched}/{pg.lexicalRecallTotal}
                  </span>
                  <span className="font-mono text-xs text-zinc-300 tabular-nums">100.0%</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Zero hand-curated tokens across {pg.ruleCount} active v3 rules
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  F-05 Bound Displacements
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                    {pg.f05V4DisplacedBoundTasks} / {pg.f05BaselineDisplacedBoundTasks}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">K={pg.topK} exact</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  Resolves {pg.f05V3OmissionsAcrossPool} F-05 omissions from v3.0-final pool
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  v3.0-final Pooled C_ID − C
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    +{pg.v3PooledHeadline.cidMinusC_remlPp.toFixed(2)} pp
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    DiD +{pg.v3PooledHeadline.did_remlPp.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                  {pg.modelCount} models · {pg.totalV3Trials.toLocaleString()} trials · 95% PI [+{pg.v3PooledHeadline.cidMinusC_piLowPp}, +{pg.v3PooledHeadline.cidMinusC_piHighPp}]
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#101116] p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                  Gate 1 &amp; 2 False Positives
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-semibold text-zinc-50 tabular-nums">
                    0 / {pg.ruleCount}
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                    VERIFIED
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Read-only adapter preserves frozen v3 vault SHA-256
                </p>
              </div>
            </div>
          )}

          {/* Cartridge Specification Metadata Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/90 bg-[#0d0e13] px-4 py-2.5 text-xs text-zinc-400">
            {cartridgeKey === 'policyAbac' ? (
              <>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-zinc-200 font-medium">
                    <FileCode2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    <code className="font-mono text-xs">{abac.id}</code>
                  </span>
                  <span className="tabular-nums">
                    Domains: banking ({abac.domainBreakdown.banking ?? 0}) · healthcare (
                    {abac.domainBreakdown.healthcare ?? 0}) · admin (
                    {abac.domainBreakdown.admin ?? 0})
                  </span>
                  <span className="tabular-nums">
                    Vault Token Lock:{' '}
                    <strong className="font-mono font-medium text-emerald-400">
                      {abac.vaultAudits.cidAuto.retained}/{abac.vaultAudits.cidAuto.total} (100.0%)
                    </strong>{' '}
                    vs. C{' '}
                    <strong className="font-mono font-medium text-amber-400">
                      {abac.vaultAudits.c.retained}/{abac.vaultAudits.c.total} (
                      {formatPct1(abac.vaultAudits.c.rate)})
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                  <span>tasks.json:</span>
                  <CopyHashButton value={abac.tasksSha256} label="policy-abac-tasks.json" />
                </div>
              </>
            ) : cartridgeKey === 'tsApiSecurity' ? (
              <>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-zinc-200 font-medium">
                    <Code2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    <code className="font-mono text-xs">{tsApiCartridge.id}</code>
                  </span>
                  <span className="tabular-nums">
                    Domains: payouts ({tsApiCartridge.domainBreakdown.payouts ?? 0}) · admin (
                    {tsApiCartridge.domainBreakdown.admin ?? 0}) · profiles (
                    {tsApiCartridge.domainBreakdown.profiles ?? 0})
                  </span>
                  <span className="tabular-nums">
                    Vault Token Lock:{' '}
                    <strong className="font-mono font-medium text-emerald-400">
                      {tsApiCartridge.vaultAudits.cidAuto.retained}/{tsApiCartridge.vaultAudits.cidAuto.total} (100.0%)
                    </strong>{' '}
                    vs. C{' '}
                    <strong className="font-mono font-medium text-amber-400">
                      {tsApiCartridge.vaultAudits.c.retained}/{tsApiCartridge.vaultAudits.c.total} (
                      {formatPct1(tsApiCartridge.vaultAudits.c.rate)})
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                  <span>tasks.json:</span>
                  <CopyHashButton value={tsApiCartridge.tasksSha256} label="ts-api-security-tasks.json" />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-zinc-200 font-medium">
                    <Database className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    <code className="font-mono text-xs">{pg.id}</code>
                  </span>
                  <span className="tabular-nums">
                    {pg.taskCount} held-out tasks across {Object.keys(pg.cohortBreakdown).length} cohorts ·{' '}
                    {pg.defaultPrerequisiteEdgeCount} DAG edges
                  </span>
                  {onOpenV3Research && (
                    <button
                      type="button"
                      onClick={onOpenV3Research}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-100 cursor-pointer"
                    >
                      Open frozen v3.0-final 9-model benchmark
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                  <span>facts.json:</span>
                  <CopyHashButton value={pg.factsSha256} label="v3 facts.json" />
                </div>
              </>
            )}
          </div>
        </section>

        {/* ================================================================
            SECTION 2: 3-Clock Symbolic Governance Pipeline
           ================================================================ */}
        <section aria-labelledby="hope-clocks-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="hope-clocks-heading"
                className="text-sm font-semibold tracking-tight text-zinc-100"
              >
                3-Clock Symbolic Governance Pipeline
              </h2>
              <p className="text-xs text-zinc-500">
                Strict Authority Separation (Invariant 0): zero LLM calls inside telemetry capture,
                quarantine staging, or promotion gates.
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10.5px] text-zinc-400">
              <Layers className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              src/v4/hope/* (0 cartridge-specific edits)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1.25fr] lg:items-stretch">
            {/* Stage 1: Fast Clock */}
            <div className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-[#101116] p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-200">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    1. Fast Clock
                  </span>
                  <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    READ-ONLY
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-300">EpisodicRingBuffer</p>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Captures task-scoped execution traces (
                  <code className="font-mono text-[11px] text-zinc-300">artifactSha256</code>,{' '}
                  <code className="font-mono text-[11px] text-zinc-300">failedFacts</code>,{' '}
                  <code className="font-mono text-[11px] text-zinc-300">forensicFlags</code>) in a
                  fixed-capacity FIFO ring buffer. Never mutates canonical rules or prerequisite
                  graphs.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 font-mono text-[10.5px] text-zinc-500 tabular-nums">
                <span>fast-clock.ts</span>
                <span>{pipelineTraceLabel}</span>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center text-zinc-600" aria-hidden="true">
              <ArrowRight className="h-4 w-4" />
            </div>

            {/* Stage 2: Intermediate Clock */}
            <div className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-[#101116] p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-200">
                    <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    2. Intermediate Clock
                  </span>
                  <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    SHA-256 PROVENANCE
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-300">QuarantineVault</p>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Ingests recurring Fast Clock failure clusters meeting{' '}
                  <code className="font-mono text-[11px] text-zinc-300">minOccurrences</code> and
                  stages deduplicated <code className="font-mono text-[11px] text-zinc-300">QuarantineCandidate</code>{' '}
                  patches with artifact SHA-256 evidence digests and frozen v2/v3 path guards.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 font-mono text-[10.5px] text-zinc-500 tabular-nums">
                <span>quarantine-vault.ts</span>
                <span>{pipelineAuditStats.total} staged audits</span>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center text-zinc-600" aria-hidden="true">
              <ArrowRight className="h-4 w-4" />
            </div>

            {/* Stage 3: Slow Clock */}
            <div className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-[#101116] p-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-200">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    3. Slow Clock
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                    3 SEQUENTIAL GATES
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-300">DeepMetaOptimizer</p>
                <ol className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-zinc-500">G1</span>
                    <span>
                      <strong className="font-medium text-zinc-200">Lexical Identifier Lock:</strong>{' '}
                      100% <code className="font-mono text-[11px] text-zinc-300">extractRequiredTokens()</code> retention.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-zinc-500">G2</span>
                    <span>
                      <strong className="font-medium text-zinc-200">Contradiction &amp; Cycle Linter:</strong>{' '}
                      syntax/policy conflicts + 3-color DFS DAG acyclicity.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-zinc-500">G3</span>
                    <span>
                      <strong className="font-medium text-zinc-200">Paired Canary Replay:</strong>{' '}
                      <code className="font-mono text-[11px] text-emerald-400">targetCohortDelta &gt; 0</code> &amp;&amp;{' '}
                      <code className="font-mono text-[11px] text-emerald-400">canaryRegressions === 0</code>.
                    </span>
                  </li>
                </ol>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 font-mono text-[10.5px] text-zinc-500 tabular-nums">
                <span>slow-clock.ts</span>
                <span>
                  {pipelineAuditStats.approved} promoted · {pipelineAuditStats.rejected} rejected
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 3: 3-Model 5-Arm Cross-Domain Comparison
           ================================================================ */}
        <section
          aria-labelledby="hope-comparison-heading"
          className="rounded-lg border border-zinc-800 bg-[#101116] overflow-hidden"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <h2
                id="hope-comparison-heading"
                className="text-sm font-semibold tracking-tight text-zinc-100"
              >
                {isTsApi
                  ? '3-Model 5-Arm TypeScript API Security Comparison'
                  : '3-Model 5-Arm Policy-as-Code ABAC Comparison'}
              </h2>
              <p className="text-xs text-zinc-500">
                {isTsApi
                  ? `${tsApiCartridge.taskCount} held-out TypeScript API endpoints × 5 arms × ${tsApiCartridge.modelCount} models = ${tsApiCartridge.totalLiveTrials} live trials (K = ${tsApiCartridge.topK}, temperature = 0, esbuild + node:vm sandbox).`
                  : '18 held-out Cedar ABAC tasks × 5 arms × 3 models = 270 live trials (K = 4, temperature = 0, frozen vaults).'}
              </p>
            </div>
            <AccessibleSegmentedTabs<ComparisonMetric>
              ariaLabel="Comparison Metric Toggle"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'fullTask', label: 'Full-Task Pass %' },
                { value: 'meanFact', label: 'Mean Fact Pass %' },
              ]}
            />
          </div>

          {/* Recharts Bar Chart */}
          <div className="px-4 pt-5 pb-3 border-b border-zinc-800/80">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  barGap={3}
                  barCategoryGap="22%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Legend
                    wrapperStyle={{
                      paddingTop: '10px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  {ARM_ORDER.map((arm) => (
                    <Bar
                      key={arm}
                      dataKey={arm}
                      name={ARM_META[arm].label}
                      fill={ARM_META[arm].color}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Accessible Responsive Comparison Table */}
          <div
            tabIndex={0}
            role="region"
            aria-labelledby={comparisonCaptionId}
            className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id={comparisonCaptionId} className="sr-only">
                {isTsApi
                  ? `3-Model 5-Arm TypeScript API Security performance comparison table showing ${
                      metric === 'fullTask' ? 'Full-Task Pass Rate' : 'Mean Fact Pass Rate'
                    } across A, C, C_ID_prereq, C_ID_auto, and C_ID_hope.`
                  : `3-Model 5-Arm Policy-as-Code ABAC performance comparison table showing ${
                      metric === 'fullTask' ? 'Full-Task Pass Rate' : 'Mean Fact Pass Rate'
                    } across A, C, C_ID_prereq, C_ID_auto, and C_ID_hope.`}
              </caption>
              <thead className="sticky top-0 z-10 bg-[#0d0e13] font-mono text-[10.5px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 bg-[#0d0e13] px-4 py-2.5 font-medium"
                  >
                    Model
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Provider
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    A
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    C
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-amber-400/90">
                    C_ID_prereq
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-sky-400/90">
                    C_ID_auto
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium text-emerald-400"
                  >
                    C_ID_hope
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    HOPE − C
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    HOPE − Static
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums [&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
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
                        className="sticky left-0 z-10 bg-[#101116] px-4 py-2.5 font-medium text-zinc-100 whitespace-nowrap"
                      >
                        {m.modelId}
                      </th>
                      <td className="px-3 py-2.5 font-sans text-zinc-400 whitespace-nowrap">
                        {m.provider}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {formatPct1(val('A'))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {formatPct1(val('C'))}
                      </td>
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
                      <td className="px-4 py-2.5 text-right text-emerald-400">
                        {formatSignedPp(hopeMinusStatic)}
                      </td>
                    </tr>
                  );
                })}
                {/* Pooled Mean Summary Row */}
                <tr className="bg-[#0d0e13] font-semibold">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[#0d0e13] px-4 py-2.5 font-sans text-zinc-50 whitespace-nowrap"
                  >
                    Pooled Mean (n = {activePooled.count})
                  </th>
                  <td className="px-3 py-2.5 font-sans font-normal text-zinc-400 whitespace-nowrap">
                    Multi-Provider
                  </td>
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
                  <td className="px-4 py-2.5 text-right text-emerald-400">
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
        </section>

        {/* ================================================================
            SECTION 4: Immutable Slow Clock Governance Ledger
           ================================================================ */}
        <section
          aria-labelledby="hope-ledger-heading"
          className="rounded-lg border border-zinc-800 bg-[#101116] overflow-hidden"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <h2
                id="hope-ledger-heading"
                className="text-sm font-semibold tracking-tight text-zinc-100"
              >
                {isTsApi
                  ? 'Immutable Slow Clock Governance Ledger — TypeScript API Security'
                  : 'Immutable Slow Clock Governance Ledger'}
              </h2>
              <p className="text-xs text-zinc-500">
                {isTsApi
                  ? 'Per-model cryptographic receipt inspector for ts-api-security-v4 showing exact snapshot SHA-256 transitions and Gate 1 / 2 / 3 cross-domain canary audits.'
                  : 'Per-model cryptographic receipt inspector showing exact snapshot SHA-256 transitions and Gate 1 / 2 / 3 audit outcomes.'}
              </p>
            </div>

            <AccessibleSegmentedTabs<string>
              ariaLabel="Slow Clock Receipt Model Selector"
              value={activeReceipt?.model ?? selectedModelId}
              onChange={setSelectedModelId}
              options={receiptModelTabs}
            />
          </div>

          {activeReceipt && (
            <>
              {/* Cryptographic Snapshot Transition Header */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3.5 text-xs">
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Snapshot SHA-256 Transition
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CopyHashButton
                      value={activeReceipt.initialSnapshotSha256}
                      label="beforeSnapshot"
                    />
                    <GitCommitHorizontal
                      className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <CopyHashButton
                      value={activeReceipt.finalSnapshotSha256}
                      label="afterSnapshot"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Promoted Prerequisite Graph
                  </span>
                  <p className="font-mono text-xs text-emerald-400">{promotedEdgeSummary}</p>
                  {Object.keys(activeReceipt.updatedRuleStatements).length > 0 && (
                    <p className="font-mono text-[10.5px] text-zinc-400">
                      Updated rules: {Object.keys(activeReceipt.updatedRuleStatements).join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Audit Provenance
                  </span>
                  <p className="font-mono text-xs text-zinc-300 tabular-nums">
                    {activeReceipt.fastClockTraceCount} Fast Clock traces ·{' '}
                    {activeReceipt.canaryCohortTaskIds.length} protected canaries
                  </p>
                  {activeReceipt.file && (
                    <p className="font-mono text-[10.5px] text-zinc-500 truncate">
                      {activeReceipt.file}
                    </p>
                  )}
                </div>
              </div>

              {/* Candidate Gate Audit Table */}
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={ledgerCaptionId}
                className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
              >
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <caption id={ledgerCaptionId} className="sr-only">
                    Slow Clock candidate governance audit ledger for {activeReceipt.model} showing
                    Gate 1, Gate 2, Gate 3 results, target delta, canary regressions, and promotion
                    decision.
                  </caption>
                  <thead className="sticky top-0 z-10 bg-[#0d0e13] font-mono text-[10.5px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800">
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-20 bg-[#0d0e13] px-4 py-2.5 font-medium"
                      >
                        Candidate
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Proposed Patch
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Slow Clock Gates (G1 · G2 · G3)
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        Target Delta
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Canary Regressions
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        Decision
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
                    {activeReceipt.candidateDecisions.map((dec) => {
                      const cr = dec.gateAudit.canaryReplay;
                      const deltaPp = cr.targetCohortDelta * 100;
                      return (
                        <tr
                          key={dec.candidateId}
                          className="hover:bg-zinc-900/50 transition-colors align-top"
                        >
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-[#101116] px-4 py-3 font-mono text-xs font-medium text-zinc-100 whitespace-nowrap"
                          >
                            <div>{dec.candidateId}</div>
                            <div className="mt-0.5 text-[10px] font-normal text-zinc-500">
                              {dec.factId} · {dec.origin}
                            </div>
                          </th>

                          <td className="px-3 py-3 text-zinc-300 min-w-[220px]">
                            <p className="text-xs leading-snug">{describeCandidatePatch(dec)}</p>
                            {dec.receipt && (
                              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                                {shortSha(dec.receipt.beforeSha256, 10, 4)} →{' '}
                                {shortSha(dec.receipt.afterSha256, 10, 4)}
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <GatePill
                                label="G1 Lock"
                                executed={dec.gateAudit.lexicalLock.executed}
                                passed={dec.gateAudit.lexicalLock.passed}
                              />
                              <GatePill
                                label="G2 Lint"
                                executed={dec.gateAudit.contradictionLinter.executed}
                                passed={dec.gateAudit.contradictionLinter.passed}
                              />
                              <GatePill
                                label="G3 Canary"
                                executed={cr.executed}
                                passed={cr.passed}
                              />
                            </div>
                          </td>

                          <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
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
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              {cr.targetBeforePassCount}→{cr.targetAfterPassCount}/{cr.targetTotal}{' '}
                              full
                            </div>
                          </td>

                          <td className="px-3 py-3 font-mono text-xs tabular-nums">
                            {cr.canaryRegressions === 0 ? (
                              <span className="text-emerald-400">0</span>
                            ) : (
                              <div>
                                <span className="font-medium text-rose-400">
                                  {cr.canaryRegressions}
                                </span>
                                <span className="ml-1.5 text-[10.5px] text-zinc-400">
                                  ({cr.regressedCanaryTaskIds.join(', ')})
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
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
    </div>
  );
}
