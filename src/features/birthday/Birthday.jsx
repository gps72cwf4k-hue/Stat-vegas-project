import { useEffect, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import { runBirthdaySimulationAsync } from '../../simulation/birthday.js'
import {
  DAYS_UNIFORM,
  exponentialApproxLowerBoundUniform365,
} from '../../math/birthday.js'
import BirthdayExactChart from './BirthdayExactChart.jsx'
import BirthdayDeltaChart from './BirthdayDeltaChart.jsx'
import './Birthday.css'
// The bundled aggregate file ships with the app; importing it as raw text keeps
// the app fully offline (no network, no build-time code generation).
import csvText from '../../../docs/specs/us-births-by-calendar-day.csv?raw'

/* UI and engine share the range; the engine also accepts N=1 for tests. */
const DEFAULT_N = '23'
const DEFAULT_N_EXPERIMENTS = '2000'
const MIN_N = 2
const MAX_N = 100
const MIN_N_EXPERIMENTS = 100
const MAX_N_EXPERIMENTS = 20000

const SOURCE_OPTIONS = [
  { value: 'uniform', label: 'Uniform, 365 days (theory)' },
  { value: 'real-ssa', label: 'Real US births — SSA 2000-2014' },
  { value: 'real-cdc', label: 'Real US births — CDC/NCHS 1994-2003' },
]

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

/**
 * Parse and validate an integer field.
 * @param {string} raw Raw input string.
 * @param {string} name Field name for the error message.
 * @param {number} min Inclusive minimum.
 * @param {number} max Inclusive maximum.
 * @returns {{ value?: number, error?: string }} The parsed value or an error.
 */
function parseIntField(raw, name, min, max) {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { error: `Enter ${name}.` }
  }
  if (!DIGITS_ONLY.test(trimmed)) {
    return { error: 'Use whole numbers only (no signs, decimals or exponents).' }
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return { error: 'That number is too large to be a safe integer.' }
  }
  if (value < min || value > max) {
    return { error: `Use a whole number between ${min} and ${max}.` }
  }
  return { value }
}

/**
 * Parse and validate the optional seed.
 * @param {string} raw Raw input string.
 * @returns {{ value?: number | null, error?: string }} The seed (or null) or an error.
 */
function parseSeed(raw) {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { value: null }
  }
  if (!DIGITS_ONLY.test(trimmed)) {
    return { error: 'Use a nonnegative whole number, or leave it empty.' }
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return { error: 'That seed is too large to be a safe integer.' }
  }
  return { value }
}

/**
 * Format a probability as a percentage with three decimals.
 * @param {number} rate Rate in [0, 1].
 * @returns {string} The percentage text.
 */
function formatPercent(rate) {
  return `${(rate * 100).toFixed(3)}%`
}

/**
 * Format a probability with six significant digits (for exact values).
 * @param {number} value Probability in [0, 1].
 * @returns {string} The formatted value.
 */
function formatSignificant(value) {
  return value.toPrecision(6)
}

/** Inclusive upper bound for a uint32 seed, `2^32 - 1`. */
const MAX_UINT32 = 4294967295

/**
 * Generate a random integer seed in the uint32 range `[0, 2^32 - 1]`. Used when
 * the seed field is left empty: the generated value is passed to the RNG and
 * displayed so the run can be reproduced.
 * @returns {number} An integer seed in `[0, 4294967295]`.
 */
function generateSeed() {
  return Math.floor(Math.random() * (MAX_UINT32 + 1))
}

/**
 * The Birthday Paradox attraction (sources 1-2: uniform 365 and real US births).
 *
 * Uses the shared ControlPanel / ChartPanel / TheoryCard / MetricCard panels.
 * Runs the bounded asynchronous engine so the browser stays responsive, keeps the
 * last successful result while a new run is in progress, and guards against late
 * callbacks from an old run (via a run-identity ref). All displayed comparisons,
 * charts and cards derive from the stored run snapshot, never from live controls.
 *
 * @returns {import('react').ReactElement} The attraction.
 */
function Birthday() {
  const [nInput, setNInput] = useState(DEFAULT_N)
  const [experimentsInput, setExperimentsInput] = useState(DEFAULT_N_EXPERIMENTS)
  const [source, setSource] = useState('uniform')
  const [seedInput, setSeedInput] = useState('')

  const [errors, setErrors] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [runMeta, setRunMeta] = useState(null)
  const [status, setStatus] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [isStale, setIsStale] = useState(false)

  // One AbortController per run plus a run-identity guard.
  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

  const isRealMode = runMeta ? runMeta.source !== 'uniform' : source !== 'uniform'

  /**
   * Read, validate and normalise the current inputs.
   * @returns {{ values?: object, errors: object }} Parsed values or field errors.
   */
  function parseInputs() {
    const nextErrors = {}
    const n = parseIntField(nInput, 'the number of people (n)', MIN_N, MAX_N)
    const experiments = parseIntField(
      experimentsInput,
      'the number of experiments (N)',
      MIN_N_EXPERIMENTS,
      MAX_N_EXPERIMENTS,
    )
    const seed = parseSeed(seedInput)

    if (n.error) nextErrors.n = n.error
    if (experiments.error) nextErrors.experiments = experiments.error
    if (seed.error) nextErrors.seed = seed.error

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors }
    }
    return {
      errors: {},
      values: {
        n: n.value,
        N: experiments.value,
        source,
        seed: seed.value === null ? undefined : seed.value,
      },
    }
  }

  /** Mark completed results as stale after a control edit (keep them visible). */
  function markStale() {
    setIsStale(true)
    setStatus('')
    setRuntimeError('')
  }

  /**
   * Abort any active run and return the new run identity.
   * @returns {number} The new run id.
   */
  function beginRun() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    const controller = new AbortController()
    controllerRef.current = controller
    runIdRef.current += 1
    return runIdRef.current
  }

  /** Handle the Run button: validate, then start a bounded async run. */
  async function handleRun() {
    const { values, errors: fieldErrors } = parseInputs()
    if (!values) {
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setRuntimeError('')
    setStatus('')
    setIsStale(false)

    // Resolve the seed for this run: an empty field means "generate a random
    // uint32 seed", which is then passed to the RNG and displayed. A provided
    // seed is normalized to uint32 so the displayed value equals the one the
    // RNG actually uses (createSeededRng also folds the seed with `>>> 0`).
    const seedGenerated = values.seed === undefined
    const seedUsed = seedGenerated ? generateSeed() : values.seed >>> 0

    const runId = beginRun()
    const controller = controllerRef.current
    setIsRunning(true)
    setProgress({ completedExperiments: 0, totalExperiments: values.N })

    try {
      const result = await runBirthdaySimulationAsync({
        ...values,
        seed: seedUsed,
        csvText,
        signal: controller.signal,
        onProgress: (next) => {
          if (runIdRef.current !== runId) return
          setProgress(next)
        },
      })
      if (runIdRef.current !== runId) return

      setSnapshot(result)
      setRunMeta({
        n: values.n,
        N: values.N,
        source: values.source,
        seedUsed,
        seedGenerated,
      })
      setStatus('')
      setRuntimeError('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error && error.name === 'AbortError') {
        setStatus('Run cancelled. The previous result is kept.')
      } else {
        setRuntimeError(error && error.message ? error.message : 'Unexpected error during the run.')
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false)
        setProgress(null)
      }
    }
  }

  /** Handle Cancel: abort the active run without publishing results. */
  function handleCancel() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
  }

  /** Handle Reset: abort, restore defaults and clear everything. */
  function handleReset() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    runIdRef.current += 1
    controllerRef.current = null

    setNInput(DEFAULT_N)
    setExperimentsInput(DEFAULT_N_EXPERIMENTS)
    setSource('uniform')
    setSeedInput('')

    setErrors({})
    setIsRunning(false)
    setProgress(null)
    setSnapshot(null)
    setRunMeta(null)
    setStatus('')
    setRuntimeError('')
    setIsStale(false)
  }

  /** Abort active work on unmount so callbacks cannot update a gone component. */
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
      runIdRef.current += 1
    }
  }, [])

  // Values shown BEFORE a run (explain the current valid selection only).
  const selectedSourceLabel =
    SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? ''
  // Displayed-run derived values come from the stored snapshot only.
  const seedLabel = runMeta
    ? runMeta.seedGenerated
      ? `${runMeta.seedUsed} (generated)`
      : String(runMeta.seedUsed)
    : ''
  const runSourceLabel = runMeta
    ? SOURCE_OPTIONS.find((option) => option.value === runMeta.source)?.label ?? ''
    : ''

  return (
    <div className="birthday">
      <div className="birthday__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="birthday__form">
            <p className="birthday__intro">
              Each experiment draws n independent birthdays and checks whether at least
              two coincide. N experiments estimate the probability.
            </p>

            <div className="birthday__field">
              <label className="birthday__label" htmlFor="birthday-n">
                Number of people (n)
              </label>
              <input
                id="birthday-n"
                className="input"
                type="text"
                inputMode="numeric"
                value={nInput}
                disabled={isRunning}
                aria-invalid={errors.n ? 'true' : undefined}
                aria-describedby={errors.n ? 'birthday-n-error' : undefined}
                onChange={(e) => {
                  setNInput(e.target.value)
                  markStale()
                }}
              />
              {errors.n ? (
                <p className="birthday__error" id="birthday-n-error" role="alert">
                  {errors.n}
                </p>
              ) : (
                <p className="birthday__help">Whole number between {MIN_N} and {MAX_N}.</p>
              )}
            </div>

            <div className="birthday__field">
              <label className="birthday__label" htmlFor="birthday-experiments">
                Number of experiments (N)
              </label>
              <input
                id="birthday-experiments"
                className="input"
                type="text"
                inputMode="numeric"
                value={experimentsInput}
                disabled={isRunning}
                aria-invalid={errors.experiments ? 'true' : undefined}
                aria-describedby={errors.experiments ? 'birthday-experiments-error' : undefined}
                onChange={(e) => {
                  setExperimentsInput(e.target.value)
                  markStale()
                }}
              />
              {errors.experiments ? (
                <p className="birthday__error" id="birthday-experiments-error" role="alert">
                  {errors.experiments}
                </p>
              ) : (
                <p className="birthday__help">
                  Whole number between {MIN_N_EXPERIMENTS} and {MAX_N_EXPERIMENTS}.
                </p>
              )}
            </div>

            <div className="birthday__field">
              <label className="birthday__label" htmlFor="birthday-seed">
                Seed (optional)
              </label>
              <input
                id="birthday-seed"
                className="input"
                type="text"
                inputMode="numeric"
                value={seedInput}
                disabled={isRunning}
                aria-invalid={errors.seed ? 'true' : undefined}
                aria-describedby={errors.seed ? 'birthday-seed-error' : undefined}
                onChange={(e) => {
                  setSeedInput(e.target.value)
                  markStale()
                }}
              />
              {errors.seed ? (
                <p className="birthday__error" id="birthday-seed-error" role="alert">
                  {errors.seed}
                </p>
              ) : (
                <p className="birthday__help">
                  Leave empty to generate a random seed; the value used is shown in the results.
                </p>
              )}
            </div>


            <fieldset className="birthday__fieldset">
              <legend className="birthday__label">Birthday source</legend>
              {SOURCE_OPTIONS.map((option) => (
                <label
                  className="birthday__radio"
                  key={option.value}
                  htmlFor={`birthday-source-${option.value}`}
                >
                  <input
                    id={`birthday-source-${option.value}`}
                    type="radio"
                    name="birthday-source"
                    value={option.value}
                    checked={source === option.value}
                    disabled={isRunning}
                    onChange={(e) => {
                      setSource(e.target.value)
                      markStale()
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <div className="birthday__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleRun}
                disabled={isRunning}
              >
                {isRunning ? 'Running…' : 'Run'}
              </button>
              <button type="button" className="button" onClick={handleCancel} disabled={!isRunning}>
                Cancel
              </button>
              <button type="button" className="button" onClick={handleReset}>
                Reset
              </button>
            </div>

            {isRunning && progress ? (
              <div className="birthday__progress">
                <p className="birthday__progress-text">
                  {progress.completedExperiments} / {progress.totalExperiments} experiments
                </p>
                <progress value={progress.completedExperiments} max={progress.totalExperiments} />
              </div>
            ) : null}

            <p className="birthday__note">
              No run yet. Current selection: {selectedSourceLabel}.
            </p>
          </div>
        </ControlPanel>


        {/* --- Results ---------------------------------------------------- */}
        <ChartPanel title="Simulation Results">
          {!snapshot || !runMeta ? (
            <p className="birthday__empty">
              Set the controls and press Run. Nothing is computed automatically.
            </p>
          ) : (
            <div className="birthday__results">
              {isStale ? (
                <p className="birthday__stale" role="status">
                  From a previous run. The controls have changed; press Run to recompute.
                </p>
              ) : null}

              <dl className="birthday__meta">
                <dt>Source</dt>
                <dd>{runSourceLabel}</dd>
                <dt>People (n)</dt>
                <dd>{runMeta.n}</dd>
                <dt>Experiments (N)</dt>
                <dd>{runMeta.N}</dd>
                <dt>Seed used</dt>
                <dd>{seedLabel}</dd>
              </dl>

              <div className="birthday__metrics">
                <MetricCard
                  label="Empirical p̂ (shared)"
                  value={formatPercent(snapshot.empirical.pHat)}
                  description={`${snapshot.empirical.hits} of ${runMeta.N} experiments had a shared birthday.`}
                />
                <MetricCard
                  label="95% Wilson interval"
                  value={`[${formatPercent(snapshot.wilsonCI95.lo)}, ${formatPercent(snapshot.wilsonCI95.hi)}]`}
                  description="Score interval for the binomial proportion."
                />
                <MetricCard
                  label="Exact p (selected source)"
                  value={formatSignificant(snapshot.exact.pExact)}
                  description="From the counting formulas, not the simulation."
                />
                <MetricCard
                  label="P(all distinct), directly"
                  value={snapshot.exact.pDistinctExact.toPrecision(4)}
                  description="Computed directly, not as 1 − P(shared)."
                />
                <MetricCard
                  label="Standard error"
                  value={snapshot.derived.se.toPrecision(4)}
                  description="sqrt(p(1 − p)/N) with the exact p."
                />
                <MetricCard
                  label="|p̂ − p|"
                  value={snapshot.derived.absDiff.toPrecision(4)}
                  description="Absolute difference between empirical and exact."
                />
                <MetricCard
                  label="z-score"
                  value={
                    snapshot.derived.zValid && snapshot.derived.zScoreOrNull !== null
                      ? snapshot.derived.zScoreOrNull.toFixed(3)
                      : 'n/a'
                  }
                  description={
                    snapshot.derived.zValid
                      ? '(p̂ − p)/SE. Valid because N·p ≥ 10 and N·(1−p) ≥ 10.'
                      : `Not shown: the normal rule needs N·p ≥ 10 and N·(1−p) ≥ 10 (here N·p = ${snapshot.derived.expectedHits.toFixed(2)}).`
                  }
                />
                {isRealMode ? (
                  <MetricCard
                    label="Uniform 365 exact p"
                    value={formatSignificant(snapshot.exact.uniform365Exact)}
                    description="Reference value for the same n."
                  />
                ) : null}
              </div>


              {isRealMode && snapshot.detectability ? (
                <div className="birthday__cards">
                  <h3 className="birthday__subheading">Detectability</h3>
                  <p className="birthday__card-note">
                    Exact gap Δ = P_real − P_uniform365 ={' '}
                    {snapshot.detectability.deltaExact.toPrecision(3)} at n = {runMeta.n}. This is
                    only {snapshot.detectability.deltaOverSE.toFixed(3)} standard errors away, so a
                    run of N = {runMeta.N} cannot separate the two models. Detecting the gap at 3
                    standard errors would need about{' '}
                    {Math.round(snapshot.detectability.nNeeded3SE).toLocaleString('en-US')}{' '}
                    experiments — far above the 20 000 limit. The exact DP shows the effect; the
                    simulation only checks the implementation.
                  </p>

                  <h3 className="birthday__subheading">Data</h3>
                  <dl className="birthday__meta">
                    <dt>Dataset</dt>
                    <dd>{snapshot.dataCard.label}</dd>
                    <dt>Years</dt>
                    <dd>{snapshot.dataCard.years}</dd>
                    <dt>Total births</dt>
                    <dd>{snapshot.dataCard.totalBirths.toLocaleString('en-US')}</dd>
                    <dt>License</dt>
                    <dd>
                      {snapshot.dataCard.license} —{' '}
                      <a href={snapshot.dataCard.link} target="_blank" rel="noreferrer">
                        FiveThirtyEight data
                      </a>
                    </dd>
                    <dt>Rarest date</dt>
                    <dd>
                      {snapshot.dataCard.rarest.date} (
                      {snapshot.dataCard.rarest.relativeToAverage.toFixed(2)}× average)
                    </dd>
                    <dt>Most frequent date</dt>
                    <dd>
                      {snapshot.dataCard.mostFrequent.date} (
                      {snapshot.dataCard.mostFrequent.relativeToAverage.toFixed(2)}× average)
                    </dd>
                  </dl>
                  <p className="birthday__card-note">
                    US births only, pooled over many years; other countries and eras differ, and
                    the model describes a random person, not a random group.
                  </p>
                </div>
              ) : null}

              <BirthdayExactChart run={snapshot} isRealMode={isRealMode} />
              {isRealMode ? <BirthdayDeltaChart run={snapshot} /> : null}

              {status ? (
                <p className="birthday__status" role="status">
                  {status}
                </p>
              ) : null}
            </div>
          )}

          {runtimeError ? (
            <p className="birthday__error-banner" role="alert">
              {runtimeError}
            </p>
          ) : null}

          {status && (!snapshot || !runMeta) ? (
            <p className="birthday__status" role="status">
              {status}
            </p>
          ) : null}
        </ChartPanel>

      </div>

      {/* --- Theory (below the grid, full width) ------------------------ */}
      <div className="birthday__theory-row">
        <TheoryCard
          title="Theory"
          distributionLabel="Discrete uniform · Multiplication rule · Empirical distribution"
        >
          <div className="birthday__theory">
            <h3 className="birthday__subheading">Exact probability, uniform model</h3>
            <div className="birthday__formula-block">
              <Formula
                expression={String.raw`P(\text{all distinct})=\frac{365!}{(365-n)!\,365^{n}}=\prod_{k=1}^{n-1}\left(1-\frac{k}{365}\right)`}
              />
            </div>
            <div className="birthday__formula-block">
              <Formula expression={String.raw`P(\text{at least one shared})=1-P(\text{all distinct})`} />
            </div>
            <p>
              The factorial form is only for display: 365! ≈ 2.5×10^{778} overflows a double, so
              the product of factors in (0,1] is used in computation. For n = 23 the probability is
              0.5072972…, while for n = 22 it is 0.4756953…, so <strong>23 is the smallest group
              size</strong> with P ≥ 0.5.
            </p>

            <h3 className="birthday__subheading">Why the product is exact (multiplication rule)</h3>
            <p>
              With A_k = “person k’s birthday differs from the earlier ones”, the multiplication
              rule gives P(A_1 ∩ … ∩ A_n) = ∏ P(A_k | A_1 ∩ … ∩ A_(k−1)), and given k−1 distinct
              birthdays the conditional probability is exactly 1 − (k−1)/365. The factors are{' '}
              <em>conditional</em> probabilities; the events A_k are <em>not</em> independent:
            </p>
            <div className="birthday__formula-block">
              <Formula
                expression={String.raw`P(A_2\cap A_3)=\frac{364\cdot363}{365^{2}}\approx0.991796,\quad P(A_2)P(A_3)=\left(\tfrac{364}{365}\right)^{3}\approx0.991804`}
              />
            </div>
            <p>
              The product is exact because it uses conditional probabilities; independence is only
              assumed for the birthdays themselves.
            </p>

            <h3 className="birthday__subheading">Exact probability for any distribution</h3>
            <div className="birthday__formula-block">
              <Formula
                expression={String.raw`P(\text{all distinct})=n!\,e_n(p_1,\dots,p_d),\qquad e_n=\sum_{j_1<\cdots<j_n}p_{j_1}\cdots p_{j_n}`}
              />
            </div>
            <p>
              With f_k = k! e_k over the days processed so far (f_0 = 1), each day with probability
              p updates, for k = n_max down to 1, f_k ← f_k + k·p·f_(k−1). After all days,
              f_n = P(all distinct). The special case n = 2 is P(two share) = ∑ p_j².
            </p>


            <h3 className="birthday__subheading">Does non-uniformity matter?</h3>
            <p>
              On a fixed support the uniform distribution minimises the shared-birthday
              probability, so non-uniformity can only increase it. Comparing with the 365-day model
              also changes the number of categories. At n = 23:
            </p>
            <ul className="birthday__assumptions">
              <li>Uniform, 365 days: 0.5072972</li>
              <li>Calendar-weighted (366 dates, 29 Feb at ¼ of an ordinary date): 0.5068650</li>
              <li>Real US distribution, SSA 2000–2014: 0.5079292</li>
              <li>Real US distribution, CDC/NCHS 1994–2003: 0.5079012</li>
              <li>Uniform, 366 days (same support): 0.5063230</li>
            </ul>
            <p>
              The 365-day comparison is not a theorem: it changes the support. The fair comparison
              is against uniform-366. The real distribution lies above both, but only by about
              0.00066–0.0017, peaking at n = 27.
            </p>

            <h3 className="birthday__subheading">Detectability</h3>
            <p>
              The standard error of p̂ at n = 23 is about 0.011 for N = 2000, roughly 17 times the
              0.00063 model gap. Resolving a gap Δ at 3 standard errors needs about 9·p(1−p)/Δ² ≈{' '}
              5.6 million experiments, far above the 20 000 limit. So the exact DP shows the effect
              and the simulation cannot: a lesson about sample size.
            </p>

            <h3 className="birthday__subheading">Where “approximate independence” enters</h3>
            <p>
              The C(n,2) events E_ij = “i and j share a birthday” each have probability 1/365.
              They are <em>pairwise</em> independent — P(E_12 ∩ E_13) = 1/365² = P(E_12)P(E_13) —
              but not <em>mutually</em> independent, since P(E_12 ∩ E_13 ∩ E_23) = 1/365² ≠ 1/365³.
              Treating them as independent gives the exponential approximation, which is a lower
              bound because 1 − x ≤ e^(−x):
            </p>
            <div className="birthday__formula-block">
              <Formula expression={String.raw`P(\text{shared})\approx1-\exp\!\left(-\frac{n(n-1)}{2\cdot365}\right)`} />
            </div>
            <p>
              At n = 23 the approximation gives {exponentialApproxLowerBoundUniform365(23).toFixed(6)}{' '}
              against the exact 0.5072972 — a lower bound for every n.
            </p>

            <h3 className="birthday__subheading">253 pairs versus “me versus any pair”</h3>
            <p>
              With 23 people there are C(23,2) = 253 pairs, each matching with probability 1/365.
              The contrast: the probability that <em>someone</em> matches <em>you</em> is{' '}
              1 − (364/365)^22 ≈ 0.0586, which needs 253 other people to reach 50%. The paradox is
              about <strong>any</strong> pair, not a fixed person.
            </p>

            <h3 className="birthday__subheading">Assumptions</h3>
            <ul className="birthday__assumptions">
              <li>
                Uniform source: {DAYS_UNIFORM} equally likely days, independent birthdays, no
                leap-year effect.
              </li>
              <li>
                Real-data source: independent birthdays drawn from the pooled US distribution (a
                random person, not a random group).
              </li>
              <li>
                The simulation <em>illustrates</em> the result; the proof is the counting argument
                and the exact formulas above.
              </li>
            </ul>
          </div>
        </TheoryCard>
      </div>
    </div>
  )
}

export default Birthday

