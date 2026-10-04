const {
  successResponse,
} = require("../../shared/http-response");
const env = require("../../config/env");
const youtubeService = require("./youtube.service");
const {
  OAUTH_STATE_TTL_MS,
} = require("./youtube.constants");

const OAUTH_STATE_COOKIE = "youtube_oauth_state";
const OAUTH_COOKIE_PATH = "/api/youtube/oauth";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
  };
}

async function connectChannelController(
  request,
  response
) {
  const authorization =
    await youtubeService.createAuthorizationRequest(
      request.auth.userId
    );

  response.cookie(
    OAUTH_STATE_COOKIE,
    authorization.state,
    {
      ...getCookieOptions(),
      maxAge: OAUTH_STATE_TTL_MS,
    }
  );

  return successResponse(
    response,
    200,
    {
      authorizationUrl:
        authorization.authorizationUrl,
      expiresInSeconds:
        authorization.expiresInSeconds,
    },
    "YouTube authorization URL created successfully"
  );
}

async function oauthCallbackController(
  request,
  response
) {
  let connection;
  try {
    connection =
      await youtubeService.completeAuthorization({
        ...request.youtubeCallback,
        stateCookie:
          request.cookies?.[
            OAUTH_STATE_COOKIE
          ],
      });
  } catch (error) {
    response.clearCookie(
      OAUTH_STATE_COOKIE,
      getCookieOptions()
    );
    throw error;
  }

  response.clearCookie(
    OAUTH_STATE_COOKIE,
    getCookieOptions()
  );

  return successResponse(
    response,
    200,
    { connection },
    "YouTube channel connected successfully"
  );
}

async function channelStatusController(
  request,
  response
) {
  const connection =
    await youtubeService.getConnectionStatus();

  return successResponse(
    response,
    200,
    { connection },
    "YouTube channel status retrieved successfully"
  );
}

async function uploadVideoController(
  request,
  response
) {
  const video =
    await youtubeService.uploadVideo(
      request.youtubeUploadInput
    );

  return successResponse(
    response,
    201,
    { video },
    "Video uploaded successfully"
  );
}

async function getVideoStatusController(
  request,
  response
) {
  const result =
    await youtubeService.getVideoStatus(
      request.videoId
    );

  return successResponse(
    response,
    200,
    result,
    "Video status retrieved successfully"
  );
}

async function setVideoThumbnailController(
  request,
  response
) {
  const result =
    await youtubeService.setVideoThumbnail({
      ...request.youtubeThumbnailInput,
      videoId: request.videoId,
    });

  return successResponse(
    response,
    200,
    result,
    "The video thumbnail was updated successfully"
  );
}

async function revertVideoThumbnailController(
  request,
  response
) {
  const result =
    await youtubeService.revertVideoThumbnail(
      request.videoId
    );

  return successResponse(
    response,
    200,
    result,
    "The video thumbnail was restored successfully"
  );
}

async function deleteRemoteVideoController(
  request,
  response
) {
  const result =
    await youtubeService.deleteRemoteVideo(
      request.videoId
    );

  const message = result.alreadyDeleted
    ? "The video was already marked as deleted"
    : "The video was deleted from YouTube successfully";

  // The payload is built field by field instead of forwarded: whatever
  // the service returns, only the admin DTO and the three idempotency
  // flags can leave the server.
  return successResponse(
    response,
    200,
    {
      video: result.video,
      deleted: true,
      alreadyDeleted: result.alreadyDeleted,
      remoteAlreadyMissing:
        result.remoteAlreadyMissing,
    },
    message
  );
}

module.exports = {
  OAUTH_STATE_COOKIE,
  OAUTH_COOKIE_PATH,
  connectChannelController,
  oauthCallbackController,
  channelStatusController,
  uploadVideoController,
  getVideoStatusController,
  setVideoThumbnailController,
  revertVideoThumbnailController,
  deleteRemoteVideoController,
};
