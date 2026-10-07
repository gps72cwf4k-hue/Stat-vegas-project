import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import Formula from '../../components/Formula.jsx'
import { POKER_CATEGORIES } from '../../math/poker.js'
import {
  runPokerSimulation,
  focusCategoryStats,
  MIN_HANDS_N,
  MAX_HANDS_N,
  DEFAULT_HANDS_N,
} from '../../simulation/poker.js'
import { runPokerExhaustiveAsync, TOTAL_HANDS } from './pokerExhaustive.js'
import PokerProbabilityChart from './PokerProbabilityChart.jsx'
import './Poker.css'

/* UI defaults mirror the engine's documented range and default. */
const DEFAULT_HANDS = String(DEFAULT_HANDS_N)
const ALL_CATEGORIES = 'all'

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

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
 * Format a probability as a percentage string with a fixed number of decimals.
 *
 * @param {number} rate - A probability in [0, 1].
 * @param {number} [digits] - Decimal places.
 * @returns {string} The percentage text.
 */
function formatPercent(rate, digits = 4) {
  return `${(rate * 100).toFixed(digits)}%`
}

/**
 * Format a count with thousands separators.
 *
 * @param {number} value - The number to format.
 * @returns {string} The formatted count.
 */
function formatCount(value) {
  return value.toLocaleString('en-US')
}

/**
 * Format a difference in percentage points for the results table.
 *
 * Always signed for non-zero values (+/−, using a real minus glyph), fixed to
 * four decimals, and negative zero is rendered as "0.0000" so the column stays
 * consistent across all rows.
 *
 * @param {number} value - The difference in percentage points.
 * @returns {string} The formatted difference.
 */
function formatDeltaPoints(value) {
  // Collapse negative zero (and any value that rounds to zero) to a clean 0.
  const rounded = Number(value.toFixed(4))
  const normalized = rounded === 0 ? 0 : rounded
  const sign = normalized > 0 ? '+' : normalized < 0 ? '\u2212' : ''
  return `${sign}${Math.abs(normalized).toFixed(4)}`
}

/**
 * The Poker attraction.
 *
 * Uses the shared ControlPanel / ChartPanel / TheoryCard / MetricCard panels.
 * Runs the seeded synchronous engine once per explicit Run, keeps the last
 * successful snapshot visible while controls are edited ("from previous run"),
 * and derives every table row, chart value and summary from the saved snapshot
 * and stored run metadata only — never from live controls.
 *
 * @returns {import('react').ReactElement} The attraction.
 */
function Poker() {
  const [handsInput, setHandsInput] = useState(DEFAULT_HANDS)
  const [seedInput, setSeedInput] = useState('')
  const [focusOption, setFocusOption] = useState(ALL_CATEGORIES)

  const [errors, setErrors] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [runMeta, setRunMeta] = useState(null)
  const [status, setStatus] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [isStale, setIsStale] = useState(false)

  const [verifyRunning, setVerifyRunning] = useState(false)
  const [verifyProgress, setVerifyProgress] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifyStatus, setVerifyStatus] = useState('')

  // One AbortController per verify run plus a run-identity guard.
  const controllerRef = useRef(null)
  const runIdRef = useRef(0)

  // Table + chart data belong to the DISPLAYED (stored) run only: recomputed
  // solely when the saved result changes, never on an input edit.
  const tableRows = useMemo(() => {
    if (!result || !runMeta) return null
    const probabilities = result.expectedProbByCategory
    return POKER_CATEGORIES.map((category) => {
      const observed = result.observedCountsByCategory[category]
      const expected = result.expectedCountsByCategory[category]
      const p = probabilities[category]
      const empirical = result.empiricalProbByCategory[category]
      const eligible = result.zScoreEligibleByCategory[category]
      const zScore = result.zScoresByCategory[category]
      return {
        category,
        observed,
        expected,
        empirical,
        p,
        // Absolute difference in percentage points.
        differencePoints: (empirical - p) * 100,
        zEligible: eligible,
        zScore,
        expectedBelowOne: expected < 1,
      }
    })
  }, [result, runMeta])

  const chartData = useMemo(() => {
    if (!result || !runMeta) return null
    return POKER_CATEGORIES.map((category) => ({
      category,
      empiricalProbability: result.empiricalProbByCategory[category],
      theoreticalProbability: result.expectedProbByCategory[category],
      observedCount: result.observedCountsByCategory[category],
    }))
  }, [result, runMeta])

  // Focus-mode quantities for the run's SAVED selected category.
  const focusStats = useMemo(() => {
    if (!result || !runMeta || runMeta.focusCategory === ALL_CATEGORIES) return null
    return focusCategoryStats({
      category: runMeta.focusCategory,
      handsN: runMeta.handsN,
      observedCount: result.observedCountsByCategory[runMeta.focusCategory],
    })
  }, [result, runMeta])

  /**
   * Read, validate and normalise the current inputs.
   *
   * @returns {{ values?: object, errors: object }} Parsed values or field errors.
   */
  function parseInputs() {
    const nextErrors = {}
    const hands = parseIntField(handsInput, 'the number of hands', MIN_HANDS_N, MAX_HANDS_N)
    const seed = parseSeed(seedInput)

    if (hands.error) nextErrors.hands = hands.error
    if (seed.error) nextErrors.seed = seed.error

    if (Object.keys(nextErrors).length > 0) {
      return { errors: nextErrors }
    }

    return {
      errors: {},
      values: {
        handsN: hands.value,
        seed: seed.value === null ? undefined : seed.value,
        focusCategory: focusOption,
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
   * Handle the Run button: validate, then run the seeded engine once. The engine
   * is synchronous, so the run is deferred by a timer tick to let the running
   * state render first; the run-identity guard ignores superseded runs.
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
    setIsRunning(true)

    const runId = (runIdRef.current += 1)

    // Defer to a macrotask so the UI shows the running state before the
    // synchronous engine blocks for its duration.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (runIdRef.current !== runId) return

    try {
      const snapshot = runPokerSimulation({
        handsN: values.handsN,
        seed: values.seed,
        focusCategory: values.focusCategory === ALL_CATEGORIES ? undefined : values.focusCategory,
      })
      if (runIdRef.current !== runId) return

      setResult(snapshot)
      setRunMeta({
        handsN: snapshot.inputs.handsN,
        seedUsed: snapshot.inputs.seedUsed,
        seedWasProvided: values.seed !== undefined,
        focusCategory: values.focusCategory,
      })
      setStatus('')
      setRuntimeError('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      setRuntimeError(
        error && error.message ? error.message : 'Unexpected error during the run.',
      )
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false)
      }
    }
  }

  /**
   * Handle Reset: cancel any verify run and clear all state back to defaults.
   */
  function handleReset() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    runIdRef.current += 1
    controllerRef.current = null

    setHandsInput(DEFAULT_HANDS)
    setSeedInput('')
    setFocusOption(ALL_CATEGORIES)

    setErrors({})
    setIsRunning(false)
    setResult(null)
    setRunMeta(null)
    setStatus('')
    setRuntimeError('')
    setIsStale(false)

    setVerifyRunning(false)
    setVerifyProgress(null)
    setVerifyResult(null)
    setVerifyStatus('')
  }

  /**
   * Handle the exhaustive verification button: classify all 2,598,960 hands in
   * bounded async chunks with progress and cancellation.
   */
  async function handleVerify() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    const controller = new AbortController()
    controllerRef.current = controller
    const runId = (runIdRef.current += 1)

    setVerifyRunning(true)
    setVerifyProgress({ completed: 0, total: TOTAL_HANDS })
    setVerifyStatus('')

    try {
      const verifiedResult = await runPokerExhaustiveAsync({
        signal: controller.signal,
        onProgress: (next) => {
          if (runIdRef.current !== runId) return
          setVerifyProgress(next)
        },
      })
      if (runIdRef.current !== runId) return
      setVerifyResult(verifiedResult)
      setVerifyStatus('')
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error && error.name === 'AbortError') {
        setVerifyStatus('Verification cancelled.')
      } else {
        setVerifyStatus(
          error && error.message ? error.message : 'Unexpected error during verification.',
        )
      }
    } finally {
      if (runIdRef.current === runId) {
        setVerifyRunning(false)
        setVerifyProgress(null)
      }
    }
  }

  /** Cancel the exhaustive verification without discarding prior output. */
  function handleCancelVerify() {
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
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

  // Derived labels come from the stored run only.
  const seedLabel = runMeta
    ? runMeta.seedWasProvided
      ? String(runMeta.seedUsed)
      : `${runMeta.seedUsed} (generated)`
    : ''

  // Merged-class note for the saved chi-square result.
  const mergedNote = useMemo(() => {
    if (!result || !runMeta) return ''
    return result.chiSquare.classes
      .filter((mergedClass) => mergedClass.categories.length > 1)
      .map((mergedClass) => mergedClass.categories.join(' + '))
      .join('; ')
  }, [result, runMeta])

  // Short plain-English summary obeying the spec wording rules.
  const summary = useMemo(() => {
    if (!result || !runMeta) return ''
    const rare = tableRows.filter((row) => row.expectedBelowOne).map((row) => row.category)
    const rareText =
      rare.length > 0
        ? ` Categories with an expected count below 1 (${rare.join(', ')}) are very likely to show 0 observed; that is expected, not a discrepancy.`
        : ''
    return (
      `Dealt ${formatCount(runMeta.handsN)} independent hands from a fresh deck. ` +
      `The simulation illustrates the combinatorial theory; it never proves it. ` +
      `A fixed seed reproduces this exact run, but one seed is still one sample.` +
      rareText
    )
  }, [result, runMeta, tableRows])


  return (
    <div className="poker">
      <div className="poker__grid">
        {/* --- Controls --------------------------------------------------- */}
        <ControlPanel>
          <div className="poker__form">
            <p className="poker__intro">
              Deal N independent 5-card hands, each from a fresh full deck, and
              compare the observed category frequencies with the exact
              combinatorial probabilities.
            </p>

            <div className="poker__field">
              <label className="poker__label" htmlFor="poker-hands">
                Number of hands (N)
              </label>
              <input
                id="poker-hands"
                className="input"
                type="text"
                inputMode="numeric"
                value={handsInput}
                disabled={isRunning}
                aria-invalid={errors.hands ? 'true' : undefined}
                aria-describedby={errors.hands ? 'poker-hands-error' : undefined}
                onChange={(e) => {
                  setHandsInput(e.target.value)
                  markStale()
                }}
              />
              {errors.hands ? (
                <p className="poker__error" id="poker-hands-error" role="alert">
                  {errors.hands}
                </p>
              ) : (
                <p className="poker__help">
                  Whole number between {MIN_HANDS_N} and {MAX_HANDS_N}. Default{' '}
                  {DEFAULT_HANDS_N}.
                </p>
              )}
            </div>

            <div className="poker__field">
              <label className="poker__label" htmlFor="poker-seed">
                Seed (optional)
              </label>
              <input
                id="poker-seed"
                className="input"
                type="text"
                inputMode="numeric"
                value={seedInput}
                disabled={isRunning}
                placeholder="Leave empty to generate one"
                aria-invalid={errors.seed ? 'true' : undefined}
                aria-describedby={errors.seed ? 'poker-seed-error' : undefined}
                onChange={(e) => {
                  setSeedInput(e.target.value)
                  markStale()
                }}
              />
              {errors.seed ? (
                <p className="poker__error" id="poker-seed-error" role="alert">
                  {errors.seed}
                </p>
              ) : (
                <p className="poker__help">
                  Nonnegative whole number. If empty, a seed is generated and
                  displayed so the run can be reproduced.
                </p>
              )}
            </div>

            <div className="poker__field">
              <label className="poker__label" htmlFor="poker-focus">
                Focus
              </label>
              <select
                id="poker-focus"
                className="input"
                value={focusOption}
                disabled={isRunning}
                onChange={(e) => {
                  setFocusOption(e.target.value)
                  markStale()
                }}
              >
                <option value={ALL_CATEGORIES}>Show all categories</option>
                {POKER_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <p className="poker__help">
                Focus on one category to also see its exact binomial quantities.
              </p>
            </div>

            <div className="poker__actions">
              <button
                type="button"
                className="button"
                onClick={handleRun}
                disabled={isRunning}
              >
                {isRunning ? 'Running…' : 'Run simulation'}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={handleReset}
              >
                Reset
              </button>
            </div>

            {isRunning ? (
              <p className="poker__note">
                Dealing {formatCount(parseIntField(handsInput, 'N', MIN_HANDS_N, MAX_HANDS_N).value ?? 0)}{' '}
                hands…
              </p>
            ) : null}
            {isStale ? (
              <p className="poker__stale" role="status">
                Controls changed — results below are from the previous run.
              </p>
            ) : null}
            {status ? <p className="poker__note">{status}</p> : null}
            {runtimeError ? (
              <p className="poker__error" role="alert">
                {runtimeError}
              </p>
            ) : null}
          </div>
        </ControlPanel>

        {/* --- Results ---------------------------------------------------- */}
        <ChartPanel summary={summary || undefined}>
          {result && runMeta ? (
            <div className="poker__results">
              <div className="poker__metrics">
                <MetricCard label="Hands dealt (N)" value={formatCount(runMeta.handsN)} />
                <MetricCard label="Seed used" value={seedLabel} />
                <MetricCard
                  label="χ² statistic"
                  value={result.chiSquare.chi2.toFixed(3)}
                  description={`dof = ${result.chiSquare.dof}`}
                />
                <MetricCard
                  label="p-value"
                  value={result.chiSquare.pValue.toFixed(4)}
                  description="Goodness of fit; not proof."
                />
              </div>

              {focusStats ? (
                <div className="poker__focus">
                  <h3 className="poker__subheading">Focus: {focusStats.category}</h3>
                  <div className="poker__metrics">
                    <MetricCard
                      label="Observed Oᵢ"
                      value={formatCount(focusStats.observedCount)}
                    />
                    <MetricCard
                      label="Expected Npᵢ"
                      value={focusStats.expectedCount.toFixed(3)}
                    />
                    <MetricCard
                      label="P(X = 0)"
                      value={focusStats.probabilityZero.toExponential(4)}
                      description="(1 − p)^N"
                    />
                    <MetricCard
                      label="P(X ≥ observed)"
                      value={focusStats.tailProbability.toExponential(4)}
                      description="Exact binomial tail"
                    />
                  </div>
                  <p className="poker__note">
                    {focusStats.zEligible
                      ? `Npᵢ ≥ 10, so a z-score applies: ${focusStats.zScore.toFixed(3)}.`
                      : 'n/a (expected < 10): a z-score is not shown for this rare category.'}
                  </p>
                </div>
              ) : null}

              <table className="poker__table">
                <caption className="poker__table-caption">
                  Observed vs expected per category (from the saved run)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Oᵢ</th>
                    <th scope="col">Eᵢ = Npᵢ</th>
                    <th scope="col">Oᵢ/N</th>
                    <th scope="col">pᵢ</th>
                    <th scope="col">Δ (pp)</th>
                    <th scope="col">z</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.category}>
                      <th scope="row">{row.category}</th>
                      <td>{formatCount(row.observed)}</td>
                      <td>{row.expected.toFixed(3)}</td>
                      <td>{formatPercent(row.empirical)}</td>
                      <td>{formatPercent(row.p)}</td>
                      <td>{formatDeltaPoints(row.differencePoints)}</td>
                      <td>{row.zEligible ? row.zScore.toFixed(3) : 'n/a (expected < 10)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {tableRows.some((row) => row.expectedBelowOne) ? (
                <p className="poker__note">
                  Expected count &lt; 1: absence is normal. For example the royal
                  flush and straight flush are expected to show 0 at the default N
                  of {formatCount(DEFAULT_HANDS_N)} — this is not a discrepancy.
                </p>
              ) : null}

              <div className="poker__chisquare">
                <h3 className="poker__subheading">Goodness of fit (Pearson χ²)</h3>
                <p className="poker__note">
                  χ² = {result.chiSquare.chi2.toFixed(4)}, dof ={' '}
                  {result.chiSquare.dof}, p-value ={' '}
                  {result.chiSquare.pValue.toFixed(4)}. Categories were merged from
                  the rarest upward until each class had an expected count ≥ 5.
                  {mergedNote ? ` Merged: ${mergedNote}.` : ' No categories needed merging.'}
                </p>
                <ul className="poker__classes">
                  {result.chiSquare.classes.map((mergedClass, index) => (
                    <li key={index} className="poker__class-item">
                      <span className="poker__class-label">
                        {mergedClass.categories.join(' + ')}
                      </span>
                      <span className="poker__class-values">
                        O = {formatCount(mergedClass.observedCount)}, E ={' '}
                        {mergedClass.expectedCount.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="poker__note">
                  A single p-value is one sample&apos;s summary, not proof: it is
                  uniform in (0, 1) when the model is correct, so a small value
                  occasionally happens by chance.
                </p>
              </div>
            </div>
          ) : (
            <p className="poker__placeholder">
              Set N, optionally a seed and a focus category, then choose Run
              simulation. Results, the chart and the summary appear here.
            </p>
          )}

          {chartData && runMeta ? <PokerProbabilityChart data={chartData} /> : null}
        </ChartPanel>
      </div>

      {/* --- Exhaustive verification (below the grid, full width) --------- */}
      <div className="poker__verify-row">
        <ChartPanel title="Verify by exhaustive enumeration">
          <p className="poker__intro">
            Classify all {formatCount(TOTAL_HANDS)} five-card hands exactly once
            (C(52, 5)) and confirm the counts match the theory table. Runs in
            bounded chunks so the page stays responsive.
          </p>
          <div className="poker__actions">
            <button
              type="button"
              className="button"
              onClick={handleVerify}
              disabled={verifyRunning}
            >
              {verifyRunning ? 'Verifying…' : 'Verify by exhaustive enumeration'}
            </button>
            {verifyRunning ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={handleCancelVerify}
              >
                Cancel
              </button>
            ) : null}
          </div>

          {verifyRunning && verifyProgress ? (
            <p className="poker__note">
              Classified {formatCount(verifyProgress.completed)} /{' '}
              {formatCount(verifyProgress.total)} hands…
            </p>
          ) : null}
          {verifyStatus ? <p className="poker__note">{verifyStatus}</p> : null}

          {verifyResult ? (
            <div className="poker__verify">
              <p
                className={
                  verifyResult.matchesTheory
                    ? 'poker__verify-confirm'
                    : 'poker__error'
                }
                role="status"
              >
                {verifyResult.matchesTheory
                  ? `Exact match: the enumerated counts equal the theory table for all ten categories (total ${formatCount(verifyResult.total)}).`
                  : 'Mismatch: the enumerated counts differ from the theory table.'}
              </p>
              <table className="poker__table">
                <caption className="poker__table-caption">
                  Exhaustive exact counts vs theory
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Enumerated</th>
                    <th scope="col">Theory</th>
                    <th scope="col">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {POKER_CATEGORIES.map((category) => {
                    const enumerated = verifyResult.observedCountsByCategory[category]
                    const theory = verifyResult.theoryCountsByCategory[category]
                    return (
                      <tr key={category}>
                        <th scope="row">{category}</th>
                        <td>{formatCount(enumerated)}</td>
                        <td>{formatCount(theory)}</td>
                        <td>{enumerated === theory ? '✓' : '✗'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </ChartPanel>
      </div>

      {/* --- Theory (below everything, full width) ----------------------- */}
      <div className="poker__theory-row">
        <TheoryCard distributionLabel="Discrete uniform / Combinatorics">
          <div className="poker__theory">
            <p>
              The sample space is every unordered five-card subset of the standard
              52-card deck, all equally likely. Its size is:
            </p>
            <div className="poker__formula-block">
              <Formula expression={String.raw`|\Omega| = \binom{52}{5} = 2\,598\,960`} />
            </div>
            <p>
              The ten hand categories are mutually exclusive events whose union is
              Ω, so their probabilities sum to 1.
            </p>

            <h3 className="poker__subheading">Counting derivations</h3>
            <div className="poker__formula-block">
              <Formula expression={String.raw`\text{Four of a kind: } 13 \cdot 48 = 624`} />
            </div>
            <div className="poker__formula-block">
              <Formula
                expression={String.raw`\text{Full house: } 13\binom{4}{3}\cdot 12\binom{4}{2} = 13\cdot4\cdot12\cdot6 = 3744`}
              />
            </div>
            <div className="poker__formula-block">
              <Formula
                expression={String.raw`\text{Flush (excl. straight/royal): } 4\Big[\binom{13}{5}-10\Big] = 4\cdot1277 = 5108`}
              />
            </div>
            <p className="poker__note">
              The flush count subtracts the 10 straights per suit so straight
              flushes and royal flushes are excluded, keeping categories disjoint.
            </p>
          </div>
        </TheoryCard>
      </div>
    </div>
  )
}

export default Poker

