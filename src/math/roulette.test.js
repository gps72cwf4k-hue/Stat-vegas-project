import { describe, it, expect } from 'vitest';
import {
  EUROPEAN_ROULETTE,
  getRouletteColour,
  getRouletteProbabilities,
} from './roulette.js';

/**
 * Independent reference list of the standard European red pockets. Deliberately
 * duplicated (not imported) so the expected colours never depend on the
 * production lookup under test.
 * @type {readonly number[]}
 */
const REFERENCE_RED = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

const ALL_POCKETS = Array.from({ length: 37 }, (_, pocket) => pocket);

describe('EUROPEAN_ROULETTE', () => {
  it('describes the 37-pocket European wheel with the documented counts', () => {
    expect(EUROPEAN_ROULETTE).toEqual({
      pocketCount: 37,
      minPocket: 0,
      maxPocket: 36,
      redCount: 18,
      blackCount: 18,
      greenCount: 1,
    });
  });

  it('is immutable', () => {
    expect(Object.isFrozen(EUROPEAN_ROULETTE)).toBe(true);
  });
});

describe('getRouletteProbabilities', () => {
  it('returns the exact single-spin probabilities', () => {
    const probabilities = getRouletteProbabilities();

    expect(probabilities.red).toBe(18 / 37);
    expect(probabilities.black).toBe(18 / 37);
    expect(probabilities.green).toBe(1 / 37);
    expect(probabilities.straightUp).toBe(1 / 37);
  });

  it('returns finite probabilities within [0, 1]', () => {
    const probabilities = getRouletteProbabilities();

    for (const value of Object.values(probabilities)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('has colour probabilities that partition the wheel (sum approximately 1)', () => {
    const { red, black, green } = getRouletteProbabilities();

    // Only the disjoint colour events are summed; straightUp overlaps them.
    expect(red + black + green).toBeCloseTo(1, 12);
  });

  it('is deterministic across calls', () => {
    expect(getRouletteProbabilities()).toEqual(getRouletteProbabilities());
  });
});

describe('getRouletteColour', () => {
  it('covers every integer from 0 through 36', () => {
    for (const pocket of ALL_POCKETS) {
      expect(() => getRouletteColour(pocket)).not.toThrow();
    }
  });

  it('returns only the three documented colour strings', () => {
    const allowed = ['red', 'black', 'green'];
    for (const pocket of ALL_POCKETS) {
      expect(allowed).toContain(getRouletteColour(pocket));
    }
  });

  it('yields exactly 18 red, 18 black and 1 green', () => {
    const counts = { red: 0, black: 0, green: 0 };
    for (const pocket of ALL_POCKETS) {
      counts[getRouletteColour(pocket)] += 1;
    }

    expect(counts).toEqual({ red: 18, black: 18, green: 1 });
  });

  it('treats only zero as green', () => {
    for (const pocket of ALL_POCKETS) {
      expect(getRouletteColour(pocket) === 'green').toBe(pocket === 0);
    }
  });

  it('matches the full standard red-number list', () => {
    for (const pocket of REFERENCE_RED) {
      expect(getRouletteColour(pocket)).toBe('red');
    }
  });

  it('treats all other nonzero pockets as black', () => {
    const redSet = new Set(REFERENCE_RED);
    for (const pocket of ALL_POCKETS) {
      if (pocket !== 0 && !redSet.has(pocket)) {
        expect(getRouletteColour(pocket)).toBe('black');
      }
    }
  });

  it('is deterministic on repeated calls', () => {
    for (const pocket of ALL_POCKETS) {
      expect(getRouletteColour(pocket)).toBe(getRouletteColour(pocket));
    }
  });

  it.each([
    [10, 'black'],
    [11, 'black'],
    [18, 'red'],
    [19, 'red'],
    [32, 'red'],
    [36, 'red'],
    [0, 'green'],
  ])('regression: pocket %i is %s', (pocket, expected) => {
    expect(getRouletteColour(pocket)).toBe(expected);
  });

  it('rejects a non-number with a TypeError', () => {
    expect(() => getRouletteColour('1')).toThrow(TypeError);
    expect(() => getRouletteColour(null)).toThrow(TypeError);
    expect(() => getRouletteColour(undefined)).toThrow(TypeError);
  });

  it('rejects a non-integer or out-of-range number with a RangeError', () => {
    for (const pocket of [-1, 37, 3.5, NaN, Infinity, -Infinity]) {
      expect(() => getRouletteColour(pocket)).toThrow(RangeError);
    }
  });
});
