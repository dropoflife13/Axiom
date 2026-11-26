'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type ThreeClockRingId = 'fast' | 'quar' | 'gate';

export interface ThreeClockCore3DProps {
  /** Path to the Nidavellir Three-Clock .glb model. Defaults to '/models/three-clock.glb' with procedural fallback. */
  readonly glbUrl?: string;
  /** Normalized progress [0, 1] for active live trials; scales Dyson outer shell angular velocity. */
  readonly fastClockProgress?: number | null;
  /** True when Slow Clock canary replays / quarantine evaluations are actively running. */
  readonly quarantineActive?: boolean;
  /** True when canaryRegressions === 0 and lexical lock retention === 100.0%. */
  readonly slowClockLocked?: boolean;
  /** Currently hovered external module ring highlight. */
  readonly highlightedRing?: ThreeClockRingId | null;
  /** Optional callback fired when a user hovers a ring. */
  readonly onRingHover?: (ring: ThreeClockRingId | null) => void;
  /** Optional callback fired when a user clicks a ring (does not mutate live data). */
  readonly onRingClick?: (ring: ThreeClockRingId) => void;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const STAR_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const STAR_FRAGMENT_SHADER = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vViewDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.15 + vec3(0.13, -0.17, 0.21);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = normalize(vPos) * 7.5;
    float n1 = fbm(p + vec3(uTime * 0.22, -uTime * 0.16, uTime * 0.18));
    float n2 = fbm(p * 1.9 - vec3(uTime * 0.35, uTime * 0.24, -uTime * 0.28));
    float gran = smoothstep(0.22, 0.86, n1 * 0.62 + n2 * 0.48);

    float ndv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float limb = pow(1.0 - ndv, 2.2);

    vec3 deepIce = vec3(0.70, 0.86, 0.99);
    vec3 brightCore = vec3(0.98, 0.995, 1.0);
    vec3 warmGold = vec3(1.0, 0.97, 0.90);

    vec3 col = mix(deepIce, brightCore, gran);
    col = mix(col, warmGold, smoothstep(0.65, 1.0, gran) * 0.35);
    col += vec3(0.22, 0.32, 0.45) * limb;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function createStarHaloTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    g.addColorStop(0.22, 'rgba(224, 242, 254, 0.62)');
    g.addColorStop(0.45, 'rgba(147, 197, 253, 0.22)');
    g.addColorStop(0.75, 'rgba(125, 211, 252, 0.05)');
    g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a high-contrast dark studio environment with crisp white/cool-blue softbox strips
 * so dark forged obsidian, titanium trusses, and bronze bevels get sharp metallic reflections.
 */
function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x07090d);

  const addPanel = (
    color: number,
    intensity: number,
    pos: [number, number, number],
    rot: [number, number, number],
    size: [number, number]
  ) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    envScene.add(mesh);
  };

  addPanel(0xf8fafc, 3.4, [0, 7, 2], [Math.PI / 2, 0, 0], [10, 3.5]);
  addPanel(0xe2e8f0, 3.0, [-7, 2, 3], [0, Math.PI / 2.2, 0], [4.5, 9]);
  addPanel(0xcbd5e1, 2.5, [7.5, -1, -2], [0, -Math.PI / 2.1, 0], [4.0, 9]);
  addPanel(0xfde68a, 1.15, [2, -6.5, 4], [-Math.PI / 2, 0, 0], [7, 3]);
  addPanel(0xdbeafe, 2.3, [0, 3, -8], [0, 0, 0], [10, 4]);

  const rt = pmrem.fromScene(envScene, 0.025);
  disposeObject3D(envScene);
  pmrem.dispose();
  return rt;
}

/**
 * Deep cosmic starfield + subtle celestial coordinate meridian sphere in background space
 * (replaces bland flat/gradient backdrop with crisp multi-depth aerospace atmosphere).
 */
function buildDeepSpaceBackdrop(): THREE.Group {
  const bgGroup = new THREE.Group();

  // Crisp distant stars distributed on a celestial sphere (radius 10..20)
  const starCount = 420;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const cCool = new THREE.Color(0xcbd5e1);
  const cBlue = new THREE.Color(0x93c5fd);
  const cWarm = new THREE.Color(0xfef3c7);

  for (let i = 0; i < starCount; i++) {
    // Deterministic Fibonacci-like pseudo-random distribution (zero SSR hydration drift)
    const u = ((i * 2654435761) >>> 0) / 4294967296;
    const v = ((i * 2246822519) >>> 0) / 4294967296;
    const theta = u * TAU;
    const phi = Math.acos(2 * v - 1);
    const r = 10 + (i % 11) * 0.9;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi) - 3.5;

    const col = i % 7 === 0 ? cWarm : i % 3 === 0 ? cBlue : cCool;
    const brightness = 0.25 + ((i * 19) % 100) / 140;
    colors[i * 3] = col.r * brightness;
    colors[i * 3 + 1] = col.g * brightness;
    colors[i * 3 + 2] = col.b * brightness;
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  bgGroup.add(new THREE.Points(starGeo, starMat));

  // Subtle architectural orbital coordinate meridians behind the forge
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.28,
  });
  for (const r of [1.65, 2.25]) {
    const pts: THREE.Vector3[] = [];
    const segs = 128;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -1.6));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    bgGroup.add(new THREE.Line(geo, ringMat));
  }

  // Degree tick marks around outer CAD azimuth circle (every 15°)
  const tickPts: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const inner = i % 6 === 0 ? 1.54 : 1.6;
    tickPts.push(
      new THREE.Vector3(Math.cos(a) * inner, Math.sin(a) * inner, -1.6),
      new THREE.Vector3(Math.cos(a) * 1.69, Math.sin(a) * 1.69, -1.6)
    );
  }
  const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
  const tickMat = new THREE.LineBasicMaterial({
    color: 0x475569,
    transparent: true,
    opacity: 0.42,
  });
  bgGroup.add(new THREE.LineSegments(tickGeo, tickMat));

  return bgGroup;
}

function createRingShape(R: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, r, 0, TAU, true);
  s.holes.push(h);
  return s;
}

function extrudeCentered(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 96,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Deconstructs a closed hex Dyson dome into an open Nidavellir orbital arch by grouping
 * triangles into whole connected hex plates (union-find on quantized vertex coords) and
 * removing ~75% of the cover tiles — zero jagged half-cut triangles — so the inner
 * amber quarantine rings, emerald iris, and incandescent neutron star are clearly visible.
 */
function deconstructOuterHexShell(mesh: THREE.Mesh, isSubstructure: boolean): void {
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  if (!pos || pos.count < 3) return;

  const indexAttr = geom.getIndex();
  const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(pos.count / 3);
  if (triCount === 0) return;

  const getVertIdx = (tri: number, corner: number) =>
    indexAttr ? indexAttr.getX(tri * 3 + corner) : tri * 3 + corner;

  // Union-Find over triangles that share quantized vertex coordinates -> whole intact hex plates
  const parent = new Int32Array(triCount);
  for (let i = 0; i < triCount; i++) parent[i] = i;

  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    let c = x;
    while (parent[c] !== r) {
      const next = parent[c];
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const vertOwner = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const vi = getVertIdx(t, c);
      const key = `${Math.round(pos.getX(vi) * 500)},${Math.round(pos.getY(vi) * 500)},${Math.round(pos.getZ(vi) * 500)}`;
      const prev = vertOwner.get(key);
      if (prev === undefined) {
        vertOwner.set(key, t);
      } else {
        unite(prev, t);
      }
    }
  }

  // Compute centroid of each connected hex tile component
  const compSum = new Map<number, [number, number, number, number]>();
  for (let t = 0; t < triCount; t++) {
    const root = find(t);
    let entry = compSum.get(root);
    if (!entry) {
      entry = [0, 0, 0, 0];
      compSum.set(root, entry);
    }
    const i0 = getVertIdx(t, 0);
    const i1 = getVertIdx(t, 1);
    const i2 = getVertIdx(t, 2);
    entry[0] += (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
    entry[1] += (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
    entry[2] += (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    entry[3] += 1;
  }

  // Decide which whole tiles to keep: open ~75% of cover into two dramatic tilted orbital ribs
  const keepComp = new Map<number, boolean>();
  for (const [root, [sx, sy, sz, cnt]] of compSum.entries()) {
    const cx = sx / cnt;
    const cy = sy / cnt;
    const cz = sz / cnt;
    const len = Math.hypot(cx, cy, cz) || 1;
    const nx = cx / len;
    const ny = cy / len;
    const nz = cz / len;

    // Tilted primary orbital arch plane (leaves front/back core completely open)
    const bandA = Math.abs(ny * 0.88 + nz * 0.47);
    // Secondary crisp meridian structural rib on outer rim
    const bandB = Math.abs(nx * 0.92 - ny * 0.39);
    // Deterministic subtle organic breakup at arch edges so it feels engineered, not flat-sliced
    const hash = Math.abs(Math.sin(nx * 19.7 + ny * 31.3 + nz * 47.1));

    const keepPrimary = bandA < (isSubstructure ? 0.24 : 0.19) && (Math.abs(nz) < 0.72 || hash > 0.55);
    const keepSecondary = bandB < (isSubstructure ? 0.17 : 0.13) && Math.abs(nz) < 0.55 && hash > 0.25;
    keepComp.set(root, keepPrimary || keepSecondary);
  }

  const keptIndices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    if (keepComp.get(find(t))) {
      keptIndices.push(getVertIdx(t, 0), getVertIdx(t, 1), getVertIdx(t, 2));
    }
  }

  if (keptIndices.length >= 3) {
    geom.setIndex(keptIndices);
    geom.computeBoundingSphere();
  }
}

function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of matList) {
        materials.add(mat);
        const std = mat as THREE.MeshStandardMaterial;
        for (const key of [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'aoMap',
          'bumpMap',
          'alphaMap',
          'envMap',
        ] as const) {
          const tex = std[key];
          if (tex && tex instanceof THREE.Texture) textures.add(tex);
        }
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

export function ThreeClockCore3D({
  glbUrl = '/models/three-clock.glb',
  fastClockProgress = null,
  quarantineActive = false,
  slowClockLocked = true,
  highlightedRing = null,
  onRingHover,
  onRingClick,
}: ThreeClockCore3DProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fastDegRef = useRef<HTMLSpanElement | null>(null);
  const quarDegRef = useRef<HTMLSpanElement | null>(null);
  const gateDegRef = useRef<HTMLSpanElement | null>(null);

  const [webglFallback, setWebglFallback] = useState(false);

  const propsRef = useRef({
    fastClockProgress,
    quarantineActive,
    slowClockLocked,
    highlightedRing,
    onRingHover,
    onRingClick,
  });

  useEffect(() => {
    propsRef.current = {
      fastClockProgress,
      quarantineActive,
      slowClockLocked,
      highlightedRing,
      onRingHover,
      onRingClick,
    };
  }, [
    fastClockProgress,
    quarantineActive,
    slowClockLocked,
    highlightedRing,
    onRingHover,
    onRingClick,
  ]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;

    const scene = new THREE.Scene();

    // High-contrast studio reflections so forged trusses catch sharp edge highlights
    const envRT = buildStudioEnvironment(renderer);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.25;

    // Deep cosmic starfield + orbital CAD graticule backdrop (zero bland gradient)
    const spaceBackdrop = buildDeepSpaceBackdrop();
    scene.add(spaceBackdrop);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    const root = new THREE.Group();
    scene.add(root);

    // Studio & neutron star illumination
    scene.add(new THREE.HemisphereLight(0xcbd5e1, 0x0b0d12, 0.65));

    const keyLight = new THREE.DirectionalLight(0xf8fafc, 2.4);
    keyLight.position.set(-2.8, 4.2, 5.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 1.9);
    rimLight.position.set(4.0, 2.0, -3.0);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfef3c7, 0.65);
    fillLight.position.set(2.5, -3.2, 3.2);
    scene.add(fillLight);

    // Center Star — AXIOM-HOPE v4: animated GLSL neutron star + halo + interior PointLight
    const starLight = new THREE.PointLight(0xe0f2fe, 6.8, 5.2, 1.45);
    starLight.position.set(0, 0, 0);
    root.add(starLight);

    const starUniforms = { uTime: { value: 0 } };
    const starShaderMat = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
    });
    const starCoreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 48, 48), starShaderMat);
    root.add(starCoreMesh);

    const haloTex = createStarHaloTexture();
    const haloSpriteMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(haloSpriteMat);
    haloSprite.scale.set(0.92, 0.92, 1);
    root.add(haloSprite);

    const BRONZE_IDLE = new THREE.Color(0xd97706);
    const BRONZE_ACTIVE = new THREE.Color(0xf59e0b);
    const IRIS_OPEN = new THREE.Color(0x3a434a);
    const IRIS_LOCKED = new THREE.Color(0x10b981);
    const WHITE = new THREE.Color(0xffffff);

    const fast = new THREE.Group();
    const quar = new THREE.Group();
    const gate = new THREE.Group();
    const glbContainer = new THREE.Group();
    root.add(fast, quar, gate, glbContainer);

    const ringMaterials: Record<ThreeClockRingId, THREE.MeshStandardMaterial[]> = {
      fast: [],
      quar: [],
      gate: [],
    };
    const amberMaterials: THREE.MeshStandardMaterial[] = [];
    const emeraldMaterials: THREE.MeshStandardMaterial[] = [];

    // Supports BOTH naming conventions + independent amber orbital rails:
    //  - fast_clock_outer  | outer_dyson_shell
    //  - quarantine_middle | quarantine_rings (gunmetal truss rings + independent amber orbital rings)
    //  - slow_clock_inner  | fast_clock_core
    //  - hope_star_core
    let glbOuterShell: THREE.Object3D | null = null;
    let glbQuarRings: THREE.Object3D | null = null;
    let glbQuarAmberRails: THREE.Object3D | null = null;
    let glbCoreIris: THREE.Object3D | null = null;
    let glbHopeStar: THREE.Object3D | null = null;

    const buildProceduralFallback = () => {
      const makeMat = (hex: number, roughness: number, metalness: number) => {
        const m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
        m.userData.base = new THREE.Color(hex);
        return m;
      };
      const mFast = makeMat(0x161920, 0.3, 0.88);
      const mQuar = makeMat(0x252a32, 0.34, 0.84);
      const mGate = makeMat(0x2e363c, 0.36, 0.76);
      const mBronze = new THREE.MeshStandardMaterial({
        color: BRONZE_ACTIVE,
        roughness: 0.32,
        metalness: 0.82,
      });
      const mIris = new THREE.MeshStandardMaterial({
        color: IRIS_LOCKED,
        roughness: 0.36,
        metalness: 0.62,
      });

      ringMaterials.fast.push(mFast);
      ringMaterials.quar.push(mQuar);
      ringMaterials.gate.push(mGate);
      amberMaterials.push(mBronze);
      emeraldMaterials.push(mIris);

      fast.add(new THREE.Mesh(extrudeCentered(createRingShape(0.96, 0.84), 0.12, 0.008), mFast));
      quar.add(new THREE.Mesh(extrudeCentered(createRingShape(0.72, 0.6), 0.09, 0.006), mQuar));
      quar.add(new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.016, 10, 160), mBronze));
      gate.add(new THREE.Mesh(extrudeCentered(createRingShape(0.46, 0.25), 0.07, 0.006), mIris));

      const tag = (group: THREE.Group, id: ThreeClockRingId) => {
        group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) obj.userData.ring = id;
        });
      };
      tag(fast, 'fast');
      tag(quar, 'quar');
      tag(gate, 'gate');
    };

    let disposed = false;

    if (glbUrl) {
      fetch(glbUrl, { method: 'HEAD' })
        .then((res) => {
          if (disposed) return;
          if (!res.ok) {
            buildProceduralFallback();
            return;
          }
          return import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
            if (disposed) return;
            const loader = new GLTFLoader();
            loader.load(
              glbUrl,
              (gltf) => {
                if (disposed) return;
                const model = gltf.scene;

                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                const center = new THREE.Vector3();
                box.getSize(size);
                box.getCenter(center);
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const scale = 2.38 / maxDim;
                model.scale.setScalar(scale);
                model.position.sub(center.multiplyScalar(scale));

                model.traverse((obj) => {
                  const name = (obj.name || '').toLowerCase();
                  if (
                    !glbOuterShell &&
                    (name.includes('fast_clock_outer') || name.includes('outer_dyson_shell'))
                  ) {
                    glbOuterShell = obj;
                  } else if (
                    !glbQuarRings &&
                    (name.includes('quarantine_middle') || name.includes('quarantine_rings'))
                  ) {
                    glbQuarRings = obj;
                  } else if (
                    !glbCoreIris &&
                    (name.includes('slow_clock_inner') || name.includes('fast_clock_core'))
                  ) {
                    glbCoreIris = obj;
                  } else if (!glbHopeStar && name.includes('hope_star_core')) {
                    glbHopeStar = obj;
                  }

                  const mesh = obj as THREE.Mesh;
                  if (mesh.isMesh) {
                    let ringTag: ThreeClockRingId = 'fast';
                    let cur: THREE.Object3D | null = obj;
                    while (cur) {
                      const cn = (cur.name || '').toLowerCase();
                      if (cn.includes('quarantine')) {
                        ringTag = 'quar';
                        break;
                      }
                      if (cn.includes('slow_clock') || cn.includes('fast_clock_core')) {
                        ringTag = 'gate';
                        break;
                      }
                      if (cn.includes('fast_clock_outer') || cn.includes('outer_dyson')) {
                        ringTag = 'fast';
                        break;
                      }
                      cur = cur.parent;
                    }
                    mesh.userData.ring = ringTag;

                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    const firstMatName = ((mats[0] as THREE.Material | undefined)?.name || '').toLowerCase();
                    if (ringTag === 'fast' && firstMatName.includes('shell')) {
                      deconstructOuterHexShell(mesh, firstMatName.includes('substructure'));
                    }

                    for (const rawMat of mats) {
                      const std = rawMat as THREE.MeshStandardMaterial;
                      if (!std || !std.color) continue;
                      const mName = (std.name || '').toLowerCase();

                      if (mName.includes('amber')) {
                        std.color.copy(BRONZE_ACTIVE);
                        std.roughness = 0.28;
                        std.metalness = 0.78;
                        std.envMapIntensity = 1.65;
                        if (!amberMaterials.includes(std)) amberMaterials.push(std);
                        if (!glbQuarAmberRails && ringTag === 'quar') {
                          glbQuarAmberRails = mesh;
                        }
                      } else if (mName.includes('emerald')) {
                        std.color.copy(IRIS_LOCKED);
                        std.roughness = 0.36;
                        std.metalness = 0.64;
                        std.envMapIntensity = 1.3;
                        if (!emeraldMaterials.includes(std)) emeraldMaterials.push(std);
                      } else if (mName.includes('shell')) {
                        const shellCol = new THREE.Color(0x161a21);
                        std.color.copy(shellCol);
                        std.roughness = 0.27;
                        std.metalness = 0.9;
                        std.envMapIntensity = 1.65;
                        std.side = THREE.DoubleSide;
                        std.userData.base = shellCol.clone();
                        if (!ringMaterials[ringTag].includes(std)) ringMaterials[ringTag].push(std);
                      } else if (mName.includes('ring_gunmetal')) {
                        const qCol = new THREE.Color(0x252931);
                        std.color.copy(qCol);
                        std.roughness = 0.32;
                        std.metalness = 0.86;
                        std.envMapIntensity = 1.5;
                        std.userData.base = qCol.clone();
                        if (!ringMaterials[ringTag].includes(std)) ringMaterials[ringTag].push(std);
                      } else {
                        const cCol = new THREE.Color(0x2b3439);
                        std.color.copy(cCol);
                        std.roughness = 0.35;
                        std.metalness = 0.78;
                        std.envMapIntensity = 1.4;
                        std.userData.base = cCol.clone();
                        if (!ringMaterials[ringTag].includes(std)) ringMaterials[ringTag].push(std);
                      }
                    }
                  }
                });

                // If the GLB already supplies a dedicated hope_star_core mesh, hide the procedural sphere so they don't z-fight
                if (glbHopeStar) {
                  starCoreMesh.visible = false;
                }

                glbContainer.add(model);
              },
              undefined,
              () => {
                if (!disposed) buildProceduralFallback();
              }
            );
          });
        })
        .catch(() => {
          if (!disposed) buildProceduralFallback();
        });
    } else {
      buildProceduralFallback();
    }

    let baseCamDist = 3.9;
    const updateSize = () => {
      if (!stage || disposed) return;
      const rect = stage.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      baseCamDist = 1.3 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
      camera.updateProjectionMatrix();
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(stage);

    let yaw = -0.34;
    let pitch = 0.16;
    let zoom = 1;
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let lastReleaseTime = 0;
    let currentHover: ThreeClockRingId | null = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const pickRing = (e: PointerEvent): ThreeClockRingId | null => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(root.children, true);
      const ring = hits[0]?.object?.userData?.ring as ThreeClockRingId | undefined;
      return ring ?? null;
    };

    const setHoverState = (next: ThreeClockRingId | null) => {
      if (currentHover !== next) {
        currentHover = next;
        propsRef.current.onRingHover?.(next);
      }
      canvas.style.cursor = dragging ? 'grabbing' : next ? 'pointer' : 'grab';
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.006;
        pitch = clamp(pitch + dy * 0.006, -1.1, 1.1);
      } else {
        setHoverState(pickRing(e));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      lastReleaseTime = performance.now();
      if (moved < 5) {
        const clicked = pickRing(e);
        if (clicked) {
          propsRef.current.onRingClick?.(clicked);
        }
      }
      setHoverState(pickRing(e));
    };

    const onPointerLeave = () => {
      if (!dragging) setHoverState(null);
    };

    const onDoubleClick = () => {
      yaw = -0.34;
      pitch = 0.16;
      zoom = 1;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = clamp(zoom * (1 + e.deltaY * 0.001), 0.55, 1.6);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const hoverBlend: Record<ThreeClockRingId, number> = { fast: 0, quar: 0, gate: 0 };

    let aFast = 0;
    let aQuar = 0;
    let aGate = 0;
    let vGate = 0;
    let detentIndex = 0;
    let detentTimer = 0;
    let amberBlend = propsRef.current.quarantineActive ? 1 : 0.35;
    let emeraldBlend = propsRef.current.slowClockLocked ? 1 : 0;
    let elapsed = 0;
    let lastTime = performance.now();
    let rafId = 0;
    let frameCount = 0;
    let hidden = typeof document !== 'undefined' && document.hidden;

    const normDeg = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360;

    const renderFrame = (now: number) => {
      if (disposed || hidden) return;
      rafId = window.requestAnimationFrame(renderFrame);

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;
      frameCount++;

      const {
        fastClockProgress: prog,
        quarantineActive: qAct,
        slowClockLocked: gLock,
        highlightedRing: extHighlight,
      } = propsRef.current;

      const motionScale = prefersReducedMotion ? 0 : 1;
      starUniforms.uTime.value = elapsed * motionScale;

      const progressBoost = prog !== null && prog !== undefined ? clamp(prog, 0.25, 1) : 0.6;
      const fastAngularVel = (0.22 + progressBoost * 0.32) * motionScale;
      aFast -= dt * fastAngularVel;

      const quarAngularVel = fastAngularVel * (qAct ? 0.85 : 0.56);
      aQuar += dt * quarAngularVel;

      if (gLock) {
        if (!prefersReducedMotion) {
          detentTimer += dt;
          if (detentTimer >= 3.2) {
            detentTimer = 0;
            detentIndex += 1;
          }
        }
        const targetDetent = detentIndex * (Math.PI / 3);
        vGate += ((targetDetent - aGate) * 46 - vGate * 8.5) * dt;
        aGate += vGate * dt;
      } else {
        aGate += dt * 0.34 * motionScale;
        vGate = 0;
      }

      if (glbOuterShell || glbQuarRings || glbCoreIris) {
        if (glbOuterShell) {
          glbOuterShell.rotation.y = aFast * 0.48;
          glbOuterShell.rotation.z = aFast * 0.22;
        }
        if (glbQuarRings) {
          glbQuarRings.rotation.y = aQuar * 0.65;
          glbQuarRings.rotation.x = aQuar * 0.32;
          glbQuarRings.rotation.z = Math.sin(elapsed * 0.4) * 0.28 * motionScale;
        }
        // Independent counter-sweeping yellow/amber orbital rail rings around the gunmetal quarantine rings
        if (glbQuarAmberRails && glbQuarAmberRails !== glbQuarRings) {
          glbQuarAmberRails.rotation.y = -aQuar * 1.15;
          glbQuarAmberRails.rotation.x = 0.38 + Math.cos(elapsed * 0.55) * 0.32 * motionScale;
          glbQuarAmberRails.rotation.z = aQuar * 0.42;
        }
        if (glbCoreIris) {
          glbCoreIris.rotation.y = aGate;
          glbCoreIris.rotation.z = aGate * 0.5;
          glbCoreIris.rotation.x = Math.sin(elapsed * 0.3) * 0.18 * motionScale;
        }
      } else {
        fast.rotation.z = aFast;
        quar.rotation.z = aQuar;
        gate.rotation.z = aGate;
      }

      // Subtle parallax rotation of distant starfield & CAD graticule
      spaceBackdrop.rotation.z = aFast * 0.04;
      spaceBackdrop.rotation.y = yaw * 0.18;
      spaceBackdrop.rotation.x = pitch * 0.18;

      const starPulse = 1 + 0.045 * Math.sin(elapsed * 3.2) * motionScale;
      starCoreMesh.scale.setScalar(starPulse);
      if (glbHopeStar) {
        glbHopeStar.scale.setScalar(starPulse);
      }
      haloSprite.scale.setScalar(0.88 + 0.07 * Math.sin(elapsed * 2.4) * motionScale);
      starLight.intensity = 6.5 + 0.9 * Math.sin(elapsed * 3.2) * motionScale;

      const colEase = Math.min(1, dt * 5);
      const amberTarget = qAct ? 0.85 + 0.15 * Math.sin(elapsed * 3.8) : 0.35;
      amberBlend += (amberTarget - amberBlend) * colEase;
      emeraldBlend += ((gLock ? 1 : 0) - emeraldBlend) * colEase;

      for (const m of amberMaterials) {
        m.color.copy(BRONZE_IDLE).lerp(BRONZE_ACTIVE, amberBlend);
      }
      for (const m of emeraldMaterials) {
        m.color.copy(IRIS_OPEN).lerp(IRIS_LOCKED, emeraldBlend);
      }

      const activeHighlight = currentHover ?? extHighlight;
      const hoverEase = Math.min(1, dt * 10);
      for (const r of ['fast', 'quar', 'gate'] as const) {
        hoverBlend[r] += ((activeHighlight === r ? 1 : 0) - hoverBlend[r]) * hoverEase;
        for (const m of ringMaterials[r]) {
          const base = m.userData.base as THREE.Color | undefined;
          if (base) {
            m.color.copy(base).lerp(WHITE, hoverBlend[r] * 0.18);
          }
        }
      }

      if (!dragging && now - lastReleaseTime > 1500) {
        const targetYaw = prefersReducedMotion ? -0.34 : -0.34 + 0.22 * Math.sin(elapsed * 0.26);
        const targetPitch = prefersReducedMotion ? 0.16 : 0.16 + 0.1 * Math.sin(elapsed * 0.2 + 1);
        yaw += (targetYaw - yaw) * dt * 0.75;
        pitch += (targetPitch - pitch) * dt * 0.75;
      }

      root.rotation.set(pitch, yaw, 0);
      camera.position.set(0, 0, baseCamDist * zoom);
      root.updateMatrixWorld(true);
      renderer.render(scene, camera);

      if (frameCount % 4 === 0) {
        if (fastDegRef.current) fastDegRef.current.textContent = `${normDeg(-aFast).toFixed(1)}°`;
        if (quarDegRef.current) quarDegRef.current.textContent = `${normDeg(aQuar).toFixed(1)}°`;
        if (gateDegRef.current) {
          gateDegRef.current.textContent = `${Math.round(normDeg(aGate) / 60) * 60}°`;
        }
      }
    };

    const onVisibilityChange = () => {
      hidden = document.hidden;
      if (!hidden && !disposed) {
        lastTime = performance.now();
        rafId = window.requestAnimationFrame(renderFrame);
      } else {
        window.cancelAnimationFrame(rafId);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (!hidden) {
      rafId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
      haloTex.dispose();
      starShaderMat.dispose();
      haloSpriteMat.dispose();
      envRT.dispose();
      disposeObject3D(spaceBackdrop);
      disposeObject3D(root);
      renderer.dispose();
    };
  }, [glbUrl]);

  return (
    <div
      ref={stageRef}
      className="relative w-full h-full min-h-[300px] xl:min-h-0 bg-[#07080b] overflow-hidden select-none rounded-[2px] border border-zinc-800/70"
    >
      {/* Subtle Architectural CAD Corner Reticles & Azimuth Crosshairs (no bland flat gradient) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-55"
        preserveAspectRatio="none"
      >
        <line x1="50%" y1="0" x2="50%" y2="24" stroke="#3f3f46" strokeWidth="1" />
        <line x1="50%" y1="100%" x2="50%" y2="calc(100% - 24)" stroke="#3f3f46" strokeWidth="1" />
        <line x1="0" y1="50%" x2="24" y2="50%" stroke="#3f3f46" strokeWidth="1" />
        <line x1="100%" y1="50%" x2="calc(100% - 24)" y2="50%" stroke="#3f3f46" strokeWidth="1" />
      </svg>

      {/* Corner Calibration Coordinates */}
      <div className="pointer-events-none absolute top-2.5 left-3 font-mono text-[9px] tracking-[0.16em] text-zinc-600 uppercase">
        NIDAVELLIR · CORE 00
      </div>
      <div className="pointer-events-none absolute top-2.5 right-3 font-mono text-[9px] tracking-[0.16em] text-zinc-600 uppercase">
        HOPE v4 STAR ENGINE
      </div>

      {!webglFallback ? (
        <canvas
          ref={canvasRef}
          aria-label="Interactive Nidavellir Three-Clock Dyson Forge. Drag to orbit, scroll to zoom, click a ring to inspect, double-click to reset."
          className="absolute inset-0 w-full h-full touch-none cursor-grab"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-zinc-500">
          3D THREE-CLOCK FORGE · WEBGL UNAVAILABLE
        </div>
      )}

      {/* Compact Mechanical Axis Readout Pill */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-[2px] border border-zinc-800/90 bg-[#07080b]/90 px-3.5 py-1.5 font-mono text-[10.5px] tabular-nums whitespace-nowrap">
        <span className="text-zinc-400">
          DYSON <b ref={fastDegRef} className="text-sky-400 font-medium">0.0°</b>
        </span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-400">
          QUAR <b ref={quarDegRef} className="text-amber-400 font-medium">0.0°</b>
        </span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-400">
          IRIS <b ref={gateDegRef} className="text-emerald-400 font-medium">0°</b>
        </span>
        <span className="hidden sm:inline text-zinc-700">|</span>
        <span className="hidden sm:inline text-zinc-500">DRAG ORBIT · SCROLL ZOOM</span>
      </div>
    </div>
  );
}

export default ThreeClockCore3D;
