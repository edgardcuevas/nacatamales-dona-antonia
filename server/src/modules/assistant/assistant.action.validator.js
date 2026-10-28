const AppError = require("../../errors/app-error");

const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function createValidationError(code, message) {
  return new AppError(400, code, message);
}

function parseActionToken(value) {
  if (
    typeof value !== "string" ||
    !ACTION_TOKEN_PATTERN.test(value)
  ) {
    throw new AppError(
      404,
      "ASSISTANT_ACTION_NOT_FOUND",
      "The requested action does not exist"
    );
  }

  return value;
}

function assertEmptyActionBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "An empty JSON object is required"
    );
  }

  if (Object.keys(body).length > 0) {
    throw createValidationError(
      "UNEXPECTED_ASSISTANT_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function validateAssistantActionToken(
  request,
  response,
  next
) {
  try {
    request.assistantActionToken = parseActionToken(
      request.params?.token
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateEmptyAssistantActionBody(
  request,
  response,
  next
) {
  try {
    assertEmptyActionBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  parseActionToken,
  assertEmptyActionBody,
  validateAssistantActionToken,
  validateEmptyAssistantActionBody,
};
