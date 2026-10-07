/**
 * A panel that will hold an attraction's inputs and Run/Reset buttons.
 *
 * This is only a container: it renders a heading and whatever children are
 * passed in. It deliberately does not wrap the children in a <form>, because
 * future attractions may need different interaction patterns.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - Panel content.
 * @param {string} [props.title] - Panel heading (defaults to "Controls").
 * @returns {import('react').ReactElement} The panel.
 */
function ControlPanel({ children, title = 'Controls' }) {
  return (
    <section className="card shared-panel">
      <h2 className="shared-panel__heading">{title}</h2>
      {children}
    </section>
  )
}

export default ControlPanel
