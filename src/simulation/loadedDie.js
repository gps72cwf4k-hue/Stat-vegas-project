/**
 * Loaded Die simulation engine.
 *
 * Simulates the two-hypothesis die model from `docs/specs/loaded-die.md` (v2):
 * a die is either fair (`H_F`) or loaded (`H_L`), the prior is `theta = P(H_L)`,
 * and the loaded die shows a six with probability `b`.
 *
 * Modes:
 * - `'manual'`: the number of rolls `m` and the number of sixes `k` are supplied
 *   directly; no randomness is used and the posterior is deterministic.
 * - `'simulate'`: for each experiment the true die type is drawn from
 *   Bernoulli(theta), the chosen die is rolled `m` times with explicit faces,
 *   the sixes are counted, and the posterior is computed (the true type is
 *   revealed only in the returned result).
 *
 * This module is deliberately independent of React and of the UI. It reuses the
 * seeded PRNG (`src/simulation/rng.js`), the pure math (`src/math/loadedDie.js`)
 * and the stable Binomial PMF (`src/math/distributions.js`). No new method for
 * the posterior is introduced: it always delegates to
 * `posteriorLoadedGivenCount`, so the numerically stable log-odds path is shared
 * with the tests.
 *
 * The synchronous and asynchronous runners share the same accumulation helpers
 * and consume the RNG in exactly the same order, so for a given seed they return
 * identical snapshots.
 */

import { createSeededRng } from './rng.js';
import {
  getDiePmfs,
  posteriorLoadedGivenCount,
  logBayesFactor,
  priorOdds,
} from '../math/loadedDie.js';
import { binomialPmfArray } from '../math/distributions.js';

/** Engine bounds for the number of rolls per experiment. */
const MIN_M = 1;
const MAX_M = 5000;
/** Engine bounds for the number of Monte-Carlo experiments (1 allowed for tests). */
const MIN_EXPERIMENTS = 1;
const MAX_EXPERIMENTS = 5000;

/** Supported simulation modes. */
const MODES = ['manual', 'simulate'];

/** Number of equal-width calibration bins over the posterior in [0, 1]. */
const CALIBRATION_BINS = 10;
/** A calibration bin with fewer experiments than this is greyed out in the UI. */
const CALIBRATION_MIN_COUNT = 20;

/** Target number of rolls processed before yielding to the event loop. */
const ROLL_BUDGET_PER_CHUNK = 50000;
/** Soft wall-clock budget (ms) for one chunk, checked between experiments. */
const CHUNK_TIME_BUDGET_MS = 10;
/** Approximate number of intermediate progress updates per run. */
const PROGRESS_UPDATES_TARGET = 50;

/**
 * Validate an integer parameter within an inclusive range.
 *
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
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
 * Validate a finite number within an inclusive range.
 *
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not finite or is outside [low, high].
 */
function assertNumberInRange(value, name, low, high) {
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
 * Validate the simulation mode.
 *
 * @param {unknown} mode Candidate mode.
 * @throws {TypeError} If `mode` is not one of the supported strings.
 */
function assertMode(mode) {
  if (typeof mode !== 'string' || !MODES.includes(mode)) {
    throw new TypeError(`mode must be one of ${MODES.join(', ')}, received ${String(mode)}.`);
  }
}

/**
 * Validate a random source: a function returning numbers in [0, 1).
 *
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`loaded die simulation requires an rng function, received ${typeof rng}.`);
  }
}

/**
 * Log10 of the Bayes factor, derived from the stable `logBayesFactor`. Returns
 * `-Infinity` when BF = 0 (the `b = 1` non-six case), never NaN.
 *
 * @param {{ b: number, m: number, k: number }} params Parameter object.
 * @returns {number} `log10(BF)`.
 */
function log10BayesFactor({ b, m, k }) {
  return logBayesFactor({ b, m, k }) / Math.LN10;
}

/**
 * Build the six-face PMF the die follows, as an array indexed by face - 1.
 *
 * @param {boolean} isLoaded Whether the die is the loaded one.
 * @param {{ fairPmf: number[], loadedPmf: number[] }} pmfs Shared PMFs.
 * @returns {number[]} The active PMF (faces 1..6).
 */
function activePmf(isLoaded, pmfs) {
  return isLoaded ? pmfs.loadedPmf : pmfs.fairPmf;
}

/**
 * Roll one die using inverse-CDF sampling from its six-face PMF. Consumes
 * exactly ONE uniform draw per roll, so the RNG consumption is identical across
 * the synchronous and asynchronous paths.
 *
 * @param {number[]} pmf Active PMF (faces 1..6).
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number} The rolled face in 1..6.
 */
function rollFace(pmf, rng) {
  const u = rng();
  let cumulative = 0;
  for (let face = 0; face < 6; face += 1) {
    cumulative += pmf[face];
    if (u < cumulative) {
      return face + 1;
    }
  }
  // Guard against floating-point rounding leaving the cumulative sum just under
  // 1: fall back to the last face (which carries the remaining mass).
  return 6;
}

/**
 * Count the sixes produced by rolling the active die `m` times.
 *
 * @param {number[]} pmf Active PMF (faces 1..6).
 * @param {number} m Number of rolls.
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number} The number of sixes observed.
 */
function countSixes(pmf, m, rng) {
  let sixes = 0;
  for (let roll = 0; roll < m; roll += 1) {
    if (rollFace(pmf, rng) === 6) {
      sixes += 1;
    }
  }
  return sixes;
}

/**
 * Predictive probability that the next roll is a six, before any data, using the
 * prior `theta` (convex combination of the two dice).
 *
 * @param {number} theta Prior P(H_L).
 * @param {number} b Loaded-die bias.
 * @param {{ fairPmf: number[], loadedPmf: number[] }} pmfs Shared PMFs.
 * @returns {number} `theta * b + (1 - theta) / 6`.
 */
function predictiveSixBefore(theta, b, pmfs) {
  return b * theta + pmfs.fairPmf[5] * (1 - theta);
}

/**
 * Full six-face prior-predictive PMF (uses `theta` as the mixing weight).
 *
 * @param {number} theta Prior P(H_L).
 * @param {{ fairPmf: number[], loadedPmf: number[] }} pmfs Shared PMFs.
 * @returns {number[]} Length-6 mixture PMF over faces 1..6.
 */
function priorPredictivePmf(theta, pmfs) {
  return pmfs.loadedPmf.map((lp, index) => lp * theta + pmfs.fairPmf[index] * (1 - theta));
}

/**
 * Full six-face posterior-predictive PMF given a posterior `post`.
 *
 * @param {number} post Posterior P(H_L | D).
 * @param {{ fairPmf: number[], loadedPmf: number[] }} pmfs Shared PMFs.
 * @returns {number[]} Length-6 mixture PMF over faces 1..6.
 */
function posteriorPredictivePmf(post, pmfs) {
  return pmfs.loadedPmf.map((lp, index) => lp * post + pmfs.fairPmf[index] * (1 - post));
}


/**
 * Simulate one Loaded Die experiment.
 *
 * Manual mode: the number of sixes `k` is supplied (`fixedK`) and no randomness
 * is used; `trueType` is `null` because no die type is drawn.
 *
 * Simulate mode: the true type is drawn from Bernoulli(theta) with one uniform
 * draw, then the chosen die is rolled `m` times with one uniform draw per roll.
 * The posterior and Bayes factor are then computed from the observed count of
 * sixes; the true type is included in the result (the UI reveals it).
 *
 * The posterior always delegates to `posteriorLoadedGivenCount`, so the stable
 * log-odds computation is shared with the pure math module and its tests.
 *
 * @param {object} params
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Loaded-die bias; finite number in [1/6, 1].
 * @param {number} params.m Rolls per experiment; integer in [1, 5000].
 * @param {'manual'|'simulate'} params.mode Simulation mode.
 * @param {() => number} params.rng Random source returning numbers in [0, 1).
 * @param {number} [params.fixedK] Number of sixes for manual mode; integer in
 *   [0, m]. Ignored in simulate mode.
 * @returns {{
 *   trueType: boolean | null,
 *   k: number,
 *   m: number,
 *   posterior: number,
 *   bayesFactorLog10: number,
 *   predictivePmfAfter: number[],
 *   predictiveSixAfter: number,
 *   predictiveSixBefore: number,
 * }} The single-experiment result.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function simulateLoadedDieExperiment({ theta, b, m, mode, rng, fixedK } = {}) {
  assertNumberInRange(theta, 'theta', 0, 1);
  assertNumberInRange(b, 'b', 1 / 6, 1);
  assertIntegerInRange(m, 'm', MIN_M, MAX_M);
  assertMode(mode);
  assertRng(rng);

  const pmfs = getDiePmfs({ b });

  let trueType = null;
  let k;
  if (mode === 'simulate') {
    // Draw the true type with one uniform draw, then roll that die m times.
    trueType = rng() < theta;
    k = countSixes(activePmf(trueType, pmfs), m, rng);
  } else {
    assertIntegerInRange(fixedK, 'k', 0, m);
    k = fixedK;
  }

  const posterior = posteriorLoadedGivenCount({ theta, b, m, k });
  const predictivePmfAfter = posteriorPredictivePmf(posterior, pmfs);

  return {
    trueType,
    k,
    m,
    posterior,
    bayesFactorLog10: log10BayesFactor({ b, m, k }),
    predictivePmfAfter,
    predictiveSixAfter: predictivePmfAfter[5],
    predictiveSixBefore: predictiveSixBefore(theta, b, pmfs),
  };
}

/**
 * Create the mutable accumulator shared by the sync and async runners.
 *
 * Only the per-experiment arrays the spec requires are retained (posterior, k,
 * trueType); nothing else grows with M.
 *
 * @param {number} M Number of experiments.
 * @returns {object} A mutable accumulator.
 */
function createAggregates(M) {
  return {
    M,
    posterior: new Array(M).fill(0),
    k: new Array(M).fill(0),
    trueType: new Array(M).fill(null),
    loadedCount: 0,
    first: null,
  };
}

/**
 * Fold one experiment result into the accumulator. The first experiment's full
 * detail is retained for the results panel.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {object} result Result of {@link simulateLoadedDieExperiment}.
 * @param {number} index Zero-based experiment index.
 * @returns {void}
 */
function accumulateExperiment(aggregates, result, index) {
  aggregates.posterior[index] = result.posterior;
  aggregates.k[index] = result.k;
  aggregates.trueType[index] = result.trueType;
  if (result.trueType === true) {
    aggregates.loadedCount += 1;
  }
  if (index === 0) {
    aggregates.first = result;
  }
}


/**
 * Build the exact overlay of the posterior distribution as a function of K.
 *
 * `P(K = k) = theta * Bin(m, b)(k) + (1 - theta) * Bin(m, 1/6)(k)` (law of total
 * probability over the two types) and `post(k) = P(H_L | K = k)`. Mass is
 * preserved: the mixture probabilities sum to 1.
 *
 * @param {number} theta Prior P(H_L).
 * @param {number} b Loaded-die bias.
 * @param {number} m Rolls per experiment.
 * @returns {{
 *   k: number[],
 *   mixtureProbability: number[],
 *   posteriorByK: number[],
 * }} Overlay arrays of length m + 1.
 */
function buildExactOverlay(theta, b, m) {
  const loaded = binomialPmfArray(m, b);
  const fair = binomialPmfArray(m, 1 / 6);
  const k = new Array(m + 1);
  const mixtureProbability = new Array(m + 1);
  const posteriorByK = new Array(m + 1);
  for (let i = 0; i <= m; i += 1) {
    k[i] = i;
    mixtureProbability[i] = theta * loaded[i] + (1 - theta) * fair[i];
    posteriorByK[i] = posteriorLoadedGivenCount({ theta, b, m, k: i });
  }
  return { k, mixtureProbability, posteriorByK };
}

/**
 * Build the 10 equal-width calibration bins over the posterior in [0, 1].
 *
 * Each bin reports its experiment count, the mean posterior of its members, and
 * the observed share of loaded dice. Bins with fewer than
 * {@link CALIBRATION_MIN_COUNT} experiments are flagged so the UI can grey them.
 * Empty bins report `NaN` for the two means so the UI renders "—".
 *
 * @param {number[]} posterior Posteriors of all experiments.
 * @param {(boolean|null)[]} trueType True types (true = loaded, null = manual).
 * @returns {Array<object>} Ten calibration bin rows.
 */
function buildCalibration(posterior, trueType) {
  const rows = [];
  for (let index = 0; index < CALIBRATION_BINS; index += 1) {
    rows.push({
      index,
      low: index / CALIBRATION_BINS,
      high: (index + 1) / CALIBRATION_BINS,
      count: 0,
      posteriorSum: 0,
      loadedSum: 0,
    });
  }
  for (let i = 0; i < posterior.length; i += 1) {
    const p = posterior[i];
    // Clamp the top edge into the last bin so p = 1 is counted.
    let bin = Math.floor(p * CALIBRATION_BINS);
    if (bin >= CALIBRATION_BINS) bin = CALIBRATION_BINS - 1;
    if (bin < 0) bin = 0;
    rows[bin].count += 1;
    rows[bin].posteriorSum += p;
    if (trueType[i] === true) {
      rows[bin].loadedSum += 1;
    }
  }
  return rows.map((row) => ({
    index: row.index,
    low: row.low,
    high: row.high,
    count: row.count,
    meanPosteriorInBin: row.count > 0 ? row.posteriorSum / row.count : NaN,
    observedLoadedShare: row.count > 0 ? row.loadedSum / row.count : NaN,
    tooFew: row.count < CALIBRATION_MIN_COUNT,
  }));
}


/**
 * Turn an accumulator into the public snapshot object. Identical shape for the
 * synchronous and asynchronous runners.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {object} params Run parameters.
 * @param {number} params.theta Prior P(H_L).
 * @param {number} params.b Loaded-die bias.
 * @param {'manual'|'simulate'} params.mode Simulation mode.
 * @param {number} params.m Rolls per experiment.
 * @param {number} params.k Number of sixes (manual mode).
 * @param {number} params.M Number of experiments.
 * @param {number|null} params.seedUsed Seed actually used (null if unseeded).
 * @returns {object} The snapshot used by the UI.
 */
function finalizeSnapshot(aggregates, { theta, b, mode, m, k, M, seedUsed }) {
  const meanPosterior =
    aggregates.posterior.reduce((acc, value) => acc + value, 0) / M;
  const seBound = 0.5 / Math.sqrt(M);
  const first = aggregates.first;
  const pmfs = getDiePmfs({ b });

  return {
    inputs: { theta, b, mode, m, k, M, seedUsed },
    experiment1: {
      trueType: first.trueType,
      k: first.k,
      m,
      posterior: first.posterior,
      bayesFactorLog10: first.bayesFactorLog10,
      priorOdds: priorOdds(theta),
      posteriorOdds: priorOdds(theta) * Math.pow(10, first.bayesFactorLog10),
      predictiveSixBefore: first.predictiveSixBefore,
      predictiveSixAfter: first.predictiveSixAfter,
      predictivePmfBefore: priorPredictivePmf(theta, pmfs),
      predictivePmfAfter: first.predictivePmfAfter,
    },
    experiments: {
      posterior: aggregates.posterior,
      k: aggregates.k,
      trueType: aggregates.trueType,
    },
    summaryMetrics: {
      meanPosterior,
      seBound,
      changeInPercentagePoints: (first.posterior - theta) * 100,
      loadedShare: aggregates.loadedCount / M,
    },
    calibration: buildCalibration(aggregates.posterior, aggregates.trueType),
    exactOverlay: buildExactOverlay(theta, b, m),
  };
}

/**
 * Run the Loaded Die simulation synchronously and return the snapshot.
 *
 * One RNG is chosen ONCE for the whole run (seeded or `Math.random`) and never
 * reset, so the same seed reproduces the same run. Manual mode consumes no
 * random draws. The maximum work is `M * m <= 5000 * 5000 = 25,000,000` rolls;
 * the UI must use the asynchronous runner for large runs.
 *
 * @param {object} params
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Loaded-die bias; finite number in [1/6, 1].
 * @param {'manual'|'simulate'} params.mode Simulation mode.
 * @param {number} params.m Rolls per experiment; integer in [1, 5000].
 * @param {number} params.k Number of sixes (manual mode); integer in [0, m].
 * @param {number} params.M Number of experiments; integer in [1, 5000].
 * @param {number} [params.seedUsed] Optional nonnegative safe-integer seed.
 *   Omitted uses `Math.random`.
 * @returns {object} The snapshot (see {@link finalizeSnapshot}).
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {RangeError} If the posterior is the explicitly undefined 0/0 case.
 */
export function runLoadedDieSimulation({ theta, b, mode, m, k, M, seedUsed } = {}) {
  assertNumberInRange(theta, 'theta', 0, 1);
  assertNumberInRange(b, 'b', 1 / 6, 1);
  assertMode(mode);
  assertIntegerInRange(m, 'm', MIN_M, MAX_M);
  assertIntegerInRange(M, 'M', MIN_EXPERIMENTS, MAX_EXPERIMENTS);
  if (mode === 'manual') {
    assertIntegerInRange(k, 'k', 0, m);
  }

  const hasSeed = seedUsed !== undefined;
  if (hasSeed) {
    // Validate the seed before choosing the RNG so invalid seeds fail fast.
    createSeededRng(seedUsed);
  }
  const rng = hasSeed ? createSeededRng(seedUsed) : Math.random;

  const aggregates = createAggregates(M);
  for (let i = 0; i < M; i += 1) {
    const result = simulateLoadedDieExperiment({ theta, b, m, mode, rng, fixedK: k });
    accumulateExperiment(aggregates, result, i);
  }

  return finalizeSnapshot(aggregates, {
    theta,
    b,
    mode,
    m,
    k,
    M,
    seedUsed: hasSeed ? seedUsed : null,
  });
}


/**
 * Create the error used when a run is cancelled. Prefers the DOM `AbortError`
 * so callers can detect it by `name`; falls back to a plain Error with the same
 * name in non-browser environments.
 *
 * @returns {Error} An error whose `name` is `"AbortError"`.
 */
function createAbortError() {
  const message = 'Loaded Die simulation was cancelled.';
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Yield to the event loop so the browser stays responsive between chunks.
 *
 * @returns {Promise<void>} Resolves after the timer task runs.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Run the Loaded Die simulation asynchronously in bounded chunks.
 *
 * Equivalent to {@link runLoadedDieSimulation} for the same `seedUsed`: the same
 * accumulation helpers and the same RNG draw order are used, so the snapshots
 * are identical. The run yields to the event loop between chunks, reports
 * throttled progress, and can be cancelled through `signal`.
 *
 * Progress: `onProgress` receives `{ completedExperiments, totalExperiments }`.
 * Initial (0) and final (= M) updates are always emitted; intermediate updates
 * are throttled to roughly {@link PROGRESS_UPDATES_TARGET} per run.
 *
 * Cancellation: `signal` is checked before work starts, between experiments,
 * after every yield, and once more before publishing the result. A cancelled run
 * throws an `AbortError` (name `"AbortError"`) and publishes nothing.
 *
 * @param {object} params
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Loaded-die bias; finite number in [1/6, 1].
 * @param {'manual'|'simulate'} params.mode Simulation mode.
 * @param {number} params.m Rolls per experiment; integer in [1, 5000].
 * @param {number} params.k Number of sixes (manual mode); integer in [0, m].
 * @param {number} params.M Number of experiments; integer in [1, 5000].
 * @param {number} [params.seedUsed] Optional nonnegative safe-integer seed.
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completedExperiments: number, totalExperiments: number }) => void}
 *   [params.onProgress] Optional progress callback.
 * @returns {Promise<object>} The same snapshot as {@link runLoadedDieSimulation}.
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if the run is cancelled.
 */
export async function runLoadedDieSimulationAsync({
  theta,
  b,
  mode,
  m,
  k,
  M,
  seedUsed,
  signal,
  onProgress,
} = {}) {
  assertNumberInRange(theta, 'theta', 0, 1);
  assertNumberInRange(b, 'b', 1 / 6, 1);
  assertMode(mode);
  assertIntegerInRange(m, 'm', MIN_M, MAX_M);
  assertIntegerInRange(M, 'M', MIN_EXPERIMENTS, MAX_EXPERIMENTS);
  if (mode === 'manual') {
    assertIntegerInRange(k, 'k', 0, m);
  }
  if (
    signal !== undefined &&
    (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')
  ) {
    throw new TypeError('signal must be an AbortSignal when provided.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function when provided.');
  }

  // Validate the seed before doing any work so invalid seeds fail fast.
  const hasSeed = seedUsed !== undefined;
  if (hasSeed) {
    createSeededRng(seedUsed);
  }

  // Abort before work begins.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const rng = hasSeed ? createSeededRng(seedUsed) : Math.random;
  const aggregates = createAggregates(M);

  const report = (completedExperiments) => {
    if (onProgress) {
      onProgress({ completedExperiments, totalExperiments: M });
    }
  };

  const experimentsPerChunk = Math.max(1, Math.floor(ROLL_BUDGET_PER_CHUNK / m));
  const progressStep = Math.max(1, Math.ceil(M / PROGRESS_UPDATES_TARGET));
  let lastReported = 0;

  report(0);

  let completed = 0;
  while (completed < M) {
    const chunkEnd = Math.min(M, completed + experimentsPerChunk);
    const chunkStartTime = Date.now();

    while (completed < chunkEnd) {
      // Check between experiments so cancellation is prompt.
      if (signal && signal.aborted) {
        throw createAbortError();
      }

      const result = simulateLoadedDieExperiment({ theta, b, m, mode, rng, fixedK: k });
      accumulateExperiment(aggregates, result, completed);
      completed += 1;

      if (completed - lastReported >= progressStep) {
        lastReported = completed;
        report(completed);
      }

      // End the chunk early once the soft time budget is exceeded.
      if (Date.now() - chunkStartTime >= CHUNK_TIME_BUDGET_MS) {
        break;
      }
    }

    // Yield to the event loop (only if there is more work to do).
    if (completed < M) {
      await yieldToEventLoop();

      // Re-check after yielding, before continuing.
      if (signal && signal.aborted) {
        throw createAbortError();
      }
    }
  }

  // Final completion update.
  report(M);

  // Check once more before publishing the completed result.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  return finalizeSnapshot(aggregates, {
    theta,
    b,
    mode,
    m,
    k,
    M,
    seedUsed: hasSeed ? seedUsed : null,
  });
}

