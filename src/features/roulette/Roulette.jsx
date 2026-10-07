import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import { EUROPEAN_ROULETTE, getRouletteColour, getRouletteProbabilities } from '../../math/roulette.js'
import { buildRouletteCountChartData } from '../../math/rouletteCountChartData.js'
import { buildRouletteWaitingChartData } from '../../math/rouletteWaitingChartData.js'
import { runRouletteSimulationAsync } from '../../simulation/roulette.js'
import RouletteCountChart from './RouletteCountChart.jsx'
import RouletteWaitingChart from './RouletteWaitingChart.jsx'
import './Roulette.css'

/* UI and engine share the same range; the engine also accepts N=1. */
const DEFAULT_SPINS = '100'
const DEFAULT_EXPERIMENTS = '500'
const DEFAULT_EVENT = 'red'
const DEFAULT_JACKPOT = '0'

const MIN_SPINS = 1
const MAX_SPINS = 5000
const MIN_EXPERIMENTS = 50
const MAX_EXPERIMENTS = 5000
const MIN_POCKET = EUROPEAN_ROULETTE.minPocket
const MAX_POCKET = EUROPEAN_ROULETTE.maxPocket

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

const EVENT_OPTIONS = [
  { value: 'red', label: 'Red' },
  { value: 'black', label: 'Black' },
  { value: 'green', label: 'Green (zero)' },
  { value: 'straight-up', label: 'Straight-up jackpot' },
]

/** A workload above this triggers a neutral "may take time" note. */
const LARGE_WORKLOAD_THRESHOLD = 2000000

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
 * Format a rate as a percentage string with three decimals.
 *
 * @param {number} rate - A rate in [0, 1].
 * @returns {string} The percentage text.
 */
function formatPercent(rate) {
  return `${(rate * 100).toFixed(3)}%`
}

/**
 * Exact single-spin probability for a supported event, taken from the shared
 * `getRouletteProbabilities()` API (no duplicated or rounded constants).
 *
 * @param {'red'|'black'|'green'|'straight-up'} eventName - Event identifier.
 * @param {{ red: number, black: number, green: number, straightUp: number }} theory
 *   - The probability object from `getRouletteProbabilities()`.
 * @returns {number} The single-spin probability for the event.
 */
function probabilityForEvent(eventName, theory) {
  if (eventName === 'black') return theory.black
  if (eventName === 'green') return theory.green
  if (eventName === 'straight-up') return theory.straightUp
  return theory.red
}

/**
 * Human-readable label for a supported event.
 *
 * @param {'red'|'black'|'green'|'straight-up'} eventName - Event identifier.
 * @param {number} jackpotPocket - Straight-up target pocket.
 * @returns {string} The display label.
 */
function eventLabel(eventName, jackpotPocket) {
  if (eventName === 'straight-up') return `Straight-up jackpot (number ${jackpotPocket})`
  if (eventName === 'green') return 'Green (zero)'
  if (eventName === 'black') return 'Black'
  return 'Red'
}

/**
 * Render the outcome-sample chips for the first experiment.
 *
 * @param {object} props
 * @param {number[]} props.pockets - Sample pocket numbers (up to 20).
 * @returns {import('react').ReactElement} The chips block.
 */
function SampleChips({ pockets }) {
  return (
    <div className="roulette__sample">
      <p className="roulette__sample-title">
        First spins of the first experiment (up to 20)
      </p>
      <ul className="roulette__chips">
        {pockets.map((pocket, index) => {
          const colour = getRouletteColour(pocket)
          const colourName = colour.charAt(0).toUpperCase() + colour.slice(1)
          return (
            <li
              key={index}
              className={`roulette__chip roulette__chip--${colour}`}
            >
              <span className="roulette__chip-number">{pocket}</span>
              <span className="roulette__chip-colour">{colourName}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The Roulette & Rare Jackpot attraction.
 *
 * Uses the shared ControlPanel / ChartPanel / TheoryCard / MetricCard panels.
 * Runs the bounded asynchronous engine so the browser stays responsive, keeps
 * the last successful result visible while a new run is in progress, and guards
 * against late callbacks from an old run (via a run-identity ref).
 *
 * @returns {import('react').ReactElement} The attraction.
 */
function Roulette() {
  const [spinsInput, setSpinsInput] = useState(DEFAULT_SPINS)
  const [experimentsInput, setExperimentsInput] = useState(DEFAULT_EXPERIMENTS)
  const [event, setEvent] = useState(DEFAULT_EVENT)
  const [jackpotInput, setJackpotInput] = useState(DEFAULT_JACKPOT)
  const [seedInput, setSeedInput] = useState('')

  const [errors, setErrors] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [runMeta, setRunMeta] = useState(null)
  const [status, setStatus] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [isStale, setIsStale] = useState(false)
  // Presentation-only view toggle; never affects controls, results or the engine.
  const [view, setView] = useState('count')

  // One AbortController per run plus a run-identity guard.
  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

  const theory = getRouletteProbabilities()
  const isStraightUp = event === 'straight-up'

  // Probability for the CURRENT selection, used only before a run exists (to
  // explain the current valid selection, not a completed run).
  const selectedProbability = probabilityForEvent(event, theory)

  // Once a result exists, ALL comparisons come from the STORED run metadata so
  // edited controls never change the theory shown for a completed run.
  const displayProbability = runMeta ? probabilityForEvent(runMeta.event, theory) : null
  const displayTheoreticalMean = runMeta ? runMeta.spins * displayProbability : null

  // Poisson approximation applies to rare events only (green / straight-up),
  // following the displayed run when one exists, otherwise the current selection.
  const theoryEvent = runMeta ? runMeta.event : event
  const isRareEvent = theoryEvent === 'green' || theoryEvent === 'straight-up'

  // Values used by the KaTeX theory: the stored run when one exists, otherwise
  // the current valid selection (not presented as completed-run theory).
  const theoryN = runMeta ? runMeta.spins : null
  const theoryP = runMeta ? displayProbability : selectedProbability

  // Chart data belongs to the DISPLAYED (stored) run: it only changes when the
  // stored result changes, never on a progress update or an input edit.
  const chartData = useMemo(() => {
    if (!result || !runMeta) return null
    return buildRouletteCountChartData({
      spins: runMeta.spins,
      experiments: runMeta.experiments,
      countHistogram: result.countHistogram,
      probability: probabilityForEvent(runMeta.event, getRouletteProbabilities()),
      includePoisson: runMeta.event === 'green' || runMeta.event === 'straight-up',
    })
  }, [result, runMeta])

  // Waiting-time chart data also belongs to the stored run only; reused as-is
  // when switching views (no recomputation on toggle).
  const waitingChartData = useMemo(() => {
    if (!result || !runMeta) return null
    return buildRouletteWaitingChartData({
      spins: runMeta.spins,
      experiments: runMeta.experiments,
      firstHitHistogram: result.firstHitHistogram,
      censoredCount: result.censoredCount,
      probability: probabilityForEvent(runMeta.event, getRouletteProbabilities()),
    })
  }, [result, runMeta])

  /**
   * Read, validate and normalise the current inputs.
   *
   * @returns {{ values?: object, errors: object }} Parsed values or field errors.
   */
  function parseInputs() {
    const nextErrors = {}
    const spins = parseIntField(spinsInput, 'the number of spins per experiment', MIN_SPINS, MAX_SPINS)
    const experiments = parseIntField(
      experimentsInput,
      'the number of experiments',
      MIN_EXPERIMENTS,
      MAX_EXPERIMENTS,
    )
    const seed = parseSeed(seedInput)

    if (spins.error) nextErrors.spins = spins.error
    if (experiments.error) nextErrors.experiments = experiments.error
    if (seed.error) nextErrors.seed = seed.error

    // The jackpot field is only consulted for straight-up targets.
    let jackpotPocket = 0
    if (isStraightUp) {
      const jackpot = parseIntField(jackpotInput, 'the jackpot number', MIN_POCKET, MAX_POCKET)
      if (jackpot.error) nextErrors.jackpot = jackpot.error
      else jackpotPocket = jackpot.value
    }

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors }
    }

    return {
      errors: {},
      values: {
        spins: spins.value,
        experiments: experiments.value,
        event,
        jackpotPocket,
        seed: seed.value === null ? undefined : seed.value,
      },
    }
  }


  /**
   * Mark completed results as stale after a control edit (keep them visible).
   */
  function markStale() {
    setIsStale(true)
    setStatus('')
    setRuntimeError('')
  }

  /**
   * Abort any active run and return the new run identity.
   *
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

  /**
   * Handle the Run button: validate, then start a bounded async run.
   */
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

    const runId = beginRun()
    const controller = controllerRef.current
    setIsRunning(true)
    setProgress({ completedExperiments: 0, totalExperiments: values.experiments })

    try {
      const completedResult = await runRouletteSimulationAsync({
        ...values,
        signal: controller.signal,
        onProgress: (next) => {
          // Ignore progress from a superseded run.
          if (runIdRef.current !== runId) return
          setProgress(next)
        },
      })

      if (runIdRef.current !== runId) return

      setResult(completedResult)
      setRunMeta({
        event: values.event,
        jackpotPocket: values.jackpotPocket,
        spins: values.spins,
        experiments: values.experiments,
        totalSpins: completedResult.totalSpins,
        seed: values.seed === undefined ? null : values.seed,
      })
      setStatus('')
      setRuntimeError('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error && error.name === 'AbortError') {
        // Cancellation keeps the last successful result and shows a note.
        setStatus('Run cancelled.')
      } else {
        setRuntimeError(
          error && error.message ? error.message : 'Unexpected error during the run.',
        )
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false)
        setProgress(null)
      }
    }
  }

  /**
   * Handle the Cancel button: abort the active run without publishing results.
   */
  function handleCancel() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
  }

  /**
   * Handle the Reset button: abort, restore defaults and clear everything.
   */
  function handleReset() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    runIdRef.current += 1
    controllerRef.current = null

    setSpinsInput(DEFAULT_SPINS)
    setExperimentsInput(DEFAULT_EXPERIMENTS)
    setEvent(DEFAULT_EVENT)
    setJackpotInput(DEFAULT_JACKPOT)
    setSeedInput('')

    setErrors({})
    setIsRunning(false)
    setProgress(null)
    setResult(null)
    setRunMeta(null)
    setStatus('')
    setRuntimeError('')
    setIsStale(false)
    setView('count')
  }


  /** Abort active work on unmount so callbacks cannot update a gone component. */
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
      // Invalidate run identity so any in-flight callback is ignored.
      runIdRef.current += 1
    }
  }, [])

  // Derived display value: requested total spins when both fields are valid.
  const parsedSpins = parseIntField(spinsInput, 'n', MIN_SPINS, MAX_SPINS)
  const parsedExperiments = parseIntField(
    experimentsInput,
    'N',
    MIN_EXPERIMENTS,
    MAX_EXPERIMENTS,
  )
  const requestedTotal =
    parsedSpins.value !== undefined && parsedExperiments.value !== undefined
      ? parsedSpins.value * parsedExperiments.value
      : null

  const seedLabel = runMeta
    ? runMeta.seed === null
      ? 'Unseeded'
      : String(runMeta.seed)
    : ''

  return (
    <div className="roulette">
      <div className="roulette__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="roulette__form">
            <p className="roulette__intro">
              Each experiment contains n independent spins. N experiments produce
              a distribution of event counts.
            </p>

            <div className="roulette__field">
              <label className="roulette__label" htmlFor="roulette-spins">
                Spins per experiment (n)
              </label>
              <input
                id="roulette-spins"
                className="input"
                type="text"
                inputMode="numeric"
                value={spinsInput}
                disabled={isRunning}
                aria-invalid={errors.spins ? 'true' : undefined}
                aria-describedby={errors.spins ? 'roulette-spins-error' : undefined}
                onChange={(e) => {
                  setSpinsInput(e.target.value)
                  markStale()
                }}
              />
              {errors.spins ? (
                <p className="roulette__error" id="roulette-spins-error" role="alert">
                  {errors.spins}
                </p>
              ) : (
                <p className="roulette__help">Whole number between {MIN_SPINS} and {MAX_SPINS}.</p>
              )}
            </div>

            <div className="roulette__field">
              <label className="roulette__label" htmlFor="roulette-experiments">
                Number of experiments (N)
              </label>
              <input
                id="roulette-experiments"
                className="input"
                type="text"
                inputMode="numeric"
                value={experimentsInput}
                disabled={isRunning}
                aria-invalid={errors.experiments ? 'true' : undefined}
                aria-describedby={errors.experiments ? 'roulette-experiments-error' : undefined}
                onChange={(e) => {
                  setExperimentsInput(e.target.value)
                  markStale()
                }}
              />
              {errors.experiments ? (
                <p className="roulette__error" id="roulette-experiments-error" role="alert">
                  {errors.experiments}
                </p>
              ) : (
                <p className="roulette__help">
                  Whole number between {MIN_EXPERIMENTS} and {MAX_EXPERIMENTS}.
                </p>
              )}
            </div>

            <div className="roulette__field">
              <label className="roulette__label" htmlFor="roulette-event">
                Target event
              </label>
              <select
                id="roulette-event"
                className="input"
                value={event}
                disabled={isRunning}
                onChange={(e) => {
                  setEvent(e.target.value)
                  markStale()
                }}
              >
                {EVENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isStraightUp ? (
                <p className="roulette__help">
                  A hit on one selected number, not a separate jackpot lottery.
                </p>
              ) : null}
            </div>

            {isStraightUp ? (
              <div className="roulette__field">
                <label className="roulette__label" htmlFor="roulette-jackpot">
                  Jackpot number
                </label>
                <input
                  id="roulette-jackpot"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  value={jackpotInput}
                  disabled={isRunning}
                  aria-invalid={errors.jackpot ? 'true' : undefined}
                  aria-describedby={errors.jackpot ? 'roulette-jackpot-error' : undefined}
                  onChange={(e) => {
                    setJackpotInput(e.target.value)
                    markStale()
                  }}
                />
                {errors.jackpot ? (
                  <p className="roulette__error" id="roulette-jackpot-error" role="alert">
                    {errors.jackpot}
                  </p>
                ) : (
                  <p className="roulette__help">
                    Whole number between {MIN_POCKET} and {MAX_POCKET}.
                  </p>
                )}
              </div>
            ) : null}

            <div className="roulette__field">
              <label className="roulette__label" htmlFor="roulette-seed">
                Seed (optional)
              </label>
              <input
                id="roulette-seed"
                className="input"
                type="text"
                inputMode="numeric"
                value={seedInput}
                disabled={isRunning}
                aria-invalid={errors.seed ? 'true' : undefined}
                aria-describedby={errors.seed ? 'roulette-seed-error' : undefined}
                onChange={(e) => {
                  setSeedInput(e.target.value)
                  markStale()
                }}
              />
              {errors.seed ? (
                <p className="roulette__error" id="roulette-seed-error" role="alert">
                  {errors.seed}
                </p>
              ) : (
                <p className="roulette__help">
                  Leave empty for a non-reproducible run. Seed 0 is valid.
                </p>
              )}
            </div>

            {requestedTotal !== null ? (
              <p className="roulette__note">
                Requested total spins: {requestedTotal.toLocaleString()}.
                {requestedTotal > LARGE_WORKLOAD_THRESHOLD
                  ? ' Large workloads run in the browser and may take a while.'
                  : ''}
              </p>
            ) : null}

            <div className="roulette__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleRun}
                disabled={isRunning}
              >
                Run simulation
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

            {isRunning && progress ? (
              <div className="roulette__progress">
                <progress
                  value={progress.completedExperiments}
                  max={progress.totalExperiments}
                  aria-label="Simulation progress"
                />
                <p className="roulette__progress-text">
                  {progress.completedExperiments} / {progress.totalExperiments} experiments
                </p>
              </div>
            ) : null}
          </div>
        </ControlPanel>



        {/* --- Results ---------------------------------------------------- */}
        <ChartPanel>
          {runtimeError ? (
            <p className="roulette__error-banner" role="alert">
              {runtimeError}
            </p>
          ) : null}

          {status ? <p className="roulette__status">{status}</p> : null}

          {result && runMeta ? (
            <div className="roulette__results">
              {isRunning ? (
                <p className="roulette__stale">
                  Previous results. A new run is in progress.
                </p>
              ) : isStale ? (
                <p className="roulette__stale">
                  Results from previous run. Run again to apply your changes.
                </p>
              ) : null}

              <dl className="roulette__meta">
                <dt>Event</dt>
                <dd>{eventLabel(runMeta.event, runMeta.jackpotPocket)}</dd>
                <dt>Spins per experiment</dt>
                <dd>{runMeta.spins}</dd>
                <dt>Experiments</dt>
                <dd>{runMeta.experiments}</dd>
                <dt>Total spins</dt>
                <dd>{runMeta.totalSpins.toLocaleString()}</dd>
                <dt>Seed</dt>
                <dd>{seedLabel}</dd>
              </dl>

              {/* Presentation-only view switch: never reruns the engine. */}
              <div className="roulette__viewswitch" role="group" aria-label="Result view">
                <button
                  type="button"
                  className={
                    view === 'count'
                      ? 'roulette__viewswitch-button roulette__viewswitch-button--active'
                      : 'roulette__viewswitch-button'
                  }
                  aria-pressed={view === 'count'}
                  onClick={() => setView('count')}
                >
                  Event count
                </button>
                <button
                  type="button"
                  className={
                    view === 'waiting'
                      ? 'roulette__viewswitch-button roulette__viewswitch-button--active'
                      : 'roulette__viewswitch-button'
                  }
                  aria-pressed={view === 'waiting'}
                  onClick={() => setView('waiting')}
                >
                  Waiting time
                </button>
              </div>

              {view === 'count' ? (
                <>
                  {chartData ? <RouletteCountChart data={chartData} /> : null}

                  <div className="roulette__groups">
                <div>
                  <h3 className="roulette__group-title">Single-spin event rate</h3>
                  <div className="roulette__metrics">
                    <MetricCard
                      label="Empirical rate"
                      value={formatPercent(result.empiricalEventRate)}
                      description="total event hits / total spins"
                    />
                    <MetricCard
                      label="Theoretical probability p"
                      value={formatPercent(displayProbability)}
                      description="from the exact single-spin rules"
                    />
                    <MetricCard
                      label="Absolute difference"
                      value={`${(100 * Math.abs(result.empiricalEventRate - displayProbability)).toFixed(3)} pp`}
                      description="percentage points (never negative)"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="roulette__group-title">Event count per experiment</h3>
                  <div className="roulette__metrics">
                    <MetricCard
                      label="Empirical mean count"
                      value={result.meanEventCount.toFixed(4)}
                      description="total event hits / N"
                    />
                    <MetricCard
                      label="Theoretical mean n·p"
                      value={displayTheoreticalMean.toFixed(4)}
                      description="expected hits per experiment"
                    />
                    <MetricCard
                      label="Absolute difference"
                      value={Math.abs(result.meanEventCount - displayTheoreticalMean).toFixed(4)}
                      description="in hits (never negative)"
                    />
                  </div>
                  <p className="roulette__hits">
                    Total event hits: {result.totalEventHits.toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="roulette__chart-caption">
                Bars: N experiments of n spins each. Binomial is exact under the
                independent-spin assumption; Poisson is an approximation when
                shown. Random deviations from theory remain possible regardless of
                sample size.
              </p>
                </>
              ) : (
                <>
                  {waitingChartData ? <RouletteWaitingChart data={waitingChartData} /> : null}

                  {waitingChartData ? (
                    <>
                      <div className="roulette__groups">
                        <div>
                          <h3 className="roulette__group-title">Observed vs censored</h3>
                          <div className="roulette__metrics">
                            <MetricCard
                              label="With a first hit"
                              value={waitingChartData.observedExperiments.toLocaleString()}
                              description="experiments with an event within n spins"
                            />
                            <MetricCard
                              label="No hit within n spins"
                              value={waitingChartData.censoredCount.toLocaleString()}
                              description="right-censored at n"
                            />
                            <MetricCard
                              label="Empirical censored fraction"
                              value={formatPercent(waitingChartData.empiricalCensoredFraction)}
                              description="censoredCount / N"
                            />
                            <MetricCard
                              label="Theoretical P(T > n)"
                              value={formatPercent(waitingChartData.theoreticalCensoredProbability)}
                              description="from the Geometric tail"
                            />
                            <MetricCard
                              label="Absolute difference"
                              value={`${(100 * Math.abs(waitingChartData.empiricalCensoredFraction - waitingChartData.theoreticalCensoredProbability)).toFixed(3)} pp`}
                              description="percentage points (never negative)"
                            />
                          </div>
                        </div>

                        <div>
                          <h3 className="roulette__group-title">Waiting time in spins</h3>
                          <div className="roulette__metrics">
                            <MetricCard
                              label="Restricted mean (empirical)"
                              value={waitingChartData.empiricalRestrictedMean.toFixed(4)}
                              description="mean of min(T, n)"
                            />
                            <MetricCard
                              label="Restricted mean (theoretical)"
                              value={waitingChartData.theoreticalRestrictedMean.toFixed(4)}
                              description="E[min(T, n)] = (1 − (1−p)^n) / p"
                            />
                            <MetricCard
                              label="Absolute difference"
                              value={Math.abs(
                                waitingChartData.empiricalRestrictedMean -
                                  waitingChartData.theoreticalRestrictedMean,
                              ).toFixed(4)}
                              description="in spins (never negative)"
                            />
                            <MetricCard
                              label="Full mean E[T] = 1/p"
                              value={waitingChartData.fullMean.toFixed(4)}
                              description="full Geometric mean, not the restricted mean"
                            />
                          </div>
                        </div>
                      </div>

                      <p className="roulette__chart-caption">
                        Runs without a hit are censored at n. The restricted mean
                        measures min(T, n), not the full waiting time.
                      </p>
                    </>
                  ) : null}
                </>
              )}

              <SampleChips pockets={result.samplePockets} />
            </div>
          ) : (
            <p className="roulette__empty">
              Run a simulation to compare experimental results with theory.
            </p>
          )}
        </ChartPanel>


        {/* --- Theory ----------------------------------------------------- */}
        <TheoryCard distributionLabel={view === 'count' ? 'Bernoulli / Binomial' : 'Geometric'}>
          <div className="roulette__theory">
            <p>
              European roulette has 37 equally likely pockets: 18 red, 18 black,
              and one green (zero). Spins are independent, so an event on one spin
              does not change the next.
            </p>

            {view === 'count' ? (
              <>
                <p>
                  A single spin is a Bernoulli indicator: it is 1 with probability p
                  and 0 otherwise. Let X be that indicator for one spin. Over n
                  independent spins the number of event hits is the count K.
                </p>
            <div className="roulette__formula-block">
              <Formula expression={String.raw`X \sim \operatorname{Bernoulli}(p)`} />
            </div>
            <div className="roulette__formula-block">
              <Formula expression={String.raw`K \sim \operatorname{Binomial}(n,\, p)`} />
            </div>
            <div className="roulette__formula-block">
              <Formula
                expression={String.raw`P(K = k) = \binom{n}{k}\, p^{k}\, (1-p)^{\,n-k}`}
              />
            </div>
            <div className="roulette__formula-block">
              <Formula expression={String.raw`E[K] = n\,p, \qquad \operatorname{Var}(K) = n\,p\,(1-p)`} />
            </div>
            <p>
              Here n is the number of spins per experiment, p is the single-spin
              probability of the chosen event, and k is a whole number of hits
              (0 to n). X is the one-spin indicator; K is the count across n
              spins — they are different variables.
            </p>

            {result && runMeta ? (
              <>
                <h3 className="roulette__subheading">Theory for displayed run</h3>
                <p>
                  For {eventLabel(runMeta.event, runMeta.jackpotPocket)} the
                  single-spin probability is p ={' '}
                  {formatPercent(displayProbability)}. Over n = {runMeta.spins}{' '}
                  independent spins E[K] = n·p ={' '}
                  {displayTheoreticalMean.toFixed(4)}.
                </p>
              </>
            ) : (
              <p>
                For the currently selected event p ={' '}
                {formatPercent(selectedProbability)}; n is set by the n control.
                Run a simulation to compare against a completed run.
              </p>
            )}

            {isRareEvent ? (
              <>
                <h3 className="roulette__subheading">Poisson approximation</h3>
                <p>
                  For a rare event the count can also be approximated by a Poisson
                  variable Y with rate λ = n·p. This is an approximation to the
                  exact Binomial count distribution, not an identity.
                </p>
                <div className="roulette__formula-block">
                  <Formula expression={String.raw`Y \sim \operatorname{Poisson}(\lambda), \qquad \lambda = n\,p`} />
                </div>
                <div className="roulette__formula-block">
                  <Formula
                    expression={String.raw`P(Y = k) = \frac{e^{-\lambda}\,\lambda^{k}}{k!}, \qquad E[Y] = \operatorname{Var}(Y) = \lambda`}
                  />
                </div>
              </>
            ) : null}
              </>
            ) : null}

            {view === 'waiting' ? (
              <>
                <h3 className="roulette__subheading">Geometric waiting time</h3>
                <p>
                  Let T be the one-based spin number of the first occurrence of the
                  selected event. T counts trials including the successful spin:
                </p>
                <div className="roulette__formula-block">
                  <Formula expression={String.raw`T \sim \operatorname{Geometric}(p)`} />
                </div>
                <div className="roulette__formula-block">
                  <Formula
                    expression={String.raw`P(T = k) = (1-p)^{\,k-1}\,p, \qquad k = 1, 2, \ldots`}
                  />
                </div>
                <div className="roulette__formula-block">
                  <Formula expression={String.raw`P(T > n) = (1-p)^{\,n}`} />
                </div>
                <div className="roulette__formula-block">
                  <Formula expression={String.raw`E[T] = \frac{1}{p}`} />
                </div>
                <div className="roulette__formula-block">
                  <Formula
                    expression={String.raw`E[\min(T, n)] = \frac{1 - (1-p)^{\,n}}{p}`}
                  />
                </div>
                <p>
                  Spins are independent and p stays constant. Here n is the
                  observation limit (the window actually simulated), not a bound on
                  the theoretical support of T. Experiments with no hit within n
                  spins are right-censored at n, so they enter the restricted mean as
                  min(T, n) = n rather than as a success at spin n.
                </p>
                <p>
                  For the displayed run ({theoryEvent === 'green' || theoryEvent === 'straight-up'
                    ? 'a rare event'
                    : 'red/black'}{' '}
                  with p = {formatPercent(theoryP)}), the full theoretical mean is{' '}
                  {(1 / theoryP).toFixed(4)} spins
                  {theoryEvent === 'green' || theoryEvent === 'straight-up'
                    ? ' (37 for p = 1/37)'
                    : ' (37/18 for p = 18/37)'}.
                </p>
              </>
            ) : null}

            <h3 className="roulette__subheading">Assumptions</h3>
            <ul className="roulette__assumptions">
              <li>37 equally likely pockets (0–36), no American double zero.</li>
              <li>18 red, 18 black, and one green (zero).</li>
              <li>Spins are independent and identically distributed.</li>
              <li>Straight-up means one specified pocket (p = 1/37).</li>
              <li>
                The displayed run uses n = {theoryN ?? 'set by the n control'} and p
                = {formatPercent(theoryP)}.
              </li>
            </ul>

            {isRareEvent ? (
              <p>
                Poisson(n·p) is an approximation to the exact Binomial count
                distribution; it is compared in the chart above. It is not exact,
                and it does not become exact merely because n grows — it is
                appropriate when n is large and p is small.
              </p>
            ) : (
              <p>
                The exact count distribution is Binomial(n, p). A Poisson
                approximation applies to rare events (small p) and is shown for the
                green and straight-up views; red and black are not rare events.
              </p>
            )}
          </div>
        </TheoryCard>
      </div>
    </div>
  )
}

export default Roulette

