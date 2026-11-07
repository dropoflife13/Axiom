import { describe, expect, it } from 'vitest';
import { clamp, sceneForProgress, smoothstep } from '../dashboard/src/lib/scroll-scene';

describe('scroll scene', () => {
  it('starts at the initial scene', () => {
    expect(sceneForProgress(0)).toEqual({ scale: 1, glow: 1, hud: 1, canvas: 1 });
  });

  it('ends at the expanded scene', () => {
    expect(sceneForProgress(1)).toEqual({ scale: 2.6, glow: 1.6, hud: 0, canvas: 0 });
  });

  it('is monotonic for expansion and glow', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map(sceneForProgress);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i].scale).toBeGreaterThanOrEqual(values[i - 1].scale);
      expect(values[i].glow).toBeGreaterThanOrEqual(values[i - 1].glow);
    }
  });

  it('clamps progress outside the scene', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(sceneForProgress(-1)).toEqual(sceneForProgress(0));
    expect(sceneForProgress(2)).toEqual(sceneForProgress(1));
  });

  it('exports smoothstep', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});
