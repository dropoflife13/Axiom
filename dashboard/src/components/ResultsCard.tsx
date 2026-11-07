'use client';

import { Cpu, FileText, FileCheck } from 'lucide-react';

interface ResultSummaryProps {
  results: any;
  error?: string | null;
  loaded: boolean;
}

export function ResultsCard({ results, error, loaded }: ResultSummaryProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-[var(--color-danger)] shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Unable to load results</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="h-8 w-32 skeleton" />
      </div>
    );
  }

  const comparisons = results?.analysis?.comparisons ?? {};
  const holmSecondary = results?.analysis?.holmSecondaryPValues ?? {};
  const keys = ['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D'];

  if (keys.every((k) => !comparisons[k])) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">McNemar Results</h3>
            <p className="text-sm text-[var(--color-text-muted)]">No paired comparisons available yet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">McNemar Results</h2>
        <p className="text-xs text-[var(--color-text-muted)]">Final paired-comparison p-values (secondary / McNemar)</p>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {keys.map((key) => {
          const comp = comparisons[key];
          const secondary = comp?.secondary;
          const pValue = secondary?.pValue ?? holmSecondary[key];
          const label = key.replace(/_/g, ' vs ');
          const significant = typeof pValue === 'number' && pValue < 0.05;
          return (
            <div key={key} className="px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
                <p className="text-sm text-[var(--color-text)]">b={secondary?.b ?? '—'}, c={secondary?.c ?? '—'}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-mono font-medium ${significant ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}`}>
                  p = {typeof pValue === 'number' ? pValue.toFixed(4) : '—'}
                </span>
                {significant && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-danger)] px-2 py-0.5 text-[var(--color-danger)] text-[10px] font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" aria-hidden="true" />
                    Significant
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-3 text-xs text-[var(--color-text-muted)]">
        Holm-corrected family: C_vs_A, C_vs_B, C_vs_C0, C_vs_D. Significance threshold p &lt; 0.05.
      </div>
    </section>
  );
}

export function ConditionSummary({ condition, n, passRate, tokenMean }: { condition: string; n: number; passRate: number; tokenMean: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-mono font-semibold text-[var(--color-text)]">{condition}</span>
        <span className="text-xs text-[var(--color-text-muted)]">n={n}</span>
      </div>
      <div className="mt-2 text-xs text-[var(--color-text-muted)]">
        Pass rate: <span className="text-[var(--color-text)]">{Math.round(passRate * 100)}%</span>
      </div>
      <div className="text-xs text-[var(--color-text-muted)]">
        Mean tokens: <span className="text-[var(--color-text)]">{tokenMean}</span>
      </div>
    </div>
  );
}
