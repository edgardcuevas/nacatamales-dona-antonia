const {
  createRateLimiter,
} = require("./rate-limit.middleware");

const YOUTUBE_OAUTH_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_OAUTH_MAX_REQUESTS = 10;
const YOUTUBE_STATUS_WINDOW_MS = 15 * 60 * 1000;
// This route carries three consumers: the automatic poll that waits for
// a fresh upload to finish, the manual "Actualizar estado" button, and
// the list background refresh. The browser polls MAX_POLLS times at
// POLL_INTERVAL_MS, so this ceiling must stay above that count: when it
// was 60 the poll died on a 429 at attempt 61 and the caller never
// reached its own TIMEOUT branch, leaving the row stuck on
// "Procesando en YouTube". Each call costs one YouTube quota unit.
const YOUTUBE_STATUS_MAX_REQUESTS = 120;
const YOUTUBE_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_UPLOAD_MAX_REQUESTS = 5;
// Deliberately more generous than the upload limiter: changing a
// thumbnail is a cheap, reversible action and must not consume the
// same budget as publishing a video.
const YOUTUBE_THUMBNAIL_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_THUMBNAIL_MAX_REQUESTS = 20;
// The tightest budget of the module: deleting a video on YouTube cannot
// be undone, so it gets its own store and a deliberately small ceiling.
const YOUTUBE_DELETE_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_DELETE_MAX_REQUESTS = 10;

const oauthStore = new Map();
const statusStore = new Map();
const uploadStore = new Map();
const thumbnailStore = new Map();
const deleteStore = new Map();

const youtubeOAuthRateLimiter = createRateLimiter({
  windowMs: YOUTUBE_OAUTH_WINDOW_MS,
  maxRequests: YOUTUBE_OAUTH_MAX_REQUESTS,
  store: oauthStore,
});
const youtubeStatusRateLimiter = createRateLimiter({
  windowMs: YOUTUBE_STATUS_WINDOW_MS,
  maxRequests: YOUTUBE_STATUS_MAX_REQUESTS,
  store: statusStore,
});
const youtubeUploadRateLimiter = createRateLimiter({
  windowMs: YOUTUBE_UPLOAD_WINDOW_MS,
  maxRequests: YOUTUBE_UPLOAD_MAX_REQUESTS,
  store: uploadStore,
});
const youtubeThumbnailRateLimiter = createRateLimiter({
  windowMs: YOUTUBE_THUMBNAIL_WINDOW_MS,
  maxRequests: YOUTUBE_THUMBNAIL_MAX_REQUESTS,
  store: thumbnailStore,
});
const youtubeDeleteRateLimiter = createRateLimiter({
  windowMs: YOUTUBE_DELETE_WINDOW_MS,
  maxRequests: YOUTUBE_DELETE_MAX_REQUESTS,
  store: deleteStore,
});

function resetYoutubeRateLimiters() {
  oauthStore.clear();
  statusStore.clear();
  uploadStore.clear();
  thumbnailStore.clear();
  deleteStore.clear();
}

module.exports = {
  youtubeOAuthRateLimiter,
  youtubeStatusRateLimiter,
  youtubeUploadRateLimiter,
  youtubeThumbnailRateLimiter,
  youtubeDeleteRateLimiter,
  resetYoutubeRateLimiters,
  limits: Object.freeze({
    oauth: Object.freeze({
      windowMs: YOUTUBE_OAUTH_WINDOW_MS,
      maxRequests: YOUTUBE_OAUTH_MAX_REQUESTS,
    }),
    status: Object.freeze({
      windowMs: YOUTUBE_STATUS_WINDOW_MS,
      maxRequests: YOUTUBE_STATUS_MAX_REQUESTS,
    }),
    upload: Object.freeze({
      windowMs: YOUTUBE_UPLOAD_WINDOW_MS,
      maxRequests: YOUTUBE_UPLOAD_MAX_REQUESTS,
    }),
    thumbnail: Object.freeze({
      windowMs: YOUTUBE_THUMBNAIL_WINDOW_MS,
      maxRequests: YOUTUBE_THUMBNAIL_MAX_REQUESTS,
    }),
    delete: Object.freeze({
      windowMs: YOUTUBE_DELETE_WINDOW_MS,
      maxRequests: YOUTUBE_DELETE_MAX_REQUESTS,
    }),
  }),
};
