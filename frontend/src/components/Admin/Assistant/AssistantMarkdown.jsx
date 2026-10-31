import { Fragment } from 'react'

// Renderizador seguro de la respuesta del asistente. Trabaja linea por
// linea y devuelve elementos React: nunca usa dangerouslySetInnerHTML y
// no acepta HTML del modelo. Lo desconocido cae a texto plano, asi que un
// mensaje con markup raro se muestra tal cual sin romper la UI.

const UNORDERED = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^#{1,6}\s+(.*)$/

function renderInline(text, keyPrefix) {
  const nodes = []
  // Primero el codigo en linea (backticks), que tiene prioridad sobre
  // cualquier otro formato y nunca se interpreta.
  const codeParts = text.split(/(`[^`]+`)/g)
  codeParts.forEach((part, index) => {
    if (
      part.startsWith('`') &&
      part.endsWith('`') &&
      part.length > 2
    ) {
      nodes.push(
        <code key={`${keyPrefix}-c-${index}`}>{part.slice(1, -1)}</code>,
      )
      return
    }

    const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
    boldParts.forEach((sub, subIndex) => {
      if (
        sub.startsWith('**') &&
        sub.endsWith('**') &&
        sub.length > 4
      ) {
        nodes.push(
          <strong key={`${keyPrefix}-b-${index}-${subIndex}`}>
            {sub.slice(2, -2)}
          </strong>,
        )
      } else if (sub !== '') {
        nodes.push(sub)
      }
    })
  })
  return nodes
}

export default function AssistantMarkdown({ content }) {
  if (typeof content !== 'string' || content.trim() === '') {
    return null
  }

  const lines = content.split('\n')
  const blocks = []
  let paragraph = []
  let list = null // { type: 'ul' | 'ol', items: [] }

  function flushParagraph() {
    if (paragraph.length === 0) {
      return
    }
    blocks.push({
      type: 'p',
      text: paragraph.join(' ').trim(),
    })
    paragraph = []
  }

  function flushList() {
    if (!list || list.items.length === 0) {
      return
    }
    blocks.push({ type: list.type, items: list.items })
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const unorderedMatch = line.match(UNORDERED)
    const orderedMatch = line.match(ORDERED)
    const headingMatch = line.match(HEADING)

    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'h', text: headingMatch[1].trim() })
      continue
    }

    if (unorderedMatch) {
      flushParagraph()
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(unorderedMatch[1])
      continue
    }

    if (orderedMatch) {
      flushParagraph()
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(orderedMatch[1])
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  flushList()

  return (
    <Fragment>
      {blocks.map((block, index) => {
        if (block.type === 'p') {
          return (
            <p key={`p-${index}`}>{renderInline(block.text, `p-${index}`)}</p>
          )
        }
        if (block.type === 'h') {
          return (
            <p key={`h-${index}`} className="assistant-markdown__heading">
              <strong>{renderInline(block.text, `h-${index}`)}</strong>
            </p>
          )
        }
        const Tag = block.type === 'ol' ? 'ol' : 'ul'
        return (
          <Tag key={`l-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`li-${index}-${itemIndex}`}>
                {renderInline(item, `li-${index}-${itemIndex}`)}
              </li>
            ))}
          </Tag>
        )
      })}
    </Fragment>
  )
}