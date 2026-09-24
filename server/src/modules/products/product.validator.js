const AppError = require("../../errors/app-error");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SORT_ORDER,
  MAX_PRICE_INTEGER_DIGITS,
  PRODUCT_SORT_FIELDS,
  PRODUCT_SORT_ORDERS,
} = require("./product.constants");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

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
      "INVALID_PRODUCT_INPUT",
      "Invalid product input"
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
      "UNEXPECTED_PRODUCT_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseProductId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_ID",
      "A valid product ID is required"
    );
  }

  const productId = Number(value);
  if (
    !Number.isSafeInteger(productId) ||
    productId < 1
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_ID",
      "A valid product ID is required"
    );
  }

  return productId;
}

function parseProductSlug(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(value)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_SLUG",
      "A valid product slug is required"
    );
  }

  return value;
}

function parseProductName(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_PRODUCT_NAME",
      "A valid product name is required"
    );
  }

  const name = value.trim();
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_NAME",
      "A valid product name is required"
    );
  }

  return name;
}

function parseProductDescription(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_DESCRIPTION",
      "A valid product description is required"
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
      "INVALID_PRODUCT_SORT_ORDER",
      "A valid product sort order is required"
    );
  }

  return value;
}

function parsePrice(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !PRICE_PATTERN.test(value)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_PRICE",
      "A valid product price is required"
    );
  }

  const [integerPart, decimalPart = ""] =
    value.split(".");
  if (
    integerPart.length > MAX_PRICE_INTEGER_DIGITS
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_PRICE",
      "A valid product price is required"
    );
  }

  return `${integerPart}.${decimalPart.padEnd(2, "0")}`;
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
      "INVALID_PRODUCT_LIST_QUERY",
      "Invalid product list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_LIST_QUERY",
      "Invalid product list query"
    );
  }

  return parsedValue;
}

function parseBooleanQuery(
  value,
  fieldName
) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw createValidationError(
    "INVALID_PRODUCT_LIST_QUERY",
    "Invalid product list query"
  );
}

function parsePublicProductListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_LIST_QUERY",
      "Invalid product list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "category",
    "available",
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
  const category =
    query.category === undefined
      ? undefined
      : parseProductSlug(query.category);
  const available =
    query.available === undefined
      ? undefined
      : parseBooleanQuery(
          query.available,
          "available"
        );

  return {
    page,
    limit,
    categorySlug: category,
    available,
  };
}

function parseAdminProductListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_LIST_QUERY",
      "Invalid product list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "name",
    "categoryId",
    "isActive",
    "isAvailable",
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
  const name =
    query.name === undefined
      ? undefined
      : parseProductName(query.name);
  const categoryId =
    query.categoryId === undefined
      ? undefined
      : parsePositiveIntegerQuery(
          query.categoryId
        );
  const isActive =
    query.isActive === undefined
      ? undefined
      : parseBooleanQuery(query.isActive, "isActive");
  const isAvailable =
    query.isAvailable === undefined
      ? undefined
      : parseBooleanQuery(
          query.isAvailable,
          "isAvailable"
        );
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
    !Object.hasOwn(PRODUCT_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(PRODUCT_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_LIST_QUERY",
      "Invalid product list query"
    );
  }

  return {
    page,
    limit,
    name,
    categoryId,
    isActive,
    isAvailable,
    sortBy,
    sortOrder,
  };
}

function parseCreateProductBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "categoryId",
    "name",
    "slug",
    "description",
    "price",
    "isAvailable",
    "sortOrder",
  ]);

  if (
    !Object.hasOwn(body, "categoryId") ||
    !Object.hasOwn(body, "name") ||
    !Object.hasOwn(body, "slug") ||
    !Object.hasOwn(body, "isAvailable")
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_INPUT",
      "Category, name, slug and availability are required"
    );
  }

  if (
    !Number.isSafeInteger(body.categoryId) ||
    body.categoryId < 1
  ) {
    throw createValidationError(
      "INVALID_CATEGORY_ID",
      "A valid category ID is required"
    );
  }

  if (typeof body.isAvailable !== "boolean") {
    throw createValidationError(
      "INVALID_PRODUCT_AVAILABILITY",
      "A valid product availability is required"
    );
  }

  return {
    categoryId: body.categoryId,
    name: parseProductName(body.name),
    slug: parseProductSlug(body.slug),
    description:
      body.description === undefined
        ? null
        : parseProductDescription(body.description),
    price:
      body.price === undefined
        ? null
        : parsePrice(body.price),
    isAvailable: body.isAvailable,
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : parseSortOrder(body.sortOrder),
  };
}

function parseUpdateProductBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "categoryId",
    "name",
    "slug",
    "description",
    "price",
    "sortOrder",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_PRODUCT_INPUT",
      "At least one product field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "categoryId")) {
    if (
      !Number.isSafeInteger(body.categoryId) ||
      body.categoryId < 1
    ) {
      throw createValidationError(
        "INVALID_CATEGORY_ID",
        "A valid category ID is required"
      );
    }
    updates.categoryId = body.categoryId;
  }
  if (Object.hasOwn(body, "name")) {
    updates.name = parseProductName(body.name);
  }
  if (Object.hasOwn(body, "slug")) {
    updates.slug = parseProductSlug(body.slug);
  }
  if (Object.hasOwn(body, "description")) {
    updates.description =
      parseProductDescription(body.description);
  }
  if (Object.hasOwn(body, "price")) {
    updates.price = parsePrice(body.price);
  }
  if (Object.hasOwn(body, "sortOrder")) {
    updates.sortOrder = parseSortOrder(body.sortOrder);
  }

  return updates;
}

function parseProductStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (
    !Object.hasOwn(body, "isActive") ||
    typeof body.isActive !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_STATUS",
      "A valid product status is required"
    );
  }

  return { isActive: body.isActive };
}

function parseProductAvailabilityBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isAvailable"]);

  if (
    !Object.hasOwn(body, "isAvailable") ||
    typeof body.isAvailable !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_PRODUCT_AVAILABILITY",
      "A valid product availability is required"
    );
  }

  return { isAvailable: body.isAvailable };
}

function validatePublicProductListQuery(
  request,
  response,
  next
) {
  try {
    request.productListQuery =
      parsePublicProductListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validatePublicProductSlug(
  request,
  response,
  next
) {
  try {
    request.productSlug = parseProductSlug(
      request.params?.slug
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAdminProductListQuery(
  request,
  response,
  next
) {
  try {
    request.adminProductListQuery =
      parseAdminProductListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreateProduct(
  request,
  response,
  next
) {
  try {
    request.productInput =
      parseCreateProductBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateProductId(
  request,
  response,
  next
) {
  try {
    request.productId = parseProductId(
      request.params?.productId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateProduct(
  request,
  response,
  next
) {
  try {
    request.productId = parseProductId(
      request.params?.productId
    );
    request.productUpdates =
      parseUpdateProductBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateProductStatus(
  request,
  response,
  next
) {
  try {
    request.productId = parseProductId(
      request.params?.productId
    );
    request.productStatus =
      parseProductStatusBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateProductAvailability(
  request,
  response,
  next
) {
  try {
    request.productId = parseProductId(
      request.params?.productId
    );
    request.productAvailability =
      parseProductAvailabilityBody(request.body);
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
  MAX_PRICE_INTEGER_DIGITS,
  PRODUCT_SORT_FIELDS,
  PRODUCT_SORT_ORDERS,
  SLUG_PATTERN,
  PRICE_PATTERN,
  parseProductId,
  parseProductSlug,
  parseProductName,
  parsePrice,
  parsePublicProductListQuery,
  parseAdminProductListQuery,
  parseCreateProductBody,
  parseUpdateProductBody,
  parseProductStatusBody,
  parseProductAvailabilityBody,
  validatePublicProductListQuery,
  validatePublicProductSlug,
  validateAdminProductListQuery,
  validateCreateProduct,
  validateProductId,
  validateUpdateProduct,
  validateProductStatus,
  validateProductAvailability,
};
