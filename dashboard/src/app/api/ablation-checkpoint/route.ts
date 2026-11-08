import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedRun = searchParams.get('run');

    // Candidate runs to check in priority order
    const candidateRuns = requestedRun
      ? [requestedRun, 'qwen27b-1', 'nemotron-1', 'ablation-v2']
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
      (resolvedRunId === 'qwen27b-1' ? 'qwen/qwen3.8-27b' : 'nvidia/nemotron-3-ultra-550b-a55b');

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
