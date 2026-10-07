import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  probAllDistinctUniform365,
  probSharedUniform365,
  probSharedUniform365AllN,
  exponentialApproxLowerBoundUniform365,
  dpAllDistinctProbabilities,
  probSharedFromWeights,
  sumSquares,
  parseUsBirthsByCalendarDayCsv,
  getUsBirthWeightsFromCsv,
  calendarWeighted366Weights,
  uniform366Weights,
  referenceModelComparisonsAtN,
} from './birthday.js';

/**
 * The bundled CSV shipped in the repository (spec section "Data"). Read from disk
 * via a path resolved from this module so the test does not depend on the cwd.
 * @type {string}
 */
const CSV_PATH = fileURLToPath(
  new URL('../../docs/specs/us-births-by-calendar-day.csv', import.meta.url),
);
const CSV_TEXT = readFileSync(CSV_PATH, 'utf8');

/** @type {number} The uniform-model day count used throughout the uniform tests. */
const D = 365;

/**
 * The exact rational value of the uniform product form `prod_{k=1}^{n-1}(1 - k/d)`
 * as an integer numerator and denominator (BigInt), never forming a factorial.
 * Returns `numerator / denominator` for `P(all distinct)`.
 * @param {number} n Number of people.
 * @param {number} d Number of days.
 * @returns {{ numerator: bigint, denominator: bigint }} Exact fraction.
 */
function exactUniformAllDistinctFraction(n, d) {
  let numerator = 1n;
  let denominator = 1n;
  const db = BigInt(d);
  for (let k = 1; k <= n - 1; k += 1) {
    numerator *= db - BigInt(k);
    denominator *= db;
  }
  return { numerator, denominator };
}

/**
 * Rough equality of two rationals `a/b` and `c/e` (all BigInt), compared by
 * cross-multiplication so no floating point is involved.
 */
function fractionsEqual(a, b, c, e) {
  return a * e === c * b;
}

/**
 * Convert a BigInt fraction to a Number for tolerance comparisons.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {number}
 */
function fractionToNumber(numerator, denominator) {
  return Number(numerator) / Number(denominator);
}

/**
 * Exact probability of "all n distinct" for the distribution p=(1/2,1/4,1/8,1/8)
 * by brute-force enumeration of all 4^n ordered outcomes (exact rational,
 * denominator 8^n). Used to check the DP independently.
 * @param {number} n Number of draws.
 * @returns {{ numerator: bigint, denominator: bigint }} Exact fraction.
 */
function bruteDistinctFourPoint(n) {
  const weights = [4n, 2n, 1n, 1n]; // (1/2, 1/4, 1/8, 1/8) scaled by 8.
  const base = 8n;
  let numerator = 0n;
  let denominator = 1n;
  for (let i = 0; i < n; i += 1) {
    denominator *= base;
  }
  const indices = [];
  const recurse = (depth) => {
    if (depth === n) {
      const distinct = new Set(indices).size === n;
      if (distinct) {
        let product = 1n;
        for (const index of indices) {
          product *= weights[index];
        }
        numerator += product;
      }
      return;
    }
    for (let choice = 0; choice < 4; choice += 1) {
      indices.push(choice);
      recurse(depth + 1);
      indices.pop();
    }
  };
  recurse(0);
  return { numerator, denominator };
}

describe('uniform model over 365 days', () => {
  it('test 1: n=2 gives P(shared)=1/365 exactly (rational) and within 1e-15 (float)', () => {
    // Rational check: 1 - 364/365 = 1/365.
    const exact = exactUniformAllDistinctFraction(2, D); // 364/365
    expect(fractionsEqual(365n - exact.numerator, exact.denominator, 1n, 365n)).toBe(true);
    // 1 - 364/365 === 1/365 in IEEE double is exact, so the strict check holds.
    expect(probSharedUniform365(2)).toBe(1 - 364 / 365);
    expect(Math.abs(probSharedUniform365(2) - 1 / D)).toBeLessThan(1e-15);
  });

  it('test 2: matches the known P(shared) values (tolerance 1e-7)', () => {
    const expected = {
      10: 0.1169482,
      20: 0.4114384,
      22: 0.4756953,
      23: 0.5072972,
      30: 0.7063162,
      40: 0.8912318,
      50: 0.9703736,
      57: 0.9901225,
      70: 0.9991596,
    };
    for (const [n, value] of Object.entries(expected)) {
      expect(probSharedUniform365(Number(n))).toBeCloseTo(value, 7);
    }
  });

  it('test 3: the smallest n with P(shared) >= 0.5 is 23', () => {
    const all = probSharedUniform365AllN(100);
    const smallest = all.findIndex((p, n) => n >= 2 && p >= 0.5);
    expect(smallest).toBe(23);
    expect(all[22]).toBeLessThan(0.5);
    expect(all[23]).toBeGreaterThanOrEqual(0.5);
  });

  it('test 4: n=100 is finite, positive, ~3.07e-7, and matches the BigInt rational (rel err < 1e-12)', () => {
    const distinct = probAllDistinctUniform365(100);
    expect(Number.isFinite(distinct)).toBe(true);
    expect(distinct).toBeGreaterThan(0);
    expect(distinct).toBeCloseTo(3.0725e-7, 9);
    const exact = exactUniformAllDistinctFraction(100, D);
    const exactNumber = fractionToNumber(exact.numerator, exact.denominator);
    const relativeError = Math.abs(distinct - exactNumber) / exactNumber;
    expect(relativeError).toBeLessThan(1e-12);
  });

  it('test 5: generalization to d days (d=6, n=3) gives 5/9 via enumeration; n>d gives P(shared)=1', () => {
    // Enumeration of 6^3 outcomes: distinct ordered triples = 6*5*4 = 120 of 216.
    expect(fractionsEqual(120n, 216n, 5n, 9n)).toBe(true);
    // Internal-parameter check via the DP with uniform weights over 6 days.
    const f6 = dpAllDistinctProbabilities(new Array(6).fill(1 / 6), 3);
    expect(f6[3]).toBeCloseTo(5 / 9, 12);
    expect(probSharedFromWeights(new Array(6).fill(1 / 6), 3)).toBeCloseTo(1 - 5 / 9, 12);
    // Pigeonhole: n > d => shared with probability 1 (P(distinct)=0).
    const f6beyond = dpAllDistinctProbabilities(new Array(6).fill(1 / 6), 7);
    expect(f6beyond[7]).toBe(0);
    expect(probSharedFromWeights(new Array(6).fill(1 / 6), 7)).toBe(1);
  });

  it('test 6: P(shared) is non-decreasing and <= 1 for n=2..100 (strictly increasing)', () => {
    const all = probSharedUniform365AllN(100);
    for (let n = 2; n <= 100; n += 1) {
      expect(all[n]).toBeGreaterThanOrEqual(0);
      expect(all[n]).toBeLessThanOrEqual(1);
      expect(all[n]).toBeGreaterThan(all[n - 1]);
    }
  });

  it('test 7: the exponential approximation is a lower bound for n=2..100 and equals ~0.500002 at n=23', () => {
    for (let n = 2; n <= 100; n += 1) {
      expect(exponentialApproxLowerBoundUniform365(n)).toBeLessThanOrEqual(
        probSharedUniform365(n) + 1e-15,
      );
    }
    expect(exponentialApproxLowerBoundUniform365(23)).toBeCloseTo(0.500002, 6);
  });

  it('test 8: the events A_2,A_3 are not independent; E_ij are pairwise but not mutually independent', () => {
    // P(A2 ∩ A3) = 364*363 / 365^2 is exactly the product form for n=3.
    const exact = exactUniformAllDistinctFraction(3, D);
    expect(fractionsEqual(exact.numerator, exact.denominator, 364n * 363n, 365n * 365n)).toBe(true);
    // P(A2)P(A3) = (364/365)^3 differs (so A_2, A_3 are NOT independent).
    const joint = 364 / 365 * (363 / 365);
    const product = (364 / 365) ** 3;
    expect(Math.abs(joint - product)).toBeGreaterThan(0);
    expect(joint).not.toBe(product);

    // Pairwise independence of E_12, E_13: P(E12 ∩ E13) = 1/365^2 = P(E12)P(E13).
    expect(fractionsEqual(1n, 365n * 365n, 1n * 1n, 365n * 365n)).toBe(true);
    // Mutual dependence: P(E12 ∩ E13 ∩ E23) = 1/365^2 != 1/365^3.
    expect(fractionsEqual(1n, 365n * 365n, 1n, 365n * 365n * 365n)).toBe(false);
  });

  it('test 9: "me versus any pair" for 23 people is ~0.0586', () => {
    expect(1 - (364 / 365) ** 22).toBeCloseTo(0.0586, 4);
  });
});

describe('general distribution dynamic program', () => {
  it('test 10: brute force for p=(1/2,1/4,1/8,1/8), n=3 gives 33/128 and the DP agrees', () => {
    const exact = bruteDistinctFourPoint(3);
    expect(fractionsEqual(exact.numerator, exact.denominator, 33n, 128n)).toBe(true);
    const dp = dpAllDistinctProbabilities([1 / 2, 1 / 4, 1 / 8, 1 / 8], 3);
    expect(dp[3]).toBeCloseTo(33 / 128, 15);
    expect(dp[3]).toBeCloseTo(0.2578125, 15);
  });

  it('test 11: DP with p_j=1/365 matches the product formula for all n<=100 (tol 1e-12) and gives 5/9 for d=6,n=3', () => {
    const uniformWeights = new Array(D).fill(1 / D);
    const f = dpAllDistinctProbabilities(uniformWeights, 100);
    for (let n = 0; n <= 100; n += 1) {
      expect(f[n]).toBeCloseTo(probAllDistinctUniform365(n), 12);
    }
    const f6 = dpAllDistinctProbabilities(new Array(6).fill(1 / 6), 3);
    expect(f6[3]).toBeCloseTo(5 / 9, 12);
  });

  it('test 12: DP properties (bounds, monotonicity, point mass, f_2 = 1 - sum p^2)', () => {
    const weights = [0.5, 0.3, 0.15, 0.05];
    const f = dpAllDistinctProbabilities(weights, 10);
    for (let n = 0; n <= 10; n += 1) {
      expect(f[n]).toBeGreaterThanOrEqual(0);
      expect(f[n]).toBeLessThanOrEqual(1);
      if (n >= 1) {
        expect(f[n]).toBeLessThanOrEqual(f[n - 1]);
      }
    }
    // f_2 = 1 - sum p_j^2.
    expect(f[2]).toBeCloseTo(1 - sumSquares(weights), 12);

    // Point mass: all mass on one day => P(all distinct)=0 for n>=2.
    const pointMass = [1, 0, 0, 0];
    const fp = dpAllDistinctProbabilities(pointMass, 5);
    expect(fp[0]).toBe(1);
    expect(fp[1]).toBe(1);
    for (let n = 2; n <= 5; n += 1) {
      expect(fp[n]).toBe(0);
    }

    // f_n = 0 beyond the number of days with positive probability.
    const twoDays = [0.5, 0.5, 0, 0];
    const f2 = dpAllDistinctProbabilities(twoDays, 5);
    expect(f2[2]).toBeCloseTo(0.5, 12);
    for (let n = 3; n <= 5; n += 1) {
      expect(f2[n]).toBe(0);
    }
  });

  it('test 13: Schur property - real SSA and CDC P(shared) >= uniform-366 for every n=2..100', () => {
    const ssa = getUsBirthWeightsFromCsv(CSV_TEXT, 'ssa_2000_2014').weights;
    const cdc = getUsBirthWeightsFromCsv(CSV_TEXT, 'cdc_1994_2003').weights;
    const u366 = uniform366Weights();
    const fSsa = dpAllDistinctProbabilities(ssa, 100);
    const fCdc = dpAllDistinctProbabilities(cdc, 100);
    const f366 = dpAllDistinctProbabilities(u366, 100);
    for (let n = 2; n <= 100; n += 1) {
      expect(1 - fSsa[n]).toBeGreaterThanOrEqual(1 - f366[n] - 1e-12);
      expect(1 - fCdc[n]).toBeGreaterThanOrEqual(1 - f366[n] - 1e-12);
    }
  });
});


describe('real US births loaded from the bundled CSV', () => {
  const rows = parseUsBirthsByCalendarDayCsv(CSV_TEXT);
  const ssa = getUsBirthWeightsFromCsv(CSV_TEXT, 'ssa_2000_2014');
  const cdc = getUsBirthWeightsFromCsv(CSV_TEXT, 'cdc_1994_2003');

  it('test 14: 366 rows, exact totals, weights sum to 1, all positive, 29 Feb present', () => {
    expect(rows).toHaveLength(366);
    expect(ssa.totals.totalBirths).toBe(62187024);
    expect(cdc.totals.totalBirths).toBe(39722137);

    for (const weights of [ssa.weights, cdc.weights]) {
      expect(weights).toHaveLength(366);
      const sum = weights.reduce((accumulator, value) => accumulator + value, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
      for (const value of weights) {
        expect(value).toBeGreaterThan(0);
      }
    }

    // 29 February is present as a valid row (month=2, day=29).
    const leapRows = rows.filter((row) => row.month === 2 && row.day === 29);
    expect(leapRows).toHaveLength(1);
    // The leap day is the least-frequent category in the SSA series.
    const leapIndex = rows.findIndex((row) => row.month === 2 && row.day === 29);
    expect(ssa.metadata.minWeightIndex).toBe(leapIndex);
  });

  it('test 15: reference values for the SSA and CDC distributions (tolerance 1e-7)', () => {
    const fSsa = dpAllDistinctProbabilities(ssa.weights, 100);
    const expectedSsa = {
      2: 0.0027449,
      10: 0.1171530,
      22: 0.4763101,
      23: 0.5079292,
      30: 0.7069576,
      50: 0.9705501,
      70: 0.9991691,
    };
    for (const [n, value] of Object.entries(expectedSsa)) {
      expect(1 - fSsa[Number(n)]).toBeCloseTo(value, 7);
    }
    // P(distinct, n=100) ~ 3.0062e-7 (relative tolerance 1e-4).
    expect(fSsa[100]).toBeCloseTo(3.0062e-7, 10);
    expect(Math.abs(fSsa[100] - 3.0062e-7) / 3.0062e-7).toBeLessThan(1e-4);

    // CDC at n=23.
    const fCdc = dpAllDistinctProbabilities(cdc.weights, 100);
    expect(1 - fCdc[23]).toBeCloseTo(0.5079012, 7);

    // The smallest n above 0.5 is 23 for both series.
    const firstAboveSsa = Array.from({ length: 101 }, (_, n) => 1 - fSsa[n]).findIndex(
      (p, n) => n >= 2 && p >= 0.5,
    );
    const firstAboveCdc = Array.from({ length: 101 }, (_, n) => 1 - fCdc[n]).findIndex(
      (p, n) => n >= 2 && p >= 0.5,
    );
    expect(firstAboveSsa).toBe(23);
    expect(firstAboveCdc).toBe(23);
  });

  it('test 16: n=2 identity P(shared)=sum p^2=0.0027449 for SSA', () => {
    expect(sumSquares(ssa.weights)).toBeCloseTo(0.0027449, 7);
    expect(probSharedFromWeights(ssa.weights, 2)).toBeCloseTo(0.0027449, 7);
    // The two routes to the n=2 value agree to floating precision (different
    // summation paths, so allow for accumulated rounding at the 1e-14 level).
    expect(probSharedFromWeights(ssa.weights, 2)).toBeCloseTo(sumSquares(ssa.weights), 13);
  });

  it('test 17: model comparison at n=23 and the maximum gap at n=27', () => {
    const reference = referenceModelComparisonsAtN(23);
    expect(reference.uniform365).toBeCloseTo(0.5072972, 7);
    expect(reference.calendarWeighted366).toBeCloseTo(0.5068650, 7);
    expect(reference.uniform366).toBeCloseTo(0.5063230, 7);
    expect(probSharedFromWeights(ssa.weights, 23)).toBeCloseTo(0.5079292, 7);

    // The calendar-weighted reference weights themselves form a valid
    // distribution (sum to 1) with 29 February lighter than an ordinary date.
    const calendarWeights = calendarWeighted366Weights();
    expect(calendarWeights).toHaveLength(366);
    expect(calendarWeights.reduce((accumulator, value) => accumulator + value, 0)).toBeCloseTo(1, 12);
    expect(calendarWeights[59]).toBeLessThan(calendarWeights[60]);
    expect(
      probSharedFromWeights(calendarWeights, 23),
    ).toBeCloseTo(reference.calendarWeighted366, 15);

    // The maximum of P_SSA - P_uniform365 over n=2..100 is ~0.00066 at n=27.
    const uniformAll = probSharedUniform365AllN(100);
    const fSsa = dpAllDistinctProbabilities(ssa.weights, 100);
    let maxGap = { n: 0, gap: 0 };
    for (let n = 2; n <= 100; n += 1) {
      const gap = 1 - fSsa[n] - uniformAll[n];
      if (gap > maxGap.gap) {
        maxGap = { n, gap };
      }
    }
    expect(maxGap.n).toBe(27);
    expect(maxGap.gap).toBeCloseTo(0.00066, 5);
  });

  it('test 18: detectability formula 9p(1-p)/delta^2 at n=23 is ~5.6e6 (within 2%)', () => {
    const p = probSharedFromWeights(ssa.weights, 23);
    const delta = p - probSharedUniform365(23);
    const needed = (9 * p * (1 - p)) / (delta * delta);
    expect(needed).toBeGreaterThan(5.6e6 * 0.98);
    expect(needed).toBeLessThan(5.6e6 * 1.02);
  });
});

