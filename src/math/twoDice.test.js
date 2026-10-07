import { describe, it, expect } from 'vitest';
import {
  FACE_COUNT,
  OUTCOME_COUNT,
  getJointPmfXY,
  getMarginalFromJoint,
  getMarginalX,
  getMarginalY,
  checkIndependenceXY,
  exactMomentsXY,
  pmfSumS,
  pmfMaxM,
  cdfMaxM,
  pmfMaxMFromCdf,
  momentsS,
  momentsM,
  getJointPmfSM,
  getSupportCellsSM,
  exactCovarianceSM,
  exactCorrelationSM,
  pmfDifferenceD,
  exactCovarianceSD,
  dependenceWitnessSD,
  continuousAreaProb,
  uniformDensityValue,
  fractionEquals,
  fractionToNumber,
} from './twoDice.js';

/* ------------------------------------------------------------------ *
 * Independent reference helpers (do not depend on the module under test).
 * All comparisons are exact via BigInt cross-multiplication.
 * ------------------------------------------------------------------ */

/**
 * Build a reference rational reduced to lowest terms, in the same shape as the
 * module fractions (`{ num, den }`) so `refEquals` compares directly.
 * @param {bigint} n Numerator.
 * @param {bigint} d Denominator.
 * @returns {{ num: bigint, den: bigint }} Reduced rational.
 */
function ref(n, d) {
  const sign = d < 0n ? -1n : 1n;
  let x = n < 0n ? -n : n;
  let y = d < 0n ? -d : d;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  const g = x || 1n;
  return { num: (sign * n) / g, den: (sign * d) / g };
}

/**
 * Exact equality of two rationals `{ num, den }` by cross-multiplication.
 * @param {{ num: bigint, den: bigint }} actual Module fraction.
 * @param {{ num: bigint, den: bigint }} expected Reference rational.
 * @returns {boolean} `true` iff equal.
 */
function refEquals(actual, expected) {
  return actual.num * expected.den === expected.num * actual.den;
}

/**
 * Exact sum of a list of module fractions.
 * @param {ReadonlyArray<{ num: bigint, den: bigint }>} fractions Fractions to add.
 * @returns {{ num: bigint, den: bigint }} Reduced exact sum.
 */
function refSum(fractions) {
  let acc = ref(0n, 1n);
  for (const f of fractions) {
    acc = ref(acc.num * f.den + f.num * acc.den, acc.den * f.den);
  }
  return acc;
}

/**
 * Enumerate the 36 ordered outcomes `(x, y) in {1..6}^2` exactly once and hand
 * each to a visitor. This is the ground truth for every discrete object.
 * @param {(x: number, y: number) => void} visit Visitor applied to each outcome.
 * @returns {void}
 */
function forEachOutcome(visit) {
  for (let x = 1; x <= FACE_COUNT; x += 1) {
    for (let y = 1; y <= FACE_COUNT; y += 1) {
      visit(x, y);
    }
  }
}


describe('module constants', () => {
  it('describes two fair dice with 36 ordered outcomes', () => {
    expect(FACE_COUNT).toBe(6);
    expect(OUTCOME_COUNT).toBe(36);
  });
});

describe('(1) joint PMF of (X, Y)', () => {
  it('is a 6x6 table with 36 entries, each exactly 1/36', () => {
    const joint = getJointPmfXY();
    expect(joint).toHaveLength(6);
    let entryCount = 0;
    for (const row of joint) {
      expect(row).toHaveLength(6);
      for (const cell of row) {
        expect(refEquals(cell, ref(1n, 36n))).toBe(true);
        entryCount += 1;
      }
    }
    expect(entryCount).toBe(36);
  });

  it('is frozen (shared immutable structure)', () => {
    const joint = getJointPmfXY();
    expect(Object.isFrozen(joint)).toBe(true);
    expect(Object.isFrozen(joint[0])).toBe(true);
  });

  it('sums to exactly 1', () => {
    const total = refSum(getJointPmfXY().flat());
    expect(refEquals(total, ref(1n, 1n))).toBe(true);
  });
});

describe('(2) marginals from the joint table', () => {
  it('marginal X is 1/6 for every face and sums to exactly 1', () => {
    const margX = getMarginalX();
    expect(margX).toHaveLength(6);
    for (const p of margX) {
      expect(refEquals(p, ref(1n, 6n))).toBe(true);
    }
    expect(refEquals(refSum(margX), ref(1n, 1n))).toBe(true);
  });

  it('marginal Y is 1/6 for every face and sums to exactly 1', () => {
    const margY = getMarginalY();
    expect(margY).toHaveLength(6);
    for (const p of margY) {
      expect(refEquals(p, ref(1n, 6n))).toBe(true);
    }
    expect(refEquals(refSum(margY), ref(1n, 1n))).toBe(true);
  });

  it('getMarginalFromJoint matches enumeration for both axes', () => {
    const joint = getJointPmfXY();
    const countsX = new Array(FACE_COUNT).fill(0n);
    const countsY = new Array(FACE_COUNT).fill(0n);
    forEachOutcome((x, y) => {
      countsX[x - 1] += 1n;
      countsY[y - 1] += 1n;
    });
    const marginalX = getMarginalFromJoint(joint, 0);
    for (let i = 0; i < FACE_COUNT; i += 1) {
      expect(refEquals(marginalX[i], ref(countsX[i], 36n))).toBe(true);
    }
    const marginalY = getMarginalFromJoint(joint, 1);
    for (let j = 0; j < FACE_COUNT; j += 1) {
      expect(refEquals(marginalY[j], ref(countsY[j], 36n))).toBe(true);
    }
  });

  it('rejects an invalid axis', () => {
    expect(() => getMarginalFromJoint(getJointPmfXY(), 2)).toThrow(RangeError);
  });
});

describe('(3) independence of (X, Y)', () => {
  it('joint(i,j) equals margX(i) * margY(j) for all 36 cells (exact)', () => {
    const joint = getJointPmfXY();
    const margX = getMarginalX();
    const margY = getMarginalY();
    for (let i = 0; i < FACE_COUNT; i += 1) {
      for (let j = 0; j < FACE_COUNT; j += 1) {
        const product = ref(margX[i].num * margY[j].num, margX[i].den * margY[j].den);
        expect(refEquals(joint[i][j], product)).toBe(true);
      }
    }
  });

  it('checkIndependenceXY confirms independence on the fair joint', () => {
    const result = checkIndependenceXY(getJointPmfXY());
    expect(result.independent).toBe(true);
    expect(result.firstMismatch).toBeNull();
  });

  it('checkIndependenceXY detects dependence (diagnostics point at a cell)', () => {
    const joint = getJointPmfXY().map((row) => [...row]);
    joint[0][0] = ref(2n, 36n); // Perturb one cell to break the product structure.
    const result = checkIndependenceXY(joint);
    expect(result.independent).toBe(false);
    expect(result.firstMismatch).not.toBeNull();
    expect(typeof result.firstMismatch.i).toBe('number');
    expect(typeof result.firstMismatch.j).toBe('number');
  });
});

describe('(4) moments and covariance of (X, Y)', () => {
  it('E[X] = E[Y] = 7/2 exactly', () => {
    const m = exactMomentsXY();
    expect(refEquals(m.eX, ref(7n, 2n))).toBe(true);
    expect(refEquals(m.eY, ref(7n, 2n))).toBe(true);
  });

  it('Var(X) = Var(Y) = 35/12 exactly', () => {
    const m = exactMomentsXY();
    expect(refEquals(m.varX, ref(35n, 12n))).toBe(true);
    expect(refEquals(m.varY, ref(35n, 12n))).toBe(true);
  });

  it('E[XY] = 49/4 and equals E[X] E[Y]', () => {
    const m = exactMomentsXY();
    expect(refEquals(m.eXY, ref(49n, 4n))).toBe(true);
    expect(refEquals(m.eXY, ref(m.eX.num * m.eY.num, m.eX.den * m.eY.den))).toBe(true);
  });

  it('Cov(X, Y) = 0 and Corr(X, Y) = 0 exactly', () => {
    const m = exactMomentsXY();
    expect(refEquals(m.covXY, ref(0n, 1n))).toBe(true);
    expect(refEquals(m.corrXY, ref(0n, 1n))).toBe(true);
    expect(m.covXYValue).toBe(0);
    expect(m.corrXYValue).toBe(0);
  });

  it('moments computed from the joint table match direct enumeration', () => {
    let sumX = 0n;
    let sumX2 = 0n;
    let sumXY = 0n;
    forEachOutcome((x, y) => {
      sumX += BigInt(x);
      sumX2 += BigInt(x) * BigInt(x);
      sumXY += BigInt(x) * BigInt(y);
    });
    const m = exactMomentsXY();
    expect(refEquals(m.eX, ref(sumX, 36n))).toBe(true);
    const eX2 = ref(sumX2, 36n);
    const varDirect = ref(
      eX2.num * m.eX.den * m.eX.den - m.eX.num * m.eX.num * eX2.den,
      eX2.den * m.eX.den * m.eX.den,
    );
    expect(refEquals(m.varX, varDirect)).toBe(true);
    expect(refEquals(m.eXY, ref(sumXY, 36n))).toBe(true);
  });

describe('(5) sum S and max M distributions', () => {
  it('pmfSumS matches the closed form and enumeration for k = 2..12', () => {
    const pmf = pmfSumS();
    expect(pmf).toHaveLength(11);
    const counts = new Array(11).fill(0n);
    forEachOutcome((x, y) => {
      counts[x + y - 2] += 1n;
    });
    for (let index = 0; index < 11; index += 1) {
      const k = index + 2;
      const weight = FACE_COUNT - Math.abs(k - 7);
      expect(refEquals(pmf[index], ref(BigInt(weight), 36n))).toBe(true);
      expect(refEquals(pmf[index], ref(counts[index], 36n))).toBe(true);
    }
    expect(refEquals(refSum(pmf), ref(1n, 1n))).toBe(true);
  });

  it('pmfMaxM matches the closed form (2m-1)/36 and enumeration for m = 1..6', () => {
    const pmf = pmfMaxM();
    expect(pmf).toHaveLength(6);
    const counts = new Array(6).fill(0n);
    forEachOutcome((x, y) => {
      counts[Math.max(x, y) - 1] += 1n;
    });
    for (let index = 0; index < 6; index += 1) {
      const m = index + 1;
      expect(refEquals(pmf[index], ref(BigInt(2 * m - 1), 36n))).toBe(true);
      expect(refEquals(pmf[index], ref(counts[index], 36n))).toBe(true);
    }
    expect(refEquals(refSum(pmf), ref(1n, 1n))).toBe(true);
  });

  it('CDF form of M is m^2/36 and its differences reproduce pmfMaxM', () => {
    const cdf = cdfMaxM();
    for (let index = 0; index < 6; index += 1) {
      const m = index + 1;
      expect(refEquals(cdf[index], ref(BigInt(m * m), 36n))).toBe(true);
    }
    for (let index = 1; index < 6; index += 1) {
      const diff = cdf[index].num * cdf[index - 1].den - cdf[index - 1].num * cdf[index].den;
      expect(diff >= 0n).toBe(true);
    }
    expect(refEquals(cdf[5], ref(1n, 1n))).toBe(true);

    const fromCdf = pmfMaxMFromCdf();
    const pmf = pmfMaxM();
    for (let index = 0; index < 6; index += 1) {
      expect(refEquals(fromCdf[index], pmf[index])).toBe(true);
    }
  });

  it('sum moments: E[S] = 7, Var(S) = 35/6 exactly', () => {
    const m = momentsS();
    expect(refEquals(m.eS, ref(7n, 1n))).toBe(true);
    expect(refEquals(m.varS, ref(35n, 6n))).toBe(true);
  });

  it('max moments: E[M] = 161/36, E[M^2] = 791/36, Var(M) = 2555/1296 exactly', () => {
    const m = momentsM();
    expect(refEquals(m.eM, ref(161n, 36n))).toBe(true);
    expect(refEquals(m.eM2, ref(791n, 36n))).toBe(true);
    expect(refEquals(m.varM, ref(2555n, 1296n))).toBe(true);

    // Cross-check from the PMF by independent direct summation.
    const pmf = pmfMaxM();
    let eM = ref(0n, 1n);
    let eM2 = ref(0n, 1n);
    for (let index = 0; index < 6; index += 1) {
      const m2 = BigInt(index + 1);
      eM = ref(eM.num * pmf[index].den + pmf[index].num * m2 * eM.den, eM.den * pmf[index].den);
      eM2 = ref(eM2.num * pmf[index].den + pmf[index].num * m2 * m2 * eM2.den, eM2.den * pmf[index].den);
    }
    expect(refEquals(m.eM, eM)).toBe(true);
    expect(refEquals(m.eM2, eM2)).toBe(true);
  });
});

describe('(6) joint PMF of (S, M)', () => {
  it('is an 11x6 table matching the piecewise formula', () => {
    const joint = getJointPmfSM();
    expect(joint).toHaveLength(11);
    for (const row of joint) {
      expect(row).toHaveLength(6);
    }
    for (let rowIndex = 0; rowIndex < 11; rowIndex += 1) {
      const s = rowIndex + 2;
      for (let columnIndex = 0; columnIndex < 6; columnIndex += 1) {
        const m = columnIndex + 1;
        const cell = joint[rowIndex][columnIndex];
        if (s < m + 1 || s > 2 * m) {
          expect(refEquals(cell, ref(0n, 1n))).toBe(true);
        } else if (s === 2 * m) {
          expect(refEquals(cell, ref(1n, 36n))).toBe(true);
        } else {
          expect(refEquals(cell, ref(2n, 36n))).toBe(true);
        }
      }
    }
  });

  it('sums to exactly 1', () => {
    expect(refEquals(refSum(getJointPmfSM().flat()), ref(1n, 1n))).toBe(true);
  });

  it('has exactly 21 nonzero cells', () => {
    const joint = getJointPmfSM();
    let nonzero = 0;
    for (const row of joint) {
      for (const cell of row) {
        if (cell.num !== 0n) nonzero += 1;
      }
    }
    expect(nonzero).toBe(21);

    const support = getSupportCellsSM();
    expect(support).toHaveLength(21);
    expect(Object.isFrozen(support)).toBe(true);
    for (const cell of support) {
      expect(joint[cell.s - 2][cell.m - 1].num !== 0n).toBe(true);
      expect(refEquals(joint[cell.s - 2][cell.m - 1], cell.prob)).toBe(true);
    }
  });

  it('matches full enumeration of the 36 outcomes', () => {
    const joint = getJointPmfSM();
    const counts = Array.from({ length: 11 }, () => new Array(6).fill(0n));
    forEachOutcome((x, y) => {
      counts[x + y - 2][Math.max(x, y) - 1] += 1n;
    });
    for (let rowIndex = 0; rowIndex < 11; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < 6; columnIndex += 1) {
        expect(refEquals(joint[rowIndex][columnIndex], ref(counts[rowIndex][columnIndex], 36n))).toBe(true);
      }
    }
  });

  it('marginals reproduce pmfSumS and pmfMaxM', () => {
    const joint = getJointPmfSM();
    const margS = getMarginalFromJoint(joint, 0);
    const margM = getMarginalFromJoint(joint, 1);
    const pmfS = pmfSumS();
    const pmfM = pmfMaxM();
    for (let i = 0; i < 11; i += 1) {
      expect(refEquals(margS[i], pmfS[i])).toBe(true);
    }
    for (let j = 0; j < 6; j += 1) {
      expect(refEquals(margM[j], pmfM[j])).toBe(true);
    }
  });
});


describe('(7) dependence and covariance of (S, M)', () => {
  it('Cov(S, M) = 35/12 exactly, computed from the (S, M) joint', () => {
    const { covSM } = exactCovarianceSM();
    expect(refEquals(covSM, ref(35n, 12n))).toBe(true);

    // Independent recomputation: E[SM] - E[S]E[M] straight from enumeration.
    let sumSM = 0n;
    forEachOutcome((x, y) => {
      sumSM += BigInt(x + y) * BigInt(Math.max(x, y));
    });
    const eSM = ref(sumSM, 36n);
    const eS = ref(7n, 1n);
    const eM = ref(161n, 36n);
    const cov = ref(eSM.num * eS.den * eM.den - eS.num * eM.num * eSM.den, eSM.den * eS.den * eM.den);
    expect(refEquals(covSM, cov)).toBe(true);
  });

  it('matches the Var(S)/2 identity exactly', () => {
    const { covSM } = exactCovarianceSM();
    const { varS } = momentsS();
    const half = ref(varS.num, varS.den * 2n);
    expect(refEquals(covSM, half)).toBe(true);
  });

  it('matches 2 * Cov(X, M) = 2 * (35/24) = 35/12 exactly', () => {
    let sumXM = 0n;
    let sumX = 0n;
    let sumM = 0n;
    forEachOutcome((x, y) => {
      sumX += BigInt(x);
      sumM += BigInt(Math.max(x, y));
      sumXM += BigInt(x) * BigInt(Math.max(x, y));
    });
    const eX = ref(sumX, 36n);
    const eM = ref(sumM, 36n);
    const eXM = ref(sumXM, 36n);
    const covXM = ref(eXM.num * eX.den * eM.den - eX.num * eM.num * eXM.den, eXM.den * eX.den * eM.den);
    expect(refEquals(covXM, ref(35n, 24n))).toBe(true);

    const twice = ref(covXM.num * 2n, covXM.den);
    const { covSM } = exactCovarianceSM();
    expect(refEquals(covSM, twice)).toBe(true);
  });

  it('covariance is strictly positive (sum and max are dependent)', () => {
    expect(exactCovarianceSM().covSMValue).toBeGreaterThan(0);
  });
});

describe('(8) correlation of (S, M)', () => {
  it('rho(S, M)^2 = 54/73 exactly', () => {
    expect(refEquals(exactCorrelationSM().rhoSquared, ref(54n, 73n))).toBe(true);
  });

  it('matches cov^2 / (varS * varM) computed independently', () => {
    const { covSM } = exactCovarianceSM();
    const { varS } = momentsS();
    const { varM } = momentsM();
    const numerator = ref(covSM.num * covSM.num, covSM.den * covSM.den);
    const denominator = ref(varS.num * varM.num, varS.den * varM.den);
    const rho2 = ref(numerator.num * denominator.den, numerator.den * denominator.num);
    expect(refEquals(exactCorrelationSM().rhoSquared, rho2)).toBe(true);
  });

  it('rho = +sqrt(54/73) with the correct float value and sign', () => {
    const { rhoValue, rhoSquaredValue } = exactCorrelationSM();
    expect(rhoValue).toBeCloseTo(Math.sqrt(54 / 73), 12);
    expect(rhoValue).toBeCloseTo(rhoSquaredValue ** 0.5, 12);
    expect(rhoValue).toBeGreaterThan(0);
    expect(rhoValue).toBeLessThan(1);
  });
});


describe('(9) dependence checks: differences and witnesses', () => {
  it('P(S = 2, M = 6) = 0 != 11/1296 = P(S = 2) P(M = 6)', () => {
    // S = 2 forces X = Y = 1, so M = 6 is impossible.
    const product = ref(1n * 11n, 36n * 36n);
    expect(refEquals(product, ref(11n, 1296n))).toBe(true);
    expect(product.num).not.toBe(0n);
  });

  it('pmfDifferenceD matches (6 - |k|)/36 for k = -5..5 and sums to 1', () => {
    const pmf = pmfDifferenceD();
    expect(pmf).toHaveLength(11);
    const counts = new Array(11).fill(0n);
    forEachOutcome((x, y) => {
      counts[x - y + 5] += 1n;
    });
    for (let index = 0; index < 11; index += 1) {
      const k = index - 5;
      expect(refEquals(pmf[index], ref(BigInt(FACE_COUNT - Math.abs(k)), 36n))).toBe(true);
      expect(refEquals(pmf[index], ref(counts[index], 36n))).toBe(true);
    }
    expect(refEquals(refSum(pmf), ref(1n, 1n))).toBe(true);
    expect(refEquals(pmf[8], ref(3n, 36n))).toBe(true); // P(D = 3) = 3/36.
  });

  it('Cov(S, D) = 0 exactly', () => {
    expect(refEquals(exactCovarianceSD().covSD, ref(0n, 1n))).toBe(true);
  });

  it('dependence witness: P(S = 2, D = 3) = 0 != 3/1296, so uncorrelated != independent', () => {
    const witness = dependenceWitnessSD();
    expect(refEquals(witness.jointProb, ref(0n, 1n))).toBe(true);
    expect(refEquals(witness.productProb, ref(3n, 1296n))).toBe(true);
    expect(witness.dependent).toBe(true);
    expect(witness.jointProbValue).toBe(0);
    expect(fractionEquals(witness.jointProb, witness.productProb)).toBe(false);
  });
});

describe('(10) sanity: probabilities in [0, 1]', () => {
  it('holds for every discrete object exposed by the module', () => {
    const all = [
      ...getJointPmfXY().flat(),
      ...getMarginalX(),
      ...getMarginalY(),
      ...pmfSumS(),
      ...pmfMaxM(),
      ...cdfMaxM(),
      ...getJointPmfSM().flat(),
      ...pmfDifferenceD(),
    ];
    for (const p of all) {
      const value = fractionToNumber(p);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('continuous unit-square helpers', () => {
  it('continuousAreaProb(a, b) = a * b for endpoints and interior', () => {
    expect(continuousAreaProb(0, 0)).toBe(0);
    expect(continuousAreaProb(1, 1)).toBe(1);
    expect(continuousAreaProb(0.5, 0.5)).toBeCloseTo(0.25, 12);
    expect(continuousAreaProb(0.2, 0.7)).toBeCloseTo(0.14, 12);
  });

  it('continuousAreaProb rejects out-of-range and non-number inputs', () => {
    expect(() => continuousAreaProb(-0.1, 0.5)).toThrow(RangeError);
    expect(() => continuousAreaProb(0.5, 1.1)).toThrow(RangeError);
    expect(() => continuousAreaProb(0.5, Number.NaN)).toThrow(RangeError);
    expect(() => continuousAreaProb(Infinity, 0.5)).toThrow(RangeError);
    expect(() => continuousAreaProb('0.5', 0.5)).toThrow(TypeError);
  });

  it('uniformDensityValue() returns the constant density 1 (not a probability mass)', () => {
    expect(uniformDensityValue()).toBe(1);
  });
});

describe('fraction helper utilities', () => {
  it('fractionEquals is exact and fractionToNumber is a float mirror', () => {
    expect(fractionEquals(ref(1n, 2n), ref(2n, 4n))).toBe(true);
    expect(fractionEquals(ref(1n, 3n), ref(1n, 2n))).toBe(false);
    expect(fractionToNumber(ref(35n, 12n))).toBeCloseTo(35 / 12, 12);
  });
});

});
