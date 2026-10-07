/**
 * Continuous uniform density demo on the unit square.
 *
 * Plots up to 2000 seeded uniform points in `[0, 1]^2` and an adjustable
 * rectangle `[0, a] x [0, b]`. The empirical fraction of points inside the
 * rectangle is compared against the theoretical area `a * b`, with a binomial
 * standard error `sqrt(p(1-p)/n)` as a neutral reference for the sample size.
 *
 * The empirical fraction is recomputed live from the stored points whenever the
 * `a`/`b` sliders move, so changing the rectangle does not require a new run.
 *
 * @param {object} props
 * @param {number[]} props.u - Horizontal coordinates in `[0, 1)`.
 * @param {number[]} props.v - Vertical coordinates in `[0, 1)`.
 * @param {number} props.a - Rectangle width in `[0, 1]`.
 * @param {number} props.b - Rectangle height in `[0, 1]`.
 * @returns {import('react').ReactElement} The continuous demo block.
 */
function ContinuousDemo({ u, v, a, b }) {
  const size = 220
  const pad = 18
  const inner = size - 2 * pad

  const n = u.length
  let inside = 0
  for (let i = 0; i < n; i += 1) {
    if (u[i] <= a && v[i] <= b) inside += 1
  }
  const empirical = n > 0 ? inside / n : 0
  const area = a * b
  const difference = empirical - area
  const binomialSe = Math.sqrt((area * (1 - area)) / (n > 0 ? n : 1))

  const toX = (value) => pad + value * inner
  const toY = (value) => pad + (1 - value) * inner

  return (
    <figure className="two-dice__demo-block">
      <figcaption className="two-dice__chart-axis-title">
        Continuous uniform density: points in [0, 1]² vs rectangle [0, a]×[0, b]
      </figcaption>

      <svg
        className="two-dice__demo-svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Uniform points on the unit square with a highlighted rectangle"
      >
        {/* Unit square outline. */}
        <rect
          x={pad}
          y={pad}
          width={inner}
          height={inner}
          fill="#0d1813"
          stroke="#34473b"
        />
        {/* Highlighted rectangle [0, a] x [0, b]. */}
        <rect
          x={pad}
          y={toY(b)}
          width={a * inner}
          height={b * inner}
          fill="rgba(216, 180, 90, 0.12)"
          stroke="#d8b45a"
          strokeWidth={1.5}
        />
        {/* Points. */}
        {u.map((ui, index) => {
          const isInside = ui <= a && v[index] <= b
          return (
            <circle
              key={index}
              cx={toX(ui)}
              cy={toY(v[index])}
              r={1.5}
              fill={isInside ? '#67d59a' : '#f07878'}
              opacity={0.7}
            />
          )
        })}
      </svg>

      <dl className="two-dice__demo-metrics">
        <div className="two-dice__demo-metric">
          <dt>Points sampled</dt>
          <dd>{n}</dd>
        </div>
        <div className="two-dice__demo-metric">
          <dt>Empirical fraction inside</dt>
          <dd>{empirical.toFixed(4)}</dd>
        </div>
        <div className="two-dice__demo-metric">
          <dt>Theoretical area a × b</dt>
          <dd>{area.toFixed(4)}</dd>
        </div>
        <div className="two-dice__demo-metric">
          <dt>Difference</dt>
          <dd>
            {difference >= 0 ? '+' : ''}
            {difference.toFixed(4)}
          </dd>
        </div>
      </dl>

      <p className="two-dice__chart-caption">
        Binomial standard error of the empirical fraction is about{' '}
        {binomialSe.toFixed(4)} at this sample size (p = {area.toFixed(4)}). The
        green points fall inside the rectangle; red points fall outside. The
        density f(x, y) = 1 makes probability equal to area.
      </p>
    </figure>
  )
}

export default ContinuousDemo
