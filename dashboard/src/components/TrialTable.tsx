'use client';

import { ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react';

type Trial = {
  condition: string;
  taskId: string;
  boundPassed: boolean;
  boundFactFraction: number;
  generationStatus?: string;
};

interface TrialTableProps {
  trials: Trial[];
  error?: string | null;
}

export function TrialTable({ trials, error }: TrialTableProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--color-danger)] shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Unable to load trial data</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const lastTen = trials.slice().reverse().slice(0, 10);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent Trials</h2>
        <span className="text-xs font-mono text-[var(--color-text-muted)]">Last 10 completed</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th scope="col" className="h-10 px-4 text-left text-[var(--color-text-muted)] text-xs font-medium uppercase tracking-wider">
                Task ID
              </th>
              <th scope="col" className="h-10 px-4 text-left text-[var(--color-text-muted)] text-xs font-medium uppercase tracking-wider">
                Condition
              </th>
              <th scope="col" className="h-10 px-4 text-left text-[var(--color-text-muted)] text-xs font-medium uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="h-10 px-4 text-left text-[var(--color-text-muted)] text-xs font-medium uppercase tracking-wider">
                Bound Fact Fraction
              </th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {lastTen.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                  No trials available yet.
                </td>
              </tr>
            ) : (
              lastTen.map((trial, idx) => {
                const passed = trial.boundPassed;
                const fractionPct = Math.round(trial.boundFactFraction * 100);
                return (
                  <tr
                    key={idx}
                    className={`group table-row-interactive border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-elevated)] transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-[var(--color-text)]">{trial.taskId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-dim)] text-xs font-medium">
                        {trial.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {passed ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-[var(--color-success)]" aria-hidden="true" />
                            <span className="text-[var(--color-success)] font-medium">Pass</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--color-danger)]" aria-hidden="true" />
                            <span className="text-[var(--color-danger)] font-medium">Fail</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-[var(--color-text)]">{fractionPct}%</span>
                        <span className="text-[var(--color-text-muted)]">of facts bound</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {lastTen.length > 0 && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-3 text-xs text-[var(--color-text-muted)]">
          Pass/Fail reflects whether all bound facts passed verification. Fraction is the share of bound facts passed.
        </div>
      )}
    </section>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex items-center justify-center mb-4 text-[var(--color-text-muted)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mt-2 text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}
