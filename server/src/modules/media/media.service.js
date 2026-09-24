const AppError = require("../../errors/app-error");

const mediaRepository = require("./media.repository");

function createMediaNotFoundError() {
  return new AppError(
    404,
    "MEDIA_NOT_FOUND",
    "The requested media does not exist"
  );
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid media date record");
  }

  return date.toISOString();
}

function toOptionalDimension(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const dimension = Number(value);
  if (
    !Number.isSafeInteger(dimension) ||
    dimension < 0
  ) {
    throw new Error("Invalid media dimension record");
  }

  return dimension;
}

function toMedia(media) {
  const id = Number(media.id);
  const bytes = Number(media.bytes);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0
  ) {
    throw new Error("Invalid media record");
  }

  return {
    id,
    provider: media.provider,
    publicId: media.public_id,
    secureUrl: media.secure_url,
    resourceType: media.resource_type,
    format: media.format,
    bytes,
    width: toOptionalDimension(media.width),
    height: toOptionalDimension(media.height),
    altText: media.alt_text ?? null,
    isActive: isActiveRecord(media.is_active),
    createdAt: toIsoString(media.created_at),
    updatedAt: toIsoString(media.updated_at),
  };
}

async function listMedia(filters) {
  const { media, totalItems } =
    await mediaRepository.listMedia(filters);

  return {
    media: media.map(toMedia),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(totalItems / filters.limit),
    },
  };
}

async function getMediaById(mediaId) {
  const media =
    await mediaRepository.findMediaById(mediaId);

  if (!media) {
    throw createMediaNotFoundError();
  }

  return toMedia(media);
}

async function updateMediaAltText({
  mediaId,
  altText,
}) {
  const media =
    await mediaRepository.findMediaById(mediaId);

  if (!media) {
    throw createMediaNotFoundError();
  }

  const updated =
    await mediaRepository.updateMediaAltTextById({
      mediaId,
      altText,
    });

  if (!updated) {
    throw createMediaNotFoundError();
  }

  return getMediaById(mediaId);
}

async function changeMediaStatus({
  mediaId,
  isActive,
}) {
  const media =
    await mediaRepository.findMediaById(mediaId);

  if (!media) {
    throw createMediaNotFoundError();
  }

  if (isActiveRecord(media.is_active) !== isActive) {
    const updated =
      await mediaRepository.updateMediaStatusById({
        mediaId,
        isActive,
      });

    if (!updated) {
      throw createMediaNotFoundError();
    }
  }

  return getMediaById(mediaId);
}

module.exports = {
  listMedia,
  getMediaById,
  updateMediaAltText,
  changeMediaStatus,
};
