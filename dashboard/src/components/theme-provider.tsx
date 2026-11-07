'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'axiom-dashboard-theme';

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveActualTheme(stored: Theme | null): 'light' | 'dark' {
  if (stored === 'system') return resolveSystemTheme();
  return stored ?? 'dark';
}

export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(null);
  const [mounted, setMounted] = useState(false);

  const setTheme = useCallback((next: Theme | ((prev: Theme | null) => Theme)) => {
    setStored((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, value);
        } catch {
          // ignore storage errors
        }
      }
      const html = document.documentElement;
      html.removeAttribute('data-theme');
      if (value !== 'system' || value === 'system') {
        html.setAttribute('data-theme', resolveActualTheme(value));
      }
      return value;
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    let saved: Theme | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === 'light' || raw === 'dark' || raw === 'system') saved = raw as Theme;
      } catch {
        // ignore
      }
    }
    setStored(saved);
    const html = document.documentElement;
    html.setAttribute('data-theme', resolveActualTheme(saved));
  }, []);

  const toggleTheme = useCallback(() => {
    setStored((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
      }
      const html = document.documentElement;
      html.setAttribute('data-theme', resolveActualTheme(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (stored === 'system' || stored === null) {
        const html = document.documentElement;
        html.setAttribute('data-theme', resolveActualTheme(stored));
      }
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [stored, mounted]);

  return { theme: stored ?? 'dark', actualTheme: resolveActualTheme(stored), setTheme, toggleTheme, mounted };
}
