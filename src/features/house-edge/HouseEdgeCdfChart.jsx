import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette. */
const EMPIRICAL_COLOR = '#67d59a' /* --color-positive */
const NORMAL_COLOR = '#d8b45a' /* --color-accent */
const EXACT_COLOR = '#f07878' /* --color-negative */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * CDF plot of the session total T: the empirical CDF from the N sessions, the
 * continuity-corrected normal CDF and the exact Binomial-based CDF, all on the
 * same step-2 lattice grid.
 *
 * All three series are cumulative probabilities in [0, 1] evaluated at the same
 * t values, so they overlay directly. The empirical CDF is a step function of
 * the N observed totals; the exact CDF is exact for T = 2X − n.
 *
 * @param {object} props
 * @param {object} props.data - Output of `buildHouseEdgeChartData`.
 * @returns {import('react').ReactElement} The chart block.
 */
function HouseEdgeCdfChart({ data }) {
  const chartData = data.cdf.map((row) => ({
    label: String(row.t),
    t: row.t,
    Empirical: row.empirical * 100,
    Normal: row.normal * 100,
    Exact: row.exact * 100,
  }))

  return (
    <figure className="house-edge__chart-block">
      <figcaption className="house-edge__chart-axis-title">
        Cumulative probability (%)
      </figcaption>

      <div className="house-edge__chart">
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
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: '#34473b' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => `T = ${label}`}
              formatter={(value, name) => [`${value.toFixed(3)}%`, name]}
            />
            <Line
              type="monotone"
              dataKey="Empirical"
              name="Empirical CDF"
              stroke={EMPIRICAL_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Normal"
              name="Normal (continuity corrected)"
              stroke={NORMAL_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Exact"
              name="Exact (Binomial)"
              stroke={EXACT_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="house-edge__chart-axis-label">Total profit T per session</p>
      <ul className="house-edge__legend">
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch"
            aria-hidden="true"
            style={{ background: EMPIRICAL_COLOR }}
          />
          Empirical CDF (N sessions)
        </li>
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch house-edge__legend-swatch--dashed"
            aria-hidden="true"
            style={{ color: NORMAL_COLOR }}
          />
          Normal (continuity corrected)
        </li>
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch"
            aria-hidden="true"
            style={{ background: EXACT_COLOR }}
          />
          Exact (Binomial)
        </li>
      </ul>
      <p className="house-edge__chart-caption">
        The empirical curve is a right-continuous step of the N sessions, plotted
        at the same lattice points as the exact and normal CDFs. The observed
        “empirical vs exact” Kolmogorov distance is the largest vertical gap
        between those two curves; the “exact vs normal CC” distance depends only
        on n, and the Berry–Esseen bound caps it.
      </p>
    </figure>
  )
}

export default HouseEdgeCdfChart
