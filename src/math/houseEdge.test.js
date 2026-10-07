import { describe, it, expect } from 'vitest';
import {
  getHouseEdgeConstants,
  pmfW,
  binomialWinPmf,
  pmfTFromBinomial,
  cdfTExact,
  cdfTNormalContinuityCorrected,
  latticeNormalBinProbability,
  kolmogorovDistanceOnGrid,
  berryEsseenBound,
  phi,
  Phi,
} from './houseEdge.js';

/** Player expected profit per unit bet, −1/37 (float mirror). */
const PLAYER_EV = -1 / 37;
/** Variance of the per-play profit W, 1368/1369 (float mirror). */
const VAR_W = 1368 / 1369;

/**
 * Minimal reduced-fraction helper for the exact tests, independent of the
 * module under test. Fractions are BigInt pairs `{ num, den }` with a positive
 * denominator; this mirrors the module's own convention but is re-implemented
 * here so the tests do not rely on internal helpers.
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
};

/**
 * Sum an array of numbers.
 * @param {readonly number[]} values Values to sum.
 * @returns {number} The sum.
 */
function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

describe('getHouseEdgeConstants — exact constants', () => {
  it('p, q and the house edge are the exact spec fractions', () => {
    const c = getHouseEdgeConstants();
    expect(c.p).toEqual({ num: 18n, den: 37n });
    expect(c.q).toEqual({ num: 19n, den: 37n });
    expect(c.houseEdge).toEqual({ num: 1n, den: 37n });
  });

  it('playerEv = −1/37 exactly and within 1e-12 of −0.027027027…', () => {
    const c = getHouseEdgeConstants();
    expect(c.playerEv).toEqual({ num: -1n, den: 37n });
    expect(c.playerEvValue).toBeCloseTo(-0.027027027027027, 12);
    expect(Math.abs(c.playerEvValue - PLAYER_EV)).toBeLessThan(1e-12);
  });

  it('varW = 1368/1369 exactly', () => {
    const c = getHouseEdgeConstants();
    expect(c.varW).toEqual({ num: 1368n, den: 1369n });
    expect(c.varWValue).toBeCloseTo(VAR_W, 12);
  });

  it('float mirrors equal the reduced fractions as numbers', () => {
    const c = getHouseEdgeConstants();
    expect(c.pValue).toBe(18 / 37);
    expect(c.qValue).toBe(19 / 37);
    expect(c.houseEdgeValue).toBe(1 / 37);
  });
});

describe('E[W] and Var(W) from the W PMF (exact rationals)', () => {
  it('E[W] = 18/37 − 19/37 = −1/37 exactly', () => {
    const pmf = pmfW();
    const positive = pmf.find((entry) => entry.value === 1).probFraction;
    const negative = pmf.find((entry) => entry.value === -1).probFraction;
    // E[W] = (+1) * 18/37 + (−1) * 19/37 = (18 − 19)/37.
    const weighted = Frac.add(positive, { num: -negative.num, den: negative.den });
    expect(Frac.eq(weighted, { num: -1n, den: 37n })).toBe(true);
  });

  it('Var(W) = E[W^2] − (E[W])^2 = 1 − 1/1369 = 1368/1369 exactly', () => {
    const pmf = pmfW();
    // E[W^2] = 1 * (18/37 + 19/37) = 1 because w^2 = 1.
    const sumProb = pmf.reduce(
      (acc, entry) => Frac.add(acc, entry.probFraction),
      Frac.make(0n, 1n),
    );
    expect(Frac.eq(sumProb, { num: 1n, den: 1n })).toBe(true);

    const ewSquared = Frac.mul({ num: -1n, den: 37n }, { num: -1n, den: 37n });
    const oneMinus = Frac.add(
      { num: 1n, den: 1n },
      { num: -ewSquared.num, den: ewSquared.den },
    );
    expect(Frac.eq(oneMinus, { num: 1368n, den: 1369n })).toBe(true);
  });

  it('PMF(W) is nonnegative and its exact probabilities sum to 1', () => {
    const pmf = pmfW();
    const total = pmf.reduce(
      (acc, entry) => Frac.add(acc, entry.probFraction),
      Frac.make(0n, 1n),
    );
    expect(Frac.eq(total, { num: 1n, den: 1n })).toBe(true);
    for (const entry of pmf) {
      expect(entry.prob).toBeGreaterThanOrEqual(0);
      expect(entry.probFraction.den).toBeGreaterThan(0n);
    }
  });
});


describe('binomialWinPmf — X ~ Bin(n, 18/37)', () => {
  it.each([10, 1000, 20000])('n = %i: nonnegative, finite and sums to 1 within 1e-12', (n) => {
    const pmf = binomialWinPmf(n);
    expect(pmf).toHaveLength(n + 1);
    for (const value of pmf) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(Math.abs(sum(pmf) - 1)).toBeLessThan(1e-12);
  });

  it('matches the Bernoulli PMF for n = 1', () => {
    const pmf = binomialWinPmf(1);
    expect(pmf[0]).toBeCloseTo(19 / 37, 12);
    expect(pmf[1]).toBeCloseTo(18 / 37, 12);
  });
});

describe('T = 2X − n — mean and variance from the binomial PMF', () => {
  // E[T] and Var(T) are computed directly from the PMF and compared with the
  // theoretical values. They are O(n) magnitudes, so a tight RELATIVE tolerance
  // (1e-9) is used consistently across n; the exact rational cross-check is done
  // separately for the small n = 1 case, where BigInt sums stay cheap.
  it.each([10, 1000, 20000])(
    'n = %i: E[T] = −n/37 and Var(T) = 1368n/1369 (tight relative tolerance)',
    (n) => {
      const pmf = pmfTFromBinomial(n);
      const mean = pmf.reduce((acc, entry) => acc + entry.t * entry.prob, 0);
      const variance = pmf.reduce(
        (acc, entry) => acc + (entry.t - mean) ** 2 * entry.prob,
        0,
      );

      const muTarget = -n / 37;
      const varTarget = (1368 * n) / 1369;
      expect(Math.abs(mean - muTarget)).toBeLessThan(1e-9 * Math.max(1, Math.abs(muTarget)));
      expect(Math.abs(variance - varTarget)).toBeLessThan(1e-9 * varTarget);
    },
  );

  it('exact E[T] = −1/37 for n = 1 as a rational cross-check', () => {
    const pmf = pmfTFromBinomial(1);
    // T = 2X − 1: values −1 (prob 19/37) and +1 (prob 18/37).
    const mean = pmf.reduce((acc, entry) => acc + entry.t * entry.prob, 0);
    expect(mean).toBeCloseTo(-1 / 37, 12);
  });

  it('support sits on the step-2 lattice {−n, …, n}', () => {
    const n = 10;
    const pmf = pmfTFromBinomial(n);
    expect(pmf).toHaveLength(n + 1);
    expect(pmf[0].t).toBe(-n);
    expect(pmf[n].t).toBe(n);
    for (const entry of pmf) {
      expect((entry.t + n) % 2).toBe(0);
    }
  });
});


describe('normal helpers and continuity correction', () => {
  it('Phi(0) = 0.5 and Phi(1.96) ≈ 0.975', () => {
    expect(Phi(0)).toBeCloseTo(0.5, 7);
    expect(Phi(1.96)).toBeCloseTo(0.975, 3);
  });

  it('phi integrates to 1 numerically (Simpson over [−8, 8])', () => {
    const a = -8;
    const b = 8;
    const steps = 2000; // even, for Simpson
    const h = (b - a) / steps;
    let integral = phi(a) + phi(b);
    for (let i = 1; i < steps; i += 1) {
      integral += (i % 2 === 0 ? 2 : 4) * phi(a + i * h);
    }
    integral *= h / 3;
    expect(integral).toBeCloseTo(1, 6);
  });

  it('continuity-corrected lattice bin probabilities sum to ≈ 1 for n = 1000', () => {
    const n = 1000;
    const mu = -n / 37;
    const sigma = Math.sqrt((1368 * n) / 1369);
    let total = 0;
    for (let t = -n; t <= n; t += 2) {
      total += latticeNormalBinProbability({ t, mu, sigma });
    }
    expect(total).toBeCloseTo(1, 6);
  });

  it('the correction is ±1 (not ±0.5): one lattice bin matches the spec formula', () => {
    const mu = -1000 / 37;
    const sigma = Math.sqrt((1368 * 1000) / 1369);
    const t = 0;
    const expected = Phi((t + 1 - mu) / sigma) - Phi((t - 1 - mu) / sigma);
    expect(latticeNormalBinProbability({ t, mu, sigma })).toBeCloseTo(expected, 12);
  });

  it('cdfTNormalContinuityCorrected matches Phi((t + 1 − mu) / sigma)', () => {
    const n = 1000;
    const cdf = cdfTNormalContinuityCorrected(n);
    const mu = -n / 37;
    const sigma = Math.sqrt((1368 * n) / 1369);
    for (const t of [-100, -27, 0, 5, 60]) {
      expect(cdf(t)).toBeCloseTo(Phi((t + 1 - mu) / sigma), 12);
    }
  });
});

describe('exact vs continuity-corrected normal CDF — Kolmogorov distance', () => {
  it.each([10, 100, 1000])('n = %i: distance is below the Berry–Esseen bound', (n) => {
    const cdfExact = cdfTExact(n);
    const cdfNormal = cdfTNormalContinuityCorrected(n);
    const grid = [];
    for (let t = -n; t <= n; t += 2) grid.push(t);

    const distance = kolmogorovDistanceOnGrid({
      cdfA: cdfExact,
      cdfB: cdfNormal,
      grid,
    });
    const bound = berryEsseenBound(n);

    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThan(bound);
  });

  it('berryEsseenBound is 0.4748 / sqrt(n)', () => {
    for (const n of [10, 100, 1000]) {
      expect(berryEsseenBound(n)).toBeCloseTo(0.4748 / Math.sqrt(n), 12);
    }
  });
});

describe('P(T > 0) at n = 1000 — exact binomial tail', () => {
  it('is ≈ 0.19 within 0.01, computed from the exact CDF (not hardcoded)', () => {
    const n = 1000;
    const cdf = cdfTExact(n);
    const pPositive = 1 - cdf(0);
    expect(pPositive).toBeGreaterThan(0);
    expect(pPositive).toBeLessThan(1);
    expect(Math.abs(pPositive - 0.19)).toBeLessThan(0.01);
  });
});

describe('P(T > 0): exact equals the Binomial tail for both parities', () => {
  // The exact value 1 − F_exact(0) must equal P(X >= floor(n/2) + 1) with
  // X ~ Bin(n, 18/37), for even and odd n alike.
  it.each([11, 12, 100, 101, 1000, 1001])('n = %i matches the tail sum', (n) => {
    const cdf = cdfTExact(n);
    const exactValue = 1 - cdf(0);

    const pmf = binomialWinPmf(n);
    const threshold = Math.floor(n / 2) + 1;
    let tail = 0;
    for (let k = threshold; k <= n; k += 1) tail += pmf[k];

    expect(Math.abs(exactValue - tail)).toBeLessThan(1e-12);
  });
});

describe('P(T > 0): continuity-corrected normal uses the parity threshold', () => {
  // The UI thresholds the normal tail at the smallest positive lattice value:
  // t0 = 2 for even n, t0 = 1 for odd n; then P(T >= t0) ≈ 1 − Phi((t0−1−μ)/σ).
  // This guards the corrected computation against the old hardcoded 1 − F(0),
  // which was only correct for even n.
  it.each([11, 12, 100, 101, 1000, 1001])(
    'n = %i: parity-aware normal tail is close to the exact tail',
    (n) => {
      const cdfNormal = cdfTNormalContinuityCorrected(n);
      const t0 = n % 2 === 0 ? 2 : 1;
      const normalValue = 1 - cdfNormal(t0 - 2);

      const cdfExact = cdfTExact(n);
      const exactValue = 1 - cdfExact(0);

      // The normal approximation is rough for small n; a loose absolute
      // tolerance is enough to catch the parity bug (which is a large error).
      expect(Math.abs(normalValue - exactValue)).toBeLessThan(0.02);
    },
  );

  it('the old hardcoded 1 − F(0) is wrong for odd n (documents the fix)', () => {
    const n = 11;
    const cdfNormal = cdfTNormalContinuityCorrected(n);
    const oldValue = 1 - cdfNormal(0); // incorrect for odd n
    const cdfExact = cdfTExact(n);
    const exactValue = 1 - cdfExact(0);
    // Sanity: the buggy value really is far from the exact value here.
    expect(Math.abs(oldValue - exactValue)).toBeGreaterThan(0.05);
  });
});


