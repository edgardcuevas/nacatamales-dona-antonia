import useReveal from '../../hooks/useReveal'

/**
 * Envuelve un bloque y lo revela cuando entra en pantalla.
 *
 * El elemento sale ya renderizado: si el JS no llega a ejecutarse, el
 * contenido se queda sin la clase .reveal y por tanto visible. Una web
 * cuya informacion depende de que una animacion termine de correr es una
 * web que se queda en blanco cuando algo falla.
 *
 * `delay` escalona hermanos sin necesidad de CSS propio por grupo: 60ms entre
 * tarjetas es lo justo para que se lean como una tanda y no como cinco
 * cosas apareciendo por separado.
 */
export default function Reveal({
  as: Tag = 'div',
  className = '',
  delay = 0,
  children,
  ...rest
}) {
  const [ref, isVisible] = useReveal()

  const classes = ['reveal', isVisible ? 'reveal--visible' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      ref={ref}
      className={classes}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}