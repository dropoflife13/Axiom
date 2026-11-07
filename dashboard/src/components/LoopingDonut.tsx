'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { sceneForProgress } from '@/lib/scroll-scene';

const vertex = `varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;

const fragment = `uniform float uT,uGlow;uniform vec3 uCol,uAlt;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){
  float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.2);
  float ln=smoothstep(.44,.5,abs(fract(vUv.y*36.)-.5));
  float rg=smoothstep(.45,.5,abs(fract(vUv.x*128.)-.5));
  float p=pow(max(0.,sin(vUv.x*18.8496-uT*2.)),24.);
  vec3 c=mix(uCol,uAlt,.5+.5*sin(vUv.x*12.57+uT*.4));
  gl_FragColor=vec4((c*(.3+f*1.5)+vec3(p)*.8)*uGlow,clamp((f*.85+ln*.3+rg*.14+p*.9)*uGlow,0.,1.));
}`;

function Knot({ color, running, progress }: { color: number; running: boolean; progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const wire = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const speed = useRef(1);
  const currentScale = useRef(1);
  const cur = useMemo(() => new THREE.Color(color), []); // eslint-disable-line react-hooks/exhaustive-deps
  const target = useMemo(() => new THREE.Color(), []);
  const uniforms = useMemo(
    () => ({
      uT: { value: 0 },
      uCol: { value: new THREE.Color(color) },
      uAlt: { value: new THREE.Color(0x22d3ee) },
      uGlow: { value: 1 },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const positions = useMemo(() => {
    const n = 3000;
    const arr = new Float32Array(n * 3);
    const o = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 4;
      const q = 1.5 * u;
      const r = (2 + Math.cos(q)) * 0.5;
      o.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const d = 0.4 + Math.random() * 0.7;
      arr.set([r * Math.cos(u) + o.x * d, r * Math.sin(u) + o.y * d, Math.sin(q) * 0.5 + o.z * d], i * 3);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!group.current || !wire.current || !halo.current || !points.current) return;
    const dt = Math.min(0.05, delta);
    const scene = sceneForProgress(progress.current);
    speed.current += ((running ? 1.6 : 0.15) - speed.current) * 0.05;
    const s = speed.current;
    currentScale.current += (scene.scale - currentScale.current) * Math.min(1, dt * 5);
    group.current.scale.setScalar(currentScale.current);
    uniforms.uT.value += dt * s;
    uniforms.uGlow.value += (scene.glow - uniforms.uGlow.value) * Math.min(1, dt * 5);
    group.current.rotation.y += dt * 0.2 * s;
    group.current.rotation.x += dt * 0.08 * s;
    wire.current.rotation.y -= dt * 0.05 * s;
    points.current.rotation.y += dt * 0.1 * s;
    cur.lerp(target.set(color), 0.06);
    uniforms.uCol.value.copy(cur);
    (wire.current.material as THREE.MeshBasicMaterial).color.copy(cur);
    (halo.current.material as THREE.MeshBasicMaterial).color.copy(cur);
    (points.current.material as THREE.PointsMaterial).color.copy(cur);
  });

  return (
    <group ref={group}>
      <mesh>
        <torusKnotGeometry args={[1, 0.34, 320, 48, 2, 3]} />
        <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wire} scale={1.015}>
        <torusKnotGeometry args={[1, 0.34, 320, 48, 2, 3]} />
        <meshBasicMaterial wireframe transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={halo}>
        <torusKnotGeometry args={[1, 0.55, 160, 24, 2, 3]} />
        <meshBasicMaterial transparent opacity={0.05} depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.014} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

function Fit() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.position.z = size.width / size.height < 1 ? 8 : 5.4;
  }, [camera, size]);
  return null;
}

export default function LoopingDonut({ color, running, progress }: { color: number; running: boolean; progress: MutableRefObject<number> }) {
  return (
    <Canvas camera={{ position: [0, 0.4, 5.4], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}>
      <Fit />
      <Knot color={color} running={running} progress={progress} />
      <OrbitControls enablePan={false} enableZoom={false} enableDamping autoRotate={running} autoRotateSpeed={0.8} minDistance={3} maxDistance={10} />
    </Canvas>
  );
}
