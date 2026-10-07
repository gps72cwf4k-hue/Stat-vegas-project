import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import { runLoadedDieSimulation, runLoadedDieSimulationAsync } from '../../simulation/loadedDie.js'
import { getDiePmfs } from '../../math/loadedDie.js'
import DicePmfChart from './DicePmfChart.jsx'
import PosteriorHistogramChart from './PosteriorHistogramChart.jsx'
import CalibrationTable from './CalibrationTable.jsx'
import './LoadedDie.css'

/* UI and engine share the same ranges (the engine also accepts M = 1). */
const DEFAULT_THETA = '0.50'
const DEFAULT_BIAS = '0.50'
const DEFAULT_M = '10'
const DEFAULT_K = '5'
const DEFAULT_EXPERIMENTS = '500'

const MIN_THETA = 0.01
const MAX_THETA = 0.99
const MIN_BIAS = 0.2
const MAX_BIAS = 1
const STEP_BIAS = 0.05
const MIN_M = 1
const MAX_M = 5000
const MIN_EXPERIMENTS = 50
const MAX_EXPERIMENTS = 5000

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/
/* A decimal number (digits, optional single dot, digits). */
const DECIMAL_ONLY = /^\d+(\.\d+)?$/

/** A workload above this triggers a neutral "may take time" note. */
const LARGE_WORKLOAD_THRESHOLD = 1000000

/**
 * Parse and validate an integer field.
 *
 * @param {string} raw - The raw input string.
 * @param {string} name - Field name for the error message.
 * @param {number} min - Inclusive minimum.
 * @param {number} max - Inclusive maximum.
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
 * Parse and validate a probability field (theta or b).
 *
 * @param {string} raw - The raw input string.
 * @param {string} name - Field name for the error message.
 * @param {number} min - Inclusive minimum.
 * @param {number} max - Inclusive maximum.
 * @returns {{ value?: number, error?: string }} The parsed value or an error.
 */
function parseProbabilityField(raw, name, min, max) {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { error: `Enter ${name}.` }
  }
  if (!DECIMAL_ONLY.test(trimmed)) {
    return { error: 'Use a decimal number (no signs or exponents).' }
  }
  const value = Number(trimmed)
  if (value < min || value > max) {
    return { error: `Use a number between ${min} and ${max}.` }
  }
  return { value }
}

/**
 * Parse and validate the optional seed.
 *
 * @param {string} raw - The raw input string.
 * @returns {{ value?: number | null, error?: string }} The seed (or null when
 *   absent) or an error.
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
 * Generate a fresh random seed for a run whose seed field was left empty.
 *
 * @returns {number} A safe integer in [0, 2^31).
 */
function generateSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

/**
 * Format a value as a fixed-decimal string, or an em dash when missing.
 *
 * @param {number} value - The number to format.
 * @param {number} [digits] - Decimal places (default 4).
 * @returns {string} The formatted text.
 */
function formatNumber(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

/**
 * Format a rate as a percentage string with two decimals.
 *
 * @param {number} rate - A rate in [0, 1].
 * @returns {string} The percentage text.
 */
function formatPercent(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

/**
 * Choose the summary verb from the sign of the change.
 *
 * @param {number} change - Signed change in probability (posterior − prior).
 * @returns {'rose'|'fell'|'did not change'} The verb.
 */
function changeVerb(change) {
  if (change > 0) return 'rose'
  if (change < 0) return 'fell'
  return 'did not change'
}

/**
 * The Loaded Die attraction.
 *
 * Uses the shared ControlPanel / ChartPanel / TheoryCard / MetricCard panels.
 * In Simulate mode it runs the bounded asynchronous engine so the browser stays
 * responsive; Manual mode runs the same engine synchronously (no randomness).
 * The last successful result stays visible while a new run is in progress, and
 * late callbacks from an old run are ignored via a run-identity ref. Editing the
 * controls after a run marks the shown result as "from a previous run" but never
 * changes it until Run is pressed again.
 *
 * @returns {import('react').ReactElement} The attraction.
 */
function LoadedDie() {
  const [thetaInput, setThetaInput] = useState(DEFAULT_THETA)
  const [biasInput, setBiasInput] = useState(DEFAULT_BIAS)
  const [mode, setMode] = useState('simulate')
  const [mInput, setMInput] = useState(DEFAULT_M)
  const [kInput, setKInput] = useState(DEFAULT_K)
  const [experimentsInput, setExperimentsInput] = useState(DEFAULT_EXPERIMENTS)
  const [seedInput, setSeedInput] = useState('')

  const [errors, setErrors] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [status, setStatus] = useState('')
  const [runError, setRunError] = useState('')
  const [isStale, setIsStale] = useState(false)
  const [shownSignature, setShownSignature] = useState('')

  // One AbortController per run plus a run-identity guard.
  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

  /** Signature of the controls that produced the shown result. */
  function currentSignature() {
    return [thetaInput, biasInput, mode, mInput, kInput, experimentsInput, seedInput.trim()].join('|')
  }

  /** Mark the shown result as "from a previous run" when the controls change. */
  function markStale() {
    if (snapshot && currentSignature() !== shownSignature) {
      setIsStale(true)
    }
  }

  /** Start a run: abort any previous one and return the new run id. */
  function beginRun() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    const controller = new AbortController()
    controllerRef.current = controller
    runIdRef.current += 1
    return runIdRef.current
  }

  /**
   * Parse and validate the controls.
   *
   * @returns {{ values?: object, errors: object }} Parsed values or field errors.
   */
  function parseInputs() {
    const nextErrors = {}
    const theta = parseProbabilityField(thetaInput, 'the prior probability θ', MIN_THETA, MAX_THETA)
    const bias = parseProbabilityField(biasInput, 'the bias b', MIN_BIAS, MAX_BIAS)
    const m = parseIntField(mInput, 'the number of rolls m', MIN_M, MAX_M)
    const seed = parseSeed(seedInput)

    if (theta.error) nextErrors.theta = theta.error
    if (bias.error) nextErrors.bias = bias.error
    if (m.error) nextErrors.m = m.error
    if (seed.error) nextErrors.seed = seed.error

    let k = 0
    let experiments = MIN_EXPERIMENTS
    if (mode === 'manual') {
      const kParsed = parseIntField(kInput, 'the number of sixes k', 0, MAX_M)
      if (kParsed.error) {
        nextErrors.k = kParsed.error
      } else if (m.value !== undefined && kParsed.value > m.value) {
        nextErrors.k = `k must be between 0 and m = ${m.value}.`
      } else {
        k = kParsed.value
      }
    } else {
      const experimentsParsed = parseIntField(
        experimentsInput,
        'the number of experiments M',
        MIN_EXPERIMENTS,
        MAX_EXPERIMENTS,
      )
      if (experimentsParsed.error) nextErrors.experiments = experimentsParsed.error
      else experiments = experimentsParsed.value
    }

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors }
    }

    return {
      errors: {},
      values: {
        theta: theta.value,
        b: bias.value,
        mode,
        m: m.value,
        k,
        M: experiments,
        providedSeed: seed.value,
      },
    }
  }


  /** Handle the Run button: validate, generate a seed if needed, then run. */
  async function handleRun() {
    const { values, errors: fieldErrors } = parseInputs()
    if (!values) {
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setRunError('')
    setStatus('')

    const runId = beginRun()
    const controller = controllerRef.current
    const hasProvidedSeed = values.providedSeed !== null && values.providedSeed !== undefined
    const seedUsed = hasProvidedSeed ? values.providedSeed : generateSeed()

    setIsRunning(true)

    // Manual mode has no randomness: run it synchronously and immediately.
    if (values.mode === 'manual') {
      setProgress({ completedExperiments: values.M, totalExperiments: values.M })
      try {
        const completed = runLoadedDieSimulation({ ...values, seedUsed })
        if (runIdRef.current !== runId) return
        setSnapshot(completed)
        setShownSignature(currentSignature())
        setIsStale(false)
        setStatus('')
        setRunError('')
      } catch (error) {
        if (runIdRef.current !== runId) return
        setRunError(error && error.message ? error.message : 'Unexpected error during the run.')
      } finally {
        if (runIdRef.current === runId) {
          setIsRunning(false)
          setProgress(null)
        }
      }
      return
    }

    setProgress({ completedExperiments: 0, totalExperiments: values.M })

    try {
      const completed = await runLoadedDieSimulationAsync({
        ...values,
        seedUsed,
        signal: controller.signal,
        onProgress: (next) => {
          // Ignore progress from a superseded run.
          if (runIdRef.current !== runId) return
          setProgress(next)
        },
      })

      if (runIdRef.current !== runId) return

      setSnapshot(completed)
      setShownSignature(currentSignature())
      setIsStale(false)
      setStatus('')
      setRunError('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error && error.name === 'AbortError') {
        setStatus('Run cancelled. The last successful result is kept (if any).')
      } else {
        setRunError(error && error.message ? error.message : 'Unexpected error during the run.')
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

    setThetaInput(DEFAULT_THETA)
    setBiasInput(DEFAULT_BIAS)
    setMode('simulate')
    setMInput(DEFAULT_M)
    setKInput(DEFAULT_K)
    setExperimentsInput(DEFAULT_EXPERIMENTS)
    setSeedInput('')

    setErrors({})
    setIsRunning(false)
    setProgress(null)
    setSnapshot(null)
    setStatus('')
    setRunError('')
    setIsStale(false)
    setShownSignature('')
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

  // Derived display value: requested workload when both fields are valid.
  const parsedM = parseIntField(mInput, 'm', MIN_M, MAX_M)
  const parsedExperiments = parseIntField(
    experimentsInput,
    'M',
    MIN_EXPERIMENTS,
    MAX_EXPERIMENTS,
  )
  const requestedWorkload =
    mode === 'simulate' && parsedM.value !== undefined && parsedExperiments.value !== undefined
      ? parsedM.value * parsedExperiments.value
      : null

  // All displayed values come from the STORED snapshot, so editing the controls
  // after a run never changes what is shown here.
  const display = snapshot

  // The two dice PMFs are a fixed function of b; derive them from the run b
  // (falling back to the current b before any run exists).
  const displayBias = display ? display.inputs.b : Number(biasInput)
  const dicePmfs = useMemo(
    () => (Number.isFinite(displayBias)
      ? getDiePmfs({ b: Math.min(MAX_BIAS, Math.max(MIN_BIAS, displayBias)) })
      : null),
    [displayBias],
  )

  const seedLabel = display
    ? display.inputs.seedUsed === null
      ? 'unseeded (Math.random)'
      : String(display.inputs.seedUsed)
    : ''

  // The b = 1 note follows the CURRENT bias control (a live hint), matching the
  // spec note that appears when b = 1: the loaded die always shows 6.
  const biasIsOne = Number(biasInput) === MAX_BIAS

  // Auto-generated summary obeying the wording rules (sign of the change;
  // randomness in Simulate; conditional on the two-hypothesis model; never
  // "proves").
  const summary = useMemo(() => {
    if (!display) return ''
    const { theta, mode: runMode, m, b } = display.inputs
    const { k, posterior } = display.experiment1
    const verb = changeVerb(posterior - theta)
    const before = formatPercent(theta)
    const after = formatPercent(posterior)
    if (runMode === 'manual') {
      return `After seeing ${k} sixes in ${m} rolls, the posterior probability of a `
        + `loaded die ${verb} from ${before} to ${after}. This is a direct Bayes `
        + `calculation (no randomness) and is conditional on the two-hypothesis model `
        + `(fair vs loaded with bias b = ${b}).`
    }
    return `After seeing ${k} sixes in ${m} rolls (experiment 1), the posterior `
      + `probability of a loaded die ${verb} from ${before} to ${after}. In Simulate `
      + `mode the result is random: the same seed reproduces the run, but one seed is `
      + `one sample. The posterior is conditional on the two-hypothesis model and does `
      + `not prove anything about a real die.`
  }, [display])

  return (
    <div className="loaded-die">
      <div className="loaded-die__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="loaded-die__form">
            <p className="loaded-die__intro">
              A die is either fair or loaded. Observe rolls and update the
              posterior probability that it is loaded (Bayes), then read the
              predictive probability of the next face (total probability).
            </p>

            <div className="loaded-die__field">
              <label className="loaded-die__label" htmlFor="loaded-die-theta">
                Prior P(loaded) (θ)
              </label>
              <input
                id="loaded-die-theta"
                className="input"
                type="text"
                inputMode="decimal"
                value={thetaInput}
                disabled={isRunning}
                aria-invalid={errors.theta ? 'true' : undefined}
                onChange={(e) => {
                  setThetaInput(e.target.value)
                  markStale()
                }}
              />
              {errors.theta ? (
                <p className="loaded-die__error" role="alert">{errors.theta}</p>
              ) : (
                <p className="loaded-die__help">Between {MIN_THETA} and {MAX_THETA}.</p>
              )}
            </div>

            <div className="loaded-die__field">
              <label className="loaded-die__label" htmlFor="loaded-die-bias">
                Bias of the loaded die (b)
              </label>
              <input
                id="loaded-die-bias"
                className="input"
                type="text"
                inputMode="decimal"
                value={biasInput}
                disabled={isRunning}
                aria-invalid={errors.bias ? 'true' : undefined}
                onChange={(e) => {
                  setBiasInput(e.target.value)
                  markStale()
                }}
              />
              {errors.bias ? (
                <p className="loaded-die__error" role="alert">{errors.bias}</p>
              ) : (
                <p className="loaded-die__help">
                  P(six | loaded) between {MIN_BIAS} and {MAX_BIAS}, step {STEP_BIAS}.
                </p>
              )}
              {biasIsOne ? (
                <p className="loaded-die__note">
                  If b = 1, the loaded die always shows 6; observing any non-six
                  rules out the loaded hypothesis (posterior becomes 0).
                </p>
              ) : null}
            </div>

            <div className="loaded-die__field">
              <span className="loaded-die__label">Mode</span>
              <div className="loaded-die__mode" role="radiogroup" aria-label="Simulation mode">
                <label className="loaded-die__mode-option">
                  <input
                    type="radio"
                    name="loaded-die-mode"
                    checked={mode === 'manual'}
                    disabled={isRunning}
                    onChange={() => {
                      setMode('manual')
                      markStale()
                    }}
                  />
                  <span>Manual data</span>
                </label>
                <label className="loaded-die__mode-option">
                  <input
                    type="radio"
                    name="loaded-die-mode"
                    checked={mode === 'simulate'}
                    disabled={isRunning}
                    onChange={() => {
                      setMode('simulate')
                      markStale()
                    }}
                  />
                  <span>Simulate</span>
                </label>
              </div>
            </div>


            <div className="loaded-die__field">
              <label className="loaded-die__label" htmlFor="loaded-die-m">
                Rolls m
              </label>
              <input
                id="loaded-die-m"
                className="input"
                type="text"
                inputMode="numeric"
                value={mInput}
                disabled={isRunning}
                aria-invalid={errors.m ? 'true' : undefined}
                onChange={(e) => {
                  setMInput(e.target.value)
                  markStale()
                }}
              />
              {errors.m ? (
                <p className="loaded-die__error" role="alert">{errors.m}</p>
              ) : (
                <p className="loaded-die__help">Whole number between {MIN_M} and {MAX_M}.</p>
              )}
            </div>

            {mode === 'manual' ? (
              <div className="loaded-die__field">
                <label className="loaded-die__label" htmlFor="loaded-die-k">
                  Sixes k
                </label>
                <input
                  id="loaded-die-k"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  value={kInput}
                  disabled={isRunning}
                  aria-invalid={errors.k ? 'true' : undefined}
                  onChange={(e) => {
                    setKInput(e.target.value)
                    markStale()
                  }}
                />
                {errors.k ? (
                  <p className="loaded-die__error" role="alert">{errors.k}</p>
                ) : (
                  <p className="loaded-die__help">Whole number between 0 and m.</p>
                )}
              </div>
            ) : (
              <div className="loaded-die__field">
                <label className="loaded-die__label" htmlFor="loaded-die-experiments">
                  Experiments (M)
                </label>
                <input
                  id="loaded-die-experiments"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  value={experimentsInput}
                  disabled={isRunning}
                  aria-invalid={errors.experiments ? 'true' : undefined}
                  onChange={(e) => {
                    setExperimentsInput(e.target.value)
                    markStale()
                  }}
                />
                {errors.experiments ? (
                  <p className="loaded-die__error" role="alert">{errors.experiments}</p>
                ) : (
                  <p className="loaded-die__help">
                    Whole number between {MIN_EXPERIMENTS} and {MAX_EXPERIMENTS}.
                  </p>
                )}
              </div>
            )}

            <div className="loaded-die__field">
              <label className="loaded-die__label" htmlFor="loaded-die-seed">
                Seed (optional)
              </label>
              <input
                id="loaded-die-seed"
                className="input"
                type="text"
                inputMode="numeric"
                value={seedInput}
                placeholder="leave empty for a random seed"
                disabled={isRunning}
                aria-invalid={errors.seed ? 'true' : undefined}
                onChange={(e) => {
                  setSeedInput(e.target.value)
                  markStale()
                }}
              />
              {errors.seed ? (
                <p className="loaded-die__error" role="alert">{errors.seed}</p>
              ) : (
                <p className="loaded-die__help">
                  Nonnegative whole number. If empty, a random seed is generated and
                  shown so the run can be reproduced.
                </p>
              )}
            </div>

            {requestedWorkload !== null && requestedWorkload >= LARGE_WORKLOAD_THRESHOLD ? (
              <p className="loaded-die__help">
                This run needs {requestedWorkload.toLocaleString()} rolls; it may take
                a moment. You can cancel at any time.
              </p>
            ) : null}

            <div className="loaded-die__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleRun}
                disabled={isRunning}
              >
                Run
              </button>
              <button
                type="button"
                className="button"
                onClick={handleCancel}
                disabled={!isRunning}
              >
                Cancel
              </button>
              <button type="button" className="button" onClick={handleReset}>
                Reset
              </button>
            </div>

            {progress ? (
              <div className="loaded-die__progress">
                <p className="loaded-die__progress-text">
                  {progress.completedExperiments} / {progress.totalExperiments} experiments
                </p>
                <progress
                  value={progress.completedExperiments}
                  max={progress.totalExperiments}
                />
              </div>
            ) : null}

            {status ? <p className="loaded-die__status">{status}</p> : null}
            {runError ? <p className="loaded-die__error" role="alert">{runError}</p> : null}
          </div>
        </ControlPanel>


        {/* --- Results ---------------------------------------------------- */}
        <ChartPanel title="Results" summary={summary || undefined}>
          {!display ? (
            <p className="loaded-die__empty">
              Set the prior θ, the bias b and a mode, then press Run. Manual mode
              computes the posterior from the (m, k) you enter; Simulate mode
              draws the true die type and the rolls.
            </p>
          ) : (
            <div className="loaded-die__results">
              {isStale ? (
                <p className="loaded-die__stale">
                  These results are from a previous run. Press Run to update them.
                </p>
              ) : null}

              <dl className="loaded-die__meta">
                <dt>Mode</dt>
                <dd>{display.inputs.mode === 'manual' ? 'Manual data' : 'Simulate'}</dd>
                <dt>Prior θ</dt>
                <dd>{formatPercent(display.inputs.theta)}</dd>
                <dt>Bias b</dt>
                <dd>{display.inputs.b}</dd>
                <dt>Rolls m</dt>
                <dd>{display.inputs.m.toLocaleString()}</dd>
                {display.inputs.mode === 'manual' ? (
                  <>
                    <dt>Sixes k</dt>
                    <dd>{display.experiment1.k}</dd>
                  </>
                ) : (
                  <>
                    <dt>Experiments (M)</dt>
                    <dd>{display.inputs.M.toLocaleString()}</dd>
                    <dt>Seed used</dt>
                    <dd>{seedLabel}</dd>
                  </>
                )}
              </dl>

              <div className="loaded-die__metrics">
                <MetricCard
                  label="Prior P(loaded)"
                  value={formatPercent(display.inputs.theta)}
                  description="before the data"
                />
                <MetricCard
                  label="Posterior P(loaded | data)"
                  value={formatPercent(display.experiment1.posterior)}
                  description={`experiment 1: ${display.experiment1.k} sixes in ${display.inputs.m}`}
                />
                <MetricCard
                  label="Change (posterior − prior)"
                  value={`${display.summaryMetrics.changeInPercentagePoints >= 0 ? '+' : ''}`
                    + `${display.summaryMetrics.changeInPercentagePoints.toFixed(2)} pp`}
                  description="signed, percentage points (pp)"
                />
                <MetricCard
                  label="Bayes factor"
                  value={formatNumber(Math.pow(10, display.experiment1.bayesFactorLog10), 4)}
                  description={`log10(BF) = ${formatNumber(display.experiment1.bayesFactorLog10, 4)}`}
                />
                <MetricCard
                  label="Prior odds"
                  value={Number.isFinite(display.experiment1.priorOdds)
                    ? formatNumber(display.experiment1.priorOdds, 4)
                    : '∞'}
                  description="θ / (1 − θ)"
                />
                <MetricCard
                  label="Posterior odds"
                  value={Number.isFinite(display.experiment1.posteriorOdds)
                    ? formatNumber(display.experiment1.posteriorOdds, 4)
                    : '∞'}
                  description="prior odds × BF"
                />
                <MetricCard
                  label="P(next = 6), before"
                  value={formatPercent(display.experiment1.predictiveSixBefore)}
                  description="prior-predictive"
                />
                <MetricCard
                  label="P(next = 6), after"
                  value={formatPercent(display.experiment1.predictiveSixAfter)}
                  description="posterior-predictive (experiment 1)"
                />
                {display.inputs.mode === 'simulate' ? (
                  <>
                    <MetricCard
                      label="True type (experiment 1)"
                      value={display.experiment1.trueType ? 'Loaded' : 'Fair'}
                      description="revealed after the run"
                    />
                    <MetricCard
                      label="Mean posterior (M experiments)"
                      value={formatNumber(display.summaryMetrics.meanPosterior, 4)}
                      description={`prior θ = ${formatPercent(display.inputs.theta)}`}
                    />
                    <MetricCard
                      label="SE bound 0.5 / √M"
                      value={formatNumber(display.summaryMetrics.seBound, 4)}
                      description="|mean posterior − θ| should be within a few SE"
                    />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </ChartPanel>


        {/* --- Charts + checks ------------------------------------------- */}
        <ChartPanel title="Distribution & checks">
          {!display ? (
            <p className="loaded-die__empty">
              The dice PMFs, the posterior histogram across experiments and the
              calibration table appear here after a run.
            </p>
          ) : (
            <div className="loaded-die__results">
              {dicePmfs ? (
                <DicePmfChart
                  fairPmf={dicePmfs.fairPmf}
                  loadedPmf={dicePmfs.loadedPmf}
                  b={display.inputs.b}
                />
              ) : null}

              {display.inputs.mode === 'simulate' ? (
                <>
                  <PosteriorHistogramChart
                    posterior={display.experiments.posterior}
                    trueType={display.experiments.trueType}
                    overlay={display.exactOverlay}
                    M={display.inputs.M}
                  />
                  <CalibrationTable bins={display.calibration} />
                </>
              ) : (
                <p className="loaded-die__help">
                  The histogram of posteriors, the mean-posterior check and the
                  calibration table describe a Simulate run across M experiments.
                  Switch to Simulate mode to see them.
                </p>
              )}
            </div>
          )}
        </ChartPanel>
      </div>

      {/* --- Theory (last block, full width) ---------------------------- */}
      <section className="loaded-die__theory-row">
        <TheoryCard title="Theory" distributionLabel="Bayes · Total probability">
          <div className="loaded-die__theory">
            <div className="loaded-die__badges">
              <span className="loaded-die__badge">Bayes</span>
              <span className="loaded-die__badge">Total probability</span>
            </div>

            <h3>Two hypotheses and two dice</h3>
            <p>
              The die is either fair (H<sub>F</sub>) or loaded (H<sub>L</sub>), with
              prior P(H<sub>L</sub>) = θ. The fair die is uniform on 1..6; the loaded
              die shows 6 with probability b and each of 1..5 with probability
              (1 − b)/5.
            </p>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(X=k\mid H_F)=\tfrac16,\qquad
P(X=6\mid H_L)=b,\qquad P(X=k\mid H_L)=\tfrac{1-b}{5}\ (k=1,\dots,5)`}
              />
            </div>

            <h3>Bayes and total probability</h3>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(H_L\mid D)=\frac{P(D\mid H_L)\,P(H_L)}{P(D)},
\qquad
P(D)=P(D\mid H_L)\,\theta+P(D\mid H_F)\,(1-\theta)`}
              />
            </div>
            <p>
              The denominator is the law of total probability over the partition
              {' {'}H<sub>L</sub>, H<sub>F</sub>{'}'}.
            </p>

            <h3>Likelihoods and the Bayes factor</h3>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(D\mid H_L)=\binom{m}{k}b^{k}(1-b)^{m-k},\qquad
P(D\mid H_F)=\binom{m}{k}\Big(\tfrac16\Big)^{k}\Big(\tfrac56\Big)^{m-k}`}
              />
            </div>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`\mathrm{BF}=\frac{P(D\mid H_L)}{P(D\mid H_F)}
=(6b)^{k}\Big(\frac{6(1-b)}{5}\Big)^{m-k},\qquad
\text{posterior odds}=\frac{\theta}{1-\theta}\cdot\mathrm{BF}`}
              />
            </div>
            <p>
              The binomial coefficient cancels, so the data enter only through the
              count of sixes k. For b = 0.5, BF = 3<sup>k</sup> · 0.6<sup>m−k</sup>:
              each six multiplies the odds by 3, each non-six by 0.6.
            </p>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`\operatorname{logit}P(H_L\mid D)=\operatorname{logit}\theta
+k\ln(6b)+(m-k)\ln\frac{6(1-b)}{5}`}
              />
            </div>
            <p>
              The posterior is evaluated from this log-odds with a stable sigmoid,
              which never builds 3<sup>k</sup> directly and so avoids overflow for
              large m.
            </p>

            <h3>Predictive probability of the next face</h3>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(X_{m+1}=j\mid D)=P(X=j\mid H_L)\,p+P(X=j\mid H_F)\,(1-p),
\qquad p=P(H_L\mid D)`}
              />
            </div>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(X_{m+1}=6\mid D)=b\,p+\tfrac16(1-p)`}
              />
            </div>
            <p>
              This is a convex combination, so it lies between 1/6 and b. Before
              any data, replace p by θ. At θ = 0.5, b = 0.5 the next roll shows 6
              with probability 1/3 before data and 5/12 after one six.
            </p>

            <h3>Independent only given the die type</h3>
            <p>
              Conditional on the type the rolls are independent. Unconditionally
              they are positively dependent: seeing a six makes a loaded die more
              likely, which makes another six more likely.
            </p>
            <div className="loaded-die__formula-block">
              <Formula
                expression={String.raw`P(6,6)-P(6)^2=\theta(1-\theta)\Big(b-\tfrac16\Big)^{2}>0
\quad(0<\theta<1,\ b\neq\tfrac16)`}
              />
            </div>
            <p>
              At the defaults θ = 0.5, b = 0.5: P(6,6) = 0.5·0.25 + 0.5/36 ≈ 0.1389,
              which exceeds P(6)<sup>2</sup> = (1/3)<sup>2</sup> ≈ 0.1111.
            </p>

            <h3>Assumptions</h3>
            <ul>
              <li>Rolls are independent given the die type; exactly two hypotheses.</li>
              <li>The count of sixes is sufficient (both dice are uniform on the non-six faces).</li>
              <li>
                The posterior is a degree of belief conditional on the model; in the
                simulation it also becomes a long-run frequency (the calibration check).
              </li>
            </ul>
          </div>
        </TheoryCard>
      </section>
    </div>
  )
}

export default LoadedDie

