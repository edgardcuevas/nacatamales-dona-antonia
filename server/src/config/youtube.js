const { Transform } = require("node:stream");

const env = require("./env");
const {
  MAX_VIDEO_THUMBNAIL_BYTES,
  ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES,
} = require("../modules/youtube/youtube.constants");

const OAUTH_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL =
  "https://oauth2.googleapis.com/token";
const YOUTUBE_API_URL =
  "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_THUMBNAIL_SET_URL =
  "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
const YOUTUBE_VIDEO_ID_PATTERN =
  /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID_PATTERN =
  /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_THUMBNAIL_HOSTS = new Set([
  "i.ytimg.com",
  "img.youtube.com",
  "yt3.ggpht.com",
]);

// The order below is stable and asserted by a test, because both the
// consent screen and the stored scope string are compared against it.
//
// - youtube.upload    grants videos.insert
// - youtube.readonly  grants channels and the videos.list probes used by
//                     the status poll and the deletion ownership check
// - youtube.force-ssl grants videos.delete
//
// youtube.force-ssl is added without dropping the other two: they have
// established consumers, and include_granted_scopes=true makes Google
// reject a request whose scope list is not a superset of what was
// already granted. Adding a scope does not grant it by itself: the
// channel has to be reauthorized before a stored refresh token can use
// videos.delete.
const YOUTUBE_SCOPE_UPLOAD =
  "https://www.googleapis.com/auth/youtube.upload";
const YOUTUBE_SCOPE_READONLY =
  "https://www.googleapis.com/auth/youtube.readonly";
const YOUTUBE_SCOPE_FORCE_SSL =
  "https://www.googleapis.com/auth/youtube.force-ssl";

const YOUTUBE_SCOPES = Object.freeze([
  YOUTUBE_SCOPE_UPLOAD,
  YOUTUBE_SCOPE_READONLY,
  YOUTUBE_SCOPE_FORCE_SSL,
]);

function createValidatedVideoStream(
  source,
  expectedSize
) {
  let bytesRead = 0;
  let header = Buffer.alloc(0);
  let headerChecked = false;

  const monitored = new Transform({
    transform(chunk, encoding, callback) {
      const buffer =
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, encoding);

      bytesRead += buffer.length;
      if (
        bytesRead > expectedSize ||
        bytesRead > 2 * 1024 * 1024 * 1024
      ) {
        callback(
          new Error("Video stream exceeds the allowed size")
        );
        return;
      }

      if (!headerChecked) {
        header = Buffer.concat([
          header,
          buffer.subarray(0, 12 - header.length),
        ]);
        if (header.length >= 12) {
          headerChecked = true;
          if (
            header.subarray(4, 8).toString("ascii") !==
            "ftyp"
          ) {
            callback(
              new Error("The uploaded file is not an MP4 video")
            );
            return;
          }
        }
      }

      callback(null, buffer);
    },
    flush(callback) {
      if (
        bytesRead !== expectedSize ||
        !headerChecked
      ) {
        callback(
          new Error("Video stream length or format is invalid")
        );
        return;
      }
      callback();
    },
  });

  if (typeof source.once === "function") {
    source.once("error", (error) => {
      monitored.destroy(error);
    });
  }
  source.pipe(monitored);
  return monitored;
}

function createBoundedImageStream(
  source,
  expectedSize
) {
  let bytesRead = 0;

  const monitored = new Transform({
    transform(chunk, encoding, callback) {
      const buffer =
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, encoding);

      bytesRead += buffer.length;
      if (bytesRead > expectedSize) {
        callback(
          new Error("Thumbnail stream exceeds the allowed size")
        );
        return;
      }

      callback(null, buffer);
    },
    flush(callback) {
      if (bytesRead !== expectedSize) {
        callback(
          new Error("Thumbnail stream length is invalid")
        );
        return;
      }
      callback();
    },
  });

  if (typeof source.once === "function") {
    source.once("error", (error) => {
      monitored.destroy(error);
    });
  }
  source.pipe(monitored);
  return monitored;
}

class YouTubeApiError extends Error {
  constructor(operation, status = 502) {
    super(`YouTube provider operation failed: ${operation}`);
    this.name = "YouTubeApiError";
    this.operation = operation;
    this.status = status;
  }
}

async function readProviderJson(
  response,
  operation
) {
  if (!response.ok) {
    throw new YouTubeApiError(
      operation,
      response.status
    );
  }

  try {
    return await response.json();
  } catch {
    throw new YouTubeApiError(operation, 502);
  }
}

function createTokenBody(values) {
  return new URLSearchParams(values).toString();
}

function requireTokenValue(
  payload,
  field,
  operation
) {
  if (
    !payload ||
    typeof payload[field] !== "string" ||
    payload[field].length === 0
  ) {
    throw new YouTubeApiError(operation, 502);
  }

  return payload[field];
}

function requireVideoId(
  payload,
  operation
) {
  const id = payload?.id ?? payload?.items?.[0]?.id;
  if (
    typeof id !== "string" ||
    !YOUTUBE_VIDEO_ID_PATTERN.test(id)
  ) {
    throw new YouTubeApiError(operation, 502);
  }
  return id;
}

function normalizePrivacyStatus(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase();
  return ["PRIVATE", "UNLISTED", "PUBLIC"].includes(
    normalized
  )
    ? normalized
    : null;
}

function isAllowedThumbnailUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      YOUTUBE_THUMBNAIL_HOSTS.has(
        url.hostname.toLowerCase()
      ) &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443")
    );
  } catch {
    return false;
  }
}

// Highest quality first. The order is fixed, so the result never
// depends on the property order of the provider payload, and a missing
// variant simply falls through to the next one.
const THUMBNAIL_VARIANT_PREFERENCE = Object.freeze([
  "maxres",
  "standard",
  "high",
  "medium",
  "default",
]);

// Both thumbnail-bearing payloads are composite resources with nested
// variants: the video snippet (snippet.thumbnails) and the item returned
// by thumbnails.set, which carries the variants directly.
function selectThumbnailVariant(resource) {
  for (const key of THUMBNAIL_VARIANT_PREFERENCE) {
    const variant = resource?.[key];
    if (!variant || typeof variant !== "object") {
      continue;
    }

    const url = variant.url;
    if (typeof url !== "string" || url === "") {
      continue;
    }

    if (!isAllowedThumbnailUrl(url)) {
      continue;
    }

    return {
      key,
      url,
      width: Number.isSafeInteger(variant.width)
        ? variant.width
        : null,
      height: Number.isSafeInteger(variant.height)
        ? variant.height
        : null,
    };
  }

  return null;
}

function hasAnyVariantUrl(resource) {
  return THUMBNAIL_VARIANT_PREFERENCE.some(
    (key) => {
      const url = resource?.[key]?.url;
      return (
        typeof url === "string" && url !== ""
      );
    }
  );
}

function pickThumbnail(snippet) {
  return (
    selectThumbnailVariant(snippet?.thumbnails)
      ?.url ?? null
  );
}

function normalizeVideo(
  payload,
  fallback = {}
) {
  const item = payload?.items?.[0] ?? payload ?? {};
  const snippet = item.snippet ?? {};
  const status = item.status ?? {};
  const processingDetails =
    item.processingDetails ?? {};

  return {
    videoId: requireVideoId(item, "normalize-video"),
    title: snippet.title ?? fallback.title ?? null,
    description:
      snippet.description ?? fallback.description ?? null,
    url:
      typeof item.id === "string"
        ? `https://www.youtube.com/watch?v=${item.id}`
        : fallback.url ?? null,
    thumbnailUrl:
      pickThumbnail(snippet) ??
      fallback.thumbnailUrl ??
      null,
    privacyStatus:
      normalizePrivacyStatus(
        status.privacyStatus
      ) ??
      normalizePrivacyStatus(
        fallback.privacyStatus
      ) ??
      "UNLISTED",
    uploadStatus:
      status.uploadStatus ??
      fallback.uploadStatus ??
      null,
    processingStatus:
      processingDetails.processingStatus ??
      fallback.processingStatus ??
      null,
  };
}

// The reason is read only to pick a stable application code. Provider
// messages are never forwarded to the client.
function getProviderErrorReason(payload) {
  const reason =
    payload?.error?.errors?.[0]?.reason;
  return typeof reason === "string"
    ? reason
    : null;
}

async function readThumbnailErrorResponse(
  response,
  operation
) {
  if (response.ok) {
    return null;
  }

  const reason = await response
    .json()
    .then(getProviderErrorReason)
    .catch(() => null);

  const error = new YouTubeApiError(
    operation,
    response.status
  );
  error.reason = reason;
  return error;
}

// Distinct operations so an unusable success response is never
// reported as the same opaque 502. The public codes live in
// mapThumbnailError; none of these carry the payload or the URL.
const THUMBNAIL_RESPONSE_OPERATIONS = Object.freeze({
  EMPTY: "thumbnail-response-empty",
  UNPARSEABLE: "thumbnail-response-unparseable",
  INVALID: "thumbnail-response-invalid",
  URL_REJECTED: "thumbnail-url-rejected",
});

// A successful thumbnails.set returns a composite resource whose
// variants are nested (default, medium, high, standard, maxres). It has
// no top-level url, so reading payload.items[0].url rejects every real
// response with a false failure.
function normalizeThumbnailSetResponse(payload) {
  if (!payload || typeof payload !== "object") {
    throw new YouTubeApiError(
      THUMBNAIL_RESPONSE_OPERATIONS.INVALID,
      502
    );
  }

  if (!Array.isArray(payload.items)) {
    throw new YouTubeApiError(
      THUMBNAIL_RESPONSE_OPERATIONS.INVALID,
      502
    );
  }

  const item = payload.items[0];
  if (!item || typeof item !== "object") {
    throw new YouTubeApiError(
      THUMBNAIL_RESPONSE_OPERATIONS.INVALID,
      502
    );
  }

  const selected = selectThumbnailVariant(item);
  if (selected === null) {
    // A variant carrying a URL that the host and protocol rules reject
    // is a different condition from a resource with no variants at all.
    throw new YouTubeApiError(
      hasAnyVariantUrl(item)
        ? THUMBNAIL_RESPONSE_OPERATIONS.URL_REJECTED
        : THUMBNAIL_RESPONSE_OPERATIONS.INVALID,
      502
    );
  }

  return {
    thumbnailUrl: selected.url,
    width: selected.width,
    height: selected.height,
  };
}

const youtubeClient = {
  getAuthorizationUrl(state) {
    if (
      typeof state !== "string" ||
      state.length < 32
    ) {
      throw new YouTubeApiError("authorization-url", 400);
    }

    const query = new URLSearchParams({
      client_id: env.youtube.clientId,
      redirect_uri: env.youtube.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: YOUTUBE_SCOPES.join(" "),
      state,
    });

    return `${OAUTH_AUTHORIZATION_URL}?${query.toString()}`;
  },

  async exchangeAuthorizationCode(code) {
    if (
      typeof code !== "string" ||
      code.length === 0 ||
      code.length > 2048
    ) {
      throw new YouTubeApiError("authorization-code", 400);
    }

    const response = await fetch(
      OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },
        body: createTokenBody({
          code,
          client_id: env.youtube.clientId,
          client_secret: env.youtube.clientSecret,
          redirect_uri: env.youtube.redirectUri,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "authorization-code"
    );

    return {
      accessToken: requireTokenValue(
        payload,
        "access_token",
        "authorization-code"
      ),
      refreshToken: requireTokenValue(
        payload,
        "refresh_token",
        "authorization-code"
      ),
      expiresIn: Number(payload.expires_in ?? 3600),
      scope:
        typeof payload.scope === "string"
          ? payload.scope
          : YOUTUBE_SCOPES.join(" "),
    };
  },

  async refreshAccessToken(refreshToken) {
    if (
      typeof refreshToken !== "string" ||
      refreshToken.length === 0
    ) {
      throw new YouTubeApiError("refresh-token", 400);
    }

    const response = await fetch(
      OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },
        body: createTokenBody({
          refresh_token: refreshToken,
          client_id: env.youtube.clientId,
          client_secret: env.youtube.clientSecret,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "refresh-token"
    );

    return {
      accessToken: requireTokenValue(
        payload,
        "access_token",
        "refresh-token"
      ),
      expiresIn: Number(payload.expires_in ?? 3600),
    };
  },

  async getAuthenticatedChannel(accessToken) {
    const response = await fetch(
      `${YOUTUBE_API_URL}/channels?mine=true&part=snippet,contentDetails`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "authenticated-channel"
    );
    const channel = payload.items?.[0];

    if (
      !channel ||
      typeof channel.id !== "string" ||
      !YOUTUBE_CHANNEL_ID_PATTERN.test(
        channel.id
      ) ||
      typeof channel.snippet?.title !== "string"
    ) {
      throw new YouTubeApiError(
        "authenticated-channel",
        502
      );
    }

    if (
      env.youtube.channelId !== null &&
      channel.id !== env.youtube.channelId
    ) {
      throw new YouTubeApiError(
        "channel-mismatch",
        403
      );
    }

    return {
      channelId: channel.id,
      title: channel.snippet.title,
    };
  },

  async uploadVideo({
    accessToken,
    title,
    description,
    fileStream,
    fileSize,
    contentType,
  }) {
    if (
      typeof accessToken !== "string" ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > 2 * 1024 * 1024 * 1024 ||
      !fileStream ||
      typeof fileStream.pipe !== "function"
    ) {
      throw new YouTubeApiError("upload-input", 400);
    }

    const metadata = {
      snippet: {
        title,
        description: description ?? "",
      },
      status: {
        privacyStatus: "unlisted",
        selfDeclaredMadeForKids: false,
      },
    };
    const initiateResponse = await fetch(
      `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status&notifySubscribers=false`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-upload-content-type": contentType,
          "x-upload-content-length": String(fileSize),
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!initiateResponse.ok) {
      throw new YouTubeApiError(
        "upload-initiate",
        initiateResponse.status
      );
    }

    const location =
      initiateResponse.headers.get("location");
    if (!location) {
      throw new YouTubeApiError(
        "upload-session",
        502
      );
    }

    const monitoredFileStream =
      createValidatedVideoStream(
        fileStream,
        fileSize
      );
    let uploadLocation;
    try {
      uploadLocation = new URL(
        location,
        YOUTUBE_UPLOAD_URL
      );
    } catch {
      throw new YouTubeApiError(
        "upload-session",
        502
      );
    }

    const uploadHost =
      uploadLocation.hostname.toLowerCase();
    if (
      uploadLocation.protocol !== "https:" ||
      !(
        uploadHost === "www.googleapis.com" ||
        uploadHost.endsWith(".googleapis.com")
      )
    ) {
      throw new YouTubeApiError(
        "upload-session",
        502
      );
    }

    const uploadResponse = await fetch(
      uploadLocation.toString(),
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": contentType,
          "content-length": String(fileSize),
          "content-range":
            `bytes 0-${fileSize - 1}/${fileSize}`,
        },
        body: monitoredFileStream,
        duplex: "half",
        signal: AbortSignal.timeout(30 * 60 * 1000),
      }
    );

    if (uploadResponse.status === 308) {
      throw new YouTubeApiError(
        "upload-incomplete",
        502
      );
    }

    const uploaded = await readProviderJson(
      uploadResponse,
      "upload-video"
    );
    const normalizedUpload = normalizeVideo(uploaded, {
      title,
      description: description ?? "",
      thumbnailUrl: null,
      privacyStatus: "UNLISTED",
    });

    try {
      const details =
        await youtubeClient.getVideo(
          accessToken,
          normalizedUpload.videoId
        );
      return {
        ...normalizedUpload,
        ...details,
        title: details.title ?? normalizedUpload.title,
        description:
          details.description ??
          normalizedUpload.description,
      };
    } catch {
      return normalizedUpload;
    }
  },

  // The youtube.upload scope already grants thumbnails.set, so
  // changing a custom thumbnail never requires a new OAuth consent.
  async setVideoThumbnail({
    accessToken,
    videoId,
    fileStream,
    fileSize,
    contentType,
  }) {
    if (
      typeof accessToken !== "string" ||
      accessToken.length === 0 ||
      typeof videoId !== "string" ||
      !YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      typeof contentType !== "string" ||
      !ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES.includes(
        contentType
      ) ||
      !fileStream ||
      typeof fileStream.pipe !== "function"
    ) {
      throw new YouTubeApiError("set-thumbnail", 400);
    }

    const response = await fetch(
      `${YOUTUBE_THUMBNAIL_SET_URL}?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": contentType,
          "content-length": String(fileSize),
        },
        body: createBoundedImageStream(
          fileStream,
          fileSize
        ),
        duplex: "half",
        signal: AbortSignal.timeout(60_000),
      }
    );

    const error =
      await readThumbnailErrorResponse(
        response,
        "set-thumbnail"
      );
    if (error) {
      throw error;
    }

    let payload;
    // Read as text first so an empty body and a malformed body stay
    // distinguishable instead of collapsing into one 502.
    const body = await response
      .text()
      .catch(() => "");
    if (body.trim() === "") {
      throw new YouTubeApiError(
        THUMBNAIL_RESPONSE_OPERATIONS.EMPTY,
        502
      );
    }

    try {
      payload = JSON.parse(body);
    } catch {
      throw new YouTubeApiError(
        THUMBNAIL_RESPONSE_OPERATIONS.UNPARSEABLE,
        502
      );
    }

    return normalizeThumbnailSetResponse(payload);
  },

  async getVideo(accessToken, videoId) {
    const response = await fetch(
      `${YOUTUBE_API_URL}/videos?id=${encodeURIComponent(videoId)}&part=snippet,status,processingDetails`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "video-status"
    );
    if (!payload.items?.[0]) {
      throw new YouTubeApiError(
        "video-status",
        404
      );
    }

    return normalizeVideo(payload);
  },

  // Minimal read for maintenance reconciliation. snippet carries the
  // owning channel and the current thumbnail variants, so nothing else
  // is requested: no statistics, no comments, no processing details.
  async getVideoThumbnailState(accessToken, videoId) {
    if (
      typeof accessToken !== "string" ||
      accessToken.length === 0 ||
      typeof videoId !== "string" ||
      !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
    ) {
      throw new YouTubeApiError(
        "thumbnail-state",
        400
      );
    }

    const response = await fetch(
      `${YOUTUBE_API_URL}/videos?id=${encodeURIComponent(videoId)}&part=snippet`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "thumbnail-state"
    );

    const item = payload?.items?.[0];
    if (
      !item ||
      typeof item.id !== "string" ||
      item.id !== videoId
    ) {
      throw new YouTubeApiError(
        "thumbnail-state",
        404
      );
    }

    const channelId = item.snippet?.channelId;
    if (
      typeof channelId !== "string" ||
      !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)
    ) {
      throw new YouTubeApiError(
        "thumbnail-state",
        502
      );
    }

    const selected = selectThumbnailVariant(
      item.snippet?.thumbnails
    );

    return {
      videoId: item.id,
      channelId,
      // A variant outside the allowed hosts never reaches the caller.
      thumbnailUrl: selected?.url ?? null,
      thumbnailVariant: selected?.key ?? null,
    };
  },

  async deleteVideo(accessToken, videoId) {
    // Same preflight as every other call: an unusable identifier never
    // reaches the network.
    if (
      typeof accessToken !== "string" ||
      accessToken.length === 0 ||
      typeof videoId !== "string" ||
      !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
    ) {
      throw new YouTubeApiError("delete-video", 400);
    }

    const response = await fetch(
      `${YOUTUBE_API_URL}/videos?id=${encodeURIComponent(videoId)}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    // A 404 means the resource is already gone, which is the
    // idempotent outcome this operation wants, so it is not an error.
    // The provider answers success with no body.
    if (!response.ok && response.status !== 404) {
      throw new YouTubeApiError(
        "delete-video",
        response.status
      );
    }
  },

  // Existence and ownership probe used before an irreversible delete.
  // It asks for a single part and returns nothing but the identifiers,
  // so no title, description or provider payload can reach a log.
  async getVideoOwner(accessToken, videoId) {
    if (
      typeof accessToken !== "string" ||
      accessToken.length === 0 ||
      typeof videoId !== "string" ||
      !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
    ) {
      throw new YouTubeApiError("video-owner", 400);
    }

    const response = await fetch(
      `${YOUTUBE_API_URL}/videos?id=${encodeURIComponent(videoId)}&part=snippet`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );
    const payload = await readProviderJson(
      response,
      "video-owner"
    );

    // An empty items array is how this API reports a resource that does
    // not exist or is not visible to the token. It must stay
    // distinguishable from every other provider failure.
    const item = payload?.items?.[0];
    if (
      !item ||
      typeof item.id !== "string" ||
      item.id !== videoId
    ) {
      throw new YouTubeApiError("video-owner", 404);
    }

    const channelId = item.snippet?.channelId;
    if (
      typeof channelId !== "string" ||
      !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)
    ) {
      throw new YouTubeApiError("video-owner", 502);
    }

    return {
      videoId: item.id,
      channelId,
    };
  },
};

module.exports = {
  youtubeClient,
  YouTubeApiError,
  YOUTUBE_SCOPES,
  YOUTUBE_SCOPE_UPLOAD,
  YOUTUBE_SCOPE_READONLY,
  YOUTUBE_SCOPE_FORCE_SSL,
  THUMBNAIL_RESPONSE_OPERATIONS,
  THUMBNAIL_VARIANT_PREFERENCE,
  isAllowedThumbnailUrl,
};
