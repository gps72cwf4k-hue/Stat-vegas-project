import { describe, it, expect } from 'vitest';
import {
  simulateHouseEdgeVisibleSession,
  runHouseEdgeSimulation,
  runHouseEdgeSimulationAsync,
} from './houseEdge.js';
import { createSeededRng } from './rng.js';
import { binomialWinPmf } from '../math/houseEdge.js';

/** Player expected profit per unit bet, −1/37. */
const PLAYER_EV = -1 / 37;
/** Variance of the per-play profit W, 1368/1369. */
const VAR_W = 1368 / 1369;
/** Standard deviation of W. */
const SIGMA_W = Math.sqrt(VAR_W);

describe('simulateHouseEdgeVisibleSession', () => {
  it('reconstructs T1, win/loss counts and the mean from real plays', () => {
    const n = 1000;
    const rng = createSeededRng(2024);
    const visible = simulateHouseEdgeVisibleSession({ n, rng });

    expect(visible.n).toBe(n);
    expect(visible.winCount + visible.lossCount).toBe(n);
    expect(visible.T1).toBe(visible.winCount - visible.lossCount);
    expect(visible.meanW).toBeCloseTo(visible.T1 / n, 12);
    // s² = n/(n−1) * (1 − meanW²) with w_i² = 1.
    const expectedVar = (n / (n - 1)) * (1 - visible.meanW * visible.meanW);
    expect(visible.varWUnbiased).toBeCloseTo(expectedVar, 12);
    expect(visible.se).toBeCloseTo(SIGMA_W / Math.sqrt(n), 12);
    expect(visible.zScore).toBeCloseTo((visible.meanW - PLAYER_EV) / visible.se, 12);
  });

  it('is reproducible for the same seed', () => {
    const first = simulateHouseEdgeVisibleSession({ n: 500, rng: createSeededRng(99) });
    const second = simulateHouseEdgeVisibleSession({ n: 500, rng: createSeededRng(99) });
    expect(second).toEqual(first);
  });

  it('rejects invalid n', () => {
    const rng = createSeededRng(1);
    for (const bad of [9, 20001, 1.5, NaN, Infinity, '100', null, undefined]) {
      expect(() => simulateHouseEdgeVisibleSession({ n: bad, rng })).toThrow();
    }
  });

  it('rejects a non-function rng', () => {
    expect(() => simulateHouseEdgeVisibleSession({ n: 100, rng: 3 })).toThrow(TypeError);
  });
});

describe('runHouseEdgeSimulation — determinism', () => {
  it('same seed gives identical aggregates (explicit)', () => {
    const a = runHouseEdgeSimulation({ n: 1000, N: 300, seed: 4242, mode: 'explicit' });
    const b = runHouseEdgeSimulation({ n: 1000, N: 300, seed: 4242, mode: 'explicit' });
    expect(b).toEqual(a);
    expect(b.histogram).toEqual(a.histogram);
    expect(b.visible.T1).toBe(a.visible.T1);
    expect(b.sessions.meanT).toBe(a.sessions.meanT);
  });

  it('same seed gives identical aggregates (fast)', () => {
    const a = runHouseEdgeSimulation({ n: 2000, N: 200, seed: 555, mode: 'fast' });
    const b = runHouseEdgeSimulation({ n: 2000, N: 200, seed: 555, mode: 'fast' });
    expect(b).toEqual(a);
  });

  it('records the seed used, or null when unseeded', () => {
    const seeded = runHouseEdgeSimulation({ n: 100, N: 50, seed: 0 });
    expect(seeded.inputs.seedUsed).toBe(0);
    const unseeded = runHouseEdgeSimulation({ n: 100, N: 50 });
    expect(unseeded.inputs.seedUsed).toBeNull();
  });

  it('far-apart seeds give different visible session totals', () => {
    const a = runHouseEdgeSimulation({ n: 1000, N: 50, seed: 1 });
    const b = runHouseEdgeSimulation({ n: 1000, N: 50, seed: 987654321 });
    expect(a.visible.T1).not.toBe(b.visible.T1);
  });

  it('session 1 is explicit in both modes, so T1 agrees for the same seed', () => {
    const explicit = runHouseEdgeSimulation({ n: 500, N: 100, seed: 3, mode: 'explicit' });
    const fast = runHouseEdgeSimulation({ n: 500, N: 100, seed: 3, mode: 'fast' });
    expect(fast.visible.T1).toBe(explicit.visible.T1);
  });
});

describe('runHouseEdgeSimulation — statistical sanity (not proofs)', () => {
  it('empirical mean of W is within 4 standard errors of −1/37', () => {
    const n = 1000;
    const result = runHouseEdgeSimulation({ n, N: 300, seed: 13579 });
    const se = SIGMA_W / Math.sqrt(n);
    expect(Math.abs(result.visible.meanW - PLAYER_EV)).toBeLessThan(4 * se);
  });

  it('unbiased variance of T is within a stated tolerance of n·Var(W)', () => {
    // Regression check, not a proof. Var(T) = n·Var(W) exactly; the sample
    // variance over N sessions carries its own sampling error of order
    // sqrt(2/(N−1))·Var(T). With N = 1000 a 15% relative tolerance is a wide,
    // defensible bound for a single fixed seed.
    const n = 500;
    const N = 1000;
    const result = runHouseEdgeSimulation({ n, N, seed: 24680 });
    const target = n * VAR_W;
    const relativeError = Math.abs(result.sessions.varTUnbiased - target) / target;
    expect(relativeError).toBeLessThan(0.15);
  });

  it('the fraction of positive sessions is plausible for n = 1000', () => {
    const result = runHouseEdgeSimulation({ n: 1000, N: 2000, seed: 31415 });
    // Around 0.19 for n = 1000; wide tolerance, a sanity check only.
    expect(result.sessions.fractionPositive).toBeGreaterThan(0.13);
    expect(result.sessions.fractionPositive).toBeLessThan(0.25);
  });
});

describe('runHouseEdgeSimulation — validation', () => {
  it('rejects non-integer and out-of-range n / N', () => {
    for (const bad of [9, 1.5, 20001, NaN, Infinity, '1000', null, undefined]) {
      expect(() => runHouseEdgeSimulation({ n: bad, N: 100 })).toThrow();
    }
    for (const bad of [49, 2001, 100.5, NaN, '300', null, undefined]) {
      expect(() => runHouseEdgeSimulation({ n: 1000, N: bad })).toThrow();
    }
  });

  it('rejects an invalid mode', () => {
    expect(() => runHouseEdgeSimulation({ n: 100, N: 100, mode: 'turbo' })).toThrow(TypeError);
  });

  it('rejects an invalid seed', () => {
    expect(() => runHouseEdgeSimulation({ n: 100, N: 100, seed: -1 })).toThrow(RangeError);
    expect(() => runHouseEdgeSimulation({ n: 100, N: 100, seed: 1.5 })).toThrow(RangeError);
  });
});

describe('runHouseEdgeSimulationAsync', () => {
  it('matches the synchronous runner exactly for the same seed (explicit)', async () => {
    const sync = runHouseEdgeSimulation({ n: 1000, N: 300, seed: 777, mode: 'explicit' });
    const asyncResult = await runHouseEdgeSimulationAsync({
      n: 1000, N: 300, seed: 777, mode: 'explicit',
    });
    expect(asyncResult).toEqual(sync);
  });

  it('matches the synchronous runner exactly for the same seed (fast)', async () => {
    const sync = runHouseEdgeSimulation({ n: 2000, N: 200, seed: 888, mode: 'fast' });
    const asyncResult = await runHouseEdgeSimulationAsync({
      n: 2000, N: 200, seed: 888, mode: 'fast',
    });
    expect(asyncResult).toEqual(sync);
  });

  it('reports bounded progress from 0 to N', async () => {
    const updates = [];
    await runHouseEdgeSimulationAsync({
      n: 100,
      N: 500,
      seed: 1,
      onProgress: (progress) => updates.push(progress),
    });
    expect(updates[0]).toEqual({ completedSessions: 0, totalSessions: 500 });
    expect(updates[updates.length - 1]).toEqual({ completedSessions: 500, totalSessions: 500 });
    // Intermediate updates are throttled to roughly ~50 for the run.
    expect(updates.length).toBeLessThanOrEqual(60);
    for (let i = 1; i < updates.length; i += 1) {
      expect(updates[i].completedSessions).toBeGreaterThanOrEqual(
        updates[i - 1].completedSessions,
      );
    }
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runHouseEdgeSimulationAsync({ n: 100, N: 100, seed: 1, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with an AbortError when cancelled mid-run', async () => {
    const controller = new AbortController();
    const promise = runHouseEdgeSimulationAsync({
      n: 20000,
      N: 2000,
      seed: 1,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.completedSessions > 0) controller.abort();
      },
    });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates arguments like the synchronous runner', async () => {
    await expect(runHouseEdgeSimulationAsync({ n: 5, N: 100 })).rejects.toThrow();
    await expect(runHouseEdgeSimulationAsync({ n: 100, N: 10 })).rejects.toThrow();
    await expect(
      runHouseEdgeSimulationAsync({ n: 100, N: 100, signal: {} }),
    ).rejects.toThrow(TypeError);
    await expect(
      runHouseEdgeSimulationAsync({ n: 100, N: 100, onProgress: 5 }),
    ).rejects.toThrow(TypeError);
  });
});

describe('histogram structure', () => {
  it('relative frequencies sum to 1, bins cover the support and are bounded', () => {
    const n = 1000;
    const N = 300;
    const result = runHouseEdgeSimulation({ n, N, seed: 20240501 });
    const total = result.histogram.reduce((acc, bin) => acc + bin.frequency, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(result.histogram[0].low).toBe(-n);
    expect(result.histogram[result.histogram.length - 1].high).toBe(n);
    expect(result.histogram.length).toBeLessThanOrEqual(60);
    for (const bin of result.histogram) {
      expect(bin.count).toBeGreaterThanOrEqual(0);
      expect(bin.frequency).toBeCloseTo(bin.count / N, 12);
    }
  });
});

describe('latticeCounts — exact per-lattice-value counts for the empirical CDF', () => {
  it('sums to N, is sorted, step-2 and parity-correct', () => {
    const n = 1000;
    const N = 300;
    const result = runHouseEdgeSimulation({ n, N, seed: 441856889, mode: 'explicit' });
    const counts = result.sessions.latticeCounts;

    expect(Array.isArray(counts)).toBe(true);
    expect(counts.reduce((acc, entry) => acc + entry.count, 0)).toBe(N);

    for (let i = 0; i < counts.length; i += 1) {
      const entry = counts[i];
      expect(entry.count).toBeGreaterThan(0);
      // T = 2X − n sits on the step-2 lattice whose parity matches n.
      expect((entry.t + n) % 2).toBe(0);
      expect(Math.abs(entry.t)).toBeLessThanOrEqual(n);
      if (i > 0) expect(entry.t).toBeGreaterThan(counts[i - 1].t); // strictly sorted
    }
  });
});

describe('empirical CDF vs exact — observed Kolmogorov distance within DKW', () => {
  // Mirrors the UI: a right-continuous ECDF from the exact lattice counts, and
  // the sup-distance to the exact Binomial CDF over the lattice grid. The DKW
  // 95% bound eps = sqrt(ln(2/0.05)/(2N)) caps it. This locks the left-shift fix
  // (the old grouped-bin left-edge ECDF gave ~0.38 for n=1000, far above eps).
  it.each([
    [1000, 300, 441856889],
    [10000, 300, 441856889],
    [2000, 50, 1],
  ])('n = %i, N = %i, seed = %i: KS_emp ≤ DKW 95%%', (n, N, seed) => {
    const result = runHouseEdgeSimulation({ n, N, seed, mode: 'explicit' });
    const counts = result.sessions.latticeCounts;
    const empiricalCdf = (t) => {
      let cumulative = 0;
      for (const entry of counts) {
        if (entry.t <= t) cumulative += entry.count;
        else break;
      }
      return cumulative / N;
    };

    // Reference exact CDF recomputed locally from the Binomial PMF (no reliance
    // on the UI module).
    const pmf = binomialWinPmf(n);
    const exactCdf = (t) => {
      let cumulative = 0;
      for (let k = 0; k <= n; k += 1) {
        if (2 * k - n <= t) cumulative += pmf[k];
        else break;
      }
      return cumulative;
    };

    let ks = 0;
    for (let t = -n; t <= n; t += 2) {
      ks = Math.max(ks, Math.abs(empiricalCdf(t) - exactCdf(t)));
    }
    const eps = Math.sqrt(Math.log(2 / 0.05) / (2 * N));

    expect(ks).toBeLessThanOrEqual(eps);
    // A sanity floor: the ECDF is a genuine step of the sample, not constant 0/1.
    expect(ks).toBeGreaterThan(0);
  });
});


