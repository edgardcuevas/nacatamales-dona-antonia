const AppError = require("../../errors/app-error");

const {
  USER_ROLE_VALUES,
} = require("./user.constants");

const userRepository = require("./user.repository");

function createAuthenticatedUserUnavailableError() {
  return new AppError(
    401,
    "AUTHENTICATED_USER_UNAVAILABLE",
    "The authenticated user is unavailable"
  );
}

function createStaleAuthenticationError() {
  return new AppError(
    401,
    "AUTHENTICATION_STALE",
    "The authentication credentials must be renewed"
  );
}

async function getAuthenticatedUser({
  userId,
  tokenRole,
}) {
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1
  ) {
    throw createAuthenticatedUserUnavailableError();
  }

  const user = await userRepository.findUserById(
    userId
  );

  if (
    !user ||
    !user.is_active ||
    typeof user.email !== "string" ||
    user.email.trim() === ""
  ) {
    throw createAuthenticatedUserUnavailableError();
  }

  const currentUserId = Number(user.id);

  if (
    !Number.isSafeInteger(currentUserId) ||
    currentUserId < 1 ||
    !USER_ROLE_VALUES.includes(user.role) ||
    user.role !== tokenRole
  ) {
    throw createStaleAuthenticationError();
  }

  return Object.freeze({
    id: currentUserId,
    email: user.email,
    role: user.role,
    isActive: true,
  });
}

async function getUserByEmail(email) {
  return userRepository.findUserByEmail(email);
}

async function createUser({
  email,
  passwordHash,
  role,
}) {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser =
    await userRepository.findUserByEmail(
      normalizedEmail
    );

  if (existingUser) {
    throw new AppError(
      409,
      "USER_EMAIL_ALREADY_EXISTS",
      "A user with this email already exists"
    );
  }

  if (!USER_ROLE_VALUES.includes(role)) {
    throw new AppError(
      400,
      "INVALID_USER_ROLE",
      "Invalid user role"
    );
  }

  return userRepository.createUser({
    email: normalizedEmail,
    passwordHash,
    role,
  });
}

module.exports = {
  getAuthenticatedUser,
  getUserByEmail,
  createUser,
};