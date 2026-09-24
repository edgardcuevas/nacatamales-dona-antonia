const AppError = require("../../errors/app-error");

const userRepository = require(
  "../users/user.repository"
);

const {
  USER_ROLE_VALUES,
} = require("../users/user.constants");

const authSessionRepository = require(
  "./auth-session.repository"
);

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} = require("./token.service");

function createInvalidRefreshTokenError() {
  return new AppError(
    401,
    "INVALID_REFRESH_TOKEN",
    "The refresh token is invalid or expired"
  );
}

function createInactiveUserError() {
  return new AppError(
    403,
    "USER_INACTIVE",
    "This user account is inactive"
  );
}

async function createAuthSession(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const refreshTokenPayload =
    verifyRefreshToken(refreshToken);

  const refreshTokenHash =
    hashRefreshToken(refreshToken);

  const expiresAt = new Date(
    refreshTokenPayload.exp * 1000
  );

  await authSessionRepository.withTransaction(
    async (connection) => {
      await authSessionRepository.createSession({
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        connection,
      });

      const lastLoginAtUpdated =
        await userRepository.updateLastLoginAtById({
          userId: user.id,
          connection,
        });

      if (!lastLoginAtUpdated) {
        throw createInactiveUserError();
      }
    }
  );

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

async function renewAuthSession(refreshToken) {
  let tokenPayload;

  try {
    tokenPayload = verifyRefreshToken(refreshToken);
  } catch {
    throw createInvalidRefreshTokenError();
  }

  const userId = Number(tokenPayload.sub);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw createInvalidRefreshTokenError();
  }

  const currentRefreshTokenHash =
    hashRefreshToken(refreshToken);

  const currentSession =
    await authSessionRepository.findSessionByRefreshTokenHash(
      currentRefreshTokenHash
    );

  if (
    !currentSession ||
    Number(currentSession.user_id) !== userId ||
    currentSession.revoked_at !== null ||
    new Date(currentSession.expires_at) <= new Date()
  ) {
    throw createInvalidRefreshTokenError();
  }

  const user = await userRepository.findUserById(userId);

  if (
    !user ||
    !user.is_active ||
    !USER_ROLE_VALUES.includes(user.role)
  ) {
    throw createInvalidRefreshTokenError();
  }

  const accessToken = generateAccessToken({
    id: user.id,
    role: user.role,
  });

  const newRefreshToken = generateRefreshToken({
    id: user.id,
  });

  const newRefreshTokenPayload =
    verifyRefreshToken(newRefreshToken);

  const newRefreshTokenHash =
    hashRefreshToken(newRefreshToken);

  const newRefreshTokenExpiresAt = new Date(
    newRefreshTokenPayload.exp * 1000
  );

  try {
    await authSessionRepository.rotateSession({
      currentSessionId: currentSession.id,
      userId: user.id,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt: newRefreshTokenExpiresAt,
    });
  } catch (error) {
    if (
      error.code ===
      "AUTH_SESSION_ROTATION_CONFLICT"
    ) {
      throw createInvalidRefreshTokenError();
    }

    throw error;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    accessToken,
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt:
      newRefreshTokenExpiresAt,
  };
}

async function revokeAllAuthSessions(userId) {
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1
  ) {
    return 0;
  }

  return authSessionRepository
    .revokeAllActiveSessionsByUserId(userId);
}

async function revokeAuthSession(refreshToken) {
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length === 0
  ) {
    return false;
  }

  const refreshTokenHash =
    hashRefreshToken(refreshToken);

  return authSessionRepository
    .revokeSessionByRefreshTokenHash(
      refreshTokenHash
    );
}

module.exports = {
  createAuthSession,
  renewAuthSession,
  revokeAllAuthSessions,
  revokeAuthSession,
};