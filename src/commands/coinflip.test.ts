import { describe, expect, it } from 'vitest';

import { flipCoin, formatCoinResult, handleCoinFlip } from './coinflip.js';

describe('flipCoin', () => {
  it('returns Heads for rng values below 0.5', () => {
    expect(flipCoin(() => 0)).toBe('Heads');
    expect(flipCoin(() => 0.499999)).toBe('Heads');
  });

  it('returns Tails for rng values at or above 0.5', () => {
    expect(flipCoin(() => 0.5)).toBe('Tails');
    expect(flipCoin(() => 0.999999)).toBe('Tails');
  });

  it('only ever returns Heads or Tails', () => {
    for (let i = 0; i < 100; i++) {
      expect(['Heads', 'Tails']).toContain(flipCoin());
    }
  });
});

describe('formatCoinResult', () => {
  it('formats each side', () => {
    expect(formatCoinResult('Heads')).toBe('🪙 **Heads**');
    expect(formatCoinResult('Tails')).toBe('🪙 **Tails**');
  });
});

describe('handleCoinFlip', () => {
  it('returns a formatted result', () => {
    expect(handleCoinFlip(() => 0)).toBe('🪙 **Heads**');
    expect(handleCoinFlip(() => 0.5)).toBe('🪙 **Tails**');
  });
});
