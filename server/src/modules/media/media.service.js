const crypto = require("node:crypto");

const AppError = require("../../errors/app-error");
const env = require("../../config/env");
const imagekitAdapter = require("../../config/imagekit");

const {
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  MEDIA_PROVIDER,
  MEDIA_RESOURCE_TYPE,
  MEDIA_UPLOAD_TARGETS,
  UPLOAD_AUTH_TTL_SECONDS,
} = require("./media.constants");
const mediaRepository = require("./media.repository");

const IMAGEKIT_UPLOAD_URL =
  "https://upload.imagekit.io/api/v1/files/upload";

function createMediaNotFoundError() {
  return new AppError(
    404,
    "MEDIA_NOT_FOUND",
    "The requested media does not exist"
  );
}

function createMediaFileNotFoundError() {
  return new AppError(
    404,
    "MEDIA_FILE_NOT_FOUND",
    "The requested media file does not exist"
  );
}

function createMediaAlreadyExistsError() {
  return new AppError(
    409,
    "MEDIA_ALREADY_EXISTS",
    "This media file is already registered"
  );
}

function createMediaInUseError() {
  return new AppError(
    409,
    "MEDIA_IN_USE",
    "The media resource is currently in use"
  );
}

function createMediaProviderError() {
  return new AppError(
    502,
    "MEDIA_PROVIDER_ERROR",
    "The media provider could not complete the operation"
  );
}

function createMediaOperationError() {
  return new AppError(
    500,
    "MEDIA_OPERATION_FAILED",
    "The media operation could not be completed"
  );
}

function createMediaUploadAuthError() {
  return new AppError(
    502,
    "MEDIA_UPLOAD_AUTH_FAILED",
    "The media upload authorization could not be created"
  );
}

function createInvalidMediaTypeError() {
  return new AppError(
    400,
    "MEDIA_INVALID_TYPE",
    "The uploaded file is not an allowed image type"
  );
}

function createInvalidMediaFormatError() {
  return new AppError(
    400,
    "MEDIA_INVALID_FORMAT",
    "The uploaded file format is not allowed"
  );
}

function createMediaTooLargeError() {
  return new AppError(
    400,
    "MEDIA_TOO_LARGE",
    "The uploaded file exceeds the maximum allowed size"
  );
}

function createMediaDimensionsExceededError() {
  return new AppError(
    400,
    "MEDIA_DIMENSIONS_EXCEEDED",
    "The uploaded image exceeds the maximum allowed dimensions"
  );
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

function isImageKitNotFoundError(error) {
  return (
    error?.status === 404 ||
    error?.statusCode === 404 ||
    error?.name === "NotFoundError" ||
    error?.code === "NOT_FOUND"
  );
}

function isKnownMediaDuplicateError(error) {
  if (error?.code !== "ER_DUP_ENTRY") {
    return false;
  }

  const message = [
    error.sqlMessage,
    error.message,
  ]
    .filter(Boolean)
    .join(" ");

  return message.includes("media_provider_public_id_unique");
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

function getControlledFolder(target) {
  if (!MEDIA_UPLOAD_TARGETS.includes(target)) {
    throw new AppError(
      400,
      "INVALID_MEDIA_UPLOAD_TARGET",
      "A valid media upload target is required"
    );
  }

  return `${env.imagekit.folder}/${target}`;
}

function getApprovedFilePrefixes() {
  return MEDIA_UPLOAD_TARGETS.map(
    (target) => `/${env.imagekit.folder}/${target}/`
  );
}

function validateImageKitFile(file, requestedFileId) {
  if (
    !file ||
    typeof file !== "object" ||
    file.fileId !== requestedFileId ||
    typeof file.fileId !== "string"
  ) {
    throw createMediaProviderError();
  }

  if (
    file.fileType !== "image" ||
    !ALLOWED_IMAGE_MIME_TYPES.includes(file.mime)
  ) {
    throw createInvalidMediaTypeError();
  }

  if (
    typeof file.url !== "string" ||
    file.url.length > 2048
  ) {
    throw createMediaProviderError();
  }

  let fileUrl;
  try {
    fileUrl = new URL(file.url);
  } catch {
    throw createMediaProviderError();
  }

  const endpointUrl = new URL(env.imagekit.urlEndpoint);
  if (
    fileUrl.protocol !== "https:" ||
    fileUrl.hostname !== endpointUrl.hostname ||
    fileUrl.username ||
    fileUrl.password ||
    fileUrl.port
  ) {
    throw createMediaProviderError();
  }

  if (
    typeof file.filePath !== "string" ||
    file.filePath.length === 0 ||
    file.filePath.length > 2048 ||
    !file.filePath.startsWith("/") ||
    file.filePath.includes("\\") ||
    file.filePath.includes("..") ||
    file.filePath.includes("//") ||
    file.filePath.includes("?") ||
    file.filePath.includes("#") ||
    !getApprovedFilePrefixes().some(
      (prefix) => file.filePath.startsWith(prefix)
    )
  ) {
    throw createMediaProviderError();
  }

  const format =
    (typeof file.name === "string"
      ? file.name.match(/\.([A-Za-z0-9]+)$/)?.[1]
      : undefined) ??
    fileUrl.pathname.match(/\.([A-Za-z0-9]+)$/)?.[1];

  if (
    typeof format !== "string" ||
    !ALLOWED_IMAGE_FORMATS.includes(
      format.toLowerCase()
    )
  ) {
    throw createInvalidMediaFormatError();
  }

  const mimeFormats = {
    "image/jpeg": ["jpeg", "jpg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
  };
  if (
    !mimeFormats[file.mime]?.includes(
      format.toLowerCase()
    )
  ) {
    throw createInvalidMediaFormatError();
  }

  const bytes = Number(file.size);
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0
  ) {
    throw createMediaProviderError();
  }
  if (bytes > MAX_FILE_BYTES) {
    throw createMediaTooLargeError();
  }

  const width = Number(file.width);
  const height = Number(file.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw createMediaProviderError();
  }
  if (
    width > MAX_IMAGE_WIDTH ||
    height > MAX_IMAGE_HEIGHT
  ) {
    throw createMediaDimensionsExceededError();
  }

  return {
    publicId: file.fileId,
    secureUrl: file.url,
    resourceType: MEDIA_RESOURCE_TYPE,
    format: format.toLowerCase(),
    bytes,
    width,
    height,
  };
}

async function getUploadAuthParameters(target) {
  const folder = getControlledFolder(target);
  const token = crypto.randomUUID();
  const expire =
    Math.floor(Date.now() / 1000) +
    UPLOAD_AUTH_TTL_SECONDS;

  let parameters;
  try {
    parameters =
      await imagekitAdapter.getAuthenticationParameters(
        token,
        expire
      );
  } catch {
    throw createMediaUploadAuthError();
  }

  if (
    !parameters ||
    typeof parameters.token !== "string" ||
    typeof parameters.signature !== "string" ||
    !Number.isSafeInteger(parameters.expire)
  ) {
    throw createMediaUploadAuthError();
  }

  return {
    uploadUrl: IMAGEKIT_UPLOAD_URL,
    publicKey: env.imagekit.publicKey,
    urlEndpoint: env.imagekit.urlEndpoint,
    folder,
    token: parameters.token,
    expire: parameters.expire,
    signature: parameters.signature,
    useUniqueFileName: true,
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

async function createUploadAuth({ target }) {
  return getUploadAuthParameters(target);
}

async function confirmMedia({
  fileId,
  altText,
}) {
  let file;
  try {
    file = await imagekitAdapter.getFile(fileId);
  } catch (error) {
    if (isImageKitNotFoundError(error)) {
      throw createMediaFileNotFoundError();
    }

    throw createMediaProviderError();
  }

  const metadata = validateImageKitFile(file, fileId);
  const existing =
    await mediaRepository.findMediaByPublicId(
      metadata.publicId
    );

  if (existing) {
    throw createMediaAlreadyExistsError();
  }

  let created;
  try {
    created = await mediaRepository.createMedia({
      ...metadata,
      altText: altText ?? null,
    });
  } catch (error) {
    if (isKnownMediaDuplicateError(error)) {
      throw createMediaAlreadyExistsError();
    }

    throw error;
  }

  return getMediaById(created.id);
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

async function deleteMedia({ mediaId }) {
  const snapshot = await mediaRepository.withTransaction(
    async (connection) => {
      const media =
        await mediaRepository.findMediaById(
          mediaId,
          connection,
          true
        );

      if (!media) {
        throw createMediaNotFoundError();
      }

      if (media.provider !== MEDIA_PROVIDER) {
        throw createMediaProviderError();
      }

      const referenceCount =
        await mediaRepository.countMediaReferences(
          mediaId,
          connection
        );

      if (referenceCount > 0) {
        throw createMediaInUseError();
      }

      const wasActive = isActiveRecord(media.is_active);
      if (wasActive) {
        await mediaRepository.updateMediaStatusById({
          mediaId,
          isActive: false,
          connection,
        });
      }

      return {
        publicId: media.public_id,
        wasActive,
      };
    }
  );

  try {
    await imagekitAdapter.deleteFile(snapshot.publicId);
  } catch (error) {
    if (!isImageKitNotFoundError(error)) {
      if (snapshot.wasActive) {
        try {
          await mediaRepository.updateMediaStatusById({
            mediaId,
            isActive: true,
          });
        } catch {
          // Keep the row inactive for controlled retry if restoration fails.
        }
      }

      throw createMediaProviderError();
    }
  }

  try {
    await mediaRepository.withTransaction(
      async (connection) => {
        const media =
          await mediaRepository.findMediaById(
            mediaId,
            connection,
            true
          );

        if (!media) {
          return;
        }

        const referenceCount =
          await mediaRepository.countMediaReferences(
            mediaId,
            connection
          );

        if (referenceCount > 0) {
          throw createMediaInUseError();
        }

        await mediaRepository.deleteMediaById(
          mediaId,
          connection
        );
      }
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error(
      "ImageKit media deletion persistence failure",
      { mediaId }
    );
    throw createMediaOperationError();
  }

  return {
    mediaId,
    deleted: true,
  };
}

module.exports = {
  listMedia,
  getMediaById,
  createUploadAuth,
  confirmMedia,
  updateMediaAltText,
  changeMediaStatus,
  deleteMedia,
};
