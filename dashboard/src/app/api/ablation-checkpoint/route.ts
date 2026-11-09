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
      const isMini = runId.toLowerCase().includes('mini');
      return NextResponse.json({
        id: runId,
        runId,
        commit: 'live',
        model: modelForRun(runId),
        lastModified: new Date().toISOString(),
        trials: [],
        totalTrials: isMini ? 48 : 720,
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

    // Calculate dynamic totalTrials
    const isMini = runId.toLowerCase().includes('mini');
    const taskIds = new Set(trials.map((t: any) => t.taskId));
    let totalTrials = 720;
    if (typeof data.totalTrials === 'number' && data.totalTrials > 0) {
      totalTrials = data.totalTrials;
    } else if (typeof data.metadata?.totalTrials === 'number' && data.metadata.totalTrials > 0) {
      totalTrials = data.metadata.totalTrials;
    } else if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      totalTrials = data.tasks.length * 6;
    } else if (Array.isArray(data.metadata?.tasks) && data.metadata.tasks.length > 0) {
      totalTrials = data.metadata.tasks.length * 6;
    } else if (isMini) {
      totalTrials = taskIds.size > 0 ? taskIds.size * 6 : 48;
    } else if (taskIds.size > 0 && taskIds.size <= 8 && trials.length >= 24) {
      totalTrials = taskIds.size * 6;
    }

    return NextResponse.json({
      id: runId,
      runId,
      commit,
      model,
      lastModified: stats.mtime.toISOString(),
      trials,
      totalTrials,
      metadata: data.metadata ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error while resolving checkpoint', details: String(err), trials: [] },
      { status: 500 },
    );
  }
}
