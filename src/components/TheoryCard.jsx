/**
 * A card for the exact mathematics of an attraction.
 *
 * This is only a container: it renders a heading, an optional plain-text
 * distribution badge and the supplied children (the theory content, added
 * later; KaTeX is not used yet). When distributionLabel is absent, the badge
 * is not rendered at all.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - Theory content.
 * @param {string} [props.title] - Panel heading (defaults to "Theory").
 * @param {string} [props.distributionLabel] - Optional distribution name.
 * @returns {import('react').ReactElement} The card.
 */
function TheoryCard({ children, title = 'Theory', distributionLabel }) {
  return (
    <section className="card shared-panel">
      <h2 className="shared-panel__heading">{title}</h2>
      {distributionLabel ? (
        <span className="shared-panel__badge">{distributionLabel}</span>
      ) : null}
      {children}
    </section>
  )
}

export default TheoryCard
