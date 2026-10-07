# Roulette & Rare Jackpot

## Course topic
3. Independence, Bernoulli scheme, Poisson approximation

## Goal
1. Single-spin Bernoulli (red / not red).  
2. Number of reds in n spins → Binomial.  
3. Waiting time until first green (or rare jackpot) → Geometric.  
4. Rare-event count (e.g. number of zeros in many spins) → Poisson approximation.

European wheel only: 37 pockets (0–36), 18 red, 18 black, 1 green (0).

## Controls
- Number of spins `n` (default 100, range 1–5000)
- Number of independent experiments `N` (default 500, range 50–5000) for frequency-of-frequencies
- Target event: “red”, “black”, “green/zero”, or “straight-up jackpot”. “straight-up” means one specified pocket (`jackpotPocket`, default 0, integer 0–36); with `jackpotPocket = 0` it coincides with “green/zero”. There is no separate jackpot lottery. Black and red each have p = 18/37; green p = 1/37; straight-up p = 1/37. Red and black counts use Binomial(n, 18/37) and are NOT rare events (the Poisson approximation is reserved for green and straight-up).
- Optional seed

## Simulation
- Each spin independent, outcome uniform on {0,1,…,36}.
- Colour map: use the standard European colour table: 0 is green, the 18 specified red pockets are red, and the remaining 18 nonzero pockets are black. Do not infer colour from parity or numerical alternation. The exact lookup lives in `src/math/roulette.js`.
- Record:
  - Frequency of red in one long run of n spins (or across N experiments)
  - Number of greens / zeros
  - Waiting time until first green (geometric)
  - For rare jackpot: count of hits in n spins, compare with Poisson(λ = n/37)

### Waiting-time and censoring policy
- Every experiment contains exactly `n` spins; each is observed over that full window.
- The waiting time is the first success of the chosen event within the window.
- An experiment with no success within `n` spins is recorded as right-censored at `n` (i.e. `T > n`): it is kept, not discarded, and it is NOT recorded as a hit at `n` and NOT spun indefinitely.
- Histogram normalization uses ALL `N` experiments: `firstHitHistogram[k] / N` compares with Geometric `P(T = k)`, and the censored fraction `censoredCount / N` compares with `P(T > n)`. The histogram is never divided by the observed-success count.
- The restricted waiting mean is the empirical mean of `min(T, n)`; its theoretical comparison is `E[min(T, n)] = (1 - (1-p)^n) / p`. It is NOT the full geometric mean `E[T] = 1/p`.
- UI bounds are unchanged (n in 1–5000, N in 50–5000).
- Rare-count comparison uses `countHistogram[k] / N` against Poisson(λ = n/37).

### Browser execution (bounded, progress, cancellation)
- The synchronous engine result is reproduced exactly by a bounded asynchronous runner (`runRouletteSimulationAsync`) for the same inputs and seed: one RNG per run, preserved draw order, shared aggregation (async and sync results are identical).
- Work is processed in chunks: at most `max(1, floor(50000 / spins))` experiments per chunk, yielding to the event loop between chunks so the browser can render. Each experiment stays atomic (at most 5000 spins); the whole run is never a single blocking timer.
- Progress is reported as `{ completedExperiments, totalExperiments }` with initial and final updates always emitted and intermediate updates throttled (roughly 50 per run).
- Cancellation via an `AbortSignal` is checked before work, between experiments, after each yield and before publishing. A cancelled run throws an identifiable `AbortError` and never publishes partial aggregates; the last successful result is retained.
- UI bounds are 1–5000 spins and 50–5000 experiments (the engine also accepts N=1 for tests).

## Theory
- Single spin red: \( p = 18/37 \approx 0.486486 \)
- Green / zero: \( p = 1/37 \approx 0.027027 \)
- Number of reds in n independent spins: \( X \sim \operatorname{Binomial}(n, 18/37) \)
- Number of blacks in n independent spins: \( X \sim \operatorname{Binomial}(n, 18/37) \); black is not a rare event, so no Poisson approximation applies.
- Waiting time until first green: \( T \sim \operatorname{Geometric}(p=1/37) \) (number of trials until first success, support 1,2,…)
  \[
  P(T=k) = (1-p)^{k-1}p, \quad E[T]=1/p=37
  \]
- Rare count: \( Y =\) number of zeros in n spins \(\approx \operatorname{Poisson}(\lambda = n/37)\) when n large and p small.
- Optional compact exponential approximation for continuous waiting time: rate \(\lambda = 1/37\).

## Results panel
- Empirical vs theoretical for the chosen quantity
- Absolute difference
- Histogram of the empirical distribution (red count or waiting times) overlaid with theoretical PMF (Binomial or Geometric or Poisson)
- Coloured outcome chips (red / black / green) for a small sample of spins
- Short summary

### Count-distribution chart (discrete interval grouping)
- The chart compares the empirical event-count distribution with the exact Binomial(n, p) and, for green/straight-up only, the Poisson(n·p) approximation.
- Values plotted are discrete per-bucket probability masses (never densities): a bucket's value is the total mass of its inclusive integer range, not an average or a midpoint PMF.
- A central display window is chosen from Binomial cumulative mass, leaving at most ~1e-6 theoretical mass in each excluded tail, then expanded to include every count with nonzero empirical frequency; it is partitioned into at most ~40 contiguous integer buckets with explicit inclusive lower/upper bounds.
- Any remaining portion of 0..n outside the window is kept as a clearly labeled tail bucket ("≤a" or "≥b") that sums its actual empirical and theoretical mass; buckets form a complete nonoverlapping partition of 0..n.
- For rare-event charts (green/straight-up) a final explicit "> n" bucket carries the Poisson probability beyond n; Binomial and empirical mass there is 0; the truncated Poisson array is never normalized. This bucket is omitted for red/black.

### Waiting-time view (same stored run)
- The Event-count and Waiting-time views are two presentations of the SAME stored run; switching between them is presentation-only and never reruns the engine or consumes randomness. Shared run metadata, the stale warning and outcome chips are visible in both.
- The waiting-time chart compares the empirical first-hit distribution with the exact Geometric(p) law (T = one-based spin of the first event; support 1,2,…) and always includes a SEPARATE censored category "T > n" for experiments with no hit within the observation window n. A hit at spin n and no hit within n are different outcomes; the censored category is never merged with the observed spin n.
- Observed buckets form a complete nonoverlapping partition of 1..n (visible window grouped into at most ~40 contiguous buckets, plus an observed tail h+1..n when h<n); the censored category follows separately. Values are discrete per-bucket masses (no midpoint sampling, averaging, renormalization or discarded mass); the denominator is always all N experiments.
- Two distinct means are shown: the restricted (censored) mean of min(T, n), empirically `(Σ k·firstHitHistogram[k] + n·censoredCount)/N` and theoretically `E[min(T,n)] = (1−(1−p)^n)/p`; and the FULL Geometric mean `E[T] = 1/p`, labeled separately. The restricted mean is not the full waiting time.

## Theory card
- KaTeX for Binomial PMF, Geometric PMF, Poisson PMF
- Independence assumption stated
- Badges: Bernoulli / Binomial / Geometric / Poisson (according to the active view)

## Required math tests
- p_red = 18/37, p_green = 1/37 exactly
- Binomial PMF sums to 1 within 1e-12 for n≤100
- Geometric mean = 1/p
- Poisson(λ) probabilities non-negative and sum ≈1
- Colour lookup is deterministic and covers all 0–36

## Out of scope
- American double-zero wheel, fancy bets (dozens, splits), spinning-wheel animation, en-prison rule, continuous-time exponential beyond a tiny demo.
