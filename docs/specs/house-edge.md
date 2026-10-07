# The House Edge (v2)

## Course topic
5. Random variables, PMF/CDF, expectation, variance, distribution families

## Goal
Show, by theory and by simulation, that a simple casino game has negative expected value for the player. Simulate many independent plays, estimate the mean and variance of profit per play, compare them with the exact E and Var, and illustrate the normal approximation for the total profit after many plays, including its limits.

The simulation **illustrates** the result; the **proof** is the calculation in the Theory section.

## Game (simple, fixed)
European roulette (single zero, 37 pockets, **no** *en prison* / *La Partage* rule: a zero loses the full bet). The player bets 1 unit on "red", which pays 1:1.
- Win (+1) with p = 18/37
- Lose (−1) with q = 19/37 (18 black + the zero)

Single-play profit W:
\[
W = \begin{cases}
+1 & \text{with probability } 18/37 \\
-1 & \text{with probability } 19/37
\end{cases}
\]

Terminology: the **house edge** is the casino's expected gain per unit bet, \(H = +1/37 \approx 2.7027\%\). The player's expected profit per unit bet is \(E[W] = -H = -1/37\).

## Controls
- Number of independent plays per session `n` (default 1000, integer, range 10–20 000)
- Number of Monte-Carlo repetitions of the whole session `N` (default 300, integer, range 50–2000), used for the distribution of total profit
- Optional integer seed. A seedable PRNG (e.g. mulberry32 or PCG) is used, not `Math.random`. If no seed is given, a random one is generated and **displayed**, so every run can be reproduced.
- Input validation: reject non-integers and out-of-range values with a clear message.

## Simulation
Terminology: a *session* is n plays; T is the total profit of one session.

1. **Visible session (session 1).** Generate n independent outcomes \(w_1,\dots,w_n\) of W.
   - Empirical mean: \(\bar w = \frac1n\sum w_i = T_1/n\)
   - Empirical variance (unbiased, divisor n − 1): \(s^2 = \frac{1}{n-1}\sum (w_i-\bar w)^2\)
   - Because \(w_i^2 = 1\), this simplifies to \(s^2 = \frac{n}{n-1}\,(1-\bar w^{\,2})\). The empirical variance of W is therefore almost deterministic, and the comparison with \(1368/1369\) mainly reflects \(\bar w^{\,2}\), which is small. Mention this in the UI: the variance comparison is much less informative than the mean comparison.
   - Standard error of the mean: \(\mathrm{SE}=\sigma_W/\sqrt n\), where \(\sigma_W=\sqrt{1368/1369}\). Show the z-score \((\bar w - E[W])/\mathrm{SE}\).
2. **N sessions.** Repeat the whole n-play session N times (session 1 is the first of them) to obtain \(T_1,\dots,T_N\).
   - Sample mean \(\bar T\) and sample variance \(s_T^2\) (divisor N − 1), compared with \(-n/37\) and \(n\,\mathrm{Var}(W)\).
   - Fraction of sessions with \(T>0\), compared with the exact \(P(T>0)\).
3. **Implementation.** Explicit simulation uses typed arrays and chunking (up to 20 000 × 2000 = 40 M draws; run it in a Web Worker or yield to the UI). Optional "fast mode" for the N sessions: draw \(X\sim\mathrm{Bin}(n,18/37)\) directly and set \(T=2X-n\). Label this mode in the UI, since it no longer simulates individual plays.

## Theory
\[
E[W] = 1\cdot\frac{18}{37} + (-1)\cdot\frac{19}{37} = -\frac{1}{37} \approx -0.027027
\]

\[
Var(W) = E[W^2] - (E[W])^2 = 1 - \left(\frac{1}{37}\right)^2 = \frac{1368}{1369} \approx 0.99927
\]

Total profit after n independent plays:
\[
E[T] = n\,E[W] = -\frac{n}{37}, \qquad Var(T) = n\,Var(W) = \frac{1368\,n}{1369}
\]

### Distribution families
- **W is a two-point distribution on {−1, +1}**, an affine image of a Bernoulli variable: \(W = 2B-1\), \(B\sim\mathrm{Bernoulli}(18/37)\). W itself is *not* Bernoulli (that takes values 0/1).
- **Number of wins** \(X\sim\mathrm{Binomial}(n,\,18/37)\), and \(T = 2X - n\).
- Consistency check: \(E[T]=2n\cdot\frac{18}{37}-n=-\frac n{37}\) and \(Var(T)=4npq=\frac{1368\,n}{1369}\).
- **Lattice:** T takes only values \(t\equiv n \pmod 2\) in \(\{-n,-n+2,\dots,n\}\), so the support has **step 2**.

### Normal approximation
\(T \approx \mathcal N(\mu,\sigma^2)\), with \(\mu=-n/37\), \(\sigma^2=\frac{1368\,n}{1369}\).

Assumptions: the \(W_i\) are i.i.d. with finite variance, so the classical Lindeberg–Lévy CLT applies. (The Lindeberg condition is only needed for non-identically distributed summands.)

Quality of the approximation: by Berry–Esseen, the Kolmogorov distance between the CDF of the standardized T and \(\Phi\) is at most \(C\,\rho/(\sigma_W^3\sqrt n)\), with \(\rho=E|W-E[W]|^3\approx 1\) and \(C\le 0.4748\). This is roughly \(0.475/\sqrt n\), about 0.15 for n = 10 and 0.015 for n = 1000. It is an **upper bound**, not the actual error. Show it next to the observed distance.

**Continuity correction for the lattice (step 2):**
- Probability of one lattice point: \(P(T=t)\approx\Phi\!\big(\tfrac{t+1-\mu}{\sigma}\big)-\Phi\!\big(\tfrac{t-1-\mu}{\sigma}\big)\)
- CDF: \(P(T\le t)\approx\Phi\!\big(\tfrac{t+1-\mu}{\sigma}\big)\)
- Correction is **±1**, not the usual ±0.5, because adjacent values differ by 2.

### Dependence on n (for the theory card)
- **Law of large numbers:** \(\bar w_n\to E[W]=-1/37\) in probability (and almost surely). Its standard error \(\sigma_W/\sqrt n\) decreases with n.
- Convergence is **not monotone along a single run**: a larger n does not guarantee a smaller \(|\bar w_n - E[W]|\) in a given run; it only makes large deviations less *probable*.
- The spread of the **total** profit grows like \(\sqrt n\), but the expected loss grows like \(n\). So \(P(T>0)\to 0\) as n grows (≈ 0.19 at n = 1000, where \(\mu\approx-27.0\), \(\sigma\approx31.6\)). Long play makes the house edge *more* visible in the total, not less.
- Exact value: \(P(T>0)=P\big(X\ge\lfloor n/2\rfloor+1\big)\) from the binomial CDF. Normal approximation: \(1-\Phi\!\big(\tfrac{t_0-1-\mu}{\sigma}\big)\), where \(t_0\) is the smallest positive lattice value (2 for even n, 1 for odd n).

## Results panel
- Empirical mean of W (session 1) vs theoretical \(E[W]\), with SE and z-score
- Empirical variance of W vs theoretical \(Var(W)\) (with the note that it is nearly \(1-\bar w^{\,2}\))
- Sample mean and variance of T over N sessions vs \(-n/37\) and \(n\,Var(W)\)
- **Histogram of T** with bins of width **2** centred on the lattice values (edges at \(t\pm1\)), shown as relative frequency per bin. Overlay either the normal bin probabilities from the continuity-corrected formula above, or the density \(\varphi((t-\mu)/\sigma)/\sigma\) with the histogram normalised as a density. Optional toggle: exact Binomial PMF markers.
- **CDF plot:** empirical CDF of T vs normal CDF (continuity-corrected) vs exact binomial CDF; also the two-step CDF of single W
- PMF of single W (two bars) and PMF of X ~ Binomial(n, 18/37)
- Metric cards:
  - House edge: **+1/37 ≈ 2.7027 %**
  - Player EV per unit bet: **−1/37 ≈ −0.027027**
  - Expected session profit \(-n/37\) and session standard deviation \(\sigma\)
  - Observed profit \(T_1\) of the visible session
  - \(P(T>0)\): exact, normal approximation, empirical share of the N sessions
  - Berry–Esseen bound vs observed Kolmogorov distance
- Short auto-generated summary (see wording rules below)

## Theory card
- KaTeX for \(E[W]\), \(Var(W)\), \(E[T]\), \(Var(T)\), the normal approximation and the continuity correction
- Badges: **Two-point (affine Bernoulli)** for single W / **Binomial** for wins X / **Normal** for total T
- The "Dependence on n" bullets above, in particular the statement that larger n does **not** guarantee a smaller deviation in a single run, while the SE shrinks as \(1/\sqrt n\) and \(P(T>0)\to 0\)

### Wording rules for the summary
- Do not say the simulation "proves" anything.
- State that results are random; with a fixed seed they are reproducible, but a single seed is one sample.
- Flag when n is small (say n < 100) that the normal approximation is visibly rough.

## Required math tests
Exact tests use rational arithmetic (`Fraction` or BigInt pairs); float tests use tolerances.
1. \(E[W] = -1/37\) **exactly** (rational arithmetic); float value within 1e-12 of −0.027027027…
2. \(Var(W) = 1-(1/37)^2 = 1368/1369\) exactly
3. PMF of W is non-negative and sums to exactly 1 (rational)
4. Binomial PMF is non-negative and sums to 1 (tolerance 1e-12) for several n, including 10, 1000 and 20 000
5. \(E[T]\) and \(Var(T)\) computed from the Binomial PMF via \(T=2X-n\) equal \(-n/37\) and \(1368n/1369\)
6. Normal density integrates to 1 (numerical tolerance); \(\Phi(0)=0.5\), \(\Phi(1.96)\approx0.975\); the continuity-corrected normal probabilities over the lattice sum to ≈ 1
7. Kolmogorov distance between the exact binomial CDF of T and the continuity-corrected normal CDF is below the Berry–Esseen bound for several n
8. \(P(T>0)\) at n = 1000 is ≈ 0.19 (tolerance 0.01), exact binomial value
9. Seeded regression tests (deterministic for a fixed seed): the empirical mean lies within \(4\sigma_W/\sqrt n\) of \(-1/37\); the sample variance of T over N sessions lies within a stated tolerance of \(n\,Var(W)\). These are regression tests, not proofs of correctness.
10. Same seed gives identical results; different seeds give different results
11. Input validation rejects out-of-range and non-integer n, N

## Out of scope
- Multiple bet types, progressive betting systems (Martingale etc.), Kelly criterion, real-money claims, complicated pay-tables
- American (double-zero) roulette and *en prison* / *La Partage* rules (these change the edge, e.g. to 1/74 with *La Partage*)

---

## Revision notes (v1 → v2)
- Continuity correction changed from the implied ±0.5 to ±1 and bins set to width 2, because T lives on a step-2 lattice.
- The "larger n does not guarantee…" statement rewritten to separate LLN convergence (SE ∝ 1/√n) from non-monotone behaviour in a single run; added the √n vs n argument and \(P(T>0)\to0\).
- W relabelled as a two-point (affine Bernoulli) variable.
- CLT assumptions corrected to Lindeberg–Lévy (i.i.d.); Berry–Esseen bound added.
- House edge sign fixed: +1/37 for the casino, −1/37 for the player's EV.
- Estimators defined (visible session vs N sessions, divisor n − 1); noted that the variance of W is nearly determined by the mean.
- CDF views added (course topic), table rules stated, seeding and validation specified.
- Test list made exact/tolerance-aware and extended.
