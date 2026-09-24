const AppError = require("../../errors/app-error");

const authSessionRepository = require(
  "../auth/auth-session.repository"
);

const {
  USER_ROLES,
  USER_ROLE_VALUES,
} = require("./user.constants");

const userRepository = require("./user.repository");

const {
  hashPassword,
} = require("./password.service");

function createUserNotFoundError() {
  return new AppError(
    404,
    "USER_NOT_FOUND",
    "The requested user does not exist"
  );
}

function createDuplicateEmailError() {
  return new AppError(
    409,
    "USER_EMAIL_ALREADY_EXISTS",
    "A user with this email already exists"
  );
}

function createLastActiveAdminError() {
  return new AppError(
    409,
    "LAST_ACTIVE_ADMIN_REQUIRED",
    "At least one active ADMIN account must remain"
  );
}

function createSelfDeactivationError() {
  return new AppError(
    409,
    "SELF_DEACTIVATION_NOT_ALLOWED",
    "You cannot deactivate your own account"
  );
}

function createInvalidRoleError() {
  return new AppError(
    400,
    "INVALID_USER_ROLE",
    "Invalid user role"
  );
}

function createInvalidPasswordError() {
  return new AppError(
    400,
    "INVALID_USER_PASSWORD",
    "A strong password of at least 12 characters is required"
  );
}

function createInvalidEmailError() {
  return new AppError(
    400,
    "INVALID_USER_EMAIL",
    "A valid email is required"
  );
}

function createInvalidUserIdError() {
  return new AppError(
    400,
    "INVALID_USER_ID",
    "A valid user ID is required"
  );
}

function assertUserId(userId) {
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1
  ) {
    throw createInvalidUserIdError();
  }
}

function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    Buffer.byteLength(password, "utf8") <= 72 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function isDuplicateEmailError(error) {
  return error?.code === "ER_DUP_ENTRY";
}

function isActiveUser(user) {
  return user.is_active === true || user.is_active === 1;
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    throw createInvalidEmailError();
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw createInvalidEmailError();
  }

  return normalizedEmail;
}

function toAdminUser(user) {
  const id = Number(user.id);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof user.email !== "string" ||
    !USER_ROLE_VALUES.includes(user.role)
  ) {
    throw new Error("Invalid administrative user record");
  }

  return {
    id,
    email: user.email,
    role: user.role,
    isActive: isActiveUser(user),
    lastLoginAt: user.last_login_at ?? null,
    passwordChangedAt: user.password_changed_at ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
  };
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
    !isActiveUser(user) ||
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

async function getUserByEmail(email) {
  return userRepository.findUserByEmail(email);
}

async function createUser({
  email,
  passwordHash,
  role,
}) {
  const normalizedEmail = normalizeEmail(email);

  if (!USER_ROLE_VALUES.includes(role)) {
    throw createInvalidRoleError();
  }

  const existingUser =
    await userRepository.findUserByEmail(
      normalizedEmail
    );

  if (existingUser) {
    throw createDuplicateEmailError();
  }

  try {
    return await userRepository.createUser({
      email: normalizedEmail,
      passwordHash,
      role,
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw createDuplicateEmailError();
    }

    throw error;
  }
}

async function getUserById(userId) {
  assertUserId(userId);

  const user = await userRepository.findUserById(
    userId
  );

  if (!user) {
    throw createUserNotFoundError();
  }

  return toAdminUser(user);
}

async function listAdministrativeUsers(filters) {
  const { users, totalItems } =
    await userRepository.listUsers(filters);

  return {
    users: users.map(toAdminUser),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(totalItems / filters.limit),
    },
  };
}

async function createAdministrativeUser({
  email,
  password,
  role,
}) {
  if (!isStrongPassword(password)) {
    throw createInvalidPasswordError();
  }

  if (!USER_ROLE_VALUES.includes(role)) {
    throw createInvalidRoleError();
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser =
    await userRepository.findUserByEmail(
      normalizedEmail
    );

  if (existingUser) {
    throw createDuplicateEmailError();
  }

  const passwordHash = await hashPassword(password);
  const createdUser = await createUser({
    email: normalizedEmail,
    passwordHash,
    role,
  });
  const user = await userRepository.findUserById(
    createdUser.id
  );

  if (!user) {
    throw createUserNotFoundError();
  }

  return toAdminUser(user);
}

async function changeUserRole({
  userId,
  role,
}) {
  assertUserId(userId);

  if (!USER_ROLE_VALUES.includes(role)) {
    throw createInvalidRoleError();
  }

  return authSessionRepository.withTransaction(
    async (connection) => {
      const user =
        await userRepository.findUserByIdForUpdate(
          userId,
          connection
        );

      if (!user) {
        throw createUserNotFoundError();
      }

      if (user.role === role) {
        return toAdminUser(user);
      }

      if (
        isActiveUser(user) &&
        user.role === USER_ROLES.ADMIN &&
        role !== USER_ROLES.ADMIN
      ) {
        const otherAdminIds =
          await userRepository
            .findActiveAdminIdsExcludingUserId({
              userId,
              connection,
            });

        if (otherAdminIds.length === 0) {
          throw createLastActiveAdminError();
        }
      }

      const updated =
        await userRepository.updateRoleById({
          userId,
          role,
          connection,
        });

      if (!updated) {
        throw new Error("User role could not be updated");
      }

      await authSessionRepository
        .revokeAllActiveSessionsByUserId(
          userId,
          connection
        );

      const updatedUser =
        await userRepository.findUserById(
          userId,
          connection
        );

      return toAdminUser(updatedUser);
    }
  );
}

async function changeUserStatus({
  userId,
  isActive,
  actorId,
}) {
  assertUserId(userId);

  if (typeof isActive !== "boolean") {
    throw new AppError(
      400,
      "INVALID_USER_STATUS",
      "A valid active status is required"
    );
  }

  if (!isActive && actorId === userId) {
    throw createSelfDeactivationError();
  }

  return authSessionRepository.withTransaction(
    async (connection) => {
      const user =
        await userRepository.findUserByIdForUpdate(
          userId,
          connection
        );

      if (!user) {
        throw createUserNotFoundError();
      }

      if (
        !isActive &&
        isActiveUser(user) &&
        user.role === USER_ROLES.ADMIN
      ) {
        const otherAdminIds =
          await userRepository
            .findActiveAdminIdsExcludingUserId({
              userId,
              connection,
            });

        if (otherAdminIds.length === 0) {
          throw createLastActiveAdminError();
        }
      }

      if (isActiveUser(user) !== isActive) {
        const updated =
          await userRepository.updateStatusById({
            userId,
            isActive,
            connection,
          });

        if (!updated) {
          throw new Error(
            "User status could not be updated"
          );
        }
      }

      if (!isActive) {
        await authSessionRepository
          .revokeAllActiveSessionsByUserId(
            userId,
            connection
          );
      }

      const updatedUser =
        await userRepository.findUserById(
          userId,
          connection
        );

      return toAdminUser(updatedUser);
    }
  );
}

async function resetUserPassword({
  userId,
  password,
}) {
  assertUserId(userId);

  if (!isStrongPassword(password)) {
    throw createInvalidPasswordError();
  }

  const passwordHash = await hashPassword(password);

  return authSessionRepository.withTransaction(
    async (connection) => {
      const user =
        await userRepository.findUserByIdForUpdate(
          userId,
          connection
        );

      if (!user) {
        throw createUserNotFoundError();
      }

      const updated =
        await userRepository.updatePasswordHashById(
          userId,
          passwordHash,
          connection
        );

      if (!updated) {
        throw new Error(
          "User password could not be updated"
        );
      }

      await authSessionRepository
        .revokeAllActiveSessionsByUserId(
          userId,
          connection
        );

      const updatedUser =
        await userRepository.findUserById(
          userId,
          connection
        );

      return toAdminUser(updatedUser);
    }
  );
}

async function revokeUserSessions(userId) {
  assertUserId(userId);

  return authSessionRepository.withTransaction(
    async (connection) => {
      const user =
        await userRepository.findUserById(
          userId,
          connection
        );

      if (!user) {
        throw createUserNotFoundError();
      }

      return authSessionRepository
        .revokeAllActiveSessionsByUserId(
          userId,
          connection
        );
    }
  );
}

module.exports = {
  getAuthenticatedUser,
  getUserByEmail,
  createUser,
  getUserById,
  listAdministrativeUsers,
  createAdministrativeUser,
  changeUserRole,
  changeUserStatus,
  resetUserPassword,
  revokeUserSessions,
};
