/**
 * House Edge of a single-unit red bet on European roulette: exact constants,
 * distribution PMFs/CDFs for the per-play profit W and the session total T,
 * the continuity-corrected normal approximation on the step-2 lattice, the
 * Kolmogorov distance and the Berry–Esseen bound.
 *
 * Game (fixed, matches `docs/specs/house-edge.md` v2, no en prison / La Partage):
 * - Win (+1) with p = 18/37
 * - Lose (−1) with q = 19/37 (18 black + the single zero)
 *
 * This module is pure: no randomness, no simulation, no React and no new
 * dependencies. Exact quantities are exposed as reduced BigInt fractions
 * `{ num, den }` together with float mirrors, so callers can choose exact
 * rational comparison or numeric use. Float helpers reuse `binomialPmfArray`
 * for `n <= 5000`; for larger `n` (the House Edge UI allows up to 20 000) an
 * internal mode-centred recurrence is used so the complete support still sums
 * to 1 within floating-point tolerance.
 */

import { binomialPmfArray } from './distributions.js';

/** @type {number} Success probability of a red bet, 18/37. */
const P = 18 / 37;
/** @type {number} Failure probability of a red bet, 19/37. */
const Q = 19 / 37;
/** @type {number} Player expected profit per unit bet, −1/37. */
const PLAYER_EV = -1 / 37;
/** @type {number} Variance of the per-play profit W, 1368/1369. */
const VAR_W = 1368 / 1369;
/** Largest `n` handled by the shared `binomialPmfArray` helper. */
const SHARED_BINOMIAL_LIMIT = 5000;

/**
 * Greatest common divisor of two BigInts (Euclid). Signs are removed.
 * @param {bigint} a First integer.
 * @param {bigint} b Second integer.
 * @returns {bigint} Nonnegative gcd.
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Build a reduced fraction `{ num, den }` with a positive denominator.
 * @param {bigint} num Numerator.
 * @param {bigint} den Denominator (nonzero).
 * @returns {{ num: bigint, den: bigint }} Reduced fraction.
 */
function makeFraction(num, den) {
  if (den === 0n) {
    throw new RangeError('Fraction denominator must be nonzero.');
  }
  const sign = den < 0n ? -1n : 1n;
  const g = gcdBigInt(num, den) || 1n;
  return { num: (sign * num) / g, den: (sign * den) / g };
}

/**
 * Exact House Edge constants for a single-unit red bet, plus float mirrors.
 *
 * Exact members are reduced BigInt fractions `{ num, den }`; their `*Value`
 * counterparts are the same quantities as unrounded numbers.
 *
 * @returns {{
 *   p: { num: bigint, den: bigint },
 *   q: { num: bigint, den: bigint },
 *   houseEdge: { num: bigint, den: bigint },
 *   playerEv: { num: bigint, den: bigint },
 *   varW: { num: bigint, den: bigint },
 *   pValue: number, qValue: number, houseEdgeValue: number,
 *   playerEvValue: number, varWValue: number,
 * }} House Edge constants.
 */
export function getHouseEdgeConstants() {
  return {
    p: makeFraction(18n, 37n),
    q: makeFraction(19n, 37n),
    houseEdge: makeFraction(1n, 37n),
    playerEv: makeFraction(-1n, 37n),
    varW: makeFraction(1368n, 1369n),
    pValue: P,
    qValue: Q,
    houseEdgeValue: 1 / 37,
    playerEvValue: PLAYER_EV,
    varWValue: VAR_W,
  };
}

/**
 * Two-point PMF of the single-play profit W on {+1, −1}.
 * @returns {Array<{ value: number, prob: number, probFraction: { num: bigint, den: bigint } }>}
 *   Two entries: `+1` with 18/37 and `−1` with 19/37. Each carries the exact
 *   probability as a reduced BigInt fraction.
 */
export function pmfW() {
  return [
    { value: 1, prob: P, probFraction: makeFraction(18n, 37n) },
    { value: -1, prob: Q, probFraction: makeFraction(19n, 37n) },
  ];
}

/**
 * Kahan (compensated) summation of an array of numbers.
 * @param {readonly number[]} values Numbers to sum.
 * @returns {number} Compensated sum.
 */
function compensatedSum(values) {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const y = value - compensation;
    const t = sum + y;
    compensation = t - sum - y;
    sum = t;
  }
  return sum;
}

/**
 * Binomial PMF for `X ~ Bin(n, 18/37)`, the number of winning plays.
 *
 * Reuses `binomialPmfArray` for `n <= 5000`. For larger `n` (up to the House
 * Edge UI maximum of 20 000) an internal mode-centred recurrence is used: the
 * mode weight is seeded from log-space via a bounded `logGamma` (Lanczos) and
 * the remaining weights follow the adjacent-PMF ratios, then the complete
 * finite support is normalized with compensated summation. No factorials or
 * raw binomial coefficients are ever built.
 *
 * @param {number} n Number of independent plays; nonnegative integer.
 * @returns {number[]} Array of length `n + 1` with `result[k] = P(X = k)`.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a nonnegative integer.
 */
export function binomialWinPmf(n) {
  if (typeof n !== 'number') {
    throw new TypeError(`binomialWinPmf n must be a number, received ${typeof n}.`);
  }
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`binomialWinPmf n must be a nonnegative integer, received ${n}.`);
  }

  if (n <= SHARED_BINOMIAL_LIMIT) {
    return binomialPmfArray(n, P);
  }

  // Mode-centred recurrence for large n.
  const mode = Math.min(n, Math.max(0, Math.floor((n + 1) * P)));
  const weights = new Array(n + 1).fill(0);
  weights[mode] = Math.exp(
    logCombination(n, mode) + mode * Math.log(P) + (n - mode) * Math.log1p(-P),
  );

  const ratioUp = P / (1 - P);
  const ratioDown = (1 - P) / P;
  for (let k = mode; k < n; k += 1) {
    weights[k + 1] = weights[k] * ((n - k) / (k + 1)) * ratioUp;
  }
  for (let k = mode; k > 0; k -= 1) {
    weights[k - 1] = weights[k] * (k / (n - k + 1)) * ratioDown;
  }

  const total = compensatedSum(weights);
  return weights.map((weight) => weight / total);
}

/**
 * `log(n choose k)` via `logGamma`, without building any factorial or raw
 * binomial coefficient. Used only to seed the large-n recurrence at the mode.
 * @param {number} n Total trials.
 * @param {number} k Selected count.
 * @returns {number} Natural log of the binomial coefficient.
 */
function logCombination(n, k) {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Natural log of the gamma function (Lanczos approximation, g = 7, 9 terms),
 * accurate to ~1e-15 for real arguments. Sufficient for seeding a probability
 * recurrence; it is not used for the small-`n` path.
 * @param {number} x Positive real argument.
 * @returns {number} `log(Gamma(x))`.
 */
function logGamma(x) {
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula keeps the argument in the accurate region.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let series = coefficients[0];
  for (let i = 1; i < coefficients.length; i += 1) {
    series += coefficients[i] / (z + i);
  }
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

/**
 * PMF of the session total profit `T = 2X − n` on the step-2 lattice, where
 * `X ~ Bin(n, 18/37)`. The support is `{−n, −n + 2, …, n}`.
 * @param {number} n Number of independent plays; nonnegative integer.
 * @returns {Array<{ t: number, prob: number }>} One entry per lattice point,
 *   ordered from `−n` to `n` in steps of 2.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a nonnegative integer.
 */
export function pmfTFromBinomial(n) {
  const pmfX = binomialWinPmf(n);
  const result = new Array(n + 1);
  for (let k = 0; k <= n; k += 1) {
    result[k] = { t: 2 * k - n, prob: pmfX[k] };
  }
  return result;
}

/**
 * Exact CDF of `T = 2X − n` from the binomial PMF. The returned function
 * evaluates `P(T <= t)` by flooring `t` to the nearest lattice point at or
 * below it (the support has step 2), so a non-lattice argument is handled the
 * same as the lattice value just below it.
 * @param {number} n Number of independent plays; nonnegative integer.
 * @returns {(t: number) => number} Exact cumulative probability `P(T <= t)`.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a nonnegative integer.
 */
export function cdfTExact(n) {
  const pmfX = binomialWinPmf(n);

  // Cumulative sum of the binomial PMF: cumulative[k] = P(X <= k) = P(T <= 2k-n).
  const cumulative = new Array(n + 1);
  let running = 0;
  for (let k = 0; k <= n; k += 1) {
    running += pmfX[k];
    cumulative[k] = running;
  }

  return (t) => {
    if (!Number.isFinite(t)) {
      if (t === Infinity) return 1;
      return 0; // -Infinity or NaN treated as below the support.
    }
    if (t < -n) return 0;
    if (t >= n) return 1;
    // Largest lattice index k with 2k - n <= t.
    const k = Math.floor((t + n) / 2);
    if (k < 0) return 0;
    if (k >= n) return 1;
    return cumulative[k];
  };
}

/**
 * Mean of the session total profit, `mu = -n/37`.
 * @param {number} n Number of independent plays.
 * @returns {number} `mu`.
 */
function totalMean(n) {
  return -n / 37;
}

/**
 * Standard deviation of the session total profit, `sigma = sqrt(1368 n / 1369)`.
 * @param {number} n Number of independent plays.
 * @returns {number} `sigma`.
 */
function totalSigma(n) {
  return Math.sqrt((1368 * n) / 1369);
}

/**
 * Continuity-corrected normal CDF of the session total profit.
 *
 * `P(T <= t) ~ Phi((t + 1 - mu) / sigma)`. The correction is `+1` (not the
 * usual `+0.5`) because adjacent lattice values differ by 2.
 * @param {number} n Number of independent plays; nonnegative integer.
 * @returns {(t: number) => number} Approximate cumulative probability.
 */
export function cdfTNormalContinuityCorrected(n) {
  const mu = totalMean(n);
  const sigma = totalSigma(n);
  return (t) => Phi((t + 1 - mu) / sigma);
}

/**
 * Continuity-corrected normal probability of one lattice point,
 * `Phi((t + 1 - mu) / sigma) - Phi((t - 1 - mu) / sigma)`.
 * @param {{ t: number, mu: number, sigma: number }} args Lattice value and the
 *   mean/standard deviation of the total.
 * @returns {number} Approximate point probability.
 */
export function latticeNormalBinProbability({ t, mu, sigma }) {
  return Phi((t + 1 - mu) / sigma) - Phi((t - 1 - mu) / sigma);
}

/**
 * Kolmogorov distance (supremum absolute CDF difference) restricted to a grid:
 * `max_x |cdfA(x) - cdfB(x)|`. It is a discrete approximation of the true
 * supremum because it is evaluated only at the supplied points.
 * @param {{ cdfA: (x: number) => number, cdfB: (x: number) => number, grid: readonly number[] }} args
 *   Two CDFs and the evaluation grid.
 * @returns {number} The maximum absolute difference over the grid.
 * @throws {TypeError} If `cdfA`/`cdfB` are not functions.
 * @throws {RangeError} If `grid` is empty.
 */
export function kolmogorovDistanceOnGrid({ cdfA, cdfB, grid }) {
  if (typeof cdfA !== 'function' || typeof cdfB !== 'function') {
    throw new TypeError('kolmogorovDistanceOnGrid requires cdfA and cdfB functions.');
  }
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new RangeError('kolmogorovDistanceOnGrid requires a nonempty grid array.');
  }
  let max = 0;
  for (const x of grid) {
    const difference = Math.abs(cdfA(x) - cdfB(x));
    if (difference > max) max = difference;
  }
  return max;
}

/**
 * Berry–Esseen upper bound on the Kolmogorov distance between the standardized
 * total profit and the standard normal, `0.4748 / sqrt(n)`.
 *
 * This is an upper bound, not the actual error: the spec's `rho = E|W - E[W]|^3`
 * equals 1 for this two-point profit and `sigma_W^3 = 1`, so the general bound
 * `C rho / (sigma_W^3 sqrt(n))` reduces to `C / sqrt(n)` with `C <= 0.4748`.
 * @param {number} n Number of independent plays; positive.
 * @returns {number} The bound.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a positive integer.
 */
export function berryEsseenBound(n) {
  if (typeof n !== 'number') {
    throw new TypeError(`berryEsseenBound n must be a number, received ${typeof n}.`);
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`berryEsseenBound n must be a positive integer, received ${n}.`);
  }
  return 0.4748 / Math.sqrt(n);
}

/**
 * Standard normal probability density function, `phi(z) = exp(-z^2 / 2) / sqrt(2 pi)`.
 * @param {number} z Real argument.
 * @returns {number} Density value.
 */
export function phi(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal cumulative distribution function, `Phi(z)`.
 *
 * Implemented via the Abramowitz & Stegun 7.1.26 erf approximation (absolute
 * error < 1.5e-7), which keeps the module dependency-free and is more than
 * accurate enough for the continuity-corrected approximation and the
 * Kolmogorov distance checks. The relation used is
 * `Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))`.
 * @param {number} z Real argument.
 * @returns {number} Cumulative probability in [0, 1].
 */
export function Phi(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Error function via the Abramowitz & Stegun 7.1.26 approximation
 * (max absolute error 1.5e-7).
 * @param {number} x Real argument.
 * @returns {number} `erf(x)`.
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

