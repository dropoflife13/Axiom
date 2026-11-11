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
      return NextResponse.json(['nemotron-2', 'qwen27b-2', 'glm5-2']);
    }

    const entries = fs.readdirSync(runsDir, { withFileTypes: true });
    const runFolders = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive')
      .map((entry) => entry.name);

    // Natural sort prioritizing nemotron, qwen, glm, gemini, liquid
    const preferredOrder = ['nemotron', 'qwen', 'glm', 'gemini', 'liquid'];
    runFolders.sort((a, b) => {
      const idxA = preferredOrder.findIndex((p) => a.toLowerCase().includes(p));
      const idxB = preferredOrder.findIndex((p) => b.toLowerCase().includes(p));
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
