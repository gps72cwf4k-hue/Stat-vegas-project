/**
 * SVG heat-map of an empirical joint frequency table.
 *
 * Cells are coloured on a scale centred at the theoretical probability
 * (1/36 or 2/36 for `(S, M)`). Below-centre cells fade toward the surface
 * colour; above-centre cells grow toward the gold accent, so deviations from
 * theory are visible in both directions. Cells outside the support (impossible
 * `(S, M)` cells) are greyed out and labelled "impossible". Each cell also shows
 * its observed count.
 *
 * @param {object} props
 * @param {number[]} props.rowLabels - Value behind each row (X or S).
 * @param {number[]} props.colLabels - Value behind each column (Y or M).
 * @param {number[][]} props.counts - Observed counts.
 * @param {number[][]} props.expectedProbabilities - Theoretical probability per cell.
 * @param {boolean[][]} props.supportMask - `true` where the cell is possible.
 * @param {number} props.n - Number of rolls.
 * @param {string} props.rowName - Row variable name (X or S).
 * @param {string} props.colName - Column variable name (Y or M).
 * @returns {import('react').ReactElement} The heat-map block.
 */
function JointHeatmap({
  rowLabels,
  colLabels,
  counts,
  expectedProbabilities,
  supportMask,
  n,
  rowName,
  colName,
}) {
  const cellSize = 46
  const gap = 2
  const labelSpace = 30
  const width = labelSpace + colLabels.length * (cellSize + gap) + gap
  const height = labelSpace + rowLabels.length * (cellSize + gap) + gap

  // Colour scale centred at the theoretical probability. Full colour strength is
  // reached at roughly 2.2x the theoretical probability.
  const maxReference = 2.2
  const colourForCell = (empirical, theoretical) => {
    if (theoretical <= 0) return '#2a332e' // impossible: grey
    const ratio = empirical / theoretical
    if (ratio >= 1) {
      const t = Math.min(1, (ratio - 1) / (maxReference - 1))
      return `rgba(216, 180, 90, ${0.15 + 0.75 * t})`
    }
    return `rgba(103, 213, 154, ${0.08 + 0.4 * ratio})`
  }

  // Dynamic noise note derived from the run's N (option A). The expected count
  // and its standard deviation use a per-cell probability p: for a uniform joint
  // (X, Y) every cell has p = 1/36; for (S, M) the note describes the sparsest
  // cells, whose probability is also 1/36.
  const supportedProbs = []
  for (let i = 0; i < expectedProbabilities.length; i += 1) {
    for (let j = 0; j < expectedProbabilities[i].length; j += 1) {
      if (supportMask[i][j]) supportedProbs.push(expectedProbabilities[i][j])
    }
  }
  const uniformJoint = supportedProbs.every((p) => p === supportedProbs[0])
  const referenceP = uniformJoint
    ? supportedProbs[0]
    : Math.min(...supportedProbs)
  const expectedPerCell = n * referenceP
  const cellSd = Math.sqrt(n * referenceP * (1 - referenceP))
  const relativeSd = expectedPerCell > 0 ? cellSd / expectedPerCell : 0
  const cellScope = uniformJoint ? 'each cell' : 'each sparse cell'

  return (
    <figure className="two-dice__heatmap-block">
      <figcaption className="two-dice__chart-axis-title two-dice__heatmap-caption">
        Empirical joint frequency ({rowName} rows × {colName} columns), cells show
        counts
      </figcaption>

      <div className="two-dice__heatmap-scroll">
        <svg
          className="two-dice__heatmap"
          width={width}
          height={height}
          role="img"
          aria-label={`Joint frequency heat-map of ${rowName} and ${colName}`}
        >
          {colLabels.map((label, j) => (
            <text
              key={`col-${label}`}
              x={labelSpace + j * (cellSize + gap) + cellSize / 2}
              y={labelSpace / 2 + 6}
              textAnchor="middle"
              className="two-dice__heatmap-axis"
            >
              {colName}={label}
            </text>
          ))}
          {rowLabels.map((label, i) => (
            <text
              key={`row-${label}`}
              x={labelSpace - 6}
              y={labelSpace + i * (cellSize + gap) + cellSize / 2 + 4}
              textAnchor="end"
              className="two-dice__heatmap-axis"
            >
              {rowName}={label}
            </text>
          ))}

          {rowLabels.map((rowLabel, i) =>
            colLabels.map((colLabel, j) => {
              const x = labelSpace + j * (cellSize + gap)
              const y = labelSpace + i * (cellSize + gap)
              const possible = supportMask[i][j]
              const empirical = counts[i][j] / n
              const theoretical = expectedProbabilities[i][j]
              return (
                <g key={`cell-${rowLabel}-${colLabel}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={4}
                    fill={possible ? colourForCell(empirical, theoretical) : 'transparent'}
                    stroke={possible ? '#34473b' : '#2a332e'}
                    strokeDasharray={possible ? undefined : '4 3'}
                  />
                  {possible ? (
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2 + 4}
                      textAnchor="middle"
                      className="two-dice__heatmap-count"
                    >
                      {counts[i][j]}
                    </text>
                  ) : (
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2 + 3}
                      textAnchor="middle"
                      className="two-dice__heatmap-impossible"
                    >
                      impossible
                    </text>
                  )}
                </g>
              )
            }),
          )}
        </svg>
      </div>

      <ul className="two-dice__legend">
        <li className="two-dice__legend-item">
          <span
            className="two-dice__legend-swatch"
            aria-hidden="true"
            style={{ background: 'rgba(103, 213, 154, 0.45)' }}
          />
          Below theoretical
        </li>
        <li className="two-dice__legend-item">
          <span
            className="two-dice__legend-swatch"
            aria-hidden="true"
            style={{ background: 'rgba(216, 180, 90, 0.85)' }}
          />
          Above theoretical
        </li>
        <li className="two-dice__legend-item">
          <span
            className="two-dice__legend-swatch"
            aria-hidden="true"
            style={{ background: '#2a332e' }}
          />
          Impossible cell
        </li>
      </ul>
      <p className="two-dice__chart-caption">
        Colour is centred at the theoretical probability (1/36, or 2/36 for the
        off-diagonal (S, M) cells). Cells are noisy: at N ={' '}
        {n.toLocaleString()}, {cellScope} averages about{' '}
        {expectedPerCell.toFixed(1)} observations with a standard deviation near{' '}
        {cellSd.toFixed(1)} (roughly {(relativeSd * 100).toFixed(1)}% noise). The
        relative noise scales as 1/√N.
      </p>
    </figure>
  )
}

export default JointHeatmap
