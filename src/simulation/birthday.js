/**
 * Seeded Monte-Carlo engine for the Birthday Paradox.
 *
 * Two birthday sources are supported (the "your own groups" mode is a separate,
 * future task and is NOT implemented here):
 * - `'uniform'`: independent uniform birthdays over 365 days (leap years ignored);
 * - `'real-ssa'` / `'real-cdc'`: independent birthdays drawn from the bundled
 *   aggregate US birth distribution over 366 calendar dates (29 February
 *   included), via inverse-CDF sampling over a cumulative-weight array.
 *
 * The engine is pure and deterministic: for a fixed seed the whole snapshot is
 * reproducible and the module holds no mutable state. Seeded RNG is reproducible,
 * not cryptographic. All exact values come from the pure `../math/birthday.js`
 * module. The engine never computes `P(distinct)` as `1 - P(shared)`; it stores
 * the directly computed value. Weights are supplied as an array (or built from
 * `csvText`) so the engine stays testable without touching the filesystem.
 *
 * Cancellation follows the same convention as the other engines: a rejected
 * promise whose error name is `"AbortError"`.
 */

import { createSeededRng } from './rng.js';
import {
  DAYS_UNIFORM,
  dpAllDistinctProbabilities,
  getUsBirthWeightsFromCsv,
  parseUsBirthsByCalendarDayCsv,
  probAllDistinctUniform365,
} from '../math/birthday.js';

/** Engine bounds for the number of people (1 allowed so tests can use tiny runs). */
const MIN_PEOPLE = 1;
const MAX_PEOPLE = 100;
/** Engine bounds for the number of experiments (1 allowed so tests can use tiny runs). */
const MIN_EXPERIMENTS = 1;
const MAX_EXPERIMENTS = 20000;
/** Highest `n` precomputed for the chart curves. */
const CURVE_N_MAX = 100;
/** Z multiplier for a 95% interval (standard normal 0.975 quantile). */
const Z_95 = 1.959963984540054;
/** Soft per-chunk experiment budget so the async runner yields to the event loop. */
const EXPERIMENTS_PER_CHUNK = 2000;
/** Target number of progress updates for a run. */
const PROGRESS_UPDATES_TARGET = 50;

/** Supported birthday sources. */
const SOURCES = ['uniform', 'real-ssa', 'real-cdc'];

/**
 * Per-dataset descriptive metadata for the real-data card (years, license, link).
 * The counts themselves always come from the bundled CSV, never from here.
 * @type {Readonly<Record<string, object>>}
 */
export const DATASET_INFO = Object.freeze({
  'real-ssa': Object.freeze({
    datasetKey: 'ssa_2000_2014',
    label: 'SSA 2000-2014',
    years: '2000-2014',
    source: 'Social Security Administration',
    license: 'CC BY 4.0',
    link: 'https://github.com/fivethirtyeight/data/tree/master/births',
  }),
  'real-cdc': Object.freeze({
    datasetKey: 'cdc_1994_2003',
    label: 'CDC/NCHS 1994-2003',
    years: '1994-2003',
    source: 'CDC National Center for Health Statistics',
    license: 'CC BY 4.0',
    link: 'https://github.com/fivethirtyeight/data/tree/master/births',
  }),
});

/**
 * Validate an integer parameter within an inclusive range.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for error messages.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
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
 * Validate the source identifier.
 * @param {unknown} source Candidate source.
 * @throws {TypeError} If `source` is not one of the supported values.
 */
function assertSource(source) {
  if (typeof source !== 'string' || !SOURCES.includes(source)) {
    throw new TypeError(`source must be one of ${SOURCES.join(', ')}, received ${String(source)}.`);
  }
}

/**
 * Resolve the day weights for a source. Uniform returns a fresh `1/365` array;
 * real sources read the weights from `csvText` (the bundled CSV text).
 * @param {'uniform'|'real-ssa'|'real-cdc'} source Source identifier.
 * @param {string} [csvText] Bundled CSV text (required for real sources).
 * @returns {number[]} The day weights (length 365 or 366).
 * @throws {TypeError|RangeError} If a real source is requested without valid CSV text.
 */
function resolveWeights(source, csvText) {
  if (source === 'uniform') {
    return new Array(DAYS_UNIFORM).fill(1 / DAYS_UNIFORM);
  }
  if (typeof csvText !== 'string' || csvText === '') {
    throw new TypeError(`source "${source}" requires csvText (the bundled CSV contents).`);
  }
  return getUsBirthWeightsFromCsv(csvText, DATASET_INFO[source].datasetKey).weights;
}

/**
 * Wilson score 95% confidence interval for a binomial proportion.
 *
 * Uses the score (Wilson) interval, which behaves correctly at the boundaries:
 * - for `hits = 0` the lower bound is exactly 0 and the upper bound is positive;
 * - for `hits = N` the upper bound is exactly 1 and the lower bound is below 1;
 * - the interval always lies within `[0, 1]`.
 *
 * @param {number} hits Number of successes; integer in `[0, N]`.
 * @param {number} N Number of trials; positive integer.
 * @returns {{ lo: number, hi: number }} The interval bounds in `[0, 1]`.
 * @throws {TypeError} If `hits` or `N` is not a number.
 * @throws {RangeError} If `N` is not positive or `hits` is outside `[0, N]`.
 */
export function wilsonInterval95(hits, N) {
  assertIntegerInRange(N, 'wilsonInterval95 N', 1, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(hits, 'wilsonInterval95 hits', 0, N);

  const pHat = hits / N;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / N;
  const centre = pHat + z2 / (2 * N);
  const margin = Z_95 * Math.sqrt((pHat * (1 - pHat)) / N + z2 / (4 * N * N));
  let lo = (centre - margin) / denominator;
  let hi = (centre + margin) / denominator;

  // Force exactness at the boundaries (so p̂ = 0 has lo exactly 0 and p̂ = 1 has
  // hi exactly 1), and clamp for the general floating-point case.
  if (hits === 0) lo = 0;
  if (hits === N) hi = 1;
  if (lo < 0) lo = 0;
  if (hi > 1) hi = 1;
  return { lo, hi };
}

/**
 * Build a cumulative-weight array from day probabilities for inverse-CDF
 * sampling. The final entry is forced to exactly 1 so the search over `[0, 1)`
 * never runs past the end of the array.
 *
 * @param {readonly number[]} weights Day probabilities (non-empty, finite, >= 0).
 * @returns {number[]} Cumulative sums with `result[length - 1] === 1`.
 * @throws {TypeError} If `weights` is not an array.
 * @throws {RangeError} If `weights` is empty or contains a non-finite/negative value.
 */
export function buildCumulativeWeights(weights) {
  if (!Array.isArray(weights)) {
    throw new TypeError(`buildCumulativeWeights weights must be an array, received ${typeof weights}.`);
  }
  if (weights.length === 0) {
    throw new RangeError('buildCumulativeWeights weights must not be empty.');
  }
  const cumulative = new Array(weights.length);
  let running = 0;
  for (let j = 0; j < weights.length; j += 1) {
    const p = weights[j];
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw new RangeError(`buildCumulativeWeights weights[${j}] must be a finite number, received ${p}.`);
    }
    if (p < 0) {
      throw new RangeError(`buildCumulativeWeights weights[${j}] must be non-negative, received ${p}.`);
    }
    running += p;
    cumulative[j] = running;
  }
  // Force the last entry to exactly 1 to remove accumulated rounding drift.
  cumulative[cumulative.length - 1] = 1;
  return cumulative;
}

/**
 * Draw one day index from a cumulative-weight array by binary search.
 *
 * The search finds the first index whose cumulative value is strictly greater
 * than `u`. Because the last cumulative entry is exactly 1 and `u < 1`, the
 * index is always within `[0, length - 1]`. `u` values are clamped defensively
 * so the function can never read out of bounds.
 *
 * @param {readonly number[]} cumulative Cumulative weights ending at 1.
 * @param {number} u Uniform draw in `[0, 1)`.
 * @returns {number} The selected day index.
 * @throws {TypeError} If `cumulative` is not a non-empty array or `u` is not a number.
 */
export function sampleIndexFromCumulative(cumulative, u) {
  if (!Array.isArray(cumulative) || cumulative.length === 0) {
    throw new TypeError('sampleIndexFromCumulative cumulative must be a non-empty array.');
  }
  if (typeof u !== 'number' || !Number.isFinite(u)) {
    throw new TypeError(`sampleIndexFromCumulative u must be a finite number, received ${u}.`);
  }
  const last = cumulative.length - 1;
  if (u <= 0) return 0;
  if (u >= 1) return last;

  let low = 0;
  let high = last;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] > u) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

/**
 * Simulate one experiment: draw `n` independent birthdays and report whether at
 * least two coincide. Uses an occupancy boolean array and stops early on the
 * first duplicate (later draws of that experiment are not consumed).
 *
 * @param {object} params
 * @param {number} params.n Number of people; integer in `[1, 100]`.
 * @param {readonly number[]} params.cumulative Cumulative weights for the source.
 * @param {() => number} params.rng Random source returning numbers in `[0, 1)`.
 * @returns {boolean} `true` if a shared birthday occurred.
 * @throws {TypeError|RangeError} If the arguments are invalid.
 */
export function simulateSharedExperiment({ n, cumulative, rng }) {
  assertIntegerInRange(n, 'simulateSharedExperiment n', MIN_PEOPLE, MAX_PEOPLE);
  if (typeof rng !== 'function') {
    throw new TypeError(`simulateSharedExperiment rng must be a function, received ${typeof rng}.`);
  }
  if (!Array.isArray(cumulative) || cumulative.length === 0) {
    throw new TypeError('simulateSharedExperiment cumulative must be a non-empty array.');
  }

  const dayCount = cumulative.length;
  const occupied = new Array(dayCount).fill(false);
  for (let person = 0; person < n; person += 1) {
    const day = sampleIndexFromCumulative(cumulative, rng());
    if (occupied[day]) {
      return true;
    }
    occupied[day] = true;
  }
  return false;
}


/**
 * Build the exact chart curves for `n = 2..CURVE_N_MAX` for the selected source.
 * The exact array is `P(shared)` for each `n`; `delta` is
 * `P_selected(n) - P_uniform365(n)` (useful only in real-data mode).
 * @param {'uniform'|'real-ssa'|'real-cdc'} source Source identifier.
 * @param {readonly number[]} weights Day weights for the source.
 * @returns {{ nValues: number[], exact: number[], uniform365: number[], delta: number[] }}
 *   Index-aligned arrays starting at `n = 2`.
 */
function buildCurves(source, weights) {
  const nValues = [];
  const exact = [];
  const uniform365 = [];
  const delta = [];
  // DP gives all P(all distinct) at once for the real sources; uniform uses the product.
  const f = source === 'uniform' ? null : dpAllDistinctProbabilities(weights, CURVE_N_MAX);
  for (let n = 2; n <= CURVE_N_MAX; n += 1) {
    const pSelected = f ? 1 - f[n] : 1 - probAllDistinctUniform365(n);
    const pUniform = probAllDistinctUniform365(n);
    nValues.push(n);
    exact.push(pSelected);
    uniform365.push(1 - pUniform);
    delta.push(pSelected - (1 - pUniform));
  }
  return { nValues, exact, uniform365, delta };
}

/**
 * Find the rarest and most frequent calendar dates from the parsed CSV rows and
 * their weights (used by the real-data card). Dates are formatted as `MM-DD`.
 * @param {readonly object[]} rows Parsed CSV rows (file order).
 * @param {readonly number[]} weights Day weights aligned with `rows`.
 * @returns {{ rarest: object, mostFrequent: object }} Each has `{ date, month, day, birthsWeight, relativeToAverage }`.
 */
function buildDateExtremes(rows, weights) {
  let minIndex = 0;
  let maxIndex = 0;
  for (let j = 1; j < weights.length; j += 1) {
    if (weights[j] < weights[minIndex]) minIndex = j;
    if (weights[j] > weights[maxIndex]) maxIndex = j;
  }
  const average = 1 / weights.length;
  const describe = (index) => {
    const row = rows[index];
    const month = String(row.month).padStart(2, '0');
    const day = String(row.day).padStart(2, '0');
    return {
      date: `${month}-${day}`,
      month: row.month,
      day: row.day,
      weight: weights[index],
      relativeToAverage: weights[index] / average,
    };
  };
  return { rarest: describe(minIndex), mostFrequent: describe(maxIndex) };
}

/**
 * Assemble the immutable result snapshot from the aggregate counts. All displayed
 * comparisons derive from this snapshot so later control edits cannot change a
 * completed run's theory.
 * @param {object} params
 * @param {number} params.hits Experiments with at least one shared birthday.
 * @param {number} params.n People per experiment.
 * @param {number} params.N Experiments.
 * @param {'uniform'|'real-ssa'|'real-cdc'} params.source Source identifier.
 * @param {number|null} params.seedUsed Seed used (null when unseeded).
 * @param {readonly number[]} params.weights Day weights.
 * @param {readonly object[]|null} params.rows Parsed CSV rows (real mode only).
 * @param {number|null} params.totalBirths Total births for the dataset (real mode).
 * @returns {object} The snapshot.
 */
function buildSnapshot({ hits, n, N, source, seedUsed, weights, rows, totalBirths }) {
  const pHat = hits / N;

  // Exact values: P(all distinct) computed directly, then P(shared).
  const isReal = source !== 'uniform';
  const f = isReal ? dpAllDistinctProbabilities(weights, n) : null;
  const pDistinctExact = f ? f[n] : probAllDistinctUniform365(n);
  const pExact = 1 - pDistinctExact;
  const uniform365Exact = isReal ? 1 - probAllDistinctUniform365(n) : null;

  // Standard error and z-score with the spec's validity rule.
  const se = Math.sqrt((pExact * (1 - pExact)) / N);
  const absDiff = Math.abs(pHat - pExact);
  const expectedHits = N * pExact;
  const expectedMisses = N * (1 - pExact);
  const zValid = expectedHits >= 10 && expectedMisses >= 10;
  const zScoreOrNull = se > 0 && zValid ? (pHat - pExact) / se : null;

  const wilsonCI95 = wilsonInterval95(hits, N);
  const curves = buildCurves(source, weights);

  let detectability = null;
  let dataCard = null;
  if (isReal) {
    const deltaExact = pExact - uniform365Exact;
    const deltaOverSE = se > 0 ? deltaExact / se : null;
    const nNeeded3SE = deltaExact !== 0 ? (9 * pExact * (1 - pExact)) / (deltaExact * deltaExact) : null;
    detectability = { deltaExact, deltaOverSE, nNeeded3SE };

    const info = DATASET_INFO[source];
    const extremes = buildDateExtremes(rows, weights);
    dataCard = {
      datasetKey: info.datasetKey,
      label: info.label,
      years: info.years,
      sourceName: info.source,
      license: info.license,
      link: info.link,
      totalBirths,
      rarest: extremes.rarest,
      mostFrequent: extremes.mostFrequent,
    };
  }

  return {
    inputs: { n, N, source, datasetKey: isReal ? DATASET_INFO[source].datasetKey : null, seedUsed },
    empirical: { hits, pHat },
    exact: { pExact, pDistinctExact, uniform365Exact },
    derived: { se, absDiff, zScoreOrNull, zValid, expectedHits, expectedMisses },
    wilsonCI95,
    detectability,
    curves,
    dataCard,
  };
}


/**
 * Resolve the day weights, CSV rows and total births for a run.
 * @param {'uniform'|'real-ssa'|'real-cdc'} source Source identifier.
 * @param {string} [csvText] Bundled CSV text.
 * @returns {{ weights: number[], rows: object[]|null, totalBirths: number|null }} Resolved inputs.
 */
function resolveSourceData(source, csvText) {
  if (source === 'uniform') {
    return { weights: resolveWeights('uniform'), rows: null, totalBirths: null };
  }
  if (typeof csvText !== 'string' || csvText === '') {
    throw new TypeError(`source "${source}" requires csvText (the bundled CSV contents).`);
  }
  const datasetKey = DATASET_INFO[source].datasetKey;
  const parsed = getUsBirthWeightsFromCsv(csvText, datasetKey);
  return {
    weights: parsed.weights,
    rows: parseUsBirthsByCalendarDayCsv(csvText),
    totalBirths: parsed.totals.totalBirths,
  };
}

/**
 * Validate the shared run arguments before doing any work.
 * @param {object} params Raw run arguments.
 * @param {number} params.n People per experiment.
 * @param {number} params.N Experiments.
 * @param {string} params.source Source identifier.
 * @param {string} [params.csvText] Bundled CSV text.
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {Function} [params.onProgress] Optional progress callback.
 */
function assertRunArguments({ n, N, source, csvText, signal, onProgress }) {
  assertIntegerInRange(n, 'n', MIN_PEOPLE, MAX_PEOPLE);
  assertIntegerInRange(N, 'N', MIN_EXPERIMENTS, MAX_EXPERIMENTS);
  assertSource(source);
  if (
    signal !== undefined &&
    (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')
  ) {
    throw new TypeError('signal must be an AbortSignal when provided.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function when provided.');
  }
  // Resolve weights up front so a missing/invalid CSV fails fast.
  resolveSourceData(source, csvText);
}

/**
 * Build an `AbortError` (name `"AbortError"`) for a cancelled run.
 * @returns {Error} The abort error.
 */
function createAbortError() {
  const message = 'Birthday simulation was cancelled.';
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Yield to the event loop so the UI can repaint and process input.
 * @returns {Promise<void>} Resolves on the next macrotask.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}


/**
 * Run the Birthday Paradox simulation synchronously.
 *
 * @param {object} params
 * @param {number} params.n People per experiment; integer in `[1, 100]`.
 * @param {number} params.N Experiments; integer in `[1, 20000]`.
 * @param {'uniform'|'real-ssa'|'real-cdc'} params.source Birthday source.
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {string} [params.csvText] Bundled CSV text (required for real sources).
 * @returns {object} The immutable result snapshot.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function runBirthdaySimulation({ n, N, source, seed, csvText } = {}) {
  assertRunArguments({ n, N, source, csvText });

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }
  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  const { weights, rows, totalBirths } = resolveSourceData(source, csvText);
  const cumulative = buildCumulativeWeights(weights);

  let hits = 0;
  for (let experiment = 0; experiment < N; experiment += 1) {
    if (simulateSharedExperiment({ n, cumulative, rng })) {
      hits += 1;
    }
  }

  return buildSnapshot({
    hits,
    n,
    N,
    source,
    seedUsed: hasSeed ? seed : null,
    weights,
    rows,
    totalBirths,
  });
}


/**
 * Run the Birthday Paradox simulation asynchronously in bounded chunks so the
 * browser stays responsive and the run can be cancelled.
 *
 * @param {object} params
 * @param {number} params.n People per experiment; integer in `[1, 100]`.
 * @param {number} params.N Experiments; integer in `[1, 20000]`.
 * @param {'uniform'|'real-ssa'|'real-cdc'} params.source Birthday source.
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {string} [params.csvText] Bundled CSV text (required for real sources).
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completedExperiments: number, totalExperiments: number }) => void}
 *   [params.onProgress] Optional progress callback.
 * @returns {Promise<object>} The same snapshot as {@link runBirthdaySimulation}.
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if cancelled.
 */
export async function runBirthdaySimulationAsync({
  n,
  N,
  source,
  seed,
  csvText,
  signal,
  onProgress,
} = {}) {
  assertRunArguments({ n, N, source, csvText, signal, onProgress });

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const rng = hasSeed ? createSeededRng(seed) : Math.random;
  const { weights, rows, totalBirths } = resolveSourceData(source, csvText);
  const cumulative = buildCumulativeWeights(weights);

  const report = (completedExperiments) => {
    if (onProgress) {
      onProgress({ completedExperiments, totalExperiments: N });
    }
  };

  const progressStep = Math.max(1, Math.ceil(N / PROGRESS_UPDATES_TARGET));
  let lastReported = 0;
  report(0);

  let hits = 0;
  let completed = 0;
  while (completed < N) {
    const chunkEnd = Math.min(N, completed + EXPERIMENTS_PER_CHUNK);
    while (completed < chunkEnd) {
      if (signal && signal.aborted) {
        throw createAbortError();
      }
      if (simulateSharedExperiment({ n, cumulative, rng })) {
        hits += 1;
      }
      completed += 1;
      if (completed - lastReported >= progressStep) {
        lastReported = completed;
        report(completed);
      }
    }
    if (completed < N) {
      await yieldToEventLoop();
      if (signal && signal.aborted) {
        throw createAbortError();
      }
    }
  }

  report(N);
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  return buildSnapshot({
    hits,
    n,
    N,
    source,
    seedUsed: hasSeed ? seed : null,
    weights,
    rows,
    totalBirths,
  });
}

