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
const NORMAL_COLOR = '#d8b45a' /* --color-accent */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * Histogram of the N session totals T, shown as the relative frequency of each
 * bin, with the continuity-corrected normal bin probabilities overlaid.
 *
 * Bins are single step-2 lattice points (width 2, edges at t ± 1) when n is
 * small; for large n neighbouring lattice points are grouped into wider
 * intervals so the chart stays readable. In every case each plotted value is the
 * probability SUMMED over its interval (mass-preserving, never averaged), and
 * the two series are directly comparable: their sums are both ≈ 1.
 *
 * @param {object} props
 * @param {object} props.data - Output of `buildHouseEdgeChartData`.
 * @returns {import('react').ReactElement} The chart block.
 */
function HouseEdgeHistogramChart({ data }) {
  const chartData = data.histogram.map((bin) => ({
    label: bin.label,
    Experiment: bin.frequency * 100,
    Normal: bin.normalProbability * 100,
    low: bin.low,
    high: bin.high,
    count: bin.count,
  }))

  // When any bin spans more than one lattice value the histogram is grouped into
  // wider intervals; the caption must then say the masses are SUMMED per interval.
  const grouped = data.histogram.some((bin) => bin.low !== bin.high)

  const maxValue = chartData.reduce(
    (max, row) => Math.max(max, row.Experiment, row.Normal),
    0,
  )
  const yMax = Math.min(100, Math.max(1, Math.ceil(maxValue * 1.1)))

  const rangeLabel = (row) =>
    row.low === row.high ? String(row.low) : `[${row.low}, ${row.high}]`

  return (
    <figure className="house-edge__chart-block">
      {/* Axis heading lives in normal flow, outside the SVG plot. */}
      <figcaption className="house-edge__chart-axis-title">
        Probability per T bin (%)
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
                return row ? `T in ${rangeLabel(row)}` : label
              }}
              formatter={(value, name, item) => {
                const row = item?.payload
                const suffix =
                  name === 'Experiment' && row ? ` (${row.count} sessions)` : ''
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
              dataKey="Normal"
              name="Normal (continuity corrected)"
              stroke={NORMAL_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* X-axis heading and legend sit below the plot, outside the SVG. */}
      <p className="house-edge__chart-axis-label">Total profit T per session</p>
      <ul className="house-edge__legend">
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch"
            aria-hidden="true"
            style={{ background: EXPERIMENT_COLOR }}
          />
          Experiment (relative frequency)
        </li>
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch house-edge__legend-swatch--dashed"
            aria-hidden="true"
            style={{ color: NORMAL_COLOR }}
          />
          Normal approximation (continuity corrected)
        </li>
      </ul>
      <p className="house-edge__chart-caption">
        {grouped
          ? 'Neighbouring lattice values are grouped into wider intervals for readability; each plotted value is the probability SUMMED over its interval (mass-preserving, never averaged), and the normal overlay uses the continuity-corrected mass of the same interval. Both series therefore still sum to about 100%.'
          : 'Each bin is one lattice point (width 2, edges at t ± 1) because T lives on a step-2 lattice. Both series are per-point probabilities, so each sums to about 100%.'}
      </p>
    </figure>
  )
}

export default HouseEdgeHistogramChart
