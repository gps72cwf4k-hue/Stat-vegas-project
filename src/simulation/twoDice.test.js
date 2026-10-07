import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  simulateTwoDiceTrial,
  getJointTableGeometry,
  getTheoreticalJointProbabilities,
  getJointSupportMask,
  getTheoryForPair,
  gofChiSquare,
  independenceChiSquare,
  runTwoDiceSimulation,
  runTwoDiceSimulationAsync,
} from './twoDice.js';
import { createSeededRng } from './rng.js';

const MAX_N = 20000;

/**
 * Deterministic RNG stub returning the given values in order; throws if asked
 * for more values than supplied (so an extra draw per roll is caught).
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

/** Value that maps to face k (1..6) under the 1 + floor(rng*6) binning. */
const FACE = (k) => (k - 1) / 6;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simulateTwoDiceTrial — unbiased faces', () => {
  it('maps bin starts to the six faces and consumes exactly two draws', () => {
    for (let face = 1; face <= 6; face += 1) {
      const trial = simulateTwoDiceTrial({ rng: rngFrom([FACE(face), FACE(face)]) });
      expect(trial.x).toBe(face);
      expect(trial.y).toBe(face);
      expect(trial.s).toBe(2 * face);
      expect(trial.m).toBe(face);
    }
    // The stub throws if a third draw is requested.
    expect(() => simulateTwoDiceTrial({ rng: rngFrom([FACE(1)]) })).toThrow();
  });

  it('derives s = x + y and m = max(x, y) for mixed faces', () => {
    // x = 2, y = 5 => s = 7, m = 5.
    const trial = simulateTwoDiceTrial({ rng: rngFrom([FACE(2), FACE(5)]) });
    expect(trial).toEqual({ x: 2, y: 5, s: 7, m: 5 });
  });

  it('keeps the last face at the very top of the unit interval', () => {
    const trial = simulateTwoDiceTrial({ rng: rngFrom([1 - Number.EPSILON, 1 - Number.EPSILON]) });
    expect(trial.x).toBe(6);
    expect(trial.y).toBe(6);
  });

  it('rejects a non-function rng', () => {
    expect(() => simulateTwoDiceTrial({ rng: 5 })).toThrow(TypeError);
    expect(() => simulateTwoDiceTrial({})).toThrow(TypeError);
  });
});

describe('table geometry, theory probabilities and support masks', () => {
  it('(X, Y): 6x6 with labels 1..6 and every cell 1/36', () => {
    const geometry = getJointTableGeometry('xy');
    expect(geometry.rows).toBe(6);
    expect(geometry.cols).toBe(6);
    expect(geometry.rowLabels).toEqual([1, 2, 3, 4, 5, 6]);
    expect(geometry.colLabels).toEqual([1, 2, 3, 4, 5, 6]);
    const probs = getTheoreticalJointProbabilities('xy');
    for (const row of probs) {
      for (const p of row) {
        expect(p).toBeCloseTo(1 / 36, 15);
      }
    }
    expect(getJointSupportMask('xy').flat().filter(Boolean)).toHaveLength(36);
  });

  it('(S, M): 11x6 with S = 2..12 and M = 1..6, piecewise probabilities', () => {
    const geometry = getJointTableGeometry('sm');
    expect(geometry.rows).toBe(11);
    expect(geometry.cols).toBe(6);
    expect(geometry.rowLabels).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(geometry.colLabels).toEqual([1, 2, 3, 4, 5, 6]);

    const probs = getTheoreticalJointProbabilities('sm');
    for (let i = 0; i < 11; i += 1) {
      const s = i + 2;
      for (let j = 0; j < 6; j += 1) {
        const m = j + 1;
        if (s < m + 1 || s > 2 * m) {
          expect(probs[i][j]).toBe(0);
        } else if (s === 2 * m) {
          expect(probs[i][j]).toBeCloseTo(1 / 36, 15);
        } else {
          expect(probs[i][j]).toBeCloseTo(2 / 36, 15);
        }
      }
    }
    // Exactly 21 support cells, and they sum to 1 in probability.
    const support = getJointSupportMask('sm');
    expect(support.flat().filter(Boolean)).toHaveLength(21);
    const total = probs.flat().reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('rejects an invalid pair type', () => {
    expect(() => getJointTableGeometry('ss')).toThrow(TypeError);
    expect(() => getTheoreticalJointProbabilities('zy')).toThrow(TypeError);
    expect(() => getJointSupportMask(undefined)).toThrow(TypeError);
  });

  it('exposes exact theory values from the math module', () => {
    const xy = getTheoryForPair('xy');
    expect(xy.covTheory).toBe(0);
    expect(xy.corrTheory).toBe(0);
    expect(xy.meanA).toBe(3.5);
    expect(xy.meanB).toBe(3.5);

    const sm = getTheoryForPair('sm');
    expect(sm.covTheory).toBeCloseTo(35 / 12, 12);
    expect(sm.corrTheory).toBeCloseTo(Math.sqrt(54 / 73), 12);
    expect(sm.meanA).toBe(7);
    expect(sm.meanB).toBeCloseTo(161 / 36, 12);
  });

describe('gofChiSquare — exact small example and bounds', () => {
  it('computes the exact statistic, dof and p-value on a hand-built table', () => {
    // A 1x3 table with expected masses [0.25, 0.25, 0.5] and N=40:
    // expected counts [10, 10, 20], observed [12, 8, 20].
    // chi2 = 4/10 + 4/10 + 0 = 0.8, dof = 2.
    const result = gofChiSquare({
      observedTable: [[12, 8, 20]],
      expectedPmf: [[0.25, 0.25, 0.5]],
      supportMask: [[true, true, true]],
    });
    expect(result.chi2).toBeCloseTo(0.8, 12);
    expect(result.dof).toBe(2);
    expect(result.supportCells).toBe(3);
    expect(result.totalCount).toBe(40);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(1);
  });

  it('computes dof = supportCells - 1 and skips masked-out cells', () => {
    // Two supported cells only -> dof = 1.
    const result = gofChiSquare({
      observedTable: [[10, 0, 30]],
      expectedPmf: [[0.25, 0.5, 0.25]],
      supportMask: [[true, false, true]],
    });
    expect(result.supportCells).toBe(2);
    expect(result.dof).toBe(1);
  });

  it('returns chi2 = 0 and p-value = 1 when observed equals expected', () => {
    const result = gofChiSquare({
      observedTable: [[25, 25]],
      expectedPmf: [[0.5, 0.5]],
      supportMask: [[true, true]],
    });
    expect(result.chi2).toBeCloseTo(0, 12);
    expect(result.pValue).toBeCloseTo(1, 12);
  });

  it('rejects malformed inputs', () => {
    expect(() => gofChiSquare({ observedTable: [[1]], expectedPmf: [[0.5, 0.5]] })).toThrow(
      TypeError,
    );
    expect(() => gofChiSquare({ observedTable: 'x', expectedPmf: [[1]] })).toThrow(TypeError);
    // A supported cell with zero expected mass is invalid.
    expect(() =>
      gofChiSquare({
        observedTable: [[0, 0]],
        expectedPmf: [[0, 1]],
        supportMask: [[true, true]],
      }),
    ).toThrow(RangeError);
  });
});

describe('independenceChiSquare — contingency table test', () => {
  it('gives dof = (rows-1)(cols-1) = 25 for a 6x6 table', () => {
    const table = Array.from({ length: 6 }, () => new Array(6).fill(10));
    const result = independenceChiSquare(table);
    expect(result.dof).toBe(25);
    expect(result.totalCount).toBe(360);
  });

  it('gives chi2 = 0 for a perfectly independent table', () => {
    // Rows proportional to columns => all expected equals observed.
    const table = [
      [10, 20],
      [20, 40],
    ];
    const result = independenceChiSquare(table);
    expect(result.chi2).toBeCloseTo(0, 12);
    expect(result.dof).toBe(1);
  });

  it('gives a positive statistic for a dependent table', () => {
    // Strong diagonal association.
    const table = [
      [50, 0],
      [0, 50],
    ];
    const result = independenceChiSquare(table);
    expect(result.chi2).toBeGreaterThan(0);
    expect(result.dof).toBe(1);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it('rejects degenerate or malformed tables', () => {
    expect(() => independenceChiSquare([[1, 2, 3]])).toThrow(RangeError); // single row
    expect(() => independenceChiSquare([[0], [0]])).toThrow(RangeError); // zero total
    expect(() => independenceChiSquare([])).toThrow(TypeError);
    expect(() => independenceChiSquare([[1, 'x'], [1, 1]])).toThrow(TypeError);
  });
});


describe('runTwoDiceSimulation — joint structure and marginals', () => {
  it('(X, Y): joint counts sum to n and all 36 cells stay in the support', () => {
    const n = 3000;
    const result = runTwoDiceSimulation({ n, pairType: 'xy', seed: 123 });
    expect(result.n).toBe(n);
    expect(result.jointCounts).toHaveLength(6);
    expect(result.jointCounts[0]).toHaveLength(6);
    const total = result.jointCounts.flat().reduce((sum, count) => sum + count, 0);
    expect(total).toBe(n);
    expect(result.supportMask.flat().filter(Boolean)).toHaveLength(36);
  });

  it('(S, M): impossible cells are always exactly 0 and support cells total n', () => {
    const n = 4000;
    const result = runTwoDiceSimulation({ n, pairType: 'sm', seed: 321 });
    const { jointCounts, supportMask } = result;
    let supportTotal = 0;
    let supportCells = 0;
    for (let i = 0; i < jointCounts.length; i += 1) {
      for (let j = 0; j < jointCounts[i].length; j += 1) {
        if (supportMask[i][j]) {
          supportCells += 1;
          supportTotal += jointCounts[i][j];
        } else {
          expect(jointCounts[i][j]).toBe(0); // impossible cell never observed
        }
      }
    }
    expect(supportCells).toBe(21);
    expect(supportTotal).toBe(n);
  });

  it('marginals from the joint table equal the directly counted marginals', () => {
    for (const pairType of ['xy', 'sm']) {
      const result = runTwoDiceSimulation({ n: 2500, pairType, seed: 55 });
      expect(result.marginalsMatch).toBe(true);
      for (let i = 0; i < result.marginalAFromJoint.length; i += 1) {
        expect(result.marginalAFromJoint[i]).toBeCloseTo(result.marginalADirect[i], 15);
      }
      for (let j = 0; j < result.marginalBFromJoint.length; j += 1) {
        expect(result.marginalBFromJoint[j]).toBeCloseTo(result.marginalBDirect[j], 15);
      }
      const mass = result.jointFrequencies.flat().reduce((sum, p) => sum + p, 0);
      expect(mass).toBeCloseTo(1, 12);
    }
  });

  it('(X, Y) marginal is about 1/6 per face; (S, M) marginals follow the theory', () => {
    const xy = runTwoDiceSimulation({ n: 6000, pairType: 'xy', seed: 2024 });
    for (const p of xy.marginalAFromJoint) {
      expect(p).toBeCloseTo(1 / 6, 1);
    }
    const sm = runTwoDiceSimulation({ n: 6000, pairType: 'sm', seed: 2024 });
    const sMarginal = sm.marginalAFromJoint;
    expect(sMarginal[0]).toBeCloseTo(1 / 36, 2); // P(S = 2)
    expect(sMarginal[5]).toBeCloseTo(6 / 36, 2); // P(S = 7)
    expect(sm.marginalBFromJoint[0]).toBeCloseTo(1 / 36, 1); // P(M = 1)
  });
});

describe('runTwoDiceSimulation — covariance, SE, z-score and correlation', () => {
  it('(X, Y): theory covariance is 0 and the estimator is finite with positive SE', () => {
    const result = runTwoDiceSimulation({ n: 5000, pairType: 'xy', seed: 777 });
    expect(result.covTheory).toBe(0);
    expect(Number.isFinite(result.covHat)).toBe(true);
    expect(result.seCov).toBeGreaterThan(0);
    expect(Number.isFinite(result.zScore)).toBe(true);
    // At N = 5000 the empirical covariance is small (order 0.05).
    expect(Math.abs(result.covHat)).toBeLessThan(0.15);
  });

  it('(S, M): theory covariance 35/12 and correlation ~0.86', () => {
    const result = runTwoDiceSimulation({ n: 5000, pairType: 'sm', seed: 777 });
    expect(result.covTheory).toBeCloseTo(35 / 12, 12);
    expect(result.corrTheory).toBeCloseTo(Math.sqrt(54 / 73), 12);
    expect(result.covHat).toBeCloseTo(35 / 12, 1);
    expect(result.corrHat).toBeCloseTo(Math.sqrt(54 / 73), 1);
  });

  it('the covariance estimator matches a brute-force recomputation of the same run', () => {
    // Re-simulate the SAME seeded stream and recompute covariance directly.
    const n = 800;
    const seed = 4242;
    const rng = createSeededRng(seed);
    const a = [];
    const b = [];
    for (let i = 0; i < n; i += 1) {
      const trial = simulateTwoDiceTrial({ rng });
      a.push(trial.s);
      b.push(trial.m);
    }
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let cross = 0;
    for (let i = 0; i < n; i += 1) cross += (a[i] - meanA) * (b[i] - meanB);
    const bruteCov = cross / (n - 1);

    const result = runTwoDiceSimulation({ n, pairType: 'sm', seed });
    expect(result.meanA).toBeCloseTo(meanA, 12);
    expect(result.meanB).toBeCloseTo(meanB, 12);
    expect(result.covHat).toBeCloseTo(bruteCov, 10);
  });

  it('SE and z-score are consistent with the covariance definition', () => {
    const result = runTwoDiceSimulation({ n: 4000, pairType: 'sm', seed: 101 });
    // z = (covHat - covTheory) / SE.
    expect(result.zScore).toBeCloseTo(
      (result.covHat - result.covTheory) / result.seCov,
      10,
    );
  });
});


describe('runTwoDiceSimulation — chi-square tests', () => {
  it('(X, Y): GOF dof = 35 and independence dof = 25', () => {
    const result = runTwoDiceSimulation({ n: 5000, pairType: 'xy', seed: 8 });
    expect(result.chiSquareGof.dof).toBe(35);
    expect(result.chiSquareGof.supportCells).toBe(36);
    expect(result.chiSquareGof.chi2).toBeGreaterThanOrEqual(0);
    expect(result.chiSquareGof.pValue).toBeGreaterThanOrEqual(0);
    expect(result.chiSquareGof.pValue).toBeLessThanOrEqual(1);
    expect(result.chiSquareIndependence.dof).toBe(25);
    expect(result.chiSquareIndependence.chi2).toBeGreaterThanOrEqual(0);
  });

  it('(S, M): GOF dof = 20 and independence test is not run', () => {
    const result = runTwoDiceSimulation({ n: 5000, pairType: 'sm', seed: 8 });
    expect(result.chiSquareGof.dof).toBe(20);
    expect(result.chiSquareGof.supportCells).toBe(21);
    expect(result.chiSquareIndependence).toBeNull();
  });

  it('the GOF statistic equals a direct recomputation from the counts', () => {
    const result = runTwoDiceSimulation({ n: 3000, pairType: 'sm', seed: 999 });
    const { jointCounts, expectedJointProbabilities, supportMask } = result;
    const N = result.n;
    let chi2 = 0;
    for (let i = 0; i < jointCounts.length; i += 1) {
      for (let j = 0; j < jointCounts[i].length; j += 1) {
        if (!supportMask[i][j]) continue;
        const expected = N * expectedJointProbabilities[i][j];
        const diff = jointCounts[i][j] - expected;
        chi2 += (diff * diff) / expected;
      }
    }
    expect(result.chiSquareGof.chi2).toBeCloseTo(chi2, 8);
  });
});

describe('runTwoDiceSimulation — continuous density demo points', () => {
  it('draws exactly min(n, 2000) points, all inside the unit square', () => {
    const small = runTwoDiceSimulation({ n: 500, pairType: 'xy', seed: 3 });
    expect(small.demoCount).toBe(500);
    const big = runTwoDiceSimulation({ n: 5000, pairType: 'xy', seed: 3 });
    expect(big.demoCount).toBe(2000);

    for (const result of [small, big]) {
      expect(result.demoU).toHaveLength(result.demoCount);
      expect(result.demoV).toHaveLength(result.demoCount);
      for (let i = 0; i < result.demoCount; i += 1) {
        expect(result.demoU[i]).toBeGreaterThanOrEqual(0);
        expect(result.demoU[i]).toBeLessThan(1);
        expect(result.demoV[i]).toBeGreaterThanOrEqual(0);
        expect(result.demoV[i]).toBeLessThan(1);
      }
    }
  });

  it('stores the requested rectangle extents', () => {
    const result = runTwoDiceSimulation({ n: 300, pairType: 'xy', seed: 3, a: 0.3, b: 0.8 });
    expect(result.rectangle).toEqual({ a: 0.3, b: 0.8 });
  });
});

describe('runTwoDiceSimulation — reproducibility and seed snapshot', () => {
  it('is identical for the same seed and different for a different seed', () => {
    const first = runTwoDiceSimulation({ n: 2000, pairType: 'sm', seed: 11 });
    const again = runTwoDiceSimulation({ n: 2000, pairType: 'sm', seed: 11 });
    expect(again).toEqual(first);

    const other = runTwoDiceSimulation({ n: 2000, pairType: 'sm', seed: 12 });
    expect(other.jointCounts).not.toEqual(first.jointCounts);
  });

  it('seed 0 is valid and recorded; an absent seed records null', () => {
    const seeded = runTwoDiceSimulation({ n: 200, pairType: 'xy', seed: 0 });
    expect(seeded.seedUsed).toBe(0);
    const unseeded = runTwoDiceSimulation({ n: 200, pairType: 'xy' });
    expect(unseeded.seedUsed).toBeNull();
  });
});

describe('runTwoDiceSimulation — validation', () => {
  it('rejects invalid n, pairType, a, b and seed', () => {
    expect(() => runTwoDiceSimulation({ n: 0, pairType: 'xy' })).toThrow(RangeError);
    expect(() => runTwoDiceSimulation({ n: MAX_N + 1, pairType: 'xy' })).toThrow(RangeError);
    expect(() => runTwoDiceSimulation({ n: 1.5, pairType: 'xy' })).toThrow(RangeError);
    expect(() => runTwoDiceSimulation({ n: 100, pairType: 'zz' })).toThrow(TypeError);
    expect(() => runTwoDiceSimulation({ n: 100, pairType: 'xy', a: 1.2 })).toThrow(RangeError);
    expect(() => runTwoDiceSimulation({ n: 100, pairType: 'xy', b: -0.1 })).toThrow(RangeError);
    expect(() => runTwoDiceSimulation({ n: 100, pairType: 'xy', seed: -1 })).toThrow(RangeError);
  });
});


describe('runTwoDiceSimulationAsync — equivalence, progress and cancellation', () => {
  it('matches the synchronous runner for the same seed (both pair types)', async () => {
    for (const pairType of ['xy', 'sm']) {
      const params = { n: 400, pairType, seed: 2024 };
      expect(await runTwoDiceSimulationAsync(params)).toEqual(runTwoDiceSimulation(params));
    }
  });

  it('emits initial, intermediate and final progress within bounds and monotone', async () => {
    const n = 3000;
    const updates = [];
    await runTwoDiceSimulationAsync({
      n,
      pairType: 'sm',
      seed: 5,
      onProgress: (p) => updates.push(p),
    });
    expect(updates.length).toBeGreaterThan(1);
    expect(updates[0].completedRolls).toBe(0);
    expect(updates[updates.length - 1]).toEqual({ completedRolls: n, totalRolls: n });
    for (let i = 0; i < updates.length; i += 1) {
      expect(updates[i].completedRolls).toBeGreaterThanOrEqual(0);
      expect(updates[i].completedRolls).toBeLessThanOrEqual(n);
      if (i > 0) {
        expect(updates[i].completedRolls).toBeGreaterThanOrEqual(updates[i - 1].completedRolls);
      }
    }
    // Roughly 50 updates per run (small allowance for chunk boundaries).
    expect(updates.length).toBeLessThanOrEqual(55);
  });

  it('rejects an already-aborted signal without doing work', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runTwoDiceSimulationAsync({ n: 5000, pairType: 'xy', seed: 1, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels promptly when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    // Abort from within the first progress callback so the run is certainly
    // still in flight when the signal fires.
    const promise = runTwoDiceSimulationAsync({
      n: 20000,
      pairType: 'sm',
      seed: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.completedRolls > 0 && progress.completedRolls < 20000) {
          controller.abort();
        }
      },
    });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects invalid arguments', async () => {
    await expect(runTwoDiceSimulationAsync({ n: 0, pairType: 'xy' })).rejects.toThrow(RangeError);
    await expect(runTwoDiceSimulationAsync({ n: 100, pairType: 'bad' })).rejects.toThrow(TypeError);
    await expect(
      runTwoDiceSimulationAsync({ n: 100, pairType: 'xy', onProgress: 5 }),
    ).rejects.toThrow(TypeError);
    await expect(
      runTwoDiceSimulationAsync({ n: 100, pairType: 'xy', signal: 5 }),
    ).rejects.toThrow(TypeError);
  });
});

});
