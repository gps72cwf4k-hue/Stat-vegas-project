/**
 * House Edge simulation engine.
 *
 * Simulates n independent single-unit red bets on a European roulette wheel
 * (no en prison / La Partage) and the total profit T of one session, repeated
 * N times. It is deliberately independent of the pure theory module
 * `src/math/houseEdge.js`; it only reuses the fixed game constants and the
 * seeded PRNG (`src/simulation/rng.js`). No React, no UI concerns.
 *
 * Game (fixed, matches `docs/specs/house-edge.md` v2):
 * - Win (+1) with p = 18/37
 * - Lose (−1) with q = 19/37 (18 black + the zero)
 *
 * Modes:
 * - `'explicit'`: every play is drawn individually (w_i ∈ {+1, −1}). This is
 *   the only mode for the visible session 1, as required by the spec.
 * - `'fast'`: for the N sessions only, draw X ~ Bin(n, 18/37) directly and set
 *   T = 2X − n. Session 1 is still simulated explicitly so the visible mean and
 *   variance come from real plays.
 *
 * Both the synchronous and asynchronous runners use the same aggregation
 * helpers and the same RNG draw order, so for a given seed they return exactly
 * the same aggregate object.
 */

import { createSeededRng } from './rng.js';

/** Success probability of a red bet, 18/37. */
const P = 18 / 37;
/** Failure probability of a red bet, 19/37. */
const Q = 19 / 37;
/** Variance of the per-play profit W, 1368/1369 (theory mirror). */
const VAR_W = 1368 / 1369;
/** Standard deviation of W, sqrt(1368/1369). */
const SIGMA_W = Math.sqrt(VAR_W);
/** Player expected profit per unit bet, p·(+1) + q·(−1) = −1/37. */
const PLAYER_EV = P - Q;

/** UI/engine bounds for the number of plays per session. */
const MIN_N = 10;
const MAX_N = 20000;
/** UI/engine bounds for the number of Monte-Carlo sessions. */
const MIN_SESSIONS = 50;
const MAX_SESSIONS = 2000;

/** Target number of plays processed before yielding to the event loop. */
const PLAY_BUDGET_PER_CHUNK = 50000;
/** Soft wall-clock budget (ms) for one chunk, checked between sessions. */
const CHUNK_TIME_BUDGET_MS = 10;
/** Approximate number of intermediate progress updates per run. */
const PROGRESS_UPDATES_TARGET = 50;
/** Maximum number of histogram buckets returned for the T distribution. */
const MAX_HISTOGRAM_BUCKETS = 60;

/** Supported simulation modes. */
const MODES = ['explicit', 'fast'];

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
 * Validate a run mode identifier.
 *
 * @param {unknown} mode Candidate mode.
 * @throws {TypeError} If `mode` is not one of the supported modes.
 */
function assertMode(mode) {
  if (typeof mode !== 'string' || !MODES.includes(mode)) {
    throw new TypeError(`mode must be one of ${MODES.join(', ')}, received ${String(mode)}.`);
  }
}

/**
 * Assert that a value is a usable random source: a function returning numbers
 * in [0, 1).
 *
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`house edge simulation requires an rng function, received ${typeof rng}.`);
  }
}

/**
 * Simulate the visible session: n independent plays, each winning with
 * probability 18/37.
 *
 * Individual outcomes are NOT stored as an array (that would allocate n
 * values per call); instead the running sum of w and the sum of w² together
 * with the win/loss counts are accumulated. Because w_i² = 1 for every play,
 * the unbiased variance simplifies to `n/(n-1) * (1 - meanW²)`, which the spec
 * calls out explicitly.
 *
 * @param {object} params
 * @param {number} params.n Plays in the session; integer in [10, 20000].
 * @param {() => number} params.rng Random source returning numbers in [0, 1).
 * @returns {{
 *   n: number, T1: number, meanW: number, varWUnbiased: number,
 *   se: number, zScore: number, winCount: number, lossCount: number,
 * }} Visible-session metrics. `T1` is the total profit of session 1, `meanW`
 *   the empirical mean of W, `varWUnbiased` the divisor-(n−1) variance, `se`
 *   the standard error of the mean and `zScore` = (meanW − E[W]) / se.
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function simulateHouseEdgeVisibleSession({ n, rng } = {}) {
  assertIntegerInRange(n, 'n', MIN_N, MAX_N);
  assertRng(rng);

  let sumW = 0;
  let winCount = 0;
  for (let i = 0; i < n; i += 1) {
    // A win (w = +1) whenever the uniform draw falls below p.
    const win = rng() < P;
    sumW += win ? 1 : -1;
    if (win) winCount += 1;
  }

  const lossCount = n - winCount;
  const meanW = sumW / n;
  // w_i² = 1 for every play, so sum(w_i²) = n and the unbiased variance reduces
  // to n/(n−1) * (1 − meanW²).
  const varWUnbiased = (n / (n - 1)) * (1 - meanW * meanW);
  const se = SIGMA_W / Math.sqrt(n);
  const zScore = (meanW - PLAYER_EV) / se;

  return { n, T1: sumW, meanW, varWUnbiased, se, zScore, winCount, lossCount };
}


/**
 * Create a mutable accumulator for the N-session loop.
 *
 * The full vector of T values is NOT stored (up to N values); instead we keep a
 * running sum (for the mean) and a running sum of squares (for the variance),
 * plus a counts map keyed by the lattice value t = 2X − n. Keys are lattice
 * values in [−n, n] stepping by 2, so the map has at most n + 1 entries.
 *
 * @returns {{
 *   sumT: number, sumT2: number, positiveCount: number,
 *   zeroCount: number, counts: Map<number, number>,
 * }} A mutable accumulator.
 */
function createAggregates() {
  return {
    sumT: 0,
    sumT2: 0,
    positiveCount: 0,
    zeroCount: 0,
    counts: new Map(),
  };
}

/**
 * Fold one session total T into the accumulator.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {number} t Session total profit (lattice value, even offset from −n).
 * @returns {void}
 */
function accumulateSession(aggregates, t) {
  aggregates.sumT += t;
  aggregates.sumT2 += t * t;
  if (t > 0) aggregates.positiveCount += 1;
  if (t === 0) aggregates.zeroCount += 1;
  aggregates.counts.set(t, (aggregates.counts.get(t) ?? 0) + 1);
}

/**
 * Build the histogram of T for the chart.
 *
 * For small n each bin is a single step-2 lattice point (width 2, edges at
 * t ± 1). When that would exceed {@link MAX_HISTOGRAM_BUCKETS} bins, neighbouring
 * lattice points are merged into wider contiguous intervals so a large n does
 * not produce thousands of chart points; the merged bins still span the full
 * support [−n, n].
 *
 * Each returned bin reports its inclusive integer interval [low, high], the
 * empirical relative frequency (count / N) and the number of sessions in it.
 * Bin masses are exact sums of the lattice counts (never midpoint averages), so
 * the relative frequencies across bins always sum to 1 (mass-preserving).
 *
 * @param {Map<number, number>} counts Lattice-value counts.
 * @param {number} n Plays per session.
 * @param {number} sessions Number of sessions N.
 * @returns {Array<{ t: number, low: number, high: number, count: number, frequency: number }>}
 *   Histogram bins in increasing t order.
 */
function buildHistogram(counts, n, sessions) {
  const minT = -n;
  const totalBins = n + 1;
  const binSize = Math.max(1, Math.ceil(totalBins / MAX_HISTOGRAM_BUCKETS));
  const bins = [];

  for (let startIndex = 0; startIndex < totalBins; startIndex += binSize) {
    const endIndex = Math.min(totalBins - 1, startIndex + binSize - 1);
    const low = minT + 2 * startIndex;
    const high = minT + 2 * endIndex;
    let count = 0;
    for (let index = startIndex; index <= endIndex; index += 1) {
      count += counts.get(minT + 2 * index) ?? 0;
    }
    bins.push({
      // Representative lattice value for the bin centre (used for tooltips).
      t: low + (high - low) / 2,
      low,
      high,
      count,
      frequency: count / sessions,
    });
  }

  return bins;
}

/**
 * Build the exact per-lattice-value counts of T: one entry per lattice value
 * that actually occurred, sorted by t. Used to construct a TRUE empirical CDF
 * (step at each observed lattice point) rather than the grouped histogram, so
 * the ECDF is not shifted by interval grouping. Cheap: at most N entries.
 *
 * @param {Map<number, number>} counts Lattice-value counts.
 * @returns {Array<{ t: number, count: number }>} Sorted nonzero counts.
 */
function buildLatticeCounts(counts) {
  return [...counts.entries()]
    .map(([t, count]) => ({ t, count }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Turn an accumulator and the visible-session metrics into the public result.
 * Identical shape for the synchronous and asynchronous runners.
 *
 * @param {object} params
 * @param {object} params.aggregates Accumulator from {@link createAggregates}.
 * @param {{ n: number, T1: number, meanW: number, varWUnbiased: number, se: number,
 *   zScore: number, winCount: number, lossCount: number }} params.visible
 *   Visible-session metrics.
 * @param {number} params.N Number of sessions.
 * @param {number} params.seedUsed Seed actually used (number, or null if the
 *   caller used `Math.random`).
 * @param {'explicit'|'fast'} params.mode Simulation mode.
 * @returns {object} The aggregate result used by the UI.
 */
function finalizeResult({ aggregates, visible, N, seedUsed, mode }) {
  const { n } = visible;
  const meanT = aggregates.sumT / N;
  // Unbiased sample variance of T (divisor N − 1).
  const varTUnbiased =
    N > 1 ? (aggregates.sumT2 - N * meanT * meanT) / (N - 1) : 0;
  const fractionPositive = aggregates.positiveCount / N;

  return {
    inputs: { n, N, seedUsed, mode },
    visible: {
      T1: visible.T1,
      meanW: visible.meanW,
      varWUnbiased: visible.varWUnbiased,
      se: visible.se,
      zScore: visible.zScore,
      winCount: visible.winCount,
      lossCount: visible.lossCount,
    },
    sessions: {
      meanT,
      varTUnbiased,
      fractionPositive,
      zeroCount: aggregates.zeroCount,
      // Exact per-lattice-value counts of T (sorted), for the empirical CDF.
      latticeCounts: buildLatticeCounts(aggregates.counts),
    },
    histogram: buildHistogram(aggregates.counts, n, N),
  };
}


/**
 * Draw the number of wins X ~ Bin(n, 18/37) using `n` Bernoulli draws and
 * return the session total `T = 2X − n`.
 *
 * This is the "fast mode" path for the N sessions: it avoids materialising a
 * per-play profit vector but still consumes exactly `n` uniform draws, keeping
 * the RNG consumption identical in spirit to the explicit path. Session 1 is
 * always simulated explicitly, so this helper is only used for indices ≥ 1.
 *
 * @param {number} n Plays in the session.
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number} `T = 2X − n`.
 */
function drawFastSessionTotal(n, rng) {
  let wins = 0;
  for (let i = 0; i < n; i += 1) {
    if (rng() < P) wins += 1;
  }
  return 2 * wins - n;
}

/**
 * Simulate one explicit session and return its total profit T = +1·wins −1·losses.
 *
 * @param {number} n Plays in the session.
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number} The session total profit on the step-2 lattice.
 */
function drawExplicitSessionTotal(n, rng) {
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += rng() < P ? 1 : -1;
  }
  return sum;
}

/**
 * Run the House Edge simulation synchronously.
 *
 * Session 1 is always simulated explicitly (so the visible mean and variance
 * come from real plays). The remaining N − 1 sessions use the explicit path in
 * `'explicit'` mode or the direct Binomial path in `'fast'` mode.
 *
 * One RNG is chosen ONCE for the whole run (seeded or `Math.random`) and never
 * reset, matching the Roulette engine. The same seed therefore reproduces the
 * same run, and the async runner (which shares these helpers and the same draw
 * order) returns exactly the same aggregate.
 *
 * @param {object} params
 * @param {number} params.n Plays per session; integer in [10, 20000].
 * @param {number} params.N Number of sessions; integer in [50, 2000].
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {'explicit'|'fast'} [params.mode] Simulation mode (default `'explicit'`).
 * @returns {object} The aggregate result (see {@link finalizeResult}).
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function runHouseEdgeSimulation({ n, N, seed, mode = 'explicit' } = {}) {
  assertIntegerInRange(n, 'n', MIN_N, MAX_N);
  assertIntegerInRange(N, 'N', MIN_SESSIONS, MAX_SESSIONS);
  assertMode(mode);

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    // Validate the seed before choosing the RNG so invalid seeds fail fast.
    createSeededRng(seed);
  }
  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  // Visible session 1 (always explicit).
  const visible = simulateHouseEdgeVisibleSession({ n, rng });

  const aggregates = createAggregates();
  accumulateSession(aggregates, visible.T1);
  for (let session = 1; session < N; session += 1) {
    const t = mode === 'fast' ? drawFastSessionTotal(n, rng) : drawExplicitSessionTotal(n, rng);
    accumulateSession(aggregates, t);
  }

  return finalizeResult({
    aggregates,
    visible,
    N,
    seedUsed: hasSeed ? seed : null,
    mode,
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
  const message = 'House Edge simulation was cancelled.';
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Yield control to the event loop so the browser can render. Uses a genuine
 * timer task boundary (a `setTimeout`), not just a resolved promise, which
 * would not give the browser a chance to paint.
 *
 * @returns {Promise<void>} Resolves after the timer task runs.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Run the same House Edge simulation as {@link runHouseEdgeSimulation}, but in
 * bounded asynchronous chunks so the browser stays responsive.
 *
 * Behaviour and result are identical to the synchronous runner for the same
 * inputs and seed: one RNG is created once and never reset, session order and
 * random-draw order are preserved (session 1 explicit; sessions 2..N explicit
 * or fast per `mode`), and both paths share the same aggregation helpers.
 *
 * Chunking: up to `max(1, floor(50000 / n))` sessions are processed per chunk,
 * or fewer if the soft ~10 ms time budget is exceeded; the loop then yields to
 * the event loop. The whole synchronous run is never wrapped in a single timer.
 *
 * Progress: `onProgress` receives `{ completedSessions, totalSessions }`.
 * Initial (0) and final (= N) updates are always emitted; intermediate updates
 * are throttled to roughly {@link PROGRESS_UPDATES_TARGET} per run.
 *
 * Cancellation: `signal` is checked before work starts, between sessions, after
 * every yield, and before publishing the result. On abort an `AbortError` is
 * thrown and no partial result is returned.
 *
 * @param {object} params
 * @param {number} params.n Plays per session; integer in [10, 20000].
 * @param {number} params.N Number of sessions; integer in [50, 2000].
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {'explicit'|'fast'} [params.mode] Simulation mode (default `'explicit'`).
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completedSessions: number, totalSessions: number }) => void}
 *   [params.onProgress] Optional progress callback.
 * @returns {Promise<object>} The same aggregate result as
 *   {@link runHouseEdgeSimulation}.
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if the run is cancelled.
 */
export async function runHouseEdgeSimulationAsync({
  n,
  N,
  seed,
  mode = 'explicit',
  signal,
  onProgress,
} = {}) {
  assertIntegerInRange(n, 'n', MIN_N, MAX_N);
  assertIntegerInRange(N, 'N', MIN_SESSIONS, MAX_SESSIONS);
  assertMode(mode);
  if (
    signal !== undefined &&
    (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')
  ) {
    throw new TypeError('signal must be an AbortSignal when provided.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function when provided.');
  }

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }

  // Abort before work begins.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  const report = (completedSessions) => {
    if (onProgress) {
      onProgress({ completedSessions, totalSessions: N });
    }
  };

  report(0);

  // Visible session 1 (always explicit), counted as the first completed session.
  const visible = simulateHouseEdgeVisibleSession({ n, rng });
  const aggregates = createAggregates();
  accumulateSession(aggregates, visible.T1);

  const sessionsPerChunk = Math.max(1, Math.floor(PLAY_BUDGET_PER_CHUNK / n));
  const progressStep = Math.max(1, Math.ceil((N - 1) / PROGRESS_UPDATES_TARGET));
  let lastReported = 1;

  let completed = 1;
  while (completed < N) {
    const chunkEnd = Math.min(N, completed + sessionsPerChunk);
    const chunkStartTime = Date.now();

    while (completed < chunkEnd) {
      // Check between sessions so cancellation is prompt.
      if (signal && signal.aborted) {
        throw createAbortError();
      }

      const t =
        mode === 'fast' ? drawFastSessionTotal(n, rng) : drawExplicitSessionTotal(n, rng);
      accumulateSession(aggregates, t);
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
    if (completed < N) {
      await yieldToEventLoop();

      // Re-check after yielding, before continuing.
      if (signal && signal.aborted) {
        throw createAbortError();
      }
    }
  }

  // Final completion update.
  report(N);

  // Check once more before publishing the completed result.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  return finalizeResult({
    aggregates,
    visible,
    N,
    seedUsed: hasSeed ? seed : null,
    mode,
  });
}

