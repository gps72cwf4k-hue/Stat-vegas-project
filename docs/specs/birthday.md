# Birthday Paradox

## Course topic
1. Discrete probability space, combinatorics, independence (exact vs approximate)

## Goal
Show that the probability that at least two people share a birthday first exceeds 50 % at 23 people. Compare the simulation frequency with the exact formula, with an honest statement of the simulation's sampling error. Explain why the exact product works (multiplication rule for conditional probabilities, not independence of events) and where "approximate independence" actually enters (the exponential approximation).

Then test the model's key assumption, uniform birthdays, against **real birth-date statistics**: the exact probability under the real US distribution is computed (a generalised formula) and compared with the uniform model. The simulation can switch between three sources of birthdays.

The simulation **illustrates** the result; the **proof** is the counting argument and the exact formulas in the Theory section.

## Probability space
- Ω = \(\{1,\dots,d\}^n\): all sequences of n birthdays, where \(d=365\) in the uniform model and \(d=366\) (calendar dates including 29 February) for real data.
- Uniform model: \(|\Omega|=365^n\), all outcomes equally likely (birthdays independent and uniform, ignoring leap years and seasonal effects). "All distinct" is the set of injective sequences; their number is the falling factorial \(365\cdot364\cdots(365-n+1)=\dfrac{365!}{(365-n)!}\).
- General model: birthdays i.i.d. with probabilities \(p_1,\dots,p_d\) (\(\sum p_j=1\)); outcomes are no longer equally likely.

## Controls
- Number of people `n` (default 23, integer, range 2–100)
- Number of experiments `N` (default 2000, integer, range 100–20 000)
- Optional integer seed with a seedable PRNG (not `Math.random`). If empty, a random seed is generated and **displayed** so the run can be reproduced.
- **Birthday source** (switch):
  1. **Uniform, 365 days (theory)**: default
  2. **Real US births** (empirical distribution over 366 calendar dates); sub-choice of dataset: SSA 2000–2014 (default) or CDC/NCHS 1994–2003
  3. **Your own groups** (optional, advanced): the user pastes or uploads groups of real birth dates; no random sampling (see below)
- Input validation: reject non-integers and out-of-range values with a clear message.

## Data (for source 2)
- Source: FiveThirtyEight's published daily US birth counts (repository `fivethirtyeight/data`, folder `births`: https://github.com/fivethirtyeight/data/tree/master/births), license CC BY 4.0 (attribute the source in the UI).
  - `US_births_2000-2014_SSA.csv`: births per day, 2000–2014, provided by the Social Security Administration. 5 479 days, **62 187 024 births**.
  - `US_births_1994-2003_CDC_NCHS.csv`: births per day, 1994–2003, provided by the CDC's National Center for Health Statistics. 3 652 days, **39 722 137 births**.
  - The two series overlap in 2000–2003: use them **separately**, never summed.
- Bundled aggregate file `us-births-by-calendar-day.csv` (366 rows; columns `month, day, births_ssa_2000_2014, births_cdc_1994_2003`): total births for each calendar date summed over all years. The app ships this small file and does not need the network.
- Weights: \(p_j=\)(births on calendar date \(j\))/(total births), so \(\sum p_j=1\) over the 366 dates. 29 February is a legitimate category with a small weight (about a quarter of an average day: 0.246 of 1/366 in the SSA series).
- What the data show (relative to an average day, SSA): rarest are 29 Feb (0.25), 25 Dec (0.57), 1 Jan (0.68), 24 Dec (0.71), 4 Jul (0.78); the most frequent days are in mid-September (up to about 1.12). Holiday dips are commonly attributed to scheduled deliveries, which is a hypothesis, not something the data prove.
- Limits of the data (state in the UI): US births only; pooled over many years; other countries and eras differ; a random person from these cohorts, not a random group (see the "own groups" mode).

## Simulation
For each of the `N` experiments:
- Sample `n` independent birthdays:
  - **uniform source:** uniformly from 1…365 (unbiased integer generator; ignore leap years);
  - **real-data source:** from the 366 calendar dates with weights \(p_j\) (inverse-CDF with a cumulative array whose last value is exactly 1 and a binary search, or an alias table).
- Check whether any value appears at least twice (an occupancy array or a set).

Report the empirical probability \(\hat p\) of at least one shared birthday over `N` experiments.

### Source 3: your own groups (no simulation)
- Input: one group per line, birth dates of its members as `MM-DD` separated by commas or spaces (optional group label). Validate dates (`02-29` allowed, `02-30` rejected), ignore empty lines, flag groups of size 1, handle at most a few thousand groups.
- For each group \(g\) of size \(n_g\): shared birthday yes/no. Observed count \(O\) = number of groups with a shared birthday out of \(G\).
- Because group sizes differ, compare with the exact **expected count** \(E=\sum_g \pi_g\) where \(\pi_g=P(\text{shared}\mid n_g)\) is the exact probability for the chosen distribution (uniform or real), and the variance \(V=\sum_g\pi_g(1-\pi_g)\); z-score \((O-E)/\sqrt V\) (valid only when \(V\ge10\); otherwise show the exact Poisson-binomial tail or just \(O\) and \(E\)).
- Privacy: process locally in the browser, do not store or send the input; encourage public rosters (teams, class lists made public) rather than personal data of identifiable people.
- Caveats shown in the UI: real groups violate the model (age cohorts and cutoff dates in classes, relative-age effects in sport, twins, selection), and a small number of groups gives very wide intervals (for 50 groups of 23 the standard error of the share is about 0.07).

## Theory
### Exact probability, uniform model
\[
P(\text{all distinct}) = \frac{365!}{(365-n)!\cdot 365^n} = \prod_{k=1}^{n-1}\left(1-\frac{k}{365}\right)
\]
(the factor for \(k=0\) equals 1). The factorial form is only for display: \(365!\approx2.5\times10^{778}\) overflows a double, so the product form must be used in computation.
\[
P(\text{at least one shared}) = 1-P(\text{all distinct})
\]
For \(n=23\): \(P(\text{shared})=0.5072972\ldots\). For \(n=22\) it is 0.4756953…, so 23 is the **smallest** \(n\) with \(P\ge0.5\).

### Why the product is exact (multiplication rule, not independence)
Let \(A_k\) = "person \(k\)'s birthday differs from those of persons \(1,\dots,k-1\)". By the multiplication rule
\[
P(A_1\cap\cdots\cap A_n)=\prod_{k=1}^{n}P\big(A_k\mid A_1\cap\cdots\cap A_{k-1}\big)
\]
and given that the first \(k-1\) birthdays are distinct, \(k-1\) days are occupied, so \(P(A_k\mid\cdots)=1-\frac{k-1}{365}\) **exactly**. The factors are *conditional* probabilities; the events \(A_k\) themselves are **not** independent. Example: unconditionally \(P(A_k)=(364/365)^{k-1}\), and
\[
P(A_2\cap A_3)=\frac{364\cdot363}{365^2}\approx0.991796\ne P(A_2)P(A_3)=\Big(\frac{364}{365}\Big)^3\approx0.991804
\]
The product is exact because it uses conditional probabilities, and independence is only assumed for the **birthdays** (the modelling assumption).

### Exact probability for any birthday distribution
For i.i.d. birthdays with probabilities \(p_1,\dots,p_d\), the n people occupy n distinct days iff the draws form an ordered selection of n different days, so
\[
P(\text{all distinct})=n!\;e_n(p_1,\dots,p_d),\qquad e_n=\sum_{j_1<\cdots<j_n}p_{j_1}\cdots p_{j_n}
\]
where \(e_n\) is the elementary symmetric polynomial. For \(p_j=1/d\), \(e_n=\binom dn/d^n\) and this reduces to \(d^{\underline n}/d^n\), the formula above.

**Computation (dynamic programming, all n at once).** Let \(f_k=k!\,e_k\) over the days processed so far. Start with \(f_0=1\), \(f_k=0\) otherwise. For each day with probability \(p\), update **for \(k=n_{\max}\) down to 1**:
\[
f_k\leftarrow f_k+k\,p\,f_{k-1}
\]
After all \(d\) days, \(f_n=P(\text{all distinct})\) for every \(n\le n_{\max}\). Cost \(O(d\,n_{\max})\), about 37 000 operations for 366 days and \(n_{\max}=100\). All terms are non-negative, so there is no cancellation, and \(0\le f_k\le(\sum p)^k\le1\), so no overflow or underflow problems appear; the relative error stays \(O(d\,n\,\varepsilon)\). Compute \(P(\text{shared})=1-f_n\) and show \(f_n\) itself separately for large n (as in the uniform case).

Special case: \(P(\text{two people share})=\sum_j p_j^2\) (for \(n=2\)).

### Does non-uniformity matter?
- A known result: among all distributions on the **same** d days, the uniform one **minimises** the probability of a shared birthday (the probability of "all distinct" is Schur-concave in \(p\)). So non-uniformity can only increase \(P(\text{shared})\) at a fixed support. Comparing with the 365-day uniform model also changes the number of categories (366 with a very light leap day), so the fair comparisons are listed below.
- How big is the effect with real US data? Computed exactly with the DP above (SSA 2000–2014):

| Model | \(P(\text{shared})\), \(n=23\) |
|-------|------------------|
| Uniform, 365 days | 0.5072972 |
| Calendar-weighted (366 dates, 29 Feb with weight ¼ of an ordinary date) | 0.5068650 |
| Real US distribution (SSA 2000–2014) | **0.5079292** |
| Real US distribution (CDC/NCHS 1994–2003) | 0.5079012 |
| Uniform, 366 days (same support as real data) | 0.5063230 |

  Decomposition at \(n=23\): the leap day alone changes the probability by −0.00043, and the real weekly, seasonal and holiday pattern by +0.00106, a net change of +0.00063 relative to the 365-day model. Over \(n=2,\dots,100\) the largest gap between the real distribution and uniform-365 is +0.00066 (at \(n=27\)); against uniform-366 it is +0.0017 (also at \(n=27\)). Also \(\sum_j p_j^2=1.0019/365\) for SSA, so \(P(\text{two share})=0.0027449\) against \(1/365=0.0027397\).
- **Take-away for the UI:** real birthdays are visibly non-uniform, but the paradox is robust: 23 people are still the first group size above 50% (0.5079), and the effect of the non-uniformity is only about 0.06 percentage points.
- **Detectability:** the standard error of \(\hat p\) at \(n=23\) is \(\sqrt{p(1-p)/N}\approx0.011\) for \(N=2000\), about 17 times larger than the 0.00063 difference. To resolve a gap \(\Delta\) at 3 standard errors one needs \(N\approx9\,p(1-p)/\Delta^2\), about **5.6 million** experiments here, far above the UI limit of 20 000. So the exact DP shows the effect and the simulation cannot. State this explicitly: it is a lesson about sample size, and the simulation remains a check that the DP is implemented correctly (the simulation uses the same distribution).

### Where "approximate independence" enters
The \(\binom n2\) events \(E_{ij}\) = "persons \(i\) and \(j\) share a birthday" each have probability \(1/365\). They are **pairwise** independent but **not mutually** independent: \(P(E_{12}\cap E_{13})=1/365^2=P(E_{12})P(E_{13})\), but \(P(E_{12}\cap E_{13}\cap E_{23})=1/365^2\ne1/365^3\). Treating them as (almost) independent gives the exponential approximation
\[
P(\text{shared})\approx1-\exp\!\Big(-\frac{n(n-1)}{2\cdot365}\Big)
\]
Because \(1-x\le e^{-x}\), this is a **lower bound** on the exact uniform value for every \(n\). At \(n=23\) it gives 0.500002 against the exact 0.507297 (error ≈ 0.0073).

### Why 23 is small
The number of pairs grows quadratically: \(\binom{23}{2}=253\) pairs, each matching with probability \(1/365\), so the expected number of shared-birthday pairs is \(253/365\approx0.693\) (linearity of expectation, valid despite the dependence).

### A different question
"Someone shares a birthday with *me*" is a much rarer event: \(1-(364/365)^{n-1}\approx5.9\%\) for \(n=23\). Reaching 50% needs 253 other people. The paradox is about **any** pair.

### Assumptions
Uniform source: 365 days, independent uniform birthdays, no leap-year effect. Real-data source: independent birthdays drawn from the pooled US distribution (a random person, not a random group).

## Results panel
- Empirical probability \(\hat p\), with a 95% Wilson confidence interval
- Exact probability for the **selected source** (full precision stored; display with at least 6 significant digits), and, in real-data mode, also the uniform-365 value and the difference. Also show \(P(\text{all distinct})\) **computed directly** (not as \(1-P\)): for \(n=100\) it is \(3.07\times10^{-7}\) (uniform) or \(3.01\times10^{-7}\) (SSA), which a rounded "100%" would hide.
- Absolute difference \(|\hat p-p|\), the standard error \(\sqrt{p(1-p)/N}\) and the z-score \((\hat p-p)/\mathrm{SE}\)
- Validity rule: use the z-score only when \(Np\ge10\) and \(N(1-p)\ge10\). Otherwise (for example \(n=2\) with \(p\approx1/365\), where \(N=2000\) gives only about 5.5 expected hits, or large \(n\) where \(\hat p=1\)) show the exact Binomial probability of the observed count (or a more extreme one) instead.
- Real-data mode: a "detectability" card: gap \(\Delta\) between the real and uniform exact values at the current \(n\), its ratio to the standard error, and the \(N\) needed to detect it at 3 standard errors.
- Chart of exact \(P\) vs \(n\) for \(n=2,\dots,100\) for the selected source (same range as the control), a horizontal reference line at 0.5 with the first \(n\) above it marked, a marker at the current \(n\) and, optionally, the empirical point with its confidence interval and the exponential approximation curve. In real-data mode add the uniform-365 curve and a second small chart of the difference \(P_{\text{real}}(n)-P_{\text{uniform}}(n)\) for \(n=2,\dots,100\) (its maximum is about 0.00066 at \(n=27\)).
- Own-groups mode: \(G\), observed \(O\), expected \(E\), variance, z-score (when valid), and the share \(O/G\) with a Wilson interval
- Data card for the real-data source: dataset name, years, total births, license and link; the rarest and most frequent dates
- Short auto-generated summary

### Wording rules for the summary
- Do not say the simulation "proves" anything.
- State that results are random: the same seed reproduces the run, but one seed is one sample.
- Say "consistent with the exact value" only when \(|z|\le3\) (or when the exact Binomial check is not extreme).
- Say that \(n=23\) is the smallest group size where the probability exceeds 50% only when the current \(n\) is 23 (for real data, only if the DP agrees).
- Real-data mode: say that real birthdays are not uniform but that the effect on the probability is small (give the number), and that a simulation of 20 000 experiments cannot resolve it. Do not claim that real data "confirm" or "refute" the paradox.
- Own-groups mode: say that a small number of groups cannot confirm the model and that real groups violate its assumptions.

## Theory card
- KaTeX for the product formula, the factorial form and \(P(\text{shared})=1-P(\text{distinct})\)
- Explanation that the product comes from the multiplication rule with conditional probabilities; the events "person \(k\) avoids the earlier birthdays" are not independent (with the \(A_2,A_3\) numbers), yet the product is **exact**
- The general formula \(n!\,e_n(p)\) and the DP recurrence, with the uniform special case
- The uniform-minimises remark, the table of models, and the detectability argument
- The pairwise vs mutual independence remark and the exponential lower bound
- The 253-pairs intuition and the "me versus any pair" contrast
- Badge: Discrete uniform / Multiplication rule (conditional probability) / Empirical distribution

## Required math tests
Exact tests use rational arithmetic (BigInt numerator and denominator); float tests use tolerances.

**Uniform model**
1. \(P(n=2)=1/365\) exactly (rational: \(1-364/365\)); float value within 1e-15
2. Known values of \(P(\text{shared})\) (tolerance 1e-7): \(n=10\): 0.1169482; \(n=20\): 0.4114384; \(n=22\): 0.4756953; \(n=23\): 0.5072972; \(n=30\): 0.7063162; \(n=40\): 0.8912318; \(n=50\): 0.9703736; \(n=57\): 0.9901225; \(n=70\): 0.9991596
3. The smallest \(n\) with \(P(\text{shared})\ge0.5\) is 23
4. Numerical stability: the implementation never forms \(365!\); for \(n=100\) the float \(P(\text{distinct})\) agrees with the exact rational value (BigInt falling factorial over \(365^{100}\)) to a relative error below 1e-12, and is finite and positive (≈ \(3.07\times10^{-7}\)). Sequential multiplication of factors in (0,1], or a sum of `log1p(-k/365)` followed by `exp`, is acceptable. (Log-sum-exp is a different technique and not needed here.)
5. Generalisation to \(d\) days (internal parameter, not exposed in the UI): for \(d=6\), \(n=3\), enumeration of all 216 outcomes gives \(P(\text{distinct})=120/216=5/9\), equal to the product formula; for \(n>d\) the probability of a shared value is exactly 1 (pigeonhole)
6. \(P(\text{shared})\) is non-decreasing in \(n\) and \(\le1\); in fact strictly increasing for \(n=2,\dots,100\)
7. The exponential approximation is a lower bound for every \(n=2,\dots,100\), with value 0.500002 (tolerance 1e-6) at \(n=23\)
8. Dependence example: \(P(A_2\cap A_3)=364\cdot363/365^2\) differs from \(P(A_2)P(A_3)=(364/365)^3\) (exact rational comparison); pairwise independence of \(E_{12},E_{13}\) holds while \(E_{12},E_{13},E_{23}\) are not mutually independent (exact)
9. "Me versus any pair": \(1-(364/365)^{22}\approx0.0586\) for 23 people

**General distribution (DP)**
10. Brute-force check: for \(p=(1/2,1/4,1/8,1/8)\) and \(n=3\), enumeration of all \(4^3\) outcomes (exact rational) gives \(P(\text{distinct})=33/128=0.2578125\), equal to the DP result
11. The DP with \(p_j=1/365\) agrees with the product formula for all \(n\le100\) (tolerance 1e-12), and with \(d=6,n=3\) gives 5/9
12. DP properties: \(0\le f_n\le1\); \(f_n\) is non-increasing in \(n\); \(f_n=0\) for \(n\) larger than the number of days with positive probability; a point mass at one day gives \(f_n=0\) for \(n\ge2\); \(f_2=1-\sum p_j^2\)
13. Schur property on the same support: for the SSA and CDC distributions, \(P_{\text{real}}(n)\ge P_{\text{uniform-366}}(n)\) for every \(n=2,\dots,100\). (Comparison with the 365-day uniform model is **not** a theorem and is not tested as one.)

**Real data**
14. Bundled file: 366 rows; total births equal 62 187 024 (SSA column) and 39 722 137 (CDC column); weights sum to 1 within 1e-12; every weight positive; 29 February present
15. Reference values for the SSA distribution (tolerance 1e-7): \(n=2\): 0.0027449; \(n=10\): 0.1171530; \(n=22\): 0.4763101; \(n=23\): 0.5079292; \(n=30\): 0.7069576; \(n=50\): 0.9705501; \(n=70\): 0.9991691; \(P(\text{distinct},n=100)=3.0062\times10^{-7}\) (relative tolerance 1e-4). For the CDC distribution: \(n=23\): 0.5079012. The smallest \(n\) above 0.5 is 23 for both.
16. \(P(n=2)=\sum_j p_j^2=0.0027449\) (SSA), computed independently from the weights
17. Model comparison at \(n=23\): uniform-365 0.5072972, calendar-weighted 0.5068650, uniform-366 0.5063230, SSA 0.5079292 (tolerance 1e-7); the maximum of \(P_{\text{SSA}}-P_{\text{uniform-365}}\) over \(n=2,\dots,100\) is about 0.00066 at \(n=27\) (tolerance 1e-5)
18. Detectability formula: \(9p(1-p)/\Delta^2\) at \(n=23\) is about \(5.6\times10^{6}\) (within 2%)
19. Sampling: the cumulative array ends at exactly 1; in a large seeded sample (test run only, e.g. \(2\times10^6\) draws) each date's frequency is within 5 standard errors of \(p_j\), and the χ² goodness-of-fit statistic (365 degrees of freedom) is below its 99.9% quantile
20. Seeded Monte-Carlo regression (test run only, \(N=2\,000\,000\), \(n=23\), SSA weights): \(\hat p\) is within 4 standard errors of 0.5079292 (a reference run gave 0.5075 ± 0.0004)

**Simulation, display, groups**
21. Seeded Monte-Carlo regression tests (deterministic for a fixed seed; not proofs): at \(n=23\), \(N=20\,000\) the empirical probability is within 4 standard errors of the exact value for each source; the z-score rule is applied only when \(Np\ge10\) and \(N(1-p)\ge10\)
22. Wilson interval: contains \(\hat p\), lies in [0,1], and for \(\hat p=1\) has upper bound exactly 1 and a lower bound below 1
23. Own groups: the parser accepts valid dates including `02-29`, rejects `02-30`, `13-01` and malformed lines, ignores blank lines and flags groups of size 1; \(E=\sum\pi_g\) and \(V=\sum\pi_g(1-\pi_g)\) match a hand computation on a small example; for synthetic groups generated by the simulator (several hundred groups of mixed sizes, seeded) the z-score lies within \(\pm4\)
24. Switching the source does not change the other sources' results; the same seed gives identical results within each source; different seeds differ
25. Input validation rejects non-integer or out-of-range \(n\), \(N\)

## Out of scope
- Leap-year-specific modelling beyond the 29 February category, other countries' data, year-by-year or weekday-conditional distributions, more than 366 categories, pair-counting variants, matching a specific person's birthday as a simulation mode.
- Storing or transmitting personal data entered in the own-groups mode.

---

## Revision notes (changes from the previous version of this spec)
- Added a **birthday-source switch**: uniform (theory), real US births (SSA 2000–2014 or CDC/NCHS 1994–2003) and optional own groups, as recommended.
- Added the exact formula for any distribution (\(n!\,e_n(p)\)) with an \(O(d\,n)\) dynamic program that is numerically safe (non-negative terms, no overflow), the uniform formula as a special case, and \(P(\text{two share})=\sum p_j^2\).
- Computed with real data: \(P(23)=0.5079292\) (SSA) against 0.5072972 for uniform-365; the effect of non-uniformity is only about 0.0006, with decomposition (leap day −0.00043, real pattern +0.00106) and the largest gap 0.00066 at \(n=27\). The DP was checked by brute-force enumeration and by a 2-million-experiment simulation.
- Stated the important limitation: the simulation (at most 20 000 experiments, standard error about 0.011) cannot resolve such a small effect (about 5.6 million experiments would be needed), so the exact DP shows it and the simulation only checks the implementation. This is shown as a "detectability" card.
- Specified the dataset (source, license, bundled aggregate file with 366 rows, totals, handling of 29 February, data limits) and noted that the two series overlap and must not be summed.
- Specified the own-groups mode: input format, comparison via expected count \(\sum\pi_g\) and variance \(\sum\pi_g(1-\pi_g)\) because group sizes differ, privacy rules and caveats (real groups violate independence).
- Added the Schur-concavity statement (uniform minimises the probability on a fixed support) and a warning not to treat the 365-day comparison as a theorem.
- New tests: DP brute-force and uniform reductions, DP properties, reference values for the real distributions, bundled-data checks, sampling and seeded regression tests, own-group parsing, source switching.
- Previous corrections kept: exact product via the multiplication rule, the exponential lower bound, stability test, sampling error and validity rules, chart range 2–100.
