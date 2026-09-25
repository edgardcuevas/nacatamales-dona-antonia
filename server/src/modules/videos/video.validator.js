const AppError = require("../../errors/app-error");

const {
  VIDEO_PROVIDERS,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_URL_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_SORT_ORDER,
  VIDEO_SORT_FIELDS,
  VIDEO_SORT_ORDERS,
} = require("./video.constants");

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const APPROVED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
]);

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
      "INVALID_VIDEO_INPUT",
      "Invalid video input"
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
      "UNEXPECTED_VIDEO_FIELDS",
      "Unexpected fields are not allowed"
    );
  }
}

function parseVideoId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_ID",
      "A valid video ID is required"
    );
  }

  const videoId = Number(value);
  if (
    !Number.isSafeInteger(videoId) ||
    videoId < 1
  ) {
    throw createValidationError(
      "INVALID_VIDEO_ID",
      "A valid video ID is required"
    );
  }

  return videoId;
}

function parseTitle(value) {
  if (typeof value !== "string") {
    throw createValidationError(
      "INVALID_VIDEO_TITLE",
      "A valid video title is required"
    );
  }

  const title = value.trim();
  if (
    title.length === 0 ||
    title.length > MAX_TITLE_LENGTH
  ) {
    throw createValidationError(
      "INVALID_VIDEO_TITLE",
      "A valid video title is required"
    );
  }

  return title;
}

function parseDescription(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw createValidationError(
      "INVALID_VIDEO_DESCRIPTION",
      "A valid video description is required"
    );
  }

  return value;
}

function parseProvider(value) {
  if (
    typeof value !== "string" ||
    !VIDEO_PROVIDERS.includes(value)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_PROVIDER",
      "Only YOUTUBE is supported"
    );
  }

  return value;
}

function parseHttpsUrl(
  value,
  maximumLength,
  code,
  message
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw createValidationError(code, message);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw createValidationError(code, message);
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw createValidationError(code, message);
  }

  return url;
}

function parseYouTubeExternalId(value) {
  if (
    typeof value !== "string" ||
    value.length > MAX_EXTERNAL_ID_LENGTH ||
    !YOUTUBE_ID_PATTERN.test(value)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_EXTERNAL_ID",
      "A valid YouTube external ID is required"
    );
  }

  return value;
}

function extractYouTubeId(value) {
  const url = parseHttpsUrl(
    value,
    MAX_URL_LENGTH,
    "INVALID_VIDEO_URL",
    "A valid HTTPS YouTube URL is required"
  );
  const hostname = url.hostname.toLowerCase();

  if (!APPROVED_YOUTUBE_HOSTS.has(hostname)) {
    throw createValidationError(
      "INVALID_VIDEO_URL",
      "A valid HTTPS YouTube URL is required"
    );
  }

  if (hostname === "youtu.be") {
    const segments = url.pathname
      .split("/")
      .filter(Boolean);
    if (segments.length !== 1) {
      throw createValidationError(
        "INVALID_VIDEO_URL",
        "A valid HTTPS YouTube URL is required"
      );
    }
    return parseYouTubeExternalId(segments[0]);
  }

  if (
    url.pathname === "/watch" ||
    url.pathname === "/watch/"
  ) {
    const values = url.searchParams.getAll("v");
    if (values.length !== 1) {
      throw createValidationError(
        "INVALID_VIDEO_URL",
        "A valid HTTPS YouTube URL is required"
      );
    }
    return parseYouTubeExternalId(values[0]);
  }

  const pathMatch = url.pathname.match(
    /^\/(?:embed|shorts|live)\/([^/]+)\/?$/
  );
  if (!pathMatch) {
    throw createValidationError(
      "INVALID_VIDEO_URL",
      "A valid HTTPS YouTube URL is required"
    );
  }

  return parseYouTubeExternalId(pathMatch[1]);
}

function validateYouTubeIdentity({
  provider,
  url,
  externalId,
}) {
  if (provider !== "YOUTUBE") {
    throw createValidationError(
      "INVALID_VIDEO_PROVIDER",
      "Only YOUTUBE is supported"
    );
  }

  const urlId = extractYouTubeId(url);
  const parsedExternalId =
    parseYouTubeExternalId(externalId);

  if (urlId !== parsedExternalId) {
    throw createValidationError(
      "VIDEO_URL_ID_MISMATCH",
      "The YouTube URL and external ID must identify the same video"
    );
  }

  return {
    provider,
    url,
    externalId: parsedExternalId,
  };
}

function parseThumbnailUrl(value) {
  if (value === null) {
    return null;
  }

  parseHttpsUrl(
    value,
    MAX_URL_LENGTH,
    "INVALID_VIDEO_THUMBNAIL_URL",
    "A valid HTTPS thumbnail URL is required"
  );
  return value;
}

function parseSortOrder(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SORT_ORDER
  ) {
    throw createValidationError(
      "INVALID_VIDEO_SORT_ORDER",
      "A valid video sort order is required"
    );
  }

  return value;
}

function parseBoolean(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw createValidationError(
    "INVALID_VIDEO_LIST_QUERY",
    "Invalid video list query"
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
      "INVALID_VIDEO_LIST_QUERY",
      "Invalid video list query"
    );
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_LIST_QUERY",
      "Invalid video list query"
    );
  }

  return parsedValue;
}

function parseAdministrativeVideoListQuery(
  query = {}
) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_LIST_QUERY",
      "Invalid video list query"
    );
  }

  assertAllowedFields(query, [
    "page",
    "limit",
    "isActive",
    "provider",
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
    !Object.hasOwn(VIDEO_SORT_FIELDS, sortBy) ||
    typeof sortOrder !== "string" ||
    !Object.hasOwn(VIDEO_SORT_ORDERS, sortOrder)
  ) {
    throw createValidationError(
      "INVALID_VIDEO_LIST_QUERY",
      "Invalid video list query"
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
    provider:
      query.provider === undefined
        ? undefined
        : parseProvider(query.provider),
    title:
      query.title === undefined
        ? undefined
        : parseTitle(query.title),
    sortBy,
    sortOrder,
  };
}

function parseCreateVideoBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "title",
    "description",
    "url",
    "provider",
    "externalId",
    "thumbnailUrl",
    "sortOrder",
  ]);

  if (
    !Object.hasOwn(body, "title") ||
    !Object.hasOwn(body, "url") ||
    !Object.hasOwn(body, "provider") ||
    !Object.hasOwn(body, "externalId")
  ) {
    throw createValidationError(
      "INVALID_VIDEO_INPUT",
      "Title, URL, provider and external ID are required"
    );
  }

  const input = {
    title: parseTitle(body.title),
    description:
      body.description === undefined
        ? null
        : parseDescription(body.description),
    url: body.url,
    provider: parseProvider(body.provider),
    externalId: parseYouTubeExternalId(
      body.externalId
    ),
    thumbnailUrl:
      body.thumbnailUrl === undefined
        ? null
        : parseThumbnailUrl(body.thumbnailUrl),
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : parseSortOrder(body.sortOrder),
  };

  validateYouTubeIdentity(input);
  return input;
}

function parseUpdateVideoBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, [
    "title",
    "description",
    "url",
    "provider",
    "externalId",
    "thumbnailUrl",
    "sortOrder",
  ]);

  if (Object.keys(body).length === 0) {
    throw createValidationError(
      "INVALID_VIDEO_INPUT",
      "At least one video field is required"
    );
  }

  const updates = {};
  if (Object.hasOwn(body, "title")) {
    updates.title = parseTitle(body.title);
  }
  if (Object.hasOwn(body, "description")) {
    updates.description =
      parseDescription(body.description);
  }
  if (Object.hasOwn(body, "url")) {
    extractYouTubeId(body.url);
    updates.url = body.url;
  }
  if (Object.hasOwn(body, "provider")) {
    updates.provider = parseProvider(body.provider);
  }
  if (Object.hasOwn(body, "externalId")) {
    updates.externalId = parseYouTubeExternalId(
      body.externalId
    );
  }
  if (Object.hasOwn(body, "thumbnailUrl")) {
    updates.thumbnailUrl =
      parseThumbnailUrl(body.thumbnailUrl);
  }
  if (Object.hasOwn(body, "sortOrder")) {
    updates.sortOrder = parseSortOrder(body.sortOrder);
  }

  return updates;
}

function parseVideoStatusBody(body) {
  assertPlainObject(body);
  assertAllowedFields(body, ["isActive"]);

  if (
    !Object.hasOwn(body, "isActive") ||
    typeof body.isActive !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_VIDEO_STATUS",
      "A valid video status is required"
    );
  }

  return { isActive: body.isActive };
}

function validatePublicVideoId(
  request,
  response,
  next
) {
  try {
    request.videoId = parseVideoId(
      request.params?.videoId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateAdministrativeVideoListQuery(
  request,
  response,
  next
) {
  try {
    request.videoListQuery =
      parseAdministrativeVideoListQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateCreateVideo(
  request,
  response,
  next
) {
  try {
    request.videoInput = parseCreateVideoBody(
      request.body
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateVideoId(
  request,
  response,
  next
) {
  try {
    request.videoId = parseVideoId(
      request.params?.videoId
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateUpdateVideo(
  request,
  response,
  next
) {
  try {
    request.videoId = parseVideoId(
      request.params?.videoId
    );
    request.videoUpdates =
      parseUpdateVideoBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateVideoStatus(
  request,
  response,
  next
) {
  try {
    request.videoId = parseVideoId(
      request.params?.videoId
    );
    request.videoStatus =
      parseVideoStatusBody(request.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  VIDEO_PROVIDERS,
  YOUTUBE_ID_PATTERN,
  APPROVED_YOUTUBE_HOSTS,
  parseVideoId,
  parseTitle,
  parseDescription,
  parseProvider,
  parseHttpsUrl,
  parseYouTubeExternalId,
  extractYouTubeId,
  validateYouTubeIdentity,
  parseThumbnailUrl,
  parseAdministrativeVideoListQuery,
  parseCreateVideoBody,
  parseUpdateVideoBody,
  parseVideoStatusBody,
  validatePublicVideoId,
  validateAdministrativeVideoListQuery,
  validateCreateVideo,
  validateVideoId,
  validateUpdateVideo,
  validateVideoStatus,
};
