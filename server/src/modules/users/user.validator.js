const AppError = require("../../errors/app-error");

const {
  USER_ROLE_VALUES,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
} = require("./user.constants");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

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
      "INVALID_USER_INPUT",
      "Invalid user input"
    );
  }
}

function assertAllowedFields(
  value,
  allowedFields
) {
  const allowed = new Set(allowedFields);
  const hasUnexpectedField = Object.keys(value).some(
    (key) => !allowed.has(key)
  );

  if (hasUnexpectedField) {
    throw createValidationError(
      "UNEXPECTED_USER_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseUserId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_USER_ID",
      "A valid user ID is required"
    );
  }

  const userId = Number(value);

  if (
    !Number.isSafeInteger(userId) ||
    userId < 1
  ) {
    throw createValidationError(
      "INVALID_USER_ID",
      "A valid user ID is required"
    );
  }

  return userId;
}

function normalizeAndValidateEmail(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_USER_EMAIL",
      "A valid email is required"
    );
  }

  const email = value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw createValidationError(
      "INVALID_USER_EMAIL",
      "A valid email is required"
    );
  }

  return email;
}

function validatePassword(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_USER_PASSWORD",
      "A strong password of at least 12 characters is required"
    );
  }

  const passwordBytes = Buffer.byteLength(
    value,
    "utf8"
  );

  if (
    value.length < MIN_PASSWORD_LENGTH ||
    passwordBytes > MAX_PASSWORD_BYTES ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    throw createValidationError(
      "INVALID_USER_PASSWORD",
      "A strong password of at least 12 characters is required"
    );
  }

  return value;
}

function validateRole(value) {
  if (
    typeof value !== "string" ||
    !USER_ROLE_VALUES.includes(value)
  ) {
    throw createValidationError(
      "INVALID_USER_ROLE",
      "Invalid user role"
    );
  }

  return value;
}

function validateActiveStatus(value) {
  if (typeof value !== "boolean") {
    throw createValidationError(
      "INVALID_USER_STATUS",
      "A valid active status is required"
    );
  }

  return value;
}

function parsePositiveIntegerQuery(
  value,
  fieldName,
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
      "INVALID_USER_LIST_QUERY",
      "Invalid user list query"
    );
  }

  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_USER_LIST_QUERY",
      "Invalid user list query"
    );
  }

  return parsedValue;
}

function parseUserListQuery(query = {}) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_USER_LIST_QUERY",
      "Invalid user list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "role",
    "isActive",
    "email",
    "sortBy",
    "sortOrder",
  ]);

  const page = parsePositiveIntegerQuery(
    query.page,
    "page",
    DEFAULT_PAGE
  );
  const limit = parsePositiveIntegerQuery(
    query.limit,
    "limit",
    DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const role =
    query.role === undefined
      ? undefined
      : validateRole(query.role);
  const isActive =
    query.isActive === undefined
      ? undefined
      : query.isActive === "true"
        ? true
        : query.isActive === "false"
          ? false
          : (() => {
              throw createValidationError(
                "INVALID_USER_LIST_QUERY",
                "Invalid user list query"
              );
            })();
  const email =
    query.email === undefined
      ? undefined
      : normalizeAndValidateEmail(query.email);
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
    !Object.hasOwn(USER_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(USER_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_USER_LIST_QUERY",
      "Invalid user list query"
    );
  }

  return {
    page,
    limit,
    role,
    isActive,
    email,
    sortBy,
    sortOrder,
  };
}

function parseCreateUserBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "email",
    "password",
    "role",
  ]);

  if (
    !Object.hasOwn(body, "email") ||
    !Object.hasOwn(body, "password") ||
    !Object.hasOwn(body, "role")
  ) {
    throw createValidationError(
      "INVALID_USER_INPUT",
      "Email, password and role are required"
    );
  }

  return {
    email: normalizeAndValidateEmail(body.email),
    password: validatePassword(body.password),
    role: validateRole(body.role),
  };
}

function parseRoleBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["role"]);

  if (!Object.hasOwn(body, "role")) {
    throw createValidationError(
      "INVALID_USER_INPUT",
      "Role is required"
    );
  }

  return {
    role: validateRole(body.role),
  };
}

function parseStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (!Object.hasOwn(body, "isActive")) {
    throw createValidationError(
      "INVALID_USER_INPUT",
      "Active status is required"
    );
  }

  return {
    isActive: validateActiveStatus(body.isActive),
  };
}

function parsePasswordBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["password"]);

  if (!Object.hasOwn(body, "password")) {
    throw createValidationError(
      "INVALID_USER_INPUT",
      "Password is required"
    );
  }

  return {
    password: validatePassword(body.password),
  };
}

function validateUserListQuery(
  request,
  response,
  next
) {
  try {
    request.userListQuery = parseUserListQuery(
      request.query
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreateUser(
  request,
  response,
  next
) {
  try {
    request.userInput = parseCreateUserBody(
      request.body
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUserId(
  request,
  response,
  next
) {
  try {
    request.userId = parseUserId(
      request.params?.userId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateRoleUpdate(
  request,
  response,
  next
) {
  try {
    request.userId = parseUserId(
      request.params?.userId
    );
    request.roleInput = parseRoleBody(
      request.body
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateStatusUpdate(
  request,
  response,
  next
) {
  try {
    request.userId = parseUserId(
      request.params?.userId
    );
    request.statusInput = parseStatusBody(
      request.body
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validatePasswordUpdate(
  request,
  response,
  next
) {
  try {
    request.userId = parseUserId(
      request.params?.userId
    );
    request.passwordInput = parsePasswordBody(
      request.body
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateSessionsRequest(
  request,
  response,
  next
) {
  try {
    request.userId = parseUserId(
      request.params?.userId
    );

    if (
      request.body !== undefined &&
      request.body !== null
    ) {
      if (
        typeof request.body !== "object" ||
        Array.isArray(request.body) ||
        Object.keys(request.body).length > 0
      ) {
        throw createValidationError(
          "UNEXPECTED_USER_FIELDS",
          "Unexpected fields are not allowed"
        );
      }
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
  parseUserId,
  parseUserListQuery,
  parseCreateUserBody,
  parseRoleBody,
  parseStatusBody,
  parsePasswordBody,
  validateUserListQuery,
  validateCreateUser,
  validateUserId,
  validateRoleUpdate,
  validateStatusUpdate,
  validatePasswordUpdate,
  validateSessionsRequest,
};
