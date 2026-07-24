import { describe, expect, it } from 'vitest';

import {
  MAX_QUANTITY,
  MAX_SIDES,
  formatRollResult,
  handleRoll,
  parseDiceNotation,
  rollDice,
} from './roll.js';

describe('parseDiceNotation', () => {
  it('parses valid dice notation', () => {
    expect(parseDiceNotation('1d20')).toEqual({ ok: true, dice: { quantity: 1, sides: 20 } });
    expect(parseDiceNotation('2d6')).toEqual({ ok: true, dice: { quantity: 2, sides: 6 } });
  });

  it('accepts an uppercase D and surrounding whitespace', () => {
    expect(parseDiceNotation('  3D8  ')).toEqual({ ok: true, dice: { quantity: 3, sides: 8 } });
  });

  it('accepts the maximum bounds', () => {
    expect(parseDiceNotation(`${MAX_QUANTITY}d${MAX_SIDES}`)).toEqual({
      ok: true,
      dice: { quantity: MAX_QUANTITY, sides: MAX_SIDES },
    });
  });

  it('rejects malformed input', () => {
    for (const input of ['', 'd20', '1d', 'abc', '1d20d3', '1 d 20 extra']) {
      expect(parseDiceNotation(input).ok).toBe(false);
    }
  });

  it('rejects a quantity outside the allowed range', () => {
    expect(parseDiceNotation('0d6').ok).toBe(false);
    expect(parseDiceNotation(`${MAX_QUANTITY + 1}d6`).ok).toBe(false);
  });

  it('rejects sides outside the allowed range', () => {
    expect(parseDiceNotation('1d0').ok).toBe(false);
    expect(parseDiceNotation(`1d${MAX_SIDES + 1}`).ok).toBe(false);
  });
});

describe('rollDice', () => {
  it('produces one roll per die within [1, sides]', () => {
    const result = rollDice({ quantity: 5, sides: 6 }, () => 0.5);
    expect(result.rolls).toHaveLength(5);
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });

  it('maps the lowest and highest rng values to the die bounds', () => {
    expect(rollDice({ quantity: 1, sides: 20 }, () => 0)).toEqual({ rolls: [1], total: 1 });
    expect(rollDice({ quantity: 1, sides: 20 }, () => 0.999999)).toEqual({
      rolls: [20],
      total: 20,
    });
  });

  it('totals the individual rolls', () => {
    const result = rollDice({ quantity: 3, sides: 6 }, () => 0.5);
    expect(result.total).toBe(result.rolls.reduce((sum, roll) => sum + roll, 0));
  });
});

describe('formatRollResult', () => {
  it('omits the breakdown for a single die', () => {
    expect(formatRollResult({ quantity: 1, sides: 20 }, { rolls: [14], total: 14 })).toBe(
      '🎲 **1d20** → **14**',
    );
  });

  it('includes the breakdown for multiple dice', () => {
    expect(formatRollResult({ quantity: 2, sides: 6 }, { rolls: [3, 5], total: 8 })).toBe(
      '🎲 **2d6** → [3, 5] = **8**',
    );
  });
});

describe('handleRoll', () => {
  it('returns a formatted roll for valid input', () => {
    expect(handleRoll('1d1')).toBe('🎲 **1d1** → **1**');
  });

  it('returns the parse error for invalid input', () => {
    expect(handleRoll('nope')).toContain('Invalid dice notation');
  });
});
