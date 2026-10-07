/**
 * A container for an attraction's chart and a short text summary.
 *
 * It is only a frame: it renders a heading, the supplied chart/content, and an
 * optional plain-text summary beneath it. The actual chart (Recharts or SVG)
 * is added later and decides its own size, so no fixed dimensions are set here.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - Chart or content.
 * @param {string} [props.title] - Panel heading (defaults to "Simulation Results").
 * @param {string} [props.summary] - Optional text summary shown below the chart.
 * @returns {import('react').ReactElement} The panel.
 */
function ChartPanel({ children, title = 'Simulation Results', summary }) {
  return (
    <section className="card shared-panel">
      <h2 className="shared-panel__heading">{title}</h2>
      {children}
      {summary ? <p className="shared-panel__summary">{summary}</p> : null}
    </section>
  )
}

export default ChartPanel
