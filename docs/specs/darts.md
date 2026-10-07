# Geometric Darts

## Course topic
2. General probability space, continuous uniform density

## Goal
Illustrate geometric probability: probability that a uniformly random point inside a square lands inside an inscribed circle (or other simple region). Compare Monte-Carlo frequency with exact area ratio.

## Controls
- Number of throws `N` (default 2000, range 100–50 000)
- Optional seed
- Target shape fixed: unit square [0,1]² with inscribed circle of radius 0.5 centred at (0.5,0.5)

## Simulation
- Sample N independent points uniformly in the unit square.
- Count how many satisfy \((x-0.5)^2 + (y-0.5)^2 \le 0.5^2\).
- Empirical probability = count / N.

## Theory
Area of square = 1.  
Area of circle = \(\pi r^2 = \pi/4\).

\[
P = \frac{\pi}{4} \approx 0.7853981633974483
\]

Assumptions: continuous uniform density on the square; circle fully contained.

## Results panel
- Empirical hit rate
- Theoretical \(\pi/4\)
- Absolute difference
- Scatter plot (or simple SVG) of the last few hundred points coloured hit/miss + the circle outline
- Short summary

## Theory card
- KaTeX: \( P = \frac{\text{area}(C)}{\text{area}(S)} = \frac{\pi}{4} \)
- Uniform density \( f(x,y) = 1 \) on [0,1]²
- Badge: Continuous uniform / Geometric probability

## Required math tests
- Theoretical value equals Math.PI/4 within floating-point tolerance
- Probability stays in [0,1]
- Seeded points are deterministic

## Out of scope
- Buffon’s needle, rotating needles, non-circular targets, 3-D, physics of dart flight.