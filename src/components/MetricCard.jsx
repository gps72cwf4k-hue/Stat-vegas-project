/**
 * A compact card showing one labeled value (for example a simulated result).
 *
 * The caller formats the number; this component only displays it. Zero is a
 * valid value, so it is shown as-is. An em dash is used only when the value is
 * null or undefined (meaning "no value yet"). The component never guesses
 * percentages, precision, units or significance.
 *
 * @param {object} props
 * @param {string} props.label - Visible label for the value.
 * @param {import("react").ReactNode} props.value - The display value (already formatted).
 * @param {string} [props.description] - Optional secondary text.
 * @returns {import("react").ReactElement} The metric card.
 */
function MetricCard({ label, value, description }) {
  // Use ?? so that 0 is preserved; only null/undefined become the em dash.
  const displayValue = value ?? '—'

  return (
    <div className="shared-metric">
      <dl className="shared-metric__list">
        <dt className="shared-metric__label">{label}</dt>
        <dd className="shared-metric__value">{displayValue}</dd>
      </dl>
      {description ? (
        <p className="shared-metric__description">{description}</p>
      ) : null}
    </div>
  )
}

export default MetricCard
