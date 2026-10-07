/**
 * Pure mathematics for the Birthday Paradox attraction: the exact uniform-model
 * probabilities over 365 days, the general-distribution dynamic program over an
 * arbitrary day distribution, and helpers to load real US birth weights from the
 * bundled CSV. This module is the single source of truth for the exact theory.
 *
 * It is pure: no randomness, no simulation, no DOM and no React. Every returned
 * value is an unrounded number. The event "all distinct" is computed directly
 * (never as `1 - P(shared)`), so tiny probabilities such as `3.07e-7` at `n=100`
 * are not hidden by rounding.
 *
 * Numerical notes:
 * - `365!` is never formed (it overflows a double at about `2.5e778`). The
 *   falling factorial is evaluated as a sequential product of factors in `(0,1]`.
 * - The general DP uses only non-negative additions (`f_k += k * p * f_{k-1}`),
 *   so there is no cancellation and every intermediate value stays in `[0,1]`.
 */

/** @type {number} Days in the uniform model (leap years ignored). */
export const DAYS_UNIFORM = 365;
/** @type {number} Calendar dates used by the real-data model, including 29 February. */
export const DAYS_CALENDAR = 366;
/**
 * @type {Readonly<Record<string, string>>} Maps a dataset key to its CSV column.
 */
export const DATASET_COLUMNS = Object.freeze({
  ssa_2000_2014: 'births_ssa_2000_2014',
  cdc_1994_2003: 'births_cdc_1994_2003',
});
/**
 * @type {Readonly<Record<string, string>>} Human-readable dataset labels.
 */
export const DATASET_LABELS = Object.freeze({
  ssa_2000_2014: 'SSA 2000-2014',
  cdc_1994_2003: 'CDC/NCHS 1994-2003',
});

/**
 * Validate an integer parameter within an inclusive range.
 * Rejects non-numbers with a TypeError and out-of-range values with a
 * RangeError; never coerces strings, clamps or rounds.
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
 * Validate an array of day probabilities: non-empty, all finite, all
 * non-negative and summing to 1 within a small tolerance. Returns a plain
 * copy so callers cannot mutate the shared input.
 * @param {unknown} pArray Candidate probability array.
 * @param {string} name Parameter name for error messages.
 * @returns {number[]} A defensive copy of the validated probabilities.
 * @throws {TypeError} If `pArray` is not an array.
 * @throws {RangeError} If it is empty, contains a non-finite or negative value,
 *   or does not sum to 1 within `1e-9`.
 */
function validateProbabilityArray(pArray, name) {
  if (!Array.isArray(pArray)) {
    throw new TypeError(`${name} must be an array, received ${typeof pArray}.`);
  }
  if (pArray.length === 0) {
    throw new RangeError(`${name} must not be empty.`);
  }
  const copy = [];
  let total = 0;
  for (let j = 0; j < pArray.length; j += 1) {
    const p = pArray[j];
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw new RangeError(`${name}[${j}] must be a finite number, received ${p}.`);
    }
    if (p < 0) {
      throw new RangeError(`${name}[${j}] must be non-negative, received ${p}.`);
    }
    copy.push(p);
    total += p;
  }
  if (Math.abs(total - 1) > 1e-9) {
    throw new RangeError(`${name} must sum to 1, received total ${total}.`);
  }
  return copy;
}


// ---------------------------------------------------------------------------
// A) Uniform model over 365 days
// ---------------------------------------------------------------------------

/**
 * Exact probability that `n` independent uniform birthdays over 365 days are
 * all distinct, using the product form
 * `prod_{k=1}^{n-1} (1 - k/365)` (the `k=0` factor equals 1). `365!` is never
 * formed.
 *
 * Edge cases: `n <= 1` gives the empty/trivial product `1`; `n > 365` gives `0`
 * by the pigeonhole principle.
 *
 * @param {number} n Number of people; integer in [0, Infinity).
 * @returns {number} `P(all distinct)`, an unrounded number in [0, 1].
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a non-negative integer.
 */
export function probAllDistinctUniform365(n) {
  assertIntegerInRange(n, 'probAllDistinctUniform365 n', 0, Number.MAX_SAFE_INTEGER);
  if (n > DAYS_UNIFORM) {
    return 0;
  }
  let product = 1;
  for (let k = 1; k <= n - 1; k += 1) {
    product *= 1 - k / DAYS_UNIFORM;
  }
  return product;
}

/**
 * Exact probability that at least two of `n` people share a birthday under the
 * uniform 365-day model, `1 - P(all distinct)`.
 *
 * `P(all distinct)` is exported separately ({@link probAllDistinctUniform365})
 * so the UI can display it directly for large `n`, where `1 - P(shared)` would
 * round to `0`.
 *
 * @param {number} n Number of people; integer in [0, Infinity).
 * @returns {number} `P(shared)`, an unrounded number in [0, 1].
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a non-negative integer.
 */
export function probSharedUniform365(n) {
  return 1 - probAllDistinctUniform365(n);
}

/**
 * `P(shared)` for the uniform 365-day model for every `n` in `0..nMax`.
 *
 * The returned array is indexed by `n`, so `result[n] = P(shared for n people)`
 * and `result[0] = 0`, `result[1] = 0`. This matches the DP array convention so
 * the two can be compared element-wise.
 *
 * @param {number} [nMax=100] Highest `n` to include; integer in [0, 100000].
 * @returns {number[]} Array of length `nMax + 1`, indexed by `n`.
 * @throws {TypeError} If `nMax` is not a number.
 * @throws {RangeError} If `nMax` is not an integer in [0, 100000].
 */
export function probSharedUniform365AllN(nMax = 100) {
  assertIntegerInRange(nMax, 'probSharedUniform365AllN nMax', 0, 100000);
  const result = new Array(nMax + 1).fill(0);
  // Walk the product form once, accumulating P(all distinct) incrementally.
  let allDistinct = 1;
  for (let n = 1; n <= nMax; n += 1) {
    if (n > DAYS_UNIFORM) {
      allDistinct = 0;
    } else {
      // Multiply the factor for k = n - 1 (factors for smaller k are already in).
      allDistinct *= 1 - (n - 1) / DAYS_UNIFORM;
    }
    result[n] = 1 - allDistinct;
  }
  return result;
}

/**
 * The exponential approximation to the uniform `P(shared)`,
 * `1 - exp(-n(n-1) / (2 * 365))`. Because `1 - x <= exp(-x)`, this is a LOWER
 * BOUND on the exact uniform value for every `n` (it treats the `C(n,2)` pair
 * events as independent).
 *
 * @param {number} n Number of people; integer in [0, Infinity).
 * @returns {number} The approximation, an unrounded number in [0, 1].
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not a non-negative integer.
 */
export function exponentialApproxLowerBoundUniform365(n) {
  assertIntegerInRange(n, 'exponentialApproxLowerBoundUniform365 n', 0, Number.MAX_SAFE_INTEGER);
  return 1 - Math.exp((-n * (n - 1)) / (2 * DAYS_UNIFORM));
}

// ---------------------------------------------------------------------------
// B) General distribution over `d` days (dynamic program)
// ---------------------------------------------------------------------------

/**
 * Exact `P(all distinct)` for every `n` in `0..nMax` under a general i.i.d.
 * birthday distribution `pArray` (which must sum to 1).
 *
 * Uses the elementary-symmetric-polynomial recurrence in `O(d * nMax)` with only
 * non-negative additions. With `f_k = k! * e_k` over the days processed so far,
 * start `f_0 = 1`, `f_k = 0`; for each day probability `p`, update for
 * `k = nMax` down to `1`: `f_k <- f_k + k * p * f_{k-1}`. After all days,
 * `f_n = P(all distinct for n draws)`.
 *
 * The result is indexed by `n`, so `result[n] = f_n`; `result[0] = 1`.
 *
 * @param {readonly number[]} pArray Day probabilities; finite, non-negative, sum 1.
 * @param {number} nMax Highest `n` to compute; integer in [0, 100000].
 * @returns {number[]} Array of length `nMax + 1` with `result[n] = P(all distinct)`.
 * @throws {TypeError} If `pArray` is not an array or `nMax` is not a number.
 * @throws {RangeError} If `pArray` is invalid or `nMax` is out of range.
 */
export function dpAllDistinctProbabilities(pArray, nMax) {
  const probabilities = validateProbabilityArray(pArray, 'dpAllDistinctProbabilities pArray');
  assertIntegerInRange(nMax, 'dpAllDistinctProbabilities nMax', 0, 100000);

  const f = new Array(nMax + 1).fill(0);
  f[0] = 1;
  for (const p of probabilities) {
    for (let k = nMax; k >= 1; k -= 1) {
      f[k] = f[k] + k * p * f[k - 1];
    }
  }
  return f;
}

/**
 * `P(at least one shared birthday)` for `n` draws from a general distribution,
 * `1 - f[n]` where `f` is the DP of {@link dpAllDistinctProbabilities}.
 *
 * @param {readonly number[]} pArray Day probabilities; finite, non-negative, sum 1.
 * @param {number} n Number of people; integer in [0, 100000].
 * @returns {number} `P(shared)`, an unrounded number in [0, 1].
 * @throws {TypeError} If `pArray` is not an array or `n` is not a number.
 * @throws {RangeError} If `pArray` is invalid or `n` is out of range.
 */
export function probSharedFromWeights(pArray, n) {
  assertIntegerInRange(n, 'probSharedFromWeights n', 0, 100000);
  const f = dpAllDistinctProbabilities(pArray, n);
  return 1 - f[n];
}

/**
 * Sum of squared day probabilities, `sum_j p_j^2`. This is exactly
 * `P(two people share)` (the `n = 2` case) for a general distribution, and it
 * measures how non-uniform the distribution is.
 *
 * @param {readonly number[]} pArray Day probabilities (not required to sum to 1).
 * @returns {number} `sum_j p_j^2`.
 * @throws {TypeError} If `pArray` is not an array.
 * @throws {RangeError} If any entry is non-finite or negative.
 */
export function sumSquares(pArray) {
  if (!Array.isArray(pArray)) {
    throw new TypeError(`sumSquares pArray must be an array, received ${typeof pArray}.`);
  }
  let total = 0;
  for (let j = 0; j < pArray.length; j += 1) {
    const p = pArray[j];
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw new RangeError(`sumSquares pArray[${j}] must be a finite number, received ${p}.`);
    }
    if (p < 0) {
      throw new RangeError(`sumSquares pArray[${j}] must be non-negative, received ${p}.`);
    }
    total += p * p;
  }
  return total;
}


// ---------------------------------------------------------------------------
// C) Real-data weights from the bundled CSV
// ---------------------------------------------------------------------------

/**
 * Parse the bundled `us-births-by-calendar-day.csv` text into rows. The file has
 * a header line `month,day,births_ssa_2000_2014,births_cdc_1994_2003` followed
 * by 366 data rows. Blank lines are ignored; the header is detected and skipped.
 *
 * 29 February (`month=2, day=29`) is a valid row and is preserved.
 *
 * @param {unknown} csvText Raw CSV text.
 * @returns {{ month: number, day: number, birthsSsa2000To2014: number,
 *   birthsCdc1994To2003: number }[]} Parsed rows in file order.
 * @throws {TypeError} If `csvText` is not a string.
 * @throws {RangeError} If a data row is malformed (not four comma-separated
 *   integer fields).
 */
export function parseUsBirthsByCalendarDayCsv(csvText) {
  if (typeof csvText !== 'string') {
    throw new TypeError(
      `parseUsBirthsByCalendarDayCsv csvText must be a string, received ${typeof csvText}.`,
    );
  }
  const rows = [];
  const lines = csvText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '') {
      continue;
    }
    const fields = line.split(',');
    // Skip the header row: its second field is the non-numeric label "day".
    if (index === 0 && fields[1] !== undefined && !/^\d+$/.test(fields[1].trim())) {
      continue;
    }
    if (fields.length !== 4) {
      throw new RangeError(
        `parseUsBirthsByCalendarDayCsv malformed row ${index + 1}: "${line}".`,
      );
    }
    const month = Number(fields[0].trim());
    const day = Number(fields[1].trim());
    const birthsSsa2000To2014 = Number(fields[2].trim());
    const birthsCdc1994To2003 = Number(fields[3].trim());
    if (
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      !Number.isInteger(birthsSsa2000To2014) ||
      !Number.isInteger(birthsCdc1994To2003)
    ) {
      throw new RangeError(
        `parseUsBirthsByCalendarDayCsv non-integer field in row ${index + 1}: "${line}".`,
      );
    }
    rows.push({ month, day, birthsSsa2000To2014, birthsCdc1994To2003 });
  }
  return rows;
}

/**
 * Build normalized day weights (summing to exactly 1) from the bundled CSV for a
 * chosen dataset. The returned `weights` array has 366 entries in file order
 * (January 1 first, 29 February included, December 31 last), so the cumulative
 * array built from it ends at exactly 1 — suitable for the later inverse-CDF
 * sampling step (not implemented here).
 *
 * @param {unknown} csvText Raw CSV text (see {@link parseUsBirthsByCalendarDayCsv}).
 * @param {'ssa_2000_2014' | 'cdc_1994_2003'} datasetKey Which birth column to use.
 * @returns {{ weights: number[], totals: { totalBirths: number },
 *   metadata: { rowCount: number, minWeight: number, maxWeight: number,
 *   minWeightIndex: number, maxWeightIndex: number } }} Normalized weights and
 *   summary metadata.
 * @throws {TypeError} If arguments have the wrong type.
 * @throws {RangeError} If `datasetKey` is unknown or the CSV has no rows.
 */
export function getUsBirthWeightsFromCsv(csvText, datasetKey) {
  const column = DATASET_COLUMNS[datasetKey];
  if (!column) {
    throw new RangeError(
      `getUsBirthWeightsFromCsv unknown datasetKey "${datasetKey}"; ` +
        `expected one of ${Object.keys(DATASET_COLUMNS).join(', ')}.`,
    );
  }
  const rows = parseUsBirthsByCalendarDayCsv(csvText);
  if (rows.length === 0) {
    throw new RangeError('getUsBirthWeightsFromCsv found no data rows.');
  }

  const propertyByColumn = {
    births_ssa_2000_2014: 'birthsSsa2000To2014',
    births_cdc_1994_2003: 'birthsCdc1994To2003',
  };
  const property = propertyByColumn[column];

  const counts = rows.map((row) => row[property]);
  const totalBirths = counts.reduce((sum, value) => sum + value, 0);
  if (totalBirths <= 0) {
    throw new RangeError(
      `getUsBirthWeightsFromCsv total births must be positive, received ${totalBirths}.`,
    );
  }

  const weights = counts.map((value) => value / totalBirths);
  // Force the cumulative sum to end at exactly 1: absorb the floating-point
  // residual of the normalization into the largest weight, so the last entry of
  // any cumulative array equals 1 exactly.
  let sum = 0;
  for (const weight of weights) {
    sum += weight;
  }
  const residual = 1 - sum;

  let maxWeightIndex = 0;
  let minWeightIndex = 0;
  for (let j = 1; j < weights.length; j += 1) {
    if (weights[j] > weights[maxWeightIndex]) {
      maxWeightIndex = j;
    }
    if (weights[j] < weights[minWeightIndex]) {
      minWeightIndex = j;
    }
  }
  weights[maxWeightIndex] += residual;

  return {
    weights,
    totals: { totalBirths },
    metadata: {
      rowCount: rows.length,
      minWeight: weights[minWeightIndex],
      maxWeight: weights[maxWeightIndex],
      minWeightIndex,
      maxWeightIndex,
    },
  };
}

// ---------------------------------------------------------------------------
// D) Reference model comparisons at a given n
// ---------------------------------------------------------------------------

/**
 * Weights for the "calendar-weighted" reference model over 366 dates: each of
 * the 365 ordinary dates shares the remaining mass equally, while 29 February
 * (index 59 in file order, since January has 31 and February 1-28 precede it)
 * gets a fraction `0.25` (a quarter) of an ordinary date. The array sums to
 * exactly 1. This is the reference model of the comparison table in the spec,
 * `P(shared) = 0.5068650` at `n = 23`.
 *
 * @returns {number[]} 366 weights in file order (Jan 1 ... Feb 29 ... Dec 31).
 */
export function calendarWeighted366Weights() {
  const leapFraction = 0.25;
  const ordinary = 1 / (DAYS_UNIFORM + leapFraction);
  const weights = new Array(DAYS_CALENDAR).fill(ordinary);
  weights[59] = leapFraction * ordinary; // 29 February (index 59).
  return weights;
}

/**
 * Uniform weights over 366 calendar dates (each `1/366`), the same support as
 * the real-data model. The last entry is nudged so the total is exactly 1.
 * @returns {number[]} 366 weights, each approximately `1/366`.
 */
export function uniform366Weights() {
  const weights = new Array(DAYS_CALENDAR).fill(1 / DAYS_CALENDAR);
  weights[DAYS_CALENDAR - 1] += 1 - DAYS_CALENDAR * (1 / DAYS_CALENDAR);
  return weights;
}

/**
 * `P(shared)` at a given `n` for the three theory reference models that do not
 * depend on the CSV: uniform over 365 days, calendar-weighted over 366 dates
 * (29 February at 0.246 of an ordinary date) and uniform over 366 days.
 *
 * @param {number} [n=23] Number of people; integer in [0, 100000].
 * @returns {{ uniform365: number, calendarWeighted366: number, uniform366: number }}
 *   The three reference probabilities.
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is not an integer in [0, 100000].
 */
export function referenceModelComparisonsAtN(n = 23) {
  assertIntegerInRange(n, 'referenceModelComparisonsAtN n', 0, 100000);
  return {
    uniform365: probSharedUniform365(n),
    calendarWeighted366: probSharedFromWeights(calendarWeighted366Weights(), n),
    uniform366: probSharedFromWeights(uniform366Weights(), n),
  };
}
