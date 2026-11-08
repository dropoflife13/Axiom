'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { sceneForProgress } from '@/lib/scroll-scene';
import type { DeskData } from '@/lib/desk';
import { AxiomLogo } from './AxiomLogo';
import { Connectors, ConvergenceGauge, EvidenceMatrix, FactNodes, FrequencyRack, LiveTerminal, Sparkline } from './desk/DeskPanels';

const LoopingDonut = dynamic(() => import('./LoopingDonut'), { ssr: false });

const STAGES: [string, number][] = [
  ['GENERATE', 0xa855f7], ['VERIFY', 0x22d3ee], ['FAIL', 0xf43f5e],
  ['ADVISE', 0xfbbf24], ['RETRY', 0xa855f7], ['PASS', 0x34d399],
];
const TOTAL = 720;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export interface SnapshotMeta {
  runId: string;
  commit: string;
  isLive?: boolean;
  model?: string;
  awaiting?: boolean;
}

export type LiveRun = {
  done: number;
  counts: number[];
  stage: number;
  running?: boolean;
  label?: string;
  awaiting?: boolean;
};

interface HealingLoopHeroProps {
  live: LiveRun;
  desk: DeskData;
  stamp: string;
  error: string | null;
  snapshot?: SnapshotMeta;
  activeRunId?: string;
  onSelectRun?: (runId: string) => void;
  onCopyLogs?: () => void;
}

export default function HealingLoopHero({ live, desk, stamp, error, snapshot, activeRunId = 'nemotron-1', onSelectRun, onCopyLogs }: HealingLoopHeroProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const stage = Math.max(0, Math.min(STAGES.length - 1, live.stage));
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
            <Connectors />
            <FactNodes facts={desk.activeFacts} />
            <header>
              <div className="hl-brand"><AxiomLogo size={24} variant="duo" title="Axiom" /><b>AXIOM</b><span>Verifier / {snapshot?.runId ?? 'nemotron-1'}</span></div>
              <div className="hl-m">
                <div>ORACLE<b>locked</b></div><div>TEMP<b>0</b></div>
                <div>CONDITIONS<b>06</b></div><div>STAGE<b style={{ color }}>{STAGES[stage][0]}</b></div>
              </div>
              <div className="hl-header-controls">
                {/* ACTIVE MODEL / RUN Selector (Futuristic Sci-Fi Glow Toggle) */}
                <div className="hl-run-selector" role="group" aria-label="ACTIVE MODEL / RUN">
                  <span className="hl-run-label">ACTIVE MODEL / RUN</span>
                  <div className="hl-run-tabs">
                    <button
                      type="button"
                      className={`hl-run-tab ${activeRunId === 'nemotron-1' ? 'is-active' : ''}`}
                      onClick={() => onSelectRun?.('nemotron-1')}
                      title="Switch to NEMOTRON 550B snapshot"
                    >
                      <span className="hl-run-dot" />
                      NEMOTRON 550B
                    </button>
                    <button
                      type="button"
                      className={`hl-run-tab ${activeRunId === 'gemma-1' ? 'is-active' : ''}`}
                      onClick={() => onSelectRun?.('gemma-1')}
                      title="Switch to GEMMA 4 31B snapshot"
                    >
                      <span className="hl-run-dot" />
                      GEMMA 4 31B
                    </button>
                  </div>
                </div>

                <div className={`hl-chip ${snapshot?.awaiting ? 'hl-chip--awaiting' : ''}`} role="status">
                  {snapshot?.awaiting ? (
                    <span>AWAITING SNAPSHOT // {snapshot.runId}</span>
                  ) : snapshot && !snapshot.isLive ? (
                    <span>SNAPSHOT // {snapshot.runId} @ {snapshot.commit}</span>
                  ) : (
                    <span>{live.label ?? 'LIVE'}</span>
                  )}
                </div>
              </div>
            </header>

            <div className="dk-top">
              <Sparkline label="TOKENS USED" values={desk.tokens} unit=" tok" empty="" />
              <Sparkline label="API LATENCY" values={desk.latency} unit=" ms" empty="Not recorded in checkpoint" />
              <Sparkline label="MEMORY HITS" values={desk.memoryHits} unit="" empty="" />
            </div>

            <div className="hl-hero-row">
              <div className="hl-hero">
                <p className="hl-k">● HEALING LOOP</p>
                <h1>Architecture<br />under pressure.</h1>
                <p className="hl-s">Generate, verify, fail, advise, retry. Axiom tests generated migrations against the rules they claim to satisfy.</p>
                <div className="hl-run">
                  <div className="hl-big">
                    {snapshot?.awaiting ? (
                      <><b>0</b><span> / {TOTAL}</span></>
                    ) : (
                      <><b>{live.done}</b><span> / {TOTAL}</span></>
                    )}
                  </div>
                  <div className="dk-progress" role="progressbar" aria-label="Trials completed" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={snapshot?.awaiting ? 0 : live.done}>
                    <i style={snapshot?.awaiting ? { width: '100%', animation: 'dk-progress-awaiting 1.8s ease-in-out infinite' } : { width: `${(live.done / TOTAL) * 100}%` }} />
                  </div>
                  <p className="hl-dim">
                    {snapshot?.awaiting
                      ? `AWAITING SNAPSHOT · Pipeline execution in progress for ${activeRunId}`
                      : `${desk.totalTokens.toLocaleString()} tokens · ${TOTAL - live.done} trials remain`}
                  </p>
                  {onCopyLogs && <button onClick={onCopyLogs}>COPY LOGS</button>}
                </div>
              </div>

              {/* Right-Side Tactical Frequency & Telemetry Rack (Inspired by Images 2 & 3) */}
              <FrequencyRack
                tokens={desk.tokens}
                latency={desk.latency}
                done={desk.done}
                memoryHits={desk.memoryHits}
                convergence={desk.convergence}
                snapshot={snapshot}
              />
            </div>

            <div className="dk-bottom">
              <EvidenceMatrix cells={desk.cells} passed={desk.passed} failed={desk.failed} snapshot={snapshot} />
              <LiveTerminal lines={desk.log} stamp={stamp} error={error} isLive={snapshot?.isLive} />
              <ConvergenceGauge value={desk.convergence} done={desk.done} />
            </div>

            <footer>
              <div className="hl-stages">
                {STAGES.map(([name, c], i) => (
                  <span key={name} style={i === stage ? { color: hex(c), borderColor: hex(c) } : undefined}>{name}</span>
                ))}
              </div>
              <div className="hl-footer-model">
                <span>ACTIVE MODEL:</span>
                <b>{snapshot?.model ?? (activeRunId === 'gemma-1' ? 'google/gemma-4-31b-it' : 'nvidia/nemotron-3-ultra-550b-a55b')}</b>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}

const css = `
.hl-track{height:320vh;background:#05060a}.hl-sticky{--hud:1;--canvas:1;position:sticky;top:0;height:100svh;overflow:hidden}.hl{--line:rgba(160,170,255,.14);--dim:#8b90a8;position:relative;height:100%;background:#05060a;color:#e8eaf2;font:12px/1.45 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);overflow:hidden}
.hl-canvas{position:absolute;inset:0;opacity:var(--canvas)}
.hl *{box-sizing:border-box}.hl-grid{position:absolute;inset:0;background:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%);mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%)}
.hl-hud{position:absolute;inset:0;pointer-events:none;opacity:var(--hud);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;gap:12px;padding:12px 18px}
.hl header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px;position:relative;z-index:2}
.hl-header-controls{display:flex;align-items:center;gap:12px}
.hl-run-selector{display:flex;align-items:center;gap:8px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);pointer-events:auto}
.hl-run-label{font-size:9px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;font-weight:600}
.hl-run-tabs{display:inline-flex;align-items:center;padding:2px;background:rgba(5,6,10,.85);border:1px solid rgba(160,170,255,.2);border-radius:4px;gap:2px}
.hl-run-tab{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:9.5px;letter-spacing:.08em;font-weight:600;padding:3px 9px;border-radius:3px;color:#8b90a8;transition:all .2s ease;border:1px solid transparent}
.hl-run-tab:hover{color:#e8eaf2;background:rgba(255,255,255,.05);border-color:rgba(160,170,255,.3)}
.hl-run-tab.is-active{color:#22d3ee;background:rgba(34,211,238,.12);border:1px solid #22d3ee;box-shadow:0 0 10px rgba(34,211,238,.5),inset 0 0 6px rgba(34,211,238,.2)}
.hl-run-tab .hl-run-dot{width:4.5px;height:4.5px;border-radius:50%;background:#4b5563;transition:all .2s ease}
.hl-run-tab.is-active .hl-run-dot{background:#22d3ee;box-shadow:0 0 6px #22d3ee}
.hl-chip--awaiting{color:#fbbf24!important;border-color:rgba(251,191,36,.5)!important;animation:hl-awaiting-pulse 2s ease-in-out infinite}
@keyframes hl-awaiting-pulse{0%,100%{box-shadow:0 0 4px rgba(251,191,36,.3)}50%{box-shadow:0 0 12px rgba(251,191,36,.8)}}
.hl-footer-model{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.12em;color:var(--dim);font-family:var(--font-mono,monospace)}
.hl-footer-model b{color:#22d3ee;font-weight:600}
@keyframes dk-progress-awaiting{
  0%{background:linear-gradient(90deg,rgba(251,191,36,.2),#fbbf24,rgba(251,191,36,.2));opacity:.6}
  50%{background:linear-gradient(90deg,rgba(34,211,238,.2),#22d3ee,rgba(34,211,238,.2));opacity:1}
  100%{background:linear-gradient(90deg,rgba(251,191,36,.2),#fbbf24,rgba(251,191,36,.2));opacity:.6}
}
.hl-brand{display:flex;align-items:center;gap:8px}.hl-brand b{letter-spacing:.18em;font-size:13px;font-weight:700;color:#ffffff;text-shadow:none}.hl-brand span{color:var(--dim);margin-left:2px}.hl-m{display:flex;gap:20px;color:var(--dim)}.hl-m b{display:block;color:#e8eaf2;font-weight:500;text-shadow:none}.hl-chip{color:#34d399;border:1px solid rgba(52,211,153,.4);padding:3px 10px;border-radius:99px;letter-spacing:.08em}
.hl-hero{max-width:min(420px,34vw);position:relative;z-index:2;pointer-events:auto;margin:0}
.hl-k{display:inline-flex;align-items:center;gap:6px;color:#c4b5fd;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:10.5px;font-weight:600;letter-spacing:.18em;margin:0 0 8px;text-shadow:none}
.hl h1{font:600 clamp(26px,2.8vw,44px)/1.04 var(--font-sans,'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif);letter-spacing:-.03em;color:#f5eff7;margin:0 0 10px;text-shadow:none}
.hl-s{font-size:11.5px;line-height:1.45;color:var(--dim);max-width:340px;margin:0 0 12px}.hl-dim{color:var(--dim);margin:4px 0 8px}
.hl-run{margin-top:10px}
.hl-big b{font-size:clamp(30px,3.2vw,46px);font-weight:600;letter-spacing:-.03em;color:#f5eff7;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);text-shadow:none}.hl-big span{color:var(--dim);font-size:14px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.hl button{pointer-events:auto;background:rgba(5,6,10,.7);color:inherit;border:1px solid var(--line);padding:6px 14px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;letter-spacing:.12em;cursor:pointer;min-height:30px}.hl button:hover,.hl button:focus-visible{border-color:#a78bfa;outline:2px solid #a78bfa;outline-offset:2px}
.hl footer{border-top:1px solid var(--line);padding-top:8px;display:flex;justify-content:space-between;position:relative;z-index:2}.hl-stages{display:flex;gap:8px;flex-wrap:wrap}.hl-stages span{padding:2px 8px;border:1px solid var(--line);color:var(--dim);font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
.dk-progress{height:6px;background:rgba(160,170,255,.12);margin-top:6px;overflow:hidden}.dk-progress i{display:block;height:100%;background:linear-gradient(90deg,#a855f7,#22d3ee);box-shadow:0 0 10px #a855f7;transition:width .6s}

/* desk panels */
.dk-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;position:relative;z-index:2;margin-bottom:2px}
.dk-bottom{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,.9fr);gap:10px;position:relative;z-index:2;min-height:0}
.dk-panel{pointer-events:auto;background:rgba(7,9,16,.78);border:1px solid rgba(160,170,255,.18);box-shadow:0 0 0 1px rgba(168,85,247,.06),0 0 24px rgba(34,211,238,.05) inset;backdrop-filter:blur(6px);padding:8px 10px;min-width:0}
.dk-head{display:flex;justify-content:space-between;gap:8px;color:var(--dim);font-size:10px;letter-spacing:.14em;margin-bottom:6px}.dk-head b{color:#e8eaf2;font-weight:500;letter-spacing:.04em;text-shadow:none}
.dk-empty,.dk-sub{margin:0;color:var(--dim);font-size:10.5px}
.dk-spark svg{display:block;width:100%;height:26px}.dk-bar{fill:rgba(34,211,238,.55)}.dk-bar--now{fill:#22d3ee;filter:drop-shadow(0 0 3px #22d3ee)}

/* Hero Row with Left Text & Right Tactical Frequency Rack */
.hl-hero-row{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:2;min-height:0;pointer-events:none;gap:24px;padding-top:4px}
.hl-hero{max-width:min(400px,32vw);pointer-events:auto}
.hl-freq-rack{width:min(340px,28vw);pointer-events:auto;display:flex;flex-direction:column;gap:7px;padding:9px 11px;background:rgba(7,9,16,.88);border:1px solid rgba(160,170,255,.2);box-shadow:0 0 24px rgba(34,211,238,.06) inset,0 8px 32px rgba(0,0,0,.6);backdrop-filter:blur(10px)}
.hl-spectrogram-container{width:100%}
.hl-spectrogram-strip{position:relative;height:5px;width:100%;border-radius:3px;background:linear-gradient(90deg,#22d3ee 0%,#34d399 25%,#fbbf24 50%,#f43f5e 75%,#a855f7 100%);overflow:hidden;box-shadow:0 0 8px rgba(34,211,238,.35)}
.hl-spectro-cursor{position:absolute;top:0;bottom:0;width:8px;transform:translateX(-50%);background:#ffffff;box-shadow:0 0 6px #ffffff,0 0 10px #22d3ee;border-radius:2px}
.hl-eq-rack{display:flex;align-items:flex-end;justify-content:space-between;gap:2px;height:40px;padding:3px 5px;background:#040509;border:1px solid rgba(160,170,255,.12);border-radius:4px}
.hl-eq-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}
.hl-eq-meter{flex:1;width:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:1px}
.hl-eq-seg{width:100%;height:3px;border-radius:.5px;background:rgba(255,255,255,.05);transition:background .12s ease}
.hl-eq-seg.is-lit.seg-low{background:#22d3ee;box-shadow:0 0 3px rgba(34,211,238,.7)}
.hl-eq-seg.is-lit.seg-mid{background:#fbbf24;box-shadow:0 0 3px rgba(251,191,36,.7)}
.hl-eq-seg.is-lit.seg-peak{background:#f43f5e;box-shadow:0 0 4px rgba(244,63,94,.85)}
.hl-eq-lbl{font-size:7px;color:var(--dim);margin-top:2px;line-height:1;transform:scale(.85)}

/* Middle Mixer Module: Spectral Heat Matrix & Channel Faders */
.hl-mixer-row{display:grid;grid-template-columns:1.35fr 1fr;gap:8px;border-top:1px solid rgba(160,170,255,.1);padding-top:6px}
.hl-mini-head{display:flex;justify-content:space-between;font-size:8px;letter-spacing:.12em;color:var(--dim);margin-bottom:4px}
.hl-mini-head b{color:#e8eaf2;font-weight:600}
.hl-spectral-matrix{display:flex;flex-direction:column}
.hl-spectral-bands{display:flex;flex-direction:column;gap:2.5px}
.hl-spectral-band{display:flex;align-items:center;gap:4px}
.hl-spectral-lbl{font-size:7.5px;color:var(--dim);width:18px;text-align:right;font-family:inherit}
.hl-spectral-track{flex:1;height:4px;background:rgba(255,255,255,.06);border-radius:1px;overflow:hidden}
.hl-spectral-fill{height:100%;border-radius:1px}

.hl-fader-console{display:flex;flex-direction:column}
.hl-faders-grid{display:flex;justify-content:space-between;height:48px;padding:3px 4px;background:#040509;border:1px solid rgba(160,170,255,.1);border-radius:3px}
.hl-fader-col{display:flex;flex-direction:column;align-items:center;flex:1}
.hl-fader-track{position:relative;width:4px;flex:1;background:rgba(255,255,255,.08);border-radius:2px}
.hl-fader-fill{position:absolute;bottom:0;width:100%;border-radius:2px;opacity:.5}
.hl-fader-cap{position:absolute;left:-3px;width:10px;height:5px;border-radius:1px;background:#ffffff;box-shadow:0 0 5px rgba(255,255,255,.9),0 0 8px #22d3ee;transform:translateY(50%)}
.hl-fader-lbl{font-size:7px;color:var(--dim);margin-top:2px}

.hl-telemetry-grid{display:flex;flex-direction:column;gap:4.5px;border-top:1px solid rgba(160,170,255,.1);padding-top:6px}
.hl-telem-item{display:flex;flex-direction:column;gap:2px}
.hl-telem-head{display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.1em;color:var(--dim)}
.hl-telem-bar{height:3.5px;background:rgba(160,170,255,.12);border-radius:2px;overflow:hidden}
.hl-telem-bar .bar-pass{display:block;height:100%;background:#34d399;box-shadow:0 0 6px #34d399}
.hl-telem-curve{width:100%;height:12px;display:block}
.hl-telem-row{display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.1em;color:var(--dim)}
.hl-telem-row b{font-weight:600;letter-spacing:.04em}
.hl-rack-footer{display:flex;align-items:center;gap:6px;font-size:7.5px;letter-spacing:.14em;color:var(--dim);border-top:1px solid rgba(160,170,255,.08);padding-top:4px}
.hl-sig-dot{width:4px;height:4px;border-radius:50%;background:#22d3ee;box-shadow:0 0 6px #22d3ee}
.dk-grid{display:grid;grid-template-columns:repeat(60,1fr);gap:1px;contain:paint}
.dk-cell{display:block;aspect-ratio:1;border-radius:1px;contain:strict}
.dk-cell--pending{background:#18181b}
.dk-cell--pass{background:#22d3ee;box-shadow:0 0 2px rgba(34,211,238,.35)}
.dk-cell--fail{background:#d946ef;box-shadow:0 0 2px rgba(217,70,239,.35)}

/* High-vibrancy live data stream: pure CSS asynchronous pulse with randomized per-element delays */
.matrix-pulse{animation-name:matrix-pulse;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(0.4,0,0.2,1);will-change:opacity,filter,box-shadow;transform:translateZ(0)}
.dk-cell--pass.matrix-pulse{animation-name:matrix-pulse-pass}
.dk-cell--fail.matrix-pulse{animation-name:matrix-pulse-fail}
.dk-cell--pulse{animation-name:matrix-pulse;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(0.4,0,0.2,1);will-change:opacity,filter,box-shadow;transform:translateZ(0)}
.dk-cell--pass.dk-cell--pulse{animation-name:matrix-pulse-pass}
.dk-cell--fail.dk-cell--pulse{animation-name:matrix-pulse-fail}

@keyframes matrix-pulse{
  0%,72%,100%{opacity:.85;filter:brightness(1);box-shadow:0 0 2px rgba(255,255,255,.2)}
  86%{opacity:1;filter:brightness(1.75);box-shadow:0 0 5px #ffffff,0 0 9px rgba(34,211,238,.85)}
}
@keyframes matrix-pulse-pass{
  0%,72%,100%{opacity:.85;filter:brightness(1);box-shadow:0 0 2px rgba(34,211,238,.35)}
  86%{opacity:1;filter:brightness(1.7);box-shadow:0 0 5px #ffffff,0 0 9px #22d3ee}
}
@keyframes matrix-pulse-fail{
  0%,72%,100%{opacity:.85;filter:brightness(1);box-shadow:0 0 2px rgba(217,70,239,.35)}
  86%{opacity:1;filter:brightness(1.7);box-shadow:0 0 5px #ffffff,0 0 9px #d946ef}
}

.dk-cell--running{background:#ffffff!important;box-shadow:0 0 6px #22d3ee,0 0 12px rgba(34,211,238,.85)!important;animation:dk-runner-pulse .75s ease-in-out infinite alternate;transform:scale(1.25);z-index:2}
@keyframes dk-runner-pulse{0%{opacity:.7}100%{opacity:1}}
.dk-legend{display:flex;gap:14px;list-style:none;margin:6px 0 0;padding:0;color:var(--dim);font-size:10px}.dk-legend li{display:flex;align-items:center;gap:5px}.dk-legend .dk-cell{width:8px}
.dk-term-body{height:118px;overflow-y:auto;font-size:10.5px;line-height:1.5;scrollbar-width:thin}.dk-term-body:focus-visible{outline:2px solid #22d3ee}
.dk-line{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5eead4}.dk-line b{font-weight:600}.dk-line--OK b{color:#22d3ee}.dk-line--FAIL{color:#f0abfc}.dk-line--FAIL b{color:#e879f9}.dk-line--WARN{color:#fcd34d}
.dk-cursor{color:#22d3ee;animation:dk-blink 1s steps(1) infinite}
.dk-gauge svg{display:block;width:100%;max-height:120px}
.dk-arc-bg{fill:none;stroke:rgba(160,170,255,.12);stroke-width:10;stroke-linecap:round}.dk-arc{fill:none;stroke-width:10;stroke-linecap:round}
.dk-tick{stroke:rgba(160,170,255,.25);stroke-width:1.2}.dk-tick--on{stroke:#22d3ee;filter:drop-shadow(0 0 2px #22d3ee)}
.dk-tick-label{fill:var(--dim);font-size:8px}.dk-needle{stroke:#f5f3ff;stroke-width:2.4;stroke-linecap:round}.dk-hub{fill:#05060a;stroke:#c4b5fd;stroke-width:2}
.dk-gauge-value{fill:#f5eff7;font:600 20px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);text-shadow:none}
.dk-gauge[data-band=OVERCLOCKED]{border-color:#a855f7;box-shadow:0 0 16px rgba(168,85,247,.3)}.dk-gauge[data-band=OVERCLOCKED] .dk-head b{color:#d8b4fe}
.dk-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.dk-wire{fill:none;stroke:rgba(34,211,238,.35);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 5;animation:dk-flow 2.4s linear infinite}
.dk-wire-end{fill:#22d3ee}
.dk-facts{position:absolute;inset:0;pointer-events:none;z-index:1}
.dk-fact{position:absolute;transform:translate(-50%,-50%);padding:2px 7px;border:1px solid rgba(232,121,249,.4);background:rgba(5,6,10,.85);color:#f0abfc;font-size:10px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.08em;text-shadow:none;box-shadow:0 2px 6px rgba(0,0,0,.6)}
@keyframes dk-flow{to{stroke-dashoffset:-32}}@keyframes dk-blink{50%{opacity:0}}
@media(max-width:1100px){.hl-m{display:none}.hl-hero{max-width:none}.dk-top{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){
  .hl-track{height:auto}.hl-sticky{position:relative;height:auto;overflow:visible}.hl{height:auto;overflow:visible}
  .hl-canvas{position:relative;height:340px;inset:auto}
  .hl-hud{position:relative;inset:auto;opacity:1;grid-template-rows:none;padding:12px}
  .dk-top,.dk-bottom{grid-template-columns:1fr}.dk-wires,.dk-facts{display:none}
  .hl-hud>header{order:-2}.hl-canvas{order:-1}
  .dk-grid{grid-template-columns:repeat(40,1fr)}
}
@media(prefers-reduced-motion:reduce){.dk-wire,.dk-cursor{animation:none}.dk-progress i{transition:none}}
`;
