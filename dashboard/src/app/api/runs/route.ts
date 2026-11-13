import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getFoldersFromCandidates(candidates: string[]): string[] {
  const dir = candidates.find((d) => {
    try {
      return fs.existsSync(d) && fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  if (!dir) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive')
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const candidateDirsV3 = [
      path.resolve(process.cwd(), '../../.axiom-state/runs-v3'),
      path.resolve(process.cwd(), '../.axiom-state/runs-v3'),
      path.resolve(process.cwd(), '.axiom-state/runs-v3'),
    ];

    const candidateDirsV2 = [
      path.resolve(process.cwd(), '../../.axiom-state/runs'),
      path.resolve(process.cwd(), '../.axiom-state/runs'),
      path.resolve(process.cwd(), '.axiom-state/runs'),
    ];

    const v3Folders = getFoldersFromCandidates(candidateDirsV3);
    const v2Folders = getFoldersFromCandidates(candidateDirsV2);
    const allRuns = Array.from(new Set([...v3Folders, ...v2Folders]));

    if (allRuns.length === 0) {
      return NextResponse.json([
        'gemini-3.5-flash-lite-v3',
        'gemini-3.1-flash-lite-v3',
        'qwen27b-v3',
        'nemotron-v3',
        'glm5-v3',
        'gemma4-31b-v3',
        'gptoss-120b-expanded',
        'nemotron-2',
        'gemma4-31b-full',
        'glm5-2',
        'gemini-3.1-flash-lite',
        'gemini-flash-lite-full',
        'qwen27b-2',
      ]);
    }

    // Prioritize Confirmatory V3 Fleet (Live), then V2 Fleet + Expanded Runs
    const preferredOrder = [
      'gemini-3.5-flash-lite-v3',
      'gemini-3.1-flash-lite-v3',
      'qwen27b-v3',
      'nemotron-v3',
      'glm5-v3',
      'gemma4-31b-v3',
      'gptoss-120b-expanded',
      'nemotron-2',
      'gemma4-31b-full',
      'glm5-2',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-full',
      'qwen27b-2',
    ];

    allRuns.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return NextResponse.json(allRuns);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read runs directory', details: String(error) },
      { status: 500 },
    );
  }
}
