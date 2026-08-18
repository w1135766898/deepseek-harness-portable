import katex from 'katex'
import 'katex/dist/katex.min.css'

function displayExpression(text: string): string | null {
  const value = text.trim()
  if (value.startsWith('$$') && value.endsWith('$$')) return value.slice(2, -2).trim()
  if (value.startsWith('\\[') && value.endsWith('\\]')) return value.slice(2, -2).trim()
  return null
}

export function MarkdownText({ text }: { text: string }) {
  const expression = displayExpression(text)
  if (expression !== null) {
    const html = katex.renderToString(expression, {
      displayMode: true,
      output: 'htmlAndMathml',
      strict: 'ignore',
      throwOnError: false,
      trust: false,
    })
    return <div data-markdown-text="" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <div data-markdown-text="">{text}</div>
}
