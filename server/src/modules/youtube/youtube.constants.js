const YOUTUBE_UPLOAD_STATUSES = Object.freeze([
  "PENDING",
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

const YOUTUBE_PRIVACY_STATUSES = Object.freeze([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
]);

const MAX_VIDEO_UPLOAD_BYTES =
  2 * 1024 * 1024 * 1024;
const MAX_YOUTUBE_DESCRIPTION_LENGTH = 5_000;
const ALLOWED_VIDEO_CONTENT_TYPES = Object.freeze([
  "video/mp4",
]);
// The YouTube Data API only accepts JPEG and PNG for a custom
// thumbnail. WebP is rejected by the provider even though the
// ImageKit media pipeline accepts it.
const MAX_VIDEO_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
]);
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

module.exports = {
  YOUTUBE_UPLOAD_STATUSES,
  YOUTUBE_PRIVACY_STATUSES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_THUMBNAIL_BYTES,
  MAX_YOUTUBE_DESCRIPTION_LENGTH,
  ALLOWED_VIDEO_CONTENT_TYPES,
  ALLOWED_VIDEO_THUMBNAIL_CONTENT_TYPES,
  OAUTH_STATE_TTL_MS,
};
