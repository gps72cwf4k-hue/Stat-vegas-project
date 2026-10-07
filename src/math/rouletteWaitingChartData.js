import { geometricTail, geometricMean } from './distributions.js';

/** Target maximum number of contiguous buckets in the visible window. */
const MAX_VISIBLE_BUCKETS = 40;
/** Upper tail mass allowed before cutting the visible window. */
const VISIBLE_TAIL_TOLERANCE = 1e-4;

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
 * Validate the first-hit histogram: length `spins + 1`, index 0 unused (0), all
 * entries nonnegative integers.
 * @param {unknown} histogram Candidate histogram.
 * @param {number} spins Spins per experiment.
 * @throws {TypeError|RangeError}
 */
function assertHistogram(histogram, spins) {
  if (!Array.isArray(histogram)) {
    throw new TypeError('firstHitHistogram must be an array.');
  }
  if (histogram.length !== spins + 1) {
    throw new RangeError(
      `firstHitHistogram must have length ${spins + 1}, received ${histogram.length}.`,
    );
  }
  if (histogram[0] !== 0) {
    throw new RangeError('firstHitHistogram index 0 must be 0 (unused).');
  }
  for (const value of histogram) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new RangeError('firstHitHistogram entries must be nonnegative integers.');
    }
  }
}

/**
 * Sum an inclusive integer range of an array.
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
 * Theoretical probability of an inclusive waiting-time range `P(a ≤ T ≤ b)`
 * via the stable tail difference `P(T > a-1) - P(T > b)`.
 * @param {number} low Inclusive lower bound (a ≥ 1).
 * @param {number} high Inclusive upper bound (b ≥ a).
 * @param {number} probability Success probability p in (0, 1].
 * @returns {number} The theoretical range probability.
 */
function theoreticalRangeProbability(low, high, probability) {
  if (high < low) return 0;
  return geometricTail(low - 1, probability) - geometricTail(high, probability);
}

/**
 * Expected value of `min(T, n)` for a Geometric(p) waiting time:
 * `E[min(T, n)] = (1 - (1 - p)^n) / p`, computed stably via
 * `-expm1(n * log1p(-p)) / p`, with an explicit `p = 1` endpoint (all mass at
 * T = 1, so the value is 1). Never exceeds n.
 *
 * @param {number} n Observation window; positive integer.
 * @param {number} probability Success probability p in (0, 1].
 * @returns {number} The restricted theoretical mean in spins.
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function restrictedGeometricMean(n, probability) {
  assertIntegerInRange(n, 'n', 1, Number.MAX_SAFE_INTEGER);
  if (typeof probability !== 'number' || !Number.isFinite(probability)) {
    throw new TypeError('probability must be a finite number.');
  }
  if (probability <= 0 || probability > 1) {
    throw new RangeError(`probability must be within (0, 1], received ${probability}.`);
  }
  if (probability === 1) return 1;
  return -Math.expm1(n * Math.log1p(-probability)) / probability;
}

/**
 * Label a bucket's inclusive range using the documented notation.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @param {number} spins Observation window.
 * @returns {string} The label.
 */
function bucketLabel(low, high, spins) {
  if (low > spins) return `> ${spins}`;
  if (low === high) return String(low);
  return `${low}–${high}`;
}

/**
 * Build explicit waiting-time bucket data comparing the empirical distribution
 * of the first-hit spin with the exact Geometric(p) law, including a separate
 * right-censored category for experiments with no hit within n spins.
 *
 * Pure transformation: no React, randomness, formatting or chart imports.
 * Values are discrete probability masses per bucket (never densities), computed
 * at full precision from all N experiments (the denominator is always N, never
 * only the experiments that had a success).
 *
 * Buckets: the visible range 1..h (h chosen from the Geometric tail and expanded
 * to include the largest observed first hit) is partitioned into at most ~40
 * contiguous integer buckets; if h < n an observed-tail bucket h+1..n follows;
 * a final "> n" censored bucket is always present. Observed buckets form a
 * complete nonoverlapping partition of 1..n.
 *
 * @param {object} params
 * @param {number} params.spins Spins per experiment (n); integer ≥ 1.
 * @param {number} params.experiments Number of experiments (N); integer ≥ 1.
 * @param {number[]} params.firstHitHistogram First-hit counts, length n+1.
 * @param {number} params.censoredCount Experiments with no hit within n spins.
 * @param {number} params.probability Single-spin event probability p in (0, 1].
 * @returns {{
 *   spins: number, experiments: number, probability: number, grouped: boolean,
 *   buckets: Array<object>,
 *   observedExperiments: number, censoredCount: number,
 *   empiricalCensoredFraction: number, theoreticalCensoredProbability: number,
 *   empiricalRestrictedMean: number, theoreticalRestrictedMean: number,
 *   fullMean: number,
 * }} Chart data and numeric summaries.
 * @throws {TypeError|RangeError} If any input is invalid.
 */
export function buildRouletteWaitingChartData({
  spins,
  experiments,
  firstHitHistogram,
  censoredCount,
  probability,
}) {
  assertIntegerInRange(spins, 'spins', 1, 5000);
  assertIntegerInRange(experiments, 'experiments', 1, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(censoredCount, 'censoredCount', 0, Number.MAX_SAFE_INTEGER);
  if (typeof probability !== 'number' || !Number.isFinite(probability)) {
    throw new TypeError('probability must be a finite number.');
  }
  if (probability <= 0 || probability > 1) {
    throw new RangeError(`probability must be within (0, 1], received ${probability}.`);
  }
  assertHistogram(firstHitHistogram, spins);

  const observedExperiments = sumRange(firstHitHistogram, 1, spins);
  if (observedExperiments + censoredCount !== experiments) {
    throw new RangeError(
      `observed first hits + censoredCount must equal experiments (${experiments}), ` +
        `received ${observedExperiments + censoredCount}.`,
    );
  }

  // Visible upper window h: first level with negligible Geometric tail, bounded
  // by n and expanded to include the largest observed first hit.
  let h = spins;
  for (let candidate = 1; candidate <= spins; candidate += 1) {
    if (geometricTail(candidate, probability) <= VISIBLE_TAIL_TOLERANCE) {
      h = candidate;
      break;
    }
  }
  for (let k = 1; k <= spins; k += 1) {
    if (firstHitHistogram[k] > 0 && k > h) h = k;
  }

  const bucketSize = Math.max(1, Math.ceil(h / MAX_VISIBLE_BUCKETS));
  const buckets = [];

  for (let start = 1; start <= h; start += bucketSize) {
    const end = Math.min(h, start + bucketSize - 1);
    buckets.push(makeObservedBucket(start, end, spins, firstHitHistogram, experiments, probability));
  }

  // Observed tail h+1..n (kept only if part of 1..n remains outside the window).
  if (h < spins) {
    buckets.push(
      makeObservedBucket(h + 1, spins, spins, firstHitHistogram, experiments, probability),
    );
  }

  // Censored category T > n (always present, never merged with observed spin n).
  const empiricalCensoredFraction = censoredCount / experiments;
  const theoreticalCensoredProbability = geometricTail(spins, probability);
  buckets.push({
    label: `> ${spins}`,
    low: spins + 1,
    high: Infinity,
    isCensored: true,
    empiricalProbability: empiricalCensoredFraction,
    empiricalCount: censoredCount,
    theoreticalProbability: theoreticalCensoredProbability,
  });

  const empiricalRestrictedMean =
    (weightedSum(firstHitHistogram, spins) + spins * censoredCount) / experiments;

  return {
    spins,
    experiments,
    probability,
    grouped: bucketSize > 1 || h < spins,
    buckets,
    observedExperiments,
    censoredCount,
    empiricalCensoredFraction,
    theoreticalCensoredProbability,
    empiricalRestrictedMean,
    theoreticalRestrictedMean: restrictedGeometricMean(spins, probability),
    fullMean: geometricMean(probability),
  };
}

/**
 * Sum `k * values[k]` over an inclusive range of waiting times.
 * @param {readonly number[]} values Histogram.
 * @param {number} high Inclusive upper index.
 * @returns {number} The weighted sum.
 */
function weightedSum(values, high) {
  let total = 0;
  for (let k = 1; k <= high; k += 1) {
    total += k * values[k];
  }
  return total;
}

/**
 * Build one observed (non-censored) waiting-time bucket.
 *
 * @param {number} low Inclusive lower bound (≥ 1).
 * @param {number} high Inclusive upper bound (≤ spins).
 * @param {number} spins Observation window.
 * @param {readonly number[]} histogram First-hit histogram.
 * @param {number} experiments Number of experiments.
 * @param {number} probability Success probability p in (0, 1].
 * @returns {object} The bucket.
 */
function makeObservedBucket(low, high, spins, histogram, experiments, probability) {
  const empiricalCount = sumRange(histogram, low, high);
  return {
    label: bucketLabel(low, high, spins),
    low,
    high,
    isCensored: false,
    empiricalProbability: empiricalCount / experiments,
    empiricalCount,
    theoreticalProbability: theoreticalRangeProbability(low, high, probability),
  };
}

