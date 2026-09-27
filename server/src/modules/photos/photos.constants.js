const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_CAPTION_LENGTH = 500;
const MAX_SORT_ORDER = 4_294_967_295;

const PHOTO_SORT_FIELDS = Object.freeze({
  id: "p.id",
  caption: "p.caption",
  isActive: "p.is_active",
  sortOrder: "p.sort_order",
  createdAt: "p.created_at",
  updatedAt: "p.updated_at",
});

const PHOTO_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_CAPTION_LENGTH,
  MAX_SORT_ORDER,
  PHOTO_SORT_FIELDS,
  PHOTO_SORT_ORDERS,
};