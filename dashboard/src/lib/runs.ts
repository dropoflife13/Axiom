/**
 * Single source of truth for the ablation runs the dashboard can display.
 * Add a run here and it appears in the hero selector, the parallel-run strip,
 * the Cortex section and the checkpoint API.
 */
export interface RunOption {
  id: string;
  label: string;
  model: string;
  /** Accent used for the run's indicator dot / bars. */
  accent: string;
}

export const RUN_OPTIONS: readonly RunOption[] = [
  { id: 'nemotron-1', label: 'NEMOTRON 550B', model: 'nvidia/nemotron-3-ultra-550b-a55b', accent: '#76b900' },
  { id: 'qwen27b-1', label: 'QWEN 3.8 27B', model: 'qwen/qwen3.8-27b', accent: '#ff8a3d' },
  { id: 'glm53-1', label: 'GLM-5.3', model: 'z-ai/glm-5.3-flash', accent: '#2dd4bf' },
] as const;

export const DEFAULT_RUN_ID = 'nemotron-1';
export const TRIALS_PER_RUN = 720;

export function runById(id: string | null | undefined): RunOption | undefined {
  return RUN_OPTIONS.find((r) => r.id === id);
}

export function modelForRun(id: string | null | undefined): string {
  return runById(id)?.model ?? id ?? 'unknown';
}
