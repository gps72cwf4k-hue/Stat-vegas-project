import { describe, it, expect, vi, afterEach } from 'vitest';
import { simulateMontyHallTrial, runMontyHallSimulation, createInteractiveMontyHallRound } from './montyHall.js';
import { createSeededRng } from './rng.js';

const DOORS = [0, 1, 2];

/**
 * Build a deterministic RNG stub that returns the given values in order and
 * throws if it is asked for more values than were supplied.
 *
 * @param {number[]} values Values to return, one per call (each in [0, 1)).
 * @returns {() => number} A stub random source.
 */
function rngFrom(values) {
  let index = 0;
  return () => {
    if (index >= values.length) {
      throw new Error('rngFrom: exhausted the supplied values');
    }
    const value = values[index];
    index += 1;
    return value;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simulateMontyHallTrial', () => {
  it('rejects a non-function rng', () => {
    expect(() => simulateMontyHallTrial(undefined)).toThrow(TypeError);
    expect(() => simulateMontyHallTrial(0.5)).toThrow(TypeError);
  });

  /**
   * Enumerate every legal (car, initial, host) outcome with controlled RNG
   * values and verify the trial derives everything from the doors.
   *
   * Car/initial selection uses floor(rng() * 3), so a door d is chosen with a
   * value in [d/3, (d+1)/3). The host index uses floor(rng() * legalCount).
   */
  for (const carDoor of DOORS) {
    for (const initialDoor of DOORS) {
      const legalHostDoors = DOORS.filter(
        (door) => door !== initialDoor && door !== carDoor,
      );

      legalHostDoors.forEach((hostDoor, hostIndex) => {
        const carValue = carDoor / 3;
        const initialValue = initialDoor / 3;
        const hostValue = hostIndex / legalHostDoors.length;

        it(`car=${carDoor}, initial=${initialDoor}, host=${hostDoor} stays consistent`, () => {
          const trial = simulateMontyHallTrial(rngFrom([carValue, initialValue, hostValue]));

          expect(trial.carDoor).toBe(carDoor);
          expect(trial.initialDoor).toBe(initialDoor);

          // The host must open an unchosen goat door (not the car, not the pick).
          expect(trial.openedDoor).toBe(hostDoor);
          expect(trial.openedDoor).not.toBe(carDoor);
          expect(trial.openedDoor).not.toBe(initialDoor);

          // The switch door is the remaining unopened, unpicked door.
          const expectedSwitch = DOORS.find(
            (door) => door !== initialDoor && door !== trial.openedDoor,
          );
          expect(trial.switchDoor).toBe(expectedSwitch);
          expect(trial.switchDoor).not.toBe(initialDoor);
          expect(trial.switchDoor).not.toBe(trial.openedDoor);

          // Outcomes come from the actual car location.
          expect(trial.stayWin).toBe(initialDoor === carDoor);
          expect(trial.switchWin).toBe(trial.switchDoor === carDoor);

          // Paired outcomes: exactly one strategy wins.
          expect(Number(trial.stayWin) + Number(trial.switchWin)).toBe(1);
        });
      });
    }
  }

  it('uses both host choices when the player initially chose the car', () => {
    // car = initial = 0 leaves host doors {1, 2}: exercise both uniformly.
    const openedWithLow = simulateMontyHallTrial(rngFrom([0, 0, 0])).openedDoor;
    const openedWithHigh = simulateMontyHallTrial(rngFrom([0, 0, 0.6])).openedDoor;

    expect(openedWithLow).toBe(1);
    expect(openedWithHigh).toBe(2);
    expect(openedWithLow).not.toBe(openedWithHigh);
  });

  it('handles selection boundaries 0, 1/3, 2/3 and just below 1', () => {
    // 0 -> door 0, 1/3 -> door 1, 2/3 -> door 2 for both car and pick.
    const boundaryValues = [
      { value: 0, door: 0 },
      { value: 1 / 3, door: 1 },
      { value: 2 / 3, door: 2 },
      { value: 0.999999, door: 2 },
    ];

    for (const { value, door } of boundaryValues) {
      const trial = simulateMontyHallTrial(rngFrom([value, value, 0]));
      expect(trial.carDoor).toBe(door);
      expect(trial.initialDoor).toBe(door);
    }
  });
});


describe('runMontyHallSimulation', () => {
  it('returns valid counts and rates for N=1', () => {
    const result = runMontyHallSimulation({ experiments: 1, seed: 42 });

    expect(result.experiments).toBe(1);
    expect(Number.isInteger(result.switchWins)).toBe(true);
    expect(Number.isInteger(result.stayWins)).toBe(true);
    expect(result.switchWins + result.stayWins).toBe(1);
    expect(result.switchWinRate).toBe(result.switchWins / 1);
    expect(result.stayWinRate).toBe(result.stayWins / 1);
    expect(result.switchWinRate).toBeGreaterThanOrEqual(0);
    expect(result.switchWinRate).toBeLessThanOrEqual(1);
    expect(result.stayWinRate).toBeGreaterThanOrEqual(0);
    expect(result.stayWinRate).toBeLessThanOrEqual(1);
  });

  it('produces identical results for the same N and seed across runs', () => {
    const first = runMontyHallSimulation({ experiments: 500, seed: 7 });
    const second = runMontyHallSimulation({ experiments: 500, seed: 7 });

    expect(first).toEqual(second);
  });

  it('reproduces seed 0 (not treated as absent)', () => {
    const first = runMontyHallSimulation({ experiments: 300, seed: 0 });
    const second = runMontyHallSimulation({ experiments: 300, seed: 0 });

    expect(first).toEqual(second);
  });

  it('returns integer counts within [0, N] and rates equal to wins / N', () => {
    const experiments = 1234;
    const result = runMontyHallSimulation({ experiments, seed: 99 });

    for (const count of [result.switchWins, result.stayWins]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(experiments);
    }
    expect(result.switchWinRate).toBe(result.switchWins / experiments);
    expect(result.stayWinRate).toBe(result.stayWins / experiments);
  });

  it('uses paired trials so switch + stay wins equal N and rates sum to ~1', () => {
    const experiments = 2000;
    const result = runMontyHallSimulation({ experiments, seed: 2024 });

    expect(result.switchWins + result.stayWins).toBe(experiments);
    expect(result.switchWinRate + result.stayWinRate).toBeCloseTo(1, 12);
  });

  it('accepts the maximum N=50000', () => {
    const result = runMontyHallSimulation({ experiments: 50000, seed: 1 });

    expect(result.experiments).toBe(50000);
    expect(result.switchWins + result.stayWins).toBe(50000);
  });

  it('rejects invalid experiment counts', () => {
    for (const experiments of [0, -1, 1.5, NaN, Infinity, 50001, '100']) {
      expect(() => runMontyHallSimulation({ experiments })).toThrow();
    }
  });

  it('rejects invalid provided seeds', () => {
    expect(() => runMontyHallSimulation({ experiments: 10, seed: -5 })).toThrow();
    expect(() => runMontyHallSimulation({ experiments: 10, seed: 2.5 })).toThrow();
    expect(() => runMontyHallSimulation({ experiments: 10, seed: NaN })).toThrow();
    expect(() => runMontyHallSimulation({ experiments: 10, seed: '9' })).toThrow();
    expect(() => runMontyHallSimulation({ experiments: 10, seed: '' })).toThrow();
  });

  it('uses Math.random when the seed is absent (mocked, deterministic)', () => {
    // A known valid sequence: all 0.0 -> car 0, pick 0, host 1 on every trial.
    const randomValues = [0, 0, 0, 0, 0, 0];
    const spy = vi.spyOn(Math, 'random');
    randomValues.forEach((value) => spy.mockReturnValueOnce(value));

    const result = runMontyHallSimulation({ experiments: 2 });

    expect(spy).toHaveBeenCalledTimes(randomValues.length);
    // car = pick = 0 on both trials, so staying always wins.
    expect(result.switchWins).toBe(0);
    expect(result.stayWins).toBe(2);
  });

  it('coarse seeded sanity check: N=10000, seed 12345, tolerance 0.03', () => {
    // This is a coarse structural sanity check only. With N = 10000 the
    // standard error of a Binomial(N, 2/3)-like proportion is about
    // sqrt((2/3)(1/3)/10000) ~= 0.0047, so 0.03 is roughly six standard
    // errors. It is NOT proof of correctness; the exhaustive controlled-trial
    // tests above provide the structural guarantee.
    const TOLERANCE = 0.03;
    const result = runMontyHallSimulation({ experiments: 10000, seed: 12345 });

    expect(Math.abs(result.switchWinRate - 2 / 3)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(result.stayWinRate - 1 / 3)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe('createInteractiveMontyHallRound', () => {
  it('rejects invalid initial doors', () => {
    for (const initialDoor of [-1, 3, 1.5, NaN, Infinity, '1', undefined, null]) {
      expect(() => createInteractiveMontyHallRound(initialDoor, rngFrom([0, 0]))).toThrow(
        TypeError,
      );
    }
  });

  it('rejects a non-function rng', () => {
    expect(() => createInteractiveMontyHallRound(0, undefined)).not.toThrow();
    expect(() => createInteractiveMontyHallRound(0, 0.5)).toThrow(TypeError);
    expect(() => createInteractiveMontyHallRound(0, null)).toThrow(TypeError);
    expect(() => createInteractiveMontyHallRound(0, 'rng')).toThrow(TypeError);
  });

  /**
   * Exhaustively cover every legal (initial, car, host) outcome. The car is
   * chosen with floor(rng() * 3); the host index with floor(rng() * hostCount).
   */
  for (const initialDoor of DOORS) {
    for (const carDoor of DOORS) {
      const legalHostDoors = DOORS.filter(
        (door) => door !== initialDoor && door !== carDoor,
      );

      legalHostDoors.forEach((hostDoor, hostIndex) => {
        const carValue = carDoor / 3;
        const hostValue = hostIndex / legalHostDoors.length;

        it(`initial=${initialDoor}, car=${carDoor}, host=${hostDoor} is consistent`, () => {
          const round = createInteractiveMontyHallRound(
            initialDoor,
            rngFrom([carValue, hostValue]),
          );

          expect(round.initialDoor).toBe(initialDoor);
          expect(round.carDoor).toBe(carDoor);

          // The host never opens the initial door and never reveals the car.
          expect(round.openedDoor).toBe(hostDoor);
          expect(round.openedDoor).not.toBe(initialDoor);
          expect(round.openedDoor).not.toBe(carDoor);

          // The switch door is the remaining unopened, unpicked door.
          const expectedSwitch = DOORS.find(
            (door) => door !== initialDoor && door !== round.openedDoor,
          );
          expect(round.switchDoor).toBe(expectedSwitch);
          expect(round.switchDoor).not.toBe(initialDoor);
          expect(round.switchDoor).not.toBe(round.openedDoor);

          // Choosing the initial door wins iff it holds the car.
          expect(round.initialDoor === round.carDoor).toBe(initialDoor === carDoor);
          // Choosing the switch door wins iff it holds the car — which happens
          // exactly when the initial choice was a goat.
          expect(round.switchDoor === round.carDoor).toBe(initialDoor !== carDoor);
        });
      });
    }
  }

  it('exercises both host reveals when initialDoor equals carDoor', () => {
    const openedWithLow = createInteractiveMontyHallRound(0, rngFrom([0, 0])).openedDoor;
    const openedWithHigh = createInteractiveMontyHallRound(0, rngFrom([0, 0.6])).openedDoor;

    expect(openedWithLow).toBe(1);
    expect(openedWithHigh).toBe(2);
    expect(openedWithLow).not.toBe(openedWithHigh);
  });

  it('handles door-selection boundaries 0, 1/3, 2/3 and just below 1', () => {
    const boundaryValues = [
      { value: 0, door: 0 },
      { value: 1 / 3, door: 1 },
      { value: 2 / 3, door: 2 },
      { value: 0.999999, door: 2 },
    ];

    for (const { value, door } of boundaryValues) {
      const round = createInteractiveMontyHallRound(0, rngFrom([value, 0]));
      expect(round.carDoor).toBe(door);
    }
  });

  it('is reproducible when passing fresh generators with the same seed', () => {
    const first = createInteractiveMontyHallRound(1, createSeededRng(12345));
    const second = createInteractiveMontyHallRound(1, createSeededRng(12345));

    expect(first).toEqual(second);
    expect(DOORS).toContain(first.carDoor);
    expect(DOORS).toContain(first.openedDoor);
    expect(DOORS).toContain(first.switchDoor);
  });

  it('keeps the batch engine result unchanged (N=10000, seed 12345)', () => {
    const result = runMontyHallSimulation({ experiments: 10000, seed: 12345 });

    expect(result.switchWins).toBe(6598);
    expect(result.stayWins).toBe(3402);
  });
});
