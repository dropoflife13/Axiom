import type { Metadata } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/ToastContainer';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Axiom Mission Control',
  description: 'Axiom verification telemetry and ablation evidence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased selection:bg-[var(--color-primary)] selection:text-[var(--color-bg)]">
        {/* No-flash theme script: sets data-theme before first paint (UX-01) */}
        <Script id="axiom-theme-init" strategy="beforeInteractive">
          {`
            (function(){
              var STORAGE_KEY = 'axiom-dashboard-theme';
              var html = document.documentElement;
              var saved = null;
              try { saved = localStorage.getItem(STORAGE_KEY); } catch(e) {}
              if (saved !== 'light' && saved !== 'dark' && saved !== 'system') saved = null;
              var theme = saved || 'dark';
              html.setAttribute('data-theme', theme === 'system' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
            })();
          `}
        </Script>
        <main>{children}</main>
        <ToastContainer />
      </body>
    </html>
  );
}
