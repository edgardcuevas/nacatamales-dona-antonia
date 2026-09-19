const USER_ROLES = Object.freeze({
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
});

const USER_ROLE_VALUES = Object.freeze(
  Object.values(USER_ROLES)
);

module.exports = {
  USER_ROLES,
  USER_ROLE_VALUES,
};