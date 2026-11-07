import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const CHECKPOINT_PATH = path.resolve(process.cwd(), '../.axiom-state/ablation-v2-checkpoint.json');

export async function GET() {
  try {
    if (!fs.existsSync(CHECKPOINT_PATH)) {
      return NextResponse.json(
        { error: 'Checkpoint data is not available yet. Run the ablation experiment to generate `.axiom-state/ablation-v2-checkpoint.json`.' },
        { status: 404 },
      );
    }
    const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Unable to read checkpoint data: ${message}` },
      { status: 500 },
    );
  }
}
