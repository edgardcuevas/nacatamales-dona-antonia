const AppError = require("../errors/app-error");

const {
  USER_ROLE_VALUES,
} = require("../modules/users/user.constants");

const userService = require(
  "../modules/users/user.service"
);

function createAuthenticationRequiredError() {
  return new AppError(
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );
}

function createUnavailableUserError() {
  return new AppError(
    401,
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
}

function hasValidAuthenticationContext(request) {
  const auth = request.auth;

  return (
    auth &&
    Number.isSafeInteger(auth.userId) &&
    auth.userId > 0 &&
    USER_ROLE_VALUES.includes(auth.role)
  );
}

async function requireActiveUser(
  request,
  response,
  next
) {
  if (!hasValidAuthenticationContext(request)) {
    return next(createAuthenticationRequiredError());
  }

  try {
    const currentUser =
      await userService.getAuthenticatedUser({
        userId: request.auth.userId,
        tokenRole: request.auth.role,
      });

    if (!currentUser) {
      return next(createUnavailableUserError());
    }

    request.currentUser = currentUser;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireActiveUser;
