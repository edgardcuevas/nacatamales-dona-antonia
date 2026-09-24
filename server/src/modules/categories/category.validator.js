const AppError = require("../../errors/app-error");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SORT_ORDER,
  CATEGORY_SORT_FIELDS,
  CATEGORY_SORT_ORDERS,
} = require("./category.constants");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      "INVALID_CATEGORY_INPUT",
      "Invalid category input"
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
      "UNEXPECTED_CATEGORY_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseCategoryId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_ID",
      "A valid category ID is required"
    );
  }

  const categoryId = Number(value);
  if (
    !Number.isSafeInteger(categoryId) ||
    categoryId < 1
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_ID",
      "A valid category ID is required"
    );
  }

  return categoryId;
}

function parseCategorySlug(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(value)
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_SLUG",
      "A valid category slug is required"
    );
  }

  return value;
}

function parseCategoryName(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_CATEGORY_NAME",
      "A valid category name is required"
    );
  }

  const name = value.trim();
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_NAME",
      "A valid category name is required"
    );
  }

  return name;
}

function parseCategoryDescription(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_DESCRIPTION",
      "A valid category description is required"
    );
  }

  return value;
}

function parseCategorySortOrder(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SORT_ORDER
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_SORT_ORDER",
      "A valid category sort order is required"
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
      "INVALID_CATEGORY_LIST_QUERY",
      "Invalid category list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_LIST_QUERY",
      "Invalid category list query"
    );
  }

  return parsedValue;
}

function parseCategoryListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_LIST_QUERY",
      "Invalid category list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "isActive",
    "name",
    "sortBy",
    "sortOrder",
  ]);

  const page = parsePositiveIntegerQuery(
    query.page,
    DEFAULT_PAGE
  );
  const limit = parsePositiveIntegerQuery(
    query.limit,
    DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const isActive =
    query.isActive === undefined
      ? undefined
      : query.isActive === "true"
        ? true
        : query.isActive === "false"
          ? false
          : (() => {
              throw createValidationError(
                "INVALID_CATEGORY_LIST_QUERY",
                "Invalid category list query"
              );
            })();
  const name =
    query.name === undefined
      ? undefined
      : parseCategoryName(query.name);
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
    !Object.hasOwn(CATEGORY_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(CATEGORY_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_LIST_QUERY",
      "Invalid category list query"
    );
  }

  return {
    page,
    limit,
    isActive,
    name,
    sortBy,
    sortOrder,
  };
}

function parseCreateCategoryBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "name",
    "slug",
    "description",
    "sortOrder",
    "imageMediaId",
  ]);

  if (
    !Object.hasOwn(body, "name") ||
    !Object.hasOwn(body, "slug")
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_INPUT",
      "Category name and slug are required"
    );
  }

  return {
    name: parseCategoryName(body.name),
    slug: parseCategorySlug(body.slug),
    description:
      body.description === undefined
        ? null
        : parseCategoryDescription(body.description),
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : parseCategorySortOrder(body.sortOrder),
    imageMediaId:
      body.imageMediaId === undefined
        ? null
        : parseImageMediaId(body.imageMediaId),
  };
}

function parseUpdateCategoryBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "name",
    "slug",
    "description",
    "sortOrder",
    "imageMediaId",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_CATEGORY_INPUT",
      "At least one category field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "name")) {
    updates.name = parseCategoryName(body.name);
  }
  if (Object.hasOwn(body, "slug")) {
    updates.slug = parseCategorySlug(body.slug);
  }
  if (Object.hasOwn(body, "description")) {
    updates.description =
      parseCategoryDescription(body.description);
  }
  if (Object.hasOwn(body, "sortOrder")) {
    updates.sortOrder =
      parseCategorySortOrder(body.sortOrder);
  }
  if (Object.hasOwn(body, "imageMediaId")) {
    updates.imageMediaId =
      parseImageMediaId(body.imageMediaId);
  }

  return updates;
}

function parseCategoryStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (
    !Object.hasOwn(body, "isActive") ||
    typeof body.isActive !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_STATUS",
      "A valid category status is required"
    );
  }

  return { isActive: body.isActive };
}

function validatePublicCategorySlug(
  request,
  response,
  next
) {
  try {
    request.categorySlug = parseCategorySlug(
      request.params?.slug
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCategoryListQuery(
  request,
  response,
  next
) {
  try {
    request.categoryListQuery =
      parseCategoryListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreateCategory(
  request,
  response,
  next
) {
  try {
    request.categoryInput =
      parseCreateCategoryBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCategoryId(
  request,
  response,
  next
) {
  try {
    request.categoryId = parseCategoryId(
      request.params?.categoryId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateCategory(
  request,
  response,
  next
) {
  try {
    request.categoryId = parseCategoryId(
      request.params?.categoryId
    );
    request.categoryUpdates =
      parseUpdateCategoryBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCategoryStatus(
  request,
  response,
  next
) {
  try {
    request.categoryId = parseCategoryId(
      request.params?.categoryId
    );
    request.categoryStatus =
      parseCategoryStatusBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SORT_ORDER,
  CATEGORY_SORT_FIELDS,
  CATEGORY_SORT_ORDERS,
  SLUG_PATTERN,
  parseCategoryId,
  parseCategorySlug,
  parseCategoryName,
  parseImageMediaId,
  parseCategoryListQuery,
  parseCreateCategoryBody,
  parseUpdateCategoryBody,
  parseCategoryStatusBody,
  validatePublicCategorySlug,
  validateCategoryListQuery,
  validateCreateCategory,
  validateCategoryId,
  validateUpdateCategory,
  validateCategoryStatus,
};
