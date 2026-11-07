'use client';

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default',
  className = '',
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  className?: string;
  ariaLabel?: string;
}) {
  const base =
    'inline-flex items-center justify-center rounded-[var(--radius-sm)] border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2';
  const variants: Record<string, string> = {
    default: `border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] focus-visible:outline-[var(--color-border-focus)]`,
    primary: `border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)] focus-visible:outline-[var(--color-primary-hover)]`,
    danger: `border-[var(--color-danger)] bg-[var(--color-danger)] text-[var(--color-bg)] hover:bg-[var(--color-danger)]/90 focus-visible:outline-[var(--color-danger)]`,
    ghost: `border-transparent bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] focus-visible:outline-[var(--color-border-focus)]`,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
