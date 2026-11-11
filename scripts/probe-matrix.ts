import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const IMAGE_KEYWORDS = [
  'image',
  'generate',
  'edit',
  'dall-e',
  'sdxl',
  'midjourney',
  'stable-diffusion',
  'flux',
  'imagen',
];
const AUDIO_KEYWORDS = ['audio', 'tts', 'speech', 'whisper', 'transcrib'];
const EMBEDDING_KEYWORDS = ['embed', 'embedding', 'rerank'];

const PROVIDERS = [
  {
    name: 'NVIDIA NIM',
    baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
    keyLabel: 'NVIDIA_API_KEY',
  },
  {
    name: 'Groq',
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    keyLabel: 'GROQ_API_KEY',
  },
  {
    name: 'OpenRouter',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    keyLabel: 'OPENROUTER_API_KEY',
  },
  {
    name: 'Google Gemini',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY,
    keyLabel: 'GEMINI_API_KEY',
  },
];

const REQUEST_TIMEOUT_MS = 15000;
const TOP_N_PER_PROVIDER = 3;

function isTextOrCodingModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (IMAGE_KEYWORDS.some((k) => lower.includes(k))) return false;
  if (AUDIO_KEYWORDS.some((k) => lower.includes(k))) return false;
  if (EMBEDDING_KEYWORDS.some((k) => lower.includes(k))) return false;
  return true;
}

function normalizeGeminiId(id: string): string {
  return id.replace(/^models\//, '');
}

async function fetchJson(
  url: string,
  headers: Record<string, string>
): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await responseText(res);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function responseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function listModels(provider: (typeof PROVIDERS)[number]): Promise<string[]> {
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.apiKey}`,
  };
  const data = await fetchJson(url, headers);

  let raw: any[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else if (Array.isArray(data.data)) {
    raw = data.data;
  } else if (Array.isArray(data.models)) {
    raw = data.models.map((m: any) => ({
      id: normalizeGeminiId(m.id || m.name || ''),
      ...m,
    }));
  } else {
    throw new Error(`Unrecognized models response shape from ${provider.name}`);
  }

  const ids: string[] = [];
  for (const item of raw) {
    const id =
      item.id || item.name || (typeof item === 'string' ? item : '');
    if (id && isTextOrCodingModel(id)) {
      ids.push(String(id));
    }
  }
  return ids.slice(0, TOP_N_PER_PROVIDER);
}

async function probeModel(
  provider: (typeof PROVIDERS)[number],
  modelId: string
): Promise<{
  model: string;
  provider: string;
  status: 'ok' | 'rate_limit' | 'timeout' | 'error';
  latencyMs: number;
  statusCode?: number;
  error?: string;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (res.status === 429) {
      return { model: modelId, provider: provider.name, status: 'rate_limit', latencyMs: latency };
    }
    if (!res.ok) {
      const text = await responseText(res);
      return {
        model: modelId,
        provider: provider.name,
        status: 'error',
        latencyMs: latency,
        statusCode: res.status,
        error: text.slice(0, 200),
      };
    }
    await res.json();
    return { model: modelId, provider: provider.name, status: 'ok', latencyMs: latency };
  } catch (err: any) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') {
      return { model: modelId, provider: provider.name, status: 'timeout', latencyMs: latency };
    }
    return {
      model: modelId,
      provider: provider.name,
      status: 'error',
      latencyMs: latency,
      error: String(err?.message ?? err),
    };
  }
}

async function main(): Promise<void> {
  console.log('Probing provider model lists...\n');

  const results: any[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.apiKey || provider.apiKey === 'your_key_here' || provider.apiKey === '') {
      console.log(`[${provider.name}] Skipped — ${provider.keyLabel} not set`);
      continue;
    }

    let modelIds: string[] = [];
    try {
      modelIds = await listModels(provider);
      console.log(
        `[${provider.name}] Found ${modelIds.length} text/coding model(s) (top ${TOP_N_PER_PROVIDER}): ${modelIds.join(', ') || 'none'}`
      );
    } catch (err: any) {
      console.log(
        `[${provider.name}] Failed to list models: ${err.message ?? err}`
      );
      continue;
    }

    for (const modelId of modelIds) {
      const result = await probeModel(provider, modelId);
      results.push(result);
      const statusLabel =
        result.status === 'ok'
          ? 'OK'
          : result.status === 'rate_limit'
          ? 'RATE_LIMIT'
          : result.status === 'timeout'
          ? 'TIMEOUT'
          : 'ERROR';
      console.log(
        `  ${modelId.padEnd(45)} ${statusLabel.padEnd(12)} ${result.latencyMs}ms`
      );
    }
  }

  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'model-matrix-probe.json');
  const report = {
    generatedAt: new Date().toISOString(),
    providers: PROVIDERS.map((p) => ({ name: p.name, baseUrl: p.baseUrl })),
    results,
    summary: {
      totalProbed: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      rateLimited: results.filter((r) => r.status === 'rate_limit').length,
      timedOut: results.filter((r) => r.status === 'timeout').length,
      errored: results.filter((r) => r.status === 'error').length,
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`\n=== Model Matrix Summary ===`);
  console.log(`Total probed:  ${report.summary.totalProbed}`);
  console.log(`OK:            ${report.summary.ok}`);
  console.log(`Rate limited:  ${report.summary.rateLimited}`);
  console.log(`Timed out:     ${report.summary.timedOut}`);
  console.log(`Errored:       ${report.summary.errored}`);
  console.log(`\nWrote results to ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
