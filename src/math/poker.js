/**
 * Pure 5-card poker mathematics: card/deck model, the exact classifier into the
 * ten mutually exclusive hand categories, and the integer combinatorial counts.
 *
 * This module is the single source of truth for poker. It is pure: no
 * randomness, no simulation, no DOM and no dependencies.
 *
 * ## Card representation
 * A card is a compact integer in `0..51`:
 * - `rank = Math.floor(card / 4) + 2`, so rank is `2..14` (11=J, 12=Q, 13=K, 14=A);
 * - `suit = card % 4`, so suit is `0..3`.
 *
 * The encoding removes any rank/suit ambiguity: every integer in `0..51` is
 * exactly one (rank, suit) pair, and the mapping is a bijection.
 *
 * @typedef {number} Card Integer in `0..51`.
 * @typedef {'Royal Flush' | 'Straight Flush' | 'Four of a Kind' | 'Full House'
 *   | 'Flush' | 'Straight' | 'Three of a Kind' | 'Two Pair' | 'One Pair'
 *   | 'High Card'} PokerCategory
 */

/** Number of cards in a standard deck. */
export const CARD_COUNT = 52;

/** Number of cards in a hand. */
export const HAND_SIZE = 5;

/** Number of distinct ranks (2..14). */
export const RANK_COUNT = 13;

/** Number of suits (0..3). */
export const SUIT_COUNT = 4;

/** Lowest rank value (deuce). */
export const MIN_RANK = 2;

/** Highest rank value (ace). */
export const MAX_RANK = 14;

/**
 * The ten hand categories in decreasing-strength order. Frozen so callers
 * cannot mutate the shared canonical list.
 * @type {ReadonlyArray<PokerCategory>}
 */
export const POKER_CATEGORIES = Object.freeze([
  'Royal Flush',
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'One Pair',
  'High Card',
]);

/**
 * The ten straight rank sequences on the ace-high scale, plus the ace-low wheel.
 * "No wrap-around" is enforced by using only these ten sequences (for example
 * `Q-K-A-2-3` is not present). The wheel is written `[14, 2, 3, 4, 5]` so its
 * rank set is `{2,3,4,5,14}`.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const STRAIGHT_SEQUENCES = Object.freeze([
  Object.freeze([14, 2, 3, 4, 5]),
  Object.freeze([2, 3, 4, 5, 6]),
  Object.freeze([3, 4, 5, 6, 7]),
  Object.freeze([4, 5, 6, 7, 8]),
  Object.freeze([5, 6, 7, 8, 9]),
  Object.freeze([6, 7, 8, 9, 10]),
  Object.freeze([7, 8, 9, 10, 11]),
  Object.freeze([8, 9, 10, 11, 12]),
  Object.freeze([9, 10, 11, 12, 13]),
  Object.freeze([10, 11, 12, 13, 14]),
]);

/**
 * The royal-flush rank set `{10,11,12,13,14}` as a sorted comma key.
 * @type {string}
 */
const ROYAL_RANK_KEY = '10,11,12,13,14';

/**
 * Bit masks (bit `rank` set for each rank value 0..14) for the ten straight
 * sequences. Precomputed once so straight detection is one `includes` check.
 * @type {ReadonlyArray<number>}
 */
const STRAIGHT_MASKS = Object.freeze(
  STRAIGHT_SEQUENCES.map((sequence) => sequence.reduce((mask, rank) => mask | (1 << rank), 0)),
);

/**
 * Rank label lookup shared by {@link parseCard}.
 * @type {Readonly<Record<string, number>>}
 */
const RANK_LABELS = Object.freeze({
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
});

/** Suit labels in suit-index order (`0..3`). @type {string} */
const SUIT_LABELS = 'SHDC';

/**
 * Builds the standard 52-card deck as integers `0..51`.
 *
 * Deterministic and allocation-bounded: the returned array is always
 * `[0, 1, ..., 51]` on a fresh call, so callers may shuffle their own copy.
 * @returns {Card[]} A new array of the 52 cards.
 */
export function buildStandardDeck() {
  const deck = new Array(CARD_COUNT);
  for (let card = 0; card < CARD_COUNT; card += 1) {
    deck[card] = card;
  }
  return deck;
}

/**
 * Validates that a value is a well-formed card (integer in `0..51`).
 * @param {Card} card Candidate card.
 * @returns {Card} The same card, for chaining.
 * @throws {TypeError} If `card` is not a number.
 * @throws {RangeError} If `card` is not an integer in `0..51`.
 */
export function assertValidCard(card) {
  if (typeof card !== 'number') {
    throw new TypeError(`card must be a number, received ${typeof card}.`);
  }
  if (!Number.isInteger(card) || card < 0 || card > CARD_COUNT - 1) {
    throw new RangeError(`card must be an integer in 0..${CARD_COUNT - 1}, received ${card}.`);
  }
  return card;
}

/**
 * Rank of a card as `2..14` (11=J, 12=Q, 13=K, 14=A).
 * @param {Card} card Card integer in `0..51`.
 * @returns {number} Rank in `2..14`.
 */
export function cardRank(card) {
  return Math.floor(assertValidCard(card) / SUIT_COUNT) + MIN_RANK;
}

/**
 * Suit of a card as `0..3`.
 * @param {Card} card Card integer in `0..51`.
 * @returns {number} Suit in `0..3`.
 */
export function cardSuit(card) {
  return assertValidCard(card) % SUIT_COUNT;
}

/**
 * Parses a compact card label such as `"AS"` (ace of spades) into a card
 * integer. Intended for readable tests; there is no UI use yet.
 *
 * Format: one or two rank characters (`"2".."10"`, `"J"`, `"Q"`, `"K"`, `"A"`,
 * case-insensitive) followed by one suit character (`"S"`, `"H"`, `"D"`, `"C"`).
 *
 * @param {string} label Card label, e.g. `"AS"`, `"10H"`, `"KD"`.
 * @returns {Card} The encoded card integer in `0..51`.
 * @throws {TypeError} If `label` is not a string.
 * @throws {RangeError} If `label` is not a recognised card label.
 */
export function parseCard(label) {
  if (typeof label !== 'string') {
    throw new TypeError(`parseCard label must be a string, received ${typeof label}.`);
  }
  const match = /^(10|[2-9]|[JQKA])([SHDC])$/i.exec(label.trim());
  if (match === null) {
    throw new RangeError(`parseCard could not parse "${label}".`);
  }

  const [, rankToken, suitToken] = match;
  const rank = RANK_LABELS[rankToken.toUpperCase()];
  if (rank === undefined) {
    throw new RangeError(`parseCard could not parse rank in "${label}".`);
  }
  const suit = SUIT_LABELS.indexOf(suitToken.toUpperCase());
  return (rank - MIN_RANK) * SUIT_COUNT + suit;
}


/**
 * Builds the histogram of the five rank values in a hand.
 * @param {ReadonlyArray<number>} ranks Array of five rank values.
 * @returns {Map<number, number>} Map from rank to its multiplicity.
 */
function buildRankMultiplicities(ranks) {
  const counts = new Map();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

/**
 * True when the five distinct ranks form one of the ten straight sequences.
 * Uses a bit mask over the rank values, so the ace-low wheel is its explicit
 * `{2,3,4,5,14}` sequence rather than a value-arithmetic special case.
 * @param {ReadonlyArray<number>} ranks Five distinct rank values.
 * @returns {boolean} Whether the ranks form a straight.
 */
function isStraightRanks(ranks) {
  let mask = 0;
  for (const rank of ranks) {
    mask |= 1 << rank;
  }
  return STRAIGHT_MASKS.includes(mask);
}

/**
 * Classifies a five-card hand into exactly one of the ten categories defined in
 * `docs/specs/poker.md`.
 *
 * Exclusions are resolved by testing the strongest applicable condition first,
 * so each hand maps to exactly one category:
 * 1. royal flush (flush and ranks exactly 10-J-Q-K-A),
 * 2. straight flush (flush and straight, excluding royal),
 * 3. four of a kind, 4. full house,
 * 5. flush (flush and not a straight),
 * 6. straight (straight and not a flush),
 * 7. three of a kind, 8. two pair, 9. one pair, 10. high card.
 *
 * The result is invariant under reordering the five cards and under any global
 * permutation of the four suits, because only the rank multiplicities and the
 * all-same-suit predicate are used.
 *
 * @param {ReadonlyArray<Card>} cards Exactly five distinct cards (`0..51`).
 * @returns {PokerCategory} The category name, one of {@link POKER_CATEGORIES}.
 * @throws {TypeError} If `cards` is not an array.
 * @throws {RangeError} If `cards` does not contain exactly five distinct valid cards.
 */
export function classifyFiveCardHand(cards) {
  if (!Array.isArray(cards)) {
    throw new TypeError(`classifyFiveCardHand expects an array, received ${typeof cards}.`);
  }
  if (cards.length !== HAND_SIZE) {
    throw new RangeError(
      `classifyFiveCardHand expects exactly ${HAND_SIZE} cards, received ${cards.length}.`,
    );
  }

  const ranks = new Array(HAND_SIZE);
  const suits = new Array(HAND_SIZE);
  const seen = new Set();
  for (let i = 0; i < HAND_SIZE; i += 1) {
    const card = assertValidCard(cards[i]);
    if (seen.has(card)) {
      throw new RangeError(`classifyFiveCardHand received the duplicate card ${card}.`);
    }
    seen.add(card);
    ranks[i] = cardRank(card);
    suits[i] = cardSuit(card);
  }

  const flush = suits.every((suit) => suit === suits[0]);
  const sortedRanks = ranks.slice().sort((a, b) => a - b);
  const allRanksDistinct = new Set(sortedRanks).size === HAND_SIZE;
  const straight = allRanksDistinct && isStraightRanks(sortedRanks);

  if (flush) {
    if (sortedRanks.join(',') === ROYAL_RANK_KEY) {
      return 'Royal Flush';
    }
    if (straight) {
      return 'Straight Flush';
    }
    return 'Flush';
  }

  if (straight) {
    return 'Straight';
  }

  // Not a flush and not a straight: classify by descending rank multiplicities,
  // e.g. "4,1" / "3,2" / "3,1,1" / "2,2,1" / "2,1,1,1" / "1,1,1,1,1".
  const multiplicities = buildRankMultiplicities(sortedRanks);
  const pattern = [...multiplicities.values()].sort((a, b) => b - a).join(',');

  switch (pattern) {
    case '4,1':
      return 'Four of a Kind';
    case '3,2':
      return 'Full House';
    case '3,1,1':
      return 'Three of a Kind';
    case '2,2,1':
      return 'Two Pair';
    case '2,1,1,1':
      return 'One Pair';
    default:
      return 'High Card';
  }
}


/**
 * Exact binomial coefficient `C(n, k)` computed with integer arithmetic.
 *
 * The multiplicative product is accumulated in `BigInt`, so the result is exact
 * and free of floating-point rounding. A `Number` is returned because every
 * poker count is far below `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} n Total number of items (non-negative integer).
 * @param {number} k Number of chosen items (non-negative integer, `<= n`).
 * @returns {number} Exact `C(n, k)`.
 * @throws {RangeError} If `n`/`k` are not non-negative integers with `k <= n`.
 */
export function nCk(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    throw new RangeError(`nCk expects integers 0 <= k <= n, received (${n}, ${k}).`);
  }
  const smaller = Math.min(k, n - k);
  let result = 1n;
  const bigN = BigInt(n);
  for (let i = 0; i < smaller; i += 1) {
    result = (result * (bigN - BigInt(i))) / BigInt(i + 1);
  }
  return Number(result);
}

/**
 * Exact factorial `n!` computed with integer arithmetic.
 * @param {number} n Non-negative integer.
 * @returns {number} Exact `n!`.
 * @throws {RangeError} If `n` is not a non-negative integer.
 */
export function factorial(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`factorial expects a non-negative integer, received ${n}.`);
  }
  let result = 1n;
  for (let i = 2n; i <= BigInt(n); i += 1n) {
    result *= i;
  }
  return Number(result);
}

/**
 * Total number of unordered 5-card hands, `C(52, 5)`, computed from the formula
 * (never hard-coded). This is `|Ω| = 2 598 960`.
 * @returns {number} `C(52, 5)`.
 */
export function getTotalHandCount() {
  return nCk(CARD_COUNT, HAND_SIZE);
}

/**
 * The ten hand counts computed from the closed-form derivations in the spec.
 * Every value comes from {@link nCk} or integer powers, never a hard-coded table:
 * - Royal flush: `4`.
 * - Straight flush (excl. royal): `4*10 - 4`.
 * - Four of a kind: `13 * 48`.
 * - Full house: `13*C(4,3) * 12*C(4,2)`.
 * - Flush (excl. straight/royal flush): `4 * (C(13,5) - 10)`.
 * - Straight (not all one suit): `10 * (4^5 - 4)`.
 * - Three of a kind: `13*C(4,3) * C(12,2) * 4^2`.
 * - Two pair: `C(13,2) * C(4,2)^2 * 44`.
 * - One pair: `13*C(4,2) * C(12,3) * 4^3`.
 * - High card: `(C(13,5) - 10) * (4^5 - 4)`.
 *
 * @returns {Record<PokerCategory, number>} Exact integer count per category.
 */
export function getPokerDerivations() {
  const straightCount = STRAIGHT_SEQUENCES.length;
  const fiveDistinctRankSets = nCk(RANK_COUNT, HAND_SIZE);
  const fiveSuitChoices = SUIT_COUNT ** HAND_SIZE;
  const rankSetsWithoutStraight = fiveDistinctRankSets - straightCount;
  const offPairCardsForTwoPair = CARD_COUNT - 2 * SUIT_COUNT; // 52 - 8 = 44.

  return {
    'Royal Flush': SUIT_COUNT,
    'Straight Flush': SUIT_COUNT * straightCount - SUIT_COUNT,
    'Four of a Kind': RANK_COUNT * (CARD_COUNT - SUIT_COUNT),
    'Full House': RANK_COUNT * nCk(SUIT_COUNT, 3) * (RANK_COUNT - 1) * nCk(SUIT_COUNT, 2),
    Flush: SUIT_COUNT * rankSetsWithoutStraight,
    Straight: straightCount * (fiveSuitChoices - SUIT_COUNT),
    'Three of a Kind': RANK_COUNT * nCk(SUIT_COUNT, 3) * nCk(RANK_COUNT - 1, 2) * SUIT_COUNT ** 2,
    'Two Pair': nCk(RANK_COUNT, 2) * nCk(SUIT_COUNT, 2) ** 2 * offPairCardsForTwoPair,
    'One Pair': RANK_COUNT * nCk(SUIT_COUNT, 2) * nCk(RANK_COUNT - 1, 3) * SUIT_COUNT ** 3,
    'High Card': rankSetsWithoutStraight * (fiveSuitChoices - SUIT_COUNT),
  };
}

/**
 * Exact integer count of every hand category, matching the theory table in
 * `docs/specs/poker.md`. The ten counts are mutually exclusive and sum exactly
 * to `C(52, 5) = 2 598 960`.
 * @returns {Record<PokerCategory, number>} Exact integer count per category.
 */
export function getPokerTheoryCounts() {
  return {
    'Royal Flush': 4,
    'Straight Flush': 36,
    'Four of a Kind': 624,
    'Full House': 3744,
    Flush: 5108,
    Straight: 10200,
    'Three of a Kind': 54912,
    'Two Pair': 123552,
    'One Pair': 1098240,
    'High Card': 1302540,
  };
}

/**
 * Exact integer count of the event "all five ranks are distinct",
 * `C(13,5) * 4^5 = 1 317 888`. It equals the disjoint union of High Card,
 * Straight, Flush, Straight Flush and Royal Flush.
 * @returns {number} `C(13,5) * 4^5`.
 */
export function getAllRankDistinctCount() {
  return nCk(RANK_COUNT, HAND_SIZE) * SUIT_COUNT ** HAND_SIZE;
}

/**
 * The categories in decreasing-strength order (a copy of the canonical list).
 * @returns {PokerCategory[]} Fresh array of the ten category names.
 */
export function getHandCategoryOrder() {
  return [...POKER_CATEGORIES];
}

