const AppError = require("../../errors/app-error");
const {
  parseTitle,
  parseDescription,
  parseVideoId,
} = require("../videos/video.validator");
const {
  ALLOWED_VIDEO_CONTENT_TYPES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_YOUTUBE_DESCRIPTION_LENGTH,
} = require("./youtube.constants");

function createValidationError(
  code,
  message
) {
  return new AppError(400, code, message);
}

function getSingleHeader(
  request,
  name
) {
  const value = request.get(name);
  if (
    value !== undefined &&
    typeof value !== "string"
  ) {
    throw createValidationError(
      "INVALID_VIDEO_UPLOAD",
      "The video upload headers are invalid"
    );
  }
  return value;
}

function parseCallbackQuery(query) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    throw createValidationError(
      "INVALID_YOUTUBE_OAUTH_CALLBACK",
      "The YouTube authorization callback is invalid"
    );
  }

  const allowedFields = new Set([
    "code",
    "state",
    "iss",
    "error",
    "error_description",
    "error_uri",
    "scope",
    "authuser",
    "prompt",
    "hd",
  ]);
  if (
    Object.keys(query).some(
      (key) => !allowedFields.has(key)
    )
  ) {
    throw createValidationError(
      "INVALID_YOUTUBE_OAUTH_CALLBACK",
      "The YouTube authorization callback is invalid"
    );
  }

  if (
    query.iss !== undefined &&
    query.iss !== "https://accounts.google.com"
  ) {
    throw createValidationError(
      "INVALID_YOUTUBE_OAUTH_CALLBACK",
      "The YouTube authorization callback is invalid"
    );
  }

  const state = query.state;
  if (
    typeof state !== "string" ||
    state.length < 32 ||
    state.length > 256
  ) {
    throw createValidationError(
      "INVALID_YOUTUBE_OAUTH_STATE",
      "The YouTube authorization state is invalid"
    );
  }

  if (query.error !== undefined) {
    if (typeof query.error !== "string") {
      throw createValidationError(
        "INVALID_YOUTUBE_OAUTH_CALLBACK",
        "The YouTube authorization callback is invalid"
      );
    }
    return {
      state,
      error: query.error,
    };
  }

  if (
    typeof query.code !== "string" ||
    query.code.length === 0 ||
    query.code.length > 2048
  ) {
    throw createValidationError(
      "INVALID_YOUTUBE_OAUTH_CALLBACK",
      "The YouTube authorization callback is invalid"
    );
  }

  return {
    state,
    code: query.code,
  };
}

function validateOAuthCallback(
  request,
  response,
  next
) {
  try {
    request.youtubeCallback =
      parseCallbackQuery(request.query);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateVideoUpload(
  request,
  response,
  next
) {
  try {
    const contentType =
      getSingleHeader(request, "content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
    const contentLengthValue =
      getSingleHeader(request, "content-length");
    const title =
      getSingleHeader(request, "x-video-title");
    const description =
      getSingleHeader(
        request,
        "x-video-description"
      ) ?? null;
    const contentEncoding =
      getSingleHeader(
        request,
        "content-encoding"
      );

    if (
      !ALLOWED_VIDEO_CONTENT_TYPES.includes(
        contentType
      )
    ) {
      throw createValidationError(
        "INVALID_VIDEO_FILE_TYPE",
        "Only MP4 video files are accepted"
      );
    }

    if (
      contentEncoding !== undefined &&
      contentEncoding !== ""
    ) {
      throw createValidationError(
        "INVALID_VIDEO_UPLOAD_ENCODING",
        "Encoded video uploads are not accepted"
      );
    }

    if (
      contentLengthValue === undefined ||
      !/^\d+$/.test(contentLengthValue)
    ) {
      throw createValidationError(
        "VIDEO_FILE_SIZE_REQUIRED",
        "A valid video file size is required"
      );
    }

    const fileSize = Number(contentLengthValue);
    if (
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_VIDEO_UPLOAD_BYTES
    ) {
      throw createValidationError(
        "INVALID_VIDEO_FILE_SIZE",
        "The video file size is not allowed"
      );
    }

    const parsedDescription =
      parseDescription(description);
    if (
      parsedDescription !== null &&
      parsedDescription.length >
        MAX_YOUTUBE_DESCRIPTION_LENGTH
    ) {
      throw createValidationError(
        "INVALID_VIDEO_DESCRIPTION",
        "A valid video description is required"
      );
    }

    request.youtubeUploadInput = {
      title: parseTitle(title),
      description: parsedDescription,
      fileStream: request,
      fileSize,
      contentType,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateVideoStatusId(
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

module.exports = {
  parseCallbackQuery,
  validateOAuthCallback,
  validateVideoUpload,
  validateVideoStatusId,
};
