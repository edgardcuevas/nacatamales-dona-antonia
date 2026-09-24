const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 150;
const MAX_SLUG_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_SORT_ORDER = 2_147_483_647;
const MAX_PRICE_INTEGER_DIGITS = 8;

const PRODUCT_SORT_FIELDS = Object.freeze({
  id: "id",
  name: "name",
  slug: "slug",
  price: "price",
  isAvailable: "is_available",
  isActive: "is_active",
  sortOrder: "sort_order",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const PRODUCT_SORT_ORDERS = Object.freeze({
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
  MAX_PRICE_INTEGER_DIGITS,
  PRODUCT_SORT_FIELDS,
  PRODUCT_SORT_ORDERS,
};
