const env = require("../../config/env");
const AppError = require("../../errors/app-error");

const {
  successResponse,
} = require("../../shared/http-response");

const {
  validateLoginInput,
} = require("./auth.validator");

const {
  login,
} = require("./auth.service");

const {
  renewAuthSession,
  revokeAllAuthSessions,
  revokeAuthSession,
} = require("./auth-session.service");

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

function getRefreshTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    path: "/api/auth",
  };
}

function setRefreshTokenCookie(
  response,
  refreshToken,
  expiresAt
) {
  response.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    {
      ...getRefreshTokenCookieOptions(),
      expires: expiresAt,
    }
  );
}

function clearRefreshTokenCookie(response) {
  response.clearCookie(
    REFRESH_TOKEN_COOKIE_NAME,
    getRefreshTokenCookieOptions()
  );
}

async function loginController(request, response) {
  const credentials = validateLoginInput(request.body);

  const {
    user,
    accessToken,
    refreshToken,
    refreshTokenExpiresAt,
  } = await login(credentials);

  setRefreshTokenCookie(
    response,
    refreshToken,
    refreshTokenExpiresAt
  );

  return successResponse(
    response,
    200,
    {
      user,
      accessToken,
    },
    "Login successful"
  );
}

async function refreshController(request, response) {
  const refreshToken =
    request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (
    typeof refreshToken !== "string" ||
    refreshToken.length === 0
  ) {
    throw new AppError(
      401,
      "REFRESH_TOKEN_REQUIRED",
      "A refresh token is required"
    );
  }

  const {
    user,
    accessToken,
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt,
  } = await renewAuthSession(refreshToken);

  setRefreshTokenCookie(
    response,
    newRefreshToken,
    refreshTokenExpiresAt
  );

  return successResponse(
    response,
    200,
    {
      user,
      accessToken,
    },
    "Session renewed successfully"
  );
}

async function logoutController(request, response) {
  const refreshToken =
    request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  await revokeAuthSession(refreshToken);

  clearRefreshTokenCookie(response);

  return successResponse(
    response,
    200,
    null,
    "Logout successful"
  );
}

async function logoutAllController(request, response) {
  // Logout-all revokes refresh sessions; issued access tokens remain valid until exp.
  await revokeAllAuthSessions(
    request.currentUser.id
  );

  clearRefreshTokenCookie(response);

  return successResponse(
    response,
    200,
    null,
    "All sessions closed successfully"
  );
}

function meController(request, response) {
  const {
    id,
    email,
    role,
  } = request.currentUser;

  return successResponse(
    response,
    200,
    {
      user: {
        id,
        email,
        role,
      },
    },
    "Authenticated user retrieved successfully"
  );
}

module.exports = {
  loginController,
  refreshController,
  logoutController,
  logoutAllController,
  meController,
};