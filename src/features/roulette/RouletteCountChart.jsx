import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette: green experiment, gold theory. */
const EXPERIMENT_COLOR = '#67d59a' /* --color-positive */
const BINOMIAL_COLOR = '#d8b45a' /* --color-accent */
const POISSON_COLOR = '#f07878' /* --color-negative */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * Comparison chart of the empirical event-count distribution against the exact
 * Binomial(n, p) and (optionally) the Poisson(n·p) approximation.
 *
 * Receives full-precision bucket data from `buildRouletteCountChartData` and
 * converts probabilities to percentages for the chart coordinates only. These
 * are discrete probability masses per bucket (never densities). For grouped
 * buckets the lines are straight segments connecting bucket masses — visual
 * guides, not a smoothed density.
 *
 * @param {object} props
 * @param {object} props.data - Output of `buildRouletteCountChartData`.
 * @returns {import('react').ReactElement} The chart block.
 */
function RouletteCountChart({ data }) {
  const includePoisson = data.includePoisson
  const chartData = data.buckets.map((bucket) => ({
    label: bucket.label,
    Experiment: bucket.empiricalProbability * 100,
    Binomial: bucket.binomialProbability * 100,
    ...(includePoisson ? { Poisson: bucket.poissonProbability * 100 } : {}),
    empiricalCount: bucket.empiricalCount,
    low: bucket.low,
    high: bucket.high,
    isPoissonBeyondN: bucket.isPoissonBeyondN,
  }))

  // Automatic Y bound (never above 100%) so tiny values stay readable.
  const maxValue = chartData.reduce((max, row) => {
    const values = includePoisson
      ? [row.Experiment, row.Binomial, row.Poisson]
      : [row.Experiment, row.Binomial]
    return Math.max(max, ...values)
  }, 0)
  const yMax = Math.min(100, Math.max(1, Math.ceil(maxValue * 1.1)))

  const rangeLabel = (row) => {
    if (row.isPoissonBeyondN) return `> ${data.spins}`
    if (row.low === row.high) return String(row.low)
    return `${row.low}–${row.high}`
  }

  return (
    <figure className="roulette__chart-block">
      {/* Axis heading lives in normal flow, outside the SVG plot. */}
      <figcaption className="roulette__chart-axis-title">
        Probability per count bucket (%)
      </figcaption>

      <div className="roulette__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, yMax]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label, payload) => {
                const row = payload && payload[0] ? payload[0].payload : null
                return row ? `Counts ${rangeLabel(row)}` : label
              }}
              formatter={(value, name, item) => {
                const row = item?.payload
                const suffix =
                  name === 'Experiment' && row ? ` (${row.empiricalCount} experiments)` : ''
                return [`${value.toFixed(3)}%${suffix}`, name]
              }}
            />
            <Bar
              dataKey="Experiment"
              name="Experiment"
              fill={EXPERIMENT_COLOR}
              isAnimationActive={false}
              maxBarSize={40}
            />
            <Line
              type="linear"
              dataKey="Binomial"
              name="Binomial (exact)"
              stroke={BINOMIAL_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {includePoisson ? (
              <Line
                type="linear"
                dataKey="Poisson"
                name="Poisson (approx.)"
                stroke={POISSON_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* X-axis heading and legend sit below the plot, outside the SVG. */}
      <p className="roulette__chart-axis-label">Event hits per experiment</p>
      <ul className="roulette__legend">
        <li className="roulette__legend-item">
          <span
            className="roulette__legend-swatch"
            aria-hidden="true"
            style={{ background: EXPERIMENT_COLOR }}
          />
          Experiment
        </li>
        <li className="roulette__legend-item">
          <span
            className="roulette__legend-swatch"
            aria-hidden="true"
            style={{ background: BINOMIAL_COLOR }}
          />
          Binomial (exact)
        </li>
        {includePoisson ? (
          <li className="roulette__legend-item">
            <span
              className="roulette__legend-swatch roulette__legend-swatch--dashed"
              aria-hidden="true"
              style={{ borderColor: POISSON_COLOR }}
            />
            Poisson (approx.)
          </li>
        ) : null}
      </ul>

      {data.grouped ? (
        <p className="roulette__chart-caption">
          Adjacent counts are grouped; each plotted value is the total probability
          within its labeled interval.
        </p>
      ) : null}
      <p className="roulette__chart-caption">
        Lines are visual guides connecting bucket masses (not a smoothed curve).
      </p>
    </figure>
  )
}

export default RouletteCountChart

