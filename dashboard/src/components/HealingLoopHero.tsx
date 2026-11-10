'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { sceneForProgress } from '@/lib/scroll-scene';
import type { DeskData } from '@/lib/desk';
import { AxiomLogo } from './AxiomLogo';
import { RUN_OPTIONS, DEFAULT_RUN_ID, modelForRun, getDisplayName, inferRunOption, type RunOption } from '@/lib/runs';
import type { RunStatus } from '@/lib/useFleetStatus';
import { Connectors, ConvergenceGauge, EvidenceMatrix, FactNodes, FrequencyRack, LiveTerminal, Sparkline } from './desk/DeskPanels';
import { DataIntelPanel, dataIntelCss } from './desk/DataIntelPanel';

const LoopingDonut = dynamic(() => import('./LoopingDonut'), { ssr: false });

const STAGES: [string, number][] = [
  ['GENERATE', 0xa855f7], ['VERIFY', 0x22d3ee], ['FAIL', 0xf43f5e],
  ['ADVISE', 0xfbbf24], ['RETRY', 0xa855f7], ['PASS', 0x34d399],
];
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
  total?: number;
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
  runOptions?: readonly RunOption[];
  fleet?: RunStatus[];
  onSelectRun?: (runId: string) => void;
  onCopyLogs?: () => void;
  onReplayIntro?: () => void;
}

export default function HealingLoopHero({
  live,
  desk,
  stamp,
  error,
  snapshot,
  activeRunId = DEFAULT_RUN_ID,
  runOptions = RUN_OPTIONS,
  fleet,
  onSelectRun,
  onCopyLogs,
  onReplayIntro,
}: HealingLoopHeroProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [intelOpen, setIntelOpen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const stage = Math.max(0, Math.min(STAGES.length - 1, live.stage));
  const color = hex(STAGES[stage][1]);
  const running = live.running ?? true;

  const totalTrials = live.total ?? desk.totalTrials ?? (activeRunId.toLowerCase().includes('mini') ? 48 : 720);
  const activeOption = runOptions.find((r) => r.id === activeRunId) ?? inferRunOption(activeRunId);
  const activeFleetStatus = fleet?.find((f) => f.run.id === activeRunId);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [dropdownOpen]);

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
      <style>{dataIntelCss}</style>
      <div ref={stickyRef} className="hl-sticky">
        <div className="hl" data-intel={intelOpen ? 'open' : 'closed'}>
          <DataIntelPanel
            runId={activeRunId}
            label={getDisplayName(activeRunId)}
            isLive={snapshot?.isLive}
            open={intelOpen}
            onToggle={() => setIntelOpen((o) => !o)}
          />
          <div className="hl-grid" />
          <div className="hl-canvas">
            <LoopingDonut color={STAGES[stage][1]} running={running && !reducedMotion} progress={progress} />
          </div>
          <div className="hl-hud">
            <Connectors />
            <FactNodes facts={desk.activeFacts} />
            <header>
              <div
                className="hl-brand"
                onClick={onReplayIntro}
                role={onReplayIntro ? 'button' : undefined}
                tabIndex={onReplayIntro ? 0 : undefined}
                title={onReplayIntro ? 'Click to replay boot intro sequence' : undefined}
              >
                <AxiomLogo size={24} variant="duo" title="Axiom" />
                <b>AXIOM</b>
                <span>Verifier / {getDisplayName(activeRunId ?? snapshot?.runId ?? DEFAULT_RUN_ID)}</span>
              </div>
              <div className="hl-m">
                <div>ORACLE<b>locked</b></div><div>TEMP<b>0</b></div>
                <div>CONDITIONS<b>06</b></div><div>STAGE<b style={{ color }}>{STAGES[stage][0]}</b></div>
              </div>
              <div className="hl-header-controls">
                {/* ACTIVE MODEL / RUN Dropdown Selector */}
                <div className="hl-run-selector" role="group" aria-label="ACTIVE MODEL / RUN" ref={dropdownRef}>
                  <span className="hl-run-label">ACTIVE MODEL / RUN</span>
                  <div className="hl-run-dropdown-wrap">
                    <button
                      type="button"
                      className={`hl-run-trigger ${dropdownOpen ? 'is-open' : ''} ${activeFleetStatus?.state === 'live' || (activeRunId && live.running) ? 'is-live' : ''}`}
                      onClick={() => setDropdownOpen((v) => !v)}
                      aria-expanded={dropdownOpen}
                      aria-haspopup="listbox"
                      title={`Active model: ${getDisplayName(activeRunId)} (${live.done}/${totalTrials} trials)`}
                      style={{ '--run-accent': activeOption.accent } as React.CSSProperties}
                    >
                      <div className="hl-run-trigger-left">
                        <span className="hl-run-dot" />
                        <span className="hl-run-trigger-name">{getDisplayName(activeRunId)}</span>
                      </div>
                      <div className="hl-run-trigger-right">
                        <span className="hl-run-prog">{`${live.done}/${totalTrials}`}</span>
                        <svg
                          className={`hl-run-chevron ${dropdownOpen ? 'is-rotated' : ''}`}
                          width="10"
                          height="6"
                          viewBox="0 0 10 6"
                          fill="none"
                        >
                          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>
                    {dropdownOpen && (
                      <div className="hl-run-menu" role="listbox">
                        {runOptions.map((r) => {
                          const st = fleet?.find((f) => f.run.id === r.id);
                          const isSelected = activeRunId === r.id;
                          const rTotal = st?.total ?? (r.id.toLowerCase().includes('mini') ? 48 : (desk.totalTrials ?? 720));
                          const rDone = isSelected ? live.done : (st?.done ?? 0);
                          const name = getDisplayName(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`hl-run-option ${isSelected ? 'is-selected' : ''}`}
                              style={{ '--run-accent': r.accent } as React.CSSProperties}
                              onClick={() => {
                                onSelectRun?.(r.id);
                                setDropdownOpen(false);
                              }}
                            >
                              <div className="hl-run-option-left">
                                <span className="hl-run-dot" />
                                <span className="hl-run-option-name">{name}</span>
                              </div>
                              <span className="hl-run-option-prog">{`${rDone}/${rTotal}`}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`hl-chip ${snapshot?.awaiting ? 'hl-chip--awaiting' : snapshot?.isLive ? 'hl-chip--live' : 'hl-chip--snapshot'}`}
                  role="status"
                  title={snapshot?.isLive ? `Live telemetry stream for ${snapshot?.runId ?? activeRunId}` : `Checkpoint snapshot for ${snapshot?.runId ?? activeRunId}`}
                >
                  {snapshot?.awaiting ? (
                    <span>AWAITING // {snapshot.runId}</span>
                  ) : snapshot && !snapshot.isLive ? (
                    <span>SNAPSHOT // {snapshot.runId} @ {snapshot.commit}</span>
                  ) : (
                    <>
                      <span className="hl-chip-live-dot" />
                      <span>LIVE // {snapshot?.runId ?? activeRunId} @ {snapshot?.commit ?? 'live'}</span>
                    </>
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
                      <><b>0</b><span> / {totalTrials}</span></>
                    ) : (
                      <><b>{live.done}</b><span> / {totalTrials}</span></>
                    )}
                  </div>
                  <div className="dk-progress" role="progressbar" aria-label="Trials completed" aria-valuemin={0} aria-valuemax={totalTrials} aria-valuenow={snapshot?.awaiting ? 0 : live.done}>
                    <i style={snapshot?.awaiting ? { width: '100%', animation: 'dk-progress-awaiting 1.8s ease-in-out infinite' } : { width: `${Math.min(100, (live.done / Math.max(1, totalTrials)) * 100)}%` }} />
                  </div>
                  <p className="hl-dim">
                    {snapshot?.awaiting
                      ? `AWAITING SNAPSHOT · Pipeline execution in progress for ${getDisplayName(activeRunId)}`
                      : `${desk.totalTokens.toLocaleString()} tokens · ${Math.max(0, totalTrials - live.done)} trials remain`}
                  </p>
                  {onCopyLogs && <button onClick={onCopyLogs}>COPY LOGS</button>}
                </div>
              </div>

              {/* Right-Side Tactical Frequency & Telemetry Rack (Inspired by Images 2 & 3) */}
              <FrequencyRack
                tokens={desk.tokens}
                latency={desk.latency}
                done={desk.done}
                passed={desk.passed}
                failed={desk.failed}
                activeFacts={desk.activeFacts}
                memoryHits={desk.memoryHits}
                convergence={desk.convergence}
                snapshot={snapshot}
                total={totalTrials}
              />
            </div>

            <div className="dk-bottom">
              <EvidenceMatrix cells={desk.cells} passed={desk.passed} failed={desk.failed} totalTrials={totalTrials} snapshot={snapshot} />
              <LiveTerminal lines={desk.log} stamp={stamp} error={error} isLive={snapshot?.isLive} />
              <ConvergenceGauge value={desk.convergence} done={desk.done} totalTrials={totalTrials} />
            </div>

            <footer>
              <div className="hl-stages">
                {STAGES.map(([name, c], i) => (
                  <span key={name} style={i === stage ? { color: hex(c), borderColor: hex(c) } : undefined}>{name}</span>
                ))}
              </div>
              <div className="hl-footer-model">
                <span>PARALLEL BG:</span>
                {runOptions
                  .filter((r) => r.id !== activeRunId)
                  .map((r, i) => (
                    <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {i > 0 && <span>+</span>}
                      <b style={{ color: r.accent }}>{r.label}</b>
                    </span>
                  ))}
                <span style={{ opacity: 0.4 }}>|</span>
                <span>ACTIVE MODEL:</span>
                <b>{snapshot?.model ?? modelForRun(activeRunId)}</b>
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
.hl-canvas{position:absolute;inset:0;opacity:var(--canvas);transform:translateY(-2vh);transition:right .35s cubic-bezier(.16,1,.3,1)}
.hl{--di-w:clamp(300px,24vw,380px)}
.hl[data-intel=open] .hl-canvas,.hl[data-intel=open] .hl-hud{right:var(--di-w)}
.hl-hud{transition:right .35s cubic-bezier(.16,1,.3,1)}
.hl *{box-sizing:border-box}.hl-grid{position:absolute;inset:0;background:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%);mask-image:radial-gradient(ellipse at center,#000 25%,transparent 78%)}
.hl-hud{position:absolute;inset:0;pointer-events:none;opacity:var(--hud);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;gap:12px;padding:12px 18px;animation:hl-hud-reveal 1.2s cubic-bezier(0.16,1,0.3,1) both}
@keyframes hl-hud-reveal{0%{opacity:0;transform:scale(0.985)}100%{opacity:var(--hud);transform:scale(1)}}
.hl-brand{display:flex;align-items:center;gap:8px;cursor:pointer;transition:filter .3s ease;pointer-events:auto}
.hl-brand:hover{filter:drop-shadow(0 0 10px rgba(34,211,238,.85))}
.hl header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px;position:relative;z-index:500;pointer-events:auto}
.hl-header-controls{display:flex;align-items:center;gap:14px;position:relative;z-index:510;flex-shrink:0}
.hl-run-selector{display:flex;align-items:center;gap:8px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);pointer-events:auto;position:relative;z-index:520;flex-shrink:0}
.hl-run-label{font-size:9px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;font-weight:600;white-space:nowrap;flex-shrink:0}
.hl-run-dropdown-wrap{position:relative;display:inline-block;z-index:530;flex-shrink:0}
.hl-run-trigger{
  all:unset;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  min-width:215px;
  font-size:10px;
  letter-spacing:.08em;
  font-weight:600;
  padding:4px 10px;
  border-radius:4px;
  background:rgba(5,6,10,.88);
  border:1px solid rgba(160,170,255,.25);
  color:#f1f5f9;
  transition:all .2s ease;
  min-height:24px;
  box-sizing:border-box;
  flex-shrink:0;
}
.hl-run-trigger:hover,.hl-run-trigger.is-open{
  border-color:var(--run-accent,#22d3ee);
  background:color-mix(in srgb,var(--run-accent,#22d3ee) 12%,transparent);
  box-shadow:0 0 10px color-mix(in srgb,var(--run-accent,#22d3ee) 35%,transparent);
}
.hl-run-trigger-left{display:inline-flex;align-items:center;gap:8px;min-width:0}
.hl-run-trigger-right{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.hl-run-trigger-name{font-weight:700;white-space:nowrap}
.hl-run-trigger .hl-run-dot{width:6px;height:6px;border-radius:50%;background:var(--run-accent,#22d3ee);box-shadow:0 0 6px var(--run-accent,#22d3ee);flex-shrink:0}
.hl-run-trigger.is-live .hl-run-dot{animation:hl-run-pulse 1.4s ease-in-out infinite}
.hl-run-chevron{transition:transform .2s ease;color:var(--dim);flex-shrink:0}
.hl-run-chevron.is-rotated{transform:rotate(180deg);color:#22d3ee}
.hl-run-menu{
  position:absolute;
  top:calc(100% + 6px);
  left:0;
  min-width:100%;
  width:max-content;
  min-width:230px;
  max-width:320px;
  max-height:min(440px,calc(100vh - 120px));
  overflow-y:auto;
  overflow-x:hidden;
  scrollbar-width:thin;
  scrollbar-color:rgba(160,170,255,.3) transparent;
  background:#070910;
  background:rgba(7,9,16,.98);
  border:1px solid rgba(160,170,255,.35);
  border-radius:6px;
  box-shadow:0 16px 40px rgba(0,0,0,.95),0 0 20px rgba(34,211,238,.15);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  padding:5px;
  display:flex;
  flex-direction:column;
  gap:3px;
  z-index:1000;
  pointer-events:auto;
  animation:hl-menu-fade .15s cubic-bezier(0.16,1,0.3,1) both;
}
.hl-run-menu::-webkit-scrollbar{width:4px}
.hl-run-menu::-webkit-scrollbar-thumb{background:rgba(160,170,255,.3);border-radius:2px}
@keyframes hl-menu-fade{
  from{opacity:0;transform:translateY(-4px) scale(0.98)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
.hl-run-option{
  all:unset;
  cursor:pointer;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  padding:6px 10px;
  border-radius:4px;
  font-size:9.5px;
  letter-spacing:.06em;
  color:#8b90a8;
  transition:all .15s ease;
  pointer-events:auto;
}
.hl-run-option:hover{
  background:rgba(255,255,255,.08);
  color:#f1f5f9;
}
.hl-run-option.is-selected{
  background:color-mix(in srgb,var(--run-accent,#22d3ee) 15%,transparent);
  color:#f1f5f9;
  border-left:2px solid var(--run-accent,#22d3ee);
}
.hl-run-option-left{display:flex;align-items:center;gap:7px}
.hl-run-option .hl-run-dot{width:5px;height:5px;border-radius:50%;background:var(--run-accent,#8b90a8);flex-shrink:0}
.hl-run-option.is-selected .hl-run-dot{box-shadow:0 0 5px var(--run-accent,#22d3ee)}
.hl-run-option-name{font-weight:600}
.hl-run-option-prog{font-size:8.5px;color:var(--dim);font-variant-numeric:tabular-nums}
.hl-run-option.is-selected .hl-run-option-prog{color:var(--run-accent,#22d3ee);font-weight:600}
.hl-chip{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:230px;
  max-width:280px;
  padding:3px 12px;
  border-radius:99px;
  letter-spacing:.08em;
  font-size:10px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  flex-shrink:0;
  transition:border-color .2s ease,background-color .2s ease,color .2s ease,box-shadow .2s ease;
  font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);
}
.hl-chip--snapshot{
  color:#34d399;
  border:1px solid rgba(52,211,153,.4);
  background:rgba(52,211,153,.06);
  box-shadow:0 0 10px rgba(52,211,153,.12);
}
.hl-chip--live{
  color:#22d3ee;
  border:1px solid rgba(34,211,238,.45);
  background:rgba(34,211,238,.08);
  box-shadow:0 0 12px rgba(34,211,238,.2);
}
.hl-chip-live-dot{
  width:6px;
  height:6px;
  border-radius:50%;
  background:#22d3ee;
  box-shadow:0 0 6px #22d3ee;
  animation:hl-run-pulse 1.4s ease-in-out infinite;
  flex-shrink:0;
}
.hl-chip--awaiting{
  color:#fbbf24!important;
  border-color:rgba(251,191,36,.5)!important;
  background:rgba(251,191,36,.06)!important;
  box-shadow:0 0 10px rgba(251,191,36,.2)!important;
  animation:hl-awaiting-pulse 2s ease-in-out infinite;
}
.hl-run-tabs{display:inline-flex;align-items:center;padding:2px;background:rgba(5,6,10,.85);border:1px solid rgba(160,170,255,.2);border-radius:4px;gap:2px}
.hl-run-tab{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:9.5px;letter-spacing:.08em;font-weight:600;padding:3px 9px;border-radius:3px;color:#8b90a8;transition:all .2s ease;border:1px solid transparent}
.hl-run-tab:hover{color:#e8eaf2;background:rgba(255,255,255,.05);border-color:rgba(160,170,255,.3)}
.hl-run-tab.is-active{color:#f1f5f9;background:color-mix(in srgb,var(--run-accent,#22d3ee) 14%,transparent);border:1px solid var(--run-accent,#22d3ee);box-shadow:0 0 10px color-mix(in srgb,var(--run-accent,#22d3ee) 45%,transparent)}
.hl-run-tab .hl-run-dot{width:5px;height:5px;border-radius:50%;background:var(--run-accent,#4b5563);opacity:.45;transition:all .2s ease}
.hl-run-tab.is-active .hl-run-dot{opacity:1;box-shadow:0 0 6px var(--run-accent,#22d3ee)}
.hl-run-tab.is-live .hl-run-dot{opacity:1;animation:hl-run-pulse 1.4s ease-in-out infinite}
.hl-run-prog{font-size:8px;padding:1px 4px;border-radius:2px;background:rgba(255,255,255,.06);color:var(--run-accent,#8b90a8);letter-spacing:.06em}
@keyframes hl-run-pulse{0%,100%{box-shadow:0 0 0 0 var(--run-accent)}50%{box-shadow:0 0 0 4px transparent}}
.hl-footer-model{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.12em;color:var(--dim);font-family:var(--font-mono,monospace)}
.hl-footer-model b{color:#22d3ee;font-weight:600}
@keyframes dk-progress-awaiting{
  0%{background:linear-gradient(90deg,rgba(251,191,36,.2),#fbbf24,rgba(251,191,36,.2));opacity:.6}
  50%{background:linear-gradient(90deg,rgba(34,211,238,.2),#22d3ee,rgba(34,211,238,.2));opacity:1}
  100%{background:linear-gradient(90deg,rgba(251,191,36,.2),#fbbf24,rgba(251,191,36,.2));opacity:.6}
}
.hl-brand{display:flex;align-items:center;gap:8px}.hl-brand b{letter-spacing:.18em;font-size:13px;font-weight:700;color:#ffffff;text-shadow:none}.hl-brand span{color:var(--dim);margin-left:2px}.hl-m{display:flex;gap:20px;color:var(--dim)}.hl-m b{display:block;color:#e8eaf2;font-weight:500;text-shadow:none}
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
.dk-panel{pointer-events:auto;background:rgba(7,9,16,.88);border:1px solid rgba(160,170,255,.2);box-shadow:0 0 0 1px rgba(168,85,247,.08),0 0 24px rgba(34,211,238,.06) inset,0 8px 32px rgba(0,0,0,.7);backdrop-filter:blur(12px);padding:8px 10px;min-width:0}
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
.dk-cell--pending{background:#18181b!important;box-shadow:none!important;animation:none!important;transform:none!important}
.dk-cell--pending.matrix-pulse,.dk-cell--pending.dk-cell--pulse,.dk-cell--pending.dk-cell--running{background:#18181b!important;box-shadow:none!important;animation:none!important;transform:none!important}
.dk-cell--pass{background:#22d3ee;box-shadow:0 0 2px rgba(34,211,238,.35)}
.dk-cell--fail{background:#d946ef;box-shadow:0 0 2px rgba(217,70,239,.35)}

/* Calm, natural live data stream pulse with gentle brighter hues and zero white shadows */
.matrix-pulse{animation-name:matrix-pulse;animation-iteration-count:infinite;animation-timing-function:ease-in-out;contain:layout paint}
.dk-cell--pass.matrix-pulse{animation-name:matrix-pulse-pass}
.dk-cell--fail.matrix-pulse{animation-name:matrix-pulse-fail}
.dk-cell--pulse{animation-name:matrix-pulse;animation-iteration-count:infinite;animation-timing-function:ease-in-out;contain:layout paint}
.dk-cell--pass.dk-cell--pulse{animation-name:matrix-pulse-pass}
.dk-cell--fail.dk-cell--pulse{animation-name:matrix-pulse-fail}

@keyframes matrix-pulse{
  0%,60%,100%{opacity:.88;box-shadow:0 0 2px rgba(34,211,238,.35)}
  80%{opacity:1;box-shadow:0 0 3px rgba(103,232,249,.6)}
}
@keyframes matrix-pulse-pass{
  0%,60%,100%{background:#22d3ee;opacity:.88;box-shadow:0 0 2px rgba(34,211,238,.35)}
  80%{background:#67e8f9;opacity:1;box-shadow:0 0 3px rgba(34,211,238,.6)}
}
@keyframes matrix-pulse-fail{
  0%,60%,100%{background:#d946ef;opacity:.88;box-shadow:0 0 2px rgba(217,70,239,.35)}
  80%{background:#f0abfc;opacity:1;box-shadow:0 0 3px rgba(217,70,239,.6)}
}

.dk-cell--running{background:#ffffff!important;box-shadow:0 0 6px #22d3ee,0 0 12px rgba(34,211,238,.85)!important;animation:dk-runner-pulse .75s ease-in-out infinite alternate;transform:scale(1.25);z-index:2}
@keyframes dk-runner-pulse{0%{opacity:.7}100%{opacity:1}}
.dk-legend{display:flex;gap:14px;list-style:none;margin:6px 0 0;padding:0;color:var(--dim);font-size:10px}.dk-legend li{display:flex;align-items:center;gap:5px}.dk-legend .dk-cell{width:8px}
.dk-term-body{height:118px;overflow-y:auto;font-size:10.5px;line-height:1.5;scrollbar-width:thin}.dk-term-body:focus-visible{outline:2px solid #22d3ee}
.dk-line{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5eead4}.dk-line b{font-weight:600}.dk-line--OK b{color:#22d3ee}.dk-line--FAIL{color:#f0abfc}.dk-line--FAIL b{color:#e879f9}.dk-line--WARN{color:#fcd34d}
.dk-cursor{color:#22d3ee;animation:dk-blink 1s steps(1) infinite}
.dk-gauge svg{display:block;width:100%;max-height:120px}
.dk-arc-bg{fill:none;stroke:rgba(160,170,255,.12);stroke-width:10;stroke-linecap:round}.dk-arc{fill:none;stroke-width:10;stroke-linecap:round}
.dk-tick{stroke:rgba(160,170,255,.25);stroke-width:1.2;transition:stroke .3s,filter .3s}.dk-tick--on{stroke:#22d3ee;filter:drop-shadow(0 0 2px currentColor)}
.dk-tick-label{fill:var(--dim);font-size:8px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.dk-gauge-value{fill:#f8fafc;font:700 21px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);text-shadow:0 0 10px rgba(160,170,255,.25)}
.dk-gauge-sub{font:600 8.5px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.18em;text-transform:uppercase}
.dk-gauge[data-band=OVERCLOCKED]{border-color:rgba(168,85,247,.6);box-shadow:0 0 20px rgba(168,85,247,.22)}.dk-gauge[data-band=OVERCLOCKED] .dk-head b{color:#d8b4fe}
.dk-gauge[data-band=CONVERGING]{border-color:rgba(34,211,238,.45);box-shadow:0 0 16px rgba(34,211,238,.16)}.dk-gauge[data-band=CONVERGING] .dk-head b{color:#67e8f9}
.dk-gauge[data-band=LEARNING]{border-color:rgba(232,121,249,.4);box-shadow:0 0 16px rgba(232,121,249,.14)}.dk-gauge[data-band=LEARNING] .dk-head b{color:#f0abfc}
.dk-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.dk-wire{fill:none;stroke:rgba(34,211,238,.35);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 5;animation:dk-flow 2.4s linear infinite}
.dk-wire-end{fill:#22d3ee}
.dk-facts{position:absolute;inset:0;pointer-events:none;z-index:10}
.dk-fact{position:absolute;transform:translate(-50%,-50%);padding:3px 8px;border:1px solid rgba(232,121,249,.65);background:rgba(5,6,10,.94);color:#f0abfc;font-size:10px;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.08em;text-shadow:0 0 6px rgba(232,121,249,.35);box-shadow:0 0 10px rgba(217,70,239,.3),0 2px 8px rgba(0,0,0,.85);border-radius:3px;white-space:nowrap;z-index:10;pointer-events:auto}
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
