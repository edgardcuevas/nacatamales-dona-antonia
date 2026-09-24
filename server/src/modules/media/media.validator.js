const AppError = require("../../errors/app-error");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PUBLIC_ID_LENGTH,
  MAX_ALT_TEXT_LENGTH,
  MEDIA_UPLOAD_TARGETS,
  MEDIA_RESOURCE_TYPES,
  MEDIA_SORT_FIELDS,
  MEDIA_SORT_ORDERS,
} = require("./media.constants");

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
      "INVALID_MEDIA_INPUT",
      "Invalid media input"
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
      "UNEXPECTED_MEDIA_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseMediaId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_ID",
      "A valid media ID is required"
    );
  }

  const mediaId = Number(value);
  if (
    !Number.isSafeInteger(mediaId) ||
    mediaId < 1
  ) {
    throw createValidationError(
      "INVALID_MEDIA_ID",
      "A valid media ID is required"
    );
  }

  return mediaId;
}

function parseUploadTarget(value) {
  if (
    typeof value !== "string" ||
    !MEDIA_UPLOAD_TARGETS.includes(value)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_UPLOAD_TARGET",
      "A valid media upload target is required"
    );
  }

  return value;
}

function parseFileId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PUBLIC_ID_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_FILE_ID",
      "A valid media file ID is required"
    );
  }

  return value;
}

function parseUploadAuthBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["target"]);

  if (!Object.hasOwn(body, "target")) {
    throw createValidationError(
      "INVALID_MEDIA_UPLOAD_TARGET",
      "A valid media upload target is required"
    );
  }

  return {
    target: parseUploadTarget(body.target),
  };
}

function parseConfirmMediaBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["fileId", "altText"]);

  if (!Object.hasOwn(body, "fileId")) {
    throw createValidationError(
      "INVALID_MEDIA_FILE_ID",
      "A valid media file ID is required"
    );
  }

  return {
    fileId: parseFileId(body.fileId),
    altText:
      body.altText === undefined
        ? null
        : parseAltText(body.altText),
  };
}

function parseResourceType(value) {
  if (
    typeof value !== "string" ||
    !MEDIA_RESOURCE_TYPES.includes(value)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_RESOURCE_TYPE",
      "A valid media resource type is required"
    );
  }

  return value;
}

function parsePublicId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PUBLIC_ID_LENGTH
  ) {
    throw createValidationError(
      "INVALID_MEDIA_PUBLIC_ID",
      "A valid media public ID is required"
    );
  }

  return value;
}

function parseAltText(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_ALT_TEXT_LENGTH
  ) {
    throw createValidationError(
      "INVALID_MEDIA_ALT_TEXT",
      "A valid media alt text is required"
    );
  }

  return value.trim() || null;
}

function parseBoolean(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw createValidationError(
    "INVALID_MEDIA_LIST_QUERY",
    "Invalid media list query"
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
      "INVALID_MEDIA_LIST_QUERY",
      "Invalid media list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_LIST_QUERY",
      "Invalid media list query"
    );
  }

  return parsedValue;
}

function parseMediaListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_LIST_QUERY",
      "Invalid media list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "isActive",
    "resourceType",
    "publicId",
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
    !Object.hasOwn(MEDIA_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(MEDIA_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_MEDIA_LIST_QUERY",
      "Invalid media list query"
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
        : parseBoolean(query.isActive),
    resourceType:
      query.resourceType === undefined
        ? undefined
        : parseResourceType(query.resourceType),
    publicId:
      query.publicId === undefined
        ? undefined
        : parsePublicId(query.publicId),
    sortBy,
    sortOrder,
  };
}

function parseUpdateMediaBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["altText"]);

  if (!Object.hasOwn(body, "altText")) {
    throw createValidationError(
      "INVALID_MEDIA_INPUT",
      "altText is required"
    );
  }

  return {
    altText: parseAltText(body.altText),
  };
}

function parseMediaStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (
    !Object.hasOwn(body, "isActive") ||
    typeof body.isActive !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_MEDIA_STATUS",
      "A valid media status is required"
    );
  }

  return { isActive: body.isActive };
}

function validateUploadAuth(
  request,
  response,
  next
) {
  try {
    request.mediaUploadInput =
      parseUploadAuthBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateConfirmMedia(
  request,
  response,
  next
) {
  try {
    request.mediaConfirmInput =
      parseConfirmMediaBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateMediaListQuery(
  request,
  response,
  next
) {
  try {
    request.mediaListQuery =
      parseMediaListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateMediaId(
  request,
  response,
  next
) {
  try {
    request.mediaId = parseMediaId(
      request.params?.mediaId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateMedia(
  request,
  response,
  next
) {
  try {
    request.mediaId = parseMediaId(
      request.params?.mediaId
    );
    request.mediaUpdates =
      parseUpdateMediaBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateMediaStatus(
  request,
  response,
  next
) {
  try {
    request.mediaId = parseMediaId(
      request.params?.mediaId
    );
    request.mediaStatus =
      parseMediaStatusBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  MEDIA_UPLOAD_TARGETS,
  MEDIA_RESOURCE_TYPES,
  parseMediaId,
  parseUploadTarget,
  parseFileId,
  parseUploadAuthBody,
  parseConfirmMediaBody,
  parseResourceType,
  parsePublicId,
  parseAltText,
  parseMediaListQuery,
  parseUpdateMediaBody,
  parseMediaStatusBody,
  validateUploadAuth,
  validateConfirmMedia,
  validateMediaListQuery,
  validateMediaId,
  validateUpdateMedia,
  validateMediaStatus,
};
