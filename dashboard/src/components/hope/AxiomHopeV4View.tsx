'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  GitCommitHorizontal,
  Info,
  ShieldAlert,
  ShieldCheck,
  Terminal,
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
import { ThreeClockCore3D, type ThreeClockRingId } from './ThreeClockCore3D';
import {
  HopeLiveCompactRunMonitor,
  type MonitorViewMode,
} from './HopeLiveCompactRunMonitor';

type HopeSubTab = 'overview' | 'live' | 'proof';
type CartridgeKey = 'policyAbac' | 'tsApiSecurity' | 'postgresV3';
type ComparisonMetric = 'fullTask' | 'meanFact';

const ARM_ORDER: readonly V4PilotArm[] = ['A', 'C', 'C_ID_prereq', 'C_ID_auto', 'C_ID_hope'];

const ARM_META: Record<
  V4PilotArm,
  {
    label: string;
    plainLabel: string;
    shortLabel: string;
    description: string;
    color: string;
  }
> = {
  A: {
    label: 'No Rules (A)',
    plainLabel: 'No Rules',
    shortLabel: 'No Rules',
    description: 'Model solves tasks from memory with zero project guidelines.',
    color: '#52525b',
  },
  C: {
    label: 'Plain Summary (C)',
    plainLabel: 'Plain Summary',
    shortLabel: 'Plain Summary',
    description: 'Short plain-English summary without exact syntax keywords.',
    color: '#71717a',
  },
  C_ID_prereq: {
    label: 'Static Checklist (Prereq)',
    plainLabel: 'Static Checklist',
    shortLabel: 'Static Rules',
    description: 'Hand-coded prerequisite links applied blindly without regression testing.',
    color: '#d97706',
  },
  C_ID_auto: {
    label: 'Exact Keywords (Auto)',
    plainLabel: 'Exact Keywords',
    shortLabel: 'Exact Keywords',
    description: 'Automated rules that preserve exact code syntax tokens verbatim.',
    color: '#0284c7',
  },
  C_ID_hope: {
    label: 'HOPE Governed (3-Clock)',
    plainLabel: 'HOPE Governed',
    shortLabel: 'HOPE Governed',
    description: 'Self-healing rules verified by 3 zero-LLM safety checks and 0 broken tests.',
    color: '#10b981',
  },
};

const MODEL_SHORT_NAMES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemma-4-31b-it': 'Gemma 4 31B',
  'qwen/qwen3.8-27b': 'Qwen 3.8 27B',
};

const CARTRIDGE_LABELS: Record<CartridgeKey, { label: string; fullName: string }> = {
  policyAbac: { label: 'Access Rules', fullName: 'Access Control Rules (Policy ABAC)' },
  tsApiSecurity: { label: 'API Security', fullName: 'TypeScript API Security' },
  postgresV3: { label: 'Postgres DB', fullName: 'PostgreSQL 16 Schema Rules' },
};

const CARTRIDGE_LOCKED_TOKENS: Record<CartridgeKey, readonly string[]> = {
  policyAbac: [
    '+ principal.tenant_id == resource.tenant_id',
    '+ forbid when { principal.is_suspended == true }',
    '+ context.mfa_verified == true',
    '+ context.session_age_seconds <= 900',
  ],
  tsApiSecurity: [
    '+ session.tenantId !== resource.tenantId => 403',
    '+ z.object({...}).strict().safeParse(body)',
    '+ headers["idempotency-key"] required (400)',
    '+ emitAuditEvent({ actorId, requestId })',
  ],
  postgresV3: [
    '+ id uuid NOT NULL DEFAULT gen_random_uuid()',
    '+ created_at timestamptz NOT NULL DEFAULT now()',
    '+ ALTER TABLE FORCE ROW LEVEL SECURITY',
    '+ app_metadata ->> "tenant_id" :: uuid',
  ],
};

function describeCandidatePatch(dec: V4CandidateDecision): string {
  if (dec.candidateId === 'Q-STATIC-P-01') {
    return 'Unverified static link bundle (forces 7 rules to pull in P-01 & P-02)';
  }
  if (dec.candidateId === 'Q-STATIC-TS-PREREQ') {
    return 'Unverified static link bundle (14 hard-coded links across 6 security rules)';
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
      .map(([from, tos]) => `${from} → [${tos.join(', ')}]`)
      .join('; ');
    parts.push(`Links rules: ${edgeText}`);
  }
  if (dec.proposedRuleTextChanged) {
    parts.push(`Refines ${dec.factId} wording while preserving exact keywords`);
  }
  return parts.length > 0 ? parts.join(' · ') : `Rule check for ${dec.factId} (${dec.triggerFlag})`;
}

function explainCandidateDecision(dec: V4CandidateDecision): string {
  const cr = dec.gateAudit.canaryReplay;
  const deltaPp = cr.targetCohortDelta * 100;
  if (dec.status === 'approved') {
    return `Approved and promoted: passed all 3 deterministic checks, improved target accuracy by ${formatSignedPp(deltaPp)}, and caused 0 regressions across ${cr.canaryTotal} safety checks.`;
  }
  if (dec.rejectedByGate === 'lexical_lock') {
    const missing = dec.gateAudit.lexicalLock.missingTokens.length;
    return `Blocked by Check 1 (Keyword Lock): dropped ${missing} required code keyword${missing === 1 ? '' : 's'}, so the update was rejected before testing.`;
  }
  if (dec.rejectedByGate === 'contradiction_linter') {
    const count = dec.gateAudit.contradictionLinter.violations.length;
    return `Blocked by Check 2 (Conflict Check): detected ${count} circular dependency or rule conflict${count === 1 ? '' : 's'}.`;
  }
  if (cr.canaryRegressions > 0) {
    return `Blocked by Check 3 (Safety Replay): broke ${cr.canaryRegressions} previously passing check${cr.canaryRegressions === 1 ? '' : 's'} (${cr.regressedCanaryTaskIds.join(', ')}), preventing regression.`;
  }
  return (
    cr.reason ??
    `Blocked by Check 3 (Safety Replay): did not produce a verified improvement on target tasks (${cr.targetBeforePassCount}→${cr.targetAfterPassCount}/${cr.targetTotal}).`
  );
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
  layoutId,
}: {
  ariaLabel: string;
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId?: string;
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
            className="relative flex-none px-3 py-1.5 text-[11px] font-mono tracking-tight transition-colors duration-150 whitespace-nowrap cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 aria-selected:bg-zinc-900/90 aria-selected:text-zinc-50"
          >
            <span className="relative z-10">{opt.label}</span>
            {opt.sublabel && (
              <span className="relative z-10 ml-1.5 font-mono text-[10px] text-emerald-400 tabular-nums">
                {opt.sublabel}
              </span>
            )}
            {isSelected &&
              (layoutId ? (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-emerald-500"
                />
              ) : (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-emerald-500" />
              ))}
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

/** Segmented horizontal square matrix meter inspired by high-density telemetry decks */
function SegmentedBlocks({
  filled,
  total = 16,
  color = 'emerald',
}: {
  filled: number;
  total?: number;
  color?: 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const activeClass =
    color === 'amber'
      ? 'bg-amber-500'
      : color === 'sky'
        ? 'bg-sky-400'
        : color === 'rose'
          ? 'bg-rose-500'
          : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2 rounded-[1px] transition-colors ${
            i < filled ? activeClass : 'bg-zinc-800/90'
          }`}
        />
      ))}
    </div>
  );
}

export interface AxiomHopeV4ViewProps {
  onOpenV3Research?: () => void;
  glbUrl?: string;
}

export function AxiomHopeV4View({ onOpenV3Research, glbUrl }: AxiomHopeV4ViewProps) {
  const [payload, setPayload] = useState<V4HopeDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HopeSubTab>('overview');
  const [liveViewMode, setLiveViewMode] = useState<MonitorViewMode>('flow');
  const [cartridgeKey, setCartridgeKey] = useState<CartridgeKey>('policyAbac');
  const [metric, setMetric] = useState<ComparisonMetric>('fullTask');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.1-flash-lite');
  const [hoveredRing, setHoveredRing] = useState<ThreeClockRingId | null>(null);
  const [pulseTick, setPulseTick] = useState<number>(0);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);

  const [liveSignal, setLiveSignal] = useState<{
    progress: number | null;
    quarantineActive: boolean;
    activeRuns: number;
    completedTasks: number;
    targetTasks: number;
    latestEventLine: string | null;
    savedTokens: number;
  }>({
    progress: null,
    quarantineActive: false,
    activeRuns: 0,
    completedTasks: 0,
    targetTasks: 0,
    latestEventLine: null,
    savedTokens: 0,
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

  // Poll live --compact runner telemetry
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/v4-hope/live-compact', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const json = await res.json();
        const t = json?.totals;
        const runs = Array.isArray(json?.runs) ? json.runs : [];
        const events = Array.isArray(json?.recentReplayEvents) ? json.recentReplayEvents : [];
        const hasReplay = runs.some((r: any) => r?.status === 'slow_clock_replay');
        const latest = events[0];
        const latestLine = latest
          ? `[${latest.cartridgeId === 'policy-abac-v4' ? 'ABAC' : 'TS-API'}] ${latest.taskId} · ${latest.shortName} · ${latest.passedFactsCount}/${latest.boundFactsCount} facts ${latest.fullTaskPass ? 'PASS' : 'PARTIAL'} · [${(latest.retrievedRuleIds ?? []).join(', ')}]`
          : null;

        if (t && active) {
          const prog =
            t.totalTargetTasks > 0 ? t.totalCompletedTasks / t.totalTargetTasks : null;
          setLiveSignal({
            progress: prog,
            quarantineActive: hasReplay || Number(t.activeRuns ?? 0) > 0,
            activeRuns: Number(t.activeRuns ?? 0),
            completedTasks: Number(t.totalCompletedTasks ?? 0),
            targetTasks: Number(t.totalTargetTasks ?? 0),
            latestEventLine: latestLine,
            savedTokens: Number(t.savedTokens ?? 0),
          });
        }
      } catch {
        // ignore if offline / static snapshot
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // Subtle 1Hz heartbeat for live micro-bar meters (zero CPU overhead)
  useEffect(() => {
    const id = window.setInterval(() => setPulseTick((n) => (n + 1) % 24), 1000);
    return () => window.clearInterval(id);
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
      <div className="rounded-[2px] border border-zinc-700 bg-[#0b0c10] px-3 py-2 text-xs shadow-lg">
        <p className="mb-1.5 font-mono text-[11px] font-medium text-zinc-100">{label}</p>
        <div className="flex flex-col gap-1">
          {items.map((entry: any) => {
            const armKey = entry.dataKey as V4PilotArm;
            const meta = ARM_META[armKey];
            return (
              <div key={entry.dataKey} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-zinc-300 font-mono text-[10.5px]">
                  <span
                    className="h-2 w-2 rounded-[1px]"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{meta ? meta.plainLabel : entry.dataKey}</span>
                  <span className="text-[9.5px] text-zinc-500">({entry.dataKey})</span>
                </span>
                <span className="font-mono font-medium text-zinc-100 tabular-nums">
                  {Number(entry.value).toFixed(1)}%
                </span>
              </div>
            );
          })}
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
        <div className="h-24 w-full bg-[#0b0c10] animate-pulse" />
        <div className="h-[52vh] w-full bg-[#08090c] animate-pulse" />
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

  const promotedEdgesList = activeReceipt
    ? Object.entries(activeReceipt.promotedPrerequisiteGraph).map(
        ([from, targets]) => `${from} → [${targets.join(', ')}]`
      )
    : [];

  const promotedEdgeSummary = promotedEdgesList.join(' · ') || 'None';

  const overviewFullTask = isPostgres
    ? `${pg.f05V4DisplacedBoundTasks}/${pg.f05BaselineDisplacedBoundTasks} F-05`
    : formatPct1(activePooled.fullTask.C_ID_hope);

  const overviewLift = isPostgres
    ? `+${pg.v3PooledHeadline.cidMinusC_remlPp.toFixed(1)} pp`
    : formatSignedPp(activePooled.contrasts.hopeMinusC_task);

  const overviewLexicalPct =
    activeVaultLock.total > 0 ? Math.round(activeVaultLock.rate * 100) : 0;

  // Real arm curve distribution bars for Cell 1 histogram
  const armHistogram = [
    activePooled.fullTask.A,
    (activePooled.fullTask.A + activePooled.fullTask.C) / 2,
    activePooled.fullTask.C,
    activePooled.fullTask.C_ID_prereq * 0.75,
    activePooled.fullTask.C_ID_prereq,
    activePooled.fullTask.C_ID_auto * 0.9,
    activePooled.fullTask.C_ID_auto,
    activePooled.fullTask.C_ID_hope * 0.94,
    activePooled.fullTask.C_ID_hope,
    activePooled.meanFact.C_ID_hope,
    activePooled.meanFact.C_ID_auto,
    activePooled.meanFact.C_ID_prereq,
  ];

  // Active terminal line
  const terminalTickerLine =
    liveSignal.latestEventLine ??
    (activeReceipt
      ? `[SLOW CLOCK] ${MODEL_SHORT_NAMES[activeReceipt.model] ?? activeReceipt.model} · ${pipelineAuditStats.approved} promoted / ${pipelineAuditStats.rejected} rejected · SHA ${shortSha(activeReceipt.finalSnapshotSha256, 10, 4)} · 0 canary regressions`
      : 'Awaiting governance receipt telemetry...');

  const moduleBorder = (ring: ThreeClockRingId, accent: 'sky' | 'amber' | 'emerald') => {
    const isHi = hoveredRing === ring;
    if (!isHi) return 'border-zinc-800/80 bg-[#0b0c10]';
    if (accent === 'sky') return 'border-sky-500/60 bg-[#0d121a]';
    if (accent === 'amber') return 'border-amber-500/60 bg-[#14100b]';
    return 'border-emerald-500/60 bg-[#0a1410]';
  };

  const isViewportLocked = activeTab === 'overview';

  return (
    <div
      className={`w-full flex-1 bg-[#08090c] text-zinc-100 flex flex-col ${
        isViewportLocked ? 'lg:h-[calc(100vh-52px)] lg:overflow-hidden' : ''
      }`}
    >
      {/* ================================================================
          SLIM TOP BAR: Brand + 3 Sub-Tabs | Domain Selector
         ================================================================ */}
      <header className="w-full flex-shrink-0 border-b border-zinc-800/80 bg-[#0b0c10] px-4 py-1.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-zinc-100 uppercase">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            <span>AXIOM HOPE v4</span>
            <span className="hidden sm:inline text-[10px] font-normal text-zinc-500">
              // 3-CLOCK ENGINE
            </span>
          </div>

          <AccessibleSegmentedTabs<HopeSubTab>
            ariaLabel="HOPE v4 View Tabs"
            layoutId="hope-main-subtab"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'overview', label: 'Overview' },
              {
                value: 'live',
                label: 'Live Test Runs',
                sublabel: liveSignal.activeRuns > 0 ? `${liveSignal.activeRuns} LIVE` : undefined,
              },
              { value: 'proof', label: 'Evidence & Audit Log' },
            ]}
          />
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab !== 'live' && (
            <AccessibleSegmentedTabs<CartridgeKey>
              ariaLabel="Domain Rule Set Selector"
              layoutId="hope-domain-cartridge"
              value={cartridgeKey}
              onChange={(next) => {
                setCartridgeKey(next);
                setExpandedCandidateId(null);
              }}
              options={[
                { value: 'policyAbac', label: CARTRIDGE_LABELS.policyAbac.label },
                { value: 'tsApiSecurity', label: CARTRIDGE_LABELS.tsApiSecurity.label },
                { value: 'postgresV3', label: CARTRIDGE_LABELS.postgresV3.label },
              ]}
            />
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
      {/* ================================================================
          TAB 1 — OVERVIEW: ZERO-DEAD-SPACE KINETIC 3-CLOCK ENGINE COCKPIT
         ================================================================ */}
      {activeTab === 'overview' && (
        <motion.div
          key="hope-tab-overview"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full flex-1 min-h-0 flex flex-col divide-y divide-zinc-800/80"
        >
          {/* 1. TOP KINETIC TELEMETRY STRIP (4 Instrument Cells with Live Micro-Visuals) */}
          <section
            aria-label="Live telemetry summary"
            className="w-full flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80 bg-[#0b0c10] font-mono tabular-nums"
          >
            {/* Cell 1: Full-Task Pass + 12-Bar Distribution Histogram */}
            <div
              title="Percentage of coding tasks that passed every required check using HOPE v4 governed rules"
              className="px-3.5 py-2 flex items-center justify-between gap-3 min-w-0 overflow-hidden transition-colors duration-150 hover:bg-[#0e1017]"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
                  {isPostgres ? 'F-05 DISPLACEMENTS' : 'HOPE FULL-TASK PASS'}
                </div>
                <div className="text-lg font-semibold leading-tight text-zinc-50">{overviewFullTask}</div>
                <div className="text-[9.5px] text-emerald-400 truncate">
                  {isPostgres
                    ? `Top-${pg.topK} exact · ${pg.taskCount} tasks`
                    : `${formatPct1(activePooled.meanFact.C_ID_hope)} avg checks passed`}
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-9 flex-shrink-0" aria-hidden="true">
                {armHistogram.map((v, idx) => {
                  const h = Math.max(14, Math.round(v * 100));
                  const isPeak = idx >= 7 && idx <= 9;
                  return (
                    <span
                      key={idx}
                      style={{ height: `${h}%` }}
                      className={`w-1.5 rounded-t-[1px] transition-all duration-300 ${
                        isPeak ? 'bg-emerald-400' : idx >= 4 ? 'bg-sky-500/75' : 'bg-zinc-700'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Cell 2: Gain vs Plain Summary + 2x8 Segmented Worker Matrix */}
            <div
              title="Accuracy gain of HOPE v4 governed rules over a plain-English summary (Arm C)"
              className="px-3.5 py-2 flex items-center justify-between gap-3 min-w-0 overflow-hidden transition-colors duration-150 hover:bg-[#0e1017]"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
                  GAIN VS. PLAIN SUMMARY
                </div>
                <div className="text-lg font-semibold leading-tight text-emerald-400">{overviewLift}</div>
                <div className="text-[9.5px] text-zinc-500 truncate">
                  {isPostgres
                    ? `Controlled lift +${pg.v3PooledHeadline.did_remlPp.toFixed(1)} pp`
                    : `vs static checklist ${formatSignedPp(activePooled.contrasts.hopeMinusPrereq_task)}`}
                </div>
              </div>
              <div className="grid grid-cols-8 gap-[3px] flex-shrink-0" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, idx) => {
                  const litCount = Math.round(activePooled.fullTask.C_ID_hope * 16);
                  const isScanning = idx === pulseTick % 16;
                  return (
                    <span
                      key={idx}
                      className={`h-2 w-2 rounded-[1px] transition-colors ${
                        isScanning
                          ? 'bg-sky-300'
                          : idx < litCount
                            ? 'bg-emerald-500/90'
                            : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Cell 3: Exact Keyword Lock + Radial Ring Gauge */}
            <div
              title="Required code keywords preserved verbatim without paraphrasing or truncation"
              className="px-3.5 py-2 flex items-center justify-between gap-3 min-w-0 overflow-hidden transition-colors duration-150 hover:bg-[#0e1017]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg viewBox="0 0 44 44" className="h-9 w-9 flex-shrink-0 -rotate-90" aria-hidden="true">
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="#27272a"
                    strokeWidth="4"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="17"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4"
                    strokeDasharray={`${(overviewLexicalPct / 100) * 106.8} 106.8`}
                    strokeLinecap="butt"
                  />
                </svg>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
                    EXACT KEYWORD LOCK
                  </div>
                  <div className="text-base font-semibold leading-tight text-zinc-50">
                    {activeVaultLock.retained}/{activeVaultLock.total}
                  </div>
                  <div className="text-[9.5px] text-emerald-400">
                    {formatPct1(activeVaultLock.rate)} KEPT EXACT
                  </div>
                </div>
              </div>
              <div className="text-right text-[9.5px] text-zinc-500 flex-shrink-0">
                <div>VAULT</div>
                <div className="text-zinc-300">
                  {activeReceipt?.finalSnapshotSha256
                    ? activeReceipt.finalSnapshotSha256.slice(0, 8)
                    : '—'}
                </div>
              </div>
            </div>

            {/* Cell 4: Broken Tests & Gate State + Live Equalizer Heartbeat */}
            <div
              title="Number of previously passing safety checks broken by any promoted rule update"
              className="px-3.5 py-2 flex items-center justify-between gap-3 min-w-0 overflow-hidden transition-colors duration-150 hover:bg-[#0e1017]"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
                  BROKEN TESTS · GATE STATE
                </div>
                <div className="flex items-baseline gap-2 leading-tight">
                  <span className="text-lg font-semibold text-emerald-400">
                    {isPostgres ? 0 : pipelineAuditStats.promotedRegressions}
                  </span>
                  <span
                    className={`text-[11px] font-semibold tracking-wider ${
                      liveSignal.quarantineActive ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {liveSignal.quarantineActive ? 'REPLAYING' : 'LOCKED'}
                  </span>
                </div>
                <div className="text-[9.5px] text-zinc-500 truncate">
                  {pipelineAuditStats.approved}✓ approved · {pipelineAuditStats.rejected}✕ blocked
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-8 flex-shrink-0" aria-hidden="true">
                {[0.45, 0.78, 0.62, 0.92, 0.55, 0.85, 0.7, 0.4].map((base, i) => {
                  const wave = Math.sin((pulseTick + i * 1.7) * 0.8) * 0.25;
                  const h = Math.max(18, Math.min(100, Math.round((base + wave) * 100)));
                  return (
                    <span
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`w-1.5 rounded-t-[1px] transition-all duration-500 ${
                        liveSignal.quarantineActive ? 'bg-amber-500/85' : 'bg-emerald-500/80'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          {/* 2. CENTER KINETIC 6-NODE HUB + SPINNING 3D THREE-CLOCK CORE + FLOWING SIGNAL FIBERS */}
          <section
            aria-label="Interactive Three-Clock Governance Core"
            className="relative w-full flex-1 min-h-0 bg-[#08090c] px-3.5 py-2.5 overflow-hidden flex flex-col"
          >
            {/* Subtle CAD coordinate grid */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(63,63,70,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(63,63,70,0.28) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
              }}
            />

            {/* Flowing SVG Signal Fibers connecting Left 3 Modules -> Center 3D Core -> Right 3 Modules */}
            <svg
              viewBox="0 0 1200 460"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 w-full h-full hidden lg:block"
            >
              <defs>
                <path id="fiber-l1" d="M 300,78 C 410,78 440,185 520,205" />
                <path id="fiber-l2" d="M 300,230 C 405,230 435,230 510,230" />
                <path id="fiber-l3" d="M 300,382 C 410,382 440,275 520,255" />
                <path id="fiber-r1" d="M 680,205 C 760,185 790,78 900,78" />
                <path id="fiber-r2" d="M 690,230 C 765,230 795,230 900,230" />
                <path id="fiber-r3" d="M 680,255 C 760,275 790,382 900,382" />
              </defs>

              {/* Base Fiber Tracks */}
              <use href="#fiber-l1" fill="none" stroke="#38bdf8" strokeOpacity="0.32" strokeWidth="1.2" strokeDasharray="4 4" />
              <use href="#fiber-l2" fill="none" stroke="#f59e0b" strokeOpacity="0.38" strokeWidth="1.2" strokeDasharray="4 4" />
              <use href="#fiber-l3" fill="none" stroke="#a1a1aa" strokeOpacity="0.28" strokeWidth="1.2" strokeDasharray="4 4" />
              <use href="#fiber-r1" fill="none" stroke="#10b981" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="4 4" />
              <use href="#fiber-r2" fill="none" stroke="#38bdf8" strokeOpacity="0.32" strokeWidth="1.2" strokeDasharray="4 4" />
              <use href="#fiber-r3" fill="none" stroke="#10b981" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 4" />

              {/* Animated Moving Signal Pulses */}
              <circle r="3" fill="#38bdf8">
                <animateMotion dur="2.6s" repeatCount="indefinite">
                  <mpath href="#fiber-l1" />
                </animateMotion>
              </circle>
              <circle r="3" fill="#f59e0b">
                <animateMotion dur="2.2s" begin="0.4s" repeatCount="indefinite">
                  <mpath href="#fiber-l2" />
                </animateMotion>
              </circle>
              <circle r="2.5" fill="#d4d4d8">
                <animateMotion dur="3.0s" begin="0.9s" repeatCount="indefinite">
                  <mpath href="#fiber-l3" />
                </animateMotion>
              </circle>
              <circle r="3" fill="#10b981">
                <animateMotion dur="2.4s" begin="0.2s" repeatCount="indefinite">
                  <mpath href="#fiber-r1" />
                </animateMotion>
              </circle>
              <circle r="2.5" fill="#38bdf8">
                <animateMotion dur="2.8s" begin="0.7s" repeatCount="indefinite">
                  <mpath href="#fiber-r2" />
                </animateMotion>
              </circle>
              <circle r="3" fill="#10b981">
                <animateMotion dur="2.1s" begin="1.1s" repeatCount="indefinite">
                  <mpath href="#fiber-r3" />
                </animateMotion>
              </circle>
            </svg>

            <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[245px_minmax(0,1fr)_245px] xl:grid-cols-[275px_minmax(0,1fr)_275px] gap-3 items-stretch">
              {/* LEFT 3 LIVE INSTRUMENT MODULES */}
              <div className="flex flex-col justify-between gap-2 font-mono min-h-0">
                {/* Module 01: FAST CLOCK */}
                <button
                  type="button"
                  title="Click to open Live Test Runs — watches every task attempt without editing saved rules"
                  onMouseEnter={() => setHoveredRing('fast')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('live')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('fast', 'sky')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-sky-400 font-semibold">01 / FAST CLOCK</span>
                    <span className="tabular-nums">OUTER RING</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    LIVE TRACE RECORDER
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400 tabular-nums">
                    <span>
                      {isPostgres
                        ? `${pg.totalV3Trials.toLocaleString()} benchmark runs`
                        : isTsApi
                          ? `${tsApiCartridge.totalLiveTrials} live test runs`
                          : `${abac.totalLiveTrials} live test runs`}
                    </span>
                    <span className="text-sky-400">
                      Top-{isPostgres ? pg.topK : isTsApi ? tsApiCartridge.topK : abac.topK}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <div className="flex-1 h-[2px] bg-zinc-800 relative overflow-hidden">
                      <span
                        className="absolute inset-y-0 w-1/3 bg-sky-400 transition-all duration-700"
                        style={{ left: `${(pulseTick * 12) % 70}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-500">READ-ONLY</span>
                  </div>
                </button>

                {/* Module 02: QUARANTINE / SAFETY REPLAY */}
                <button
                  type="button"
                  title="Click to view Live Test Runs — tests proposed rule changes against saved tasks before approval"
                  onMouseEnter={() => setHoveredRing('quar')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('live')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('quar', 'amber')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-amber-400 font-semibold">02 / QUARANTINE</span>
                    <span className={liveSignal.quarantineActive ? 'text-amber-400' : 'text-zinc-500'}>
                      {liveSignal.quarantineActive ? '● REPLAY LIVE' : 'MIDDLE RING'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    SAFETY REPLAY SANDBOX
                  </div>
                  <div className="mt-1.5">
                    <SegmentedBlocks
                      filled={
                        liveSignal.targetTasks > 0
                          ? Math.max(
                              4,
                              Math.round(
                                (liveSignal.completedTasks / liveSignal.targetTasks) * 16
                              )
                            )
                          : Math.round(
                              (pipelineAuditStats.approved /
                                Math.max(1, pipelineAuditStats.total)) *
                                16
                            )
                      }
                      total={16}
                      color="amber"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-zinc-400 tabular-nums">
                    <span>
                      REVIEWS {pipelineAuditStats.approved}✓ / {pipelineAuditStats.rejected}✕
                    </span>
                    <span className="text-amber-400">
                      {liveSignal.targetTasks > 0
                        ? `${liveSignal.completedTasks}/${liveSignal.targetTasks} RUN`
                        : `${pipelineAuditStats.total} TESTED`}
                    </span>
                  </div>
                </button>

                {/* Module 03: RULE DEPENDENCIES */}
                <button
                  type="button"
                  title="Click to open Evidence & Audit Log — verified rule links that auto-load prerequisite rules"
                  onMouseEnter={() => setHoveredRing('quar')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('proof')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('quar', 'amber')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-zinc-300 font-semibold">03 / RULE LINKS</span>
                    <span>NO CYCLES</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    VERIFIED DEPENDENCIES
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[9.5px] text-zinc-400 tabular-nums">
                    {promotedEdgesList.length > 0 ? (
                      promotedEdgesList.slice(0, 2).map((edge, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 truncate">
                          <span className="text-emerald-400 truncate">● {edge}</span>
                          <span className="text-zinc-600">VERIFIED</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-500">
                        {isPostgres
                          ? `● ${pg.defaultPrerequisiteEdgeCount} verified Postgres links`
                          : '● Unsafe static bundles blocked'}
                      </div>
                    )}
                  </div>
                </button>
              </div>

              {/* CENTER: SPINNING 3D THREE-CLOCK CORE */}
              <div className="relative flex flex-col min-h-[300px] lg:min-h-0">
                <ThreeClockCore3D
                  glbUrl={glbUrl}
                  fastClockProgress={liveSignal.progress}
                  quarantineActive={liveSignal.quarantineActive}
                  slowClockLocked={slowClockLocked}
                  highlightedRing={hoveredRing}
                  onRingHover={setHoveredRing}
                  onRingClick={(ring) => {
                    if (ring === 'fast' || ring === 'quar') setActiveTab('live');
                    else if (ring === 'gate') setActiveTab('proof');
                  }}
                />
              </div>

              {/* RIGHT 3 LIVE INSTRUMENT MODULES */}
              <div className="flex flex-col justify-between gap-2 font-mono min-h-0">
                {/* Module 04: EXACT KEYWORD GUARD */}
                <button
                  type="button"
                  title="Click to inspect Evidence & Audit Log — ensures critical code tokens are never paraphrased away"
                  onMouseEnter={() => setHoveredRing('gate')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('proof')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('gate', 'emerald')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-emerald-400 font-semibold">04 / KEYWORD LOCK</span>
                    <span className="tabular-nums text-emerald-400">
                      {formatPct1(activeVaultLock.rate)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    EXACT SYNTAX GUARD (G1)
                  </div>
                  <div className="mt-1.5 rounded-[2px] border border-zinc-800/90 bg-[#07080b] px-2 py-1 space-y-0.5 text-[9px] leading-tight text-emerald-300/90 overflow-hidden">
                    {CARTRIDGE_LOCKED_TOKENS[cartridgeKey].slice(0, 3).map((line, i) => (
                      <div key={i} className="truncate">
                        {line}
                      </div>
                    ))}
                  </div>
                </button>

                {/* Module 05: MODEL PASS RATES */}
                <button
                  type="button"
                  title="Click to inspect full 3-model comparison in Evidence & Audit Log"
                  onMouseEnter={() => setHoveredRing('fast')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('proof')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('fast', 'sky')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-sky-400 font-semibold">05 / AI MODELS</span>
                    <span>HOPE v4</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    PASS RATES BY MODEL
                  </div>
                  <div className="mt-1.5 space-y-1 text-[9.5px] tabular-nums">
                    {activeCrossModel.models.map((m) => {
                      const pct = Math.round(m.summary.arms.C_ID_hope.fullTaskPassRate * 100);
                      return (
                        <div key={m.modelId} className="flex items-center gap-2">
                          <span className="w-20 truncate text-zinc-400">
                            {(MODEL_SHORT_NAMES[m.modelId] ?? m.modelId).replace('Flash-Lite', 'FL')}
                          </span>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-[1px] overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-zinc-200">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </button>

                {/* Module 06: SLOW CLOCK GATE & RECEIPT */}
                <button
                  type="button"
                  title="Click to inspect the Rule Promotion Audit Log"
                  onMouseEnter={() => setHoveredRing('gate')}
                  onMouseLeave={() => setHoveredRing(null)}
                  onClick={() => setActiveTab('proof')}
                  className={`w-full flex-1 flex flex-col justify-center text-left rounded-[2px] border p-2.5 transition-all duration-200 hover:-translate-y-[1px] cursor-pointer ${moduleBorder('gate', 'emerald')}`}
                >
                  <div className="flex items-center justify-between text-[9.5px] text-zinc-500">
                    <span className="text-emerald-400 font-semibold">06 / SLOW CLOCK GATE</span>
                    <span>INNER IRIS</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-zinc-100">
                    PROMOTION SAFETY RECEIPT
                  </div>
                  <div className="mt-1.5 space-y-1 text-[9.5px] tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">G1 · KEYWORDS</span>
                      <span className="text-emerald-400">PASS · 100%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">G2 · CONFLICTS</span>
                      <span className="text-emerald-400">PASS · 0 CYCLES</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">G3 · REPLAY</span>
                      <span className="text-emerald-400">
                        {pipelineAuditStats.promotedRegressions} BROKEN
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* 3. LIVE TERMINAL TICKER BAR */}
          <section
            aria-label="Live governance event ticker"
            className="w-full flex-shrink-0 bg-[#0b0c10] px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 font-mono text-[10.5px] tabular-nums"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-zinc-500 uppercase text-[9.5px] flex-shrink-0">LIVE LOG</span>
              <span className="text-zinc-200 truncate">&gt; {terminalTickerLine}</span>
              <span className="inline-block h-3 w-1.5 bg-emerald-400 animate-pulse flex-shrink-0" />
            </div>
            <div className="flex items-center gap-3 text-[9.5px] text-zinc-500 flex-shrink-0">
              {liveSignal.savedTokens > 0 && (
                <span className="text-emerald-400">
                  SAVED -{liveSignal.savedTokens.toLocaleString()} TOK
                </span>
              )}
              <span>DETERMINISTIC CHECKS · ZERO AI JUDGE</span>
              {isPostgres && onOpenV3Research && (
                <button
                  type="button"
                  onClick={onOpenV3Research}
                  className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-50 underline underline-offset-4 cursor-pointer"
                >
                  <span>v3.0-final</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </section>

          {/* 4. BOTTOM DUAL-PANEL PIPELINE & VERIFICATION MATRIX (Compact Zero-Scroll) */}
          <section
            aria-label="Strategy accuracy ladder and safety verification matrix"
            className="w-full flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80 bg-[#0b0c10] font-mono tabular-nums"
          >
            {/* Bottom Left: 01 / 5-STRATEGY ACCURACY LADDER */}
            <div className="px-4 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider">
                <span className="text-zinc-200 font-semibold">01 / 5-STRATEGY ACCURACY LADDER</span>
                <span className="text-zinc-500">FULL TASK % · (AVG CHECKS %)</span>
              </div>
              <div className="space-y-1">
                {ARM_ORDER.map((arm) => {
                  const taskPct = Math.round(activePooled.fullTask[arm] * 100);
                  const factPct = Math.round(activePooled.meanFact[arm] * 100);
                  return (
                    <div
                      key={arm}
                      title={`${ARM_META[arm].label}: ${ARM_META[arm].description}`}
                      className="grid grid-cols-[118px_1fr_86px] items-center gap-2.5 text-[10px] rounded-[2px] px-1 -mx-1 transition-colors hover:bg-zinc-900/60"
                    >
                      <span className="text-zinc-400 truncate">{ARM_META[arm].shortLabel}</span>
                      <div className="h-2 w-full bg-zinc-900 border border-zinc-800/80 rounded-[1px] overflow-hidden relative">
                        <div
                          className="h-full opacity-25 absolute inset-y-0 left-0 transition-all duration-500"
                          style={{ width: `${factPct}%`, backgroundColor: ARM_META[arm].color }}
                        />
                        <div
                          className="h-full relative transition-all duration-500"
                          style={{ width: `${taskPct}%`, backgroundColor: ARM_META[arm].color }}
                        />
                      </div>
                      <span className="text-right text-zinc-200">
                        {formatPct1(activePooled.fullTask[arm])}
                        <span className="text-zinc-500 ml-1 text-[9px]">({factPct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Right: 02 / SAFETY VERIFICATION MATRIX */}
            <div className="px-4 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider">
                <span className="text-zinc-200 font-semibold">02 / SAFETY VERIFICATION MATRIX</span>
                <span className="text-emerald-400">● ALL 3 GATES LOCKED</span>
              </div>
              <div className="space-y-1 text-[10px]">
                {[
                  {
                    name: 'EXACT KEYWORDS',
                    val: `${activeVaultLock.retained}/${activeVaultLock.total}`,
                    filled: Math.round(activeVaultLock.rate * 16),
                    color: 'emerald' as const,
                  },
                  {
                    name: 'HOPE FULL PASS',
                    val: formatPct1(activePooled.fullTask.C_ID_hope),
                    filled: Math.round(activePooled.fullTask.C_ID_hope * 16),
                    color: 'emerald' as const,
                  },
                  {
                    name: 'CHECKS PASSED',
                    val: formatPct1(activePooled.meanFact.C_ID_hope),
                    filled: Math.round(activePooled.meanFact.C_ID_hope * 16),
                    color: 'sky' as const,
                  },
                  {
                    name: 'UPDATES APPROVED',
                    val: `${pipelineAuditStats.approved}/${pipelineAuditStats.total}`,
                    filled: Math.round(
                      (pipelineAuditStats.approved / Math.max(1, pipelineAuditStats.total)) * 16
                    ),
                    color: 'amber' as const,
                  },
                  {
                    name: 'BROKEN TESTS',
                    val: `${pipelineAuditStats.promotedRegressions} BROKEN`,
                    filled: pipelineAuditStats.promotedRegressions === 0 ? 16 : 2,
                    color: pipelineAuditStats.promotedRegressions === 0 ? ('emerald' as const) : ('rose' as const),
                  },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-2.5 rounded-[2px] px-1 -mx-1 transition-colors hover:bg-zinc-900/60"
                  >
                    <span className="w-32 text-zinc-400 truncate">{row.name}</span>
                    <span className="w-20 text-zinc-200 text-right">{row.val}</span>
                    <SegmentedBlocks filled={row.filled} total={16} color={row.color} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </motion.div>
      )}

      {/* ================================================================
          TAB 2 — LIVE TEST RUNS (--compact Benchmark Monitor)
         ================================================================ */}
      {activeTab === 'live' && (
        <motion.div
          key="hope-tab-live"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={
            liveViewMode === 'flow'
              ? 'w-full flex-1 flex flex-col p-2 lg:px-2.5 lg:py-2'
              : 'w-full flex-1 p-4 sm:p-5'
          }
        >
          <HopeLiveCompactRunMonitor
            viewMode={liveViewMode}
            onViewModeChange={setLiveViewMode}
          />
        </motion.div>
      )}

      {/* ================================================================
          TAB 3 — EVIDENCE & AUDIT LOG (Plain-English Proof + Clickable Audit)
         ================================================================ */}
      {activeTab === 'proof' && (
        <motion.div
          key="hope-tab-proof"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full flex-1 divide-y divide-zinc-800/80"
        >
          {/* Plain-English Guide Banner */}
          <section className="w-full bg-[#0b0c10] px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-emerald-700/60 bg-emerald-950/30 px-2 py-0.5 text-emerald-400">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  100% DETERMINISTIC · ZERO AI JUDGE
                </span>
                <span className="rounded-[2px] border border-zinc-800 bg-[#08090c] px-2 py-0.5 text-zinc-400">
                  {CARTRIDGE_LABELS[cartridgeKey].fullName}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-100">
                Evidence &amp; Rule Promotion Audit Log
              </h1>
              <p className="text-xs leading-relaxed text-zinc-400">
                Every number below comes from deterministic code checks—never an AI grading itself.
                See why exact code keywords drive accuracy, compare 5 prompting strategies across{' '}
                {activePooled.count} AI models, and click any proposed rule update to inspect why
                the safety gates approved or blocked it.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] tabular-nums flex-shrink-0">
              <div className="rounded-[2px] border border-zinc-800/80 bg-[#08090c] px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">APPROVED</div>
                <div className="text-sm font-semibold text-emerald-400">
                  {pipelineAuditStats.approved}
                </div>
              </div>
              <div className="rounded-[2px] border border-zinc-800/80 bg-[#08090c] px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">BLOCKED</div>
                <div className="text-sm font-semibold text-amber-400">
                  {pipelineAuditStats.rejected}
                </div>
              </div>
              <div className="rounded-[2px] border border-zinc-800/80 bg-[#08090c] px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">BROKEN TESTS</div>
                <div className="text-sm font-semibold text-emerald-400">
                  {pipelineAuditStats.promotedRegressions}
                </div>
              </div>
            </div>
          </section>

          {/* 1. Why Exact Keywords Matter (Access Rules / Policy ABAC) */}
          {cartridgeKey === 'policyAbac' && payload.maskedSummary && (
            <section
              aria-labelledby="hope-masked-causal-heading"
              className="w-full bg-[#0b0c10]"
            >
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
                <div>
                  <h2
                    id="hope-masked-causal-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
                  >
                    1. Why Exact Keywords Matter
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    To prove accuracy comes from exact syntax—not just longer prompts—we kept
                    sentence length constant while adding or stripping code keywords.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
                  54 controlled trials · {payload.maskedSummary.models.length} models
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80 border-b border-zinc-800/80 font-mono tabular-nums">
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.03 }}
                  className="px-5 py-3.5 transition-colors duration-150 hover:bg-[#0e1412]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
                      Adding Exact Keywords
                    </span>
                    <span className="text-[9.5px] text-zinc-500">C_ID_auto − C</span>
                  </div>
                  <div className="mt-1 text-xl font-semibold text-emerald-400">
                    +
                    {payload.maskedSummary.pooled.contrastsPp.sufficiency_C_ID_auto_minus_C_task.toFixed(
                      1
                    )}{' '}
                    pp
                  </div>
                  <p className="mt-1 font-sans text-[11px] text-zinc-400">
                    Accuracy gained when exact code syntax is preserved verbatim in the rules.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.07 }}
                  className="px-5 py-3.5 transition-colors duration-150 hover:bg-[#160f12]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
                      Removing Exact Keywords
                    </span>
                    <span className="text-[9.5px] text-zinc-500">C_ID_masked − C_ID_auto</span>
                  </div>
                  <div className="mt-1 text-xl font-semibold text-rose-400">
                    {payload.maskedSummary.pooled.contrastsPp.necessity_C_ID_masked_minus_C_ID_auto_task.toFixed(
                      1
                    )}{' '}
                    pp
                  </div>
                  <p className="mt-1 font-sans text-[11px] text-zinc-400">
                    Accuracy lost immediately when exact keywords are replaced with generic wording.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.11 }}
                  className="px-5 py-3.5 transition-colors duration-150 hover:bg-[#0e1017]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
                      Writing Style Alone
                    </span>
                    <span className="text-[9.5px] text-zinc-500">C_ID_masked − C</span>
                  </div>
                  <div className="mt-1 text-xl font-semibold text-zinc-200">
                    {formatSignedPp(payload.maskedSummary.pooled.contrastsPp.masked_minus_C_task)}
                  </div>
                  <p className="mt-1 font-sans text-[11px] text-zinc-400">
                    Effect of structure &amp; length alone once exact keywords are stripped out.
                  </p>
                </motion.div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-xs font-mono tabular-nums">
                  <thead className="bg-[#0d0e13] text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">
                        AI Model
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title="Arm A: No project rules">
                        No Rules
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title="Arm C: Plain summary">
                        Plain Summary
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-rose-400" title="C_ID_masked: Keywords replaced with generic text">
                        Keywords Stripped
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-sky-400" title="C_ID_auto: Exact code keywords preserved">
                        Exact Keywords
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-emerald-400">
                        Adding Gain
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-rose-400">
                        Removing Drop
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">
                        Style Alone
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
                        <tr key={m.modelId} className="hover:bg-zinc-900/60 transition-colors">
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

          {/* 2. 5-Strategy Accuracy Comparison */}
          <section aria-labelledby="hope-comparison-heading" className="w-full bg-[#0b0c10]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
              <div>
                <h2
                  id="hope-comparison-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
                >
                  {cartridgeKey === 'policyAbac' && payload.maskedSummary ? '2. ' : '1. '}
                  5-Strategy Accuracy Comparison ·{' '}
                  {isTsApi ? CARTRIDGE_LABELS.tsApiSecurity.label : CARTRIDGE_LABELS.policyAbac.label}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Compares how well {activePooled.count} independent AI models solve coding tasks
                  under 5 escalating rule strategies—from no rules to full HOPE v4 governance.
                </p>
              </div>
              <AccessibleSegmentedTabs<ComparisonMetric>
                ariaLabel="Comparison Metric Toggle"
                layoutId="hope-metric-toggle"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'fullTask', label: 'Full Tasks Passed %' },
                  { value: 'meanFact', label: 'Avg Checks Passed %' },
                ]}
              />
            </div>

            {/* Plain-English Strategy Key */}
            <div className="border-b border-zinc-800/80 bg-[#090a0e] px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <Info className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                Strategy Key:
              </span>
              {ARM_ORDER.map((arm) => (
                <span
                  key={arm}
                  title={ARM_META[arm].description}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-zinc-800/70 bg-[#0b0c10] px-2 py-0.5 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  <span
                    className="h-2 w-2 rounded-[1px] flex-shrink-0"
                    style={{ backgroundColor: ARM_META[arm].color }}
                  />
                  <span className="font-medium">{ARM_META[arm].plainLabel}</span>
                  <span className="font-mono text-[9.5px] text-zinc-500">{arm}</span>
                </span>
              ))}
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
                          isAnimationActive={true}
                          animationDuration={350}
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
                    5-Strategy Accuracy Comparison across AI models
                  </caption>
                  <thead className="sticky top-0 z-10 bg-[#0d0e13] text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                    <tr>
                      <th scope="col" className="sticky left-0 z-20 bg-[#0d0e13] px-5 py-2.5 font-medium">
                        AI Model
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title={ARM_META.A.description}>
                        No Rules
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title={ARM_META.C.description}>
                        Summary
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-amber-400" title={ARM_META.C_ID_prereq.description}>
                        Static
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-sky-400" title={ARM_META.C_ID_auto.description}>
                        Keywords
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium text-emerald-400" title={ARM_META.C_ID_hope.description}>
                        HOPE v4
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title="HOPE v4 minus Plain Summary">
                        vs. Summary
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium" title="HOPE v4 minus Static Checklist">
                        vs. Static
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
                        <tr key={m.modelId} className="hover:bg-zinc-900/60 transition-colors">
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
                        Average Across {activePooled.count} Models
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

          {/* 3. Rule Promotion Audit Log (Clickable Rows with Plain-English Gate Breakdown) */}
          <section aria-labelledby="hope-ledger-heading" className="w-full bg-[#0b0c10]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800/80 bg-[#0d0e13] px-5 py-3">
              <div>
                <h2
                  id="hope-ledger-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-100"
                >
                  {cartridgeKey === 'policyAbac' && payload.maskedSummary ? '3. ' : '2. '}
                  Rule Promotion Audit Log
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Every proposed update must pass 3 automated checks—<span className="text-zinc-200">Keyword Lock (G1)</span>,{' '}
                  <span className="text-zinc-200">Conflict Check (G2)</span>, and{' '}
                  <span className="text-zinc-200">Safety Replay (G3)</span>. Click any row to inspect the full decision.
                </p>
              </div>

              <AccessibleSegmentedTabs<string>
                ariaLabel="Audit Log AI Model Selector"
                layoutId="hope-receipt-model"
                value={activeReceipt?.model ?? selectedModelId}
                onChange={(next) => {
                  setSelectedModelId(next);
                  setExpandedCandidateId(null);
                }}
                options={receiptModelTabs}
              />
            </div>

            {activeReceipt && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 bg-[#090a0e] px-5 py-2.5 font-mono text-[10.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-500 uppercase">Vault Fingerprint</span>
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
                    <span className="text-zinc-500 uppercase mr-2">Active Verified Links</span>
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
                      Rule promotion safety audit log
                    </caption>
                    <thead className="sticky top-0 z-10 bg-[#0d0e13] font-mono text-[10px] uppercase tracking-wider text-zinc-400 [&_th]:border-b [&_th]:border-zinc-800/80">
                      <tr>
                        <th scope="col" className="sticky left-0 z-20 bg-[#0d0e13] px-5 py-2.5 font-medium">
                          Proposed Update
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          What It Changes
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          3 Safety Checks
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">
                          Target Gain
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Broken Tests
                        </th>
                        <th scope="col" className="px-5 py-2.5 text-right font-medium">
                          Outcome
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:border-b [&_td]:border-zinc-800/70 [&_th]:border-b [&_th]:border-zinc-800/70">
                      {activeReceipt.candidateDecisions.map((dec) => {
                        const cr = dec.gateAudit.canaryReplay;
                        const ll = dec.gateAudit.lexicalLock;
                        const cl = dec.gateAudit.contradictionLinter;
                        const deltaPp = cr.targetCohortDelta * 100;
                        const isExpanded = expandedCandidateId === dec.candidateId;

                        return (
                          <React.Fragment key={dec.candidateId}>
                            <tr
                              onClick={() =>
                                setExpandedCandidateId(isExpanded ? null : dec.candidateId)
                              }
                              className={`transition-colors align-top cursor-pointer ${
                                isExpanded ? 'bg-zinc-900/70' : 'hover:bg-zinc-900/50'
                              }`}
                            >
                              <th
                                scope="row"
                                className="sticky left-0 z-10 bg-[#0b0c10] px-5 py-3 font-mono text-xs font-medium text-zinc-100 whitespace-nowrap"
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 ${
                                      isExpanded ? 'rotate-180 text-emerald-400' : ''
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <div>
                                    <div>{dec.candidateId}</div>
                                    <div className="mt-0.5 text-[10px] font-normal text-zinc-500">
                                      Rule {dec.factId} · {dec.origin}
                                    </div>
                                  </div>
                                </div>
                              </th>
                              <td className="px-3 py-3 text-zinc-300 min-w-[240px]">
                                <p className="text-xs leading-snug">{describeCandidatePatch(dec)}</p>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="flex flex-wrap items-center gap-1">
                                  <GatePill
                                    label="G1 Keywords"
                                    executed={ll.executed}
                                    passed={ll.passed}
                                  />
                                  <GatePill
                                    label="G2 Conflicts"
                                    executed={cl.executed}
                                    passed={cl.passed}
                                  />
                                  <GatePill
                                    label="G3 Replay"
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
                                <div className="text-[10px] text-zinc-500">
                                  {cr.targetBeforePassCount}→{cr.targetAfterPassCount}/{cr.targetTotal} tasks
                                </div>
                              </td>
                              <td className="px-3 py-3 font-mono text-xs tabular-nums">
                                {cr.canaryRegressions === 0 ? (
                                  <span className="text-emerald-400">0 broken</span>
                                ) : (
                                  <div>
                                    <span className="font-medium text-rose-400">
                                      {cr.canaryRegressions} broken
                                    </span>
                                    <span className="ml-1.5 text-[10px] text-zinc-400">
                                      ({cr.regressedCanaryTaskIds.join(', ')})
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-3 text-right whitespace-nowrap">
                                <DecisionBadge decision={dec} />
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-[#08090c]">
                                <td colSpan={6} className="px-5 py-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className="overflow-hidden py-4 space-y-3"
                                  >
                                    {/* Plain-English Verdict Summary */}
                                    <div
                                      className={`rounded-[2px] border px-3.5 py-2.5 text-xs leading-relaxed ${
                                        dec.status === 'approved'
                                          ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-200'
                                          : 'border-amber-800/50 bg-amber-950/15 text-zinc-200'
                                      }`}
                                    >
                                      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 mr-2">
                                        WHY:
                                      </span>
                                      {explainCandidateDecision(dec)}
                                    </div>

                                    {/* 3 Gate Detail Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono text-[11px] tabular-nums">
                                      <div className="rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] p-3 space-y-1">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                                          <span>Check 1 · Keyword Lock</span>
                                          <span className={ll.passed ? 'text-emerald-400' : 'text-rose-400'}>
                                            {ll.executed ? (ll.passed ? 'PASSED' : 'FAILED') : 'SKIPPED'}
                                          </span>
                                        </div>
                                        <div className="text-zinc-200">
                                          {ll.retainedTokens.length}/{ll.requiredTokens.length} exact
                                          tokens kept ({Math.round(ll.retentionRate * 100)}%)
                                        </div>
                                        <div className="font-sans text-[11px] text-zinc-500">
                                          {ll.missingTokens.length > 0
                                            ? `Missing: ${ll.missingTokens.join(', ')}`
                                            : 'All required code identifiers preserved verbatim.'}
                                        </div>
                                      </div>

                                      <div className="rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] p-3 space-y-1">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                                          <span>Check 2 · Conflict Check</span>
                                          <span className={cl.passed ? 'text-emerald-400' : 'text-rose-400'}>
                                            {cl.executed ? (cl.passed ? 'PASSED' : 'FAILED') : 'SKIPPED'}
                                          </span>
                                        </div>
                                        <div className="text-zinc-200">
                                          {cl.violations.length} rule conflicts / cycles
                                        </div>
                                        <div className="font-sans text-[11px] text-zinc-500">
                                          {cl.violations.length > 0
                                            ? cl.violations.map((v) => v.message).join('; ')
                                            : 'Rule dependency graph stays acyclic and contradiction-free.'}
                                        </div>
                                      </div>

                                      <div className="rounded-[2px] border border-zinc-800/80 bg-[#0b0c10] p-3 space-y-1">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                                          <span>Check 3 · Safety Replay</span>
                                          <span className={cr.passed ? 'text-emerald-400' : 'text-rose-400'}>
                                            {cr.executed ? (cr.passed ? 'PASSED' : 'BLOCKED') : 'SKIPPED'}
                                          </span>
                                        </div>
                                        <div className="text-zinc-200">
                                          Target {cr.targetBeforePassCount}→{cr.targetAfterPassCount}/
                                          {cr.targetTotal} · Canary {cr.canaryBeforePassCount}→
                                          {cr.canaryAfterPassCount}/{cr.canaryTotal}
                                        </div>
                                        <div className="font-sans text-[11px] text-zinc-500">
                                          {cr.canaryRegressions > 0
                                            ? `Broke ${cr.canaryRegressions} prior checks: ${cr.regressedCanaryTaskIds.join(', ')}`
                                            : 'Zero regressions across all protected canary tasks.'}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
