import { describe, it, expect } from 'vitest';
import {
  buildStandardDeck,
  cardRank,
  cardSuit,
  parseCard,
  classifyFiveCardHand,
  nCk,
  factorial,
  getTotalHandCount,
  getPokerDerivations,
  getPokerTheoryCounts,
  getAllRankDistinctCount,
  getHandCategoryOrder,
  POKER_CATEGORIES,
  CARD_COUNT,
  HAND_SIZE,
  RANK_COUNT,
  SUIT_COUNT,
} from './poker.js';

/**
 * The ten categories in decreasing-strength order, duplicated here on purpose
 * so the expected list does not depend on the production constant under test.
 * @type {readonly string[]}
 */
const EXPECTED_CATEGORIES = [
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
];

/**
 * The theory table from `docs/specs/poker.md`, duplicated deliberately as an
 * independent reference (the exhaustive enumeration compares against this, not
 * against the module's own table).
 * @type {Readonly<Record<string, number>>}
 */
const REFERENCE_COUNTS = {
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

/** Total hands `C(52,5)` recomputed independently from factorials. */
const TOTAL_HANDS = 2598960;

/** Convenience: parse a list of card labels into cards. */
function hand(...labels) {
  return labels.map(parseCard);
}

describe('module constants and category order', () => {
  it('exposes the canonical deck geometry', () => {
    expect(CARD_COUNT).toBe(52);
    expect(HAND_SIZE).toBe(5);
    expect(RANK_COUNT).toBe(13);
    expect(SUIT_COUNT).toBe(4);
  });

  it('lists the ten categories in decreasing-strength order and is frozen', () => {
    expect([...POKER_CATEGORIES]).toEqual(EXPECTED_CATEGORIES);
    expect(Object.isFrozen(POKER_CATEGORIES)).toBe(true);
    expect(getHandCategoryOrder()).toEqual(EXPECTED_CATEGORIES);
    // getHandCategoryOrder returns a fresh copy, not the frozen shared array.
    expect(getHandCategoryOrder()).not.toBe(POKER_CATEGORIES);
  });

  it('has exactly ten distinct categories', () => {
    expect(new Set(POKER_CATEGORIES).size).toBe(10);
  });
});

describe('deck and card model', () => {
  it('builds the 52-card deck as integers 0..51', () => {
    const deck = buildStandardDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(Math.min(...deck)).toBe(0);
    expect(Math.max(...deck)).toBe(51);
    expect([...deck]).toEqual([...Array(52).keys()]);
  });

  it('encodes every card as a unique (rank, suit) pair', () => {
    const pairs = new Set();
    for (const card of buildStandardDeck()) {
      const rank = cardRank(card);
      const suit = cardSuit(card);
      expect(rank).toBeGreaterThanOrEqual(2);
      expect(rank).toBeLessThanOrEqual(14);
      expect(suit).toBeGreaterThanOrEqual(0);
      expect(suit).toBeLessThanOrEqual(3);
      pairs.add(`${rank}:${suit}`);
    }
    expect(pairs.size).toBe(52);
  });

  it('round-trips representative labels through parseCard/cardRank/cardSuit', () => {
    expect(cardRank(parseCard('2S'))).toBe(2);
    expect(cardRank(parseCard('10H'))).toBe(10);
    expect(cardRank(parseCard('JD'))).toBe(11);
    expect(cardRank(parseCard('QC'))).toBe(12);
    expect(cardRank(parseCard('KS'))).toBe(13);
    expect(cardRank(parseCard('AS'))).toBe(14);

    expect(cardSuit(parseCard('AS'))).toBe(0); // S
    expect(cardSuit(parseCard('AH'))).toBe(1); // H
    expect(cardSuit(parseCard('AD'))).toBe(2); // D
    expect(cardSuit(parseCard('AC'))).toBe(3); // C
  });

  it('rejects malformed labels and out-of-range cards', () => {
    expect(() => parseCard('ZZ')).toThrow(RangeError);
    expect(() => parseCard('1S')).toThrow(RangeError);
    expect(() => parseCard(5)).toThrow(TypeError);
    expect(() => cardRank(52)).toThrow(RangeError);
    expect(() => cardRank(-1)).toThrow(RangeError);
    expect(() => cardSuit(3.5)).toThrow(RangeError);
    expect(() => cardSuit('AS')).toThrow(TypeError);
  });
});

describe('combinatorial identities', () => {
  it('computes C(52,5) = 2 598 960 from the formula (not hard-coded)', () => {
    const fromFormula = (52 * 51 * 50 * 49 * 48) / (5 * 4 * 3 * 2 * 1);
    expect(fromFormula).toBe(TOTAL_HANDS);
    expect(factorial(5) * nCk(52, 5)).toBe(52 * 51 * 50 * 49 * 48);
    expect(nCk(52, 5)).toBe(TOTAL_HANDS);
    expect(getTotalHandCount()).toBe(TOTAL_HANDS);
    expect(getTotalHandCount()).toBe(fromFormula);

    // Ordered deals 52*51*50*49*48 = 120 * C(52,5) = 311 875 200.
    expect(52 * 51 * 50 * 49 * 48).toBe(120 * TOTAL_HANDS);
    expect(311875200).toBe(120 * TOTAL_HANDS);
  });

  it('computes exact binomial coefficients and factorials with integer arithmetic', () => {
    expect(nCk(13, 5)).toBe(1287);
    expect(nCk(13, 2)).toBe(78);
    expect(nCk(4, 3)).toBe(4);
    expect(nCk(4, 2)).toBe(6);
    expect(nCk(12, 2)).toBe(66);
    expect(nCk(12, 3)).toBe(220);
    expect(nCk(nCk(5, 2), 2)).toBe(nCk(10, 2));
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(13)).toBe(6227020800);
    expect(() => nCk(5, 6)).toThrow(RangeError);
    expect(() => nCk(-1, 0)).toThrow(RangeError);
    expect(() => factorial(-1)).toThrow(RangeError);
  });

  it('theory counts sum exactly to 2 598 960 and float probabilities sum to 1', () => {
    const counts = getPokerTheoryCounts();
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(TOTAL_HANDS);

    for (const value of Object.values(counts)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    const probabilitySum = Object.values(counts).reduce(
      (sum, value) => sum + value / TOTAL_HANDS,
      0,
    );
    expect(Math.abs(probabilitySum - 1)).toBeLessThan(1e-12);
  });

  it('each count equals its closed-form derivation (integer arithmetic)', () => {
    const derivations = getPokerDerivations();

    expect(derivations['Royal Flush']).toBe(4);
    expect(derivations['Straight Flush']).toBe(4 * 10 - 4);
    expect(derivations['Four of a Kind']).toBe(13 * 48);
    expect(derivations['Full House']).toBe(13 * nCk(4, 3) * 12 * nCk(4, 2));
    expect(derivations.Flush).toBe(4 * (nCk(13, 5) - 10));
    expect(derivations.Straight).toBe(10 * (4 ** 5 - 4));
    expect(derivations['Three of a Kind']).toBe(13 * nCk(4, 3) * nCk(12, 2) * 4 ** 2);
    expect(derivations['Two Pair']).toBe(nCk(13, 2) * nCk(4, 2) ** 2 * 44);
    expect(derivations['One Pair']).toBe(13 * nCk(4, 2) * nCk(12, 3) * 4 ** 3);
    expect(derivations['High Card']).toBe((nCk(13, 5) - 10) * (4 ** 5 - 4));

    // The derivations reproduce the reference table and each named spec value.
    expect(derivations).toEqual(REFERENCE_COUNTS);
    expect(derivations['Four of a Kind']).toBe(624);
    expect(derivations['Full House']).toBe(3744);
    expect(derivations.Flush).toBe(5108);
    expect(derivations.Straight).toBe(10200);
    expect(derivations['Three of a Kind']).toBe(54912);
    expect(derivations['Two Pair']).toBe(123552);
    expect(derivations['One Pair']).toBe(1098240);
    expect(derivations['High Card']).toBe(1302540);
  });

  it('satisfies the "all ranks distinct" event-algebra identity', () => {
    // 1 302 540 + 10 200 + 5 108 + 36 + 4 = C(13,5)*4^5 = 1 317 888.
    const highCard = REFERENCE_COUNTS['High Card'];
    const straight = REFERENCE_COUNTS.Straight;
    const flush = REFERENCE_COUNTS.Flush;
    const straightFlush = REFERENCE_COUNTS['Straight Flush'];
    const royalFlush = REFERENCE_COUNTS['Royal Flush'];

    expect(highCard + straight + flush + straightFlush + royalFlush).toBe(1317888);
    expect(nCk(13, 5) * 4 ** 5).toBe(1317888);
    expect(getAllRankDistinctCount()).toBe(1317888);
    expect(getAllRankDistinctCount()).toBe(nCk(13, 5) * 4 ** 5);

    // Complement: some rank repeats = C(52,5) - 1 317 888 = 1 281 072.
    expect(TOTAL_HANDS - getAllRankDistinctCount()).toBe(1281072);
  });
});


describe('classifyFiveCardHand — known examples from the spec', () => {
  it.each([
    // [labels, expected category, note]
    [['AS', 'KS', 'QS', 'JS', '10S'], 'Royal Flush', 'royal flush'],
    [['9H', '8H', '7H', '6H', '5H'], 'Straight Flush', 'straight flush'],
    [['AD', '2D', '3D', '4D', '5D'], 'Straight Flush', 'ace-low straight flush (not royal)'],
    [['KC', 'KD', 'KH', 'KS', '3D'], 'Four of a Kind', 'four of a kind'],
    [['8C', '8D', '8H', '4S', '4D'], 'Full House', 'full house'],
    [['AS', 'JS', '8S', '5S', '2S'], 'Flush', 'flush (not straight)'],
    [['6S', '7S', '8S', '9S', 'JS'], 'Flush', 'flush with a gap, not a straight flush'],
    [['10C', '9D', '8H', '7S', '6C'], 'Straight', 'straight (mixed suits)'],
    [['AC', '2D', '3H', '4S', '5C'], 'Straight', 'ace-low straight'],
    [['10S', 'JD', 'QH', 'KC', 'AS'], 'Straight', 'ace-high straight, mixed suits, not royal'],
    [['QS', 'KD', 'AH', '2C', '3D'], 'High Card', 'no wrap-around'],
    [['7C', '7D', '7H', 'KS', '2D'], 'Three of a Kind', 'three of a kind'],
    [['9C', '9D', '4H', '4S', 'AD'], 'Two Pair', 'two pair'],
    [['JC', 'JD', '8H', '5S', '2D'], 'One Pair', 'one pair'],
    [['AC', 'JD', '8H', '5S', '2D'], 'High Card', 'high card'],
  ])('classifies %j as %s (%s)', (labels, expected) => {
    expect(classifyFiveCardHand(hand(...labels))).toBe(expected);
  });

  it('distinguishes ace-low wheel from the royal and from wrap-around', () => {
    expect(classifyFiveCardHand(hand('AS', 'KS', 'QS', 'JS', '10S'))).toBe('Royal Flush');
    expect(classifyFiveCardHand(hand('AD', '2D', '3D', '4D', '5D'))).toBe('Straight Flush');
    expect(classifyFiveCardHand(hand('AC', '2D', '3H', '4S', '5C'))).toBe('Straight');
    // Q-K-A-2-3 is not a straight (no wrap-around).
    expect(classifyFiveCardHand(hand('QS', 'KD', 'AH', '2C', '3D'))).toBe('High Card');
  });

  it('returns only the ten documented category strings', () => {
    const sample = [
      hand('AS', 'KS', 'QS', 'JS', '10S'),
      hand('9H', '8H', '7H', '6H', '5H'),
      hand('KC', 'KD', 'KH', 'KS', '3D'),
      hand('8C', '8D', '8H', '4S', '4D'),
      hand('AS', 'JS', '8S', '5S', '2S'),
      hand('10C', '9D', '8H', '7S', '6C'),
      hand('7C', '7D', '7H', 'KS', '2D'),
      hand('9C', '9D', '4H', '4S', 'AD'),
      hand('JC', 'JD', '8H', '5S', '2D'),
      hand('AC', 'JD', '8H', '5S', '2D'),
    ];
    for (const cards of sample) {
      expect(EXPECTED_CATEGORIES).toContain(classifyFiveCardHand(cards));
    }
  });

  it('rejects wrong-size, duplicate-containing and invalid inputs', () => {
    expect(() => classifyFiveCardHand([])).toThrow(RangeError);
    expect(() => classifyFiveCardHand([0, 1, 2, 3])).toThrow(RangeError);
    expect(() => classifyFiveCardHand([0, 1, 2, 3, 5, 6])).toThrow(RangeError);
    expect(() => classifyFiveCardHand([0, 1, 2, 3, 3])).toThrow(RangeError);
    expect(() => classifyFiveCardHand([0, 1, 2, 3, 52])).toThrow(RangeError);
    expect(() => classifyFiveCardHand([0, 1, 2, 3, 'AS'])).toThrow(TypeError);
    expect(() => classifyFiveCardHand('AS')).toThrow(TypeError);
  });
});

describe('classifyFiveCardHand — invariance', () => {
  /** A spread of representative hands across several categories. */
  const SAMPLE_HANDS = [
    hand('AS', 'KS', 'QS', 'JS', '10S'),
    hand('9H', '8H', '7H', '6H', '5H'),
    hand('KC', 'KD', 'KH', 'KS', '3D'),
    hand('8C', '8D', '8H', '4S', '4D'),
    hand('AS', 'JS', '8S', '5S', '2S'),
    hand('10C', '9D', '8H', '7S', '6C'),
    hand('7C', '7D', '7H', 'KS', '2D'),
    hand('9C', '9D', '4H', '4S', 'AD'),
    hand('JC', 'JD', '8H', '5S', '2D'),
    hand('AC', 'JD', '8H', '5S', '2D'),
  ];

  it('is invariant under reordering the five cards', () => {
    for (const cards of SAMPLE_HANDS) {
      const expected = classifyFiveCardHand(cards);
      // Reverse, sorted ascending and descending orderings.
      const orderings = [
        [...cards].reverse(),
        [...cards].sort((a, b) => a - b),
        [...cards].sort((a, b) => b - a),
        [cards[3], cards[0], cards[4], cards[1], cards[2]],
      ];
      for (const ordering of orderings) {
        expect(classifyFiveCardHand(ordering)).toBe(expected);
      }
    }
  });

  it('is invariant under any global permutation of the four suits', () => {
    // Map each suit s to a permuted suit; try several permutations including
    // the identity and a full rotation.
    const permutations = [
      [0, 1, 2, 3],
      [1, 2, 3, 0],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
    ];
    for (const cards of SAMPLE_HANDS) {
      const expected = classifyFiveCardHand(cards);
      for (const perm of permutations) {
        const remapped = cards.map((card) => {
          const rank = cardRank(card);
          const suit = cardSuit(card);
          return (rank - 2) * SUIT_COUNT + perm[suit];
        });
        expect(classifyFiveCardHand(remapped)).toBe(expected);
      }
    }
  });
});


describe('sampling validity basics (classifier sanity only)', () => {
  it('never produces duplicate cards inside a hand over many samples', () => {
    const deck = buildStandardDeck();
    // Fixed seed xorshift32: deterministic, no Math.random, no uniformity claim.
    let state = 0x9e3779b9;
    const nextInt = (bound) => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state % bound;
    };

    for (let sample = 0; sample < 100000; sample += 1) {
      const draw = deck.slice();
      // Partial Fisher-Yates: 5 swaps, then take the first 5.
      for (let i = 0; i < HAND_SIZE; i += 1) {
        const j = i + nextInt(draw.length - i);
        const tmp = draw[i];
        draw[i] = draw[j];
        draw[j] = tmp;
      }
      const cards = draw.slice(0, HAND_SIZE);
      expect(new Set(cards).size).toBe(HAND_SIZE);
      const category = classifyFiveCardHand(cards);
      expect(EXPECTED_CATEGORIES).toContain(category);
    }
  });
});

describe('exhaustive enumeration of all C(52,5) hands', () => {
  it('classifies every unordered 5-card subset exactly once and matches the theory table', () => {
    const deck = buildStandardDeck();
    const counts = Object.fromEntries(EXPECTED_CATEGORIES.map((name) => [name, 0]));

    let total = 0;
    const cards = new Array(HAND_SIZE);

    // Five nested loops enumerate each unordered 5-subset exactly once
    // (i0 < i1 < i2 < i3 < i4). A single reused array avoids per-hand allocation.
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
              counts[classifyFiveCardHand(cards)] += 1;
              total += 1;
            }
          }
        }
      }
    }

    // (a) every hand mapped to exactly one category, (b) exact table, (c) total.
    expect(total).toBe(TOTAL_HANDS);
    expect(counts).toEqual(REFERENCE_COUNTS);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(TOTAL_HANDS);
  });
});

