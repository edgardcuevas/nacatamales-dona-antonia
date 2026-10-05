// Adapter level tests for a successful thumbnails.set response.
//
// This path had no coverage at all: the service tests replace the whole
// client, so normalizeThumbnailSetResponse was never executed against a
// real payload shape. It read payload.items[0].url while the provider
// returns nested variants, which turned every successful call into a
// false YOUTUBE_THUMBNAIL_FAILED.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  afterEach,
  mock,
} = require("node:test");
const { Readable } = require("node:stream");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "youtube_thumbnail_adapter_test",
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
  THUMBNAIL_RESPONSE_OPERATIONS,
} = require("../../src/config/youtube");

const VIDEO_ID = "aaaaaaaaaaa";
const HOST = "https://i.ytimg.com";

function variant(name, path = "hqdefault") {
  return {
    url: `${HOST}/vi/${VIDEO_ID}/${path}-${name}.jpg`,
    width: 1280,
    height: 720,
  };
}

// A response double that supports text() as well as json(), because the
// adapter now reads the body as text to tell an empty body from a
// malformed one.
function createResponse(
  body,
  { status = 200 } = {}
) {
  const text =
    typeof body === "string" ? body : JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

function stubFetch(response) {
  const calls = [];
  mock.method(globalThis, "fetch", async (
    url,
    options = {}
  ) => {
    calls.push({ url: String(url), options });
    return response;
  });
  return calls;
}

function createInput() {
  return {
    accessToken: "access-token",
    videoId: VIDEO_ID,
    fileStream: Readable.from([Buffer.alloc(8)]),
    fileSize: 8,
    contentType: "image/jpeg",
  };
}

afterEach(() => {
  mock.restoreAll();
});

test("a nested maxres variant is preferred", async () => {
  stubFetch(
    createResponse({
      kind: "youtube#thumbnailSetResponse",
      items: [
        {
          default: variant("default", "default"),
          medium: variant("medium", "mqdefault"),
          high: variant("high", "hqdefault"),
          standard: variant("standard", "sddefault"),
          maxres: variant("maxres", "maxresdefault"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.equal(
    result.thumbnailUrl,
    `${HOST}/vi/${VIDEO_ID}/maxresdefault-maxres.jpg`
  );
  assert.equal(result.width, 1280);
  assert.equal(result.height, 720);
});

test("without maxres the selection falls to standard", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          default: variant("default"),
          medium: variant("medium"),
          high: variant("high"),
          standard: variant("standard"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(
    result.thumbnailUrl,
    /-standard\.jpg$/
  );
});

test("without maxres and standard the selection falls to high", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          default: variant("default"),
          medium: variant("medium"),
          high: variant("high"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(result.thumbnailUrl, /-high\.jpg$/);
});

test("without maxres, standard and high the selection falls to medium", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          default: variant("default"),
          medium: variant("medium"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(result.thumbnailUrl, /-medium\.jpg$/);
});

test("only default is enough for a valid selection", async () => {
  stubFetch(
    createResponse({
      items: [{ default: variant("default") }],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(result.thumbnailUrl, /-default\.jpg$/);
});

test("an invalid variant is skipped and the next valid one is used", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          // Present but rejected: wrong host and a non string url.
          maxres: {
            url: "https://example.invalid/a.jpg",
            width: 1280,
            height: 720,
          },
          standard: { url: "" },
          high: variant("high"),
          medium: variant("medium"),
          default: variant("default"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(result.thumbnailUrl, /-high\.jpg$/);
});

test("the selection does not depend on the property order of the payload", async () => {
  const forwards = {
    maxres: variant("maxres"),
    standard: variant("standard"),
    high: variant("high"),
  };
  const reversed = {
    high: variant("high"),
    standard: variant("standard"),
    maxres: variant("maxres"),
  };

  for (const item of [forwards, reversed]) {
    mock.restoreAll();
    stubFetch(createResponse({ items: [item] }));

    const result =
      await youtubeClient.setVideoThumbnail(
        createInput()
      );

    assert.equal(
      result.thumbnailUrl,
      forwards.maxres.url,
      "maxres wins regardless of property order"
    );
  }
});

test("missing dimensions are normalized to null instead of failing", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          standard: {
            url: `${HOST}/vi/${VIDEO_ID}/sddefault.jpg`,
          },
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.equal(result.width, null);
  assert.equal(result.height, null);
});

test("a protocol that is not https is rejected", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          high: { url: "http://i.ytimg.com/vi/x/hq.jpg" },
          default: {
            url: `${HOST}/vi/${VIDEO_ID}/default.jpg`,
          },
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  // The insecure variant is skipped, not accepted.
  assert.match(
    result.thumbnailUrl,
    /default\.jpg$/
  );
});

test("a disallowed host is rejected even when it is the best variant", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          maxres: {
            url: "https://images.example.test/a.jpg",
          },
          high: variant("high"),
        },
      ],
    })
  );

  const result =
    await youtubeClient.setVideoThumbnail(
      createInput()
    );

  assert.match(result.thumbnailUrl, /-high\.jpg$/);
});

test("an absent items array is reported as an invalid response", async () => {
  stubFetch(
    createResponse({ kind: "youtube#thumbnailSetResponse" })
  );

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.ok(error instanceof YouTubeApiError);
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.INVALID
      );
      return true;
    }
  );
});

test("an empty items array is reported as an invalid response", async () => {
  stubFetch(createResponse({ items: [] }));

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.INVALID
      );
      return true;
    }
  );
});

test("a resource without any variant is reported as an invalid response", async () => {
  stubFetch(
    createResponse({ items: [{ kind: "youtube#thumbnail" }] })
  );

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.INVALID
      );
      return true;
    }
  );
});

test("variants carrying no URL at all are reported as an invalid response", async () => {
  stubFetch(
    createResponse({
      items: [{ maxres: {}, high: { width: 1 } }],
    })
  );

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.INVALID
      );
      return true;
    }
  );
});

test("a URL rejected by the host and protocol rules is reported apart", async () => {
  stubFetch(
    createResponse({
      items: [
        {
          maxres: { url: "https://evil.example.test/x.jpg" },
        },
      ],
    })
  );

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.URL_REJECTED
      );
      assert.equal(
        error.message.includes("evil.example.test"),
        false,
        "the rejected URL must not appear in the error"
      );
      return true;
    }
  );
});

test("an empty body is distinguished from a malformed one", async () => {
  stubFetch(createResponse(""));
  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.EMPTY
      );
      return true;
    }
  );

  mock.restoreAll();
  stubFetch(createResponse("   "));
  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.EMPTY
      );
      return true;
    }
  );

  mock.restoreAll();
  stubFetch(createResponse("{not json"));
  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.equal(
        error.operation,
        THUMBNAIL_RESPONSE_OPERATIONS.UNPARSEABLE
      );
      return true;
    }
  );
});

test("a valid response never leaks the provider payload into the error surface", async () => {
  stubFetch(
    createResponse({
      items: [{ maxres: { url: "https://secret.example.test/x" } }],
    })
  );

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      const text = `${error.message} ${error.stack}`;
      assert.equal(
        text.includes("secret.example.test"),
        false
      );
      assert.equal(
        text.includes("access-token"),
        false
      );
      return true;
    }
  );
});

test("the provider error branches keep working after the change", async () => {
  const cases = [
    { status: 400, reason: "invalidImage" },
    { status: 404, reason: "videoNotFound" },
    { status: 403, reason: "forbidden" },
    { status: 429, reason: "uploadRateLimitExceeded" },
    { status: 429, reason: "rateLimitExceeded" },
    { status: 500, reason: "internalError" },
  ];

  for (const { status, reason } of cases) {
    mock.restoreAll();
    stubFetch(
      createResponse(
        {
          error: {
            code: status,
            message: "a provider message that must not surface",
            errors: [{ reason }],
          },
        },
        { status }
      )
    );

    await assert.rejects(
      youtubeClient.setVideoThumbnail(createInput()),
      (error) => {
        assert.ok(error instanceof YouTubeApiError);
        assert.equal(error.status, status);
        assert.equal(error.reason, reason);
        assert.equal(
          error.message.includes(
            "must not surface"
          ),
          false
        );
        return true;
      }
    );
  }
});

test("a network failure still surfaces without an invented status", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    youtubeClient.setVideoThumbnail(createInput()),
    (error) => {
      assert.ok(!(error instanceof YouTubeApiError));
      return true;
    }
  );
});

test("the request itself is unchanged by the response fix", async () => {
  const calls = stubFetch(
    createResponse({
      items: [{ high: variant("high") }],
    })
  );

  await youtubeClient.setVideoThumbnail(createInput());

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(
    url.origin + url.pathname,
    "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
  );
  assert.equal(url.searchParams.get("videoId"), VIDEO_ID);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer access-token"
  );
  assert.equal(
    calls[0].options.headers["content-type"],
    "image/jpeg"
  );
});