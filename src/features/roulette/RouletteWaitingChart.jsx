import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette: green experiment, gold theory. */
const EXPERIMENT_COLOR = '#67d59a' /* --color-positive */
const CENSORED_COLOR = '#8a6f3a' /* dimmed gold; visually distinct bar */
const GEOMETRIC_COLOR = '#d8b45a' /* --color-accent */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * Waiting-time chart: empirical distribution of the first-hit spin versus the
 * exact Geometric(p) law, with a separate right-censored category for
 * experiments with no hit within n spins.
 *
 * Receives full-precision bucket data from `buildRouletteWaitingChartData` and
 * converts probabilities to percentages for the chart coordinates only. Values
 * are discrete probability masses per bucket. The final "> n" bucket is the
 * censored category P(T > n) — not a single exact waiting time — and is drawn
 * with a distinct fill.
 *
 * @param {object} props
 * @param {object} props.data - Output of `buildRouletteWaitingChartData`.
 * @returns {import('react').ReactElement} The chart block.
 */
function RouletteWaitingChart({ data }) {
  const chartData = data.buckets.map((bucket) => ({
    label: bucket.label,
    Experiment: bucket.empiricalProbability * 100,
    Geometric: bucket.theoreticalProbability * 100,
    empiricalCount: bucket.empiricalCount,
    isCensored: bucket.isCensored,
  }))

  const maxValue = chartData.reduce(
    (max, row) => Math.max(max, row.Experiment, row.Geometric),
    0,
  )
  const yMax = Math.min(100, Math.max(1, Math.ceil(maxValue * 1.1)))

  const bucketDescription = (row) =>
    row.isCensored ? `No hit within ${data.spins} spins` : `First hit at spins ${row.label}`

  return (
    <figure className="roulette__chart-block">
      <figcaption className="roulette__chart-axis-title">
        Probability per waiting-time bucket (%)
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
                return row ? bucketDescription(row) : label
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
            >
              {chartData.map((row, index) => (
                <Cell
                  key={index}
                  fill={row.isCensored ? CENSORED_COLOR : EXPERIMENT_COLOR}
                />
              ))}
            </Bar>
            <Line
              type="linear"
              dataKey="Geometric"
              name="Geometric (exact)"
              stroke={GEOMETRIC_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="roulette__chart-axis-label">Spin of first hit / no-hit category</p>
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
            style={{ background: GEOMETRIC_COLOR }}
          />
          Geometric (exact)
        </li>
        <li className="roulette__legend-item">
          <span
            className="roulette__legend-swatch"
            aria-hidden="true"
            style={{ background: CENSORED_COLOR }}
          />
          No hit within n spins (censored)
        </li>
      </ul>

      {data.grouped ? (
        <p className="roulette__chart-caption">
          Adjacent waiting times are grouped; each plotted value is the total
          probability within its labeled interval.
        </p>
      ) : null}
      <p className="roulette__chart-caption">
        The final &quot;&gt; n&quot; category is the censored probability P(T &gt; n),
        not a single exact waiting time. Lines are visual guides connecting bucket
        masses (not a smoothed curve).
      </p>
    </figure>
  )
}

export default RouletteWaitingChart
