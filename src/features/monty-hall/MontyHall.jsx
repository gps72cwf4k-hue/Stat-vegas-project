import { useState } from 'react'
import ControlPanel from '../../components/ControlPanel.jsx'
import ChartPanel from '../../components/ChartPanel.jsx'
import TheoryCard from '../../components/TheoryCard.jsx'
import MetricCard from '../../components/MetricCard.jsx'
import { getMontyHallProbabilities } from '../../math/montyHall.js'
import { runMontyHallSimulation } from '../../simulation/montyHall.js'
import Formula from '../../components/Formula.jsx'
import InteractiveRound from './InteractiveRound.jsx'
import MontyHallChart from './MontyHallChart.jsx'
import './MontyHall.css'

/* Engine and UI share the same supported range; the engine also accepts N=1. */
const MIN_EXPERIMENTS = 100
const MAX_EXPERIMENTS = 50000
const DEFAULT_EXPERIMENTS = '1000'

/* Decimal digits only after trimming (no sign, fraction or exponent). */
const DIGITS_ONLY = /^\d+$/

const SUMMARY_TEXT =
  'Switching wins with theoretical probability 2/3. Observed deviations from ' +
  'this value are random. These are paired outcomes of the same experiments ' +
  '(one car placement and host reveal per experiment), not independent ' +
  'strategy runs.'

/**
 * Parse and validate the experiment count.
 *
 * @param {string} raw - The raw input string.
 * @returns {{ value?: number, error?: string }} The parsed count or an error.
 */
function parseExperiments(raw) {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { error: 'Enter the number of experiments.' }
  }
  if (!DIGITS_ONLY.test(trimmed)) {
    return { error: 'Use whole numbers only (no signs, decimals or exponents).' }
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return { error: 'That number is too large to be a safe integer.' }
  }
  if (value < MIN_EXPERIMENTS || value > MAX_EXPERIMENTS) {
    return {
      error: `Use a whole number between ${MIN_EXPERIMENTS} and ${MAX_EXPERIMENTS}.`,
    }
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
  // Empty or whitespace-only means "no seed".
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
 * Format a win rate as a percentage string with two decimals.
 *
 * @param {number} rate - A rate in [0, 1].
 * @returns {string} The percentage text (for example "66.67%").
 */
function formatPercent(rate) {
  return `${(rate * 100).toFixed(2)}%`
}


/**
 * One strategy's result group (empirical rate, theory, difference, wins).
 *
 * @param {object} props
 * @param {string} props.title - Strategy name.
 * @param {number} props.empiricalRate - Observed win rate.
 * @param {number} props.theoreticalRate - Exact theoretical win rate.
 * @param {number} props.wins - Number of wins.
 * @param {number} props.experiments - Number of experiments.
 * @returns {import('react').ReactElement} The strategy group.
 */
function StrategyGroup({ title, empiricalRate, theoreticalRate, wins, experiments }) {
  const differencePoints = 100 * Math.abs(empiricalRate - theoreticalRate)

  return (
    <section className="monty-hall__group" aria-label={title}>
      <h3 className="monty-hall__group-title">{title}</h3>
      <div className="monty-hall__metrics">
        <MetricCard label="Empirical win rate" value={formatPercent(empiricalRate)} />
        <MetricCard label="Theoretical win rate" value={formatPercent(theoreticalRate)} />
        <MetricCard
          label="Absolute difference (percentage points)"
          value={differencePoints.toFixed(2)}
        />
      </div>
      <p className="monty-hall__wins">
        Wins: {wins.toLocaleString('en-US')} / {experiments.toLocaleString('en-US')}
      </p>
    </section>
  )
}


/**
 * The Monty Hall attraction: controls, results and plain-text theory.
 *
 * It owns all of its local state and calls the tested engine
 * (`runMontyHallSimulation`) only on an explicit Run action. Chart and KaTeX
 * rendering are deferred, so results are shown as plain metric cards.
 *
 * @returns {import('react').ReactElement} The attraction content.
 */
function MontyHall() {
  const [experimentsInput, setExperimentsInput] = useState(DEFAULT_EXPERIMENTS)
  const [seedInput, setSeedInput] = useState('')
  const [result, setResult] = useState(null)
  const [runMeta, setRunMeta] = useState(null)
  const [errors, setErrors] = useState({})
  const [runtimeError, setRuntimeError] = useState('')
  const [stale, setStale] = useState(false)

  const theory = getMontyHallProbabilities()

  const experimentsErrorId = 'monty-hall-experiments-error'
  const experimentsHelpId = 'monty-hall-experiments-help'
  const seedErrorId = 'monty-hall-seed-error'
  const seedHelpId = 'monty-hall-seed-help'

  /**
   * Run the simulation from the current (validated) inputs.
   *
   * @param {import('react').FormEvent<HTMLFormElement>} event - Submit event.
   */
  function handleSubmit(event) {
    event.preventDefault()

    const experimentsCheck = parseExperiments(experimentsInput)
    const seedCheck = parseSeed(seedInput)

    const nextErrors = {}
    if (experimentsCheck.error) {
      nextErrors.experiments = experimentsCheck.error
    }
    if (seedCheck.error) {
      nextErrors.seed = seedCheck.error
    }

    if (Object.keys(nextErrors).length > 0) {
      // Validation failed: do not call the engine, keep the last result.
      setErrors(nextErrors)
      return
    }

    try {
      const seed = seedCheck.value === null ? undefined : seedCheck.value
      const nextResult = runMontyHallSimulation({
        experiments: experimentsCheck.value,
        seed,
      })
      // Keep the full-precision result and the metadata of this run.
      setResult(nextResult)
      setRunMeta({ experiments: experimentsCheck.value, seed: seedCheck.value })
      setErrors({})
      setRuntimeError('')
      setStale(false)
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'The simulation could not run.',
      )
    }
  }

  /** Restore the defaults and clear every result/error/stale marker. */
  function handleReset() {
    setExperimentsInput(DEFAULT_EXPERIMENTS)
    setSeedInput('')
    setResult(null)
    setRunMeta(null)
    setErrors({})
    setRuntimeError('')
    setStale(false)
  }

  return (
    <div className="monty-hall">
      <InteractiveRound />
      <div className="monty-hall__grid">
        <ControlPanel>
          <form className="monty-hall__form" onSubmit={handleSubmit} noValidate>
            <p className="monty-hall__intro">
              Each experiment compares switching and staying using the same car
              placement, initial choice, and host reveal.
            </p>

            <div className="monty-hall__field">
              <label className="monty-hall__label" htmlFor="monty-hall-experiments">
                Number of experiments
              </label>
              <input
                id="monty-hall-experiments"
                className="input"
                type="number"
                inputMode="numeric"
                min={MIN_EXPERIMENTS}
                max={MAX_EXPERIMENTS}
                step={1}
                value={experimentsInput}
                aria-invalid={errors.experiments ? true : undefined}
                aria-describedby={`${experimentsHelpId}${errors.experiments ? ` ${experimentsErrorId}` : ''}`}
                onChange={(event) => {
                  setExperimentsInput(event.target.value)
                  setStale(true)
                }}
              />
              <p className="monty-hall__help" id={experimentsHelpId}>
                Whole numbers from {MIN_EXPERIMENTS} to {MAX_EXPERIMENTS}.
              </p>
              {errors.experiments ? (
                <p className="monty-hall__error" id={experimentsErrorId} role="alert">
                  {errors.experiments}
                </p>
              ) : null}
            </div>

            <div className="monty-hall__field">
              <label className="monty-hall__label" htmlFor="monty-hall-seed">
                Seed (optional)
              </label>
              <input
                id="monty-hall-seed"
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={seedInput}
                aria-invalid={errors.seed ? true : undefined}
                aria-describedby={`${seedHelpId}${errors.seed ? ` ${seedErrorId}` : ''}`}
                onChange={(event) => {
                  setSeedInput(event.target.value)
                  setStale(true)
                }}
              />
              <p className="monty-hall__help" id={seedHelpId}>
                Use a seed to reproduce a run. Seeds are normalized to 32 bits.
                The seed below applies to batch simulations only.
              </p>
              {errors.seed ? (
                <p className="monty-hall__error" id={seedErrorId} role="alert">
                  {errors.seed}
                </p>
              ) : null}
            </div>

            <div className="monty-hall__actions">
              <button type="submit" className="button button--primary">
                Run simulation
              </button>
              <button type="button" className="button" onClick={handleReset}>
                Reset
              </button>
            </div>

            {runtimeError ? (
              <p className="monty-hall__error" role="alert">
                {runtimeError}
              </p>
            ) : null}
          </form>
        </ControlPanel>



        <ChartPanel summary={result ? SUMMARY_TEXT : undefined}>
          {result ? (
            <div className="monty-hall__results">
              <dl className="monty-hall__meta">
                <dt>Experiments</dt>
                <dd>{runMeta.experiments.toLocaleString('en-US')}</dd>
                <dt>Seed</dt>
                <dd>{runMeta.seed === null ? 'Unseeded' : runMeta.seed}</dd>
              </dl>

              {stale ? (
                <p className="monty-hall__stale">
                  Results from previous run. Run again to apply your changes.
                </p>
              ) : null}

              <div>
                <MontyHallChart
                  switchEmpiricalRate={result.switchWinRate}
                  switchTheoreticalRate={theory.switch}
                  stayEmpiricalRate={result.stayWinRate}
                  stayTheoreticalRate={theory.stay}
                />
                <p className="monty-hall__chart-caption">
                  Experimental win rates compared with the theoretical
                  probabilities.
                </p>
              </div>

              <div className="monty-hall__groups">
                <StrategyGroup
                  title="Always switch"
                  empiricalRate={result.switchWinRate}
                  theoreticalRate={theory.switch}
                  wins={result.switchWins}
                  experiments={result.experiments}
                />
                <StrategyGroup
                  title="Always stay"
                  empiricalRate={result.stayWinRate}
                  theoreticalRate={theory.stay}
                  wins={result.stayWins}
                  experiments={result.experiments}
                />
              </div>
            </div>
          ) : (
            <p className="monty-hall__empty">
              Run a simulation to compare experimental results with theory.
            </p>
          )}
        </ChartPanel>

        <TheoryCard distributionLabel="Conditional / Bayes">
          <div className="monty-hall__theory">
            <div className="monty-hall__formula-block">
              <Formula expression={String.raw`P(\text{win by staying}) = \frac{1}{3}`} />
            </div>
            <div className="monty-hall__formula-block">
              <Formula expression={String.raw`P(\text{win by switching}) = \frac{2}{3}`} />
            </div>

            <p>
              The initial choice contains the car with probability 1/3. If it
              initially contains a goat, switching wins; the initial choice
              contains a goat with probability 2/3. The host's reveal is
              informed — the host never opens the car door or the player's door,
              so the remaining unopened door concentrates the 2/3.
            </p>

            <h3 className="monty-hall__subheading">A conditional-probability view</h3>
            <p>
              Suppose the player initially chooses Door 1, let C_i mean the car
              is behind Door i, and let H_3 mean the host opens Door 3. Because
              the host is informed, the likelihoods (conditioned on the player's
              choice of Door 1) are:
            </p>
            <div className="monty-hall__formula-block">
              <Formula expression={String.raw`P(H_3 \mid C_1) = \frac{1}{2}, \quad P(H_3 \mid C_2) = 1, \quad P(H_3 \mid C_3) = 0`} displayMode={false} />
            </div>
            <p>With uniform priors P(C_i) = 1/3, the total probability of opening Door 3 is:</p>
            <div className="monty-hall__formula-block">
              <Formula expression={String.raw`P(H_3) = \tfrac{1}{2}\cdot\tfrac{1}{3} + 1\cdot\tfrac{1}{3} + 0\cdot\tfrac{1}{3} = \frac{1}{2}`} displayMode={false} />
            </div>
            <p>Bayes' formula then gives the posterior that the car sits behind Door 2:</p>
            <div className="monty-hall__formula-block">
              <Formula expression={String.raw`P(C_2 \mid H_3) = \frac{P(H_3 \mid C_2)\,P(C_2)}{P(H_3)} = \frac{1 \cdot \frac{1}{3}}{\frac{1}{2}} = \frac{2}{3}`} displayMode={false} />
            </div>
            <p>
              These likelihoods hold for the standard rules with the stated
              player choice; different host behaviour would change them.
            </p>

            <h3 className="monty-hall__subheading">Assumptions</h3>
            <ul className="monty-hall__assumptions">
              <li>Three doors: one car and two goats.</li>
              <li>The car placement is uniform over the three doors.</li>
              <li>The player's initial choice is uniform and independent.</li>
              <li>The host knows where the car is.</li>
              <li>The host always opens an unchosen goat door.</li>
              <li>
                When two goat doors are available, the host chooses uniformly
                between them.
              </li>
            </ul>
          </div>
        </TheoryCard>
      </div>
    </div>
  )
}

export default MontyHall
