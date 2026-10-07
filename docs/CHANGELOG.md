# Casino & Paradoxes — Archived Task History

This is a curated archive of the task history supplied by the owner on 7 October 2026 (Asia/Almaty), with context from the preceding project conversation. It preserves milestones, public interfaces, numerical conventions, recorded checks, important fixes, and deferred work. It is not a verbatim copy of every terminal log or historical README paragraph.

**Do not read this entire file before every task.** The current contract and status are in `README.md`; mathematical requirements are in `docs/specs/*.md`.

## Reading the evidence

- Command results below were **reported by the coding agent**, not independently executed by the curator.
- Browser checks reported as NOT RUN remain unperformed by that agent. The owner subsequently accepted Monty Hall and Roulette through screenshots and interaction reports; this does not establish that every mobile/keyboard/cancellation checklist item was completed.
- Historical test counts and package versions describe their recorded task, not a guarantee about the current checkout.
- Token/cost telemetry was unavailable throughout. Spending and remaining budget are unknown.
- Historical next-task instructions and superseded incomplete-status claims have been replaced by the actual sequence. Repeated task headings were deduplicated.

## 2026-10-07 — Documentation consolidation

- Rewrote README as the working contract and a short current-status snapshot.
- Moved task history into this archive, preserving key technical decisions and reported outcomes.
- Corrected stale next-task/framework claims, contradictory cost wording, and the Geometric cut policy.
- Clarified full-support versus truncated PMF tests, saved-run theory consistency, and transformed-profit versus Bernoulli-indicator terminology.
- Made future status updates concise; historical task summaries belong here. Both documentation files count toward task write scope.
- No application source, dependencies, or attraction specifications changed by this documentation deliverable.
- No new project test/build/lint run was performed for this documentation rewrite. The latest recorded application checks remain Phase 3 Task 6.

# Phase 3 — Roulette, House Edge, Loaded Die, Poker

Roulette Tasks 1–6 are implemented. House Edge, Loaded Die, and Poker remain. Next is **Phase 3 Task 7**, after reading `docs/specs/house-edge.md`.

## Task 6 — Censored waiting-time view and Geometric theory

### Implementation

- Added `src/math/rouletteWaitingChartData.js` with:
  - `buildRouletteWaitingChartData({ spins, experiments, firstHitHistogram, censoredCount, probability })`;
  - `restrictedGeometricMean(n, p)`.
- Pure numerical code: no React/randomness/formatting/chart imports. Reuses Geometric tail and mean functions.
- Validates positive n/N, histogram length n+1, unused index 0 equal to zero, nonnegative integer counts, observed+censored=N, and finite p in (0,1].
- Visible window 1..h: h based on tail <=1e-4, bounded by n and expanded to the largest observed first hit. At most approximately 40 central interval buckets, an observed tail through n if needed, and a **separate T>n category**.
- Buckets partition 1..n. Empirical probabilities divide by **all N**; interval theory is `P(T>a-1)-P(T>b)`. Censored theory is `P(T>n)`. No discarded mass, midpoint sampling, averaging, or renormalization.
- Empirical restricted mean: `(sum(k*firstHitHistogram[k]) + n*censoredCount)/N`, agreeing with engine output.
- Theoretical restricted mean: `(1-(1-p)^n)/p`, computed with `-expm1(n*log1p(-p))/p`, explicit p=1 endpoint. Full mean 1/p is labeled separately.
- Added 15 numerical tests: censor/last-spin distinction, all-censored/all-first-spin cases, known means, p endpoints, grouped mass, complete partition, bounded large-n representation, extreme observations, limits, validation, nonmutation.
- Added `RouletteWaitingChart.jsx`: empirical bars, straight Geometric line, distinct censored bar, external axis labels/wrapping legend, explanatory tooltips/caption, animation disabled. No Poisson in this view.
- `Roulette.jsx`: Event count / Waiting time buttons with aria-pressed, presentation-only state. Toggle does not run simulation, consume RNG, or change staleness. Memoized data uses stored result/run metadata. Reset restores Event count.
- Geometric KaTeX: PMF, tail, full mean, restricted mean; support starts at 1, n is an observation limit. Full mean is 37 for green/straight-up and 37/18 for red/black.
- Feature-only styling; simulation, shell, Home, and Monty Hall unchanged. Spec clarified display modes and censoring/means.

### Recorded checks and acceptance

- `npm run test`: exit 0, **8 files / 188 tests**.
- `npm run build`: exit 0, Vite v8.3.3.
- `npm run lint`: exit 0, 0 warnings/errors, 33 files.
- Agent browser checks: NOT RUN. Checklist included green n=1/n=100, red/black mean, n=5000 bounded chart, toggle/snapshot consistency, Cancel/Reset, layout/console, unchanged other views.
- Owner subsequently reported everything working and agreed to proceed.
- Core Roulette accepted in the conversation. Detailed final QA is still necessary. Optional Exponential demo deferred, not implemented.
- Cost: not measured.

## Task 5 — Count-distribution chart and KaTeX

- Added `src/math/rouletteCountChartData.js`:
  `buildRouletteCountChartData({ spins, experiments, countHistogram, probability, includePoisson })`.
- Validates n in [0,5000], N>=1, histogram shape/counts/sum, p in [0,1], and Boolean Poisson flag.
- Reuses complete Binomial PMF and optional Poisson prefix through n.
- Central range from Binomial cumulative mass, approximately <=1e-6 excluded mass per tail, expanded for every empirical nonzero count; at most approximately 40 integer buckets, explicit remaining tails.
- Buckets partition 0..n and contain **summed probability masses**, not densities, means, or sampled midpoint values.
- Rare-event chart adds `>n`: empirical/Binomial zero, actual Poisson probability beyond n. No prefix normalization.
- Added 18 numerical tests: exact small examples, partition, mass/count preservation, grouping, observed extremes, n=5000 bounds, rare/nonrare cases, Poisson tail, validation, nonmutation.
- Added `RouletteCountChart.jsx`: Experiment bars, gold Binomial exact line, dashed red Poisson approximate line only for green/straight-up. Straight segments, no smoothing, animation disabled; automatic percentage Y range from zero, descriptive tooltips, external labels and wrapping HTML legend.
- Data memoized from completed result/run metadata, not edited inputs or progress updates.
- KaTeX distinguishes single-spin indicator X from count K. Binomial PMF/mean/variance, rare Poisson PMF/lambda/mean/variance; approximation explicitly labeled.
- Roulette results column widened with feature-scoped responsive styling. Other attractions unchanged.
- Recorded checks: test exit 0, **7 files / 173 tests**; build exit 0; lint exit 0, 0 warnings/errors, 30 files.
- Agent browser checks NOT RUN. Owner screenshot showed rare-event comparison and accepted functionality.
- Cost not measured. Waiting view was implemented subsequently in Task 6.

## Task 4 follow-up — Saved-run comparison fix and Black event

### Bugs and fixes

- Screenshot revealed old jackpot results compared with newly edited Red theory.
- Absolute-difference cards used signed subtraction; empirical percentages were mixed with raw theoretical probability decimals.
- Fix requested and accepted: all comparisons and run-associated theory derive from **stored run metadata** (`event`, `jackpotPocket`, n/N, seed), never current controls. Old results remain internally consistent until a successful new run.
- Rate difference: `100*abs(empiricalRate-p)`, percentage points.
- Mean difference: `abs(empiricalMean-n*p)`, hits.
- Both probabilities display as percentages to three decimals, calculation before rounding.
- Theory labeled “Theory for displayed run”; Cancel preserves prior comparison, Reset clears it.

### Black addition

- Explicitly approved fourth event: `black`.
- Simulation uses `getRouletteColour(pocket)==='black'`; draw order and underlying pocket sequence unchanged.
- UI order Red, Black, Green, straight-up. Black p=18/37, Binomial(n,18/37), mean n*p. No rare-event/Poisson claim for red/black.
- Tests extended for Black matching, firstHit/censoring, same-seed shared samples/colour totals, histogram weighted sums, async/sync equivalence. Red+Black totals exclude zero spins.
- Spec updated accordingly.
- Recorded checks: test exit 0, **6 files / 155 tests**, Roulette simulation suite 54; build/lint exit 0.
- Agent browser checklist NOT RUN. Owner confirmed the crucial stale scenario after being asked to switch old green/jackpot results to Red/Black without rerunning.
- Cost not measured.

## Task 4 — Browser UI and asynchronous execution

- Added `runRouletteSimulationAsync({ spins, experiments, event, jackpotPocket=0, seed, signal, onProgress })` beside synchronous runner.
- Shared private aggregation helpers: create/accumulate/finalize. RNG once per run, unchanged draw order; async and sync outputs verified equal.
- Atomic experiment <=5000 spins; chunk cap `max(1,floor(50000/spins))` experiments and soft approximately 10ms check between experiments. Real `setTimeout(...,0)` yields; no Worker or giant synchronous run hidden in one timer.
- Progress initial/final, approximately 50 intermediate updates. Optional AbortSignal checked before/between work, after yield, before completion. AbortError, never completed partial results.
- Added `Roulette.jsx/.css` using shared panels. Defaults n=100, N=500, event Red, seed empty, jackpot 0. UI bounds n1..5000/N50..5000, strict trimmed decimal-digit parsing, safe integers, seed0 valid.
- Jackpot field only for straight-up. Hidden field ignored for other events. Total requested spins shown, neutral large-workload note.
- Lifecycle: AbortController and run-identity guard, disabled controls during run, Run/Cancel/Reset, native progress, preserve previous results, abort on unmount, separate abort versus unexpected errors. No automatic runs.
- Metrics: event rate versus p and count mean versus n*p, total hits, stored metadata; later follow-up corrected stale-theory/absolute-value bugs.
- Sample chips show first <=20 spins of first experiment, number+colour text; dark Black chips remain readable.
- Shell integrates Roulette only, other views preserved.
- Recorded checks: test exit 0, **6 files / 149 tests**, simulation suite48; build exit0 (~255ms); lint exit0, 27 files.
- Agent browser checks NOT RUN. Owner subsequently exercised UI and reported it working; exact maximum-workload/cancellation checklist coverage not established.
- Cost not measured.

## Task 3 — Seeded simulation and right-censoring

Public interfaces:

```js
simulateRouletteExperiment({ spins, event, jackpotPocket = 0, rng })
// { eventHits, firstHit, colourCounts: { red, black, green }, samplePockets }

runRouletteSimulation({ spins, experiments, event, jackpotPocket = 0, seed })
// { spins, experiments, event, jackpotPocket, totalSpins,
//   totalEventHits, empiricalEventRate, meanEventCount,
//   countHistogram, firstHitHistogram, censoredCount,
//   restrictedWaitingMean, colourCounts, samplePockets }
```

- Engine n/N1..5000; future UI N50..5000. Required low-level RNG; optional aggregate seed uses existing generator, omitted seed Math.random.
- Uniform pocket `floor(rng()*37)`, exactly one draw per spin; standard colour lookup reused. No probability shortcut.
- Original events red/green/straight-up; Black added later. Straight-up hits one specified pocket, default0 equals green, not a separate lottery.
- Complete n-spin experiment even after first hit; firstHit one-based/null. Hit at n is distinct from no hit within n.
- One RNG stream for all N; no reseeding each experiment.
- Histograms length n+1, waiting index0 unused; counts sumN, weighted count sum equals hits, observed first-hit+censored=N.
- Censored observations kept; all-N denominator; restricted mean of min(T,n), not full mean or success-only mean.
- Samples capped20 from first experiment; no full spin/experiment history arrays. Maximum workload25m spins needed later scheduling.
- 37 tests included controlled spins/boundaries/classification, first/final/no hit, RNG draw count, sample cap, aggregate identities, seed determinism, green==straight-up0, mocked unseeded path, validation, fixed-seed sanity.
- Sanity n100/N1000: red/green rate, count mean, censor fraction within approximately 5 standard errors, structural tests primary.
- Recorded checks: **6 files / 138 tests**, test/build/lint exit0, lint26files.
- Cost not measured.

## Task 2 — Stable distributions

```js
binomialPmfArray(n, p)       // n0..5000, p[0,1], complete array n+1
geometricPmf(k, p)          // k positive safe integer, p(0,1]
geometricTail(k, p)         // P(T>k), k nonnegative safe integer
geometricMean(p)            // 1/p
poissonPmfArray(lambda, maxK) // lambda0..5000, maxK0..10000
```

- Strict type/domain validation, unrounded output, no React/randomness/dependencies.
- Binomial endpoints n0/p0/p1; relative mode-centered recurrences and Kahan summation, normalization of **complete finite support**. No raw coefficients/factorials or recurrence started at underflowed (1-p)^n. Tiny tails may underflow.
- Geometric support1,2,..., log1p(-p), explicit p1; p0 rejected.
- Poisson log-space mode from bounded sum of logs for log(k!), upward/downward recurrences; below-mode cutoffs and lambda1000/5000 central probabilities supported. Finite prefix **not normalized**.
- 23 tests: known small PMFs, Binomial n0..100 mass tolerance1e-12, n5000 realistic/extreme p, moments/symmetry; Geometric tail/mass identity/mean; Poisson known values, truncated lambda2 maxK0=exp(-2), below-mode case, generous-tail moments, large lambda; invalid arguments.
- Recorded checks: **5 files / 101 tests**, test/build/lint exit0, lint24files.
- Cost not measured.

## Task 1 — European rules and colour table

```js
EUROPEAN_ROULETTE
// frozen { pocketCount:37, minPocket:0, maxPocket:36,
//          redCount:18, blackCount:18, greenCount:1 }
getRouletteColour(pocket) // red | black | green
getRouletteProbabilities() // red18/37, black18/37, green1/37, straightUp1/37
```

- Red pockets: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36. Zero green, remaining nonzero Black.
- Private red Set, no exported mutable lookup. Strict number/integer0..36 validation, no coercion/clamp/modulo.
- Corrected spec's misleading “alternating red/black” sentence. Numerical parity is not the colour rule: 10/11 Black,18/19 Red.
- Straight-up overlaps colours; not included when checking colour probabilities sum1.
- 22 tests for exact probabilities/full table/counts/determinism/invalid values.
- Recorded checks: **4 files / 78 tests**, test/build/lint exit0, lint22files, build~585ms.
- Cost not measured.

# Phase 2 — Monty Hall

Core implementation completed and owner accepted it. Agent automated browser checks were unavailable; detailed final QA remains.

## Task 5 — Comparison chart and KaTeX

- Added Recharts `^3.10.1` (reported resolved3.10.1) and KaTeX `^0.19.0` (resolved0.19.0), production dependencies only. No wrapper/icon/router/UI/animation package or unrelated upgrade.
- `MontyHallChart.jsx`: Switch/Stay, Experiment/Theory grouped bars, full-precision data converted to %, Y0..100%, descriptive tooltip, supported accessibilityLayer, fixed-height responsive container, animation off.
- `Formula.jsx`: direct renderToString, trust:false, throwOnError:false, htmlAndMathml, bundled CSS/fonts, inline-compatible span. Only KaTeX-generated HTML inserted, no raw/user HTML.
- Chart uses stored successful result; editing controls preserves it, Reset removes it.
- Theory rendered stay1/3/switch2/3. Bayes example explicitly conditions on player Door1: host H3 likelihoods1/2,1,0; totalP(H3)=1/2; posterior carDoor2=2/3. Host rules explicit.
- Feature-scoped formula wrappers horizontally scroll without page overflow.
- Recorded checks: **3 files / 56 tests**, test/build/lint exit0, lint20files; direct Node formula rendering had no katex-error.
- Build reported JS~874.66kB/gzip259.25kB and a chunk-size advisory, not a build error. Final bundle optimization remains a QA consideration, not an automatic refactor authorization.
- Follow-up fixed axis-label/legend overlap: moved labels and wrapping HTML legend into normal flow outside SVG. Owner accepted result.
- Agent browser checks NOT RUN. Cost not measured.

## Task 4 — Interactive round, light transitions, emojis

- Added `createInteractiveMontyHallRound(initialDoor,rng=Math.random)` returning initialDoor/carDoor/openedDoor/switchDoor, strict initial0..2 and RNG-function checks. Uniform car; legal goat reveal uniform when two choices.
- Batch draw order unchanged; known N10000/seed12345 result preserved.
- Added 18 helper tests (43 simulation tests total): all12 legal outcomes, choices/content, invalid values, boundaries, determinism, regression seed.
- `InteractiveRound.jsx/.css`: choose→decide→finished. Native numbered door buttons, round generated only on first choice, host opens goat, Stay/Switch, actual car determines outcome, per-round explanation, Play again.
- Hidden car/goat contents not rendered before reveal. Labels identify initial/final/host doors beyond colour; polite status announcements; focus to Stay/Play again/first door.
- CSS selected transition~160ms, reveal fade/side shift/small2D rotation~220ms, no timer-controlled logic, reduced-motion disables transforms/duration.
- Manual state/randomness independent of batch seed/results; Play again versus batch Reset isolated.
- Narrow spec/README exception approved for simple Monty Hall door transitions, expensive effects still excluded.
- Follow-up owner requested centered emojis: closed🚪, revealed goat🐐, car🚗; decorative aria-hidden/pointer-events:none, text/door numbers retained. Owner approved.
- Recorded checks before emoji follow-up: **3 files / 56 tests**, build/lint0, lint18files; regression6598/3402 confirmed.
- Agent browser checks NOT RUN. Cost not measured.

## Task 3 — Controls and results UI

- `MontyHall.jsx/.css`, shell branch only for monty-hall; other placeholder views preserved.
- UI N default1000, range100..50000; optional nonnegative safe-integer seed, empty omitted,0 valid. String state, trimmed digits-only validation; labels/help/errors/native constraints.
- Explicit Run invokes existing engine once, saved run metadata/full precision; no mount/effect auto-run. Invalid input preserves old results. Reset defaults/clears without run. Edits mark saved result stale.
- Paired Switch/Stay groups show empirical/theoretical rates, absolute difference in percentage points, wins/N. Differences computed before formatting; no significance claim.
- Plain theory/host assumptions before later KaTeX integration.
- Responsive shared panels, no new dependency.
- Recorded checks: **3 files / 38 tests**, test/build/lint0, lint17files. Agent browser checks NOT RUN; Node known seed confirmed.
- Cost not measured.

## Task 2 — RNG and explicit simulation

```js
createSeededRng(seed)
simulateMontyHallTrial(rng)
// {carDoor,initialDoor,openedDoor,switchDoor,stayWin,switchWin}
runMontyHallSimulation({ experiments, seed })
// {experiments,switchWins,stayWins,switchWinRate,stayWinRate}
```

- mulberry32: nonnegative safe-integer seed,0 valid; unsigned32 normalization; equivalent states equivalent sequences. Private closure state, no Math.random mutation, not cryptographic.
- Explicit uniform car/initial choice/legal host door; switch is remaining door. No synthetic success at probability2/3, no imported theory to generate outcomes.
- Engine N1..50000, UI later N100..50000. Single RNG per run; no full trial array.
- Strategies share each trial: exactly one wins, wins sumN. Paired outcomes, not independent runs.
- Six RNG tests,25 simulation tests; all12 controlled outcomes, boundaries, N1/50000, seeds, validation, mocked unseeded path.
- Fixed-seed N10000 seed12345: switch0.6598 (6598wins), stay0.3402 (3402wins), tolerance0.03~6 standard errors, coarse sanity only.
- Reported host-index rescaling bug found and fixed before final checks.
- Recorded checks: **3 files / 38 tests**, test/build/lint0, lint16files.
- Cost not measured.

## Task 1 — Exact theory and test setup

- `getMontyHallProbabilities()` → `{stay:1/3,switch:2/3}`, pure no-parameter numeric model, JSDoc host assumptions.
- Tests known values/bounds/sum and independent exhaustive 3car×3initial×legalhost enumeration weighted `(1/9)/legalHostChoices`.
- Follow-up corrected reversed counts in report/comment/README: **3 pairs with two choices,6 with one,12 expanded outcomes**. Actual enumeration was already correct. Explicit counters/assertions added.
- Added Vitest dev dependency `^3.2.4`, reported resolved3.2.7; test script `vitest run`; existing scripts preserved, no config/UI testing package.
- Recorded checks: **1 file / 7 tests**, test/build/lint0, lint12files; follow-up test/lint0, still7tests.
- Cost not measured.

# Phase 1 — Foundation and design

## Task 5 — Shared presentation components

- Added ControlPanel/ChartPanel/TheoryCard/MetricCard plus panels.css; presentation-only, no math/state/simulation.
- Interfaces:
  - ControlPanel({children,title='Controls'}), section/heading, no automatic form;
  - ChartPanel({children,title='Simulation Results',summary}), optional summary/no fixed chart size;
  - TheoryCard({children,title='Theory',distributionLabel}), omit absent badge;
  - MetricCard({label,value,description}), definition list, `value ?? '—'` preserves0.
- Global card + shared-panel classes preserve look. Feature/grid layout remains shell-owned; tokens/global styles unchanged.
- Shell placeholder mapping replaced with explicit Controls→Results→Theory wrappers; duplicated headings removed, placeholder CSS narrowly extracted.
- Recorded build/lint exit0,26buildmodules, lint10files. Browser NOT RUN. Cost not measured.
- Environment incident: multiline terminal heredocs reportedly corrupted JSX/Unicode on initial writes (em dash/arrow became2014/2192). Agent repaired via single-line Node writers/Perl, reread files, final build/lint passed. Prefer normal editing and sequential checked writes thereafter.
- Earlier Plan-mode/no-editor blocker resolved by owner switching Act and authorizing terminal writes; never assume editing is authorized in Plan mode.

## Task 4 — Reference-based Stat-Vegas redesign

- Owner supplied visual reference. Added HomePage.jsx/.css; hero Stat-Vegas/Casino&Paradoxes, Start Exploring anchor to catalog,5Casino cards then3Others+static How it works.
- One native button per card, metadata reused, Topic badges, decorative media placeholders; no photos/icons or fake settings/quiz/theme controls.
- Shell sidebar branding/Home/grouped nav/no-money note, slim Learn.Explore.Play. topbar. Home initial view, local useState, no router/storage.
- Sticky/scrollable desktop sidebar; mobile navigation above content, wrapping grids, placeholders stacked. Token palette, local serif stack, accessibility/reduced-motion retained.
- Design contract updated; mathematical scope/specs unchanged.
- Recorded build/lint0,22buildmodules, lint6files. Browser NOT RUN; owner screenshot accepted design. Cost not measured.

## Task 3 — Initial shell and navigation

- App.jsx replaces Vite demo with AppShell, unused assets retained.
- attractions.js metadata eight IDs/titles/groups/topics, defaultAttractionId monty-hall, lookup helper. Default presentation later changed to Home by Task4.
- Native navigation buttons, local state, semantic header/nav/main, active indication; generic Controls/Results/Theory placeholders, no fake results.
- Responsive side navigation/stacked mobile, token styling, no dependencies.
- Recorded build/lint0,20buildmodules, lint5files. Browser NOT RUN; owner provided screenshot. Cost not measured.

## Task 2 — CSS foundation

- tokens.css exact approved palette, spacing4/8/12/16/24/32, radius12, shadow, transition160ms, system fonts.
- global.css reset/background/text/forms/focus/card/button/input/disabled/reduced-motion.
- main.jsx imports tokens then global; old index.css left unchanged/unused; App.css demo constraints removed. App.jsx still demo until Task3.
- .gitignore reported excluding node_modules and dist.
- Recorded build/lint0,21modules,CSS1.91kB versus prior4.10kB. Browser NOT RUN. Cost not measured.

## Task 1 — Environment and scaffold

- Reported Node v24.21.0, npm11.19.0; macOS26.2 build25C56, Darwin25.2.0, arm64.
- Official React JavaScript Vite template created in temporary directory and scaffold files copied to repository root while preserving README/docs/.git.
- ES modules, Vite8/React19, oxlint template tooling. No chart/math/router/UI/test packages yet at this historical point.
- Package name casino-paradoxes; title Casino&Paradoxes. Demo assets left for later removal from rendering.
- npm install reported success,24packages,0vulnerabilities; build Vitev8.3.3,20modules,~680ms,JS222.52kB/gzip69.26kB.
- Tests did not exist at this historical point; Vitest arrived in Phase2. Deployment remains deferred.
- Actual token/cost not measured. Earlier unverified “under USD0.50” statement has been removed; no supported spending estimate exists.

# Phase 0 — Approved decisions

- Educational experiment-vs-theory purpose, English UI/code, JavaScript stack, dark-green/gold design, incremental work.
- All eight attraction specifications were reported written.
- Buffon's needle excluded; extra family coverage included Normal/Geometric, optional Exponential lowest priority.
- Exact instructor requirements for topics5–6 were initially unknown; verify any later instructor changes instead of assuming them.

# Pending work and acceptance boundaries

- Next: House Edge specification and Phase3 Task7 math/tests. Explicitly define stake, total payout, returned stake, net profit, and approximation assumptions.
- Then remaining Phase3 attractions Loaded Die/Poker; Phase4 Birthday/Darts; Phase5 Two Dice; Phase6 finalQA/deployment/defense notes.
- Optional Exponential and Home imagery/icons are deferred, not silently completed or required before core work.
- User acceptance of existing screens does not prove all browser/device/accessibility cases. Final QA must track them.
- Large-bundle advisory was recorded after charts/KaTeX; investigate only in an authorized optimization task.
- Git checkpoints were recommended; whether the owner created them is unknown.
- Future historical entries should be concise: phase/task, substantive changes/interfaces, checks actually run, acceptance/deferred work, measured cost or not measured. Do not append another full task transcript to README.
