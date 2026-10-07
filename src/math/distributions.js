/**
 * Numerically stable probability mass functions for the discrete distributions
 * used by the casino attractions (Binomial counts, Geometric waiting times and
 * Poisson rare-event counts).
 *
 * This module is pure: no randomness, no simulation, no UI concerns and no
 * dependencies. It never builds large factorials or raw binomial coefficients
 * and never uses a `(1 - p)^n` recurrence for the Binomial, which underflows to
 * zero for the supported `n`. All returned values are unrounded numbers.
 *
 * Documented implementation limits (chosen to cover the roulette requirements
 * without unbounded allocation):
 * - Binomial: `n` is an integer in [0, 5000].
 * - Poisson: `lambda` is a finite number in [0, 5000]; `maxK` is an integer in
 *   [0, 10000].
 */

/** @type {number} Largest supported Binomial trial count. */
const MAX_BINOMIAL_N = 5000;
/** @type {number} Largest supported Poisson rate. */
const MAX_POISSON_LAMBDA = 5000;
/** @type {number} Largest supported Poisson truncation index. */
const MAX_POISSON_K = 10000;

/**
 * Kahan (compensated) summation of an array of numbers. Reduces the rounding
 * error accumulated while summing many relative weights, which keeps the
 * normalization of the mode-centred recurrences accurate.
 * @param {readonly number[]} values Numbers to sum.
 * @returns {number} The compensated sum.
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
 * Validate a probability parameter that must be a finite number in [a, b].
 * Rejects non-numbers with a TypeError and out-of-range values with a
 * RangeError; never coerces strings, clamps or rounds.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @returns {void}
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a finite number within [low, high].
 */
function assertProbabilityInRange(value, name, low, high) {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number, received ${typeof value}.`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite, received ${value}.`);
  }
  if (value < low || value > high) {
    throw new RangeError(`${name} must be within [${low}, ${high}], received ${value}.`);
  }
}

/**
 * Validate an integer parameter within an inclusive range.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @returns {void}
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not an integer within [low, high].
 */
function assertIntegerInRange(value, name, low, high) {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number, received ${typeof value}.`);
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer, received ${value}.`);
  }
  if (value < low || value > high) {
    throw new RangeError(`${name} must be within [${low}, ${high}], received ${value}.`);
  }
}
/**
 * Binomial PMF for `n` independent trials each with success probability `p`.
 *
 * Returns an array of length `n + 1` with `result[k] = P(X = k)` for
 * `k = 0, 1, ..., n`. The complete finite support is covered, so normalizing
 * the relative weights to sum to 1 is exact (up to floating-point rounding).
 *
 * Numerical method: mode-centred recurrence. The mode `m = floor((n + 1) * p)`
 * is clamped to [0, n] and assigned relative weight 1; lower and higher `k` are
 * filled using the adjacent-PMF ratios
 *   P(k + 1) / P(k) = ((n - k) / (k + 1)) * (p / (1 - p))
 *   P(k - 1) / P(k) = (k / (n - k + 1)) * ((1 - p) / p).
 * The weights are summed with compensated summation and divided out. Very small
 * tail probabilities may underflow to 0; central probabilities stay meaningful.
 *
 * @param {number} n Number of trials; integer in [0, 5000].
 * @param {number} p Success probability; finite number in [0, 1].
 * @returns {number[]} Array of length `n + 1` of unrounded probabilities.
 * @throws {TypeError} If `n` or `p` is not a number.
 * @throws {RangeError} If `n` is not an integer in [0, 5000] or `p` is not
 *   finite or is outside [0, 1].
 */
export function binomialPmfArray(n, p) {
  assertIntegerInRange(n, 'binomialPmfArray n', 0, MAX_BINOMIAL_N);
  assertProbabilityInRange(p, 'binomialPmfArray p', 0, 1);

  // Explicit endpoints: no recurrence needed.
  if (n === 0) {
    return [1];
  }
  if (p === 0) {
    const result = new Array(n + 1).fill(0);
    result[0] = 1;
    return result;
  }
  if (p === 1) {
    const result = new Array(n + 1).fill(0);
    result[n] = 1;
    return result;
  }

  const mode = Math.min(n, Math.max(0, Math.floor((n + 1) * p)));
  const weights = new Array(n + 1).fill(0);
  weights[mode] = 1;

  const ratioUp = p / (1 - p); // P(k + 1) / P(k) = ((n - k) / (k + 1)) * ratioUp
  const ratioDown = (1 - p) / p; // P(k - 1) / P(k) = (k / (n - k + 1)) * ratioDown

  // Extend toward higher k from the mode.
  for (let k = mode; k < n; k += 1) {
    weights[k + 1] = weights[k] * ((n - k) / (k + 1)) * ratioUp;
  }
  // Extend toward lower k from the mode.
  for (let k = mode; k > 0; k -= 1) {
    weights[k - 1] = weights[k] * (k / (n - k + 1)) * ratioDown;
  }

  const total = compensatedSum(weights);
  return weights.map((weight) => weight / total);
}

/**
 * Geometric PMF for the number of trials until the first success.
 *
 * Convention: `T` is the trial index of the first success, so the support is
 * `1, 2, 3, ...` and `geometricPmf(k, p) = P(T = k) = (1 - p)^(k - 1) * p`.
 *
 * Numerical method: computed as `exp((k - 1) * log1p(-p)) * p`, using
 * `log1p(-p)` to avoid cancellation when `p` is tiny. `p = 1` is handled
 * explicitly (mass 1 at `k = 1`).
 *
 * @param {number} k Trial index; positive safe integer.
 * @param {number} p Success probability; finite number in (0, 1].
 * @returns {number} Unrounded probability `P(T = k)`.
 * @throws {TypeError} If `k` or `p` is not a number.
 * @throws {RangeError} If `k` is not a positive safe integer or `p` is not
 *   finite and within (0, 1].
 */
export function geometricPmf(k, p) {
  assertIntegerInRange(k, 'geometricPmf k', 1, Number.MAX_SAFE_INTEGER);
  assertProbabilityInRange(p, 'geometricPmf p', Number.MIN_VALUE, 1);

  if (p === 1) {
    return k === 1 ? 1 : 0;
  }
  return Math.exp((k - 1) * Math.log1p(-p)) * p;
}

/**
 * Geometric tail probability `P(T > k)`.
 *
 * Convention: `T` is the number of trials until the first success (support
 * `1, 2, 3, ...`), so `geometricTail(k, p) = P(T > k) = (1 - p)^k`.
 * For `k = 0` the tail is 1. The tail function will later support honest
 * reporting of waiting-time truncation/censoring; no truncation policy or
 * simulation is implemented here.
 *
 * Numerical method: `exp(k * log1p(-p))`. `p = 1` is handled explicitly
 * (`k = 0` gives 1, later values give 0).
 *
 * @param {number} k Threshold; nonnegative safe integer.
 * @param {number} p Success probability; finite number in (0, 1].
 * @returns {number} Unrounded probability `P(T > k)`.
 * @throws {TypeError} If `k` or `p` is not a number.
 * @throws {RangeError} If `k` is not a nonnegative safe integer or `p` is not
 *   finite and within (0, 1].
 */
export function geometricTail(k, p) {
  assertIntegerInRange(k, 'geometricTail k', 0, Number.MAX_SAFE_INTEGER);
  assertProbabilityInRange(p, 'geometricTail p', Number.MIN_VALUE, 1);

  if (p === 1) {
    return k === 0 ? 1 : 0;
  }
  return Math.exp(k * Math.log1p(-p));
}

/**
 * Geometric mean waiting time `E[T] = 1 / p`.
 *
 * `p = 0` is rejected: under this API there is no finite waiting-time
 * distribution or mean when the success probability is zero.
 *
 * @param {number} p Success probability; finite number in (0, 1].
 * @returns {number} Unrounded mean `1 / p`.
 * @throws {TypeError} If `p` is not a number.
 * @throws {RangeError} If `p` is not finite and within (0, 1].
 */
export function geometricMean(p) {
  assertProbabilityInRange(p, 'geometricMean p', Number.MIN_VALUE, 1);
  return 1 / p;
}
/**
 * Poisson PMF over a finite index range `0, 1, ..., maxK`.
 *
 * Returns an array of length `maxK + 1` with `result[k] = P(X = k)`. The
 * Poisson distribution has infinite support, so this array is a PARTIAL
 * distribution: probability mass beyond `maxK` is real and is deliberately
 * omitted, not renormalized. The returned values therefore need not sum to 1
 * (their sum is `P(X <= maxK)`), and very small probabilities may underflow
 * to 0.
 *
 * Numerical method: mode-centred in log space. The mode `m = floor(lambda)` is
 * computed as `log P(m) = -lambda + m * log(lambda) - log(m!)`, where
 * `log(m!)` is a bounded sum of `log(j)` (never a factorial). Probabilities are
 * extended with `P(k + 1) = P(k) * lambda / (k + 1)` and
 * `P(k - 1) = P(k) * k / lambda`. This works even when `maxK` is below the
 * mode: the lower tail is computed directly down to `k = 0`. It also avoids
 * the `exp(-lambda)` underflow that would wipe out central probabilities for
 * large `lambda`.
 *
 * @param {number} lambda Rate; finite number in [0, 5000].
 * @param {number} maxK Highest index to return; integer in [0, 10000].
 * @returns {number[]} Array of length `maxK + 1` of unrounded probabilities.
 * @throws {TypeError} If `lambda` or `maxK` is not a number.
 * @throws {RangeError} If `lambda` is not finite or is outside [0, 5000], or
 *   `maxK` is not an integer in [0, 10000].
 */
export function poissonPmfArray(lambda, maxK) {
  assertProbabilityInRange(lambda, 'poissonPmfArray lambda', 0, MAX_POISSON_LAMBDA);
  assertIntegerInRange(maxK, 'poissonPmfArray maxK', 0, MAX_POISSON_K);

  const result = new Array(maxK + 1).fill(0);

  if (lambda === 0) {
    // All mass sits at k = 0.
    result[0] = 1;
    return result;
  }

  const mode = Math.floor(lambda);

  // log P(k) = -lambda + k * log(lambda) - log(k!), with log(k!) a bounded sum
  // of logs (never a factorial). This is exact at the mode and used directly to
  // seed the recurrence when the requested range is entirely below the mode.
  const logProbabilityAt = (k) => -lambda + k * Math.log(lambda) - logFactorialUpTo(k);

  // Extend toward higher k from the mode, within the requested range only.
  if (mode <= maxK) {
    result[mode] = Math.exp(logProbabilityAt(mode));
    for (let k = mode; k < maxK; k += 1) {
      result[k + 1] = result[k] * (lambda / (k + 1));
    }
  }

  // Extend toward lower k from the mode down to 0, so the correct lower
  // probabilities are obtained even when maxK is below the mode.
  const downwardStart = Math.min(mode, maxK);
  if (downwardStart < mode) {
    // maxK is below the mode: seed the value at maxK directly in log space.
    result[downwardStart] = Math.exp(logProbabilityAt(downwardStart));
  }
  for (let k = downwardStart; k > 0; k -= 1) {
    result[k - 1] = result[k] * (k / lambda);
  }

  return result;
}

/**
 * `log(k!)` as a bounded sum of logs (no factorial). Used to seed the Poisson
 * recurrence when the requested range does not contain the mode.
 * @param {number} k Nonnegative integer.
 * @returns {number} `log(k!)`.
 */
function logFactorialUpTo(k) {
  let total = 0;
  for (let j = 2; j <= k; j += 1) {
    total += Math.log(j);
  }
  return total;
}



