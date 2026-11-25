'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface ThreeClockCore3DProps {
  /** Optional path to a .glb model. Defaults to '/models/three-clock.glb' with automatic procedural fallback. */
  readonly glbUrl?: string;
  /** Normalized progress [0, 1] for active live trials; scales Fast Clock outer ring angular velocity. */
  readonly fastClockProgress?: number | null;
  /** True when Slow Clock canary replays / quarantine evaluations are actively running. */
  readonly quarantineActive?: boolean;
  /** True when canaryRegressions === 0 and lexical lock retention === 100.0%. */
  readonly slowClockLocked?: boolean;
}

export function ThreeClockCore3D({
  glbUrl = '/models/three-clock.glb',
  fastClockProgress = null,
  quarantineActive = false,
  slowClockLocked = true,
}: ThreeClockCore3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);

  const stateRef = useRef({
    fastClockProgress: fastClockProgress ?? 0,
    quarantineActive,
    slowClockLocked,
  });

  useEffect(() => {
    stateRef.current = {
      fastClockProgress: fastClockProgress ?? 0,
      quarantineActive,
      slowClockLocked,
    };
  }, [fastClockProgress, quarantineActive, slowClockLocked]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(0, 1.15, 6.2);
    camera.lookAt(0, 0, 0);

    // Balanced studio + rim lighting for sharp matte mechanical / GLB readability
    const hemiLight = new THREE.HemisphereLight(0xe4e4e7, 0x18181b, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfafafa, 1.55);
    keyLight.position.set(4.5, 5.5, 6.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa1a1aa, 0.65);
    fillLight.position.set(-5.0, 2.0, 4.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xd4d4d8, 1.1);
    rimLight.position.set(-3.5, -2.5, -5.5);
    scene.add(rimLight);

    const rootGroup = new THREE.Group();
    rootGroup.rotation.x = 0.2;
    scene.add(rootGroup);

    const matteChassisMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.76,
      metalness: 0.36,
    });
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x242832,
      roughness: 0.7,
      metalness: 0.42,
    });
    const outerTickMat = new THREE.MeshStandardMaterial({
      color: 0x52525b,
      roughness: 0.62,
      metalness: 0.48,
    });
    const quarantineMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      roughness: 0.7,
      metalness: 0.4,
    });
    const slowCoreMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      roughness: 0.66,
      metalness: 0.42,
    });
    const hairlineWireMat = new THREE.LineBasicMaterial({
      color: 0x3f3f46,
      transparent: true,
      opacity: 0.45,
    });

    const fastClockGroup = new THREE.Group();
    const quarantineGroup = new THREE.Group();
    const slowClockGroup = new THREE.Group();
    const glbContainer = new THREE.Group();

    rootGroup.add(fastClockGroup);
    rootGroup.add(quarantineGroup);
    rootGroup.add(slowClockGroup);
    rootGroup.add(glbContainer);

    const buildProceduralChronometer = () => {
      // Static outer calibration hairline ring
      const calibGeo = new THREE.RingGeometry(2.38, 2.392, 96);
      const calibMat = new THREE.MeshBasicMaterial({
        color: 0x3f3f46,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.48,
      });
      rootGroup.add(new THREE.Mesh(calibGeo, calibMat));

      // 1. Outer Ring: FAST CLOCK
      fastClockGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.13, 20, 96), outerRingMat)
      );
      fastClockGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.028, 12, 72), matteChassisMat)
      );

      const toothGeo = new THREE.BoxGeometry(0.045, 0.14, 0.16);
      for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2;
        const tooth = new THREE.Mesh(toothGeo, i % 9 === 0 ? outerTickMat : matteChassisMat);
        tooth.position.set(Math.cos(angle) * 2.18, Math.sin(angle) * 2.18, 0);
        tooth.rotation.z = angle + Math.PI / 2;
        fastClockGroup.add(tooth);
      }

      // 2. Middle Ring: QUARANTINE
      quarantineGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.12, 18, 72), quarantineMat)
      );
      quarantineGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.024, 12, 64), matteChassisMat)
      );

      const finGeo = new THREE.BoxGeometry(0.06, 0.2, 0.22);
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const fin = new THREE.Mesh(finGeo, quarantineMat);
        fin.position.set(Math.cos(angle) * 1.38, Math.sin(angle) * 1.38, 0.04);
        fin.rotation.z = angle;
        quarantineGroup.add(fin);
      }

      // 3. Inner Core: SLOW CLOCK GATE
      slowClockGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.095, 18, 48), slowCoreMat)
      );

      const coreHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.46, 0.28, 24),
        matteChassisMat
      );
      coreHub.rotation.x = Math.PI / 2;
      slowClockGroup.add(coreHub);

      const coreCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.34, 6),
        slowCoreMat
      );
      coreCap.rotation.x = Math.PI / 2;
      slowClockGroup.add(coreCap);

      const spokeGeo = new THREE.BoxGeometry(0.055, 0.72, 0.08);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const spoke = new THREE.Mesh(spokeGeo, slowCoreMat);
        spoke.position.set(Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0);
        spoke.rotation.z = angle + Math.PI / 2;
        slowClockGroup.add(spoke);
      }

      const meridianGeo = new THREE.EdgesGeometry(new THREE.TorusGeometry(1.72, 0.008, 6, 48));
      const meridianLines = new THREE.LineSegments(meridianGeo, hairlineWireMat);
      meridianLines.rotation.y = Math.PI / 3;
      rootGroup.add(meridianLines);
    };

    let disposed = false;

    if (glbUrl) {
      // Check if GLB exists before invoking GLTFLoader to avoid noisy 404 parse errors
      fetch(glbUrl, { method: 'HEAD' })
        .then((res) => {
          if (disposed) return;
          if (!res.ok) {
            buildProceduralChronometer();
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
                const scale = 3.9 / maxDim;
                model.scale.setScalar(scale);
                model.position.sub(center.multiplyScalar(scale));
                glbContainer.add(model);
              },
              undefined,
              () => {
                if (!disposed) buildProceduralChronometer();
              }
            );
          });
        })
        .catch(() => {
          if (!disposed) buildProceduralChronometer();
        });
    } else {
      buildProceduralChronometer();
    }

    const mutedAmber = new THREE.Color(0xb45309);
    const mutedSlate = new THREE.Color(0x27272a);
    const mutedEmerald = new THREE.Color(0x059669);
    const darkEmissive = new THREE.Color(0x000000);
    const amberEmissive = new THREE.Color(0x78350f);
    const emeraldEmissive = new THREE.Color(0x064e3b);

    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const { fastClockProgress: prog, quarantineActive: qAct, slowClockLocked: sLock } =
        stateRef.current;

      const fastSpeed = 0.12 + Math.max(0, Math.min(1, prog)) * 0.36;
      fastClockGroup.rotation.z -= dt * fastSpeed;

      const midSpeed = qAct ? 0.3 : 0.09;
      quarantineGroup.rotation.z += dt * midSpeed;
      quarantineMat.color.lerp(qAct ? mutedAmber : mutedSlate, dt * 4);
      quarantineMat.emissive.lerp(qAct ? amberEmissive : darkEmissive, dt * 4);
      quarantineMat.emissiveIntensity = qAct ? 0.42 : 0;

      const coreSpeed = sLock ? 0.035 : 0.14;
      slowClockGroup.rotation.z -= dt * coreSpeed;
      slowCoreMat.color.lerp(sLock ? mutedEmerald : mutedSlate, dt * 4);
      slowCoreMat.emissive.lerp(sLock ? emeraldEmissive : darkEmissive, dt * 4);
      slowCoreMat.emissiveIntensity = sLock ? 0.38 : 0;

      if (glbContainer.children.length > 0) {
        glbContainer.rotation.y += dt * 0.18;
      }

      // Smooth, slow gimbal orbit
      rootGroup.rotation.y = Math.sin(now * 0.00028) * 0.22;

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 320);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.dispose();
      matteChassisMat.dispose();
      outerRingMat.dispose();
      outerTickMat.dispose();
      quarantineMat.dispose();
      slowCoreMat.dispose();
      hairlineWireMat.dispose();
    };
  }, [glbUrl]);

  return (
    <div className="relative w-full h-[60vh] min-h-[400px] max-h-[680px] bg-[#08090c] overflow-hidden select-none">
      {!webglFallback ? (
        <div
          ref={mountRef}
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label="3D Three-Clock mechanical chronometer showing Fast Clock outer ring, Quarantine middle ring, and Slow Clock Gate inner core"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-zinc-500">
          3D THREE-CLOCK CORE · WEBGL UNAVAILABLE
        </div>
      )}
    </div>
  );
}

export default ThreeClockCore3D;
