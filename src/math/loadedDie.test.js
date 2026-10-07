import { describe, it, expect } from 'vitest';
import {
  getDiePmfs,
  logBayesFactor,
  bayesFactor,
  posteriorLoadedGivenCount,
  priorOdds,
  posteriorOdds,
  predictiveNextFacePmf,
  predictiveNextSixProbability,
  dependenceGap66,
  updatePosteriorWithOneRoll,
} from './loadedDie.js';
import { binomialPmfArray } from './distributions.js';

/**
 * Minimal reduced-fraction helper for the exact tests, independent of the
 * module under test. Fractions are BigInt pairs `{ num, den }` with a positive
 * denominator; this mirrors the convention used elsewhere in `src/math` but is
 * re-implemented here so the tests do not rely on internal helpers.
 */
const Frac = {
  /**
   * Greatest common divisor of two BigInts (signs removed).
   * @param {bigint} a First integer.
   * @param {bigint} b Second integer.
   * @returns {bigint} Nonnegative gcd.
   */
  gcd(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x;
  },
  /**
   * Reduce a fraction to lowest terms with a positive denominator.
   * @param {bigint} num Numerator.
   * @param {bigint} den Denominator.
   * @returns {{ num: bigint, den: bigint }} Reduced fraction.
   */
  make(num, den) {
    const sign = den < 0n ? -1n : 1n;
    const g = Frac.gcd(num, den) || 1n;
    return { num: (sign * num) / g, den: (sign * den) / g };
  },
  /**
   * Add two reduced fractions.
   * @param {{num:bigint,den:bigint}} a First fraction.
   * @param {{num:bigint,den:bigint}} b Second fraction.
   * @returns {{num:bigint,den:bigint}} Reduced sum.
   */
  add(a, b) {
    return Frac.make(a.num * b.den + b.num * a.den, a.den * b.den);
  },
  /**
   * Multiply two reduced fractions.
   * @param {{num:bigint,den:bigint}} a First fraction.
   * @param {{num:bigint,den:bigint}} b Second fraction.
   * @returns {{num:bigint,den:bigint}} Reduced product.
   */
  mul(a, b) {
    return Frac.make(a.num * b.num, a.den * b.den);
  },
  /**
   * Cross-multiply equality test.
   * @param {{num:bigint,den:bigint}} a First fraction.
   * @param {{num:bigint,den:bigint}} b Second fraction.
   * @returns {boolean} Whether `a` and `b` represent the same rational.
   */
  eq(a, b) {
    return a.num * b.den === b.num * a.den;
  },
  /**
   * Convert a fraction to its nearest double (num / den).
   * @param {{num:bigint,den:bigint}} a Fraction.
   * @returns {number} The quotient as a double.
   */
  toNumber(a) {
    return Number(a.num) / Number(a.den);
  },
};

/**
 * Sum an array of numbers.
 * @param {readonly number[]} values Values to sum.
 * @returns {number} The sum.
 */
function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

describe('getDiePmfs', () => {
  it('returns valid PMFs (nonnegative, length 6, sum exactly 1) for several biases', () => {
    for (const b of [1 / 6, 0.2, 0.5, 0.75, 1]) {
      const { fairPmf, loadedPmf } = getDiePmfs({ b });
      expect(fairPmf).toHaveLength(6);
      expect(loadedPmf).toHaveLength(6);
      expect(sum(fairPmf)).toBeCloseTo(1, 15);
      for (const p of fairPmf) {
        expect(p).toBeGreaterThanOrEqual(0);
      }
      for (const p of loadedPmf) {
        expect(p).toBeGreaterThanOrEqual(0);
      }
      // Loaded row: P(6) = b, P(1..5) = (1 - b)/5, and it sums to 1.
      expect(loadedPmf[5]).toBe(b);
      expect(sum(loadedPmf)).toBeCloseTo(1, 15);
    }
  });

  it('uses 1/6 for every face of the fair die', () => {
    const { fairPmf } = getDiePmfs({ b: 0.5 });
    for (const p of fairPmf) {
      expect(p).toBe(1 / 6);
    }
  });

  it('at b = 1/6 the two dice are identical', () => {
    const { fairPmf, loadedPmf } = getDiePmfs({ b: 1 / 6 });
    expect(loadedPmf).toHaveLength(fairPmf.length);
    for (let j = 0; j < fairPmf.length; j += 1) {
      expect(loadedPmf[j]).toBeCloseTo(fairPmf[j], 15);
    }
  });

  it('at b = 1 the loaded die always shows 6', () => {
    const { loadedPmf } = getDiePmfs({ b: 1 });
    expect(loadedPmf).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('rejects out-of-range or non-numeric bias', () => {
    expect(() => getDiePmfs({ b: 0.1 })).toThrow(RangeError);
    expect(() => getDiePmfs({ b: 1.2 })).toThrow(RangeError);
    expect(() => getDiePmfs({ b: NaN })).toThrow(RangeError);
    expect(() => getDiePmfs({ b: '0.5' })).toThrow(TypeError);
  });
});

describe('sampling distributions P(D|H) as Binomial PMFs over k', () => {
  it('loaded and fair Binomial PMFs are nonnegative and sum to 1 (m = 10, tol 1e-12)', () => {
    for (const p of [1 / 6, 0.5]) {
      const pmf = binomialPmfArray(10, p);
      for (const prob of pmf) {
        expect(prob).toBeGreaterThanOrEqual(0);
      }
      expect(sum(pmf)).toBeCloseTo(1, 12);
    }
  });

  it('sums to 1 within 1e-9 for m = 5000', () => {
    for (const p of [1 / 6, 0.5]) {
      const pmf = binomialPmfArray(5000, p);
      expect(sum(pmf)).toBeCloseTo(1, 9);
    }
  });
});

describe('posteriorLoadedGivenCount: exact values at theta = 0.5, b = 0.5', () => {
  const THETA = 0.5;
  const B = 0.5;

  it('(m=1, k=1) equals 3/4 exactly', () => {
    const post = posteriorLoadedGivenCount({ theta: THETA, b: B, m: 1, k: 1 });
    expect(post).toBeCloseTo(Frac.toNumber(Frac.make(3n, 4n)), 15);
    expect(Frac.eq(Frac.make(BigInt(Math.round(post * 4)), 4n), Frac.make(3n, 4n))).toBe(true);
  });

  it('(m=6, k=3) is 5.832 / 6.832 (BF = 27 * 0.6^3 = 5.832)', () => {
    const bf = 27 * 0.6 ** 3; // 3^3 * 0.6^3
    expect(bf).toBeCloseTo(5.832, 12);
    const expected = bf / (1 + bf);
    expect(expected).toBeCloseTo(0.8536, 4);
    expect(posteriorLoadedGivenCount({ theta: THETA, b: B, m: 6, k: 3 })).toBeCloseTo(expected, 12);
  });

  it('(m=10, k=5) is 18.896 / 19.896 (BF = 3^5 * 0.6^5)', () => {
    const bf = 3 ** 5 * 0.6 ** 5;
    expect(bf).toBeCloseTo(18.896, 3);
    const expected = bf / (1 + bf);
    expect(expected).toBeCloseTo(0.9497, 4);
    expect(posteriorLoadedGivenCount({ theta: THETA, b: B, m: 10, k: 5 })).toBeCloseTo(expected, 12);
  });

  it('(m=10, k=0) is 0.6^10 / (1 + 0.6^10)', () => {
    const bf = 0.6 ** 10;
    const expected = bf / (1 + bf);
    expect(expected).toBeCloseTo(0.0060103, 6);
    expect(posteriorLoadedGivenCount({ theta: THETA, b: B, m: 10, k: 0 })).toBeCloseTo(expected, 12);
  });

  it('matches the log-odds formula logit(theta) + k ln(6b) + (m-k) ln(6(1-b)/5)', () => {
    const logOdds = Math.log(THETA / (1 - THETA))
      + 3 * Math.log(6 * B)
      + 3 * Math.log((6 * (1 - B)) / 5);
    const expected = 1 / (1 + Math.exp(-logOdds));
    expect(posteriorLoadedGivenCount({ theta: THETA, b: B, m: 6, k: 3 })).toBeCloseTo(expected, 14);
  });
});

describe('posteriorLoadedGivenCount: range and monotonicity', () => {
  it('stays within [0, 1] on a grid of (theta, b, m, k)', () => {
    for (const theta of [0, 0.01, 0.5, 0.99, 1]) {
      for (const b of [1 / 6, 0.2, 0.5, 0.8, 1]) {
        for (const m of [1, 5, 10, 100]) {
          for (let k = 0; k <= m; k += Math.max(1, Math.floor(m / 10))) {
            // Skip only the explicitly undefined 0/0 case.
            if (theta === 1 && b === 1 && m > k) {
              expect(() => posteriorLoadedGivenCount({ theta, b, m, k })).toThrow(RangeError);
              continue;
            }
            const post = posteriorLoadedGivenCount({ theta, b, m, k });
            expect(post).toBeGreaterThanOrEqual(0);
            expect(post).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('is strictly increasing in k for b > 1/6 and 0 < theta < 1', () => {
    const post = (k) => posteriorLoadedGivenCount({ theta: 0.4, b: 0.5, m: 20, k });
    for (let k = 0; k < 20; k += 1) {
      expect(post(k + 1)).toBeGreaterThan(post(k));
    }
  });

  it('is increasing in theta for b > 1/6 and 0 < theta < 1', () => {
    const post = (theta) => posteriorLoadedGivenCount({ theta, b: 0.5, m: 10, k: 5 });
    let previous = post(0.05);
    for (const theta of [0.1, 0.3, 0.5, 0.7, 0.9, 0.95]) {
      const current = post(theta);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });
});

describe('posteriorLoadedGivenCount: degenerate and impossible dice', () => {
  it('degenerate dice b = 1/6 give posterior == theta for every k', () => {
    for (const theta of [0, 0.25, 0.5, 0.75, 1]) {
      for (const [m, k] of [[10, 0], [10, 5], [10, 10], [3, 1]]) {
        expect(posteriorLoadedGivenCount({ theta, b: 1 / 6, m, k })).toBe(theta);
      }
    }
  });

  it('b = 1 with a non-six gives posterior exactly 0 for 0 < theta < 1 (no divide-by-zero)', () => {
    for (const theta of [0.1, 0.5, 0.9]) {
      for (const [m, k] of [[5, 4], [3, 0], [10, 7]]) {
        expect(posteriorLoadedGivenCount({ theta, b: 1, m, k })).toBe(0);
      }
    }
  });

  it('b = 1 with all sixes stays finite and increases with k', () => {
    const p1 = posteriorLoadedGivenCount({ theta: 0.5, b: 1, m: 10, k: 10 });
    const p0 = posteriorLoadedGivenCount({ theta: 0.5, b: 1, m: 10, k: 4 });
    expect(Number.isFinite(p1)).toBe(true);
    expect(p1).toBeGreaterThan(p0);
  });
});

describe('posteriorLoadedGivenCount: prior endpoints', () => {
  it('theta = 0 gives posterior 0 for all data', () => {
    for (const [b, m, k] of [[0.5, 10, 0], [0.5, 10, 10], [1, 10, 9], [1 / 6, 5, 5]]) {
      expect(posteriorLoadedGivenCount({ theta: 0, b, m, k })).toBe(0);
    }
  });

  it('theta = 1 with b < 1 gives posterior 1', () => {
    for (const [b, m, k] of [[0.5, 10, 0], [0.5, 10, 5], [0.99, 3, 1]]) {
      expect(posteriorLoadedGivenCount({ theta: 1, b, m, k })).toBe(1);
    }
  });

  it('theta = 1 with b = 1 and all sixes gives posterior 1', () => {
    expect(posteriorLoadedGivenCount({ theta: 1, b: 1, m: 10, k: 10 })).toBe(1);
    expect(posteriorLoadedGivenCount({ theta: 1, b: 1, m: 0, k: 0 })).toBe(1);
  });

  it('theta = 1, b = 1 and a non-six is explicitly undefined (throws RangeError)', () => {
    expect(() => posteriorLoadedGivenCount({ theta: 1, b: 1, m: 10, k: 9 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 1, b: 1, m: 10, k: 9 })).toThrow(/undefined/i);
  });
});


describe('numerical stability for large m', () => {
  it('m = 5000 at k = 0, 1667, 5000 never gives NaN or Infinity', () => {
    for (const k of [0, 1667, 5000]) {
      const post = posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 5000, k });
      expect(Number.isNaN(post)).toBe(false);
      expect(Number.isFinite(post)).toBe(true);
      expect(post).toBeGreaterThanOrEqual(0);
      expect(post).toBeLessThanOrEqual(1);
    }
  });

  it('saturates to 0 (k = 0) and 1 (k = 5000) correctly', () => {
    expect(posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 5000, k: 0 })).toBe(0);
    expect(posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 5000, k: 5000 })).toBe(1);
  });

  it('k = 1000 of m = 1000 stays finite (log space, never 3^1000)', () => {
    const post = posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 1000, k: 1000 });
    expect(Number.isFinite(post)).toBe(true);
    expect(post).toBe(1);
  });

  it('logBayesFactor is finite for large m and b < 1', () => {
    const logBf = logBayesFactor({ b: 0.5, m: 5000, k: 2500 });
    expect(Number.isFinite(logBf)).toBe(true);
    // log BF = 2500 ln 3 + 2500 ln 0.6
    expect(logBf).toBeCloseTo(2500 * Math.log(3) + 2500 * Math.log(0.6), 6);
  });
});

describe('bayesFactor and logBayesFactor', () => {
  it('logBayesFactor matches k ln(6b) + (m-k) ln(6(1-b)/5)', () => {
    const logBf = logBayesFactor({ b: 0.5, m: 10, k: 4 });
    expect(logBf).toBeCloseTo(4 * Math.log(3) + 6 * Math.log(0.6), 12);
  });

  it('b = 1 with a non-six gives BF = 0 (log = -Infinity), no logs of 0', () => {
    expect(logBayesFactor({ b: 1, m: 5, k: 4 })).toBe(-Infinity);
    expect(bayesFactor({ b: 1, m: 5, k: 4 })).toBe(0);
  });

  it('b = 1 with all sixes gives log BF = k ln 6', () => {
    expect(logBayesFactor({ b: 1, m: 5, k: 5 })).toBeCloseTo(5 * Math.log(6), 12);
  });

  it('b = 1/6 gives BF = 1 and log BF = 0 for any data', () => {
    for (const [m, k] of [[10, 0], [10, 5], [10, 10]]) {
      expect(logBayesFactor({ b: 1 / 6, m, k })).toBeCloseTo(0, 12);
      expect(bayesFactor({ b: 1 / 6, m, k })).toBeCloseTo(1, 12);
    }
  });

  it('matches the explicitly labelled BF = 3^k 0.6^(m-k) at b = 0.5', () => {
    for (const [m, k] of [[6, 3], [10, 5], [10, 0], [20, 10]]) {
      expect(bayesFactor({ b: 0.5, m, k })).toBeCloseTo(3 ** k * 0.6 ** (m - k), 9);
    }
  });
});

describe('priorOdds and posteriorOdds', () => {
  it('priorOdds is theta/(1-theta) with explicit endpoints', () => {
    expect(priorOdds(0.5)).toBeCloseTo(1, 15);
    expect(priorOdds(0.25)).toBeCloseTo(1 / 3, 15);
    expect(priorOdds(0)).toBe(0);
    expect(priorOdds(1)).toBe(Infinity);
  });

  it('posteriorOdds = priorOdds * BF in the interior', () => {
    const theta = 0.5;
    const b = 0.5;
    const m = 6;
    const k = 3;
    expect(posteriorOdds({ theta, b, m, k })).toBeCloseTo(priorOdds(theta) * bayesFactor({ b, m, k }), 12);
  });

  it('posteriorOdds endpoints are explicit (0 and Infinity / throws on the undefined case)', () => {
    expect(posteriorOdds({ theta: 0, b: 0.5, m: 10, k: 5 })).toBe(0);
    expect(posteriorOdds({ theta: 1, b: 0.5, m: 10, k: 5 })).toBe(Infinity);
    expect(() => posteriorOdds({ theta: 1, b: 1, m: 10, k: 9 })).toThrow(RangeError);
  });
});


describe('predictive probabilities (law of total probability)', () => {
  it('face PMF has length 6 and sums to 1', () => {
    for (const params of [
      { theta: 0.5, b: 0.5, m: 0, k: 0 },
      { theta: 0.5, b: 0.5, m: 1, k: 1 },
      { theta: 0.7, b: 0.9, m: 10, k: 6 },
      { theta: 0.2, b: 0.3, m: 50, k: 3 },
    ]) {
      const pmf = predictiveNextFacePmf(params);
      expect(pmf).toHaveLength(6);
      for (const p of pmf) {
        expect(p).toBeGreaterThanOrEqual(0);
      }
      expect(sum(pmf)).toBeCloseTo(1, 12);
    }
  });

  it('P(next = 6) lies in [1/6, b]', () => {
    for (const b of [1 / 6, 0.3, 0.5, 0.8, 1]) {
      for (let k = 0; k <= 10; k += 1) {
        const p6 = predictiveNextSixProbability({ theta: 0.4, b, m: 10, k });
        expect(p6).toBeGreaterThanOrEqual(1 / 6 - 1e-12);
        expect(p6).toBeLessThanOrEqual(b + 1e-12);
      }
    }
  });

  it('before any data at theta = 0.5, b = 0.5 gives P(6) = 1/3', () => {
    expect(predictiveNextSixProbability({ theta: 0.5, b: 0.5, m: 0, k: 0 })).toBeCloseTo(1 / 3, 15);
    expect(predictiveNextFacePmf({ theta: 0.5, b: 0.5, m: 0, k: 0 })[5]).toBeCloseTo(1 / 3, 15);
  });

  it('after one six gives posterior 3/4 and P(next = 6) = 5/12', () => {
    const post = posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 1, k: 1 });
    expect(post).toBeCloseTo(3 / 4, 15);
    expect(predictiveNextSixProbability({ theta: 0.5, b: 0.5, m: 1, k: 1 })).toBeCloseTo(5 / 12, 15);
  });

  it('equals b*post + (1/6)*(1-post) directly', () => {
    const theta = 0.3;
    const b = 0.6;
    const m = 5;
    const k = 2;
    const post = posteriorLoadedGivenCount({ theta, b, m, k });
    const expected = b * post + (1 / 6) * (1 - post);
    expect(predictiveNextSixProbability({ theta, b, m, k })).toBeCloseTo(expected, 14);
    const pmf = predictiveNextFacePmf({ theta, b, m, k });
    const nonSix = ((1 - b) / 5) * post + (1 / 6) * (1 - post);
    for (let j = 0; j < 5; j += 1) {
      expect(pmf[j]).toBeCloseTo(nonSix, 14);
    }
    expect(pmf[5]).toBeCloseTo(expected, 14);
  });

  it('with no data the predictive equals the prior-predictive PMF (theta only)', () => {
    const pmf = predictiveNextFacePmf({ theta: 0.2, b: 0.9, m: 0, k: 0 });
    expect(pmf[5]).toBeCloseTo(0.9 * 0.2 + (1 / 6) * 0.8, 15);
  });
});

describe('dependenceGap66 (rolls independent only given the type)', () => {
  it('equals theta(1-theta)(b-1/6)^2 exactly for defaults theta = 0.5, b = 0.5', () => {
    // theta(1-theta) = 1/4, (b - 1/6)^2 = (1/3)^2 = 1/9, product = 1/36.
    const gap = Frac.mul(Frac.mul(Frac.make(1n, 2n), Frac.make(1n, 2n)), Frac.mul(Frac.make(1n, 3n), Frac.make(1n, 3n)));
    expect(Frac.eq(gap, Frac.make(1n, 36n))).toBe(true);
    expect(dependenceGap66({ theta: 0.5, b: 0.5 })).toBeCloseTo(Frac.toNumber(Frac.make(1n, 36n)), 15);
  });

  it('matches P(6,6) - P(6)^2 = 0.5*0.25 + 0.5/36 - (1/3)^2 at defaults', () => {
    const p66 = 0.5 * 0.25 + 0.5 / 36;
    const p6 = 1 / 3;
    // theta(1-theta)(b-1/6)^2 = 0.5 * 0.5 * (1/3)^2.
    expect(p66 - p6 * p6).toBeCloseTo(0.5 * 0.5 * (0.5 - 1 / 6) ** 2, 15);
    expect(dependenceGap66({ theta: 0.5, b: 0.5 })).toBeCloseTo(p66 - p6 * p6, 15);
  });

  it('is exactly 0 when the dice are identical (b = 1/6) or a type is impossible (theta in {0,1})', () => {
    expect(dependenceGap66({ theta: 0.5, b: 1 / 6 })).toBe(0);
    expect(dependenceGap66({ theta: 0, b: 0.5 })).toBe(0);
    expect(dependenceGap66({ theta: 1, b: 0.5 })).toBe(0);
  });

  it('is strictly positive for 0 < theta < 1 and b != 1/6', () => {
    for (const theta of [0.1, 0.5, 0.9]) {
      for (const b of [0.2, 0.5, 0.8, 1]) {
        expect(dependenceGap66({ theta, b })).toBeGreaterThan(0);
      }
    }
  });

  it('matches exact rational theta(1-theta)(b-1/6)^2 for b = 1/2, theta = 1/2', () => {
    const theta = Frac.make(1n, 2n);
    const offset = Frac.make(1n, 3n); // b - 1/6 = 1/2 - 1/6 = 1/3
    const expected = Frac.mul(Frac.mul(theta, Frac.make(1n, 2n)), Frac.mul(offset, offset));
    const actual = Frac.make(BigInt(Math.round(dependenceGap66({ theta: 0.5, b: 0.5 }) * 36)), 36n);
    expect(Frac.eq(expected, actual)).toBe(true);
  });
});


/**
 * Exact binomial coefficient C(n, k) as a BigInt.
 * @param {number} n Total.
 * @param {number} k Chosen.
 * @returns {bigint} C(n, k).
 */
function binom(n, k) {
  let result = 1n;
  for (let i = 0; i < k; i += 1) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return result;
}

/**
 * Exact Bayes factor at b = 1/2, theta = 1/2: BF = 3^k (3/5)^(m-k) = 3^m / 5^(m-k).
 * @param {number} m Number of rolls.
 * @param {number} k Number of sixes.
 * @returns {{num:bigint,den:bigint}} Exact Bayes factor fraction.
 */
function exactBFHalf(m, k) {
  return Frac.make(3n ** BigInt(m), 5n ** BigInt(m - k));
}

/**
 * Exact rational posterior for b = 1/2, theta = 1/2 as a fraction,
 * post = BF / (1 + BF).
 * @param {number} m Number of rolls.
 * @param {number} k Number of sixes.
 * @returns {{num:bigint,den:bigint}} Exact posterior fraction.
 */
function exactPostHalf(m, k) {
  const bf = exactBFHalf(m, k);
  return Frac.make(bf.num, bf.den + bf.num);
}

/**
 * Exact mixture weight P(K = k) = 0.5 Bin(m, 1/2)(k) + 0.5 Bin(m, 1/6)(k).
 * @param {number} m Number of rolls.
 * @param {number} k Number of sixes.
 * @returns {{num:bigint,den:bigint}} Exact mixture probability.
 */
function exactMix(m, k) {
  const coeff = Frac.make(binom(m, k), 1n);
  // Bin(m, 1/2)(k) = C(m, k) / 2^m.
  const binHalf = Frac.mul(coeff, Frac.make(1n, 2n ** BigInt(m)));
  // Bin(m, 1/6)(k) = C(m, k) * 5^(m - k) / 6^m.
  const binSixth = Frac.mul(coeff, Frac.make(5n ** BigInt(m - k), 6n ** BigInt(m)));
  return Frac.mul(Frac.make(1n, 2n), Frac.add(binHalf, binSixth));
}

describe('total expectation identity: sum_k P(K=k) post(k) = theta', () => {
  it('is exact (rational) for small m at theta = 0.5, b = 0.5', () => {
    for (const m of [1, 2, 3, 5, 8]) {
      let total = Frac.make(0n, 1n);
      for (let k = 0; k <= m; k += 1) {
        total = Frac.add(total, Frac.mul(exactMix(m, k), exactPostHalf(m, k)));
      }
      expect(Frac.eq(total, Frac.make(1n, 2n))).toBe(true);
    }
  });

  it('is within 1e-9 of theta for m = 1000 (float, theta = 0.5, b = 0.5)', () => {
    const m = 1000;
    const theta = 0.5;
    const b = 0.5;
    const loaded = binomialPmfArray(m, b);
    const fair = binomialPmfArray(m, 1 / 6);
    let total = 0;
    for (let k = 0; k <= m; k += 1) {
      const mix = theta * loaded[k] + (1 - theta) * fair[k];
      total += mix * posteriorLoadedGivenCount({ theta, b, m, k });
    }
    expect(total).toBeCloseTo(theta, 9);
  });
});


describe('sufficiency and sequential-vs-batch', () => {
  it('posterior depends only on the count of sixes, not the face order', () => {
    const theta = 0.4;
    const b = 0.5;
    const seqA = [6, 3, 6, 1, 6]; // 3 sixes
    const seqB = [6, 6, 6, 2, 4]; // 3 sixes, different order/faces
    let pa = theta;
    for (const face of seqA) {
      pa = updatePosteriorWithOneRoll({ priorTheta: pa, b, face });
    }
    let pb = theta;
    for (const face of seqB) {
      pb = updatePosteriorWithOneRoll({ priorTheta: pb, b, face });
    }
    const batch = posteriorLoadedGivenCount({ theta, b, m: 5, k: 3 });
    expect(pa).toBeCloseTo(batch, 12);
    expect(pb).toBeCloseTo(batch, 12);
  });

  it('sequential updating equals the batch posterior for a longer sequence', () => {
    const theta = 0.5;
    const b = 0.3;
    const rolls = [1, 6, 4, 6, 2, 6, 5, 3, 6, 6]; // 5 sixes in 10 rolls
    const k = rolls.filter((f) => f === 6).length;
    let sequential = theta;
    for (const face of rolls) {
      sequential = updatePosteriorWithOneRoll({ priorTheta: sequential, b, face });
    }
    expect(sequential).toBeCloseTo(posteriorLoadedGivenCount({ theta, b, m: rolls.length, k }), 12);
  });

  it('sequential updating is order-invariant (same count of sixes)', () => {
    const theta = 0.5;
    const b = 0.5;
    const orders = [
      [6, 6, 6, 1, 1],
      [1, 6, 1, 6, 6],
      [1, 1, 6, 6, 6],
      [6, 1, 6, 1, 6],
    ];
    const results = orders.map((rolls) => rolls.reduce(
      (prior, face) => updatePosteriorWithOneRoll({ priorTheta: prior, b, face }),
      theta,
    ));
    for (const r of results) {
      expect(r).toBeCloseTo(results[0], 12);
    }
    expect(results[0]).toBeCloseTo(posteriorLoadedGivenCount({ theta, b, m: 5, k: 3 }), 12);
  });

  it('sufficiency holds for the endpoint priors too', () => {
    let t0 = 0;
    for (const face of [6, 6, 1, 6]) {
      t0 = updatePosteriorWithOneRoll({ priorTheta: t0, b: 0.5, face });
    }
    expect(t0).toBe(0);
    let t1 = 1;
    for (const face of [1, 2, 3, 4]) {
      t1 = updatePosteriorWithOneRoll({ priorTheta: t1, b: 0.5, face });
    }
    expect(t1).toBe(1);
  });

  it('updatePosteriorWithOneRoll validates inputs', () => {
    expect(() => updatePosteriorWithOneRoll({ priorTheta: 0.5, b: 0.5, face: 0 })).toThrow(RangeError);
    expect(() => updatePosteriorWithOneRoll({ priorTheta: 0.5, b: 0.5, face: 7 })).toThrow(RangeError);
    expect(() => updatePosteriorWithOneRoll({ priorTheta: 1.5, b: 0.5, face: 6 })).toThrow(RangeError);
    expect(() => updatePosteriorWithOneRoll({ priorTheta: 0.5, b: 0.5, face: 3.5 })).toThrow(RangeError);
    expect(() => updatePosteriorWithOneRoll({ priorTheta: 1, b: 1, face: 3 })).toThrow(RangeError);
  });
});

describe('input validation', () => {
  it('rejects k > m and out-of-range counts', () => {
    expect(() => posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 3, k: 5 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 6000, k: 0 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 2.5, k: 1 })).toThrow(RangeError);
  });

  it('rejects out-of-range theta and b', () => {
    expect(() => posteriorLoadedGivenCount({ theta: -0.1, b: 0.5, m: 3, k: 1 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 1.1, b: 0.5, m: 3, k: 1 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 0.5, b: 0.1, m: 3, k: 1 })).toThrow(RangeError);
    expect(() => posteriorLoadedGivenCount({ theta: 0.5, b: 1.5, m: 3, k: 1 })).toThrow(RangeError);
  });

  it('rejects non-numeric inputs with TypeError', () => {
    expect(() => posteriorLoadedGivenCount({ theta: '0.5', b: 0.5, m: 3, k: 1 })).toThrow(TypeError);
    expect(() => logBayesFactor({ b: 0.5, m: 3, k: '1' })).toThrow(TypeError);
  });
});

