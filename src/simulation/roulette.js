import { createSeededRng } from './rng.js';
import { EUROPEAN_ROULETTE, getRouletteColour } from '../math/roulette.js';

/** Engine bounds for the number of spins per experiment. */
const MIN_SPINS = 1;
const MAX_SPINS = 5000;

/** Engine bounds for the number of experiments (1 is allowed for tests/edges). */
const MIN_EXPERIMENTS = 1;
const MAX_EXPERIMENTS = 5000;

/** How many leading outcomes are retained for display chips. */
const SAMPLE_SIZE = 20;

/** Supported event identifiers. */
const EVENTS = ['red', 'black', 'green', 'straight-up'];

/**
 * Assert that a value is a usable random source: a function returning numbers
 * in [0, 1).
 *
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`roulette simulation requires an rng function, received ${typeof rng}.`);
  }
}

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
 * Validate the target event identifier.
 *
 * @param {unknown} event Candidate event.
 * @throws {TypeError} If `event` is not one of the supported strings.
 */
function assertEvent(event) {
  if (typeof event !== 'string' || !EVENTS.includes(event)) {
    throw new TypeError(`event must be one of ${EVENTS.join(', ')}, received ${String(event)}.`);
  }
}

/**
 * Validate the straight-up jackpot pocket.
 *
 * @param {unknown} pocket Candidate pocket.
 * @throws {TypeError} If `pocket` is not a number.
 * @throws {RangeError} If `pocket` is not an integer within 0–36.
 */
function assertPocket(pocket) {
  assertIntegerInRange(
    pocket,
    'jackpotPocket',
    EUROPEAN_ROULETTE.minPocket,
    EUROPEAN_ROULETTE.maxPocket,
  );
}

/**
 * Decide whether a pocket satisfies the chosen event.
 *
 * - `red`: the pocket's colour is red.
 * - `black`: the pocket's colour is black.
 * - `green`: the pocket is 0.
 * - `straight-up`: the pocket equals the specified jackpot pocket.
 *
 * Colour matching reuses {@link getRouletteColour} (no parity, no duplicated
 * colour table). With `jackpotPocket = 0`, `straight-up` and `green` describe the
 * same event. Event selection changes which pockets match, never the underlying
 * spin sequence.
 *
 * @param {number} pocket Drawn pocket (0–36).
 * @param {'red'|'black'|'green'|'straight-up'} event Target event.
 * @param {number} jackpotPocket Straight-up target pocket (0–36).
 * @returns {boolean} Whether the pocket matches the event.
 */
function isEventHit(pocket, event, jackpotPocket) {
  if (event === 'red') {
    return getRouletteColour(pocket) === 'red';
  }
  if (event === 'black') {
    return getRouletteColour(pocket) === 'black';
  }
  if (event === 'green') {
    return pocket === 0;
  }
  return pocket === jackpotPocket;
}

/**
 * Simulate one roulette experiment of exactly `spins` independent spins.
 *
 * Each spin draws one uniform pocket with `Math.floor(rng() * pocketCount)`, so
 * the supplied `rng` MUST return numbers in [0, 1). Exactly one RNG value is
 * consumed per spin. The event is detected from the actual drawn pocket — the
 * theoretical probability is never used to synthesise a success.
 *
 * The experiment is NOT stopped at the first success: `eventHits` and the
 * colour totals require the full run.
 *
 * Waiting-time convention: `firstHit` is the one-based spin number of the first
 * success, and is `null` when no success occurs within `spins`. A success on
 * the final spin gives `firstHit = spins`; a run with no success gives
 * `firstHit = null`. These two cases stay distinct (right-censoring).
 *
 * @param {object} params
 * @param {number} params.spins Number of spins; integer in [1, 5000].
 * @param {'red'|'black'|'green'|'straight-up'} params.event Target event.
 * @param {number} [params.jackpotPocket] Straight-up target pocket; integer in
 *   [0, 36]. Defaults to 0 (so straight-up coincides with green).
 * @param {() => number} params.rng Random source returning values in [0, 1).
 *   Required for this low-level function.
 * @returns {{
 *   eventHits: number,
 *   firstHit: number | null,
 *   colourCounts: { red: number, black: number, green: number },
 *   samplePockets: number[],
 * }} Per-experiment aggregates. `samplePockets` holds only the first
 *   `min(spins, 20)` outcomes; the full spin history is not retained.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function simulateRouletteExperiment({ spins, event, jackpotPocket = 0, rng }) {
  assertIntegerInRange(spins, 'spins', MIN_SPINS, MAX_SPINS);
  assertEvent(event);
  assertPocket(jackpotPocket);
  assertRng(rng);

  const { pocketCount } = EUROPEAN_ROULETTE;
  const colourCounts = { red: 0, black: 0, green: 0 };
  const samplePockets = [];
  let eventHits = 0;
  let firstHit = null;

  for (let spin = 1; spin <= spins; spin += 1) {
    const pocket = Math.floor(rng() * pocketCount);

    colourCounts[getRouletteColour(pocket)] += 1;

    if (samplePockets.length < SAMPLE_SIZE) {
      samplePockets.push(pocket);
    }

    if (isEventHit(pocket, event, jackpotPocket)) {
      eventHits += 1;
      if (firstHit === null) {
        firstHit = spin;
      }
    }
  }

  return { eventHits, firstHit, colourCounts, samplePockets };
}
/**
 * Create an empty aggregate accumulator for a run of `experiments` of `spins`
 * spins each. Shared by the synchronous and asynchronous runners so both paths
 * cannot drift apart.
 *
 * @param {number} spins Spins per experiment.
 * @returns {object} A mutable accumulator.
 */
function createAggregates(spins) {
  return {
    countHistogram: new Array(spins + 1).fill(0),
    firstHitHistogram: new Array(spins + 1).fill(0),
    colourCounts: { red: 0, black: 0, green: 0 },
    totalEventHits: 0,
    censoredCount: 0,
    restrictedWaitingSum: 0,
    samplePockets: [],
  };
}

/**
 * Fold one experiment result into the accumulator. The first experiment's
 * sample is retained; later samples are ignored so no history is kept.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {object} result Result of `simulateRouletteExperiment`.
 * @param {number} experimentIndex Zero-based experiment index.
 * @param {number} spins Spins per experiment (for the censored waiting value).
 * @returns {void}
 */
function accumulateExperiment(aggregates, result, experimentIndex, spins) {
  aggregates.totalEventHits += result.eventHits;
  aggregates.countHistogram[result.eventHits] += 1;

  if (result.firstHit === null) {
    aggregates.censoredCount += 1;
    aggregates.restrictedWaitingSum += spins;
  } else {
    aggregates.firstHitHistogram[result.firstHit] += 1;
    aggregates.restrictedWaitingSum += result.firstHit;
  }

  aggregates.colourCounts.red += result.colourCounts.red;
  aggregates.colourCounts.black += result.colourCounts.black;
  aggregates.colourCounts.green += result.colourCounts.green;

  if (experimentIndex === 0) {
    aggregates.samplePockets = result.samplePockets;
  }
}

/**
 * Turn an accumulator into the public aggregate result object. Identical shape
 * for the synchronous and asynchronous runners.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {object} params Run parameters (spins, experiments, event, jackpotPocket).
 * @returns {object} The aggregate result.
 */
function finalizeAggregates(aggregates, { spins, experiments, event, jackpotPocket }) {
  return {
    spins,
    experiments,
    event,
    jackpotPocket,
    totalSpins: spins * experiments,
    totalEventHits: aggregates.totalEventHits,
    empiricalEventRate: aggregates.totalEventHits / (spins * experiments),
    meanEventCount: aggregates.totalEventHits / experiments,
    countHistogram: aggregates.countHistogram,
    firstHitHistogram: aggregates.firstHitHistogram,
    censoredCount: aggregates.censoredCount,
    restrictedWaitingMean: aggregates.restrictedWaitingSum / experiments,
    colourCounts: aggregates.colourCounts,
    samplePockets: aggregates.samplePockets,
  };
}



/**
 * Run `experiments` independent roulette experiments and return aggregates.
 *
 * One RNG is chosen ONCE for the whole run (seeded or `Math.random`). The same
 * seed is never reset per experiment — doing so would repeat identical
 * experiments instead of producing a reproducible sequence of independent
 * draws. Each experiment uses `simulateRouletteExperiment`.
 *
 * Waiting-time / censoring policy:
 * - Every experiment is observed for exactly `spins` trials.
 * - An experiment with no event is recorded as right-censored at `spins`: it is
 *   not discarded and it is NOT counted as a hit at `spins`.
 * - `firstHitHistogram[k]` counts experiments whose first success was at spin
 *   `k` (index 0 is unused); `censoredCount` counts experiments with no
 *   success. Identity: `sum(firstHitHistogram) + censoredCount === experiments`.
 *   The later UI compares `firstHitHistogram[k] / experiments` with Geometric
 *   `P(T = k)`, and `censoredCount / experiments` with `P(T > spins)`. The
 *   histogram must NOT be divided by the observed-success count.
 * - `restrictedWaitingMean` is the empirical mean of `min(T, spins)` (using
 *   `firstHit` when observed, otherwise `spins`). It is NOT an estimate of the
 *   full geometric mean. Its theoretical comparison is
 *   `E[min(T, n)] = (1 - (1 - p)^n) / p`, whereas the full geometric mean stays
 *   `E[T] = 1 / p`.
 *
 * The engine is synchronous. The maximum work is `5000 * 5000 = 25,000,000`
 * spins; this must NOT be run unbounded on the browser main thread without
 * scheduling. `simulateRouletteExperiment` is the future boundary for bounded
 * UI execution and aggregation. No full spin history or per-experiment array is
 * retained; only aggregates and the first experiment's small sample.
 *
 * The result keeps full precision and contains no theoretical PMFs or means.
 *
 * @param {object} params
 * @param {number} params.spins Spins per experiment; integer in [1, 5000].
 * @param {number} params.experiments Number of experiments; integer in
 *   [1, 5000]. The future UI keeps the user within [50, 5000].
 * @param {'red'|'black'|'green'|'straight-up'} params.event Target event.
 * @param {number} [params.jackpotPocket] Straight-up target pocket; integer in
 *   [0, 36]. Defaults to 0.
 * @param {number} [params.seed] Optional seed (nonnegative safe integer; seed 0
 *   is valid). Omitted/`undefined` uses `Math.random`. An invalid supplied seed
 *   is rejected.
 * @returns {{
 *   spins: number,
 *   experiments: number,
 *   event: string,
 *   jackpotPocket: number,
 *   totalSpins: number,
 *   totalEventHits: number,
 *   empiricalEventRate: number,
 *   meanEventCount: number,
 *   countHistogram: number[],
 *   firstHitHistogram: number[],
 *   censoredCount: number,
 *   restrictedWaitingMean: number,
 *   colourCounts: { red: number, black: number, green: number },
 *   samplePockets: number[],
 * }} Aggregate results.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function runRouletteSimulation({ spins, experiments, event, jackpotPocket = 0, seed }) {
  assertIntegerInRange(spins, 'spins', MIN_SPINS, MAX_SPINS);
  assertIntegerInRange(experiments, 'experiments', MIN_EXPERIMENTS, MAX_EXPERIMENTS);
  assertEvent(event);
  assertPocket(jackpotPocket);

  // Validate the seed before choosing the RNG so invalid seeds fail fast.
  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }
  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  const aggregates = createAggregates(spins);

  for (let experimentIndex = 0; experimentIndex < experiments; experimentIndex += 1) {
    const result = simulateRouletteExperiment({ spins, event, jackpotPocket, rng });
    accumulateExperiment(aggregates, result, experimentIndex, spins);
  }

  return finalizeAggregates(aggregates, { spins, experiments, event, jackpotPocket });
}


/** Target number of spins processed before yielding to the event loop. */
const SPIN_BUDGET_PER_CHUNK = 50000;
/** Soft wall-clock budget (ms) for one chunk, checked between experiments. */
const CHUNK_TIME_BUDGET_MS = 10;
/** Approximate number of intermediate progress updates per run. */
const PROGRESS_UPDATES_TARGET = 50;

/**
 * Create the error used when a run is cancelled. Prefers the DOM `AbortError`
 * so callers can detect it by `name`; falls back to a plain Error with the same
 * name in non-browser environments.
 *
 * @returns {Error} An error whose `name` is `"AbortError"`.
 */
function createAbortError() {
  const message = 'Roulette simulation was cancelled.';
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
 * Run the same roulette simulation as {@link runRouletteSimulation}, but in
 * bounded asynchronous chunks so the browser stays responsive.
 *
 * Behaviour and result are identical to the synchronous runner for the same
 * inputs and seed: one RNG is created once and never reset, experiment order and
 * random-draw order are preserved, and both paths share the same aggregation
 * helpers.
 *
 * Chunking: each experiment is atomic (at most `MAX_SPINS` spins). Up to
 * `max(1, floor(50000 / spins))` experiments are processed per chunk, or fewer
 * if the soft ~10 ms time budget is exceeded; the loop then yields to the event
 * loop. The whole synchronous run is never wrapped in a single timer.
 *
 * Progress: `onProgress` receives `{ completedExperiments, totalExperiments }`.
 * Initial (0) and final (= experiments) updates are always emitted; intermediate
 * updates are throttled to roughly {@link PROGRESS_UPDATES_TARGET} per run.
 *
 * Cancellation: `signal` is checked before work starts, between experiments,
 * after every yield, and before publishing the result. On abort an `AbortError`
 * is thrown and no partial result is returned.
 *
 * @param {object} params
 * @param {number} params.spins Spins per experiment; integer in [1, 5000].
 * @param {number} params.experiments Number of experiments; integer in [1, 5000].
 * @param {'red'|'black'|'green'|'straight-up'} params.event Target event.
 * @param {number} [params.jackpotPocket] Straight-up target pocket; integer in [0, 36].
 * @param {number} [params.seed] Optional seed (nonnegative safe integer; seed 0
 *   is valid). Omitted/`undefined` uses `Math.random`. An invalid supplied seed
 *   is rejected.
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completedExperiments: number, totalExperiments: number }) => void}
 *   [params.onProgress] Optional progress callback.
 * @returns {Promise<object>} The same aggregate result as
 *   {@link runRouletteSimulation}.
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if the run is cancelled.
 */
export async function runRouletteSimulationAsync({
  spins,
  experiments,
  event,
  jackpotPocket = 0,
  seed,
  signal,
  onProgress,
}) {
  assertIntegerInRange(spins, 'spins', MIN_SPINS, MAX_SPINS);
  assertIntegerInRange(experiments, 'experiments', MIN_EXPERIMENTS, MAX_EXPERIMENTS);
  assertEvent(event);
  assertPocket(jackpotPocket);
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
  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }

  // Abort before work begins.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const rng = hasSeed ? createSeededRng(seed) : Math.random;
  const aggregates = createAggregates(spins);

  const report = (completedExperiments) => {
    if (onProgress) {
      onProgress({ completedExperiments, totalExperiments: experiments });
    }
  };

  const experimentsPerChunk = Math.max(1, Math.floor(SPIN_BUDGET_PER_CHUNK / spins));
  const progressStep = Math.max(1, Math.ceil(experiments / PROGRESS_UPDATES_TARGET));
  let lastReported = 0;

  report(0);

  let completed = 0;
  while (completed < experiments) {
    const chunkEnd = Math.min(experiments, completed + experimentsPerChunk);
    const chunkStartTime = Date.now();

    while (completed < chunkEnd) {
      // Check between experiments so cancellation is prompt.
      if (signal && signal.aborted) {
        throw createAbortError();
      }

      const result = simulateRouletteExperiment({ spins, event, jackpotPocket, rng });
      accumulateExperiment(aggregates, result, completed, spins);
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
    if (completed < experiments) {
      await yieldToEventLoop();

      // Re-check after yielding, before continuing.
      if (signal && signal.aborted) {
        throw createAbortError();
      }
    }
  }

  // Final completion update.
  report(experiments);

  // Check once more before publishing the completed result.
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  return finalizeAggregates(aggregates, { spins, experiments, event, jackpotPocket });
}


