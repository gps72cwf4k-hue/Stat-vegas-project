import { describe, it, expect } from 'vitest';
import { buildRouletteCountChartData } from './rouletteCountChartData.js';
import { binomialPmfArray, poissonPmfArray } from './distributions.js';

const P_RED = 18 / 37;
const P_GREEN = 1 / 37;

/** Build a histogram array of length n+1 from {count: experiments} pairs. */
function histogramFrom(n, entries) {
  const histogram = new Array(n + 1).fill(0);
  for (const [count, experiments] of entries) histogram[count] = experiments;
  return histogram;
}

describe('buildRouletteCountChartData — n = 1 small support', () => {
  const histogram = histogramFrom(1, [[0, 7], [1, 3]]);
  const data = buildRouletteCountChartData({
    spins: 1,
    experiments: 10,
    countHistogram: histogram,
    probability: P_GREEN,
    includePoisson: true,
  });

  it('retains every count in 0..n exactly once (no overlap or gaps)', () => {
    const finite = data.buckets.filter((b) => !b.isPoissonBeyondN);
    const covered = finite.flatMap((b) => {
      const values = [];
      for (let k = b.low; k <= b.high; k += 1) values.push(k);
      return values;
    });
    expect(covered).toEqual([0, 1]);
  });

  it('empirical bucket probabilities sum to 1 and preserve all experiments', () => {
    const empiricalTotal = data.buckets.reduce((a, b) => a + b.empiricalProbability, 0);
    const empiricalCount = data.buckets.reduce((a, b) => a + b.empiricalCount, 0);
    expect(empiricalTotal).toBeCloseTo(1, 12);
    expect(empiricalCount).toBe(10);
  });

  it('binomial bucket probabilities sum to 1', () => {
    const total = data.buckets.reduce((a, b) => a + b.binomialProbability, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('matches the exact Binomial values for this small support', () => {
    const binomial = binomialPmfArray(1, P_GREEN);
    const b0 = data.buckets.find((b) => b.low === 0 && b.high === 0);
    const b1 = data.buckets.find((b) => b.low === 1 && b.high === 1);
    expect(b0.binomialProbability).toBeCloseTo(binomial[0], 12);
    expect(b1.binomialProbability).toBeCloseTo(binomial[1], 12);
  });

  it('has genuine Poisson mass beyond n collected in a "> n" bucket', () => {
    const beyond = data.buckets.find((b) => b.isPoissonBeyondN);
    expect(beyond).toBeTruthy();
    expect(beyond.label).toBe('> 1');
    expect(beyond.binomialProbability).toBe(0);
    expect(beyond.empiricalProbability).toBe(0);
    expect(beyond.poissonProbability).toBeGreaterThan(0);
  });

  it('Poisson buckets plus the "> n" bucket sum to about 1', () => {
    const total = data.buckets.reduce((a, b) => a + b.poissonProbability, 0);
    expect(total).toBeCloseTo(1, 12);
  });
});

describe('buildRouletteCountChartData — interval partitioning and grouping', () => {
  const n = 200;
  const histogram = histogramFrom(n, [
    [95, 40], [100, 300], [105, 120], [60, 5], [140, 10], [185, 25],
  ]);
  const experiments = 40 + 300 + 120 + 5 + 10 + 25;
  const data = buildRouletteCountChartData({
    spins: n,
    experiments,
    countHistogram: histogram,
    probability: P_RED,
  });

  it('partitions 0..n without overlap or gaps', () => {
    const finite = data.buckets.filter((b) => !b.isPoissonBeyondN);
    let expectedNext = 0;
    for (const bucket of finite) {
      expect(bucket.low).toBe(expectedNext);
      expect(bucket.high).toBeGreaterThanOrEqual(bucket.low);
      expectedNext = bucket.high + 1;
    }
    expect(expectedNext).toBe(n + 1);
  });

  it('interval probabilities equal the sum over their actual integer ranges', () => {
    const binomial = binomialPmfArray(n, P_RED);
    for (const bucket of data.buckets) {
      if (bucket.isPoissonBeyondN) continue;
      let expectedBinomial = 0;
      let expectedEmpirical = 0;
      for (let k = bucket.low; k <= bucket.high; k += 1) {
        expectedBinomial += binomial[k];
        expectedEmpirical += histogram[k];
      }
      expect(bucket.binomialProbability).toBeCloseTo(expectedBinomial, 12);
      expect(bucket.empiricalProbability).toBeCloseTo(expectedEmpirical / experiments, 12);
    }
  });

  it('empirical probabilities sum to 1 and preserve every experiment', () => {
    const total = data.buckets.reduce((a, b) => a + b.empiricalProbability, 0);
    const count = data.buckets.reduce((a, b) => a + b.empiricalCount, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(count).toBe(experiments);
  });

  it('binomial probabilities sum to 1 within tolerance', () => {
    const total = data.buckets.reduce((a, b) => a + b.binomialProbability, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('retains observed extreme counts (60 and 185) inside some bucket', () => {
    const covers = (value) =>
      data.buckets.some((b) => !b.isPoissonBeyondN && value >= b.low && value <= b.high);
    expect(covers(60)).toBe(true);
    expect(covers(185)).toBe(true);
  });

  it('groups adjacent counts and reports it, without mutating inputs', () => {
    expect(data.grouped).toBe(true);
    const before = histogram.slice();
    buildRouletteCountChartData({
      spins: n, experiments, countHistogram: histogram, probability: P_RED,
    });
    expect(histogram).toEqual(before);
  });
});


describe('buildRouletteCountChartData — large n and rare events', () => {
  it('n = 5000 yields a bounded number of buckets with mass preserved', () => {
    const n = 5000;
    const histogram = histogramFrom(n, [[2432, 500]]);
    const data = buildRouletteCountChartData({
      spins: n, experiments: 500, countHistogram: histogram, probability: P_RED,
    });
    expect(data.buckets.length).toBeLessThanOrEqual(42);
    expect(data.buckets.reduce((a, b) => a + b.binomialProbability, 0)).toBeCloseTo(1, 6);
    expect(data.buckets.reduce((a, b) => a + b.empiricalProbability, 0)).toBeCloseTo(1, 12);
  });

  it('red-like probabilities produce Binomial-only data', () => {
    const n = 100;
    const histogram = histogramFrom(n, [[48, 500]]);
    const data = buildRouletteCountChartData({
      spins: n, experiments: 500, countHistogram: histogram, probability: P_RED,
    });
    expect(data.includePoisson).toBe(false);
    expect(data.buckets.some((b) => b.isPoissonBeyondN)).toBe(false);
    expect(data.buckets.every((b) => b.poissonProbability === 0)).toBe(true);
  });

  it('rare events include Poisson buckets that sum (with "> n") to about 1', () => {
    const n = 100;
    const histogram = histogramFrom(n, [[0, 400], [1, 90], [2, 10]]);
    const data = buildRouletteCountChartData({
      spins: n, experiments: 500, countHistogram: histogram,
      probability: P_GREEN, includePoisson: true,
    });
    const poissonTotal = data.buckets.reduce((a, b) => a + b.poissonProbability, 0);
    expect(poissonTotal).toBeCloseTo(1, 10);
    expect(data.buckets.some((b) => b.isPoissonBeyondN)).toBe(true);
  });

  it('Poisson bucket values match sums over the underlying truncated array', () => {
    const n = 50;
    const histogram = histogramFrom(n, [[0, 300], [1, 200]]);
    const data = buildRouletteCountChartData({
      spins: n, experiments: 500, countHistogram: histogram,
      probability: P_GREEN, includePoisson: true,
    });
    const poisson = poissonPmfArray(n * P_GREEN, n);
    for (const bucket of data.buckets) {
      if (bucket.isPoissonBeyondN) continue;
      let expected = 0;
      for (let k = bucket.low; k <= bucket.high; k += 1) expected += poisson[k];
      expect(bucket.poissonProbability).toBeCloseTo(expected, 12);
    }
  });
});

describe('buildRouletteCountChartData — validation', () => {
  const h = histogramFrom(1, [[0, 1]]);

  it('rejects invalid spins / experiments / probability / includePoisson', () => {
    expect(() =>
      buildRouletteCountChartData({ spins: -1, experiments: 1, countHistogram: [], probability: 0.5 }),
    ).toThrow();
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 0, countHistogram: h, probability: 0.5 }),
    ).toThrow();
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 1, countHistogram: h, probability: 1.5 }),
    ).toThrow();
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 1, countHistogram: h, probability: NaN }),
    ).toThrow();
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 1, countHistogram: h, probability: 0.5, includePoisson: 'yes' }),
    ).toThrow();
  });

  it('rejects malformed or miscounted histograms', () => {
    expect(() =>
      buildRouletteCountChartData({ spins: 2, experiments: 1, countHistogram: [0, 1], probability: 0.5 }),
    ).toThrow(); // wrong length
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 5, countHistogram: [1, 1], probability: 0.5 }),
    ).toThrow(); // sum != experiments
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 2, countHistogram: [1, -1], probability: 0.5 }),
    ).toThrow(); // negative entry
    expect(() =>
      buildRouletteCountChartData({ spins: 1, experiments: 2, countHistogram: 'x', probability: 0.5 }),
    ).toThrow(); // not an array
  });
});

