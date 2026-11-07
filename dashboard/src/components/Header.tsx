'use client';

import { Activity, LayoutDashboard } from 'lucide-react';

export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="flex items-center gap-3">
          <div className="brand-mark">
            <Activity className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="brand-name">AXIOM</p>
            <p className="brand-context">Verifier / ablation v2</p>
          </div>
        </div>
        <div className="app-header__status">
          <span className="live-dot" aria-hidden="true" />
          <span>Read-only telemetry</span>
          <a href="/" className="header-home" aria-label="Dashboard home">
            <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
            <span className="sr-only">Home</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export function StatusPill({ label, status }: { label: string; status: 'ok' | 'warn' | 'error' | 'idle' }) {
  const variants: Record<string, { dot: string; text: string }> = {
    ok: { dot: 'bg-[var(--color-success)]', text: 'text-[var(--color-success)]' },
    warn: { dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
    error: { dot: 'bg-[var(--color-danger)]', text: 'text-[var(--color-danger)]' },
    idle: { dot: 'bg-[var(--color-text-dim)]', text: 'text-[var(--color-text-dim)]' },
  };
  const v = variants[status];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden="true" />
      <span className={v.text}>{label}</span>
    </span>
  );
}
