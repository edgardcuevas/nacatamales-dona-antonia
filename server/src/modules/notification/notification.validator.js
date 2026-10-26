const AppError = require("../../errors/app-error");

const {
  MAX_ENDPOINT_LENGTH,
  MIN_P256DH_LENGTH,
  MAX_P256DH_LENGTH,
  MIN_AUTH_LENGTH,
  MAX_AUTH_LENGTH,
  MAX_USER_AGENT_LENGTH,
  ALLOWED_PUSH_HOSTS,
  ALLOWED_PUSH_HOST_SUFFIXES,
} = require("./notification.constants");

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function createInvalidSubscriptionError(
  message = "A valid push subscription is required"
) {
  return new AppError(
    400,
    "INVALID_PUSH_SUBSCRIPTION",
    message
  );
}

function assertPlainObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw createInvalidSubscriptionError();
  }
}

function assertAllowedFields(value, allowedFields) {
  const allowed = new Set(allowedFields);

  if (
    Object.keys(value).some(
      (key) => !allowed.has(key)
    )
  ) {
    throw createInvalidSubscriptionError(
      "Unexpected fields are not allowed"
    );
  }
}

function isAllowedPushHost(hostname) {
  const normalized = hostname.toLowerCase();

  if (ALLOWED_PUSH_HOSTS.includes(normalized)) {
    return true;
  }

  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) =>
    normalized.endsWith(suffix)
  );
}

function parseEndpoint(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ENDPOINT_LENGTH
  ) {
    throw createInvalidSubscriptionError(
      "A valid push endpoint is required"
    );
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw createInvalidSubscriptionError(
      "A valid push endpoint is required"
    );
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    !isAllowedPushHost(url.hostname)
  ) {
    throw createInvalidSubscriptionError(
      "The push endpoint must belong to a supported push service"
    );
  }

  return url.toString();
}

function parseSubscriptionKey(
  value,
  { minLength, maxLength }
) {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw createInvalidSubscriptionError(
      "A valid push subscription is required"
    );
  }

  return value;
}

function parsePushSubscriptionBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["endpoint", "keys"]);

  if (
    !body.keys ||
    typeof body.keys !== "object" ||
    Array.isArray(body.keys)
  ) {
    throw createInvalidSubscriptionError(
      "A valid push subscription is required"
    );
  }

  assertAllowedFields(body.keys, [
    "p256dh",
    "auth",
  ]);

  return {
    endpoint: parseEndpoint(body.endpoint),
    p256dh: parseSubscriptionKey(
      body.keys.p256dh,
      {
        minLength: MIN_P256DH_LENGTH,
        maxLength: MAX_P256DH_LENGTH,
      }
    ),
    auth: parseSubscriptionKey(body.keys.auth, {
      minLength: MIN_AUTH_LENGTH,
      maxLength: MAX_AUTH_LENGTH,
    }),
  };
}

function parsePushUnsubscribeBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["endpoint"]);

  return {
    endpoint: parseEndpoint(body.endpoint),
  };
}

function normalizeUserAgent(value) {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return null;
  }

  return value.trim().slice(0, MAX_USER_AGENT_LENGTH);
}

function validatePushSubscription(request, response, next) {
  request.pushSubscription =
    parsePushSubscriptionBody(request.body);
  request.pushSubscription.userAgent =
    normalizeUserAgent(request.get("user-agent"));
  next();
}

function validatePushUnsubscribe(request, response, next) {
  request.pushUnsubscribe =
    parsePushUnsubscribeBody(request.body);
  next();
}

module.exports = {
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
  normalizeUserAgent,
  validatePushSubscription,
  validatePushUnsubscribe,
  isAllowedPushHost,
};
