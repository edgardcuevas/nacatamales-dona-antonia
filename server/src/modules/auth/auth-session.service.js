const authSessionRepository = require(
  "./auth-session.repository"
);

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} = require("./token.service");

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

  await authSessionRepository.createSession({
    userId: user.id,
    refreshTokenHash,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
  };
}

module.exports = {
  createAuthSession,
};