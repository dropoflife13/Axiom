import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { modelForRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedRun = searchParams.get('run');

    const runId = requestedRun || 'nemotron-2';

    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: 'Checkpoint API is for local development; static snapshots are used on Vercel.' },
        { status: 404 },
      );
    }

    const candidatePaths = [
      path.resolve(process.cwd(), `../../.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../../.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `../.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `../../.axiom-state/${runId}.json`),
      path.resolve(process.cwd(), `../.axiom-state/${runId}.json`),
      path.resolve(process.cwd(), `.axiom-state/${runId}.json`),
    ];

    let foundPath: string | null = null;
    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
          foundPath = p;
          break;
        }
      } catch {
        // Continue searching
      }
    }

    if (!foundPath) {
      // Run is initializing or has no trials yet: return empty trials with status 200
      // This resets state cleanly without triggering 404 issue indicators in Next.js
      return NextResponse.json({
        id: runId,
        runId,
        commit: 'live',
        model: modelForRun(runId),
        lastModified: new Date().toISOString(),
        trials: [],
        status: 'initializing',
      });
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
      modelForRun(runId);

    return NextResponse.json({
      id: runId,
      runId,
      commit,
      model,
      lastModified: stats.mtime.toISOString(),
      trials,
      metadata: data.metadata ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error while resolving checkpoint', details: String(err), trials: [] },
      { status: 500 },
    );
  }
}
