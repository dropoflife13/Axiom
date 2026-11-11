'use client';

import * as React from 'react';
import {
  KNOT_SLICES,
  KNOT_MASK,
  KNOT_NODES,
  KNOT_LINKS,
  KNOT_GLOW,
} from './axiomLoaderData';

export interface AxiomKnotLoaderProps {
  reducedMotion?: boolean;
  className?: string;
  size?: number; // Width/height in pixels
}

const T = 7900;
const GREEN = [52, 211, 153];
const WHITE = [232, 234, 242];
const mixc = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

const sm = (x: number) => x * x * (3 - 2 * x);
const ob = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const eo = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function AxiomKnotLoader({
  reducedMotion = false,
  className = '',
  size = 170,
}: AxiomKnotLoaderProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  // References to dynamic SVG elements matching raw_original_loader.html
  const maskCirclesRef = React.useRef<SVGCircleElement[]>([]);
  const glowCirclesRef = React.useRef<SVGCircleElement[]>([]);
  const sliceGroupsRef = React.useRef<SVGGElement[]>([]);
  const nodeGroupsRef = React.useRef<SVGGElement[]>([]);
  const nodeRingsRef = React.useRef<SVGCircleElement[]>([]);
  const nodeDotsRef = React.useRef<SVGCircleElement[]>([]);
  const nodeLabelsRef = React.useRef<SVGGElement[]>([]);
  const linkPathsRef = React.useRef<SVGPathElement[]>([]);

  const t0Ref = React.useRef(performance.now());

  React.useEffect(() => {
    let animId: number;

    const updateFrame = () => {
      const now = performance.now();
      const ms = reducedMotion ? 5000 : (now - t0Ref.current) % T;

      // 0-500 empty | 500-2300 rope feeds in from the tip | 2300-3000 nodes | 2800-4300 links
      // 4300-5400 verified (green) | 5300-5900 links and nodes retract | 5800-7000 rope feeds out along the same path | empty tail
      const head = (ms < 6100 ? sm(clamp((ms - 500) / 1900)) : 1 - sm(clamp((ms - 6100) / 1500))) * (1 + 0.16);
      const tail = 0;

      // 1. A slice exists only once the rope has reached it; the tapered mask shapes the rope end
      const sg = sliceGroupsRef.current;
      for (let i = 0; i < KNOT_SLICES.length; i++) {
        const sl = KNOT_SLICES[i];
        if (sg[i]) {
          const isVisible = reducedMotion || (sl.tIn < head && sl.tOut >= tail);
          const targetDisp = isVisible ? '' : 'none';
          if (sg[i].style.display !== targetDisp) {
            sg[i].style.display = targetDisp;
          }
        }
      }

      // 2. Centerline circular masks: radius tapers to a point at head and tail
      const mc = maskCirclesRef.current;
      const gc = glowCirclesRef.current;
      const F = 0.12;
      for (let i = 0; i < KNOT_MASK.length; i++) {
        const p = KNOT_MASK[i];
        const h = head >= 1 + F ? 1 : sm(clamp((head - p.tIn) / F));
        const l = tail <= 0 ? 1 : sm(clamp((p.tOut - tail) / F));
        const k = reducedMotion ? 1 : Math.min(h, l);
        if (mc[i]) {
          mc[i].setAttribute('r', (15.8 * k).toFixed(2));
        }
        if (gc[i]) {
          gc[i].setAttribute('r', (25.0 * k).toFixed(2));
        }
      }

      // 3. Nodes with elastic bounce and verification transition
      const nodeIn = ms - 2500;
      const vp = clamp((ms - 4500) / 1200);
      const ret = clamp((ms - 5600) / 600);
      const ng = nodeGroupsRef.current;
      const nr = nodeRingsRef.current;
      const nd = nodeDotsRef.current;
      const nl = nodeLabelsRef.current;

      for (let i = 0; i < KNOT_NODES.length; i++) {
        const l = clamp((nodeIn - i * 55) / 380);
        const rr = clamp(ret * 1.6 - (i / KNOT_NODES.length) * 0.6);
        const s = reducedMotion ? 1 : (l <= 0 ? 0 : ob(l)) * (1 - eo(rr));

        if (nd[i]) {
          nd[i].setAttribute('r', (3.4 * Math.max(s, 0)).toFixed(2));
          nd[i].setAttribute('fill', mixc(WHITE, GREEN, eo(clamp(vp * 1.6 - (i / KNOT_NODES.length) * 0.6))));
        }
        if (ng[i]) {
          ng[i].style.opacity = reducedMotion || (l > 0 && rr < 1) ? '1' : '0';
        }
        if (nr[i]) {
          const rg = clamp((nodeIn - i * 55) / 700);
          nr[i].setAttribute('r', (3 + rg * 11).toFixed(2));
          nr[i].style.opacity = ((1 - rg) * 0.8 * (ret > 0 ? 0 : 1)).toFixed(2);
        }
      }

      // 4. Outer diagnostic node labels
      let labelIdx = 0;
      for (let i = 0; i < KNOT_NODES.length; i++) {
        if (KNOT_NODES[i].hasLabel) {
          if (nl[labelIdx]) {
            const l = clamp((nodeIn - i * 55 - 250) / 300) * (1 - clamp(ret * 2));
            nl[labelIdx].style.opacity = reducedMotion ? '1' : l.toFixed(2);
          }
          labelIdx++;
        }
      }

      // 5. Interconnecting topological links shooting across
      const lp = linkPathsRef.current;
      for (let n = 0; n < KNOT_LINKS.length; n++) {
        const L = KNOT_LINKS[n];
        if (lp[n]) {
          const l = clamp((ms - 3000 - L.start * 80) / 520);
          const rr = clamp(ret * 1.5 - (L.start / KNOT_LINKS.length) * 0.5);
          const dash = rr > 0 ? -eo(rr) : 1 - eo(l);
          lp[n].setAttribute('stroke-dashoffset', reducedMotion ? '0' : dash.toFixed(3));
          lp[n].style.opacity = reducedMotion || (l > 0 && rr < 1) ? '1' : '0';
          const lv = clamp(vp * 1.6 - (((L.i + L.j) / 2) / KNOT_NODES.length) * 0.6);
          lp[n].setAttribute('stroke', lv > 0 ? mixc([120, 160, 245], GREEN, eo(lv)) : 'url(#lg-loader)');
        }
      }

      animId = requestAnimationFrame(updateFrame);
    };

    animId = requestAnimationFrame(updateFrame);
    return () => cancelAnimationFrame(animId);
  }, [reducedMotion]);

  const handleReplay = React.useCallback(() => {
    t0Ref.current = performance.now();
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="-44 -40 344 336"
      width={size}
      height={size}
      role="img"
      aria-label="Axiom logo assembling and linking its parts"
      className={`axiom-knot-loader ${className}`}
      onClick={handleReplay}
      style={{
        overflow: 'visible',
        display: 'block',
        cursor: 'pointer',
      }}
    >
      <defs>
        <filter id="glow-loader" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="soft-loader" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <mask id="mR-loader" maskUnits="userSpaceOnUse" x="-60" y="-60" width="380" height="380">
          <g fill="#fff">
            {KNOT_MASK.map((pt, i) => (
              <circle
                key={`mR-${i}`}
                ref={(el) => {
                  if (el) maskCirclesRef.current[i] = el;
                }}
                cx={pt.x}
                cy={pt.y}
                r={0}
              />
            ))}
          </g>
        </mask>
        <mask id="mG-loader" maskUnits="userSpaceOnUse" x="-60" y="-60" width="380" height="380">
          <g fill="#fff">
            {KNOT_MASK.map((pt, i) => (
              <circle
                key={`mG-${i}`}
                ref={(el) => {
                  if (el) glowCirclesRef.current[i] = el;
                }}
                cx={pt.x}
                cy={pt.y}
                r={0}
              />
            ))}
          </g>
        </mask>
        <linearGradient id="lg-loader" gradientUnits="userSpaceOnUse" x1="20" y1="200" x2="240" y2="60">
          <stop offset="0%" stopColor="#b675f8" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      {/* Radiant Plasma Glow Underlay */}
      <g mask="url(#mG-loader)" style={{ display: 'none' }}>
        <g filter="url(#glow-loader)" opacity="0.55" fill="none" strokeLinecap="round" strokeWidth="27">
          {KNOT_GLOW.map((g, i) => (
            <path key={`glow-${i}`} d={g.d} stroke={g.stroke} />
          ))}
        </g>
      </g>

      {/* 300 Hollow Tube Slices (rebuilt colored + dark inner stroke pairs) */}
      <g mask="url(#mR-loader)">
        <g fill="none" strokeLinecap="butt">
          {KNOT_SLICES.map((sl, i) => (
            <g
              key={`slice-${i}`}
              ref={(el) => {
                if (el) sliceGroupsRef.current[i] = el;
              }}
              style={{ display: 'none' }}
            >
              {/* Outer colored wall */}
              <path d={sl.d} stroke={sl.col} strokeWidth="30" />
              {/* Dark inner cavity */}
              <path d={sl.d} stroke="#05060a" strokeWidth="18.6" />
            </g>
          ))}
        </g>
      </g>

      {/* Interconnecting Topological Cybernetic Links */}
      <g fill="none" strokeLinecap="round">
        {KNOT_LINKS.map((link, n) => (
          <path
            key={`link-${n}`}
            ref={(el) => {
              if (el) linkPathsRef.current[n] = el;
            }}
            d={link.pathD}
            pathLength="1"
            stroke="url(#lg-loader)"
            strokeWidth="1.6"
            strokeDasharray="1 1"
            strokeDashoffset="1"
            style={{ opacity: 0 }}
          />
        ))}
      </g>

      {/* 10 Diagnostic Invariant Nodes */}
      <g>
        {KNOT_NODES.map((node, i) => (
          <g
            key={`node-${i}`}
            ref={(el) => {
              if (el) nodeGroupsRef.current[i] = el;
            }}
            transform={`translate(${node.x} ${node.y})`}
            style={{ opacity: 0 }}
          >
            {/* Pulsing Sonar Ring */}
            <circle
              ref={(el) => {
                if (el) nodeRingsRef.current[i] = el;
              }}
              r={3}
              fill="none"
              stroke="#fff"
              strokeWidth="1"
            />
            {/* Core Diagnostic Dot */}
            <circle
              ref={(el) => {
                if (el) nodeDotsRef.current[i] = el;
              }}
              r={3.4}
              fill="#e8eaf2"
            />
          </g>
        ))}
      </g>

      {/* Outer Node Diagnostic Labels (with Leader Lines) */}
      <g>
        {KNOT_NODES.filter((n) => n.hasLabel).map((node, i) => (
          <g
            key={`label-${node.i}`}
            ref={(el) => {
              if (el) nodeLabelsRef.current[i] = el;
            }}
            transform={`translate(${node.x} ${node.y})`}
            style={{ opacity: 0 }}
          >
            <line
              x1={node.ux * 5}
              y1={node.uy * 5}
              x2={node.labelX2}
              y2={node.labelY2}
              stroke="#7c819a"
              strokeWidth="0.6"
            />
            <text
              x={node.textX}
              y={node.labelY2}
              textAnchor={node.textAnchor}
              dominantBaseline="middle"
              style={{
                paintOrder: 'stroke',
                stroke: '#05060a',
                strokeWidth: '3px',
                strokeLinejoin: 'round',
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'JetBrains Mono', monospace",
                fontWeight: 500,
                fontSize: '8px',
                fill: '#9aa0c0',
                letterSpacing: '0.06em',
              }}
            >
              {node.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default AxiomKnotLoader;
