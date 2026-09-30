// The YouTube Data API only accepts JPEG and PNG for a custom
// thumbnail and rejects WebP, which the ImageKit pipeline does accept.
// So the browser normalises every source format to JPEG before upload.
const TARGET_WIDTH = 1280
const TARGET_HEIGHT = 720
const JPEG_QUALITY = 0.85
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const ACCEPTED_SOURCE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export class ImageResizeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImageResizeError'
  }
}

function assertSupportedSource(file) {
  if (!ACCEPTED_SOURCE_TYPES.includes(file.type)) {
    throw new ImageResizeError('unsupported-type')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageResizeError('source-too-large')
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () =>
      reject(new ImageResizeError('unreadable'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    // Covers HEIC and any other format the browser cannot decode: the
    // upload can never succeed in that case, so fail before spending
    // the request.
    image.onerror = () =>
      reject(new ImageResizeError('undecodable'))
    image.src = dataUrl
  })
}

// Centre-crops to the target ratio instead of stretching, so a portrait
// phone photo still fills the 16:9 frame without distortion.
function getCropRect(sourceWidth, sourceHeight) {
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = TARGET_WIDTH / TARGET_HEIGHT

  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio
    return {
      x: (sourceWidth - width) / 2,
      y: 0,
      width,
      height: sourceHeight,
    }
  }

  const height = sourceWidth / targetRatio
  return {
    x: 0,
    y: (sourceHeight - height) / 2,
    width: sourceWidth,
    height,
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new ImageResizeError('encode-failed'))
      },
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

function getOutputName(sourceName) {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, '')
  return `${withoutExtension || 'miniatura'}.jpg`
}

export async function resizeImageForThumbnail(file) {
  assertSupportedSource(file)

  let image
  try {
    image = await loadImageElement(await readFileAsDataUrl(file))
  } catch (error) {
    if (error instanceof ImageResizeError) {
      throw error
    }
    throw new ImageResizeError('undecodable')
  }

  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = TARGET_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    throw new ImageResizeError('canvas-unavailable')
  }

  context.fillStyle = '#000000'
  context.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT)

  const crop = getCropRect(image.naturalWidth, image.naturalHeight)
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    TARGET_WIDTH,
    TARGET_HEIGHT
  )

  const blob = await canvasToBlob(canvas)
  return new File([blob], getOutputName(file.name), {
    type: 'image/jpeg',
  })
}

export const THUMBNAIL_LIMITS = Object.freeze({
  maxUploadBytes: 10 * 1024 * 1024,
  targetWidth: TARGET_WIDTH,
  targetHeight: TARGET_HEIGHT,
})
