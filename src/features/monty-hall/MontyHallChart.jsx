import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette: green experiment, gold theory. */
const EXPERIMENT_COLOR = '#67d59a' /* --color-positive */
const THEORY_COLOR = '#d8b45a' /* --color-accent */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}

const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/**
 * Grouped bar chart comparing experimental and theoretical win rates.
 *
 * Receives full-precision rates through props and converts them to percentages
 * for the chart coordinates. It runs no simulation and holds no theoretical
 * constants: the caller supplies both the empirical and the theoretical rates.
 *
 * @param {object} props
 * @param {number} props.switchEmpiricalRate - Observed "always switch" rate in [0, 1].
 * @param {number} props.switchTheoreticalRate - Theoretical "always switch" rate in [0, 1].
 * @param {number} props.stayEmpiricalRate - Observed "always stay" rate in [0, 1].
 * @param {number} props.stayTheoreticalRate - Theoretical "always stay" rate in [0, 1].
 * @returns {import('react').ReactElement} The chart block.
 */
function MontyHallChart({
  switchEmpiricalRate,
  switchTheoreticalRate,
  stayEmpiricalRate,
  stayTheoreticalRate,
}) {
  const data = [
    {
      strategy: 'Switch',
      Experiment: switchEmpiricalRate * 100,
      Theory: switchTheoreticalRate * 100,
    },
    {
      strategy: 'Stay',
      Experiment: stayEmpiricalRate * 100,
      Theory: stayTheoreticalRate * 100,
    },
  ]

  return (
    <figure className="monty-hall__chart-block">
      {/* Axis heading lives in normal flow, outside the SVG plot. */}
      <figcaption className="monty-hall__chart-axis-title">Win rate (%)</figcaption>

      <div className="monty-hall__chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" vertical={false} />
            <XAxis
              dataKey="strategy"
              tick={{ fill: '#b1bdb4' }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#b1bdb4' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, name, item) => [
                `${value.toFixed(2)}%`,
                `${item?.payload?.strategy} · ${name}`,
              ]}
            />
            <Bar
              dataKey="Experiment"
              fill={EXPERIMENT_COLOR}
              isAnimationActive={false}
              maxBarSize={48}
            />
            <Bar dataKey="Theory" fill={THEORY_COLOR} isAnimationActive={false} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* X-axis heading and legend sit below the plot, outside the SVG. */}
      <p className="monty-hall__chart-strategy">Strategy</p>
      <ul className="monty-hall__legend">
        <li className="monty-hall__legend-item">
          <span className="monty-hall__legend-swatch" aria-hidden="true" style={{ background: EXPERIMENT_COLOR }} />
          Experiment
        </li>
        <li className="monty-hall__legend-item">
          <span className="monty-hall__legend-swatch" aria-hidden="true" style={{ background: THEORY_COLOR }} />
          Theory
        </li>
      </ul>
    </figure>
  )
}

export default MontyHallChart
