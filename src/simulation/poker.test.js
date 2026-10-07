import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HANDS_N,
  MIN_HANDS_N,
  MAX_HANDS_N,
  MIN_EXPECTED_FOR_CHI_SQUARE,
  MIN_EXPECTED_FOR_Z_SCORE,
  dealFiveCardHand,
  runPokerSimulation,
  mergeCategoriesForChiSquare,
  focusCategoryStats,
  binomialProbabilityZero,
  binomialTailProbability,
  chiSquareCdf,
  chiSquareSurvival,
  chiSquarePValue,
} from './poker.js';
import { createSeededRng } from './rng.js';
import { POKER_CATEGORIES, CARD_COUNT, HAND_SIZE } from '../math/poker.js';

/** Independent copy of the theory counts (never imported from the module). */
const REFERENCE_COUNTS = {
  'Royal Flush': 4,
  'Straight Flush': 36,
  'Four of a Kind': 624,
  'Full House': 3744,
  Flush: 5108,
  Straight: 10200,
  'Three of a Kind': 54912,
  'Two Pair': 123552,
  'One Pair': 1098240,
  'High Card': 1302540,
};

const TOTAL_HANDS = 2598960;

/** Rarest-to-commonest order equals the canonical category list. */
const ORDER_RAREST_FIRST = [...POKER_CATEGORIES];

/** Theory probability of a category. */
function theoryP(category) {
  return REFERENCE_COUNTS[category] / TOTAL_HANDS;
}

describe('chi-square distribution', () => {
  it('matches the two known spec quantiles', () => {
    // P(chi2_1 <= 3.841) ~ 0.95 and P(chi2_6 <= 12.592) ~ 0.95.
    expect(chiSquareCdf(3.841, 1)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(12.592, 6)).toBeCloseTo(0.95, 3);
    // Survival is the complement of the CDF.
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(1 - 0.95, 3);
    expect(chiSquarePValue({ chi2: 12.592, dof: 6 })).toBeCloseTo(0.05, 3);
  });

  it('is a valid CDF: 0 at the boundary, monotone, and reaching 1', () => {
    expect(chiSquareCdf(0, 1)).toBe(0);
    let previous = -1;
    for (const x of [0.01, 0.5, 1, 2, 5, 10, 25, 50]) {
      const value = chiSquareCdf(x, 4);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(chiSquareCdf(200, 4)).toBeCloseTo(1, 10);
    expect(chiSquareSurvival(0, 3)).toBe(1);
  });

  it('rejects invalid arguments', () => {
    expect(() => chiSquareCdf(-1, 1)).toThrow(RangeError);
    expect(() => chiSquareCdf(1, 0)).toThrow(RangeError);
    expect(() => chiSquareCdf(1, 1.5)).toThrow(RangeError);
    expect(() => chiSquareCdf('1', 1)).toThrow(TypeError);
  });
});

describe('dealFiveCardHand', () => {
  it('returns five distinct valid cards', () => {
    const rng = createSeededRng(2024);
    for (let i = 0; i < 1000; i += 1) {
      const hand = dealFiveCardHand(rng);
      expect(hand).toHaveLength(HAND_SIZE);
      expect(new Set(hand).size).toBe(HAND_SIZE);
      for (const card of hand) {
        expect(Number.isInteger(card)).toBe(true);
        expect(card).toBeGreaterThanOrEqual(0);
        expect(card).toBeLessThanOrEqual(CARD_COUNT - 1);
      }
    }
  });

  it('never produces a duplicate card within any of 100 000 seeded hands', () => {
    const rng = createSeededRng(99887766);
    for (let i = 0; i < 100000; i += 1) {
      const hand = dealFiveCardHand(rng);
      expect(new Set(hand).size).toBe(HAND_SIZE);
      expect(hand[0]).not.toBe(hand[1]);
      expect(hand[2]).not.toBe(hand[4]);
    }
  });

  it('is deterministic for a fixed seed and rejects a non-function rng', () => {
    const a = createSeededRng(555);
    const b = createSeededRng(555);
    const first = Array.from({ length: 50 }, () => dealFiveCardHand(a));
    const second = Array.from({ length: 50 }, () => dealFiveCardHand(b));
    expect(first).toEqual(second);
    expect(() => dealFiveCardHand(123)).toThrow(TypeError);
  });
});

describe('runPokerSimulation — snapshot and determinism', () => {
  it('validates handsN and the seed', () => {
    expect(() => runPokerSimulation({ handsN: 499, seed: 1 })).toThrow(RangeError);
    expect(() => runPokerSimulation({ handsN: 100001, seed: 1 })).toThrow(RangeError);
    expect(() => runPokerSimulation({ handsN: 1000.5, seed: 1 })).toThrow(RangeError);
    expect(() => runPokerSimulation({ handsN: '1000', seed: 1 })).toThrow(TypeError);
    expect(() => runPokerSimulation({ handsN: 1000, seed: -1 })).toThrow(RangeError);
    expect(() => runPokerSimulation({ handsN: 1000, seed: 1.5 })).toThrow(RangeError);
    expect(() => runPokerSimulation({ handsN: 1000, seed: 'x' })).toThrow(TypeError);
  });

  it('defaults exist for the documented range', () => {
    expect(DEFAULT_HANDS_N).toBe(10000);
    expect(MIN_HANDS_N).toBe(500);
    expect(MAX_HANDS_N).toBe(100000);
    expect(MIN_EXPECTED_FOR_CHI_SQUARE).toBe(5);
    expect(MIN_EXPECTED_FOR_Z_SCORE).toBe(10);
  });

  it('accepts the boundary values 500 and 100000', () => {
    expect(() => runPokerSimulation({ handsN: 500, seed: 1 })).not.toThrow();
    const high = runPokerSimulation({ handsN: 100000, seed: 1 });
    expect(Object.values(high.observedCountsByCategory).reduce((a, b) => a + b, 0)).toBe(100000);
  });

  it('reports seedUsed and is deterministic for the same seed', () => {
    const first = runPokerSimulation({ handsN: 5000, seed: 424242 });
    const second = runPokerSimulation({ handsN: 5000, seed: 424242 });
    expect(first.inputs.seedUsed).toBe(424242);
    expect(first.inputs.handsN).toBe(5000);
    expect(first.observedCountsByCategory).toEqual(second.observedCountsByCategory);
    expect(first.chiSquare.chi2).toBe(second.chiSquare.chi2);
    expect(first.chiSquare.classes).toEqual(second.chiSquare.classes);
    expect(first.chiSquare.dof).toBe(second.chiSquare.dof);
  });

  it('produces different results for two far-apart seeds', () => {
    const a = runPokerSimulation({ handsN: 20000, seed: 1 });
    const b = runPokerSimulation({ handsN: 20000, seed: 987654321 });
    const anyDifferent = ORDER_RAREST_FIRST.some(
      (category) =>
        a.observedCountsByCategory[category] !== b.observedCountsByCategory[category],
    );
    expect(anyDifferent).toBe(true);
  });

  it('generates and reports a seed when none is supplied', () => {
    const snapshot = runPokerSimulation({ handsN: 500 });
    expect(Number.isInteger(snapshot.inputs.seedUsed)).toBe(true);
    expect(snapshot.inputs.seedUsed).toBeGreaterThanOrEqual(0);
  });

  it('counts sum to N, frequencies are O/N and totals are consistent', () => {
    const N = 10000;
    const snapshot = runPokerSimulation({ handsN: N, seed: 1337 });
    let total = 0;
    for (const category of ORDER_RAREST_FIRST) {
      const observed = snapshot.observedCountsByCategory[category];
      expect(Number.isInteger(observed)).toBe(true);
      expect(observed).toBeGreaterThanOrEqual(0);
      expect(snapshot.empiricalProbByCategory[category]).toBeCloseTo(observed / N, 12);
      total += observed;
    }
    expect(total).toBe(N);
    expect(snapshot.categories).toEqual(ORDER_RAREST_FIRST);
  });

  it('reports theory probabilities equal to the exact counts over C(52,5)', () => {
    const snapshot = runPokerSimulation({ handsN: 500, seed: 7 });
    for (const category of ORDER_RAREST_FIRST) {
      expect(snapshot.expectedProbByCategory[category]).toBe(theoryP(category));
      expect(snapshot.expectedCountsByCategory[category]).toBeCloseTo(500 * theoryP(category), 10);
    }
  });

  it('marks z-scores n/a (null) exactly when Np < 10', () => {
    const N = 10000;
    const snapshot = runPokerSimulation({ handsN: N, seed: 24680 });
    for (const category of ORDER_RAREST_FIRST) {
      const eligible = N * theoryP(category) >= 10;
      expect(snapshot.zScoreEligibleByCategory[category]).toBe(eligible);
      if (eligible) {
        const observed = snapshot.observedCountsByCategory[category];
        const expected = N * theoryP(category);
        const p = theoryP(category);
        expect(snapshot.zScoresByCategory[category]).toBeCloseTo(
          (observed - expected) / Math.sqrt(expected * (1 - p)),
          12,
        );
      } else {
        expect(snapshot.zScoresByCategory[category]).toBeNull();
      }
    }
    // Royal flush and straight flush are always n/a at N <= 100000.
    expect(snapshot.zScoresByCategory['Royal Flush']).toBeNull();
    expect(snapshot.zScoresByCategory['Straight Flush']).toBeNull();
  });

  it('does not treat a zero observed rare count as an error', () => {
    const snapshot = runPokerSimulation({ handsN: 500, seed: 10 });
    // With N = 500 the royal flush is normally absent; that is expected.
    expect(snapshot.observedCountsByCategory['Royal Flush']).toBeGreaterThanOrEqual(0);
    expect(snapshot.zScoreEligibleByCategory['Royal Flush']).toBe(false);
    expect(snapshot.zScoresByCategory['Royal Flush']).toBeNull();
  });
});


describe('mergeCategoriesForChiSquare — merge rule', () => {
  const Ns = [500, 10000, 100000];

  it.each(Ns)('for N=%i every merged class has expected >= 5 and dof = classes - 1', (N) => {
    const snapshot = runPokerSimulation({ handsN: N, seed: 31415 });
    const { classes, dof } = snapshot.chiSquare;
    for (const mergedClass of classes) {
      expect(mergedClass.expectedCount).toBeGreaterThanOrEqual(MIN_EXPECTED_FOR_CHI_SQUARE);
    }
    expect(dof).toBe(classes.length - 1);
    expect(classes.length).toBeGreaterThanOrEqual(1);
  });

  it.each(Ns)('for N=%i the merged classes partition all ten categories', (N) => {
    const snapshot = runPokerSimulation({ handsN: N, seed: 271828 });
    const flattened = snapshot.chiSquare.classes.flatMap((mergedClass) => mergedClass.categories);
    expect([...flattened].sort()).toEqual([...ORDER_RAREST_FIRST].sort());
    expect(new Set(flattened).size).toBe(ORDER_RAREST_FIRST.length);

    const observedSum = snapshot.chiSquare.classes.reduce(
      (sum, mergedClass) => sum + mergedClass.observedCount,
      0,
    );
    expect(observedSum).toBe(N);
    const expectedSum = snapshot.chiSquare.classes.reduce(
      (sum, mergedClass) => sum + mergedClass.expectedCount,
      0,
    );
    expect(expectedSum).toBeCloseTo(N, 6);
  });

  it('merges the rarest categories first (N=10000, spec example)', () => {
    const snapshot = runPokerSimulation({ handsN: 10000, seed: 999 });
    const firstClass = snapshot.chiSquare.classes[0];
    expect(firstClass.categories).toEqual([
      'Royal Flush',
      'Straight Flush',
      'Four of a Kind',
      'Full House',
    ]);
    expect(firstClass.expectedCount).toBeGreaterThanOrEqual(MIN_EXPECTED_FOR_CHI_SQUARE);
    expect(snapshot.chiSquare.classes).toHaveLength(7);
    expect(snapshot.chiSquare.dof).toBe(6);
  });

  it('folds a trailing under-threshold class into the previous one', () => {
    const merged = mergeCategoriesForChiSquare({
      expectedCounts: { a: 2, b: 2, c: 100 },
      observedCounts: { a: 1, b: 3, c: 99 },
      orderRarestToCommonest: ['a', 'b', 'c'],
      minExpected: 5,
    });
    // a+b = 4 (< 5) so c is folded in, giving a single class.
    expect(merged.classes).toHaveLength(1);
    expect(merged.classes[0].categories).toEqual(['a', 'b', 'c']);
    expect(merged.dof).toBe(0);
  });

  it('closes a class as soon as the accumulated expected count reaches minExpected', () => {
    const merged = mergeCategoriesForChiSquare({
      expectedCounts: { a: 3, b: 3, c: 30 },
      observedCounts: { a: 3, b: 3, c: 30 },
      orderRarestToCommonest: ['a', 'b', 'c'],
      minExpected: 5,
    });
    // a = 3 (< 5), a+b = 6 (>= 5) closes the first class, then c alone.
    expect(merged.classes).toHaveLength(2);
    expect(merged.classes[0].categories).toEqual(['a', 'b']);
    expect(merged.classes[1].categories).toEqual(['c']);
    expect(merged.dof).toBe(1);
    expect(merged.chi2).toBe(0);
  });

  it('requires the category order and per-category counts', () => {
    expect(() =>
      mergeCategoriesForChiSquare({ expectedCounts: {}, observedCounts: {} }),
    ).toThrow(TypeError);
    expect(() =>
      mergeCategoriesForChiSquare({
        expectedCounts: { a: 1 },
        observedCounts: {},
        orderRarestToCommonest: ['a'],
      }),
    ).toThrow(RangeError);
  });
});


describe('focus-mode binomial quantities', () => {
  it('returns null z-score and exact binomial quantities for a rare category', () => {
    const focus = focusCategoryStats({ category: 'Royal Flush', handsN: 10000, observedCount: 0 });
    const p = theoryP('Royal Flush');
    expect(focus.zScore).toBeNull();
    expect(focus.zEligible).toBe(false);
    expect(focus.expectedCount).toBeCloseTo(10000 * p, 12);
    expect(focus.probabilityZero).toBeCloseTo((1 - p) ** 10000, 12);
    expect(focus.tailProbability).toBe(1); // P(X >= 0) = 1
    expect(binomialProbabilityZero(10000, p)).toBeCloseTo((1 - p) ** 10000, 12);
  });

  it('returns an eligible z-score for a common category', () => {
    const focus = focusCategoryStats({ category: 'One Pair', handsN: 10000, observedCount: 4226 });
    const p = theoryP('One Pair');
    expect(focus.zEligible).toBe(true);
    expect(focus.zScore).toBeCloseTo((4226 - 10000 * p) / Math.sqrt(10000 * p * (1 - p)), 12);
  });

  it('computes a valid binomial tail for a moderate case', () => {
    // X ~ Bin(10, 1/2): P(X >= 5) = (C(10,5)+...+C(10,10))/2^10 = 638/1024.
    expect(binomialTailProbability(10, 0.5, 5)).toBeCloseTo(638 / 1024, 10);
    expect(binomialTailProbability(10, 0.5, 0)).toBe(1);
  });

  it('rejects invalid focus inputs', () => {
    expect(() =>
      focusCategoryStats({ category: 'Nope', handsN: 10000, observedCount: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      focusCategoryStats({ category: 'One Pair', handsN: 100, observedCount: 0 }),
    ).toThrow(RangeError);
    expect(() => binomialProbabilityZero(10, 1.5)).toThrow(RangeError);
    expect(() => binomialTailProbability(10, 0.5, 11)).toThrow(RangeError);
  });
});


describe('regression-style sanity (deterministic, not a proof)', () => {
  it('keeps Np>=10 categories within 4 standard deviations for a fixed seed', () => {
    const N = 100000;
    const snapshot = runPokerSimulation({ handsN: N, seed: 20240101 });
    for (const category of ORDER_RAREST_FIRST) {
      const expected = N * theoryP(category);
      if (expected >= MIN_EXPECTED_FOR_Z_SCORE) {
        const observed = snapshot.observedCountsByCategory[category];
        const sd = Math.sqrt(expected * (1 - theoryP(category)));
        expect(Math.abs(observed - expected)).toBeLessThanOrEqual(4 * sd);
      }
    }
  });

  it('produces a chi2 below the 99.9% quantile of its own CDF for a fixed seed', () => {
    const snapshot = runPokerSimulation({ handsN: 100000, seed: 606060 });
    const { chi2, dof } = snapshot.chiSquare;
    // Find the 99.9% quantile by a deterministic bisection on our own CDF.
    let low = 0;
    let high = dof + 100;
    for (let i = 0; i < 200; i += 1) {
      const mid = (low + high) / 2;
      if (chiSquareCdf(mid, dof) < 0.999) {
        low = mid;
      } else {
        high = mid;
      }
    }
    expect(chi2).toBeLessThan(high);
    expect(snapshot.chiSquare.pValue).toBeGreaterThan(0.001);
  });

  it('reports a p-value that is the survival function of the statistic', () => {
    const snapshot = runPokerSimulation({ handsN: 50000, seed: 13579 });
    const { chi2, dof, pValue } = snapshot.chiSquare;
    expect(pValue).toBeCloseTo(chiSquareSurvival(chi2, dof), 12);
  });
});

