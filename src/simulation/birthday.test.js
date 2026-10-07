import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  runBirthdaySimulation,
  runBirthdaySimulationAsync,
  wilsonInterval95,
  buildCumulativeWeights,
  sampleIndexFromCumulative,
  simulateSharedExperiment,
  DATASET_INFO,
} from './birthday.js';

/** The bundled CSV shipped in the repository (spec section "Data"). */
const CSV_PATH = fileURLToPath(
  new URL('../../docs/specs/us-births-by-calendar-day.csv', import.meta.url),
);
const CSV_TEXT = readFileSync(CSV_PATH, 'utf8');

/**
 * Deterministic RNG stub returning the given values in order; throws if asked
 * for more values than supplied (so an extra draw per person is caught).
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

describe('wilsonInterval95', () => {
  it('contains p-hat, lies in [0, 1], and is ordered', () => {
    for (const [hits, N] of [
      [0, 100],
      [1, 100],
      [50, 100],
      [99, 100],
      [100, 100],
      [5, 2000],
      [1000, 2000],
    ]) {
      const { lo, hi } = wilsonInterval95(hits, N);
      const pHat = hits / N;
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(lo).toBeLessThanOrEqual(hi);
      expect(pHat).toBeGreaterThanOrEqual(lo);
      expect(pHat).toBeLessThanOrEqual(hi);
    }
  });

  it('has upper bound exactly 1 for p-hat = 1 and a lower bound below 1', () => {
    const { lo, hi } = wilsonInterval95(50, 50);
    expect(hi).toBe(1);
    expect(lo).toBeLessThan(1);
    expect(lo).toBeGreaterThan(0);
  });

  it('has lower bound exactly 0 for p-hat = 0 and an upper bound above 0', () => {
    const { lo, hi } = wilsonInterval95(0, 50);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
  });

  it('rejects invalid counts', () => {
    expect(() => wilsonInterval95(5, 0)).toThrow(RangeError);
    expect(() => wilsonInterval95(-1, 10)).toThrow(RangeError);
    expect(() => wilsonInterval95(11, 10)).toThrow(RangeError);
    expect(() => wilsonInterval95(1.5, 10)).toThrow(RangeError);
    expect(() => wilsonInterval95('a', 10)).toThrow(TypeError);
  });
});

describe('buildCumulativeWeights and sampleIndexFromCumulative', () => {
  it('ends the cumulative array at exactly 1', () => {
    const weights = new Array(366).fill(1 / 366);
    const cumulative = buildCumulativeWeights(weights);
    expect(cumulative).toHaveLength(366);
    expect(cumulative[cumulative.length - 1]).toBe(1);
    for (let i = 1; i < cumulative.length; i += 1) {
      expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1]);
    }
  });

  it('binary search never returns an out-of-bounds index', () => {
    const weights = [0.5, 0.25, 0.15, 0.1];
    const cumulative = buildCumulativeWeights(weights);
    const us = [0, 1e-12, 0.25, 0.499999999, 0.5, 0.75, 0.9999999999, 1 - Number.EPSILON, 1];
    for (const u of us) {
      const index = sampleIndexFromCumulative(cumulative, u);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(weights.length);
    }
  });

  it('maps sample points to the correct bin for a simple distribution', () => {
    const cumulative = buildCumulativeWeights([0.5, 0.25, 0.25]);
    expect(sampleIndexFromCumulative(cumulative, 0.0)).toBe(0);
    expect(sampleIndexFromCumulative(cumulative, 0.25)).toBe(0);
    expect(sampleIndexFromCumulative(cumulative, 0.5)).toBe(1);
    expect(sampleIndexFromCumulative(cumulative, 0.6)).toBe(1);
    expect(sampleIndexFromCumulative(cumulative, 0.75)).toBe(2);
    expect(sampleIndexFromCumulative(cumulative, 0.99)).toBe(2);
  });

  it('rejects malformed weights', () => {
    expect(() => buildCumulativeWeights([])).toThrow(RangeError);
    expect(() => buildCumulativeWeights([0.5, -0.1])).toThrow(RangeError);
    expect(() => buildCumulativeWeights([0.5, Number.NaN])).toThrow(RangeError);
    expect(() => buildCumulativeWeights('x')).toThrow(TypeError);
  });
});

describe('simulateSharedExperiment', () => {
  it('detects a duplicate from fixed draws', () => {
    const cumulative = buildCumulativeWeights(new Array(365).fill(1 / 365));
    const shared = simulateSharedExperiment({ n: 2, cumulative, rng: rngFrom([0.0, 0.0]) });
    expect(shared).toBe(true);
  });

  it('reports no share for distinct draws and consumes exactly n draws', () => {
    const cumulative = buildCumulativeWeights(new Array(365).fill(1 / 365));
    const distinct = simulateSharedExperiment({
      n: 3,
      cumulative,
      rng: rngFrom([0.0, 1 / 365, 2 / 365]),
    });
    expect(distinct).toBe(false);
  });

  it('stops early once a duplicate is found (does not draw the remaining people)', () => {
    const cumulative = buildCumulativeWeights(new Array(365).fill(1 / 365));
    // Only two draws supplied for n=5: the stub throws if a third is requested,
    // proving the experiment returned as soon as person 2 matched person 1.
    const shared = simulateSharedExperiment({ n: 5, cumulative, rng: rngFrom([0.0, 0.0]) });
    expect(shared).toBe(true);
  });
});


describe('runBirthdaySimulation — determinism', () => {
  it('produces identical snapshots for the same seed and different ones otherwise', () => {
    const a = runBirthdaySimulation({ n: 23, N: 5000, source: 'uniform', seed: 42 });
    const b = runBirthdaySimulation({ n: 23, N: 5000, source: 'uniform', seed: 42 });
    const c = runBirthdaySimulation({ n: 23, N: 5000, source: 'uniform', seed: 43 });

    expect(a.empirical).toEqual(b.empirical);
    expect(a.wilsonCI95).toEqual(b.wilsonCI95);
    expect(a.empirical.hits).not.toBe(c.empirical.hits);
  });

  it('async and sync runners return the same snapshot for the same seed', async () => {
    const sync = runBirthdaySimulation({ n: 23, N: 6000, source: 'real-ssa', seed: 99, csvText: CSV_TEXT });
    const async = await runBirthdaySimulationAsync({
      n: 23,
      N: 6000,
      source: 'real-ssa',
      seed: 99,
      csvText: CSV_TEXT,
    });
    expect(async.empirical).toEqual(sync.empirical);
    expect(async.exact).toEqual(sync.exact);
    expect(async.wilsonCI95).toEqual(sync.wilsonCI95);
  });
});

describe('runBirthdaySimulation — exact values and validity', () => {
  it('reports the exact uniform values for n=23 with a correct derived block', () => {
    const result = runBirthdaySimulation({ n: 23, N: 2000, source: 'uniform', seed: 1 });
    expect(result.exact.pExact).toBeCloseTo(0.5072972, 7);
    expect(result.exact.pDistinctExact).toBeCloseTo(1 - 0.5072972, 7);
    expect(result.exact.uniform365Exact).toBeNull();
    expect(result.detectability).toBeNull();
    expect(result.dataCard).toBeNull();
    expect(result.derived.se).toBeCloseTo(Math.sqrt((0.5072972 * (1 - 0.5072972)) / 2000), 9);
    expect(result.derived.zValid).toBe(true);
    expect(typeof result.derived.zScoreOrNull).toBe('number');
  });

  it('marks the z-score invalid when N*p < 10 (n=2 uniform)', () => {
    const result = runBirthdaySimulation({ n: 2, N: 100, source: 'uniform', seed: 5 });
    expect(result.derived.zValid).toBe(false);
    expect(result.derived.zScoreOrNull).toBeNull();
    expect(result.derived.expectedHits).toBeLessThan(10);
  });

  it('exposes real-data exact/uniform/detectability fields for the SSA source', () => {
    const result = runBirthdaySimulation({ n: 23, N: 2000, source: 'real-ssa', seed: 7, csvText: CSV_TEXT });
    expect(result.exact.pExact).toBeCloseTo(0.5079292, 7);
    expect(result.exact.uniform365Exact).toBeCloseTo(0.5072972, 7);
    expect(result.detectability.deltaExact).toBeCloseTo(0.00063, 5);
    expect(result.detectability.nNeeded3SE).toBeGreaterThan(5.6e6 * 0.98);
    expect(result.detectability.nNeeded3SE).toBeLessThan(5.6e6 * 1.02);
    expect(result.dataCard.totalBirths).toBe(62187024);
    expect(result.dataCard.rarest.date).toBe('02-29');
  });

  it('builds index-aligned curves for n = 2..100', () => {
    const result = runBirthdaySimulation({ n: 23, N: 500, source: 'uniform', seed: 3 });
    expect(result.curves.nValues).toHaveLength(99);
    expect(result.curves.nValues[0]).toBe(2);
    expect(result.curves.nValues[98]).toBe(100);
    expect(result.curves.exact[0]).toBeCloseTo(1 / 365, 12);
    expect(result.curves.uniform365[0]).toBeCloseTo(1 / 365, 12);
    expect(result.curves.delta[0]).toBeCloseTo(0, 12);
  });
});


describe('runBirthdaySimulation — statistical sanity', () => {
  it('estimates ~1/365 for n=2 uniform over many experiments', () => {
    const result = runBirthdaySimulation({ n: 2, N: 20000, source: 'uniform', seed: 123456 });
    const se = Math.sqrt(((1 / 365) * (1 - 1 / 365)) / 20000);
    expect(Math.abs(result.empirical.pHat - 1 / 365)).toBeLessThan(4 * se);
  });

  it('lands within a few standard errors of the exact value at n=23 for each source', () => {
    const cases = [
      ['uniform', {}],
      ['real-ssa', { csvText: CSV_TEXT }],
      ['real-cdc', { csvText: CSV_TEXT }],
    ];
    for (const [source, extra] of cases) {
      const result = runBirthdaySimulation({ n: 23, N: 20000, source, seed: 2024, ...extra });
      const z = result.derived.zScoreOrNull;
      expect(z).not.toBeNull();
      expect(Math.abs(z)).toBeLessThanOrEqual(4);
    }
  });
});

describe('source isolation and snapshot immutability', () => {
  it('a run for one source is unaffected by another source being run afterwards', () => {
    const first = runBirthdaySimulation({ n: 23, N: 4000, source: 'real-ssa', seed: 11, csvText: CSV_TEXT });
    const firstCopy = JSON.parse(JSON.stringify(first.empirical));

    // Run other sources afterwards; the first snapshot's numbers must not change.
    runBirthdaySimulation({ n: 23, N: 4000, source: 'real-cdc', seed: 11, csvText: CSV_TEXT });
    runBirthdaySimulation({ n: 23, N: 4000, source: 'uniform', seed: 11 });

    expect(first.empirical).toEqual(firstCopy);
  });

  it('re-running the same source+seed reproduces the snapshot exactly', () => {
    const a = runBirthdaySimulation({ n: 30, N: 3000, source: 'real-cdc', seed: 808, csvText: CSV_TEXT });
    const b = runBirthdaySimulation({ n: 30, N: 3000, source: 'real-cdc', seed: 808, csvText: CSV_TEXT });
    expect(a).toEqual(b);
  });

  it('exposes per-dataset metadata with license and link', () => {
    expect(DATASET_INFO['real-ssa'].license).toBe('CC BY 4.0');
    expect(DATASET_INFO['real-cdc'].datasetKey).toBe('cdc_1994_2003');
    expect(DATASET_INFO['real-ssa'].link).toMatch(/fivethirtyeight\/data/);
  });
});

describe('input validation', () => {
  it('rejects out-of-range or non-integer n and N', () => {
    expect(() => runBirthdaySimulation({ n: 1.5, N: 100, source: 'uniform' })).toThrow(RangeError);
    expect(() => runBirthdaySimulation({ n: 0, N: 100, source: 'uniform' })).toThrow(RangeError);
    expect(() => runBirthdaySimulation({ n: 101, N: 100, source: 'uniform' })).toThrow(RangeError);
    expect(() => runBirthdaySimulation({ n: 23, N: 0, source: 'uniform' })).toThrow(RangeError);
    expect(() => runBirthdaySimulation({ n: 23, N: 20001, source: 'uniform' })).toThrow(RangeError);
    expect(() => runBirthdaySimulation({ n: 'a', N: 100, source: 'uniform' })).toThrow(TypeError);
  });

  it('rejects unknown sources and real sources without CSV text', () => {
    expect(() => runBirthdaySimulation({ n: 23, N: 100, source: 'nope' })).toThrow(TypeError);
    expect(() => runBirthdaySimulation({ n: 23, N: 100, source: 'real-ssa' })).toThrow(TypeError);
  });

  it('accepts a tiny N for tests and records the seed used', () => {
    const result = runBirthdaySimulation({ n: 5, N: 1, source: 'uniform', seed: 0 });
    expect(result.inputs.seedUsed).toBe(0);
    expect(result.empirical.hits === 0 || result.empirical.hits === 1).toBe(true);
  });
});

