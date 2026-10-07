/**
 * Pure math for the Two Dice attraction (`docs/specs/two-dice.md`).
 *
 * Two independent fair dice: X, Y i.i.d. DiscreteUniform{1,...,6}. The single
 * source of truth is the full enumeration of the 36 ordered outcomes
 * `(x, y) in {1..6}^2`, each with mass 1/36. Every closed form in the spec is
 * verified against that enumeration in `twoDice.test.js`.
 *
 * Covering objects:
 * - Joint PMF of `(X, Y)`, its marginals and independence/moment checks.
 * - PMF and moments of the sum `S = X + Y` and the maximum `M = max(X, Y)`.
 * - Joint PMF of `(S, M)` (21 nonzero cells), its covariance and correlation.
 * - The difference `D = X - Y` and the "uncorrelated does not imply
 *   independent" witness for `(S, D)`.
 * - Minimal continuous demo helpers for the uniform density on the unit square.
 *
 * This module is pure: no randomness, no simulation, no React and no new
 * dependencies. Exact quantities are exposed as reduced BigInt fractions
 * `{ num, den }` together with float mirrors (`*Value`), so callers can choose
 * exact rational comparison or numeric use.
 *
 * @typedef {number} DieFace A die face, an integer in `1..6`.
 * @typedef {{ num: bigint, den: bigint }} Fraction Reduced fraction with a
 *   positive denominator.
 */

/** @type {number} Number of faces on each die. */
export const FACE_COUNT = 6;
/** @type {number} Lowest face value. */
export const MIN_FACE = 1;
/** @type {number} Highest face value. */
export const MAX_FACE = 6;
/** @type {number} Number of ordered outcomes, `36`. */
export const OUTCOME_COUNT = FACE_COUNT * FACE_COUNT;


/* ------------------------------------------------------------------ *
 * Exact reduced fractions (BigInt) — shared helpers and constants.
 * ------------------------------------------------------------------ */

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
 * @returns {Fraction} Reduced fraction.
 * @throws {RangeError} If `den` is zero.
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
 * Exact equality of two fractions via cross-multiplication. Never uses floats.
 * @param {Fraction} a First fraction.
 * @param {Fraction} b Second fraction.
 * @returns {boolean} `true` iff the two rationals are equal.
 */
export function fractionEquals(a, b) {
  return a.num * b.den === b.num * a.den;
}

/**
 * Convert a fraction to the nearest float (numerator divided by denominator).
 * @param {Fraction} fraction Reduced fraction.
 * @returns {number} The unrounded numeric value.
 */
export function fractionToNumber(fraction) {
  return Number(fraction.num) / Number(fraction.den);
}

/**
 * Add two exact fractions.
 * @param {Fraction} a First fraction.
 * @param {Fraction} b Second fraction.
 * @returns {Fraction} Reduced sum.
 */
function addFractions(a, b) {
  return makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

/**
 * Multiply two exact fractions.
 * @param {Fraction} a First fraction.
 * @param {Fraction} b Second fraction.
 * @returns {Fraction} Reduced product.
 */
function multiplyFractions(a, b) {
  return makeFraction(a.num * b.num, a.den * b.den);
}

/**
 * Build the joint PMF of `(X, Y)` from the 36 ordered outcomes and freeze it.
 * Each cell has mass exactly `1/36`. The outer index is X (`0..5` for faces
 * `1..6`) and the inner index is Y (`0..5`).
 * @returns {ReadonlyArray<ReadonlyArray<Fraction>>} Frozen 6x6 array, all 1/36.
 */
export function getJointPmfXY() {
  const cell = makeFraction(1n, 36n);
  return Object.freeze(
    Array.from({ length: FACE_COUNT }, () =>
      Object.freeze(Array.from({ length: FACE_COUNT }, () => cell)),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * B) Marginals.
 * ------------------------------------------------------------------ */

/**
 * Sum a joint table over one axis to obtain a marginal.
 *
 * The table is indexed `joint[i][j]`, where `i` runs over the first variable
 * (X or S) and `j` over the second (Y or M).
 * @param {ReadonlyArray<ReadonlyArray<Fraction>>} joint Nonempty rectangular
 *   matrix of fractions.
 * @param {0 | 1} axis `0` sums out the second variable (marginal of the first);
 *   `1` sums out the first variable (marginal of the second).
 * @returns {Fraction[]} The marginal as a fresh array of reduced fractions.
 * @throws {TypeError} If `joint` is not a nonempty array of arrays.
 * @throws {RangeError} If `axis` is not 0 or 1.
 */
export function getMarginalFromJoint(joint, axis) {
  if (!Array.isArray(joint) || joint.length === 0 || joint.some((row) => !Array.isArray(row))) {
    throw new TypeError('getMarginalFromJoint requires a nonempty array of rows.');
  }
  if (axis !== 0 && axis !== 1) {
    throw new RangeError(`getMarginalFromJoint axis must be 0 or 1, received ${axis}.`);
  }
  const rowCount = joint.length;
  const columnCount = joint[0].length;

  if (axis === 0) {
    return Array.from({ length: rowCount }, (_, i) =>
      joint[i].reduce((sum, cell) => addFractions(sum, cell), ZERO),
    );
  }
  const marginal = Array.from({ length: columnCount }, () => ZERO);
  for (let i = 0; i < rowCount; i += 1) {
    for (let j = 0; j < columnCount; j += 1) {
      marginal[j] = addFractions(marginal[j], joint[i][j]);
    }
  }
  return marginal;
}

/**
 * Marginal PMF of X from the joint table: `1/6` for every face `1..6`.
 * @returns {Fraction[]} Six fractions, all `1/6`.
 */
export function getMarginalX() {
  return getMarginalFromJoint(getJointPmfXY(), 0);
}

/**
 * Marginal PMF of Y from the joint table: `1/6` for every face `1..6`.
 * @returns {Fraction[]} Six fractions, all `1/6`.
 */
export function getMarginalY() {
  return getMarginalFromJoint(getJointPmfXY(), 1);
}

/* ------------------------------------------------------------------ *
 * C) Independence + moments of (X, Y).
 * ------------------------------------------------------------------ */

/**
 * Exact independence check: the joint equals the product of marginals on all
 * 36 cells. Comparison is exact (cross-multiplication), never float.
 * @param {ReadonlyArray<ReadonlyArray<Fraction>>} joint Joint table to test.
 * @returns {{ independent: boolean, firstMismatch: { i: number, j: number } | null }}
 *   The boolean verdict and the first failing cell (or `null`).
 * @throws {TypeError} If `joint` is not a nonempty array of arrays.
 */
export function checkIndependenceXY(joint) {
  if (!Array.isArray(joint) || joint.length === 0 || joint.some((row) => !Array.isArray(row))) {
    throw new TypeError('checkIndependenceXY requires a nonempty array of rows.');
  }
  const margX = getMarginalFromJoint(joint, 0);
  const margY = getMarginalFromJoint(joint, 1);

  for (let i = 0; i < joint.length; i += 1) {
    for (let j = 0; j < joint[i].length; j += 1) {
      const product = multiplyFractions(margX[i], margY[j]);
      if (!fractionEquals(joint[i][j], product)) {
        return { independent: false, firstMismatch: { i, j } };
      }
    }
  }
  return { independent: true, firstMismatch: null };
}

/**
 * Exact moments of `(X, Y)` for the two independent fair dice, computed from
 * the joint table. Results: `E[X] = E[Y] = 7/2`, `Var(X) = Var(Y) = 35/12`,
 * `E[XY] = 49/4`, `Cov(X, Y) = 0`, `Corr(X, Y) = 0`.
 *
 * Each exact member is a reduced `{ num, den }` fraction; the sibling `*Value`
 * members are the same quantities as unrounded floats.
 * @returns {{
 *   eX: Fraction, eY: Fraction, eXY: Fraction,
 *   varX: Fraction, varY: Fraction, covXY: Fraction, corrXY: Fraction,
 *   eXValue: number, eYValue: number, eXYValue: number,
 *   varXValue: number, varYValue: number, covXYValue: number, corrXYValue: number,
 * }} Exact and float moment mirrors.
 */
export function exactMomentsXY() {
  const joint = getJointPmfXY();
  let eX = ZERO;
  let eY = ZERO;
  let eX2 = ZERO;
  let eXY = ZERO;

  // E[X], E[Y], E[X^2] and E[XY] from the 36 joint cells (ground truth).
  for (let i = 0; i < FACE_COUNT; i += 1) {
    for (let j = 0; j < FACE_COUNT; j += 1) {
      const x = BigInt(i + MIN_FACE);
      const y = BigInt(j + MIN_FACE);
      const cell = joint[i][j];
      eX = addFractions(eX, { num: cell.num * x, den: cell.den });
      eY = addFractions(eY, { num: cell.num * y, den: cell.den });
      eX2 = addFractions(eX2, { num: cell.num * x * x, den: cell.den });
      eXY = addFractions(eXY, { num: cell.num * x * y, den: cell.den });
    }
  }

  // Var(X) = E[X^2] - (E[X])^2.
  const varX = makeFraction(
    eX2.num * eX.den * eX.den - eX.num * eX.num * eX2.den,
    eX2.den * eX.den * eX.den,
  );
  // Cov(X, Y) = E[XY] - E[X] E[Y].
  const eXeY = multiplyFractions(eX, eY);
  const covXY = makeFraction(eXY.num * eXeY.den - eXeY.num * eXY.den, eXY.den * eXeY.den);
  const stdX = Math.sqrt(fractionToNumber(varX));
  const stdY = Math.sqrt(fractionToNumber(varX));
  const corrXYValue = stdX * stdY === 0 ? 0 : fractionToNumber(covXY) / (stdX * stdY);

  return {
    eX,
    eY,
    eXY,
    varX,
    varY: varX,
    covXY,
    corrXY: ZERO,
    eXValue: fractionToNumber(eX),
    eYValue: fractionToNumber(eY),
    eXYValue: fractionToNumber(eXY),
    varXValue: fractionToNumber(varX),
    varYValue: fractionToNumber(varX),
    covXYValue: fractionToNumber(covXY),
    corrXYValue,
  };
}

/* ------------------------------------------------------------------ *
 * Exact constant fractions used across the module.
 * ------------------------------------------------------------------ */

/** @type {Fraction} 1/36, the mass of a single ordered outcome. */
const ONE_36TH = makeFraction(1n, 36n);
/** @type {Fraction} 0, a zero fraction (used for exact zero results). */
const ZERO = makeFraction(0n, 1n);


/* ------------------------------------------------------------------ *
 * D) Sum S and max M distributions.
 * ------------------------------------------------------------------ */

/**
 * PMF of the sum `S = X + Y` for `k = 2..12`, from the closed form
 * `P(S = k) = (6 - |k - 7|) / 36`. The returned array is indexed by
 * `k - 2` (so index 0 is `k = 2` and index 10 is `k = 12`).
 * @returns {Fraction[]} Eleven reduced fractions summing to exactly 1.
 */
export function pmfSumS() {
  return Array.from({ length: 11 }, (_, index) => {
    const k = index + 2;
    const weight = FACE_COUNT - Math.abs(k - 7);
    return makeFraction(BigInt(weight), 36n);
  });
}

/**
 * PMF of the maximum `M = max(X, Y)` for `m = 1..6`, from the closed form
 * `P(M = m) = (2m - 1) / 36`. The returned array is indexed by `m - 1`.
 * @returns {Fraction[]} Six reduced fractions summing to exactly 1.
 */
export function pmfMaxM() {
  return Array.from({ length: FACE_COUNT }, (_, index) => {
    const m = index + 1;
    return makeFraction(BigInt(2 * m - 1), 36n);
  });
}

/**
 * CDF of the maximum, `F_M(m) = P(M <= m) = m^2 / 36` for `m = 1..6`, built
 * by cumulating {@link pmfMaxM}. The returned array is indexed by `m - 1`.
 * @returns {Fraction[]} Six monotone nondecreasing fractions ending at 1.
 */
export function cdfMaxM() {
  let running = ZERO;
  return pmfMaxM().map((prob) => {
    running = addFractions(running, prob);
    return running;
  });
}

/**
 * PMF of the maximum reconstructed from its CDF differences
 * `P(M = m) = F_M(m) - F_M(m - 1)`, with `F_M(0) = 0`. It must equal
 * {@link pmfMaxM} exactly, which is the "also CDF-based form" required by the
 * task.
 * @returns {Fraction[]} Six reduced fractions, identical to `pmfMaxM()`.
 */
export function pmfMaxMFromCdf() {
  const cdf = cdfMaxM();
  let previous = ZERO;
  return cdf.map((value) => {
    const prob = makeFraction(
      value.num * previous.den - previous.num * value.den,
      value.den * previous.den,
    );
    previous = value;
    return prob;
  });
}

/**
 * Exact moments of the sum `S`: `E[S] = 7`, `Var(S) = 35/6`.
 * @returns {{ eS: Fraction, varS: Fraction, eSValue: number, varSValue: number }}
 *   Exact fractions plus float mirrors.
 */
export function momentsS() {
  const eS = makeFraction(7n, 1n);
  const varS = makeFraction(35n, 6n);
  return { eS, varS, eSValue: fractionToNumber(eS), varSValue: fractionToNumber(varS) };
}

/**
 * Exact moments of the maximum `M`: `E[M] = 161/36`, `E[M^2] = 791/36`,
 * `Var(M) = 2555/1296`. The variance is computed exactly as
 * `E[M^2] - (E[M])^2` from the other two exact fractions.
 * @returns {{
 *   eM: Fraction, eM2: Fraction, varM: Fraction,
 *   eMValue: number, eM2Value: number, varMValue: number,
 * }} Exact fractions plus float mirrors.
 */
export function momentsM() {
  const eM = makeFraction(161n, 36n);
  const eM2 = makeFraction(791n, 36n);
  const varM = makeFraction(
    eM2.num * eM.den * eM.den - eM.num * eM.num * eM2.den,
    eM2.den * eM.den * eM.den,
  );
  return {
    eM,
    eM2,
    varM,
    eMValue: fractionToNumber(eM),
    eM2Value: fractionToNumber(eM2),
    varMValue: fractionToNumber(varM),
  };
}


/* ------------------------------------------------------------------ *
 * E) Joint PMF of (S, M).
 * ------------------------------------------------------------------ */

/**
 * Joint PMF of `(S, M) = (X + Y, max(X, Y))` as an `11 x 6` table where rows are
 * `S = 2..12` (row `s - 2`) and columns are `M = 1..6` (column `m - 1`).
 *
 * The support is `m + 1 <= s <= 2m`; outside it the mass is 0. On the support:
 * - `P = 1/36` when `s = 2m` (only `x = y = m`),
 * - `P = 2/36` when `m + 1 <= s <= 2m - 1` (two ordered outcomes).
 * @returns {ReadonlyArray<ReadonlyArray<Fraction>>} Frozen 11x6 table.
 */
export function getJointPmfSM() {
  const rows = Array.from({ length: 11 }, (_, rowIndex) => {
    const s = rowIndex + 2;
    return Object.freeze(
      Array.from({ length: FACE_COUNT }, (_, columnIndex) => {
        const m = columnIndex + 1;
        if (s < m + 1 || s > 2 * m) {
          return ZERO;
        }
        if (s === 2 * m) {
          return ONE_36TH;
        }
        return makeFraction(2n, 36n);
      }),
    );
  });
  return Object.freeze(rows);
}

/**
 * The nonzero-support cells of `(S, M)`: every `(s, m)` with `m = 1..6` and
 * `m + 1 <= s <= 2m`. There are exactly 21 such cells.
 * @returns {ReadonlyArray<{ s: number, m: number, prob: Fraction }>} Frozen list.
 */
export function getSupportCellsSM() {
  const cells = [];
  for (let m = 1; m <= FACE_COUNT; m += 1) {
    for (let s = m + 1; s <= 2 * m; s += 1) {
      const prob = s === 2 * m ? ONE_36TH : makeFraction(2n, 36n);
      cells.push(Object.freeze({ s, m, prob }));
    }
  }
  return Object.freeze(cells);
}

/* ------------------------------------------------------------------ *
 * F) Dependence and covariance of (S, M).
 * ------------------------------------------------------------------ */

/**
 * Exact covariance `Cov(S, M) = E[SM] - E[S] E[M] = 35/12`, computed from the
 * `(S, M)` joint table. It is strictly positive: the sum and the maximum are
 * dependent even though `(X, Y)` are independent.
 * @returns {{ covSM: Fraction, covSMValue: number }} Exact fraction plus float mirror.
 */
export function exactCovarianceSM() {
  const joint = getJointPmfSM();
  let eSM = ZERO;
  for (let rowIndex = 0; rowIndex < 11; rowIndex += 1) {
    const s = rowIndex + 2;
    for (let columnIndex = 0; columnIndex < FACE_COUNT; columnIndex += 1) {
      const m = columnIndex + 1;
      const cell = joint[rowIndex][columnIndex];
      if (cell.num === 0n) continue;
      eSM = addFractions(eSM, { num: cell.num * BigInt(s) * BigInt(m), den: cell.den });
    }
  }
  const eS = momentsS().eS;
  const eM = momentsM().eM;
  const product = multiplyFractions(eS, eM);
  const covSM = makeFraction(eSM.num * product.den - product.num * eSM.den, eSM.den * product.den);
  return { covSM, covSMValue: fractionToNumber(covSM) };
}

/**
 * Exact correlation of `(S, M)`: `rho(S, M)^2 = 54/73` exactly, and
 * `rho = +sqrt(54/73)` (the covariance is positive, so the sign is positive).
 * @returns {{
 *   rhoSquared: Fraction, rhoSquaredValue: number, rhoValue: number,
 * }} Exact squared correlation plus float mirrors.
 */
export function exactCorrelationSM() {
  const rhoSquared = makeFraction(54n, 73n);
  const rhoSquaredValue = fractionToNumber(rhoSquared);
  return { rhoSquared, rhoSquaredValue, rhoValue: Math.sqrt(rhoSquaredValue) };
}


/* ------------------------------------------------------------------ *
 * G) Difference D = X - Y and the (S, D) dependence witness.
 * ------------------------------------------------------------------ */

/**
 * PMF of the difference `D = X - Y` on `k = -5..5`, from enumeration of the 36
 * ordered outcomes: `P(D = k) = (6 - |k|) / 36`. The returned array is indexed
 * by `k + 5` (so index 0 is `k = -5`, index 10 is `k = 5`).
 * @returns {Fraction[]} Eleven reduced fractions summing to exactly 1.
 */
export function pmfDifferenceD() {
  return Array.from({ length: 11 }, (_, index) => {
    const k = index - 5;
    return makeFraction(BigInt(FACE_COUNT - Math.abs(k)), 36n);
  });
}

/**
 * Exact covariance `Cov(S, D) = 0` for `S = X + Y` and `D = X - Y`, computed
 * from the 36 ordered outcomes as `E[SD] - E[S] E[D]` with `E[S] = 7` and
 * `E[D] = 0`.
 * @returns {{ covSD: Fraction, covSDValue: number }} Exact zero fraction plus float mirror.
 */
export function exactCovarianceSD() {
  let eSD = ZERO;
  for (let x = MIN_FACE; x <= MAX_FACE; x += 1) {
    for (let y = MIN_FACE; y <= MAX_FACE; y += 1) {
      const s = x + y;
      const d = x - y;
      eSD = addFractions(eSD, { num: BigInt(s) * BigInt(d), den: 36n });
    }
  }
  const eS = momentsS().eS;
  const eD = ZERO; // E[D] = 0 by symmetry.
  const product = multiplyFractions(eS, eD);
  const covSD = makeFraction(eSD.num * product.den - product.num * eSD.den, eSD.den * product.den);
  return { covSD, covSDValue: fractionToNumber(covSD) };
}

/**
 * A concrete dependence witness for `(S, D)` despite `Cov(S, D) = 0`: the event
 * `{S = 2}` forces `X = Y = 1`, hence `D = 0`, so `P(S = 2, D = 3) = 0` while
 * `P(S = 2) P(D = 3) = (1/36) (3/36) = 3/1296`. Thus zero covariance does not
 * imply independence.
 * @returns {{
 *   jointProb: Fraction, productProb: Fraction,
 *   jointProbValue: number, productProbValue: number, dependent: boolean,
 * }} The witness quantities; `jointProb` is exactly 0 and differs from
 *   `productProb`.
 */
export function dependenceWitnessSD() {
  const pS2 = makeFraction(1n, 36n);
  const pD3 = makeFraction(3n, 36n);
  const jointProb = ZERO;
  const productProb = multiplyFractions(pS2, pD3);
  return {
    jointProb,
    productProb,
    jointProbValue: fractionToNumber(jointProb),
    productProbValue: fractionToNumber(productProb),
    dependent: !fractionEquals(jointProb, productProb),
  };
}

/* ------------------------------------------------------------------ *
 * H) Continuous unit-square demo helpers.
 * ------------------------------------------------------------------ */

/**
 * Validate a finite number within an inclusive range.
 * @param {unknown} value Candidate value.
 * @param {string} name Parameter name for the error message.
 * @param {number} low Inclusive lower bound.
 * @param {number} high Inclusive upper bound.
 * @returns {void}
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
 * Probability under the continuous uniform density `f(x, y) = 1` on the unit
 * square `[0, 1]^2`: the probability of the rectangle `[0, a] x [0, b]` is the
 * area `a * b`. Used by the density demo for contrast with the discrete tables.
 * @param {number} a Horizontal extent in `[0, 1]`.
 * @param {number} b Vertical extent in `[0, 1]`.
 * @returns {number} The area `a * b`, in `[0, 1]`.
 * @throws {TypeError} If `a` or `b` is not a number.
 * @throws {RangeError} If `a` or `b` is not finite within `[0, 1]`.
 */
export function continuousAreaProb(a, b) {
  assertNumberInRange(a, 'a', 0, 1);
  assertNumberInRange(b, 'b', 0, 1);
  return a * b;
}

/**
 * The uniform density value on the unit square, `f(x, y) = 1`. This is a
 * density, not a probability: it only becomes mass after integration over area.
 * @returns {number} The constant density `1`.
 */
export function uniformDensityValue() {
  return 1;
}
