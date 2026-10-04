// Adapter level tests for videos.delete and the ownership probe that
// precedes it. No real network call is ever made: fetch is replaced by a
// recorder for every case.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "youtube_remote_delete_adapter_test",
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
  YouTubeApiError,
} = require("../../src/config/youtube");

const API_ORIGIN = "https://www.googleapis.com";
const API_PATH = "/youtube/v3";

const EXISTING_ID = "aaaaaaaaaaa";
const MISSING_ID = "bbbbbbbbbbb";
const CHANNEL = "UC1234567890123456789012";

function createResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() {
      if (body === undefined) {
        throw new SyntaxError("no body");
      }

      return body;
    },
  };
}

function stubFetch(handler) {
  const calls = [];

  mock.method(globalThis, "fetch", async (
    url,
    options = {}
  ) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls.length);
  });

  return calls;
}

function ownerPayload(
  videoId = EXISTING_ID,
  channelId = CHANNEL
) {
  return {
    items: [
      {
        id: videoId,
        snippet: {
          channelId,
          title: "a title that must never be logged",
        },
      },
    ],
  };
}

afterEach(() => {
  mock.restoreAll();
});

after(() => {
  delete globalThis.fetch;
});

test("videos.delete issues a DELETE to the videos endpoint with bearer authorization", async () => {
  const calls = stubFetch(() =>
    // The provider answers a successful delete with no content.
    createResponse(undefined, 204)
  );

  await youtubeClient.deleteVideo(
    "access-token",
    EXISTING_ID
  );

  assert.equal(calls.length, 1);

  const url = new URL(calls[0].url);
  assert.equal(url.origin, API_ORIGIN);
  assert.equal(url.pathname, `${API_PATH}/videos`);
  assert.equal(url.searchParams.get("id"), EXISTING_ID);
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer access-token"
  );
  assert.equal(
    calls[0].options.headers.authorization.includes(
      "access-token"
    ),
    true
  );
});

test("videos.delete treats a 404 as the idempotent outcome instead of an error", async () => {
  stubFetch(() => createResponse({}, 404));

  await assert.doesNotReject(
    youtubeClient.deleteVideo(
      "access-token",
      MISSING_ID
    )
  );
});

test("videos.delete normalizes 403, 401, 429 and 5xx without leaking the provider body", async () => {
  const cases = [
    { status: 403 },
    { status: 401 },
    { status: 429 },
    { status: 500 },
    { status: 503 },
  ];

  for (const { status } of cases) {
    mock.restoreAll();
    stubFetch(() =>
      createResponse(
        {
          error: {
            message: "secret-provider-detail",
            errors: [
              { reason: "forbidden" },
            ],
          },
        },
        status
      )
    );

    await assert.rejects(
      youtubeClient.deleteVideo(
        "access-token",
        EXISTING_ID
      ),
      (error) => {
        assert.ok(error instanceof YouTubeApiError);
        assert.equal(error.status, status);
        assert.equal(
          error.message.includes(
            "secret-provider-detail"
          ),
          false,
          `status ${status} must not carry the provider body`
        );
        assert.equal(
          error.message.includes("access-token"),
          false
        );
        return true;
      }
    );
  }
});

test("videos.delete surfaces a network failure without inventing a provider status", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    youtubeClient.deleteVideo(
      "access-token",
      EXISTING_ID
    ),
    (error) => {
      assert.ok(!(error instanceof YouTubeApiError));
      return true;
    }
  );
});

test("videos.delete rejects a malformed token or video id before any request", async () => {
  const calls = stubFetch(() => createResponse({}));

  const attempts = [
    ["", EXISTING_ID],
    ["access-token", "short"],
    ["access-token", "way-too-long-video-id"],
    ["access-token", ""],
  ];

  for (const [token, videoId] of attempts) {
    await assert.rejects(
      youtubeClient.deleteVideo(token, videoId),
      YouTubeApiError
    );
  }

  assert.deepEqual(calls, []);
});

test("getVideoOwner asks for a single part and returns only the identifiers", async () => {
  const calls = stubFetch(() =>
    createResponse(ownerPayload())
  );

  const owner = await youtubeClient.getVideoOwner(
    "access-token",
    EXISTING_ID
  );

  const url = new URL(calls[0].url);
  assert.equal(url.origin, API_ORIGIN);
  assert.equal(url.pathname, `${API_PATH}/videos`);
  assert.equal(url.searchParams.get("id"), EXISTING_ID);
  assert.equal(url.searchParams.get("part"), "snippet");
  assert.equal(
    calls[0].options.method,
    undefined,
    "the probe is a plain GET"
  );
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer access-token"
  );

  assert.deepEqual(owner, {
    videoId: EXISTING_ID,
    channelId: CHANNEL,
  });
});

test("getVideoOwner reports a missing resource as 404 and never as a provider error", async () => {
  // An empty items array is how the API reports "gone".
  const emptyItems = stubFetch(() =>
    createResponse({ items: [] })
  );

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      MISSING_ID
    ),
    (error) => {
      assert.ok(error instanceof YouTubeApiError);
      assert.equal(error.operation, "video-owner");
      assert.equal(error.status, 404);
      return true;
    }
  );
  assert.equal(emptyItems.length, 1);

  mock.restoreAll();
  stubFetch(() => createResponse({}, 404));

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      MISSING_ID
    ),
    (error) => {
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test("getVideoOwner keeps a provider 403 distinct from a missing resource", async () => {
  stubFetch(() => createResponse({}, 403));

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      EXISTING_ID
    ),
    (error) => {
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test("getVideoOwner rejects a payload whose owner channel is unusable", async () => {
  stubFetch(() =>
    createResponse({
      items: [
        {
          id: EXISTING_ID,
          snippet: { channelId: "not-a-channel" },
        },
      ],
    })
  );

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      EXISTING_ID
    ),
    (error) => {
      assert.equal(error.status, 502);
      return true;
    }
  );
});

test("getVideoOwner rejects a payload that answers with a different id", async () => {
  stubFetch(() =>
    createResponse(ownerPayload(MISSING_ID))
  );

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      EXISTING_ID
    ),
    (error) => {
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test("getVideoOwner rejects invalid input before any request", async () => {
  const calls = stubFetch(() => createResponse({}));

  await assert.rejects(
    youtubeClient.getVideoOwner("", EXISTING_ID),
    YouTubeApiError
  );
  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      "bad"
    ),
    YouTubeApiError
  );

  assert.deepEqual(calls, []);
});

test("getVideoOwner normalizes quota, auth, server and network failures", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    mock.restoreAll();
    stubFetch(() =>
      createResponse({ error: { message: "secret" } }, status)
    );

    await assert.rejects(
      youtubeClient.getVideoOwner(
        "access-token",
        EXISTING_ID
      ),
      (error) => {
        assert.equal(error.operation, "video-owner");
        assert.equal(error.status, status);
        assert.equal(
          error.message.includes("secret"),
          false
        );
        return true;
      }
    );
  }

  mock.restoreAll();
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    youtubeClient.getVideoOwner(
      "access-token",
      EXISTING_ID
    ),
    (error) => {
      assert.ok(!(error instanceof YouTubeApiError));
      return true;
    }
  );
});