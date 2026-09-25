const AppError = require("../../errors/app-error");

const videoRepository = require("./video.repository");
const {
  validateYouTubeIdentity,
} = require("./video.validator");

function createVideoNotFoundError() {
  return new AppError(
    404,
    "VIDEO_NOT_FOUND",
    "The requested video does not exist"
  );
}

function createVideoDuplicateError() {
  return new AppError(
    409,
    "VIDEO_ALREADY_EXISTS",
    "A video with this provider and external ID already exists"
  );
}

function createVideoNotReadyError() {
  return new AppError(
    409,
    "VIDEO_NOT_READY",
    "The video must finish processing before it can be activated"
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
    throw new Error("Invalid video date record");
  }

  return date.toISOString();
}

function toPublicVideo(video) {
  const id = Number(video.id);
  const sortOrder = Number(video.sort_order);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid public video record");
  }

  return {
    id,
    title: video.title,
    description: video.description ?? null,
    url: video.url,
    provider: video.provider,
    externalId: video.external_id,
    thumbnailUrl: video.thumbnail_url ?? null,
    sortOrder,
  };
}

function toAdminVideo(video) {
  const id = Number(video.id);
  const sortOrder = Number(video.sort_order);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid administrative video record");
  }

  return {
    id,
    title: video.title,
    description: video.description ?? null,
    url: video.url,
    provider: video.provider,
    externalId: video.external_id,
    thumbnailUrl: video.thumbnail_url ?? null,
    sortOrder,
    isActive: isActiveRecord(video.is_active),
    uploadStatus: video.upload_status ?? "READY",
    privacyStatus: video.privacy_status ?? "UNLISTED",
    createdAt: toIsoString(video.created_at),
    updatedAt: toIsoString(video.updated_at),
  };
}

function getDuplicateKey(error) {
  if (error?.code !== "ER_DUP_ENTRY") {
    return null;
  }

  const message = [
    error.sqlMessage,
    error.message,
  ]
    .filter(Boolean)
    .join(" ");

  if (
    message.includes("videos_provider_external_id_unique")
  ) {
    return "provider_external_id";
  }

  return null;
}

function rethrowVideoWriteError(error) {
  if (
    getDuplicateKey(error) === "provider_external_id"
  ) {
    throw createVideoDuplicateError();
  }

  throw error;
}

async function listPublicVideos() {
  const videos =
    await videoRepository.listPublicVideos();

  return videos.map(toPublicVideo);
}

async function getPublicVideoById(videoId) {
  const video =
    await videoRepository.findPublicVideoById(
      videoId
    );

  if (!video) {
    throw createVideoNotFoundError();
  }

  return toPublicVideo(video);
}

async function listAdministrativeVideos(filters) {
  const { videos, totalItems } =
    await videoRepository.listVideos(filters);

  return {
    videos: videos.map(toAdminVideo),
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

async function getVideoById(videoId) {
  const video =
    await videoRepository.findVideoById(videoId);

  if (!video) {
    throw createVideoNotFoundError();
  }

  return toAdminVideo(video);
}

async function createVideo(input) {
  validateYouTubeIdentity({
    provider: input.provider,
    url: input.url,
    externalId: input.externalId,
  });

  let created;
  try {
    created = await videoRepository.createVideo(input);
  } catch (error) {
    rethrowVideoWriteError(error);
  }

  return getVideoById(created.id);
}

async function updateVideo({
  videoId,
  updates,
}) {
  const current =
    await videoRepository.findVideoById(videoId);

  if (!current) {
    throw createVideoNotFoundError();
  }

  validateYouTubeIdentity({
    provider:
      Object.hasOwn(updates, "provider")
        ? updates.provider
        : current.provider,
    url:
      Object.hasOwn(updates, "url")
        ? updates.url
        : current.url,
    externalId:
      Object.hasOwn(updates, "externalId")
        ? updates.externalId
        : current.external_id,
  });

  let updated;
  try {
    updated = await videoRepository.updateVideoById({
      videoId,
      updates,
    });
  } catch (error) {
    rethrowVideoWriteError(error);
  }

  if (!updated) {
    throw createVideoNotFoundError();
  }

  return getVideoById(videoId);
}

async function changeVideoStatus({
  videoId,
  isActive,
}) {
  const current =
    await videoRepository.findVideoById(videoId);

  if (!current) {
    throw createVideoNotFoundError();
  }

  const currentUploadStatus =
    current.upload_status ?? "READY";
  if (
    isActive &&
    currentUploadStatus !== "READY"
  ) {
    throw createVideoNotReadyError();
  }

  if (isActiveRecord(current.is_active) !== isActive) {
    const updated =
      await videoRepository.updateVideoStatusById({
        videoId,
        isActive,
      });

    if (!updated) {
      throw createVideoNotFoundError();
    }
  }

  return getVideoById(videoId);
}

module.exports = {
  listPublicVideos,
  getPublicVideoById,
  listAdministrativeVideos,
  getVideoById,
  createVideo,
  updateVideo,
  changeVideoStatus,
};
