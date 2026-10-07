# Monty Hall

## Course topic
4. Conditional probability, Bayes’ formula

## Goal
Compare the empirical win rate of the “always switch” strategy vs the theoretical probability 2/3, and the “always stay” strategy vs 1/3.

## Controls
- Number of experiments `N` (default 1000, range 100–50 000)
- Optional seed (integer ≥ 0)
- Strategy fixed to “always switch” for the main run; optional second run or toggle for “always stay” (keep simple: primary is switch)

## Simulation
1. Place the car uniformly behind one of 3 doors.
2. Player picks a door uniformly at random.
3. Host opens a different door that has a goat (if two choices, choose uniformly).
4. Player switches to the remaining closed door.
5. Record win (car) or loss.
Repeat `N` times. Report empirical win frequency.

Same for stay strategy if implemented.

## Theory
- Prior: car location uniform, \( P(C_i) = 1/3 \).
- Player initial pick: door 1 without loss of generality.
- \( P(\text{win by staying}) = 1/3 \)
- \( P(\text{win by switching}) = 2/3 \)

Bayes view (optional short note): after host opens a goat door, posterior on the remaining door is 2/3.

Assumptions: host always opens a goat door; never opens the player’s door; chooses uniformly when he has a choice.

## Results panel
- Empirical switch win rate
- Theoretical 2/3
- Absolute difference
- Empirical stay win rate (if shown) vs 1/3
- Simple bar chart or two metric cards
- 1–2 sentence summary

## Theory card
- KaTeX formulas for 1/3 and 2/3
- Short explanation of the host’s forced reveal
- Badge: Conditional / Bayes

## Required math tests (`src/math`)
- Exact theoretical values: switch = 2/3, stay = 1/3
- Edge: N=1 still returns valid [0,1] frequency
- Seeded simulation is deterministic

## Out of scope
- Multiple players, random host behaviour, more than 3 doors.

## Interactive round (single playable round)
Educational flow: (1) experience one choice personally, (2) compare switching vs staying through the batch experiments, (3) read the theory.

Three stages, all with a uniform, knowledgeable host:
1. **choose** — three closed doors; the player clicks one. Doors are labeled 1, 2, 3 (internal ids 0, 1, 2).
2. **decide** — the host opens one unchosen goat door; the initial door stays closed and is labeled "Your choice", the opened door "Host opened: Goat", and the remaining closed door "Switch option". The player stays or switches.
3. **finished** — all contents are revealed; the result states win/lose, whether the player stayed or switched, and a short explanation for that specific round (naming the actual door contents, never a guaranteed outcome). "Play again" resets only this round.

Rules and visibility:
- The host always opens an unchosen goat door (uniform when he has a choice). Before the final decision only the host-opened goat is visible; door contents are rendered only once a door is actually revealed (no hidden car text behind closed doors).
- A manual round uses its own randomness and local state and is independent of the batch simulation: it does not consume the batch seed, and Play again never changes batch inputs, metadata, stale status or stored results. Likewise Run simulation / Reset affect only the batch.
- Short, CSS-only selection/reveal transitions are allowed here (a lightweight override of the general animation exclusion): a subtle selected-door change (~150–180 ms) and a door-cover fade/slide (~180–240 ms). No animation libraries, complex 3D, physics, sound, confetti, spinning/bouncing, or timers driving game logic. Animations are decorative only — the game remains correct if they never run, essential info is available immediately, and `prefers-reduced-motion` removes the transforms and durations.

This section supersedes the previous blanket "animations of doors opening" exclusion for Monty Hall only. Batch controls, theory and required tests are unchanged. Charts and KaTeX rendering remain deferred.