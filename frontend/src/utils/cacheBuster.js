// A custom YouTube thumbnail replaces the bytes served from the same
// i.ytimg.com URL, so a browser that already loaded the old frame would
// keep showing it. Appending the record's change timestamp makes the URL
// unique whenever the thumbnail actually changed.

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
  return `${url}${separator}v=${version}`
}
