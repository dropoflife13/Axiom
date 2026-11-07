export interface SceneValues {
  scale: number;
  glow: number;
  hud: number;
  canvas: number;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function sceneForProgress(progress: number): SceneValues {
  const p = clamp(progress);
  const e = smoothstep(0, 1, p);
  return {
    scale: 1 + 1.6 * e,
    glow: 1 + 0.6 * e,
    hud: 1 - smoothstep(0.05, 0.35, p),
    canvas: 1 - smoothstep(0.85, 1, p),
  };
}
