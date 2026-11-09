import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { modelForRun } from '@/lib/runs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedRun = searchParams.get('run');

    // A requested run must resolve to its own data only; falling back to another
    // run would mislabel one model's trials as another's.
    const candidateRuns = requestedRun
      ? [requestedRun]
      : ['qwen27b-1', 'nemotron-1', 'ablation-v2'];

    const runsToTry = Array.from(new Set(candidateRuns));

    let foundPath: string | null = null;
    let resolvedRunId = requestedRun || 'qwen27b-1';

    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: 'Checkpoint API is for local development; static snapshots are used on Vercel.' },
        { status: 404 },
      );
    }

    for (const runId of runsToTry) {
      const candidates = [
        // Working directory inside dashboard/
        path.resolve(process.cwd(), `../.axiom-state/runs/${runId}/checkpoint.json`),
        path.resolve(process.cwd(), `../.axiom-state/${runId}-checkpoint.json`),
        path.resolve(process.cwd(), `../.axiom-state/${runId}.json`),
        // Working directory in project root
        path.resolve(process.cwd(), `.axiom-state/runs/${runId}/checkpoint.json`),
        path.resolve(process.cwd(), `.axiom-state/${runId}-checkpoint.json`),
        path.resolve(process.cwd(), `.axiom-state/${runId}.json`),
      ];

      if (runId === 'nemotron-1' || runId === 'ablation-v2') {
        candidates.push(
          path.resolve(process.cwd(), '../.axiom-state/ablation-v2-checkpoint.json'),
          path.resolve(process.cwd(), '.axiom-state/ablation-v2-checkpoint.json'),
        );
      }

      if (runId === 'glm53-1') {
        candidates.push(
          path.resolve(process.cwd(), '../.axiom-state/runs/glm5-1/checkpoint.json'),
          path.resolve(process.cwd(), '.axiom-state/runs/glm5-1/checkpoint.json'),
          path.resolve(process.cwd(), '../.axiom-state/runs/glm-5.3/checkpoint.json'),
          path.resolve(process.cwd(), '.axiom-state/runs/glm-5.3/checkpoint.json'),
        );
      }

      for (const p of candidates) {
        if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
          foundPath = p;
          resolvedRunId = runId;
          break;
        }
      }
      if (foundPath) break;
    }

    if (!foundPath) {
      return NextResponse.json(
        { error: `Checkpoint data not available for run "${requestedRun || 'qwen27b-1'}"` },
        { status: 404 },
      );
    }

    const raw = fs.readFileSync(/*turbopackIgnore: true*/ foundPath, 'utf8');
    const data = JSON.parse(raw);
    const stats = fs.statSync(/*turbopackIgnore: true*/ foundPath);

    const trials = Array.isArray(data.trials)
      ? data.trials
      : Array.isArray(data)
      ? data
      : [];

    const commit = data.metadata?.gitCommit
      ? String(data.metadata.gitCommit).slice(0, 7)
      : data.gitCommit
      ? String(data.gitCommit).slice(0, 7)
      : 'live';

    const model =
      data.metadata?.requestedModel ||
      data.requestedModel ||
      modelForRun(resolvedRunId === 'ablation-v2' ? 'nemotron-1' : resolvedRunId);

    return NextResponse.json({
      id: resolvedRunId,
      runId: resolvedRunId,
      commit,
      model,
      lastModified: stats.mtime.toISOString(),
      metadata: data.metadata ?? {},
      trials,
      isLive: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Unable to read checkpoint data: ${message}` },
      { status: 500 },
    );
  }
}
