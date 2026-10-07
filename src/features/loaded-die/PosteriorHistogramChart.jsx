import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

/* Series colors reuse the existing palette. */
const LOADED_COLOR = '#d8b45a' /* --color-accent */
const FAIR_COLOR = '#7fa8c9' /* neutral blue */
const EXACT_COLOR = '#67d59a' /* --color-positive */

const CHART_TOOLTIP_STYLE = {
  background: '#172a20', /* --color-surface-raised */
  border: '1px solid #34473b', /* --color-border */
  borderRadius: '8px',
  color: '#f3f0e7', /* --color-text */
}
const CHART_LABEL_STYLE = { fill: '#b1bdb4' } /* --color-text-muted */

/** Number of equal-width posterior bins shown in the histogram. */
const BINS = 10

/**
 * Map each experiment's posterior and true type into the fixed posterior bins.
 *
 * @param {number[]} posterior - Posteriors of all experiments.
 * @param {(boolean|null)[]} trueType - True types (true = loaded).
 * @returns {{ loaded: number[], fair: number[] }} Per-bin counts.
 */
function binExperiments(posterior, trueType) {
  const loaded = new Array(BINS).fill(0)
  const fair = new Array(BINS).fill(0)
  for (let i = 0; i < posterior.length; i += 1) {
    let bin = Math.floor(posterior[i] * BINS)
    if (bin >= BINS) bin = BINS - 1
    if (bin < 0) bin = 0
    if (trueType[i] === true) loaded[bin] += 1
    else fair[bin] += 1
  }
  return { loaded, fair }
}

/**
 * Expected frequencies over the same posterior bins, from the exact mixture.
 *
 * For every possible six-count `k <= m`, the mixture mass is split by type using
 * `theta*L = post(k) * mixture(k)` and `(1-theta)*F = (1-post(k)) * mixture(k)`,
 * then placed in the bin that contains `post(k)`. Mass is preserved: each series
 * sums (in expectation) to the prior weight of its type times M.
 *
 * @param {object} overlay - `exactOverlay` from the snapshot.
 * @param {number} M - Number of experiments.
 * @returns {{ loaded: number[], fair: number[] }} Expected counts per bin.
 */
function expectedCounts(overlay, M) {
  const loaded = new Array(BINS).fill(0)
  const fair = new Array(BINS).fill(0)
  for (let k = 0; k < overlay.posteriorByK.length; k += 1) {
    let bin = Math.floor(overlay.posteriorByK[k] * BINS)
    if (bin >= BINS) bin = BINS - 1
    if (bin < 0) bin = 0
    const mixture = overlay.mixtureProbability[k]
    const post = overlay.posteriorByK[k]
    loaded[bin] += post * mixture * M
    fair[bin] += (1 - post) * mixture * M
  }
  return { loaded, fair }
}

/**
 * Histogram of the M posteriors, split by true die type, with the exact
 * distribution of the posterior overlaid.
 *
 * Bars show the empirical number of experiments in each posterior bin, split
 * into truly-loaded and truly-fair dice. The green line is the exact expected
 * count per bin from `P(K = k) = theta Bin(m,b)(k) + (1-theta) Bin(m,1/6)(k)`,
 * mapped through `post(k)`. Values are counts placed into equal-width bins and
 * SUMMED (never averaged), so the empirical and exact series are directly
 * comparable.
 *
 * @param {object} props
 * @param {number[]} props.posterior - Posteriors of all experiments.
 * @param {(boolean|null)[]} props.trueType - True types (true = loaded).
 * @param {object} props.overlay - `exactOverlay` from the snapshot.
 * @param {number} props.M - Number of experiments.
 * @returns {import('react').ReactElement} The chart block.
 */
function PosteriorHistogramChart({ posterior, trueType, overlay, M }) {
  const observed = binExperiments(posterior, trueType)
  const expected = expectedCounts(overlay, M)

  const data = observed.loaded.map((loadedCount, index) => ({
    label: `${(index / BINS).toFixed(1)}–${((index + 1) / BINS).toFixed(1)}`,
    'Loaded (observed)': loadedCount,
    'Fair (observed)': observed.fair[index],
    'Exact (overlay)': expected.loaded[index] + expected.fair[index],
  }))

  const maxValue = data.reduce(
    (max, row) => Math.max(
      max,
      row['Loaded (observed)'] + row['Fair (observed)'],
      row['Exact (overlay)'],
    ),
    0,
  )
  const yMax = Math.max(1, Math.ceil(maxValue * 1.1))

  return (
    <figure className="loaded-die__chart-block">
      <figcaption className="loaded-die__chart-axis-title">
        Posterior across experiments (count)
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
              tick={{ fill: '#b1bdb4', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#34473b' }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={48}
            />
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              tick={{ fill: '#b1bdb4', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'rgba(216, 180, 90, 0.08)' }}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(label) => `Posterior in [${label}]`}
              formatter={(value, name) => [value.toFixed(2), name]}
            />
            <Legend wrapperStyle={{ color: '#b1bdb4', fontSize: 12 }} />
            <Bar
              dataKey="Loaded (observed)"
              stackId="observed"
              fill={LOADED_COLOR}
              isAnimationActive={false}
              maxBarSize={40}
            />
            <Bar
              dataKey="Fair (observed)"
              stackId="observed"
              fill={FAIR_COLOR}
              isAnimationActive={false}
              maxBarSize={40}
            />
            <Line
              type="linear"
              dataKey="Exact (overlay)"
              name="Exact (P(K=k) mixture)"
              stroke={EXACT_COLOR}
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="loaded-die__chart-axis-label">Posterior P(H_L | data)</p>
      <p className="loaded-die__chart-caption">
        Bars are experiment counts per posterior bin, split by the true die type
        (loaded vs fair). The green line is the exact expected count from
        P(K = k) = θ·Bin(m, b)(k) + (1−θ)·Bin(m, 1/6)(k), mapped through post(k).
        Counts are placed into equally wide bins and SUMMED (never averaged), so
        the empirical and exact series are on the same scale.
      </p>
    </figure>
  )
}

export default PosteriorHistogramChart

