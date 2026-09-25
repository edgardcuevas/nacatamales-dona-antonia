const {
  createRateLimiter,
} = require("./rate-limit.middleware");

const YOUTUBE_OAUTH_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_OAUTH_MAX_REQUESTS = 10;
const YOUTUBE_STATUS_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_STATUS_MAX_REQUESTS = 60;
const YOUTUBE_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_UPLOAD_MAX_REQUESTS = 5;

const oauthStore = new Map();
const statusStore = new Map();
const uploadStore = new Map();

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

function resetYoutubeRateLimiters() {
  oauthStore.clear();
  statusStore.clear();
  uploadStore.clear();
}

module.exports = {
  youtubeOAuthRateLimiter,
  youtubeStatusRateLimiter,
  youtubeUploadRateLimiter,
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
  }),
};
