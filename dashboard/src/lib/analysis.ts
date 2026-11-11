/**
 * Pure deterministic analytics and normalization for the Deep Analysis research view (/analysis).
 * Supports both static /data/run-*.json snapshots and live .axiom-state checkpoints.
 */

export const CONDITION_ORDER = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;
export type AnalysisCondition = (typeof CONDITION_ORDER)[number];

/** Established Axiom palette for the 6 ablation conditions. */
export const CONDITION_COLORS: Record<AnalysisCondition, string> = {
  A: '#71717a',   // Gray (Zero-Shot Baseline)
  B: '#a855f7',   // Purple (Golden Oracle Ceiling)
  C: '#f97316',   // Orange (Reflexion Memory K=10)
  C0: '#22d3ee',  // Cyan (Verbatim Canonical Facts)
  D: '#ef4444',   // Red (Placebo Distractor)
  E_B: '#22c55e', // Green (Exhaustive Oracle Ceiling)
};

export const CONDITION_LABELS: Record<AnalysisCondition, string> = {
  A: 'Zero-Shot Baseline',
  B: 'Static Oracle Hints',
  C: 'Distilled Lessons (K=10)',
  C0: 'Verbatim Rules (K=10)',
  D: 'Placebo Distractor',
  E_B: 'Exhaustive Retry',
};

export interface ConditionStats {
  condition: AnalysisCondition;
  n: number;
  meanBoundFactFraction: number;
  strictBoundPassAt1: number;
  strictPassCount: number;
  strictBoundPassAt1Wilson95: [number, number];
  meanPromptTokens: number;
  meanTotalTokens: number;
}

export interface PairedContrast {
  key: 'C_vs_A' | 'C_vs_B' | 'C_vs_C0' | 'C_vs_D';
  label: string;
  n: number;
  meanDifference: number | null;
  signFlipPValue: number | null;
  holmPrimaryPValue: number | null;
  mcnemar: {
    n: number;
    b: number;
    c: number;
    pValue: number;
  } | null;
  holmSecondaryPValue: number | null;
}

export interface TaskProgressionPoint {
  taskId: string;
  ordinal: number;
  C: number | null;
  C0: number | null;
  delta: number | null;
  maC: number | null;
  maC0: number | null;
}

export interface NormalizedTrial {
  taskId: string;
  condition: string;
  boundFactFraction: number;
  boundPassed: boolean;
  totalTokens: number;
  failedFacts: string[];
}

export interface AnalysisRunData {
  id: string;
  runId: string;
  displayName: string;
  model: string;
  accent: string;
  commit: string;
  source: 'static' | 'live' | 'results';
  lastModified: string | null;
  totalTrials: number;
  completedTrials: number;
  passedTrials: number;
  passRate: string;
  conditions: Record<AnalysisCondition, ConditionStats>;
  pairedComparisons: Record<'C_vs_A' | 'C_vs_B' | 'C_vs_C0' | 'C_vs_D', PairedContrast>;
  failuresByFact: Record<string, Record<string, number>>;
  trials: NormalizedTrial[];
  taskSeries: TaskProgressionPoint[];
}

export interface HypothesisSummary {
  badge: 'H3 REPLICATED' | 'H3 NULL' | 'H3 DIRECTIONAL' | 'DISTILLED ADVANTAGE' | 'PENDING DATA';
  tone: 'cyan' | 'amber' | 'orange' | 'zinc';
  headline: string;
  context: string;
  bullets: string[];
  topDivergences: { factId: string; cFails: number; c0Fails: number; gap: number }[];
}

/** Exact Wilson score 95% confidence interval for binomial proportions. */
export function wilson95(successes: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function binomialLowerTail(k: number, n: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    let logComb = 0;
    for (let j = 1; j <= i; j++) {
      logComb += Math.log(n - j + 1) - Math.log(j);
    }
    sum += Math.exp(logComb - n * Math.log(2));
  }
  return Math.min(1, sum);
}

/** Exact two-sided McNemar test on paired boolean outcomes. */
export function mcnemarExact(reference: boolean[], target: boolean[]): { n: number; b: number; c: number; pValue: number } {
  let b = 0;
  let c = 0;
  const n = Math.min(reference.length, target.length);
  for (let i = 0; i < n; i++) {
    if (reference[i] && !target[i]) b++;
    if (!reference[i] && target[i]) c++;
  }
  const discordant = b + c;
  return {
    n,
    b,
    c,
    pValue: discordant === 0 ? 1 : Math.min(1, 2 * binomialLowerTail(Math.min(b, c), discordant)),
  };
}

/** Deterministic paired sign-flip p-value fallback for live partial checkpoints. */
export function pairedSignFlipPValue(diffs: number[], iterations = 2000): number {
  if (diffs.length === 0 || diffs.every((d) => d === 0)) return 1;
  const n = diffs.length;
  const observedAbs = Math.abs(diffs.reduce((s, d) => s + d, 0) / n);
  let state = 0x517cc1b7;
  const nextBit = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 1) === 0 ? -1 : 1;
  };
  let extreme = 0;
  for (let r = 0; r < iterations; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += nextBit() * diffs[i];
    if (Math.abs(sum / n) + 1e-12 >= observedAbs) extreme++;
  }
  return Math.min(1, (extreme + 1) / (iterations + 1));
}

function parseTaskOrdinal(taskId: string, fallbackIndex: number): number {
  const m = /(\d+)$/.exec(taskId);
  return m ? Number(m[1]) : fallbackIndex + 10000;
}

export function buildTaskSeries(trials: NormalizedTrial[], windowSize = 10): TaskProgressionPoint[] {
  const map = new Map<string, { C?: number; C0?: number; orderHint: number }>();
  trials.forEach((t, idx) => {
    if (t.condition !== 'C' && t.condition !== 'C0') return;
    const entry = map.get(t.taskId) ?? { orderHint: idx };
    if (t.condition === 'C') entry.C = t.boundFactFraction;
    if (t.condition === 'C0') entry.C0 = t.boundFactFraction;
    map.set(t.taskId, entry);
  });

  const sorted = [...map.entries()].sort((a, b) => {
    const oa = parseTaskOrdinal(a[0], a[1].orderHint);
    const ob = parseTaskOrdinal(b[0], b[1].orderHint);
    return oa - ob || a[0].localeCompare(b[0], undefined, { numeric: true });
  });

  const cBuf: number[] = [];
  const c0Buf: number[] = [];

  return sorted.map(([taskId, v], idx) => {
    const C = v.C ?? null;
    const C0 = v.C0 ?? null;
    if (C !== null) {
      cBuf.push(C);
      if (cBuf.length > windowSize) cBuf.shift();
    }
    if (C0 !== null) {
      c0Buf.push(C0);
      if (c0Buf.length > windowSize) c0Buf.shift();
    }
    return {
      taskId,
      ordinal: parseTaskOrdinal(taskId, idx),
      C: C !== null ? Number(C.toFixed(4)) : null,
      C0: C0 !== null ? Number(C0.toFixed(4)) : null,
      delta: C !== null && C0 !== null ? Number((C0 - C).toFixed(4)) : null,
      maC: cBuf.length > 0 ? Number((cBuf.reduce((s, x) => s + x, 0) / cBuf.length).toFixed(4)) : null,
      maC0: c0Buf.length > 0 ? Number((c0Buf.reduce((s, x) => s + x, 0) / c0Buf.length).toFixed(4)) : null,
    };
  });
}

/** Normalizes either a /data/run-*.json snapshot or a live results/checkpoint JSON. */
export function normalizeAnalysisRun(
  raw: Record<string, unknown>,
  meta: {
    id: string;
    displayName: string;
    accent: string;
    model?: string;
    source?: 'static' | 'live' | 'results';
    totalTrialsHint?: number;
  },
): AnalysisRunData {
  const rawTrials = (Array.isArray(raw.trials) ? raw.trials : []) as Array<Record<string, unknown>>;
  const trials: NormalizedTrial[] = rawTrials.map((t) => ({
    taskId: String(t.taskId ?? t.task ?? ''),
    condition: String(t.condition ?? ''),
    boundFactFraction: Number(t.boundFactFraction ?? t.boundFraction ?? 0),
    boundPassed: Boolean(t.boundPassed ?? t.status === 'pass'),
    totalTokens: Number(t.totalTokens ?? t.tokens ?? 0),
    failedFacts: Array.isArray(t.failedFacts) ? t.failedFacts.map(String) : [],
  }));

  const rawConds =
    raw.conditions && typeof raw.conditions === 'object' && !Array.isArray(raw.conditions)
      ? (raw.conditions as Record<string, Record<string, unknown>>)
      : null;

  const failuresByFact: Record<string, Record<string, number>> = {};
  if (raw.failuresByFact && typeof raw.failuresByFact === 'object') {
    for (const [c, fMap] of Object.entries(raw.failuresByFact as Record<string, Record<string, number>>)) {
      failuresByFact[c] = { ...fMap };
    }
  }

  const conditions = {} as Record<AnalysisCondition, ConditionStats>;
  for (const cond of CONDITION_ORDER) {
    const subset = trials.filter((t) => t.condition === cond);
    const snap = rawConds?.[cond];
    if (!failuresByFact[cond]) {
      const fCounts: Record<string, number> = {};
      for (const tr of subset) {
        for (const f of tr.failedFacts) fCounts[f] = (fCounts[f] ?? 0) + 1;
      }
      failuresByFact[cond] = fCounts;
    }

    const n = typeof snap?.n === 'number' && snap.n > 0 ? snap.n : subset.length;
    const passCount = subset.length > 0
      ? subset.filter((t) => t.boundPassed).length
      : typeof snap?.strictBoundPassAt1 === 'number'
      ? Math.round(snap.strictBoundPassAt1 * n)
      : 0;
    const meanBound =
      typeof snap?.meanBoundFactFraction === 'number' && n > 0
        ? snap.meanBoundFactFraction
        : subset.length > 0
        ? subset.reduce((s, t) => s + t.boundFactFraction, 0) / subset.length
        : 0;
    const strictPass =
      typeof snap?.strictBoundPassAt1 === 'number' && n > 0
        ? snap.strictBoundPassAt1
        : n > 0
        ? passCount / n
        : 0;
    const w95: [number, number] =
      Array.isArray(snap?.strictBoundPassAt1Wilson95) && snap.strictBoundPassAt1Wilson95.length === 2
        ? [Number(snap.strictBoundPassAt1Wilson95[0]), Number(snap.strictBoundPassAt1Wilson95[1])]
        : wilson95(passCount, n);
    const meanTotalTokens =
      typeof snap?.meanTotalTokens === 'number'
        ? snap.meanTotalTokens
        : subset.length > 0
        ? subset.reduce((s, t) => s + t.totalTokens, 0) / subset.length
        : 0;
    const meanPromptTokens =
      typeof snap?.meanPromptTokens === 'number' ? snap.meanPromptTokens : 0;

    conditions[cond] = {
      condition: cond,
      n,
      meanBoundFactFraction: meanBound,
      strictBoundPassAt1: strictPass,
      strictPassCount: passCount,
      strictBoundPassAt1Wilson95: w95,
      meanPromptTokens,
      meanTotalTokens,
    };
  }

  const rawPaired =
    raw.pairedComparisons && typeof raw.pairedComparisons === 'object'
      ? (raw.pairedComparisons as Record<string, Record<string, unknown>>)
      : null;

  const contrasts = [
    ['C_vs_A', 'A', 'C vs A (Baseline)'],
    ['C_vs_B', 'B', 'C vs B (Oracle Ceiling)'],
    ['C_vs_C0', 'C0', 'C vs C0 (Verbatim)'],
    ['C_vs_D', 'D', 'C vs D (Placebo)'],
  ] as const;

  const pairedComparisons = {} as Record<'C_vs_A' | 'C_vs_B' | 'C_vs_C0' | 'C_vs_D', PairedContrast>;
  for (const [key, baseline, label] of contrasts) {
    const existing = rawPaired?.[key];
    const primary = (existing?.primary ?? null) as Record<string, unknown> | null;
    const secondary = (existing?.secondary ?? null) as Record<string, unknown> | null;

    if (existing && typeof existing.n === 'number' && existing.n > 0 && secondary) {
      pairedComparisons[key] = {
        key,
        label,
        n: existing.n,
        meanDifference: typeof primary?.meanDifference === 'number' ? primary.meanDifference : null,
        signFlipPValue: typeof primary?.signFlipPValue === 'number' ? primary.signFlipPValue : null,
        holmPrimaryPValue: typeof existing.holmPrimaryPValue === 'number' ? existing.holmPrimaryPValue : null,
        mcnemar: {
          n: typeof secondary.n === 'number' ? secondary.n : existing.n,
          b: Number(secondary.b ?? 0),
          c: Number(secondary.c ?? 0),
          pValue: Number(secondary.pValue ?? 1),
        },
        holmSecondaryPValue: typeof existing.holmSecondaryPValue === 'number' ? existing.holmSecondaryPValue : null,
      };
    } else {
      const baseMap = new Map(trials.filter((t) => t.condition === baseline).map((t) => [t.taskId, t]));
      const cMap = new Map(trials.filter((t) => t.condition === 'C').map((t) => [t.taskId, t]));
      const ids = [...baseMap.keys()].filter((id) => cMap.has(id)).sort();
      if (ids.length > 0) {
        const diffs = ids.map((id) => cMap.get(id)!.boundFactFraction - baseMap.get(id)!.boundFactFraction);
        const meanDiff = diffs.reduce((s, d) => s + d, 0) / ids.length;
        const mc = mcnemarExact(
          ids.map((id) => baseMap.get(id)!.boundPassed),
          ids.map((id) => cMap.get(id)!.boundPassed),
        );
        pairedComparisons[key] = {
          key,
          label,
          n: ids.length,
          meanDifference: meanDiff,
          signFlipPValue: pairedSignFlipPValue(diffs),
          holmPrimaryPValue: null,
          mcnemar: mc,
          holmSecondaryPValue: null,
        };
      } else {
        pairedComparisons[key] = {
          key,
          label,
          n: 0,
          meanDifference: null,
          signFlipPValue: null,
          holmPrimaryPValue: null,
          mcnemar: null,
          holmSecondaryPValue: null,
        };
      }
    }
  }

  const completedTrials = trials.length > 0
    ? trials.length
    : CONDITION_ORDER.reduce((s, c) => s + conditions[c].n, 0);
  const taskSet = new Set(trials.map((t) => t.taskId).filter(Boolean));
  let inferredTotal =
    typeof raw.totalTrials === 'number' && raw.totalTrials > 0
      ? raw.totalTrials
      : meta.totalTrialsHint ??
        (typeof raw.testTasks === 'number' && raw.testTasks > 0
          ? raw.testTasks * 6
          : meta.id.toLowerCase().includes('mini')
          ? Math.max(48, taskSet.size * 6)
          : Math.max(720, completedTrials));
  if (completedTrials > inferredTotal || (!meta.id.toLowerCase().includes('mini') && (completedTrials > 240 || meta.id.toLowerCase().includes('expanded')))) {
    inferredTotal = Math.max(720, Math.ceil(completedTrials / 6) * 6);
  }

  const passedTrials =
    typeof raw.passedTrials === 'number'
      ? raw.passedTrials
      : trials.filter((t) => t.boundPassed).length;
  const passRate =
    typeof raw.passRate === 'string'
      ? raw.passRate
      : completedTrials > 0
      ? `${((passedTrials / completedTrials) * 100).toFixed(1)}%`
      : '0.0%';

  const md = (raw.metadata ?? {}) as Record<string, unknown>;
  const commitRaw = raw.commit ?? raw.gitCommit ?? md.gitCommit ?? 'unknown';

  return {
    id: meta.id,
    runId: String(raw.runId ?? raw.id ?? meta.id),
    displayName: meta.displayName,
    model: String(raw.model ?? raw.requestedModel ?? md.requestedModel ?? meta.model ?? meta.id),
    accent: meta.accent,
    commit: String(commitRaw).slice(0, 7),
    source: meta.source ?? 'static',
    lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    totalTrials: inferredTotal,
    completedTrials,
    passedTrials,
    passRate,
    conditions,
    pairedComparisons,
    failuresByFact,
    trials,
    taskSeries: buildTaskSeries(trials),
  };
}

export function formatPValue(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—';
  if (p < 0.0001) return p.toExponential(2);
  return p.toFixed(4);
}

/** Deterministically generates the Top-Left Hypothesis & Context breakdown from observed metrics. */
export function buildHypothesisSummary(
  run: AnalysisRunData,
  factStatements?: Record<string, string>,
): HypothesisSummary {
  const c0 = run.conditions.C0;
  const c = run.conditions.C;
  const a = run.conditions.A;
  const b = run.conditions.B;
  const compC0 = run.pairedComparisons.C_vs_C0;

  if (c0.n === 0 || c.n === 0) {
    return {
      badge: 'PENDING DATA',
      tone: 'zinc',
      headline: `Awaiting paired C & C0 trials (${run.completedTrials}/${run.totalTrials} complete).`,
      context:
        'Both Condition C (distilled reflexion lessons) and Condition C0 (verbatim oracle clauses) must record completed tasks before H3 effect size can be evaluated.',
      bullets: [
        `Completed trials so far: ${run.completedTrials} / ${run.totalTrials}.`,
      ],
      topDivergences: [],
    };
  }

  const diffC0MinusC = c0.meanBoundFactFraction - c.meanBoundFactFraction;
  const diffPts = `${diffC0MinusC >= 0 ? '+' : '−'}${Math.abs(diffC0MinusC * 100).toFixed(1)}%`;
  const c0Pct = `${(c0.meanBoundFactFraction * 100).toFixed(1)}%`;
  const cPct = `${(c.meanBoundFactFraction * 100).toFixed(1)}%`;
  const aPct = `${(a.meanBoundFactFraction * 100).toFixed(1)}%`;
  const bPct = `${(b.meanBoundFactFraction * 100).toFixed(1)}%`;

  const pPrim = compC0.holmPrimaryPValue ?? compC0.signFlipPValue;
  const pMc = compC0.mcnemar?.pValue ?? null;

  // Inspect which individual facts Condition C missed more often than C0
  const fC = run.failuresByFact.C ?? {};
  const fC0 = run.failuresByFact.C0 ?? {};
  const allFactIds = new Set([...Object.keys(fC), ...Object.keys(fC0)]);
  const topDivergences = [...allFactIds]
    .map((factId) => ({
      factId,
      cFails: fC[factId] ?? 0,
      c0Fails: fC0[factId] ?? 0,
      gap: (fC[factId] ?? 0) - (fC0[factId] ?? 0),
    }))
    .filter((d) => d.gap > 0)
    .sort((x, y) => y.gap - x.gap || x.factId.localeCompare(y.factId))
    .slice(0, 4);

  const reverseDivergences = [...allFactIds]
    .map((factId) => ({
      factId,
      cFails: fC[factId] ?? 0,
      c0Fails: fC0[factId] ?? 0,
      gap: (fC0[factId] ?? 0) - (fC[factId] ?? 0),
    }))
    .filter((d) => d.gap > 0)
    .sort((x, y) => y.gap - x.gap || x.factId.localeCompare(y.factId))
    .slice(0, 3);

  const liftCvsA = (c.meanBoundFactFraction - a.meanBoundFactFraction) * 100;
  const liftC0vsA = (c0.meanBoundFactFraction - a.meanBoundFactFraction) * 100;
  const tokC0 = Math.round(c0.meanTotalTokens);
  const tokC = Math.round(c.meanTotalTokens);
  const tokDelta = tokC0 - tokC;
  const progressNote = run.completedTrials < run.totalTrials ? ` (interim at ${run.completedTrials}/${run.totalTrials} trials)` : '';

  const pText = pPrim !== null ? `sign-flip p = ${formatPValue(pPrim)}` : pMc !== null ? `McNemar p = ${formatPValue(pMc)}` : '';

  let badge: HypothesisSummary['badge'];
  let tone: HypothesisSummary['tone'];
  let headline: string;
  let context: string;

  if (diffC0MinusC >= 0.05 && (pPrim === null || pPrim < 0.05)) {
    badge = 'H3 REPLICATED';
    tone = 'cyan';
    headline = `H3 Replicated: Verbatim rules (C0) beat distilled lessons (C) by ${diffPts}${progressNote}.`;
    context = `On ${run.displayName} (${run.model}), C0 achieved ${c0Pct} mean bound-fact compliance vs ${cPct} for C (${pText}${pMc !== null ? `, McNemar p = ${formatPValue(pMc)}` : ''}). Advisor paraphrasing/placeholder abstraction degraded exact SQL constraint adherence compared to raw Oracle contract text.`;
  } else if (diffC0MinusC >= 0.05) {
    badge = 'H3 DIRECTIONAL';
    tone = 'cyan';
    headline = `H3 Directional: Verbatim rules (C0) led distilled lessons (C) by ${diffPts}${progressNote}.`;
    context = `C0 scored ${c0Pct} vs ${cPct} on C (${pText}), showing a directional verbatim advantage on ${run.displayName} without crossing p < 0.05 at n = ${compC0.n} paired tasks.`;
  } else if (diffC0MinusC <= -0.05) {
    badge = 'DISTILLED ADVANTAGE';
    tone = 'orange';
    headline = `Distilled lessons (C) beat verbatim rules (C0) by +${Math.abs(diffC0MinusC * 100).toFixed(1)}%${progressNote}.`;
    context = `On ${run.displayName}, Condition C (${cPct}) outperformed verbatim C0 (${c0Pct}) (${pText}), indicating distilled guidance was easier for this model to apply than raw rule clauses.`;
  } else {
    badge = 'H3 NULL';
    tone = 'amber';
    headline = `H3 Null: Effect was statistically insignificant (${diffPts} C0−C; ${pText || 'p > 0.05'})${progressNote}.`;
    context = `On ${run.displayName} (${run.model}), distilled lessons C (${cPct}) matched verbatim C0 (${c0Pct}) within noise (${pText}${pMc !== null ? `, McNemar p = ${formatPValue(pMc)}` : ''}), showing this model resolves abstracted rule placeholders nearly as reliably as verbatim literals.`;
  }

  const bullets: string[] = [
    `Baseline lift vs A (${aPct}): C0 gained ${liftC0vsA >= 0 ? '+' : ''}${liftC0vsA.toFixed(1)} pts · C gained ${liftCvsA >= 0 ? '+' : ''}${liftCvsA.toFixed(1)} pts · Oracle Ceiling B = ${bPct}.`,
    `Strict Pass@1: C0 passed ${(c0.strictBoundPassAt1 * 100).toFixed(1)}% (${c0.strictPassCount}/${c0.n}) vs C ${(c.strictBoundPassAt1 * 100).toFixed(1)}% (${c.strictPassCount}/${c.n}) at ${tokC0.toLocaleString()} vs ${tokC.toLocaleString()} tok/task (${tokDelta >= 0 ? `+${tokDelta}` : tokDelta} tok C0−C).`,
  ];

  if (topDivergences.length > 0) {
    const desc = topDivergences
      .map((d) => {
        const stmt = factStatements?.[d.factId];
        const shortStmt = stmt ? ` ("${stmt.length > 52 ? `${stmt.slice(0, 49)}…` : stmt}")` : '';
        return `${d.factId} [+${d.gap}: C ${d.cFails} vs C0 ${d.c0Fails}${shortStmt}]`;
      })
      .join(' · ');
    bullets.push(`Rules C missed more than C0: ${desc}`);
  } else if (reverseDivergences.length > 0) {
    const desc = reverseDivergences
      .map((d) => `${d.factId} [C0 ${d.c0Fails} vs C ${d.cFails}]`)
      .join(' · ');
    bullets.push(`Rules C0 missed more than C: ${desc}`);
  }

  return {
    badge,
    tone,
    headline,
    context,
    bullets,
    topDivergences,
  };
}
