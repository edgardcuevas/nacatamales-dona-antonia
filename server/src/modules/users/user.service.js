const AppError = require("../../errors/app-error");

const {
  USER_ROLE_VALUES,
} = require("./user.constants");

const userRepository = require("./user.repository");

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
  getUserByEmail,
  createUser,
};