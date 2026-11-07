'use client';

import { Clipboard } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface CopyLogsButtonProps {
  logs: string;
  disabled?: boolean;
}

export function CopyLogsButton({ logs, disabled }: CopyLogsButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    if (disabled || !logs) return;
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
      // Dispatch a custom event so the toast layer can show feedback
      window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'success', message: 'Logs copied to clipboard' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('axiom-toast', { detail: { kind: 'error', message: 'Failed to copy logs' } }));
    }
  }, [logs, disabled]);

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled || !logs}
      aria-label={copied ? 'Copied!' : 'Copy logs to clipboard'}
      title={copied ? 'Logs copied to clipboard' : 'Copy experiment logs to clipboard'}
      className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${copied ? 'ring-2 ring-[var(--color-success)]' : ''}`}
    >
      <Clipboard className="w-4 h-4" aria-hidden="true" />
      <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
    </button>
  );
}
