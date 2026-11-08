import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface MigrationResult {
  sourceCheckpointSha256: string;
  destCheckpointSha256: string;
  archiveCheckpointSha256: string;
  sourceResultsSha256: string;
  destResultsSha256: string;
  archiveResultsSha256: string;
}

export function migrateRun1(root = path.resolve('.')): MigrationResult {
  const sourceCheckpoint = path.join(root, '.axiom-state', 'ablation-v2-checkpoint.json');
  const sourceResults = path.join(root, '.axiom-state', 'ablation-v2-results.json');
  const destDir = path.join(root, '.axiom-state', 'runs', 'nemotron-1');
  const destCheckpoint = path.join(destDir, 'checkpoint.json');
  const destResults = path.join(destDir, 'results.json');

  const archiveCheckpoint = path.join(root, 'out', 'archive', 'run-nemotron-1', 'ablation-v2-checkpoint.json');
  const archiveResults = path.join(root, 'out', 'archive', 'run-nemotron-1', 'ablation-v2-results.json');

  if (!fs.existsSync(sourceCheckpoint)) {
    throw new Error(`Source checkpoint does not exist: ${sourceCheckpoint}`);
  }
  if (!fs.existsSync(sourceResults)) {
    throw new Error(`Source results do not exist: ${sourceResults}`);
  }
  if (!fs.existsSync(archiveCheckpoint)) {
    throw new Error(`Archive checkpoint does not exist: ${archiveCheckpoint}`);
  }
  if (!fs.existsSync(archiveResults)) {
    throw new Error(`Archive results do not exist: ${archiveResults}`);
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(sourceCheckpoint, destCheckpoint);
  fs.copyFileSync(sourceResults, destResults);

  const sourceCheckpointSha256 = sha256File(sourceCheckpoint);
  const destCheckpointSha256 = sha256File(destCheckpoint);
  const archiveCheckpointSha256 = sha256File(archiveCheckpoint);

  const sourceResultsSha256 = sha256File(sourceResults);
  const destResultsSha256 = sha256File(destResults);
  const archiveResultsSha256 = sha256File(archiveResults);

  if (destCheckpointSha256 !== sourceCheckpointSha256) {
    throw new Error(`Checkpoint copy verification failed: dest (${destCheckpointSha256}) !== source (${sourceCheckpointSha256})`);
  }
  if (destCheckpointSha256 !== archiveCheckpointSha256) {
    throw new Error(`Checkpoint archive verification failed: dest (${destCheckpointSha256}) !== archive (${archiveCheckpointSha256})`);
  }

  if (destResultsSha256 !== sourceResultsSha256) {
    throw new Error(`Results copy verification failed: dest (${destResultsSha256}) !== source (${sourceResultsSha256})`);
  }
  if (destResultsSha256 !== archiveResultsSha256) {
    throw new Error(`Results archive verification failed: dest (${destResultsSha256}) !== archive (${archiveResultsSha256})`);
  }

  return {
    sourceCheckpointSha256,
    destCheckpointSha256,
    archiveCheckpointSha256,
    sourceResultsSha256,
    destResultsSha256,
    archiveResultsSha256,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('migrate-run1.ts')) {
  const result = migrateRun1();
  console.log('Migration verified successfully:');
  console.log(`  Checkpoint SHA-256: ${result.destCheckpointSha256}`);
  console.log(`  Results SHA-256:    ${result.destResultsSha256}`);
}
