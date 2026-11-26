import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  buildRedTeamFlowTraceEvent,
  type RawRedTeamCandidateInput,
  type RawRedTeamThreatInput,
} from '@/lib/v4-hope-flow';

export const dynamic = 'force-dynamic';

function findExistingFile(candidates: readonly string[]): string | null {
  for (const p of candidates) {
    try {
      if (
        fs.existsSync(/*turbopackIgnore: true*/ p) &&
        fs.statSync(/*turbopackIgnore: true*/ p).isFile()
      ) {
        return p;
      }
    } catch {
      // continue searching
    }
  }
  return null;
}

function resolveRepoFile(relPath: string): string | null {
  return findExistingFile([
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), '..', relPath),
    path.resolve(process.cwd(), '..', '..', relPath),
    path.resolve(process.cwd(), '..', '..', '..', relPath),
  ]);
}

function readJsonSafe<T>(filePath: string | null): T | null {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const candidatesPath = resolveRepoFile('.axiom-state/redteam-v1/quarantine-candidates.json');
    const threatsPath = resolveRepoFile('.axiom-state/redteam-v1/threat-matrix.json');

    const candidatesDoc = readJsonSafe<{
      readonly dryRun?: boolean;
      readonly targetBaseUrl?: string;
      readonly candidates?: readonly RawRedTeamCandidateInput[];
    }>(candidatesPath);
    const threatsDoc = readJsonSafe<{
      readonly model?: string;
      readonly targetBaseUrl?: string;
      readonly threats?: readonly RawRedTeamThreatInput[];
    }>(threatsPath);

    const threats = Array.isArray(threatsDoc?.threats) ? threatsDoc.threats : [];
    const candidates = Array.isArray(candidatesDoc?.candidates) ? candidatesDoc.candidates : [];

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          available: false,
          targetBaseUrl: candidatesDoc?.targetBaseUrl ?? threatsDoc?.targetBaseUrl ?? null,
          model: threatsDoc?.model ?? null,
          threats,
          candidates: [],
          traceEvents: [],
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const threatById = new Map<string, RawRedTeamThreatInput>();
    for (const t of threats) {
      if (t && typeof t.id === 'string') {
        threatById.set(t.id, t);
      }
    }

    const targetBaseUrl =
      typeof candidatesDoc?.targetBaseUrl === 'string' && candidatesDoc.targetBaseUrl.trim()
        ? candidatesDoc.targetBaseUrl.trim()
        : typeof threatsDoc?.targetBaseUrl === 'string' && threatsDoc.targetBaseUrl.trim()
          ? threatsDoc.targetBaseUrl.trim()
          : undefined;

    const traceEvents = candidates
      .filter(
        (c) =>
          c &&
          typeof c.candidateId === 'string' &&
          typeof c.factId === 'string' &&
          typeof c.stagedAt === 'string'
      )
      .map((candidate) =>
        buildRedTeamFlowTraceEvent({
          candidate,
          threat: threatById.get(candidate.factId) ?? null,
          modelId: threatsDoc?.model,
          dryRun: candidatesDoc?.dryRun,
          targetBaseUrl,
        })
      );

    return NextResponse.json(
      {
        available: true,
        targetBaseUrl: targetBaseUrl ?? null,
        model: threatsDoc?.model ?? null,
        threats,
        candidates,
        traceEvents,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to read Red-Team quarantine telemetry' },
      { status: 500 }
    );
  }
}
