'use client';

import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Html, OrbitControls, RoundedBox, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ASSEMBLIES, type AssemblySpec } from './AxiomAnatomy';

export interface Node3DConfig {
  id: string;
  name: string;
  badge: string;
  desc: string;
  basePos: [number, number, number];
  size: [number, number, number];
  radius: number;
  color: string;
  coreColor: string;
}

// 12 Nodes positioned in an organic, balanced 3D constellation
export const NODES_3D: Node3DConfig[] = [
  // Tier 1: Intake & Knowledge (Upper Layer)
  {
    id: '01',
    name: 'TASK BANK',
    badge: '40 · 40 · 120 SPLITS',
    desc: 'Seeded problem synthesizer',
    basePos: [-3.8, 2.2, -1.8],
    size: [1.3, 0.9, 0.9],
    radius: 0.18,
    color: '#38bdf8',
    coreColor: '#0284c7',
  },
  {
    id: '04',
    name: 'CONDITIONS',
    badge: 'A B C C0 D E_B',
    desc: 'Ablation matrix compiler',
    basePos: [-1.4, 2.6, -2.4],
    size: [1.4, 0.8, 0.9],
    radius: 0.16,
    color: '#818cf8',
    coreColor: '#4f46e5',
  },
  {
    id: '02',
    name: 'RETRIEVAL',
    badge: 'K=6 · OVERLAP RANK',
    desc: 'Flag-overlap lesson selector',
    basePos: [1.4, 2.5, -2.2],
    size: [1.3, 0.8, 0.9],
    radius: 0.16,
    color: '#22d3ee',
    coreColor: '#0891b2',
  },
  {
    id: '03',
    name: 'LESSON STORE',
    badge: 'READ-ONLY · SHA-256',
    desc: 'Immutable memory vault',
    basePos: [3.8, 2.0, -1.4],
    size: [1.3, 0.9, 0.9],
    radius: 0.18,
    color: '#34d399',
    coreColor: '#059669',
  },

  // Tier 2: Compute Core, Crucible & Arbitration (Center Layer)
  {
    id: '06',
    name: 'GUARDRAILS',
    badge: 'FAIL-CLOSED · CACHE',
    desc: 'Budget & safety interceptor',
    basePos: [-3.8, 0.1, 0.6],
    size: [1.2, 0.8, 0.9],
    radius: 0.16,
    color: '#94a3b8',
    coreColor: '#475569',
  },
  {
    id: '05',
    name: 'EXECUTOR',
    badge: 'ZERO-TEMP COMPILER',
    desc: 'Generative model compiler core',
    basePos: [-1.6, 0.6, 1.0],
    size: [1.7, 1.2, 1.3],
    radius: 0.25,
    color: '#22d3ee', // Cyan
    coreColor: '#06b6d4',
  },
  {
    id: '07',
    name: 'ORACLE CRUCIBLE',
    badge: 'PG 16 · 34 FACTS',
    desc: 'Isolated PostgreSQL 16 reactor',
    basePos: [1.0, 0.3, 0.0],
    size: [2.1, 1.4, 1.6],
    radius: 0.3,
    color: '#a855f7', // Purple reactor
    coreColor: '#7c3aed',
  },
  {
    id: '08',
    name: 'VERDICT',
    badge: 'FACT IDS ONLY',
    desc: 'Deterministic fact prober',
    basePos: [3.8, 0.0, 1.0],
    size: [1.4, 1.0, 1.1],
    radius: 0.2,
    color: '#f43f5e', // Carmine/Magenta
    coreColor: '#e11d48',
  },

  // Tier 3: Distillation, Ledger & Analysis (Bottom Layer)
  {
    id: '12',
    name: 'ADVISOR',
    badge: '< 24 WORDS · GATED',
    desc: 'Lesson distillation unit',
    basePos: [-2.6, -1.8, 1.8],
    size: [1.3, 0.9, 0.9],
    radius: 0.18,
    color: '#fbbf24', // Amber/Yellow
    coreColor: '#d97706',
  },
  {
    id: '09',
    name: 'SCORER',
    badge: 'BOUND FACTS · F-13',
    desc: 'Behavioral balance evaluator',
    basePos: [-0.3, -2.1, 1.5],
    size: [1.2, 0.8, 0.8],
    radius: 0.16,
    color: '#94a3b8',
    coreColor: '#64748b',
  },
  {
    id: '10',
    name: 'CHECKPOINT',
    badge: '720 PROVENANCE TRIALS',
    desc: 'Twin ledger vault',
    basePos: [1.9, -1.9, 1.3],
    size: [1.4, 0.9, 1.0],
    radius: 0.18,
    color: '#34d399',
    coreColor: '#10b981',
  },
  {
    id: '11',
    name: 'ANALYSIS',
    badge: 'SIGN-FLIP · HOLM',
    desc: 'Statistical verification deck',
    basePos: [3.8, -1.5, 0.4],
    size: [1.3, 0.8, 0.9],
    radius: 0.16,
    color: '#a855f7',
    coreColor: '#9333ea',
  },
];

export const SYNAPSE_CONNECTIONS: [string, string, string][] = [
  ['01', '04', '#38bdf8'],
  ['04', '02', '#818cf8'],
  ['02', '03', '#34d399'],
  ['02', '05', '#22d3ee'],
  ['06', '05', '#94a3b8'],
  ['05', '07', '#22d3ee'],
  ['07', '08', '#a855f7'],
  ['08', '12', '#f43f5e'],
  ['12', '03', '#fbbf24'],
  ['08', '09', '#f43f5e'],
  ['09', '10', '#34d399'],
  ['10', '11', '#a855f7'],
];

// Single Soft 3D Node
function SoftNode({
  node,
  isSelected,
  isHovered,
  exploded,
  modelName,
  onSelect,
  onHover,
}: {
  node: Node3DConfig;
  isSelected: boolean;
  isHovered: boolean;
  exploded: boolean;
  modelName?: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  // Position with gentle exploded expansion
  const pos: [number, number, number] = useMemo(() => {
    const factor = exploded ? 1.4 : 1.0;
    return [node.basePos[0] * factor, node.basePos[1] * factor, node.basePos[2] * factor];
  }, [node.basePos, exploded]);

  useFrame((state, delta) => {
    if (!coreRef.current || !meshRef.current) return;
    const t = state.clock.getElapsedTime();
    // Subtle breathing pulse on the inner core
    const s = 1 + Math.sin(t * 2.4 + parseFloat(node.id)) * 0.04;
    coreRef.current.scale.set(s, s, s);
    if (isSelected || isHovered) {
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  const nodeColor = node.color;
  const badgeText = node.id === '05' && modelName ? modelName.split('/').pop()?.toUpperCase() : node.badge;

  return (
    <Float
      speed={1.6}
      rotationIntensity={0.2}
      floatIntensity={0.6}
      floatingRange={[-0.08, 0.08]}
    >
      <group position={pos}>
        {/* Soft Frosted Outer Rounded Shell */}
        <RoundedBox
          ref={meshRef}
          args={node.size}
          radius={node.radius}
          smoothness={6}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(node.id);
          }}
          onPointerOut={() => onHover(null)}
        >
          <meshPhysicalMaterial
            color={nodeColor}
            emissive={nodeColor}
            emissiveIntensity={isSelected ? 0.85 : isHovered ? 0.6 : 0.22}
            roughness={0.18}
            metalness={0.12}
            transmission={0.7}
            thickness={1.2}
            transparent
            opacity={0.88}
            reflectivity={0.9}
            clearcoat={1}
            clearcoatRoughness={0.1}
          />
        </RoundedBox>

        {/* Bioluminescent Inner Nucleus Core */}
        <mesh ref={coreRef} scale={0.55}>
          <sphereGeometry args={[Math.min(...node.size) * 0.45, 24, 24]} />
          <meshStandardMaterial
            color={node.coreColor}
            emissive={node.coreColor}
            emissiveIntensity={isSelected ? 2.4 : isHovered ? 1.8 : 1.1}
            roughness={0.2}
          />
        </mesh>

        {/* Ambient Halo Wire on Select */}
        {(isSelected || isHovered) && (
          <mesh scale={1.08}>
            <sphereGeometry args={[Math.max(...node.size) * 0.65, 16, 16]} />
            <meshBasicMaterial
              color={nodeColor}
              wireframe
              transparent
              opacity={isSelected ? 0.35 : 0.2}
            />
          </mesh>
        )}

        {/* Floating Sci-Fi HTML Label */}
        <Html
          position={[0, node.size[1] * 0.5 + 0.32, 0]}
          center
          distanceFactor={13}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '4px 8px',
              background: isSelected ? 'rgba(7, 9, 16, 0.94)' : 'rgba(7, 9, 16, 0.78)',
              backdropFilter: 'blur(6px)',
              border: isSelected
                ? `1.5px solid ${nodeColor}`
                : isHovered
                ? `1px solid ${nodeColor}`
                : '1px solid rgba(160, 170, 255, 0.22)',
              borderRadius: '5px',
              boxShadow: isSelected
                ? `0 0 16px ${nodeColor}, inset 0 0 8px ${nodeColor}`
                : '0 4px 12px rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono, monospace)',
              transition: 'all 0.2s ease',
              transform: isSelected ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: nodeColor,
                  boxShadow: `0 0 6px ${nodeColor}`,
                }}
              />
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: '#f8fafc' }}>
                {node.id} · {node.name}
              </span>
            </div>
            <span style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.05em' }}>
              {badgeText}
            </span>
          </div>
        </Html>
      </group>
    </Float>
  );
}

// Glowing Synaptic Connecting Curves
function SynapseLine({
  start,
  end,
  color,
  active,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  active: boolean;
}) {
  const curve = useMemo(() => {
    const p0 = new THREE.Vector3(...start);
    const p2 = new THREE.Vector3(...end);
    // Midpoint arched upwards slightly for organic synapse flow
    const mid = new THREE.Vector3().addVectors(p0, p2).multiplyScalar(0.5);
    mid.y += 0.45;
    return new THREE.QuadraticBezierCurve3(p0, mid, p2);
  }, [start, end]);

  const geom = useMemo(() => {
    return new THREE.TubeGeometry(curve, 32, 0.024, 8, false);
  }, [curve]);

  const pulseMesh = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!pulseMesh.current) return;
    const t = (state.clock.getElapsedTime() * 0.8) % 1;
    const pt = curve.getPoint(t);
    pulseMesh.current.position.copy(pt);
  });

  return (
    <group>
      {/* Base glowing line tube */}
      <mesh geometry={geom}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 1.6 : 0.8}
          roughness={0.2}
          transparent
          opacity={active ? 0.9 : 0.55}
        />
      </mesh>

      {/* Traveling Synaptic Energy Pulse */}
      <mesh ref={pulseMesh}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function Soft3DAnatomyStage({
  selectedId,
  onSelect,
  hoveredId,
  onHover,
  running,
  exploded,
  modelName,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  stageIdx?: number;
  running: boolean;
  exploded: boolean;
  modelName?: string;
}) {
  const nodeMap = useMemo(() => {
    return new Map(NODES_3D.map((n) => [n.id, n]));
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '680px',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 50%, #0d1326 0%, #060914 55%, #020306 100%)',
      }}
    >
      <Canvas
        camera={{ position: [9, 7.5, 9.5], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      >
        {/* Soft Ambient and Directional Lighting */}
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 10, 8]} intensity={1.2} color="#f8fafc" />

        {/* Colored Point Lights matching Axiom Node Highlights */}
        <pointLight position={[-1.6, 1.4, 1.2]} color="#22d3ee" intensity={2.8} distance={10} />
        <pointLight position={[1.0, 1.2, 0.0]} color="#a855f7" intensity={3.2} distance={12} />
        <pointLight position={[3.8, 0.8, 1.0]} color="#f43f5e" intensity={2.6} distance={10} />
        <pointLight position={[-2.6, -1.2, 1.8]} color="#fbbf24" intensity={2.2} distance={8} />
        <pointLight position={[3.8, 2.2, -1.4]} color="#34d399" intensity={2.2} distance={8} />

        {/* Deep Space Background Stars */}
        <Stars radius={45} depth={40} count={900} factor={2.5} saturation={0.5} fade speed={0.8} />

        {/* Synaptic Connecting Curves */}
        {SYNAPSE_CONNECTIONS.map(([fromId, toId, color]) => {
          const fromNode = nodeMap.get(fromId);
          const toNode = nodeMap.get(toId);
          if (!fromNode || !toNode) return null;

          const factor = exploded ? 1.4 : 1.0;
          const start: [number, number, number] = [
            fromNode.basePos[0] * factor,
            fromNode.basePos[1] * factor,
            fromNode.basePos[2] * factor,
          ];
          const end: [number, number, number] = [
            toNode.basePos[0] * factor,
            toNode.basePos[1] * factor,
            toNode.basePos[2] * factor,
          ];
          const isActive = fromId === selectedId || toId === selectedId;

          return (
            <SynapseLine
              key={`${fromId}-${toId}`}
              start={start}
              end={end}
              color={color}
              active={isActive}
            />
          );
        })}

        {/* 12 Soft 3D Floating Nodes */}
        {NODES_3D.map((node) => (
          <SoftNode
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            isHovered={hoveredId === node.id}
            exploded={exploded}
            modelName={modelName}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}

        {/* Bloom and Holographic Post-Processing */}
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.28} luminanceSmoothing={0.85} intensity={0.85} />
        </EffectComposer>

        {/* Orbit Controls with Gentle Auto-Rotate */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={6}
          maxDistance={18}
          autoRotate={running}
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2 + 0.1}
          minPolarAngle={Math.PI / 6}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
