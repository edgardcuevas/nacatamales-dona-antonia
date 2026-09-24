const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PUBLIC_ID_LENGTH = 255;
const MAX_ALT_TEXT_LENGTH = 255;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 6000;
const MAX_IMAGE_HEIGHT = 6000;
const UPLOAD_AUTH_TTL_SECONDS = 10 * 60;

const MEDIA_PROVIDER = "IMAGEKIT";
const MEDIA_RESOURCE_TYPE = "IMAGE";
const MEDIA_RESOURCE_TYPES = Object.freeze([
  MEDIA_RESOURCE_TYPE,
]);

const MEDIA_UPLOAD_TARGETS = Object.freeze([
  "categories",
  "products",
  "announcements",
]);

const ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_IMAGE_FORMATS = Object.freeze([
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

const MEDIA_SORT_FIELDS = Object.freeze({
  id: "id",
  provider: "provider",
  publicId: "public_id",
  resourceType: "resource_type",
  format: "format",
  bytes: "bytes",
  width: "width",
  height: "height",
  isActive: "is_active",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const MEDIA_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PUBLIC_ID_LENGTH,
  MAX_ALT_TEXT_LENGTH,
  MAX_FILE_BYTES,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
  UPLOAD_AUTH_TTL_SECONDS,
  MEDIA_PROVIDER,
  MEDIA_RESOURCE_TYPE,
  MEDIA_RESOURCE_TYPES,
  MEDIA_UPLOAD_TARGETS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_FORMATS,
  MEDIA_SORT_FIELDS,
  MEDIA_SORT_ORDERS,
};
