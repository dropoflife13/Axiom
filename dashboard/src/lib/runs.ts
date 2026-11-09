/**
 * Single source of truth for the ablation runs the dashboard can display.
 * Supports dynamic run discovery while providing model inference & accents.
 */
export interface RunOption {
  id: string;
  label: string;
  model: string;
  /** Accent used for the run's indicator dot / bars. */
  accent: string;
}

export const RUN_DISPLAY_NAMES: Record<string, string> = {
  'nemotron-2': 'NEMOTRON 550B',
  'nemotron-1': 'NEMOTRON 550B',
  'qwen27b-2': 'QWEN 3.8 27B',
  'qwen27b-1': 'QWEN 3.8 27B',
  'glm5-2': 'GLM-5.3',
  'glm53-1': 'GLM-5.3',
};

export function getDisplayName(runId: string): string {
  if (RUN_DISPLAY_NAMES[runId]) {
    return RUN_DISPLAY_NAMES[runId];
  }
  const lower = runId.toLowerCase();
  if (lower.includes('nemotron')) return 'NEMOTRON 550B';
  if (lower.includes('qwen')) return 'QWEN 3.8 27B';
  if (lower.includes('glm')) return 'GLM-5.3';
  if (lower.includes('llama33') || lower.includes('llama-3.3')) return 'LLAMA 3.3';
  if (lower.includes('gemma')) return 'GEMMA 2';

  // Fallback: If a run ID is not in the map (e.g., a future run), strip the -2 suffix and uppercase it
  return runId.replace(/-\d+$/, '').toUpperCase();
}

export function inferRunOption(id: string): RunOption {
  const lower = id.toLowerCase();
  let model = id;
  let accent = '#38bdf8';

  if (lower.includes('nemotron')) {
    model = 'nvidia/nemotron-3-ultra-550b-a55b';
    accent = '#76b900';
  } else if (lower.includes('qwen')) {
    model = 'qwen/qwen3.8-27b';
    accent = '#ff8a3d';
  } else if (lower.includes('glm')) {
    model = 'z-ai/glm-5.3-flash';
    accent = '#2dd4bf';
  } else if (lower.includes('llama')) {
    model = 'meta-llama/llama-3.3-70b-instruct';
    accent = '#60a5fa';
  } else if (lower.includes('gemma')) {
    model = 'google/gemma-2-27b-it';
    accent = '#a78bfa';
  }

  return {
    id,
    label: getDisplayName(id),
    model,
    accent,
  };
}

export const DEFAULT_RUN_OPTIONS: readonly RunOption[] = [
  inferRunOption('nemotron-2'),
  inferRunOption('qwen27b-2'),
  inferRunOption('glm5-2'),
];

export const RUN_OPTIONS: readonly RunOption[] = DEFAULT_RUN_OPTIONS;

export const DEFAULT_RUN_ID = 'nemotron-2';
export const TRIALS_PER_RUN = 720;

export function runById(id: string | null | undefined, options: readonly RunOption[] = RUN_OPTIONS): RunOption | undefined {
  if (!id) return undefined;
  return options.find((r) => r.id === id) ?? inferRunOption(id);
}

export function modelForRun(id: string | null | undefined): string {
  if (!id) return 'unknown';
  return inferRunOption(id).model;
}
