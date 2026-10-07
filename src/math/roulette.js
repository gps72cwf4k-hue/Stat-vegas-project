/**
 * Exact European roulette rules: the 37 equally likely pockets (integers 0–36),
 * their colours, and the single-spin event probabilities.
 *
 * This module is the one source of truth for roulette. It is pure: no
 * randomness, no simulation and no dependencies. Colour is taken from the
 * standard European colour table, never inferred from parity or numerical
 * alternation, and the physical wheel order is irrelevant here.
 *
 * @typedef {'red' | 'black' | 'green'} RouletteColour
 */

/**
 * The 18 red pockets of the European wheel. All other nonzero pockets (1–36)
 * are black, and 0 is green. Kept private: callers must use
 * {@link getRouletteColour}, so no mutable lookup state is shared.
 * @type {ReadonlySet<number>}
 */
const RED_POCKETS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/**
 * Immutable description of the European roulette wheel. There is no American
 * double-zero pocket.
 * @type {Readonly<{
 *   pocketCount: number,
 *   minPocket: number,
 *   maxPocket: number,
 *   redCount: number,
 *   blackCount: number,
 *   greenCount: number,
 * }>}
 */
export const EUROPEAN_ROULETTE = Object.freeze({
  pocketCount: 37,
  minPocket: 0,
  maxPocket: 36,
  redCount: 18,
  blackCount: 18,
  greenCount: 1,
});

/**
 * Colour of a single European roulette pocket.
 *
 * Validation is strict on purpose: the pocket must be an integer within 0–36.
 * Strings are not coerced, fractions are not rounded, out-of-range values are
 * not clamped and numbers are not reduced modulo 37.
 *
 * @param {number} pocket Pocket number (integer 0–36).
 * @returns {RouletteColour} `"green"` for 0, `"red"` for a red pocket and
 *   `"black"` otherwise.
 * @throws {TypeError} If `pocket` is not a number.
 * @throws {RangeError} If `pocket` is not a finite integer within 0–36.
 */
export function getRouletteColour(pocket) {
  if (typeof pocket !== 'number') {
    throw new TypeError(`getRouletteColour pocket must be a number, received ${typeof pocket}.`);
  }
  if (!Number.isInteger(pocket)) {
    throw new RangeError(`getRouletteColour pocket must be an integer, received ${pocket}.`);
  }
  if (pocket < EUROPEAN_ROULETTE.minPocket || pocket > EUROPEAN_ROULETTE.maxPocket) {
    throw new RangeError(
      `getRouletteColour pocket must be between ${EUROPEAN_ROULETTE.minPocket} and ` +
        `${EUROPEAN_ROULETTE.maxPocket}, received ${pocket}.`,
    );
  }

  if (pocket === 0) {
    return 'green';
  }
  return RED_POCKETS.has(pocket) ? 'red' : 'black';
}

/**
 * Exact single-spin probabilities for the European wheel, computed from the
 * shared rule constants.
 *
 * - `red`, `black` and `green` partition the wheel: they are disjoint and their
 *   probabilities sum to 1.
 * - `straightUp` is the probability of one *specified* pocket (1/37). It is not
 *   a fourth disjoint colour outcome; it overlaps the colour events.
 * - Any specific pocket has probability 1/37.
 * - The chosen jackpot pocket will be configured in a later task; this module
 *   does not implement payouts or expected profit.
 *
 * @returns {{ red: number, black: number, green: number, straightUp: number }}
 *   Unrounded probabilities as raw numbers (not percentages or strings).
 */
export function getRouletteProbabilities() {
  const { pocketCount, redCount, blackCount, greenCount } = EUROPEAN_ROULETTE;

  return {
    red: redCount / pocketCount,
    black: blackCount / pocketCount,
    green: greenCount / pocketCount,
    straightUp: 1 / pocketCount,
  };
}
