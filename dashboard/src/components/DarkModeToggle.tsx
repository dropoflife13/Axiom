'use client';

import { Sun, Moon, Monitor, Smartphone } from 'lucide-react';
import { useTheme } from './theme-provider';

const THEME_LABELS: Record<string, { label: string; icon: React.ComponentType<any> }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
  system: { label: 'System', icon: Monitor },
};

export function DarkModeToggle() {
  const { theme, toggleTheme, actualTheme } = useTheme();
  const Icon = THEME_LABELS[theme].icon;
  const currentIcon = actualTheme === 'dark' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch theme, currently ${actualTheme}`}
      title={`Theme: ${actualTheme.charAt(0).toUpperCase() + actualTheme.slice(1)}`}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
      <span className="sr-only">{THEME_LABELS[theme].label}</span>
    </button>
  );
}
