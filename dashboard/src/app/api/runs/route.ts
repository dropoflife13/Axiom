import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const candidateDirs = [
      path.resolve(process.cwd(), '../../.axiom-state/runs'),
      path.resolve(process.cwd(), '../.axiom-state/runs'),
      path.resolve(process.cwd(), '.axiom-state/runs'),
    ];

    const runsDir = candidateDirs.find((dir) => {
      try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });

    if (!runsDir) {
      return NextResponse.json([
        'nemotron-2',
        'gemma4-31b-full',
        'glm5-2',
        'gemini-3.1-flash-lite',
        'gemini-flash-lite-full',
        'qwen27b-2',
        'gptoss-120b-expanded',
      ]);
    }

    const entries = fs.readdirSync(runsDir, { withFileTypes: true });
    const runFolders = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive')
      .map((entry) => entry.name);

    // Prioritize Confirmatory Fleet + Live In-Progress Runs
    const preferredOrder = [
      'nemotron-2',
      'gemma4-31b-full',
      'glm5-2',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-full',
      'qwen27b-2',
      'gptoss-120b-expanded',
    ];
    runFolders.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return NextResponse.json(runFolders);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read runs directory', details: String(error) },
      { status: 500 },
    );
  }
}
