const AppError = require("../../errors/app-error");

const {
  ANNOUNCEMENT_TYPES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_SORT_ORDER,
  ANNOUNCEMENT_SORT_FIELDS,
  ANNOUNCEMENT_SORT_ORDERS,
} = require("./announcement.constants");

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function createValidationError(code, message) {
  return new AppError(400, code, message);
}

function assertPlainObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_INPUT",
      "Invalid announcement input"
    );
  }
}

function assertAllowedFields(
  value,
  allowedFields
) {
  const allowed = new Set(allowedFields);
  if (
    Object.keys(value).some(
      (key) => !allowed.has(key)
    )
  ) {
    throw createValidationError(
      "UNEXPECTED_ANNOUNCEMENT_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseAnnouncementId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_ID",
      "A valid announcement ID is required"
    );
  }

  const announcementId = Number(value);
  if (
    !Number.isSafeInteger(announcementId) ||
    announcementId < 1
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_ID",
      "A valid announcement ID is required"
    );
  }

  return announcementId;
}

function parseAnnouncementType(value) {
  if (
    typeof value !== "string" ||
    !ANNOUNCEMENT_TYPES.includes(value)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_TYPE",
      "A valid announcement type is required"
    );
  }

  return value;
}

function parseTitle(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_TITLE",
      "A valid announcement title is required"
    );
  }

  const title = value.trim();
  if (
    title.length === 0 ||
    title.length > MAX_TITLE_LENGTH
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_TITLE",
      "A valid announcement title is required"
    );
  }

  return title;
}

function parseContent(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_CONTENT",
      "Announcement content is required"
    );
  }

  const content = value.trim();
  if (
    content.length === 0 ||
    content.length > MAX_CONTENT_LENGTH
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_CONTENT",
      "Announcement content is required"
    );
  }

  return content;
}

function parseDate(value, fieldName) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !ISO_DATE_PATTERN.test(value)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_SCHEDULE",
      "The announcement schedule is invalid"
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_SCHEDULE",
      "The announcement schedule is invalid"
    );
  }

  return date;
}

function parseSortOrder(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SORT_ORDER
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_SORT_ORDER",
      "A valid announcement sort order is required"
    );
  }

  return value;
}

function parseImageMediaId(value) {
  if (value === null) {
    return null;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw createValidationError(
      "INVALID_MEDIA_ID",
      "A valid media ID is required"
    );
  }

  return value;
}

function parseBoolean(value, code) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw createValidationError(
    code,
    "Invalid boolean value"
  );
}

function parsePositiveIntegerQuery(
  value,
  defaultValue,
  maximum
) {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_LIST_QUERY",
      "Invalid announcement list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_LIST_QUERY",
      "Invalid announcement list query"
    );
  }

  return parsedValue;
}

function parsePublicAnnouncementListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_LIST_QUERY",
      "Invalid announcement list query"
    );
  }

  const allowedFields = new Set(["type"]);
  if (
    Object.keys(query).some(
      (key) => !allowedFields.has(key)
    )
  ) {
    throw createValidationError(
      "UNEXPECTED_ANNOUNCEMENT_QUERY_FIELDS",
      "Unexpected query fields are not allowed"
    );
  }

  return {
    type:
      query.type === undefined
        ? undefined
        : parseAnnouncementType(query.type),
  };
}

function parseAdministrativeAnnouncementListQuery(
  query = {}
) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_LIST_QUERY",
      "Invalid announcement list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "isActive",
    "type",
    "title",
    "sortBy",
    "sortOrder",
  ]);

  const sortBy =
    query.sortBy === undefined
      ? "createdAt"
      : query.sortBy;
  const sortOrder =
    query.sortOrder === undefined
      ? "desc"
      : query.sortOrder;

  if (
    typeof sortBy !== "string" ||
    !Object.hasOwn(ANNOUNCEMENT_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(ANNOUNCEMENT_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_LIST_QUERY",
      "Invalid announcement list query"
    );
  }

  return {
    page: parsePositiveIntegerQuery(
      query.page,
      DEFAULT_PAGE
    ),
    limit: parsePositiveIntegerQuery(
      query.limit,
      DEFAULT_LIMIT,
      MAX_LIMIT
    ),
    isActive:
      query.isActive === undefined
        ? undefined
        : parseBoolean(
            query.isActive,
            "INVALID_ANNOUNCEMENT_LIST_QUERY"
          ),
    type:
      query.type === undefined
        ? undefined
        : parseAnnouncementType(query.type),
    title:
      query.title === undefined
        ? undefined
        : parseTitle(query.title),
    sortBy,
    sortOrder,
  };
}

function parseCreateAnnouncementBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "title",
    "content",
    "type",
    "startsAt",
    "endsAt",
    "sortOrder",
    "imageMediaId",
  ]);

  if (
    !Object.hasOwn(body, "title") ||
    !Object.hasOwn(body, "content") ||
    !Object.hasOwn(body, "type")
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_INPUT",
      "Title, content and type are required"
    );
  }

  return {
    title: parseTitle(body.title),
    content: parseContent(body.content),
    type: parseAnnouncementType(body.type),
    startsAt:
      body.startsAt === undefined
        ? null
        : parseDate(body.startsAt, "startsAt"),
    endsAt:
      body.endsAt === undefined
        ? null
        : parseDate(body.endsAt, "endsAt"),
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : parseSortOrder(body.sortOrder),
    imageMediaId:
      body.imageMediaId === undefined
        ? null
        : parseImageMediaId(body.imageMediaId),
  };
}

function parseUpdateAnnouncementBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "title",
    "content",
    "type",
    "startsAt",
    "endsAt",
    "sortOrder",
    "imageMediaId",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_INPUT",
      "At least one announcement field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "title")) {
    updates.title = parseTitle(body.title);
  }
  if (Object.hasOwn(body, "content")) {
    updates.content = parseContent(body.content);
  }
  if (Object.hasOwn(body, "type")) {
    updates.type = parseAnnouncementType(body.type);
  }
  if (Object.hasOwn(body, "startsAt")) {
    updates.startsAt = parseDate(
      body.startsAt,
      "startsAt"
    );
  }
  if (Object.hasOwn(body, "endsAt")) {
    updates.endsAt = parseDate(
      body.endsAt,
      "endsAt"
    );
  }
  if (Object.hasOwn(body, "sortOrder")) {
    updates.sortOrder = parseSortOrder(body.sortOrder);
  }
  if (Object.hasOwn(body, "imageMediaId")) {
    updates.imageMediaId =
      parseImageMediaId(body.imageMediaId);
  }

  return updates;
}

function parseAnnouncementStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (
    !Object.hasOwn(body, "isActive") ||
    typeof body.isActive !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_ANNOUNCEMENT_STATUS",
      "A valid announcement status is required"
    );
  }

  return { isActive: body.isActive };
}

function validatePublicAnnouncementListQuery(
  request,
  response,
  next
) {
  try {
    request.announcementListQuery =
      parsePublicAnnouncementListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAdministrativeAnnouncementListQuery(
  request,
  response,
  next
) {
  try {
    request.announcementListQuery =
      parseAdministrativeAnnouncementListQuery(
        request.query
      );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreateAnnouncement(
  request,
  response,
  next
) {
  try {
    request.announcementInput =
      parseCreateAnnouncementBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAnnouncementId(
  request,
  response,
  next
) {
  try {
    request.announcementId =
      parseAnnouncementId(request.params?.announcementId);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateAnnouncement(
  request,
  response,
  next
) {
  try {
    request.announcementId =
      parseAnnouncementId(request.params?.announcementId);
    request.announcementUpdates =
      parseUpdateAnnouncementBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAnnouncementStatus(
  request,
  response,
  next
) {
  try {
    request.announcementId =
      parseAnnouncementId(request.params?.announcementId);
    request.announcementStatus =
      parseAnnouncementStatusBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  ANNOUNCEMENT_TYPES,
  ISO_DATE_PATTERN,
  parseAnnouncementId,
  parseAnnouncementType,
  parseDate,
  parsePublicAnnouncementListQuery,
  parseAdministrativeAnnouncementListQuery,
  parseCreateAnnouncementBody,
  parseUpdateAnnouncementBody,
  parseAnnouncementStatusBody,
  validatePublicAnnouncementListQuery,
  validateAdministrativeAnnouncementListQuery,
  validateCreateAnnouncement,
  validateAnnouncementId,
  validateUpdateAnnouncement,
  validateAnnouncementStatus,
};
