const crypto = require("node:crypto");

const AppError = require("../../errors/app-error");
const videoRepository = require("../videos/video.repository");
const videoService = require("../videos/video.service");
const {
  YOUTUBE_DEFAULT_THUMBNAIL_SOURCE,
  CUSTOM_THUMBNAIL_SOURCE,
  VIDEO_UPLOAD_STATUSES,
} = require("../videos/video.constants");
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
  MAX_VIDEO_THUMBNAIL_BYTES,
  MAX_YOUTUBE_DESCRIPTION_LENGTH,
  ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES,
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

function createThumbnailError() {
  return createYoutubeError(
    502,
    "YOUTUBE_THUMBNAIL_FAILED",
    "The video thumbnail could not be updated on YouTube"
  );
}

function createThumbnailNotReadyError() {
  return createYoutubeError(
    409,
    "VIDEO_THUMBNAIL_NOT_READY",
    "The video must finish processing before its thumbnail can be changed"
  );
}

function createThumbnailNotFoundError() {
  return new AppError(
    404,
    "VIDEO_NOT_FOUND",
    "The requested video does not exist"
  );
}

function createThumbnailUnsupportedProviderError() {
  return createYoutubeError(
    400,
    "VIDEO_PROVIDER_NOT_YOUTUBE",
    "Only YouTube videos can receive a custom thumbnail"
  );
}

function mapThumbnailError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof YouTubeApiError) {
    if (error.reason === "invalidImage") {
      return createYoutubeError(
        400,
        "INVALID_VIDEO_THUMBNAIL_IMAGE",
        "The image could not be accepted as a YouTube thumbnail"
      );
    }

    if (error.reason === "videoNotFound") {
      return createThumbnailNotFoundError();
    }

    if (
      error.reason === "uploadRateLimitExceeded" ||
      error.status === 429
    ) {
      return createYoutubeError(
        429,
        "YOUTUBE_THUMBNAIL_RATE_LIMITED",
        "Too many thumbnail changes were requested for this channel"
      );
    }

    if (error.status === 403) {
      return createYoutubeError(
        409,
        "YOUTUBE_THUMBNAIL_NOT_PERMITTED",
        "The connected channel is not allowed to change this thumbnail"
      );
    }

    if (error.status === 400) {
      return createYoutubeError(
        400,
        "INVALID_VIDEO_THUMBNAIL",
        "The thumbnail request was rejected by YouTube"
      );
    }
  }

  return createThumbnailError();
}

function createChannelMismatchError() {
  return createYoutubeError(
    403,
    "YOUTUBE_CHANNEL_MISMATCH",
    "The authorized Google account does not belong to the configured YouTube channel"
  );
}

function createRemoteIdInvalidError() {
  return createYoutubeError(
    400,
    "VIDEO_REMOTE_ID_INVALID",
    "The stored YouTube video ID is not usable"
  );
}

function createLocalStateInconsistentError() {
  return createYoutubeError(
    409,
    "VIDEO_LOCAL_STATE_INCONSISTENT",
    "The stored video state is inconsistent and cannot be deleted"
  );
}

function createDeleteNotPermittedError() {
  return createYoutubeError(
    409,
    "YOUTUBE_DELETE_NOT_PERMITTED",
    "The connected channel is not allowed to delete this video"
  );
}

function createDeleteRateLimitedError() {
  return createYoutubeError(
    429,
    "YOUTUBE_DELETE_RATE_LIMITED",
    "Too many deletion requests were sent to YouTube"
  );
}

function createDeleteFailedError() {
  return createYoutubeError(
    502,
    "YOUTUBE_DELETE_FAILED",
    "The video could not be deleted on YouTube"
  );
}

function createRemoteDeletedLocalUpdateFailedError() {
  return createYoutubeError(
    500,
    "YOUTUBE_VIDEO_DELETED_LOCAL_UPDATE_FAILED",
    "The video was deleted on YouTube but the local state could not be recorded"
  );
}

// Only the 404 is meaningful for this operation, and it is handled by
// the caller before this mapper runs. Every other provider failure maps
// to its own stable code so a caller can tell a retryable condition
// apart from a permanent one.
function mapRemoteDeleteError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof YouTubeApiError) {
    if (error.status === 401) {
      return createYoutubeError(
        409,
        "YOUTUBE_REAUTH_REQUIRED",
        "The YouTube channel must be reconnected"
      );
    }

    if (
      error.status === 429 ||
      error.reason === "quotaExceeded" ||
      error.reason === "rateLimitExceeded"
    ) {
      return createDeleteRateLimitedError();
    }

    if (error.status === 403) {
      return createDeleteNotPermittedError();
    }
  }

  return createDeleteFailedError();
}

function normalizeChannelId(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Compared as trimmed strings, never against the channel title.
function channelIdsMatch(left, right) {
  const first = normalizeChannelId(left);
  const second = normalizeChannelId(right);

  return first !== "" && first === second;
}

// Operational breadcrumb for an irreversible action. Deliberately
// limited to the local id, the event and two booleans: no title, url,
// external id, channel id, token or provider payload ever reaches it.
function logRemoteDeletionEvent(event, videoId, extra = {}) {
  const suffix = Object.entries(extra)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  console.log(
    `[youtube] remote-deletion event=${event} videoId=${videoId}` +
      (suffix === "" ? "" : ` ${suffix}`)
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

  const existingConnection =
    await youtubeConnectionRepository.getConnection();
  if (existingConnection) {
    const existingChannelId =
      typeof existingConnection.channel_id === "string"
        ? existingConnection.channel_id.trim()
        : "";
    const authorizedChannelId =
      typeof channel.channelId === "string"
        ? channel.channelId.trim()
        : "";

    if (
      existingChannelId.length === 0 ||
      authorizedChannelId.length === 0 ||
      existingChannelId !== authorizedChannelId
    ) {
      throw createChannelMismatchError();
    }
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

  videoService.assertRemoteVideoAvailable(current);

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

  // A custom thumbnail is an explicit editorial decision, so the
  // provider synchronization must not silently replace it with the
  // frame YouTube auto-generated. This is what keeps a freshly
  // chosen thumbnail from reverting during propagation.
  const isCustomThumbnail =
    current.thumbnail_source ===
    CUSTOM_THUMBNAIL_SOURCE;
  const thumbnailUrl = isCustomThumbnail
    ? undefined
    : isAllowedThumbnailUrl(
        remoteVideo.thumbnailUrl
      )
      ? remoteVideo.thumbnailUrl
      : current.thumbnail_url;

  // Writing updated_at on every poll would move the video's public
  // updatedAt without any real change, invalidating the thumbnail
  // cache version for visitors for no reason. The UPDATE is therefore
  // skipped when the provider reported exactly what is already
  // stored, and the same DTO is returned either way.
  const hasProcessingChanges =
    uploadStatus !== (current.upload_status ?? "READY") ||
    privacyStatus !== (current.privacy_status ?? "UNLISTED") ||
    (thumbnailUrl !== undefined &&
      thumbnailUrl !== (current.thumbnail_url ?? null));

  if (hasProcessingChanges) {
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
  }

  return {
    video: await videoService.getVideoById(videoId),
    uploadStatus,
    privacyStatus,
  };
}

async function setVideoThumbnail({
  videoId,
  fileStream,
  fileSize,
  contentType,
}) {
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_VIDEO_THUMBNAIL_BYTES
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_THUMBNAIL_SIZE",
      "The thumbnail file size is not allowed"
    );
  }

  if (
    !ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES.includes(
      contentType
    )
  ) {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_THUMBNAIL_TYPE",
      "Only JPEG and PNG thumbnails are accepted"
    );
  }

  if (!fileStream || typeof fileStream.pipe !== "function") {
    throw createYoutubeError(
      400,
      "INVALID_VIDEO_THUMBNAIL",
      "A thumbnail image is required"
    );
  }

  const current =
    await videoRepository.findVideoById(videoId);
  if (!current) {
    throw createThumbnailNotFoundError();
  }

  if (current.provider !== "YOUTUBE") {
    throw createThumbnailUnsupportedProviderError();
  }

  videoService.assertRemoteVideoAvailable(current);

  if (
    (current.upload_status ?? "READY") !== "READY"
  ) {
    throw createThumbnailNotReadyError();
  }

  const accessToken =
    await getAccessToken();

  let providerThumbnail;
  try {
    providerThumbnail =
      await youtubeClient.setVideoThumbnail({
        accessToken,
        videoId: current.external_id,
        fileStream,
        fileSize,
        contentType,
      });
  } catch (error) {
    throw mapThumbnailError(error);
  }

  // The URL is taken from the response of thumbnails.set instead of
  // from a follow-up read, because the provider can still report the
  // previous frame during the propagation window.
  try {
    const updated =
      await videoRepository.updateVideoProcessingStatus({
        videoId,
        thumbnailUrl: providerThumbnail.thumbnailUrl,
        thumbnailSource: CUSTOM_THUMBNAIL_SOURCE,
      });
    if (!updated) {
      throw new Error(
        "Video disappeared during thumbnail update"
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw createYoutubeError(
      500,
      "VIDEO_THUMBNAIL_PERSISTENCE_FAILED",
      "The chosen thumbnail could not be recorded"
    );
  }

  return {
    video: await videoService.getVideoById(videoId),
    thumbnailUrl: providerThumbnail.thumbnailUrl,
  };
}

async function revertVideoThumbnail(videoId) {
  const current =
    await videoRepository.findVideoById(videoId);
  if (!current) {
    throw createThumbnailNotFoundError();
  }

  if (current.provider !== "YOUTUBE") {
    throw createThumbnailUnsupportedProviderError();
  }

  videoService.assertRemoteVideoAvailable(current);

  // Reverting only needs the provider's own current frame, so it
  // does not require the channel to be connected.
  let providerThumbnailUrl = null;
  try {
    const accessToken =
      await getAccessToken();
    const remoteVideo =
      await youtubeClient.getVideo(
        accessToken,
        current.external_id
      );
    if (isAllowedThumbnailUrl(remoteVideo.thumbnailUrl)) {
      providerThumbnailUrl = remoteVideo.thumbnailUrl;
    }
  } catch {
    // Leaving the stored URL is preferable to failing the revert
    // when the provider is temporarily unreachable.
  }

  try {
    const updated =
      await videoRepository.updateVideoProcessingStatus({
        videoId,
        thumbnailUrl: providerThumbnailUrl,
        thumbnailSource: YOUTUBE_DEFAULT_THUMBNAIL_SOURCE,
      });
    if (!updated) {
      throw new Error("Video disappeared during revert");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw createYoutubeError(
      500,
      "VIDEO_THUMBNAIL_PERSISTENCE_FAILED",
      "The thumbnail could not be restored"
    );
  }

  return {
    video: await videoService.getVideoById(videoId),
    thumbnailUrl: providerThumbnailUrl,
  };
}

async function deleteRemoteVideo(videoId) {
  const current =
    await videoRepository.findVideoById(videoId);
  if (!current) {
    throw new AppError(
      404,
      "VIDEO_NOT_FOUND",
      "The requested video does not exist"
    );
  }

  // Every local precondition is checked before YouTube is contacted, so
  // a request that can never succeed costs no provider quota.
  if (current.provider !== "YOUTUBE") {
    throw new AppError(
      400,
      "VIDEO_PROVIDER_NOT_YOUTUBE",
      "Only YouTube videos can be checked"
    );
  }

  if (
    typeof current.external_id !== "string" ||
    current.external_id.trim() === ""
  ) {
    throw createRemoteIdInvalidError();
  }

  if (
    !VIDEO_UPLOAD_STATUSES.includes(
      current.upload_status ?? "READY"
    )
  ) {
    throw createLocalStateInconsistentError();
  }

  if (current.upload_status === "DELETED") {
    // A DELETED row without a deletion date is inconsistent. The date
    // is never invented here.
    if (
      current.remote_deleted_at === null ||
      current.remote_deleted_at === undefined
    ) {
      throw createLocalStateInconsistentError();
    }

    // Already marked: a second request is a safe no-op. YouTube is not
    // contacted and the original date is never replaced.
    logRemoteDeletionEvent(
      "already-deleted",
      videoId
    );

    return {
      video: await videoService.getVideoById(
        videoId
      ),
      deleted: true,
      alreadyDeleted: true,
      remoteAlreadyMissing: true,
    };
  }

  const connection =
    await getConnectionOrThrow();
  const accessToken =
    await getAccessToken();

  let remoteAlreadyMissing = false;
  let ownerChannelId = null;

  try {
    const owner =
      await youtubeClient.getVideoOwner(
        accessToken,
        current.external_id
      );
    ownerChannelId = owner.channelId;
  } catch (error) {
    if (
      error instanceof YouTubeApiError &&
      error.status === 404
    ) {
      remoteAlreadyMissing = true;
      logRemoteDeletionEvent(
        "remote-missing",
        videoId
      );
    } else {
      throw mapRemoteDeleteError(error);
    }
  }

  if (!remoteAlreadyMissing) {
    if (
      !channelIdsMatch(
        ownerChannelId,
        connection.channel_id
      )
    ) {
      throw createChannelMismatchError();
    }

    logRemoteDeletionEvent("attempt", videoId);

    try {
      await youtubeClient.deleteVideo(
        accessToken,
        current.external_id
      );
    } catch (error) {
      // The resource disappeared between the probe and the delete.
      if (
        error instanceof YouTubeApiError &&
        error.status === 404
      ) {
        remoteAlreadyMissing = true;
      } else {
        throw mapRemoteDeleteError(error);
      }
    }

    logRemoteDeletionEvent(
      "remote-success",
      videoId
    );
  }

  // YouTube first, local state second. The two cannot share a
  // transaction, so a local failure is reported as its own condition:
  // the remote delete already happened and must never be described as
  // failed. A retry finds the resource missing and finishes the job.
  const deletedAt = new Date();
  try {
    await videoRepository
      .markVideoAsRemoteDeleted({
        videoId,
        remoteDeletedAt: deletedAt,
      });
  } catch {
    logRemoteDeletionEvent(
      "local-update-failed",
      videoId,
      { remoteAlreadyMissing }
    );

    throw createRemoteDeletedLocalUpdateFailedError();
  }

  logRemoteDeletionEvent("local-success", videoId);

  return {
    video: await videoService.getVideoById(videoId),
    deleted: true,
    alreadyDeleted: false,
    remoteAlreadyMissing,
  };
}

module.exports = {
  createAuthorizationRequest,
  completeAuthorization,
  getConnectionStatus,
  uploadVideo,
  getVideoStatus,
  setVideoThumbnail,
  revertVideoThumbnail,
  deleteRemoteVideo,
  clearAccessTokenCache,
  mapUploadStatus,
  validateUploadInput,
  mapThumbnailError,
  mapRemoteDeleteError,
  channelIdsMatch,
};
