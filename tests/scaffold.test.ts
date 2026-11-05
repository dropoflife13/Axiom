import { describe, it, expect } from 'vitest';
import { AXIOM_VERSION } from '../src/index.js';

describe('Axiom Scaffold', () => {
  it('initializes scaffold and verifies version', () => {
    expect(AXIOM_VERSION).toBe('0.1.0');
  });
});

