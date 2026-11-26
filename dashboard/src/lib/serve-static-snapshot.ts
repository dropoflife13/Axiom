import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

function findExistingFile(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    try {
      if (
        fs.existsSync(/*turbopackIgnore: true*/ candidate) &&
        fs.statSync(/*turbopackIgnore: true*/ candidate).isFile()
      ) {
        return candidate;
      }
    } catch {
      // continue checking remaining candidate paths
    }
  }
  return null;
}

/**
 * Serves a committed JSON snapshot from `public/data/` directly with HTTP 200
 * (zero host-interpolated 307 redirects and sanitized error responses).
 */
export function servePublicSnapshotJson(filename: string): NextResponse {
  const resolved = findExistingFile([
    path.resolve(process.cwd(), 'public', 'data', filename),
    path.resolve(process.cwd(), 'dashboard', 'public', 'data', filename),
    path.resolve(process.cwd(), '..', 'dashboard', 'public', 'data', filename),
  ]);

  if (!resolved) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ resolved, 'utf8');
    JSON.parse(raw);
    return new NextResponse(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load snapshot' }, { status: 500 });
  }
}
