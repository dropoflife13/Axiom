'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sceneForProgress } from '@/lib/scroll-scene';

const vertexShader = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = `
uniform float uT;
uniform float uGlow;
uniform vec3 uCol;
uniform vec3 uAlt;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float ln = smoothstep(0.44, 0.5, abs(fract(vUv.y * 36.0) - 0.5));
  float rg = smoothstep(0.45, 0.5, abs(fract(vUv.x * 128.0) - 0.5));
  float p = pow(max(0.0, sin(vUv.x * 18.8496 - uT * 2.0)), 24.0);
  vec3 c = mix(uCol, uAlt, 0.5 + 0.5 * sin(vUv.x * 12.57 + uT * 0.4));
  gl_FragColor = vec4(
    (c * (0.3 + f * 1.5) + vec3(p) * 0.8) * uGlow,
    clamp((f * 0.85 + ln * 0.3 + rg * 0.14 + p * 0.9) * uGlow, 0.0, 1.0)
  );
}
`;

const BASE_CORE_SCALE = 0.84;
const MAX_CORE_SCALE = 1.38;

export interface LoopingDonutProps {
  color: number;
  running: boolean;
  progress: React.MutableRefObject<number>;
  transitionKey?: string;
}

export default function LoopingDonut({ color, running, progress, transitionKey }: LoopingDonutProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep latest props in refs so 60FPS animation loop accesses them without re-mounting
  const targetColorRef = React.useRef(new THREE.Color(color));
  const runningRef = React.useRef(running);
  const progressRef = React.useRef(progress);
  const prevTransitionKeyRef = React.useRef(transitionKey);
  const glitchRemainingRef = React.useRef(0);

  React.useEffect(() => {
    targetColorRef.current.set(color);
  }, [color]);

  React.useEffect(() => {
    runningRef.current = running;
  }, [running]);

  React.useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  React.useEffect(() => {
    if (prevTransitionKeyRef.current !== undefined && transitionKey !== undefined && prevTransitionKeyRef.current !== transitionKey) {
      const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        glitchRemainingRef.current = 0.3;
      }
    }
    prevTransitionKeyRef.current = transitionKey;
  }, [transitionKey]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x05060a, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false; // Page scrolling takes precedence
    controls.minDistance = 3;
    controls.maxDistance = 10;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    const group = new THREE.Group();
    scene.add(group);

    // Torus Knot Geometry
    const geo = new THREE.TorusKnotGeometry(1, 0.34, 320, 48, 2, 3);
    const curColor = new THREE.Color(color);

    // Shader Material for the holographic flowing core
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uT: { value: 0 },
        uGlow: { value: 1 },
        uCol: { value: curColor.clone() },
        uAlt: { value: new THREE.Color(0x22d3ee) },
      },
      vertexShader,
      fragmentShader,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Outer wireframe shell
    const wireMat = new THREE.MeshBasicMaterial({
      color: curColor,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wire = new THREE.Mesh(geo, wireMat);
    wire.scale.setScalar(1.015);
    group.add(wire);

    // Outer atmospheric halo
    const haloGeo = new THREE.TorusKnotGeometry(1, 0.55, 160, 24, 2, 3);
    const haloMat = new THREE.MeshBasicMaterial({
      color: curColor,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    group.add(halo);

    // 3,000 Particle Cloud surrounding the loop
    const particleCount = 3000;
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const u = Math.random() * Math.PI * 4;
      const q = 1.5 * u;
      const r = (2 + Math.cos(q)) * 0.5;
      const vx = r * Math.cos(u);
      const vy = r * Math.sin(u);
      const vz = Math.sin(q) * 0.5;

      // Random jitter
      const ox = Math.random() - 0.5;
      const oy = Math.random() - 0.5;
      const oz = Math.random() - 0.5;
      const len = Math.hypot(ox, oy, oz) || 1;
      const dist = 0.4 + Math.random() * 0.7;

      pos[i * 3] = vx + (ox / len) * dist;
      pos[i * 3 + 1] = vy + (oy / len) * dist;
      pos[i * 3 + 2] = vz + (oz / len) * dist;
    }

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pointsMat = new THREE.PointsMaterial({
      color: curColor,
      size: 0.014,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    group.add(points);

    // Resize handler
    const updateSize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 1 ? 8.2 : 6.4;
      camera.position.y = 0.2;
      camera.updateProjectionMatrix();
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // Viewport IntersectionObserver to pause rendering when offscreen (cuts GPU usage in half!)
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

    // Native continuous 60FPS animation loop
    let animId: number;
    let lastTime = performance.now();
    let speed = 1.0;
    let currentScale = BASE_CORE_SCALE;

    // Cinematic zoom-out transition when opening the website
    const isReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let introZoom = isReduced ? 1.0 : 1.3;

    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);

      // Skip render when tab is hidden or element is scrolled out of viewport
      if (!isVisible || document.hidden) {
        lastTime = now;
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Opening zoom-out transition
      if (introZoom > 1.0) {
        introZoom += (1.0 - introZoom) * Math.min(1, dt * 2.6);
        if (introZoom < 1.002) introZoom = 1.0;
        points.rotation.y += dt * 0.4 * (introZoom - 1.0);
      }

      const isRunning = runningRef.current;
      // Active speed when running, smooth idle rotation when paused (never completely frozen)
      speed += ((isRunning ? 1.6 : 0.35) - speed) * 0.05;
      const sp = speed;

      // Advance shader pulse time (this moves the white glowing rounded pulse around the tube!)
      mat.uniforms.uT.value += dt * sp;

      // Rotations
      group.rotation.y += dt * 0.2 * sp;
      group.rotation.x += dt * 0.08 * sp;
      wire.rotation.y -= dt * 0.05 * sp;
      points.rotation.y += dt * 0.1 * sp;

      // Color transition (smooth lerp to Red on Fail or Cyan on Pass)
      curColor.lerp(targetColorRef.current, 0.06);
      mat.uniforms.uCol.value.copy(curColor);
      wireMat.color.copy(curColor);
      haloMat.color.copy(curColor);
      pointsMat.color.copy(curColor);

      // Scroll-driven zoom transition + breakage/glitch rapid 1->0->1 flicker on model switch
      const curProgress = progressRef.current?.current ?? 0;
      const sceneValues = sceneForProgress(curProgress);
      const zoomProgress = Math.max(0, Math.min(1, (sceneValues.scale - 1) / 1.6));
      const targetScale = Math.max(
        BASE_CORE_SCALE,
        BASE_CORE_SCALE + zoomProgress * (MAX_CORE_SCALE - BASE_CORE_SCALE)
      );
      currentScale += (targetScale - currentScale) * Math.min(1, dt * 6);

      let glitchScale = 1.0;
      let glitchFlicker = 1.0;
      if (glitchRemainingRef.current > 0) {
        glitchRemainingRef.current = Math.max(0, glitchRemainingRef.current - dt);
        const gp = 1 - glitchRemainingRef.current / 0.3;
        if (gp < 0.46) {
          glitchScale = Math.max(0.01, Math.pow(1 - gp / 0.46, 2));
        } else if (gp < 0.56) {
          glitchScale = 0.01;
        } else {
          glitchScale = Math.min(1.06, Math.pow((gp - 0.56) / 0.44, 0.65) * 1.04);
        }
        glitchFlicker = Math.sin(gp * Math.PI * 14) > -0.15 ? 1.35 : 0.08;
        group.rotation.y += dt * 6.0;
      }

      group.scale.setScalar(currentScale * introZoom * glitchScale);

      const baseGlow = mat.uniforms.uGlow.value + (sceneValues.glow - mat.uniforms.uGlow.value) * Math.min(1, dt * 6);
      mat.uniforms.uGlow.value = glitchRemainingRef.current > 0 ? baseGlow * glitchFlicker : baseGlow;
      wireMat.opacity = glitchRemainingRef.current > 0 ? 0.1 * glitchFlicker : 0.1;
      pointsMat.opacity = glitchRemainingRef.current > 0 ? 0.7 * glitchFlicker : 0.7;

      controls.autoRotate = isRunning;
      controls.update();

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controls.dispose();
      renderer.dispose();
      geo.dispose();
      haloGeo.dispose();
      pointsGeo.dispose();
      mat.dispose();
      wireMat.dispose();
      haloMat.dispose();
      pointsMat.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        touchAction: 'pan-y',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: 'grab',
          touchAction: 'none',
        }}
        aria-label="Interactive 3D healing loop. Drag to orbit."
      />
    </div>
  );
}
