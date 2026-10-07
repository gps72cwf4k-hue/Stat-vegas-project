/**
 * Seeded Monte-Carlo simulation of the standard 5-card poker deal.
 *
 * This module deals `N` independent hands (each from a fresh full deck), counts
 * each hand into one of the ten categories with the pure classifier from
 * `../math/poker.js`, and derives the comparison quantities from
 * `docs/specs/poker.md`: expected counts, per-category z-scores (only when
 * `N·p >= 10`), focus-mode binomial probabilities, and the Pearson chi-square
 * goodness of fit with the rarest-upward merging rule.
 *
 * The engine is pure and deterministic: for a fixed seed the whole snapshot is
 * reproducible, and the module holds no mutable state. Seeded RNG is
 * reproducible, not cryptographic.
 */

import { createSeededRng } from './rng.js';
import {
  CARD_COUNT,
  HAND_SIZE,
  POKER_CATEGORIES,
  buildStandardDeck,
  classifyFiveCardHand,
  getPokerTheoryCounts,
} from '../math/poker.js';

/** Default number of hands to deal. */
export const DEFAULT_HANDS_N = 10000;

/** Minimum number of hands (spec range). */
export const MIN_HANDS_N = 500;

/** Maximum number of hands (spec range). */
export const MAX_HANDS_N = 100000;

/** Minimum expected count required before a merged chi-square class is closed. */
export const MIN_EXPECTED_FOR_CHI_SQUARE = 5;

/** Minimum expected count required before a per-category z-score is shown. */
export const MIN_EXPECTED_FOR_Z_SCORE = 10;

/** Total number of equally likely hands, `C(52, 5)`. */
const TOTAL_HANDS = 2598960;

/**
 * Assert that a value is a usable random source: a function returning numbers
 * in [0, 1).
 *
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`poker simulation requires an rng function, received ${typeof rng}.`);
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
 * The ten poker categories in rarest-to-commonest order.
 *
 * The probability table is strictly decreasing in this order (royal flush is
 * the rarest, high card the commonest), so the canonical category list doubles
 * as the rarity order required by the chi-square merging rule.
 * @type {ReadonlyArray<string>}
 */
const CATEGORIES_RAREST_FIRST = POKER_CATEGORIES;

/**
 * Theory probability of every category, `p_i = count_i / C(52, 5)`.
 * @returns {Record<string, number>} Probability per category.
 */
function getTheoryProbabilities() {
  const counts = getPokerTheoryCounts();
  const probabilities = {};
  for (const category of CATEGORIES_RAREST_FIRST) {
    probabilities[category] = counts[category] / TOTAL_HANDS;
  }
  return probabilities;
}

/**
 * Natural logarithm of the gamma function `ln Γ(x)` for `x > 0`, via the
 * Lanczos approximation (Numerical Recipes coefficients). Used only to build
 * the regularized incomplete gamma, in log space to avoid overflow.
 *
 * @param {number} x Positive real argument.
 * @returns {number} `ln Γ(x)`.
 */
function logGamma(x) {
  const coefficients = [
    76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    series += coefficients[j] / y;
  }
  return -tmp + Math.log((Math.SQRT2 * Math.sqrt(Math.PI) * series) / x);
}

/**
 * Regularized lower incomplete gamma `P(a, x)` by series expansion (used when
 * `x < a + 1`). Converges quickly in that region.
 *
 * @param {number} a Positive shape parameter.
 * @param {number} x Nonnegative argument.
 * @returns {number} `P(a, x)` in [0, 1].
 */
function regularizedGammaSeries(a, x) {
  const maxIterations = 500;
  const epsilon = 3e-14;
  let sum = 1 / a;
  let term = sum;
  let denominator = a;
  for (let i = 1; i <= maxIterations; i += 1) {
    denominator += 1;
    term *= x / denominator;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * epsilon) {
      break;
    }
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * Regularized upper incomplete gamma `Q(a, x)` by the Lentz continued fraction
 * (used when `x >= a + 1`). `P(a, x) + Q(a, x) = 1`.
 *
 * @param {number} a Positive shape parameter.
 * @param {number} x Positive argument.
 * @returns {number} `Q(a, x)` in [0, 1].
 */
function regularizedGammaContinuedFraction(a, x) {
  const maxIterations = 500;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= maxIterations; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) {
      d = tiny;
    }
    c = b + an / c;
    if (Math.abs(c) < tiny) {
      c = tiny;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Regularized lower incomplete gamma `P(a, x)`, switching between the series
 * and continued-fraction forms for numerical stability.
 *
 * @param {number} a Positive shape parameter.
 * @param {number} x Nonnegative argument.
 * @returns {number} `P(a, x)` in [0, 1].
 * @throws {RangeError} If `a <= 0` or `x < 0`.
 */
function regularizedGammaP(a, x) {
  if (!(a > 0) || x < 0) {
    throw new RangeError(`regularizedGammaP requires a > 0 and x >= 0, received (${a}, ${x}).`);
  }
  if (x === 0) {
    return 0;
  }
  if (x < a + 1) {
    return regularizedGammaSeries(a, x);
  }
  return 1 - regularizedGammaContinuedFraction(a, x);
}

/**
 * Chi-square cumulative distribution function `P(X <= chi2)` for `dof` degrees
 * of freedom, via the regularized lower incomplete gamma
 * `P(dof/2, chi2/2)`.
 *
 * @param {number} chi2 Nonnegative statistic value.
 * @param {number} dof Positive integer degrees of freedom.
 * @returns {number} The CDF value in [0, 1].
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function chiSquareCdf(chi2, dof) {
  if (typeof chi2 !== 'number' || typeof dof !== 'number') {
    throw new TypeError('chiSquareCdf requires numeric arguments.');
  }
  if (!Number.isFinite(chi2) || chi2 < 0) {
    throw new RangeError(`chiSquareCdf requires a finite chi2 >= 0, received ${chi2}.`);
  }
  if (!Number.isInteger(dof) || dof < 1) {
    throw new RangeError(`chiSquareCdf requires a positive integer dof, received ${dof}.`);
  }
  return regularizedGammaP(dof / 2, chi2 / 2);
}

/**
 * Chi-square survival function `P(X >= chi2) = 1 - CDF(chi2)`. Used as the
 * goodness-of-fit p-value.
 *
 * @param {number} chi2 Nonnegative statistic value.
 * @param {number} dof Positive integer degrees of freedom.
 * @returns {number} The survival probability in [0, 1].
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function chiSquareSurvival(chi2, dof) {
  return 1 - chiSquareCdf(chi2, dof);
}

/**
 * Goodness-of-fit p-value for a chi-square statistic: `P(X >= chi2)`.
 *
 * A single p-value is one sample's summary, never a proof; the model is
 * correctly specified only when the p-value is uniform under repeated runs.
 *
 * @param {object} params
 * @param {number} params.chi2 Nonnegative chi-square statistic.
 * @param {number} params.dof Positive integer degrees of freedom.
 * @returns {number} The p-value in [0, 1].
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function chiSquarePValue({ chi2, dof }) {
  return chiSquareSurvival(chi2, dof);
}


/**
 * Deal one 5-card hand from a fresh, full standard deck.
 *
 * Each call starts from a full deck, so successive hands are independent. The
 * draw uses a partial Fisher–Yates shuffle: five swaps with unbiased integer
 * indices `floor(rng() * remaining)`, taking the first five positions. No
 * random-comparator sorting is used.
 *
 * @param {() => number} rng Random source returning numbers in [0, 1).
 * @returns {number[]} Five distinct cards (integers in `0..51`).
 * @throws {TypeError} If `rng` is not a function.
 */
export function dealFiveCardHand(rng) {
  assertRng(rng);
  const deck = buildStandardDeck();
  for (let i = 0; i < HAND_SIZE; i += 1) {
    const j = i + Math.floor(rng() * (CARD_COUNT - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck.slice(0, HAND_SIZE);
}

/**
 * Natural logarithm of the binomial coefficient `ln C(n, k)`, computed from
 * `lnGamma` so it is safe for the large `n` used by the binomial tail.
 *
 * @param {number} n Total trials (nonnegative integer).
 * @param {number} k Successes (nonnegative integer, `<= n`).
 * @returns {number} `ln C(n, k)`.
 */
function logBinomialCoefficient(n, k) {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Exact Binomial probability `P(X = k)` for `X ~ Binomial(n, p)`, computed in
 * log space so it stays finite for tiny `p` (for example the royal flush).
 *
 * @param {number} n Number of trials (positive integer).
 * @param {number} p Success probability in [0, 1].
 * @param {number} k Number of successes (integer in `0..n`).
 * @returns {number} The probability in [0, 1].
 */
function binomialPmf(n, p, k) {
  if (p === 0) {
    return k === 0 ? 1 : 0;
  }
  if (p === 1) {
    return k === n ? 1 : 0;
  }
  const logProbability =
    logBinomialCoefficient(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p);
  return Math.exp(logProbability);
}

/**
 * Probability that no success occurs, `P(X = 0) = (1 - p)^n` for
 * `X ~ Binomial(n, p)`. This is the quantity the spec shows for rare hands
 * whose expected count is below 10.
 *
 * @param {number} n Number of trials (positive integer).
 * @param {number} p Success probability in [0, 1].
 * @returns {number} `(1 - p)^n` in [0, 1].
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function binomialProbabilityZero(n, p) {
  assertIntegerInRange(n, 'n', 1, Number.MAX_SAFE_INTEGER);
  if (typeof p !== 'number' || !(p >= 0 && p <= 1)) {
    throw new RangeError(`binomialProbabilityZero requires p in [0, 1], received ${p}.`);
  }
  if (p === 1) {
    return 0;
  }
  return Math.exp(n * Math.log1p(-p));
}

/**
 * Binomial tail `P(X >= k)` for `X ~ Binomial(n, p)`, summed in log space from
 * `k` to `n`. Used for the focus-mode tail probability of a rare hand.
 *
 * @param {number} n Number of trials (positive integer).
 * @param {number} p Success probability in [0, 1].
 * @param {number} k Lower bound on the number of successes (integer in `0..n`).
 * @returns {number} The tail probability in [0, 1].
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function binomialTailProbability(n, p, k) {
  assertIntegerInRange(n, 'n', 1, Number.MAX_SAFE_INTEGER);
  if (typeof p !== 'number' || !(p >= 0 && p <= 1)) {
    throw new RangeError(`binomialTailProbability requires p in [0, 1], received ${p}.`);
  }
  assertIntegerInRange(k, 'k', 0, n);
  if (k === 0) {
    return 1;
  }
  let sum = 0;
  for (let i = k; i <= n; i += 1) {
    sum += binomialPmf(n, p, i);
  }
  // Guard against accumulated floating-point drift above 1.
  return Math.min(1, Math.max(0, sum));
}


/**
 * Merge categories from the rarest upward until every merged class has an
 * expected count of at least `minExpected`, then compute the Pearson chi-square
 * statistic over the merged classes.
 *
 * Categories are visited in the supplied `orderRarestToCommonest` sequence; a
 * running class accumulates expected and observed counts and is closed as soon
 * as the accumulated expected count reaches `minExpected`. A trailing class
 * below the threshold (only possible when even the total expected count is
 * small) is folded into the previous class, since it cannot be merged further.
 *
 * @param {object} params
 * @param {Record<string, number>} params.expectedCounts Expected count per category.
 * @param {Record<string, number>} params.observedCounts Observed count per category.
 * @param {number} [params.minExpected] Minimum merged expected count. Defaults to 5.
 * @param {ReadonlyArray<string>} params.orderRarestToCommonest Category order.
 * @returns {{
 *   classes: Array<{ categories: string[], expectedCount: number, observedCount: number }>,
 *   chi2: number,
 *   dof: number,
 * }} Merged classes, chi-square statistic and degrees of freedom (classes - 1).
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function mergeCategoriesForChiSquare({
  expectedCounts,
  observedCounts,
  minExpected = MIN_EXPECTED_FOR_CHI_SQUARE,
  orderRarestToCommonest,
}) {
  if (orderRarestToCommonest === undefined) {
    throw new TypeError('mergeCategoriesForChiSquare requires orderRarestToCommonest.');
  }
  if (typeof minExpected !== 'number' || !(minExpected >= 0)) {
    throw new RangeError(`minExpected must be a nonnegative number, received ${minExpected}.`);
  }

  const classes = [];
  let pendingCategories = [];
  let pendingExpected = 0;
  let pendingObserved = 0;

  const closeClass = () => {
    classes.push({
      categories: pendingCategories,
      expectedCount: pendingExpected,
      observedCount: pendingObserved,
    });
    pendingCategories = [];
    pendingExpected = 0;
    pendingObserved = 0;
  };

  for (const category of orderRarestToCommonest) {
    const expected = expectedCounts[category];
    const observed = observedCounts[category];
    if (typeof expected !== 'number' || typeof observed !== 'number') {
      throw new RangeError(
        `mergeCategoriesForChiSquare requires expected and observed counts for "${category}".`,
      );
    }
    pendingCategories.push(category);
    pendingExpected += expected;
    pendingObserved += observed;
    if (pendingExpected >= minExpected) {
      closeClass();
    }
  }

  // Fold any trailing under-threshold class into the previous one.
  if (pendingCategories.length > 0) {
    if (classes.length === 0) {
      closeClass();
    } else {
      const last = classes[classes.length - 1];
      last.categories.push(...pendingCategories);
      last.expectedCount += pendingExpected;
      last.observedCount += pendingObserved;
    }
  }

  let chi2 = 0;
  for (const mergedClass of classes) {
    if (mergedClass.expectedCount > 0) {
      const difference = mergedClass.observedCount - mergedClass.expectedCount;
      chi2 += (difference * difference) / mergedClass.expectedCount;
    }
  }

  return { classes, chi2, dof: Math.max(0, classes.length - 1) };
}

/**
 * Focus-mode binomial quantities for one category.
 *
 * - `zScore` is `(O - Np) / sqrt(Np(1-p))` only when `Np >= 10`; otherwise it is
 *   `null` and the exact binomial quantities below are used instead.
 * - `probabilityZero = P(X = 0) = (1 - p)^N`.
 * - `tailProbability = P(X >= observedCount)`.
 *
 * @param {object} params
 * @param {string} params.category Category name.
 * @param {number} params.handsN Number of hands dealt `N`.
 * @param {number} params.observedCount Observed count `O` for the category.
 * @returns {{
 *   category: string,
 *   handsN: number,
 *   observedCount: number,
 *   expectedCount: number,
 *   p: number,
 *   zScore: number | null,
 *   zEligible: boolean,
 *   probabilityZero: number,
 *   tailProbability: number,
 * }} Focus-mode quantities.
 * @throws {TypeError|RangeError} If the inputs are invalid.
 */
export function focusCategoryStats({ category, handsN, observedCount }) {
  assertIntegerInRange(handsN, 'handsN', MIN_HANDS_N, MAX_HANDS_N);
  assertIntegerInRange(observedCount, 'observedCount', 0, handsN);
  const probabilities = getTheoryProbabilities();
  const p = probabilities[category];
  if (p === undefined) {
    throw new RangeError(`focusCategoryStats received an unknown category "${category}".`);
  }

  const expectedCount = handsN * p;
  const zEligible = expectedCount >= MIN_EXPECTED_FOR_Z_SCORE;
  const zScore = zEligible
    ? (observedCount - expectedCount) / Math.sqrt(expectedCount * (1 - p))
    : null;

  return {
    category,
    handsN,
    observedCount,
    expectedCount,
    p,
    zScore,
    zEligible,
    probabilityZero: binomialProbabilityZero(handsN, p),
    tailProbability: binomialTailProbability(handsN, p, observedCount),
  };
}


/**
 * Run the seeded 5-card poker Monte-Carlo simulation.
 *
 * Deals `handsN` independent hands (each from a fresh full deck), classifies
 * each into exactly one of the ten categories, and returns a reproducible
 * snapshot with observed/empirical and expected/theoretical quantities, per
 * category z-scores (only where `N·p >= 10`, otherwise `null` with an explicit
 * eligibility flag), the merged-class chi-square goodness of fit, and optional
 * focus-mode binomial quantities.
 *
 * A zero observed count for a rare hand is a normal outcome and is never an
 * error. The simulation illustrates the theory; it never proves it.
 *
 * @param {object} params
 * @param {number} params.handsN Number of hands `N`; integer in [500, 100000].
 * @param {number} [params.seed] Optional seed (nonnegative safe integer; seed 0
 *   is valid). When omitted a random seed is generated and reported as
 *   `seedUsed` so the run is reproducible.
 * @param {string} [params.focusCategory] Optional single category for focus mode.
 * @returns {{
 *   inputs: { handsN: number, seedUsed: number },
 *   categories: string[],
 *   observedCountsByCategory: Record<string, number>,
 *   empiricalProbByCategory: Record<string, number>,
 *   expectedCountsByCategory: Record<string, number>,
 *   expectedProbByCategory: Record<string, number>,
 *   zScoresByCategory: Record<string, number | null>,
 *   zScoreEligibleByCategory: Record<string, boolean>,
 *   chiSquare: { classes: object[], chi2: number, dof: number, pValue: number },
 *   focus: object | null,
 * }} The simulation snapshot.
 * @throws {TypeError|RangeError} If any argument is invalid.
 */
export function runPokerSimulation({ handsN, seed, focusCategory } = {}) {
  assertIntegerInRange(handsN, 'handsN', MIN_HANDS_N, MAX_HANDS_N);

  // Validate the supplied seed before doing any work; otherwise draw a new one.
  // The reported seedUsed is normalized to uint32 exactly as createSeededRng
  // normalizes internally (seed >>> 0), so the displayed seed is the seed the
  // RNG actually uses and reproduces the run. Passing the already-normalized
  // value back into createSeededRng is idempotent, so determinism is unchanged.
  const hasSeed = seed !== undefined;
  if (hasSeed) {
    createSeededRng(seed);
  }
  const UINT32_RANGE = 4294967296; // 2 ** 32
  const seedUsed = hasSeed ? seed >>> 0 : Math.floor(Math.random() * UINT32_RANGE);
  const rng = createSeededRng(seedUsed);

  const expectedProbByCategory = getTheoryProbabilities();

  const observedCountsByCategory = {};
  for (const category of CATEGORIES_RAREST_FIRST) {
    observedCountsByCategory[category] = 0;
  }

  for (let handIndex = 0; handIndex < handsN; handIndex += 1) {
    const hand = dealFiveCardHand(rng);
    observedCountsByCategory[classifyFiveCardHand(hand)] += 1;
  }

  const empiricalProbByCategory = {};
  const expectedCountsByCategory = {};
  const zScoresByCategory = {};
  const zScoreEligibleByCategory = {};

  for (const category of CATEGORIES_RAREST_FIRST) {
    const observed = observedCountsByCategory[category];
    const p = expectedProbByCategory[category];
    const expected = handsN * p;
    empiricalProbByCategory[category] = observed / handsN;
    expectedCountsByCategory[category] = expected;
    const eligible = expected >= MIN_EXPECTED_FOR_Z_SCORE;
    zScoreEligibleByCategory[category] = eligible;
    zScoresByCategory[category] = eligible
      ? (observed - expected) / Math.sqrt(expected * (1 - p))
      : null;
  }

  const merged = mergeCategoriesForChiSquare({
    expectedCounts: expectedCountsByCategory,
    observedCounts: observedCountsByCategory,
    orderRarestToCommonest: CATEGORIES_RAREST_FIRST,
  });
  const chiSquare = {
    classes: merged.classes,
    chi2: merged.chi2,
    dof: merged.dof,
    pValue: chiSquarePValue({ chi2: merged.chi2, dof: merged.dof }),
  };

  const focus =
    focusCategory === undefined
      ? null
      : focusCategoryStats({
          category: focusCategory,
          handsN,
          observedCount: observedCountsByCategory[focusCategory],
        });

  return {
    inputs: { handsN, seedUsed },
    categories: [...CATEGORIES_RAREST_FIRST],
    observedCountsByCategory,
    empiricalProbByCategory,
    expectedCountsByCategory,
    expectedProbByCategory,
    zScoresByCategory,
    zScoreEligibleByCategory,
    chiSquare,
    focus,
  };
}

