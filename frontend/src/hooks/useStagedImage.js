import { useEffect, useRef, useState } from 'react'

export function useStagedImage() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [existingId, setExistingId] = useState(null)
  const objectUrlRef = useRef(null)

  function revokeLocalPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  function select(selectedFile) {
    revokeLocalPreview()
    const objectUrl = URL.createObjectURL(selectedFile)
    objectUrlRef.current = objectUrl
    setFile(selectedFile)
    setPreviewUrl(objectUrl)
  }

  function remove() {
    revokeLocalPreview()
    setFile(null)
    setPreviewUrl(null)
    setExistingId(null)
  }

  function load(image) {
    revokeLocalPreview()
    setFile(null)
    setPreviewUrl(image?.url || null)
    setExistingId(image?.id || null)
  }

  // Reuses an image that is already stored in the media library, so
  // no new file is uploaded and no extra storage is consumed.
  function pickExisting(media) {
    if (!media?.id) {
      return
    }
    load({
      id: media.id,
      url: media.secureUrl || media.url || null,
    })
  }

  function reset() {
    load(null)
  }

  return {
    file,
    previewUrl,
    existingId,
    hasImage: Boolean(file || existingId),
    select,
    remove,
    load,
    pickExisting,
    reset,
  }
}