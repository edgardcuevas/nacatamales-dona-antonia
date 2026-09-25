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

module.exports = {
  OAUTH_STATE_COOKIE,
  OAUTH_COOKIE_PATH,
  connectChannelController,
  oauthCallbackController,
  channelStatusController,
  uploadVideoController,
  getVideoStatusController,
};
