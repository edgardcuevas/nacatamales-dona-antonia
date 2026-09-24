const jwt = require("jsonwebtoken");

const AppError = require("../errors/app-error");

const {
  USER_ROLE_VALUES,
} = require("../modules/users/user.constants");

const {
  verifyAccessToken,
} = require("../modules/auth/token.service");

const SUBJECT_PATTERN = /^\d+$/;

function createAuthenticationRequiredError() {
  return new AppError(
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );
}

function createInvalidAuthorizationHeaderError() {
  return new AppError(
    401,
    "INVALID_AUTHORIZATION_HEADER",
    "The authorization header is invalid"
  );
}

function createInvalidAccessTokenError() {
  return new AppError(
    401,
    "INVALID_ACCESS_TOKEN",
    "The access token is invalid or expired"
  );
}

function parseAuthorizationHeader(authorization) {
  if (authorization === undefined) {
    throw createAuthenticationRequiredError();
  }

  if (typeof authorization === "string") {
    if (authorization.trim() === "") {
      throw createAuthenticationRequiredError();
    }
  } else {
    throw createInvalidAuthorizationHeaderError();
  }

  const parts = authorization.trim().split(/\s+/);

  if (
    parts.length !== 2 ||
    parts[0].toLowerCase() !== "bearer" ||
    parts[1].length === 0
  ) {
    throw createInvalidAuthorizationHeaderError();
  }

  return parts[1];
}

function getUserId(subject) {
  if (
    (typeof subject !== "string" &&
      typeof subject !== "number") ||
    (typeof subject === "string" &&
      !SUBJECT_PATTERN.test(subject))
  ) {
    return null;
  }

  const userId = Number(subject);

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    return null;
  }

  return userId;
}

function getRequestAuth(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const userId = getUserId(payload.sub);
  const role = payload.role;
  const tokenId = payload.jti;

  if (
    userId === null ||
    !USER_ROLE_VALUES.includes(role) ||
    typeof tokenId !== "string" ||
    tokenId.trim() === ""
  ) {
    return null;
  }

  return Object.freeze({
    userId,
    role,
    tokenId,
  });
}

function isJsonWebTokenError(error) {
  return (
    error instanceof jwt.JsonWebTokenError ||
    error instanceof jwt.TokenExpiredError
  );
}

function authenticate(request, response, next) {
  let accessToken;

  try {
    accessToken = parseAuthorizationHeader(
      request.headers?.authorization
    );
  } catch (error) {
    return next(error);
  }

  let payload;

  try {
    payload = verifyAccessToken(accessToken);
  } catch (error) {
    if (isJsonWebTokenError(error)) {
      return next(createInvalidAccessTokenError());
    }

    return next(error);
  }

  const requestAuth = getRequestAuth(payload);

  if (!requestAuth) {
    return next(createInvalidAccessTokenError());
  }

  request.auth = requestAuth;

  return next();
}

module.exports = authenticate;
