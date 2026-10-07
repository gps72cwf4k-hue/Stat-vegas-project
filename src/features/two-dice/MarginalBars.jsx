import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette: green empirical, gold theory. */
const EMPIRICAL_COLOR = '#67d59a' /* --color-positive */
const THEORY_COLOR = '#d8b45a' /* --color-accent */

const TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}

/**
 * Grouped bar chart comparing an empirical marginal against its theoretical
 * marginal, for one variable (X, Y, S or M).
 *
 * Values are probabilities (never densities). The chart is a pure presentation
 * component: it receives the labels and the two probability arrays and does not
 * recompute anything.
 *
 * @param {object} props
 * @param {string} props.variableName - Display name (for example "X").
 * @param {number[]} props.labels - Discrete value behind each bar.
 * @param {number[]} props.empirical - Empirical probabilities per value.
 * @param {number[]} props.theory - Theoretical probabilities per value.
 * @returns {import('react').ReactElement} The marginal chart block.
 */
function MarginalBars({ variableName, labels, empirical, theory }) {
  const data = labels.map((label, index) => ({
    label: `P(${variableName}=${label})`,
    empirical: empirical[index] * 100,
    theory: theory[index] * 100,
  }))

  const maxValue = data.reduce(
    (max, row) => Math.max(max, row.empirical, row.theory),
    0,
  )
  const yMax = Math.min(100, Math.max(5, Math.ceil(maxValue * 1.15)))

  return (
    <figure className="two-dice__marginal-block">
      <figcaption className="two-dice__chart-axis-title">
        Marginal of {variableName} (%)
      </figcaption>
      <div className="two-dice__marginal-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#b1bdb4', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={48}
            />
            <YAxis
              domain={[0, yMax]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fill: '#b1bdb4' }}
              formatter={(value, name) => [`${value.toFixed(3)}%`, name]}
            />
            <Bar
              dataKey="empirical"
              name="Empirical"
              fill={EMPIRICAL_COLOR}
              isAnimationActive={false}
            />
            <Bar
              dataKey="theory"
              name="Theoretical"
              fill={THEORY_COLOR}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default MarginalBars
