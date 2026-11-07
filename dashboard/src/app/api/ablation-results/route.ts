import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const RESULTS_PATH = path.resolve(process.cwd(), '../.axiom-state/ablation-v2-results.json');

export async function GET() {
  try {
    if (!fs.existsSync(RESULTS_PATH)) {
      return NextResponse.json(null, { status: 404 });
    }
    const raw = fs.readFileSync(RESULTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Unable to read results data: ${message}` },
      { status: 500 },
    );
  }
}
