/**
 * Exact theoretical probabilities for the standard three-door Monty Hall
 * problem. No randomness, no simulation and no dependencies: these values are
 * pure numbers that do not depend on the number of experiments or a seed.
 *
 * Standard assumptions:
 * - The car is equally likely to be behind any of the three doors (uniform).
 * - The player's initial choice is independent of the car location.
 * - The host knows where the car is and always opens an unchosen goat door.
 * - When two goat doors are available, the host picks uniformly.
 * - The player switches to the only other unopened door.
 *
 * Why staying wins 1/3 of the time: the player wins by staying exactly when
 * the initial choice was already the car, which happens with probability 1/3.
 *
 * Why switching wins 2/3 of the time: the player wins by switching exactly
 * when the initial choice was wrong (a goat), because the host then removes
 * the other goat and the single remaining door must hold the car. The initial
 * choice is wrong with probability 2/3.
 *
 * @returns {{ stay: number, switch: number }} Plain object with the numeric
 *   probabilities: `stay` = 1/3 and `switch` = 2/3. Values are raw numbers
 *   (not rounded, not percentages, not strings).
 */
export function getMontyHallProbabilities() {
  return {
    stay: 1 / 3,
    switch: 2 / 3,
  };
}
