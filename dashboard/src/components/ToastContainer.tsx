'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ToastKind = 'info' | 'error';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ kind: ToastKind; message: string }>;
      const { kind, message } = custom.detail;
      const id = crypto.randomUUID();
      setToasts((prev) => {
        const next = [...prev, { id, kind, message }];
        return next.slice(-3); // max 3 stacked (UX-08)
      });
    };
    window.addEventListener('axiom-toast', handler as EventListener);
    return () => window.removeEventListener('axiom-toast', handler as EventListener);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    toasts.forEach((t: ToastItem) => {
      if (t.kind === 'info' && !clearTimerRefs.current.get(t.id)) {
        const timer = setTimeout(() => dismiss(t.id), 5000); // auto-dismiss >= 5s (UX-08)
        clearTimerRefs.current.set(t.id, timer);
      }
    });
    return () => {
      clearTimerRefs.current.forEach((timer) => clearTimeout(timer));
      clearTimerRefs.current.clear();
    };
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-[360px] items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-toast-bg)] p-4 shadow-lg transition-opacity duration-300"
          role={t.kind === 'error' ? 'alert' : 'status'}
          aria-live="assertive"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
            {t.kind === 'error' ? (
              <span className="text-[var(--color-danger)]">!</span>
            ) : (
              <span className="text-[var(--color-primary)]">ℹ</span>
            )}
          </div>
          <div>
            <p className={`text-sm font-medium ${t.kind === 'error' ? 'text-[var(--color-toast-error-text)]' : 'text-[var(--color-toast-info-text)]'}`}>
              {t.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="ml-auto shrink-0 rounded-sm p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
            aria-hidden="true"
          >
            <span className="sr-only">Dismiss notification</span>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
