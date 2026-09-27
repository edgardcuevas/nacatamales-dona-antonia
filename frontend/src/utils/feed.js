export function mergeFeed(videos = [], photos = []) {
  const videoItems = videos.map((video) => ({
    type: 'video',
    id: `video-${video.id}`,
    createdAt: video.createdAt,
    title: video.title,
    caption: video.description,
    thumbnailUrl: video.thumbnailUrl,
    externalId: video.externalId,
  }))

  const photoItems = photos.map((photo) => ({
    type: 'photo',
    id: `photo-${photo.id}`,
    createdAt: photo.createdAt,
    caption: photo.caption,
    imageUrl: photo.image?.url || null,
    altText: photo.image?.altText || null,
  }))

  return [...videoItems, ...photoItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}