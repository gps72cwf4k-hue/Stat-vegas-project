import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette. */
const FAIR_COLOR = '#7fa8c9' /* neutral blue for the fair die */
const LOADED_COLOR = '#d8b45a' /* --color-accent for the loaded die */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * Small PMF chart comparing the two dice (fair vs loaded) over the six faces.
 *
 * Each face carries two bars: the fair probability (1/6) and the loaded
 * probability (b for face 6, (1 - b)/5 for faces 1..5). Both PMFs sum to 1, so
 * the values are directly comparable. Values are shown as percentages.
 *
 * @param {object} props
 * @param {number[]} props.fairPmf - Length-6 PMF for the fair die (faces 1..6).
 * @param {number[]} props.loadedPmf - Length-6 PMF for the loaded die (faces 1..6).
 * @param {number} props.b - Loaded-die bias (for the caption).
 * @returns {import('react').ReactElement} The chart block.
 */
function DicePmfChart({ fairPmf, loadedPmf, b }) {
  const data = fairPmf.map((fair, index) => ({
    label: String(index + 1),
    Fair: fair * 100,
    Loaded: loadedPmf[index] * 100,
  }))

  const maxValue = data.reduce(
    (max, row) => Math.max(max, row.Fair, row.Loaded),
    0,
  )
  const yMax = Math.min(100, Math.max(20, Math.ceil(maxValue * 1.15)))

  return (
    <figure className="loaded-die__chart-block">
      <figcaption className="loaded-die__chart-axis-title">
        Probability of each face (%)
      </figcaption>
      <div className="loaded-die__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
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
              domain={[0, yMax]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => `Face ${label}`}
              formatter={(value, name) => [`${value.toFixed(2)}%`, name]}
            />
            <Bar
              dataKey="Fair"
              name="Fair die"
              fill={FAIR_COLOR}
              isAnimationActive={false}
              maxBarSize={26}
            />
            <Bar
              dataKey="Loaded"
              name="Loaded die"
              fill={LOADED_COLOR}
              isAnimationActive={false}
              maxBarSize={26}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="loaded-die__chart-axis-label">Die face</p>
      <ul className="loaded-die__legend">
        <li className="loaded-die__legend-item">
          <span
            className="loaded-die__legend-swatch"
            aria-hidden="true"
            style={{ background: FAIR_COLOR }}
          />
          Fair: every face 1/6
        </li>
        <li className="loaded-die__legend-item">
          <span
            className="loaded-die__legend-swatch"
            aria-hidden="true"
            style={{ background: LOADED_COLOR }}
          />
          Loaded: P(6) = {b}, P(1..5) = {(Math.round(((1 - b) / 5) * 1000) / 1000)}
        </li>
      </ul>
      <p className="loaded-die__chart-caption">
        Both rows are valid PMFs and each sums to 100%, so the two dice are
        directly comparable.
      </p>
    </figure>
  )
}

export default DicePmfChart
