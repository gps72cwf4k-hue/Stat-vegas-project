import { describe, it, expect } from 'vitest';
import { createSeededRng } from './rng.js';

// Bounded sample count for every "generate a bunch of values" loop.
const SAMPLE_SIZE = 200;

/**
 * Collect `count` values from a generator.
 *
 * @param {() => number} rng Random generator.
 * @param {number} count How many values to draw.
 * @returns {number[]} The drawn values.
 */
function take(rng, count) {
  const values = [];
  for (let i = 0; i < count; i += 1) {
    values.push(rng());
  }
  return values;
}

describe('createSeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const first = take(createSeededRng(12345), SAMPLE_SIZE);
    const second = take(createSeededRng(12345), SAMPLE_SIZE);

    expect(first).toEqual(second);
  });

  it('keeps independent generators from sharing state', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(1);

    // Interleaving draws must not disturb each generator's own sequence.
    const aFirst = a();
    const bFirst = b();
    const aSecond = a();
    const bSecond = b();

    expect(aFirst).toBe(bFirst);
    expect(aSecond).toBe(bSecond);
    expect(aFirst).not.toBe(aSecond);

    // A different seed diverges from the shared sequence.
    const c = createSeededRng(2);
    expect(take(c, SAMPLE_SIZE)).not.toEqual(take(createSeededRng(1), SAMPLE_SIZE));
  });

  it('accepts seed 0 and reproduces it', () => {
    const zero = take(createSeededRng(0), SAMPLE_SIZE);

    expect(zero).toEqual(take(createSeededRng(0), SAMPLE_SIZE));
    expect(Number.isFinite(zero[0])).toBe(true);
  });

  it('generates finite numbers within [0, 1)', () => {
    const rng = createSeededRng(987654321);

    for (const value of take(rng, SAMPLE_SIZE)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('rejects invalid seeds', () => {
    expect(() => createSeededRng(-1)).toThrow(RangeError);
    expect(() => createSeededRng(1.5)).toThrow(RangeError);
    expect(() => createSeededRng(NaN)).toThrow(RangeError);
    expect(() => createSeededRng(Infinity)).toThrow(RangeError);
    expect(() => createSeededRng(-Infinity)).toThrow(RangeError);
    expect(() => createSeededRng(Number.MAX_SAFE_INTEGER + 10)).toThrow(RangeError);
    expect(() => createSeededRng('123')).toThrow(TypeError);
    expect(() => createSeededRng(undefined)).toThrow(TypeError);
    expect(() => createSeededRng(null)).toThrow(TypeError);
  });

  it('normalizes accepted seeds to unsigned 32-bit state', () => {
    // 2 ** 32 normalizes to 0, so the two must share a sequence.
    expect(take(createSeededRng(2 ** 32), SAMPLE_SIZE)).toEqual(
      take(createSeededRng(0), SAMPLE_SIZE),
    );
    // 2 ** 32 + 7 normalizes to 7.
    expect(take(createSeededRng(2 ** 32 + 7), SAMPLE_SIZE)).toEqual(
      take(createSeededRng(7), SAMPLE_SIZE),
    );
  });
});
