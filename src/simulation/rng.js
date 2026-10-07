/**
 * Deterministic pseudo-random number generator based on the small, established
 * mulberry32 algorithm.
 *
 * Reproducible, NOT cryptographic: mulberry32 is a tiny 32-bit PRNG suitable
 * for educational simulations and tests. It must never be used for security.
 *
 * The seed contract:
 * - The seed must be a nonnegative safe integer (0 is valid).
 * - Invalid values (non-numbers, NaN, Infinity, negatives, fractions, unsafe
 *   integers, strings) are rejected with an error instead of being accepted.
 * - Accepted seeds are normalized to an unsigned 32-bit state (`seed >>> 0`).
 * - Seeds that normalize to the same 32-bit state produce the same sequence
 *   (for example, 0 and 2 ** 32 behave identically).
 *
 * @param {number} seed Nonnegative safe integer seed (0 is valid).
 * @returns {() => number} A generator whose private 32-bit state starts at the
 *   normalized seed. Each call returns a finite number in [0, 1). State is
 *   private to this generator; there is no module-level mutable state.
 * @throws {TypeError|RangeError} If the seed is not a valid nonnegative safe
 *   integer.
 */
export function createSeededRng(seed) {
  if (typeof seed !== 'number') {
    throw new TypeError(`createSeededRng seed must be a number, received ${typeof seed}.`);
  }
  if (!Number.isFinite(seed)) {
    throw new RangeError(`createSeededRng seed must be finite, received ${seed}.`);
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError(`createSeededRng seed must be an integer, received ${seed}.`);
  }
  if (seed < 0) {
    throw new RangeError(`createSeededRng seed must be nonnegative, received ${seed}.`);
  }
  if (seed > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`createSeededRng seed must be a safe integer, received ${seed}.`);
  }

  // Normalize to unsigned 32-bit state; equal states give equal sequences.
  let state = seed >>> 0;

  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
