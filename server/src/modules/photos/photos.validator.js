const AppError = require("../../errors/app-error");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_CAPTION_LENGTH,
  MAX_SORT_ORDER,
  PHOTO_SORT_FIELDS,
  PHOTO_SORT_ORDERS,
} = require("./photos.constants");

function createValidationError(code, message) {
  return new AppError(400, code, message);
}

function assertPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createValidationError(
      "INVALID_PHOTO_INPUT",
      "Invalid photo input"
    );
  }
}

function assertAllowedFields(value, allowedFields) {
  const allowed = new Set(allowedFields);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw createValidationError(
      "UNEXPECTED_PHOTO_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parsePhotoId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw createValidationError(
      "INVALID_PHOTO_ID",
      "A valid photo ID is required"
    );
  }

  const photoId = Number(value);
  if (!Number.isSafeInteger(photoId) || photoId < 1) {
    throw createValidationError(
      "INVALID_PHOTO_ID",
      "A valid photo ID is required"
    );
  }

  return photoId;
}

function parseCaption(value) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.length > MAX_CAPTION_LENGTH) {
    throw createValidationError(
      "INVALID_CAPTION",
      "A valid photo caption is required"
    );
  }

  return value;
}

function parseImageMediaId(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw createValidationError(
      "INVALID_IMAGE_MEDIA_ID",
      "A valid image media ID is required"
    );
  }

  return value;
}

function parseSortOrder(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SORT_ORDER
  ) {
    throw createValidationError(
      "INVALID_SORT_ORDER",
      "A valid photo sort order is required"
    );
  }

  return value;
}

function parsePositiveIntegerQuery(value, defaultValue, maximum) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw createValidationError(
      "INVALID_PHOTO_LIST_QUERY",
      "Invalid photo list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_PHOTO_LIST_QUERY",
      "Invalid photo list query"
    );
  }

  return parsedValue;
}

function parseBooleanQuery(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw createValidationError(
    "INVALID_PHOTO_LIST_QUERY",
    "Invalid photo list query"
  );
}

function parseAdministrativePhotoListQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw createValidationError(
      "INVALID_PHOTO_LIST_QUERY",
      "Invalid photo list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "isActive",
    "caption",
    "sortBy",
    "sortOrder",
  ]);

  const sortBy = query.sortBy === undefined ? "createdAt" : query.sortBy;
  const sortOrder = query.sortOrder === undefined ? "desc" : query.sortOrder;
  if (
    typeof sortBy !== "string" ||
    !Object.hasOwn(PHOTO_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(PHOTO_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_PHOTO_LIST_QUERY",
      "Invalid photo list query"
    );
  }

  let caption;
  if (query.caption !== undefined) {
    caption = parseCaption(query.caption);
    if (caption === null) {
      throw createValidationError(
        "INVALID_PHOTO_LIST_QUERY",
        "Invalid photo list query"
      );
    }
  }

  return {
    page: parsePositiveIntegerQuery(query.page, DEFAULT_PAGE),
    limit: parsePositiveIntegerQuery(query.limit, DEFAULT_LIMIT, MAX_LIMIT),
    isActive:
      query.isActive === undefined
        ? undefined
        : parseBooleanQuery(query.isActive),
    caption,
    sortBy,
    sortOrder,
  };
}

function parseCreatePhotoBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["caption", "imageMediaId", "sortOrder"]);

  if (!Object.hasOwn(body, "imageMediaId")) {
    throw createValidationError(
      "INVALID_PHOTO_INPUT",
      "An image media ID is required"
    );
  }

  return {
    caption:
      body.caption === undefined ? null : parseCaption(body.caption),
    imageMediaId: parseImageMediaId(body.imageMediaId),
    sortOrder:
      body.sortOrder === undefined ? 0 : parseSortOrder(body.sortOrder),
  };
}

function parseUpdatePhotoBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "caption",
    "imageMediaId",
    "sortOrder",
    "isActive",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_PHOTO_INPUT",
      "At least one photo field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "caption")) {
    updates.caption = parseCaption(body.caption);
  }
  if (Object.hasOwn(body, "imageMediaId")) {
    updates.imageMediaId = parseImageMediaId(body.imageMediaId);
  }
  if (Object.hasOwn(body, "sortOrder")) {
    updates.sortOrder = parseSortOrder(body.sortOrder);
  }
  if (Object.hasOwn(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      throw createValidationError(
        "INVALID_PHOTO_STATUS",
        "A valid photo status is required"
      );
    }
    updates.isActive = body.isActive;
  }

  return updates;
}

function validateAdministrativePhotoListQuery(request, response, next) {
  try {
    request.photoListQuery = parseAdministrativePhotoListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreatePhoto(request, response, next) {
  try {
    request.photoInput = parseCreatePhotoBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validatePhotoId(request, response, next) {
  try {
    request.photoId = parsePhotoId(request.params?.photoId);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdatePhoto(request, response, next) {
  try {
    request.photoId = parsePhotoId(request.params?.photoId);
    request.photoUpdates = parseUpdatePhotoBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  parsePhotoId,
  parseAdministrativePhotoListQuery,
  parseCreatePhotoBody,
  parseUpdatePhotoBody,
  validateAdministrativePhotoListQuery,
  validateCreatePhoto,
  validatePhotoId,
  validateUpdatePhoto,
};