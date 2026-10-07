import {
  ComposedChart,
  Bar,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette: green experiment, gold theory. */
const EMPIRICAL_COLOR = '#67d59a' /* --color-positive */
const THEORY_COLOR = '#d8b45a' /* --color-accent */
const ZERO_MARKER_COLOR = '#f07878' /* --color-negative */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/* Floor used for the log axis and for plotting "0 observed" markers. It is
 * below the rarest true probability (royal flush, ~1.54e-6) but strictly
 * positive, so no log(0) is ever taken. */
const LOG_FLOOR = 1e-7

/**
 * Grouped comparison of empirical and theoretical per-category probabilities on
 * a LOGARITHMIC Y axis.
 *
 * The probabilities span roughly 1.5e-6 (royal flush) to 0.5 (high card), so a
 * linear axis would hide every rare hand; the log axis keeps all ten visible.
 *
 * Zero-observed categories: `log(0)` is undefined, so a category with zero
 * observed hands is plotted as a distinct marker at the axis floor with the
 * label "0 observed" instead of a fabricated value. The marker uses the real
 * probability only for its theoretical bar, which is always positive.
 *
 * @param {object} props
 * @param {Array<{
 *   category: string,
 *   empiricalProbability: number,
 *   theoreticalProbability: number,
 *   observedCount: number,
 * }>} props.data - Per-category probabilities (full precision, not percentages).
 * @returns {import('react').ReactElement} The chart block.
 */
function PokerProbabilityChart({ data }) {
  const chartData = data.map((row) => {
    const hasObservation = row.observedCount > 0
    return {
      category: row.category,
      // Empirical value only when it is strictly positive; else logged as a
      // 0 marker via a separate series.
      Empirical: hasObservation ? row.empiricalProbability : null,
      Theoretical: row.theoreticalProbability,
      // Zero-observed marker sits at the axis floor.
      ZeroObserved: hasObservation ? null : LOG_FLOOR,
      observedCount: row.observedCount,
      empiricalProbability: row.empiricalProbability,
      theoreticalProbability: row.theoreticalProbability,
    }
  })

  // Y domain from the smallest positive theoretical probability up to the
  // largest probability, with a small margin, snapped to the floor.
  const positives = data.map((row) => row.theoreticalProbability).filter((value) => value > 0)
  const minPositive = positives.length > 0 ? Math.min(...positives) : LOG_FLOOR
  const maxProbability = data.reduce((max, row) => Math.max(max, row.theoreticalProbability), 0)
  const yMin = Math.max(LOG_FLOOR, minPositive / 5)
  const yMax = Math.min(1, maxProbability * 2)

  // Log-axis tick labels in exponential form; the floor tick reads as "0".
  const formatLogTick = (value) => (value <= 0 ? '0' : value.toExponential(0))

  // How many categories had a zero observed count (shown as axis markers).
  const zeroObservedCount = data.filter((row) => row.observedCount === 0).length

  return (
    <figure className="poker__chart-block">
      <figcaption className="poker__chart-axis-title">Probability (log scale)</figcaption>

      <div className="poker__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#34473b" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={70}
            />
            <YAxis
              scale="log"
              domain={[yMin, yMax]}
              allowDataOverflow
              tickFormatter={formatLogTick}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => {
                if (name === 'Zero observed') {
                  return ['0 observed', 'Empirical']
                }
                if (value == null) {
                  return ['—', name]
                }
                return [Number(value).toExponential(3), name]
              }}
            />
            <Bar
              dataKey="Theoretical"
              name="Theoretical"
              fill={THEORY_COLOR}
              isAnimationActive={false}
              maxBarSize={34}
            />
            <Bar
              dataKey="Empirical"
              name="Empirical"
              fill={EMPIRICAL_COLOR}
              isAnimationActive={false}
              maxBarSize={34}
            />
            <Line
              type="linear"
              dataKey="Theoretical"
              name="Theoretical (line)"
              stroke={THEORY_COLOR}
              strokeWidth={2}
              dot={false}
              legendType="none"
              isAnimationActive={false}
            />
            <Scatter
              dataKey="ZeroObserved"
              name="Zero observed"
              fill={ZERO_MARKER_COLOR}
              shape="cross"
              legendType="cross"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="poker__chart-axis-label">Hand category</p>

      <ul className="poker__legend">
        <li className="poker__legend-item">
          <span className="poker__legend-swatch" aria-hidden="true" style={{ background: EMPIRICAL_COLOR }} />
          Empirical Oᵢ/N
        </li>
        <li className="poker__legend-item">
          <span className="poker__legend-swatch" aria-hidden="true" style={{ background: THEORY_COLOR }} />
          Theoretical pᵢ
        </li>
        <li className="poker__legend-item">
          <span className="poker__legend-swatch poker__legend-swatch--marker" aria-hidden="true" />
          0 observed
        </li>
      </ul>

      <p className="poker__chart-caption">
        The axis is logarithmic because the probabilities range from about
        1.5×10⁻⁶ to 0.5. A linear axis would hide every rare hand.
      </p>
      {zeroObservedCount > 0 ? (
        <p className="poker__chart-caption">
          {zeroObservedCount} categor{zeroObservedCount === 1 ? 'y' : 'ies'} had 0 observed
          hands; those are shown as markers at the axis labelled "0 observed",
          never as a fabricated log value.
        </p>
      ) : null}
    </figure>
  )
}

export default PokerProbabilityChart

