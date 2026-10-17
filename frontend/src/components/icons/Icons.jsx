// Iconos del sitio. Todos los simbolos dibujan DENTRO de su viewBox:
// el `icon-tamal` anterior trazaba el vapor en y=-2, fuera del lienzo,
// y el navegador lo recortaba.

export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      {/* Nacatamal envuelto en hoja de plátano.
          Dos mitades de tono distinto: la hoja girada deja ver el
          reverso. Las nervaduras dicen "hoja" sinadir detalle de mas. */}
      <symbol id="icon-tamal" viewBox="0 0 48 48">
        <path
          d="M24 12.2c2.9 0 4.8 2 6 4.4l6 13.2c1.7 3.7-.7 7.6-4.8 7.6H16.8c-4.1 0-6.5-3.9-4.8-7.6l6-13.2c1.2-2.4 3.1-4.4 6-4.4z"
          fill="#C4841C"
        />
        <path d="M24 12.2c2.9 0 4.8 2 6 4.4l6 13.2c1.7 3.7-.7 7.6-4.8 7.6H24z" fill="#9C6111" />
        <g stroke="#FFF4DC" fill="none" stroke-linecap="round">
          <path d="M24 13v23.4" strokeWidth="1.6" opacity=".55" />
          <path d="M14.2 28.2l8 5.2" strokeWidth="1.1" opacity=".42" />
          <path d="M33.8 28.2l-8 5.2" strokeWidth="1.1" opacity=".42" />
        </g>
      </symbol>

      {/* Sello de marca. Sin la curva inferior que el anterior llevaba:
          a 38px se leia como una cara sonriente. */}
      <symbol id="icon-badge" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="24" fill="#FFF4DC" />
        <circle cx="24" cy="24" r="21" fill="none" stroke="#9E2B25" strokeWidth="3.5" />
        <path
          d="M24 12.2c2.9 0 4.8 2 6 4.4l6 13.2c1.7 3.7-.7 7.6-4.8 7.6H16.8c-4.1 0-6.5-3.9-4.8-7.6l6-13.2c1.2-2.4 3.1-4.4 6-4.4z"
          fill="#C4841C"
        />
        <path d="M24 12.2c2.9 0 4.8 2 6 4.4l6 13.2c1.7 3.7-.7 7.6-4.8 7.6H24z" fill="#9C6111" />
        <g stroke="#FFF4DC" fill="none" stroke-linecap="round">
          <path d="M24 13v23.4" strokeWidth="1.6" opacity=".55" />
          <path d="M14.2 28.2l8 5.2" strokeWidth="1.1" opacity=".42" />
          <path d="M33.8 28.2l-8 5.2" strokeWidth="1.1" opacity=".42" />
        </g>
      </symbol>

      {/* Hoja de plátano: ingrediente fresco.
          Antes `icon-leaf` hacia doble trabajo (horario e ingrediente).
          El horario paso a `icon-reloj`; ver Home.jsx y Nosotros.jsx. */}
      <symbol id="icon-hoja" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.6 19.4C2.8 14 5 7.4 11 4.6c3.4-1.6 6.6-1.6 8.4-1.2.4 1.8.4 5-1.2 8.4-2.8 6-9.4 8.2-13.6 7.6z" />
          <path d="M5.2 18.8C9 15.4 13 12 19.2 5" />
          <path d="M9.6 14.4l-.6-3.4M12.8 11.4l-.4-3.2M15.8 8.6l-.2-2.8" strokeWidth="1.4" />
        </g>
      </symbol>

      {/* Horario. Sustituye a la hoja en los ScheduleBadge. */}
      <symbol id="icon-reloj" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 7.2V12l3.2 2" />
        </g>
      </symbol>

      {/* Mazorca. El anterior era un rectangulo redondeado que a 15px
          se leia como una capsula. */}
      <symbol id="icon-corn" viewBox="0 0 24 24">
        <path d="M12 2.8c2.9 0 4.8 3.4 4.8 8.2 0 5.8-2.2 10.2-4.8 10.2s-4.8-4.4-4.8-10.2c0-4.8 1.9-8.2 4.8-8.2z" fill="currentColor" />
        <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M12 2.8C9.4 2.8 7.8 4.1 6.8 6.2M12 2.8c2.6 0 4.2 1.3 5.2 3.4" />
        </g>
      </symbol>

      <symbol id="icon-pot" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 9.5h15l-1.3 8.6a2 2 0 0 1-2 1.7H7.8a2 2 0 0 1-2-1.7L4.5 9.5z" />
          <path d="M3.4 6.6h17.2" />
          <path d="M9.5 6.6c0-1.8 1-3.4 2.5-3.4s2.5 1.6 2.5 3.4" />
        </g>
      </symbol>

      <symbol id="icon-chat" viewBox="0 0 24 24">
        <path d="M12 3C6.9 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.7L5 21l4.6-1.6c.8.2 1.6.3 2.4.3 5.1 0 9-3.6 9-8S17.1 3 12 3z" fill="currentColor" />
      </symbol>

      <symbol id="icon-grill" viewBox="0 0 24 24">
        <path d="M3 12h18M3 12c0 5 4 9 9 9s9-4 9-9" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M6 12c1-3 2-5 1-8M12 12c1-3 1-6 0-9M18 12c-1-3-2-5-1-8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </symbol>

      <symbol id="icon-play" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="currentColor" opacity=".85" />
        <path d="M10 8l6 4-6 4V8z" fill="#fff" />
      </symbol>

      <symbol id="icon-pin" viewBox="0 0 24 24">
        <path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 6.6 11.2 7.3 11.8.4.3 1 .3 1.4 0C13.4 21.2 20 15.6 20 10c0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" fill="currentColor" />
      </symbol>

      <symbol id="icon-check" viewBox="0 0 24 24">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>
    </svg>
  )
}

export function Icon({ name, className }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#icon-${name}`} />
    </svg>
  )
}