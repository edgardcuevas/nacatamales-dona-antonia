const AppError = require("../errors/app-error");

const {
  USER_ROLE_VALUES,
} = require("../modules/users/user.constants");

function createAuthenticationRequiredError() {
  return new AppError(
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );
}

function createForbiddenError() {
  return new AppError(
    403,
    "FORBIDDEN",
    "You do not have permission to perform this action"
  );
}

function validateAllowedRoles(allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error(
      "At least one allowed role is required"
    );
  }

  for (const role of allowedRoles) {
    if (!USER_ROLE_VALUES.includes(role)) {
      throw new Error(
        "Invalid role configuration"
      );
    }
  }
}

function authorizeRoles(...allowedRoles) {
  validateAllowedRoles(allowedRoles);

  const allowedRoleSet = new Set(allowedRoles);

  return function authorizeRole(request, response, next) {
    const currentUser = request.currentUser;

    if (
      !currentUser ||
      typeof currentUser !== "object" ||
      Array.isArray(currentUser)
    ) {
      return next(createAuthenticationRequiredError());
    }

    if (!allowedRoleSet.has(currentUser.role)) {
      return next(createForbiddenError());
    }

    return next();
  };
}

module.exports = authorizeRoles;
