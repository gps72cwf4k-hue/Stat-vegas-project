/**
 * Two Dice simulation engine.
 *
 * Rolls two independent fair dice `n` times and reports the empirical joint
 * distribution of a chosen pair of random variables:
 * - `'xy'`: the two faces `(X, Y)`, a 6x6 table;
 * - `'sm'`: the sum and maximum `(S = X + Y, M = max(X, Y))`, an 11x6 table
 *   (`S = 2..12` by `M = 1..6`) whose impossible cells are always 0.
 *
 * It computes the empirical marginals (twice: once from the joint table and
 * once by direct counting, which must agree), the sample covariance with
 * divisor `n - 1`, its standard error, a z-score against the exact theory, the
 * sample correlation, a goodness-of-fit chi-square test of the joint table and
 * — for `(X, Y)` — a chi-square test of independence. It also samples up to
 * {@link MAX_DEMO_POINTS} uniform points on the unit square for the continuous
 * density demo.
 *
 * All theory values come from the pure module `src/math/twoDice.js`; the
 * chi-square tail uses the shared `chiSquarePValue` from `src/simulation/poker.js`.
 * This module is independent of React and the UI. Seeded runs are reproducible
 * and the synchronous and asynchronous runners return deeply equal snapshots
 * for the same seed (they share the accumulation helpers and consume the RNG in
 * the same order).
 */

import { createSeededRng } from './rng.js';
import { chiSquarePValue } from './poker.js';
import {
  FACE_COUNT,
  MIN_FACE,
  getJointPmfSM,
  exactCovarianceSM,
  exactCorrelationSM,
  momentsS,
  momentsM,
} from '../math/twoDice.js';

/** Engine bounds for the number of rolls (1 allowed so tests can use tiny runs). */
const MIN_N = 1;
const MAX_N = 20000;

/** Supported pair selectors. */
const PAIR_TYPES = ['xy', 'sm'];

/** Default rectangle extents for the continuous demo. */
const DEFAULT_RECTANGLE_A = 0.5;
const DEFAULT_RECTANGLE_B = 0.5;

/** Maximum number of unit-square demo points retained (spec: min(N, 2000)). */
const MAX_DEMO_POINTS = 2000;

/** Target number of rolls processed before yielding to the event loop. */
const ROLL_BUDGET_PER_CHUNK = 50000;
/** Soft wall-clock budget (ms) for one chunk, checked between rolls. */
const CHUNK_TIME_BUDGET_MS = 10;
/** Approximate number of intermediate progress updates per run. */
const PROGRESS_UPDATES_TARGET = 50;

/* ------------------------------------------------------------------ *
 * Validation helpers (same conventions as the other engines).
 * ------------------------------------------------------------------ */

/**
 * Validate an integer parameter within an inclusive range.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not an integer within `[low, high]`.
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
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a finite number within `[low, high]`.
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
 * Validate the pair selector.
 * @param {unknown} pairType Candidate selector.
 * @throws {TypeError} If `pairType` is not one of {@link PAIR_TYPES}.
 */
function assertPairType(pairType) {
  if (typeof pairType !== 'string' || !PAIR_TYPES.includes(pairType)) {
    throw new TypeError(
      `pairType must be one of ${PAIR_TYPES.join(', ')}, received ${String(pairType)}.`,
    );
  }
}

/**
 * Assert that a value is a usable random source: a function.
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`two dice simulation requires an rng function, received ${typeof rng}.`);
  }
}


/* ------------------------------------------------------------------ *
 * Geometry of the two joint tables.
 * ------------------------------------------------------------------ */

/**
 * Describe the shape and axis labels of the joint table for a pair selector.
 *
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {{ rows: number, cols: number, rowLabels: number[], colLabels: number[] }}
 *   Table shape and the discrete value behind each row/column index.
 */
export function getJointTableGeometry(pairType) {
  assertPairType(pairType);
  if (pairType === 'xy') {
    return {
      rows: FACE_COUNT,
      cols: FACE_COUNT,
      rowLabels: Array.from({ length: FACE_COUNT }, (_, i) => i + MIN_FACE),
      colLabels: Array.from({ length: FACE_COUNT }, (_, j) => j + MIN_FACE),
    };
  }
  // (S, M): S = 2..12 (11 rows) by M = 1..6 (6 columns).
  return {
    rows: 11,
    cols: FACE_COUNT,
    rowLabels: Array.from({ length: 11 }, (_, i) => i + 2),
    colLabels: Array.from({ length: FACE_COUNT }, (_, j) => j + 1),
  };
}

/**
 * The theoretical probability of every cell of the joint table for a selector,
 * as a nested array of numbers (never rounded strings).
 *
 * For `'xy'` every cell is `1/36`. For `'sm'` the piecewise rule is
 * `1/36` on the diagonal `s = 2m`, `2/36` for `m + 1 <= s <= 2m - 1` and `0`
 * outside the support.
 *
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {number[][]} Nested `rows x cols` array of theoretical probabilities.
 */
export function getTheoreticalJointProbabilities(pairType) {
  assertPairType(pairType);
  if (pairType === 'xy') {
    return Array.from({ length: FACE_COUNT }, () =>
      Array.from({ length: FACE_COUNT }, () => 1 / 36),
    );
  }
  const table = getJointPmfSM();
  return table.map((row) => row.map((cell) => Number(cell.num) / Number(cell.den)));
}

/**
 * The boolean support mask of the joint table: `true` where the theoretical
 * probability is positive. For `(S, M)` this is the 21-cell support; for
 * `(X, Y)` all 36 cells are supported.
 *
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {boolean[][]} Nested `rows x cols` support mask.
 */
export function getJointSupportMask(pairType) {
  return getTheoreticalJointProbabilities(pairType).map((row) => row.map((p) => p > 0));
}

/* ------------------------------------------------------------------ *
 * Simulating individual rolls.
 * ------------------------------------------------------------------ */

/**
 * Draw one fair die face from a uniform source in [0, 1).
 *
 * Uses the bin `1 + floor(rng() * 6)`, which is unbiased for a source uniform
 * on [0, 1): each face 1..6 has equal probability 1/6. Values are clamped to
 * `1..6` only to guard against a source returning exactly 1 in floating point.
 *
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number} A face in `1..6`.
 */
function rollOneDie(rng) {
  const face = 1 + Math.floor(rng() * FACE_COUNT);
  if (face < MIN_FACE) return MIN_FACE;
  if (face > MIN_FACE + FACE_COUNT - 1) return MIN_FACE + FACE_COUNT - 1;
  return face;
}

/**
 * Simulate one roll of two independent fair dice and derive the two pairs.
 *
 * Consumes exactly two random draws.
 *
 * @param {object} params
 * @param {() => number} params.rng Random source returning numbers in [0, 1).
 * @returns {{ x: number, y: number, s: number, m: number }} The two faces and
 *   their sum `s = x + y` and maximum `m = max(x, y)`.
 * @throws {TypeError} If `rng` is not a function.
 */
export function simulateTwoDiceTrial({ rng } = {}) {
  assertRng(rng);
  const x = rollOneDie(rng);
  const y = rollOneDie(rng);
  return { x, y, s: x + y, m: Math.max(x, y) };
}

/**
 * Map a trial to the `(a, b)` pair used for covariance, given the selector.
 *
 * @param {{ x: number, y: number, s: number, m: number }} trial One roll.
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {{ a: number, b: number }} The selected pair.
 */
function pairForTrial(trial, pairType) {
  return pairType === 'xy' ? { a: trial.x, b: trial.y } : { a: trial.s, b: trial.m };
}

/**
 * The exact theory summary for a pair selector, taken from the math module.
 *
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {{
 *   covTheory: number, corrTheory: number, meanA: number, meanB: number,
 *   labelA: string, labelB: string,
 * }} Exact-theory values and axis labels.
 */
export function getTheoryForPair(pairType) {
  assertPairType(pairType);
  if (pairType === 'xy') {
    return {
      covTheory: 0,
      corrTheory: 0,
      meanA: 7 / 2,
      meanB: 7 / 2,
      labelA: 'X',
      labelB: 'Y',
    };
  }
  const { covSM } = exactCovarianceSM();
  const { rhoValue } = exactCorrelationSM();
  return {
    covTheory: Number(covSM.num) / Number(covSM.den),
    corrTheory: rhoValue,
    meanA: momentsS().eSValue,
    meanB: momentsM().eMValue,
    labelA: 'S',
    labelB: 'M',
  };
}

/* ------------------------------------------------------------------ *
 * Accumulators (O(1) memory: counts plus raw power sums).
 * ------------------------------------------------------------------ */

/**
 * Create a mutable accumulator for the roll loop.
 *
 * The joint table holds integer counts. Direct marginals are counted separately
 * from the table so the two can be cross-checked. The sampled pairs `(a_i, b_i)`
 * are kept in two plain arrays (bounded by N <= 20 000) so the covariance and
 * its standard error can be computed exactly with the sample means in a second
 * pass; deriving the centered-product variance from raw power sums would suffer
 * catastrophic cancellation.
 *
 * @param {'xy'|'sm'} pairType Pair selector.
 * @returns {object} A mutable accumulator.
 */
function createAggregates(pairType) {
  const geometry = getJointTableGeometry(pairType);
  return {
    pairType,
    geometry,
    jointCounts: Array.from({ length: geometry.rows }, () => new Array(geometry.cols).fill(0)),
    // Direct marginals (counted independently of the joint table).
    marginalACounts: new Array(geometry.rows).fill(0),
    marginalBCounts: new Array(geometry.cols).fill(0),
    // Stored sample pairs for exact covariance/SE/correlation computation.
    samplesA: [],
    samplesB: [],
    count: 0,
  };
}

/**
 * Fold one trial into the accumulator.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {{ x: number, y: number, s: number, m: number }} trial One roll.
 * @returns {void}
 */
function accumulateTrial(aggregates, trial) {
  const { geometry, pairType } = aggregates;
  const { a, b } = pairForTrial(trial, pairType);
  const rowIndex = geometry.rowLabels.indexOf(a);
  const colIndex = geometry.colLabels.indexOf(b);

  if (rowIndex < 0 || colIndex < 0) {
    throw new RangeError(
      `accumulateTrial: value (${a}, ${b}) is outside the ${pairType} table labels.`,
    );
  }

  // Guard: for (S, M) the (a, b) = (s, m) pair must lie in the support
  // m + 1 <= s <= 2m. A roll produces valid dice, so this never fires in
  // normal operation; it protects against a future layout/label mistake that
  // would otherwise silently increment an impossible (greyed) cell.
  if (pairType === 'sm' && !(b + 1 <= a && a <= 2 * b)) {
    throw new RangeError(
      `accumulateTrial: (s=${a}, m=${b}) is an impossible (S, M) cell outside m + 1 <= s <= 2m.`,
    )
  }

  aggregates.jointCounts[rowIndex][colIndex] += 1;
  aggregates.marginalACounts[rowIndex] += 1;
  aggregates.marginalBCounts[colIndex] += 1;

  aggregates.samplesA.push(a);
  aggregates.samplesB.push(b);
  aggregates.count += 1;
}


/* ------------------------------------------------------------------ *
 * Chi-square tests.
 * ------------------------------------------------------------------ */

/**
 * Pearson goodness-of-fit chi-square test of an observed count table against a
 * theoretical probability table restricted to a support mask.
 *
 * The statistic is `chi2 = sum over supported cells of (O - E)^2 / E` with
 * `E = N * p_cell`, degrees of freedom `dof = (number of supported cells) - 1`,
 * and `pValue = P(ChiSquare(dof) >= chi2)` (a single sample's summary, uniform
 * under a correct model, never a proof).
 *
 * @param {object} params
 * @param {number[][]} params.observedTable Observed integer counts.
 * @param {number[][]} params.expectedPmf Theoretical probabilities per cell.
 * @param {boolean[][]} [params.supportMask] Cells to include; defaults to
 *   `expectedPmf > 0`.
 * @returns {{
 *   chi2: number, dof: number, pValue: number, supportCells: number,
 *   totalCount: number,
 * }} The test result.
 * @throws {TypeError} If the tables are not matching nonempty matrices.
 * @throws {RangeError} If a supported expected cell would have zero mass.
 */
export function gofChiSquare({ observedTable, expectedPmf, supportMask } = {}) {
  assertMatrix(observedTable, 'observedTable');
  assertMatrix(expectedPmf, 'expectedPmf');
  const rows = observedTable.length;
  const cols = observedTable[0].length;
  if (expectedPmf.length !== rows || expectedPmf[0].length !== cols) {
    throw new TypeError('observedTable and expectedPmf must have the same shape.');
  }
  const mask = supportMask ?? expectedPmf.map((row) => row.map((p) => p > 0));
  assertBooleanMatrix(mask, 'supportMask');

  let totalCount = 0;
  for (const row of observedTable) {
    for (const value of row) totalCount += value;
  }

  let supportCells = 0;
  let chi2 = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      if (!mask[i][j]) continue;
      supportCells += 1;
      const expected = totalCount * expectedPmf[i][j];
      if (expected <= 0) {
        throw new RangeError(
          `gofChiSquare: supported cell (${i}, ${j}) has zero expected count.`,
        );
      }
      const difference = observedTable[i][j] - expected;
      chi2 += (difference * difference) / expected;
    }
  }

  const dof = supportCells - 1;
  const pValue = dof > 0 ? chiSquarePValue({ chi2, dof }) : 1;
  return { chi2, dof, pValue, supportCells, totalCount };
}

/**
 * Pearson chi-square test of independence for a two-way contingency table.
 *
 * Expected counts are `E_ij = (row_i * col_j) / N`, the statistic is
 * `chi2 = sum (O - E)^2 / E` over all cells and `dof = (rows - 1) * (cols - 1)`.
 * Zero row/column margins are tolerated (their cells contribute nothing).
 *
 * @param {number[][]} observedTable Nonnegative integer counts.
 * @returns {{
 *   chi2: number, dof: number, pValue: number, totalCount: number,
 * }} The test result.
 * @throws {TypeError} If `observedTable` is not a nonempty numeric matrix.
 * @throws {RangeError} If there are fewer than two rows or two columns.
 */
export function independenceChiSquare(observedTable) {
  assertMatrix(observedTable, 'observedTable');
  const rows = observedTable.length;
  const cols = observedTable[0].length;
  if (rows < 2 || cols < 2) {
    throw new RangeError('independenceChiSquare requires at least a 2x2 table.');
  }

  const rowTotals = new Array(rows).fill(0);
  const colTotals = new Array(cols).fill(0);
  let totalCount = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      rowTotals[i] += observedTable[i][j];
      colTotals[j] += observedTable[i][j];
      totalCount += observedTable[i][j];
    }
  }
  if (totalCount === 0) {
    throw new RangeError('independenceChiSquare requires a positive total count.');
  }

  let chi2 = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const expected = (rowTotals[i] * colTotals[j]) / totalCount;
      if (expected <= 0) continue;
      const difference = observedTable[i][j] - expected;
      chi2 += (difference * difference) / expected;
    }
  }

  const dof = (rows - 1) * (cols - 1);
  return { chi2, dof, pValue: chiSquarePValue({ chi2, dof }), totalCount };
}

/**
 * Validate a nonempty rectangular matrix of finite numbers.
 * @param {unknown} matrix Candidate matrix.
 * @param {string} name Parameter name for the error message.
 * @throws {TypeError} If `matrix` is not a nonempty numeric matrix.
 */
function assertMatrix(matrix, name) {
  if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    throw new TypeError(`${name} must be a nonempty matrix of numbers.`);
  }
  const cols = matrix[0].length;
  if (cols === 0) {
    throw new TypeError(`${name} rows must be nonempty.`);
  }
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new TypeError(`${name} must be rectangular.`);
    }
    for (const value of row) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} entries must be finite numbers.`);
      }
    }
  }
}

/**
 * Validate a nonempty rectangular matrix of booleans.
 * @param {unknown} matrix Candidate matrix.
 * @param {string} name Parameter name for the error message.
 * @throws {TypeError} If `matrix` is not a nonempty boolean matrix.
 */
function assertBooleanMatrix(matrix, name) {
  if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    throw new TypeError(`${name} must be a nonempty matrix of booleans.`);
  }
  const cols = matrix[0].length;
  if (cols === 0) {
    throw new TypeError(`${name} rows must be nonempty.`);
  }
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new TypeError(`${name} must be rectangular.`);
    }
    for (const value of row) {
      if (typeof value !== 'boolean') {
        throw new TypeError(`${name} entries must be booleans.`);
      }
    }
  }
}


/* ------------------------------------------------------------------ *
 * Finalizing a run into the public snapshot.
 * ------------------------------------------------------------------ */

/**
 * Compute the empirical marginals of the joint count table (axis 0 and axis 1).
 * @param {number[][]} jointCounts Count table.
 * @returns {{ marginalA: number[], marginalB: number[] }} Marginals by count.
 */
function marginalsFromJoint(jointCounts) {
  const rows = jointCounts.length;
  const cols = jointCounts[0].length;
  const marginalA = new Array(rows).fill(0);
  const marginalB = new Array(cols).fill(0);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      marginalA[i] += jointCounts[i][j];
      marginalB[j] += jointCounts[i][j];
    }
  }
  return { marginalA, marginalB };
}

/**
 * Turn an accumulator into the public result. Identical shape for the
 * synchronous and asynchronous runners.
 *
 * @param {object} aggregates Accumulator from {@link createAggregates}.
 * @param {{ n: number, seedUsed: number|null, a: number, b: number,
 *   demoCount: number, demoU: number[], demoV: number[] }} meta Run metadata.
 * @returns {object} The public result snapshot.
 */
function finalizeSnapshot(aggregates, meta) {
  const { pairType, geometry } = aggregates;
  const n = aggregates.count;
  const theory = getTheoryForPair(pairType);

  const { marginalA: jointMarginalA, marginalB: jointMarginalB } = marginalsFromJoint(
    aggregates.jointCounts,
  );

  const { samplesA, samplesB } = aggregates;
  const meanA = n > 0 ? samplesA.reduce((sum, v) => sum + v, 0) / n : 0;
  const meanB = n > 0 ? samplesB.reduce((sum, v) => sum + v, 0) / n : 0;

  // Exact centered statistics, computed with the sample means in one pass.
  let cross = 0; // sum (a_i - meanA)(b_i - meanB)
  let varSumA = 0; // sum (a_i - meanA)^2
  let varSumB = 0; // sum (b_i - meanB)^2
  const centeredProducts = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const da = samplesA[i] - meanA;
    const db = samplesB[i] - meanB;
    const product = da * db;
    centeredProducts[i] = product;
    cross += product;
    varSumA += da * da;
    varSumB += db * db;
  }

  // Sample covariance with divisor (n - 1).
  const covHat = n > 1 ? cross / (n - 1) : 0;

  // Standard error of the covariance: sd of the centered product / sqrt(n).
  let varP = 0;
  if (n > 1) {
    const meanP = cross / n;
    let sumSquaredDeviation = 0;
    for (let i = 0; i < n; i += 1) {
      const deviation = centeredProducts[i] - meanP;
      sumSquaredDeviation += deviation * deviation;
    }
    varP = sumSquaredDeviation / (n - 1);
  }
  if (varP < 0) varP = 0;
  const seCov = Math.sqrt(varP) / Math.sqrt(n);

  const zScore = seCov > 0 ? (covHat - theory.covTheory) / seCov : 0;

  // Sample variances (divisor n - 1) for the correlation.
  const varA = n > 1 ? varSumA / (n - 1) : 0;
  const varB = n > 1 ? varSumB / (n - 1) : 0;
  const sdA = Math.sqrt(Math.max(0, varA));
  const sdB = Math.sqrt(Math.max(0, varB));
  const corrHat = sdA > 0 && sdB > 0 ? covHat / (sdA * sdB) : 0;

  // Chi-square tests.
  const expectedPmf = getTheoreticalJointProbabilities(pairType);
  const supportMask = getJointSupportMask(pairType);
  const chiSquareGof = gofChiSquare({
    observedTable: aggregates.jointCounts,
    expectedPmf,
    supportMask,
  });
  const chiSquareIndependence =
    pairType === 'xy' ? independenceChiSquare(aggregates.jointCounts) : null;

  // Empirical marginals as probabilities (from the joint table).
  const marginalAFromJoint = jointMarginalA.map((count) => count / n);
  const marginalBFromJoint = jointMarginalB.map((count) => count / n);
  // Direct marginals as probabilities (counted independently).
  const marginalADirect = aggregates.marginalACounts.map((count) => count / n);
  const marginalBDirect = aggregates.marginalBCounts.map((count) => count / n);

  const marginalsMatch =
    marginalAFromJoint.every((p, i) => Math.abs(p - marginalADirect[i]) < 1e-12) &&
    marginalBFromJoint.every((p, j) => Math.abs(p - marginalBDirect[j]) < 1e-12);

  return {
    pairType,
    n,
    seedUsed: meta.seedUsed,
    rectangle: { a: meta.a, b: meta.b },
    rowLabels: geometry.rowLabels,
    colLabels: geometry.colLabels,
    jointCounts: aggregates.jointCounts,
    jointFrequencies: aggregates.jointCounts.map((row) => row.map((count) => count / n)),
    expectedJointProbabilities: expectedPmf,
    supportMask,
    // Marginals from the joint table and by direct counting (must agree).
    marginalAFromJoint,
    marginalBFromJoint,
    marginalADirect,
    marginalBDirect,
    marginalsMatch,
    labelA: theory.labelA,
    labelB: theory.labelB,
    meanA,
    meanB,
    covHat,
    covTheory: theory.covTheory,
    seCov,
    zScore,
    corrHat,
    corrTheory: theory.corrTheory,
    chiSquareGof,
    chiSquareIndependence,
    // Continuous density demo data (unit-square points).
    demoCount: meta.demoCount,
    demoU: meta.demoU,
    demoV: meta.demoV,
  };
}

/**
 * Draw up to {@link MAX_DEMO_POINTS} uniform points on the unit square.
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @param {number} n Number of rolls (so the sample size is `min(n, cap)`).
 * @returns {{ demoCount: number, demoU: number[], demoV: number[] }} The points.
 */
function drawDemoPoints(rng, n) {
  const demoCount = Math.min(n, MAX_DEMO_POINTS);
  const demoU = new Array(demoCount);
  const demoV = new Array(demoCount);
  for (let i = 0; i < demoCount; i += 1) {
    demoU[i] = rng();
    demoV[i] = rng();
  }
  return { demoCount, demoU, demoV };
}


/* ------------------------------------------------------------------ *
 * Abort/yield helpers and the public runners.
 * ------------------------------------------------------------------ */

/**
 * Build an `AbortError` (name `"AbortError"`) for a cancelled run.
 * @returns {Error} An error whose `name` is `"AbortError"`.
 */
function createAbortError() {
  const message = 'Two Dice simulation was cancelled.';
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Yield control back to the event loop so the UI can repaint and process input.
 * @returns {Promise<void>} Resolves on the next macrotask.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Validate the shared run arguments (before touching the RNG).
 * @param {object} params Raw run arguments.
 * @param {number} params.n Number of rolls.
 * @param {'xy'|'sm'} params.pairType Pair selector.
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {Function} [params.onProgress] Optional progress callback.
 */
function assertRunArguments({ n, pairType, signal, onProgress }) {
  assertIntegerInRange(n, 'n', MIN_N, MAX_N);
  assertPairType(pairType);
  if (
    signal !== undefined &&
    (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')
  ) {
    throw new TypeError('signal must be an AbortSignal when provided.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function when provided.');
  }
}

/**
 * Run the Two Dice simulation synchronously.
 *
 * Rolls two fair dice `n` times and returns the joint distribution, marginals,
 * covariance statistics and chi-square tests, plus the continuous-demo points.
 *
 * @param {object} params
 * @param {number} params.n Number of rolls; integer in `[1, 20000]`.
 * @param {'xy'|'sm'} params.pairType Which pair of variables to tabulate.
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {number} [params.a] Demo rectangle width in `[0, 1]` (default 0.5).
 * @param {number} [params.b] Demo rectangle height in `[0, 1]` (default 0.5).
 * @returns {object} The result snapshot.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function runTwoDiceSimulation({
  n,
  pairType,
  seed,
  a = DEFAULT_RECTANGLE_A,
  b = DEFAULT_RECTANGLE_B,
} = {}) {
  assertRunArguments({ n, pairType });
  assertNumberInRange(a, 'a', 0, 1);
  assertNumberInRange(b, 'b', 0, 1);

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }
  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  const aggregates = createAggregates(pairType);
  for (let i = 0; i < n; i += 1) {
    accumulateTrial(aggregates, simulateTwoDiceTrial({ rng }));
  }
  const demo = drawDemoPoints(rng, n);

  return finalizeSnapshot(aggregates, {
    n,
    seedUsed: hasSeed ? seed : null,
    a,
    b,
    ...demo,
  });
}


/**
 * Run the Two Dice simulation with chunked, cancellable execution.
 *
 * Behaviour and result are identical to {@link runTwoDiceSimulation} for the
 * same seed and inputs: one RNG is created once, the draw order is preserved,
 * and both paths share the same accumulation and finalization helpers.
 *
 * @param {object} params
 * @param {number} params.n Number of rolls; integer in `[1, 20000]`.
 * @param {'xy'|'sm'} params.pairType Which pair of variables to tabulate.
 * @param {number} [params.seed] Optional nonnegative safe-integer seed.
 * @param {number} [params.a] Demo rectangle width in `[0, 1]` (default 0.5).
 * @param {number} [params.b] Demo rectangle height in `[0, 1]` (default 0.5).
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completedRolls: number, totalRolls: number }) => void}
 *   [params.onProgress] Optional progress callback.
 * @returns {Promise<object>} The same snapshot as {@link runTwoDiceSimulation}.
 * @throws {TypeError|RangeError} If any argument is invalid.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if the run is cancelled.
 */
export async function runTwoDiceSimulationAsync({
  n,
  pairType,
  seed,
  a = DEFAULT_RECTANGLE_A,
  b = DEFAULT_RECTANGLE_B,
  signal,
  onProgress,
} = {}) {
  assertRunArguments({ n, pairType, signal, onProgress });
  assertNumberInRange(a, 'a', 0, 1);
  assertNumberInRange(b, 'b', 0, 1);

  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }

  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const rng = hasSeed ? createSeededRng(seed) : Math.random;
  const aggregates = createAggregates(pairType);

  const report = (completedRolls) => {
    if (onProgress) {
      onProgress({ completedRolls, totalRolls: n });
    }
  };

  const rollsPerChunk = ROLL_BUDGET_PER_CHUNK;
  const progressStep = Math.max(1, Math.ceil(n / PROGRESS_UPDATES_TARGET));
  let lastReported = 0;

  report(0);

  let completed = 0;
  while (completed < n) {
    const chunkEnd = Math.min(n, completed + rollsPerChunk);
    const chunkStartTime = Date.now();

    while (completed < chunkEnd) {
      // Check between rolls so cancellation is prompt.
      if (signal && signal.aborted) {
        throw createAbortError();
      }

      accumulateTrial(aggregates, simulateTwoDiceTrial({ rng }));
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

    if (completed < n) {
      await yieldToEventLoop();
      if (signal && signal.aborted) {
        throw createAbortError();
      }
    }
  }

  report(n);

  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const demo = drawDemoPoints(rng, n);

  return finalizeSnapshot(aggregates, {
    n,
    seedUsed: hasSeed ? seed : null,
    a,
    b,
    ...demo,
  });
}

