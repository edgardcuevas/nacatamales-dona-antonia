const AppError = require("../../errors/app-error");

const {
  MAX_MESSAGE_LENGTH,
  DEFAULT_CONVERSATION_LIST_LIMIT,
  MAX_CONVERSATION_LIST_LIMIT,
  DEFAULT_MESSAGE_LIST_LIMIT,
  MAX_MESSAGE_LIST_LIMIT,
  DEFAULT_USAGE_DAYS,
  MAX_USAGE_DAYS,
} = require("./assistant.constants");

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
      "INVALID_ASSISTANT_INPUT",
      "Invalid assistant input"
    );
  }
}

function assertAllowedFields(value, allowedFields) {
  const allowed = new Set(allowedFields);

  if (
    Object.keys(value).some(
      (key) => !allowed.has(key)
    )
  ) {
    throw createValidationError(
      "UNEXPECTED_ASSISTANT_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseConversationId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "A valid conversation ID is required"
    );
  }

  const conversationId = Number(value);

  if (
    !Number.isSafeInteger(conversationId) ||
    conversationId < 1
  ) {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "A valid conversation ID is required"
    );
  }

  return conversationId;
}

// El cliente no envia historial: solo el texto nuevo y, si continua un
// hilo, su id. Cualquier otro campo se rechaza en vez de ignorarse.
function parseMessageBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "conversationId",
    "message",
  ]);

  if (typeof body.message !== "string") {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "A message is required"
    );
  }

  const message = body.message.trim();

  if (message.length === 0) {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "A message is required"
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw createValidationError(
      "ASSISTANT_MESSAGE_TOO_LONG",
      `The message exceeds ${MAX_MESSAGE_LENGTH} characters`
    );
  }

  let conversationId = null;

  if (body.conversationId !== undefined) {
    if (
      !Number.isSafeInteger(body.conversationId) ||
      body.conversationId < 1
    ) {
      throw createValidationError(
        "INVALID_ASSISTANT_INPUT",
        "A valid conversation ID is required"
      );
    }

    conversationId = body.conversationId;
  }

  return { conversationId, message };
}

function parseLimit(
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
      "INVALID_ASSISTANT_INPUT",
      "Invalid assistant list query"
    );
  }

  const limit = Number(value);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > maximum
  ) {
    throw createValidationError(
      "INVALID_ASSISTANT_INPUT",
      "Invalid assistant list query"
    );
  }

  return limit;
}

function parseConversationListQuery(query = {}) {
  assertPlainObject(query);
  assertAllowedFields(query, ["limit"]);

  return {
    limit: parseLimit(
      query.limit,
      DEFAULT_CONVERSATION_LIST_LIMIT,
      MAX_CONVERSATION_LIST_LIMIT
    ),
  };
}

function parseMessageListQuery(query = {}) {
  assertPlainObject(query);
  assertAllowedFields(query, ["limit"]);

  return {
    limit: parseLimit(
      query.limit,
      DEFAULT_MESSAGE_LIST_LIMIT,
      MAX_MESSAGE_LIST_LIMIT
    ),
  };
}

function validateAssistantMessageBody(
  request,
  response,
  next
) {
  try {
    request.assistantMessageInput =
      parseMessageBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAssistantConversationId(
  request,
  response,
  next
) {
  try {
    request.assistantConversationId =
      parseConversationId(
        request.params?.conversationId
      );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAssistantConversationListQuery(
  request,
  response,
  next
) {
  try {
    request.assistantListQuery =
      parseConversationListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function parseUsageQuery(query = {}) {
  assertPlainObject(query);
  assertAllowedFields(query, ["days"]);

  return {
    days: parseLimit(
      query.days,
      DEFAULT_USAGE_DAYS,
      MAX_USAGE_DAYS
    ),
  };
}

function validateAssistantUsageQuery(
  request,
  response,
  next
) {
  try {
    request.assistantUsageQuery =
      parseUsageQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAssistantMessageListQuery(
  request,
  response,
  next
) {
  try {
    request.assistantMessageListQuery =
      parseMessageListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  parseConversationId,
  parseMessageBody,
  parseConversationListQuery,
  parseMessageListQuery,
  parseUsageQuery,
  validateAssistantMessageBody,
  validateAssistantConversationId,
  validateAssistantConversationListQuery,
  validateAssistantMessageListQuery,
  validateAssistantUsageQuery,
};
