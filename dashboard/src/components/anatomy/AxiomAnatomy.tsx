'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { CheckpointTrial, DeskData } from '@/lib/desk';
import './anatomy-360.css';

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

/* Palette: Flat functional tones */
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
    pos: [-3.8, 2.2, -1.8],
    size: [1.3, 0.9, 0.9],
    file: 'fixtures/task-v2/tasks.json',
    desc: 'Seeded tasks split into 40 Train, 40 Dev and 120 held-out Test tasks. Strict schema invariants, never corrected SQL.',
  },
  {
    id: '04',
    name: 'CONDITIONS',
    badge: 'A B C C0 D E_B',
    color: C_VER,
    pos: [-1.4, 2.6, -2.4],
    size: [1.4, 0.8, 0.9],
    file: 'src/eval/ablation.ts',
    desc: 'Assembles the prompt for the six ablation conditions: baseline, golden rules, retrieved lessons, verbatim facts, placebo and the Tier 0 control.',
  },
  {
    id: '02',
    name: 'RETRIEVAL',
    badge: 'K=10 · OVERLAP RANK',
    color: C_VER,
    pos: [1.4, 2.5, -2.2],
    size: [1.3, 0.8, 0.9],
    file: 'src/memory.ts',
    desc: 'Reads the task feature flags and ranks stored lessons by train failure frequency and feature match, then picks the top K before attempt 1.',
  },
  {
    id: '03',
    name: 'LESSON STORE',
    badge: 'READ-ONLY · SHA-256',
    color: C_PASS,
    pos: [3.8, 2.0, -1.4],
    size: [1.3, 0.9, 0.9],
    file: 'fixtures/memory.json',
    desc: 'Immutable memory vault. Lessons are calibrated on Train, loaded read-only and checked by SHA-256 hash so nothing leaks in at run time.',
  },
  {
    id: '06',
    name: 'GUARDRAILS',
    badge: 'FAIL-CLOSED · CACHE',
    color: C_CHASSIS,
    pos: [-3.8, 0.1, 0.6],
    size: [1.2, 0.8, 0.9],
    file: 'src/guardrails.ts',
    desc: 'Fails closed on the daily budget cap, backs off exponentially on HTTP 429 and 503, and serves SHA-256 disk-cached model responses.',
  },
  {
    id: '05',
    name: 'EXECUTOR',
    badge: 'NEMOTRON-3 · T=0',
    color: C_GEN,
    pos: [-1.6, 0.6, 1.0],
    size: [1.7, 1.2, 1.3],
    file: 'src/executor.ts',
    desc: 'The generative core. Calls the model through an OpenAI-compatible client at temperature 0 with token ceilings and produces candidate migration SQL.',
  },
  {
    id: '07',
    name: 'ORACLE CRUCIBLE',
    badge: 'PG 16 · 34 FACTS',
    color: C_VER,
    pos: [1.0, 0.3, 0.0],
    size: [2.1, 1.4, 1.6],
    file: 'scripts/oracle.ts',
    desc: 'The ground-truth reactor. PostgreSQL 16 in Docker runs the migration as deployer, then probes 34 behavioral facts as application.',
  },
  {
    id: '08',
    name: 'VERDICT',
    badge: 'FACT IDS ONLY',
    color: C_FAIL,
    pos: [3.8, 0.0, 1.0],
    size: [1.4, 1.0, 1.1],
    file: 'scripts/facts.ts',
    desc: 'Reports failures strictly as fact IDs and one-line statements. It never leaks corrected SQL back to the model.',
  },
  {
    id: '12',
    name: 'ADVISOR',
    badge: '< 24 WORDS · GATED',
    color: C_ADV,
    pos: [-2.6, -1.8, 1.8],
    size: [1.3, 0.9, 0.9],
    file: 'src/advisor.ts',
    desc: 'Distills a failed verdict into a rule under 24 words. The lesson stays pending until the next retry passes.',
  },
  {
    id: '09',
    name: 'SCORER',
    badge: 'BOUND FACTS · F-13',
    color: C_CHASSIS,
    pos: [-0.3, -2.1, 1.5],
    size: [1.2, 0.8, 0.8],
    file: 'src/eval/ablation.ts',
    desc: 'Scores each task on its bound facts only. A missing target table (F-13) scores zero.',
  },
  {
    id: '10',
    name: 'CHECKPOINT',
    badge: '720 PROVENANCE TRIALS',
    color: C_PASS,
    pos: [1.9, -1.9, 1.3],
    size: [1.4, 0.9, 1.0],
    file: 'fixtures/checkpoint.json',
    desc: 'Twin ledger. Commits every trial record and its hash right after the trial, so a run can resume after an interruption.',
  },
  {
    id: '11',
    name: 'ANALYSIS',
    badge: 'SIGN-FLIP · HOLM',
    color: C_VER,
    pos: [3.8, -1.5, 0.4],
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

function geoFor(n: AssemblyNode): THREE.BufferGeometry {
  const [w, h, d] = n.size;
  switch (n.id) {
    case '07':
      return new THREE.IcosahedronGeometry(Math.max(w, h, d) * 0.5, 1);
    case '05':
      return new THREE.OctahedronGeometry(Math.max(w, h) * 0.62, 0);
    case '03':
    case '10':
      return new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 1.05, 6);
    case '01':
      return new THREE.CylinderGeometry(w * 0.38, w * 0.38, h * 1.1, 24);
    case '12':
      return new THREE.CylinderGeometry(w * 0.34, w * 0.34, h * 1.3, 24);
    default:
      return new THREE.BoxGeometry(w, h, d);
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

export function AxiomAnatomy({
  running: initialRunning = true,
  snapshot,
}: AxiomAnatomyProps = {}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const labelsRef = React.useRef<HTMLDivElement>(null);

  const [selId, setSelId] = React.useState('07'); // Default: Oracle Crucible
  const [stageIdx, setStageIdx] = React.useState(0);
  const [looping, setLooping] = React.useState(initialRunning);
  const [rotating, setRotating] = React.useState(true);
  const [exploded, setExploded] = React.useState(false);
  const [webglError, setWebglError] = React.useState(false);

  // Fast direct readouts (avoids re-rendering entire component on every frame)
  const azRef = React.useRef<HTMLElement>(null);
  const elRef = React.useRef<HTMLElement>(null);
  const turnSliderRef = React.useRef<HTMLInputElement>(null);
  const turnOutRef = React.useRef<HTMLOutputElement>(null);

  // Bridge refs to sync state into animation loop without re-triggering effects
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

  // Active Model and metadata
  const activeModel = snapshot?.model ?? (snapshot?.runId === 'gemma-1' ? 'google/gemma-4-31b-it' : 'nvidia/nemotron-3-ultra-550b-a55b');
  const activeCommit = snapshot?.commit ?? '7ebae83';
  const activeRunId = snapshot?.runId ?? 'nemotron-1';
  const isLive = Boolean(snapshot?.isLive);

  // Lemniscate logo path
  const logoPath = React.useMemo(() => {
    let d = '';
    const A = 26;
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * Math.PI * 2;
      const s = 1 + Math.sin(t) * Math.sin(t);
      d += (i ? 'L' : 'M') + (30 + (A * Math.cos(t)) / s).toFixed(2) + ' ' + (15 + (A * Math.sin(t) * Math.cos(t)) / s).toFixed(2);
    }
    return d + 'Z';
  }, []);

  // Preset Views
  const setCameraView = React.useCallback((view: 'front' | 'side' | 'top' | 'iso') => {
    const dist = (window.innerWidth / window.innerHeight < 0.9) ? 19 : 13.5;
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

  // Three.js Mount & Render Loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const labelsEl = labelsRef.current;
    if (!canvas || !container || !labelsEl) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x05060a, 1);

    const labelRenderer = new CSS2DRenderer({ element: labelsEl });

    const scene = new THREE.Scene();
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

    const T = { value: 0 };
    const FLOOR = -3.7;
    const R = 6.6;

    // Floor turntable ring + blueprint grid
    const floorP: number[] = [];
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const isLong = d % 30 === 0;
      const r2 = R + (isLong ? 0.34 : 0.15);
      floorP.push(Math.sin(a) * R, FLOOR, Math.cos(a) * R, Math.sin(a) * r2, FLOOR, Math.cos(a) * r2);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorP, 3));
    scene.add(new THREE.LineSegments(floorGeo, new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.55 })));

    const circPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * Math.PI * 2;
      circPts.push(new THREE.Vector3(Math.sin(t) * R, FLOOR, Math.cos(t) * R));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circPts), new THREE.LineBasicMaterial({ color: 0x7c819a, transparent: true, opacity: 0.4 })));

    // 0 deg Front arrow marker
    const frontMarker = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), new THREE.MeshBasicMaterial({ color: 0xe8eaf2 }));
    frontMarker.position.set(0, FLOOR, R + 0.7);
    frontMarker.rotation.y = Math.PI / 4;
    scene.add(frontMarker);

    // Blueprint grid
    const grid = new THREE.GridHelper(40, 40, 0x2a3160, 0x141936);
    grid.position.y = FLOOR - 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    // Starfield points
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 15;
      const s = Math.sqrt(1 - u * u);
      starPos[i * 3] = r * s * Math.cos(t);
      starPos[i * 3 + 1] = r * u;
      starPos[i * 3 + 2] = r * s * Math.sin(t);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xa0aaff, size: 0.12, transparent: true, opacity: 0.5, sizeAttenuation: true })));

    // Assemblies
    const shells: THREE.Mesh[] = [];
    const nodeRecords: Record<
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
      g.add(shell);
      shells.push(shell);

      const edgeMat = new THREE.LineBasicMaterial({
        color: n.color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, n.id === '07' ? 1 : 20), edgeMat));

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: n.color }));
      g.add(core);

      const drop = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1, 0.008), new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.4 }));
      drop.visible = false;
      g.add(drop);

      // Label DOM
      const el = document.createElement('div');
      el.className = 'lbl';
      el.style.setProperty('--c', hex(n.color));
      const badgeText = n.id === '05' && activeModel ? activeModel.split('/').pop()?.toUpperCase() : n.badge;
      el.innerHTML = `<span>${n.id} · ${n.name}</span><small>${badgeText}</small>`;

      const lbl = new CSS2DObject(el);
      lbl.position.set(0, Math.max(n.size[1] * 0.62, 0.45) + 0.28, 0);
      g.add(lbl);

      nodeRecords[n.id] = { n, g, uni, edgeMat, core, drop, el, shell };
    });

    // 12 Buses
    const buses = EDGES.map((e, i) => {
      const pos = new Float32Array(12);
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
      const pk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(pk);
      return { a: e[0], b: e[1], key: ek(e[0], e[1]), pos, geom, mat, pk, phase: i / EDGES.length };
    });

    // Spherical camera helpers
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

    const getInitialDist = () => (container.clientWidth / container.clientHeight < 0.9 ? 19 : 13.5);

    // Initial Camera Placement
    cam.position.set(0, 0, getInitialDist());
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

    // Raycaster Picking
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;

    const pick = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(shells, false)[0];
      return hit ? (hit.object.userData.id as string) : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return;
      const id = pick(e.clientX, e.clientY);
      if (id) {
        setLooping(false);
        stateRef.current.looping = false;
        setSelId(id);
        const stageMatch = STAGES.findIndex((s) => s.node === id);
        if (stageMatch >= 0) setStageIdx(stageMatch);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const id = pick(e.clientX, e.clientY);
      stateRef.current.hoverId = id;
      canvas.style.cursor = id ? 'pointer' : '';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    // Turntable Scrub Slider Handler
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

    // Animation Frame Loop
    let animId: number;
    let lastTime = performance.now();
    let factor = 1;

    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      T.value += dt;

      const { selId: curSel, hoverId: curHover, stageIdx: curStage, rotating: isRot, exploded: isExp, draggingSlider, targetView } = stateRef.current;

      factor += ((isExp ? 1.4 : 1) - factor) * 0.08;
      ctl.autoRotate = isRot;

      const st = STAGES[curStage];
      const activeEdges: Record<string, boolean> = {};
      st.edges.forEach((k) => {
        activeEdges[k] = true;
      });

      // Update Nodes
      NODES.forEach((n, i) => {
        const r = nodeRecords[n.id];
        if (!r) return;
        const isSel = n.id === curSel;
        const isHov = n.id === curHover;
        const isAct = n.id === st.node;

        r.g.position.set(
          n.pos[0] * factor,
          n.pos[1] * factor + Math.sin(T.value * 0.9 + i) * 0.035,
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

        if (isSel) {
          r.drop.visible = true;
          const h = Math.abs(FLOOR - r.g.position.y);
          r.drop.scale.y = h;
          r.drop.position.y = -h / 2;
        } else {
          r.drop.visible = false;
        }

        r.el.className = `lbl ${isSel ? 'sel' : ''} ${isAct ? 'act' : ''}`;
      });

      // Update Buses & Data Packets
      buses.forEach((b) => {
        const A = BY_ID[b.a].pos;
        const B = BY_ID[b.b].pos;
        const f = factor;
        const p = b.pos;
        p.set([A[0] * f, A[1] * f, A[2] * f, B[0] * f, A[1] * f, A[2] * f, B[0] * f, B[1] * f, A[2] * f, B[0] * f, B[1] * f, B[2] * f]);
        b.geom.attributes.position.needsUpdate = true;

        const isAct = Boolean(activeEdges[b.key]);
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

      // Readouts Direct DOM update
      const az = ((ctl.getAzimuthalAngle() * 180) / Math.PI + 360) % 360;
      const el = 90 - (ctl.getPolarAngle() * 180) / Math.PI;
      const azRounded = Math.round(az) % 360;
      const elRounded = Math.round(el);

      if (azRef.current) azRef.current.textContent = `${String(azRounded).padStart(3, '0')}°`;
      if (elRef.current) elRef.current.textContent = `${elRounded < 0 ? '−' : ''}${String(Math.abs(elRounded)).padStart(2, '0')}°`;

      if (!draggingSlider && slider && turnOutRef.current) {
        slider.value = String(azRounded);
        turnOutRef.current.textContent = `${azRounded}°`;
      }

      renderer.render(scene, cam);
      labelRenderer.render(scene, cam);
    };

    animId = requestAnimationFrame(frame);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
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
      // Dispose materials & geometries
      shells.forEach((s) => {
        s.geometry.dispose();
        (s.material as THREE.Material).dispose();
      });
      buses.forEach((b) => {
        b.geom.dispose();
        b.mat.dispose();
      });
    };
  }, [activeModel]);

  // Stage Cycle Timer (1.5s per stage when looping)
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
  const selectedBadge = selId === '05' && activeModel ? activeModel.split('/').pop()?.toUpperCase() : selectedNode.badge;

  return (
    <div className="axm-360-root" role="region" aria-label="Axiom Architecture Anatomy 360 Interactive Rig">
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

      {/* Fallback */}
      {webglError && (
        <div className="axm-360-fallback">
          WebGL is not available in this browser, so the 3D anatomy cannot be shown.
        </div>
      )}

      {/* HUD Layer */}
      <div className="axm-360-hud">
        {/* Top Header */}
        <header className="axm-360-header">
          <div className="axm-360-brand">
            <svg viewBox="0 0 60 30" aria-hidden="true">
              <path d={logoPath} fill="none" stroke="#a855f7" strokeWidth="5" strokeLinejoin="round" />
            </svg>
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

        {/* Mid Right Inspector Panel */}
        <div className="axm-360-mid">
          <aside className="axm-360-insp" style={{ ['--c' as string]: hex(selectedNode.color) }} aria-live="polite">
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
            {/* Stage Chips + Live Message */}
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
              <output ref={turnOutRef} htmlFor="turn-slider">0°</output>
            </div>

            {/* Buttons Row */}
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
}

export default AxiomAnatomy;
