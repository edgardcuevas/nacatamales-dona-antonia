const AppError = require("../../errors/app-error");

const userRepository = require(
  "../users/user.repository"
);

const {
  verifyPassword,
} = require("../users/password.service");

const {
  createAuthSession,
} = require("./auth-session.service");

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await userRepository.findUserByEmail(
    normalizedEmail
  );

  if (!user) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password"
    );
  }

  const passwordIsValid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!passwordIsValid) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password"
    );
  }

  if (!user.is_active) {
    throw new AppError(
      403,
      "USER_INACTIVE",
      "This user account is inactive"
    );
  }

  const tokens = await createAuthSession({
    id: user.id,
    role: user.role,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    ...tokens,
  };
}

module.exports = {
  login,
};