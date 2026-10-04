const test = require("node:test");
const assert = require("node:assert/strict");
const { after, afterEach, mock } = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "youtube_reconnection_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
  IMAGEKIT_PUBLIC_KEY: "test_public_key",
  IMAGEKIT_PRIVATE_KEY: "test_private_key",
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "http://localhost:3000/api/youtube/oauth/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
});

for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
  process.env[name] = value;
}
delete process.env.YOUTUBE_CHANNEL_ID;

const AppError = require("../../src/errors/app-error");
const { youtubeClient } = require("../../src/config/youtube");
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const youtubeStateRepository = require(
  "../../src/modules/youtube/youtube-state.repository"
);
const { decryptRefreshToken } = require(
  "../../src/modules/youtube/youtube-token-crypto"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const pool = require("../../src/database/pool");

const STATE = "a".repeat(64);
const ACCESS_TOKEN = "test-access-token-not-for-output";
const REFRESH_TOKEN = "test-refresh-token-not-for-output";
const OTHER_REFRESH_TOKEN = "old-refresh-token-not-for-output";
const EXPECTED_CHANNEL_ID = "UC1234567890123456789012";
const OTHER_CHANNEL_ID = "UC9999999999999999999999";

function createExistingConnection(channelId = EXPECTED_CHANNEL_ID) {
  return {
    id: 1,
    channel_id: channelId,
    channel_title: "Stored title",
    encrypted_refresh_token: "unchanged-encrypted-value",
    scopes: "old-scope",
    token_expires_at: new Date("2026-01-01T00:00:00Z"),
    connected_at: new Date("2025-01-01T00:00:00Z"),
    updated_at: new Date("2025-01-02T00:00:00Z"),
  };
}

function mockAuthorization({
  existingConnection = null,
  channelId = EXPECTED_CHANNEL_ID,
  channelTitle = "Authorized title",
  tokenResponse = {},
  channelError = null,
} = {}) {
  const calls = {
    upsert: [],
    exchange: 0,
    channel: 0,
  };

  mock.method(
    youtubeStateRepository,
    "consumeOAuthState",
    async () => ({ accepted: true, reason: null })
  );
  mock.method(
    youtubeClient,
    "exchangeAuthorizationCode",
    async () => {
      calls.exchange += 1;
      return {
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiresIn: 3600,
        scope: "new-scope",
        ...tokenResponse,
      };
    }
  );
  mock.method(
    youtubeClient,
    "getAuthenticatedChannel",
    async () => {
      calls.channel += 1;
      if (channelError) {
        throw channelError;
      }
      return { channelId, title: channelTitle };
    }
  );
  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => existingConnection
  );
  mock.method(
    youtubeConnectionRepository,
    "upsertConnection",
    async (input) => {
      calls.upsert.push(input);
      return {
        channel_id: input.channelId,
        channel_title: input.channelTitle,
        connected_at: new Date("2025-01-01T00:00:00Z"),
        updated_at: new Date("2026-01-01T00:00:00Z"),
      };
    }
  );

  return calls;
}

async function completeAuthorization() {
  return youtubeService.completeAuthorization({
    code: "test-authorization-code",
    state: STATE,
    stateCookie: STATE,
  });
}

function assertChannelMismatch(error) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "YOUTUBE_CHANNEL_MISMATCH");
  const safeError = `${error.message} ${error.stack}`;
  for (const sensitiveValue of [
    EXPECTED_CHANNEL_ID,
    OTHER_CHANNEL_ID,
    ACCESS_TOKEN,
    REFRESH_TOKEN,
    "test_google_client_secret",
  ]) {
    assert.equal(safeError.includes(sensitiveValue), false);
  }
  return true;
}

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
  youtubeService.clearAccessTokenCache();
});

test("first connection without an existing row proceeds to upsert", async () => {
  const calls = mockAuthorization();

  const connection = await completeAuthorization();

  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].channelId, EXPECTED_CHANNEL_ID);
  assert.equal(connection.connected, true);
});

test("reconnection to the same normalized channel replaces token data through the normal upsert", async () => {
  const calls = mockAuthorization({
    existingConnection: createExistingConnection(
      ` ${EXPECTED_CHANNEL_ID} `
    ),
  });

  await completeAuthorization();

  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].channelId, EXPECTED_CHANNEL_ID);
  assert.equal(calls.upsert[0].channelTitle, "Authorized title");
  assert.equal(calls.upsert[0].scopes, "new-scope");
  assert.notEqual(
    calls.upsert[0].encryptedRefreshToken,
    "unchanged-encrypted-value"
  );
  assert.equal(
    decryptRefreshToken(calls.upsert[0].encryptedRefreshToken),
    REFRESH_TOKEN
  );
  assert.ok(calls.upsert[0].tokenExpiresAt instanceof Date);
});

test("reconnection to another channel is rejected before upsert without disclosing sensitive data", async () => {
  const original = createExistingConnection(EXPECTED_CHANNEL_ID);
  const originalSnapshot = structuredClone(original);
  const calls = mockAuthorization({
    existingConnection: original,
    channelId: OTHER_CHANNEL_ID,
  });

  await assert.rejects(completeAuthorization(), assertChannelMismatch);

  assert.equal(calls.upsert.length, 0);
  assert.deepEqual(original, originalSnapshot);
});

test("existing connection with an invalid channel_id fails closed", async () => {
  const calls = mockAuthorization({
    existingConnection: createExistingConnection(null),
  });

  await assert.rejects(completeAuthorization(), assertChannelMismatch);

  assert.equal(calls.upsert.length, 0);
});

test("configured channel mismatch keeps the existing rejection before connection lookup or upsert", async () => {
  const { YouTubeApiError } = require("../../src/config/youtube");
  const calls = mockAuthorization({
    existingConnection: createExistingConnection(),
    channelError: new YouTubeApiError("channel-mismatch", 403),
  });
  const getConnection = youtubeConnectionRepository.getConnection;

  await assert.rejects(completeAuthorization(), assertChannelMismatch);

  assert.equal(getConnection.mock.callCount(), 0);
  assert.equal(calls.upsert.length, 0);
});

test("a reauthorization persists the three granted scopes, force-ssl included", async () => {
  const {
    YOUTUBE_SCOPE_UPLOAD,
    YOUTUBE_SCOPE_READONLY,
    YOUTUBE_SCOPE_FORCE_SSL,
  } = require("../../src/config/youtube");

  const granted = [
    YOUTUBE_SCOPE_UPLOAD,
    YOUTUBE_SCOPE_READONLY,
    YOUTUBE_SCOPE_FORCE_SSL,
  ].join(" ");

  const calls = mockAuthorization({
    existingConnection: createExistingConnection(),
    tokenResponse: { scope: granted },
  });

  await completeAuthorization();

  assert.equal(calls.upsert.length, 1);

  // The callback records what Google granted, not the configured list,
  // so the stored value is the authoritative one.
  assert.equal(calls.upsert[0].scopes, granted);

  const persisted = calls.upsert[0].scopes
    .split(" ")
    .filter(Boolean);

  assert.equal(persisted.length, 3);
  assert.equal(new Set(persisted).size, 3);
  assert.ok(
    persisted.includes(YOUTUBE_SCOPE_UPLOAD)
  );
  assert.ok(
    persisted.includes(YOUTUBE_SCOPE_READONLY)
  );
  assert.ok(
    persisted.includes(YOUTUBE_SCOPE_FORCE_SSL)
  );
});

test("the persisted scope string never travels with a token in the connection DTO", async () => {
  const {
    YOUTUBE_SCOPES,
  } = require("../../src/config/youtube");

  const calls = mockAuthorization({
    existingConnection: createExistingConnection(),
    tokenResponse: {
      scope: YOUTUBE_SCOPES.join(" "),
    },
  });

  const logged = [];
  mock.method(console, "log", (line) => {
    logged.push(String(line));
  });

  const connection = await completeAuthorization();

  // The response shape is unchanged and carries no scope field.
  assert.deepEqual(
    Object.keys(connection).sort(),
    [
      "channelId",
      "channelTitle",
      "connected",
      "connectedAt",
      "updatedAt",
    ]
  );
  assert.equal(
    JSON.stringify(connection).includes("googleapis.com/auth"),
    false
  );

  // The refresh token is persisted, but no scope appears in any output.
  assert.ok(
    calls.upsert[0].encryptedRefreshToken.length > 0
  );
  const loggedText = logged.join("\n");
  assert.equal(
    loggedText.includes(ACCESS_TOKEN),
    false
  );
  assert.equal(
    loggedText.includes(REFRESH_TOKEN),
    false
  );
  assert.equal(
    loggedText.includes("googleapis.com/auth"),
    false
  );
});