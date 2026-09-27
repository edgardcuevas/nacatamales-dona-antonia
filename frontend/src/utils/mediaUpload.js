import { api } from '../api/client'

export async function uploadImage(target, file, altText = null) {
  const { upload } = await api.post('/admin/media/upload-auth', { target })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('fileName', file.name)
  formData.append('publicKey', upload.publicKey)
  formData.append('folder', upload.folder)
  formData.append('token', upload.token)
  formData.append('expire', upload.expire)
  formData.append('signature', upload.signature)
  formData.append('useUniqueFileName', upload.useUniqueFileName)

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  const uploadResult = await uploadResponse.json().catch(() => null)

  if (!uploadResponse.ok) {
    const error = new Error(uploadResult?.message || 'No se pudo subir la imagen')
    error.code = 'IMAGE_UPLOAD_FAILED'
    throw error
  }

  const { media } = await api.post('/admin/media/confirm', {
    fileId: uploadResult.fileId,
    altText,
  })

  return {
    id: media.id,
    url: media.secureUrl,
    altText: media.altText,
    width: media.width,
    height: media.height,
  }
}