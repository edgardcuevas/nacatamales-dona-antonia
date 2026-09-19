const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const env = require("../../config/env");

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "nacatamales-dona-antonia-api";
const JWT_ACCESS_AUDIENCE =
  "nacatamales-dona-antonia-admin";
const JWT_REFRESH_AUDIENCE =
  "nacatamales-dona-antonia-refresh";

function generateAccessToken(user) {
  return jwt.sign(
    {
      role: user.role,
    },
    env.jwt.accessTokenSecret,
    {
      algorithm: JWT_ALGORITHM,
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
      expiresIn: env.jwt.accessTokenTtl,
      issuer: JWT_ISSUER,
      audience: JWT_ACCESS_AUDIENCE,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(
    token,
    env.jwt.accessTokenSecret,
    {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_ACCESS_AUDIENCE,
    }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {},
    env.jwt.refreshTokenSecret,
    {
      algorithm: JWT_ALGORITHM,
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
      expiresIn: env.jwt.refreshTokenTtl,
      issuer: JWT_ISSUER,
      audience: JWT_REFRESH_AUDIENCE,
    }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(
    token,
    env.jwt.refreshTokenSecret,
    {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_REFRESH_AUDIENCE,
    }
  );
}

function hashRefreshToken(token) {
  return crypto
    .createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
};