const test = require("node:test");
const assert = require("node:assert/strict");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "auth_middleware_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
});

for (const [name, value] of Object.entries(
  TEST_ENVIRONMENT
)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const jwt = require("jsonwebtoken");

const env = require("../../src/config/env");
const AppError = require("../../src/errors/app-error");
const authenticate = require(
  "../../src/middlewares/authenticate.middleware"
);

const {
  generateRefreshToken,
} = require("../../src/modules/auth/token.service");

const ACCESS_TOKEN_ISSUER =
  "nacatamales-dona-antonia-api";
const ACCESS_TOKEN_AUDIENCE =
  "nacatamales-dona-antonia-admin";

const PUBLIC_AUTHENTICATION_MESSAGES = Object.freeze({
  AUTHENTICATION_REQUIRED:
    "Authentication is required",
  INVALID_AUTHORIZATION_HEADER:
    "The authorization header is invalid",
  INVALID_ACCESS_TOKEN:
    "The access token is invalid or expired",
});

function signAccessToken({
  subject,
  role,
  jwtid,
  expiresIn = null,
  expiresAt,
  payload = {},
} = {}) {
  const claims = { ...payload };

  if (role !== undefined) {
    claims.role = role;
  }

  const options = {
    algorithm: "HS256",
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  };

  if (subject !== undefined) {
    options.subject = subject;
  }

  if (jwtid !== undefined) {
    options.jwtid = jwtid;
  }

  if (
    expiresIn !== undefined &&
    expiresIn !== null
  ) {
    options.expiresIn = expiresIn;
  }

  if (expiresAt !== undefined) {
    claims.exp = expiresAt;
  }

  return jwt.sign(
    claims,
    env.jwt.accessTokenSecret,
    options
  );
}

function executeMiddleware(authorization, requestOverrides = {}) {
  const request = {
    headers: {},
    body: {},
    params: {},
    query: {},
    ...requestOverrides,
  };

  if (authorization !== undefined) {
    request.headers.authorization = authorization;
  }

  let nextCalls = 0;
  let nextError;

  authenticate(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });

  return {
    request,
    nextCalls,
    nextError,
  };
}

function assertAuthenticationError(
  execution,
  expectedCode
) {
  assert.equal(execution.nextCalls, 1);
  assert.ok(execution.nextError instanceof AppError);
  assert.equal(execution.nextError.statusCode, 401);
  assert.equal(execution.nextError.code, expectedCode);
  assert.equal(
    execution.nextError.message,
    PUBLIC_AUTHENTICATION_MESSAGES[expectedCode]
  );
  assert.equal(execution.request.auth, undefined);
}

test("rejects a missing Authorization header", () => {
  const execution = executeMiddleware();

  assertAuthenticationError(
    execution,
    "AUTHENTICATION_REQUIRED"
  );
});

test("rejects an empty Authorization header", () => {
  const execution = executeMiddleware("   ");

  assertAuthenticationError(
    execution,
    "AUTHENTICATION_REQUIRED"
  );
});

test("rejects a non-Bearer authorization scheme", () => {
  const execution = executeMiddleware("Basic abc123");

  assertAuthenticationError(
    execution,
    "INVALID_AUTHORIZATION_HEADER"
  );
});

test("rejects Bearer without a token", () => {
  const execution = executeMiddleware("Bearer");

  assertAuthenticationError(
    execution,
    "INVALID_AUTHORIZATION_HEADER"
  );
});

test("rejects an Authorization header with extra parts", () => {
  const execution = executeMiddleware(
    "Bearer access-token extra"
  );

  assertAuthenticationError(
    execution,
    "INVALID_AUTHORIZATION_HEADER"
  );
});

test("accepts a valid access token", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
    jwtid: "access-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assert.equal(execution.nextCalls, 1);
  assert.equal(execution.nextError, undefined);
  assert.deepEqual(
    Object.keys(execution.request.auth).sort(),
    ["role", "tokenId", "userId"]
  );
  assert.equal(execution.request.auth.userId, 42);
  assert.equal(execution.request.auth.role, "ADMIN");
  assert.equal(
    execution.request.auth.tokenId,
    "access-token-id"
  );
  assert.equal(
    Object.isFrozen(execution.request.auth),
    true
  );
});

test("builds identity from the token and ignores request data", () => {
  const accessToken = signAccessToken({
    subject: "7",
    role: "EDITOR",
    jwtid: "editor-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`,
    {
      body: {
        userId: 999,
        role: "ADMIN",
      },
      params: {
        userId: 999,
        role: "ADMIN",
      },
      query: {
        userId: 999,
        role: "ADMIN",
      },
    }
  );

  assert.equal(execution.nextCalls, 1);
  assert.equal(execution.nextError, undefined);
  assert.equal(execution.request.auth.userId, 7);
  assert.equal(execution.request.auth.role, "EDITOR");
  assert.equal(
    execution.request.auth.tokenId,
    "editor-token-id"
  );
});

test("rejects a tampered access token", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
    jwtid: "access-token-id",
  });
  const [header, payload, signature] =
    accessToken.split(".");
  const tamperedSignature =
    `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  const tamperedToken = [
    header,
    payload,
    tamperedSignature,
  ].join(".");
  const execution = executeMiddleware(
    `Bearer ${tamperedToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("rejects an expired access token", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
    jwtid: "expired-token-id",
    expiresIn: undefined,
    expiresAt: Math.floor(Date.now() / 1000) - 60,
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("does not accept a refresh token as an access token", () => {
  const refreshToken = generateRefreshToken({
    id: 42,
  });
  const execution = executeMiddleware(
    `Bearer ${refreshToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("rejects a non-numeric access token subject", () => {
  const accessToken = signAccessToken({
    subject: "not-a-number",
    role: "ADMIN",
    jwtid: "access-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("rejects non-positive and unsafe access token subjects", () => {
  for (const subject of [
    "0",
    "-1",
    "9007199254740992",
  ]) {
    const accessToken = signAccessToken({
      subject,
      role: "ADMIN",
      jwtid: "access-token-id",
    });
    const execution = executeMiddleware(
      `Bearer ${accessToken}`
    );

    assertAuthenticationError(
      execution,
      "INVALID_ACCESS_TOKEN"
    );
  }
});

test("rejects an unsupported access token role", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "OWNER",
    jwtid: "access-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("rejects an access token without jti", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assertAuthenticationError(
    execution,
    "INVALID_ACCESS_TOKEN"
  );
});

test("calls next only once for a valid access token", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
    jwtid: "access-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken}`
  );

  assert.equal(execution.nextCalls, 1);
  assert.equal(execution.nextError, undefined);
});

test("does not continue the request for invalid credentials", () => {
  const accessToken = signAccessToken({
    subject: "42",
    role: "ADMIN",
    jwtid: "access-token-id",
  });
  const execution = executeMiddleware(
    `Bearer ${accessToken.slice(0, -1)}x`
  );

  assert.equal(execution.nextCalls, 1);
  assert.ok(execution.nextError instanceof AppError);
  assert.equal(execution.request.auth, undefined);
});
