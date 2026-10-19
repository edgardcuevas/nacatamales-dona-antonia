// Parte el nombre del negocio en las dos líneas del logotipo del Header:
// "Nacatamales de Doña Antonia" -> { main: 'NACATAMALES', rest: 'DE DOÑA ANTONIA' }.
// Se corta antes del primer " de "; si no lo hay, después de la primera
// palabra ("Nacatamales Doña Antonia" -> NACATAMALES / DOÑA ANTONIA). Un
// nombre de una sola palabra va en una línea. Así el logotipo mantiene
// siempre su forma de dos líneas, angosta, y no empuja el menú.
export function splitBusinessName(name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ')
  const match = /^(.+?)\s+(de\s+.+)$/i.exec(clean)

  if (!match) {
    const [first, ...others] = clean.split(' ')
    return {
      main: first.toLocaleUpperCase('es'),
      rest: others.length > 0 ? others.join(' ').toLocaleUpperCase('es') : null,
    }
  }

  return {
    main: match[1].toLocaleUpperCase('es'),
    rest: match[2].toLocaleUpperCase('es'),
  }
}

// Primer párrafo de la historia, recortado en el límite de una palabra,
// para la portada. El texto completo vive en /nosotros.
export function storyExcerpt(text, maxLength = 220) {
  const firstParagraph =
    String(text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''

  if (firstParagraph.length <= maxLength) {
    return firstParagraph
  }

  const cut = firstParagraph.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s.,;:¡!¿?-]+$/, '')}…`
}