const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SORT_ORDER = 2_147_483_647;

const CATEGORY_SORT_FIELDS = Object.freeze({
  id: "id",
  name: "name",
  slug: "slug",
  sortOrder: "sort_order",
  isActive: "is_active",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const CATEGORY_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SORT_ORDER,
  CATEGORY_SORT_FIELDS,
  CATEGORY_SORT_ORDERS,
};
