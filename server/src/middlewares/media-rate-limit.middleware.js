const {
  createRateLimiter,
} = require("./rate-limit.middleware");

const MEDIA_UPLOAD_AUTH_WINDOW_MS = 15 * 60 * 1000;
const MEDIA_UPLOAD_AUTH_MAX_REQUESTS = 20;
const MEDIA_CONFIRM_WINDOW_MS = 15 * 60 * 1000;
const MEDIA_CONFIRM_MAX_REQUESTS = 30;
const MEDIA_DELETE_WINDOW_MS = 15 * 60 * 1000;
const MEDIA_DELETE_MAX_REQUESTS = 10;

const uploadAuthStore = new Map();
const confirmStore = new Map();
const deleteStore = new Map();

const mediaUploadAuthRateLimiter = createRateLimiter({
  windowMs: MEDIA_UPLOAD_AUTH_WINDOW_MS,
  maxRequests: MEDIA_UPLOAD_AUTH_MAX_REQUESTS,
  store: uploadAuthStore,
});

const mediaConfirmRateLimiter = createRateLimiter({
  windowMs: MEDIA_CONFIRM_WINDOW_MS,
  maxRequests: MEDIA_CONFIRM_MAX_REQUESTS,
  store: confirmStore,
});

const mediaDeleteRateLimiter = createRateLimiter({
  windowMs: MEDIA_DELETE_WINDOW_MS,
  maxRequests: MEDIA_DELETE_MAX_REQUESTS,
  store: deleteStore,
});

function resetMediaRateLimiters() {
  uploadAuthStore.clear();
  confirmStore.clear();
  deleteStore.clear();
}

module.exports = {
  mediaUploadAuthRateLimiter,
  mediaConfirmRateLimiter,
  mediaDeleteRateLimiter,
  resetMediaRateLimiters,
  limits: Object.freeze({
    uploadAuth: Object.freeze({
      windowMs: MEDIA_UPLOAD_AUTH_WINDOW_MS,
      maxRequests: MEDIA_UPLOAD_AUTH_MAX_REQUESTS,
    }),
    confirm: Object.freeze({
      windowMs: MEDIA_CONFIRM_WINDOW_MS,
      maxRequests: MEDIA_CONFIRM_MAX_REQUESTS,
    }),
    delete: Object.freeze({
      windowMs: MEDIA_DELETE_WINDOW_MS,
      maxRequests: MEDIA_DELETE_MAX_REQUESTS,
    }),
  }),
};
