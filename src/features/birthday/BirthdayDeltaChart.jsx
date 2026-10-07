import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

const DELTA_COLOR = '#d8b45a' /* --color-accent */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20',
  border: '1px solid #34473b',
  borderRadius: '8px',
  color: '#f3f0e7',
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' }

/**
 * The small second chart for real-data mode: the difference
 * Δ(n) = P_real(n) − P_uniform365(n) over n = 2..100, in percentage points. Its
 * maximum is about 0.00066 (0.066 percentage points) at n = 27.
 *
 * @param {object} props
 * @param {object} props.run - The snapshot from `runBirthdaySimulation`.
 * @returns {import('react').ReactElement} The chart block.
 */
function BirthdayDeltaChart({ run }) {
  const { curves } = run
  const chartData = curves.nValues.map((n, index) => ({
    n,
    delta: curves.delta[index] * 100,
  }))

  // Find the maximum gap for the caption.
  let maxIndex = 0
  for (let index = 1; index < curves.delta.length; index += 1) {
    if (curves.delta[index] > curves.delta[maxIndex]) {
      maxIndex = index
    }
  }
  const maxN = curves.nValues[maxIndex]
  const maxDelta = curves.delta[maxIndex]

  return (
    <figure className="birthday__chart-block">
      <figcaption className="birthday__chart-axis-title">
        Difference P_real(n) − P_uniform365(n)
      </figcaption>
      <div className="birthday__chart birthday__chart--small">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" />
            <XAxis
              dataKey="n"
              type="number"
              domain={[2, 100]}
              ticks={[2, 10, 23, 27, 50, 75, 100]}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
            />
            <YAxis
              tickFormatter={(value) => `${value.toFixed(2)}`}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => `n = ${label}`}
              formatter={(value) => [`${value.toFixed(4)} pp`, 'Difference']}
            />
            <ReferenceLine y={0} stroke="#b1bdb4" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="delta"
              name="Difference"
              stroke={DELTA_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="birthday__chart-axis-label">Number of people (n)</p>
      <p className="birthday__chart-caption">
        Real US birthdays are not uniform, but the effect is tiny: the gap peaks at about{' '}
        {(maxDelta * 100).toFixed(4)} percentage points at n = {maxN}. A simulation of at most
        20 000 experiments cannot resolve such a gap.
      </p>
    </figure>
  )
}

export default BirthdayDeltaChart
