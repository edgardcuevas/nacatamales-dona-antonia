const ANNOUNCEMENT_TYPES = Object.freeze([
  "AVAILABLE",
  "SOLD_OUT",
  "PROMOTION",
  "INFO",
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 10_000;
const MAX_SORT_ORDER = 2_147_483_647;

const ANNOUNCEMENT_SORT_FIELDS = Object.freeze({
  id: "id",
  title: "title",
  type: "type",
  sortOrder: "sort_order",
  isActive: "is_active",
  startsAt: "starts_at",
  endsAt: "ends_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const ANNOUNCEMENT_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  ANNOUNCEMENT_TYPES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_SORT_ORDER,
  ANNOUNCEMENT_SORT_FIELDS,
  ANNOUNCEMENT_SORT_ORDERS,
};
