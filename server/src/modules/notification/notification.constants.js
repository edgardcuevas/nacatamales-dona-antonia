const MAX_ENDPOINT_LENGTH = 2_048;
const MIN_P256DH_LENGTH = 80;
const MAX_P256DH_LENGTH = 160;
const MIN_AUTH_LENGTH = 16;
const MAX_AUTH_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 255;

// The browser hands us the endpoint; the server later POSTs to it. An
// arbitrary URL would turn an unauthenticated endpoint into an SSRF
// primitive, so only the push services real browsers use are accepted.
const ALLOWED_PUSH_HOSTS = Object.freeze([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
]);

// Windows Push Notification Service endpoints are per-tenant
// subdomains (db5p.notify.windows.com), so a suffix match is required.
const ALLOWED_PUSH_HOST_SUFFIXES = Object.freeze([
  ".notify.windows.com",
]);

const SEND_BATCH_SIZE = 20;
const MAX_FAILURES_BEFORE_DELETE = 10;
const NOTIFICATION_TTL_SECONDS = 60 * 60;
const MAX_NOTIFICATION_TITLE_LENGTH = 80;
const MAX_NOTIFICATION_BODY_LENGTH = 140;
const NOTIFICATION_ICON = "/apple-touch-icon.png";
const NOTIFICATION_URL = "/";
const NOTIFICATION_TAG_PREFIX = "announcement-";

const SCHEDULER_INTERVAL_MS = 60 * 1_000;
const SCHEDULER_BATCH_LIMIT = 50;

module.exports = {
  MAX_ENDPOINT_LENGTH,
  MIN_P256DH_LENGTH,
  MAX_P256DH_LENGTH,
  MIN_AUTH_LENGTH,
  MAX_AUTH_LENGTH,
  MAX_USER_AGENT_LENGTH,
  ALLOWED_PUSH_HOSTS,
  ALLOWED_PUSH_HOST_SUFFIXES,
  SEND_BATCH_SIZE,
  MAX_FAILURES_BEFORE_DELETE,
  NOTIFICATION_TTL_SECONDS,
  MAX_NOTIFICATION_TITLE_LENGTH,
  MAX_NOTIFICATION_BODY_LENGTH,
  NOTIFICATION_ICON,
  NOTIFICATION_URL,
  NOTIFICATION_TAG_PREFIX,
  SCHEDULER_INTERVAL_MS,
  SCHEDULER_BATCH_LIMIT,
};
