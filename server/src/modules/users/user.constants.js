const USER_ROLES = Object.freeze({
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
});

const USER_ROLE_VALUES = Object.freeze(
  Object.values(USER_ROLES)
);

const USER_SORT_FIELDS = Object.freeze({
  id: "id",
  email: "email",
  role: "role",
  isActive: "is_active",
  lastLoginAt: "last_login_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

const USER_SORT_ORDERS = Object.freeze({
  asc: "ASC",
  desc: "DESC",
});

module.exports = {
  USER_ROLES,
  USER_ROLE_VALUES,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
};