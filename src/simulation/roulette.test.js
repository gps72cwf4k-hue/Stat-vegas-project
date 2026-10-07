import { describe, it, expect, vi, afterEach } from 'vitest';
import { simulateRouletteExperiment, runRouletteSimulation, runRouletteSimulationAsync } from './roulette.js';
import { createSeededRng } from './rng.js';

const P_RED = 18 / 37;
const P_GREEN = 1 / 37;

/**
 * Deterministic RNG stub returning the given values in order; throws if asked
 * for more values than supplied (so an extra draw per spin is caught).
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

/** Pocket k maps to rng value k / 37 exactly for the boundary concerns. */
const POCKET = (k) => k / 37;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simulateRouletteExperiment — pocket binning', () => {
  it('draws pocket 0 (green) and pocket 36 (red) from their bin values', () => {
    const first = simulateRouletteExperiment({
      spins: 1,
      event: 'red',
      rng: rngFrom([POCKET(0)]),
    });
    expect(first.samplePockets).toEqual([0]);
    expect(first.colourCounts).toEqual({ red: 0, black: 0, green: 1 });

    const last = simulateRouletteExperiment({
      spins: 1,
      event: 'red',
      rng: rngFrom([1 - Number.EPSILON]), // just below 1 but inside pocket 36's bin
    });
    // 1 - EPSILON is still >= 36/37, so the drawn pocket is 36.
    expect(last.samplePockets).toEqual([36]);
    expect(last.colourCounts).toEqual({ red: 1, black: 0, green: 0 });
  });

  it('respects uniform-bin boundaries at k/37', () => {
    // Exact bin starts for a few pockets, using values safely representable.
    const boundaries = [
      [POCKET(0), 0],
      [POCKET(1), 1],
      [POCKET(18), 18],
      [POCKET(36), 36],
    ];
    for (const [value, expectedPocket] of boundaries) {
      const result = simulateRouletteExperiment({
        spins: 1,
        event: 'red',
        rng: rngFrom([value]),
      });
      expect(result.samplePockets).toEqual([expectedPocket]);
    }
  });

  it('classifies standard red and black pockets correctly', () => {
    // 1, 3 red; 2, 4 black; 0 green.
    const result = simulateRouletteExperiment({
      spins: 4,
      event: 'red',
      rng: rngFrom([POCKET(1), POCKET(2), POCKET(3), POCKET(4)]),
    });
    expect(result.samplePockets).toEqual([1, 2, 3, 4]);
    expect(result.eventHits).toBe(2); // pockets 1 and 3 are red
    expect(result.colourCounts).toEqual({ red: 2, black: 2, green: 0 });
  });
});

describe('simulateRouletteExperiment — events', () => {
  it('matches the red event by colour', () => {
    const result = simulateRouletteExperiment({
      spins: 3,
      event: 'red',
      rng: rngFrom([POCKET(19), POCKET(20), POCKET(32)]),
    });
    // 19 red, 20 black, 32 red.
    expect(result.eventHits).toBe(2);
  });

  it('matches the green event only for pocket 0', () => {
    const result = simulateRouletteExperiment({
      spins: 3,
      event: 'green',
      rng: rngFrom([POCKET(0), POCKET(1), POCKET(1)]),
    });
    expect(result.eventHits).toBe(1);
  });

  it('matches a nonzero straight-up target', () => {
    const result = simulateRouletteExperiment({
      spins: 4,
      event: 'straight-up',
      jackpotPocket: 13,
      rng: rngFrom([POCKET(13), POCKET(0), POCKET(13), POCKET(36)]),
    });
    expect(result.eventHits).toBe(2);
    expect(result.firstHit).toBe(1);
  });

  it('treats straight-up target 0 and green as the same event', () => {
    const seq = [POCKET(0), POCKET(1), POCKET(0), POCKET(2)];
    const green = simulateRouletteExperiment({ spins: 4, event: 'green', rng: rngFrom(seq) });
    const straight = simulateRouletteExperiment({
      spins: 4,
      event: 'straight-up',
      jackpotPocket: 0,
      rng: rngFrom(seq),
    });
    expect(straight.eventHits).toBe(green.eventHits);
    expect(straight.firstHit).toBe(green.firstHit);
    expect(straight.colourCounts).toEqual(green.colourCounts);
    expect(straight.samplePockets).toEqual(green.samplePockets);
  });
});

describe('simulateRouletteExperiment — waiting time and sampling', () => {
  it('reports firstHit = 1 when the event is on the first spin', () => {
    const result = simulateRouletteExperiment({
      spins: 5,
      event: 'straight-up',
      jackpotPocket: 5,
      rng: rngFrom([POCKET(5), POCKET(0), POCKET(1), POCKET(2), POCKET(3)]),
    });
    expect(result.firstHit).toBe(1);
    expect(result.eventHits).toBe(1);
  });

  it('reports firstHit = spins when the only success is the final spin', () => {
    const result = simulateRouletteExperiment({
      spins: 4,
      event: 'straight-up',
      jackpotPocket: 9,
      rng: rngFrom([POCKET(0), POCKET(1), POCKET(2), POCKET(9)]),
    });
    expect(result.firstHit).toBe(4);
    expect(result.eventHits).toBe(1);
  });

  it('reports firstHit = null and eventHits = 0 when there is no success', () => {
    const result = simulateRouletteExperiment({
      spins: 3,
      event: 'straight-up',
      jackpotPocket: 30,
      rng: rngFrom([POCKET(0), POCKET(1), POCKET(2)]),
    });
    expect(result.firstHit).toBeNull();
    expect(result.eventHits).toBe(0);
  });

  it('keeps firstHit at the first success even with multiple successes', () => {
    const result = simulateRouletteExperiment({
      spins: 5,
      event: 'straight-up',
      jackpotPocket: 7,
      rng: rngFrom([POCKET(0), POCKET(7), POCKET(7), POCKET(7), POCKET(1)]),
    });
    expect(result.firstHit).toBe(2);
    expect(result.eventHits).toBe(3);
  });

  it('continues all spins after the first success (colour totals cover spins)', () => {
    const spins = 6;
    const result = simulateRouletteExperiment({
      spins,
      event: 'straight-up',
      jackpotPocket: 41 % 37, // pocket 4
      rng: rngFrom([
        POCKET(4), POCKET(4), POCKET(4), POCKET(4), POCKET(4), POCKET(4),
      ]),
    });
    expect(result.firstHit).toBe(1);
    expect(result.eventHits).toBe(spins);
    const total =
      result.colourCounts.red + result.colourCounts.black + result.colourCounts.green;
    expect(total).toBe(spins);
  });

  it('records exactly one RNG draw per spin', () => {
    // rngFrom throws if asked for a 6th value for a 5-spin experiment.
    const result = simulateRouletteExperiment({
      spins: 5,
      event: 'red',
      rng: rngFrom([0, 0, 0, 0, 0]),
    });
    expect(result.samplePockets).toHaveLength(5);
  });

  it('samplePockets keeps only the first min(spins, 20) outcomes', () => {
    const shortRun = simulateRouletteExperiment({
      spins: 5,
      event: 'red',
      rng: rngFrom([0, 0, 0, 0, 0]),
    });
    expect(shortRun.samplePockets).toHaveLength(5);

    const longRun = simulateRouletteExperiment({
      spins: 25,
      event: 'red',
      rng: rngFrom(new Array(25).fill(0)),
    });
    expect(longRun.samplePockets).toHaveLength(20);
  });
});

describe('simulateRouletteExperiment — validation', () => {
  it('requires an rng function', () => {
    expect(() => simulateRouletteExperiment({ spins: 1, event: 'red' })).toThrow(TypeError);
    expect(() => simulateRouletteExperiment({ spins: 1, event: 'red', rng: 5 })).toThrow(TypeError);
  });

  it('rejects invalid spins', () => {
    for (const spins of [0, -1, 1.5, NaN, Infinity, 5001, '10', null, undefined]) {
      expect(() =>
        simulateRouletteExperiment({ spins, event: 'red', rng: rngFrom([0]) }),
      ).toThrow();
    }
  });

  it('rejects unsupported events and invalid jackpot pockets', () => {
    for (const event of ['blue', '', 'RED', 1, null, undefined]) {
      expect(() =>
        simulateRouletteExperiment({ spins: 1, event, rng: rngFrom([0]) }),
      ).toThrow();
    }
    for (const jackpotPocket of [-1, 37, 1.5, NaN, Infinity, '0', null]) {
      expect(() =>
        simulateRouletteExperiment({
          spins: 1,
          event: 'straight-up',
          jackpotPocket,
          rng: rngFrom([0]),
        }),
      ).toThrow();
    }
  });
});

describe('runRouletteSimulation — aggregates', () => {
  const LABEL = { spins: 20, experiments: 40, event: 'red', seed: 7 };

  it('countHistogram sums to experiments and its weighted sum is totalEventHits', () => {
    const result = runRouletteSimulation(LABEL);

    expect(result.countHistogram).toHaveLength(LABEL.spins + 1);
    const sum = result.countHistogram.reduce((acc, value) => acc + value, 0);
    expect(sum).toBe(LABEL.experiments);

    const weighted = result.countHistogram.reduce((acc, value, k) => acc + k * value, 0);
    expect(weighted).toBe(result.totalEventHits);
  });

  it('firstHitHistogram plus censoredCount equals experiments (index 0 unused)', () => {
    const result = runRouletteSimulation(LABEL);

    expect(result.firstHitHistogram).toHaveLength(LABEL.spins + 1);
    expect(result.firstHitHistogram[0]).toBe(0);

    const firstHits = result.firstHitHistogram.reduce((acc, value) => acc + value, 0);
    expect(firstHits + result.censoredCount).toBe(LABEL.experiments);
  });

  it('total colour counts cover every simulated spin', () => {
    const result = runRouletteSimulation(LABEL);

    const total =
      result.colourCounts.red + result.colourCounts.black + result.colourCounts.green;
    expect(total).toBe(result.totalSpins);
    expect(result.totalSpins).toBe(LABEL.spins * LABEL.experiments);
  });

  it('meanEventCount and empiricalEventRate match their definitions', () => {
    const result = runRouletteSimulation(LABEL);

    expect(result.meanEventCount).toBe(result.totalEventHits / LABEL.experiments);
    expect(result.empiricalEventRate).toBe(result.totalEventHits / result.totalSpins);
  });

  it('restrictedWaitingMean matches the min(T, n) definition on a small seeded run', () => {
    const spins = 4;
    const experiments = 3;
    const result = runRouletteSimulation({
      spins,
      experiments,
      event: 'straight-up',
      jackpotPocket: 2,
      seed: 123,
    });

    // Recompute min(T, n) independently from the histograms.
    let restrictedSum = 0;
    for (let k = 1; k <= spins; k += 1) restrictedSum += k * result.firstHitHistogram[k];
    restrictedSum += spins * result.censoredCount;
    expect(result.restrictedWaitingMean).toBeCloseTo(restrictedSum / experiments, 12);
  });

  it('samplePockets comes only from the first experiment', () => {
    const result = runRouletteSimulation({ spins: 30, experiments: 5, event: 'red', seed: 99 });
    const firstOnly = simulateRouletteExperiment({
      spins: 30,
      event: 'red',
      rng: createSeededRng(99),
    });
    expect(result.samplePockets).toEqual(firstOnly.samplePockets);
    expect(result.samplePockets).toHaveLength(20);
  });

  it('accepts N = 1 and seed 0', () => {
    const result = runRouletteSimulation({ spins: 5, experiments: 1, event: 'red', seed: 0 });
    expect(result.experiments).toBe(1);
    const weighted = result.countHistogram.reduce((acc, value, k) => acc + k * value, 0);
    expect(weighted).toBe(result.totalEventHits);
  });

  it('reproduces the full result for identical parameters and seed', () => {
    expect(runRouletteSimulation(LABEL)).toEqual(runRouletteSimulation(LABEL));
  });
});



describe('runRouletteSimulation — sequence and event independence', () => {
  it('does not restart the RNG for every experiment (sequence is continuous)', () => {
    const spins = 30;
    const result = runRouletteSimulation({ spins, experiments: 50, event: 'red', seed: 2024 });
    const firstCount = simulateRouletteExperiment({
      spins,
      event: 'red',
      rng: createSeededRng(2024),
    }).eventHits;
    // If the seed were reset per experiment, every experiment would equal the
    // first; a realistic run shows other counts too.
    const nonFirstPresent = result.countHistogram.some(
      (value, k) => k !== firstCount && value > 0,
    );
    expect(nonFirstPresent).toBe(true);
  });

  it('green and straight-up target 0 give identical numeric results', () => {
    const green = runRouletteSimulation({ spins: 20, experiments: 30, event: 'green', seed: 5 });
    const straight = runRouletteSimulation({
      spins: 20,
      experiments: 30,
      event: 'straight-up',
      jackpotPocket: 0,
      seed: 5,
    });
    expect(straight.totalEventHits).toBe(green.totalEventHits);
    expect(straight.firstHitHistogram).toEqual(green.firstHitHistogram);
    expect(straight.censoredCount).toBe(green.censoredCount);
    expect(straight.colourCounts).toEqual(green.colourCounts);
  });

  it('changing the straight-up target changes matching, not the pocket sequence', () => {
    const target13 = runRouletteSimulation({
      spins: 20, experiments: 10, event: 'straight-up', jackpotPocket: 13, seed: 3,
    });
    const target36 = runRouletteSimulation({
      spins: 20, experiments: 10, event: 'straight-up', jackpotPocket: 36, seed: 3,
    });
    // Same underlying spins => same colour totals and same sample.
    expect(target36.colourCounts).toEqual(target13.colourCounts);
    expect(target36.samplePockets).toEqual(target13.samplePockets);
  });

  it('uses Math.random when the seed is absent (mocked, deterministic)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(POCKET(0));
    const result = runRouletteSimulation({ spins: 3, experiments: 2, event: 'green' });

    expect(result.totalEventHits).toBe(6); // pocket 0 on every spin
    expect(result.colourCounts.green).toBe(6);
    expect(spy).toHaveBeenCalled();
  });

  it('handles a bounded high-spin case (spins = 5000, experiments = 1)', () => {
    const result = runRouletteSimulation({ spins: 5000, experiments: 1, event: 'red', seed: 1 });
    expect(result.totalSpins).toBe(5000);
    const total =
      result.colourCounts.red + result.colourCounts.black + result.colourCounts.green;
    expect(total).toBe(5000);
  });
});

describe('runRouletteSimulation — validation', () => {
  it('rejects invalid spins and experiments', () => {
    for (const spins of [0, -1, 1.5, NaN, Infinity, 5001, '10', null, undefined]) {
      expect(() => runRouletteSimulation({ spins, experiments: 5, event: 'red' })).toThrow();
    }
    for (const experiments of [0, -1, 1.5, NaN, Infinity, 5001, '10', null, undefined]) {
      expect(() => runRouletteSimulation({ spins: 5, experiments, event: 'red' })).toThrow();
    }
  });

  it('rejects unsupported events and invalid pockets', () => {
    for (const event of ['purple', '', 1, null, undefined]) {
      expect(() => runRouletteSimulation({ spins: 5, experiments: 5, event })).toThrow();
    }
    for (const jackpotPocket of [-1, 37, 2.5, NaN, '0', null]) {
      expect(() =>
        runRouletteSimulation({
          spins: 5, experiments: 5, event: 'straight-up', jackpotPocket,
        }),
      ).toThrow();
    }
  });

  it('rejects invalid provided seeds', () => {
    for (const seed of [-5, 2.5, NaN, Infinity, '9', '']) {
      expect(() => runRouletteSimulation({ spins: 5, experiments: 5, event: 'red', seed })).toThrow();
    }
  });
});

describe('runRouletteSimulation — seeded statistical sanity', () => {
  const SPINS = 100;
  const EXPERIMENTS = 1000;
  const TOTAL = SPINS * EXPERIMENTS;

  it('red empirical rate is near 18/37 within several standard errors', () => {
    const result = runRouletteSimulation({
      spins: SPINS, experiments: EXPERIMENTS, event: 'red', seed: 1234,
    });
    const se = Math.sqrt((P_RED * (1 - P_RED)) / TOTAL);
    // Documented allowance: 5 standard errors plus a small numerical slack.
    expect(Math.abs(result.empiricalEventRate - P_RED)).toBeLessThan(5 * se + 1e-6);
  });

  it('green empirical rate is near 1/37 within several standard errors', () => {
    const result = runRouletteSimulation({
      spins: SPINS, experiments: EXPERIMENTS, event: 'green', seed: 4321,
    });
    const se = Math.sqrt((P_GREEN * (1 - P_GREEN)) / TOTAL);
    expect(Math.abs(result.empiricalEventRate - P_GREEN)).toBeLessThan(5 * se + 1e-6);
  });

  it('mean event count is near n*p within the standard error of the mean', () => {
    const result = runRouletteSimulation({
      spins: SPINS, experiments: EXPERIMENTS, event: 'red', seed: 777,
    });
    const expected = SPINS * P_RED;
    const se = Math.sqrt((SPINS * P_RED * (1 - P_RED)) / EXPERIMENTS);
    expect(Math.abs(result.meanEventCount - expected)).toBeLessThan(5 * se + 1e-6);
  });

  it('censored fraction is near (1-p)^n with a defensible N-based tolerance', () => {
    const result = runRouletteSimulation({
      spins: SPINS, experiments: EXPERIMENTS, event: 'green', seed: 2468,
    });
    const expectedCensored = (1 - P_GREEN) ** SPINS;
    const se = Math.sqrt((expectedCensored * (1 - expectedCensored)) / EXPERIMENTS);
    const observed = result.censoredCount / EXPERIMENTS;
    expect(Math.abs(observed - expectedCensored)).toBeLessThan(5 * se + 1e-6);
  });
});


describe('runRouletteSimulationAsync — equivalence with the synchronous runner', () => {
  it('produces a deeply equal result for the same seed and inputs (seed 0)', async () => {
    const sync = runRouletteSimulation({ spins: 30, experiments: 120, event: 'red', seed: 0 });
    const asyncResult = await runRouletteSimulationAsync({
      spins: 30,
      experiments: 120,
      event: 'red',
      seed: 0,
    });
    expect(asyncResult).toEqual(sync);
  });

  it.each([
    ['green', 0],
    ['straight-up', 7],
    ['red', 0],
  ])('matches sync for event %s with jackpot %i', async (event, jackpotPocket) => {
    const params = { spins: 40, experiments: 80, event, jackpotPocket, seed: 2024 };
    expect(await runRouletteSimulationAsync(params)).toEqual(runRouletteSimulation(params));
  });

  it('matches sync across a workload spanning multiple chunks', async () => {
    // spins = 1 => experimentsPerChunk = 50000; force multiple chunks with a
    // small time budget by using many experiments.
    const params = { spins: 1, experiments: 3000, event: 'red', seed: 55 };
    expect(await runRouletteSimulationAsync(params)).toEqual(runRouletteSimulation(params));
  });
});

describe('runRouletteSimulationAsync — progress', () => {
  it('emits initial, intermediate and final progress in bounds and monotone', async () => {
    const experiments = 500;
    const updates = [];
    await runRouletteSimulationAsync({
      spins: 20,
      experiments,
      event: 'red',
      seed: 9,
      onProgress: (progress) => updates.push(progress),
    });

    expect(updates[0]).toEqual({ completedExperiments: 0, totalExperiments: experiments });
    expect(updates[updates.length - 1]).toEqual({
      completedExperiments: experiments,
      totalExperiments: experiments,
    });

    let previous = -1;
    for (const update of updates) {
      expect(update.totalExperiments).toBe(experiments);
      expect(update.completedExperiments).toBeGreaterThanOrEqual(0);
      expect(update.completedExperiments).toBeLessThanOrEqual(experiments);
      // Monotone non-decreasing: the final update may repeat the last value.
      expect(update.completedExperiments).toBeGreaterThanOrEqual(previous);
      previous = update.completedExperiments;
    }
  });

  it('bounds the number of progress callbacks (roughly 50 per run)', async () => {
    const updates = [];
    await runRouletteSimulationAsync({
      spins: 20,
      experiments: 5000,
      event: 'red',
      seed: 3,
      onProgress: (progress) => updates.push(progress),
    });
    // Target ~50 intermediate updates plus initial and final.
    expect(updates.length).toBeLessThanOrEqual(53);
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });

  it('reports final progress equal to the requested experiment count', async () => {
    let last = null;
    await runRouletteSimulationAsync({
      spins: 10,
      experiments: 777,
      event: 'green',
      seed: 1,
      onProgress: (progress) => {
        last = progress;
      },
    });
    expect(last.completedExperiments).toBe(777);
  });
});

describe('runRouletteSimulationAsync — cancellation', () => {
  it('rejects an already-aborted signal without doing simulation work', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runRouletteSimulationAsync({
        spins: 50,
        experiments: 5000,
        event: 'red',
        seed: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts during progress and does not publish a partial result', async () => {
    const controller = new AbortController();
    let sawProgress = false;

    await expect(
      runRouletteSimulationAsync({
        spins: 5,
        experiments: 5000,
        event: 'red',
        seed: 2,
        signal: controller.signal,
        onProgress: () => {
          if (!sawProgress) {
            sawProgress = true;
            controller.abort();
          }
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawProgress).toBe(true);
  });

  it('rejects invalid inputs', async () => {
    await expect(
      runRouletteSimulationAsync({ spins: 0, experiments: 10, event: 'red' }),
    ).rejects.toThrow();
    await expect(
      runRouletteSimulationAsync({ spins: 10, experiments: 10, event: 'blue' }),
    ).rejects.toThrow();
    await expect(
      runRouletteSimulationAsync({ spins: 10, experiments: 10, event: 'red', onProgress: 5 }),
    ).rejects.toThrow(TypeError);
    await expect(
      runRouletteSimulationAsync({ spins: 10, experiments: 10, event: 'red', signal: 5 }),
    ).rejects.toThrow(TypeError);
  });
});


describe('roulette — Black event', () => {
  it('counts black pockets as hits and red / zero as misses', () => {
    // 2 black, 1 (red), 0 (green), 4 (black), 3 (red): 2 black hits.
    const result = simulateRouletteExperiment({
      spins: 5,
      event: 'black',
      rng: rngFrom([POCKET(2), POCKET(1), POCKET(0), POCKET(4), POCKET(3)]),
    });
    expect(result.eventHits).toBe(2);
    expect(result.colourCounts).toEqual({ red: 2, black: 2, green: 1 });
  });

  it('tracks firstHit and censoring for Black', () => {
    // First black at spin 2; then a run with no black (only red/green).
    const withHit = simulateRouletteExperiment({
      spins: 4,
      event: 'black',
      rng: rngFrom([POCKET(1), POCKET(2), POCKET(2), POCKET(1)]),
    });
    expect(withHit.firstHit).toBe(2);
    expect(withHit.eventHits).toBe(2);

    const censored = simulateRouletteExperiment({
      spins: 3,
      event: 'black',
      rng: rngFrom([POCKET(1), POCKET(0), POCKET(3)]),
    });
    expect(censored.firstHit).toBeNull();
    expect(censored.eventHits).toBe(0);
  });

  it('red and black share the same spins but match different colours', () => {
    const params = { spins: 40, experiments: 60, seed: 12345 };
    const red = runRouletteSimulation({ ...params, event: 'red' });
    const black = runRouletteSimulation({ ...params, event: 'black' });

    // Same underlying random draws.
    expect(black.samplePockets).toEqual(red.samplePockets);
    expect(black.colourCounts).toEqual(red.colourCounts);

    // Event totals equal the matching colour totals.
    expect(red.totalEventHits).toBe(red.colourCounts.red);
    expect(black.totalEventHits).toBe(black.colourCounts.black);

    // Red + black hits need not equal total spins: zeros remain.
    expect(red.colourCounts.red + black.colourCounts.black).toBeLessThanOrEqual(red.totalSpins);
  });

  it('green totalEventHits equals the green colour count', () => {
    const result = runRouletteSimulation({ spins: 50, experiments: 40, event: 'green', seed: 7 });
    expect(result.totalEventHits).toBe(result.colourCounts.green);
  });

  it('each histogram weighted sum equals its total hits (red and black)', () => {
    for (const event of ['red', 'black']) {
      const result = runRouletteSimulation({ spins: 30, experiments: 50, event, seed: 42 });
      const weighted = result.countHistogram.reduce((acc, value, k) => acc + k * value, 0);
      expect(weighted).toBe(result.totalEventHits);
      const firstHits = result.firstHitHistogram.reduce((acc, value) => acc + value, 0);
      expect(firstHits + result.censoredCount).toBe(result.experiments);
    }
  });

  it('async and sync agree for the Black event', async () => {
    const params = { spins: 25, experiments: 100, event: 'black', seed: 2024 };
    expect(await runRouletteSimulationAsync(params)).toEqual(runRouletteSimulation(params));
  });
});

