// Scope configuration for the YouTube OAuth consent flow.
//
// videos.delete needs youtube.force-ssl, which the previous list did not
// include. These tests pin the exact list, because both the consent
// screen and the stored scope string are compared against it: a silent
// drop or reorder would be invisible until a reauthorization produced a
// refresh token without the scope.
const test = require("node:test");
const assert = require("node:assert/strict");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "youtube_oauth_scopes_test",
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
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
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

const {
  youtubeClient,
  YOUTUBE_SCOPES,
  YOUTUBE_SCOPE_UPLOAD,
  YOUTUBE_SCOPE_READONLY,
  YOUTUBE_SCOPE_FORCE_SSL,
} = require("../../src/config/youtube");

const EXPECTED_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
]);

test("the scope list contains exactly the three expected scopes in a stable order", () => {
  assert.deepEqual(
    [...YOUTUBE_SCOPES],
    [...EXPECTED_SCOPES]
  );
});

test("the scope list has no duplicates", () => {
  assert.equal(
    new Set(YOUTUBE_SCOPES).size,
    YOUTUBE_SCOPES.length
  );

  const joined = YOUTUBE_SCOPES.join(" ");
  const tokens = joined.split(" ").filter(Boolean);
  assert.equal(
    new Set(tokens).size,
    tokens.length
  );
});

test("youtube.upload and youtube.readonly are kept for their existing consumers", () => {
  assert.equal(
    YOUTUBE_SCOPE_UPLOAD,
    "https://www.googleapis.com/auth/youtube.upload"
  );
  assert.equal(
    YOUTUBE_SCOPE_READONLY,
    "https://www.googleapis.com/auth/youtube.readonly"
  );
  assert.ok(YOUTUBE_SCOPES.includes(YOUTUBE_SCOPE_UPLOAD));
  assert.ok(YOUTUBE_SCOPES.includes(YOUTUBE_SCOPE_READONLY));
});

test("youtube.force-ssl is the scope that authorizes videos.delete", () => {
  assert.equal(
    YOUTUBE_SCOPE_FORCE_SSL,
    "https://www.googleapis.com/auth/youtube.force-ssl"
  );
  assert.ok(
    YOUTUBE_SCOPES.includes(YOUTUBE_SCOPE_FORCE_SSL)
  );
  // The partner scope is explicitly not requested.
  assert.equal(
    YOUTUBE_SCOPES.some((scope) =>
      scope.includes("youtubepartner")
    ),
    false
  );
});

test("the scope list is frozen so no consumer can mutate it", () => {
  assert.equal(Object.isFrozen(YOUTUBE_SCOPES), true);
  assert.throws(() => {
    YOUTUBE_SCOPES.push("https://example.test/scope");
  });
});

test("the authorization URL requests all three scopes and keeps the offline consent parameters", () => {
  const url = new URL(
    youtubeClient.getAuthorizationUrl(
      "a".repeat(64)
    )
  );

  assert.equal(
    url.searchParams.get("scope"),
    EXPECTED_SCOPES.join(" ")
  );

  const requested =
    url.searchParams
      .get("scope")
      .split(" ")
      .filter(Boolean);

  assert.deepEqual(requested, [
    ...EXPECTED_SCOPES,
  ]);
  assert.ok(
    requested.includes(YOUTUBE_SCOPE_FORCE_SSL)
  );
  assert.ok(requested.includes(YOUTUBE_SCOPE_UPLOAD));
  assert.ok(requested.includes(YOUTUBE_SCOPE_READONLY));

  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  // Required so Google accepts a superset of the previously granted
  // scopes instead of rejecting it as invalid_scope.
  assert.equal(
    url.searchParams.get("include_granted_scopes"),
    "true"
  );
  assert.equal(
    url.searchParams.get("redirect_uri"),
    process.env.GOOGLE_REDIRECT_URI
  );
  assert.equal(
    url.searchParams.get("state"),
    "a".repeat(64)
  );
});

test("the authorization URL never exposes the client secret", () => {
  const url = new URL(
    youtubeClient.getAuthorizationUrl(
      "a".repeat(64)
    )
  );

  assert.equal(
    url.toString().includes(
      process.env.GOOGLE_CLIENT_SECRET
    ),
    false
  );
  assert.equal(
    url.searchParams.has("client_secret"),
    false
  );
});

test("the authorization URL keeps the approved hosts and no extra parameter", () => {
  const url = new URL(
    youtubeClient.getAuthorizationUrl(
      "a".repeat(64)
    )
  );

  assert.equal(
    url.origin + url.pathname,
    "https://accounts.google.com/o/oauth2/v2/auth"
  );
  assert.deepEqual(
    [...url.searchParams.keys()].sort(),
    [
      "access_type",
      "client_id",
      "include_granted_scopes",
      "prompt",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ]
  );
});

test("a short state is refused before any URL is built", () => {
  assert.throws(() =>
    youtubeClient.getAuthorizationUrl("short")
  );
});

test("the configured list is only a fallback for the scope Google returns", async () => {
  // The callback persists the scope string Google sends, not this list,
  // so a reauthorization records exactly what was granted. The list is
  // used only when the provider omits the field.
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return {
          access_token: "an-access-token",
          refresh_token: "a-refresh-token",
          expires_in: 3600,
          scope: [
            YOUTUBE_SCOPE_UPLOAD,
            YOUTUBE_SCOPE_READONLY,
            YOUTUBE_SCOPE_FORCE_SSL,
          ].join(" "),
        };
      },
    };
  };

  try {
    const exchanged =
      await youtubeClient.exchangeAuthorizationCode(
        "an-authorization-code"
      );

    assert.equal(
      exchanged.scope,
      EXPECTED_SCOPES.join(" ")
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url.startsWith("https://oauth2.googleapis.com/token"),
      true
    );
    assert.equal(
      calls[0].options.method,
      "POST"
    );
    assert.equal(
      calls[0].options.body.includes(
        "redirect_uri="
      ),
      true
    );
    assert.equal(
      calls[0].options.body.includes(
        "grant_type=authorization_code"
      ),
      true
    );

    // A provider response without the field falls back to the list, and
    // that fallback now includes force-ssl.
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return {
          access_token: "an-access-token",
          refresh_token: "a-refresh-token",
          expires_in: 3600,
        };
      },
    });

    const fallback =
      await youtubeClient.exchangeAuthorizationCode(
        "an-authorization-code"
      );

    assert.equal(
      fallback.scope,
      EXPECTED_SCOPES.join(" ")
    );
    assert.ok(
      fallback.scope.includes(YOUTUBE_SCOPE_FORCE_SSL)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("videos.delete still keeps its adapter behavior after the scope change", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 204,
      headers: { get: () => null },
      async json() {
        throw new SyntaxError("no body");
      },
    };
  };

  try {
    await youtubeClient.deleteVideo(
      "an-access-token",
      "aaaaaaaaaaa"
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "DELETE");
    assert.equal(
      new URL(calls[0].url).pathname,
      "/youtube/v3/videos"
    );
    assert.equal(
      calls[0].options.headers.authorization,
      "Bearer an-access-token"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});