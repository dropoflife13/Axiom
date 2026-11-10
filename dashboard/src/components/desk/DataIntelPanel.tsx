'use client';
import { memo, useEffect, useMemo, useState } from 'react';

/* Data Intel sidebar — dense, structured run explanation panel. */

interface Intel {
  runId: string;
  available: boolean;
  source?: string;
  provider?: string;
  baseUrl?: string | null;
  requestedModel?: string;
  returnedModels?: { name: string; n: number }[];
  reasoning?: { mode: string; label: string };
  gitCommit?: string | null;
  generatedAt?: string | null;
  integrity?: Record<'facts' | 'oracle', { recorded: string | null; actual: string | null; ok: boolean }>;
  means?: Record<string, number>;
  counts?: Record<string, number>;
  failures?: Record<string, Record<string, number>>;
  statements?: Record<string, string>;
  pairedCvsC0?: { key: string; meanDifference: number | null; pValue: number | null } | null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts`;
const short = (h: string | null | undefined) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—');

/** Deterministic C0-vs-C explanation from recorded numbers only. */
export function explainHypothesis(intel: Intel): { tone: 'c0' | 'null' | 'c' | 'na'; headline: string; body: string[] } {
  const m = intel.means ?? {};
  if (m.C0 === undefined || m.C === undefined) {
    return { tone: 'na', headline: 'C0 / C comparison not yet available', body: ['Both the verbatim-rules (C0) and distilled-lessons (C) conditions need completed trials before the effect can be computed.'] };
  }
  const delta = m.C0 - m.C;
  const fC = intel.failures?.C ?? {};
  const fC0 = intel.failures?.C0 ?? {};
  const gaps = Object.keys({ ...fC, ...fC0 })
    .map((id) => ({ id, gap: (fC[id] ?? 0) - (fC0[id] ?? 0) }))
    .sort((a, b) => b.gap - a.gap);
  const lost = gaps.filter((g) => g.gap > 0).slice(0, 3);
  const gained = [...gaps].reverse().filter((g) => g.gap < 0).slice(0, 3);
  const fmt = (list: { id: string; gap: number }[]) => list.map((g) => `${g.id} (${g.gap > 0 ? '+' : ''}${g.gap})`).join(', ');
  const stat = `C0 ${pct(m.C0)} vs C ${pct(m.C)} mean bound-fact fraction.`;
  const p = intel.pairedCvsC0?.pValue;
  const pLine = typeof p === 'number' ? ` Paired sign-flip p = ${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}.` : '';

  if (delta >= 0.05) {
    return {
      tone: 'c0',
      headline: `Verbatim rules (C0) outperformed distilled lessons (C) by ${pts(delta)}`,
      body: [
        stat + pLine,
        'The Advisor’s distillation step loses exact literals that the verbatim rules carry, so the Executor misses facts it otherwise satisfies.',
        lost.length ? `Facts C fails more often than C0: ${fmt(lost)}.` : '',
      ].filter(Boolean),
    };
  }
  if (delta <= -0.05) {
    return {
      tone: 'c',
      headline: `Distilled lessons (C) outperformed verbatim rules (C0) by ${pts(-delta)}`,
      body: [
        stat + pLine,
        'On this model the distilled lessons are more actionable than the raw rule text.',
        gained.length ? `Facts C0 fails more often than C: ${fmt(gained.map((g) => ({ id: g.id, gap: -g.gap })))}.` : '',
      ].filter(Boolean),
    };
  }
  return {
    tone: 'null',
    headline: `Null effect on this model (${pts(delta)})`,
    body: [
      stat + pLine,
      'Within ±5 pts: this model resolves placeholder semantics in distilled lessons about as well as it follows verbatim rules.',
      lost.length ? `Largest residual C-only misses: ${fmt(lost)}.` : '',
    ].filter(Boolean),
  };
}

const CONDITION_ORDER = ['A', 'B', 'C0', 'C', 'D', 'E', 'E_B'];

export const DataIntelPanel = memo(function DataIntelPanel({
  runId,
  label,
  isLive,
  open,
  onToggle,
}: {
  runId: string;
  label: string;
  isLive?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [intel, setIntel] = useState<Intel | null>(null);
  const [loading, setLoading] = useState(true);
  const [cond, setCond] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setIntel(null);
    setCond('ALL');
    setExpanded(null);
    const load = async () => {
      try {
        const res = await fetch(`/api/run-intel?run=${encodeURIComponent(runId)}`, { cache: 'no-store', signal: ctrl.signal });
        const data = (await res.json()) as Intel;
        if (alive) setIntel(data);
      } catch {
        if (alive) setIntel({ runId, available: false });
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = isLive ? window.setInterval(load, 20_000) : null;
    return () => {
      alive = false;
      ctrl.abort();
      if (id !== null) window.clearInterval(id);
    };
  }, [runId, isLive]);

  const conditions = useMemo(() => {
    const keys = Object.keys(intel?.failures ?? {});
    const rank = (k: string) => (CONDITION_ORDER.includes(k) ? CONDITION_ORDER.indexOf(k) : CONDITION_ORDER.length);
    return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [intel]);

  const topFacts = useMemo(() => {
    const f = intel?.failures ?? {};
    const agg: Record<string, number> = {};
    for (const [c, map] of Object.entries(f)) {
      if (cond !== 'ALL' && c !== cond) continue;
      for (const [id, n] of Object.entries(map)) agg[id] = (agg[id] ?? 0) + n;
    }
    return Object.entries(agg).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  }, [intel, cond]);

  const hyp = intel?.available ? explainHypothesis(intel) : null;
  const maxFail = topFacts[0]?.[1] ?? 1;

  return (
    <>
      <button
        type="button"
        className={`di-toggle${open ? ' di-toggle--open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="data-intel"
        title={open ? 'Hide Data Intel (full-screen torus)' : 'Show Data Intel'}
      >
        {open ? '›' : '‹'} <span>DATA INTEL</span>
      </button>
      <aside id="data-intel" className="di" hidden={!open} aria-label={`Data Intel for ${label}`}>
        <div className="di-head">
          <span>DATA INTEL</span>
          <b>{label}</b>
        </div>

        {loading && !intel ? (
          <p className="di-empty">Loading run intelligence…</p>
        ) : !intel?.available ? (
          <p className="di-empty">No results file for <code>{runId}</code> yet. Intel appears once the run writes results.json.</p>
        ) : (
          <>
            {/* A. Run metadata */}
            <section className="di-sec">
              <h4>RUN METADATA <i>{intel.source === 'results.json' ? 'results.json' : 'snapshot'}</i></h4>
              <dl className="di-kv">
                <dt>Provider</dt><dd>{intel.provider}</dd>
                <dt>Requested</dt><dd className="di-mono">{intel.requestedModel}</dd>
                <dt>Returned</dt>
                <dd className="di-mono">
                  {intel.returnedModels && intel.returnedModels.length ? (
                    intel.returnedModels.map((r) => (
                      <span key={r.name} className={r.name === intel.requestedModel ? 'di-ok' : 'di-warn'}>
                        {r.name} <small>×{r.n}</small>
                      </span>
                    ))
                  ) : (
                    <span className="di-dim">not recorded</span>
                  )}
                </dd>
                <dt>Reasoning</dt><dd>{intel.reasoning?.mode} <small className="di-dim di-mono">{intel.reasoning?.label}</small></dd>
                <dt>Commit</dt><dd className="di-mono">{intel.gitCommit ? intel.gitCommit.slice(0, 7) : '—'}</dd>
              </dl>
              <ul className="di-hash">
                {(['facts', 'oracle'] as const).map((k) => {
                  const h = intel.integrity?.[k];
                  return (
                    <li key={k} className={h?.ok ? 'di-ok' : 'di-bad'} title={`recorded ${h?.recorded ?? '—'}\nactual   ${h?.actual ?? '—'}`}>
                      <span aria-hidden="true">{h?.ok ? '✓' : '✗'}</span>
                      <b>{k}Sha256</b>
                      <code>{short(h?.recorded)}</code>
                      <em>{h?.ok ? 'verified' : h?.recorded ? 'mismatch' : 'missing'}</em>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* B. Hypothesis */}
            {hyp && (
              <section className="di-sec">
                <h4>HYPOTHESIS · C0 vs C</h4>
                <div className={`di-hyp di-hyp--${hyp.tone}`}>
                  <strong>{hyp.headline}</strong>
                  {hyp.body.map((line) => <p key={line}>{line}</p>)}
                </div>
                <div className="di-means">
                  {conditions.filter((c) => intel.means?.[c] !== undefined).map((c) => (
                    <div key={c} className="di-mean">
                      <span>{c}</span>
                      <i><b style={{ width: pct(intel.means![c]) }} /></i>
                      <em>{pct(intel.means![c])}</em>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* C. Fact failures */}
            <section className="di-sec">
              <h4>TOP RULES MISSED</h4>
              <div className="di-chips" role="tablist" aria-label="Filter by condition">
                {['ALL', ...conditions].map((c) => (
                  <button key={c} type="button" role="tab" aria-selected={cond === c} onClick={() => setCond(c)}>{c}</button>
                ))}
              </div>
              <ol className="di-facts">
                {topFacts.length === 0 && <li className="di-dim">No failures recorded.</li>}
                {topFacts.map(([id, n]) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="di-fact"
                      aria-expanded={expanded === id}
                      onClick={() => setExpanded(expanded === id ? null : id)}
                      title={intel.statements?.[id] ?? ''}
                    >
                      <span className="di-mono">{id}</span>
                      <i><b style={{ width: `${(n / maxFail) * 100}%` }} /></i>
                      <em>{n} fail{n === 1 ? '' : 's'}</em>
                    </button>
                    {expanded === id && <p className="di-rule">{intel.statements?.[id] ?? 'Statement not found in facts.json.'}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </aside>
    </>
  );
});

export const dataIntelCss = `
.di-toggle{position:absolute;top:50%;right:0;z-index:600;transform:translateY(-50%);writing-mode:vertical-rl;padding:12px 6px!important;min-height:0!important;background:#050505!important;border:1px solid #27272a!important;border-right:none!important;color:#22d3ee!important;font-size:10px!important;letter-spacing:.2em!important;transition:right .35s cubic-bezier(.16,1,.3,1)}
.di-toggle span{margin-top:6px}
.di-toggle--open{right:var(--di-w)}
.di{position:absolute;top:0;right:0;bottom:0;width:var(--di-w);z-index:550;background:#050505;border-left:1px solid #27272a;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#3f3f46 transparent;padding:14px 14px 24px;display:flex;flex-direction:column;gap:14px;pointer-events:auto;font:12px/1.5 var(--font-sans,'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif);color:#d4d4d8}
.di[hidden]{display:none}
.di-mono,.di code,.di-head,.di h4,.di-chips button,.di-mean,.di-fact{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
.di-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #27272a;padding-bottom:10px;font-size:10px;letter-spacing:.2em;color:#71717a}
.di-head b{color:#fafafa;font-weight:600;letter-spacing:.12em}
.di-sec{border-bottom:1px solid #27272a;padding-bottom:14px;display:flex;flex-direction:column;gap:8px}
.di h4{margin:0;font-size:9.5px;font-weight:600;letter-spacing:.18em;color:#71717a;display:flex;justify-content:space-between}
.di h4 i{font-style:normal;color:#52525b;letter-spacing:.06em}
.di-kv{display:grid;grid-template-columns:78px 1fr;gap:5px 10px;margin:0;font-size:11.5px}
.di-kv dt{color:#71717a}.di-kv dd{margin:0;color:#fafafa;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:2px}
.di-kv dd.di-mono{font-size:10.5px}
.di small{font-size:9.5px}
.di-dim{color:#71717a}
.di-ok{color:#22d3ee}.di-warn{color:#fbbf24}.di-bad{color:#e879f9}
.di-hash{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.di-hash li{display:grid;grid-template-columns:14px 92px 1fr auto;gap:6px;align-items:center;font-size:10px;border:1px solid #27272a;padding:5px 7px;background:#0a0a0a}
.di-hash li b{font-weight:500;color:#a1a1aa;font-family:var(--font-mono,ui-monospace,monospace)}
.di-hash code{color:#71717a;font-size:9.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.di-hash em{font-style:normal;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
.di-hash li.di-ok span{color:#34d399;text-shadow:0 0 6px rgba(52,211,153,.6)}
.di-hyp{border:1px solid #27272a;border-left:2px solid #71717a;background:#0a0a0a;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.di-hyp strong{color:#fafafa;font-weight:600;font-size:12.5px;line-height:1.35}
.di-hyp p{margin:0;color:#a1a1aa;font-size:11.5px}
.di-hyp--c0{border-left-color:#22d3ee}.di-hyp--c0 strong{color:#a5f3fc}
.di-hyp--c{border-left-color:#e879f9}.di-hyp--c strong{color:#f5d0fe}
.di-hyp--null{border-left-color:#fbbf24}
.di-means{display:flex;flex-direction:column;gap:3px}
.di-mean,.di-fact{display:grid;grid-template-columns:36px 1fr 62px;gap:8px;align-items:center;font-size:10px;color:#a1a1aa}
.di-mean i,.di-fact i{height:3px;background:#18181b;display:block}
.di-mean i b{display:block;height:100%;background:#22d3ee;box-shadow:0 0 6px rgba(34,211,238,.5)}
.di-mean em,.di-fact em{font-style:normal;text-align:right;color:#fafafa;font-variant-numeric:tabular-nums}
.di-chips{display:flex;flex-wrap:wrap;gap:4px}
.di-chips button{padding:2px 8px!important;min-height:0!important;font-size:9.5px!important;letter-spacing:.08em!important;background:#0a0a0a!important;border:1px solid #27272a!important;color:#71717a!important}
.di-chips button[aria-selected=true]{color:#fafafa!important;border-color:#e879f9!important}
.di-facts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.di-fact{width:100%;background:none!important;border:1px solid transparent!important;padding:4px 4px!important;min-height:0!important;text-align:left;letter-spacing:normal!important;font-size:10.5px!important}
.di-fact:hover{border-color:#27272a!important}
.di-fact span{color:#f0abfc}
.di-fact i b{display:block;height:100%;background:#e879f9;box-shadow:0 0 6px rgba(232,121,249,.55)}
.di-rule{margin:2px 4px 4px;padding:7px 9px;border-left:2px solid #e879f9;background:#0a0a0a;color:#d4d4d8;font-size:11.5px}
.di-empty{color:#71717a;font-size:11.5px}
@media(max-width:900px){
  .di-toggle{display:none}
  .di{position:relative;width:auto;border-left:none;border-top:1px solid #27272a;max-height:none}
  .di[hidden]{display:flex}
  .hl[data-intel=open] .hl-canvas,.hl[data-intel=open] .hl-hud{right:auto}
}
`;
