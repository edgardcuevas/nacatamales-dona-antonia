const { Transform } = require("node:stream");

const env = require("./env");

const OAUTH_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL =
  "https://oauth2.googleapis.com/token";
const YOUTUBE_API_URL =
  "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_VIDEO_ID_PATTERN =
  /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID_PATTERN =
  /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_THUMBNAIL_HOSTS = new Set([
  "i.ytimg.com",
  "img.youtube.com",
  "yt3.ggpht.com",
]);

const YOUTUBE_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
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

function pickThumbnail(snippet) {
  const thumbnails = snippet?.thumbnails ?? {};
  const preferredKeys = [
    "maxres",
    "standard",
    "high",
    "medium",
    "default",
  ];

  for (const key of preferredKeys) {
    const url = thumbnails[key]?.url;
    if (isAllowedThumbnailUrl(url)) {
      return url;
    }
  }

  return null;
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

  async deleteVideo(accessToken, videoId) {
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

    if (!response.ok && response.status !== 404) {
      throw new YouTubeApiError(
        "delete-video",
        response.status
      );
    }
  },
};

module.exports = {
  youtubeClient,
  YouTubeApiError,
  YOUTUBE_SCOPES,
  isAllowedThumbnailUrl,
};
