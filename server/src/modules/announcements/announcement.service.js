const AppError = require("../../errors/app-error");

const mediaRepository = require(
  "../media/media.repository"
);
const announcementRepository = require(
  "./announcement.repository"
);

function createAnnouncementNotFoundError() {
  return new AppError(
    404,
    "ANNOUNCEMENT_NOT_FOUND",
    "The requested announcement does not exist"
  );
}

function createInvalidScheduleError() {
  return new AppError(
    400,
    "INVALID_ANNOUNCEMENT_SCHEDULE",
    "The announcement schedule is invalid"
  );
}

function createMediaNotFoundError() {
  return new AppError(
    404,
    "MEDIA_NOT_FOUND",
    "The requested media does not exist"
  );
}

function createMediaInactiveError() {
  return new AppError(
    409,
    "MEDIA_INACTIVE",
    "The selected media is inactive"
  );
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

function toDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createInvalidScheduleError();
  }

  return date;
}

function toIsoString(value) {
  const date = toDate(value);
  return date === null ? null : date.toISOString();
}

function validateSchedule({
  startsAt,
  endsAt,
  now = new Date(),
}) {
  const start = toDate(startsAt);
  const end = toDate(endsAt);

  if (start !== null && end !== null && end <= start) {
    throw createInvalidScheduleError();
  }

  if (end !== null && end <= now) {
    throw createInvalidScheduleError();
  }

  if (start === null && end !== null && end <= now) {
    throw createInvalidScheduleError();
  }

  return {
    startsAt: start,
    endsAt: end,
  };
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

function toImage(announcement) {
  if (
    announcement.image_id === null ||
    announcement.image_id === undefined
  ) {
    return null;
  }

  const id = Number(announcement.image_id);
  if (
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    throw new Error("Invalid announcement image record");
  }

  return {
    id,
    url: announcement.image_url,
    altText: announcement.image_alt_text ?? null,
    width: toOptionalDimension(announcement.image_width),
    height: toOptionalDimension(announcement.image_height),
  };
}

function toPublicAnnouncement(announcement) {
  const id = Number(announcement.id);
  const sortOrder = Number(announcement.sort_order);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0
  ) {
    throw new Error("Invalid public announcement record");
  }

  return {
    id,
    title: announcement.title,
    content: announcement.content,
    type: announcement.type,
    startsAt: toIsoString(announcement.starts_at),
    endsAt: toIsoString(announcement.ends_at),
    sortOrder,
    image: toImage(announcement),
  };
}

function toAdminAnnouncement(announcement) {
  const id = Number(announcement.id);
  const sortOrder = Number(announcement.sort_order);
  const imageMediaId =
    announcement.image_media_id === null ||
    announcement.image_media_id === undefined
      ? null
      : Number(announcement.image_media_id);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    (imageMediaId !== null &&
      (!Number.isSafeInteger(imageMediaId) ||
        imageMediaId < 1))
  ) {
    throw new Error("Invalid administrative announcement record");
  }

  return {
    id,
    title: announcement.title,
    content: announcement.content,
    type: announcement.type,
    isActive: isActiveRecord(announcement.is_active),
    startsAt: toIsoString(announcement.starts_at),
    endsAt: toIsoString(announcement.ends_at),
    sortOrder,
    imageMediaId,
    image: toImage(announcement),
    createdAt: toIsoString(announcement.created_at),
    updatedAt: toIsoString(announcement.updated_at),
  };
}

async function listPublicAnnouncements(filters) {
  const announcements =
    await announcementRepository.listPublicAnnouncements(
      filters
    );

  return announcements.map(toPublicAnnouncement);
}

async function listAdministrativeAnnouncements(filters) {
  const { announcements, totalItems } =
    await announcementRepository.listAnnouncements(
      filters
    );

  return {
    announcements: announcements.map(toAdminAnnouncement),
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

async function getAnnouncementById(announcementId) {
  const announcement =
    await announcementRepository.findAnnouncementById(
      announcementId
    );

  if (!announcement) {
    throw createAnnouncementNotFoundError();
  }

  return toAdminAnnouncement(announcement);
}

async function validateImageReference(imageMediaId) {
  if (
    imageMediaId === null ||
    imageMediaId === undefined
  ) {
    return;
  }

  const media =
    await mediaRepository.findMediaById(imageMediaId);

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

async function createAnnouncement(input) {
  const schedule = validateSchedule({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  await validateImageReference(input.imageMediaId);

  const created =
    await announcementRepository.createAnnouncement({
      ...input,
      ...schedule,
    });

  return getAnnouncementById(created.id);
}

async function updateAnnouncement({
  announcementId,
  updates,
}) {
  const current =
    await announcementRepository.findAnnouncementById(
      announcementId
    );

  if (!current) {
    throw createAnnouncementNotFoundError();
  }

  const schedule = validateSchedule({
    startsAt:
      Object.hasOwn(updates, "startsAt")
        ? updates.startsAt
        : current.starts_at,
    endsAt:
      Object.hasOwn(updates, "endsAt")
        ? updates.endsAt
        : current.ends_at,
  });

  if (Object.hasOwn(updates, "imageMediaId")) {
    await validateImageReference(updates.imageMediaId);
  }

  const normalizedUpdates = {
    ...updates,
  };

  const updated =
    await announcementRepository.updateAnnouncementById({
      announcementId,
      updates: normalizedUpdates,
    });

  if (!updated) {
    throw createAnnouncementNotFoundError();
  }

  return getAnnouncementById(announcementId);
}

async function changeAnnouncementStatus({
  announcementId,
  isActive,
}) {
  const current =
    await announcementRepository.findAnnouncementById(
      announcementId
    );

  if (!current) {
    throw createAnnouncementNotFoundError();
  }

  if (isActive) {
    validateSchedule({
      startsAt: current.starts_at,
      endsAt: current.ends_at,
    });
  }

  if (isActiveRecord(current.is_active) !== isActive) {
    const updated =
      await announcementRepository.updateAnnouncementStatusById({
        announcementId,
        isActive,
      });

    if (!updated) {
      throw createAnnouncementNotFoundError();
    }
  }

  return getAnnouncementById(announcementId);
}

module.exports = {
  listPublicAnnouncements,
  listAdministrativeAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  changeAnnouncementStatus,
};
