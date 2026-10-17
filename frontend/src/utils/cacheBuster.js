// A custom YouTube thumbnail replaces the bytes served from the same
// i.ytimg.com URL, so a browser that already loaded the old frame would
// keep showing it. Appending the record's change timestamp makes the URL
// unique whenever the thumbnail actually changed.
//
// The parameter NAME is part of the contract with the provider, not a
// detail: i.ytimg.com reserves `v` and answers 404 when its value is a
// large number, which is exactly what an epoch in milliseconds is. That
// broke every public thumbnail while the admin panel kept working,
// because the admin renders the stored URL verbatim. `cb` is ignored by
// the CDN and still returns the exact same bytes, so the invalidation
// survives without asking for an image that does not exist.
const VERSION_PARAMETER = 'cb'

export function withCacheBuster(url, versionSource) {
  if (typeof url !== 'string' || url.length === 0) {
    return url
  }

  if (typeof versionSource !== 'string' || versionSource.length === 0) {
    return url
  }

  const version = Date.parse(versionSource)
  if (Number.isNaN(version)) {
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${VERSION_PARAMETER}=${version}`
}
