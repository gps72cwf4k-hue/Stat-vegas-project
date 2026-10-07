/**
 * Pure math for the Loaded Die attraction (`docs/specs/loaded-die.md` v2).
 *
 * Model: a die is either fair (`H_F`) or loaded (`H_L`).
 * - Fair:   P(X = k | H_F) = 1/6 for k = 1..6
 * - Loaded: P(X = 6 | H_L) = b, P(X = k | H_L) = (1 - b)/5 for k = 1..5
 * - Prior:  theta = P(H_L), b is the bias of the loaded die.
 *
 * The observed statistic is the number of sixes `k` out of `m` rolls; the
 * count is sufficient because, conditional on "not a six", both dice are
 * uniform over 1..5.
 *
 * This module is pure: no randomness, no simulation, no React and no new
 * dependencies. It never builds `3^k` (or any raw binomial coefficient): the
 * Bayes factor is evaluated in log space and combined with a numerically
 * stable sigmoid, so `m` up to 5000 never overflows to NaN or Infinity, except
 * the explicitly reported 0/0 case described on `posteriorLoadedGivenCount`.
 */

/**
 * @typedef {object} DicePmfs
 * @property {number[]} fairPmf Length-6 array for faces 1..6, each 1/6.
 * @property {number[]} loadedPmf Length-6 array for faces 1..6, P(6) = b and
 *   P(1..5) = (1 - b)/5.
 */

/**
 * Smallest supported bias value. At `b = 1/6` the two dice coincide (the data
 * carry no information), which is covered by tests but not offered in the UI.
 * @type {number}
 */
const MIN_BIAS = 1 / 6;
/** @type {number} Probability of the fair die showing any single face, 1/6. */
const FAIR_FACE_PROBABILITY = 1 / 6;

/**
 * Validate a finite number within an inclusive range.
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
 * Validate an integer within an inclusive range.
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
 * Validate the shared `(m, k)` count parameters: `0 <= k <= m <= 5000`.
 * @param {unknown} m Number of rolls.
 * @param {unknown} k Number of sixes.
 * @returns {void}
 * @throws {TypeError} If `m` or `k` is not a number.
 * @throws {RangeError} If `m` is not an integer in [0, 5000], `k` is not an
 *   integer in [0, 5000], or `k > m`.
 */
function assertCounts(m, k) {
  assertIntegerInRange(m, 'm', 0, 5000);
  assertIntegerInRange(k, 'k', 0, 5000);
  if (k > m) {
    throw new RangeError(`k must satisfy 0 <= k <= m, received k = ${k} and m = ${m}.`);
  }
}

/**
 * Validate a prior `theta = P(H_L)` in the closed interval [0, 1].
 * Real UI values are in (0, 1); the endpoints are supported at function level
 * per the specification (they exercise the 0/0 edge case with `b = 1`).
 * @param {unknown} theta Prior probability of a loaded die.
 * @returns {void}
 * @throws {TypeError} If `theta` is not a number.
 * @throws {RangeError} If `theta` is not a finite number within [0, 1].
 */
function assertTheta(theta) {
  assertNumberInRange(theta, 'theta', 0, 1);
}

/**
 * Validate a loaded-die bias `b` in the closed interval [1/6, 1].
 * @param {unknown} b Bias of the loaded die.
 * @returns {void}
 * @throws {TypeError} If `b` is not a number.
 * @throws {RangeError} If `b` is not a finite number within [1/6, 1].
 */
function assertBias(b) {
  assertNumberInRange(b, 'b', MIN_BIAS, 1);
}


/**
 * Probability mass functions of the two dice, indexed by face value.
 *
 * `fairPmf[j - 1] = P(X = j | H_F)` and `loadedPmf[j - 1] = P(X = j | H_L)`
 * for `j = 1..6`. Both arrays have length 6 and sum to 1 for `b` in [1/6, 1].
 * At `b = 1/6` the two arrays are identical; at `b = 1` the loaded die always
 * shows 6.
 *
 * @param {{ b: number }} params Parameter object.
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @returns {DicePmfs} The two length-6 PMFs (`fairPmf`, `loadedPmf`).
 * @throws {TypeError} If `b` is not a number.
 * @throws {RangeError} If `b` is not finite or is outside [1/6, 1].
 */
export function getDiePmfs({ b } = {}) {
  assertBias(b);

  const fairPmf = new Array(6).fill(FAIR_FACE_PROBABILITY);
  const nonSixProbability = (1 - b) / 5;
  const loadedPmf = [
    nonSixProbability,
    nonSixProbability,
    nonSixProbability,
    nonSixProbability,
    nonSixProbability,
    b,
  ];

  return { fairPmf, loadedPmf };
}

/**
 * Natural logarithm of the Bayes factor `BF = (6b)^k * (6(1 - b)/5)^(m - k)`.
 *
 * The binomial coefficient cancels between numerator and denominator, so the
 * data enter only through `(m, k)`. The value is computed in log space for
 * stability (never `3^k` directly). Special cases are handled before any log:
 * - `b = 1`: every six contributes `k * ln(6)`; any non-six (`m - k > 0`) makes
 *   the loaded likelihood 0, so the logarithm is `-Infinity`.
 * - `b < 1`: the ordinary log-odds contributions are used. `k = 0` contributes
 *   nothing from the six term; `m - k = 0` contributes nothing from the
 *   non-six term, so `log(BF)` is always finite here.
 *
 * @param {{ b: number, m: number, k: number }} params Parameter object.
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number} `ln(BF)`; `-Infinity` exactly when `b = 1` and `m > k`.
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If `b` is outside [1/6, 1] or `m`, `k` are out of range
 *   or `k > m`.
 */
export function logBayesFactor({ b, m, k } = {}) {
  assertBias(b);
  assertCounts(m, k);

  const nonSixCount = m - k;

  if (b === 1) {
    // Loaded die always shows 6: a single non-six rules it out (BF = 0).
    if (nonSixCount > 0) {
      return -Infinity;
    }
    return k * Math.log(6);
  }

  // b < 1: both per-roll log-odds ratios are finite and positive.
  const logSixRatio = Math.log(6 * b); // ln P(6|H_L) - ln P(6|H_F)
  const logNonSixRatio = Math.log((6 * (1 - b)) / 5); // ln P(x|H_L) - ln P(x|H_F), x != 6
  return k * logSixRatio + nonSixCount * logNonSixRatio;
}

/**
 * Bayes factor `BF = (6b)^k * (6(1 - b)/5)^(m - k)`.
 *
 * Convenience float wrapper around `logBayesFactor`: returns exactly 0 when the
 * logarithm is `-Infinity` (the `b = 1` non-six case) and may overflow to
 * `Infinity` for very large `k`. Prefer `logBayesFactor` for display of large
 * evidence.
 *
 * @param {{ b: number, m: number, k: number }} params Parameter object.
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number} The Bayes factor (>= 0).
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If any input is out of range or `k > m`.
 */
export function bayesFactor({ b, m, k } = {}) {
  const logBf = logBayesFactor({ b, m, k });
  if (logBf === -Infinity) {
    return 0;
  }
  return Math.exp(logBf);
}

/**
 * Numerically stable logistic sigmoid `sigma(x) = 1 / (1 + e^{-x})`.
 * Uses the sign-split form so neither branch overflows for large `|x|`.
 * @param {number} x Log-odds.
 * @returns {number} The sigmoid value in [0, 1].
 */
function stableSigmoid(x) {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/**
 * Posterior probability `P(H_L | D)` that the die is loaded, given `k` sixes in
 * `m` rolls, computed from the stable log-odds
 *
 * ```
 * logit(post) = logit(theta) + k * ln(6b) + (m - k) * ln(6(1 - b)/5)
 * ```
 *
 * followed by `post = sigma(logit(post))`.
 *
 * Edge cases (all handled before logs):
 * - `theta = 0`: posterior is 0 for all data.
 * - `theta = 1` and `b < 1`: posterior is 1.
 * - `b = 1` and `m - k > 0` (a non-six was seen) with `0 < theta < 1`: the
 *   posterior is exactly 0 (BF = 0; the denominator is `(1 - theta) P(D|H_F)`).
 * - `theta = 1` AND `b = 1` AND `m - k > 0`: both hypotheses have probability 0
 *   for the data, so `P(D) = 0` and Bayes gives 0/0. This is mathematically
 *   undefined; the function THROWS a RangeError (see the `@throws` note) rather
 *   than returning 0 or 1. If `k = m` (no non-six) the posterior is 1.
 *
 * @param {{ theta: number, b: number, m: number, k: number }} params Parameters.
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number} Posterior probability in [0, 1].
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If any input is out of range, `k > m`, or the posterior
 *   is the explicitly undefined 0/0 case (`theta = 1`, `b = 1`, `m > k`).
 */
export function posteriorLoadedGivenCount({ theta, b, m, k } = {}) {
  assertTheta(theta);
  assertBias(b);
  assertCounts(m, k);

  // Prior endpoint: a fair die is certain, so no data can load it.
  if (theta === 0) {
    return 0;
  }
  // Prior endpoint: a loaded die is certain, except the undefined 0/0 case.
  if (theta === 1) {
    if (b === 1 && m > k) {
      throw new RangeError(
        'Posterior is undefined (0/0): with theta = 1 and b = 1 every roll must be a six, '
        + `but the data contain ${m - k} non-six roll(s). The fair hypothesis cannot explain them `
        + 'either, so P(D) = 0.',
      );
    }
    return 1;
  }

  // Degenerate dice: b = 1/6 makes BF = 1 for all data, so the posterior
  // equals the prior exactly (no floating-point noise through the sigmoid).
  if (b === MIN_BIAS) {
    return theta;
  }

  // 0 < theta < 1 from here on.
  const logOdds = Math.log(theta / (1 - theta)) + logBayesFactor({ b, m, k });
  return stableSigmoid(logOdds);
}

/**
 * Prior odds `theta / (1 - theta)` of a loaded die.
 *
 * Endpoints are handled explicitly and never blow up silently:
 * - `theta = 0` returns 0.
 * - `theta = 1` returns `Infinity`.
 *
 * @param {number} theta Prior P(H_L); finite number in [0, 1].
 * @returns {number} Prior odds in [0, Infinity].
 * @throws {TypeError} If `theta` is not a number.
 * @throws {RangeError} If `theta` is not finite or is outside [0, 1].
 */
export function priorOdds(theta) {
  assertTheta(theta);
  if (theta === 0) {
    return 0;
  }
  if (theta === 1) {
    return Infinity;
  }
  return theta / (1 - theta);
}

/**
 * Posterior odds `[theta / (1 - theta)] * BF`.
 *
 * Explicit endpoints preserve the posterior limits without silent NaN:
 * - `theta = 0` returns 0.
 * - `theta = 1` returns `Infinity` for `b < 1`; with `b = 1` and a non-six the
 *   odds would be `Infinity * 0`, which is undefined, so a RangeError is thrown
 *   to match `posteriorLoadedGivenCount`.
 *
 * @param {{ theta: number, b: number, m: number, k: number }} params Parameters.
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number} Posterior odds in [0, Infinity].
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If any input is out of range, `k > m`, or the odds are
 *   the undefined `Infinity * 0` case (`theta = 1`, `b = 1`, `m > k`).
 */
export function posteriorOdds({ theta, b, m, k } = {}) {
  assertTheta(theta);
  assertBias(b);
  assertCounts(m, k);

  if (theta === 0) {
    return 0;
  }
  if (theta === 1) {
    if (b === 1 && m > k) {
      throw new RangeError(
        'Posterior odds are undefined (Infinity * 0): with theta = 1 and b = 1 the data '
        + 'contain a non-six, so P(D) = 0.',
      );
    }
    return Infinity;
  }

  return priorOdds(theta) * bayesFactor({ b, m, k });
}


/**
 * Predictive PMF of the next face `X_{m+1}`, given `k` sixes in `m` rolls, by
 * the law of total probability:
 *
 * ```
 * P(X_{m+1} = j | D) = P(X = j | H_L) * post + P(X = j | H_F) * (1 - post)
 * ```
 *
 * where `post = posteriorLoadedGivenCount(theta, b, m, k)`. The result is a
 * length-6 array (faces 1..6) that sums to 1. With `m = 0` there is no data, so
 * `post = theta` exactly (including the `theta = 0` / `theta = 1` endpoints).
 *
 * @param {{ theta: number, b: number, m: number, k: number }} params Parameters.
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number[]} Length-6 PMF over faces 1..6, summing to 1.
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If any input is out of range, `k > m`, or the posterior
 *   is the explicitly undefined 0/0 case (`theta = 1`, `b = 1`, `m > k`).
 */
export function predictiveNextFacePmf({ theta, b, m, k } = {}) {
  assertTheta(theta);
  assertBias(b);
  assertCounts(m, k);

  const post = m === 0 ? theta : posteriorLoadedGivenCount({ theta, b, m, k });
  const { fairPmf, loadedPmf } = getDiePmfs({ b });

  const pmf = new Array(6);
  for (let j = 0; j < 6; j += 1) {
    pmf[j] = loadedPmf[j] * post + fairPmf[j] * (1 - post);
  }
  return pmf;
}

/**
 * Predictive probability that the next roll is a six, `P(X_{m+1} = 6 | D)`.
 * A convex combination `b * post + (1/6) * (1 - post)`, so it lies in
 * `[1/6, b]`. With `m = 0` there is no data and `post = theta`.
 *
 * @param {{ theta: number, b: number, m: number, k: number }} params Parameters.
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.m Number of rolls; integer in [0, 5000].
 * @param {number} params.k Number of sixes; integer in [0, m].
 * @returns {number} `P(next = 6 | D)` in [1/6, b].
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If any input is out of range, `k > m`, or the posterior
 *   is the explicitly undefined 0/0 case (`theta = 1`, `b = 1`, `m > k`).
 */
export function predictiveNextSixProbability({ theta, b, m, k } = {}) {
  assertTheta(theta);
  assertBias(b);
  assertCounts(m, k);

  const post = m === 0 ? theta : posteriorLoadedGivenCount({ theta, b, m, k });
  return b * post + FAIR_FACE_PROBABILITY * (1 - post);
}

/**
 * Unconditional dependence gap of two sixes,
 * `P(6, 6) - P(6)^2 = theta (1 - theta) (b - 1/6)^2`.
 *
 * The rolls are independent only *given* the die type; unconditionally they are
 * positively dependent (the gap is `> 0` for `0 < theta < 1` and `b != 1/6`).
 *
 * @param {{ theta: number, b: number }} params Parameters.
 * @param {number} params.theta Prior P(H_L); finite number in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @returns {number} The gap `P(6, 6) - P(6)^2` (>= 0).
 * @throws {TypeError} If `theta` or `b` is not a number.
 * @throws {RangeError} If `theta` is outside [0, 1] or `b` is outside [1/6, 1].
 */
export function dependenceGap66({ theta, b } = {}) {
  assertTheta(theta);
  assertBias(b);

  const biasOffset = b - FAIR_FACE_PROBABILITY;
  return theta * (1 - theta) * biasOffset * biasOffset;
}

/**
 * Sequential Bayes update from one observed face: returns the posterior of the
 * single-roll update, `P(H_L | face)`, which becomes the next prior.
 *
 * With `face = 6` the Bayes factor is `6b`; with any non-six it is
 * `6(1 - b)/5`. Applying this function roll by roll, in any order, reproduces
 * the batch posterior `posteriorLoadedGivenCount(theta, b, m, k)` where `k` is
 * the number of sixes (sufficiency of the count of sixes).
 *
 * The prior endpoints are propagated exactly:
 * - `priorTheta = 0` stays 0 (a fair die cannot become loaded).
 * - `priorTheta = 1` stays 1 unless the observation is impossible under the
 *   loaded die (`face != 6` and `b = 1`), which is the 0/0 case and throws.
 *
 * @param {{ priorTheta: number, b: number, face: number }} params Parameters.
 * @param {number} params.priorTheta Prior P(H_L) before the roll; in [0, 1].
 * @param {number} params.b Bias of the loaded die; finite number in [1/6, 1].
 * @param {number} params.face Observed face; integer in [1, 6].
 * @returns {number} Updated posterior P(H_L | face) in [0, 1].
 * @throws {TypeError} If any input is not a number.
 * @throws {RangeError} If `priorTheta` is outside [0, 1], `b` is outside
 *   [1/6, 1], `face` is not an integer in [1, 6], or the update is the
 *   explicitly undefined 0/0 case (`priorTheta = 1`, `b = 1`, `face != 6`).
 */
export function updatePosteriorWithOneRoll({ priorTheta, b, face } = {}) {
  assertTheta(priorTheta);
  assertBias(b);
  assertIntegerInRange(face, 'face', 1, 6);

  // Prior endpoint: a fair die is certain, so no observation can load it.
  if (priorTheta === 0) {
    return 0;
  }
  // Prior endpoint: a loaded die is certain, unless the roll is impossible.
  if (priorTheta === 1) {
    if (b === 1 && face !== 6) {
      throw new RangeError(
        'Posterior is undefined (0/0): with priorTheta = 1 and b = 1 the loaded die never '
        + `shows ${face}, and the fair hypothesis is excluded by the prior.`,
      );
    }
    return 1;
  }

  const logRatio = face === 6 ? Math.log(6 * b) : Math.log((6 * (1 - b)) / 5);
  const logOdds = Math.log(priorTheta / (1 - priorTheta)) + logRatio;
  return stableSigmoid(logOdds);
}

