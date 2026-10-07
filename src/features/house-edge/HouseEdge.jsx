import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import {
  getHouseEdgeConstants,
  pmfW,
  binomialWinPmf,
  cdfTExact,
  cdfTNormalContinuityCorrected,
  kolmogorovDistanceOnGrid,
  berryEsseenBound,
  Phi,
} from '../../math/houseEdge.js'
import { runHouseEdgeSimulationAsync } from '../../simulation/houseEdge.js'
import HouseEdgeHistogramChart from './HouseEdgeHistogramChart.jsx'
import HouseEdgeCdfChart from './HouseEdgeCdfChart.jsx'
import HouseEdgePmfChart from './HouseEdgePmfChart.jsx'
import './HouseEdge.css'

/* UI and engine share the same ranges. */
const DEFAULT_N = '1000'
const DEFAULT_SESSIONS = '300'
const MIN_N = 10
const MAX_N = 20000
const MIN_SESSIONS = 50
const MAX_SESSIONS = 2000

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

/** A workload above this triggers a neutral "may take time" note. */
const LARGE_WORKLOAD_THRESHOLD = 2000000
/** Number of grid points used for the displayed Kolmogorov distance. */
const CDF_GRID_POINTS = 61
/** Maximum number of Binomial PMF bars before grouping the support. */
const MAX_BINOMIAL_BARS = 40

/** Exact House Edge constants reused from the pure theory module. */
const CONSTANTS = getHouseEdgeConstants()

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
 * Format a value as a fixed-decimal string.
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
 * Format a rate as a percentage string with three decimals.
 *
 * @param {number} rate - A rate in [0, 1].
 * @returns {string} The percentage text.
 */
function formatPercent(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—'
  return `${(rate * 100).toFixed(3)}%`
}

/**
 * Build all derived chart data and theory quantities for a saved run snapshot.
 *
 * Pure and deterministic: it depends only on the snapshot (n, N, mode, seedUsed,
 * histogram), never on the live controls. Every chart and comparison in the UI
 * is driven by the returned object so stale controls cannot change what is
 * displayed.
 *
 * @param {object} snapshot - The saved run snapshot.
 * @param {number} snapshot.n - Plays per session.
 * @param {number} snapshot.N - Number of sessions.
 * @param {Array<object>} snapshot.histogram - Session histogram bins (low/high/count/frequency).
 * @returns {object} Chart data + theory quantities.
 */
function buildHouseEdgeChartData(snapshot) {
  const { n, N, histogram, latticeCounts } = snapshot
  const mu = -n / 37
  const sigma = Math.sqrt((1368 * n) / 1369)

  // Histogram bins with the continuity-corrected normal mass of each interval
  // [low, high]: Phi((high + 1 - mu)/sigma) - Phi((low - 1 - mu)/sigma).
  const histogramWithNormal = histogram.map((bin) => ({
    label: bin.low === bin.high ? String(bin.low) : `${bin.low}–${bin.high}`,
    low: bin.low,
    high: bin.high,
    count: bin.count,
    frequency: bin.frequency,
    normalProbability: Phi((bin.high + 1 - mu) / sigma) - Phi((bin.low - 1 - mu) / sigma),
  }))

  const cdfExactFn = cdfTExact(n)
  const cdfNormalFn = cdfTNormalContinuityCorrected(n)
  // TRUE empirical CDF: built from the exact per-lattice-value counts of T, so
  // the step lands on the observed lattice points (not on grouped-bin edges).
  const empiricalCdf = empiricalCdfFromLatticeCounts(latticeCounts, N)

  const cdf = cdfGrid(n).map((t) => ({
    t,
    empirical: empiricalCdf(t),
    normal: cdfNormalFn(t),
    exact: cdfExactFn(t),
  }))

  // Kolmogorov distance (exact vs continuity-corrected normal) over the whole
  // step-2 lattice. This depends only on n, NOT on the simulation sample; the
  // Berry–Esseen bound is its theoretical upper bound.
  const kolmogorovDistance = kolmogorovDistanceOnGrid({
    cdfA: cdfExactFn,
    cdfB: cdfNormalFn,
    grid: cdfGridExactLattice(n),
  })

  // Genuinely OBSERVED distance: the maximum gap between the empirical CDF of
  // the N sessions and the exact CDF, over the same lattice grid used for the
  // CDF plot. Its DKW 95% bound is eps = sqrt(ln(2/alpha) / (2N)) with alpha=0.05.
  const ksEmpiricalExact = kolmogorovDistanceOnGrid({
    cdfA: empiricalCdf,
    cdfB: cdfExactFn,
    grid: cdfGridExactLattice(n),
  })
  const dkwAlpha = 0.05
  const dkwBound = Math.sqrt(Math.log(2 / dkwAlpha) / (2 * N))

  // P(T > 0). T = 2X − n lives on a step-2 lattice whose parity matches n, so
  // the smallest positive lattice value is t0 = 2 for even n and t0 = 1 for odd
  // n (0 is only a lattice value when n is even, and it is not > 0). The exact
  // value 1 − F_exact(0) already handles both parities. The continuity-corrected
  // normal tail must use the SAME threshold:
  //   P(T >= t0) ≈ 1 − Phi((t0 − 1 − mu) / sigma) = 1 − cdfNormalFn(t0 − 2).
  // Using t0 − 2 keeps the ±1 (not ±0.5) correction because the lattice step is 2.
  const positiveThreshold = n % 2 === 0 ? 2 : 1

  return {
    histogram: histogramWithNormal,
    cdf,
    kolmogorovDistance,
    ksEmpiricalExact,
    dkwBound,
    dkwAlpha,
    berryEsseen: berryEsseenBound(n),
    exactPTgt0: 1 - cdfExactFn(0),
    normalPTgt0: 1 - cdfNormalFn(positiveThreshold - 2),
    positiveThreshold,
    mu,
    sigma,
    wPmf: pmfW(),
    binomialPmf: buildBinomialPmfBars(n),
    binomialGrouped: n > MAX_BINOMIAL_BARS,
  }
}

/**
 * Evenly spaced CDF grid across [−n, n] (step-2 lattice points).
 * @param {number} n - Plays per session.
 * @returns {number[]} Grid of lattice values.
 */
function cdfGrid(n) {
  const step = Math.max(1, Math.ceil((n + 1) / CDF_GRID_POINTS))
  const grid = []
  for (let index = 0; index <= n; index += step) {
    grid.push(-n + 2 * index)
  }
  if (grid[grid.length - 1] !== n) grid.push(n)
  return grid
}

/**
 * Full step-2 lattice grid from −n to n (used for the Kolmogorov distance).
 * @param {number} n - Plays per session.
 * @returns {number[]} Every lattice value.
 */
function cdfGridExactLattice(n) {
  const grid = []
  for (let t = -n; t <= n; t += 2) grid.push(t)
  return grid
}

/**
 * Build the empirical CDF of T from the exact per-lattice-value counts.
 *
 * Returns a right-continuous step function F(t) = P(T <= t): the whole count of
 * a lattice value is added only once t reaches that value, so the step lands on
 * the observed lattice point — the same x semantics as the exact CDF and the
 * CDF plot grid. (Building from grouped histogram bins instead would place the
 * mass at an interval edge and shift the curve.)
 *
 * @param {Array<{ t: number, count: number }>} latticeCounts Sorted nonzero counts.
 * @param {number} N Number of sessions.
 * @returns {(t: number) => number} Empirical `P(T <= t)`.
 */
function empiricalCdfFromLatticeCounts(latticeCounts, N) {
  const points = latticeCounts
  return (t) => {
    let cumulative = 0
    for (const point of points) {
      if (point.t <= t) cumulative += point.count
      else break // points are sorted by t
    }
    return cumulative / N
  }
}

/**
 * Binomial PMF bars for X ~ Bin(n, 18/37). Below the bar cap every k is a bar;
 * above it the support is grouped into contiguous bins and each bar is the SUM
 * of the masses in its interval (mass preserved, never averaged).
 *
 * @param {number} n - Plays per session.
 * @returns {Array<{ label: string, low: number, high: number, probability: number }>}
 *   Bars in increasing k order.
 */
function buildBinomialPmfBars(n) {
  const pmf = binomialWinPmf(n)
  if (pmf.length <= MAX_BINOMIAL_BARS) {
    return pmf.map((probability, k) => ({ label: String(k), low: k, high: k, probability }))
  }
  const binSize = Math.max(1, Math.ceil(pmf.length / MAX_BINOMIAL_BARS))
  const bars = []
  for (let start = 0; start < pmf.length; start += binSize) {
    const end = Math.min(pmf.length - 1, start + binSize - 1)
    let sum = 0
    for (let k = start; k <= end; k += 1) sum += pmf[k]
    bars.push({
      label: start === end ? String(start) : `${start}–${end}`,
      low: start,
      high: end,
      probability: sum,
    })
  }
  return bars
}

/**
 * Build the plain-English summary shown under the results panel.
 *
 * Wording rules (spec): the simulation illustrates, it never "proves"; results
 * are random and reproducible only with a fixed seed; a single seed is one
 * sample; the normal approximation is flagged as rough when n < 100.
 *
 * @param {object|null} snapshot - The saved run snapshot, or null before a run.
 * @param {object|null} chartData - Derived chart/theory data, or null.
 * @returns {string} The summary text.
 */
function buildSummary(snapshot, chartData) {
  if (!snapshot || !chartData) {
    return ''
  }
  const parts = []

  parts.push(
    `This run simulates ${snapshot.N.toLocaleString()} sessions of ` +
      `${snapshot.n.toLocaleString()} independent 1-unit red bets each.`,
  )
  parts.push(
    `The observed session-1 profit is ${formatNumber(snapshot.visible.T1, 0)} ` +
      `(mean w̄ = ${formatNumber(snapshot.visible.meanW, 5)}), versus the expected ` +
      `−1/37 per bet.`,
  )

  const empirical = snapshot.sessions.fractionPositive
  const exact = chartData.exactPTgt0
  parts.push(
    `P(T > 0) is ${formatPercent(exact)} exactly, ${formatPercent(chartData.normalPTgt0)} ` +
      `by the continuity-corrected normal, and ${formatPercent(empirical)} empirically.`,
  )

  parts.push(
    `The observed Kolmogorov distance (${formatNumber(chartData.kolmogorovDistance, 5)}) ` +
      `is within the Berry–Esseen upper bound (${formatNumber(chartData.berryEsseen, 5)}).`,
  )

  parts.push(
    'Results are random: the same seed reproduces the run, but one seed is still ' +
      'only one sample. The simulation illustrates the negative expected value; the ' +
      'proof is the theory calculation.',
  )

  if (snapshot.n < 100) {
    parts.push(
      'Because n < 100, the normal approximation is visibly rough here.',
    )
  }

  return parts.join(' ')
}



/**
 * Generate a random nonnegative 32-bit seed for an unseeded run. The seed is
 * displayed so the run can be reproduced.
 *
 * @returns {number} A safe integer in [0, 2^31).
 */
function generateSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

/**
 * The House Edge attraction screen.
 *
 * Controls (n, N, optional seed, fast-mode toggle) drive a seeded, chunked
 * simulation. Results, charts and theory are all computed from the saved
 * successful-run snapshot, so editing the controls after a run keeps the old
 * results and marks them "from previous run". Cancel keeps the last successful
 * snapshot; Reset clears everything. No run happens on mount.
 *
 * @returns {import('react').ReactElement} The feature screen.
 */
function HouseEdge() {
  const [nInput, setNInput] = useState(DEFAULT_N)
  const [sessionsInput, setSessionsInput] = useState(DEFAULT_SESSIONS)
  const [seedInput, setSeedInput] = useState('')
  const [fastMode, setFastMode] = useState(false)

  const [errors, setErrors] = useState({})
  const [runError, setRunError] = useState('')
  const [status, setStatus] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)

  // The saved successful run: metrics + the exact inputs snapshot + histogram.
  const [snapshot, setSnapshot] = useState(null)
  const [isStale, setIsStale] = useState(false)
  // Signature of the controls that produced the shown result.
  const [shownSignature, setShownSignature] = useState('')

  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

  /**
   * Current control signature (used to detect stale results after edits).
   * @returns {string} A string uniquely describing the current controls.
   */
  function currentSignature() {
    return `${nInput}|${sessionsInput}|${seedInput.trim()}|${fastMode ? 'fast' : 'explicit'}`
  }

  /** Mark the shown results as "from previous run" when controls change. */
  function markStale() {
    if (snapshot && currentSignature() !== shownSignature) {
      setIsStale(true)
    }
  }


  /**
   * Parse and validate the controls.
   * @returns {{values?: object, errors: object}} Parsed values or field errors.
   */
  function parseInputs() {
    const nParsed = parseIntField(nInput, 'n', MIN_N, MAX_N)
    const sessionsParsed = parseIntField(sessionsInput, 'N', MIN_SESSIONS, MAX_SESSIONS)
    const seedParsed = parseSeed(seedInput)

    const nextErrors = {}
    if (nParsed.error) nextErrors.n = nParsed.error
    if (sessionsParsed.error) nextErrors.sessions = sessionsParsed.error
    if (seedParsed.error) nextErrors.seed = seedParsed.error

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors }
    }
    return {
      errors: {},
      values: {
        n: nParsed.value,
        N: sessionsParsed.value,
        mode: fastMode ? 'fast' : 'explicit',
        // The UI generates a seed when none is given, so the engine stays pure
        // and the run is always reproducible.
        providedSeed: seedParsed.value,
      },
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

  /** Handle the Run button: validate, generate a seed if needed, run async. */
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
    setProgress({ completedSessions: 0, totalSessions: values.N })

    try {
      const result = await runHouseEdgeSimulationAsync({
        n: values.n,
        N: values.N,
        seed: seedUsed,
        mode: values.mode,
        signal: controller.signal,
        onProgress: (next) => {
          if (runIdRef.current !== runId) return
          setProgress(next)
        },
      })

      if (runIdRef.current !== runId) return

      setSnapshot({
        n: result.inputs.n,
        N: result.inputs.N,
        mode: result.inputs.mode,
        seedUsed: result.inputs.seedUsed,
        visible: result.visible,
        sessions: result.sessions,
        histogram: result.histogram,
        latticeCounts: result.sessions.latticeCounts,
      })
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

    setNInput(DEFAULT_N)
    setSessionsInput(DEFAULT_SESSIONS)
    setSeedInput('')
    setFastMode(false)

    setErrors({})
    setIsRunning(false)
    setProgress(null)
    setSnapshot(null)
    setShownSignature('')
    setStatus('')
    setRunError('')
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


  // Derived display value: requested workload when both fields are valid.
  const parsedN = parseIntField(nInput, 'n', MIN_N, MAX_N)
  const parsedN2 = parseIntField(sessionsInput, 'N', MIN_SESSIONS, MAX_SESSIONS)
  const requestedWorkload =
    parsedN.value !== undefined && parsedN2.value !== undefined
      ? parsedN.value * parsedN2.value
      : null

  // Chart data + theory quantities are derived ONLY from the saved snapshot,
  // so editing the controls after a run does not change what is displayed.
  const chartData = useMemo(
    () => (snapshot ? buildHouseEdgeChartData(snapshot) : null),
    [snapshot],
  )

  const seedLabel = snapshot
    ? snapshot.seedUsed === null
      ? 'unseeded (Math.random)'
      : String(snapshot.seedUsed)
    : ''

  const summary = buildSummary(snapshot, chartData)

  return (
    <div className="house-edge">
      <div className="house-edge__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="house-edge__form">
            <p className="house-edge__intro">
              One session is n independent 1-unit bets on red. N sessions
              produce the distribution of the session total profit T.
            </p>

            <div className="house-edge__field">
              <label className="house-edge__label" htmlFor="house-edge-n">
                Plays per session (n)
              </label>
              <input
                id="house-edge-n"
                className="input"
                type="text"
                inputMode="numeric"
                value={nInput}
                onChange={(event) => {
                  setNInput(event.target.value)
                  markStale()
                }}
              />
              <p className="house-edge__help">Whole number from {MIN_N} to {MAX_N}.</p>
              {errors.n ? <p className="house-edge__error">{errors.n}</p> : null}
            </div>

            <div className="house-edge__field">
              <label className="house-edge__label" htmlFor="house-edge-sessions">
                Sessions (N)
              </label>
              <input
                id="house-edge-sessions"
                className="input"
                type="text"
                inputMode="numeric"
                value={sessionsInput}
                onChange={(event) => {
                  setSessionsInput(event.target.value)
                  markStale()
                }}
              />
              <p className="house-edge__help">Whole number from {MIN_SESSIONS} to {MAX_SESSIONS}.</p>
              {errors.sessions ? <p className="house-edge__error">{errors.sessions}</p> : null}
            </div>

            <div className="house-edge__field">
              <label className="house-edge__label" htmlFor="house-edge-seed">
                Seed (optional)
              </label>
              <input
                id="house-edge-seed"
                className="input"
                type="text"
                inputMode="numeric"
                value={seedInput}
                placeholder="leave empty for a random seed"
                onChange={(event) => {
                  setSeedInput(event.target.value)
                  markStale()
                }}
              />
              <p className="house-edge__help">
                Nonnegative whole number. If empty, a random seed is generated and
                shown so the run can be reproduced.
              </p>
              {errors.seed ? <p className="house-edge__error">{errors.seed}</p> : null}
            </div>

            <label className="house-edge__checkbox">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(event) => {
                  setFastMode(event.target.checked)
                  markStale()
                }}
              />
              <span>
                Fast mode: draws Binomial directly for sessions 2..N (session 1 is
                still simulated play by play).
              </span>
            </label>

            {requestedWorkload !== null && requestedWorkload >= LARGE_WORKLOAD_THRESHOLD ? (
              <p className="house-edge__help">
                This run needs {requestedWorkload.toLocaleString()} plays; it may
                take a moment. You can cancel at any time.
              </p>
            ) : null}

            <div className="house-edge__actions">
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
              <div className="house-edge__progress">
                <p className="house-edge__progress-text">
                  {progress.completedSessions} / {progress.totalSessions} sessions
                </p>
                <progress
                  value={progress.completedSessions}
                  max={progress.totalSessions}
                />
              </div>
            ) : null}

            {status ? <p className="house-edge__status">{status}</p> : null}
            {runError ? <p className="house-edge__error">{runError}</p> : null}
          </div>
        </ControlPanel>


        {/* --- Simulation results ----------------------------------------- */}
        <ChartPanel title="Simulation Results" summary={summary}>
          {snapshot && chartData ? (
            <div className="house-edge__results">
              {isStale ? (
                <p className="house-edge__stale">
                  Results from previous run — the controls have changed since this
                  run. Press Run to update.
                </p>
              ) : null}

              <dl className="house-edge__meta">
                <dt>Plays per session (n)</dt>
                <dd>{snapshot.n.toLocaleString()}</dd>
                <dt>Sessions (N)</dt>
                <dd>{snapshot.N.toLocaleString()}</dd>
                <dt>Mode</dt>
                <dd>{snapshot.mode === 'fast' ? 'Fast mode (Binomial draws)' : 'Explicit plays'}</dd>
                <dt>Seed used</dt>
                <dd>{seedLabel}</dd>
              </dl>

              <div className="house-edge__metrics">
                <MetricCard
                  label="House edge"
                  value={`+1/37 ≈ ${formatPercent(CONSTANTS.houseEdgeValue)}`}
                  description="Casino expected gain per unit bet"
                />
                <MetricCard
                  label="Player EV per unit bet"
                  value={`−1/37 ≈ ${formatNumber(CONSTANTS.playerEvValue, 6)}`}
                  description="E[W]"
                />
                <MetricCard
                  label="Expected session profit"
                  value={formatNumber(chartData.mu, 4)}
                  description="E[T] = −n/37"
                />
                <MetricCard
                  label="Session standard deviation"
                  value={formatNumber(chartData.sigma, 4)}
                  description="σ = √(1368n/1369)"
                />
                <MetricCard
                  label="Observed profit (session 1)"
                  value={formatNumber(snapshot.visible.T1, 0)}
                  description={`mean w̄ = ${formatNumber(snapshot.visible.meanW, 5)}`}
                />
                <MetricCard
                  label="Visible session variance s²"
                  value={formatNumber(snapshot.visible.varWUnbiased, 5)}
                  description="unbiased (÷ n−1); theory 1368/1369 ≈ 0.99927"
                />
                <MetricCard
                  label="z-score of w̄"
                  value={formatNumber(snapshot.visible.zScore, 3)}
                  description={`SE = ${formatNumber(snapshot.visible.se, 5)}`}
                />
                <MetricCard
                  label="Mean of T (N sessions)"
                  value={formatNumber(snapshot.sessions.meanT, 4)}
                  description="Sample mean uses divisor N; sample variance uses divisor N−1."
                />
                <MetricCard
                  label="Variance of T (N sessions)"
                  value={formatNumber(snapshot.sessions.varTUnbiased, 2)}
                  description={`unbiased sample variance (÷ N−1); theory n·Var(W) = ${formatNumber(snapshot.n * CONSTANTS.varWValue, 2)}`}
                />
                <MetricCard
                  label="P(T > 0): exact"
                  value={formatPercent(chartData.exactPTgt0)}
                  description="exact Binomial tail"
                />
                <MetricCard
                  label="P(T > 0): normal (CC)"
                  value={formatPercent(chartData.normalPTgt0)}
                  description="continuity corrected (±1)"
                />
                <MetricCard
                  label="P(T > 0): empirical"
                  value={formatPercent(snapshot.sessions.fractionPositive)}
                  description="share of N sessions"
                />
                <MetricCard
                  label="Kolmogorov distance (exact vs normal CC)"
                  value={formatNumber(chartData.kolmogorovDistance, 5)}
                  description="Computed from n only (not the sample); Berry–Esseen caps it."
                />
                <MetricCard
                  label="Kolmogorov distance (empirical vs exact)"
                  value={formatNumber(chartData.ksEmpiricalExact, 5)}
                  description="Observed sup |F_empirical − F_exact| over the lattice."
                />
                <MetricCard
                  label="DKW 95% bound"
                  value={`±${formatNumber(chartData.dkwBound, 5)}`}
                  description={`KS_emp ≤ ε: ${chartData.ksEmpiricalExact <= chartData.dkwBound ? 'yes' : 'no'}`}
                />
                <MetricCard
                  label="Berry–Esseen bound"
                  value={formatNumber(chartData.berryEsseen, 5)}
                  description="0.4748/√n (upper bound, not the error)"
                />
              </div>

              <h3 className="house-edge__chart-section-title">Distribution of T</h3>
              <HouseEdgeHistogramChart data={chartData} />

              <h3 className="house-edge__chart-section-title">CDF of T</h3>
              <HouseEdgeCdfChart data={chartData} />

              <h3 className="house-edge__chart-section-title">PMFs: W and X</h3>
              <HouseEdgePmfChart data={chartData} />

              <p className="house-edge__note">
                The variance of W is almost determined by its mean because wᵢ² = 1,
                so the variance comparison is much less informative than the mean
                comparison.
              </p>
            </div>
          ) : (
            <p className="house-edge__empty">
              Set the controls and press Run. No simulation runs automatically. The
              charts, metrics and theory below all follow the last successful run.
            </p>
          )}
        </ChartPanel>
      </div>

      {/* Theory sits BELOW the grid and spans the full content width. */}
      <section className="house-edge__theory-row">
        {/* --- Theory ----------------------------------------------------- */}
        <TheoryCard distributionLabel="Two-point (affine Bernoulli) & Binomial & Normal">
          <div className="house-edge__theory">
            <ul className="house-edge__badges">
              <li className="shared-panel__badge">Two-point (affine Bernoulli): W</li>
              <li className="shared-panel__badge">Binomial: wins X</li>
              <li className="shared-panel__badge">Normal: total T</li>
            </ul>

            <p>
              A single 1-unit bet on red wins +1 with probability 18/37 and loses
              −1 with probability 19/37 (18 black pockets plus the zero).
            </p>

            <div className="house-edge__formula-block">
              <Formula expression={String.raw`E[W] = 1\cdot\frac{18}{37} + (-1)\cdot\frac{19}{37} = -\frac{1}{37} \approx -0.027027`} />
            </div>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`\operatorname{Var}(W) = E[W^2] - (E[W])^2 = 1 - \left(\frac{1}{37}\right)^2 = \frac{1368}{1369} \approx 0.99927`} />
            </div>
            <p>
              The player's expected profit per unit bet is E[W] = −1/37; the
              house edge is its opposite, H = +1/37 ≈ 2.7027%.
            </p>

            <h3 className="house-edge__subheading">Total profit after n plays</h3>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`E[T] = n\,E[W] = -\frac{n}{37}, \qquad \operatorname{Var}(T) = n\,\operatorname{Var}(W) = \frac{1368\,n}{1369}`} />
            </div>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`W = 2B - 1, \quad B \sim \operatorname{Bernoulli}(18/37)`} />
            </div>

            <h3 className="house-edge__subheading">Normal approximation and continuity correction</h3>
            <p>
              By the i.i.d. Lindeberg–Lévy CLT, T is approximately Normal with mean
              −n/37 and variance 1368n/1369. Because T lives on a step-2 lattice
              (T = 2X − n), the continuity correction uses ±1, not the usual ±0.5:
            </p>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`P(T \le t) \approx \Phi\!\left(\frac{t + 1 - \mu}{\sigma}\right), \quad \mu = -\frac{n}{37}, \; \sigma^2 = \frac{1368\,n}{1369}`} />
            </div>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`P(T = t) \approx \Phi\!\left(\frac{t + 1 - \mu}{\sigma}\right) - \Phi\!\left(\frac{t - 1 - \mu}{\sigma}\right)`} />
            </div>
            <div className="house-edge__formula-block">
              <Formula expression={String.raw`\sup_x |F_{\text{exact}}(x) - F_{\text{normal}}(x)| \le \frac{0.4748}{\sqrt{n}}`} />
            </div>

            <h3 className="house-edge__subheading">Dependence on n</h3>
            <ul className="house-edge__assumptions">
              <li>
                The standard error of the mean shrinks like 1/√n, and P(T &gt; 0)
                → 0 as n grows: the edge accumulates.
              </li>
              <li>
                Larger n does NOT guarantee a smaller deviation in a single run;
                a single session can still come out ahead. Only the average over
                many sessions is pulled toward −n/37.
              </li>
              <li>
                The normal approximation is rough for small n (say n &lt; 100) and
                improves as n grows.
              </li>
            </ul>

            <h3 className="house-edge__subheading">Assumptions</h3>
            <ul className="house-edge__assumptions">
              <li>European roulette: 37 equally likely pockets (0–36), no double zero.</li>
              <li>No en prison / La Partage: a zero loses the full bet.</li>
              <li>Plays are independent and identically distributed.</li>
              <li>
                The visible session is simulated play by play; P(T &gt; 0) is exact
                from the Binomial tail, and the Berry–Esseen value is an upper
                bound, not the actual error.
              </li>
            </ul>
          </div>
        </TheoryCard>
      </section>
    </div>
  )
}

export default HouseEdge

