# Loaded Die

## Course topic
4. Total probability, Bayes' formula

## Goal
Given a die that is either fair or loaded, observe rolls and update the posterior probability that the die is loaded (Bayes). Also illustrate the law of total probability for the predictive probability of the next face, and show that the rolls are independent only *given* the die type, not unconditionally.

The simulation **illustrates** the result; the **proof** is the calculation in the Theory section.

## Notation
- \(H_L\) = "the die is loaded", \(H_F\) = "the die is fair". (Not \(F\) and \(L\) as face variables.)
- \(X\) = a single face, \(X\in\{1,\dots,6\}\).
- \(\theta = P(H_L)\), the prior probability of a loaded die. (Not \(\pi\), to avoid confusion with 3.14159.)
- \(b = P(X=6\mid H_L)\), the bias of the loaded die.
- \(D\) = the observed data.

## Setup
Two possible dice:
- Fair: \(P(X=k\mid H_F)=1/6\) for \(k=1,\dots,6\)
- Loaded: \(P(X=6\mid H_L)=b\) and \(P(X=k\mid H_L)=(1-b)/5\) for \(k=1,\dots,5\). Default \(b=0.5\), so each of 1–5 has probability 0.1. Both rows sum to 1.

Prior: \(P(H_L)=\theta\), \(P(H_F)=1-\theta\) (default \(\theta=0.5\), controllable).

Parameter range: \(b\in(1/6,\,1]\). At \(b=1/6\) the dice are identical and the data carry no information (BF = 1, posterior = prior); this case is covered by tests but not offered in the UI. At \(b=1\) the loaded die always shows 6, so one non-six rules it out; show a note in the UI when this happens.

## Controls
- Prior \(\theta\) (default 0.5; UI range 0.01–0.99; the underlying functions must also handle \(\theta=0\) and \(\theta=1\))
- Bias \(b\) of the loaded die (default 0.5; UI range 0.20–1.00, step 0.05)
- Mode (two separate modes):
  - **Manual data:** number of rolls \(m\) (default 10) and number of sixes \(k\) (default 5). Validate integers and \(0\le k\le m\), \(1\le m\le 5000\).
  - **Simulate:** \(m\) rolls (same range); the true die type and the data are generated at random.
- Number of Monte-Carlo experiments \(M\) (default 500, range 50–5000, keep light)
- Optional integer seed, with a seedable PRNG (not `Math.random`). If empty, a random seed is generated and **displayed** so the run can be reproduced.

## Simulation
1. **Manual mode:** use the entered \((m,k)\); no randomness is needed for the posterior.
2. **Simulate mode, one experiment:**
   1. Draw the true type of the die from Bernoulli(\(\theta\)).
   2. Roll the chosen die \(m\) times (explicit faces).
   3. Count the sixes \(k\), compute the posterior \(P(H_L\mid D)\), then *reveal* the true type.
3. **Repeated experiments:** repeat step 2 \(M\) times, each with an independent type and independent rolls (experiment 1 is the one shown in the results panel). Record \(k\) and the posterior in each.
4. **Computation (numerically stable, in log-odds):**
\[
\operatorname{logit}P(H_L\mid D)=\operatorname{logit}\theta + k\ln(6b) + (m-k)\ln\frac{6(1-b)}{5}
\]
then posterior \(=\sigma(\text{log-odds})\) with a stable sigmoid (for \(x\ge0\) use \(1/(1+e^{-x})\), otherwise \(e^{x}/(1+e^{x})\)). Special cases handled **before** taking logs: \(\theta\in\{0,1\}\), and \(b=1\) with \(m-k>0\) (BF = 0). Binomial probabilities are computed via log-gamma or a stable recursion, never via \(3^k\) directly: for large \(k\) (say 1000) \(3^k\approx10^{477}\) overflows a double.

## Theory
### Bayes and total probability
\[
P(H_L\mid D) = \frac{P(D\mid H_L)\,P(H_L)}{P(D)},\qquad
P(D) = P(D\mid H_L)\,\theta + P(D\mid H_F)\,(1-\theta)
\]
The denominator is the law of total probability over the partition \(\{H_L,H_F\}\).

### Likelihoods (sampling distributions)
For \(k\) sixes in \(m\) rolls:
\[
P(D\mid H_L)=\binom{m}{k}b^{k}(1-b)^{m-k},\qquad
P(D\mid H_F)=\binom{m}{k}\Big(\tfrac16\Big)^{k}\Big(\tfrac56\Big)^{m-k}
\]
For fixed \(H\), each is a valid PMF in \(k\) (sums to 1 over \(k=0,\dots,m\)). As a function of \(H\) it is *not* a PMF, which is why it is called a likelihood there.

### Bayes factor
The binomial coefficient cancels, so the posterior depends on the data only through
\[
\mathrm{BF}=\frac{P(D\mid H_L)}{P(D\mid H_F)}=(6b)^{k}\Big(\frac{6(1-b)}{5}\Big)^{m-k},\qquad
\text{posterior odds}=\frac{\theta}{1-\theta}\cdot\mathrm{BF}
\]
For \(b=0.5\): \(\mathrm{BF}=3^{k}\cdot0.6^{\,m-k}\), so each six multiplies the odds by 3 and each non-six by 0.6. Show BF (and \(\log_{10}\mathrm{BF}\)) as a measure of evidence that does not depend on \(\theta\).

**When does the posterior rise?** For \(0<\theta<1\) it rises iff \(\mathrm{BF}>1\), i.e. iff \(k/m>c/(a+c)\), with \(a=\ln(6b)\), \(c=\ln\frac{5}{6(1-b)}\). For \(b=0.5\) this is \(k/m>\ln(5/3)/\ln 5\approx31.7\%\). Example: 0 sixes in 10 rolls gives \(\mathrm{BF}=0.6^{10}\approx0.006\) and the posterior falls from 50% to about 0.60%.

### Sufficiency of the count of sixes
Counting sixes is enough only because, conditional on "not a six", both dice are uniform over 1–5. For another statistic (for instance the count of threes) or for a loaded die with unequal non-six faces, use the full likelihood \(\prod_i P(x_i\mid H)\) (face counts \(n_1,\dots,n_6\); the multinomial coefficient cancels). That extension is out of scope for the UI; the design note exists so nobody generalises the count-of-sixes formula by mistake.

### Predictive probability of the next face (law of total probability)
\[
P(X_{m+1}=j\mid D)=P(X=j\mid H_L)\,P(H_L\mid D)+P(X=j\mid H_F)\,\big(1-P(H_L\mid D)\big)
\]
In particular \(P(X_{m+1}=6\mid D)=b\,p+\tfrac16(1-p)\), with \(p=P(H_L\mid D)\); it is a convex combination, so it lies between \(1/6\) and \(b\). Before any data, replace \(p\) by \(\theta\).

Worked example (\(\theta=0.5\), \(b=0.5\)): before any roll \(P(6)=1/3\). After one six the posterior is \(3/4\), and \(P(\text{next}=6)=0.5\cdot\tfrac34+\tfrac16\cdot\tfrac14=5/12\).

### Rolls are independent only given the die type
Unconditionally the rolls are positively dependent:
\[
P(6,6)-P(6)^2=\theta(1-\theta)\big(b-\tfrac16\big)^2>0\quad(0<\theta<1,\ b\ne\tfrac16)
\]
Example: \(P(6,6)=0.5\cdot0.25+0.5/36\approx0.1389>(1/3)^2\approx0.1111\). Seeing a six makes a loaded die more likely, which makes another six more likely. Put this in the theory card.

### Assumptions and interpretation
- Rolls are independent **given** the die type; there are exactly two hypotheses.
- The posterior is a degree of belief **conditional on the model**. In the simulation it also becomes a long-run frequency, because the die type is drawn from the prior: this is what the calibration check shows.

### Distribution of the posterior across experiments
With \(K\) the number of sixes, \(P(K=k)=\theta\,\mathrm{Bin}(m,b)(k)+(1-\theta)\,\mathrm{Bin}(m,\tfrac16)(k)\), and the posterior is a function \(\mathrm{post}(k)\) of \(K\). Two exact identities, used both for display and for tests:
- **Law of total expectation:** \(E[\mathrm{post}(K)]=\sum_k P(K=k)\,\mathrm{post}(k)=\theta\). (Each term equals \(\theta\,\mathrm{Bin}(m,b)(k)\).)
- **Calibration:** \(P(H_L\mid K=k)=\mathrm{post}(k)\), so among experiments with posterior near \(p\), about a share \(p\) of the dice really are loaded.

The histogram of posteriors is a mixture: truly fair dice cluster toward 0, truly loaded dice toward 1 (for large \(m\); small \(m\) leaves much in the middle).

## Results panel
- Prior vs posterior probability that the die is loaded (two bars or metric cards)
- **Change = posterior − prior, in percentage points** (signed, may be negative)
- Bayes factor, prior odds and posterior odds
- Predictive probability that the next roll is a six: before vs after the data; optional bars for all six faces (prior-predictive vs posterior-predictive)
- PMFs of the two dice (small chart)
- In Simulate mode: revealed true type of experiment 1
- Histogram of posteriors across the \(M\) experiments, split by true type (loaded / fair), with the exact distribution of \(\mathrm{post}(K)\) overlaid
- Checks across the \(M\) experiments:
  - mean posterior vs \(\theta\) (standard error \(\le0.5/\sqrt M\))
  - calibration table: 10 equal-width posterior bins, observed share of loaded dice vs mean posterior in the bin; grey out bins with fewer than 20 experiments
- Short auto-generated summary

### Wording rules for the summary
- Choose the verb from the sign of the change: "rose", "fell" or "did not change", never "rose" by default. Template: "After seeing \(k\) sixes in \(m\) rolls, the posterior probability of a loaded die [rose/fell/did not change] from …% to …%."
- State that results are random in Simulate mode: the same seed reproduces the run, but one seed is one sample.
- State that the posterior is conditional on the two-hypothesis model.
- Do not say the simulation "proves" anything.

## Theory card
- KaTeX for Bayes' formula, total probability for \(P(D)\), both likelihoods, the Bayes factor, and the predictive formula
- Clear definition of the two sampling distributions (fair row, loaded row)
- The statement that rolls are independent only given the die type, with the \(P(6,6)\) example
- Badges: **Bayes** / **Total probability**

## Required math tests
Exact tests use rational arithmetic (`Fraction`, with \(b=1/2\) or other rationals); float tests use tolerances.
1. Both dice rows are valid PMFs: non-negative and sum to exactly 1
2. Sampling distributions \(P(D\mid H)\): for each \(H\) the Binomial PMF over \(k\) is non-negative and sums to 1 (tolerance 1e-12 for \(m=10\); 1e-9 for \(m=5000\))
3. Exact posterior values at \(\theta=0.5\), \(b=0.5\):

| m | k | posterior |
|---|---|---|
| 1 | 1 | 3/4 exactly |
| 6 | 3 | 5.832/6.832 ≈ 0.8536 |
| 10 | 5 | 18.896/19.896 ≈ 0.9497 |
| 10 | 0 | 0.6¹⁰/(1+0.6¹⁰) ≈ 0.0060 |

4. Posterior in [0,1] for a grid of \((\theta,b,m,k)\), and **strictly increasing in \(k\)** and **increasing in \(\theta\)** when \(b>1/6\) and \(0<\theta<1\)
5. Degenerate dice: at \(b=1/6\) the posterior equals \(\theta\) for every \(k\)
6. Impossible data: with \(b=1\) and \(0<\theta<1\), any non-six gives posterior exactly 0 (the denominator is \((1-\theta)P(D\mid H_F)>0\), so no division by zero). Impossibility under the *fair* hypothesis cannot occur, so a posterior of exactly 1 arises only at \(\theta=1\) or by floating-point saturation at extreme log-odds
7. Prior endpoints, at function level:
   - \(\theta=0\): posterior is 0 for all data
   - \(\theta=1\), \(b<1\): posterior is 1
   - \(\theta=1\), \(b=1\), data containing a non-six: \(P(D)=0\) and Bayes gives 0/0. The function must return an explicit "undefined" (error or NaN with a clear message), **not** 0 or 1. With \(k=m\) the posterior is 1.
8. Numerical stability: \(m=5000\) with \(k=0\), \(k=1667\), \(k=5000\) never gives NaN or Infinity (results saturate to 0 or 1 correctly); \(k=1000\) of \(m=1000\) works
9. Predictive: the face PMF sums to 1; \(P(\text{next}=6)\in[1/6,b]\); equals 1/3 before data and 5/12 after one six (\(\theta=0.5\), \(b=0.5\))
10. Dependence identity: \(P(6,6)-P(6)^2=\theta(1-\theta)(b-1/6)^2\) exactly (rational), and \(P(6,6)=0.5\cdot0.25+0.5/36\) at the defaults
11. Total expectation: \(\sum_k P(K=k)\,\mathrm{post}(k)=\theta\) exactly (rational, small \(m\)) and within 1e-9 (float, \(m=1000\))
12. Sufficiency: the posterior from the full sequence of faces equals the posterior from the count of sixes; sequential roll-by-roll updating (each posterior used as the next prior) gives the same result as the batch update, in any order of the rolls
13. Seeded Monte-Carlo regression tests (deterministic for a fixed seed; not proofs): mean posterior within \(4\cdot0.5/\sqrt M\) of \(\theta\); for a large test run (e.g. \(M=200\,000\)) the observed share of loaded dice for each \(k\) with at least 200 experiments lies within 4 standard errors of \(\mathrm{post}(k)\)
14. Same seed gives identical results; different seeds differ
15. Input validation rejects non-integer or out-of-range \(m\), \(k\), \(M\), and \(k>m\)
16. Summary wording: 0 sixes in 10 rolls produces "fell"; 5 in 10 produces "rose"; \(b=1/6\) produces "did not change"

## Out of scope
- More than two die types, continuous parameters (estimating \(b\) from data), sequential online updating UI beyond a single batch (sequential updating appears only as a function-level test), 3-D die models
- General face-count (multinomial) inputs in the UI; the count of sixes is the only observed statistic

---

## Revision notes (v1 → v2)
- Added the missing law-of-total-probability part for the predictive probability of the next face, with a worked example and tests.
- Added the point that rolls are independent only given the die type, with the closed form \(\theta(1-\theta)(b-1/6)^2\).
- Defined the parameter range \(b\in(1/6,1]\); the "impossible data" test now has a meaning (\(b=1\)), and a posterior of exactly 1 is explained.
- Fixed the \(\theta=1\) edge case: 0/0 when \(b=1\) and the data contain a non-six, so the function must report "undefined".
- Summary wording now chooses rose/fell/unchanged, with the threshold \(k/m>c/(a+c)\) (31.7% at \(b=0.5\)).
- Separated Manual and Simulate modes; specified ranges for \(m\), \(k\), \(M\), \(b\).
- Explained why the count of sixes is sufficient and when it is not.
- Specified log-odds computation to avoid overflow; added tests for large \(m\).
- Added exact checks for the distribution of posteriors (total expectation \(=\theta\), calibration) and a Monte-Carlo tolerance.
- Notation: \(\pi\) renamed \(\theta\), "F/L" faces replaced by \(X\) and events \(H_F,H_L\); "likelihoods are valid PMFs" replaced by "sampling distributions \(P(D\mid H)\)"; "absolute change" replaced by the signed change in percentage points; Bayes factor added.
- Replaced the trivial "posterior in [0,1]" test with concrete values and monotonicity properties; added sequential-vs-batch consistency.
