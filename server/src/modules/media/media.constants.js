const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PUBLIC_ID_LENGTH = 255;
const MAX_ALT_TEXT_LENGTH = 255;

const MEDIA_RESOURCE_TYPES = Object.freeze([
  "IMAGE",
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
  MEDIA_RESOURCE_TYPES,
  MEDIA_SORT_FIELDS,
  MEDIA_SORT_ORDERS,
};
