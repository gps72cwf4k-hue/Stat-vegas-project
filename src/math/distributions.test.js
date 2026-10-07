import { describe, it, expect } from 'vitest';
import {
  binomialPmfArray,
  geometricPmf,
  geometricTail,
  geometricMean,
  poissonPmfArray,
} from './distributions.js';
import { getRouletteProbabilities } from './roulette.js';

/** Roulette single-spin probabilities, reused as realistic Binomial p values. */
const { red: P_RED, green: P_GREEN } = getRouletteProbabilities();

/**
 * Independent reference for `log(k!)` built only from `Math.log` (no factorial).
 * Used to check Poisson values against an analytical formula.
 * @param {number} k Nonnegative integer.
 * @returns {number}
 */
function referenceLogFactorial(k) {
  let total = 0;
  for (let j = 2; j <= k; j += 1) total += Math.log(j);
  return total;
}

/**
 * Direct small-k Poisson formula `P(k) = exp(-lambda) * lambda^k / k!`,
 * independent of the module under test.
 * @param {number} k Index.
 * @param {number} lambda Rate.
 * @returns {number}
 */
function referencePoissonPmf(k, lambda) {
  return Math.exp(-lambda + k * Math.log(lambda) - referenceLogFactorial(k));
}

/** Sum of an array of numbers. @param {number[]} values @returns {number} */
function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

describe('binomialPmfArray — exact known values', () => {
  it('n = 0 returns the single-point mass [1]', () => {
    expect(binomialPmfArray(0, 0.3)).toEqual([1]);
    expect(binomialPmfArray(0, 0)).toEqual([1]);
    expect(binomialPmfArray(0, 1)).toEqual([1]);
  });

  it('p = 0 puts all mass at k = 0', () => {
    expect(binomialPmfArray(5, 0)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('p = 1 puts all mass at k = n', () => {
    expect(binomialPmfArray(4, 1)).toEqual([0, 0, 0, 0, 1]);
  });

  it('n = 2, p = 0.5 gives [0.25, 0.5, 0.25]', () => {
    expect(binomialPmfArray(2, 0.5)).toEqual([0.25, 0.5, 0.25]);
  });

  it('n = 3, p = 0.5 gives [0.125, 0.375, 0.375, 0.125]', () => {
    expect(binomialPmfArray(3, 0.5)).toEqual([0.125, 0.375, 0.375, 0.125]);
  });

  it('n = 1 agrees with the Bernoulli PMF [1 - p, p]', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      expect(binomialPmfArray(1, p)).toEqual([1 - p, p]);
    }
  });
});


describe('binomialPmfArray — structural properties for n = 0..100', () => {
  it.each([['red 18/37', P_RED], ['green 1/37', P_GREEN]])(
    'with realistic p (%s): length, nonnegativity, bound and total mass ≈ 1',
    (_label, p) => {
      for (let n = 0; n <= 100; n += 1) {
        const pmf = binomialPmfArray(n, p);

        expect(pmf).toHaveLength(n + 1);
        for (const value of pmf) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1 + 1e-12);
        }
        // Complete finite support: mass must close to 1 within 1e-12.
        expect(Math.abs(sum(pmf) - 1)).toBeLessThan(1e-12);
      }
    },
  );

  it('matches the analytic mean n*p and variance n*p*(1-p)', () => {
    const cases = [
      [10, 0.3],
      [50, P_RED],
      [50, P_GREEN],
      [100, 0.5],
    ];
    for (const [n, p] of cases) {
      const pmf = binomialPmfArray(n, p);
      const mean = pmf.reduce((acc, value, k) => acc + k * value, 0);
      const variance = pmf.reduce((acc, value, k) => acc + (k - n * p) ** 2 * value, 0);

      expect(mean).toBeCloseTo(n * p, 10);
      expect(variance).toBeCloseTo(n * p * (1 - p), 10);
    }
  });

  it('is symmetric about n/2 when p = 0.5', () => {
    const n = 20;
    const pmf = binomialPmfArray(n, 0.5);
    for (let k = 0; k <= n; k += 1) {
      expect(pmf[k]).toBeCloseTo(pmf[n - k], 12);
    }
  });
});

describe('binomialPmfArray — large n and extreme p', () => {
  it.each([['red 18/37', P_RED], ['green 1/37', P_GREEN]])(
    'n = 5000 with realistic p (%s): finite, nonneg, mass ≈ 1, mean/variance match',
    (_label, p) => {
      const n = 5000;
      const pmf = binomialPmfArray(n, p);

      expect(pmf).toHaveLength(n + 1);
      for (const value of pmf) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      // Documented floating-point tolerance for n = 5000.
      expect(sum(pmf)).toBeCloseTo(1, 12);

      const mean = pmf.reduce((acc, value, k) => acc + k * value, 0);
      const variance = pmf.reduce((acc, value, k) => acc + (k - n * p) ** 2 * value, 0);
      expect(mean).toBeCloseTo(n * p, 6);
      expect(variance).toBeCloseTo(n * p * (1 - p), 6);

      // Central mass must not vanish (the (1 - p)^n recurrence would underflow).
      expect(Math.max(...pmf)).toBeGreaterThan(0);
    },
  );

  it('handles a very small positive p (central mass preserved)', () => {
    const n = 5000;
    const p = 1e-6;
    const pmf = binomialPmfArray(n, p);

    expect(pmf).toHaveLength(n + 1);
    expect(sum(pmf)).toBeCloseTo(1, 12);
    // With n*p = 0.005 the mode prob ≈ exp(-0.005) ≈ 0.995.
    expect(pmf[0]).toBeCloseTo(Math.exp(-0.005), 6);
    const mean = pmf.reduce((acc, value, k) => acc + k * value, 0);
    expect(mean).toBeCloseTo(n * p, 6);
  });

  it('handles a p close to 1', () => {
    const n = 200;
    const p = 0.999;
    const pmf = binomialPmfArray(n, p);

    expect(sum(pmf)).toBeCloseTo(1, 12);
    const mean = pmf.reduce((acc, value, k) => acc + k * value, 0);
    const variance = pmf.reduce((acc, value, k) => acc + (k - n * p) ** 2 * value, 0);
    expect(mean).toBeCloseTo(n * p, 8);
    expect(variance).toBeCloseTo(n * p * (1 - p), 10);
  });
});

describe('geometric distribution', () => {
  it('p = 1 puts all mass at k = 1 (PMF), tail 1 at k = 0 then 0, mean 1', () => {
    expect(geometricPmf(1, 1)).toBe(1);
    for (const k of [2, 3, 100]) expect(geometricPmf(k, 1)).toBe(0);

    expect(geometricTail(0, 1)).toBe(1);
    for (const k of [1, 5, 1000]) expect(geometricTail(k, 1)).toBe(0);

    expect(geometricMean(1)).toBe(1);
  });

  it('p = 0.5 known PMF values: 0.5, 0.25, 0.125', () => {
    expect(geometricPmf(1, 0.5)).toBe(0.5);
    expect(geometricPmf(2, 0.5)).toBe(0.25);
    expect(geometricPmf(3, 0.5)).toBe(0.125);
  });

  it('tail at k = 0 is 1 and (p = 0.5) tail at k = 3 is 0.125', () => {
    expect(geometricTail(0, 0.5)).toBe(1);
    expect(geometricTail(3, 0.5)).toBeCloseTo(0.125, 12);
  });

  it('mean at p = 1/37 is approximately 37', () => {
    expect(geometricMean(P_GREEN)).toBeCloseTo(37, 10);
  });

  it('finite-support identity: sum_{k=1..K} PMF + tail(K) ≈ 1 (p = 1/37, K = 1000)', () => {
    const p = P_GREEN;
    const K = 1000;
    let prefix = 0;
    for (let k = 1; k <= K; k += 1) prefix += geometricPmf(k, p);

    // Tight tolerance: prefix + tail must close to 1.
    expect(prefix + geometricTail(K, p)).toBeCloseTo(1, 12);
  });

  it('returns finite nonnegative probabilities and a decreasing tail', () => {
    const p = P_RED;
    let previousTail = geometricTail(0, p);
    for (let k = 1; k <= 50; k += 1) {
      const pmf = geometricPmf(k, p);
      expect(Number.isFinite(pmf)).toBe(true);
      expect(pmf).toBeGreaterThanOrEqual(0);

      const tail = geometricTail(k, p);
      expect(Number.isFinite(tail)).toBe(true);
      expect(tail).toBeGreaterThanOrEqual(0);
      expect(tail).toBeLessThan(previousTail); // strictly decreasing
      previousTail = tail;
    }
  });

  it('PMF prefix alone does not sum to exactly 1 (finite truncation undercounts)', () => {
    const p = P_GREEN;
    let prefix = 0;
    for (let k = 1; k <= 10; k += 1) prefix += geometricPmf(k, p);
    expect(prefix).toBeLessThan(1);
  });
});

describe('geometric distribution — validation', () => {
  it('rejects non-number and invalid p', () => {
    for (const bad of ['0.5', null, undefined, NaN, Infinity, -Infinity]) {
      expect(() => geometricMean(bad)).toThrow();
    }
    expect(() => geometricMean(0)).toThrow(RangeError); // p = 0 rejected
    expect(() => geometricMean(-0.1)).toThrow(RangeError);
    expect(() => geometricMean(1.5)).toThrow(RangeError);
  });

  it('rejects invalid k values', () => {

describe('poissonPmfArray — known values', () => {
  it('lambda = 0 returns all mass at k = 0', () => {
    expect(poissonPmfArray(0, 0)).toEqual([1]);
    expect(poissonPmfArray(0, 4)).toEqual([1, 0, 0, 0, 0]);
  });

  it('lambda = 1: P(0) = P(1) = exp(-1), P(2) = exp(-1)/2', () => {
    const pmf = poissonPmfArray(1, 4);
    expect(pmf[0]).toBeCloseTo(Math.exp(-1), 12);
    expect(pmf[1]).toBeCloseTo(Math.exp(-1), 12);
    expect(pmf[2]).toBeCloseTo(Math.exp(-1) / 2, 12);
    expect(pmf[3]).toBeCloseTo(Math.exp(-1) / 6, 12);
  });

  it('lambda = 2: P(0) = exp(-2), P(1) = 2*exp(-2)', () => {
    const pmf = poissonPmfArray(2, 3);
    expect(pmf[0]).toBeCloseTo(Math.exp(-2), 12);
    expect(pmf[1]).toBeCloseTo(2 * Math.exp(-2), 12);
    expect(pmf[2]).toBeCloseTo(2 * Math.exp(-2), 12); // 4/2 * exp(-2)
  });

  it('truncation regression: lambda = 2, maxK = 0 returns [exp(-2)], not [1]', () => {
    expect(poissonPmfArray(2, 0)).toEqual([Math.exp(-2)]);
  });

  it('truncation below the mode: lambda = 10, maxK = 2, matches direct formulas', () => {
    const pmf = poissonPmfArray(10, 2);
    expect(pmf).toHaveLength(3);
    for (let k = 0; k <= 2; k += 1) {
      expect(pmf[k]).toBeCloseTo(referencePoissonPmf(k, 10), 12);
    }
  });
});

describe('poissonPmfArray — sweep, recurrence and tail omission', () => {
  const lambdaCases = [0.5, 1, 10, 5000 / 37];
  const upperBound = (lambda) => Math.ceil(lambda + 12 * Math.sqrt(lambda + 1) + 30);

  it.each(lambdaCases)('lambda = %s: finite, nonneg, recurrence holds, mass ≈ 1', (lambda) => {
    const maxK = upperBound(lambda);
    const pmf = poissonPmfArray(lambda, maxK);

    expect(pmf).toHaveLength(maxK + 1);
    for (const value of pmf) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    // Adjacent-recurrence check: P(k+1) = P(k) * lambda / (k+1).
    for (let k = 0; k < maxK; k += 1) {
      expect(pmf[k + 1]).toBeCloseTo(pmf[k] * (lambda / (k + 1)), 12);
    }

    // With a generous cutoff the omitted tail is negligible.
    expect(sum(pmf)).toBeCloseTo(1, 10);

    // Numerical mean and variance match lambda.
    const mean = pmf.reduce((acc, value, k) => acc + k * value, 0);
    const variance = pmf.reduce((acc, value, k) => acc + (k - lambda) ** 2 * value, 0);
    expect(mean).toBeCloseTo(lambda, 8);
    expect(variance).toBeCloseTo(lambda, 6);
  });

  it.each([1000, 5000])('large lambda = %s: central probabilities do not vanish', (lambda) => {
    const maxK = upperBound(lambda) + 100;
    const pmf = poissonPmfArray(lambda, maxK);

    // exp(-lambda) would underflow to 0; the log-space mode must stay meaningful.
    expect(pmf[lambda]).toBeGreaterThan(0);
    expect(Number.isFinite(pmf[lambda])).toBe(true);
    expect(sum(pmf)).toBeCloseTo(1, 8);
  });
});

describe('poissonPmfArray / binomialPmfArray — validation', () => {
  it('rejects non-number and invalid lambda', () => {
    for (const bad of ['1', null, undefined, NaN, Infinity, -Infinity]) {
      expect(() => poissonPmfArray(bad, 10)).toThrow();
    }
    expect(() => poissonPmfArray(-1, 10)).toThrow(RangeError);
    expect(() => poissonPmfArray(5001, 10)).toThrow(RangeError); // documented limit
  });

  it('rejects invalid maxK', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '2', null, undefined]) {
      expect(() => poissonPmfArray(1, bad)).toThrow();
    }
    expect(() => poissonPmfArray(1, 10001)).toThrow(RangeError); // documented limit
  });

  it('rejects invalid n and p for the Binomial', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '5', null, undefined]) {
      expect(() => binomialPmfArray(bad, 0.5)).toThrow();
    }
    expect(() => binomialPmfArray(5001, 0.5)).toThrow(RangeError); // documented limit
    for (const badP of ['0.5', NaN, Infinity, null, undefined, -0.1, 1.1]) {
      expect(() => binomialPmfArray(10, badP)).toThrow();
    }
  });
});

    for (const bad of [0, -1, 1.5, NaN, Infinity, '1', null, undefined]) {
      expect(() => geometricPmf(bad, 0.5)).toThrow();
    }
    for (const bad of [-1, 1.5, NaN, Infinity, '0', null, undefined]) {
      expect(() => geometricTail(bad, 0.5)).toThrow();
    }
    // k must be a safe integer.
    expect(() => geometricPmf(Number.MAX_SAFE_INTEGER + 2, 0.5)).toThrow(RangeError);
  });
});

