import { describe, it, expect } from 'vitest';
import {
  simulateLoadedDieExperiment,
  runLoadedDieSimulation,
  runLoadedDieSimulationAsync,
} from './loadedDie.js';
import { createSeededRng } from './rng.js';
import { posteriorLoadedGivenCount } from '../math/loadedDie.js';

/** Standard-error bound for a single posterior, 0.5 / sqrt(M). */
function seBound(M) {
  return 0.5 / Math.sqrt(M);
}

describe('simulateLoadedDieExperiment', () => {
  it('manual mode uses the given k and does not touch the RNG', () => {
    const throwingRng = () => {
      throw new Error('the RNG must not be used in manual mode');
    };
    const result = simulateLoadedDieExperiment({
      theta: 0.5,
      b: 0.5,
      m: 10,
      mode: 'manual',
      rng: throwingRng,
      fixedK: 5,
    });
    expect(result.trueType).toBeNull();
    expect(result.k).toBe(5);
    expect(result.posterior).toBe(posteriorLoadedGivenCount({ theta: 0.5, b: 0.5, m: 10, k: 5 }));
  });

  it('simulate mode draws one type then m faces and never exceeds k <= m', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 200; i += 1) {
      const result = simulateLoadedDieExperiment({
        theta: 0.5,
        b: 0.5,
        m: 10,
        mode: 'simulate',
        rng,
      });
      expect(typeof result.trueType).toBe('boolean');
      expect(Number.isInteger(result.k)).toBe(true);
      expect(result.k).toBeGreaterThanOrEqual(0);
      expect(result.k).toBeLessThanOrEqual(10);
    }
  });

  it('is reproducible for the same seed', () => {
    const first = simulateLoadedDieExperiment({
      theta: 0.5, b: 0.5, m: 20, mode: 'simulate', rng: createSeededRng(99),
    });
    const second = simulateLoadedDieExperiment({
      theta: 0.5, b: 0.5, m: 20, mode: 'simulate', rng: createSeededRng(99),
    });
    expect(second).toEqual(first);
  });

  it('predictive six probability is a convex combination in [1/6, b]', () => {
    const result = simulateLoadedDieExperiment({
      theta: 0.5, b: 0.6, m: 10, mode: 'manual', rng: createSeededRng(1), fixedK: 5,
    });
    expect(result.predictiveSixBefore).toBeGreaterThanOrEqual(1 / 6);
    expect(result.predictiveSixBefore).toBeLessThanOrEqual(0.6);
    expect(result.predictiveSixAfter).toBeGreaterThanOrEqual(1 / 6);
    expect(result.predictiveSixAfter).toBeLessThanOrEqual(0.6);
    const pmfSum = result.predictivePmfAfter.reduce((acc, value) => acc + value, 0);
    expect(pmfSum).toBeCloseTo(1, 12);
  });

  it('rejects invalid arguments', () => {
    const rng = createSeededRng(1);
    expect(() => simulateLoadedDieExperiment({ theta: 0.5, b: 0.5, m: 0, mode: 'manual', rng, fixedK: 0 })).toThrow();
    expect(() => simulateLoadedDieExperiment({ theta: 0.5, b: 0.5, m: 10, mode: 'manual', rng, fixedK: 11 })).toThrow(RangeError);
    expect(() => simulateLoadedDieExperiment({ theta: 0.5, b: 0.5, m: 10, mode: 'nope', rng, fixedK: 5 })).toThrow(TypeError);
    expect(() => simulateLoadedDieExperiment({ theta: 0.5, b: 0.5, m: 10, mode: 'manual', rng: 3, fixedK: 5 })).toThrow(TypeError);
    expect(() => simulateLoadedDieExperiment({ theta: 2, b: 0.5, m: 10, mode: 'manual', rng, fixedK: 5 })).toThrow(RangeError);
  });
});

describe('runLoadedDieSimulation — determinism and shape', () => {
  it('same seedUsed gives identical snapshots; different seeds differ', () => {
    const a = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 4242 });
    const b = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 4242 });
    const c = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 5252 });
    expect(b).toEqual(a);
    expect(c.experiments.posterior).not.toEqual(a.experiments.posterior);
  });

  it('records the seed used, or null when unseeded', () => {
    const seeded = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'manual', m: 10, k: 5, M: 50, seedUsed: 0 });
    expect(seeded.inputs.seedUsed).toBe(0);
    const unseeded = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'manual', m: 10, k: 5, M: 50 });
    expect(unseeded.inputs.seedUsed).toBeNull();
  });

  it('returns arrays of length M and a 10-bin calibration table', () => {
    const M = 500;
    const result = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M, seedUsed: 11 });
    expect(result.experiments.posterior).toHaveLength(M);
    expect(result.experiments.k).toHaveLength(M);
    expect(result.experiments.trueType).toHaveLength(M);
    expect(result.calibration).toHaveLength(10);
    const binCounts = result.calibration.reduce((acc, bin) => acc + bin.count, 0);
    expect(binCounts).toBe(M);
    // The exact overlay covers the full support k = 0..m and sums to 1.
    const overlaySum = result.exactOverlay.mixtureProbability.reduce((acc, v) => acc + v, 0);
    expect(overlaySum).toBeCloseTo(1, 9);
    expect(result.exactOverlay.posteriorByK).toHaveLength(11);
  });

  it('manual mode has the same posterior in every experiment', () => {
    const result = runLoadedDieSimulation({ theta: 0.4, b: 0.5, mode: 'manual', m: 20, k: 8, M: 100, seedUsed: 3 });
    const expected = posteriorLoadedGivenCount({ theta: 0.4, b: 0.5, m: 20, k: 8 });
    for (const p of result.experiments.posterior) {
      expect(p).toBeCloseTo(expected, 15);
    }
    for (const t of result.experiments.trueType) {
      expect(t).toBeNull();
    }
  });
});

describe('runLoadedDieSimulation — regression checks (not proofs)', () => {
  it('mean posterior is within 4 standard errors of theta for a fixed seed', () => {
    const M = 2000;
    const theta = 0.5;
    const result = runLoadedDieSimulation({ theta, b: 0.5, mode: 'simulate', m: 10, M, seedUsed: 2024 });
    const tolerance = 4 * seBound(M);
    expect(Math.abs(result.summaryMetrics.meanPosterior - theta)).toBeLessThanOrEqual(tolerance);
  });

  it('records the requested SE bound 0.5 / sqrt(M)', () => {
    const result = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 1 });
    expect(result.summaryMetrics.seBound).toBeCloseTo(0.5 / Math.sqrt(500), 15);
  });

  it('calibration is approximately honest in well-populated bins', () => {
    const M = 5000;
    const result = runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 20, M, seedUsed: 909 });
    for (const bin of result.calibration) {
      if (bin.tooFew) continue;
      // Observed loaded share should track the mean posterior of the bin. The
      // tolerance (0.12) is generous and seed-specific; this is a sanity check,
      // not an equality claim.
      expect(Math.abs(bin.observedLoadedShare - bin.meanPosteriorInBin)).toBeLessThan(0.12);
    }
  });
});


describe('runLoadedDieSimulationAsync', () => {
  it('matches the synchronous runner for the same seedUsed', async () => {
    const params = { theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 777 };
    const sync = runLoadedDieSimulation(params);
    const asyncResult = await runLoadedDieSimulationAsync(params);
    expect(asyncResult).toEqual(sync);
  });

  it('reports bounded progress starting at 0 and ending at M', async () => {
    const M = 500;
    const updates = [];
    await runLoadedDieSimulationAsync({
      theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M, seedUsed: 5,
      onProgress: (p) => updates.push(p.completedExperiments),
    });
    expect(updates[0]).toBe(0);
    expect(updates[updates.length - 1]).toBe(M);
    // Throttled to O(PROGRESS_UPDATES_TARGET) updates (a little slack for edges).
    expect(updates.length).toBeLessThanOrEqual(60);
  });

  it('throws an AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runLoadedDieSimulationAsync({
        theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, seedUsed: 5,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws an AbortError when cancelled mid-run', async () => {
    const controller = new AbortController();
    const promise = runLoadedDieSimulationAsync({
      theta: 0.5, b: 0.5, mode: 'simulate', m: 100, M: 5000, seedUsed: 5,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.completedExperiments > 0) controller.abort();
      },
    });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects invalid arguments', async () => {
    await expect(runLoadedDieSimulationAsync({ theta: 0.5, b: 0.5, mode: 'manual', m: 10, k: 20, M: 50 })).rejects.toThrow(RangeError);
    await expect(runLoadedDieSimulationAsync({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 0 })).rejects.toThrow(RangeError);
    await expect(runLoadedDieSimulationAsync({ theta: 0.5, b: 0.5, mode: 'simulate', m: 10, M: 500, signal: 'x' })).rejects.toThrow(TypeError);
  });
});

describe('input validation', () => {
  it('rejects non-integer / out-of-range m, k, M and k > m', () => {
    expect(() => runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'manual', m: 1.5, k: 1, M: 50 })).toThrow(RangeError);
    expect(() => runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'manual', m: 10, k: 11, M: 50 })).toThrow(RangeError);
    expect(() => runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'manual', m: 10, k: 5, M: 5001 })).toThrow(RangeError);
    expect(() => runLoadedDieSimulation({ theta: 0.5, b: 0.5, mode: 'simulate', m: 5001, M: 50 })).toThrow(RangeError);
    expect(() => runLoadedDieSimulation({ theta: 2, b: 0.5, mode: 'simulate', m: 10, M: 50 })).toThrow(RangeError);
    expect(() => runLoadedDieSimulation({ theta: 0.5, b: 0.1, mode: 'simulate', m: 10, M: 50 })).toThrow(RangeError);
  });
});

