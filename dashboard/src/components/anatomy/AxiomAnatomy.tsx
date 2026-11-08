'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { AxiomLogo } from '@/components/AxiomLogo';
import type { CheckpointTrial, DeskData } from '@/lib/desk';

export interface AxiomAnatomyProps {
  checkpoint?: CheckpointTrial[];
  desk?: DeskData;
  running?: boolean;
  snapshot?: { runId: string; commit: string; isLive?: boolean; model?: string; awaiting?: boolean };
}

export interface AssemblyNode {
  id: string;
  name: string;
  badge: string;
  color: number;
  pos: [number, number, number];
  size: [number, number, number];
  file: string;
  desc: string;
  top?: number;
}

export interface AssemblySpec {
  id: string;
  name: string;
  badge: string;
  desc: string;
  fileLocation: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: string;
  type: string;
}

/* Palette: Flat functional tones from Axiom Core */
const C_GEN = 0xa855f7;     // Violet
const C_VER = 0x22d3ee;     // Cyan
const C_FAIL = 0xf43f5e;    // Rose
const C_ADV = 0xfbbf24;     // Amber
const C_PASS = 0x34d399;    // Emerald
const C_CHASSIS = 0x94a3b8; // Slate

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/* The 12 Axiom Assemblies */
export const NODES: AssemblyNode[] = [
  {
    id: '01',
    name: 'TASK BANK',
    badge: '40 · 40 · 120 SPLITS',
    color: C_CHASSIS,
    pos: [-5.0, 0, -4.2],
    size: [1.3, 0.9, 0.9],
    file: 'fixtures/task-v2/tasks.json',
    desc: 'Seeded tasks split into 40 Train, 40 Dev and 120 held-out Test tasks. Strict schema invariants, never corrected SQL.',
  },
  {
    id: '04',
    name: 'CONDITIONS',
    badge: 'A B C C0 D E_B',
    color: C_VER,
    pos: [-2.6, 0, -5.2],
    size: [1.4, 0.8, 0.9],
    file: 'src/eval/ablation.ts',
    desc: 'Assembles the prompt for the six ablation conditions: baseline, golden rules, retrieved lessons, verbatim facts, placebo and the Tier 0 control.',
  },
  {
    id: '02',
    name: 'RETRIEVAL',
    badge: 'K=10 · OVERLAP RANK',
    color: C_VER,
    pos: [0.4, 0, -5.4],
    size: [1.3, 0.8, 0.9],
    file: 'src/memory.ts',
    desc: 'Reads the task feature flags and ranks stored lessons by train failure frequency and feature match, then picks the top K before attempt 1.',
  },
  {
    id: '03',
    name: 'LESSON STORE',
    badge: 'READ-ONLY · SHA-256',
    color: C_PASS,
    pos: [5.4, 0, -3.4],
    size: [1.3, 0.9, 0.9],
    file: 'fixtures/memory.json',
    desc: 'Immutable memory vault. Lessons are calibrated on Train, loaded read-only and checked by SHA-256 hash so nothing leaks in at run time.',
  },
  {
    id: '06',
    name: 'GUARDRAILS',
    badge: 'FAIL-CLOSED · CACHE',
    color: C_CHASSIS,
    pos: [-5.0, 0, -1.0],
    size: [1.2, 0.8, 0.9],
    file: 'src/guardrails.ts',
    desc: 'Fails closed on the daily budget cap, backs off exponentially on HTTP 429 and 503, and serves SHA-256 disk-cached model responses.',
  },
  {
    id: '05',
    name: 'EXECUTOR',
    badge: 'NEMOTRON-3 · T=0',
    color: C_GEN,
    pos: [-3.4, 0, 1.2],
    size: [1.7, 1.2, 1.3],
    file: 'src/executor.ts',
    desc: 'The generative core. Calls the model through an OpenAI-compatible client at temperature 0 with token ceilings and produces candidate migration SQL.',
  },
  {
    id: '07',
    name: 'ORACLE CRUCIBLE',
    badge: 'PG 16 · 34 FACTS',
    color: C_VER,
    pos: [0.0, 0, 0.4],
    size: [2.1, 1.4, 1.6],
    file: 'scripts/oracle.ts',
    desc: 'The ground-truth reactor. PostgreSQL 16 in Docker runs the migration as deployer, then probes 34 behavioral facts as application.',
  },
  {
    id: '08',
    name: 'VERDICT',
    badge: 'FACT IDS ONLY',
    color: C_FAIL,
    pos: [3.4, 0, 1.2],
    size: [1.4, 1.0, 1.1],
    file: 'scripts/facts.ts',
    desc: 'Reports failures strictly as fact IDs and one-line statements. It never leaks corrected SQL back to the model.',
  },
  {
    id: '12',
    name: 'ADVISOR',
    badge: '< 24 WORDS · GATED',
    color: C_ADV,
    pos: [0.0, 0, 4.4],
    size: [1.3, 0.9, 0.9],
    file: 'src/advisor.ts',
    desc: 'Distills a failed verdict into a rule under 24 words. The lesson stays pending until the next retry passes.',
  },
  {
    id: '09',
    name: 'SCORER',
    badge: 'BOUND FACTS · F-13',
    color: C_CHASSIS,
    pos: [-3.2, 0, 4.6],
    size: [1.2, 0.8, 0.8],
    file: 'src/eval/ablation.ts',
    desc: 'Scores each task on its bound facts only. A missing target table (F-13) scores zero.',
  },
  {
    id: '10',
    name: 'CHECKPOINT',
    badge: '720 PROVENANCE TRIALS',
    color: C_PASS,
    pos: [5.0, 0, 3.0],
    size: [1.4, 0.9, 1.0],
    file: 'fixtures/checkpoint.json',
    desc: 'Twin ledger. Commits every trial record and its hash right after the trial, so a run can resume after an interruption.',
  },
  {
    id: '11',
    name: 'ANALYSIS',
    badge: 'SIGN-FLIP · HOLM',
    color: C_VER,
    pos: [3.0, 0, 5.4],
    size: [1.3, 0.8, 0.9],
    file: 'scripts/analyze-ablation-v2.ts',
    desc: 'Offline statistics after all 720 trials: paired sign-flip tests, bootstrap intervals, exact McNemar and Holm-Bonferroni correction.',
  },
];

export const BY_ID: Record<string, AssemblyNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

export const ASSEMBLIES: AssemblySpec[] = NODES.map((n) => ({
  id: n.id,
  name: n.name,
  badge: n.badge,
  desc: n.desc,
  fileLocation: n.file,
  x: n.pos[0],
  y: n.pos[2],
  w: n.size[0],
  d: n.size[2],
  h: n.size[1],
  color: hex(n.color),
  type: 'matrix',
}));

/* The 12 Buses */
export const EDGES: [string, string, number][] = [
  ['01', '04', C_CHASSIS],
  ['04', '02', C_VER],
  ['02', '03', C_PASS],
  ['02', '06', C_VER],
  ['06', '05', C_GEN],
  ['05', '07', C_GEN],
  ['07', '08', C_FAIL],
  ['08', '12', C_FAIL],
  ['12', '05', C_GEN],
  ['08', '10', C_PASS],
  ['10', '03', C_PASS],
  ['10', '11', C_VER],
];

const ek = (a: string, b: string) => `${a}-${b}`;

/* The Healing Loop Stages */
export const STAGES = [
  { name: 'GENERATE', node: '05', edges: ['06-05', '02-06'], color: C_GEN, msg: '[EXECUTOR] Prompt compiled at T=0 · candidate SQL generated' },
  { name: 'VERIFY',   node: '07', edges: ['05-07'],           color: C_VER, msg: '[ORACLE CRUCIBLE] Fresh PG 16 container · migration deployed as deployer' },
  { name: 'FAIL',     node: '08', edges: ['07-08', '08-12'],  color: C_FAIL, msg: '[VERDICT] 34 facts probed · tripped invariants: F-05 F-19 F-20' },
  { name: 'ADVISE',   node: '12', edges: ['08-12'],           color: C_ADV, msg: '[ADVISOR] Failure distilled into a lesson under 24 words · queued for retry' },
  { name: 'RETRY',    node: '05', edges: ['12-05'],           color: C_GEN, msg: '[EXECUTOR] Retry with advice injected · regenerating migration SQL' },
  { name: 'PASS',     node: '10', edges: ['08-10', '10-03'],  color: C_PASS, msg: '[CHECKPOINT] Bound facts 100% verified · provenance hash committed to ledger' },
];

/* Shaders: Holographic Fresnel & Scanline Sweep */
const SHELL_VERT = `
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SHELL_FRAG = `
uniform vec3 uColor; uniform float uI; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  float f  = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float sc = smoothstep(0.44, 0.5, abs(fract(vW.y * 9.0 - uT * 0.35) - 0.5));
  float sw = pow(max(0.0, sin(vW.y * 2.2 - uT * 1.4)), 18.0);
  float a  = clamp((f * 0.9 + sc * 0.16 + sw * 0.3) * uI, 0.0, 1.0);
  gl_FragColor = vec4(uColor * (0.5 + f * 1.5) + vec3(sw * 0.3), a);
}`;

function rbox(w: number, h: number, d: number, r: number) {
  const g = new THREE.BoxGeometry(w, h, d, 10, 10, 10);
  const p = g.attributes.position;
  const nm = g.attributes.normal;
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(
      Math.max(-hx, Math.min(hx, v.x)),
      Math.max(-hy, Math.min(hy, v.y)),
      Math.max(-hz, Math.min(hz, v.z))
    );
    const o = v.clone().sub(q);
    if (o.lengthSq() > 1e-8) {
      o.normalize();
      v.copy(q).addScaledVector(o, r);
      nm.setXYZ(i, o.x, o.y, o.z);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function geoFor(n: AssemblyNode): THREE.BufferGeometry {
  const [w, h, d] = n.size;
  switch (n.id) {
    case '07':
      return new THREE.SphereGeometry(Math.max(w, h, d) * 0.5, 48, 32);
    case '05':
      return new THREE.SphereGeometry(Math.max(w, h) * 0.5, 40, 28);
    case '03':
    case '10':
      return new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 1.05, 8);
    case '01':
      return new THREE.CylinderGeometry(w * 0.38, w * 0.38, h * 1.1, 32);
    case '12':
      return new THREE.CylinderGeometry(w * 0.34, w * 0.34, h * 1.3, 32);
    case '02':
      return new THREE.CylinderGeometry(w * 0.5, w * 0.14, h * 1.1, 32);
    default:
      return rbox(w, h, d, Math.min(w, h, d) * 0.22);
  }
}

function getAdj(id: string) {
  const from: string[] = [];
  const to: string[] = [];
  EDGES.forEach((e) => {
    if (e[1] === id && BY_ID[e[0]]) from.push(`${e[0]} ${BY_ID[e[0]].name}`);
    if (e[0] === id && BY_ID[e[1]]) to.push(`${e[1]} ${BY_ID[e[1]].name}`);
  });
  return {
    from: from.join(' · ') || 'task prompt',
    to: to.join(' · ') || 'end of pipeline',
  };
}

const FREQ_LABELS = ['60', '125', '250', '500', '1k', '2k', '4k', '8k', '12k', '16k', '24k', '32k'];
const CONDITIONS = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;

export const AxiomAnatomy = React.memo(function AxiomAnatomy({
  checkpoint,
  running: initialRunning = true,
  snapshot,
}: AxiomAnatomyProps = {}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const labelsRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [selId, setSelId] = React.useState('07'); // Default: Oracle Crucible
  const [stageIdx, setStageIdx] = React.useState(0);
  const [looping, setLooping] = React.useState(initialRunning);
  const [rotating, setRotating] = React.useState(true);
  const [exploded, setExploded] = React.useState(false);
  const [webglError, setWebglError] = React.useState(false);

  // Fast direct DOM readout refs (avoids re-rendering the whole component per frame)
  const azRef = React.useRef<HTMLElement>(null);
  const elRef = React.useRef<HTMLElement>(null);
  const turnSliderRef = React.useRef<HTMLInputElement>(null);
  const turnOutRef = React.useRef<HTMLOutputElement>(null);

  // State ref for high-frequency animation loop
  const stateRef = React.useRef({
    selId: '07',
    hoverId: null as string | null,
    stageIdx: 0,
    looping: initialRunning,
    rotating: true,
    exploded: false,
    draggingSlider: false,
    targetView: null as { theta: number; phi: number; r: number } | null,
  });

  stateRef.current.selId = selId;
  stateRef.current.stageIdx = stageIdx;
  stateRef.current.looping = looping;
  stateRef.current.rotating = rotating;
  stateRef.current.exploded = exploded;

  // Active Model & Metadata
  const activeRunId = snapshot?.runId ?? 'nemotron-1';
  const activeCommit = snapshot?.commit ?? '7ebae83';
  const isLive = Boolean(snapshot?.isLive);
  const activeModel =
    snapshot?.model ??
    (activeRunId === 'qwen27b-1' ? 'qwen/qwen3.8-27b' : 'nvidia/nemotron-3-ultra-550b-a55b');

  // Compute live telemetry from checkpoint
  const trialCount = checkpoint ? checkpoint.length : (activeRunId === 'qwen27b-1' ? 76 : 476);
  const conditionCounts = React.useMemo(() => {
    return CONDITIONS.map((c) => {
      if (checkpoint && checkpoint.length > 0) {
        return checkpoint.filter((t) => t.condition === c).length;
      }
      return Math.min(120, Math.floor(trialCount / 6));
    });
  }, [checkpoint, trialCount]);

  // Preset Views
  const setCameraView = React.useCallback((view: 'front' | 'side' | 'top' | 'iso') => {
    const dist = window.innerWidth / window.innerHeight < 0.9 ? 19 : 13.5;
    const VIEWS = {
      front: { theta: 0, phi: Math.PI / 2 },
      side:  { theta: Math.PI / 2, phi: Math.PI / 2 },
      top:   { theta: 0, phi: 0.12 },
      iso:   { theta: 0.62, phi: 1.1 },
    };
    const v = VIEWS[view];
    stateRef.current.rotating = false;
    setRotating(false);
    stateRef.current.targetView = { theta: v.theta, phi: v.phi, r: dist };
  }, []);

  // Three.js Mount & Animation Loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const labelsEl = labelsRef.current;
    const container = containerRef.current;
    if (!canvas || !labelsEl || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x05060a, 0);

    const labelRenderer = new CSS2DRenderer({ element: labelsEl });

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x0a0716, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 9, 6);
    scene.add(key);

    const rim = new THREE.PointLight(0x22d3ee, 1.2, 40);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    const fill = new THREE.PointLight(0xa855f7, 1.0, 40);
    fill.position.set(8, 3, 8);
    scene.add(fill);

    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    const ctl = new OrbitControls(cam, canvas);
    ctl.enablePan = false;
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 7;
    ctl.maxDistance = 26;
    ctl.minPolarAngle = 0.05;
    ctl.maxPolarAngle = Math.PI / 2 + 0.35;
    ctl.autoRotateSpeed = 1.4;
    ctl.target.set(0, -2.6, 0.8);

    const T = { value: 0 };
    const FLOOR = -3.7;
    const R = 6.6;

    // Floor: turntable degree ring + blueprint grid
    const p: number[] = [];
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const isLong = d % 30 === 0;
      const r2 = R + (isLong ? 0.34 : 0.15);
      p.push(Math.sin(a) * R, FLOOR, Math.cos(a) * R, Math.sin(a) * r2, FLOOR, Math.cos(a) * r2);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(floorGeo, new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.55 })));

    const circ: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * Math.PI * 2;
      circ.push(new THREE.Vector3(Math.sin(t) * R, FLOOR, Math.cos(t) * R));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.4 })));

    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), new THREE.MeshBasicMaterial({ color: 0xe8eaf2 }));
    m.position.set(0, FLOOR, R + 0.7);
    m.rotation.y = Math.PI / 4;
    scene.add(m); // 0 deg = front

    const grid = new THREE.GridHelper(40, 40, 0x2a3160, 0x141936);
    grid.position.y = FLOOR - 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    // Starfield particles
    const starCount = 600;
    const starP = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 15;
      const s = Math.sqrt(1 - u * u);
      starP[i * 3] = r * s * Math.cos(t);
      starP[i * 3 + 1] = r * u;
      starP[i * 3 + 2] = r * s * Math.sin(t);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starP, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xa0aaff, size: 0.12, transparent: true, opacity: 0.5, sizeAttenuation: true })));

    // Assemblies
    const shells: THREE.Mesh[] = [];
    const rec: Record<
      string,
      {
        n: AssemblyNode;
        g: THREE.Group;
        uni: { uColor: { value: THREE.Color }; uI: { value: number }; uT: { value: number } };
        edgeMat: THREE.LineBasicMaterial;
        core: THREE.Mesh;
        drop: THREE.Mesh;
        el: HTMLDivElement;
        shell: THREE.Mesh;
      }
    > = {};

    NODES.forEach((n) => {
      const g = new THREE.Group();
      scene.add(g);
      const geo = geoFor(n);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      n.pos[1] = -3.7 + 0.2 - bb.min.y;
      n.top = n.pos[1] + bb.max.y;

      const body = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: n.color,
          roughness: 0.32,
          metalness: 0.1,
          emissive: n.color,
          emissiveIntensity: 0.18,
        })
      );
      body.userData.id = n.id;
      g.add(body);

      const pr = Math.max(n.size[0], n.size[2]) * 0.72;
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(pr, pr * 1.06, 0.16, 48),
        new THREE.MeshStandardMaterial({
          color: 0x141a2e,
          roughness: 0.5,
          metalness: 0.4,
          emissive: n.color,
          emissiveIntensity: 0.12,
        })
      );
      plinth.position.y = bb.min.y - 0.08;
      plinth.userData.id = n.id;
      g.add(plinth);

      const pring = new THREE.Mesh(
        new THREE.TorusGeometry(pr * 1.02, 0.012, 8, 64),
        new THREE.MeshBasicMaterial({ color: n.color })
      );
      pring.rotation.x = Math.PI / 2;
      pring.position.y = bb.min.y;
      g.add(pring);

      if (n.id === '07') {
        const rg = new THREE.Mesh(
          new THREE.TorusGeometry(n.size[0] * 0.68, 0.05, 16, 96),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        rg.rotation.x = Math.PI / 2.4;
        g.add(rg);
      }

      const uni = { uColor: { value: new THREE.Color(n.color) }, uI: { value: 0.65 }, uT: T };
      const shell = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms: uni,
          vertexShader: SHELL_VERT,
          fragmentShader: SHELL_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      );
      shell.userData.id = n.id;
      shell.scale.setScalar(1.035);
      g.add(shell);
      shells.push(shell);

      const edgeMat = new THREE.LineBasicMaterial({
        color: n.color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, n.id === '07' ? 1 : 20), edgeMat));

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: n.color }));
      g.add(core);

      // Floor drop line
      const drop = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 1, 0.008),
        new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.4 })
      );
      drop.visible = false;
      g.add(drop);

      // CSS2D Floating Label
      const el = document.createElement('div');
      el.className = 'lbl';
      el.style.setProperty('--c', hex(n.color));
      el.innerHTML = `<span>${n.id} · ${n.name}</span><small>${n.badge}</small>`;
      const lbl = new CSS2DObject(el);
      lbl.position.set(0, Math.max(n.size[1] * 0.62, 0.45) + 0.28, 0);
      g.add(lbl);

      rec[n.id] = { n, g, uni, edgeMat, core, drop, el, shell };
    });

    // Buses
    const buses = EDGES.map((e, i) => {
      const pos = new Float32Array(12);
      const A = BY_ID[e[0]].pos;
      const B = BY_ID[e[1]].pos;
      const yA = BY_ID[e[0]].top ?? 0;
      const yB = BY_ID[e[1]].top ?? 0;
      const H = Math.max(yA, yB) + 1.1;
      pos.set([A[0], yA, A[2], A[0], H, A[2], B[0], H, B[2], B[0], yB, B[2]]);

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: e[2],
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      const pk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(pk);
      return { a: e[0], b: e[1], key: ek(e[0], e[1]), pos, geom, mat, pk, phase: i / EDGES.length };
    });

    // Spherical Camera Helpers
    const wrap = (a: number) => {
      const t = Math.PI * 2;
      return ((a + Math.PI) % t + t) % t - Math.PI;
    };
    const sph = new THREE.Spherical();
    const tmp = new THREE.Vector3();

    const readSph = () => {
      tmp.copy(cam.position).sub(ctl.target);
      sph.setFromVector3(tmp);
      return sph;
    };

    const applySph = () => {
      tmp.setFromSpherical(sph).add(ctl.target);
      cam.position.copy(tmp);
      cam.lookAt(ctl.target);
    };

    const dist = () => (container.clientWidth / container.clientHeight < 0.9 ? 19 : 13.5);

    // Initial Camera Setup
    cam.position.set(0, 4.2, dist());
    const s0 = readSph();
    s0.theta = 0.62; // Iso
    s0.phi = 1.1;
    applySph();
    ctl.update();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Viewport IntersectionObserver to pause rendering when offscreen (eliminates GPU contention)
    let isVisible = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.02 }
    );
    visibilityObserver.observe(container);

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Raycaster Picking
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;

    const pick = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(shells, false)[0];
      return hit ? (hit.object.userData.id as string) : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const id = pick(e);
      if (id) {
        setLooping(false);
        stateRef.current.looping = false;
        setSelId(id);
        const matchIdx = STAGES.findIndex((s) => s.node === id);
        if (matchIdx >= 0) setStageIdx(matchIdx);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const id = pick(e);
      stateRef.current.hoverId = id;
      canvas.style.cursor = id ? 'pointer' : '';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    // Turntable Scrub Slider
    const slider = turnSliderRef.current;
    const onSliderInput = () => {
      if (!slider) return;
      stateRef.current.rotating = false;
      setRotating(false);
      stateRef.current.targetView = null;
      const s = readSph();
      s.theta = wrap((parseFloat(slider.value) * Math.PI) / 180);
      applySph();
      ctl.update();
      if (turnOutRef.current) turnOutRef.current.textContent = `${slider.value}°`;
    };

    const onSliderDown = () => {
      stateRef.current.draggingSlider = true;
    };

    const onSliderUp = () => {
      stateRef.current.draggingSlider = false;
    };

    if (slider) {
      slider.addEventListener('input', onSliderInput);
      slider.addEventListener('pointerdown', onSliderDown);
      window.addEventListener('pointerup', onSliderUp);
    }

    ctl.addEventListener('start', () => {
      stateRef.current.targetView = null;
    });

    // Main 60FPS Render Loop
    let animId: number;
    let last = performance.now();
    let factor = 1;
    let lastAzR = -1;
    let lastElR = -999;

    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);

      // Skip render when tab is hidden or element is scrolled out of viewport
      if (!isVisible || document.hidden) {
        last = now;
        return;
      }

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T.value += dt;

      const {
        selId: curSel,
        hoverId: curHov,
        stageIdx: curStage,
        rotating: isRot,
        exploded: isExp,
        draggingSlider,
        targetView,
      } = stateRef.current;

      const targetFactor = isExp ? 1.4 : 1;
      const factorMoving = Math.abs(targetFactor - factor) > 0.001;
      factor += (targetFactor - factor) * 0.08;
      ctl.autoRotate = isRot;

      const st = STAGES[curStage];
      const active: Record<string, boolean> = {};
      st.edges.forEach((k) => {
        active[k] = true;
      });

      NODES.forEach((n, i) => {
        const r = rec[n.id];
        if (!r) return;
        const isSel = n.id === curSel;
        const isHov = n.id === curHov;
        const isAct = n.id === st.node;

        r.g.position.set(
          n.pos[0] * factor,
          -3.7 + (n.pos[1] + 3.7) * factor + Math.sin(T.value * 0.9 + i) * 0.035,
          n.pos[2] * factor
        );

        const tI = isSel ? 1.5 : isAct ? 1.25 : isHov ? 1.1 : 0.65;
        r.uni.uI.value += (tI - r.uni.uI.value) * 0.12;

        const tE = isSel ? 1 : isAct ? 0.95 : isHov ? 0.9 : 0.6;
        r.edgeMat.opacity += (tE - r.edgeMat.opacity) * 0.12;

        r.core.rotation.y += dt * 1.2;
        r.core.rotation.x += dt * 0.7;
        const cs = 1 + (isSel || isAct ? 0.5 + Math.sin(T.value * 5) * 0.12 : 0);
        r.core.scale.setScalar(cs);

        if (r.drop.visible !== isSel) r.drop.visible = isSel;
        if (isSel && (factorMoving || !r.drop.visible)) {
          const h = Math.abs(FLOOR - r.g.position.y);
          r.drop.scale.y = h;
          r.drop.position.y = -h / 2;
        }

        const nextCls = `lbl ${isSel ? 'sel' : ''} ${isAct ? 'act' : ''}`;
        if (r.el.className !== nextCls) {
          r.el.className = nextCls;
        }
      });

      buses.forEach((b) => {
        const A = BY_ID[b.a].pos;
        const B = BY_ID[b.b].pos;
        const f = factor;
        const p = b.pos;
        const lf = (y: number) => -3.7 + (y + 3.7) * f;
        const yA = lf(BY_ID[b.a].top ?? 0);
        const yB = lf(BY_ID[b.b].top ?? 0);
        const H = Math.max(yA, yB) + 1.1;

        p.set([A[0] * f, yA, A[2] * f, A[0] * f, H, A[2] * f, B[0] * f, H, B[2] * f, B[0] * f, yB, B[2] * f]);
        b.geom.attributes.position.needsUpdate = true;

        const isAct = Boolean(active[b.key]);
        const touches = b.a === curSel || b.b === curSel;
        const tO = isAct ? 1 : touches ? 0.7 : 0.3;
        b.mat.opacity += (tO - b.mat.opacity) * 0.15;

        const segs: [number, number][] = [];
        let total = 0;
        for (let i = 0; i < 3; i++) {
          const len = Math.hypot(p[(i + 1) * 3] - p[i * 3], p[(i + 1) * 3 + 1] - p[i * 3 + 1], p[(i + 1) * 3 + 2] - p[i * 3 + 2]);
          segs.push([total, len]);
          total += len;
        }

        const u = ((T.value * (isAct ? 0.45 : 0.12) + b.phase) % 1) * total;
        for (let j = 0; j < 3; j++) {
          if (u <= segs[j][0] + segs[j][1] || j === 2) {
            const k = segs[j][1] > 0 ? Math.min(1, Math.max(0, (u - segs[j][0]) / segs[j][1])) : 0;
            b.pk.position.set(
              p[j * 3] + (p[(j + 1) * 3] - p[j * 3]) * k,
              p[j * 3 + 1] + (p[(j + 1) * 3 + 1] - p[j * 3 + 1]) * k,
              p[j * 3 + 2] + (p[(j + 1) * 3 + 2] - p[j * 3 + 2]) * k
            );
            break;
          }
        }
        b.pk.scale.setScalar(isAct ? 1.5 : 0.9);
      });

      // Target View Camera Tween
      if (targetView) {
        const s = readSph();
        const dT = wrap(targetView.theta - s.theta);
        s.theta += dT * 0.14;
        s.phi += (targetView.phi - s.phi) * 0.14;
        s.radius += (targetView.r - s.radius) * 0.14;
        applySph();
        if (Math.abs(dT) < 0.003 && Math.abs(targetView.phi - s.phi) < 0.003 && Math.abs(targetView.r - s.radius) < 0.03) {
          stateRef.current.targetView = null;
        }
      }

      ctl.update();

      const az = ((ctl.getAzimuthalAngle() * 180) / Math.PI + 360) % 360;
      const el = 90 - (ctl.getPolarAngle() * 180) / Math.PI;
      const azR = Math.round(az) % 360;
      const elR = Math.round(el);

      if (azR !== lastAzR) {
        lastAzR = azR;
        if (azRef.current) azRef.current.textContent = `${String(azR).padStart(3, '0')}°`;
        if (!draggingSlider && slider && turnOutRef.current) {
          slider.value = String(azR);
          turnOutRef.current.textContent = `${azR}°`;
        }
      }

      if (elR !== lastElR) {
        lastElR = elR;
        if (elRef.current) elRef.current.textContent = `${elR < 0 ? '−' : ''}${String(Math.abs(elR)).padStart(2, '0')}°`;
      }

      renderer.render(scene, cam);
      labelRenderer.render(scene, cam);
    };

    animId = requestAnimationFrame(frame);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      if (slider) {
        slider.removeEventListener('input', onSliderInput);
        slider.removeEventListener('pointerdown', onSliderDown);
        window.removeEventListener('pointerup', onSliderUp);
      }
      ctl.dispose();
      renderer.dispose();
      shells.forEach((s) => {
        s.geometry.dispose();
        (s.material as THREE.Material).dispose();
      });
      buses.forEach((b) => {
        b.geom.dispose();
        b.mat.dispose();
      });
    };
  }, []);

  // Stage Cycle Timer (1.5s per step when loop is active)
  React.useEffect(() => {
    if (!looping) return;
    const interval = setInterval(() => {
      setStageIdx((prev) => {
        const next = (prev + 1) % STAGES.length;
        setSelId(STAGES[next].node);
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [looping]);

  // Keyboard Shortcuts (L, R, Space)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target && /input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'r') {
        setRotating((r) => !r);
        stateRef.current.targetView = null;
      } else if (k === 'l') {
        setLooping((l) => {
          const next = !l;
          if (next) setSelId(STAGES[stageIdx].node);
          return next;
        });
      } else if (e.code === 'Space' || k === ' ') {
        e.preventDefault();
        setExploded((exp) => !exp);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stageIdx]);

  const selectedNode = BY_ID[selId] || NODES[6];
  const selectedAdj = getAdj(selId);
  const currentStage = STAGES[stageIdx];
  const selectedBadge =
    selId === '05' && activeModel
      ? activeModel.split('/').pop()?.toUpperCase()
      : selectedNode.badge;

  // Harmonic Frequency EQ levels
  const freqLevels = React.useMemo(() => {
    return FREQ_LABELS.map((_, i) => {
      const isPeakBand = i % 6 === stageIdx;
      const base = 25 + Math.sin(stageIdx * 1.5 + i * 0.9) * 20;
      return Math.min(100, Math.max(15, base + (isPeakBand ? 45 : 0)));
    });
  }, [stageIdx]);

  return (
    <div
      ref={containerRef}
      className="axm-360-root"
      role="region"
      aria-label="Axiom Architecture Anatomy 360 Interactive Rig"
    >
      {/* Blueprint Grid Vignette */}
      <div className="axm-360-grid" />

      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="axm-360-canvas"
        aria-label="Interactive 3D anatomy of the Axiom system. Drag to orbit, scroll to zoom, click an assembly to inspect it."
      />

      {/* CSS 2D Labels Container */}
      <div ref={labelsRef} className="axm-360-labels" />

      {/* WebGL Fallback */}
      {webglError && (
        <div className="axm-360-fallback">
          WebGL is not available in this browser, so the 3D anatomy cannot be shown.
        </div>
      )}

      {/* High-Tech HUD Layer */}
      <div className="axm-360-hud">
        {/* Top Header */}
        <header className="axm-360-header">
          <div className="axm-360-brand">
            <AxiomLogo size={24} />
            <b>AXIOM</b>
            <span>Anatomy / 360 view</span>
            <span
              style={{
                marginLeft: '6px',
                fontSize: '8.5px',
                padding: '1px 6px',
                borderRadius: '3px',
                border: isLive ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(168, 85, 247, 0.4)',
                color: isLive ? '#34d399' : '#d8b4fe',
                background: 'rgba(5, 6, 10, 0.6)',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {isLive ? '● LIVE' : `SNAPSHOT // ${activeRunId} @ ${activeCommit}`}
            </span>
          </div>

          <div className="axm-360-readout" aria-live="off">
            <div>
              AZIMUTH<b ref={azRef}>000°</b>
            </div>
            <div>
              ELEVATION<b ref={elRef}>00°</b>
            </div>
            <div className="hide-sm">
              ASSEMBLIES<b>12 · 12 buses</b>
            </div>
          </div>
        </header>

        {/* Mid Row: Left Instruments (Live Data & Frequencies) & Right Inspector */}
        <div className="axm-360-mid">
          {/* Left Instruments Rack */}
          <aside className="axm-360-inst" aria-label="Run instruments and frequency spectrum">
            {/* Box 1: Trial & Active Model */}
            <div className="box">
              <h3>
                TRIAL <i>{isLive ? 'LIVE STREAM' : 'SIMULATED'}</i>
              </h3>
              <div className="axm-360-big">
                {trialCount} <small>/ 720</small>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto', marginTop: 6 }}>
                <span>active model</span>
                <b style={{ color: 'var(--cya)', fontSize: 9 }}>{activeModel.split('/').pop()}</b>
              </div>
              <div className="axm-360-rw" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>split train : dev : test</span>
                <b style={{ color: 'var(--fg)' }}>1 : 1 : 3</b>
              </div>
            </div>

            {/* Box 2: Conditions Progress */}
            <div className="box">
              <h3>
                CONDITIONS <i>/ 120 EACH</i>
              </h3>
              {CONDITIONS.map((c, i) => {
                const count = conditionCounts[i];
                const pct = Math.min(100, (count / 120) * 100);
                return (
                  <div key={c} className="axm-360-rw">
                    <span>{c}</span>
                    <div className="axm-360-bar">
                      <b style={{ width: `${pct}%` }} />
                    </div>
                    <span>{count}/120</span>
                  </div>
                );
              })}
            </div>

            {/* Box 3: Healing Loop Sequence */}
            <div className="box">
              <h3>
                LOOP SEQUENCE <i>{stageIdx + 1}/6</i>
              </h3>
              <div className="axm-360-seq">
                {STAGES.map((s, i) => (
                  <span
                    key={s.name}
                    className={i === stageIdx ? 'on' : ''}
                    style={{ ['--cc' as string]: hex(s.color) }}
                  >
                    {s.name.slice(0, 3)}
                  </span>
                ))}
              </div>
            </div>

            {/* Box 4: Harmonic Frequency Spectrum */}
            <div className="box">
              <h3>
                HARMONIC SPECTRUM <i>42.0 kHz · PG 16</i>
              </h3>
              <div className="axm-360-freq-strip">
                <div
                  className="axm-360-freq-cursor"
                  style={{ left: `${((trialCount * 7 + stageIdx * 15) % 86) + 4}%` }}
                />
              </div>
              <div className="axm-360-freq-grid" role="img" aria-label="12-band frequency spectrum equalizer">
                {freqLevels.map((val, i) => {
                  const activeSegs = Math.ceil((val / 100) * 7);
                  return (
                    <div key={i} className="axm-360-freq-col">
                      <div className="axm-360-freq-meter">
                        {Array.from({ length: 7 }, (_, sIdx) => {
                          const segNum = 7 - sIdx;
                          const isLit = segNum <= activeSegs;
                          const segClass =
                            segNum >= 6 ? 'seg-peak' : segNum >= 4 ? 'seg-mid' : 'seg-low';
                          return (
                            <span
                              key={sIdx}
                              className={`axm-360-freq-seg ${isLit ? 'is-lit' : ''} ${segClass}`}
                            />
                          );
                        })}
                      </div>
                      <span className="axm-360-freq-lbl">{FREQ_LABELS[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box 5: Failed Facts Containment Probe */}
            <div className="box">
              <h3>
                FAILED FACTS PROBE{' '}
                <i style={{ color: currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? '#f43f5e' : '#34d399' }}>
                  {currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? 'TRIPPED' : 'NOMINAL'}
                </i>
              </h3>
              <div className="axm-360-facts-rack">
                {currentStage.name === 'FAIL' || currentStage.name === 'ADVISE' ? (
                  <>
                    <span className="axm-360-fact-tag">F-05</span>
                    <span className="axm-360-fact-tag">F-19</span>
                    <span className="axm-360-fact-tag">F-20</span>
                    <span className="axm-360-fact-tag">F-36</span>
                  </>
                ) : (
                  <span className="axm-360-facts-nominal">No active invariant violations detected.</span>
                )}
              </div>
            </div>
          </aside>

          {/* Right Inspector Panel */}
          <aside
            className="axm-360-insp"
            style={{ ['--c' as string]: hex(selectedNode.color) }}
            aria-live="polite"
          >
            <div className="id">ASSEMBLY {selectedNode.id}</div>
            <h2>{selectedNode.name}</h2>
            <div className="badge">{selectedBadge}</div>
            <p>{selectedNode.desc}</p>
            <div className="file">[{selectedNode.file}]</div>
            <dl>
              <dt>FROM</dt>
              <dd>{selectedAdj.from}</dd>
              <dt>TO</dt>
              <dd>{selectedAdj.to}</dd>
            </dl>
          </aside>
        </div>

        {/* Bottom Control Deck */}
        <div>
          <div className="axm-360-hint">DRAG TO ORBIT · SCROLL TO ZOOM · CLICK AN ASSEMBLY TO INSPECT</div>

          <div className="axm-360-panel">
            {/* Stage Chips + Stage Message */}
            <div className="axm-360-chips" role="tablist" aria-label="Healing loop stage">
              {STAGES.map((s, idx) => {
                const isSelected = idx === stageIdx;
                return (
                  <button
                    key={s.name}
                    type="button"
                    className="axm-360-btn axm-360-chip"
                    role="tab"
                    aria-selected={isSelected}
                    style={{ ['--cc' as string]: hex(s.color) }}
                    onClick={() => {
                      setLooping(false);
                      stateRef.current.looping = false;
                      setStageIdx(idx);
                      setSelId(s.node);
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
              <div className="msg">{currentStage.msg}</div>
            </div>

            {/* Turntable Slider */}
            <div className="axm-360-scrub">
              <label htmlFor="turn-slider">TURNTABLE</label>
              <input
                id="turn-slider"
                ref={turnSliderRef}
                type="range"
                min="0"
                max="360"
                step="1"
                defaultValue="0"
                aria-label="Turntable angle in degrees"
              />
              <output ref={turnOutRef} htmlFor="turn-slider">
                0°
              </output>
            </div>

            {/* Action Buttons Row */}
            <div className="axm-360-row">
              <button
                type="button"
                className="axm-360-btn"
                aria-pressed={looping}
                onClick={() => {
                  setLooping(!looping);
                  if (!looping) setSelId(STAGES[stageIdx].node);
                }}
              >
                Run loop<kbd>L</kbd>
              </button>

              <button
                type="button"
                className="axm-360-btn"
                aria-pressed={rotating}
                onClick={() => {
                  setRotating(!rotating);
                  stateRef.current.targetView = null;
                }}
              >
                Rotate<kbd>R</kbd>
              </button>

              <button
                type="button"
                className="axm-360-btn"
                aria-pressed={exploded}
                onClick={() => setExploded(!exploded)}
              >
                Take apart<kbd>Space</kbd>
              </button>

              <span className="sp" />

              <button type="button" className="axm-360-btn" onClick={() => setCameraView('front')}>
                Front
              </button>
              <button type="button" className="axm-360-btn" onClick={() => setCameraView('side')}>
                Side
              </button>
              <button type="button" className="axm-360-btn" onClick={() => setCameraView('top')}>
                Top
              </button>
              <button type="button" className="axm-360-btn" onClick={() => setCameraView('iso')}>
                Iso
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AxiomAnatomy;
