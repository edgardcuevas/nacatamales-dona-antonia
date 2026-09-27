const AppError = require("../../errors/app-error");

const {
  MAX_BUSINESS_NAME_LENGTH,
  MAX_TAGLINE_LENGTH,
  MAX_WHATSAPP_LENGTH,
  MAX_URL_LENGTH,
  MAX_ADDRESS_LENGTH,
  MAX_SCHEDULE_TEXT_LENGTH,
  MAX_STORY_TEXT_LENGTH,
  SCHEDULE_COLORS,
  MAX_FRITANGA_SCHEDULE_TEXT_LENGTH,
} = require("./settings.constants");

function createValidationError(code, message) {
  return new AppError(400, code, message);
}

function assertPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createValidationError(
      "INVALID_SETTINGS_INPUT",
      "Invalid settings input"
    );
  }
}

function assertAllowedFields(value, allowedFields) {
  const allowed = new Set(allowedFields);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw createValidationError(
      "UNEXPECTED_SETTINGS_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseBusinessName(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_BUSINESS_NAME",
      "A valid business name is required"
    );
  }

  const businessName = value.trim();
  if (
    businessName.length === 0 ||
    businessName.length > MAX_BUSINESS_NAME_LENGTH
  ) {
    throw createValidationError(
      "INVALID_BUSINESS_NAME",
      "A valid business name is required"
    );
  }

  return businessName;
}

function parseNullableString(value, maximumLength, code, message) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.length > maximumLength) {
    throw createValidationError(code, message);
  }

  return value;
}

function parseWhatsappNumber(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > MAX_WHATSAPP_LENGTH ||
    !/^\d+$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_WHATSAPP_NUMBER",
      "A valid WhatsApp number with country code is required"
    );
  }

  return value;
}

function parseSocialUrl(value, code, label) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_URL_LENGTH ||
    (!value.startsWith("http://") && !value.startsWith("https://"))
  ) {
    throw createValidationError(
      code,
      `A valid ${label} URL is required`
    );
  }

  return value;
}

function parseCoordinate(value, minimum, maximum, code, label) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw createValidationError(
      code,
      `A valid ${label} is required`
    );
  }

  return value;
}

function parseScheduleColor(value, code, message) {
  if (typeof value !== "string" || !SCHEDULE_COLORS.includes(value)) {
    throw createValidationError(code, message);
  }

  return value;
}

function parseUpdateSettingsBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "businessName",
    "tagline",
    "whatsappNumber",
    "facebookUrl",
    "instagramUrl",
    "address",
    "latitude",
    "longitude",
    "scheduleText",
    "storyText",
    "scheduleColor",
    "fritangaScheduleText",
    "fritangaScheduleColor",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_SETTINGS_INPUT",
      "At least one settings field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "businessName")) {
    updates.businessName = parseBusinessName(body.businessName);
  }
  if (Object.hasOwn(body, "tagline")) {
    updates.tagline = parseNullableString(
      body.tagline,
      MAX_TAGLINE_LENGTH,
      "INVALID_TAGLINE",
      "A valid tagline is required"
    );
  }
  if (Object.hasOwn(body, "whatsappNumber")) {
    updates.whatsappNumber = parseWhatsappNumber(body.whatsappNumber);
  }
  if (Object.hasOwn(body, "facebookUrl")) {
    updates.facebookUrl = parseSocialUrl(
      body.facebookUrl,
      "INVALID_FACEBOOK_URL",
      "Facebook"
    );
  }
  if (Object.hasOwn(body, "instagramUrl")) {
    updates.instagramUrl = parseSocialUrl(
      body.instagramUrl,
      "INVALID_INSTAGRAM_URL",
      "Instagram"
    );
  }
  if (Object.hasOwn(body, "address")) {
    updates.address = parseNullableString(
      body.address,
      MAX_ADDRESS_LENGTH,
      "INVALID_ADDRESS",
      "A valid address is required"
    );
  }
  if (Object.hasOwn(body, "latitude")) {
    updates.latitude = parseCoordinate(
      body.latitude,
      -90,
      90,
      "INVALID_LATITUDE",
      "latitude"
    );
  }
  if (Object.hasOwn(body, "longitude")) {
    updates.longitude = parseCoordinate(
      body.longitude,
      -180,
      180,
      "INVALID_LONGITUDE",
      "longitude"
    );
  }
  if (Object.hasOwn(body, "scheduleText")) {
    updates.scheduleText = parseNullableString(
      body.scheduleText,
      MAX_SCHEDULE_TEXT_LENGTH,
      "INVALID_SCHEDULE_TEXT",
      "A valid schedule text is required"
    );
  }
  if (Object.hasOwn(body, "storyText")) {
    updates.storyText = parseNullableString(
      body.storyText,
      MAX_STORY_TEXT_LENGTH,
      "INVALID_STORY_TEXT",
      "A valid story text is required"
    );
  }
  if (Object.hasOwn(body, "scheduleColor")) {
    updates.scheduleColor = parseScheduleColor(
      body.scheduleColor,
      "INVALID_SCHEDULE_COLOR",
      "A valid schedule color is required"
    );
  }
  if (Object.hasOwn(body, "fritangaScheduleText")) {
    updates.fritangaScheduleText = parseNullableString(
      body.fritangaScheduleText,
      MAX_FRITANGA_SCHEDULE_TEXT_LENGTH,
      "INVALID_FRITANGA_SCHEDULE_TEXT",
      "A valid fritanga schedule text is required"
    );
  }
  if (Object.hasOwn(body, "fritangaScheduleColor")) {
    updates.fritangaScheduleColor = parseScheduleColor(
      body.fritangaScheduleColor,
      "INVALID_FRITANGA_SCHEDULE_COLOR",
      "A valid fritanga schedule color is required"
    );
  }

  return updates;
}

function validateUpdateSettings(request, response, next) {
  try {
    request.settingsUpdates = parseUpdateSettingsBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  parseUpdateSettingsBody,
  validateUpdateSettings,
};