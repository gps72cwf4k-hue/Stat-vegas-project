# Two Dice

## Course topic
6. Multivariate distributions, joint / marginal PMFs, covariance, continuous density demo

## Goal
Exact joint distribution of two fair dice. Derive marginals, check independence, compute covariance of sum and maximum (or of the two faces). Optionally show a continuous uniform density on the unit square for contrast.

## Controls
- Number of experiments `N` (default 5000, range 200–20 000) for the empirical joint table / heat-map
- Optional seed
- Choice of pair of random variables: (X,Y) the two faces, or (S=X+Y, M=max(X,Y))

## Simulation
- Roll two independent fair dice N times.
- Build empirical joint frequency table (6×6).
- Compute empirical marginals, empirical covariance, empirical correlation.
- For the continuous demo: scatter of uniform points in [0,1]² (already covered partly by darts; keep a tiny extra panel or skip if budget tight).

## Theory
X, Y i.i.d. DiscreteUniform{1,2,3,4,5,6}.

Joint PMF:
\[
P(X=i,Y=j) = \frac{1}{36}, \quad i,j\in\{1,\dots,6\}
\]

Marginals: \( P(X=i)=1/6 \).

Independence: joint = product of marginals → yes.

Sum S = X+Y:
\[
P(S=k) = \frac{6-|k-7|}{36}, \quad k=2,\dots,12
\]

Max M = max(X,Y):
\[
P(M=m) = \frac{2m-1}{36}, \quad m=1,\dots,6
\]

Covariance:
\[
Cov(X,Y)=0 \quad \text{(independence)}
\]
\[
Cov(S,M) = E[SM] - E[S]E[M]
\]
(compute exactly; value is positive).

Continuous illustration: density f(x,y)=1 on [0,1]², marginals uniform, independent.

## Results panel
- 6×6 heat-map (SVG) of empirical joint frequencies vs theoretical 1/36
- Marginal bar charts
- Metric cards: empirical vs theoretical Cov, correlation
- Optional small continuous scatter
- Short summary (“the faces are independent, Cov=0; sum and max are dependent”)

## Theory card
- KaTeX joint, marginals, Cov formula
- Explicit check of independence
- Badge: Discrete uniform joint / Covariance

## Required math tests
- Joint PMF sums to 1, every entry 1/36
- Marginals sum to 1
- Cov(X,Y)=0 exactly
- Cov(S,M) matches a pre-computed exact fraction or high-precision float
- All probabilities in [0,1]

## Out of scope
- Loaded dice, more than two dice, continuous joint densities beyond a minimal demo, 3-D surface plots.