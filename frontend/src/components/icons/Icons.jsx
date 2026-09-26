export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="icon-tamal" viewBox="0 0 100 100">
        <path d="M50 8 C68 8 82 14 88 30 C93 44 90 60 78 74 C68 86 56 92 50 92 C44 92 32 86 22 74 C10 60 7 44 12 30 C18 14 32 8 50 8 Z" fill="#e8b23a" />
        <path d="M50 8 C68 8 82 14 88 30 C93 44 90 60 78 74 C68 86 56 92 50 92 L50 8 Z" fill="#c97c28" />
        <g stroke="#8a4d1c" strokeWidth="2.4" opacity=".55">
          <path d="M20 30 C40 22 60 22 82 32" />
          <path d="M14 44 C38 34 64 34 90 46" />
          <path d="M14 58 C38 50 64 50 88 60" />
          <path d="M22 71 C42 64 60 64 78 72" />
        </g>
        <g stroke="#4A3025" strokeWidth="3.2" strokeLinecap="round">
          <path d="M32 14 L28 4" />
          <path d="M50 8 L50 -2" />
          <path d="M68 14 L72 4" />
        </g>
      </symbol>

      <symbol id="icon-badge" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="47" fill="#FFF4DC" stroke="#B5262D" strokeWidth="4" />
        <use href="#icon-tamal" x="18" y="20" width="48" height="48" />
        <path d="M22 78 Q50 68 78 78" fill="none" stroke="#4A3025" strokeWidth="3" />
      </symbol>

      <symbol id="icon-leaf" viewBox="0 0 24 24">
        <path d="M3 20c7-1 13-7 14-14 1 7-3 13-9 15-2 .6-4 .3-5-1z" fill="currentColor" />
      </symbol>

      <symbol id="icon-corn" viewBox="0 0 24 24">
        <rect x="8" y="3" width="8" height="18" rx="4" fill="currentColor" />
      </symbol>

      <symbol id="icon-pot" viewBox="0 0 24 24">
        <path d="M4 9h16l-1.4 9.5a2 2 0 0 1-2 1.7H7.4a2 2 0 0 1-2-1.7L4 9z" fill="currentColor" />
        <rect x="3" y="6" width="18" height="3" rx="1.5" fill="currentColor" />
        <path d="M9 6c0-2 1-4 3-4s3 2 3 4" stroke="currentColor" strokeWidth="1.6" fill="none" />
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