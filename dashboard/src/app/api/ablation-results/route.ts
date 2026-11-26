import { servePublicSnapshotJson } from '@/lib/serve-static-snapshot';

export const dynamic = 'force-dynamic';

export async function GET() {
  return servePublicSnapshotJson('run-ablation-v2.json');
}
