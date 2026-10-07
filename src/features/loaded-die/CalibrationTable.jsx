/**
 * Calibration table for the Loaded Die simulation.
 *
 * Shows the 10 equal-width posterior bins, each with the number of experiments,
 * the observed share of truly-loaded dice in the bin, and the mean posterior of
 * the bin. If the posterior is honest, the two columns should be close. Bins
 * with fewer than the required number of experiments (flagged `tooFew`) are
 * greyed out because their shares are too noisy to read.
 *
 * @param {object} props
 * @param {Array<{ index: number, low: number, high: number, count: number,
 *   meanPosteriorInBin: number, observedLoadedShare: number, tooFew: boolean }>}
 *   props.bins - Calibration bins from the snapshot.
 * @returns {import('react').ReactElement} The table block.
 */
function CalibrationTable({ bins }) {
  const formatRate = (value) =>
    Number.isNaN(value) ? '—' : `${(value * 100).toFixed(1)}%`

  return (
    <div>
      <table className="loaded-die__calibration">
        <caption>Calibration: 10 equal-width posterior bins</caption>
        <thead>
          <tr>
            <th scope="col">Posterior bin</th>
            <th scope="col">Experiments</th>
            <th scope="col">Observed loaded</th>
            <th scope="col">Mean posterior</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((bin) => (
            <tr
              key={bin.index}
              className={bin.tooFew ? 'loaded-die__row--dim' : undefined}
            >
              <td>
                {bin.low.toFixed(1)}–{bin.high.toFixed(1)}
              </td>
              <td>{bin.count}</td>
              <td>{formatRate(bin.observedLoadedShare)}</td>
              <td>{formatRate(bin.meanPosteriorInBin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="loaded-die__calibration-note">
        Greyed rows have fewer than 20 experiments and are too noisy to read. For
        a well-calibrated posterior, the observed loaded share should be close to
        the mean posterior in each bin.
      </p>
    </div>
  )
}

export default CalibrationTable
