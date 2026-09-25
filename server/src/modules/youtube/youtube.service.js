const crypto = require("node:crypto");

const AppError = require("../../errors/app-error");
const videoRepository = require("../videos/video.repository");
const videoService = require("../videos/video.service");
const {
  youtubeClient,
  YouTubeApiError,
  isAllowedThumbnailUrl,
} = require("../../config/youtube");
const youtubeConnectionRepository = require("./youtube-connection.repository");
const youtubeStateRepository = require("./youtube-state.repository");
const {
  encryptRefreshToken,
  decryptRefreshToken,
} = require("./youtube-token-crypto");
const {
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_YOUTUBE_DESCRIPTION_LENGTH,
  OAUTH_STATE_TTL_MS,
} = require("./youtube.constants");

const accessTokenCache = new Map();

function createYoutubeError(
  statusCode,
  code,
  message
) {
  return new AppError(statusCode, code, message);
}

function createNotConnectedError() {
  return createYoutubeError(
    409,
    "YOUTUBE_NOT_CONNECTED",
    "The YouTube channel is not connected"
  );
}

function createOAuthError() {
  return createYoutubeError(
    400,
    "YOUTUBE_OAUTH_FAILED",
    "The YouTube authorization flow could not be completed"
  );
}

function createOAuthStateMismatchError() {
  return createYoutubeError(
    400,
    "YOUTUBE_OAUTH_STATE_MISMATCH",
    "The YouTube authorization state does not match the browser session"
  );
}

function createOAuthStateError() {
  return createYoutubeError(
    400,
    "YOUTUBE_OAUTH_STATE_INVALID",
    "The YouTube authorization state is invalid or expired"
  );
}

function createOAuthStateStoreError() {
  return createYoutubeError(
    500,
    "YOUTUBE_OAUTH_STATE_UNAVAILABLE",
    "The YouTube authorization state could not be verified"
  );
}

function createUploadError() {
  return createYoutubeError(
    502,
    "YOUTUBE_UPLOAD_FAILED",
    "The video could not be uploaded to YouTube"
  );
}

function createStatusError() {
  return createYoutubeError(
    502,
    "YOUTUBE_STATUS_UNAVAILABLE",
    "The YouTube video status could not be retrieved"
  );
}

function createChannelMismatchError() {
  return createYoutubeError(
    403,
    "YOUTUBE_CHANNEL_MISMATCH",
    "The authorized Google account does not belong to the configured YouTube channel"
  );
}

function mapYoutubeError(
  error,
  operation
) {
  if (error instanceof AppError) {
    return error;
  }

  if (
    error instanceof YouTubeApiError &&
    error.operation === "channel-mismatch"
  ) {
    return createChannelMismatchError();
  }

  if (operation === "authorization-code") {
    return createOAuthError();
  }

  if (operation === "upload") {
    return createUploadError();
  }

  if (operation === "status") {
    return createStatusError();
  }

  if (operation === "refresh-token") {
    return createYoutubeError(
      409,
      "YOUTUBE_REAUTH_REQUIRED",
      "The YouTube channel must be reconnected"
    );
  }

  return createYoutubeError(
    502,
    "YOUTUBE_PROVIDER_ERROR",
    "The YouTube provider could not complete the request"
  );
}

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function createOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

function hashOAuthState(state) {
  return crypto
    .createHash("sha256")
    .update(state, "utf8")
    .digest("hex");
}

function statesMatch(
  queryState,
  cookieState
) {
  if (
    typeof queryState !== "string" ||
    typeof cookieState !== "string"
  ) {
    return false;
  }

  const queryBuffer = Buffer.from(queryState, "utf8");
  const cookieBuffer = Buffer.from(cookieState, "utf8");
  if (queryBuffer.length !== cookieBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    queryBuffer,
    cookieBuffer
  );
}

function normalizeExpiresIn(value) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) &&
    seconds > 0 &&
    seconds <= 86_400
    ? seconds
    : 3600;
}

function mapUploadStatus(video) {
  if (
    video?.processingStatus === "failed" ||
    video?.uploadStatus === "failed"
  ) {
    return "FAILED";
  }

  if (
    video?.processingStatus === "succeeded" ||
    video?.uploadStatus === "processed"
  ) {
    return "READY";
  }

  return "PROCESSING";
}

function mapPrivacyStatus(value) {
  const normalized =
    typeof value === "string"
      ? value.toUpperCase()
      : null;

  if (
    normalized === "PUBLIC" ||
    normalized === "PRIVATE" ||
    normalized === "UNLISTED"
  ) {
    return normalized;
  }

  return "UNLISTED";
}

function validateUploadInput({
  title,
  description,
  fileSize,
  contentType,
  fileStream,
}) {
  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.length > 150
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_TITLE",
      "A valid video title is required"
    );
  }

  if (
    description !== null &&
    description !== undefined &&
    (
      typeof description !== "string" ||
      description.length > MAX_YOUTUBE_DESCRIPTION_LENGTH
    )
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_DESCRIPTION",
      "A valid video description is required"
    );
  }

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_VIDEO_UPLOAD_BYTES
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_FILE_SIZE",
      "The video file size is not allowed"
    );
  }

  if (
    contentType !== "video/mp4"
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_FILE_TYPE",
      "Only MP4 video files are accepted"
    );
  }

  if (
    !fileStream ||
    typeof fileStream.pipe !== "function"
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_FILE",
      "A video file is required"
    );
  }
}

async function getConnectionOrThrow() {
  const connection =
    await youtubeConnectionRepository.getConnection();

  if (!connection) {
    throw createNotConnectedError();
  }

  return connection;
}

async function getAccessToken() {
  const connection =
    await getConnectionOrThrow();
  const cached =
    accessTokenCache.get(connection.channel_id);
  const now = Date.now();

  if (
    cached &&
    cached.expiresAt > now
  ) {
    return cached.accessToken;
  }

  let refreshToken;
  try {
    refreshToken =
      decryptRefreshToken(
        connection.encrypted_refresh_token
      );
  } catch {
    accessTokenCache.delete(connection.channel_id);
    throw createNotConnectedError();
  }

  let refreshed;
  try {
    refreshed =
      await youtubeClient.refreshAccessToken(
        refreshToken
      );
  } catch (error) {
    accessTokenCache.delete(connection.channel_id);
    throw mapYoutubeError(error, "refresh-token");
  }

  const expiresIn =
    normalizeExpiresIn(refreshed.expiresIn);
  const tokenExpiresAt =
    now + expiresIn * 1000;
  const cacheExpiresAt =
    now + Math.max(1_000, expiresIn * 1000 - 60_000);
  accessTokenCache.set(connection.channel_id, {
    accessToken: refreshed.accessToken,
    expiresAt: cacheExpiresAt,
  });

  try {
    await youtubeConnectionRepository.updateTokenExpiry({
      channelId: connection.channel_id,
      tokenExpiresAt: new Date(tokenExpiresAt),
    });
  } catch {
    // A failed metadata update must not expose or invalidate the token.
  }

  return refreshed.accessToken;
}

function clearAccessTokenCache() {
  accessTokenCache.clear();
}

async function createAuthorizationRequest(
  adminUserId
) {
  if (
    !Number.isSafeInteger(adminUserId) ||
    adminUserId <= 0
  ) {
    throw createYoutubeError(
      500,
      "YOUTUBE_OAUTH_STATE_UNAVAILABLE",
      "The YouTube authorization state could not be created"
    );
  }

  const state = createOAuthState();
  const expiresAt = new Date(
    Date.now() + OAUTH_STATE_TTL_MS
  );

  try {
    await youtubeStateRepository.createOAuthState({
      stateHash: hashOAuthState(state),
      adminUserId,
      expiresAt,
    });
  } catch {
    throw createOAuthStateStoreError();
  }

  return {
    state,
    authorizationUrl:
      youtubeClient.getAuthorizationUrl(state),
    expiresInSeconds:
      Math.floor(OAUTH_STATE_TTL_MS / 1000),
  };
}

async function completeAuthorization({
  code,
  state,
  stateCookie,
  error: oauthError,
}) {
  if (
    typeof state !== "string" ||
    state.length < 32 ||
    !statesMatch(state, stateCookie)
  ) {
    throw createOAuthStateMismatchError();
  }

  let stateResult;
  try {
    stateResult =
      await youtubeStateRepository.consumeOAuthState({
        stateHash: hashOAuthState(state),
      });
  } catch {
    throw createOAuthStateStoreError();
  }

  if (
    !stateResult ||
    stateResult.accepted !== true
  ) {
    throw createOAuthStateError();
  }

  if (oauthError) {
    throw createOAuthError();
  }

  let tokenResponse;
  try {
    tokenResponse =
      await youtubeClient.exchangeAuthorizationCode(
        code
      );
  } catch (error) {
    throw mapYoutubeError(error, "authorization-code");
  }

  let channel;
  try {
    channel =
      await youtubeClient.getAuthenticatedChannel(
        tokenResponse.accessToken
      );
  } catch (error) {
    throw mapYoutubeError(error, "authorization-code");
  }

  const encryptedRefreshToken =
    encryptRefreshToken(tokenResponse.refreshToken);
  let connection;
  try {
    connection =
      await youtubeConnectionRepository.upsertConnection({
        channelId: channel.channelId,
        channelTitle:
          channel.title.slice(0, 150),
        encryptedRefreshToken,
        scopes: tokenResponse.scope,
        tokenExpiresAt: new Date(
          Date.now() +
            normalizeExpiresIn(tokenResponse.expiresIn) * 1000
        ),
      });
  } catch {
    throw createYoutubeError(
      500,
      "YOUTUBE_CONNECTION_PERSISTENCE_FAILED",
      "The YouTube channel connection could not be saved"
    );
  }
  clearAccessTokenCache();

  return toConnectionStatus(connection);
}

function toConnectionStatus(connection) {
  if (!connection) {
    return {
      connected: false,
      channelId: null,
      channelTitle: null,
      connectedAt: null,
      updatedAt: null,
    };
  }

  return {
    connected: true,
    channelId: connection.channel_id,
    channelTitle: connection.channel_title,
    connectedAt:
      toIsoString(connection.connected_at),
    updatedAt: toIsoString(connection.updated_at),
  };
}

async function getConnectionStatus() {
  const connection =
    await youtubeConnectionRepository.getConnection();
  return toConnectionStatus(connection);
}

async function uploadVideo(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_UPLOAD",
      "The video upload input is invalid"
    );
  }

  const normalizedInput = {
    ...input,
    title: input.title.trim(),
    description: input.description ?? null,
  };
  validateUploadInput(normalizedInput);

  const accessToken =
    await getAccessToken();
  let uploadedVideo;
  try {
    uploadedVideo =
      await youtubeClient.uploadVideo({
        ...normalizedInput,
        accessToken,
      });
  } catch (error) {
    throw mapYoutubeError(error, "upload");
  }

  const uploadStatus =
    mapUploadStatus(uploadedVideo);
  const providerPrivacyStatus =
    mapPrivacyStatus(uploadedVideo.privacyStatus);
  if (providerPrivacyStatus !== "UNLISTED") {
    try {
      await youtubeClient.deleteVideo(
        accessToken,
        uploadedVideo.videoId
      );
    } catch {
      // Keep the privacy invariant even if compensation needs review.
    }
    throw createUploadError();
  }
  const privacyStatus = "UNLISTED";

  let created;
  try {
    created =
      await videoRepository.createUploadedVideo({
        title: normalizedInput.title,
        description: normalizedInput.description,
        url: uploadedVideo.url,
        externalId: uploadedVideo.videoId,
        thumbnailUrl:
          isAllowedThumbnailUrl(
            uploadedVideo.thumbnailUrl
          )
            ? uploadedVideo.thumbnailUrl
            : null,
        uploadStatus,
        privacyStatus,
      });
  } catch (error) {
    try {
      await youtubeClient.deleteVideo(
        accessToken,
        uploadedVideo.videoId
      );
    } catch {
      // Keep the original neutral persistence error. The remote resource
      // must be reviewed manually if compensation itself fails.
    }

    if (error?.code === "ER_DUP_ENTRY") {
      throw createYoutubeError(
        409,
        "VIDEO_ALREADY_EXISTS",
        "A video with this YouTube video ID already exists"
      );
    }

    throw createYoutubeError(
      500,
      "VIDEO_PERSISTENCE_FAILED",
      "The uploaded video could not be recorded"
    );
  }

  try {
    return await videoService.getVideoById(created.id);
  } catch {
    throw createYoutubeError(
      500,
      "VIDEO_PERSISTENCE_FAILED",
      "The uploaded video could not be recorded"
    );
  }
}

async function getVideoStatus(videoId) {
  const current =
    await videoRepository.findVideoById(videoId);
  if (!current) {
    throw new AppError(
      404,
      "VIDEO_NOT_FOUND",
      "The requested video does not exist"
    );
  }

  if (current.provider !== "YOUTUBE") {
    throw new AppError(
      400,
      "VIDEO_PROVIDER_NOT_YOUTUBE",
      "Only YouTube videos can be checked"
    );
  }

  const accessToken =
    await getAccessToken();
  let remoteVideo;
  try {
    remoteVideo =
      await youtubeClient.getVideo(
        accessToken,
        current.external_id
      );
  } catch (error) {
    throw mapYoutubeError(error, "status");
  }

  const uploadStatus =
    mapUploadStatus(remoteVideo);
  const privacyStatus =
    mapPrivacyStatus(remoteVideo.privacyStatus);
  const thumbnailUrl =
    isAllowedThumbnailUrl(
      remoteVideo.thumbnailUrl
    )
      ? remoteVideo.thumbnailUrl
      : current.thumbnail_url;

  try {
    const updated =
      await videoRepository.updateVideoProcessingStatus({
        videoId,
        uploadStatus,
        privacyStatus,
        thumbnailUrl,
      });
    if (!updated) {
      throw new Error("Video disappeared during status update");
    }
  } catch {
    throw createYoutubeError(
      500,
      "VIDEO_STATUS_PERSISTENCE_FAILED",
      "The YouTube video status could not be recorded"
    );
  }

  return {
    video: await videoService.getVideoById(videoId),
    uploadStatus,
    privacyStatus,
  };
}

module.exports = {
  createAuthorizationRequest,
  completeAuthorization,
  getConnectionStatus,
  uploadVideo,
  getVideoStatus,
  clearAccessTokenCache,
  mapUploadStatus,
  validateUploadInput,
};
