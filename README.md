# Casino & Paradoxes — Project Context

Read this file before each task, then **only the relevant** `docs/specs/<attraction>.md`. This is the current working contract, not a task transcript. Historical reports live in `docs/CHANGELOG.md`; read them only when the task needs historical context.

## 1. Purpose and priorities

**Stat-Vegas**, subtitled **Casino & Paradoxes**, is an educational browser app for a university probability and mathematical statistics course. Attractions connect an interactive experiment with a theoretical model and its assumptions.

- No real money, accounts, payments, real betting, backend, database, or runtime AI/API calls. No secrets.
- The owner is a first-year student who must understand and defend the code.
- Code, comments, identifiers, and UI text are in English.
- Priorities: **mathematical correctness > explainability > simplicity > decoration**.
- Original coding-model budget: approximately USD 4–5. Actual spending and remaining budget are unknown. Avoid unnecessary reads, refactors, and dependencies.

## 2. Approved stack

- React + Vite + **JavaScript**, ES modules. JSDoc for public mathematical and simulation functions.
- Plain CSS and shared variables. No UI framework, router, state library, animation library, or Web Worker without approval.
- Recharts for standard charts; small handwritten SVG where appropriate for heatmaps and geometric darts.
- KaTeX through the existing `Formula` component; bundled CSS/fonts, no CDN.
- Vitest for pure math, numerical chart-data transforms, and simulation/RNG behavior. No UI/component test suite.
- Reuse existing dependencies. Ask before adding dependencies or changing scope or mathematical assumptions. Do not upgrade unrelated packages or run `npm audit fix` as a side effect.
- Existing commands: `npm run dev`, `npm run test`, `npm run build`, `npm run lint`, `npm run preview`. Inspect `package.json` when exact scripts or versions matter.

## 3. Attractions and course coverage

| Group | ID | Attraction | Topic | Specification |
|---|---|---|---|---|
| Casino | `poker` | Poker | 1. Sets, event algebra, discrete probability, combinatorics | `docs/specs/poker.md` |
| Casino | `roulette` | Roulette & Rare Jackpot | 3. Independence, Bernoulli scheme, Poisson approximation | `docs/specs/roulette.md` |
| Casino | `loaded-die` | Loaded Die | 4. Total probability, Bayes | `docs/specs/loaded-die.md` |
| Casino | `house-edge` | The House Edge | 5. Random variables, PMF/CDF, expectation, variance, families | `docs/specs/house-edge.md` |
| Casino | `two-dice` | Two Dice | 6. Joint distributions, marginals, covariance, densities | `docs/specs/two-dice.md` |
| Others | `birthday` | Birthday Paradox | 1. Discrete probability, independence | `docs/specs/birthday.md` |
| Others | `darts` | Geometric Darts | 2. General probability space, uniform density | `docs/specs/darts.md` |
| Others | `monty-hall` | Monty Hall | 4. Conditional probability, Bayes | `docs/specs/monty-hall.md` |

**Required families:** Bernoulli, Binomial, Poisson, Geometric, discrete/continuous Uniform, and Normal. Their exact demonstrations belong in the relevant specifications.

- Roulette: single-spin Bernoulli indicators, Binomial counts, Poisson approximation for rare counts, Geometric waiting times.
- House Edge: Bernoulli win indicator, Binomial win count, transformed profit random variables, and Normal approximation of total profit with stated assumptions and continuity correction where applicable. Profit itself is not automatically a Bernoulli variable; follow its specification.
- Uniform: sampling in Poker/Birthday/Two Dice; continuous models in Darts and the Two Dice density demo.
- Optional Exponential waiting-time approximation: **deferred**, lowest priority.

Buffon's needle is excluded. Darts is plain geometric darts. Budget reductions require approval: defer optional demos and extra polish before required mathematics, tests, or the core experiment/theory of an attraction. Do not remove completed Geometric coverage.

## 4. Shared behavior and mathematical safeguards

1. Attraction screens provide **Controls**, **Simulation Results**, and **Theory**; an approved manual game may appear above them. Home is a catalog, not a three-panel experiment.
2. Controls have labels, defaults, validated bounds, explicit **Run simulation** and **Reset**, and optional seed where supported. Clearly distinguish trials per experiment from repeated experiments.
3. No automatic simulation on mount or input edits. After edits, keep completed results and mark them **from previous run**.
4. **All comparisons, charts, and run-associated theory use the saved successful run**, not edited controls. Cancellation preserves the last successful run; reset clears it. Never publish partial work as a completed result.
5. Results include empirical/theoretical values, a nonnegative absolute difference, a labeled chart, and a short plain-English summary. Use consistent units: probability percentages, percentage-point differences, and count differences in hits.
6. Theory includes KaTeX formulas, assumptions, variable meanings, and appropriate family badges. Distinguish exact distributions from approximations.
7. Keep full precision; round only for display. Larger samples do not guarantee smaller observed error. Do not infer significance from visual proximity to theory.
8. Use stable PMFs (recurrences/log-space), not large factorials. Finite prefixes of infinite-support distributions retain omitted tail mass; do not renormalize it away. When grouping chart intervals, **sum** their probability masses, not midpoint values or averages.
9. Waiting times count the successful trial. Right-censored observations remain visible and use all experiments as the denominator. Distinguish the restricted mean `E[min(T,n)]` from the full `E[T]`.
10. Seeded RNG is reproducible, not cryptographic. Seed 0 is valid. Use one RNG stream per run, never reseed each experiment. Use Fisher–Yates, not random-comparator sorting, for shuffling.
11. Large workloads yield in bounded chunks, with throttled progress and safe cancellation/unmount handling. A timer around one huge synchronous calculation is not sufficient.

### Effects and chart presentation

- Allowed: labeled outcome chips and restrained CSS color/selection transitions, respecting reduced motion.
- Progress updates should be bounded, roughly 20–50 per run, not per trial. Chart animation is optional, not required; existing comparison/distribution charts have animation disabled.
- Monty Hall has an approved manual round with short CSS door reveal/selection transitions (approximately 150–240 ms) and door/goat/car emojis. Game logic must not depend on animation completion.
- Keep axis titles and wrapping legends separate if positioning them inside SVG causes overlap. Provide text/numeric explanations alongside charts.
- Excluded: spinning-wheel physics, complex 3D, video, sound, confetti, and animation libraries.

## 5. Code boundaries

```text
src/
  app/          shell, Home catalog, attraction navigation
  components/   shared panels, metrics, Formula
  features/     one folder per attraction ID
  math/         pure theory and numerical transformations
  simulation/   RNG, sampling, simulation engines
  styles/       design tokens and global CSS
docs/
  specs/        one specification per attraction
  CHANGELOG.md  archived task history
```

- `src/math` has no React imports or randomness. Theory is independent of simulation.
- Centralize shared rules/constants; reuse existing RNG, distributions, and components.
- `ControlPanel`, `ChartPanel`, `TheoryCard`, and `MetricCard` are presentation components, not simulation engines. `MetricCard` must preserve a real zero.
- Do not create a generic simulation framework before concrete reuse justifies it.
- Prefer targeted edits. Do not delete unused assets or reorganize unrelated files as task cleanup.

## 6. Design contract

A restrained dark-green/gold educational casino dashboard, not a flashy betting site.

| Token | Value |
|---|---|
| Background | `#08110D` |
| Surface | `#101F18` |
| Raised surface | `#172A20` |
| Gold accent | `#D8B45A` |
| Text | `#F3F0E7` |
| Muted text | `#B1BDB4` |
| Positive | `#67D59A` |
| Negative/red outcome | `#F07878` |
| Border | `#34473B` |

- Reuse existing tokens and classes. System sans-serif; local Georgia/Times serif for branding/hero. No downloaded UI fonts; KaTeX's bundled math fonts are allowed.
- Spacing in multiples of 4px; 12px card radius; restrained shadows. Gold emphasizes actions, selection, and theory, not every paragraph.
- Desktop: sidebar branding/navigation and slim top bar. Home has a hero, eight attraction cards, and a static How it works card. **Home is the initial view.**
- Mobile: compact navigation above content; attraction panels stack Controls → Results → Theory. Avoid forcing narrow unreadable columns.
- Home photos/icons are deferred; media placeholders are intentional. No fake settings, theme switch, quiz, or navigation to unimplemented extra pages.
- Keyboard-operable controls, visible focus, adequate contrast, text labels beyond color, chart summaries, and `prefers-reduced-motion` support.
- Current Home, Monty Hall, and Roulette appearance is user-approved. Do not redesign it without a request.

## 7. Task protocol

Start task prompts with:

> Read README.md first, then the spec for this task. Confirm phase and scope in 2 lines. Inspect only relevant files. No unrelated changes.

1. One small deliverable, explicit acceptance criteria, and approved changed-file list. Give a short plan before implementation.
2. More than five changed files requires approval, unless the task already explicitly approves that exact larger list. Additional files outside the approved list require approval.
3. Preserve unrelated code, behavior, and dependencies. Scope/math/specification changes must be explicit.
4. Run relevant tests, build, and existing lint. Keep output bounded **without losing the original command's exit code**.
5. Report actual checks and outcomes. Label browser checks **NOT RUN** when unavailable; automated tests/build are not visual verification.
6. Update only the concise current status in **Section 10**. Append a short historical entry to `docs/CHANGELOG.md`; do not accumulate full reports in README. Documentation writes count toward the approved file list.
7. Record measured token/cost data if available; otherwise **not measured**. Never invent spending estimates or remaining budget.
8. Stop after the task. Do not begin the next one. Task numbers restart at 1 for a new phase, not for a new attraction within the same phase.

Prefer normal file-editing tools. If terminal writers are necessary, write sequentially, verify targeted replacements match exactly once, and inspect the result. Avoid the multiline heredoc method that previously corrupted files in the coding environment. Do not overwrite a file with partial content.

Do not ask about deferred items unless the current task depends on them.

## 8. Testing policy

- Known exact values, endpoints, invalid inputs, probability bounds, and numerical stability.
- Full discrete PMFs sum to 1 within tolerance. Truncated infinite-support PMFs account for omitted tails; censored/grouped views preserve the complete represented mass.
- CDFs are monotone and approach/reach 1 according to their support; Bayes handles allowed prior endpoints.
- RNG/simulations are reproducible with a seed. Controlled outcomes check structure; fixed-seed statistical checks use defensible tolerances, not exact sample/theory equality or seed shopping.
- Preserve existing tests. Specs identify required tests. Pure chart-data tests are numerical tests, not UI tests.
- Manual checks include keyboard, mobile, legend/axis readability, stale-run consistency, cancellation, and console errors. Do not postpone all interaction checking until deployment.

## 9. Phases

- **0:** project decisions.
- **1:** environment, scaffold, tokens, shell/Home, shared components.
- **2:** Monty Hall vertical slice.
- **3:** Roulette, House Edge, Loaded Die, Poker.
- **4:** Birthday, Darts.
- **5:** Two Dice: joint table, marginals, covariance, density demo.
- **6:** final QA, mobile/keyboard checks, static deployment, defense notes mapping course topics to formulas, assumptions, and experiments.

Split phases into small tasks. Continue Phase 3 numbering across its attractions.

## 10. Current status

- **Current phase:** 3. Tasks 1–6 for Roulette are implemented; Phase 3 as a whole is not complete.
- **Completed implementation:** shell/Home/shared components; Monty Hall manual round and batch comparison with chart/KaTeX; core Roulette.
- **Roulette:** Red/Black/Green/straight-up; seeded sync/async engines; bounded execution/progress/cancel; count charts with exact Binomial and rare-event Poisson approximation; Geometric waiting view with explicit censoring and restricted/full means.
- **User acceptance:** owner reported Monty Hall and Roulette working satisfactorily. This is user-reported acceptance, not automated browser verification. Detailed mobile/keyboard/cancellation checks should still be tracked in final QA.
- **Latest recorded automated checks:** Phase 3 Task 6 reported 8 test files / 188 passing tests, build exit 0, lint exit 0. These are historical reports, not fresh verification of this documentation revision.
- **Next:** Phase 3, **Task 7 — House Edge math and tests**, after reading `docs/specs/house-edge.md`. Do not assume stake, payouts, or net-profit rules.
- **Remaining:** House Edge, Loaded Die, Poker, Birthday, Darts, Two Dice, final QA/deployment/defense notes.
- **Deferred:** optional Exponential demo; Home photos/icons. Neither is implemented.
- **Cost:** not measured; remaining budget unknown.
- **History:** `docs/CHANGELOG.md`; read only when needed.
