import { binomialPmfArray, poissonPmfArray } from './distributions.js';

/** Target maximum number of contiguous buckets in the central window. */
const MAX_CENTRAL_BUCKETS = 40;
/** Maximum theoretical mass allowed in each excluded tail (Binomial). */
const TAIL_MASS_TOLERANCE = 1e-6;
/** Tolerance for clamping tiny floating-point excursions around 0 and 1. */
const SUM_TOLERANCE = 1e-9;

/**
 * Assert an integer within an inclusive range.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @throws {TypeError|RangeError}
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
 * Validate the empirical histogram: an array of length `spins + 1` of
 * nonnegative integers summing to `experiments`.
 * @param {unknown} histogram Candidate histogram.
 * @param {number} spins Spins per experiment.
 * @param {number} experiments Number of experiments.
 * @throws {TypeError|RangeError}
 */
function assertHistogram(histogram, spins, experiments) {
  if (!Array.isArray(histogram)) {
    throw new TypeError('countHistogram must be an array.');
  }
  if (histogram.length !== spins + 1) {
    throw new RangeError(
      `countHistogram must have length ${spins + 1}, received ${histogram.length}.`,
    );
  }
  let total = 0;
  for (const value of histogram) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new RangeError('countHistogram entries must be nonnegative integers.');
    }
    total += value;
  }
  if (total !== experiments) {
    throw new RangeError(
      `countHistogram must sum to experiments (${experiments}), received ${total}.`,
    );
  }
}

/**
 * Sum an inclusive integer range of an array of probabilities.
 * @param {readonly number[]} values Source values.
 * @param {number} low Inclusive lower index.
 * @param {number} high Inclusive upper index.
 * @returns {number} The sum over [low, high] (0 if empty).
 */
function sumRange(values, low, high) {
  let total = 0;
  for (let k = low; k <= high; k += 1) {
    total += values[k];
  }
  return total;
}

/**
 * Label a bucket's inclusive range using the documented notation.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @param {number} maxPocket Highest possible count (spins).
 * @returns {string} The label.
 */
function bucketLabel(low, high, maxPocket) {
  if (low === high) return String(low);
  if (low <= 0) return `≤${high}`;
  if (high >= maxPocket) return `≥${low}`;
  return `${low}–${high}`;
}

/**
 * Choose the central display window [lo, hi] so at most ~1e-6 Binomial mass is
 * left in each excluded tail, then expand it to include every count with
 * nonzero empirical frequency so no observed outlier is hidden.
 *
 * @param {readonly number[]} binomial Binomial PMF array (length spins + 1).
 * @param {readonly number[]} empirical Empirical histogram.
 * @param {number} spins Spins per experiment.
 * @returns {{ low: number, high: number }} The inclusive window bounds.
 */
function chooseWindow(binomial, empirical, spins) {
  let low = 0;
  let high = spins;

  // Trim the lower tail while it holds negligible Binomial mass.
  let lowerTail = 0;
  while (low < high && lowerTail + binomial[low] <= TAIL_MASS_TOLERANCE) {
    lowerTail += binomial[low];
    low += 1;
  }

  // Trim the upper tail while it holds negligible Binomial mass.
  let upperTail = 0;
  while (high > low && upperTail + binomial[high] <= TAIL_MASS_TOLERANCE) {
    upperTail += binomial[high];
    high -= 1;
  }

  // Expand to include every count with nonzero empirical frequency.
  for (let k = 0; k <= spins; k += 1) {
    if (empirical[k] > 0) {
      if (k < low) low = k;
      if (k > high) high = k;
    }
  }

  return { low, high };
}

/**
 * Build one bucket from an inclusive integer range.
 *
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @param {number} spins Spins per experiment (for label/tail detection).
 * @param {readonly number[]} histogram Empirical histogram.
 * @param {readonly number[]} binomial Binomial PMF array.
 * @param {number} experiments Number of experiments.
 * @param {{ isLowerTail?: boolean, isUpperTail?: boolean }} flags Tail flags.
 * @returns {object} The bucket.
 */
function makeBucket(low, high, spins, histogram, binomial, experiments, flags) {
  const empiricalCount = sumRange(histogram, low, high);
  return {
    label: bucketLabel(low, high, spins),
    low,
    high,
    isLowerTail: Boolean(flags.isLowerTail),
    isUpperTail: Boolean(flags.isUpperTail),
    isPoissonBeyondN: false,
    empiricalProbability: empiricalCount / experiments,
    empiricalCount,
    binomialProbability: sumRange(binomial, low, high),
    poissonProbability: 0,
  };
}

/**
 * Build explicit bucket data comparing the empirical event-count distribution
 * with the exact Binomial(n, p) and (optionally) the Poisson(n·p) approximation.
 *
 * This is a pure transformation: no React, randomness, formatting or chart
 * imports. Every count in 0..n belongs to exactly one bucket, and each bucket
 * carries the full-precision total mass of its actual integer range (these are
 * discrete probability masses, never densities, so values are not divided by
 * bucket width).
 *
 * @param {object} params
 * @param {number} params.spins Spins per experiment (n); integer in [0, 5000].
 * @param {number} params.experiments Number of experiments (N); integer ≥ 1.
 * @param {number[]} params.countHistogram Empirical counts, length n+1.
 * @param {number} params.probability Single-spin event probability p in [0, 1].
 * @param {boolean} [params.includePoisson] Include the Poisson approximation and
 *   its explicit "> n" tail bucket (rare events only). Defaults to false.
 * @returns {{
 *   spins: number, experiments: number, probability: number,
 *   includePoisson: boolean, grouped: boolean,
 *   buckets: Array<object>,
 * }} Chart data and explanatory metadata.
 * @throws {TypeError|RangeError} If any input is invalid.
 */
export function buildRouletteCountChartData({
  spins,
  experiments,
  countHistogram,
  probability,
  includePoisson = false,
}) {
  assertIntegerInRange(spins, 'spins', 0, 5000);
  assertIntegerInRange(experiments, 'experiments', 1, Number.MAX_SAFE_INTEGER);
  if (typeof probability !== 'number' || !Number.isFinite(probability)) {
    throw new TypeError('probability must be a finite number.');
  }
  if (probability < 0 || probability > 1) {
    throw new RangeError(`probability must be within [0, 1], received ${probability}.`);
  }
  if (typeof includePoisson !== 'boolean') {
    throw new TypeError('includePoisson must be a boolean.');
  }
  assertHistogram(countHistogram, spins, experiments);

  const binomial = binomialPmfArray(spins, probability);
  const { low, high } = chooseWindow(binomial, countHistogram, spins);

  const bucketSize = Math.max(1, Math.ceil((high - low + 1) / MAX_CENTRAL_BUCKETS));
  const buckets = [];

  // Lower tail bucket (only if a portion of 0..n remains below the window).
  if (low > 0) {
    buckets.push(
      makeBucket(0, low - 1, spins, countHistogram, binomial, experiments, {
        isLowerTail: true,
      }),
    );
  }

  // Central window, partitioned into contiguous integer buckets.
  for (let start = low; start <= high; start += bucketSize) {
    const end = Math.min(high, start + bucketSize - 1);
    buckets.push(makeBucket(start, end, spins, countHistogram, binomial, experiments, {}));
  }

  // Upper tail bucket (only if a portion of 0..n remains above the window).
  if (high < spins) {
    buckets.push(
      makeBucket(high + 1, spins, spins, countHistogram, binomial, experiments, {
        isUpperTail: true,
      }),
    );
  }

  // Poisson "> n" category (rare events only): Binomial and empirical are 0
  // there; Poisson genuinely places mass beyond n.
  if (includePoisson) {
    const poisson = poissonPmfArray(spins * probability, spins);
    const insideSum = poisson.reduce((acc, value) => acc + value, 0);
    let beyond = 1 - insideSum;
    if (beyond < 0 && beyond > -SUM_TOLERANCE) beyond = 0;

    for (const bucket of buckets) {
      bucket.poissonProbability = sumRange(poisson, bucket.low, bucket.high);
    }

    buckets.push({
      label: `> ${spins}`,
      low: spins + 1,
      high: Infinity,
      isLowerTail: false,
      isUpperTail: false,
      isPoissonBeyondN: true,
      empiricalProbability: 0,
      empiricalCount: 0,
      binomialProbability: 0,
      poissonProbability: beyond,
    });
  }

  return {
    spins,
    experiments,
    probability,
    includePoisson,
    grouped: bucketSize > 1,
    buckets,
  };
}


