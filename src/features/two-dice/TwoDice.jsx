import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import {
  runTwoDiceSimulationAsync,
  getTheoryForPair,
} from '../../simulation/twoDice.js'
import { continuousAreaProb } from '../../math/twoDice.js'
import JointHeatmap from './JointHeatmap.jsx'
import MarginalBars from './MarginalBars.jsx'
import ContinuousDemo from './ContinuousDemo.jsx'
import './TwoDice.css'

/* UI and engine share the range; the engine also accepts N=1 for tests. */
const DEFAULT_N = '5000'
const MIN_N = 200
const MAX_N = 20000

const DEFAULT_PAIR = 'xy'
const PAIR_OPTIONS = [
  { value: 'xy', label: '(X, Y) — the two faces' },
  { value: 'sm', label: '(S, M) — sum and maximum' },
]

/* Demo rectangle defaults and range. */
const DEFAULT_RECT_A = 0.5
const DEFAULT_RECT_B = 0.5

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

/** A workload above this triggers a neutral "may take time" note. */
const LARGE_WORKLOAD_THRESHOLD = 20000

/**
 * Parse and validate an integer field.
 *
 * @param {string} raw - Raw input string.
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
 * @param {string} raw - Raw input string.
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
 * Generate a random integer seed in the uint32 range `[0, 2^32)`.
 *
 * Matches the project-wide seed contract: an empty seed field is filled with a
 * generated integer seed that is then displayed so the run can be reproduced.
 *
 * @returns {number} An integer in `[0, 2^32)`.
 */
function generateSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

/**
 * Format a number for display with a fixed number of decimals, preserving a
 * real zero.
 * @param {number} value - Value to format.
 * @param {number} [digits] - Decimal places (default 4).
 * @returns {string} The formatted text.
 */
function formatNumber(value, digits = 4) {
  return Number(value).toFixed(digits)
}

/**
 * The Two Dice attraction.
 *
 * Uses the shared ControlPanel / ChartPanel / TheoryCard / MetricCard panels.
 * Runs the bounded asynchronous engine so the browser stays responsive, keeps
 * the last successful result visible while a new run is in progress and after an
 * input edit (marked "from previous run"), and guards against late callbacks
 * from a superseded run via a run-identity ref. All numbers shown for a
 * completed run come from the stored snapshot, never from live controls.
 *
 * @returns {import('react').ReactElement} The attraction.
 */
function TwoDice() {
  const [nInput, setNInput] = useState(DEFAULT_N)
  const [seedInput, setSeedInput] = useState('')
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [rectA, setRectA] = useState(DEFAULT_RECT_A)
  const [rectB, setRectB] = useState(DEFAULT_RECT_B)

  const [errors, setErrors] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [runMeta, setRunMeta] = useState(null)
  const [status, setStatus] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [isStale, setIsStale] = useState(false)

  // One AbortController per run plus a run-identity guard.
  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

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
    const nextErrors = {}
    const n = parseIntField(nInput, 'the number of rolls', MIN_N, MAX_N)
    const seed = parseSeed(seedInput)
    if (n.error) nextErrors.n = n.error
    if (seed.error) nextErrors.seed = seed.error
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setRuntimeError('')
    setStatus('')
    setIsStale(false)

    const runId = beginRun()
    const controller = controllerRef.current
    // Reproducible seed contract: if the field is empty, generate a seed;
    // otherwise normalize the provided seed to uint32 so the displayed value is
    // exactly the seed the RNG uses (and re-running it reproduces the run).
    const seedWasProvided = seed.value !== null
    const seedUsed = seedWasProvided ? seed.value >>> 0 : generateSeed()
    setIsRunning(true)
    setProgress({ completedRolls: 0, totalRolls: n.value })

    try {
      const completed = await runTwoDiceSimulationAsync({
        n: n.value,
        pairType: pair,
        seed: seedUsed,
        a: rectA,
        b: rectB,
        signal: controller.signal,
        onProgress: (next) => {
          if (runIdRef.current !== runId) return
          setProgress(next)
        },
      })

      if (runIdRef.current !== runId) return

      setResult(completed)
      setRunMeta({
        pairType: pair,
        n: n.value,
        seedUsed: completed.seedUsed,
        seedWasProvided,
        rectangle: { a: rectA, b: rectB },
      })
      setStatus('')
      setRuntimeError('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error && error.name === 'AbortError') {
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

    setNInput(DEFAULT_N)
    setSeedInput('')
    setPair(DEFAULT_PAIR)
    setRectA(DEFAULT_RECT_A)
    setRectB(DEFAULT_RECT_B)

    setErrors({})
    setIsRunning(false)
    setProgress(null)
    setResult(null)
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

  const isLargeWorkload =
    (Number(nInput) || 0) > LARGE_WORKLOAD_THRESHOLD && !isRunning

  // Seed label from the stored run only. An empty field is filled with a
  // generated seed, so a completed run is always reproducible and never shown
  // as "Unseeded".
  const seedLabel = runMeta
    ? runMeta.seedWasProvided
      ? String(runMeta.seedUsed)
      : `${runMeta.seedUsed} (generated)`
    : ''


  // Theory values for the DISPLAYED (stored) run only; never live controls.
  const displayTheory = useMemo(() => {
    if (!runMeta) return null
    return getTheoryForPair(runMeta.pairType)
  }, [runMeta])

  // Theoretical marginals for the displayed run.
  const displayMarginals = useMemo(() => {
    if (!result || !runMeta) return null
    if (runMeta.pairType === 'xy') {
      const uniform = new Array(6).fill(1 / 6)
      return {
        a: { name: 'X', theory: uniform, labels: result.rowLabels },
        b: { name: 'Y', theory: uniform, labels: result.colLabels },
      }
    }
    const sTheory = Array.from({ length: 11 }, (_, index) => {
      const k = index + 2
      return (6 - Math.abs(k - 7)) / 36
    })
    const mTheory = Array.from({ length: 6 }, (_, index) => (2 * (index + 1) - 1) / 36)
    return {
      a: { name: 'S', theory: sTheory, labels: result.rowLabels },
      b: { name: 'M', theory: mTheory, labels: result.colLabels },
    }
  }, [result, runMeta])

  const pairLabel = runMeta && runMeta.pairType === 'sm' ? '(S, M)' : '(X, Y)'

  return (
    <div className="two-dice">
      <div className="two-dice__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="two-dice__form">
            <p className="two-dice__intro">
              Roll two independent fair dice N times and compare the empirical
              joint distribution with the exact theory. Compare the two faces
              (X, Y) or the sum and maximum (S, M).
            </p>

            <div className="two-dice__field">
              <label className="two-dice__label" htmlFor="two-dice-n">
                Number of rolls (N)
              </label>
              <input
                id="two-dice-n"
                className="input"
                type="text"
                inputMode="numeric"
                value={nInput}
                disabled={isRunning}
                aria-invalid={errors.n ? 'true' : undefined}
                aria-describedby={errors.n ? 'two-dice-n-error' : undefined}
                onChange={(event) => {
                  setNInput(event.target.value)
                  markStale()
                }}
              />
              {errors.n ? (
                <p className="two-dice__error" id="two-dice-n-error" role="alert">
                  {errors.n}
                </p>
              ) : (
                <p className="two-dice__help">
                  Between {MIN_N} and {MAX_N}.
                </p>
              )}
            </div>

            <div className="two-dice__field">
              <label className="two-dice__label" htmlFor="two-dice-seed">
                Seed (optional)
              </label>
              <input
                id="two-dice-seed"
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="Leave empty to generate one"
                value={seedInput}
                disabled={isRunning}
                aria-invalid={errors.seed ? 'true' : undefined}
                aria-describedby={errors.seed ? 'two-dice-seed-error' : undefined}
                onChange={(event) => {
                  setSeedInput(event.target.value)
                  markStale()
                }}
              />
              {errors.seed ? (
                <p className="two-dice__error" id="two-dice-seed-error" role="alert">
                  {errors.seed}
                </p>
              ) : (
                <p className="two-dice__help">
                  Leave empty to generate one; the seed actually used is shown
                  after a run.
                </p>
              )}
            </div>

            <fieldset className="two-dice__fieldset">
              <legend className="two-dice__label">Pair of variables</legend>
              {PAIR_OPTIONS.map((option) => (
                <label className="two-dice__radio" key={option.value}>
                  <input
                    type="radio"
                    name="two-dice-pair"
                    value={option.value}
                    checked={pair === option.value}
                    disabled={isRunning}
                    onChange={() => {
                      setPair(option.value)
                      markStale()
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>


            <fieldset className="two-dice__fieldset">
              <legend className="two-dice__label">
                Continuous demo rectangle [0, a] × [0, b]
              </legend>
              <label className="two-dice__slider">
                <span>a = {rectA.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={rectA}
                  disabled={isRunning}
                  onChange={(event) => setRectA(Number(event.target.value))}
                />
              </label>
              <label className="two-dice__slider">
                <span>b = {rectB.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={rectB}
                  disabled={isRunning}
                  onChange={(event) => setRectB(Number(event.target.value))}
                />
              </label>
              <p className="two-dice__help">
                Area a × b = {continuousAreaProb(rectA, rectB).toFixed(4)}. The
                sliders update the demo panel only; the dice results are unchanged.
              </p>
            </fieldset>

            {isLargeWorkload ? (
              <p className="two-dice__note">
                A large N may take a moment; the run stays cancellable.
              </p>
            ) : null}

            <div className="two-dice__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleRun}
                disabled={isRunning}
              >
                {isRunning ? 'Running…' : 'Run'}
              </button>
              <button
                type="button"
                className="button"
                onClick={handleCancel}
                disabled={!isRunning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleReset}
                disabled={isRunning}
              >
                Reset
              </button>
            </div>

            {isRunning && progress ? (
              <div className="two-dice__progress">
                <p className="two-dice__progress-text">
                  Rolled {progress.completedRolls.toLocaleString()} of{' '}
                  {progress.totalRolls.toLocaleString()}
                </p>
                <progress value={progress.completedRolls} max={progress.totalRolls} />
              </div>
            ) : null}

            {status ? <p className="two-dice__status">{status}</p> : null}
            {runtimeError ? (
              <p className="two-dice__error" role="alert">
                {runtimeError}
              </p>
            ) : null}
          </div>
        </ControlPanel>


        {/* --- Simulation Results ----------------------------------------- */}
        <ChartPanel
          summary={
            isStale
              ? 'Controls changed since this run — results below are from the previous run.'
              : undefined
          }
        >
          {!result || !runMeta || !displayTheory ? (
            <p className="two-dice__empty">
              Set the number of rolls and press Run to build the empirical joint
              table, marginals and covariance metrics.
            </p>
          ) : (
            <div className="two-dice__results">
              <p className="two-dice__run-meta">
                Pair {pairLabel} · N = {runMeta.n.toLocaleString()} · Seed used:{' '}
                {seedLabel}
              </p>

              <div className="two-dice__metrics">
                <MetricCard
                  label={`Mean of ${displayTheory.labelA}`}
                  value={formatNumber(result.meanA)}
                  description={`Theory: ${formatNumber(displayTheory.meanA)}`}
                />
                <MetricCard
                  label={`Mean of ${displayTheory.labelB}`}
                  value={formatNumber(result.meanB)}
                  description={`Theory: ${formatNumber(displayTheory.meanB)}`}
                />
                <MetricCard
                  label={`Cov(${displayTheory.labelA}, ${displayTheory.labelB})`}
                  value={formatNumber(result.covHat)}
                  description={`Theory: ${formatNumber(
                    result.covTheory,
                  )} · SE ${formatNumber(result.seCov)} · z ${formatNumber(result.zScore, 2)}`}
                />
                <MetricCard
                  label={`Corr(${displayTheory.labelA}, ${displayTheory.labelB})`}
                  value={formatNumber(result.corrHat)}
                  description={`Theory: ${formatNumber(displayTheory.corrTheory)}`}
                />
                <MetricCard
                  label="χ² goodness of fit"
                  value={formatNumber(result.chiSquareGof.chi2, 3)}
                  description={`dof = ${result.chiSquareGof.dof} · p = ${formatNumber(
                    result.chiSquareGof.pValue,
                    4,
                  )}`}
                />
                {result.chiSquareIndependence ? (
                  <MetricCard
                    label="χ² independence (X, Y)"
                    value={formatNumber(result.chiSquareIndependence.chi2, 3)}
                    description={`dof = ${result.chiSquareIndependence.dof} · p = ${formatNumber(
                      result.chiSquareIndependence.pValue,
                      4,
                    )}`}
                  />
                ) : null}
              </div>


              <JointHeatmap
                rowLabels={result.rowLabels}
                colLabels={result.colLabels}
                counts={result.jointCounts}
                expectedProbabilities={result.expectedJointProbabilities}
                supportMask={result.supportMask}
                n={result.n}
                rowName={displayTheory.labelA}
                colName={displayTheory.labelB}
              />

              {displayMarginals ? (
                <div className="two-dice__marginals">
                  <MarginalBars
                    variableName={displayMarginals.a.name}
                    labels={displayMarginals.a.labels}
                    empirical={result.marginalAFromJoint}
                    theory={displayMarginals.a.theory}
                  />
                  <MarginalBars
                    variableName={displayMarginals.b.name}
                    labels={displayMarginals.b.labels}
                    empirical={result.marginalBFromJoint}
                    theory={displayMarginals.b.theory}
                  />
                </div>
              ) : null}

              <p className="two-dice__reconciliation">
                Marginals computed from the joint table match those counted
                directly:{' '}
                <strong>{result.marginalsMatch ? 'yes' : 'NO — investigate'}</strong>.
              </p>

              <p className="two-dice__chi-note">
                The χ² p-value is uniform under the correct model; one run's
                p-value is a summary, not a proof.{' '}
                {pairLabel === '(X, Y)'
                  ? 'The independence test uses the 6×6 contingency table (dof 25).'
                  : 'The sum and maximum are dependent, so no independence test is shown.'}
              </p>
            </div>
          )}
        </ChartPanel>

        {/* --- Continuous demo -------------------------------------------- */}
        <ChartPanel title="Continuous Density Demo">
          {result ? (
            <ContinuousDemo u={result.demoU} v={result.demoV} a={rectA} b={rectB} />
          ) : (
            <p className="two-dice__empty">
              Run the simulation to sample uniform points on the unit square and
              compare the inside-rectangle fraction with its area.
            </p>
          )}
        </ChartPanel>
      </div>


      {/* Theory sits BELOW everything and spans the full content width. */}
      <div className="two-dice__theory-row">
        <TheoryCard
          title="Theory"
          distributionLabel="Discrete uniform joint / Covariance"
        >
          <div className="two-dice__theory">
            <h3>The two faces are independent</h3>
            <p>
              Each face is a discrete uniform variable on 1..6, and the two dice
              are rolled independently, so the joint mass factorises.
            </p>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`P(X=i,\;Y=j)=\frac{1}{36},\qquad i,j\in\{1,\dots,6\}`}
              />
            </div>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`P(X=i)=\frac{1}{6},\qquad P(X=i,\,Y=j)=P(X=i)\,P(Y=j)`}
              />
            </div>

            <h3>The sum and the maximum</h3>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`S=X+Y:\quad P(S=k)=\frac{6-|k-7|}{36},\quad k=2,\dots,12`}
              />
            </div>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`M=\max(X,Y):\quad P(M=m)=\frac{2m-1}{36},\quad m=1,\dots,6`}
              />
            </div>
            <p>
              On the (S, M) grid the support is m + 1 ≤ s ≤ 2m: 1/36 on the
              diagonal s = 2m and 2/36 for m + 1 ≤ s ≤ 2m − 1 (21 nonzero cells).
            </p>

            <h3>Covariance</h3>
            <div className="two-dice__formula-block">
              <Formula expression={String.raw`\operatorname{Cov}(X,Y)=0\quad(\text{independence})`} />
            </div>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`\operatorname{Cov}(S,M)=E[SM]-E[S]\,E[M]=\frac{35}{12}\approx 2.9167`}
              />
            </div>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`\rho(S,M)^2=\frac{54}{73},\qquad \rho(S,M)=+\sqrt{\tfrac{54}{73}}\approx 0.8601`}
              />
            </div>
            <p>
              For (X, Y) the true covariance is 0, but the sample covariance is
              random: at N = 5000 it is typically of order 0.04. Sum and maximum
              are clearly dependent.
            </p>

            <h3>Uncorrelated does not imply independent</h3>
            <p>
              The sum S = X + Y and the difference D = X − Y have Cov(S, D) = 0,
              yet they are dependent: S = 2 forces D = 0, so P(S = 2, D = 3) = 0
              while P(S = 2) P(D = 3) = (1/36)(3/36) = 3/1296.
            </p>

            <h3>Continuous contrast</h3>
            <div className="two-dice__formula-block">
              <Formula
                expression={String.raw`f(x,y)=1 \text{ on } [0,1]^2,\qquad P((U,V)\in[0,a]\times[0,b])=a\,b`}
              />
            </div>
            <p>
              The uniform density on the unit square makes probability equal to
              area; its marginals are uniform and independent, mirroring the
              discrete table.
            </p>

            <h3>Assumptions</h3>
            <ul className="two-dice__assumptions">
              <li>Two fair dice, each face with probability 1/6.</li>
              <li>Rolls are independent and identically distributed.</li>
              <li>
                The empirical covariance uses the divisor N − 1; its standard
                error is sd((aᵢ−ā)(bᵢ−b̄)) / √N.
              </li>
              <li>
                χ² tests use the dof = support − 1 rule (35 for (X, Y), 20 for
                (S, M)) and dof = 25 for the (X, Y) independence test.
              </li>
            </ul>
          </div>
        </TheoryCard>
      </div>
    </div>
  )
}

export default TwoDice

