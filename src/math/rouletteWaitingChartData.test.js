import { describe, it, expect } from 'vitest';
import {
  buildRouletteWaitingChartData,
  restrictedGeometricMean,
} from './rouletteWaitingChartData.js';
import { geometricTail } from './distributions.js';

const P_GREEN = 1 / 37;
const P_RED = 18 / 37;

/** Build a first-hit histogram of length n+1 from {spin: count} pairs. */
function histogramFrom(n, entries) {
  const histogram = new Array(n + 1).fill(0);
  for (const [spin, count] of entries) histogram[spin] = count;
  return histogram;
}

/** Independent restricted-mean reference: E[min(T,n)] by direct summation. */
function referenceRestrictedMean(n, p) {
  if (p === 1) return 1;
  let total = 0;
  for (let k = 1; k <= n; k += 1) total += k * (Math.pow(1 - p, k - 1) * p);
  // Censored contribution: n * P(T > n).
  total += n * Math.pow(1 - p, n);
  return total;
}

describe('buildRouletteWaitingChartData — small n and censoring', () => {
  it('n = 1 keeps the observed first hit and the censored category distinct', () => {
    const data = buildRouletteWaitingChartData({
      spins: 1,
      experiments: 10,
      firstHitHistogram: histogramFrom(1, [[1, 6]]),
      censoredCount: 4,
      probability: P_GREEN,
    });
    const observed = data.buckets.find((b) => b.low === 1 && b.high === 1);
    const censored = data.buckets.find((b) => b.isCensored);
    expect(observed.empiricalProbability).toBeCloseTo(0.6, 12);
    expect(observed.theoreticalProbability).toBeCloseTo(P_GREEN, 12);
    expect(censored.empiricalProbability).toBeCloseTo(0.4, 12);
    expect(censored.theoreticalProbability).toBeCloseTo(1 - P_GREEN, 12);
    expect(censored.label).toBe('> 1');
  });

  it('handles all experiments censored', () => {
    const data = buildRouletteWaitingChartData({
      spins: 5,
      experiments: 20,
      firstHitHistogram: histogramFrom(5, []),
      censoredCount: 20,
      probability: P_GREEN,
    });
    expect(data.observedExperiments).toBe(0);
    expect(data.empiricalCensoredFraction).toBe(1);
    const total = data.buckets.reduce((a, b) => a + b.empiricalProbability, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('handles all first hits at spin 1', () => {
    const data = buildRouletteWaitingChartData({
      spins: 10,
      experiments: 30,
      firstHitHistogram: histogramFrom(10, [[1, 30]]),
      censoredCount: 0,
      probability: P_GREEN,
    });
    expect(data.empiricalRestrictedMean).toBe(1);
    expect(data.observedExperiments).toBe(30);
  });

  it('handles a first hit exactly at spin n (distinct from censored)', () => {
    const data = buildRouletteWaitingChartData({
      spins: 4,
      experiments: 10,
      firstHitHistogram: histogramFrom(4, [[4, 10]]),
      censoredCount: 0,
      probability: P_GREEN,
    });
    const last = data.buckets.find((b) => b.low === 4 && b.high === 4);
    const censored = data.buckets.find((b) => b.isCensored);
    expect(last.empiricalProbability).toBe(1);
    expect(censored.empiricalProbability).toBe(0);
    expect(data.empiricalRestrictedMean).toBe(4);
  });

  it('matches a controlled restricted mean', () => {
    // 3 experiments: hit at 1, hit at 4, censored at 4 → min = 1, 4, 4.
    const data = buildRouletteWaitingChartData({
      spins: 4,
      experiments: 3,
      firstHitHistogram: histogramFrom(4, [[1, 1], [4, 1]]),
      censoredCount: 1,
      probability: P_GREEN,
    });
    expect(data.empiricalRestrictedMean).toBeCloseTo((1 + 4 + 4) / 3, 12);
  });
});

describe('buildRouletteWaitingChartData — probabilities, means and endpoints', () => {
  it('restrictedGeometricMean matches direct summation and stays ≤ n', () => {
    for (const [n, p] of [[10, P_GREEN], [100, P_GREEN], [50, P_RED], [1, 0.5]]) {
      const mean = restrictedGeometricMean(n, p);
      expect(mean).toBeCloseTo(referenceRestrictedMean(n, p), 10);
      expect(mean).toBeLessThanOrEqual(n + 1e-12);
    }
  });

  it('restrictedGeometricMean p = 1 endpoint is 1', () => {
    expect(restrictedGeometricMean(1, 1)).toBe(1);
    expect(restrictedGeometricMean(100, 1)).toBe(1);
  });

  it('restricted mean approaches the full mean 1/p as the window grows', () => {
    const full = 1 / P_GREEN;
    const small = restrictedGeometricMean(10, P_GREEN);
    const large = restrictedGeometricMean(1000, P_GREEN);
    expect(small).toBeLessThan(large);
    expect(large).toBeLessThan(full);
    expect(large).toBeCloseTo(full, 1); // within ~0.05 of 37
  });

  it('empirical probabilities sum to 1 and theoretical observed + censored ≈ 1', () => {
    const n = 100;
    const histogram = histogramFrom(n, [[5, 100], [20, 200], [40, 100]]);
    const data = buildRouletteWaitingChartData({
      spins: n,
      experiments: 1000,
      firstHitHistogram: histogram,
      censoredCount: 600,
      probability: P_GREEN,
    });
    const empirical = data.buckets.reduce((a, b) => a + b.empiricalProbability, 0);
    const theoretical = data.buckets.reduce((a, b) => a + b.theoreticalProbability, 0);
    expect(empirical).toBeCloseTo(1, 12);
    expect(theoretical).toBeCloseTo(1, 10);
    expect(data.theoreticalCensoredProbability).toBeCloseTo(geometricTail(n, P_GREEN), 12);
  });

  it('grouped values equal the true interval probability sums', () => {
    const n = 200;
    const histogram = histogramFrom(n, [[1, 5], [50, 10], [199, 3]]);
    const data = buildRouletteWaitingChartData({
      spins: n,
      experiments: 18,
      firstHitHistogram: histogram,
      censoredCount: 0,
      probability: P_RED,
    });
    for (const bucket of data.buckets) {
      if (bucket.isCensored) continue;
      let expected = 0;
      for (let k = bucket.low; k <= bucket.high; k += 1) {
        expected += geometricTail(k - 1, P_RED) - geometricTail(k, P_RED);
      }
      expect(bucket.theoreticalProbability).toBeCloseTo(expected, 12);
    }
  });

  it('observed buckets partition 1..n without overlap or gaps', () => {
    const n = 120;
    const histogram = histogramFrom(n, [[1, 10], [90, 5]]);
    const data = buildRouletteWaitingChartData({
      spins: n,
      experiments: 15,
      firstHitHistogram: histogram,
      censoredCount: 0,
      probability: P_GREEN,
    });
    const observed = data.buckets.filter((b) => !b.isCensored);
    let next = 1;
    for (const bucket of observed) {
      expect(bucket.low).toBe(next);
      next = bucket.high + 1;
    }
    expect(next).toBe(n + 1);
  });

  it('large n = 5000 yields a bounded number of chart elements', () => {
    const n = 5000;
    const histogram = histogramFrom(n, [[1, 500]]);
    const data = buildRouletteWaitingChartData({
      spins: n,
      experiments: 500,
      firstHitHistogram: histogram,
      censoredCount: 0,
      probability: P_GREEN,
    });
    expect(data.buckets.length).toBeLessThanOrEqual(42);
  });

  it('retains observed extreme first hits', () => {
    const n = 100;
    const histogram = histogramFrom(n, [[1, 1], [100, 1]]);
    const data = buildRouletteWaitingChartData({
      spins: n,
      experiments: 2,
      firstHitHistogram: histogram,
      censoredCount: 0,
      probability: P_GREEN,
    });
    const covers = (value) =>
      data.buckets.some((b) => !b.isCensored && value >= b.low && value <= b.high);
    expect(covers(1)).toBe(true);
    expect(covers(100)).toBe(true);
  });
});

describe('buildRouletteWaitingChartData — validation and immutability', () => {
  const goodHistogram = histogramFrom(5, [[1, 5]]);

  it('rejects malformed histograms, counts and probability', () => {
    expect(() =>
      buildRouletteWaitingChartData({
        spins: 5, experiments: 5, firstHitHistogram: [1, 5, 0, 0, 0, 0],
        censoredCount: 0, probability: P_GREEN,
      }),
    ).toThrow(); // index 0 must be 0
    expect(() =>
      buildRouletteWaitingChartData({
        spins: 5, experiments: 5, firstHitHistogram: [0, 1, 2], censoredCount: 0,
        probability: P_GREEN,
      }),
    ).toThrow(); // wrong length
    expect(() =>
      buildRouletteWaitingChartData({
        spins: 5, experiments: 5, firstHitHistogram: goodHistogram, censoredCount: 9,
        probability: P_GREEN,
      }),
    ).toThrow(); // observed + censored != N
    expect(() =>
      buildRouletteWaitingChartData({
        spins: 5, experiments: 5, firstHitHistogram: goodHistogram, censoredCount: 0,
        probability: 0,
      }),
    ).toThrow(); // p = 0 rejected
    expect(() =>
      buildRouletteWaitingChartData({
        spins: 5, experiments: 5, firstHitHistogram: goodHistogram, censoredCount: 0,
        probability: NaN,
      }),
    ).toThrow();
  });

  it('does not mutate its histogram input', () => {
    const histogram = histogramFrom(5, [[1, 5]]);
    const before = histogram.slice();
    buildRouletteWaitingChartData({
      spins: 5, experiments: 5, firstHitHistogram: histogram, censoredCount: 0,
      probability: P_GREEN,
    });
    expect(histogram).toEqual(before);
  });
});

