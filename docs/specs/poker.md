# Poker

## Course topic
1. Set theory, event algebra, discrete probability space, combinatorics

## Goal
Exact probabilities of the standard 5-card poker hands via combinations. Monte-Carlo simulation of dealing many 5-card hands and comparison of empirical frequencies with the combinatorial counts, with an honest treatment of the very rare hands (for most settings a royal flush will simply not appear in the simulation, and that is not a discrepancy).

The simulation **illustrates** the result; the **proof** is the counting in the Theory section, and the exhaustive enumeration in the tests.

## Probability space
- Ω = all unordered 5-card subsets of a standard 52-card deck (13 ranks × 4 suits); \(|\Omega|=\binom{52}{5}=2\,598\,960\).
- All hands are equally likely (classical / discrete uniform probability). The ordered-deal model gives the same probabilities: \(52\cdot51\cdot50\cdot49\cdot48=311\,875\,200=120\cdot\binom{52}{5}\), so every unordered hand corresponds to exactly 120 ordered deals.
- The ten hand categories are **mutually exclusive events whose union is Ω** (a partition), so their probabilities sum to 1. This requires the exact definitions below.

### Category definitions (each hand falls into exactly one)
Ranks: 2,…,10, J, Q, K, A. A *straight* is five consecutive ranks, where the ace counts as high (10-J-Q-K-A) **or** low (A-2-3-4-5). There is no wrap-around (Q-K-A-2-3 is not a straight). There are 10 rank sequences.

| # | Category | Definition |
|---|----------|------------|
| 1 | Royal Flush | 10-J-Q-K-A, all one suit |
| 2 | Straight Flush | straight, all one suit, **excluding** the royal flush |
| 3 | Four of a Kind | four cards of one rank |
| 4 | Full House | three of one rank and two of another |
| 5 | Flush | all one suit, **excluding** straight flushes and royal flushes |
| 6 | Straight | straight, **not** all one suit |
| 7 | Three of a Kind | exactly three of one rank, other two ranks different from it and from each other |
| 8 | Two Pair | two ranks appear twice each, fifth card of a third rank |
| 9 | One Pair | exactly one rank appears twice, other three cards of three different ranks |
| 10 | High Card | none of the above (five distinct ranks, not a straight, not a flush) |

Assumptions: well-shuffled fair deck; the initial five-card deal of 5-card stud / draw (no discarding or redrawing, no community cards); standard ranking.

## Controls
- Number of hands to deal `N` (default 10 000, integer, range 500–100 000)
- Optional integer seed with a seedable PRNG (not `Math.random`). If empty, a random seed is generated and **displayed** so the run can be reproduced.
- Optional focus on a single hand type (or show all)
- Optional button "Verify by exhaustive enumeration" (classifies all 2 598 960 hands in a Web Worker and shows the exact counts; takes about a second or two)
- Input validation: reject non-integers and out-of-range values with a clear message.

## Simulation
- Use a standard 52-card deck.
- Deal N hands. Each hand is dealt from a **fresh, full deck**, so the N hands are independent. (Hands taken from one deck would not be independent.) Use a partial Fisher–Yates shuffle (5 swaps with uniform unbiased indices) or direct uniform sampling of 5 distinct cards.
- Classify each hand into one of the 10 categories using the definitions above.
- Report the counts \(O_i\) and empirical relative frequencies \(O_i/N\).
- The vector of counts is Multinomial(\(N, p_1,\dots,p_{10}\)); each single count is Binomial(\(N,p_i\)).

## Theory
Total hands: \( \binom{52}{5} = 2\,598\,960 \).

Exact counts (standard):

| Hand            | Combinations | Probability          | Decimal | Approx. odds |
|-----------------|--------------|----------------------|---------|--------------|
| Royal Flush     | 4            | 4 / 2 598 960        | 0.000154 % | 1 in 649 740 |
| Straight Flush (excl. royal) | 36 | 36 / 2 598 960 | 0.00139 % | 1 in 72 193 |
| Four of a Kind  | 624          | 624 / 2 598 960      | 0.0240 % | 1 in 4 165 |
| Full House      | 3 744        | 3 744 / 2 598 960    | 0.144 % | 1 in 694 |
| Flush (excl. straight/royal flush) | 5 108 | 5 108 / 2 598 960 | 0.197 % | 1 in 509 |
| Straight (excl. straight/royal flush) | 10 200 | 10 200 / 2 598 960 | 0.392 % | 1 in 255 |
| Three of a Kind | 54 912       | 54 912 / 2 598 960   | 2.113 % | 1 in 47.3 |
| Two Pair        | 123 552      | 123 552 / 2 598 960  | 4.754 % | 1 in 21.0 |
| One Pair        | 1 098 240    | 1 098 240 / 2 598 960| 42.257 % | 1 in 2.37 |
| High Card       | 1 302 540    | 1 302 540 / 2 598 960| 50.118 % | 1 in 2.00 |

The counts sum **exactly** to 2 598 960, so the probabilities sum to 1.

### Counting derivations (for the theory card and the tests)
- Royal flush: 4 (one per suit).
- Straight flush (excl. royal): \(4\cdot10-4=36\) (10 straights per suit, minus the royal).
- Four of a kind: \(13\cdot48=624\) (rank, then any of the 48 other cards).
- Full house: \(13\binom43\cdot12\binom42=13\cdot4\cdot12\cdot6=3744\).
- Flush (excl. SF): \(4\Big[\binom{13}{5}-10\Big]=4\cdot1277=5108\).
- Straight (excl. SF): \(10\,(4^5-4)=10\cdot1020=10\,200\) (each rank sequence, suits free, minus the 4 single-suit choices).
- Three of a kind: \(13\binom43\binom{12}{2}4^2=13\cdot4\cdot66\cdot16=54\,912\).
- Two pair: \(\binom{13}{2}\binom42^2\cdot44=78\cdot36\cdot44=123\,552\).
- One pair: \(13\binom42\binom{12}{3}4^3=13\cdot6\cdot220\cdot64=1\,098\,240\).
- High card: \(\Big[\binom{13}{5}-10\Big](4^5-4)=1277\cdot1020=1\,302\,540\).

### Event algebra example
The event "all five ranks are distinct" has \(\binom{13}{5}4^5=1287\cdot1024=1\,317\,888\) hands (probability ≈ 0.50708). It is the disjoint union of High Card, Straight, Flush, Straight Flush and Royal Flush: \(1\,302\,540+10\,200+5\,108+36+4=1\,317\,888\). Its complement ("some rank repeats") is the union of the other five categories, with \(2\,598\,960-1\,317\,888=1\,281\,072\) hands.

### Comparing simulation with theory: what to expect
Expected counts for \(N=10\,000\): royal flush 0.015, straight flush 0.14, four of a kind 2.4, full house 14.4, flush 19.7, straight 39.2, three of a kind 211, two pair 475, one pair 4226, high card 5012. So with the default \(N\) the royal flush and straight flush will almost always show a count of 0 (probability of at least one royal flush in 10 000 hands ≈ 1.5%), and the four of a kind count is a small integer with large relative noise. Even at \(N=100\,000\) the expected number of royal flushes is only about 0.15.

Consequences for the display:
- An observed frequency of 0 for a rare hand is the **expected** outcome, not an error.
- Absolute differences are dominated by the common hands; relative differences are meaningless for rare ones. Show expected counts alongside observed counts.
- Per-category z-score \(z_i=(O_i-Np_i)/\sqrt{Np_i(1-p_i)}\) only when \(Np_i\ge10\); otherwise show "n/a (expected < 10)" and the exact probability \(P(X=0)=(1-p_i)^N\) and tail \(P(X\ge O_i)\) from the Binomial.
- With 10 categories, one \(|z|>2\) in a run is not unusual (about a 37% chance under the model), so one large z-score is not evidence against the model.

**Overall goodness of fit (Pearson χ²).** Merge categories from the rarest upward until each merged class has expected count \(\ge5\). Then \(\chi^2=\sum (O-E)^2/E\) with (number of merged classes − 1) degrees of freedom and a p-value from the χ² distribution (regularized incomplete gamma). Example: \(N=10\,000\) merges Royal, Straight Flush, Four of a Kind and Full House into one class (expected ≈ 17), leaving 7 classes and 6 degrees of freedom. The p-value is uniform on (0,1) if the model is right, so a small p-value occasionally happens by chance. Do not describe a single p-value as proof.

## Results panel
- Table of empirical vs theoretical frequencies for all (or the selected) hand types, with columns: observed count, expected count \(Np_i\), empirical frequency, theoretical probability, absolute difference (in percentage points), z-score where valid.
- Bar chart of empirical vs theoretical probabilities on a **logarithmic** scale (the probabilities range from \(1.5\times10^{-6}\) to \(0.5\), so a linear scale hides all rare hands). Zero counts are shown as a marker at the axis with the label "0 observed".
- Highlight the rarest hands, showing "expected count < 1: absence is normal" where it applies.
- χ² statistic, degrees of freedom and p-value (with the merged-class note)
- In focus mode: observed count, expected count, \(P(X=0)\), \(P(X\ge\text{observed})\)
- Seed used
- Short auto-generated summary

### Wording rules for the summary
- Do not say the simulation "proves" anything.
- State that results are random: the same seed reproduces the run, but one seed is one sample.
- Say explicitly when rare hands did not appear and that this is expected given N.

## Theory card
- KaTeX for \(\binom{52}{5}\), the counting derivations above (four of a kind, full house, and at least one more of your choice, e.g. flush with the straight-flush exclusion)
- The partition statement: ten disjoint events whose union is Ω, hence the probabilities sum to 1
- The "all ranks distinct" event-algebra example
- Note on rare hands and the log scale
- Badge: Discrete uniform / Combinatorics

## Required math tests
Exact tests use integer arithmetic (or BigInt); float tests use tolerances.
1. \(\binom{52}{5}=2\,598\,960\) computed from the formula (not hard-coded in the check)
2. The ten counts in the table sum exactly to 2 598 960 (integer arithmetic); the float probabilities sum to 1 within 1e-12
3. Each count in the table equals its derivation formula above (integer arithmetic), including the event-algebra identity \(1\,302\,540+10\,200+5\,108+36+4=\binom{13}{5}4^5=1\,317\,888\)
4. **Exhaustive enumeration:** classifying all 2 598 960 five-card subsets gives **exactly** the ten counts in the table, every hand gets exactly one category, and the counts sum to the total. (This is the exact test of the classifier. The Monte-Carlo run cannot match the table "exactly".)
5. Classification returns the correct category for known examples:
   - A♠ K♠ Q♠ J♠ 10♠ → Royal Flush
   - 9♥ 8♥ 7♥ 6♥ 5♥ → Straight Flush
   - A♦ 2♦ 3♦ 4♦ 5♦ → Straight Flush (ace-low, **not** royal)
   - K♣ K♦ K♥ K♠ 3♦ → Four of a Kind
   - 8♣ 8♦ 8♥ 4♠ 4♦ → Full House
   - A♠ J♠ 8♠ 5♠ 2♠ → Flush
   - 6♠ 7♠ 8♠ 9♠ J♠ → Flush (gap, not a straight flush)
   - 10♣ 9♦ 8♥ 7♠ 6♣ → Straight
   - A♣ 2♦ 3♥ 4♠ 5♣ → Straight (ace-low)
   - 10♠ J♦ Q♥ K♣ A♠ → Straight (ace-high, mixed suits, **not** royal)
   - Q♠ K♦ A♥ 2♣ 3♦ → High Card (no wrap-around)
   - 7♣ 7♦ 7♥ K♠ 2♦ → Three of a Kind
   - 9♣ 9♦ 4♥ 4♠ A♦ → Two Pair
   - J♣ J♦ 8♥ 5♠ 2♦ → One Pair
   - A♣ J♦ 8♥ 5♠ 2♦ → High Card
6. Classification is invariant under reordering the five cards and under any permutation of the four suits
7. Sampling never produces duplicate cards inside a hand, and every card is a valid (rank, suit) pair, for 100 000 sampled hands
8. Sampling is uniform: over a large seeded sample each of the 52 cards appears in a hand with frequency ≈ 5/52 (each within 4 standard errors), and the same holds for each suit and each rank
9. Seeded Monte-Carlo regression tests (deterministic for a fixed seed; not proofs): for categories with \(Np_i\ge10\) the count lies within 4 standard deviations of \(Np_i\); the χ² statistic is below the 99.9% quantile for the chosen degrees of freedom
10. Merging rule: the merged classes always have expected count ≥ 5 for \(N=500\), 10 000 and 100 000, and degrees of freedom = (classes − 1)
11. χ² distribution implementation: known quantiles (for example \(P(\chi^2_1\le3.841)\approx0.95\), \(P(\chi^2_6\le12.592)\approx0.95\))
12. Same seed gives identical results; different seeds differ
13. Input validation rejects non-integer or out-of-range \(N\)

## Out of scope
- Texas Hold'em (7-card), wild cards, community-card combinatorics, draw-poker discards and redraw probabilities, hand-strength evaluators beyond the 10 categories (kickers, tie-breaks, suit ranking), card animations.