/**
 * Exhaustive verification of the 5-card poker classifier.
 *
 * Enumerates all `C(52, 5) = 2,598,960` unordered 5-card hands exactly once,
 * classifies each with the pure classifier from `../../math/poker.js`, and
 * accumulates the ten category counts. The work is chunked and yielded to the
 * event loop so the browser stays responsive; the caller may cancel through an
 * `AbortSignal`.
 *
 * This module runs no randomness and holds no mutable state. It never stores
 * the hands themselves, only the counts.
 */

import { buildStandardDeck, classifyFiveCardHand, CARD_COUNT, HAND_SIZE, getPokerTheoryCounts } from '../../math/poker.js';

/** Total number of unordered 5-card hands, `C(52, 5)`: the enumeration length. */
export const TOTAL_HANDS = 2598960;

/** Faces processed per chunk before the time budget is even checked. */
const HANDS_PER_CHUNK = 200000;

/** Soft wall-clock budget (ms) for one chunk. */
const CHUNK_TIME_BUDGET_MS = 10;

/**
 * Create the error used when the verification is cancelled. Prefers the DOM
 * `AbortError` so callers detect it by `name`; falls back to a plain Error with
 * the same name outside browsers.
 *
 * @returns {Error} An error whose `name` is `"AbortError"`.
 */
function createAbortError() {
  const message = 'Poker exhaustive verification was cancelled.';
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Yield control to the event loop so the browser can paint. Uses a real timer
 * task boundary (a `setTimeout`), not just a resolved promise.
 *
 * @returns {Promise<void>} Resolves after the timer task runs.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Classify every unordered 5-card subset of the standard deck and count the ten
 * categories, in bounded asynchronous chunks.
 *
 * Progress: `onProgress` receives `{ completed, total }`; initial (0) and final
 * (= total) updates are emitted. Cancellation: `signal` is checked before work
 * starts, between chunks, after every yield and before publishing; on abort an
 * `AbortError` is thrown and nothing is returned.
 *
 * @param {object} [params]
 * @param {AbortSignal} [params.signal] Optional abort signal.
 * @param {(progress: { completed: number, total: number }) => void} [params.onProgress]
 *   Optional progress callback.
 * @returns {Promise<{
 *   observedCountsByCategory: Record<string, number>,
 *   theoryCountsByCategory: Record<string, number>,
 *   total: number,
 *   matchesTheory: boolean,
 * }>} Exact category counts and whether they equal the theory table exactly.
 * @throws {TypeError} If `signal` is not an AbortSignal or `onProgress` is not a function.
 * @throws {Error} An `AbortError` (name `"AbortError"`) if cancelled.
 */
export async function runPokerExhaustiveAsync({ signal, onProgress } = {}) {
  if (
    signal !== undefined &&
    (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')
  ) {
    throw new TypeError('signal must be an AbortSignal when provided.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress must be a function when provided.');
  }
  if (signal && signal.aborted) {
    throw createAbortError();
  }

  const deck = buildStandardDeck();
  const theoryCountsByCategory = getPokerTheoryCounts();
  const observedCountsByCategory = {};
  for (const category of Object.keys(theoryCountsByCategory)) {
    observedCountsByCategory[category] = 0;
  }

  const cards = new Array(HAND_SIZE);
  let completed = 0;
  const report = () => {
    if (onProgress) {
      onProgress({ completed, total: TOTAL_HANDS });
    }
  };
  report();

  // Five nested loops enumerate each unordered 5-subset exactly once
  // (i0 < i1 < i2 < i3 < i4). A single reused array avoids per-hand allocation.
  let chunkStart = Date.now();
  let inChunk = 0;

  for (let i0 = 0; i0 < CARD_COUNT - 4; i0 += 1) {
    cards[0] = deck[i0];
    for (let i1 = i0 + 1; i1 < CARD_COUNT - 3; i1 += 1) {
      cards[1] = deck[i1];
      for (let i2 = i1 + 1; i2 < CARD_COUNT - 2; i2 += 1) {
        cards[2] = deck[i2];
        for (let i3 = i2 + 1; i3 < CARD_COUNT - 1; i3 += 1) {
          cards[3] = deck[i3];
          for (let i4 = i3 + 1; i4 < CARD_COUNT; i4 += 1) {
            cards[4] = deck[i4];
            observedCountsByCategory[classifyFiveCardHand(cards)] += 1;
            completed += 1;
            inChunk += 1;

            if (inChunk >= HANDS_PER_CHUNK || Date.now() - chunkStart >= CHUNK_TIME_BUDGET_MS) {
              if (signal && signal.aborted) {
                throw createAbortError();
              }
              report();
              await yieldToEventLoop();
              if (signal && signal.aborted) {
                throw createAbortError();
              }
              chunkStart = Date.now();
              inChunk = 0;
            }
          }
        }
      }
    }
  }

  if (signal && signal.aborted) {
    throw createAbortError();
  }
  report();

  let matchesTheory = completed === TOTAL_HANDS;
  for (const category of Object.keys(theoryCountsByCategory)) {
    if (observedCountsByCategory[category] !== theoryCountsByCategory[category]) {
      matchesTheory = false;
    }
  }

  return {
    observedCountsByCategory,
    theoryCountsByCategory,
    total: completed,
    matchesTheory,
  };
}
