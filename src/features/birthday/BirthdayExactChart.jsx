import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  ErrorBar,
  Scatter,
} from 'recharts'

/* Series colors reuse the existing palette. */
const SELECTED_COLOR = '#67d59a' /* --color-positive */
const UNIFORM_COLOR = '#d8b45a' /* --color-accent */
const EMPIRICAL_COLOR = '#f07878' /* --color-negative */
const LOWER_BOUND_COLOR = '#8fb7c9'

const CHART_TOOLTIP_STYLE = {
  background: '#172a20',
  border: '1px solid #34473b',
  borderRadius: '8px',
  color: '#f3f0e7',
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' }

/**
 * The main Birthday chart: exact P(shared) versus n for n = 2..100 for the
 * selected source, with a horizontal 0.5 reference line, the smallest n above
 * 0.5 marked, a marker at the run's n, and (in real-data mode) the uniform-365
 * curve. When a run exists, the empirical point with its 95% Wilson interval is
 * also plotted.
 *
 * @param {object} props
 * @param {object} props.run - The snapshot from `runBirthdaySimulation`.
 * @param {boolean} props.isRealMode - Whether the run uses a real-data source.
 * @returns {import('react').ReactElement} The chart block.
 */
function BirthdayExactChart({ run, isRealMode }) {
  const { curves, inputs, empirical, exact, wilsonCI95 } = run

  const chartData = curves.nValues.map((n, index) => ({
    n,
    exact: curves.exact[index] * 100,
    uniform365: curves.uniform365[index] * 100,
  }))

  // Smallest n whose exact P(shared) is >= 0.5 for the selected source.
  let firstAboveHalf = null
  for (let index = 0; index < curves.exact.length; index += 1) {
    if (curves.exact[index] >= 0.5) {
      firstAboveHalf = curves.nValues[index]
      break
    }
  }

  // Empirical point + Wilson interval as a one-element scatter series.
  const empiricalPoint = [
    {
      n: inputs.n,
      empirical: empirical.pHat * 100,
      errorY: [
        (empirical.pHat - wilsonCI95.lo) * 100,
        (wilsonCI95.hi - empirical.pHat) * 100,
      ],
    },
  ]

  const showEmpirical = inputs.n >= 2 && inputs.n <= 100
  const markerN = inputs.n >= 2 && inputs.n <= 100 ? inputs.n : 2

  return (
    <figure className="birthday__chart-block">
      <figcaption className="birthday__chart-axis-title">
        Exact P(at least one shared) versus group size n
      </figcaption>

      <div className="birthday__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" />
            <XAxis
              dataKey="n"
              type="number"
              domain={[2, 100]}
              ticks={[2, 10, 22, 23, 30, 50, 70, 90, 100]}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
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
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => `n = ${label}`}
              formatter={(value, name) => [`${value.toFixed(3)}%`, name]}
            />
            <ReferenceLine y={50} stroke="#b1bdb4" strokeDasharray="4 4" />
            {firstAboveHalf !== null ? (
              <ReferenceLine
                x={firstAboveHalf}
                stroke="#d8b45a"
                strokeDasharray="2 3"
                label={{ value: `n=${firstAboveHalf}`, fill: '#d8b45a', fontSize: 11, position: 'top' }}
              />
            ) : null}
            {isRealMode ? (
              <Line
                type="monotone"
                dataKey="uniform365"
                name="Uniform 365"
                stroke={UNIFORM_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="exact"
              name="Exact (selected source)"
              stroke={SELECTED_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot x={markerN} y={exact.pExact * 100} r={4} fill="#f3f0e7" stroke="#f3f0e7" isFront />
            {showEmpirical ? (
              <Scatter data={empiricalPoint} dataKey="empirical" name="Empirical p-hat" fill={EMPIRICAL_COLOR} isAnimationActive={false}>
                <ErrorBar dataKey="errorY" width={6} strokeWidth={2} stroke={EMPIRICAL_COLOR} direction="y" />
              </Scatter>
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="birthday__chart-axis-label">Number of people (n)</p>
      <ul className="birthday__legend">
        <li className="birthday__legend-item">
          <span className="birthday__legend-swatch" style={{ background: SELECTED_COLOR }} aria-hidden="true" />
          Exact (selected source)
        </li>
        {isRealMode ? (
          <li className="birthday__legend-item">
            <span
              className="birthday__legend-swatch birthday__legend-swatch--dashed"
              style={{ borderColor: UNIFORM_COLOR }}
              aria-hidden="true"
            />
            Uniform 365
          </li>
        ) : null}
        {showEmpirical ? (
          <li className="birthday__legend-item">
            <span
              className="birthday__legend-swatch birthday__legend-swatch--cross"
              style={{ color: EMPIRICAL_COLOR }}
              aria-hidden="true"
            />
            Empirical p-hat with 95% CI
          </li>
        ) : null}
        <li className="birthday__legend-item">
          <span
            className="birthday__legend-swatch birthday__legend-swatch--dashed"
            style={{ borderColor: LOWER_BOUND_COLOR }}
            aria-hidden="true"
          />
          Reference: 50% and first n above it
        </li>
      </ul>
      <p className="birthday__chart-caption">
        The dashed horizontal line is 50%. The first group size above it is marked. The exact
        curve comes from the counting formulas, not from the simulation.
      </p>
    </figure>
  )
}

export default BirthdayExactChart

