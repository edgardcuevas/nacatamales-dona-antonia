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
  DB_NAME: "youtube_adapter_test",
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
  YOUTUBE_SCOPES,
} = require("../../src/config/youtube");

function createResponse(
  body,
  {
    status = 200,
    headers = {},
  } = {}
) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(
      ([key, value]) => [
        key.toLowerCase(),
        value,
      ]
    )
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(
          name.toLowerCase()
        ) ?? null;
      },
    },
    async json() {
      return body;
    },
  };
}

afterEach(() => {
  mock.restoreAll();
});

test("YouTube authorization URL uses offline access, state, and approved scopes without exposing the client secret", () => {
  const state = "a".repeat(64);
  const url = new URL(
    youtubeClient.getAuthorizationUrl(state)
  );

  assert.equal(
    url.origin + url.pathname,
    "https://accounts.google.com/o/oauth2/v2/auth"
  );
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(
    url.searchParams.get("scope"),
    YOUTUBE_SCOPES.join(" ")
  );
  assert.equal(
    url.searchParams.get("client_id"),
    "test_google_client_id"
  );
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/youtube/oauth/callback"
  );
  assert.equal(
    url.toString().includes("test_google_client_secret"),
    false
  );
});

test("OAuth code exchange and refresh send form requests and return only parsed token data", async () => {
  const calls = [];
  mock.method(
    global,
    "fetch",
    async (url, options) => {
      calls.push({ url, options });
      return createResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "scope-a scope-b",
      });
    }
  );

  const exchanged =
    await youtubeClient.exchangeAuthorizationCode(
      "authorization-code"
    );
  const refreshed =
    await youtubeClient.refreshAccessToken(
      "refresh-token"
    );

  assert.equal(exchanged.accessToken, "access-token");
  assert.equal(exchanged.refreshToken, "refresh-token");
  assert.equal(refreshed.accessToken, "access-token");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(
      call.url,
      "https://oauth2.googleapis.com/token"
    );
    assert.equal(
      call.options.method,
      "POST"
    );
    assert.match(
      call.options.body,
      /client_id=test_google_client_id/
    );
    assert.doesNotMatch(
      call.options.body,
      /access-token/
    );
  }
});

test("channel verification reads the authenticated channel and rejects a configured mismatch", async () => {
  mock.method(
    global,
    "fetch",
    async () =>
      createResponse({
        items: [
          {
            id: "UC1234567890123456789012",
            snippet: {
              title: "Official channel",
            },
          },
        ],
      })
  );

  const channel =
    await youtubeClient.getAuthenticatedChannel(
      "access-token"
    );
  assert.equal(channel.channelId, "UC1234567890123456789012");
  assert.equal(channel.title, "Official channel");

  mock.restoreAll();
  mock.method(
    global,
    "fetch",
    async () =>
      createResponse({
        items: [
          {
            id: "UC9999999999999999999999",
            snippet: {
              title: "Wrong channel",
            },
          },
        ],
      })
  );

  await assert.rejects(
    youtubeClient.getAuthenticatedChannel(
      "access-token"
    ),
    (error) => {
      assert.equal(error.operation, "channel-mismatch");
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test("videos.insert uses a resumable session, streams the file, requests unlisted, and reads generated metadata", async () => {
  const calls = [];
  const mp4Bytes = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypisom"),
    Buffer.alloc(4),
  ]);
  const fileStream = Readable.from(mp4Bytes);
  mock.method(
    global,
    "fetch",
    async (url, options) => {
      calls.push({ url, options });

      if (url.includes("uploadType=resumable")) {
        return createResponse(
          {},
          {
            status: 200,
            headers: {
              location:
                "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-123",
            },
          }
        );
      }

      if (
        url ===
        "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-123"
      ) {
        for await (const chunk of options.body) {
          assert.equal(
            Buffer.isBuffer(chunk),
            true
          );
        }
        return createResponse({
          id: "aaaaaaaaaaa",
          snippet: {
            title: "QA upload",
            description: "Description",
          },
          status: {
            privacyStatus: "unlisted",
            uploadStatus: "uploaded",
          },
        });
      }

      return createResponse({
        items: [
          {
            id: "aaaaaaaaaaa",
            snippet: {
              title: "QA upload",
              description: "Description",
              thumbnails: {
                high: {
                  url: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
                },
              },
            },
            status: {
              privacyStatus: "unlisted",
              uploadStatus: "processed",
            },
            processingDetails: {
              processingStatus: "processing",
            },
          },
        ],
      });
    }
  );

  const result =
    await youtubeClient.uploadVideo({
      accessToken: "access-token",
      title: "QA upload",
      description: "Description",
      fileStream,
      fileSize: 16,
      contentType: "video/mp4",
    });

  assert.equal(result.videoId, "aaaaaaaaaaa");
  assert.equal(
    result.thumbnailUrl,
    "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg"
  );
  assert.equal(result.privacyStatus, "UNLISTED");
  assert.equal(calls.length, 3);
  assert.match(
    calls[0].url,
    /notifySubscribers=false/
  );
  assert.notEqual(
    calls[1].options.body,
    fileStream
  );
  assert.equal(
    typeof calls[1].options.body.pipe,
    "function"
  );
  assert.equal(
    calls[1].options.duplex,
    "half"
  );
  assert.equal(
    calls[1].options.headers["content-range"],
    "bytes 0-15/16"
  );
  assert.equal(
    JSON.parse(calls[0].options.body).status
      .privacyStatus,
    "unlisted"
  );
});

test("upload rejects a non-MP4 byte stream instead of trusting the client content type", async () => {
  mock.method(
    global,
    "fetch",
    async (url, options) => {
      if (url.includes("uploadType=resumable")) {
        return createResponse(
          {},
          {
            headers: {
              location:
                "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-invalid",
            },
          }
        );
      }
      for await (const chunk of options.body) {
        void chunk;
      }
      return createResponse(
        { id: "aaaaaaaaaaa" },
        { status: 200 }
      );
    }
  );

  await assert.rejects(
    youtubeClient.uploadVideo({
      accessToken: "access-token",
      title: "QA upload",
      description: "Description",
      fileStream: Readable.from(
        Buffer.from("not-an-mp4-file")
      ),
      fileSize: 15,
      contentType: "video/mp4",
    }),
    (error) => {
      assert.equal(
        error instanceof Error,
        true
      );
      assert.equal(
        error.message.includes("not-an-mp4-file"),
        false
      );
      return true;
    }
  );
});
test("video status and deletion use the official API and hide provider error bodies", async () => {
  const calls = [];
  mock.method(
    global,
    "fetch",
    async (url, options) => {
      calls.push({ url, options });
      if (options.method === "DELETE") {
        return createResponse(
          { error: "secret-provider-detail" },
          { status: 500 }
        );
      }
      return createResponse({
        items: [
          {
            id: "aaaaaaaaaaa",
            snippet: {
              title: "QA",
              description: null,
              thumbnails: {},
            },
            status: {
              privacyStatus: "unlisted",
              uploadStatus: "processed",
            },
            processingDetails: {
              processingStatus: "succeeded",
            },
          },
        ],
      });
    }
  );

  const status =
    await youtubeClient.getVideo(
      "access-token",
      "aaaaaaaaaaa"
    );
  assert.equal(status.processingStatus, "succeeded");

  await assert.rejects(
    youtubeClient.deleteVideo(
      "access-token",
      "aaaaaaaaaaa"
    ),
    (error) => {
      assert.equal(error.status, 500);
      assert.equal(
        error.message.includes("secret-provider-detail"),
        false
      );
      return true;
    }
  );
  assert.equal(calls[1].options.method, "DELETE");
});
