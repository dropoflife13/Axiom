'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { sceneForProgress } from '@/lib/scroll-scene';

const LoopingDonut = dynamic(() => import('./LoopingDonut'), { ssr: false });

const STAGES: [string, number][] = [
  ['GENERATE', 0xa855f7], ['VERIFY', 0x22d3ee], ['FAIL', 0xf43f5e],
  ['ADVISE', 0xfbbf24], ['RETRY', 0xa855f7], ['PASS', 0x34d399],
];
const CONDITIONS = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
const TOTAL = 720;
const PER = TOTAL / CONDITIONS.length;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export type LiveRun = {
  done: number;
  counts: number[];
  stage: number;
  running?: boolean;
  label?: string;
};

interface HealingLoopHeroProps {
  live: LiveRun;
  onCopyLogs?: () => void;
}

export default function HealingLoopHero({ live, onCopyLogs }: HealingLoopHeroProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const stage = Math.max(0, Math.min(STAGES.length - 1, live.stage));
  const counts = CONDITIONS.map((_, i) => live.counts[i] ?? 0);
  const color = hex(STAGES[stage][1]);
  const running = live.running ?? true;

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!track || !sticky) return;

    let frame: number | null = null;
    const update = () => {
      frame = null;
      const maxScroll = Math.max(1, track.offsetHeight - window.innerHeight);
      progress.current = reducedMotion
        ? 0
        : Math.max(0, Math.min(1, (window.scrollY - track.offsetTop) / maxScroll));
      const scene = sceneForProgress(progress.current);
      sticky.style.setProperty('--hud', String(scene.hud));
      sticky.style.setProperty('--canvas', String(scene.canvas));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <section ref={trackRef} className="hl-track" aria-label="Axiom healing loop">
      <style>{css}</style>
      <div ref={stickyRef} className="hl-sticky">
        <div className="hl">
          <div className="hl-grid" />
          <div className="hl-canvas">
            <LoopingDonut color={STAGES[stage][1]} running={running && !reducedMotion} progress={progress} />
          </div>
          <div className="hl-hud">
        <header>
          <div className="hl-brand"><b>AXIOM</b><span>Verifier / ablation v2</span></div>
          <div className="hl-m">
            <div>ORACLE<b>locked</b></div><div>TEMP<b>0</b></div>
            <div>CONDITIONS<b>06</b></div><div>MODE<b>SQL</b></div><div>STAGE<b style={{ color }}>{STAGES[stage][0]}</b></div>
          </div>
          <div className="hl-chip">{live.label ?? 'LIVE'}</div>
        </header>
        <div className="hl-hero">
          <p className="hl-k">● HEALING LOOP</p>
          <h1>Architecture<br />under pressure.</h1>
          <p className="hl-s">Generate, verify, fail, advise, retry. Axiom tests generated migrations against the rules they claim to satisfy.</p>
        </div>
        <aside className="hl-conds">
          {CONDITIONS.map((c, i) => (
            <div className="hl-row" key={c}>
              <span>{c}</span>
              <div className="hl-bar"><i style={{ width: `${Math.min(100, (counts[i] / PER) * 100)}%` }} /></div>
              <span>{counts[i]}/{PER}</span>
            </div>
          ))}
        </aside>
        <div className="hl-run">
          <p className="hl-k">RUN COMPLETION</p>
          <div className="hl-big"><b>{live.done}</b><span> / {TOTAL}</span></div>
          <p className="hl-dim">{TOTAL - live.done} trials remain in the field</p>
          {onCopyLogs && <button onClick={onCopyLogs}>COPY LOGS</button>}
        </div>
        <footer>
          <div className="hl-stages">
            {STAGES.map(([name, c], i) => (
              <span key={name} style={i === stage ? { color: hex(c), borderColor: hex(c) } : undefined}>{name}</span>
            ))}
          </div>
        </footer>
          </div>
        </div>
      </div>
    </section>
  );
}

const css = `
.hl-track{height:320vh;background:#05060a}.hl-sticky{--hud:1;--canvas:1;position:sticky;top:0;height:100svh;overflow:hidden}.hl{--line:rgba(160,170,255,.14);--dim:#7c819a;position:relative;height:100%;background:#05060a;color:#e8eaf2;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden}
.hl-canvas{position:absolute;inset:0;opacity:var(--canvas)}
.hl *{box-sizing:border-box}.hl-grid{position:absolute;inset:0;background:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%);mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%)}
.hl-hud{position:absolute;inset:0;pointer-events:none;opacity:var(--hud)}.hl-hud>*{position:absolute}.hl header{top:16px;left:24px;right:24px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:12px}
.hl-brand b{letter-spacing:.2em;font-size:14px}.hl-brand span{color:var(--dim);margin-left:10px}.hl-m{display:flex;gap:22px;color:var(--dim)}.hl-m b{display:block;color:#e8eaf2;font-weight:500}.hl-chip{color:#34d399;border:1px solid rgba(52,211,153,.4);padding:3px 10px;border-radius:99px;letter-spacing:.08em}
.hl-hero{left:24px;top:22%;max-width:min(560px,60vw)}.hl-k{color:#a78bfa;letter-spacing:.2em;margin:0 0 12px}.hl h1{font:600 clamp(40px,7vw,92px)/.95 system-ui,sans-serif;letter-spacing:-.04em;margin:0 0 16px;text-shadow:0 0 40px rgba(168,85,247,.45)}.hl-s{color:var(--dim);max-width:380px;margin:0}.hl-dim{color:var(--dim)}
.hl-conds{right:24px;top:84px;width:230px}.hl-row{display:grid;grid-template-columns:34px 1fr 56px;gap:8px;align-items:center;margin-bottom:7px;color:var(--dim)}.hl-bar{height:3px;background:var(--line)}.hl-bar i{display:block;height:100%;background:#a855f7;box-shadow:0 0 8px #a855f7}
.hl-run{right:24px;bottom:120px;text-align:right}.hl-big b{font-size:clamp(48px,6vw,84px);font-weight:600;letter-spacing:-.04em}.hl-big span{color:var(--dim);font-size:18px}.hl button{pointer-events:auto;background:none;color:inherit;border:1px solid var(--line);padding:6px 14px;font:inherit;letter-spacing:.12em;cursor:pointer}.hl button:hover,.hl button:focus-visible{border-color:#a78bfa;outline:none}
.hl footer{left:24px;right:24px;bottom:18px;border-top:1px solid var(--line);padding-top:10px;display:flex;gap:24px;align-items:flex-end;justify-content:space-between}.hl-stages{display:flex;gap:8px;flex-wrap:wrap}.hl-stages span{padding:2px 8px;border:1px solid var(--line);color:var(--dim)}
@media(max-width:760px){.hl-conds,.hl-m{display:none}.hl-hero{top:16%}.hl-run{bottom:100px}}
@media(prefers-reduced-motion:reduce){.hl-canvas{transition:none}}
`;
