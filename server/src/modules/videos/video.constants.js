const VIDEO_PROVIDERS = Object.freeze([
  "YOUTUBE",
]);

const VIDEO_UPLOAD_STATUSES = Object.freeze([
  "PENDING",
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

const VIDEO_PRIVACY_STATUSES = Object.freeze([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_URL_LENGTH = 2_048;
const MAX_EXTERNAL_ID_LENGTH = 128;
const MAX_SORT_ORDER = 2_147_483_647;

const VIDEO_SORT_FIELDS = Object.freeze({
  id: "id",
  title: "title",
  provider: "provider",
  externalId: "external_id",
  sortOrder: "sort_order",
  isActive: "is_active",
  uploadStatus: "upload_status",
  privacyStatus: "privacy_status",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const VIDEO_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  VIDEO_PROVIDERS,
  VIDEO_UPLOAD_STATUSES,
  VIDEO_PRIVACY_STATUSES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_URL_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_SORT_ORDER,
  VIDEO_SORT_FIELDS,
  VIDEO_SORT_ORDERS,
};
