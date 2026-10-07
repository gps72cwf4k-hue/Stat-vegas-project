import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Render a KaTeX formula.
 *
 * KaTeX is used directly (no React wrapper package). The expression is a
 * developer-authored constant, never user input, so arbitrary HTML injection is
 * not a concern; additionally the component inserts ONLY the HTML that KaTeX
 * returns and never the raw expression. KaTeX is configured with `trust: false`
 * (no `\htmlClass`/`\url` trust commands) and `throwOnError: false` (invalid
 * input renders as red source text instead of throwing).
 *
 * @param {object} props
 * @param {string} props.expression - A LaTeX expression.
 * @param {boolean} [props.displayMode] - Block display (true) or inline (false).
 * @returns {import('react').ReactElement} A wrapper containing the rendered math.
 */
function Formula({ expression, displayMode = true }) {
  // Memoize the rendered HTML so KaTeX only reruns when the expression changes.
  const html = useMemo(
    () =>
      katex.renderToString(expression, {
        trust: false,
        throwOnError: false,
        output: 'htmlAndMathml',
        displayMode,
      }),
    [expression, displayMode],
  )

  // The injected string is KaTeX's own sanitized output, not the raw input.
  return (
    <span
      className={displayMode ? 'formula formula--display' : 'formula'}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default Formula
