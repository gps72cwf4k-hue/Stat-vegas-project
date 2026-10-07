import { describe, it, expect } from 'vitest';
import { getMontyHallProbabilities } from './montyHall.js';

const DOORS = [0, 1, 2];

describe('getMontyHallProbabilities', () => {
  it('returns the exact theoretical values', () => {
    const { stay, switch: switchProb } = getMontyHallProbabilities();

    expect(stay).toBe(1 / 3);
    expect(switchProb).toBe(2 / 3);
  });

  it('returns finite probabilities within [0, 1]', () => {
    const { stay, switch: switchProb } = getMontyHallProbabilities();

    for (const value of [stay, switchProb]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('returns probabilities that sum to approximately 1', () => {
    const { stay, switch: switchProb } = getMontyHallProbabilities();

    expect(stay + switchProb).toBeCloseTo(1, 12);
  });
});

/**
 * Independent exhaustive enumeration of the whole three-door Monty Hall tree.
 * Every (car, player) pair is realised with probability 1/9; the host's legal
 * choices share that pair's weight equally. The results are accumulated from
 * the door contents alone, never from the exported probabilities.
 */
function enumerateMontyHall() {
  let weight = 0;
  let stayWins = 0;
  let switchWins = 0;
  let twoChoicePairs = 0;
  let oneChoicePairs = 0;
  let expandedOutcomes = 0;

  for (const car of DOORS) {
    for (const playerPick of DOORS) {
      // Legal host doors: unchosen goat doors only.
      const legalHostChoices = DOORS.filter(
        (door) => door !== playerPick && door !== car,
      );
      const weightPerHostChoice = (1 / 9) / legalHostChoices.length;

      // Derived from the actual enumeration, not a hard-coded fixture:
      // 3 car/player pairs leave two goat doors, 6 leave only one.
      if (legalHostChoices.length === 2) {
        twoChoicePairs += 1;
      } else if (legalHostChoices.length === 1) {
        oneChoicePairs += 1;
      }
      expandedOutcomes += legalHostChoices.length;

      for (const opened of legalHostChoices) {
        // The host must reveal a goat and never the player's own door.
        expect(opened).not.toBe(car);
        expect(opened).not.toBe(playerPick);

        // Switch to the only door that is neither the initial pick nor opened.
        const switchDoor = DOORS.find(
          (door) => door !== playerPick && door !== opened,
        );
        expect(switchDoor).not.toBe(playerPick);
        expect(switchDoor).not.toBe(opened);

        // Staying wins iff the initial pick already held the car.
        if (playerPick === car) {
          stayWins += weightPerHostChoice;
        }
        // Switching wins iff the final door holds the car.
        if (switchDoor === car) {
          switchWins += weightPerHostChoice;
        }
        weight += weightPerHostChoice;
      }
    }
  }

  return {
    weight,
    stayWins,
    switchWins,
    twoChoicePairs,
    oneChoicePairs,
    expandedOutcomes,
  };
}

describe('Monty Hall exhaustive enumeration', () => {
  const { weight, stayWins, switchWins, twoChoicePairs, oneChoicePairs, expandedOutcomes } =
    enumerateMontyHall();

  it('covers the full probability space (total weight approximately 1)', () => {
    expect(weight).toBeCloseTo(1, 12);
  });

  it('enumerates a stay probability matching the exported value', () => {
    const { stay } = getMontyHallProbabilities();

    expect(stayWins).toBeCloseTo(stay, 12);
  });

  it('enumerates a switch probability matching the exported value', () => {
    const { switch: switchProb } = getMontyHallProbabilities();

    expect(switchWins).toBeCloseTo(switchProb, 12);
  });

  it('visits the expected mix of host choices (3 two-choice, 6 one-choice, 12 outcomes)', () => {
    // Counts come from the actual enumeration above, not from hard-coded fixtures.
    // 3 car/player pairs leave both remaining doors as goats (two host choices);
    // the other 6 pairs leave exactly one goat (one host choice). 3*2 + 6*1 = 12.
    expect(twoChoicePairs).toBe(3);
    expect(oneChoicePairs).toBe(6);
    expect(expandedOutcomes).toBe(12);
  });
});
