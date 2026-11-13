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
  // Confirmatory Ablation v3 Runs (Live)
  'gemini-3.5-flash-lite-v3': 'GEMINI 3.5 FLASH LITE (V3 LIVE)',
  'gemini-3.1-flash-lite-v3': 'GEMINI 3.1 FLASH LITE (V3 LIVE)',
  'qwen27b-v3': 'QWEN 3.8 27B (V3 LIVE)',
  'nemotron-v3': 'NEMOTRON 550B (V3 LIVE)',
  'glm5-v3': 'GLM-5.3 (V3 LIVE)',
  'gemma4-31b-v3': 'GEMMA 4 31B DENSE (V3 LIVE)',

  // Confirmatory Ablation v2 Fleet
  'nemotron-2': 'NEMOTRON 550B',
  'nemotron-1': 'NEMOTRON 550B',
  'gemma4-31b-full': 'GEMMA 4 31B DENSE',
  'glm5-2': 'GLM-5.3',
  'glm53-1': 'GLM-5.3',
  'gemini-3.1-flash-lite': 'GEMINI 3.1 FLASH LITE',
  'gemini-flash-lite-full': 'GEMINI 3.5 FLASH LITE',
  'qwen27b-2': 'QWEN 3.8 27B',
  'qwen27b-1': 'QWEN 3.8 27B',
  'gptoss-120b-expanded': 'GPT-OSS 120B (LIVE)',
  'gptoss-mini': 'GPT-OSS 120B MINI',
  'gemma4-26b-full': 'GEMMA 4 26B (EXCL)',
  'nemotron-lightning-full': 'NEMOTRON 3.5 LIGHTNING (EXCL)',
  'nemotron-lightning': 'NEMOTRON 3.5 LIGHTNING (EXCL)',
  'smoke-nemotron-lightning': 'NEMOTRON 3.5 LIGHTNING (SMOKE)',
  'liquid17b-mini': 'LIQUID 1.7B MINI (PILOT)',
  'liquid-mini': 'LIQUID 1.7B MINI (PILOT)',
  'xingchen-mini': 'XINGCHEN MINI (PILOT)',
  'gemini-mini': 'GEMINI 3.6 FLASH MINI (PILOT)',
  'llama33-mini': 'LLAMA 3.3 (PILOT)',
};

export function getDisplayName(runId: string): string {
  if (RUN_DISPLAY_NAMES[runId]) {
    return RUN_DISPLAY_NAMES[runId];
  }
  const lower = runId.toLowerCase();
  if (lower.includes('smoke-nemotron') || lower.includes('smoke_nemotron')) return 'NEMOTRON 3.5 LIGHTNING (SMOKE)';
  if (lower.includes('gemma4-31b') || lower.includes('gemma-4-31b')) return 'GEMMA 4 31B DENSE';
  if (lower.includes('gemma4') || lower.includes('gemma-4')) return 'GEMMA 4 26B';
  if (lower.includes('3.1-flash-lite') || lower.includes('3.1_flash_lite')) return 'GEMINI 3.1 FLASH LITE';
  if (lower.includes('flash-lite') || lower.includes('flash_lite')) return 'GEMINI 3.5 FLASH LITE';
  if (lower.includes('lightning')) return 'NEMOTRON 3.5 LIGHTNING';
  if (lower.includes('gemini')) return 'GEMINI 3.6 FLASH MINI';
  if (lower.includes('liquid')) return 'LIQUID 1.7B MINI';
  if (lower.includes('nemotron')) return 'NEMOTRON 550B';
  if (lower.includes('qwen')) return 'QWEN 3.8 27B';
  if (lower.includes('glm')) return 'GLM-5.3';
  if (lower.includes('llama33') || lower.includes('llama-3.3')) return 'LLAMA 3.3';
  if (lower.includes('gptoss') || lower.includes('gpt-oss')) return 'GPT-OSS 120B';
  if (lower.includes('gemma')) return 'GEMMA 2';

  // Fallback: If a run ID is not in the map (e.g., a future run), strip the -2 suffix and format cleanly
  return runId.replace(/-\d+$/, '').replace(/-/g, ' ').toUpperCase();
}

export function inferRunOption(id: string): RunOption {
  const lower = id.toLowerCase();
  let model = id;
  let accent = '#38bdf8';

  if (lower.includes('gemma4-31b') || lower.includes('gemma-4-31b')) {
    model = 'gemma-4-31b-it';
    accent = '#c084fc';
  } else if (lower.includes('gemma4') || lower.includes('gemma-4')) {
    model = 'gemma-4-26b-it';
    accent = '#a78bfa';
  } else if (lower.includes('3.1-flash-lite') || lower.includes('3.1_flash_lite')) {
    model = 'gemini-3.1-flash-lite';
    accent = '#10b981';
  } else if (lower.includes('flash-lite') || lower.includes('flash_lite')) {
    model = 'gemini-3.5-flash-lite';
    accent = '#34a853';
  } else if (lower.includes('lightning')) {
    model = 'nvidia/nemotron-3.5-lightning:free';
    accent = '#eab308';
  } else if (lower.includes('gemini')) {
    model = 'gemini-3.6-flash';
    accent = '#4285f4';
  } else if (lower.includes('nemotron')) {
    model = 'nvidia/nemotron-3-ultra-550b-a55b';
    accent = '#76b900';
  } else if (lower.includes('qwen')) {
    model = 'qwen/qwen3.8-27b';
    accent = '#ff8a3d';
  } else if (lower.includes('glm')) {
    model = 'z-ai/glm-5.3-flash';
    accent = '#2dd4bf';
  } else if (lower.includes('liquid')) {
    model = 'liquid/lfm-3-1.7b';
    accent = '#38bdf8';
  } else if (lower.includes('llama')) {
    model = 'meta-llama/llama-3.3-70b-instruct';
    accent = '#60a5fa';
  } else if (lower.includes('gptoss') || lower.includes('gpt-oss')) {
    model = 'openai/gpt-oss-120b';
    accent = '#10b981';
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
  inferRunOption('gemini-3.5-flash-lite-v3'),
  inferRunOption('gemini-3.1-flash-lite-v3'),
  inferRunOption('qwen27b-v3'),
  inferRunOption('nemotron-v3'),
  inferRunOption('glm5-v3'),
  inferRunOption('gemma4-31b-v3'),
  inferRunOption('gptoss-120b-expanded'),
  inferRunOption('nemotron-2'),
  inferRunOption('gemma4-31b-full'),
  inferRunOption('glm5-2'),
  inferRunOption('gemini-3.1-flash-lite'),
  inferRunOption('gemini-flash-lite-full'),
  inferRunOption('qwen27b-2'),
];

export const RUN_OPTIONS: readonly RunOption[] = DEFAULT_RUN_OPTIONS;

export const DEFAULT_RUN_ID = 'gemini-3.5-flash-lite-v3';
export const TRIALS_PER_RUN = 720;

export function runById(id: string | null | undefined, options: readonly RunOption[] = RUN_OPTIONS): RunOption | undefined {
  if (!id) return undefined;
  return options.find((r) => r.id === id) ?? inferRunOption(id);
}

export function modelForRun(id: string | null | undefined): string {
  if (!id) return 'unknown';
  return inferRunOption(id).model;
}
