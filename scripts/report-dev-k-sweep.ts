import { retrieveLessonsByFeatures, type FeatureFlags, type Lesson } from '../src/memory.js';

export const SYNTHETIC_K_VALUES = [6, 8, 10, 12, 15, 20] as const;

export function syntheticKSweep(): Array<{ k: number; retrieved: number; ids: string[] }> {
  const features: FeatureFlags = { tenant: true, append_only: false, ingestion: false };
  const memory: Lesson[] = Array.from({ length: 20 }, (_, index) => ({
    errorCode: `F-${String(index + 1).padStart(2, '0')}`,
    factId: `F-${String(index + 1).padStart(2, '0')}`,
    lesson: `synthetic-${index + 1}`,
    trainFailureRate: (20 - index) / 20,
    utilityScore: 1,
    features,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  return SYNTHETIC_K_VALUES.map((k) => {
    const selected = retrieveLessonsByFeatures(features, memory, k, undefined, true);
    return { k, retrieved: selected.length, ids: selected.map((lesson) => lesson.factId ?? lesson.errorCode) };
  });
}

if (process.argv[1]?.endsWith('report-dev-k-sweep.ts')) {
  console.table(syntheticKSweep().map(({ k, retrieved }) => ({ k, retrieved })));
}
