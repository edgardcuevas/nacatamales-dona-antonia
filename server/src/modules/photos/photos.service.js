const AppError = require("../../errors/app-error");

const mediaRepository = require("../media/media.repository");
const photosRepository = require("./photos.repository");

function createPhotoNotFoundError() {
  return new AppError(404, "PHOTO_NOT_FOUND", "The requested photo does not exist");
}

function createMediaNotFoundError() {
  return new AppError(404, "MEDIA_NOT_FOUND", "The requested media does not exist");
}

function createMediaInactiveError() {
  return new AppError(409, "MEDIA_INACTIVE", "The selected media is inactive");
}

function createInvalidMediaResourceTypeError() {
  return new AppError(
    400,
    "INVALID_MEDIA_RESOURCE_TYPE",
    "The selected media must be an image"
  );
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid photo date record");
  }

  return date.toISOString();
}

function toOptionalDimension(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const dimension = Number(value);
  if (!Number.isSafeInteger(dimension) || dimension < 0) {
    throw new Error("Invalid media dimension record");
  }

  return dimension;
}

function toImage(photo) {
  if (photo.image_id === null || photo.image_id === undefined) {
    throw new Error("Invalid photo image record");
  }

  return {
    url: photo.image_url,
    altText: photo.image_alt_text ?? null,
    width: toOptionalDimension(photo.image_width),
    height: toOptionalDimension(photo.image_height),
  };
}

function toPublicPhoto(photo) {
  const id = Number(photo.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid public photo record");
  }

  return {
    id,
    caption: photo.caption ?? null,
    image: toImage(photo),
    createdAt: toIsoString(photo.created_at),
  };
}

function toAdminPhoto(photo) {
  const id = Number(photo.id);
  const sortOrder = Number(photo.sort_order);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid administrative photo record");
  }

  return {
    ...toPublicPhoto(photo),
    isActive: isActiveRecord(photo.is_active),
    sortOrder,
    updatedAt: toIsoString(photo.updated_at),
  };
}

async function validateImageReference(imageMediaId) {
  const media = await mediaRepository.findMediaById(imageMediaId);
  if (!media) {
    throw createMediaNotFoundError();
  }
  if (!isActiveRecord(media.is_active)) {
    throw createMediaInactiveError();
  }
  if (media.resource_type !== "IMAGE") {
    throw createInvalidMediaResourceTypeError();
  }
}

async function listPublicPhotos() {
  const photos = await photosRepository.listPublicPhotos();
  return photos.map(toPublicPhoto);
}

async function getPublicPhotoById(photoId) {
  const photo = await photosRepository.findPublicPhotoById(photoId);
  if (!photo) {
    throw createPhotoNotFoundError();
  }
  return toPublicPhoto(photo);
}

async function listAdministrativePhotos(filters) {
  const { photos, totalItems } = await photosRepository.listPhotos(filters);
  return {
    photos: photos.map(toAdminPhoto),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages:
        totalItems === 0 ? 0 : Math.ceil(totalItems / filters.limit),
    },
  };
}

async function getPhotoById(photoId) {
  const photo = await photosRepository.findPhotoById(photoId);
  if (!photo) {
    throw createPhotoNotFoundError();
  }
  return toAdminPhoto(photo);
}

async function createPhoto(input) {
  await validateImageReference(input.imageMediaId);
  const created = await photosRepository.createPhoto(input);
  return getPhotoById(created.id);
}

async function updatePhoto({ photoId, updates }) {
  const current = await photosRepository.findPhotoById(photoId);
  if (!current) {
    throw createPhotoNotFoundError();
  }

  if (Object.hasOwn(updates, "imageMediaId")) {
    await validateImageReference(updates.imageMediaId);
  }

  const updated = await photosRepository.updatePhotoById({ photoId, updates });
  if (!updated) {
    throw createPhotoNotFoundError();
  }
  return getPhotoById(photoId);
}

async function deletePhoto(photoId) {
  const current = await photosRepository.findPhotoById(photoId);
  if (!current) {
    throw createPhotoNotFoundError();
  }

  const deleted = await photosRepository.deletePhotoById(photoId);
  if (!deleted) {
    throw createPhotoNotFoundError();
  }

  return { photoId, deleted: true };
}

module.exports = {
  toPublicPhoto,
  toAdminPhoto,
  listPublicPhotos,
  getPublicPhotoById,
  listAdministrativePhotos,
  getPhotoById,
  createPhoto,
  updatePhoto,
  deletePhoto,
};