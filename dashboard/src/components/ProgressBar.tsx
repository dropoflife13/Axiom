'use client';

export function ProgressBar({ value, max, label, subLabel }: { value: number; max: number; label: string; subLabel?: string }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const overclocked = percent >= 90;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        <span className={`text-sm font-mono text-[var(--color-text-muted)] ${overclocked ? 'text-[var(--color-overclocked)] font-bold' : ''}`}>
          {value} / {max}
        </span>
      </div>
      <div className="progress-container" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}: ${percent} percent`}>
        <div className={`progress-bar ${overclocked ? 'overclocked' : ''}`} style={{ width: `${percent}%` }} />
      </div>
      {subLabel && (
        <p className="text-xs text-[var(--color-text-muted)]">{subLabel}</p>
      )}
    </section>
  );
}
