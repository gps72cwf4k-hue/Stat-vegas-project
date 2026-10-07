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
import Formula from '../../components/Formula.jsx'

/* Series colors reuse the existing palette. */
const W_COLOR = '#67d59a' /* --color-positive */
const X_COLOR = '#d8b45a' /* --color-accent */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * PMF bar/line chart: the two-point PMF of the single-play profit W, and the
 * Binomial(n, 18/37) PMF of the win count X (n = plays per session).
 *
 * The two distributions have different supports, so they are shown as two small
 * stacked charts. For large n the Binomial support (k = 0..n) is grouped into
 * at most `maxBars` contiguous bins; each plotted value is the SUM of the
 * masses in its interval (never a midpoint average), so the total mass is
 * preserved.
 *
 * @param {object} props
 * @param {object} props.data - Output of `buildHouseEdgeChartData`.
 * @returns {import('react').ReactElement} The chart block.
 */
function HouseEdgePmfChart({ data }) {
  const wData = data.wPmf.map((entry) => ({
    label: entry.value > 0 ? '+1' : '−1',
    Probability: entry.prob * 100,
  }))

  const xData = data.binomialPmf.map((bin) => ({
    label: bin.label,
    Probability: bin.probability * 100,
  }))

  const wMax = Math.min(100, Math.max(1, Math.ceil(
    wData.reduce((max, row) => Math.max(max, row.Probability), 0) * 1.15,
  )))
  const xMax = Math.min(100, Math.max(1, Math.ceil(
    xData.reduce((max, row) => Math.max(max, row.Probability), 0) * 1.15,
  )))

  return (
    <div className="house-edge__chart-block">
      <figcaption className="house-edge__chart-axis-title">
        Single-play profit W — PMF (%)
      </figcaption>
      <div className="house-edge__chart house-edge__chart--short">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={wData}
            margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
            />
            <YAxis
              domain={[0, wMax]}
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
              labelFormatter={(label) => `W = ${label}`}
              formatter={(value) => [`${value.toFixed(3)}%`, 'Probability']}
            />
            <Bar
              dataKey="Probability"
              name="P(W)"
              fill={W_COLOR}
              isAnimationActive={false}
              maxBarSize={80}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="house-edge__legend">
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch"
            aria-hidden="true"
            style={{ background: W_COLOR }}
          />
          P(W = +1) = 18/37, P(W = −1) = 19/37
        </li>
      </ul>

      <figcaption className="house-edge__chart-axis-title house-edge__chart-section-title">
        Win count X — PMF (%)
      </figcaption>
      {/* Distribution notation in KaTeX so lowercase n is preserved (the axis
          title style uppercases text, which would render n as N). */}
      <p className="house-edge__chart-note">
        <Formula expression={String.raw`X \sim \operatorname{Binomial}(n,\ 18/37)`} displayMode={false} />
      </p>
      <div className="house-edge__chart house-edge__chart--short">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={xData}
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
              domain={[0, xMax]}
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
              labelFormatter={(label) => `X in ${label}`}
              formatter={(value) => [`${value.toFixed(3)}%`, 'Probability']}
            />
            <Line
              type="linear"
              dataKey="Probability"
              name="P(X = k)"
              stroke={X_COLOR}
              strokeWidth={2}
              dot={data.binomialPmf.length <= 60}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="house-edge__chart-axis-label">Win count X</p>
      <ul className="house-edge__legend">
        <li className="house-edge__legend-item">
          <span
            className="house-edge__legend-swatch"
            aria-hidden="true"
            style={{ background: X_COLOR }}
          />
          {data.binomialPmf.length} plotted value(s)
        </li>
      </ul>
      {data.binomialGrouped ? (
        <p className="house-edge__chart-caption">
          The Binomial support is grouped for display: each plotted value is the
          total probability of its interval, so the mass is preserved (not
          averaged).
        </p>
      ) : null}
    </div>
  )
}

export default HouseEdgePmfChart

